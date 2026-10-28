import test from "node:test";
import assert from "node:assert/strict";
import * as wheel from "../shared/games/wheel.js";
import { Room, createRoomData } from "../shared/room.js";

const players = { p1: { name: "Ann" }, p2: { name: "Bob" } };
const notes = [];
const ctxAt = (now, rand) => ({ now, rand: rand || (n => 0), players, notify: (to, n) => notes.push({ to, ...n }) });
const SEG = wheel.SEGMENTS;
const at = v => SEG.indexOf(v);

function game(over = {}, puzzles = [{ category: "Place", text: "ELLIS ISLAND" }, { category: "Term", text: "MAIDEN NAME" }]) {
  const v = wheel.validateConfig({ puzzles, rounds: puzzles.length, shuffle: false, turnSecs: 30, ...over });
  assert.ok(v.ok, v.error);
  const g = wheel.create(v.config, ctxAt(0));
  wheel.onStart(g, ctxAt(0));
  return g;
}
// Spin and let the wheel stop on the segment holding `value`.
function spin(g, sid, value, now = 1000) {
  wheel.onPlayer(g, sid, { a: "spin" }, ctxAt(now, () => at(value)));
  assert.equal(g.stage, "spinning");
  wheel.tick(g, ctxAt(now + wheel.SPIN_MS + 1));
}

test("wheel: csv parsing and cleaning", () => {
  const { puzzles, skipped } = wheel.parsePuzzlesCsv("Category,Puzzle\nPlace,Ellis Island\nPhrase,\"Skeletons in the closet!\"\nTerm,Hi!\nFamily tree\nPlace,ELLIS ISLAND\n");
  assert.deepEqual(puzzles.map(p => p.text), ["ELLIS ISLAND", "SKELETONS IN THE CLOSET!", "FAMILY TREE"]);
  assert.equal(puzzles[2].category, "Puzzle");
  assert.equal(skipped.length, 1);
  assert.equal(wheel.cleanPuzzle("Café <b>Menu</b>"), "CAFE B MENU B");
});

test("wheel: a cash spin, a right consonant keeps the turn, a wrong one passes it", () => {
  const g = game();
  assert.equal(g.turn, "p1");
  wheel.onPlayer(g, "p2", { a: "spin" }, ctxAt(10));
  assert.equal(g.stage, "spin", "only the player whose turn it is can act");
  spin(g, "p1", 700);
  assert.equal(g.stage, "guess");
  wheel.onPlayer(g, "p1", { a: "vowel", ch: "E" }, ctxAt(6000));
  assert.equal(g.called.length, 0, "a vowel cannot be picked while guessing a consonant");
  wheel.onPlayer(g, "p1", { a: "consonant", ch: "l" }, ctxAt(6001));      // ELLIS ISLAND has three L
  assert.equal(g.roundCash.p1, 2100);
  assert.equal(g.turn, "p1");
  assert.equal(g.stage, "spin");
  spin(g, "p1", 500, 7000);
  wheel.onPlayer(g, "p1", { a: "consonant", ch: "Z" }, ctxAt(12000));
  assert.equal(g.turn, "p2", "a wrong letter passes the turn");
  assert.equal(g.roundCash.p1, 2100, "cash is kept");
});

test("wheel: vowels cost money; bankrupt and lose a turn", () => {
  const g = game();
  wheel.onPlayer(g, "p1", { a: "vowel", ch: "E" }, ctxAt(10));
  assert.ok(notes.some(n => n.to === "p1" && /costs/.test(n.text)), "no cash, no vowel");
  spin(g, "p1", 600);
  wheel.onPlayer(g, "p1", { a: "consonant", ch: "S" }, ctxAt(6000));      // 2 S = 1200
  wheel.onPlayer(g, "p1", { a: "vowel", ch: "I" }, ctxAt(6001));
  assert.equal(g.roundCash.p1, 1200 - 250);
  assert.ok(g.called.includes("I"));
  spin(g, "p1", "BANKRUPT", 8000);
  assert.equal(g.roundCash.p1, 0);
  assert.equal(g.turn, "p2");
  spin(g, "p2", "LOSE A TURN", 20000);
  assert.equal(g.turn, "p1");
});

test("wheel: solving banks the round cash (at least the minimum) and the next puzzle starts", () => {
  const g = game();
  wheel.onPlayer(g, "p1", { a: "solve", text: "wrong" }, ctxAt(10));
  assert.equal(g.turn, "p2");
  wheel.onPlayer(g, "p2", { a: "solve", text: "ellis, island" }, ctxAt(20));
  assert.equal(g.stage, "revealed");
  assert.equal(g.scores.p2, wheel.SOLVE_MIN);
  assert.equal(wheel.view(g).answer, "ELLIS ISLAND");
  assert.ok(!wheel.tick(g, ctxAt(30)));
  assert.ok(wheel.tick(g, ctxAt(20 + wheel.NEXT_MS + 1)));
  assert.equal(g.round, 1);
  assert.equal(g.stage, "spin");
  assert.deepEqual(g.called, []);
  assert.equal(g.turn, "p2", "the starting player rotates each round");
});

test("wheel: the answer stays hidden and revealing the last letter wins the round", () => {
  const g = game({}, [{ category: "Term", text: "AB BA" }]);
  const v = wheel.view(g);
  assert.equal(v.shown, "__ __");
  assert.equal(v.answer, undefined);
  spin(g, "p1", 900);
  wheel.onPlayer(g, "p1", { a: "consonant", ch: "B" }, ctxAt(6000));       // 2 B = 1800
  assert.equal(wheel.view(g).shown, "_B B_");
  wheel.onPlayer(g, "p1", { a: "solve", text: "x" }, ctxAt(6001));
  wheel.onPlayer(g, "p2", { a: "spin" }, ctxAt(6002, () => at(500)));
  wheel.tick(g, ctxAt(6002 + wheel.SPIN_MS + 1));
  wheel.onPlayer(g, "p2", { a: "consonant", ch: "C" }, ctxAt(12000));      // no C
  wheel.onPlayer(g, "p1", { a: "spin" }, ctxAt(12001, () => at(700)));
  wheel.tick(g, ctxAt(12001 + wheel.SPIN_MS + 1));
  assert.equal(g.stage, "guess");
  // buy the last vowel with cash earned: p1 needs 250
  assert.ok(g.roundCash.p1 === 1800);
  wheel.onPlayer(g, "p1", { a: "consonant", ch: "D" }, ctxAt(17000));      // wrong, passes
  wheel.onPlayer(g, "p2", { a: "solve", text: "ab ba" }, ctxAt(17001));
  assert.equal(g.stage, "revealed");
});

test("wheel: turn timer passes the turn; a table of idle players ends the round; the game finishes", () => {
  const g = game({ turnSecs: 10 });
  assert.ok(wheel.tick(g, ctxAt(10001)));
  assert.equal(g.turn, "p2");
  assert.ok(wheel.tick(g, ctxAt(20002)));
  assert.ok(wheel.tick(g, ctxAt(30003)));
  assert.ok(wheel.tick(g, ctxAt(40004)));
  assert.equal(g.stage, "revealed", "after enough idle turns the round is given up");
  wheel.onHost(g, { a: "next" }, ctxAt(40005));
  assert.equal(g.round, 1);
  wheel.onHost(g, { a: "reveal" }, ctxAt(40006));
  wheel.onHost(g, { a: "next" }, ctxAt(40007));
  assert.ok(g.done);
});

test("wheel: room integration keeps the answer from players and host", () => {
  const cfg = wheel.validateConfig({ puzzles: [{ category: "Place", text: "ELLIS ISLAND" }] }).config;
  const room = new Room(createRoomData({ code: "WXYZ", hostHash: "h", gameId: "wheel", config: cfg }, 0));
  room.join("pid-aaaaaaaa", { kind: "id", name: "Robinson-27225" });
  room.hostMsg({ a: "start" }, 1);
  for (const role of ["host", "player"]) {
    const s = room.snapshot(role, "pid-aaaaaaaa", new Set(), 2);
    assert.equal(s.v.answer, undefined);
    assert.equal(s.v.shown, "_____ ______");
    assert.equal(s.v.turn, "p1");
  }
  room.playerMsg("pid-aaaaaaaa", { a: "solve", text: "Ellis Island" }, 3);
  assert.equal(room.d.status, "playing");
  room.hostMsg({ a: "next" }, 4);
  assert.equal(room.d.status, "over");
});
