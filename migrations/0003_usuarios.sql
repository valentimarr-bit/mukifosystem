-- Login: o primeiro a entrar vira superadmin e pode passar o cargo adiante.
CREATE TABLE usuario (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nome        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  senha_hash  TEXT NOT NULL,
  senha_sal   TEXT NOT NULL,
  papel       TEXT NOT NULL DEFAULT 'gerente' CHECK (papel IN ('superadmin', 'gerente')),
  ativo       INTEGER NOT NULL DEFAULT 1,
  criado_em   TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Só pode existir um superadmin ativo por vez.
CREATE UNIQUE INDEX um_superadmin ON usuario (papel) WHERE papel = 'superadmin';

CREATE TABLE sessao (
  token_hash  TEXT PRIMARY KEY,
  usuario_id  INTEGER NOT NULL REFERENCES usuario(id),
  criada_em   TEXT NOT NULL DEFAULT (datetime('now')),
  expira_em   TEXT NOT NULL
);
