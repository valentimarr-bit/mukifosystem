-- Ranking de toda a sinuca: resultado dos jogos da mesa (fora de campeonato) entra no mesmo score dos campeonatos.
CREATE TABLE sinuca_resultado (
  id            TEXT PRIMARY KEY,
  fila_id       TEXT UNIQUE,                    -- a vez na fila a que o resultado se refere (nulo = lançado pela equipe)
  mesa_id       TEXT,
  a_chave       TEXT NOT NULL,                  -- quem avisou (c:<cliente> ou n:<nome>)
  a_nome        TEXT NOT NULL,
  a_cliente_id  TEXT,
  b_chave       TEXT NOT NULL,                  -- adversário (sem cadastro: n:<nome>)
  b_nome        TEXT NOT NULL,
  b_cliente_id  TEXT,
  vencedor      TEXT NOT NULL CHECK (vencedor IN ('a', 'b')),
  status        TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'confirmado', 'contestado', 'recusado')),
  origem        TEXT NOT NULL DEFAULT 'jogador',  -- jogador | equipe
  operador      TEXT,
  criado_em     TEXT NOT NULL DEFAULT (datetime('now')),
  resolvido_em  TEXT
);
CREATE INDEX idx_sinuca_resultado ON sinuca_resultado (status, criado_em);
