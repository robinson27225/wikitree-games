import test from "node:test";
import assert from "node:assert/strict";
import { seeded } from "../shared/common.js";
import * as clue from "../shared/games/clue.js";
import * as cw from "../shared/games/crossword.js";
import * as ws from "../shared/games/wordsearch.js";
import { Room, createRoomData } from "../shared/room.js";

const players = { p1: { name: "Ann" }, p2: { name: "Bob" }, p3: { name: "Cy" } };
const ctxAt = (now, extra = {}) => ({ now, rand: seeded(7), players, notify() {}, ...extra });

/* ---------- clue board ---------- */
const csv = `Category,Value,Clue,Answer
Tools,100,This site is where genealogists collaborate,WikiTree
Tools,200,The file format for exchanging family trees,GEDCOM|a GEDCOM file
Kin,100,Your parent's sibling's child,First cousin
Kin,200,Your parent's parent,Grandparent
`;
function board(over = {}) {
  const { categories } = clue.parseBoardCsv(csv);
  const v = clue.validateConfig({ categories, dailyDoubles: 0, ...over });
  assert.ok(v.ok, v.error);
  return v.config;
}

test("clue: csv parsing groups categories and keeps order", () => {
  const { categories, warnings } = clue.parseBoardCsv(csv);
  assert.deepEqual(categories.map(c => c.name), ["Tools", "Kin"]);
  assert.deepEqual(categories[0].clues.map(c => c.value), [100, 200]);
  assert.equal(warnings.length, 0);
  const noValues = clue.parseBoardCsv("Cat,Clue one,Ans one\nCat,Clue two,Ans two");
  assert.deepEqual(noValues.categories[0].clues.map(c => c.value), [100, 200]);
});

test("clue: answer matching forgives phrasing, case and small typos", () => {
  assert.ok(clue.matchesAnswer("What is WikiTree?", "WikiTree"));
  assert.ok(clue.matchesAnswer("gedcom", "GEDCOM|a GEDCOM file"));
  assert.ok(clue.matchesAnswer("first cousin", "First cousin"));
  assert.ok(clue.matchesAnswer("1st cousin", "1st cousin|First cousin"));
  assert.ok(clue.matchesAnswer("grandparant", "Grandparent"));      // one typo in a long answer
  assert.ok(!clue.matchesAnswer("cat", "cot"));                      // short answers must be exact
  assert.ok(!clue.matchesAnswer("second cousin", "First cousin"));
});

test("clue: buzz, wrong answer locks you out, right answer scores and takes control", () => {
  const cfg = board({ readAloud: true });
  const g = clue.create(cfg, ctxAt(0));
  clue.onHost(g, { a: "pick", c: 0, r: 1 }, ctxAt(0));
  assert.equal(g.current.stage, "reading");
  clue.onPlayer(g, "p1", { a: "buzz" }, ctxAt(10));
  assert.equal(g.current.stage, "reading", "cannot buzz before the host opens the buzzers");
  clue.onHost(g, { a: "open" }, ctxAt(20));
  clue.onPlayer(g, "p2", { a: "buzz" }, ctxAt(30));
  clue.onPlayer(g, "p1", { a: "buzz" }, ctxAt(31));
  assert.equal(g.current.pid, "p2", "first buzz wins");
  clue.onHost(g, { a: "judge", ok: false }, ctxAt(40));
  assert.equal(g.scores.p2, -200);
  assert.equal(g.current.stage, "open");
  clue.onPlayer(g, "p2", { a: "buzz" }, ctxAt(50));
  assert.equal(g.current.stage, "open", "a wrong answerer is locked out");
  clue.onPlayer(g, "p3", { a: "buzz" }, ctxAt(60));
  clue.onHost(g, { a: "judge", ok: true }, ctxAt(70));
  assert.equal(g.scores.p3, 200);
  assert.equal(g.control, "p3");
  assert.equal(g.current.stage, "revealed");
  clue.onHost(g, { a: "back" }, ctxAt(80));
  assert.equal(g.current, null);
  assert.ok(g.used["0.1"]);
});

test("clue: timers run out", () => {
  const cfg = board({ readAloud: false, buzzSecs: 10, answerSecs: 10 });
  const g = clue.create(cfg, ctxAt(0));
  clue.onHost(g, { a: "pick", c: 1, r: 0 }, ctxAt(0));
  assert.equal(g.current.stage, "open", "buzzers open straight away when the host is not reading aloud");
  assert.ok(!clue.tick(g, ctxAt(5000)));
  assert.ok(clue.tick(g, ctxAt(10001)));
  assert.equal(g.current.stage, "revealed");
  assert.equal(g.current.result.ok, null);
  clue.onHost(g, { a: "back" }, ctxAt(10002));
  clue.onHost(g, { a: "pick", c: 1, r: 1 }, ctxAt(10003));
  clue.onPlayer(g, "p1", { a: "buzz" }, ctxAt(10004));
  assert.ok(clue.tick(g, ctxAt(20005)), "no answer in time counts as wrong");
  assert.equal(g.scores.p1, -200);
});

test("clue: auto judging marks a typed answer", () => {
  const cfg = board({ judging: "auto", readAloud: false });
  const g = clue.create(cfg, ctxAt(0));
  clue.onHost(g, { a: "pick", c: 0, r: 0 }, ctxAt(0));
  clue.onPlayer(g, "p1", { a: "buzz" }, ctxAt(1));
  clue.onPlayer(g, "p1", { a: "answer", text: "what is wikitree" }, ctxAt(2));
  assert.equal(g.scores.p1, 100);
  assert.equal(g.current.stage, "revealed");
});

test("clue: daily double wager is capped and players never see the answer early", () => {
  const cfg = board({ dailyDoubles: 1 });
  const g = clue.create(cfg, ctxAt(0));
  const [c, r] = g.dd[0].split(".").map(Number);
  g.scores.p1 = 50; g.control = "p1";
  clue.onHost(g, { a: "pick", c, r }, ctxAt(0));
  assert.equal(g.current.stage, "wager");
  assert.equal(clue.view(g, "player", "p2").current.clue, "", "clue stays hidden until the wager is made");
  clue.onPlayer(g, "p2", { a: "wager", amount: 1 }, ctxAt(1));
  assert.equal(g.current.stage, "wager", "only the chosen player may wager");
  clue.onPlayer(g, "p1", { a: "wager", amount: 99999 }, ctxAt(2));
  assert.equal(g.current.wager, 200, "wager is capped at the larger of your score and the top clue value");
  assert.equal(clue.view(g, "player", "p2").current.answer, undefined);
  assert.ok(clue.view(g, "host").current.answer);
  clue.onHost(g, { a: "judge", ok: true }, ctxAt(3));
  assert.equal(g.scores.p1, 250);
});

test("clue: game ends when every clue is used", () => {
  const g = clue.create(board({ readAloud: false }), ctxAt(0));
  for (const [c, r] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
    clue.onHost(g, { a: "pick", c, r }, ctxAt(0));
    clue.onHost(g, { a: "reveal" }, ctxAt(0));
    clue.onHost(g, { a: "back" }, ctxAt(0));
  }
  assert.ok(g.done);
});

/* ---------- crossword ---------- */
const words = ["ANCESTOR", "PEDIGREE", "CENSUS", "CEMETERY", "SURNAME", "GENEALOGY", "DESCENDANT", "MARRIAGE", "BIRTH", "WILL", "DEED", "PARISH", "LINEAGE", "KINSHIP"]
  .map(a => ({ answer: a, clue: "Clue for " + a }));

function checkGrid(p) {
  // every horizontal/vertical run of 2+ letters must be exactly one of the entries
  const at = (r, c) => (r >= 0 && c >= 0 && r < p.rows && c < p.cols ? p.cells[r * p.cols + c] : ".");
  const runs = new Set();
  for (let r = 0; r < p.rows; r++) for (let c = 0; c < p.cols; c++) {
    if (at(r, c) === ".") continue;
    if (at(r, c - 1) === "." && at(r, c + 1) !== ".") { let s = "", k = c; while (at(r, k) !== ".") s += at(r, k++); runs.add(`A${r},${c}:${s}`); }
    if (at(r - 1, c) === "." && at(r + 1, c) !== ".") { let s = "", k = r; while (at(k, c) !== ".") s += at(k++, c); runs.add(`D${r},${c}:${s}`); }
  }
  const declared = new Set(p.entries.map(e => `${e.dir}${e.r},${e.c}:${e.answer}`));
  assert.deepEqual([...runs].sort(), [...declared].sort());
}

test("crossword: generator makes a consistent, connected grid", () => {
  for (const seed of [1, 2, 3]) {
    const p = cw.generate(words, { seed });
    assert.ok(p.entries.length >= 10, "places most of the words, got " + p.entries.length);
    checkGrid(p);
    const nums = p.entries.map(e => e.n);
    assert.ok(nums.every(n => n >= 1));
  }
  const a = cw.generate(words, { seed: 5 }), b = cw.generate(words, { seed: 5 });
  assert.deepEqual(a, b, "same seed, same puzzle");
});

test("crossword: csv parsing", () => {
  const { entries, skipped } = cw.parseEntriesCsv("Answer,Clue\nAncestor,A forebear\nMother-in-law,Spouse's mother\nab,too short\nAncestor,dup\nNoClue,\n");
  assert.deepEqual(entries.map(e => e.answer), ["ANCESTOR", "MOTHERINLAW"]);
  assert.equal(skipped.length, 2);
});

test("crossword: play, score, lock and finish", () => {
  const puzzle = cw.generate(words.slice(0, 5), { seed: 2 });
  const v = cw.validateConfig({ puzzle, minutes: 0 });
  assert.ok(v.ok, v.error);
  assert.equal(cw.validateConfig({ puzzle: { ...puzzle, cells: puzzle.cells.replace(/[A-Z]/, "Q") } }).ok, false, "tampered grid rejected");
  const g = cw.create(v.config);
  const notes = [];
  const ctx = ctxAt(0, { notify: (to, n) => notes.push({ to, ...n }) });
  cw.onPlayer(g, "p1", { a: "put", i: puzzle.cells.search(/[A-Z]/), ch: "A" }, ctx);
  assert.equal(g.grid.filter(Boolean).length, 0, "nothing happens before the host starts");
  cw.onStart(g, ctx);
  const first = puzzle.entries[0];
  const cell = k => (first.r + (first.dir === "D" ? k : 0)) * puzzle.cols + first.c + (first.dir === "A" ? k : 0);
  for (let k = 0; k < first.len - 1; k++) cw.onPlayer(g, "p1", { a: "put", i: cell(k), ch: first.answer[k] }, ctx);
  cw.onPlayer(g, "p2", { a: "put", i: cell(first.len - 1), ch: "z" }, ctx);        // wrong letter, lower case accepted
  assert.ok(notes.some(n => n.to === "p2" && /not right/.test(n.text)));
  assert.equal(Object.keys(g.solved).length, 0);
  cw.onPlayer(g, "p3", { a: "put", i: cell(first.len - 1), ch: first.answer[first.len - 1] }, ctx);
  assert.equal(g.solved[0], "p3");
  assert.equal(g.scores.p1, first.len - 1);
  assert.equal(g.scores.p3, 1 + 3, "the finishing letter plus the word bonus");
  cw.onPlayer(g, "p2", { a: "put", i: cell(0), ch: "Q" }, ctx);
  assert.equal(g.grid[cell(0)], first.answer[0], "solved squares are locked");
  // solve everything
  puzzle.entries.forEach(e => {
    for (let k = 0; k < e.len; k++) cw.onPlayer(g, "p2", { a: "put", i: (e.r + (e.dir === "D" ? k : 0)) * puzzle.cols + e.c + (e.dir === "A" ? k : 0), ch: e.answer[k] }, ctx);
  });
  assert.ok(g.done);
  assert.equal(cw.view(g, "player").solution, puzzle.cells);
  assert.equal(cw.view(g, "player").entries.every(e => !("answer" in e)), true, "answers never sent while playing");
});

/* ---------- word search ---------- */
const ws1 = ["ANCESTOR", "PEDIGREE", "CENSUS", "CEMETERY", "SURNAME", "GENEALOGY", "DESCENDANT", "BIRTH", "DEED", "PARISH"].map(w => ({ word: w, label: w }));

test("wordsearch: every word is in the grid on a straight line", () => {
  for (const level of ["easy", "medium", "hard"]) {
    const p = ws.generate(ws1, { level, seed: 3 });
    assert.ok(p && p.words.length === ws1.length, level);
    for (const w of p.words) {
      assert.equal(w.cells.map(i => p.grid[i]).join(""), w.word);
      assert.ok(ws.lineCells(p.size, w.cells[0], w.cells.at(-1)).join() === w.cells.join(), "straight line");
    }
    assert.match(p.grid, /^[A-Z]+$/);
    assert.equal(p.grid.length, p.size ** 2);
  }
  const easy = ws.generate(ws1, { level: "easy", seed: 3 });
  assert.ok(easy.words.every(w => w.cells[1] > w.cells[0]), "easy words read forwards only");
});

test("wordsearch: claiming words, either direction, first finder wins", () => {
  const p = ws.generate(ws1, { level: "hard", seed: 11 });
  const v = ws.validateConfig({ puzzle: p, showWords: false });
  assert.ok(v.ok, v.error);
  const g = ws.create(v.config), notes = [];
  const ctx = ctxAt(5, { notify: (to, n) => notes.push({ to, ...n }) });
  ws.onStart(g, ctx);
  const w0 = p.words[0], w1 = p.words[1];
  ws.onPlayer(g, "p1", { a: "select", from: w0.cells[0], to: w0.cells.at(-1) }, ctx);
  assert.equal(g.scores.p1, w0.word.length);
  ws.onPlayer(g, "p2", { a: "select", from: w0.cells[0], to: w0.cells.at(-1) }, ctx);
  assert.equal(g.scores.p2, undefined, "already claimed");
  ws.onPlayer(g, "p2", { a: "select", from: w1.cells.at(-1), to: w1.cells[0] }, ctx);     // backwards
  assert.equal(g.scores.p2, w1.word.length);
  ws.onPlayer(g, "p3", { a: "select", from: 0, to: p.size + 2 }, ctx);
  assert.ok(notes.some(n => /straight/.test(n.text)));
  const hidden = ws.view(g);
  assert.equal(hidden.words.filter(w => !w.found).every(w => w.label === ""), true, "unfound words stay hidden when the list is off");
  for (const w of p.words) ws.onPlayer(g, "p3", { a: "select", from: w.cells[0], to: w.cells.at(-1) }, ctx);
  assert.ok(g.done);
});

/* ---------- room ---------- */
test("room: lifecycle, joining, kicking, restart", () => {
  const cfg = board();
  const room = new Room(createRoomData({ code: "ABCD", hostHash: "x", gameId: "clue", config: cfg }, 0));
  assert.deepEqual(room.join("pid-aaaaaaaa", { kind: "id", name: "Robinson-27225" }), { sid: "p1" });
  assert.match(room.join("pid-bbbbbbbb", { kind: "id", name: "not an id" }).error, /WikiTree ID/);
  assert.match(room.join("pid-cccccccc", { kind: "name", name: "robinson-27225" }).error, /already playing/);
  assert.ok(room.join("pid-dddddddd", { kind: "name", name: "Guest" }).sid);
  assert.equal(room.join("pid-aaaaaaaa", { kind: "id", name: "Robinson-27225" }).sid, "p1", "rejoining keeps the same seat");
  room.playerMsg("pid-aaaaaaaa", { a: "buzz" }, 1);                   // ignored in the lobby
  room.hostMsg({ a: "start" }, 2);
  assert.equal(room.d.status, "playing");
  room.hostMsg({ a: "pick", c: 0, r: 0 }, 3);
  assert.ok(room.snapshot("host", null, new Set(["p1"]), 4).v.current.answer);
  assert.equal(room.snapshot("player", "pid-aaaaaaaa", new Set(), 4).v.current.answer, undefined);
  assert.equal(room.snapshot("player", "pid-aaaaaaaa", new Set(), 4).me, "p1");
  room.hostMsg({ a: "kick", sid: "p2" }, 5);
  assert.match(room.join("pid-dddddddd", { kind: "name", name: "Guest" }).error, /removed/);
  room.hostMsg({ a: "end" }, 6);
  assert.equal(room.d.status, "over");
  room.hostMsg({ a: "newGame" }, 7);
  assert.equal(room.d.status, "lobby");
  assert.equal(room.d.gameNo, 2);
  assert.deepEqual(room.d.g.used, {});
});
