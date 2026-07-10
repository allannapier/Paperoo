/*
 * Paper Person — pseudo-3D delivery game.
 *
 * World space: x = lateral (units, 0 = road centre), y = height, d = distance
 * along the road. The camera sits behind the rider; entities are projected
 * with a simple perspective divide and drawn as scaled sprites, far to near.
 */

'use strict';

/* ---------- tuning ---------- */
const ROAD_HALF = 4.5;          // road half-width (world units)
const SIDEWALK = 1.6;           // sidewalk width beyond the road
const HOUSE_X = 9.2;            // house centre distance from road centre
const MAILBOX_X = 6.4;          // mailbox distance from road centre
const PLAYER_Z = 5.2;           // z at which the rider is drawn
const DRAW_FAR = 90;            // draw distance
const BASE_SPEED = 10;          // units/sec
const MAX_SPEED = 22;
const SPEED_RAMP = 0.09;        // speed gained per second
const STEER_RATE = 6.5;         // lateral units/sec while steering
const PLAYER_MAX_X = 3.6;
const GRAVITY = 13;
const START_PAPERS = 10;
const MAX_PAPERS = 20;
const START_LIVES = 3;

/* ---------- canvas / layout ---------- */
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlayText = document.getElementById('overlayText');
const overlayPrompt = document.getElementById('overlayPrompt');
const logoImg = document.getElementById('logoImg');

let W = 0, H = 0; // css pixels

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  W = rect.width;
  H = rect.height;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);

/* ---------- camera / projection ---------- */
const cam = { h: 2.4, f: 0, horizon: 0 };

function updateCamera() {
  cam.f = H * 1.05;
  cam.horizon = H * 0.30;
}

// The camera tracks the rider laterally so she never leaves the screen;
// camX trails player.x, and everything is projected relative to it.
let camX = 0;

// project world point (x, y, z-ahead-of-camera) to screen; s = px per world unit
function project(x, y, z) {
  const s = cam.f / z;
  return { x: W / 2 + (x - camX) * s, y: cam.horizon + (cam.h - y) * s, s };
}

/* ---------- audio (tiny synth, no files) ---------- */
const AudioFX = {
  ctx: null,
  init() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },
  tone(freq, dur, type = 'square', vol = 0.12, slide = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.ctx.destination);
    o.start(t);
    o.stop(t + dur);
  },
  noise(dur, vol = 0.2) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    const g = this.ctx.createGain();
    src.buffer = buf;
    g.gain.value = vol;
    src.connect(g).connect(this.ctx.destination);
    src.start(t);
  },
  throwSfx() { this.noise(0.12, 0.1); this.tone(700, 0.1, 'triangle', 0.06, -400); },
  deliverSfx() { this.tone(660, 0.09, 'square', 0.1); setTimeout(() => this.tone(990, 0.14, 'square', 0.1), 90); },
  smashSfx() { this.noise(0.25, 0.22); this.tone(220, 0.2, 'sawtooth', 0.08, -150); },
  crashSfx() { this.noise(0.45, 0.3); this.tone(120, 0.4, 'sawtooth', 0.15, -80); },
  pickupSfx() { this.tone(440, 0.08, 'square', 0.1, 220); setTimeout(() => this.tone(880, 0.1, 'square', 0.1), 70); },
  missSfx() { this.tone(200, 0.2, 'sawtooth', 0.08, -100); },
};

/* ---------- game state ---------- */
let sprites = null;
const game = {
  mode: 'title', // title | playing | gameover
  dist: 0,
  speed: BASE_SPEED,
  player: { x: 0, steer: 0 },
  papers: START_PAPERS,
  lives: START_LIVES,
  score: 0,
  streak: 0,
  invuln: 0,
  shake: 0,
  time: 0,
  entities: [],   // houses, mailboxes, obstacles, bundles
  thrown: [],     // papers in flight
  popups: [],
  nextHouseD: [40, 47],   // per side [left, right]
  nextObstacleD: 40,
  nextBundleD: 120,
  best: Number(localStorage.getItem('paperperson_best') || 0),
};

function resetGame() {
  game.dist = 0;
  game.speed = BASE_SPEED;
  game.player.x = 0;
  game.player.steer = 0;
  camX = 0;
  game.papers = START_PAPERS;
  game.lives = START_LIVES;
  game.score = 0;
  game.streak = 0;
  game.invuln = 0;
  game.shake = 0;
  game.entities = [];
  game.thrown = [];
  game.popups = [];
  game.nextHouseD = [40, 47];
  game.nextObstacleD = 40;
  game.nextBundleD = 120;
}

const mult = () => 1 + Math.min(4, Math.floor(game.streak / 3));

/* ---------- spawning ---------- */
function spawnAhead() {
  const horizonD = game.dist + DRAW_FAR;
  // houses, one queue per side
  for (let side = 0; side < 2; side++) {
    while (game.nextHouseD[side] < horizonD) {
      const sub = Math.random() < 0.55;
      const variant = 1 + Math.floor(Math.random() * 3);
      const sign = side === 0 ? -1 : 1;
      const d = game.nextHouseD[side];
      game.entities.push({
        kind: 'house', side: sign, variant, sub, delivered: false, missed: false,
        d, x: sign * HOUSE_X, wW: 7.4, wH: 6.6,
      });
      if (sub) {
        game.entities.push({ kind: 'mailbox', side: sign, d: d - 1.2, x: sign * MAILBOX_X, wW: 0.85, wH: 1.55, hit: false });
      }
      game.nextHouseD[side] = d + 12 + Math.random() * 7;
    }
  }
  // obstacles
  while (game.nextObstacleD < horizonD) {
    const r = Math.random();
    const d = game.nextObstacleD;
    if (r < 0.3) {
      const side = Math.random() < 0.5 ? -1 : 1;
      game.entities.push({ kind: 'car', d, x: side * (ROAD_HALF - 1.3), wW: 2.4, wH: 1.8 });
    } else if (r < 0.55) {
      game.entities.push({ kind: 'dog', d, x: (Math.random() * 2 - 1) * 3, wW: 1.3, wH: 1.0, t: Math.random() * 10 });
    } else if (r < 0.8) {
      game.entities.push({ kind: 'bin', d, x: (Math.random() < 0.5 ? -1 : 1) * (ROAD_HALF - 0.7), wW: 0.9, wH: 1.25 });
    } else {
      game.entities.push({ kind: 'drain', d, x: (Math.random() * 2 - 1) * 3, wW: 1.7, wH: 0.5 });
    }
    // spacing tightens as speed rises
    const gap = 26 - (game.speed - BASE_SPEED) * 1.1;
    game.nextObstacleD = d + gap * (0.6 + Math.random() * 0.8);
  }
  // paper bundles
  while (game.nextBundleD < horizonD) {
    game.entities.push({ kind: 'bundle', d: game.nextBundleD, x: (Math.random() * 2 - 1) * 3, wW: 1.0, wH: 0.7 });
    game.nextBundleD += 90 + Math.random() * 60;
  }
}

/* ---------- actions ---------- */
function throwPaper(dir) { // dir: -1 left, +1 right
  if (game.mode !== 'playing') return;
  if (game.papers <= 0) {
    addPopup('NO PAPERS!', W / 2, H * 0.5, '#ff8080');
    AudioFX.missSfx();
    return;
  }
  game.papers--;
  game.thrown.push({
    x: game.player.x, y: 1.3, d: game.dist,
    vx: dir * 8.5, vy: 5.0, vz: game.speed + 8,
    spin: Math.random() * Math.PI,
  });
  AudioFX.throwSfx();
}

function addPopup(text, sx, sy, color) {
  game.popups.push({ text, x: sx, y: sy, color, t: 0 });
}

function crash() {
  if (game.invuln > 0) return;
  game.lives--;
  game.streak = 0;
  game.invuln = 2.2;
  game.shake = 0.5;
  game.speed = BASE_SPEED;
  AudioFX.crashSfx();
  addPopup('CRASH!', W / 2, H * 0.45, '#ff5555');
  if (game.lives <= 0) endGame();
}

function endGame() {
  game.mode = 'gameover';
  if (game.score > game.best) {
    game.best = game.score;
    localStorage.setItem('paperperson_best', String(game.best));
  }
  overlayTitle.style.display = '';
  overlayTitle.textContent = 'GAME OVER';
  logoImg.style.display = 'none';
  overlayText.textContent = `SCORE ${game.score}\nBEST ${game.best}`;
  overlayPrompt.textContent = 'TAP TO RIDE AGAIN';
  overlay.classList.remove('hidden');
}

function startGame() {
  resetGame();
  game.mode = 'playing';
  overlay.classList.add('hidden');
}

/* ---------- delivery resolution ---------- */
function paperLands(p) {
  const px = p.x, pd = p.d;
  // landed on/near a subscriber mailbox or porch?
  let scored = false;
  for (const e of game.entities) {
    if (e.kind === 'house' && e.sub && !e.delivered && Math.sign(px) === e.side) {
      if (Math.abs(e.d - pd) < 4.5 && Math.abs(px) > ROAD_HALF && Math.abs(px) < HOUSE_X + 3.5) {
        e.delivered = true;
        const mb = game.entities.find(m => m.kind === 'mailbox' && m.side === e.side && Math.abs(m.d - (e.d - 1.2)) < 0.1);
        const nearBox = mb && Math.hypot(px - mb.x, pd - mb.d) < 2.0;
        if (nearBox) mb.hit = true;
        game.streak++;
        const pts = (nearBox ? 250 : 100) * mult();
        game.score += pts;
        const proj = project(px, 0.5, e.d - game.dist + PLAYER_Z);
        addPopup(nearBox ? `MAILBOX! +${pts}` : `+${pts}`, proj.x, proj.y, '#7bff9b');
        AudioFX.deliverSfx();
        scored = true;
        break;
      }
    }
    // window smash on non-subscribers, classic style
    if (e.kind === 'house' && !e.sub && !e.delivered && Math.sign(px) === e.side) {
      if (Math.abs(e.d - pd) < 3.5 && Math.abs(px) > HOUSE_X - 3.5) {
        e.delivered = true; // one smash per house
        const pts = 50;
        game.score += pts;
        const proj = project(px, 1.5, e.d - game.dist + PLAYER_Z);
        addPopup(`SMASH! +${pts}`, proj.x, proj.y, '#ffd23f');
        AudioFX.smashSfx();
        scored = true;
        break;
      }
    }
  }
  if (!scored) {
    const proj = project(px, 0, pd - game.dist + PLAYER_Z);
    if (proj.s > 0) addPopup('miss', proj.x, proj.y, '#8888aa');
  }
}

/* ---------- update ---------- */
function update(dt) {
  game.time += dt;
  if (game.mode !== 'playing') return;

  game.speed = Math.min(MAX_SPEED, game.speed + SPEED_RAMP * dt);
  game.dist += game.speed * dt;
  game.invuln = Math.max(0, game.invuln - dt);
  game.shake = Math.max(0, game.shake - dt);

  // steering
  game.player.x += game.player.steer * STEER_RATE * dt;
  game.player.x = Math.max(-PLAYER_MAX_X, Math.min(PLAYER_MAX_X, game.player.x));
  camX = game.player.x * 0.85;

  spawnAhead();

  // entity behaviour + collisions + missed-delivery detection
  for (const e of game.entities) {
    if (e.kind === 'dog') {
      e.t += dt;
      const rel = e.d - game.dist;
      if (rel < 30 && rel > 0) {
        // wanders toward the rider's lane, facing the way it runs
        const dir = Math.sign(game.player.x - e.x);
        if (dir !== 0) e.facing = dir;
        e.x += dir * 1.1 * dt;
        e.x = Math.max(-ROAD_HALF + 0.5, Math.min(ROAD_HALF - 0.5, e.x));
      }
    }
    if ((e.kind === 'car' || e.kind === 'dog' || e.kind === 'bin' || e.kind === 'drain') &&
        Math.abs(e.d - game.dist) < 0.9 &&
        Math.abs(e.x - game.player.x) < e.wW / 2 + 0.55) {
      crash();
    }
    if (e.kind === 'bundle' && !e.taken &&
        Math.abs(e.d - game.dist) < 1.0 &&
        Math.abs(e.x - game.player.x) < 1.3) {
      e.taken = true;
      game.papers = Math.min(MAX_PAPERS, game.papers + 5);
      addPopup('+5 PAPERS', W / 2, H * 0.5, '#7bd6ff');
      AudioFX.pickupSfx();
    }
    if (e.kind === 'house' && e.sub && !e.delivered && !e.missed && e.d < game.dist - 2) {
      e.missed = true;
      game.streak = 0;
      addPopup('MISSED HOUSE', W / 2, H * 0.4, '#ff9955');
      AudioFX.missSfx();
    }
  }

  // papers in flight
  for (let i = game.thrown.length - 1; i >= 0; i--) {
    const p = game.thrown[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.d += p.vz * dt;
    p.vy -= GRAVITY * dt;
    p.spin += 9 * dt;
    if (p.y <= 0) {
      game.thrown.splice(i, 1);
      paperLands(p);
    }
  }

  // cull entities behind the camera
  game.entities = game.entities.filter(e => e.d > game.dist - PLAYER_Z);

  // popups
  for (let i = game.popups.length - 1; i >= 0; i--) {
    const pp = game.popups[i];
    pp.t += dt;
    if (pp.t > 1.2) game.popups.splice(i, 1);
  }
}

/* ---------- render ---------- */
function spriteFor(e) {
  switch (e.kind) {
    case 'house': return sprites[`house${e.variant}_${e.sub ? 'sub' : 'nosub'}`];
    case 'mailbox': return e.hit ? sprites.mailbox_hit : sprites.mailbox;
    case 'car': return sprites.car;
    case 'dog': return Math.floor(e.t / 0.16) % 2 ? sprites.dog2 : sprites.dog1;
    case 'bin': return sprites.bin;
    case 'drain': return sprites.drain;
    case 'bundle': return sprites.bundle;
  }
}

function render() {
  updateCamera();
  ctx.save();
  if (game.shake > 0) {
    ctx.translate((Math.random() - 0.5) * 14 * game.shake, (Math.random() - 0.5) * 10 * game.shake);
  }

  // sky + skyline strip (slight parallax against steering)
  ctx.fillStyle = skyTopColor;
  ctx.fillRect(-20, -20, W + 40, cam.horizon + 20);
  const sk = sprites.skyline;
  const skH = Math.min(cam.horizon * 0.85, 200);
  const skW = skH * (sk.width / sk.height);
  const par = -camX * 14;
  for (let x = ((par % skW) + skW) % skW - skW; x < W + skW; x += skW) {
    ctx.drawImage(sk, x, cam.horizon - skH + 2, skW, skH);
  }

  // grass
  ctx.fillStyle = '#2e7d43';
  ctx.fillRect(-20, cam.horizon, W + 40, H - cam.horizon + 20);

  const zNear = Math.max(1.6, (cam.h * cam.f) / (H - cam.horizon) * 0.9);

  // sidewalk then road (drawn as full trapezoids; road is straight)
  const quad = (x1, x2, color) => {
    const f1 = project(x1, 0, DRAW_FAR), f2 = project(x2, 0, DRAW_FAR);
    const n1 = project(x1, 0, zNear), n2 = project(x2, 0, zNear);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(f1.x, f1.y); ctx.lineTo(f2.x, f2.y);
    ctx.lineTo(n2.x, n2.y); ctx.lineTo(n1.x, n1.y);
    ctx.closePath();
    ctx.fill();
  };
  quad(-ROAD_HALF - SIDEWALK, ROAD_HALF + SIDEWALK, '#8a8a96');
  quad(-ROAD_HALF, ROAD_HALF, '#3c3c46');
  quad(-ROAD_HALF - 0.18, -ROAD_HALF + 0.18, '#d8d8dc');
  quad(ROAD_HALF - 0.18, ROAD_HALF + 0.18, '#d8d8dc');

  // scrolling centre dashes
  ctx.fillStyle = '#e8d44d';
  const step = 6;
  for (let d = Math.floor((game.dist + zNear) / step) * step; d < game.dist + DRAW_FAR; d += step) {
    const z1 = d - game.dist, z2 = z1 + 2.4;
    if (z1 < zNear || z2 > DRAW_FAR) continue;
    const a = project(-0.14, 0, z2), b = project(0.14, 0, z2);
    const c2 = project(0.14, 0, z1), d2 = project(-0.14, 0, z1);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c2.x, c2.y); ctx.lineTo(d2.x, d2.y);
    ctx.closePath();
    ctx.fill();
  }

  // entities far -> near
  const drawList = game.entities
    .map(e => ({ e, z: e.d - game.dist + PLAYER_Z }))
    .filter(o => o.z > zNear && o.z < DRAW_FAR && !(o.e.kind === 'bundle' && o.e.taken));
  drawList.sort((a, b) => b.z - a.z);
  for (const { e, z } of drawList) {
    const img = spriteFor(e);
    if (!img) continue;
    const p = project(e.x, 0, z);
    const dw = e.wW * p.s;
    // height follows the sprite's aspect so real art is never distorted
    // (wH remains the nominal height for placeholders' proportions)
    const dh = dw * (img.height / img.width);
    // faint fade-in at the horizon
    ctx.globalAlpha = Math.min(1, (DRAW_FAR - z) / 12);
    if (e.kind === 'dog' && e.facing < 0) {
      // dog art faces right; mirror it when running left
      ctx.save();
      ctx.translate(p.x, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, -dw / 2, p.y - dh, dw, dh);
      ctx.restore();
    } else {
      ctx.drawImage(img, p.x - dw / 2, p.y - dh, dw, dh);
    }
    ctx.globalAlpha = 1;
  }

  // papers in flight
  for (const p of game.thrown) {
    const z = p.d - game.dist + PLAYER_Z;
    if (z <= zNear) continue;
    const pr = project(p.x, p.y, z);
    const size = 0.42 * pr.s;
    ctx.save();
    ctx.translate(pr.x, pr.y);
    ctx.rotate(p.spin);
    ctx.drawImage(sprites.paper, -size / 2, -size / 2, size, size);
    ctx.restore();
    // shadow on the ground
    const sh = project(p.x, 0, z);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(sh.x, sh.y, size * 0.4, size * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // rider (blinks while invulnerable)
  if (game.mode !== 'title' && (game.invuln <= 0 || Math.floor(game.time * 10) % 2 === 0)) {
    const key = game.player.steer < 0 ? 'player_left' : game.player.steer > 0 ? 'player_right' : 'player_straight';
    const img = sprites[key];
    const p = project(game.player.x, 0, PLAYER_Z);
    // fixed world height; width follows the sprite's aspect ratio
    const dh = 2.2 * p.s;
    const dw = dh * (img.width / img.height);
    // bob with speed
    const bob = Math.sin(game.time * 9) * 0.012 * p.s;
    ctx.drawImage(img, p.x - dw / 2, p.y - dh + bob, dw, dh);
  }

  // popups
  ctx.textAlign = 'center';
  for (const pp of game.popups) {
    ctx.globalAlpha = Math.max(0, 1 - pp.t / 1.2);
    ctx.font = `bold ${Math.max(16, W * 0.045)}px 'Courier New', monospace`;
    ctx.fillStyle = '#000';
    ctx.fillText(pp.text, pp.x + 2, pp.y - pp.t * 40 + 2);
    ctx.fillStyle = pp.color;
    ctx.fillText(pp.text, pp.x, pp.y - pp.t * 40);
    ctx.globalAlpha = 1;
  }

  renderHUD();
  ctx.restore();
}

function renderHUD() {
  if (game.mode === 'title') return;
  const fs = Math.max(14, Math.min(22, W * 0.04));
  ctx.font = `bold ${fs}px 'Courier New', monospace`;
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, 0, W, fs * 2.4);
  ctx.fillStyle = '#fff';
  ctx.fillText(`SCORE ${game.score}`, 10, fs * 1.4);
  if (mult() > 1) {
    ctx.fillStyle = '#7bff9b';
    ctx.fillText(`x${mult()}`, 10 + ctx.measureText(`SCORE ${game.score}`).width + 12, fs * 1.4);
  }
  // lives
  ctx.fillStyle = '#ff5f7a';
  let hx = W / 2 - (game.lives * fs) / 2;
  for (let i = 0; i < game.lives; i++) {
    heart(hx + i * fs + fs / 2, fs * 1.15, fs * 0.42);
  }
  // paper count
  ctx.textAlign = 'right';
  ctx.fillStyle = game.papers > 0 ? '#fff' : '#ff8080';
  ctx.fillText(`\u{1F4F0} ${game.papers}`, W - 10, fs * 1.4);
}

function heart(cx, cy, r) {
  ctx.beginPath();
  ctx.moveTo(cx, cy + r);
  ctx.bezierCurveTo(cx - r * 1.4, cy, cx - r * 0.8, cy - r, cx, cy - r * 0.3);
  ctx.bezierCurveTo(cx + r * 0.8, cy - r, cx + r * 1.4, cy, cx, cy + r);
  ctx.fill();
}

/* ---------- input ---------- */
function bindHold(el, on, off) {
  const down = e => { e.preventDefault(); AudioFX.init(); on(); el.classList.add('held'); };
  const up = e => { if (e) e.preventDefault(); off(); el.classList.remove('held'); };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('pointerleave', up);
  el.addEventListener('contextmenu', e => e.preventDefault());
}

const steer = { left: false, right: false };
function applySteer() {
  game.player.steer = (steer.right ? 1 : 0) - (steer.left ? 1 : 0);
}
bindHold(document.getElementById('btnLeft'), () => { steer.left = true; applySteer(); }, () => { steer.left = false; applySteer(); });
bindHold(document.getElementById('btnRight'), () => { steer.right = true; applySteer(); }, () => { steer.right = false; applySteer(); });
bindHold(document.getElementById('btnThrowL'), () => throwPaper(-1), () => {});
bindHold(document.getElementById('btnThrowR'), () => throwPaper(1), () => {});

window.addEventListener('keydown', e => {
  if (e.repeat) return;
  AudioFX.init();
  switch (e.code) {
    case 'ArrowLeft': case 'KeyA': steer.left = true; applySteer(); break;
    case 'ArrowRight': case 'KeyD': steer.right = true; applySteer(); break;
    case 'KeyZ': case 'KeyJ': throwPaper(-1); break;
    case 'KeyX': case 'KeyK': throwPaper(1); break;
    case 'Space': case 'Enter':
      if (game.mode !== 'playing') startGame();
      break;
  }
});
window.addEventListener('keyup', e => {
  switch (e.code) {
    case 'ArrowLeft': case 'KeyA': steer.left = false; applySteer(); break;
    case 'ArrowRight': case 'KeyD': steer.right = false; applySteer(); break;
  }
});

overlay.addEventListener('pointerdown', e => {
  e.preventDefault();
  AudioFX.init();
  if (sprites && game.mode !== 'playing') startGame();
});

/* ---------- main loop ---------- */
let lastT = 0;
function frame(t) {
  const dt = Math.min(0.05, (t - lastT) / 1000 || 0);
  lastT = t;
  update(dt);
  render();
  requestAnimationFrame(frame);
}

// flat sky fill above the strip, sampled from the skyline art so they meet
// seamlessly whatever the strip's top color is
let skyTopColor = '#1c2e5e';

loadSprites(loaded => {
  sprites = loaded;
  const sample = document.createElement('canvas');
  sample.width = sample.height = 4;
  const sctx = sample.getContext('2d');
  sctx.drawImage(sprites.skyline, 0, 0);
  const d = sctx.getImageData(1, 1, 1, 1).data;
  skyTopColor = `rgb(${d[0]},${d[1]},${d[2]})`;
  // title logo: real image if provided, otherwise the placeholder canvas
  logoImg.src = sprites.logo instanceof HTMLImageElement ? sprites.logo.src : sprites.logo.toDataURL();
  resize();
  requestAnimationFrame(frame);
});
resize();
