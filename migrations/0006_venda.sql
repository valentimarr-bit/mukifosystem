-- Módulo de venda: comandas, cobranças e maquininhas.
-- Uma comanda é um registro em `pedido` (origem 'balcao'); status 'aberta' enquanto se lança itens.
ALTER TABLE pedido ADD COLUMN mesa TEXT;

CREATE TABLE maquininha (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  nome      TEXT NOT NULL UNIQUE,
  serie     TEXT,                              -- nº de série da Ingenico DX8000
  provedor  TEXT NOT NULL DEFAULT 'navi',
  ativa     INTEGER NOT NULL DEFAULT 1,
  padrao    INTEGER NOT NULL DEFAULT 0
);
INSERT INTO maquininha (nome, padrao) VALUES ('Maquininha 1', 1);
INSERT INTO maquininha (nome, padrao) VALUES ('Maquininha 2', 0);
INSERT INTO configuracao (chave, valor) VALUES ('roteamento', 'padrao');   -- padrao | equilibrar

-- Cada cobrança vai para UMA maquininha (ou é dinheiro, sem maquininha). Uma comanda pode ter várias (dividir a conta).
CREATE TABLE cobranca (
  id                 TEXT PRIMARY KEY,
  pedido_id          TEXT NOT NULL REFERENCES pedido(id),
  maquininha_id      INTEGER REFERENCES maquininha(id),
  forma              TEXT NOT NULL CHECK (forma IN ('pix', 'debito', 'credito', 'dinheiro')),
  valor              REAL NOT NULL CHECK (valor > 0),
  status             TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'paga', 'cancelada')),
  referencia_externa TEXT,                     -- id da transação no Navi, quando houver integração
  operador           TEXT,
  criada_em          TEXT NOT NULL DEFAULT (datetime('now')),
  paga_em            TEXT
);
CREATE INDEX idx_cobranca_pedido ON cobranca (pedido_id);
