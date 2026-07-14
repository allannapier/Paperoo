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
const THROW_COOLDOWN = 0.35;    // seconds between throws, so mashing can't waste papers
const START_PAPERS = 15;
const MAX_PAPERS = 30;
const START_LIVES = 3;
const DAILY_LEVELS = 3;         // fixed length of a Daily Route run
const SHARE_URL = 'https://allannapier.github.io/Paperoo/';

/* ---------- seeded rng ----------
 * Route generation — everything spawnAhead rolls (action points, sides,
 * variants, obstacle types, lateral positions, gap jitter, scenery spacing)
 * — draws from game.rng instead of Math.random, so a Daily Route seed
 * produces the identical street for every player. Cosmetic randomness
 * (paper spin, confetti, screen shake, dog/ped animation timers) stays on
 * Math.random since it never affects what the player has to react to.
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// mixes two integers into one 32-bit seed so each level gets its own stream —
// a level's route must depend only on (daySeed, level), never on how many
// rng calls the previous level happened to consume (paper throws etc.),
// otherwise the sequence would desync between two runs of the same seed
function hashSeed(a, b) {
  let h = (a ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ b, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/* ---------- daily route ---------- */
const DAILY_EPOCH_MS = Date.UTC(2026, 0, 1); // day #0 = 2026-01-01 UTC
function dailyNumberFor(date = new Date()) {
  const dayMs = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.floor((dayMs - DAILY_EPOCH_MS) / 86400000);
}
function dailyDateStr(n) {
  const d = new Date(DAILY_EPOCH_MS + n * 86400000);
  const pad = v => String(v).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

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
    speedMult: 1.08, steerMult: 0.9, speedPips: 4, handlingPips: 3,
  },
  {
    id: 'skye', prefix: 'player3', name: 'Skye', tagline: 'Rollerblades',
    desc: '“Silent, smooth, and impossible to knock off her feet.”',
    speedMult: 0.85, steerMult: 1.25, speedPips: 2, handlingPips: 5,
    unlockType: 'delivered', unlockAt: 25,
  },
  {
    id: 'stan', prefix: 'player4', name: 'Grandpa Stan', tagline: 'Moped',
    desc: "Can't be bothered getting out of bed? Send Grandpa instead.",
    speedMult: 1.18, steerMult: 0.72, speedPips: 5, handlingPips: 2,
    unlockType: 'level', unlockAt: 5,
  },
];

/* ---------- meta-progression: lifetime stats + rider unlocks ----------
 * Persisted under one JSON key so it's easy to inspect/reset. `unlocked` is
 * only for grandfathering — a rider that meets its threshold is already
 * unlocked via lifetimeDelivered/maxLevelReached without ever touching it.
 */
const PROGRESS_KEY = 'paperoo_progress';
function loadProgress() {
  let fresh = false;
  let p;
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (raw) p = JSON.parse(raw); else fresh = true;
  } catch (e) { fresh = true; }
  if (!p || typeof p !== 'object') { p = {}; fresh = true; }
  p.lifetimeDelivered = Number(p.lifetimeDelivered) || 0;
  p.maxLevelReached = Number(p.maxLevelReached) || 0;
  p.unlocked = Array.isArray(p.unlocked) ? p.unlocked : [];
  p._fresh = fresh; // not persisted — just tells the grandfather check below
  return p;
}
let progress = loadProgress();
function saveProgress() {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({
      lifetimeDelivered: progress.lifetimeDelivered,
      maxLevelReached: progress.maxLevelReached,
      unlocked: progress.unlocked,
    }));
  } catch (e) { /* storage unavailable — unlocks just won't persist */ }
}
function isUnlocked(c, prog = progress) {
  if (!c.unlockType) return true; // zoe/milo are free
  if (prog.unlocked.includes(c.id)) return true;
  if (c.unlockType === 'delivered') return prog.lifetimeDelivered >= c.unlockAt;
  if (c.unlockType === 'level') return prog.maxLevelReached >= c.unlockAt;
  return true;
}
// a returning player who already had a saved Skye/Stan choice keeps it —
// their progress file didn't exist yet, so the new thresholds would
// otherwise lock them out of a rider they already picked
if (progress._fresh) {
  const savedId = localStorage.getItem('paperperson_character');
  const savedChar = CHARACTERS.find(c => c.id === savedId);
  if (savedChar && savedChar.unlockType && !progress.unlocked.includes(savedId)) {
    progress.unlocked.push(savedId);
  }
}
saveProgress();

// fires when a run's progress update (level reached / lifetime deliveries)
// crosses a rider's unlock threshold, so the end screen can call it out
function checkNewUnlocks(unlockedBefore) {
  for (const c of CHARACTERS) {
    if (!unlockedBefore.has(c.id) && isUnlocked(c) && !game.newlyUnlocked.includes(c.id)) {
      game.newlyUnlocked.push(c.id);
    }
  }
}
function bumpMaxLevel(L) {
  if (L <= progress.maxLevelReached) return;
  const before = new Set(CHARACTERS.filter(c => isUnlocked(c)).map(c => c.id));
  progress.maxLevelReached = L;
  saveProgress();
  checkNewUnlocks(before);
}
function bumpLifetimeDelivered(n) {
  if (n <= 0) return;
  const before = new Set(CHARACTERS.filter(c => isUnlocked(c)).map(c => c.id));
  progress.lifetimeDelivered += n;
  saveProgress();
  checkNewUnlocks(before);
}

/* ---------- day/night cycle ----------
 * The street's palette cycles by level: dusk -> night -> day -> repeat.
 * Sky colour for the art-based phases is sampled from the matching skyline
 * image (see sampleSkyTopColor); night reuses the dusk skyline but darkens
 * everything so it reads as "later," and gives subscriber windows a soft
 * glow so they still pop against the dimmer street.
 */
const PHASES = [
  { name: 'dusk',  skylineKey: 'skyline',     skyMul: 1,    grass: '#2e7d43', sidewalk: '#8a8a96', road: '#3c3c46', line: '#d8d8dc', dash: '#e8d44d', houseGlow: 0 },
  { name: 'night', skylineKey: 'skyline',     skyMul: 0.42, grass: '#173a22', sidewalk: '#4c4c58', road: '#1c1c26', line: '#82828e', dash: '#a89830', houseGlow: 0.4 },
  { name: 'day',   skylineKey: 'skyline_day', skyMul: 1,    grass: '#3f9c58', sidewalk: '#b0b0ba', road: '#4c4c58', line: '#f5f5f8', dash: '#ffe066', houseGlow: 0 },
];
// daily mode shares one time-of-day across the whole route (picked from the
// day's seed); endless cycles it every level so each street feels distinct
function currentPhaseIndex() {
  if (game.dailyMode) return ((game.dailyNumber % 3) + 3) % 3;
  return (game.level - 1) % 3;
}

/* ---------- canvas / layout ---------- */
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlayText = document.getElementById('overlayText');
const overlayPrompt = document.getElementById('overlayPrompt');
const titleButtons = document.getElementById('titleButtons');
const endlessBtn = document.getElementById('endlessBtn');
const dailyBtn = document.getElementById('dailyBtn');
const dailyNumSpan = document.getElementById('dailyNumSpan');
const logoImg = document.getElementById('logoImg');
const charSelect = document.getElementById('charSelect');
const charSelectGrid = document.getElementById('charSelectGrid');
const charGoBtn = document.getElementById('charGoBtn');
const btnThrowL = document.getElementById('btnThrowL');
const btnThrowR = document.getElementById('btnThrowR');
const muteBtn = document.getElementById('muteBtn');
const pauseBtn = document.getElementById('pauseBtn');
const controlsEl = document.getElementById('controls');
const unlockBanner = document.getElementById('unlockBanner');
const statDelivered = document.getElementById('statDelivered');
const statAccuracy = document.getElementById('statAccuracy');
const statStreak = document.getElementById('statStreak');
const statBonks = document.getElementById('statBonks');
const statSmashes = document.getElementById('statSmashes');

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
  muted: false, // mirrors Music.muted; the mute button flips both together
  init() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },
  tone(freq, dur, type = 'square', vol = 0.12, slide = 0) {
    if (!this.ctx || this.muted) return;
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
    if (!this.ctx || this.muted) return;
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
  // pitch climbs with the streak so consecutive deliveries audibly build
  deliverSfx(streak = 0) {
    const f = 1 + 0.06 * Math.min(streak, 12);
    this.tone(660 * f, 0.09, 'square', 0.1);
    setTimeout(() => this.tone(990 * f, 0.14, 'square', 0.1), 90);
  },
  smashSfx() { this.noise(0.25, 0.22); this.tone(220, 0.2, 'sawtooth', 0.08, -150); },
  crashSfx() { this.noise(0.45, 0.3); this.tone(120, 0.4, 'sawtooth', 0.15, -80); },
  pickupSfx() { this.tone(440, 0.08, 'square', 0.1, 220); setTimeout(() => this.tone(880, 0.1, 'square', 0.1), 70); },
  missSfx() { this.tone(200, 0.2, 'sawtooth', 0.08, -100); },
  // quick filtered whoosh — a near miss should feel snappy, not celebratory
  nearMissSfx() { this.noise(0.06, 0.05); this.tone(1500, 0.09, 'sine', 0.07, -1000); },
};

/* ---------- game state ---------- */
let sprites = null;
const game = {
  mode: 'title', // title | playing | gameover
  paused: false,
  dist: 0,
  speed: BASE_SPEED,
  player: { x: 0, steer: 0 },
  papers: START_PAPERS,
  throwCd: 0,             // seconds left before another throw is accepted
  lives: START_LIVES,
  score: 0,
  streak: 0,
  bestStreak: 0,          // best streak reached this run, for share text
  rng: Math.random,       // route-generation stream; reseeded per level (see startLevel)
  dailyMode: false,
  dailyNumber: dailyNumberFor(),
  daySeedBase: 0,         // seeded from the date (daily) or Math.random (endless) at startGame
  runDelivered: 0,        // deliveries made across the whole run, for share text
  runQuota: 0,            // sum of subsTotal across levels played, for share text
  runThrown: 0,           // papers thrown this run, for run-end accuracy
  runBonks: 0,            // pedestrian bullseyes this run
  runSmashes: 0,          // non-subscriber window smashes this run
  newlyUnlocked: [],       // rider ids unlocked during this run, for the end-screen banner
  invuln: 0,
  shake: 0,
  time: 0,
  entities: [],   // houses, mailboxes, obstacles, bundles
  thrown: [],     // papers in flight
  popups: [],
  particles: [],          // confetti bursts on delivery
  slowmo: 0,              // seconds left running world-time at 0.35x
  vignette: 0,            // fade timer for the max-combo flash
  comboMult: 1,           // last multiplier tier reached, for COMBO x announces
  maxComboFlashed: false, // whether the max-combo flash has fired this run
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
  // a saved character that's somehow locked (fresh browser profile, cleared
  // progress, etc.) falls back to Zoe rather than starting a run as nobody
  character: (() => {
    const saved = CHARACTERS.find(c => c.id === localStorage.getItem('paperperson_character'));
    return (saved && isUnlocked(saved)) ? saved : CHARACTERS[0];
  })(),
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
  bumpMaxLevel(L); // Grandpa Stan unlocks the first time endless reaches level 5
  unlockBanner.classList.add('hidden'); // only the actual run-end screen shows this
  // seeded once per level, keyed on (daySeed, level) — never depends on how
  // many rng calls the previous level consumed, so the same daily seed
  // always produces the identical street regardless of play style
  game.rng = mulberry32(hashSeed(game.daySeedBase, L));
  game.lp = levelParams(L, game.character.speedMult);
  game.target = Math.ceil(game.lp.subsTotal * 0.6);
  game.runQuota += game.lp.subsTotal;
  game.delivered = 0;
  game.subsScheduled = 0;
  game.finishD = null;
  game.dist = 0;
  game.speed = game.lp.baseSpeed;
  game.player.x = 0;
  game.player.steer = 0;
  camX = 0;
  game.papers = Math.max(game.papers, START_PAPERS);
  game.throwCd = 0;
  game.invuln = 1; // brief grace as the new street starts
  game.shake = 0;
  game.entities = [];
  game.thrown = [];
  game.popups = [];
  game.particles = [];
  game.slowmo = 0;
  game.vignette = 0;
  game.nextActionD = 26;
  game.lastDeliverySide = 1;
  game.sceneryD = [40, 47];
  game.ready = { '-1': false, '1': false };
  game.mode = 'playing';
  game.paused = false;
  overlay.classList.add('hidden');
  titleButtons.classList.add('hidden');
  charSelect.classList.add('hidden');
  LeaderboardUI.hide();
  Music.start('game');
  Music.setIntensity(Math.min(3, game.level - 1));
  // daily mode shares one time-of-day for the whole route, so only announce
  // it once at street 1 rather than repeating it every level
  if (!game.dailyMode || L === 1) {
    const phaseName = PHASES[currentPhaseIndex()].name;
    if (phaseName === 'night') announce('NIGHT SHIFT', '#9fd6ff');
    else if (phaseName === 'day') announce('DAYBREAK', '#ffe066');
  }
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
    const r = game.rng();
    const deliveryP = game.subsScheduled < lp.subsTotal ? 0.46 : 0;
    // paper drought protection: running low with nothing to pick up ahead
    // means the next action point MUST be a bundle, whatever the dice said —
    // the player should never be stranded at 0 papers with nothing to do
    const bundleAhead = game.entities.some(e => e.kind === 'bundle' && !e.taken && e.d > game.dist);
    const forceBundle = game.papers <= 3 && !bundleAhead;
    if (forceBundle) {
      game.entities.push({ kind: 'bundle', d, x: (game.rng() * 2 - 1) * 2.5, wW: 1.0, wH: 0.7 });
    } else if (r < deliveryP) {
      // delivery: house placed so its throw moment lands exactly at d
      const side = game.rng() < 0.7 ? -game.lastDeliverySide : game.lastDeliverySide;
      game.lastDeliverySide = side;
      const hd = d + THROW_LEAD;
      game.entities.push({
        kind: 'house', side, variant: 1 + Math.floor(game.rng() * 3),
        sub: true, delivered: false, missed: false, d: hd, x: side * HOUSE_X, wW: 7.4, wH: 6.6,
      });
      game.entities.push({ kind: 'mailbox', side, d: hd - 1.2, x: side * MAILBOX_X, wW: 1.1, wH: 1.55, hit: false });
      game.subsScheduled++;
      if (game.subsScheduled === lp.subsTotal) {
        game.finishD = hd + 22;
        game.entities.push({ kind: 'finish', d: game.finishD });
      }
    } else if (r < deliveryP + lp.obstacleShare + diff * 0.06) {
      const t = game.rng();
      if (t < 0.3) {
        game.entities.push({ kind: 'car', d, x: (game.rng() < 0.5 ? -1 : 1) * (ROAD_HALF - 1.3), wW: 2.4, wH: 1.8 });
      } else if (t < 0.55) {
        // x (route) comes off the seeded stream; t (animation phase) is
        // cosmetic and stays on Math.random — it never changes what's on the road
        game.entities.push({ kind: 'dog', d, x: (game.rng() * 2 - 1) * 3, wW: 1.55, wH: 1.0, t: Math.random() * 10 });
      } else if (t < 0.8) {
        game.entities.push({ kind: 'bin', d, x: (game.rng() < 0.5 ? -1 : 1) * (ROAD_HALF - 0.7), wW: 0.9, wH: 1.25 });
      } else {
        game.entities.push({ kind: 'drain', d, x: (game.rng() * 2 - 1) * 3, wW: 1.7, wH: 0.5 });
      }
    } else if (r < deliveryP + lp.obstacleShare + diff * 0.06 + 0.12) {
      game.entities.push({ kind: 'bundle', d, x: (game.rng() * 2 - 1) * 2.5, wW: 1.0, wH: 0.7 });
    } else if (r < deliveryP + lp.obstacleShare + diff * 0.06 + 0.22) {
      // a man out for a stroll on the sidewalk — bonus points for a bullseye
      const side = game.rng() < 0.5 ? -1 : 1;
      game.entities.push({ kind: 'ped', side, d: d + THROW_LEAD, x: side * (ROAD_HALF + 0.9), wW: 0.95, wH: 2.0, t: Math.random() * 10, hit: false });
    } // else: a breather — nothing to do for a beat

    // demands tighten within the level as speed ramps
    const gapT = lp.gapT - 0.45 * diff;
    game.nextActionD = d + Math.max(8, game.speed * gapT * (0.85 + game.rng() * 0.3));
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
        game.sceneryD[i] = clash.d + 9 + game.rng() * 4;
        continue;
      }
      game.entities.push({
        kind: 'house', side: sign, variant: 1 + Math.floor(game.rng() * 3),
        sub: false, delivered: false, missed: false, d, x: sign * HOUSE_X, wW: 7.4, wH: 6.6,
      });
      game.sceneryD[i] = d + 11 + game.rng() * 6;
    }
  }
}

/* ---------- actions ---------- */
function throwPaper(dir) { // dir: -1 left, +1 right
  if (game.mode !== 'playing') return;
  // a short cooldown stops mashing the button from burning 2-4 papers per
  // house — inputs during it are just swallowed, no popup, no sound
  if (game.throwCd > 0) return;
  if (game.papers <= 0) {
    announce('NO PAPERS!', '#ff8080');
    AudioFX.missSfx();
    return;
  }
  game.papers--;
  game.runThrown++;
  game.throwCd = THROW_COOLDOWN;
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

// confetti: a tiny screen-space particle burst on a successful delivery.
// simulated in screen space (not world space) since it's a one-shot visual
// flourish, not something that needs to track a moving world point.
const CONFETTI_COLORS = ['#ffd23f', '#7bff9b', '#7bd6ff', '#ff8fd1', '#ffffff'];
function burstConfetti(sx, sy, count) {
  for (let i = 0; i < count; i++) {
    const ang = Math.random() * Math.PI * 2;
    const spd = 60 + Math.random() * 150;
    game.particles.push({
      x: sx, y: sy,
      vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 90,
      rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 12,
      size: 3 + Math.random() * 4,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      t: 0, life: 0.55 + Math.random() * 0.2,
    });
  }
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
  game.comboMult = 1;
  game.invuln = 2.2;
  game.shake = 0.5;
  game.speed = game.lp.baseSpeed;
  AudioFX.crashSfx();
  announce('CRASH!', '#ff5555');
  if (game.lives <= 0) endGame();
}

// board id the current run's score belongs to — endless always goes to the
// shared global board, a Daily Route goes to that calendar day's own board
function currentBoardId() {
  return game.dailyMode ? `daily-${dailyDateStr(game.dailyNumber)}` : 'global';
}

/* ---------- share ---------- */
function buildShareText() {
  const score = game.score.toLocaleString('en-US');
  if (game.dailyMode) {
    return `PAPEROO DAILY #${game.dailyNumber}\n🗞️ SCORE ${score} · 📬 ${game.runDelivered}/${game.runQuota} · 🔥x${game.bestStreak}\n${SHARE_URL}`;
  }
  return `PAPEROO\n🗞️ SCORE ${score} · LEVEL ${game.level} · 🔥x${game.bestStreak}\n${SHARE_URL}`;
}

async function shareScore() {
  const btn = document.getElementById('shareBtn');
  const text = buildShareText();
  try {
    if (navigator.share) {
      await navigator.share({ text });
      return;
    }
  } catch (e) { return; } // share sheet dismissed/cancelled — no-op
  try {
    await navigator.clipboard.writeText(text);
    const original = btn.textContent;
    btn.textContent = 'COPIED!';
    setTimeout(() => { btn.textContent = original; }, 1200);
  } catch (e) { /* clipboard unavailable — nothing more we can do */ }
}

// per-day best, kept locally so the title/share flow can show "beat today's
// best" without a network round trip
function updateDailyBest() {
  const key = `paperoo_daily_${game.dailyNumber}_best`;
  const prevBest = Number(localStorage.getItem(key) || 0);
  if (game.score > prevBest) localStorage.setItem(key, String(game.score));
  return Math.max(game.score, prevBest);
}

// per-run stats block (delivered / accuracy / best streak / bonks / smashes)
// shown on both end-of-run cards, above the leaderboard
function renderStatsCard() {
  const acc = game.runThrown > 0 ? Math.round((game.runDelivered / game.runThrown) * 100) : 0;
  statDelivered.textContent = game.runDelivered;
  statAccuracy.textContent = `${acc}%`;
  statStreak.textContent = game.bestStreak;
  statBonks.textContent = game.runBonks;
  statSmashes.textContent = game.runSmashes;
}

// a bold callout on the end screen when this run's progress crossed a
// rider's unlock threshold (see bumpMaxLevel / bumpLifetimeDelivered)
function renderUnlockBanner() {
  if (game.newlyUnlocked.length) {
    unlockBanner.textContent = game.newlyUnlocked
      .map(id => `NEW RIDER UNLOCKED — ${CHARACTERS.find(c => c.id === id).name.toUpperCase()}!`)
      .join('\n');
    unlockBanner.classList.remove('hidden');
  } else {
    unlockBanner.classList.add('hidden');
  }
}

function endGame(reason) {
  game.mode = 'gameover';
  game.paused = false;
  Music.start('title');
  if (game.score > game.best) {
    game.best = game.score;
    localStorage.setItem('paperperson_best', String(game.best));
  }
  if (game.dailyMode) updateDailyBest();
  bumpLifetimeDelivered(game.runDelivered);
  overlayTitle.style.display = '';
  overlayTitle.textContent = 'GAME OVER';
  logoImg.style.display = 'none';
  const lines = reason ? `${reason}\n` : '';
  overlayText.textContent = `${lines}SCORE ${game.score}\nBEST ${game.best}`;
  overlayPrompt.textContent = '';
  renderStatsCard();
  renderUnlockBanner();
  overlay.classList.remove('hidden');
  LeaderboardUI.show(game.score, game.level, currentBoardId());
}

// reached the end of a Daily Route's fixed 3rd street — a distinct
// game-over-style screen, same shareable/submittable panel underneath
function finishDailyRoute() {
  game.mode = 'gameover';
  game.paused = false;
  Music.start('title');
  if (game.score > game.best) {
    game.best = game.score;
    localStorage.setItem('paperperson_best', String(game.best));
  }
  const dailyBest = updateDailyBest();
  bumpLifetimeDelivered(game.runDelivered);
  overlayTitle.style.display = '';
  overlayTitle.textContent = 'ROUTE COMPLETE!';
  logoImg.style.display = 'none';
  overlayText.textContent = `SCORE ${game.score}\nBEST TODAY ${dailyBest}`;
  overlayPrompt.textContent = '';
  renderStatsCard();
  renderUnlockBanner();
  overlay.classList.remove('hidden');
  LeaderboardUI.show(game.score, game.level, currentBoardId());
}

function startGame() {
  game.score = 0;
  game.lives = START_LIVES;
  game.streak = 0;
  game.bestStreak = 0;
  game.comboMult = 1;
  game.maxComboFlashed = false;
  game.papers = START_PAPERS;
  game.runDelivered = 0;
  game.runQuota = 0;
  game.runThrown = 0;
  game.runBonks = 0;
  game.runSmashes = 0;
  game.newlyUnlocked = [];
  // endless reseeds fresh every run; daily locks to the calendar date so
  // every player's route is identical
  game.daySeedBase = game.dailyMode ? game.dailyNumber : ((Math.random() * 4294967296) >>> 0);
  startLevel(1);
}

function showCharSelect() {
  game.mode = 'select';
  overlay.classList.add('hidden');
  unlockBanner.classList.add('hidden');
  populateCharSelect(); // rebuild so unlocks earned just now show up unlocked
  charSelect.classList.remove('hidden');
  LeaderboardUI.hide();
}

function startEndlessFlow() {
  game.dailyMode = false;
  showCharSelect();
}

function startDailyFlow() {
  game.dailyMode = true;
  showCharSelect();
}

function pickCharacter(id) {
  const c = CHARACTERS.find(ch => ch.id === id);
  if (!c) return;
  game.character = c;
  localStorage.setItem('paperperson_character', id);
  charSelect.classList.add('hidden');
  startGame();
}

// the overlay is the title screen, the level-complete card, the round-failed
// card, and game over
function overlayAction() {
  if (game.mode === 'levelup' || game.mode === 'roundfail') startLevel(game.level + 1);
  else if (game.mode === 'title') startEndlessFlow(); // keyboard Space/Enter defaults to endless
}

function endLevel() {
  // a Daily Route is a fixed 3 streets — crossing the finish line on the
  // last one always ends the run, met quota or not (there's no street 4 to
  // fall back to the way endless's roundfail does)
  const isDailyFinal = game.dailyMode && game.level >= DAILY_LEVELS;
  if (game.delivered >= game.target) {
    const bonus = game.papers * 20;
    game.score += bonus;
    if (game.score > game.best) {
      game.best = game.score;
      localStorage.setItem('paperperson_best', String(game.best));
    }
    if (isDailyFinal) {
      finishDailyRoute();
      return;
    }
    game.mode = 'levelup';
    overlayTitle.style.display = '';
    overlayTitle.textContent = `LEVEL ${game.level} COMPLETE!`;
    logoImg.style.display = 'none';
    overlayText.textContent = `DELIVERED ${game.delivered}/${game.lp.subsTotal}\nPAPER BONUS +${bonus}\nSCORE ${game.score}`;
    overlayPrompt.textContent = `TAP FOR LEVEL ${game.level + 1}`;
    overlay.classList.remove('hidden');
    AudioFX.deliverSfx();
  } else if (game.lives > 1 && !isDailyFinal) {
    // missing quota costs a heart, not the whole run — the player rides on
    // to the next street instead of the game ending with lives still banked
    game.lives--;
    game.mode = 'roundfail';
    overlayTitle.style.display = '';
    overlayTitle.textContent = 'ROUND FAILED';
    logoImg.style.display = 'none';
    overlayText.textContent = `DELIVERED ${game.delivered} OF ${game.lp.subsTotal} — NEEDED ${game.target}\n-1 ♥  TRY THE NEXT STREET`;
    overlayPrompt.textContent = `TAP FOR LEVEL ${game.level + 1}`;
    overlay.classList.remove('hidden');
    AudioFX.missSfx();
  } else {
    endGame(`DELIVERED ${game.delivered} OF ${game.lp.subsTotal}\nNEEDED ${game.target}`);
  }
}

/* ---------- pause ---------- */
function setPaused(p) {
  if (p && game.mode !== 'playing') return;
  if (game.paused === p) return;
  game.paused = p;
  pauseBtn.textContent = p ? '▶' : '⏸';
  if (p) Music.pause(); else Music.resume();
}
function togglePause() {
  if (game.mode !== 'playing') return;
  setPaused(!game.paused);
}

/* ---------- delivery resolution ---------- */
function paperLands(p) {
  const px = p.x, pd = p.d;
  let scored = false;
  // direct hit on a strolling pedestrian? big cheeky bonus
  for (const e of game.entities) {
    if (e.kind === 'ped' && !e.hit && Math.abs(e.d - pd) < 1.7 && Math.abs(e.x - px) < 1.4) {
      e.hit = true;
      game.runBonks++;
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
        game.runDelivered++;
        game.bestStreak = Math.max(game.bestStreak, game.streak);
        const nowMult = mult();
        const pts = (nearBox ? 250 : 100) * nowMult;
        game.score += pts;
        announce(nearBox ? `MAILBOX! +${pts}` : `DELIVERED +${pts}`, '#7bff9b');
        AudioFX.deliverSfx(game.streak);
        const bp = project(px, 0.3, pd - game.dist + PLAYER_Z);
        if (bp.s > 0) burstConfetti(bp.x, bp.y, nearBox ? 16 : 11);
        // multiplier tier just crossed a /3 boundary — celebrate it
        if (nowMult > game.comboMult) {
          game.comboMult = nowMult;
          announce(`COMBO x${nowMult}!`, '#ffd700');
          if (nowMult >= 5 && !game.maxComboFlashed) {
            game.maxComboFlashed = true;
            game.vignette = 0.5;
          }
        }
        // this throw met the level's quota — the finish line is still ahead,
        // but the moment that matters just happened, so make it felt
        if (game.delivered === game.target) {
          game.slowmo = 0.4;
          announce('QUOTA MET!', '#ffd700');
        }
        scored = true;
        break;
      }
    }
    // window smash on non-subscribers, classic style
    if (e.kind === 'house' && !e.sub && !e.delivered && Math.sign(px) === e.side) {
      if (Math.abs(e.d - pd) < 3.5 && Math.abs(px) > HOUSE_X - 3.5) {
        e.delivered = true; // one smash per house
        game.runSmashes++;
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
function update(realDt) {
  if (game.mode === 'playing' && game.paused) return; // frozen: keep rendering, stop simulating
  game.time += realDt;
  if (game.mode !== 'playing') return;

  // slow-mo: briefly stretches world time on the level's final delivery.
  // popups/particles below run on realDt so the celebration itself still
  // pops at full speed while the world around it eases up.
  game.slowmo = Math.max(0, game.slowmo - realDt);
  const dt = game.slowmo > 0 ? realDt * 0.35 : realDt;

  game.speed = Math.min(game.lp.maxSpeed, game.speed + SPEED_RAMP * dt);

  // crossed the finish line?
  if (game.finishD !== null && game.dist > game.finishD + 4) {
    endLevel();
    return;
  }
  game.dist += game.speed * dt;
  game.invuln = Math.max(0, game.invuln - dt);
  game.shake = Math.max(0, game.shake - dt);
  game.throwCd = Math.max(0, game.throwCd - dt);

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
    // near miss: the instant an obstacle passes behind the rider without a
    // crash, check how close it actually was — reward a tight dodge once per
    // obstacle. skipped while invulnerable so post-crash ghosting can't farm it.
    if ((e.kind === 'car' || e.kind === 'dog' || e.kind === 'bin' || e.kind === 'drain') &&
        !e.nearMiss && e.d < game.dist) {
      e.nearMiss = true;
      const edge = e.wW / 2 + 0.55;
      const lat = Math.abs(e.x - game.player.x);
      if (game.invuln <= 0 && lat >= edge && lat < edge + 1.5) {
        game.score += 25;
        const proj = project(e.x, 0.6, PLAYER_Z);
        if (proj.s > 0) addPopup('CLOSE! +25', proj.x, proj.y, '#9ff5ff');
        AudioFX.nearMissSfx();
      }
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
      game.comboMult = 1;
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

  // popups — real time, so the feedback still pops at full speed in slow-mo
  for (let i = game.popups.length - 1; i >= 0; i--) {
    const pp = game.popups[i];
    pp.t += realDt;
    if (pp.t > (pp.big ? 1.5 : 1.2)) game.popups.splice(i, 1);
  }

  // confetti particles — also real time, plain gravity + drift in screen space
  for (let i = game.particles.length - 1; i >= 0; i--) {
    const q = game.particles[i];
    q.t += realDt;
    if (q.t > q.life) { game.particles.splice(i, 1); continue; }
    q.vy += 900 * realDt;
    q.x += q.vx * realDt;
    q.y += q.vy * realDt;
    q.rot += q.vr * realDt;
  }

  // max-combo flash fade
  game.vignette = Math.max(0, game.vignette - realDt);
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
  pauseBtn.classList.toggle('hidden', game.mode !== 'playing');
  updateCamera();
  ctx.save();
  if (game.shake > 0) {
    ctx.translate((Math.random() - 0.5) * 14 * game.shake, (Math.random() - 0.5) * 10 * game.shake);
  }

  // day/night: which palette this level (or, in daily mode, this whole
  // route) is using — see PHASES for the per-phase colours
  const phase = PHASES[currentPhaseIndex()];

  // sky + skyline strip (slight parallax against steering)
  const baseSky = skySamples[phase.skylineKey] || '#1c2e5e';
  ctx.fillStyle = phase.skyMul !== 1 ? scaleRgbString(baseSky, phase.skyMul) : baseSky;
  ctx.fillRect(-20, -20, W + 40, cam.horizon + 20);
  const sk = sprites[phase.skylineKey];
  const skH = Math.min(cam.horizon * 0.85, 200);
  const skW = skH * (sk.width / sk.height);
  const par = -camX * 14;
  for (let x = ((par % skW) + skW) % skW - skW; x < W + skW; x += skW) {
    ctx.drawImage(sk, x, cam.horizon - skH + 2, skW, skH);
  }

  // grass
  ctx.fillStyle = phase.grass;
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
  quad(-ROAD_HALF - SIDEWALK, ROAD_HALF + SIDEWALK, phase.sidewalk);
  quad(-ROAD_HALF, ROAD_HALF, phase.road);
  quad(-ROAD_HALF - 0.18, -ROAD_HALF + 0.18, phase.line);
  quad(ROAD_HALF - 0.18, ROAD_HALF + 0.18, phase.line);

  // scrolling centre dashes
  ctx.fillStyle = phase.dash;
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
    // at night, subscriber windows get a warm glow so lit houses still read
    // clearly against the darker street (the art itself doesn't change)
    if (e.kind === 'house' && e.sub && !e.delivered && phase.houseGlow > 0) {
      ctx.fillStyle = `rgba(255,214,110,${phase.houseGlow * (0.65 + 0.25 * Math.sin(game.time * 3 + e.d))})`;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - dh * 0.42, dw * 0.5, dh * 0.3, 0, 0, Math.PI * 2);
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

  // confetti — quick celebratory burst on a successful delivery
  for (const q of game.particles) {
    ctx.globalAlpha = Math.max(0, 1 - q.t / q.life);
    ctx.save();
    ctx.translate(q.x, q.y);
    ctx.rotate(q.rot);
    ctx.fillStyle = q.color;
    ctx.fillRect(-q.size / 2, -q.size / 2, q.size, q.size);
    ctx.restore();
  }
  ctx.globalAlpha = 1;

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

  // max-combo flash: a quick green edge-glow the first time the streak caps out
  if (game.vignette > 0) {
    const a = game.vignette / 0.5;
    const grad = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.72);
    grad.addColorStop(0, 'rgba(60,255,120,0)');
    grad.addColorStop(1, `rgba(60,255,120,${0.55 * a})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  renderHUD();

  // paused: translucent banner over the whole scene, HUD still visible below it
  if (game.mode === 'playing' && game.paused) {
    ctx.fillStyle = 'rgba(8,8,24,0.6)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    const bigFs = Math.max(28, W * 0.09);
    ctx.font = `bold ${bigFs}px 'Courier New', monospace`;
    ctx.lineWidth = bigFs * 0.16;
    ctx.strokeStyle = '#1a0a14';
    ctx.strokeText('PAUSED', W / 2, H / 2);
    ctx.fillStyle = '#ffd23f';
    ctx.fillText('PAUSED', W / 2, H / 2);
    const smallFs = Math.max(13, W * 0.032);
    ctx.font = `bold ${smallFs}px 'Courier New', monospace`;
    ctx.fillStyle = '#cfd8ff';
    ctx.fillText('TAP ▶ OR PRESS P TO RESUME', W / 2, H / 2 + bigFs * 0.7);
  }

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
    const m = mult();
    const label = `x${m}`;
    const lx = 10 + ctx.measureText(`SCORE ${game.score}`).width + 12;
    ctx.fillStyle = '#7bff9b';
    ctx.fillText(label, lx, fs * 1.4);
    // 3 pips show progress toward the next tier; full + gold once maxed
    const atMax = m >= 5;
    const filled = atMax ? 3 : game.streak % 3;
    const pr = fs * 0.09;
    const pipX = lx + ctx.measureText(label).width + 10;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(pipX + i * pr * 2.8, fs * 1.15, pr, 0, Math.PI * 2);
      ctx.fillStyle = atMax ? '#ffd700' : (i < filled ? '#7bff9b' : 'rgba(255,255,255,0.25)');
      ctx.fill();
    }
  }
  // lives
  ctx.fillStyle = '#ff5f7a';
  let hx = W / 2 - (game.lives * fs) / 2;
  for (let i = 0; i < game.lives; i++) {
    heart(hx + i * fs + fs / 2, fs * 1.15, fs * 0.42);
  }
  // paper count — pulses orange toward red as papers run low, and once
  // empty a pulsing hint nudges the player toward the nearest bundle
  ctx.textAlign = 'right';
  if (game.papers <= 0) {
    ctx.fillStyle = '#ff5555';
    ctx.fillText(`\u{1F4F0} ${game.papers}`, W - 10, fs * 1.4);
    const hintPulse = 0.5 + 0.5 * Math.sin(game.time * 6);
    const hfs = fs * 0.5;
    ctx.font = `bold ${hfs}px 'Courier New', monospace`;
    ctx.fillStyle = `rgba(255,150,60,${0.5 + 0.5 * hintPulse})`;
    ctx.fillText('GRAB A BUNDLE!', W - 10, fs * 1.4 + hfs * 1.3);
    ctx.font = `bold ${fs}px 'Courier New', monospace`;
  } else if (game.papers <= 3) {
    const pulse = 0.5 + 0.5 * Math.sin(game.time * 8);
    ctx.fillStyle = `rgb(255,${Math.round(160 - 100 * pulse)},${Math.round(80 - 80 * pulse)})`;
    ctx.fillText(`\u{1F4F0} ${game.papers}`, W - 10, fs * 1.4);
  } else {
    ctx.fillStyle = '#fff';
    ctx.fillText(`\u{1F4F0} ${game.papers}`, W - 10, fs * 1.4);
  }
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
    Music.init();
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

/* ---------- input mode: touch deck vs. desktop keyboard ----------
 * A real keydown means this is a keyboard user — the touch deck collapses
 * to a slim key-hint bar and the title prompt switches to key wording. A
 * pointerdown landing on the controls (a touch-screen laptop, say) flips
 * it back, live.
 */
function isDesktopMode() { return document.body.classList.contains('kbd-mode'); }
function usesFinePointer() { return !!(window.matchMedia && window.matchMedia('(pointer: fine)').matches); }
function updateInputModeUI() {
  if (game.mode === 'title') {
    overlayPrompt.textContent = isDesktopMode() ? 'PRESS SPACE TO RIDE' : 'TAP A MODE TO RIDE';
  }
}
window.addEventListener('keydown', () => {
  if (!isDesktopMode()) {
    document.body.classList.add('kbd-mode');
    updateInputModeUI();
  }
}, true);
controlsEl.addEventListener('pointerdown', () => {
  if (isDesktopMode()) {
    document.body.classList.remove('kbd-mode');
    updateInputModeUI();
  }
});

window.addEventListener('keydown', e => {
  if (e.repeat) return;
  // char select has its own arrow/Enter navigation and must keep working
  // even if a card/GO button currently has focus (e.g. via Tab) — so it
  // runs before the "don't drive the game while a button has focus" guard
  // below, which exists for other screens' buttons/inputs
  if (game.mode === 'select') {
    AudioFX.init();
    Music.init();
    switch (e.code) {
      case 'ArrowLeft': moveCharSel(-1); break;
      case 'ArrowRight': moveCharSel(1); break;
      case 'ArrowUp': moveCharSel(-2); break;
      case 'ArrowDown': moveCharSel(2); break;
      case 'Enter': case 'Space': confirmCharSelection(); break;
    }
    return;
  }
  // typing a leaderboard name must not drive the game
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON')) return;
  // on game over the panel's buttons drive the flow, not Space/Enter
  if (game.mode === 'gameover' && (e.code === 'Space' || e.code === 'Enter')) return;
  AudioFX.init();
  Music.init();
  switch (e.code) {
    case 'ArrowLeft': case 'KeyA': steer.left = true; applySteer(); break;
    case 'ArrowRight': case 'KeyD': steer.right = true; applySteer(); break;
    case 'KeyZ': case 'KeyJ': throwPaper(-1); break;
    case 'KeyX': case 'KeyK': throwPaper(1); break;
    case 'KeyP': case 'Escape': togglePause(); break;
    case 'Space': case 'Enter':
      overlayAction();
      break;
    case 'KeyY':
      if (game.mode === 'title') startDailyFlow();
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
  // let the leaderboard panel's input/buttons and the title screen's two
  // mode buttons work normally — this handler only drives the tap-anywhere
  // level-transition cards now
  if (e.target.closest && (e.target.closest('#lbPanel') || e.target.closest('#titleButtons'))) return;
  e.preventDefault();
  AudioFX.init();
  Music.init();
  if (game.mode === 'levelup' || game.mode === 'roundfail') overlayAction();
});

endlessBtn.addEventListener('pointerdown', e => {
  e.preventDefault();
  e.stopPropagation();
  AudioFX.init();
  Music.init();
  startEndlessFlow();
});
dailyBtn.addEventListener('pointerdown', e => {
  e.preventDefault();
  e.stopPropagation();
  AudioFX.init();
  Music.init();
  startDailyFlow();
});

document.getElementById('playAgainBtn').addEventListener('click', () => {
  AudioFX.init();
  Music.init();
  startGame();
});
document.getElementById('changeRiderBtn').addEventListener('click', () => {
  AudioFX.init();
  Music.init();
  showCharSelect();
});
document.getElementById('shareBtn').addEventListener('click', () => shareScore());
LeaderboardUI.init();

/* ---------- mute + pause buttons ---------- */
muteBtn.addEventListener('pointerdown', e => {
  e.preventDefault();
  e.stopPropagation();
  AudioFX.init();
  Music.init();
  const m = Music.toggleMute();
  AudioFX.muted = m;
  muteBtn.textContent = m ? '\u{1F507}' : '\u{1F50A}';
});
pauseBtn.addEventListener('pointerdown', e => {
  e.preventDefault();
  e.stopPropagation();
  AudioFX.init();
  Music.init();
  togglePause();
});
// sync the button + AudioFX to whatever was persisted last session
AudioFX.muted = Music.muted;
muteBtn.textContent = Music.muted ? '\u{1F507}' : '\u{1F50A}';

// tab hidden mid-run: pause rather than let the world run unattended
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.mode === 'playing' && !game.paused) setPaused(true);
});

/* ---------- character select screen ----------
 * Confirming a rider is two different flows depending on pointer type:
 *  - fine pointer (mouse/trackpad): a plain click on an unlocked card
 *    starts the run immediately, same as before this wave.
 *  - coarse pointer (touch): the first tap only *selects* a card (blue
 *    border, GO! button appears) — a stray scroll-tap can no longer launch
 *    a run by accident. A second tap, on GO or on the same card again,
 *    confirms. Arrow keys + Enter drive the same selection state.
 */
const pips = (n, max = 5) => '●'.repeat(n) + '○'.repeat(max - n);
let pendingCharId = null; // selected-but-not-yet-confirmed rider (two-step flow)
let charSelIndex = 0;     // keyboard cursor into CHARACTERS

function unlockRequirementText(c) {
  if (c.unlockType === 'delivered') {
    return `${Math.min(progress.lifetimeDelivered, c.unlockAt)}/${c.unlockAt} PAPERS DELIVERED`;
  }
  if (c.unlockType === 'level') return `REACH LEVEL ${c.unlockAt}`;
  return '';
}

function focusCharCard(id) {
  charSelectGrid.querySelectorAll('.charCard').forEach(el => {
    el.classList.toggle('selected', el.dataset.charId === id);
  });
}

// step one: highlight a card and reveal the GO! button, without starting
function selectCharCard(id) {
  const c = CHARACTERS.find(ch => ch.id === id);
  if (!c || !isUnlocked(c)) return;
  pendingCharId = id;
  const idx = CHARACTERS.findIndex(ch => ch.id === id);
  if (idx >= 0) charSelIndex = idx;
  focusCharCard(id);
  charGoBtn.classList.remove('hidden');
}

// tapping/pressing Enter on a card: select it, or confirm if it was already selected
function activateCard(id) {
  const c = CHARACTERS.find(ch => ch.id === id);
  if (!c || !isUnlocked(c)) return;
  AudioFX.init();
  Music.init();
  if (pendingCharId === id) pickCharacter(id);
  else selectCharCard(id);
}

function confirmCharSelection() {
  const c = CHARACTERS[charSelIndex];
  if (c) activateCard(c.id);
}

function moveCharSel(delta) {
  const n = CHARACTERS.length;
  charSelIndex = (charSelIndex + delta + n) % n;
  const c = CHARACTERS[charSelIndex];
  if (isUnlocked(c)) {
    selectCharCard(c.id);
  } else {
    // locked cards can be focused for keyboard nav, just not confirmed
    pendingCharId = null;
    focusCharCard(c.id);
    charGoBtn.classList.add('hidden');
  }
}

function populateCharSelect() {
  pendingCharId = null;
  charSelIndex = 0;
  charGoBtn.classList.add('hidden');
  charSelectGrid.innerHTML = '';
  for (const c of CHARACTERS) {
    const unlocked = isUnlocked(c);
    const card = document.createElement('button');
    card.className = 'charCard' + (unlocked ? '' : ' locked');
    card.dataset.charId = c.id;
    card.disabled = !unlocked;
    card.innerHTML = unlocked ? `
      <img class="charThumb" src="assets/${c.prefix}_straight.webp" alt="${c.name}" draggable="false">
      <div class="charName">${c.name}</div>
      <div class="charTag">${c.tagline}</div>
      <div class="charDesc">${c.desc}</div>
      <div class="charStats">
        <div class="charStatRow"><span>SPEED</span><span class="charPips">${pips(c.speedPips)}</span></div>
        <div class="charStatRow"><span>HANDLING</span><span class="charPips">${pips(c.handlingPips)}</span></div>
      </div>` : `
      <img class="charThumb" src="assets/${c.prefix}_straight.webp" alt="${c.name}" draggable="false">
      <div class="charName">${c.name}</div>
      <div class="charLockTag">\u{1F512} LOCKED</div>
      <div class="charReq">${unlockRequirementText(c)}</div>`;
    // fine pointer: a plain click starts the run immediately
    card.addEventListener('click', () => {
      if (!usesFinePointer() || !unlocked) return;
      AudioFX.init();
      Music.init();
      pickCharacter(c.id);
    });
    // coarse pointer: pointerdown drives the two-step select/confirm flow
    card.addEventListener('pointerdown', e => {
      if (usesFinePointer()) return; // the click handler above owns mouse/trackpad
      e.preventDefault();
      e.stopPropagation();
      if (!unlocked) return;
      activateCard(c.id);
    });
    charSelectGrid.appendChild(card);
  }
}
populateCharSelect();

charGoBtn.addEventListener('pointerdown', e => {
  e.preventDefault();
  e.stopPropagation();
  confirmCharSelection();
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

// flat sky fill above each skyline strip, sampled from the art so they meet
// seamlessly whatever the strip's top color is — one sample per skyline
// image (dusk/night share 'skyline', day uses 'skyline_day')
let skySamples = { skyline: '#1c2e5e', skyline_day: '#8fc7ff' };

function sampleSkyTopColor(key) {
  const sample = document.createElement('canvas');
  sample.width = sample.height = 4;
  const sctx = sample.getContext('2d');
  sctx.drawImage(sprites[key], 0, 0);
  const d = sctx.getImageData(1, 1, 1, 1).data;
  skySamples[key] = `rgb(${d[0]},${d[1]},${d[2]})`;
}

// darkens a sampled "rgb(r,g,b)" string for the night phase
function scaleRgbString(rgbStr, factor) {
  const m = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(rgbStr);
  if (!m) return rgbStr;
  const clamp = v => Math.max(0, Math.min(255, Math.round(v)));
  return `rgb(${clamp(m[1] * factor)},${clamp(m[2] * factor)},${clamp(m[3] * factor)})`;
}

function setLogoImg() {
  // real image if it has loaded, otherwise the placeholder canvas
  logoImg.src = sprites.logo instanceof HTMLImageElement ? sprites.logo.src : sprites.logo.toDataURL();
}

// sprites start out as placeholder canvases (drawn instantly) and get
// swapped for real art as each file finishes downloading, so the title
// screen and game are usable on the very first frame instead of waiting
// on every asset in the game to load.
sprites = loadSprites((key) => {
  if (key === 'skyline' || key === 'skyline_day') sampleSkyTopColor(key);
  if (key === 'logo') setLogoImg();
});
sampleSkyTopColor('skyline');
sampleSkyTopColor('skyline_day');
setLogoImg();
dailyNumSpan.textContent = String(game.dailyNumber);
resize();
updateInputModeUI(); // sets the title prompt's initial (touch-style) wording
Music.start('title'); // safe pre-gesture: just records intent until Music.init() resumes the context
requestAnimationFrame(frame);
resize();
