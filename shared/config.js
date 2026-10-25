export const TOOL_NAME = "WikiTree Games";
export const VERSION = "0.1.0";
export const AUTHOR_URL = "https://www.wikitree.com/wiki/Robinson-27225";
export const AUTHOR_ID = "Robinson-27225";

// Optional short link shown to players on the host lobby, e.g. "https://wikitree.s.gy/games". It must
// open the landing page, which passes ?g=CODE on to the player page. Leave it empty to show the
// full address of play.html instead.
export const SHORT_URL = "";

// Base URL of the deployed Cloudflare Worker (see README). Override without editing this
// file by opening a page with ?worker=...  e.g. ?worker=http://127.0.0.1:8787 for local dev.
const param = (() => { try { return new URLSearchParams(location.search).get("worker"); } catch (e) { return null; } })();
export const WORKER_URL = (param || "https://wikitree-games.wikitreebingo.workers.dev").replace(/\/+$/, "");

export function wsUrl(path) { return WORKER_URL.replace(/^http/, "ws") + path; }

export function renderFooter(el) {
  el.innerHTML =
    `<a class="foot-logo" href="https://www.wikitree.com/" target="_blank" rel="noopener"><img src="assets/logo-full.png" alt="WikiTree: Where genealogists collaborate"></a>` +
    `<a class="foot-tool" href="${AUTHOR_URL}" target="_blank" rel="noopener">${TOOL_NAME} v${VERSION} &middot; ${AUTHOR_ID}</a>`;
}
