/*
 * Paperoo — pseudo-3D delivery game.
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
const MAX_SPEED = 19;
const SPEED_RAMP = 0.07;        // speed gained per second
const STEER_RATE = 6.5;         // lateral units/sec while steering
const PLAYER_MAX_X = 3.6;
const GRAVITY = 18;
const THROW_APEX_VY = 3.5;      // vertical launch speed of a thrown paper
const THROW_Y0 = 1.2;           // hand height the paper leaves from
// flight time is fixed by the lob physics, so the paper can be made to land
// at a FIXED distance ahead of the throw point — where the target ring sits
const THROW_TIME = (THROW_APEX_VY + Math.sqrt(THROW_APEX_VY ** 2 + 2 * GRAVITY * THROW_Y0)) / GRAVITY;
const THROW_LEAD = 12;          // papers land this far ahead of where you threw
const START_PAPERS = 15;
const MAX_PAPERS = 30;
const START_LIVES = 3;

/* ---------- playable characters ---------- */
const CHARACTERS = [
  {
    id: 'zoe', prefix: 'player', name: 'Zoe', tagline: 'E-Scooter',
    desc: '“Rain or shine, papers fly on time.”',
    speedMult: 1.0, steerMult: 1.0, speedPips: 3, handlingPips: 4,
  },
  {
    id: 'milo', prefix: 'player2', name: 'Milo', tagline: 'Hoverboard',
    desc: '“No wheels, no rules. Just vibes and velocity.”',
    speedMult: 1.0, steerMult: 1.0, speedPips: 3, handlingPips: 4,
  },
  {
    id: 'skye', prefix: 'player3', name: 'Skye', tagline: 'Rollerblades',
    desc: '“Silent, smooth, and impossible to knock off her feet.”',
    speedMult: 0.85, steerMult: 1.25, speedPips: 2, handlingPips: 5,
  },
  {
    id: 'stan', prefix: 'player4', name: 'Grandpa Stan', tagline: 'Moped',
    desc: "Can't be bothered getting out of bed? Send Grandpa instead.",
    speedMult: 1.18, steerMult: 0.72, speedPips: 5, handlingPips: 2,
  },
];

/* ---------- canvas / layout ---------- */
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlayText = document.getElementById('overlayText');
const overlayPrompt = document.getElementById('overlayPrompt');
const logoImg = document.getElementById('logoImg');
const charSelect = document.getElementById('charSelect');
const btnThrowL = document.getElementById('btnThrowL');
const btnThrowR = document.getElementById('btnThrowR');

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
// higher camera looking over the rider's shoulder: she sits low on screen and
// the road ahead spreads out above her, so threats and houses read early
const cam = { h: 4.2, f: 0, horizon: 0 };

function updateCamera() {
  // wide-ish FOV so roadside houses/mailboxes stay on screen close to the rider
  cam.f = H * 0.8;
  cam.horizon = H * 0.26;
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
  barkSfx() { this.tone(190, 0.07, 'square', 0.14, -60); setTimeout(() => this.tone(160, 0.09, 'square', 0.12, -50), 90); },
  bonkSfx() { this.noise(0.08, 0.18); this.tone(320, 0.18, 'square', 0.14, -220); setTimeout(() => this.tone(520, 0.12, 'triangle', 0.1, 300), 140); },
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
  nextActionD: 26,        // demand director: next point needing a reaction
  lastDeliverySide: 1,
  sceneryD: [40, 47],     // per-side fill of non-subscriber houses
  ready: { '-1': false, '1': false },
  level: 1,
  lp: null,               // current level's director parameters
  target: 0,              // deliveries needed to advance
  delivered: 0,
  subsScheduled: 0,
  finishD: null,          // where this level's finish line sits
  best: Number(localStorage.getItem('paperperson_best') || 0),
  character: CHARACTERS.find(c => c.id === localStorage.getItem('paperperson_character')) || CHARACTERS[0],
};

// each level runs the director a little hotter, scaled by the rider's own
// top speed (a faster character reaches a higher ceiling at every level)
function levelParams(L, speedMult) {
  return {
    baseSpeed: Math.min(16, 9.5 + L * 1.2) * speedMult,
    maxSpeed: Math.min(20, 13 + L * 1.2) * speedMult,
    subsTotal: Math.min(24, 10 + L * 2),          // subscriber houses this level
    obstacleShare: Math.min(0.44, 0.30 + 0.02 * L),
    gapT: Math.max(1.0, 1.6 - 0.06 * L),          // seconds between demands
  };
}

function startLevel(L) {
  game.level = L;
  game.lp = levelParams(L, game.character.speedMult);
  game.target = Math.ceil(game.lp.subsTotal * 0.6);
  game.delivered = 0;
  game.subsScheduled = 0;
  game.finishD = null;
  game.dist = 0;
  game.speed = game.lp.baseSpeed;
  game.player.x = 0;
  game.player.steer = 0;
  camX = 0;
  game.papers = Math.max(game.papers, START_PAPERS);
  game.invuln = 1; // brief grace as the new street starts
  game.shake = 0;
  game.entities = [];
  game.thrown = [];
  game.popups = [];
  game.nextActionD = 26;
  game.lastDeliverySide = 1;
  game.sceneryD = [40, 47];
  game.ready = { '-1': false, '1': false };
  game.mode = 'playing';
  overlay.classList.add('hidden');
  charSelect.classList.add('hidden');
  LeaderboardUI.hide();
}

const mult = () => 1 + Math.min(4, Math.floor(game.streak / 3));

/* ---------- spawning ----------
 * A "demand director" schedules everything the player must react to — a
 * delivery moment, an obstacle to dodge, a bundle to grab — as ONE sequence
 * of action points spaced by reaction time (seconds, so the world-unit gap
 * scales with ride speed). A delivery's action point is where you THROW
 * (THROW_LEAD before the house), so deliveries and dodges never demand the
 * same instant. Non-subscriber houses are pure scenery and fill both sides
 * separately.
 */
function spawnAhead() {
  const lp = game.lp;
  const horizonD = game.dist + DRAW_FAR;
  const diff = Math.min(1, Math.max(0, (game.speed - lp.baseSpeed) / (lp.maxSpeed - lp.baseSpeed)));

  // the level's demand sequence ends at the finish line
  while (game.finishD === null && game.nextActionD < horizonD) {
    const d = game.nextActionD;
    const r = Math.random();
    const deliveryP = game.subsScheduled < lp.subsTotal ? 0.46 : 0;
    if (r < deliveryP) {
      // delivery: house placed so its throw moment lands exactly at d
      const side = Math.random() < 0.7 ? -game.lastDeliverySide : game.lastDeliverySide;
      game.lastDeliverySide = side;
      const hd = d + THROW_LEAD;
      game.entities.push({
        kind: 'house', side, variant: 1 + Math.floor(Math.random() * 3),
        sub: true, delivered: false, missed: false, d: hd, x: side * HOUSE_X, wW: 7.4, wH: 6.6,
      });
      game.entities.push({ kind: 'mailbox', side, d: hd - 1.2, x: side * MAILBOX_X, wW: 1.1, wH: 1.55, hit: false });
      game.subsScheduled++;
      if (game.subsScheduled === lp.subsTotal) {
        game.finishD = hd + 22;
        game.entities.push({ kind: 'finish', d: game.finishD });
      }
    } else if (r < deliveryP + lp.obstacleShare + diff * 0.06) {
      const t = Math.random();
      if (t < 0.3) {
        game.entities.push({ kind: 'car', d, x: (Math.random() < 0.5 ? -1 : 1) * (ROAD_HALF - 1.3), wW: 2.4, wH: 1.8 });
      } else if (t < 0.55) {
        game.entities.push({ kind: 'dog', d, x: (Math.random() * 2 - 1) * 3, wW: 1.55, wH: 1.0, t: Math.random() * 10 });
      } else if (t < 0.8) {
        game.entities.push({ kind: 'bin', d, x: (Math.random() < 0.5 ? -1 : 1) * (ROAD_HALF - 0.7), wW: 0.9, wH: 1.25 });
      } else {
        game.entities.push({ kind: 'drain', d, x: (Math.random() * 2 - 1) * 3, wW: 1.7, wH: 0.5 });
      }
    } else if (r < deliveryP + lp.obstacleShare + diff * 0.06 + 0.12) {
      game.entities.push({ kind: 'bundle', d, x: (Math.random() * 2 - 1) * 2.5, wW: 1.0, wH: 0.7 });
    } else if (r < deliveryP + lp.obstacleShare + diff * 0.06 + 0.22) {
      // a man out for a stroll on the sidewalk — bonus points for a bullseye
      const side = Math.random() < 0.5 ? -1 : 1;
      game.entities.push({ kind: 'ped', side, d: d + THROW_LEAD, x: side * (ROAD_HALF + 0.9), wW: 0.95, wH: 2.0, t: Math.random() * 10, hit: false });
    } // else: a breather — nothing to do for a beat

    // demands tighten within the level as speed ramps
    const gapT = lp.gapT - 0.45 * diff;
    game.nextActionD = d + Math.max(8, game.speed * gapT * (0.85 + Math.random() * 0.3));
  }

  // scenery: dark non-subscriber houses (smashable) fill the gaps, never
  // overlapping a delivery house on the same side
  const sceneryEnd = game.finishD === null ? horizonD : Math.min(horizonD, game.finishD);
  for (let i = 0; i < 2; i++) {
    const sign = i === 0 ? -1 : 1;
    while (game.sceneryD[i] < sceneryEnd) {
      const d = game.sceneryD[i];
      const clash = game.entities.find(e => e.kind === 'house' && e.side === sign && Math.abs(e.d - d) < 9);
      if (clash) {
        game.sceneryD[i] = clash.d + 9 + Math.random() * 4;
        continue;
      }
      game.entities.push({
        kind: 'house', side: sign, variant: 1 + Math.floor(Math.random() * 3),
        sub: false, delivered: false, missed: false, d, x: sign * HOUSE_X, wW: 7.4, wH: 6.6,
      });
      game.sceneryD[i] = d + 11 + Math.random() * 6;
    }
  }
}

/* ---------- actions ---------- */
function throwPaper(dir) { // dir: -1 left, +1 right
  if (game.mode !== 'playing') return;
  if (game.papers <= 0) {
    announce('NO PAPERS!', '#ff8080');
    AudioFX.missSfx();
    return;
  }
  game.papers--;
  // the paper always lands THROW_LEAD ahead of the throw point, i.e. exactly
  // on the target ring, regardless of ride speed. Laterally it steers toward
  // the mailbox line (within limits), so road position helps but a mid-dodge
  // throw isn't wasted — the timing is the skill.
  let vx = (dir * MAILBOX_X - game.player.x) / THROW_TIME;
  vx = dir * Math.min(15, Math.max(7, dir * vx));
  game.thrown.push({
    x: game.player.x, y: THROW_Y0, d: game.dist,
    vx, vy: THROW_APEX_VY, vz: THROW_LEAD / THROW_TIME,
    spin: Math.random() * Math.PI,
  });
  AudioFX.throwSfx();
}

function addPopup(text, sx, sy, color, big) {
  game.popups.push({ text, x: sx, y: sy, color, big: !!big, t: 0 });
}

// scoring feedback the player can't miss: big, centered, high on the screen
// (clear of the rider and the action on the road)
function announce(text, color) {
  game.popups.push({ text, x: W / 2, y: H * 0.19, color, big: true, t: 0 });
}

function crash() {
  if (game.invuln > 0) return;
  game.lives--;
  game.streak = 0;
  game.invuln = 2.2;
  game.shake = 0.5;
  game.speed = game.lp.baseSpeed;
  AudioFX.crashSfx();
  announce('CRASH!', '#ff5555');
  if (game.lives <= 0) endGame();
}

function endGame(reason) {
  game.mode = 'gameover';
  if (game.score > game.best) {
    game.best = game.score;
    localStorage.setItem('paperperson_best', String(game.best));
  }
  overlayTitle.style.display = '';
  overlayTitle.textContent = 'GAME OVER';
  logoImg.style.display = 'none';
  const lines = reason ? `${reason}\n` : '';
  overlayText.textContent = `${lines}SCORE ${game.score}\nBEST ${game.best}`;
  overlayPrompt.textContent = '';
  overlay.classList.remove('hidden');
  LeaderboardUI.show(game.score, game.level);
}

function startGame() {
  game.score = 0;
  game.lives = START_LIVES;
  game.streak = 0;
  game.papers = START_PAPERS;
  startLevel(1);
}

function showCharSelect() {
  game.mode = 'select';
  overlay.classList.add('hidden');
  charSelect.classList.remove('hidden');
  LeaderboardUI.hide();
}

function pickCharacter(id) {
  const c = CHARACTERS.find(ch => ch.id === id);
  if (!c) return;
  game.character = c;
  localStorage.setItem('paperperson_character', id);
  charSelect.classList.add('hidden');
  startGame();
}

// the overlay is the title screen, the level-complete card, and game over
function overlayAction() {
  if (!sprites) return;
  if (game.mode === 'levelup') startLevel(game.level + 1);
  else if (game.mode === 'title') showCharSelect();
}

function endLevel() {
  if (game.delivered >= game.target) {
    const bonus = game.papers * 20;
    game.score += bonus;
    if (game.score > game.best) {
      game.best = game.score;
      localStorage.setItem('paperperson_best', String(game.best));
    }
    game.mode = 'levelup';
    overlayTitle.style.display = '';
    overlayTitle.textContent = `LEVEL ${game.level} COMPLETE!`;
    logoImg.style.display = 'none';
    overlayText.textContent = `DELIVERED ${game.delivered}/${game.lp.subsTotal}\nPAPER BONUS +${bonus}\nSCORE ${game.score}`;
    overlayPrompt.textContent = `TAP FOR LEVEL ${game.level + 1}`;
    overlay.classList.remove('hidden');
    AudioFX.deliverSfx();
  } else {
    endGame(`DELIVERED ${game.delivered} OF ${game.lp.subsTotal}\nNEEDED ${game.target}`);
  }
}

/* ---------- delivery resolution ---------- */
function paperLands(p) {
  const px = p.x, pd = p.d;
  let scored = false;
  // direct hit on a strolling pedestrian? big cheeky bonus
  for (const e of game.entities) {
    if (e.kind === 'ped' && !e.hit && Math.abs(e.d - pd) < 1.7 && Math.abs(e.x - px) < 1.4) {
      e.hit = true;
      const pts = 200;
      game.score += pts;
      announce(`BONK! +${pts}`, '#ffb347');
      AudioFX.bonkSfx();
      return;
    }
  }
  // landed on/near a subscriber mailbox or porch?
  for (const e of game.entities) {
    if (e.kind === 'house' && e.sub && !e.delivered && Math.sign(px) === e.side) {
      if (Math.abs(e.d - pd) < 4.5 && Math.abs(px) > ROAD_HALF && Math.abs(px) < HOUSE_X + 3.5) {
        e.delivered = true;
        const mb = game.entities.find(m => m.kind === 'mailbox' && m.side === e.side && Math.abs(m.d - (e.d - 1.2)) < 0.1);
        const nearBox = mb && Math.hypot(px - mb.x, pd - mb.d) < 2.6;
        if (nearBox) mb.hit = true;
        game.streak++;
        game.delivered++;
        const pts = (nearBox ? 250 : 100) * mult();
        game.score += pts;
        announce(nearBox ? `MAILBOX! +${pts}` : `DELIVERED +${pts}`, '#7bff9b');
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
        announce(`SMASH! +${pts}`, '#ffd23f');
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

  game.speed = Math.min(game.lp.maxSpeed, game.speed + SPEED_RAMP * dt);

  // crossed the finish line?
  if (game.finishD !== null && game.dist > game.finishD + 4) {
    endLevel();
    return;
  }
  game.dist += game.speed * dt;
  game.invuln = Math.max(0, game.invuln - dt);
  game.shake = Math.max(0, game.shake - dt);

  // steering
  game.player.x += game.player.steer * STEER_RATE * game.character.steerMult * dt;
  game.player.x = Math.max(-PLAYER_MAX_X, Math.min(PLAYER_MAX_X, game.player.x));
  camX = game.player.x * 0.85;

  spawnAhead();

  // entity behaviour + collisions + missed-delivery detection
  for (const e of game.entities) {
    if (e.kind === 'ped' && !e.hit) {
      e.t += dt;
      e.d -= 0.7 * dt; // ambling toward the rider
    }
    if (e.kind === 'dog') {
      e.t += dt;
      const rel = e.d - game.dist;
      if (rel < 20 && rel > 0) {
        if (!e.barked) {
          e.barked = true;
          AudioFX.barkSfx();
        }
        // wanders toward the rider's lane, facing the way it runs
        const dir = Math.sign(game.player.x - e.x);
        if (dir !== 0) e.facing = dir;
        e.x += dir * 0.85 * dt;
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
      announce('+5 PAPERS', '#7bd6ff');
      AudioFX.pickupSfx();
    }
    if (e.kind === 'house' && e.sub && !e.delivered && !e.missed && e.d < game.dist - 2) {
      e.missed = true;
      game.streak = 0;
      announce('MISSED HOUSE', '#ff9955');
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

  // is a live subscriber house lined up with the landing ring on each side?
  const target = game.dist + THROW_LEAD;
  game.ready = { '-1': false, '1': false };
  for (const e of game.entities) {
    if (e.kind === 'house' && e.sub && !e.delivered && Math.abs(e.d - target) < 4) {
      game.ready[e.side] = true;
    }
  }
  btnThrowL.classList.toggle('ready', game.ready['-1']);
  btnThrowR.classList.toggle('ready', game.ready['1']);

  // cull entities behind the camera
  game.entities = game.entities.filter(e => e.d > game.dist - PLAYER_Z);

  // popups
  for (let i = game.popups.length - 1; i >= 0; i--) {
    const pp = game.popups[i];
    pp.t += dt;
    if (pp.t > (pp.big ? 1.5 : 1.2)) game.popups.splice(i, 1);
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
    case 'ped': return e.hit ? sprites.ped_hit : (Math.floor(e.t / 0.28) % 2 ? sprites.ped2 : sprites.ped1);
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

  // finish line: checkered band across the road at the end of the level
  for (const e of game.entities) {
    if (e.kind !== 'finish') continue;
    const z = e.d - game.dist + PLAYER_Z;
    if (z <= zNear || z > DRAW_FAR) continue;
    const cols = 10, rows = 2;
    for (let ri = 0; ri < rows; ri++) {
      for (let ci = 0; ci < cols; ci++) {
        const x1 = -ROAD_HALF + (2 * ROAD_HALF * ci) / cols;
        const x2 = -ROAD_HALF + (2 * ROAD_HALF * (ci + 1)) / cols;
        const a = project(x1, 0, z + (ri + 1) * 0.9);
        const b = project(x2, 0, z + (ri + 1) * 0.9);
        const c2 = project(x2, 0, z + ri * 0.9);
        const d2 = project(x1, 0, z + ri * 0.9);
        ctx.fillStyle = (ri + ci) % 2 ? '#e8e8ec' : '#26262e';
        ctx.beginPath();
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c2.x, c2.y); ctx.lineTo(d2.x, d2.y);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  // landing rings: where a thrown paper will come down on each side.
  // Green + solid when a subscriber house is lined up, faint otherwise.
  if (game.mode === 'playing' && game.papers > 0) {
    const ringZ = THROW_LEAD + PLAYER_Z;
    const pulse = 0.55 + 0.35 * Math.sin(game.time * 7);
    for (const side of [-1, 1]) {
      const ready = game.ready && game.ready[side];
      const p = project(side * MAILBOX_X, 0, ringZ);
      ctx.strokeStyle = ready ? '#7bff9b' : 'rgba(255,255,255,0.5)';
      ctx.lineWidth = ready ? 3.5 : 2;
      ctx.globalAlpha = ready ? pulse : 0.35;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 1.5 * p.s, 0.5 * p.s, 0, 0, Math.PI * 2);
      ctx.stroke();
      if (ready) {
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, 0.55 * p.s, 0.18 * p.s, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
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
    // pickups glow so they read as something to collect
    if (e.kind === 'bundle') {
      ctx.fillStyle = `rgba(123,214,255,${0.28 + 0.14 * Math.sin(game.time * 6)})`;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, dw * 1.0, dw * 0.34, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // dog art faces right (mirror when running left); pedestrians on the
    // right sidewalk mirror to face the road
    if ((e.kind === 'dog' && e.facing < 0) || (e.kind === 'ped' && e.side === 1 && !e.hit)) {
      ctx.save();
      ctx.translate(p.x, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, -dw / 2, p.y - dh, dw, dh);
      ctx.restore();
    } else {
      ctx.drawImage(img, p.x - dw / 2, p.y - dh, dw, dh);
    }
    // attention markers over things that matter
    if (e.kind === 'dog' || e.kind === 'bundle') {
      const fsm = Math.min(26, Math.max(11, p.s * 0.6));
      const bob = Math.sin(game.time * 8) * fsm * 0.15;
      ctx.font = `bold ${fsm}px 'Courier New', monospace`;
      ctx.textAlign = 'center';
      const label = e.kind === 'dog' ? '!' : '+5 \u{1F4F0}';
      const my = p.y - dh - fsm * 0.35 + bob;
      ctx.lineWidth = fsm * 0.22;
      ctx.strokeStyle = e.kind === 'dog' ? '#fff' : '#0a2030';
      ctx.strokeText(label, p.x, my);
      ctx.fillStyle = e.kind === 'dog' ? '#ff4444' : '#9fe3ff';
      ctx.fillText(label, p.x, my);
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
  if (game.mode !== 'title' && game.mode !== 'select' && (game.invuln <= 0 || Math.floor(game.time * 10) % 2 === 0)) {
    const lean = game.player.steer < 0 ? 'left' : game.player.steer > 0 ? 'right' : 'straight';
    const img = sprites[`${game.character.prefix}_${lean}`];
    const p = project(game.player.x, 0, PLAYER_Z);
    // fixed world height; width follows the sprite's aspect ratio
    const dh = 2.2 * p.s;
    const dw = dh * (img.width / img.height);
    // bob with speed
    const bob = Math.sin(game.time * 9) * 0.012 * p.s;
    ctx.drawImage(img, p.x - dw / 2, p.y - dh + bob, dw, dh);
  }

  // popups — big announcements pop in at the centre, small ones drift up
  ctx.textAlign = 'center';
  let bigRow = 0;
  for (const pp of game.popups) {
    const life = pp.big ? 1.5 : 1.2;
    ctx.globalAlpha = Math.max(0, 1 - pp.t / life);
    const base = Math.max(16, W * 0.045);
    if (pp.big) {
      // scale-in pop, then hold; stack if several fire together
      const popIn = Math.min(1, pp.t / 0.12);
      const fs = base * 1.8 * (0.6 + 0.4 * popIn);
      const y = pp.y + bigRow * base * 2.2 - pp.t * 14;
      bigRow++;
      ctx.font = `bold ${fs}px 'Courier New', monospace`;
      ctx.lineWidth = fs * 0.16;
      ctx.strokeStyle = '#1a0a14';
      ctx.strokeText(pp.text, pp.x, y);
      ctx.fillStyle = pp.color;
      ctx.fillText(pp.text, pp.x, y);
    } else {
      ctx.font = `bold ${base}px 'Courier New', monospace`;
      ctx.fillStyle = '#000';
      ctx.fillText(pp.text, pp.x + 2, pp.y - pp.t * 40 + 2);
      ctx.fillStyle = pp.color;
      ctx.fillText(pp.text, pp.x, pp.y - pp.t * 40);
    }
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
  ctx.fillRect(0, 0, W, fs * 3.7);
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
  // level + delivery target
  ctx.textAlign = 'left';
  ctx.fillStyle = '#7bd6ff';
  ctx.fillText(`LEVEL ${game.level}`, 10, fs * 2.9);
  ctx.textAlign = 'center';
  ctx.fillStyle = game.delivered >= game.target ? '#7bff9b' : '#fff';
  ctx.fillText(`\u{1F4EC} ${game.delivered}/${game.target}`, W / 2, fs * 2.9);
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
  const down = e => {
    e.preventDefault();
    AudioFX.init();
    if (navigator.vibrate) navigator.vibrate(12);
    on();
    el.classList.add('held');
  };
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
  // typing a leaderboard name must not drive the game
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON')) return;
  // on game over the panel's buttons drive the flow, not Space/Enter
  if (game.mode === 'gameover' && (e.code === 'Space' || e.code === 'Enter')) return;
  AudioFX.init();
  switch (e.code) {
    case 'ArrowLeft': case 'KeyA': steer.left = true; applySteer(); break;
    case 'ArrowRight': case 'KeyD': steer.right = true; applySteer(); break;
    case 'KeyZ': case 'KeyJ': throwPaper(-1); break;
    case 'KeyX': case 'KeyK': throwPaper(1); break;
    case 'Space': case 'Enter':
      overlayAction();
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
  // let the leaderboard panel's input and buttons work normally
  if (e.target.closest && e.target.closest('#lbPanel')) return;
  e.preventDefault();
  AudioFX.init();
  // on game over, restarting is the RIDE AGAIN button's job
  if (game.mode !== 'playing' && game.mode !== 'gameover') overlayAction();
});

document.getElementById('playAgainBtn').addEventListener('click', () => {
  AudioFX.init();
  startGame();
});
document.getElementById('changeRiderBtn').addEventListener('click', () => {
  AudioFX.init();
  showCharSelect();
});
LeaderboardUI.init();

/* ---------- character select screen ---------- */
const pips = (n, max = 5) => '●'.repeat(n) + '○'.repeat(max - n);

function populateCharSelect() {
  const grid = document.getElementById('charSelectGrid');
  for (const c of CHARACTERS) {
    const card = document.createElement('button');
    card.className = 'charCard';
    card.innerHTML = `
      <img class="charThumb" src="assets/${c.prefix}_straight.png" alt="${c.name}" draggable="false">
      <div class="charName">${c.name}</div>
      <div class="charTag">${c.tagline}</div>
      <div class="charDesc">${c.desc}</div>
      <div class="charStats">
        <div class="charStatRow"><span>SPEED</span><span class="charPips">${pips(c.speedPips)}</span></div>
        <div class="charStatRow"><span>HANDLING</span><span class="charPips">${pips(c.handlingPips)}</span></div>
      </div>`;
    card.addEventListener('pointerdown', e => {
      e.preventDefault();
      e.stopPropagation();
      AudioFX.init();
      pickCharacter(c.id);
    });
    grid.appendChild(card);
  }
}
populateCharSelect();

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
