/*
 * Paperoo — chiptune music engine.
 *
 * A tiny lookahead sequencer (setInterval tick + audioContext.currentTime
 * scheduling, same pattern AudioFX would use) that loops an 8-bar tune at
 * 112bpm over C -F -G -C -Am -F -Bb -C — a I IV V I vi IV bVII I turnaround,
 * mixolydian-flavoured by that closing bVII (Bb) chord, resolving home on
 * beat 1 of bar 8. The lead melody itself never leaves the C major
 * pentatonic (C D E G A), so however it's harmonised underneath it can't
 * land sour.
 *
 * Two loops share the same melody/harmony:
 *   'title' — mellow: square lead (soft) + a long sine pad/echo, no drums.
 *   'game'  — full: square lead + triangle bass locked to the chord roots +
 *             kick/hat percussion on a driving 8th-note pulse.
 * setIntensity(0..3) opens up the hat pattern and adds four-on-the-floor
 * kicks as the level climbs, so later streets feel hotter.
 */

'use strict';

const MUSIC_BPM = 112;
const MUSIC_STEPS_PER_BAR = 8;      // eighth notes per bar
const MUSIC_BARS = 8;
const MUSIC_TOTAL_STEPS = MUSIC_STEPS_PER_BAR * MUSIC_BARS;
const MUSIC_STEP_DUR = 60 / MUSIC_BPM / 2; // seconds per eighth note
const MUSIC_LOOKAHEAD_MS = 25;
const MUSIC_SCHEDULE_AHEAD = 0.1;   // seconds

const midiToFreq = m => 440 * Math.pow(2, (m - 69) / 12);

// chord roots per bar, bass octave: C F G C Am F Bb C — the closing Bb (bVII)
// is the mixolydian colour, melody never touches it so it can't sour the tune
const MUSIC_CHORD_ROOTS = [36, 41, 43, 36, 45, 41, 46, 36];

// lead melody: one entry per eighth note (8 bars x 8 steps), null = rest.
// strictly C major pentatonic (C4=60 D4=62 E4=64 G4=67 A4=69, C5=72) —
// a bouncy little "paperboy at dawn" phrase that lands back on C4 in bar 8.
const MUSIC_LEAD = [
  // bar1 (C)
  64, 67, 64, 62, 60, null, 62, 64,
  // bar2 (F)
  67, 69, 67, 64, 62, null, null, 64,
  // bar3 (G)
  67, 69, 72, 69, 67, null, 64, 67,
  // bar4 (C) — phrase breather
  64, 62, 60, null, 60, null, null, null,
  // bar5 (Am)
  69, 72, 69, 67, 64, null, 69, 67,
  // bar6 (F)
  69, 67, 64, 62, 60, null, 62, 64,
  // bar7 (Bb) — mixolydian colour under a scale-safe melody
  67, 69, 67, 62, 64, null, 62, 60,
  // bar8 (C) — resolves home, held
  62, 64, 62, 60, 60, null, null, null,
];

// bass: octave-bounce on the bar's chord root (null = rest, 0 = root, 1 = root+12)
const MUSIC_BASS_PATTERN = [0, null, 1, null, 0, null, 1, null];

const Music = {
  ctx: null,
  master: null,
  masterVol: 0.25,
  muted: localStorage.getItem('paperoo_muted') === '1',

  playing: false,
  kind: null,          // 'title' | 'game' | null — active or requested loop
  pendingKind: null,    // requested before the audio context could run
  intensity: 0,         // 0..3, game loop only

  step: 0,
  nextNoteTime: 0,
  noteCount: 0,          // bumped every scheduled step — proof the sequencer is alive
  timerId: null,

  // must be safe to call before any user gesture: just records what should
  // play once init() (called from the same gesture handlers as AudioFX.init)
  // actually gets a running context.
  start(kind) {
    if (kind !== 'title' && kind !== 'game') return;
    this.kind = kind;
    if (!this.ctx || this.ctx.state !== 'running') {
      this.pendingKind = kind;
      return;
    }
    this._begin(kind);
  },

  stop() {
    if (this.timerId) { clearInterval(this.timerId); this.timerId = null; }
    this.playing = false;
    this.pendingKind = null;
  },

  setIntensity(n) {
    this.intensity = Math.max(0, Math.min(3, Math.round(n) || 0));
  },

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem('paperoo_muted', this.muted ? '1' : '0');
    if (this.master) this.master.gain.value = this.muted ? 0 : this.masterVol;
    return this.muted;
  },

  // called from the same gesture handlers that call AudioFX.init() — creates
  // (once) and resumes the shared AudioContext, then starts whatever loop
  // was requested via start() before the gesture arrived.
  init() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
      if (this.ctx) {
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : this.masterVol;
        this.master.connect(this.ctx.destination);
      }
    }
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (this.ctx.state === 'running' && this.pendingKind && !this.playing) {
      this._begin(this.pendingKind);
      this.pendingKind = null;
    }
  },

  // pause/resume: used while the game is paused so the loop freezes in
  // place rather than restarting from bar 1 when play resumes.
  pause() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
  },
  resume() {
    if (this.ctx && this.playing && this.ctx.state === 'suspended') this.ctx.resume();
  },

  _begin(kind) {
    if (this.timerId) clearInterval(this.timerId);
    this.kind = kind;
    this.playing = true;
    this.step = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.05;
    this.timerId = setInterval(() => this._scheduler(), MUSIC_LOOKAHEAD_MS);
  },

  _scheduler() {
    if (!this.ctx) return;
    while (this.nextNoteTime < this.ctx.currentTime + MUSIC_SCHEDULE_AHEAD) {
      this._scheduleStep(this.step, this.nextNoteTime);
      this.noteCount++;
      this.nextNoteTime += MUSIC_STEP_DUR;
      this.step = (this.step + 1) % MUSIC_TOTAL_STEPS;
    }
  },

  _scheduleStep(step, t) {
    const bar = Math.floor(step / MUSIC_STEPS_PER_BAR);
    const beat = step % MUSIC_STEPS_PER_BAR;

    const note = MUSIC_LEAD[step];
    if (note != null) this._lead(note, t, this.kind === 'title');

    if (this.kind === 'game') {
      const root = MUSIC_CHORD_ROOTS[bar];
      const off = MUSIC_BASS_PATTERN[beat];
      if (off != null) this._bass(root + off * 12, t);

      // driving 8th-note pulse; intensity opens up the hats and adds a
      // four-on-the-floor kick so later levels feel hotter
      if (beat === 0 || beat === 4 || (this.intensity >= 2 && (beat === 2 || beat === 6))) {
        this._kick(t);
      }
      const hatOn = this.intensity >= 1 || beat % 2 === 1;
      if (hatOn) this._hat(t, 0.5);
      if (this.intensity >= 3) this._hat(t + MUSIC_STEP_DUR / 2, 0.28); // 16th-note fill
    } else if (this.kind === 'title' && beat === 0) {
      // soft pad/echo, title screen only — one long warm chord tone per bar
      this._pad(MUSIC_CHORD_ROOTS[bar] + 12, t);
    }
  },

  _lead(midi, t, soft) {
    if (this.muted || !this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(midiToFreq(midi), t);
    const vol = soft ? 0.1 : 0.16;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + MUSIC_STEP_DUR * 0.9);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + MUSIC_STEP_DUR);
  },

  _bass(midi, t) {
    if (this.muted || !this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(midiToFreq(midi), t);
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + MUSIC_STEP_DUR * 1.6);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + MUSIC_STEP_DUR * 1.6);
  },

  _kick(t) {
    if (this.muted || !this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.09);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.13);
  },

  _hat(t, vol) {
    if (this.muted || !this.ctx) return;
    const len = 0.045;
    const buf = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * len), this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'highpass';
    filt.frequency.value = 6000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(filt).connect(g).connect(this.master);
    src.start(t);
  },

  _pad(midi, t) {
    if (this.muted || !this.ctx) return;
    const barDur = MUSIC_STEP_DUR * MUSIC_STEPS_PER_BAR;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(midiToFreq(midi), t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.07, t + 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t + barDur * 0.95);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + barDur);
    // a soft delayed echo repeat is what makes it read as a pad, not a beep
    const o2 = this.ctx.createOscillator();
    const g2 = this.ctx.createGain();
    o2.type = 'sine';
    o2.frequency.setValueAtTime(midiToFreq(midi), t + 0.28);
    g2.gain.setValueAtTime(0.0001, t + 0.28);
    g2.gain.linearRampToValueAtTime(0.03, t + 0.5);
    g2.gain.linearRampToValueAtTime(0.0001, t + barDur);
    o2.connect(g2).connect(this.master);
    o2.start(t + 0.28);
    o2.stop(t + barDur + 0.28);
  },
};
