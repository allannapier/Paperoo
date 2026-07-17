# Paperoo

**Play it now: https://allannapier.github.io/Paperoo/**

A web remake of the classic paper-delivery arcade game — riders on scooters,
hoverboards, rollerblades and mopeds cruising a suburban street, throwing
newspapers at subscriber houses. Viewed from behind the rider, pseudo-3D
sprite-scaling style, with a synthesized chiptune soundtrack. Plain
HTML/CSS/JS, no build step, no dependencies. Global + daily leaderboards
backed by a Cloudflare Worker.

**Play:** open `index.html`, or serve the folder with any static server
(`python3 -m http.server`), or enable GitHub Pages (below).

## How to play

- Two modes from the title screen: **ENDLESS RIDE** (survive as many streets
  as you can) and **DAILY ROUTE #N** (a fixed three-street run — same seeded
  streets for every player worldwide that day, with its own leaderboard and a
  shareable result).
- The bottom quarter of the screen is the touch controller: **STEER** ◀ ▶ and
  **THROW** left / right. On a keyboard the deck collapses to a hint bar:
  **←/→** (or A/D) steer, **Z** throws left, **X** throws right,
  **Space/Enter** starts, **P/Esc** pauses.
- Deliver papers to the **glowing subscriber houses** — hitting the mailbox
  scores 250, the yard 100, and consecutive deliveries build a multiplier
  (watch the combo pips by the score).
- **Smash the windows** of dark non-subscriber houses for 50, bonk a
  strolling pedestrian for 200, and shave past obstacles for a +25 near-miss
  bonus.
- Missing a subscriber house resets your multiplier.
- Dodge parked cars, dogs, trash cans and storm drains — a crash costs a
  heart. Missing a street's delivery quota costs a heart too; lose all three
  and the round is over.
- Ride over paper bundles on the road to restock (max 30 papers). Run low and
  the route guarantees a bundle ahead.
- The street **bends and rolls**: curves pull the rider toward the outside
  (fight them with steering — the pull grows with speed), and hills hide
  what's over the next crest. Every street's shape is seeded, so a Daily
  Route's bends are the same for everyone.
- Streets cycle dusk → night → day as the levels climb, and every 3 levels
  the neighborhood itself changes: **Suburbia** → **Downtown** → **Beachfront**
  → **Snowy Suburb**, then back to Suburbia. Each district has its own house
  designs and skyline art; Daily Route locks the whole run to one district.
- **Unlockable riders:** Zoe and Milo are available from the start; deliver
  25 lifetime papers to unlock Skye, reach level 5 to unlock Grandpa Stan.
  Every rider has different speed/handling.
- End-of-run card shows your stats (accuracy, best streak, bonks, smashed
  windows) with a **SHARE** button that copies a Wordle-style result.

## GitHub Pages

Settings → Pages → "Deploy from a branch" → pick the branch → `/ (root)` →
Save. The game is a static site served from the repo root, so that's all it
needs.

## Global leaderboard (optional, ~5 minutes)

Out of the box, high scores save locally on each device. To share one global
leaderboard between all players, deploy a tiny score API and point
`LEADERBOARD_URL` in [`js/config.js`](js/config.js) at it. Two ready-made
backends live in `tools/` — pick one:

### Option A: Cloudflare Worker + D1 (recommended)

All in the Cloudflare dashboard, no CLI:

1. **Storage & Databases → D1 → Create database** (name it e.g.
   `paperoo`).
2. **Workers & Pages → Create → Worker** (e.g. `paperoo-scores`) and
   deploy the hello-world it offers.
3. Open the worker → **Settings → Bindings → Add → D1 database**, variable
   name `DB`, select your database, save.
4. **Edit code**, replace everything with
   [`tools/leaderboard-worker.js`](tools/leaderboard-worker.js), deploy.
5. Put the worker URL (`https://<name>.<account>.workers.dev`) into
   `js/config.js` as `LEADERBOARD_URL`, commit, push.

The table creates itself on first use; only the top 500 scores are kept
per board. Delete rows in the D1 console to moderate.

> **Already deployed?** The Daily Route mode added a `board` column and a
> submitter-rank response to the worker. Re-paste the current
> [`tools/leaderboard-worker.js`](tools/leaderboard-worker.js) over your
> deployed worker and deploy — the D1 schema migrates itself on the next
> request. Until then daily scores land on the global board and no rank is
> shown (the client degrades gracefully).

### Option B: Google Sheets + Apps Script

1. Create a Google Sheet at [sheets.new](https://sheets.new) (any name).
2. In the sheet: **Extensions → Apps Script**, replace the default code with
   the contents of [`tools/leaderboard.gs`](tools/leaderboard.gs), and save.
3. **Deploy → New deployment → Web app**, with *Execute as: Me* and
   *Who has access: Anyone*. Deploy, authorize, and copy the web app URL.
4. Paste the URL into `js/config.js` as `LEADERBOARD_URL`, commit, push.

Scores land as rows in your sheet — delete a row to remove an entry.

Either way, submissions are sanitized and clamped server-side, but it's a
friendly arcade board, not a tamper-proof one.

## Art pipeline

Real art has landed for the core set; anything missing falls back to a
code-drawn placeholder. Sprites go in
`assets/` — the game tries to load each PNG by name and falls back to its
placeholder if the file is missing, so art can land incrementally. File names,
sizes and ready-to-use image-generation prompts are in
[ART_PROMPTS.md](ART_PROMPTS.md).

Houses and skylines are additionally keyed by **district** (see `DISTRICTS`
in [`js/sprites.js`](js/sprites.js)): district 0 (suburbia) keeps the
original unsuffixed file names (`house1_sub.webp`, `skyline.webp`, ...), and
districts 1+ use a `_d<n>` suffix (`house1_sub_d1.webp`, `skyline_d1.webp`,
...). Missing district art falls back to a district-tinted placeholder the
same way the base sprites do.

## Code layout

- `index.html` — page layout, controller buttons, overlays, styles
- `js/config.js` — leaderboard endpoint configuration
- `js/sprites.js` — sprite registry, asset loader, placeholder painters
- `js/music.js` — synthesized chiptune soundtrack (lookahead WebAudio sequencer)
- `js/leaderboard.js` — leaderboard client + game-over panel UI
- `js/game.js` — game logic: projection, spawning, physics, input, rendering,
  daily seeding, rider progression
