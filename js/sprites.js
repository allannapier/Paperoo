/*
 * Sprite registry for Paperoo.
 *
 * Every sprite is defined by a file name under assets/ plus a placeholder
 * painter. If assets/<file> exists it is used as-is; if not, the painter
 * draws a stand-in at the same size. Drop real art into assets/ with these
 * exact file names and it appears in the game with zero code changes.
 */

// Neighborhood districts: the street reskins every 3 levels (see
// currentDistrictIndex in game.js), cycling through this list. District 0
// keeps the original unsuffixed file names for backward compatibility;
// districts 1+ look for `<sprite>_d<n>.webp` and fall back to a
// district-tinted placeholder until real art lands.
const DISTRICTS = [
  { name: 'suburbia', suffix: '' },
  { name: 'downtown', suffix: '_d1' },
  { name: 'beachfront', suffix: '_d2' },
  { name: 'snowy suburb', suffix: '_d3' },
];

const SPRITES = {
  // rider (rear view) — three lean poses, one set per playable character
  player_straight: { file: 'player_straight.webp', w: 150, h: 200, draw: (c, w, h) => drawPlayer(c, w, h, 0) },
  player_left:     { file: 'player_left.webp',     w: 150, h: 200, draw: (c, w, h) => drawPlayer(c, w, h, -1) },
  player_right:    { file: 'player_right.webp',    w: 150, h: 200, draw: (c, w, h) => drawPlayer(c, w, h, 1) },
  player2_straight: { file: 'player2_straight.webp', w: 150, h: 200, draw: (c, w, h) => drawPlayer(c, w, h, 0) },
  player2_left:     { file: 'player2_left.webp',     w: 150, h: 200, draw: (c, w, h) => drawPlayer(c, w, h, -1) },
  player2_right:    { file: 'player2_right.webp',    w: 150, h: 200, draw: (c, w, h) => drawPlayer(c, w, h, 1) },
  player3_straight: { file: 'player3_straight.webp', w: 150, h: 200, draw: (c, w, h) => drawPlayer(c, w, h, 0) },
  player3_left:     { file: 'player3_left.webp',     w: 150, h: 200, draw: (c, w, h) => drawPlayer(c, w, h, -1) },
  player3_right:    { file: 'player3_right.webp',    w: 150, h: 200, draw: (c, w, h) => drawPlayer(c, w, h, 1) },
  player4_straight: { file: 'player4_straight.webp', w: 150, h: 200, draw: (c, w, h) => drawPlayer(c, w, h, 0) },
  player4_left:     { file: 'player4_left.webp',     w: 150, h: 200, draw: (c, w, h) => drawPlayer(c, w, h, -1) },
  player4_right:    { file: 'player4_right.webp',    w: 150, h: 200, draw: (c, w, h) => drawPlayer(c, w, h, 1) },

  mailbox:     { file: 'mailbox.webp',     w: 70,  h: 130, draw: drawMailbox },
  mailbox_hit: { file: 'mailbox_hit.webp', w: 70,  h: 130, draw: (c, w, h) => drawMailbox(c, w, h, true) },

  paper:  { file: 'paper.webp',  w: 40,  h: 40,  draw: drawPaper },
  bundle: { file: 'bundle.webp', w: 90,  h: 60,  draw: drawBundle },

  // obstacles
  car:   { file: 'car.webp',   w: 200, h: 150, draw: drawCar },
  dog1:  { file: 'dog1.webp',  w: 120, h: 90,  draw: (c, w, h) => drawDog(c, w, h, 0) },
  dog2:  { file: 'dog2.webp',  w: 120, h: 90,  draw: (c, w, h) => drawDog(c, w, h, 1) },
  bin:   { file: 'bin.webp',   w: 80,  h: 110, draw: drawBin },
  drain: { file: 'drain.webp', w: 140, h: 45,  draw: drawDrain },

  // pedestrian on the sidewalk — bonus points for a direct hit
  ped1:    { file: 'ped1.webp',    w: 90,  h: 150, draw: (c, w, h) => drawPed(c, w, h, 0) },
  ped2:    { file: 'ped2.webp',    w: 90,  h: 150, draw: (c, w, h) => drawPed(c, w, h, 1) },
  ped_hit: { file: 'ped_hit.webp', w: 90,  h: 150, draw: (c, w, h) => drawPed(c, w, h, 2) },

  logo: { file: 'logo.webp', w: 640, h: 300, draw: drawLogo },
};

// houses (front view, sub = subscriber/lit, nosub = non-subscriber/dark) and
// skyline strips (skyline = dusk/night, skyline_day = the bright variant used
// every third level, see PHASES in game.js), registered once per district.
// District 0 (suburbia) keeps the original unsuffixed file names; districts
// 1+ look for `<name><suffix>.webp` and fall back to a district-tinted
// placeholder painter until real art lands.
DISTRICTS.forEach((d, di) => {
  for (let v = 0; v < 3; v++) {
    SPRITES[`house${v + 1}_sub${d.suffix}`] =
      { file: `house${v + 1}_sub${d.suffix}.webp`, w: 280, h: 250, draw: (c, w, h) => drawHouse(c, w, h, v, true, di) };
    SPRITES[`house${v + 1}_nosub${d.suffix}`] =
      { file: `house${v + 1}_nosub${d.suffix}.webp`, w: 280, h: 250, draw: (c, w, h) => drawHouse(c, w, h, v, false, di) };
  }
  // same placeholder painter for both skyline keys since the painter's dusk
  // look is a fine stand-in until the real art loads.
  SPRITES[`skyline${d.suffix}`] =
    { file: `skyline${d.suffix}.webp`, w: 1024, h: 256, draw: (c, w, h) => drawSkyline(c, w, h, di) };
  SPRITES[`skyline_day${d.suffix}`] =
    { file: `skyline_day${d.suffix}.webp`, w: 1024, h: 256, draw: (c, w, h) => drawSkyline(c, w, h, di) };
});

// Fills `out` with placeholder canvases synchronously so the game is
// playable on the first frame, then swaps each entry for the real image
// as it finishes downloading (calling onEach right away, per sprite,
// instead of making everything wait on the slowest asset).
function loadSprites(onEach) {
  const out = {};
  // INLINE_ASSETS lets a single-file build embed sprites as data: URIs
  const inline = (typeof window !== 'undefined' && window.INLINE_ASSETS) || {};
  for (const [key, spec] of Object.entries(SPRITES)) {
    out[key] = makePlaceholder(spec);
    const img = new Image();
    img.onload = () => { out[key] = img; if (onEach) onEach(key, img); };
    img.src = inline[key] || ('assets/' + spec.file);
  }
  return out;
}

function makePlaceholder(spec) {
  const c = document.createElement('canvas');
  c.width = spec.w;
  c.height = spec.h;
  const ctx = c.getContext('2d');
  spec.draw(ctx, spec.w, spec.h);
  return c;
}

/* ---------- placeholder painters (all replaced by real art later) ---------- */

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// girl on an e-scooter, seen from behind; lean = -1 | 0 | 1
function drawPlayer(ctx, w, h, lean) {
  const cx = w / 2;
  ctx.save();
  ctx.translate(cx, h);
  ctx.rotate(lean * 0.13);
  ctx.translate(-cx, -h);

  // rear wheel + fender
  ctx.fillStyle = '#1a1a1a';
  rr(ctx, cx - 12, h - 26, 24, 26, 8); ctx.fill();
  ctx.fillStyle = '#444';
  rr(ctx, cx - 15, h - 34, 30, 12, 5); ctx.fill();
  // deck
  ctx.fillStyle = '#2e2e3e';
  rr(ctx, cx - 26, h - 40, 52, 10, 4); ctx.fill();
  // legs
  ctx.fillStyle = '#3454d1';
  ctx.fillRect(cx - 16, h - 92, 13, 54);
  ctx.fillRect(cx + 3,  h - 92, 13, 54);
  ctx.fillStyle = '#fff';
  ctx.fillRect(cx - 16, h - 46, 13, 8);
  ctx.fillRect(cx + 3,  h - 46, 13, 8);

  // torso (jacket)
  ctx.fillStyle = '#1fb57a';
  rr(ctx, cx - 24, h - 138, 48, 52, 10); ctx.fill();
  // messenger bag hanging on right hip, papers poking out
  ctx.fillStyle = '#e88f2a';
  rr(ctx, cx + 14, h - 112, 26, 30, 5); ctx.fill();
  ctx.fillStyle = '#f5f0e6';
  ctx.fillRect(cx + 18, h - 118, 6, 10);
  ctx.fillRect(cx + 26, h - 120, 6, 12);
  // bag strap across back
  ctx.strokeStyle = '#e88f2a';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(cx - 20, h - 132);
  ctx.lineTo(cx + 24, h - 104);
  ctx.stroke();

  // arms reaching forward-down to the grips
  ctx.strokeStyle = '#1fb57a';
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx - 18, h - 126); ctx.lineTo(cx - 44, h - 112); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 18, h - 126); ctx.lineTo(cx + 44, h - 112); ctx.stroke();
  // handlebar in front of the rider (we see it past her sides)
  ctx.fillStyle = '#556';
  rr(ctx, cx - 52, h - 118, 104, 8, 4); ctx.fill();
  ctx.fillStyle = '#d1495b';
  rr(ctx, cx - 58, h - 121, 15, 13, 5); ctx.fill();
  rr(ctx, cx + 43, h - 121, 15, 13, 5); ctx.fill();

  // hair + ponytail (swings opposite the lean)
  ctx.fillStyle = '#5b3a1e';
  rr(ctx, cx - 15, h - 158, 30, 26, 8); ctx.fill();
  ctx.save();
  ctx.translate(cx, h - 150);
  ctx.rotate(-lean * 0.35);
  rr(ctx, -5, 0, 10, 34, 5); ctx.fill();
  ctx.restore();
  // helmet
  ctx.fillStyle = '#ff6fa5';
  ctx.beginPath();
  ctx.arc(cx, h - 158, 17, Math.PI, 0);
  ctx.fill();
  rr(ctx, cx - 17, h - 160, 34, 8, 3); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillRect(cx - 3, h - 175, 6, 14);

  ctx.restore();
}

// palette + roof silhouette per district, so placeholders read as distinct
// neighborhoods even before real art replaces them (see DISTRICTS above)
const DISTRICT_HOUSE_SCHEMES = [
  { // suburbia — brick/cottage/ranch, gable roofs
    roofStyle: 'gable',
    schemes: [
      { wall: '#c46d5e', roof: '#7a3b2e', door: '#3d2b1f' },
      { wall: '#6d8fc4', roof: '#33456b', door: '#22304d' },
      { wall: '#b8b0a1', roof: '#5d5d6e', door: '#4a3b2a' },
    ],
  },
  { // downtown — brownstone/rowhouse, flat parapet roofs
    roofStyle: 'flat',
    schemes: [
      { wall: '#8b5a44', roof: '#3a2a22', door: '#241a14' },
      { wall: '#a9906f', roof: '#4a3f2e', door: '#2c2419' },
      { wall: '#6b6f76', roof: '#2e3136', door: '#1c1e21' },
    ],
  },
  { // beachfront — pastel bungalows, low gable roofs
    roofStyle: 'gable',
    schemes: [
      { wall: '#8fd0d8', roof: '#e8845a', door: '#3d6b6f' },
      { wall: '#f4c98a', roof: '#5a8fa8', door: '#2e4a56' },
      { wall: '#f2eee0', roof: '#e37b6b', door: '#4a3b2a' },
    ],
  },
  { // snowy suburb — cool chalet tones, gable roofs with a snow cap
    roofStyle: 'snowy',
    schemes: [
      { wall: '#e7edf2', roof: '#54607a', door: '#3a2c22' },
      { wall: '#c9d6e0', roof: '#7a3b3b', door: '#2c2419' },
      { wall: '#b8c4cc', roof: '#3d4a5c', door: '#241a14' },
    ],
  },
];

function drawHouse(ctx, w, h, variant, subscriber, district = 0) {
  const d = DISTRICT_HOUSE_SCHEMES[district] || DISTRICT_HOUSE_SCHEMES[0];
  const s = d.schemes[variant];
  const wallTop = h * 0.34;
  // walls
  ctx.fillStyle = subscriber ? s.wall : shade(s.wall, -30);
  ctx.fillRect(w * 0.08, wallTop, w * 0.84, h - wallTop);
  // roof
  ctx.fillStyle = subscriber ? s.roof : shade(s.roof, -25);
  if (d.roofStyle === 'flat') {
    ctx.fillRect(w * 0.04, wallTop - h * 0.08, w * 0.92, h * 0.1);
  } else {
    ctx.beginPath();
    ctx.moveTo(0, wallTop + 6);
    ctx.lineTo(w / 2, 4);
    ctx.lineTo(w, wallTop + 6);
    ctx.closePath();
    ctx.fill();
    if (d.roofStyle === 'snowy') {
      ctx.fillStyle = '#f4f9ff';
      ctx.beginPath();
      ctx.moveTo(w * 0.14, wallTop + 4);
      ctx.lineTo(w / 2, h * 0.12);
      ctx.lineTo(w * 0.86, wallTop + 4);
      ctx.lineTo(w * 0.8, wallTop + 8);
      ctx.lineTo(w / 2, h * 0.19);
      ctx.lineTo(w * 0.2, wallTop + 8);
      ctx.closePath();
      ctx.fill();
    }
  }
  // door
  ctx.fillStyle = s.door;
  rr(ctx, w * 0.42, h * 0.62, w * 0.16, h * 0.38, 4); ctx.fill();
  // windows — lit for subscribers, dark otherwise
  ctx.fillStyle = subscriber ? '#ffd23f' : '#20242e';
  const wy = h * 0.46, ww = w * 0.16, wh = h * 0.17;
  rr(ctx, w * 0.15, wy, ww, wh, 3); ctx.fill();
  rr(ctx, w * 0.69, wy, ww, wh, 3); ctx.fill();
  ctx.strokeStyle = subscriber ? '#b98a00' : '#0e1016';
  ctx.lineWidth = 2;
  [0.15, 0.69].forEach(fx => {
    ctx.strokeRect(w * fx, wy, ww, wh);
    ctx.beginPath();
    ctx.moveTo(w * fx + ww / 2, wy); ctx.lineTo(w * fx + ww / 2, wy + wh);
    ctx.moveTo(w * fx, wy + wh / 2); ctx.lineTo(w * fx + ww, wy + wh / 2);
    ctx.stroke();
  });
  // porch light for subscribers
  if (subscriber) {
    ctx.fillStyle = '#fff3b0';
    ctx.beginPath();
    ctx.arc(w * 0.5, h * 0.585, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `rgb(${r},${g},${b})`;
}

function drawMailbox(ctx, w, h, hit) {
  ctx.fillStyle = '#7a5c3e';
  ctx.fillRect(w / 2 - 5, h * 0.42, 10, h * 0.58);
  ctx.fillStyle = hit ? '#7bff9b' : '#3a6ea5';
  rr(ctx, w * 0.12, h * 0.12, w * 0.76, h * 0.34, 10); ctx.fill();
  ctx.fillStyle = '#d1495b'; // flag
  ctx.fillRect(w * 0.8, h * 0.02, 5, h * 0.22);
  ctx.fillRect(w * 0.8, h * 0.02, 14, 8);
  if (hit) { // paper sticking out
    ctx.fillStyle = '#f5f0e6';
    rr(ctx, w * 0.3, h * 0.2, w * 0.4, h * 0.16, 4); ctx.fill();
  }
}

function drawPaper(ctx, w, h) {
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(0.5);
  ctx.fillStyle = '#f5f0e6';
  rr(ctx, -w * 0.38, -h * 0.2, w * 0.76, h * 0.4, 6); ctx.fill();
  ctx.strokeStyle = '#b9b2a3';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-w * 0.3, 0); ctx.lineTo(w * 0.3, 0);
  ctx.stroke();
  ctx.restore();
}

function drawBundle(ctx, w, h) {
  ctx.fillStyle = '#f5f0e6';
  rr(ctx, 4, h * 0.35, w - 8, h * 0.6, 5); ctx.fill();
  ctx.fillStyle = '#e4dccb';
  rr(ctx, 8, h * 0.15, w - 16, h * 0.35, 5); ctx.fill();
  ctx.strokeStyle = '#d1495b';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(w / 2, 2); ctx.lineTo(w / 2, h - 2);
  ctx.moveTo(6, h / 2); ctx.lineTo(w - 6, h / 2);
  ctx.stroke();
}

// parked car, rear view
function drawCar(ctx, w, h) {
  ctx.fillStyle = '#1a1a1a';
  rr(ctx, w * 0.06, h * 0.72, w * 0.2, h * 0.26, 6); ctx.fill();
  rr(ctx, w * 0.74, h * 0.72, w * 0.2, h * 0.26, 6); ctx.fill();
  ctx.fillStyle = '#9b2f43';
  rr(ctx, 0, h * 0.38, w, h * 0.5, 14); ctx.fill();
  ctx.fillStyle = '#7c2436';
  rr(ctx, w * 0.12, h * 0.05, w * 0.76, h * 0.45, 16); ctx.fill();
  ctx.fillStyle = '#aac6e8';
  rr(ctx, w * 0.2, h * 0.12, w * 0.6, h * 0.28, 8); ctx.fill();
  ctx.fillStyle = '#ff5555'; // tail lights
  rr(ctx, w * 0.05, h * 0.48, w * 0.14, h * 0.12, 4); ctx.fill();
  rr(ctx, w * 0.81, h * 0.48, w * 0.14, h * 0.12, 4); ctx.fill();
  ctx.fillStyle = '#ddd'; // plate
  rr(ctx, w * 0.4, h * 0.55, w * 0.2, h * 0.12, 3); ctx.fill();
}

function drawDog(ctx, w, h, frame) {
  ctx.fillStyle = '#8a6642';
  rr(ctx, w * 0.18, h * 0.3, w * 0.58, h * 0.36, 12); ctx.fill(); // body
  ctx.beginPath(); // head
  ctx.arc(w * 0.82, h * 0.32, w * 0.14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#6e4f30'; // ear + tail
  rr(ctx, w * 0.86, h * 0.14, w * 0.08, h * 0.18, 4); ctx.fill();
  ctx.save();
  ctx.translate(w * 0.18, h * 0.34);
  ctx.rotate(frame ? -0.5 : -0.9);
  rr(ctx, -w * 0.05, -h * 0.22, w * 0.08, h * 0.24, 4); ctx.fill();
  ctx.restore();
  // legs alternate between frames
  ctx.fillStyle = '#8a6642';
  const legY = h * 0.58, legH = h * 0.4;
  const off = frame ? 6 : -6;
  ctx.fillRect(w * 0.24 + off, legY, 9, legH);
  ctx.fillRect(w * 0.36 - off, legY, 9, legH);
  ctx.fillRect(w * 0.56 + off, legY, 9, legH);
  ctx.fillRect(w * 0.68 - off, legY, 9, legH);
  // snout + eye
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath(); ctx.arc(w * 0.94, h * 0.34, 4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(w * 0.85, h * 0.27, 3, 0, Math.PI * 2); ctx.fill();
}

function drawBin(ctx, w, h) {
  ctx.fillStyle = '#5d6d7e';
  ctx.beginPath();
  ctx.moveTo(w * 0.14, h * 0.18);
  ctx.lineTo(w * 0.86, h * 0.18);
  ctx.lineTo(w * 0.78, h);
  ctx.lineTo(w * 0.22, h);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#48586a';
  rr(ctx, w * 0.06, h * 0.06, w * 0.88, h * 0.16, 6); ctx.fill();
  ctx.strokeStyle = '#3d4b5c';
  ctx.lineWidth = 3;
  for (let i = 1; i <= 3; i++) {
    const x = w * 0.14 + (w * 0.72 * i) / 4;
    ctx.beginPath(); ctx.moveTo(x, h * 0.26); ctx.lineTo(x, h * 0.94); ctx.stroke();
  }
}

function drawDrain(ctx, w, h) {
  ctx.fillStyle = '#23262e';
  rr(ctx, 0, h * 0.2, w, h * 0.8, 6); ctx.fill();
  ctx.fillStyle = '#0d0f14';
  const slots = 5;
  for (let i = 0; i < slots; i++) {
    rr(ctx, w * 0.08 + (w * 0.84 * i) / slots + 3, h * 0.35, (w * 0.84) / slots - 8, h * 0.5, 3);
    ctx.fill();
  }
}

// simple pedestrian; pose 0/1 = walk frames, 2 = bonked
function drawPed(ctx, w, h, pose) {
  const cx = w / 2;
  ctx.fillStyle = '#c23b3b'; // jumper
  rr(ctx, cx - 16, h * 0.28, 32, h * 0.3, 8); ctx.fill();
  ctx.fillStyle = '#3a6ea5'; // legs
  const off = pose === 1 ? 10 : pose === 0 ? -10 : 0;
  ctx.fillRect(cx - 12 + (pose === 2 ? 0 : off / 2), h * 0.56, 10, h * 0.4);
  ctx.fillRect(cx + 2 - (pose === 2 ? 0 : off / 2), h * 0.56, 10, h * 0.4);
  ctx.fillStyle = '#e8b88a'; // head
  ctx.beginPath();
  ctx.arc(cx, h * 0.17, h * 0.11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#5b3a1e';
  ctx.beginPath();
  ctx.arc(cx, h * 0.13, h * 0.1, Math.PI, 0);
  ctx.fill();
  if (pose === 2) { // hands on head + stars
    ctx.strokeStyle = '#e8b88a';
    ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(cx - 18, h * 0.34); ctx.lineTo(cx - 8, h * 0.09); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + 18, h * 0.34); ctx.lineTo(cx + 8, h * 0.09); ctx.stroke();
    ctx.fillStyle = '#ffd23f';
    ctx.font = `bold ${h * 0.12}px monospace`;
    ctx.fillText('*', cx - 22, h * 0.06);
    ctx.fillText('*', cx + 14, h * 0.08);
  } else { // swinging arms
    ctx.strokeStyle = '#c23b3b';
    ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(cx - 14, h * 0.32); ctx.lineTo(cx - 14 - off / 2, h * 0.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + 14, h * 0.32); ctx.lineTo(cx + 14 + off / 2, h * 0.5); ctx.stroke();
  }
}

// sky gradient + skyline silhouette + foreground dressing per district, so
// the placeholder reads as a distinct neighborhood before real art lands
const DISTRICT_SKY_SCHEMES = [
  { // suburbia — dusk over a distant city, tree line up front
    sky: ['#1c2e5e', '#4a5d9e', '#c98a5b'], sun: { color: '#ffd97a', x: 0.72, y: 0.78, r: 0.16 },
    building: '#151b33', lit: ['#ffd23f'], bhMin: 0.25, bhMax: 0.75, gap: 20, foreground: 'trees',
  },
  { // downtown — denser, taller skyline with neon-lit windows, lamp posts up front
    sky: ['#241a3d', '#4a2f6e', '#d1548a'], sun: { color: '#f2a8c8', x: 0.66, y: 0.7, r: 0.09 },
    building: '#12101f', lit: ['#ffd23f', '#5fe0e8', '#ff7ab8'], bhMin: 0.4, bhMax: 0.95, gap: 8, foreground: 'lamps',
  },
  { // beachfront — warm sunset over water, low boardwalk silhouette, palm trees up front
    sky: ['#2b4a6b', '#e8845a', '#ffdfa0'], sun: { color: '#fff0c2', x: 0.5, y: 0.82, r: 0.22 },
    building: '#2e4a56', lit: ['#ffe9b0'], bhMin: 0.1, bhMax: 0.26, gap: 46, foreground: 'palms',
  },
  { // snowy suburb — cold blue dusk, low mountains instead of buildings, pines up front
    sky: ['#0f1b33', '#2c3f66', '#7a8fae'], sun: { color: '#d9e6ff', x: 0.78, y: 0.7, r: 0.1 },
    building: '#1c2740', lit: ['#ffe9b0'], bhMin: 0.3, bhMax: 0.55, gap: 34, foreground: 'pines',
  },
];

function drawSkyline(ctx, w, h, district = 0) {
  const s = DISTRICT_SKY_SCHEMES[district] || DISTRICT_SKY_SCHEMES[0];
  const grd = ctx.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, s.sky[0]);
  grd.addColorStop(0.7, s.sky[1]);
  grd.addColorStop(1, s.sky[2]);
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, w, h);
  // sun/moon low on the horizon
  ctx.fillStyle = s.sun.color;
  ctx.beginPath(); ctx.arc(w * s.sun.x, h * s.sun.y, h * s.sun.r, 0, Math.PI * 2); ctx.fill();
  // distant buildings / mountains
  ctx.fillStyle = s.building;
  let x = 0;
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  while (x < w) {
    const bw = 30 + rand() * 70;
    const bh = h * (s.bhMin + rand() * (s.bhMax - s.bhMin));
    if (district === 3) { // jagged mountain peak instead of a rectangular building
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.lineTo(x + bw * 0.5, h - bh);
      ctx.lineTo(x + bw, h);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillRect(x, h - bh, bw, bh);
    }
    // lit windows
    for (let i = 0; i < bw * bh * 0.001; i++) {
      ctx.fillStyle = s.lit[Math.floor(rand() * s.lit.length)];
      ctx.fillRect(x + 4 + rand() * (bw - 10), h - bh + 4 + rand() * (bh - 12), 3, 4);
    }
    ctx.fillStyle = s.building;
    x += bw + 4 + rand() * s.gap;
  }
  // foreground dressing
  if (s.foreground === 'trees') {
    ctx.fillStyle = '#0f2417';
    for (let tx = 10; tx < w; tx += 26) {
      ctx.beginPath();
      ctx.arc(tx, h - 6, 14 + (tx % 3) * 4, Math.PI, 0);
      ctx.fill();
    }
  } else if (s.foreground === 'lamps') {
    for (let tx = 14; tx < w; tx += 60) {
      ctx.fillStyle = '#0c0a14';
      ctx.fillRect(tx - 2, h - 34, 4, 34);
      ctx.fillStyle = '#ffe9a8';
      ctx.beginPath(); ctx.arc(tx, h - 36, 5, 0, Math.PI * 2); ctx.fill();
    }
  } else if (s.foreground === 'palms') {
    for (let tx = 20; tx < w; tx += 90) {
      ctx.strokeStyle = '#1d2b2e';
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(tx, h); ctx.quadraticCurveTo(tx + 8, h - 24, tx, h - 42); ctx.stroke();
      ctx.fillStyle = '#1d2b2e';
      for (let f = 0; f < 5; f++) {
        const a = (f / 4) * Math.PI - Math.PI * 0.5;
        ctx.beginPath();
        ctx.moveTo(tx, h - 42);
        ctx.quadraticCurveTo(tx + Math.cos(a) * 18, h - 42 + Math.sin(a) * 10 - 10, tx + Math.cos(a) * 30, h - 42 + Math.sin(a) * 18);
        ctx.stroke();
      }
    }
  } else if (s.foreground === 'pines') {
    for (let tx = 8; tx < w; tx += 30) {
      const th = 22 + (tx % 3) * 6;
      ctx.fillStyle = '#0d1f14';
      ctx.beginPath();
      ctx.moveTo(tx, h);
      ctx.lineTo(tx + 9, h - th);
      ctx.lineTo(tx + 18, h);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#e8f0fa';
      ctx.beginPath();
      ctx.moveTo(tx + 5, h - th * 0.55);
      ctx.lineTo(tx + 9, h - th);
      ctx.lineTo(tx + 13, h - th * 0.55);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function drawLogo(ctx, w, h) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const line = (text, y, size) => {
    ctx.font = `bold ${size}px 'Courier New', monospace`;
    ctx.fillStyle = '#2b1740';
    ctx.fillText(text, w / 2 + 6, y + 6);
    ctx.fillStyle = '#d1495b';
    ctx.fillText(text, w / 2 + 3, y + 3);
    ctx.fillStyle = '#ffd23f';
    ctx.fillText(text, w / 2, y);
  };
  line('PAPEROO', h * 0.5, h * 0.3);
  // little flying paper
  ctx.save();
  ctx.translate(w * 0.86, h * 0.16);
  ctx.rotate(0.4);
  ctx.fillStyle = '#f5f0e6';
  rr(ctx, -22, -10, 44, 20, 5); ctx.fill();
  ctx.restore();
}
