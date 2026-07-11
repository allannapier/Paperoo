/**
 * Paperoo global leaderboard — Google Apps Script web app.
 *
 * Setup (once, ~5 minutes):
 *  1. Create a Google Sheet (sheets.new), any name.
 *  2. Extensions -> Apps Script, replace the default code with this file, save.
 *  3. Deploy -> New deployment -> type "Web app"
 *       Execute as: Me
 *       Who has access: Anyone
 *     Deploy, authorize, and copy the web app URL.
 *  4. Paste that URL into js/config.js as LEADERBOARD_URL and push.
 *
 * API (matches js/leaderboard.js):
 *   GET  -> { scores: [{ name, score, level }, ...] } top 25, best first
 *   POST text/plain JSON { name, score, level } -> { ok: true, scores: [...] }
 *
 * Input is sanitized and clamped server-side. This is a friendly arcade
 * board, not a tamper-proof one — determined cheaters can post fake scores,
 * and you can delete any row straight from the sheet.
 */

const SHEET_NAME = 'scores';
const TOP_N = 25;
const MAX_ROWS = 2000; // oldest rows beyond this are dropped

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(['name', 'score', 'level', 'when']);
  }
  return sh;
}

function top_() {
  const rows = sheet_().getDataRange().getValues().slice(1);
  rows.sort(function (a, b) { return b[1] - a[1]; });
  return rows.slice(0, TOP_N).map(function (r) {
    return { name: String(r[0]), score: Number(r[1]), level: Number(r[2]) };
  });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return json_({ scores: top_() });
}

function doPost(e) {
  let data = {};
  try { data = JSON.parse(e.postData.contents); } catch (err) {}
  const name = String(data.name || 'ANON')
    .replace(/[^\w \-\.\!\?]/g, '').slice(0, 12) || 'ANON';
  const score = Math.max(0, Math.min(99999999, Math.floor(Number(data.score) || 0)));
  const level = Math.max(1, Math.min(99, Math.floor(Number(data.level) || 1)));

  const lock = LockService.getScriptLock();
  lock.tryLock(5000);
  try {
    const sh = sheet_();
    sh.appendRow([name, score, level, new Date()]);
    const extra = sh.getLastRow() - 1 - MAX_ROWS;
    if (extra > 0) sh.deleteRows(2, extra); // rows are chronological; drop oldest
  } finally {
    lock.releaseLock();
  }
  return json_({ ok: true, scores: top_() });
}
