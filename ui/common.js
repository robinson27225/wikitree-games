// Small DOM helpers and widgets shared by the host and player pages.
import { profileUrl } from "../shared/common.js";

export const $ = (sel, root = document) => root.querySelector(sel);

// h("div", {class: "x", onclick: fn, style: {color: "red"}}, "text", childNode)
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style" && typeof v === "object") for (const [p, val] of Object.entries(v)) p.startsWith("--") ? el.style.setProperty(p, val) : (el.style[p] = val);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "text") el.textContent = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}

export const clear = el => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

export function playerOf(snap, sid) { return snap.players.find(p => p.sid === sid); }
export const nameOf = (snap, sid) => (playerOf(snap, sid) || { name: "Someone" }).name;
export const colorOf = (snap, sid) => (playerOf(snap, sid) || { color: "#8aa08f" }).color;

// A player's name; WikiTree IDs link to their profile.
export function nameLink(p, cls) {
  if (p && p.kind === "id") return h("a", { href: profileUrl(p.name), target: "_blank", rel: "noopener", class: cls }, p.name);
  return h("span", { class: cls }, p ? p.name : "Someone");
}

export const ranked = snap => snap.players.slice().sort((a, b) => ((snap.scores[b.sid] || 0) - (snap.scores[a.sid] || 0)) || a.name.localeCompare(b.name));

// Leaderboard. opts: {me, control, onPick(sid), onKick(sid), onAdjust(sid), limit}
export function renderScores(el, snap, opts = {}) {
  clear(el);
  const rows = ranked(snap);
  if (!rows.length) { el.append(h("div", { class: "empty" }, "No players yet")); return; }
  let rank = 0, prev = null, shown = 0;
  rows.forEach((p, i) => {
    const sc = snap.scores[p.sid] || 0;
    if (sc !== prev) { rank = i + 1; prev = sc; }
    if (opts.limit && shown >= opts.limit && p.sid !== opts.me) return;
    shown++;
    el.append(h("div", { class: "srow" + (p.sid === opts.me ? " me" : "") + (p.online ? "" : " off") + (opts.onPick ? " pickable" : ""), title: p.online ? "" : "Offline",
        onclick: opts.onPick ? () => opts.onPick(p.sid) : null },
      h("span", { class: "rk" }, rank),
      h("span", { class: "dot", style: { background: p.color } }),
      h("span", { class: "nm" }, p.name, opts.control === p.sid ? h("span", { class: "ctl", title: "Picks the next clue" }, " ★") : null),
      h("span", { class: "pts" + (sc < 0 ? " neg" : "") }, sc.toLocaleString()),
      opts.onAdjust ? h("button", { class: "mini", title: "Adjust score", onclick: e => { e.stopPropagation(); opts.onAdjust(p.sid); } }, "±") : null,
      opts.onKick ? h("button", { class: "mini", title: "Remove from the game", onclick: e => { e.stopPropagation(); opts.onKick(p.sid); } }, "×") : null));
  });
}

// ---- countdowns: any element with data-deadline (server ms) shows the seconds left ----
let runClock = () => {};
export const refreshClock = () => runClock();          // call after rendering so new timers show at once
export function startClock(getOffset) {
  const tick = runClock = () => {
    const now = Date.now() + getOffset();
    document.querySelectorAll("[data-deadline]").forEach(el => {
      const dl = Number(el.dataset.deadline);
      if (!dl) { el.textContent = ""; return; }
      const s = Math.max(0, Math.ceil((dl - now) / 1000));
      el.textContent = el.dataset.fmt === "clock" ? Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0") : s;
      el.classList.toggle("low", s <= 5);
    });
  };
  tick();
  return setInterval(tick, 250);
}

let toastTimer = null;
export function toast(text, ms = 3200) {
  let t = document.getElementById("toast");
  if (!t) { t = h("div", { id: "toast", class: "toast", role: "status", "aria-live": "polite" }); document.body.append(t); }
  t.textContent = text; t.classList.remove("hidden");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add("hidden"), ms);
}

// Confetti on a full-screen canvas; stops by itself.
export function confetti(canvas, ms = 6000) {
  const ctx = canvas.getContext("2d");
  const fit = () => { canvas.width = canvas.clientWidth; canvas.height = canvas.clientHeight; };
  fit();
  const colors = ["#FCB815", "#f37c26", "#8FC641", "#FFE270", "#A5D167", "#ffffff"];
  const bits = Array.from({ length: 160 }, () => ({
    x: Math.random() * canvas.width, y: -Math.random() * canvas.height * 0.6, w: 6 + Math.random() * 8, h: 8 + Math.random() * 12,
    vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 4, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, c: colors[Math.floor(Math.random() * colors.length)]
  }));
  const end = Date.now() + ms;
  (function frame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const b of bits) {
      b.x += b.vx; b.y += b.vy; b.rot += b.vr;
      if (b.y > canvas.height) { if (Date.now() < end - 1500) { b.y = -20; b.x = Math.random() * canvas.width; } else continue; }
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rot); ctx.fillStyle = b.c; ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); ctx.restore();
    }
    if (Date.now() < end) requestAnimationFrame(frame); else ctx.clearRect(0, 0, canvas.width, canvas.height);
  })();
}

const ordinal = n => { const v = n % 100, sfx = ["th", "st", "nd", "rd"]; return n + (sfx[(v - 20) % 10] || sfx[v] || sfx[0]); };

// Top five and where "you" finished.
export function results(snap, me) {
  const rows = ranked(snap);
  const box = h("div", { class: "results" });
  if (!rows.length) return box;
  const top = snap.scores[rows[0].sid] || 0;
  const winners = rows.filter(p => (snap.scores[p.sid] || 0) === top);
  box.append(h("div", { class: "winner" }, winners.length > 1 ? "A tie! " : "", winners.flatMap((p, i) => [i ? " & " : "", nameLink(p, "wname")])));
  box.append(h("div", { class: "wscore" }, top.toLocaleString() + " point" + (top === 1 ? "" : "s")));
  const list = h("ol", { class: "podium" });
  rows.slice(0, 5).forEach(p => list.append(h("li", {}, h("span", { class: "dot", style: { background: p.color } }), nameLink(p), h("b", {}, (snap.scores[p.sid] || 0).toLocaleString()))));
  box.append(list);
  if (me) {
    const idx = rows.findIndex(p => p.sid === me);
    if (idx >= 5) box.append(h("div", { class: "yours" }, `You finished ${ordinal(idx + 1)} with ${(snap.scores[me] || 0).toLocaleString()}`));
  }
  return box;
}

// Reads a text file chosen or dropped into `drop` and hands the text to onText.
export function fileDrop(drop, input, onText) {
  const read = f => { if (!f) return; const r = new FileReader(); r.onload = () => onText(String(r.result)); r.readAsText(f); };
  input.addEventListener("change", e => read(e.target.files[0]));
  ["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", e => read(e.dataTransfer.files[0]));
}

export function downloadText(name, text) {
  const a = h("a", { href: URL.createObjectURL(new Blob([text], { type: "text/csv" })), download: name });
  document.body.append(a); a.click(); a.remove();
}

// The content box every game's setup form uses: pick a ready-made pack or paste/upload your own.
// Returns {el, text(), setText(t)}; onChange fires whenever the text changes.
export function sourceBox({ packs, template, templateName, placeholder, onChange }) {
  const select = h("select", { id: "packSel" }, h("option", { value: "" }, "Paste or upload my own"), ...packs.map(p => h("option", { value: p.id }, p.name)));
  const area = h("textarea", { spellcheck: "false", placeholder, rows: 8 });
  const file = h("input", { type: "file", accept: ".csv,.txt,text/csv,text/plain" });
  const drop = h("label", { class: "drop" }, "Drop a CSV file here, or click to choose one", file);
  const tpl = h("button", { type: "button", class: "ghost", onclick: () => downloadText(templateName, template) }, "Download a template");
  const set = t => { area.value = t; onChange && onChange(); };
  select.addEventListener("change", () => { const p = packs.find(x => x.id === select.value); if (p) set(p.csv); });
  area.addEventListener("input", () => { select.value = ""; onChange && onChange(); });
  fileDrop(drop, file, t => { select.value = ""; set(t); });
  const el = h("div", { class: "field" }, h("label", { for: "packSel" }, "Content"), select, drop, area, h("div", { class: "btnrow" }, tpl));
  if (packs.length) { select.value = packs[0].id; area.value = packs[0].csv; }
  return { el, text: () => area.value, setText: set };
}

export const field = (label, control, hint) => h("div", { class: "field" }, h("label", {}, label), control, hint ? h("p", { class: "hint" }, hint) : null);
export const select = (opts, value, onChange) => {
  const s = h("select", {}, ...opts.map(([v, t]) => h("option", { value: v }, t)));
  s.value = String(value); if (onChange) s.addEventListener("change", onChange);
  return s;
};
export const checkbox = (text, checked) => {
  const box = h("input", { type: "checkbox" }); box.checked = checked;
  return { box, el: h("label", { class: "check" }, box, " ", text) };
};
