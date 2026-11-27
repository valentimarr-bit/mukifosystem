-- Histórico de pedidos cancelados pela equipe (quem, quando, por quê, o que foi devolvido). Nunca se apaga.
CREATE TABLE cancelamento (
  id                INTEGER PRIMARY KEY,
  pedido_id         TEXT NOT NULL UNIQUE,
  numero            TEXT,
  origem            TEXT,                    -- balcao | celular | ifood | ...
  dia               TEXT,
  cliente           TEXT,                    -- nome do cliente no pedido
  itens             TEXT NOT NULL,           -- "2× Caipirinha, 1× Porção" (foto do pedido na hora)
  total             REAL NOT NULL DEFAULT 0,
  pago              REAL NOT NULL DEFAULT 0, -- quanto já tinha entrado
  status_antes      TEXT NOT NULL,
  motivo            TEXT NOT NULL,
  estorno           TEXT NOT NULL,           -- nenhum | saldo | por_fora
  valor_estorno     REAL NOT NULL DEFAULT 0,
  estoque_devolvido INTEGER NOT NULL DEFAULT 0,
  operador          TEXT NOT NULL,
  criado_em         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_cancelamento_data ON cancelamento (criado_em);
