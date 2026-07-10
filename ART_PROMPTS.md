# Paper Person — art generation prompts

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

All houses: **flat front elevation view, perfectly front-facing, no perspective,
no vanishing point** (the game engine adds the perspective). Single-storey
suburban house with a front door in the middle and one window either side.
Roughly square image.

| File | Prompt (after the style sentence) |
|---|---|
| `house1_sub.png` | Flat front elevation view of a cozy single-storey suburban house, perfectly front-facing with no perspective. Red-brick walls, brown gable roof, central front door, one window on each side of the door. **Windows glowing warm yellow, porch light on**, welcoming night-time feel. |
| `house1_nosub.png` | Exactly the same red-brick house with brown gable roof, flat front elevation view, no perspective — but **all windows dark and unlit, porch light off**, gloomy and asleep. |
| `house2_sub.png` | Flat front elevation view of a single-storey suburban house, perfectly front-facing with no perspective. Pale blue wooden siding, dark navy gable roof, white door frame, central front door, one window each side. **Windows glowing warm yellow, porch light on.** |
| `house2_nosub.png` | Exactly the same pale blue wooden house with navy roof, flat front elevation view, no perspective — but **all windows dark and unlit, porch light off**, gloomy. |
| `house3_sub.png` | Flat front elevation view of a single-storey suburban house, perfectly front-facing with no perspective. Beige stucco walls, grey tiled gable roof, dark wooden door, one window each side. **Windows glowing warm yellow, porch light on.** |
| `house3_nosub.png` | Exactly the same beige stucco house with grey roof, flat front elevation view, no perspective — but **all windows dark and unlit, porch light off**, gloomy. |

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
| `logo.png` | Retro arcade video game logo with the words **"PAPER PERSON"** in big chunky yellow pixel letters with a red outline and dark drop shadow, on two lines, with a small rolled newspaper spinning off the corner. Transparent background. Wide format, roughly 2:1. |

## After generating

Drop the PNGs into `assets/` with these exact names, commit, push — done. If
any image comes back with a solid background instead of transparency, or at a
weird size, just upload it as-is to Claude and it can be cleaned up with a
script (chroma-key + crop + resize).
