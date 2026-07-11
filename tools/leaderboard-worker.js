/**
 * Paper Person global leaderboard — Cloudflare Worker + D1.
 *
 * Setup (dashboard only, no CLI, ~5 minutes):
 *  1. Cloudflare dashboard -> Storage & Databases -> D1 -> Create database
 *     (name it e.g. "paperperson").
 *  2. Workers & Pages -> Create -> Worker (any name, e.g.
 *     "paperperson-scores") -> Deploy the hello-world.
 *  3. Open the worker -> Settings -> Bindings -> Add ->
 *     D1 database, Variable name: DB, pick the database -> Save.
 *  4. Edit code -> replace everything with this file -> Deploy.
 *  5. Copy the worker URL (https://<name>.<account>.workers.dev) into
 *     js/config.js as LEADERBOARD_URL, commit, push.
 *
 * API (matches js/leaderboard.js):
 *   GET  -> { scores: [{ name, score, level }, ...] } top 25, best first
 *   POST JSON { name, score, level } -> { ok: true, scores: [...] }
 *
 * The table is created automatically on first use. Input is sanitized and
 * clamped server-side; only the top 500 scores are kept. It's a friendly
 * arcade board, not a tamper-proof one — you can delete rows in the D1
 * console (Storage & Databases -> D1 -> your database -> scores table).
 */

const TOP_N = 25;
const KEEP_ROWS = 500;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

let tableReady = false;
async function ensureTable(db) {
  if (tableReady) return;
  await db.exec(
    'CREATE TABLE IF NOT EXISTS scores (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, score INTEGER NOT NULL, level INTEGER NOT NULL, created_at TEXT NOT NULL)'
  );
  tableReady = true;
}

async function topScores(db) {
  const { results } = await db
    .prepare('SELECT name, score, level FROM scores ORDER BY score DESC, id ASC LIMIT ?')
    .bind(TOP_N)
    .all();
  return results;
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

    try {
      await ensureTable(env.DB);

      if (req.method === 'GET') {
        return json({ scores: await topScores(env.DB) });
      }

      if (req.method === 'POST') {
        let data = {};
        try { data = await req.json(); } catch (e) {}
        const name = String(data.name || 'ANON')
          .replace(/[^\w \-\.\!\?]/g, '').slice(0, 12) || 'ANON';
        const score = Math.max(0, Math.min(99999999, Math.floor(Number(data.score) || 0)));
        const level = Math.max(1, Math.min(99, Math.floor(Number(data.level) || 1)));

        await env.DB
          .prepare('INSERT INTO scores (name, score, level, created_at) VALUES (?, ?, ?, ?)')
          .bind(name, score, level, new Date().toISOString())
          .run();
        // keep only the best KEEP_ROWS entries
        await env.DB
          .prepare('DELETE FROM scores WHERE id NOT IN (SELECT id FROM scores ORDER BY score DESC, id ASC LIMIT ?)')
          .bind(KEEP_ROWS)
          .run();

        return json({ ok: true, scores: await topScores(env.DB) });
      }

      return json({ error: 'method not allowed' }, 405);
    } catch (err) {
      return json({ error: String(err) }, 500);
    }
  },
};
