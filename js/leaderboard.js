/*
 * Leaderboard client + game-over panel UI.
 *
 * Scores always persist locally (localStorage). When window.LEADERBOARD_URL
 * is set, they also sync to a remote score API with this contract:
 *   GET  url            -> { scores: [{ name, score, level }, ...] }  (sorted desc)
 *   POST url (text/plain JSON body { name, score, level })
 *                       -> { ok: true, scores: [...] }
 * POST uses text/plain so the request stays "simple" and needs no CORS
 * preflight — Google Apps Script web apps can't answer OPTIONS.
 */

'use strict';

const Leaderboard = {
  KEY: 'paperperson_scores',
  NAME_KEY: 'paperperson_name',
  url: (typeof window !== 'undefined' && window.LEADERBOARD_URL) || '',

  localScores() {
    try { return JSON.parse(localStorage.getItem(this.KEY)) || []; } catch (e) { return []; }
  },
  saveLocal(entry) {
    const list = this.localScores();
    list.push(entry);
    list.sort((a, b) => b.score - a.score);
    localStorage.setItem(this.KEY, JSON.stringify(list.slice(0, 25)));
  },
  async fetchTop() {
    if (!this.url) return { remote: false, scores: this.localScores() };
    const res = await fetch(this.url);
    const data = await res.json();
    return { remote: true, scores: data.scores || [] };
  },
  async submit(entry) {
    this.saveLocal(entry);
    if (!this.url) return { remote: false, scores: this.localScores() };
    const res = await fetch(this.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(entry),
    });
    const data = await res.json();
    return { remote: true, scores: data.scores || [] };
  },
};

/* ---------- game-over panel ---------- */
const LeaderboardUI = {
  panel: null, input: null, submitBtn: null, list: null, heading: null,
  pending: null, // { score, level } awaiting submission

  init() {
    this.panel = document.getElementById('lbPanel');
    this.input = document.getElementById('nameInput');
    this.submitBtn = document.getElementById('submitScoreBtn');
    this.list = document.getElementById('lbList');
    this.heading = document.getElementById('lbHeading');
    this.submitBtn.addEventListener('click', () => this.doSubmit());
    this.input.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') this.doSubmit();
    });
  },

  show(score, level) {
    this.pending = { score, level };
    this.panel.classList.remove('hidden');
    this.input.value = localStorage.getItem(Leaderboard.NAME_KEY) || '';
    this.input.disabled = false;
    this.submitBtn.disabled = false;
    this.submitBtn.textContent = 'SUBMIT';
    this.heading.textContent = Leaderboard.url ? 'TOP SCORES' : 'LOCAL SCORES';
    this.render(Leaderboard.localScores(), null);
    // show the current board right away while the network round-trip runs
    Leaderboard.fetchTop()
      .then(r => { if (this.pending) this.render(r.scores, null); })
      .catch(() => {});
  },

  hide() {
    this.pending = null;
    this.panel.classList.add('hidden');
  },

  async doSubmit() {
    if (!this.pending || this.submitBtn.disabled) return;
    const name = (this.input.value.trim().toUpperCase() || 'ANON').slice(0, 12);
    localStorage.setItem(Leaderboard.NAME_KEY, name);
    const entry = { name, score: this.pending.score, level: this.pending.level };
    this.input.disabled = true;
    this.submitBtn.disabled = true;
    this.submitBtn.textContent = '...';
    try {
      const r = await Leaderboard.submit(entry);
      this.submitBtn.textContent = r.remote ? 'SENT!' : 'SAVED';
      this.render(r.scores, entry);
    } catch (e) {
      this.submitBtn.textContent = 'SAVED LOCALLY';
      this.heading.textContent = 'OFFLINE — LOCAL SCORES';
      this.render(Leaderboard.localScores(), entry);
    }
  },

  render(scores, highlight) {
    this.list.innerHTML = '';
    const top = scores.slice(0, 10);
    top.forEach((s, i) => {
      const li = document.createElement('li');
      const isYou = highlight && s.name === highlight.name && s.score === highlight.score;
      li.className = isYou ? 'you' : '';
      const rank = document.createElement('span');
      rank.textContent = String(i + 1).padStart(2, ' ') + '.';
      const name = document.createElement('span');
      name.className = 'lbName';
      name.textContent = s.name;
      const score = document.createElement('span');
      score.className = 'lbScore';
      score.textContent = s.score;
      li.append(rank, name, score);
      this.list.appendChild(li);
    });
    if (!top.length) {
      const li = document.createElement('li');
      li.textContent = 'NO SCORES YET — BE FIRST!';
      this.list.appendChild(li);
    }
  },
};
