-- Emissão de nota fiscal (NFC-e) por emissor externo: dados fiscais do produto, configuração e as notas emitidas.
ALTER TABLE produto ADD COLUMN ncm TEXT;        -- 8 dígitos
ALTER TABLE produto ADD COLUMN cfop TEXT;       -- ex.: 5102 (venda), 5405 (substituição tributária)
ALTER TABLE produto ADD COLUMN csosn TEXT;      -- Simples Nacional: 102, 500...
ALTER TABLE produto ADD COLUMN origem TEXT;     -- 0 nacional, 1 estrangeira...
ALTER TABLE produto ADD COLUMN unidade TEXT;    -- UN, KG, L...
INSERT INTO configuracao (chave, valor) VALUES ('fiscal_emissor', 'desligado');     -- desligado | focusnfe
INSERT INTO configuracao (chave, valor) VALUES ('fiscal_ambiente', 'homologacao');  -- homologacao | producao
INSERT INTO configuracao (chave, valor) VALUES ('fiscal_cnpj', '');
INSERT INTO configuracao (chave, valor) VALUES ('fiscal_ncm_padrao', '');
INSERT INTO configuracao (chave, valor) VALUES ('fiscal_cfop_padrao', '5102');
INSERT INTO configuracao (chave, valor) VALUES ('fiscal_csosn_padrao', '102');
INSERT INTO configuracao (chave, valor) VALUES ('fiscal_origem_padrao', '0');
CREATE TABLE nota_emitida (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id     TEXT NOT NULL,
  tipo          TEXT NOT NULL DEFAULT 'nfce',
  ref           TEXT NOT NULL UNIQUE,         -- referência única enviada ao emissor
  ambiente      TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'autorizada', 'rejeitada', 'cancelada', 'erro')),
  numero        TEXT,
  serie         TEXT,
  chave         TEXT,
  protocolo     TEXT,
  url_danfe     TEXT,
  url_xml       TEXT,
  mensagem      TEXT,
  valor         REAL NOT NULL,
  criado_por    TEXT,
  criado_em     TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_nota_pedido ON nota_emitida (pedido_id);
CREATE UNIQUE INDEX idx_nota_ativa ON nota_emitida (pedido_id, tipo) WHERE status IN ('pendente', 'autorizada');   -- uma nota viva por pedido
