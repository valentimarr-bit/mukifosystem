// Imitação mínima do Cloudflare D1 sobre o SQLite do Node, para testar a API sem a Cloudflare.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

class Stmt {
  constructor(db, sql, params = []) { this.db = db; this.sql = sql; this.params = params; }
  bind(...p) { return new Stmt(this.db, this.sql, p); }
  async all() { return { results: this.db.prepare(this.sql).all(...this.params) }; }
  async first() { return this.db.prepare(this.sql).get(...this.params) ?? null; }
  async run() { const r = this.db.prepare(this.sql).run(...this.params); return { success: true, meta: { changes: Number(r.changes) } }; }
  runSync() { this.db.prepare(this.sql).run(...this.params); }
}

export function criarD1(arquivosSql = []) {
  const db = new DatabaseSync(':memory:');
  for (const f of arquivosSql) db.exec(readFileSync(f, 'utf-8'));
  return {
    prepare: (sql) => new Stmt(db, sql),
    async batch(stmts) {
      db.exec('BEGIN');
      try { for (const s of stmts) s.runSync(); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
      return stmts.map(() => ({ success: true }));
    },
  };
}
