// Campeonato de sinuca: gerador de chave, inscrição paga, sorteio, placar, avanço, 3º lugar, ranking e premiação.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import worker from '../src/worker.js';
import { criarD1 } from './d1-falso.js';
import { gerarChave, ordemSementes, dividirPremio, pontosDaColocacao } from '../src/dominio/chaves.js';

const arq = (p) => fileURLToPath(new URL(p, import.meta.url));
const env = { DB: criarD1(['0001_inicial', '0002_lista_compras', '0003_usuarios', '0004_fotos', '0005_alerta_estoque', '0006_venda', '0007_cliente', '0008_combos', '0009_trava_estoque', '0010_estoque_recomendado', '0011_indices', '0012_financeiro', '0013_clientes_e_dias', '0014_indices_estoque', '0015_recuperar_senha', '0016_auditoria', '0017_tempo_preparo', '0018_pronta_entrega', '0019_entrega_parcial', '0020_carteira', '0021_item_pronto', '0022_campeonato', '0023_gateway'].map((m) => arq(`../migrations/${m}.sql`))), ADMIN_TOKEN: 'segredo-teste', ASSETS: { fetch: () => new Response('x') } };
const chamar = async (caminho, metodo = 'GET', corpo, cab = {}, token = 'segredo-teste') => {
  const r = await worker.fetch(new Request('https://mukifo.test' + caminho, { method: metodo, body: corpo ? JSON.stringify(corpo) : undefined,
    headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '9.9.9.9', ...(token ? { authorization: `Bearer ${token}` } : {}), ...cab } }), env);
  return { status: r.status, corpo: await r.json() };
};
const G = '/api/campeonato/gestao';

test('chave: sementes padrão, folgas e tamanhos', () => {
  assert.deepEqual(ordemSementes(8), [1, 8, 4, 5, 2, 7, 3, 6]);
  for (const n of [2, 3, 4, 5, 6, 7, 8, 9, 13, 16]) {
    const { rodadas, partidas } = gerarChave(Array.from({ length: n }, (_, i) => `j${i}`));
    const S = 2 ** rodadas, r1 = partidas.filter((p) => p.fase === 1 && p.chave === 'W');
    assert.equal(r1.length, S / 2);
    assert.equal(r1.filter((p) => !p.a || !p.b).length, S - n, `folgas com ${n}`);          // quem folga é só um lado vazio
    assert.ok(r1.every((p) => p.a || p.b));
    const ids = r1.flatMap((p) => [p.a, p.b]).filter(Boolean); assert.equal(new Set(ids).size, n);
    assert.equal(partidas.some((p) => p.chave === 'T'), n >= 4);
  }
  assert.throws(() => gerarChave(['a']));
});

test('prêmio e pontos', () => {
  assert.deepEqual(dividirPremio(400, [50, 25, 15]), { premios: [{ colocacao: 1, pct: 50, valor: 200 }, { colocacao: 2, pct: 25, valor: 100 }, { colocacao: 3, pct: 15, valor: 60 }], casa: 40 });
  assert.equal(dividirPremio(100, [80, 80]).casa, 0);                                           // passou de 100%: reduz proporcional, nunca paga mais que o arrecadado
  assert.ok(pontosDaColocacao(1) > pontosDaColocacao(2) && pontosDaColocacao(2) > pontosDaColocacao(3) && pontosDaColocacao(5) > pontosDaColocacao(9));
});

test('fluxo completo: inscrição por Pix, balcão, sorteio com folga, placar ao vivo, 3º lugar, ranking', async () => {
  await chamar('/api/venda/pix', 'PUT', { chave: 'bar@mukifo.com' });
  const camp = (await chamar(`${G}/campeonatos`, 'POST', { nome: 'Copa Mukifo', data: '2026-12-05' })).corpo.id;
  assert.equal((await chamar(`${G}/campeonatos`, 'POST', { nome: '' })).status, 400);
  assert.equal((await chamar(`${G}/campeonatos/${camp}/modalidades`, 'POST', { nome: 'Bola 8', taxa: 40, premio: [80, 40] })).status, 400);   // soma > 100
  const mod = (await chamar(`${G}/campeonatos/${camp}/modalidades`, 'POST', { nome: 'Bola 8', taxa: 40, vagas: 8 })).corpo.id;

  // cliente se cadastra e se inscreve; só entra na chave depois de pagar
  const cad = await chamar('/api/conta/cadastro', 'POST', { nome: 'Rafa Souza', celular: '(51) 99999-0001', senha: 'segredo1', aceite: true }, {}, null);
  const sessao = { 'X-Sessao-Cliente': cad.corpo.token };
  assert.equal((await chamar(`/api/campeonato/modalidades/${mod}/inscrever`, 'POST', {}, {}, null)).status, 401);
  const ins = await chamar(`/api/campeonato/modalidades/${mod}/inscrever`, 'POST', {}, sessao, null);
  assert.equal(ins.status, 201); assert.equal(ins.corpo.status, 'pendente'); assert.ok(ins.corpo.pix.includes('br.gov.bcb.pix'));
  const repete = await chamar(`/api/campeonato/modalidades/${mod}/inscrever`, 'POST', {}, sessao, null);
  assert.equal(repete.corpo.id, ins.corpo.id);                                                   // não duplica
  let pub = (await chamar(`/api/campeonato/modalidades/${mod}`, 'GET', null, {}, null)).corpo;
  assert.equal(pub.inscritos.length, 0); assert.equal(pub.pagas, 0);
  assert.equal((await chamar(`${G}/inscricoes/${ins.corpo.id}/confirmar`, 'POST', {}, {}, null)).status, 401);   // público não confirma
  assert.equal((await chamar(`${G}/inscricoes/${ins.corpo.id}/confirmar`, 'POST')).status, 200);
  assert.equal((await chamar(`${G}/inscricoes/${ins.corpo.id}/confirmar`, 'POST')).corpo.ja, true);            // idempotente

  // saldo: paga com a carteira, e cancelar devolve só o que saiu da carteira
  const c2 = await chamar('/api/conta/cadastro', 'POST', { nome: 'Duda Lima', celular: '(51) 99999-0002', senha: 'segredo1', aceite: true }, {}, null);
  const s2 = { 'X-Sessao-Cliente': c2.corpo.token };
  assert.equal((await chamar(`/api/campeonato/modalidades/${mod}/inscrever`, 'POST', { pagar_com_saldo: true }, s2, null)).status, 402);
  await env.DB.prepare('UPDATE cliente SET saldo = 100 WHERE id = ?').bind(c2.corpo.cliente.id).run();
  const i2 = await chamar(`/api/campeonato/modalidades/${mod}/inscrever`, 'POST', { pagar_com_saldo: true }, s2, null);
  assert.equal(i2.corpo.status, 'paga'); assert.equal((await env.DB.prepare('SELECT saldo FROM cliente WHERE id = ?').bind(c2.corpo.cliente.id).first()).saldo, 60);
  const canc = await chamar(`${G}/inscricoes/${i2.corpo.id}/cancelar`, 'POST');
  assert.equal(canc.corpo.reembolso, 'saldo'); assert.equal((await env.DB.prepare('SELECT saldo FROM cliente WHERE id = ?').bind(c2.corpo.cliente.id).first()).saldo, 100);
  assert.equal((await chamar(`/api/campeonato/modalidades/${mod}/inscrever`, 'POST', { pagar_com_saldo: true }, s2, null)).corpo.status, 'paga');   // pode voltar

  // mais 3 no balcão = 5 jogadores → chave de 8 com 3 folgas
  for (const n of ['Tiago', 'Bia', 'Leo']) assert.equal((await chamar(`${G}/modalidades/${mod}/inscrever`, 'POST', { nome: n })).status, 201);
  assert.equal((await chamar(`${G}/modalidades/${mod}/sortear`, 'POST')).status, 201);
  let d = (await chamar(`${G}/modalidades/${mod}`)).corpo;
  assert.equal(d.status, 'andamento'); assert.equal(d.rodadas, 3);
  assert.equal(d.partidas.filter((p) => p.chave === 'W' && p.fase === 1 && p.status === 'finalizada').length, 3);   // folgas já avançaram
  assert.equal((await chamar(`/api/campeonato/modalidades/${mod}/inscrever`, 'POST', {}, s2, null)).status, 409);    // inscrições fechadas
  assert.equal((await chamar(`${G}/modalidades/${mod}/inscrever`, 'POST', { nome: 'Atrasado' })).status, 409);

  // joga tudo: sempre o lado A vence 7×3; o placar parcial aparece para o público
  const jogar = async (modalidade) => {
    for (let guarda = 0; guarda < 20; guarda++) {
      const det = (await chamar(`${G}/modalidades/${modalidade}`)).corpo;
      const prox = det.partidas.find((p) => p.status === 'pronta');
      if (!prox) return det;
      assert.equal((await chamar(`${G}/partidas/${prox.id}/placar`, 'POST', { placar_a: 3, placar_b: 2, mesa: '2' })).status, 200);
      const ao = (await chamar(`/api/campeonato/modalidades/${modalidade}`, 'GET', null, {}, null)).corpo.partidas.find((p) => p.id === prox.id);
      assert.equal(ao.status, 'em_jogo'); assert.equal(ao.placar_a, 3); assert.equal(ao.mesa, '2');
      assert.equal((await chamar(`${G}/partidas/${prox.id}/placar`, 'POST', { placar_a: 7, placar_b: 7, finalizar: true })).status, 400);   // empate não fecha
      assert.equal((await chamar(`${G}/partidas/${prox.id}/placar`, 'POST', { placar_a: 7, placar_b: 3, finalizar: true })).status, 200);
      assert.equal((await chamar(`${G}/partidas/${prox.id}/placar`, 'POST', { placar_a: 7, placar_b: 3, finalizar: true })).status, 409);   // não fecha duas vezes
    }
    throw new Error('chave não terminou');
  };
  d = await jogar(mod);
  assert.equal(d.status, 'encerrada'); assert.ok(d.campeao);
  const col = d.inscritos.map((i) => i.colocacao).sort();
  assert.deepEqual(col, [1, 2, 3, 4, 5], 'colocações 1,2,3,4 e um 5º');                      // 5 jogadores: campeão, vice, 3º, 4º, 5º
  assert.equal(d.premiacao.premios[0].valor, 100);   // 5 pagas × R$ 40 = 200 → 50%

  const rk = (await chamar('/api/campeonato/ranking', 'GET', null, {}, null)).corpo;
  assert.equal(rk.ranking[0].nome, d.campeao); assert.equal(rk.ranking[0].titulos, 1); assert.equal(rk.ranking[0].pontos, 100);
  assert.equal(rk.ranking.length, 5); assert.deepEqual(rk.modalidades, ['Bola 8']);
  assert.equal((await chamar('/api/campeonato/ranking?modalidade=bola%209', 'GET', null, {}, null)).corpo.ranking.length, 0);
});

test('corrigir resultado: reabre enquanto a próxima partida não começou', async () => {
  const camp = (await chamar(`${G}/campeonatos`, 'POST', { nome: 'Rápido' })).corpo.id;
  const mod = (await chamar(`${G}/campeonatos/${camp}/modalidades`, 'POST', { nome: 'Bola 9', taxa: 0 })).corpo.id;
  for (const n of ['A', 'B', 'C', 'D']) await chamar(`${G}/modalidades/${mod}/inscrever`, 'POST', { nome: n });
  await chamar(`${G}/modalidades/${mod}/sortear`, 'POST');
  let d = (await chamar(`${G}/modalidades/${mod}`)).corpo;
  const semi = d.partidas.filter((p) => p.fase === 1 && p.chave === 'W');
  await chamar(`${G}/partidas/${semi[0].id}/placar`, 'POST', { placar_a: 2, placar_b: 1, finalizar: true });
  assert.equal((await chamar(`${G}/partidas/${semi[0].id}/placar`, 'POST', { reabrir: true })).status, 200);
  await chamar(`${G}/partidas/${semi[0].id}/placar`, 'POST', { placar_a: 1, placar_b: 2, finalizar: true });
  d = (await chamar(`${G}/modalidades/${mod}`)).corpo;
  assert.equal(d.partidas.find((p) => p.fase === 2 && p.chave === 'W').a.id, semi[0].b.id);       // o vencedor corrigido é quem avançou
  await chamar(`${G}/partidas/${semi[1].id}/placar`, 'POST', { placar_a: 2, placar_b: 0, finalizar: true });
  const fin = (await chamar(`${G}/modalidades/${mod}`)).corpo.partidas.find((p) => p.fase === 2 && p.chave === 'W');
  await chamar(`${G}/partidas/${fin.id}/placar`, 'POST', { placar_a: 1, placar_b: 0 });            // final começou
  assert.equal((await chamar(`${G}/partidas/${semi[0].id}/placar`, 'POST', { reabrir: true })).status, 409);
});
