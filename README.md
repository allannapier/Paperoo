# Paper Person

A web remake of the classic paper-delivery arcade game — you're a girl on an
e-scooter riding down a suburban street at dusk, throwing newspapers at
subscriber houses. Viewed from behind the rider, pseudo-3D sprite-scaling
style. Plain HTML/CSS/JS, no build step, no dependencies.

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
