// Campeonato justo: score (Elo), níveis, chave por nível, séries e repescagem por recompra.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import worker from '../src/worker.js';
import { criarD1 } from './d1-falso.js';
import { gerarChave, novoScore, nivelDoScore, dividirEmSeries, gruposRepescagem, calcularScores } from '../src/dominio/chaves.js';

const arq = (p) => fileURLToPath(new URL(p, import.meta.url));
const env = { DB: criarD1(['0001_inicial', '0002_lista_compras', '0003_usuarios', '0004_fotos', '0005_alerta_estoque', '0006_venda', '0007_cliente', '0008_combos', '0009_trava_estoque', '0010_estoque_recomendado', '0011_indices', '0012_financeiro', '0013_clientes_e_dias', '0014_indices_estoque', '0015_recuperar_senha', '0016_auditoria', '0017_tempo_preparo', '0018_pronta_entrega', '0019_entrega_parcial', '0020_carteira', '0021_item_pronto', '0022_campeonato', '0023_gateway', '0024_sinuca', '0025_nota_fiscal', '0026_fiscal', '0027_pix_monitor', '0028_canais', '0029_whatsapp', '0030_consentimento_whats', '0031_campeonato_nivel'].map((m) => arq(`../migrations/${m}.sql`))), ADMIN_TOKEN: 'segredo-teste', ASSETS: { fetch: () => new Response('x') } };
const chamar = async (caminho, metodo = 'GET', corpo) => {
  const r = await worker.fetch(new Request('https://mukifo.test' + caminho, { method: metodo, body: corpo ? JSON.stringify(corpo) : undefined, headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '7.7.7.7', authorization: 'Bearer segredo-teste' } }), env);
  return { status: r.status, corpo: await r.json() };
};
const G = '/api/campeonato/gestao';
const um = (q, ...b) => env.DB.prepare(q).bind(...b).first();
const todos = async (q, ...b) => (await env.DB.prepare(q).bind(...b).all()).results;
const enc = encodeURIComponent;

test('funções puras: chave por nível, score, níveis, séries e grupos', () => {
  const c = gerarChave(['a', 'b', 'c', 'd', 'e', 'f'], { modo: 'nivel' });
  const r1 = c.partidas.filter((p) => p.fase === 1).map((p) => [p.a, p.b].join('-'));
  assert.deepEqual(r1.filter((x) => !x.endsWith('-')).sort(), ['c-d', 'e-f']);          // 1ª rodada entre vizinhos de nível
  assert.deepEqual(r1.filter((x) => x.endsWith('-')).sort(), ['a-', 'b-']);              // os dois melhores folgam
  const pos = (j) => c.partidas.find((p) => p.fase === 1 && p.a === j).pos;
  assert.notEqual(pos('a') >> 1, pos('b') >> 1);                                         // e só se cruzam na final
  const [a, b] = novoScore(1000, 1200, true, 20, 20); assert.ok(a - 1000 > 15 && 1200 - b > 15);   // zebra vale muito
  const [a2] = novoScore(1200, 1000, true, 20, 20); assert.ok(a2 - 1200 < 9);                       // favorito ganha pouco
  assert.equal(nivelDoScore(1500, 2).nome, 'Novato');
  assert.equal(nivelDoScore(1000, 5).nome, 'Bronze'); assert.equal(nivelDoScore(1100, 5).nome, 'Ouro'); assert.equal(nivelDoScore(1400, 9).nome, 'Diamante');
  assert.deepEqual(dividirEmSeries([1, 2, 3, 4, 5], 2), [[1, 2, 3], [4, 5]]);
  assert.deepEqual(gruposRepescagem([1, 2, 3, 4], 2), [[1, 4], [2, 3]]);
  const t = calcularScores([{ a: 'x', b: 'y', nomeA: 'X', nomeB: 'Y', aVenceu: true }, { a: 'x', b: 'y', nomeA: 'X', nomeB: 'Y', aVenceu: true }]);
  assert.equal(t.get('x').vitorias, 2); assert.equal(t.get('y').jogos, 2); assert.ok(t.get('x').score > 1000 && t.get('y').score < 1000);
});

async function modalidade(cfg, nomes) {
  const camp = (await chamar(`${G}/campeonatos`, 'POST', { nome: 'Copa' })).corpo.id;
  const r = await chamar(`${G}/campeonatos/${camp}/modalidades`, 'POST', { nome: 'Bola 8', taxa: 10, ...cfg }); assert.equal(r.status, 201, JSON.stringify(r.corpo));
  const ids = {};
  for (const n of nomes) ids[n] = (await chamar(`${G}/modalidades/${r.corpo.id}/inscrever`, 'POST', { nome: n })).corpo.id;
  return { mod: r.corpo.id, ids };
}
const placar = (id, a, b) => chamar(`${G}/partidas/${enc(id)}/placar`, 'POST', { placar_a: a, placar_b: b, finalizar: true });

test('chave por nível + repescagem por recompra: vaga reservada na 2ª rodada, recompra soma ao prêmio, score sobe', async () => {
  for (const [n, s] of [['Ana', 1300], ['Bia', 1200], ['Caio', 1100], ['Duda', 1000], ['Edu', 950], ['Fabi', 900]])
    await env.DB.prepare('INSERT INTO jogador_score (chave, nome, score, jogos, vitorias) VALUES (?, ?, ?, 10, 5)').bind(`n:${n.toLowerCase()}`, n, s).run();
  const cx = (await chamar(`${G}/campeonatos`, 'POST', { nome: 'Teste' })).corpo.id;
  assert.equal((await chamar(`${G}/campeonatos/${cx}/modalidades`, 'POST', { nome: 'X', formato: 'roleta' })).status, 400);
  const { mod, ids } = await modalidade({ formato: 'nivel', rep_vagas: 1, rep_valor: 5 }, ['Fabi', 'Ana', 'Edu', 'Bia', 'Duda', 'Caio']);
  const d0 = (await chamar(`${G}/modalidades/${mod}`)).corpo;
  assert.equal(d0.formato, 'nivel'); assert.equal(d0.repescagem.vagas, 1); assert.equal(d0.repescagem.valor, 5);
  assert.equal(d0.inscritos.find((i) => i.nome === 'Ana').nivel, 'Diamante');

  const d = (await chamar(`${G}/modalidades/${mod}/sortear`, 'POST')).corpo;
  const reais = d.partidas.filter((p) => p.chave === 'W' && p.fase === 1 && p.a && p.b).map((p) => [p.a.nome, p.b.nome].sort().join('×')).sort();
  assert.deepEqual(reais, ['Ana×Bia', 'Caio×Duda', 'Edu×Fabi']);                           // os parecidos se enfrentam
  const vaga = d.partidas.find((p) => p.vaga_a === 1 || p.vaga_b === 1);
  assert.equal(vaga.fase, 2);                                                              // a repescagem volta na 2ª rodada
  assert.equal(d.repescagem.estado, 'aberta');

  const jogo = (x, y) => d.partidas.find((p) => p.fase === 1 && p.a && p.b && [p.a.nome, p.b.nome].includes(x) && [p.a.nome, p.b.nome].includes(y));
  const ganha = (x, y) => { const p = jogo(x, y); return p.a.nome === x ? placar(p.id, 5, 2) : placar(p.id, 2, 5); };
  await ganha('Ana', 'Bia');
  assert.equal((await chamar(`${G}/modalidades/${mod}/repescagem/fechar`, 'POST')).status, 409);   // 1ª rodada ainda não acabou
  await ganha('Caio', 'Duda'); await ganha('Fabi', 'Edu');                                  // zebra: Fabi (900) ganha de Edu (950)

  assert.equal((await chamar(`${G}/inscricoes/${ids.Ana}/recomprar`, 'POST')).status, 409); // quem ganhou não recompra
  assert.equal((await chamar(`${G}/inscricoes/${ids.Bia}/recomprar`, 'POST')).status, 201);
  assert.equal((await chamar(`${G}/inscricoes/${ids.Bia}/recomprar`, 'POST')).status, 409); // só uma vez
  assert.equal((await chamar(`${G}/inscricoes/${ids.Edu}/recomprar`, 'POST')).status, 201);
  const d1 = (await chamar(`${G}/modalidades/${mod}`)).corpo;
  assert.equal(d1.repescagem.recompras, 2);
  assert.equal(d1.premiacao.premios[0].valor, 35);                                         // (6×10 + 2×5) × 50%
  assert.equal(d1.inscritos.find((i) => i.nome === 'Duda').pode_recomprar, true);
  assert.equal(d1.inscritos.find((i) => i.nome === 'Bia').recomprou, true);

  const f = await chamar(`${G}/modalidades/${mod}/repescagem/fechar`, 'POST'); assert.equal(f.status, 200); assert.deepEqual(f.corpo.grupos, [2]);
  assert.equal((await chamar(`${G}/inscricoes/${ids.Duda}/recomprar`, 'POST')).status, 409); // fechou
  const d2 = (await chamar(`${G}/modalidades/${mod}`)).corpo;
  const rep = d2.partidas.find((p) => p.chave === 'R');
  assert.deepEqual([rep.a.nome, rep.b.nome].sort(), ['Bia', 'Edu']); assert.equal(rep.status, 'pronta');
  assert.equal((await placar(jogo('Ana', 'Bia').id, 1, 5)).status, 409);                    // não dá para corrigir a 1ª rodada depois de montar a repescagem
  await placar(rep.id, rep.a.nome === 'Bia' ? 5 : 1, rep.a.nome === 'Bia' ? 1 : 5);         // Bia vence a repescagem
  const d3 = (await chamar(`${G}/modalidades/${mod}`)).corpo;
  const volta = d3.partidas.find((p) => p.id === vaga.id);
  assert.ok([volta.a?.nome, volta.b?.nome].includes('Bia')); assert.equal(volta.status, 'pronta');
  assert.equal(d3.inscritos.find((i) => i.nome === 'Edu').colocacao, 5);                   // quem perde a repescagem mantém a colocação da 1ª rodada

  const s = Object.fromEntries((await todos('SELECT nome, score, jogos FROM jogador_score')).map((x) => [x.nome, x]));
  assert.ok(s.Fabi.score > 1000 && s.Edu.score < 1000);                                     // quem ganha sobe, quem perde cai
  assert.equal(s.Bia.jogos, 2);                                                            // perdeu para Ana e ganhou de Edu (o score começa do zero a partir dos jogos)
  const rk = (await chamar('/api/campeonato/ranking')).corpo;
  assert.ok(rk.niveis.length >= 6 && rk.niveis[0].nivel);
});

test('repescagem sem ninguém: W.O. faz os vencedores avançarem sozinhos', async () => {
  const { mod } = await modalidade({ rep_vagas: 2 }, ['P1', 'P2', 'P3', 'P4']);
  const d = (await chamar(`${G}/modalidades/${mod}/sortear`, 'POST')).corpo;
  assert.equal(d.partidas.filter((p) => p.vaga_a || p.vaga_b).length, 2);
  for (const p of d.partidas.filter((x) => x.chave === 'W' && x.fase === 1 && x.a && x.b)) await placar(p.id, 5, 0);
  const f = await chamar(`${G}/modalidades/${mod}/repescagem/fechar`, 'POST'); assert.deepEqual(f.corpo.grupos, [0, 0]);
  const d2 = (await chamar(`${G}/modalidades/${mod}`)).corpo;
  const final = d2.partidas.find((p) => p.chave === 'W' && p.fase === d2.rodadas);
  assert.equal(final.status, 'pronta');                                                     // os dois vencedores da 1ª rodada já estão na final
  await placar(final.id, 5, 3);
  const d3 = (await chamar(`${G}/modalidades/${mod}`)).corpo;
  assert.equal(d3.status, 'encerrada'); assert.ok(d3.campeao);
});

test('séries por nível e configuração antes do sorteio', async () => {
  for (const [n, s] of [['S1', 1400], ['S2', 1300], ['S3', 1200], ['S4', 1000], ['S5', 900]])
    await env.DB.prepare('INSERT INTO jogador_score (chave, nome, score, jogos, vitorias) VALUES (?, ?, ?, 10, 5)').bind(`n:${n.toLowerCase()}`, n, s).run();
  const { mod } = await modalidade({}, ['S5', 'S1', 'S4', 'S2', 'S3']);
  assert.equal((await chamar(`${G}/modalidades/${mod}/config`, 'PUT', { formato: 'xx' })).status, 400);
  assert.equal((await chamar(`${G}/modalidades/${mod}/config`, 'PUT', { formato: 'cabecas', rep_vagas: 1, rep_premio: false })).status, 200);
  assert.equal((await chamar(`${G}/modalidades/${mod}/dividir`, 'POST', { series: 3 })).status, 409);   // 5 inscritos não dão 3 séries de 2
  const r = await chamar(`${G}/modalidades/${mod}/dividir`, 'POST', { series: 2 }); assert.equal(r.status, 200);
  const [A, B] = await Promise.all(r.corpo.series.map(async (x) => (await chamar(`${G}/modalidades/${x.id}`)).corpo));
  assert.match(A.nome, /Série A$/); assert.match(B.nome, /Série B$/);
  assert.deepEqual(A.inscritos.map((i) => i.nome).sort(), ['S1', 'S2', 'S3']);
  assert.deepEqual(B.inscritos.map((i) => i.nome).sort(), ['S4', 'S5']);
  assert.equal(B.formato, 'cabecas'); assert.equal(B.repescagem.vagas, 1); assert.equal(B.repescagem.premio, false);
  await chamar(`${G}/modalidades/${A.id}/sortear`, 'POST');
  assert.equal((await chamar(`${G}/modalidades/${A.id}/config`, 'PUT', { formato: 'nivel' })).status, 409);
});
