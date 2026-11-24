-- Estoque recomendado separado para segunda e quinta; cadastro de clientes, pontos e níveis; avisos no celular.
ALTER TABLE insumo ADD COLUMN estoque_recomendado_segunda REAL;
ALTER TABLE insumo ADD COLUMN estoque_recomendado_quinta REAL;
UPDATE insumo SET estoque_recomendado_segunda = estoque_recomendado, estoque_recomendado_quinta = estoque_recomendado;

CREATE TABLE cliente (
  id            TEXT PRIMARY KEY,
  nome          TEXT NOT NULL,
  celular       TEXT UNIQUE,                 -- só dígitos, com DDD
  email         TEXT UNIQUE,                 -- minúsculo
  google_sub    TEXT UNIQUE,                 -- id da conta Google (quando o login Google for ligado)
  senha_hash    TEXT,
  sal           TEXT,
  pontos        INTEGER NOT NULL DEFAULT 0,  -- saldo para trocar por prêmios (quando os donos definirem)
  pontos_total  INTEGER NOT NULL DEFAULT 0,  -- tudo que já ganhou: decide o nível e nunca diminui
  falhas        INTEGER NOT NULL DEFAULT 0,  -- senhas erradas seguidas
  bloqueado_ate TEXT,                        -- trava curta depois de muitas tentativas
  aceite_em     TEXT,                        -- quando aceitou os termos (LGPD)
  ativo         INTEGER NOT NULL DEFAULT 1,
  criado_em     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE cliente_sessao (
  token_hash TEXT PRIMARY KEY,
  cliente_id TEXT NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
  expira_em  TEXT NOT NULL
);
CREATE TABLE ponto_mov (
  id         INTEGER PRIMARY KEY,
  cliente_id TEXT NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
  pedido_id  TEXT,
  pontos     INTEGER NOT NULL,
  motivo     TEXT NOT NULL,                  -- compra | ajuste | bonus | troca
  criado_em  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX idx_ponto_pedido ON ponto_mov (pedido_id, motivo) WHERE pedido_id IS NOT NULL;
CREATE INDEX idx_ponto_cliente ON ponto_mov (cliente_id, criado_em);
ALTER TABLE pedido ADD COLUMN cliente_id TEXT;
ALTER TABLE pedido ADD COLUMN preparo_em TEXT;   -- quando o balcão começou a preparar
CREATE INDEX idx_pedido_cliente ON pedido (cliente_id, criado_em);
CREATE TABLE push_assinatura (            -- aviso no celular: preso ao pedido, vale para quem tem conta e para visitante
  id         INTEGER PRIMARY KEY,
  pedido_id  TEXT NOT NULL,
  endpoint   TEXT NOT NULL,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  criado_em  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (pedido_id, endpoint)
);

-- Cadastro de fornecedores mais completo
ALTER TABLE fornecedor ADD COLUMN cnpj TEXT;
ALTER TABLE fornecedor ADD COLUMN endereco TEXT;
ALTER TABLE fornecedor ADD COLUMN prazo_dias INTEGER;      -- prazo para pagar (0 = à vista)
ALTER TABLE fornecedor ADD COLUMN pedido_minimo REAL;

-- Painel de permissões: quais módulos cada login enxerga (NULL = padrão do cargo)
ALTER TABLE usuario ADD COLUMN modulos TEXT;
