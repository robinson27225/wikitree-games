# WikiTree Games

Live genealogy games for WikiTree members, in the same look and spirit as [WikiTree Bingo](https://github.com/robinson27225/wikitree-bingo). Anyone can start a session, share a 4-letter code, and play with other WikiTreers from their own phone, tablet or desktop. A host can also run a game on a livecast (YouTube, Discord screen share, Zoom) and let a group play along.

| Game | How it plays |
|------|--------------|
| **Clue Board** (Jeopardy-style) | The host's screen shows a board of categories. Pick a clue, players buzz in from their phones, then answer. Right answers score and take control of the board; wrong answers cost points and lock you out of that clue. Optional Daily Doubles with wagers. |
| **Crossword** | One puzzle, built automatically from a list of answers and clues, that everyone fills in together in real time. You score 1 point for each correct square you typed and 3 for finishing a word. |
| **Word Search** | Everyone hunts the same grid of hidden words. Drag across a word (or tap its first and last letters) and the first player to circle it claims it. Points equal the word's length. |

Players sign in by typing their **WikiTree ID** (for example `Robinson-27225`) or, if they prefer, just a username. IDs are checked for the right format and winners are shown with a link to their WikiTree profile. The IDs are not verified against WikiTree itself.

## Running a session
1. Open the site and choose **Host a game**, then pick a game.
2. Choose a ready-made content pack or paste/upload your own CSV (formats below). The crossword and word search show a preview, and **Try a different layout** or **Shuffle the grid** rebuilds them.
3. Choose **Open lobby**. Share the 4-letter code and link. Players enter their WikiTree ID and the code.
4. When people are in, press the **START** logo. People can still join after it starts.
5. At the end everyone sees the results and the host can **Play again** with the same content, or start a new session. The host can remove a player from the lobby with the × next to their name.

Want to play too? Use **Join as a player too** on the lobby screen. It opens the player page in a new tab. For Clue Board it is fairer to have someone else host, because the host sees the answers.

If the host's browser is refreshed, the host page offers **Resume game**. If a player's phone locks or refreshes, they are put straight back in with their score.

### Hosting on a livecast
Share the host browser window (not the whole desktop) on YouTube Live, Discord, Zoom or similar. The host screen is built for that: large text, a live scoreboard, and sound for the winner announcement.

- **Clue Board:** answers are hidden by default. Press **P** or the *Peek at the answer* button to look, and be careful to peek only when you're not sharing that window or on a second screen. Space opens the buzzers and moves back to the board. Click a name in the scoreboard to hand them control of the board, or use **±** to correct a score. Daily Double clues stay off the shared screen until the player has wagered.
- **Crossword and Word Search:** the host screen shows the live grid, with each player's finds and squares in their own colour.
- Players can follow the stream and play on their phones at the same time. Buzz order is decided by the server, so tell viewers on a delayed stream to read the clue on their phone, which shows it straight away.

## Content formats
Every game takes a CSV (a spreadsheet pasted straight in works too). Each game has a **Download a template** button.

**Clue Board:** `Category,Value,Clue,Answer`
```
Kinship,100,Your mother's brother is your ___.,Uncle
Kinship,200,"The child of your first cousin is your first cousin ___ removed.",Once|1
```
Value is optional (it defaults to 100, 200, 300… down each category). Put several accepted answers in the Answer cell separated by `|`; the first is the one shown. Up to 8 categories and 8 clues each. With **Check typed answers automatically**, "what is an uncle", "UNCLE" and a one-letter typo in a long answer all count. In the default mode the host judges.

**Crossword:** `Answer,Clue`. Answers are 3 to 15 letters; spaces, hyphens and accents are ignored. Up to 60 words. The layout is generated for you, and every word that fits is placed.

**Word Search:** one word or phrase per row, 3 to 18 letters, up to 40. Choose Easy (across and down), Medium (plus diagonals) or Hard (any direction, including backwards). Tip: paste the surnames or places from your own family tree.

Ready-made packs (genealogy basics, WikiTree terms) are in `shared/packs.js`. They are meant as a starting point, so please check them before an event.

## Deploying
The pages are static files and the realtime part is one small Cloudflare Worker with a Durable Object, exactly like WikiTree Bingo. A free Cloudflare account is enough.

1. **Worker.**
   ```
   npm install
   npx wrangler login
   npm run deploy:worker
   ```
   Edit `ALLOWED_ORIGINS` in `worker/wrangler.toml` to match the site that serves the pages (for GitHub Pages: `https://<user>.github.io`).
2. **Point the pages at it.** Set `WORKER_URL` in `shared/config.js` to your deployed Worker URL. Any page also accepts `?worker=https://…` to override it.
3. **Pages.** Publish the repository root with GitHub Pages (Settings, Pages, branch `main`, folder `/`).
4. *Optional:* if you have a short link such as `https://wikitree.s.gy/games` that opens `index.html`, set `SHORT_URL` in `shared/config.js` and the lobby will show that instead of the long address. The landing page forwards `?g=CODE` to the player page.

## Local development and tests
```
npm install
npm run dev:worker      # Worker on http://127.0.0.1:8787
npm run serve           # static pages on http://127.0.0.1:8000, open them with ?worker=http://127.0.0.1:8787
npm test                # unit tests for all game rules and the session room
node test/e2e.cjs       # host + players play every game in a browser (needs Playwright, the two servers above running)
```
Set `SHOTS=/some/dir` when running the end-to-end test to save screenshots of each screen.

## How it works
- `shared/games/{clue,crossword,wordsearch}.js` hold each game as a pure state machine: content parsing and validation, generators, rules and scoring, and a `view()` that decides what the host and each player may see (players never receive Clue Board answers, or the crossword solution, until revealed).
- `shared/room.js` wraps one game in a session: who has joined, lobby, playing and results, kicking, and per-role snapshots. It runs unchanged in the Worker and in the unit tests.
- `worker/src/index.js` is the Worker plus a `GameRoom` Durable Object per game code. It sends every connection a fresh snapshot (at most about 8 times a second), enforces timers, rate-limits each socket, and deletes a room after 24 hours of inactivity. Players refer to each other by a short public id, and the secret id in their browser is only used to get back in.
- `ui/` holds the browser side: `host.js` and `player.js` are the pages, and `clue.js`, `crossword.js` and `wordsearch.js` each provide that game's setup form, shared-screen view and phone view.
- Scores, buzz order and answers are all decided on the server, so a modified browser can't award itself points.

## Limits
Up to 200 players per session. The crossword and word search send the whole grid to everyone on each change, which is comfortable for a few dozen players typing at once. A very large crossword session would want delta updates.

## Ideas for later
- A Final Clue round with secret wagers for Clue Board.
- Prize eligibility checks like WikiTree Bingo's, if these games are used for prize events.
- Checking WikiTree IDs against the WikiTree API.
- Building a word search or crossword straight from a WikiTree ID's ancestors.

## Credits
Look, feel and the applause sound follow WikiTree Bingo and the WikiTree Marathon Drawing tool. Made by [Robinson-27225](https://www.wikitree.com/wiki/Robinson-27225) on WikiTree.
