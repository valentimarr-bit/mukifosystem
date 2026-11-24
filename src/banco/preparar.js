// Monta o banco sozinho: aplica migrações pendentes e, se o banco estava vazio, carrega a planilha (seed).
// Cada etapa roda num lote do D1 (tudo ou nada); a linha em _mukifo_migracao impede rodar duas vezes.
import { MIGRACOES, SEED } from './sql.js';
import { categoriaDoProduto } from '../dominio/categorias.js';

const prontos = new WeakMap(); // uma vez por banco em cada instância do Worker

export function prepararBanco(db) {
  if (!prontos.has(db)) prontos.set(db, executar(db).catch((e) => { prontos.delete(db); throw e; }));
  return prontos.get(db);
}

async function executar(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS _mukifo_migracao (
    nome TEXT PRIMARY KEY, aplicada_em TEXT NOT NULL DEFAULT (datetime('now')))`).run();
  const { results } = await db.prepare('SELECT nome FROM _mukifo_migracao').all();
  const feitas = new Set(results.map((r) => r.nome));

  // Banco montado antes pelo terminal (wrangler d1 migrations): aproveita o registro dele.
  if (!feitas.size) {
    const ja = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='insumo'").first();
    if (ja) {
      const reg = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='d1_migrations'").first();
      const nomes = reg ? (await db.prepare('SELECT name FROM d1_migrations').all()).results.map((r) => r.name) : MIGRACOES.map((m) => m.nome);
      for (const n of [...nomes, 'seed']) feitas.add(n);
      await db.batch([...feitas].map((n) => db.prepare('INSERT OR IGNORE INTO _mukifo_migracao (nome) VALUES (?)').bind(n)));
    }
  }

  for (const m of MIGRACOES) {
    if (feitas.has(m.nome)) continue;
    await lote(db, m.nome, m.comandos);
  }
  if (!feitas.has('seed')) await lote(db, 'seed', SEED);

  // Passo de dados (uma vez): sugere categoria para os produtos que ainda não têm. O gerente ajusta depois.
  if (!feitas.has('categorias-v1')) {
    const { results } = await db.prepare('SELECT id, nome FROM produto WHERE categoria IS NULL').all();
    const upd = results.map((p) => db.prepare('UPDATE produto SET categoria = ? WHERE id = ?').bind(categoriaDoProduto(p.nome), p.id));
    await db.batch([db.prepare("INSERT INTO _mukifo_migracao (nome) VALUES ('categorias-v1')"), ...upd]).catch(async (e) => {
      if (!(await db.prepare("SELECT 1 AS ok FROM _mukifo_migracao WHERE nome = 'categorias-v1'").first())) throw e;
    });
  }
}

async function lote(db, nome, comandos) {
  try {
    // A marcação vem primeiro: se outra requisição já aplicou, a chave repetida desfaz o lote inteiro.
    await db.batch([db.prepare('INSERT INTO _mukifo_migracao (nome) VALUES (?)').bind(nome), ...comandos.map((c) => db.prepare(c))]);
  } catch (e) {
    const ja = await db.prepare('SELECT 1 AS ok FROM _mukifo_migracao WHERE nome = ?').bind(nome).first();
    if (!ja) throw new Error(`Falha ao preparar o banco (${nome}): ${e?.message ?? e}`);
  }
}
