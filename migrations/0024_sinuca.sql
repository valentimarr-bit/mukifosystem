-- Fila da mesa de sinuca: o cliente (com cadastro) entra na fila estando no bar, é chamado quando a mesa libera e a conduta dele é medida.
CREATE TABLE mesa_sinuca (
  id            TEXT PRIMARY KEY,
  nome          TEXT NOT NULL,
  ativa         INTEGER NOT NULL DEFAULT 1,
  status        TEXT NOT NULL DEFAULT 'livre' CHECK (status IN ('livre', 'chamando', 'ocupada', 'liberando')),
  fila_id       TEXT,                 -- quem está chamado ou jogando
  desde         TEXT,
  liberando_em  TEXT,                 -- alguém avisou que terminou; vale se ninguém contestar
  liberando_por TEXT
);
CREATE TABLE fila_sinuca (
  id         TEXT PRIMARY KEY,
  cliente_id TEXT NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
  nome       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'esperando' CHECK (status IN ('esperando', 'chamado', 'jogando', 'finalizado', 'cancelado', 'expirou')),
  entrada_em TEXT NOT NULL DEFAULT (datetime('now')),
  chamado_em TEXT,
  mesa_id    TEXT,
  inicio_em  TEXT,
  fim_em     TEXT,
  dist_m     REAL
);
CREATE INDEX idx_fila_status ON fila_sinuca (status, entrada_em);
CREATE UNIQUE INDEX idx_fila_ativa ON fila_sinuca (cliente_id) WHERE status IN ('esperando', 'chamado', 'jogando');   -- uma vaga ativa por pessoa
CREATE TABLE sinuca_conduta (
  cliente_id    TEXT PRIMARY KEY REFERENCES cliente(id) ON DELETE CASCADE,
  pontos        INTEGER NOT NULL DEFAULT 100,
  bloqueios     INTEGER NOT NULL DEFAULT 0,
  bloqueado_ate TEXT
);
CREATE TABLE sinuca_evento (          -- tudo que mexe na conduta e nas entradas fica registrado
  id         INTEGER PRIMARY KEY,
  cliente_id TEXT,
  tipo       TEXT NOT NULL,
  delta      INTEGER NOT NULL DEFAULT 0,
  obs        TEXT,
  mesa_id    TEXT,
  criado_em  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_sinuca_evento ON sinuca_evento (cliente_id, tipo, criado_em);
