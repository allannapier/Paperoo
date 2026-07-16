# Paperoo — art generation prompts

One prompt per sprite. Generate each image, then save it into the `assets/`
folder with the **exact file name** shown — the game picks it up automatically
(no code changes needed). Until a file exists, the game uses a built-in
placeholder.

## Rules that apply to every image

- **Ask for a transparent background.** If your generator can't do
  transparency, ask for a *plain solid pure-green (#00FF00) background* instead
  and we'll strip it out afterwards. (Exception: `skyline.png` should NOT be
  transparent — it's a full painted strip.)
- Keep the subject **centred and filling most of the frame** — empty margins
  waste resolution.
- **No ground shadows, no text, no watermarks** baked into the sprite.
- Reuse the same style sentence in every prompt so all sprites match. Generate
  them in one chat session if the tool supports it, for extra consistency.

**Shared style sentence (paste at the start of every prompt):**

> 16-bit retro arcade pixel art game sprite, crisp chunky pixels, bold outlines,
> vibrant colors, warm evening dusk lighting, transparent background, no ground
> shadow, no text.

## Character (3 images — keep her identical across all three)

Character sheet: a teenage girl on an electric stand-up scooter, seen **directly
from behind** (we only see her back). Pink bicycle helmet, long brown ponytail,
teal green jacket, blue jeans, white sneakers, an orange messenger bag full of
rolled newspapers slung on her right hip. Black e-scooter with handlebar
visible either side of her body and one rear wheel below the deck.

| File | Prompt (after the style sentence) |
|---|---|
| `player_straight.png` | A teenage girl riding an electric stand-up scooter, viewed directly from behind, riding straight and upright. Pink bicycle helmet, long brown ponytail hanging straight down, teal green jacket, blue jeans, white sneakers, orange messenger bag full of rolled newspapers on her right hip. Black e-scooter, handlebar grips visible on both sides of her body, single rear wheel under the deck. Full body, feet on the deck. Portrait orientation, roughly 3:4. |
| `player_left.png` | Same girl and scooter as before, viewed directly from behind, but **leaning to the left as she steers left** — body and scooter tilted about 15 degrees left, ponytail swinging out to the right. Everything else identical. |
| `player_right.png` | Same girl and scooter as before, viewed directly from behind, but **leaning to the right as she steers right** — body and scooter tilted about 15 degrees right, ponytail swinging out to the left. Everything else identical. |

## Houses (6 images — 3 designs × lit/unlit)

The street now cycles **dusk → night → day**, so house sprites must NOT have
a time of day baked in: ask for **soft neutral daylight-agnostic lighting**
(replace the "warm evening dusk lighting" phrase of the shared style sentence
with "soft neutral lighting" for these six images only). The lit/unlit story
is carried entirely by the windows and porch light.

All houses: **flat front elevation view, perfectly front-facing, no
perspective, no vanishing point** (the game engine adds the perspective).
**Wide landscape format, roughly 2:1** — the current in-game art is 800×417,
so generate at that shape or larger and it will be scaled down. Single-storey,
strong chunky silhouette, big readable windows (they must read when the house
is 30 pixels wide on the horizon). The bottom edge is a flat foundation line —
**no lawn, path, driveway, fence or mailbox** (the mailbox is its own sprite).

Each design is a lit/unlit pair: generate both in the same chat and keep the
building pixel-identical between them — only lights, window contents and mood
change.

| File | Prompt (after the adjusted style sentence) |
|---|---|
| `house1_sub.png` | Flat front elevation of a cozy single-storey red-brick craftsman bungalow, perfectly front-facing, no perspective. Chocolate-brown gable roof with a small brick chimney, covered front porch with two white posts, central wooden front door, one large white-framed window on each side of the porch. **Every window blazing warm amber-yellow with visible glow, cozy curtains open, porch lantern lit with a soft halo, welcoming doormat** — unmistakably "this house wants its newspaper". Wide landscape sprite, roughly 2:1. |
| `house1_nosub.png` | The exact same red-brick craftsman bungalow — identical roof, chimney, porch, posts, door and window placement — but **asleep: every window dark cold blue-grey with a faint glassy sheen, curtains drawn, porch lantern off, brick slightly muted and cooler**, gloomy and unwelcoming. One extra-large prominent dark front window as the centrepiece. |
| `house2_sub.png` | Flat front elevation of a single-storey pale-blue timber cottage, perfectly front-facing, no perspective. Powder-blue horizontal wood siding with crisp white trim, steep navy-blue gable roof, white front door with a small round window, a wide white-framed bay window on one side and a regular sash window on the other, low white porch railing. **All windows glowing warm amber with soft light spill, porch light on with a gentle halo, a warm string of light along the porch rail** — cheerful and inviting. Wide landscape sprite, roughly 2:1. |
| `house2_nosub.png` | The exact same pale-blue timber cottage — identical siding, trim, navy roof, bay window, railing — but **dark and asleep: windows cold dark blue-grey with faint reflections, blinds half-drawn, porch light off, no string lights, paint slightly desaturated**, gloomy. The bay window large and prominent as a dark centrepiece. |
| `house3_sub.png` | Flat front elevation of a low wide single-storey mid-century ranch house, perfectly front-facing, no perspective. Warm beige stucco walls, flat-ish shallow grey tiled roof with wide eaves, dark walnut front door, one huge floor-to-ceiling picture window on one side of the door and a smaller square window on the other, a slim modern wall sconce by the door. **Every window pouring out warm golden light, silhouettes of houseplants inside, sconce lit with a halo** — modern, warm, occupied. Wide landscape sprite, roughly 2:1. |
| `house3_nosub.png` | The exact same beige mid-century ranch — identical roof, eaves, door and window layout — but **lifeless: the huge picture window and square window dark charcoal-blue with a faint glassy glint, sconce off, stucco slightly greyed**, asleep and gloomy. The giant dark picture window dominates. |

After generating, hand the images over as PNGs (transparent or solid #00FF00
background) — they get chroma-keyed, resized to 800×417 and converted to
`.webp` before landing in `assets/` (the game loads `houseN_sub.webp` /
`houseN_nosub.webp`).

## Props & obstacles

| File | Prompt (after the style sentence) |
|---|---|
| `mailbox.png` | A classic American curbside mailbox on a wooden post, front view, dark blue rounded metal box, **red signal flag raised up**. Tall portrait sprite. |
| `mailbox_hit.png` | The same dark blue American curbside mailbox on a wooden post, front view, but with a **rolled newspaper sticking out of the open front and the red flag folded down**, small yellow star sparkles around it. |
| `paper.png` | A single rolled-up newspaper tied with string, seen at a slight diagonal angle, small simple game pickup sprite. Square image. |
| `bundle.png` | A bundle of stacked folded newspapers tied up with red string in a cross shape, game pickup item. Slightly wider than tall. |
| `car.png` | A parked hatchback car seen **directly from behind, rear view only**: rear windscreen, two red tail lights, number plate, rear wheels visible at the sides. Dark red paint. No perspective from the side. |
| `dog1.png` | A small scruffy brown dog running, **side view facing right**, mid-stride with legs stretched out, mouth open, chasing. |
| `dog2.png` | The exact same small scruffy brown dog running, side view facing right, but the **opposite running frame — legs tucked under the body** mid-bound. A two-frame run cycle with the previous image. |
| `bin.png` | A dented grey metal trash can with a lid, front view, slightly tapered, standing upright. Tall sprite. |
| `drain.png` | A rectangular metal storm-drain grate lying flat on a road, seen from a low angle just above the road surface so it appears as a **wide, short** sprite with dark slots. Much wider than tall (roughly 3:1). |

## Scenery & UI

| File | Prompt (after the style sentence — note the exceptions) |
|---|---|
| `skyline.png` | A very wide horizontal background strip of a distant city skyline at dusk: dark blue-purple gradient sky, silhouetted skyscrapers with scattered tiny lit yellow windows, a low warm orange glow and setting sun on the horizon, a dark tree line in the foreground bottom edge. **Wide landscape format, roughly 4:1. NOT transparent — full painted background. Must tile seamlessly when repeated horizontally** (left and right edges must match). |
| `logo.png` | Retro arcade video game logo with the word **"PAPEROO"** in big chunky yellow pixel letters with a red outline and dark drop shadow, with a small rolled newspaper spinning off the corner. Transparent background. Wide format, roughly 2:1. |

## Districts (house + skyline reskins per neighborhood)

The street reskins every 3 levels, cycling through **suburbia** (above) →
**downtown** → **beachfront** → **snowy suburb** → back to suburbia (see
`DISTRICTS` in `js/sprites.js`). Districts 1+ use the same `house1/2/3_sub /
_nosub` and `skyline` / `skyline_day` naming as suburbia, with a `_d<n>`
suffix: `house1_sub_d1.webp`, `skyline_day_d2.webp`, etc. Same rules as above
(transparent or solid-green background for houses, opaque tileable strip for
skylines, no text, same shared style sentence), and same lit/unlit pairing
per house design.

**Note on transparency:** in practice, asking Gemini for a "transparent
background" sometimes bakes in a literal grey checkerboard as opaque pixels
instead of real alpha. If that happens, ask it to redo the same image with
"a plain solid pure green (#00FF00) flat background, no checker pattern, no
gradient" instead — much more reliable to chroma-key out afterwards.

| District | File suffix | House themes (3 designs) | Skyline mood |
|---|---|---|---|
| Downtown | `_d1` | Brownstone rowhouse with stoop · sandstone apartment with fire escape · loft/warehouse conversion with huge steel windows | Dense neon skyline at dusk, streetlamps up front; bright glass-and-steel version by day |
| Beachfront | `_d2` | Turquoise bungalow on stilts with a surfboard · sandy fisherman's cottage with a net and buoys · white Spanish-style stucco villa | Sunset boardwalk with a pier and palm trees; sparkling turquoise ocean by day |
| Snowy suburb | `_d3` | Alpine ski chalet with string lights · snow-covered stone cottage with a smoking chimney · modern A-frame cabin with icicles | Snowy mountain village at dusk with falling snow; bright sunlit peaks by day |

Each design keeps the same "shared style sentence" from the top of this
file, plus the district's own material/palette cues (e.g. "weathered
turquoise wood plank siding" for the beach bungalow). Generate a design's
lit and dark pair back-to-back in the same chat ("now the exact same
building... but dark and asleep: ...") so the pair stays pixel-identical
apart from lighting, exactly as with the base suburbia houses.

## After generating

Drop the PNGs into `assets/` with these exact names, commit, push — done. If
any image comes back with a solid background instead of transparency, or at a
weird size, just upload it as-is to Claude and it can be cleaned up with a
script (chroma-key + crop + resize).
