-- Campeonato mais justo: score (Elo) por jogador, formato da chave, séries por nível e repescagem por recompra.
ALTER TABLE modalidade ADD COLUMN formato TEXT NOT NULL DEFAULT 'sorteio';   -- sorteio | nivel (1ª rodada entre parecidos) | cabecas (melhores separados)
ALTER TABLE modalidade ADD COLUMN rep_vagas INTEGER NOT NULL DEFAULT 0;      -- 0 = sem repescagem; N = vagas na 2ª rodada para quem vem da repescagem
ALTER TABLE modalidade ADD COLUMN rep_valor REAL;                            -- valor da recompra (nulo = o mesmo da inscrição)
ALTER TABLE modalidade ADD COLUMN rep_premio INTEGER NOT NULL DEFAULT 1;     -- 1 = recompra soma ao prêmio; 0 = fica com a casa
ALTER TABLE modalidade ADD COLUMN rep_status TEXT;                           -- nulo (aberta enquanto houver) | fechada
ALTER TABLE partida ADD COLUMN rep_a INTEGER;   -- vaga do lado A reservada ao vencedor do grupo N da repescagem (-1 = ninguém veio: W.O.)
ALTER TABLE partida ADD COLUMN rep_b INTEGER;
ALTER TABLE partida ADD COLUMN grupo INTEGER;   -- jogos da repescagem (chave 'R'): número do grupo
CREATE TABLE recompra (
  id            TEXT PRIMARY KEY,
  modalidade_id TEXT NOT NULL REFERENCES modalidade(id) ON DELETE CASCADE,
  inscricao_id  TEXT NOT NULL UNIQUE REFERENCES inscricao(id),               -- cada jogador recompra uma vez
  valor         REAL NOT NULL DEFAULT 0,
  forma         TEXT NOT NULL,                                               -- balcao | saldo | teste | gratis
  operador      TEXT,
  paga_em       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_recompra_mod ON recompra (modalidade_id);
CREATE TABLE jogador_score (                                                 -- recalculado a partir de todos os jogos terminados
  chave         TEXT PRIMARY KEY,                                            -- c:<cliente> ou n:<nome>
  cliente_id    TEXT,
  nome          TEXT NOT NULL,
  score         REAL NOT NULL DEFAULT 1000,
  jogos         INTEGER NOT NULL DEFAULT 0,
  vitorias      INTEGER NOT NULL DEFAULT 0,
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
