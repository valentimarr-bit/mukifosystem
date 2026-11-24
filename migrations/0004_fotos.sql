-- Fotos de produtos (o que o bar vende) e insumos (o que o bar compra).
-- Guardadas em texto base64 (a imagem já chega reduzida pelo navegador, ~30-80 KB).
CREATE TABLE foto (
  tipo          TEXT NOT NULL CHECK (tipo IN ('produto', 'insumo')),
  ref_id        INTEGER NOT NULL,
  mime          TEXT NOT NULL,
  dados_b64     TEXT NOT NULL,
  bytes         INTEGER NOT NULL,
  usuario       TEXT,
  atualizada_em TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (tipo, ref_id)
);
