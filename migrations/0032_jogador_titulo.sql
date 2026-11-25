-- Título especial de um jogador (ex.: "Pinky e Cérebro" com ícone). Vale no lugar do nível; o score continua contando.
CREATE TABLE jogador_titulo (
  chave      TEXT PRIMARY KEY,           -- c:<cliente> ou n:<nome>, o mesmo de jogador_score
  titulo     TEXT NOT NULL,
  icone      TEXT NOT NULL DEFAULT '',
  criado_por TEXT,
  criado_em  TEXT NOT NULL DEFAULT (datetime('now'))
);
