// Pilote Cloudflare D1.
function d1Driver(getDb) {
  const prep = (sql, p) => getDb().prepare(sql).bind(...p.map((v) => (v === undefined ? null : v)));
  return {
    one: async (sql, p) => (await prep(sql, p).first()) ?? undefined,
    all: async (sql, p) => (await prep(sql, p).all()).results,
    run: async (sql, p) => {
      const r = await prep(sql, p).run();
      return { lastInsertRowid: r.meta.last_row_id, changes: r.meta.changes };
    },
    batch: async (stmts) => { await getDb().batch(stmts.map(([sql, ...p]) => prep(sql, p))); },
  };
}
module.exports = { d1Driver };
