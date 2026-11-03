// Accès base de données asynchrone, identique sur Node (node:sqlite) et Cloudflare (D1).
// Le pilote est branché au démarrage par src/server.js (Node) ou src/worker.js (Cloudflare).
let driver = null;
const setDriver = (d) => { driver = d; };

const one = (sql, ...p) => driver.one(sql, p);
const all = (sql, ...p) => driver.all(sql, p);
const run = (sql, ...p) => driver.run(sql, p); // → { lastInsertRowid, changes }
// Exécute plusieurs requêtes [sql, ...params] de façon atomique.
const batch = (stmts) => (stmts.length ? driver.batch(stmts) : Promise.resolve());

module.exports = { setDriver, one, all, run, batch };
