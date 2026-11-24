-- Registro de tudo que se faz no sistema, por login (só o superadmin lê). Guarda 180 dias.
CREATE TABLE auditoria (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  quando     TEXT NOT NULL DEFAULT (datetime('now')),
  ator_tipo  TEXT NOT NULL,          -- equipe | cliente | visitante
  ator_nome  TEXT NOT NULL,
  papel      TEXT,
  acao       TEXT NOT NULL,          -- frase em português ("Registrou compra")
  metodo     TEXT NOT NULL,
  rota       TEXT NOT NULL,
  status     INTEGER NOT NULL,
  resumo     TEXT,                   -- o que foi enviado, sem senhas, códigos nem chaves
  ip         TEXT                    -- só um pedaço do hash do IP (distinguir aparelhos sem guardar o IP)
);
CREATE INDEX idx_auditoria_quando ON auditoria (quando);
CREATE INDEX idx_auditoria_ator ON auditoria (ator_nome, quando);
