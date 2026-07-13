/**
 * Paperoo global leaderboard — Cloudflare Worker + D1.
 *
 * Setup (dashboard only, no CLI, ~5 minutes):
 *  1. Cloudflare dashboard -> Storage & Databases -> D1 -> Create database
 *     (name it e.g. "paperoo").
 *  2. Workers & Pages -> Create -> Worker (any name, e.g.
 *     "paperoo-scores") -> Deploy the hello-world.
 *  3. Open the worker -> Settings -> Bindings -> Add ->
 *     D1 database, Variable name: DB, pick the database -> Save.
 *  4. Edit code -> replace everything with this file -> Deploy.
 *  5. Copy the worker URL (https://<name>.<account>.workers.dev) into
 *     js/config.js as LEADERBOARD_URL, commit, push.
 *
 * API (matches js/leaderboard.js):
 *   GET  ?board=B -> { scores: [{ name, score, level }, ...] } top 25, best first
 *                    board defaults to 'global' when omitted
 *   POST JSON { name, score, level, board } -> { ok: true, scores: [...], rank }
 *     board is 'global' (endless) or 'daily-YYYYMMDD' (a Daily Route);
 *     anything else falls back to 'global'. rank is the submitter's 1-based
 *     placement within that board (ties broken by submission order).
 *
 * The table is created automatically on first use, including a migration
 * for boards deployed before the `board` column existed. Input is sanitized
 * and clamped server-side; only the top KEEP_ROWS scores PER BOARD are kept,
 * so a busy daily board can't crowd out the global board's history (or vice
 * versa). It's a friendly arcade board, not a tamper-proof one — you can
 * delete rows in the D1 console (Storage & Databases -> D1 -> your
 * database -> scores table).
 */

const TOP_N = 25;
const KEEP_ROWS = 500;
const BOARD_RE = /^(global|daily-\d{8})$/;

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

function sanitizeBoard(raw) {
  const s = String(raw || '');
  return BOARD_RE.test(s) ? s : 'global';
}

let tableReady = false;
async function ensureTable(db) {
  if (tableReady) return;
  await db.exec(
    "CREATE TABLE IF NOT EXISTS scores (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, score INTEGER NOT NULL, level INTEGER NOT NULL, created_at TEXT NOT NULL, board TEXT NOT NULL DEFAULT 'global')"
  );
  // backward-compat migration: worker deployments from before the Daily
  // Route feature have a `scores` table with no `board` column. ALTER TABLE
  // throws if the column is already there (fresh DBs created by the
  // CREATE TABLE above already have it) — that failure is expected and safe
  // to swallow, it just means this DB has already been migrated.
  try {
    await db.exec("ALTER TABLE scores ADD COLUMN board TEXT NOT NULL DEFAULT 'global'");
  } catch (e) { /* column already exists */ }
  tableReady = true;
}

async function topScores(db, board) {
  const { results } = await db
    .prepare('SELECT name, score, level FROM scores WHERE board = ? ORDER BY score DESC, id ASC LIMIT ?')
    .bind(board, TOP_N)
    .all();
  return results;
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

    try {
      await ensureTable(env.DB);
      const url = new URL(req.url);

      if (req.method === 'GET') {
        const board = sanitizeBoard(url.searchParams.get('board'));
        return json({ scores: await topScores(env.DB, board) });
      }

      if (req.method === 'POST') {
        let data = {};
        try { data = await req.json(); } catch (e) {}
        const name = String(data.name || 'ANON')
          .replace(/[^\w \-\.\!\?]/g, '').slice(0, 12) || 'ANON';
        const score = Math.max(0, Math.min(99999999, Math.floor(Number(data.score) || 0)));
        const level = Math.max(1, Math.min(99, Math.floor(Number(data.level) || 1)));
        const board = sanitizeBoard(data.board);

        const inserted = await env.DB
          .prepare('INSERT INTO scores (name, score, level, created_at, board) VALUES (?, ?, ?, ?, ?)')
          .bind(name, score, level, new Date().toISOString(), board)
          .run();
        const newId = inserted.meta && inserted.meta.last_row_id;

        // keep only the best KEEP_ROWS entries for THIS board
        await env.DB
          .prepare('DELETE FROM scores WHERE board = ? AND id NOT IN (SELECT id FROM scores WHERE board = ? ORDER BY score DESC, id ASC LIMIT ?)')
          .bind(board, board, KEEP_ROWS)
          .run();

        // 1-based rank among this board's scores, same ordering as
        // topScores (higher score first, earlier submission breaks ties)
        let rank = null;
        if (newId != null) {
          const row = await env.DB
            .prepare('SELECT COUNT(*) AS n FROM scores WHERE board = ? AND (score > ? OR (score = ? AND id < ?))')
            .bind(board, score, score, newId)
            .first();
          if (row) rank = row.n + 1;
        }

        return json({ ok: true, scores: await topScores(env.DB, board), rank });
      }

      return json({ error: 'method not allowed' }, 405);
    } catch (err) {
      return json({ error: String(err) }, 500);
    }
  },
};
