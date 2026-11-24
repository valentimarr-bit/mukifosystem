-- Canais de venda externos (iFood, 99Food): pedidos que chegam das plataformas e entram na Produção como os do app.
CREATE TABLE pedido_externo (
  id               TEXT PRIMARY KEY,               -- = id do pedido local (ext-<canal>-<ref>): importar duas vezes é impossível
  canal            TEXT NOT NULL,                  -- ifood | 99food
  ref_externa      TEXT NOT NULL,
  numero_canal     TEXT,                           -- número que o cliente e o entregador veem na plataforma
  tipo             TEXT NOT NULL DEFAULT 'delivery',   -- delivery | retirada
  cliente          TEXT,
  total_canal      REAL,
  taxa_entrega     REAL NOT NULL DEFAULT 0,
  itens_sem_vinculo INTEGER NOT NULL DEFAULT 0,    -- itens que não casaram com produto (não dão baixa no estoque)
  confirmado_em    TEXT,                           -- quando o pedido foi aceito na plataforma
  etapa_enviada    TEXT,                           -- última etapa avisada à plataforma
  erro             TEXT,
  cancelado_externo INTEGER NOT NULL DEFAULT 0,
  criado_em        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (canal, ref_externa)
);
CREATE INDEX idx_pedido_externo_criado ON pedido_externo (criado_em);
INSERT INTO configuracao (chave, valor) VALUES ('canal_ifood_ativo', 'nao');
INSERT INTO configuracao (chave, valor) VALUES ('canal_99food_ativo', 'nao');
INSERT INTO configuracao (chave, valor) VALUES ('canal_auto_aceitar', 'sim');     -- sim = aceita o pedido na plataforma assim que ele entra
INSERT INTO configuracao (chave, valor) VALUES ('canal_ifood_comissao', '0');     -- % que a plataforma cobra (para os relatórios)
INSERT INTO configuracao (chave, valor) VALUES ('canal_99food_comissao', '0');
