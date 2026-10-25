// Draws the WikiTree Games icon (letter tiles in the WikiTree Bingo style) and saves it as PNGs.
//   node tools/make-icon.cjs      needs Playwright; writes assets/icon-500.png and assets/favicon.png
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const logo = "data:image/png;base64," + fs.readFileSync(path.join(root, "assets/logo-mark.png")).toString("base64");
const tiles = [
  ["G", "#FCB815", "#25422D"], ["A", "#f37c26", "#fff"], ["M", "#8FC641", "#fff"],
  ["E", "#FFE270", "#25422D"], ["S", "#A5D167", "#25422D"], [null]
];
const html = `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;background:transparent}
.icon{width:500px;height:500px;box-sizing:border-box;border-radius:84px;background:#f6faea;padding:34px;display:grid;grid-template-columns:repeat(3,1fr);gap:22px;align-content:center}
.t{aspect-ratio:1;border-radius:34px;display:flex;align-items:center;justify-content:center;font:700 130px/1 Carlito,Calibri,"Segoe UI",system-ui,sans-serif;box-shadow:0 8px 0 rgba(0,0,0,.16)}
.t.logo{background:#fff;padding:12px;box-sizing:border-box}
.t img{width:100%;height:100%;object-fit:contain}
</style><div class="icon">${tiles.map(([c, bg, fg]) => c ? `<div class="t" style="background:${bg};color:${fg}">${c}</div>` : `<div class="t logo"><img src="${logo}"></div>`).join("")}</div>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 500, height: 500 } });
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  await page.locator(".icon").screenshot({ path: path.join(root, "assets/icon-500.png"), omitBackground: true });
  const small = await browser.newPage({ viewport: { width: 128, height: 128 }, deviceScaleFactor: 1 });
  await small.setContent(html.replace("<style>", "<style>.icon{zoom:.256}"));
  await small.evaluate(() => document.fonts.ready);
  await small.locator(".icon").screenshot({ path: path.join(root, "assets/favicon.png"), omitBackground: true });
  await browser.close();
})();
