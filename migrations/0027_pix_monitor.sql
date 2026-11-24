-- Monitor de Pix: Pix que cai direto na chave do bar (sem gateway) e a conciliação com o que está esperando pagamento.
CREATE TABLE pix_recebido (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  id_externo    TEXT NOT NULL UNIQUE,        -- id do Pix (E2E) ou impressão digital da notificação: o mesmo aviso nunca entra duas vezes
  valor         REAL NOT NULL CHECK (valor > 0),
  pagador       TEXT,
  texto         TEXT,
  origem        TEXT NOT NULL DEFAULT 'webhook' CHECK (origem IN ('webhook', 'manual')),
  status        TEXT NOT NULL DEFAULT 'novo' CHECK (status IN ('novo', 'conciliado', 'ignorado')),
  ref           TEXT,                        -- cobrança/recarga/inscrição que ele pagou
  conciliado_por TEXT,
  conciliado_em TEXT,
  recebido_em   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_pix_recebido ON pix_recebido (status, recebido_em);
CREATE UNIQUE INDEX idx_pix_recebido_ref ON pix_recebido (ref) WHERE ref IS NOT NULL;   -- uma cobrança só é paga por um Pix
INSERT INTO configuracao (chave, valor) VALUES ('pix_monitor_auto', 'nao');       -- sim = aprova sozinho quando só há uma cobrança com aquele valor
INSERT INTO configuracao (chave, valor) VALUES ('pix_monitor_auto_max', '200');   -- acima disso, sempre pede a sua confirmação
