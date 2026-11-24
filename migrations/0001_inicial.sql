-- Mukifo — modelo de dados inicial (Cloudflare D1 / SQLite)
-- Regra de ouro: o estoque atual é SEMPRE a soma de movimento_estoque.
-- Nunca guardar "estoque atual" digitado por cima.

PRAGMA foreign_keys = ON;

CREATE TABLE fornecedor (
  id            INTEGER PRIMARY KEY,
  nome          TEXT NOT NULL UNIQUE,
  como_recebe   TEXT,              -- WhatsApp, presencial, telefone...
  contato       TEXT,
  observacao    TEXT,
  ativo         INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE insumo (
  id                  INTEGER PRIMARY KEY,
  nome                TEXT NOT NULL UNIQUE,
  tipo                TEXT NOT NULL,     -- destilado, licor, cerveja, nao_alcoolico, hortifruti, producao, descartavel...
  unidade_estoque     TEXT NOT NULL,     -- L, kg, un
  unidade_ficha       TEXT NOT NULL,     -- ml, g, un
  fator_conversao     REAL NOT NULL,     -- quantas unidades de ficha cabem em 1 unidade de estoque (ex.: 1 L = 1000 ml)
  qtd_por_embalagem   REAL,              -- ex.: garrafa de 1 L, caixa com 12
  embalagem           TEXT,              -- garrafa, lata, pacote, caixa...
  arredondamento      TEXT NOT NULL DEFAULT 'inteiro_cima', -- inteiro_cima | garrafa_proxima | meio
  producao_propria    INTEGER NOT NULL DEFAULT 0,
  fornecedor_id       INTEGER REFERENCES fornecedor(id),
  outros_fornecedores TEXT,
  preco_unidade       REAL,              -- R$ por unidade de estoque, última compra
  ativo               INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE produto (
  id            INTEGER PRIMARY KEY,
  nome          TEXT NOT NULL UNIQUE,  -- igual ao nome do relatório de vendas
  categoria     TEXT,
  preco_venda   REAL,
  baixa_estoque INTEGER NOT NULL DEFAULT 1, -- 0 para fichas de sinuca etc.
  ativo         INTEGER NOT NULL DEFAULT 1
);

-- Receita: produto -> insumos. Produto composto (promo, kit) usa produto_componente.
CREATE TABLE ficha_tecnica (
  id          INTEGER PRIMARY KEY,
  produto_id  INTEGER NOT NULL REFERENCES produto(id) ON DELETE CASCADE,
  insumo_id   INTEGER NOT NULL REFERENCES insumo(id),
  quantidade  REAL NOT NULL,          -- em unidade_ficha do insumo
  observacao  TEXT,
  UNIQUE (produto_id, insumo_id)
);

CREATE TABLE produto_componente (
  produto_id     INTEGER NOT NULL REFERENCES produto(id) ON DELETE CASCADE,
  componente_id  INTEGER NOT NULL REFERENCES produto(id),
  quantidade     REAL NOT NULL,       -- ex.: Promo Caipirinha Dose Dupla = 2 caipirinhas
  PRIMARY KEY (produto_id, componente_id)
);

CREATE TABLE pedido (
  id            TEXT PRIMARY KEY,      -- gerado no aparelho (POS offline) ou no servidor
  numero        TEXT NOT NULL,         -- curto, ex.: A27; único por dia
  dia           TEXT NOT NULL,         -- YYYY-MM-DD do turno
  origem        TEXT NOT NULL,         -- pos | celular | historico
  nome_cliente  TEXT,
  status        TEXT NOT NULL DEFAULT 'recebido', -- aguardando_pagamento | recebido | preparando | pronto | entregue | cancelado
  pagamento     TEXT,                  -- credito | debito | pix | dinheiro
  total         REAL NOT NULL DEFAULT 0,
  terminal      TEXT,                  -- nº de série da DX8000
  operador      TEXT,
  criado_em     TEXT NOT NULL DEFAULT (datetime('now')),
  pago_em       TEXT,
  pronto_em     TEXT,
  entregue_em   TEXT,
  UNIQUE (dia, numero)
);

CREATE TABLE item_pedido (
  id          INTEGER PRIMARY KEY,
  pedido_id   TEXT NOT NULL REFERENCES pedido(id) ON DELETE CASCADE,
  produto_id  INTEGER REFERENCES produto(id),
  nome        TEXT NOT NULL,           -- nome como veio (para produtos sem cadastro)
  quantidade  REAL NOT NULL,
  preco       REAL
);

CREATE TABLE compra (
  id             INTEGER PRIMARY KEY,
  fornecedor_id  INTEGER REFERENCES fornecedor(id),
  data           TEXT NOT NULL,
  total          REAL,
  registrado_por TEXT
);

CREATE TABLE item_compra (
  id          INTEGER PRIMARY KEY,
  compra_id   INTEGER NOT NULL REFERENCES compra(id) ON DELETE CASCADE,
  insumo_id   INTEGER NOT NULL REFERENCES insumo(id),
  quantidade  REAL NOT NULL,           -- em unidade_estoque
  valor_pago  REAL
);

CREATE TABLE contagem (
  id         INTEGER PRIMARY KEY,
  data       TEXT NOT NULL,
  momento    TEXT NOT NULL,            -- abertura | fechamento
  insumo_id  INTEGER NOT NULL REFERENCES insumo(id),
  esperado   REAL,                     -- soma dos movimentos no momento da contagem
  contado    REAL NOT NULL,
  usuario    TEXT
);

-- Todo entra-e-sai de estoque passa por aqui.
CREATE TABLE movimento_estoque (
  id          INTEGER PRIMARY KEY,
  insumo_id   INTEGER NOT NULL REFERENCES insumo(id),
  tipo        TEXT NOT NULL,           -- venda | compra | producao | perda | diferenca_contagem | ajuste
  quantidade  REAL NOT NULL,           -- em unidade_estoque; negativo = saída
  custo       REAL,                    -- R$ do movimento
  motivo      TEXT,                    -- quebra, vencido, erro de preparo, cortesia...
  referencia  TEXT,                    -- id do pedido, compra ou contagem
  usuario     TEXT,
  criado_em   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_mov_insumo ON movimento_estoque (insumo_id, criado_em);

-- Dias que não entram na média de consumo (feriado, chuva forte, ±35% do normal).
CREATE TABLE dia_fora_da_media (
  dia     TEXT PRIMARY KEY,
  motivo  TEXT NOT NULL
);

CREATE TABLE configuracao (
  chave  TEXT PRIMARY KEY,
  valor  TEXT NOT NULL
);
INSERT INTO configuracao (chave, valor) VALUES ('folga_minimo', '0.20');

CREATE VIEW estoque_atual AS
SELECT i.id AS insumo_id, i.nome, i.unidade_estoque,
       COALESCE(SUM(m.quantidade), 0) AS quantidade
FROM insumo i
LEFT JOIN movimento_estoque m ON m.insumo_id = i.id
GROUP BY i.id;
