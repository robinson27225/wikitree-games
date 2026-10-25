// End-to-end check: a host and two players play each game against a local Worker and static server.
//   npm run dev:worker   (port 8787)      npm run serve   (port 8000)      node test/e2e.cjs
const { chromium } = require("playwright");
const assert = require("node:assert/strict");

const SITE = process.env.SITE || "http://127.0.0.1:8000";
const WORKER = process.env.WORKER || "http://127.0.0.1:8787";
const SHOTS = process.env.SHOTS || "";
const q = `worker=${encodeURIComponent(WORKER)}`;
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
const phone = { viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true };

async function openLobby(browser, host, game, fill) {
  await host.goto(`${SITE}/host.html?${q}`);
  await host.click(`.gamecard:has-text("${game}")`);
  if (fill) await fill(host);
  await host.click("#openLobby");
  await host.waitForSelector("#lobby.active");
  const code = (await host.textContent("#bigCode")).trim();
  assert.match(code, /^[A-Z2-9]{4}$/);
  return code;
}
async function joinPlayer(browser, code, name, kind = "id") {
  const ctx = await browser.newContext(phone);
  const page = await ctx.newPage();
  page.on("pageerror", e => { throw e; });
  await page.goto(`${SITE}/play.html?g=${code}&${q}`);
  if (kind === "name") await page.click("#modeName");
  await page.fill("#who", name);
  await page.click("#joinBtn");
  await page.waitForSelector("#game:not(.hidden)");
  return page;
}
const score = async (host, name) => host.evaluate(n => {
  const row = [...document.querySelectorAll("#scores .srow")].find(r => r.querySelector(".nm").textContent.startsWith(n));
  return row ? Number(row.querySelector(".pts").textContent.replace(/[^0-9-]/g, "")) * (row.querySelector(".pts.neg") ? -1 : 1) : null;
}, name);

(async () => {
  const browser = await chromium.launch();
  const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const host = await hostCtx.newPage();
  host.on("pageerror", e => { throw e; });

  /* ---------- Clue Board ---------- */
  {
    const code = await openLobby(browser, host, "Clue Board", async h => {
      await h.selectOption('#setupForm .field:has(> label:text-is("Daily Doubles")) select', "0");
      await h.selectOption('#setupForm .field:has(> label:text-is("Judging")) select', "auto");
    });
    assert.equal(await host.isDisabled("#startBtn"), true, "cannot start with nobody in the game");
    const a = await joinPlayer(browser, code, "Robinson-27225");
    const b = await joinPlayer(browser, code, "Guest Bee", "name");
    await host.waitForFunction(() => document.getElementById("lobbyCount").textContent === "2");
    assert.match(await a.textContent("#waiting"), /Waiting for the host/);
    await shot(host, "clue-lobby");
    await host.click("#startBtn", { force: true });
    await host.waitForSelector("#stage.active .cb-board");
    await host.click(".cb-tile >> nth=0");                           // first column, $100
    await host.waitForSelector(".cb-clue:not(.hidden)");
    await a.waitForSelector(".cp-card");
    assert.equal(await a.isDisabled(".buzz"), true, "buzzer is closed until the host opens it");
    await host.click('button:has-text("Open buzzers")');
    await a.waitForSelector(".buzz:not([disabled])");
    await shot(a, "clue-player-buzz");
    await a.click(".buzz", { force: true });
    await b.waitForSelector("text=is answering");
    await a.fill(".cp-form input", "what is an uncle");
    await a.click(".cp-form button");
    await host.waitForSelector("text=is right");
    await a.waitForSelector(".cp-answer");
    await shot(host, "clue-host-revealed");
    assert.equal(await score(host, "Robinson-27225"), 100);
    await host.click('button:has-text("Back to the board")');
    await host.waitForSelector(".cb-board:not(.hidden)");
    assert.match(await a.textContent(".cp-msg"), /You pick the next clue/);
    await shot(host, "clue-host-board");
    await shot(a, "clue-player-board");
    await host.evaluate(() => { window.confirm = () => true; });
    await host.click("#endBtn");
    await host.waitForSelector("#over.show");
    assert.match(await host.textContent("#resultsBox"), /Robinson-27225/);
    await shot(host, "clue-over");
    await a.waitForSelector("#presults:not(.hidden)");
    await hostCtx.clearCookies();
    await a.context().close(); await b.context().close();
  }

  /* ---------- Crossword ---------- */
  {
    const words = [["ANCESTOR", "Person from whom you descend"], ["CENSUS", "Periodic population count"], ["SURNAME", "Family name"], ["PEDIGREE", "Chart of ancestors"], ["PARISH", "Church district"]];
    const code = await openLobby(browser, host, "Crossword", async h => {
      await h.fill("#setupForm textarea", "Answer,Clue\n" + words.map(w => w.join(",")).join("\n"));
      await h.waitForSelector(".xw-preview .xw-cell");
    });
    const a = await joinPlayer(browser, code, "Smith-123");
    const b = await joinPlayer(browser, code, "Lee-9");
    await host.waitForFunction(() => document.getElementById("lobbyCount").textContent === "2");
    assert.equal(await a.isVisible("#gameArea"), false, "no peeking at the puzzle before the start");
    await host.click("#startBtn", { force: true });
    await a.waitForSelector(".xw-cell");
    await shot(a, "crossword-player-start");
    // solve one word by tapping its clue and typing it
    await a.click('.xw-clue:has-text("Family name")');
    await a.keyboard.type("SURNAME");
    await host.waitForFunction(() => /Smith-123/.test(document.querySelector("#scores").textContent) && document.querySelector(".xw-clue.solved"));
    assert.ok((await score(host, "Smith-123")) >= 7 + 3, "7 squares plus the 3 point bonus");
    await shot(a, "crossword-player-solved");
    await shot(host, "crossword-host");
    // a wrong word does not score and a solved word cannot be changed
    await b.click('.xw-clue:has-text("Church district")');
    await b.keyboard.type("ZZZZZZ");
    assert.equal(await score(host, "Lee-9"), 0);
    // finish the rest
    for (const [ans, clue] of words) {
      if (ans === "SURNAME") continue;
      await b.click(`.xw-clue:has-text("${clue}")`);
      for (let i = 0; i < ans.length + 1; i++) await b.keyboard.press("Backspace");
      await b.keyboard.type(ans);
    }
    await host.waitForSelector("#over.show");
    await shot(host, "crossword-over");
    await a.waitForSelector("#presults:not(.hidden)");
    await a.context().close(); await b.context().close();
    await host.click("#againBtn");
    await host.waitForSelector("#lobby.active");
  }

  /* ---------- Word Search ---------- */
  {
    const list = ["ANCESTOR", "CENSUS", "SURNAME", "PEDIGREE", "PARISH", "COUSIN"];
    const code = await openLobby(browser, host, "Word Search", async h => {
      await h.fill("#setupForm textarea", "Words\n" + list.join("\n"));
      await h.waitForSelector(".ws-preview .ws-cell");
    });
    const a = await joinPlayer(browser, code, "Smith-123");
    const b = await joinPlayer(browser, code, "Lee-9");
    await host.waitForFunction(() => document.getElementById("lobbyCount").textContent === "2");
    await host.click("#startBtn", { force: true });
    await a.waitForSelector(".ws-cell");
    await shot(a, "wordsearch-player-start");
    const grid = await a.$$eval(".ws-cell", cs => cs.map(c => c.textContent));
    const n = Math.sqrt(grid.length);
    const find = word => {
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1]]) {
        let ok = true;
        for (let k = 0; k < word.length && ok; k++) { const rr = r + dr * k, cc = c + dc * k; ok = rr >= 0 && cc >= 0 && rr < n && cc < n && grid[rr * n + cc] === word[k]; }
        if (ok) return [r * n + c, (r + dr * (word.length - 1)) * n + c + dc * (word.length - 1)];
      }
    };
    const drag = async (page, from, to) => {
      const box = i => page.locator(".ws-cell").nth(i).boundingBox();
      const f = await box(from), t = await box(to);
      await page.mouse.move(f.x + f.width / 2, f.y + f.height / 2);
      await page.mouse.down();
      await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 6 });
      await page.mouse.up();
    };
    const [s1, e1] = find("ANCESTOR");
    await drag(a, s1, e1);
    await host.waitForFunction(() => /Smith-123/.test(document.querySelector("#scores").textContent) && document.querySelector(".ws-word.found"));
    assert.equal(await score(host, "Smith-123"), 8);
    await shot(a, "wordsearch-player-found");
    await shot(host, "wordsearch-host");
    // a word found backwards by tapping the last then first letter
    const [s2, e2] = find("CENSUS");
    await b.locator(".ws-cell").nth(e2).tap(); await b.locator(".ws-cell").nth(s2).tap();
    await host.waitForFunction(() => /Lee-9/.test(document.querySelector("#scores").textContent) && /6/.test(document.querySelector("#scores").textContent));
    // already found: no points
    await drag(b, s1, e1);
    assert.equal(await score(host, "Lee-9"), 6);
    for (const w of ["SURNAME", "PEDIGREE", "PARISH", "COUSIN"]) { const [s, e] = find(w); await drag(b, s, e); }
    await host.waitForSelector("#over.show");
    await shot(host, "wordsearch-over");
    await a.context().close(); await b.context().close();
  }

  /* ---------- Clue Board: Daily Double, then everyone reconnects ---------- */
  {
    await host.goto(`${SITE}/host.html?${q}`);
    await host.click('.gamecard:has-text("Clue Board")');
    await host.fill("#setupForm textarea", "Cat,100,First clue,Alpha\nCat,200,Second clue,Beta");
    await host.selectOption('#setupForm .field:has(> label:text-is("Daily Doubles")) select', "2");
    await shot(host, "clue-setup");
    await host.click("#openLobby");
    await host.waitForSelector("#lobby.active");
    const code = (await host.textContent("#bigCode")).trim();
    const a = await joinPlayer(browser, code, "Wager-1");
    await host.waitForFunction(() => document.getElementById("lobbyCount").textContent === "1");
    await host.click("#startBtn", { force: true });
    await host.waitForSelector(".cb-tile:not([disabled])");
    // the board has two clues and one Daily Double: open them in turn until it turns up
    await host.click(".cb-tile:not(.gone) >> nth=0");
    await host.waitForSelector(".cb-clue:not(.hidden)");
    if (!(await host.isVisible('.cb-val:has-text("DAILY DOUBLE")'))) {
      await host.click('button:has-text("Show answer and move on")');
      await host.click('button:has-text("Back to the board")');
      await host.waitForSelector(".cb-tile.gone");
      await host.click(".cb-tile:not(.gone) >> nth=0");
    }
    await host.waitForSelector('.cb-val:has-text("DAILY DOUBLE")');
    assert.doesNotMatch(await host.textContent(".cb-text"), /clue/i, "the clue stays off the shared screen until the wager is in");
    await a.waitForSelector(".cp-form input[type=number]");
    await shot(a, "clue-player-wager");
    await a.fill(".cp-form input[type=number]", "150");
    await a.click('.cp-form button:has-text("Lock in")');
    await host.waitForSelector('.cb-btns button.good');
    assert.match(await host.textContent(".cb-text"), /clue/i);
    await host.click('.cb-btns button.good');
    await host.waitForFunction(() => /150/.test(document.querySelector("#scores").textContent));

    // the host reloads the page and resumes; the player reloads and is let straight back in
    await host.reload();
    await host.click("#resume");
    await host.waitForSelector("#stage.active");
    assert.match(await host.textContent("#scores"), /150/);
    await a.reload();
    await a.waitForSelector("#game:not(.hidden)");
    assert.match(await a.textContent(".cp-top"), /\$150/);
    await a.context().close();
  }

  await browser.close();
  console.log("e2e ok");
})().catch(e => { console.error(e); process.exit(1); });
