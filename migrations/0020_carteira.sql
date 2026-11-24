-- Carteira do cliente (saldo pré-pago). O saldo é dinheiro do cliente guardado pelo bar: todo movimento fica no extrato.
ALTER TABLE cliente ADD COLUMN saldo REAL NOT NULL DEFAULT 0;
CREATE TABLE carteira_mov (
  id         INTEGER PRIMARY KEY,
  cliente_id TEXT NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
  valor      REAL NOT NULL,                 -- + entra, − sai
  motivo     TEXT NOT NULL,                 -- recarga | compra | ajuste | estorno
  pedido_id  TEXT,
  recarga_id TEXT,
  operador   TEXT,
  obs        TEXT,
  criado_em  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_carteira_cliente ON carteira_mov (cliente_id, criado_em);
CREATE UNIQUE INDEX idx_carteira_recarga ON carteira_mov (recarga_id) WHERE recarga_id IS NOT NULL;
CREATE UNIQUE INDEX idx_carteira_pedido ON carteira_mov (pedido_id, motivo) WHERE pedido_id IS NOT NULL;
CREATE TABLE recarga (
  id         TEXT PRIMARY KEY,
  cliente_id TEXT NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
  valor      REAL NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'paga', 'cancelada')),
  criada_em  TEXT NOT NULL DEFAULT (datetime('now')),
  expira_em  TEXT NOT NULL,
  paga_em    TEXT,
  operador   TEXT
);
CREATE INDEX idx_recarga_status ON recarga (status, criada_em);
