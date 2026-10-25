// Clue Board (Jeopardy-style): host setup form, the shared-screen host view, and the phone view.
import { h, clear, nameOf, nameLink, playerOf, sourceBox, field, select, checkbox, toast } from "./common.js";
import { parseBoardCsv } from "../shared/games/clue.js";
import { CLUE_PACKS, CLUE_TEMPLATE } from "../shared/packs.js";
import { fitText } from "../shared/fit.js";

export const info = {
  id: "clue", title: "Clue Board", icon: "?",
  blurb: "A Jeopardy-style quiz. Pick a clue, buzz in from your phone, and answer before your rivals."
};

const money = n => (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString();

/* ================= host setup ================= */
export function setup(root) {
  const title = h("input", { type: "text", maxlength: 60, placeholder: "Clue Board" });
  const preview = h("div", { class: "count", role: "status" });
  const warn = h("div", { class: "hint" });
  const src = sourceBox({
    packs: CLUE_PACKS, template: CLUE_TEMPLATE, templateName: "clue-board-template.csv", onChange: refresh,
    placeholder: "Category,Value,Clue,Answer\nSurnames,100,\"A clue goes here\",The answer|An accepted alternative"
  });
  const read = checkbox("I'll read each clue aloud (the buzzers open when I press the button or Space)", true);
  const judging = select([["host", "I judge the answers (best for a livecast)"], ["auto", "Check typed answers automatically"]], "host");
  const dd = select([["0", "None"], ["1", "One"], ["2", "Two"]], "1");
  const buzz = select([["10", "10 seconds"], ["15", "15 seconds"], ["20", "20 seconds"], ["30", "30 seconds"]], "15");
  const ans = select([["10", "10 seconds"], ["15", "15 seconds"], ["20", "20 seconds"], ["30", "30 seconds"]], "15");
  let parsed = { categories: [], warnings: [] };
  function refresh() {
    parsed = parseBoardCsv(src.text());
    const clues = parsed.categories.reduce((n, c) => n + c.clues.length, 0);
    preview.textContent = clues ? `${parsed.categories.length} categor${parsed.categories.length === 1 ? "y" : "ies"}, ${clues} clues` : "";
    preview.classList.toggle("bad", !clues);
    warn.textContent = parsed.warnings.slice(0, 3).join(" ");
  }
  root.append(
    field("Game title", title),
    src.el, preview, warn,
    h("p", { class: "hint" }, "One row per clue: Category, Value, Clue, Answer. Put several accepted answers in the Answer cell separated by | and the first one is shown. Up to 8 categories and 8 clues each."),
    h("div", { class: "optgrid" },
      field("Judging", judging), field("Daily Doubles", dd), field("Time to buzz in", buzz), field("Time to answer", ans)),
    read.el
  );
  refresh();
  return {
    getConfig() {
      refresh();
      if (!parsed.categories.length) return { error: "Add at least one category with a clue and an answer." };
      return {
        config: {
          title: title.value.trim() || "Clue Board", categories: parsed.categories, readAloud: read.box.checked, judging: judging.value,
          dailyDoubles: Number(dd.value), buzzSecs: Number(buzz.value), answerSecs: Number(ans.value)
        }
      };
    }
  };
}

/* ================= host (shared screen) ================= */
export function createHost(root, { send, getSnap }) {
  let peek = false, peekKey = "";
  const board = h("div", { class: "cb-board" });
  const panel = h("div", { class: "cb-clue hidden" });
  root.append(board, panel);

  const act = (a, extra) => () => send({ a, ...extra });
  let primary = null;
  document.addEventListener("keydown", e => {
    if (e.target.closest("input,textarea,select,button,dialog")) return;
    if (e.code === "Space" && primary) { e.preventDefault(); primary(); }
    else if (e.key.toLowerCase() === "p") { peek = !peek; render(getSnap()); }
  });

  function renderBoard(snap) {
    const v = snap.v, n = v.categories.length;
    board.style.setProperty("--cols", n);
    clear(board);
    v.categories.forEach(name => board.append(h("div", { class: "cb-cat" }, name)));
    for (let r = 0; r < v.rows; r++) for (let c = 0; c < n; c++) {
      const val = v.values[c][r];
      if (val == null) { board.append(h("div", { class: "cb-tile gone" })); continue; }
      const used = v.used[c + "." + r];
      board.append(h("button", { class: "cb-tile" + (used ? " gone" : ""), disabled: used || snap.status !== "playing", onclick: act("pick", { c, r }) }, used ? "" : money(val)));
    }
  }

  function status(snap, cur) {
    const who = cur.pid ? nameOf(snap, cur.pid) : "";
    switch (cur.stage) {
      case "reading": return "Read the clue aloud, then open the buzzers.";
      case "open": return cur.locked.length ? "Wrong! Buzzers are open again." : "Buzzers are open!";
      case "answering": return `${who} buzzed in!`;
      case "wager": return `${who} found the Daily Double and is choosing a wager…`;
      case "revealed":
        if (cur.result && cur.result.ok === true) return `${nameOf(snap, cur.result.pid)} is right: ${cur.result.delta >= 0 ? "+" : ""}${money(cur.result.delta)}`;
        if (cur.result && cur.result.ok === false) return `${nameOf(snap, cur.result.pid)} missed it: ${money(cur.result.delta)}`;
        return "Nobody got it.";
    }
    return "";
  }

  function renderClue(snap) {
    const cur = snap.v.current;
    clear(panel);
    primary = null;
    const timer = h("span", { class: "cb-timer" + (cur.deadline ? "" : " hidden"), "data-deadline": cur.deadline || 0 });
    const clueText = h("div", { class: "cb-text" }, h("span", {}, cur.stage === "wager" ? "Daily Double!" : cur.clue));   // keep the clue off the cast until the wager is in
    const btns = h("div", { class: "btnrow cb-btns" });
    const key = cur.c + "." + cur.r;
    if (peekKey !== key) { peekKey = key; peek = false; }
    const showAnswer = peek || cur.stage === "revealed";
    const answerLine = h("div", { class: "cb-answer" },
      showAnswer ? h("span", {}, "Answer: ", h("b", {}, cur.answer), cur.accepted && cur.accepted.length > 1 ? h("small", {}, "  (also: " + cur.accepted.slice(1).join(", ") + ")") : null)
        : h("button", { class: "ghost", onclick: () => { peek = true; render(getSnap()); } }, "Peek at the answer (P)"));
    if (cur.stage === "reading") { btns.append(h("button", { class: "primary", onclick: primary = act("open") }, "Open buzzers (Space)")); }
    if (cur.stage === "answering") {
      btns.append(
        h("button", { class: "primary good", onclick: act("judge", { ok: true }) }, "Correct"),
        h("button", { class: "primary bad", onclick: act("judge", { ok: false }) }, "Wrong"));
    }
    if (cur.stage === "revealed") btns.append(h("button", { class: "primary", onclick: primary = act("back") }, "Back to the board (Space)"));
    else btns.append(h("button", { class: "ghost", onclick: act("reveal") }, cur.stage === "answering" ? "Skip" : "Show answer and move on"));

    panel.append(...[
      h("div", { class: "cb-head" }, h("span", { class: "cb-cat-name" }, cur.category), h("span", { class: "cb-val" }, cur.dd ? "DAILY DOUBLE" : money(cur.value)), timer),
      clueText,
      h("div", { class: "cb-status" }, status(snap, cur)),
      cur.typed ? h("div", { class: "cb-typed" }, `${nameOf(snap, cur.pid)} typed: `, h("b", {}, cur.typed), cur.match === true ? h("span", { class: "ok" }, "  ✓ matches an accepted answer") : null) : null,
      answerLine, btns].filter(Boolean));
    requestAnimationFrame(() => fitText(clueText.firstElementChild, clueText, { fw: 0.96, fh: 0.96, max: 84, min: 18 }));
  }

  function render(snap) {
    const cur = snap.v.current;
    board.classList.toggle("hidden", !!cur);
    panel.classList.toggle("hidden", !cur);
    if (cur) renderClue(snap); else { primary = null; renderBoard(snap); }
  }

  return {
    update: render,
    scoreOptions(snap) {
      return {
        control: snap.v.control,
        onPick: sid => send({ a: "control", sid: snap.v.control === sid ? null : sid }),
        onAdjust: sid => {
          const raw = prompt(`Add or subtract points for ${nameOf(snap, sid)} (for example 200 or -100):`);
          const d = Number(raw);
          if (raw && Number.isFinite(d) && d !== 0) send({ a: "adjust", sid, delta: d });
        }
      };
    }
  };
}

/* ================= player (phone) ================= */
export function createPlayer(root, { send, getSnap }) {
  const top = h("div", { class: "cp-top" });
  const body = h("div", { class: "cp-body" });
  root.append(top, body);
  let key = "";

  function miniBoard(snap) {
    const v = snap.v, wrap = h("div", { class: "cp-mini", style: { "--cols": v.categories.length } });
    v.categories.forEach(c => wrap.append(h("div", { class: "cp-minicat" }, c)));
    for (let r = 0; r < v.rows; r++) for (let c = 0; c < v.categories.length; c++) {
      const val = v.values[c][r];
      wrap.append(h("div", { class: "cp-minitile" + (val == null || v.used[c + "." + r] ? " gone" : "") }, val == null || v.used[c + "." + r] ? "" : money(val)));
    }
    return wrap;
  }

  function buzzButton(snap, cur) {
    const me = snap.me, locked = cur.locked.includes(me);
    const btn = h("button", { class: "buzz", disabled: cur.stage !== "open" || locked, onpointerdown: e => { e.preventDefault(); send({ a: "buzz" }); } },
      locked ? "Locked out" : cur.stage === "open" ? "BUZZ!" : "Wait…");
    btn.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); send({ a: "buzz" }); } });
    return btn;
  }

  function build(snap) {
    const v = snap.v, cur = v.current, me = snap.me;
    clear(body);
    if (!cur) {
      const ctl = v.control && playerOf(snap, v.control);
      body.append(
        h("div", { class: "cp-msg" }, snap.status === "over" ? "Game over!" : ctl ? (ctl.sid === me ? "You pick the next clue! Tell the host which one." : `${ctl.name} picks the next clue.`) : "The host picks the next clue."),
        miniBoard(snap));
      return;
    }
    const mine = cur.pid === me;
    const card = h("div", { class: "cp-card" },
      h("div", { class: "cb-head" }, h("span", { class: "cb-cat-name" }, cur.category), h("span", { class: "cb-val" }, cur.dd ? "DAILY DOUBLE" : money(cur.value)),
        h("span", { class: "cb-timer" + (cur.deadline ? "" : " hidden"), "data-deadline": cur.deadline || 0 })),
      cur.clue ? h("div", { class: "cp-clue" }, cur.clue) : h("div", { class: "cp-clue dim" }, "…"));
    body.append(card);

    if (cur.stage === "wager") {
      if (mine) {
        const input = h("input", { type: "number", min: 5, max: cur.maxWager, value: Math.min(cur.maxWager, 500), inputmode: "numeric" });
        const go = () => send({ a: "wager", amount: Number(input.value) });
        body.append(h("div", { class: "cp-form" }, h("p", {}, "Daily Double! How much do you wager?"), input,
          h("p", { class: "hint" }, `From $5 up to ${money(cur.maxWager)}.`), h("button", { class: "primary", onclick: go }, "Lock in my wager")));
      } else body.append(h("div", { class: "cp-msg" }, `${nameOf(snap, cur.pid)} found the Daily Double!`));
    } else if (cur.stage === "answering" && mine) {
      const input = h("input", { type: "text", maxlength: 80, placeholder: v.judging === "auto" ? "Type your answer" : "Say it aloud (typing is optional)", autocomplete: "off", autocapitalize: "off" });
      const go = () => { if (input.value.trim()) send({ a: "answer", text: input.value }); };
      input.addEventListener("keydown", e => { if (e.key === "Enter") go(); });
      body.append(h("div", { class: "cp-form" }, h("p", { class: "big" }, "You buzzed in!"), input, h("button", { class: "primary", onclick: go }, "Send answer")));
      setTimeout(() => input.focus(), 50);
    } else if (cur.stage === "answering") {
      body.append(h("div", { class: "cp-msg" }, `${nameOf(snap, cur.pid)} is answering…`));
    } else if (cur.stage === "revealed") {
      const r = cur.result;
      body.append(
        h("div", { class: "cp-msg" }, h("small", {}, "Answer"), h("div", { class: "cp-answer" }, cur.answer)),
        h("div", { class: "cp-result" + (r && r.ok ? " good" : r && r.ok === false ? " bad" : "") },
          r && r.ok === true ? `${r.pid === me ? "You" : nameOf(snap, r.pid)} got it: +${money(r.delta)}` : r && r.ok === false ? `${r.pid === me ? "You" : nameOf(snap, r.pid)} missed it: ${money(r.delta)}` : "Nobody got it"));
    } else {
      body.append(buzzButton(snap, cur));
      if (cur.stage === "open" && cur.locked.length && !cur.locked.includes(me)) body.append(h("div", { class: "cp-msg" }, "Someone missed it. Buzz in!"));
      if (cur.stage === "reading") body.append(h("div", { class: "cp-msg" }, "Listen for the host to open the buzzers."));
    }
  }

  return {
    update(snap) {
      const cur = snap.v.current, me = snap.me;
      top.textContent = "";
      top.append(h("span", {}, "Your score"), h("b", { class: (snap.scores[me] || 0) < 0 ? "neg" : "" }, money(snap.scores[me] || 0)));
      const k = [cur && cur.c, cur && cur.r, cur && cur.stage, cur && cur.pid, cur && cur.locked.includes(me), cur && cur.clue === "", snap.v.control === me, snap.status].join("|") + Object.keys(snap.v.used).length;
      if (k !== key) { key = k; build(snap); }
      else if (cur) { const t = body.querySelector("[data-deadline]"); if (t) t.dataset.deadline = cur.deadline || 0; }
    },
    note(text) { toast(text); }
  };
}
