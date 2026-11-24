-- Lista de compras no celular: gerada a partir da sugestão, marcada item a item, finalizada como compra.

CREATE TABLE lista_compras (
  id            INTEGER PRIMARY KEY,
  dia_compra    TEXT NOT NULL,                 -- segunda | quinta
  status        TEXT NOT NULL DEFAULT 'aberta', -- aberta | finalizada | cancelada
  criada_em     TEXT NOT NULL DEFAULT (datetime('now')),
  finalizada_em TEXT,
  usuario       TEXT
);

CREATE TABLE item_lista (
  id                  INTEGER PRIMARY KEY,
  lista_id            INTEGER NOT NULL REFERENCES lista_compras(id) ON DELETE CASCADE,
  insumo_id           INTEGER NOT NULL REFERENCES insumo(id),
  fornecedor          TEXT,                    -- fornecedor no momento em que a lista foi gerada
  ordem               INTEGER NOT NULL DEFAULT 0,
  quantidade_sugerida REAL NOT NULL,
  quantidade_comprada REAL,                    -- NULL = igual à sugerida
  valor_pago          REAL,                    -- total pago pelo item (opcional)
  comprado            INTEGER NOT NULL DEFAULT 0,
  comprado_em         TEXT,
  UNIQUE (lista_id, insumo_id)
);
CREATE INDEX idx_item_lista ON item_lista (lista_id);
