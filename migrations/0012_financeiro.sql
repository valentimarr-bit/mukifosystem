-- Módulo financeiro: despesas e contas a pagar, taxas de pagamento, caixa (sangria, suprimento, fechamento).
CREATE TABLE despesa (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  descricao   TEXT NOT NULL,
  categoria   TEXT NOT NULL DEFAULT 'Outras',
  tipo        TEXT NOT NULL DEFAULT 'variavel' CHECK (tipo IN ('fixa', 'variavel')),
  valor       REAL NOT NULL CHECK (valor > 0),
  vencimento  TEXT NOT NULL,                       -- AAAA-MM-DD
  status      TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'paga')),
  pago_em     TEXT,
  forma       TEXT,                                -- como foi paga (pix, dinheiro, boleto...)
  fornecedor  TEXT,
  recorrente  TEXT CHECK (recorrente IN ('mensal') OR recorrente IS NULL),
  observacao  TEXT,
  criado_por  TEXT,
  criado_em   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_despesa_venc ON despesa (vencimento, status);

-- O que cada forma de pagamento cobra e em quantos dias o dinheiro cai na conta.
CREATE TABLE taxa_pagamento (
  forma       TEXT PRIMARY KEY CHECK (forma IN ('pix', 'debito', 'credito', 'dinheiro')),
  percentual  REAL NOT NULL DEFAULT 0 CHECK (percentual >= 0 AND percentual <= 100),
  fixo        REAL NOT NULL DEFAULT 0 CHECK (fixo >= 0),   -- R$ por cobrança
  dias        INTEGER NOT NULL DEFAULT 0 CHECK (dias >= 0 AND dias <= 365)
);
INSERT INTO taxa_pagamento (forma, percentual, fixo, dias) VALUES ('pix', 0, 0, 0);
INSERT INTO taxa_pagamento (forma, percentual, fixo, dias) VALUES ('debito', 0, 0, 1);
INSERT INTO taxa_pagamento (forma, percentual, fixo, dias) VALUES ('credito', 0, 0, 30);
INSERT INTO taxa_pagamento (forma, percentual, fixo, dias) VALUES ('dinheiro', 0, 0, 0);

CREATE TABLE caixa_mov (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  dia        TEXT NOT NULL,
  tipo       TEXT NOT NULL CHECK (tipo IN ('sangria', 'suprimento')),
  valor      REAL NOT NULL CHECK (valor > 0),
  motivo     TEXT,
  usuario    TEXT,
  criado_em  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_caixa_mov_dia ON caixa_mov (dia);

CREATE TABLE caixa_fechamento (
  dia                TEXT PRIMARY KEY,
  fundo_inicial      REAL NOT NULL DEFAULT 0,
  esperado_dinheiro  REAL NOT NULL,
  contado_dinheiro   REAL NOT NULL,
  diferenca          REAL NOT NULL,
  observacao         TEXT,
  fechado_por        TEXT,
  fechado_em         TEXT NOT NULL DEFAULT (datetime('now'))
);
