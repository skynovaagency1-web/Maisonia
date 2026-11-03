// Pilote SQLite pour Node.js (développement local et tests).
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

function nodeDriver(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  const dir = path.join(__dirname, '..', 'migrations');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) db.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
  const conv = (r) => ({ lastInsertRowid: Number(r.lastInsertRowid), changes: Number(r.changes) });
  return {
    one: async (sql, p) => db.prepare(sql).get(...p),
    all: async (sql, p) => db.prepare(sql).all(...p),
    run: async (sql, p) => conv(db.prepare(sql).run(...p)),
    batch: async (stmts) => {
      db.exec('BEGIN');
      try { for (const [sql, ...p] of stmts) db.prepare(sql).run(...p); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
}

module.exports = { nodeDriver };
