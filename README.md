# Paperoo

**Play it now: https://allannapier.github.io/Paperoo/**

A web remake of the classic paper-delivery arcade game — you're a girl on an
e-scooter riding down a suburban street at dusk, throwing newspapers at
subscriber houses. Viewed from behind the rider, pseudo-3D sprite-scaling
style. Plain HTML/CSS/JS, no build step, no dependencies. Global leaderboard
backed by a Cloudflare Worker.

**Play:** open `index.html`, or serve the folder with any static server
(`python3 -m http.server`), or enable GitHub Pages (below).

## How to play

- The bottom quarter of the screen is the touch controller: **STEER** ◀ ▶ and
  **THROW** left / right.
- Keyboard also works: **←/→** (or A/D) steer, **Z** throws left, **X** throws
  right, **Space/Enter** starts.
- Deliver papers to the **glowing subscriber houses** — hitting the mailbox
  scores 250, the yard 100, and consecutive deliveries build a multiplier.
- **Smash the windows** of dark non-subscriber houses for 50.
- Missing a subscriber house resets your multiplier.
- Dodge parked cars, dogs, trash cans and storm drains. Three crashes and the
  round is over.
- Ride over paper bundles on the road to restock (max 30 papers).

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

The table creates itself on first use; only the top 500 scores are kept.
Delete rows in the D1 console to moderate.

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

All graphics are currently code-drawn placeholders. Real sprites go in
`assets/` — the game tries to load each PNG by name and falls back to its
placeholder if the file is missing, so art can land incrementally. File names,
sizes and ready-to-use image-generation prompts are in
[ART_PROMPTS.md](ART_PROMPTS.md).

## Code layout

- `index.html` — page layout, controller buttons, styles
- `js/sprites.js` — sprite registry, asset loader, placeholder painters
- `js/game.js` — game logic: projection, spawning, physics, input, rendering
