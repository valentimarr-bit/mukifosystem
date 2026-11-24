-- Convite automático por WhatsApp (izapia): fila de envio, recusas e limites.
ALTER TABLE cliente ADD COLUMN whats_recusou INTEGER NOT NULL DEFAULT 0;   -- 1 = não quer receber convites
CREATE TABLE convite_whats (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  modalidade_id TEXT NOT NULL,
  cliente_id    TEXT NOT NULL,
  celular       TEXT NOT NULL,                      -- com 55
  texto         TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'fila',       -- fila | enviado | erro | cancelado
  tentativas    INTEGER NOT NULL DEFAULT 0,
  erro          TEXT,
  criado_em     TEXT NOT NULL DEFAULT (datetime('now')),
  enviado_em    TEXT,
  UNIQUE (modalidade_id, cliente_id)                -- cada cliente é convidado uma vez por modalidade
);
CREATE INDEX idx_convite_status ON convite_whats (status, id);
INSERT INTO configuracao (chave, valor) VALUES ('whats_ativo', 'nao');            -- liga o envio (só com credenciais no Cloudflare)
INSERT INTO configuracao (chave, valor) VALUES ('whats_auto_convite', 'sim');     -- convida sozinho ao criar uma modalidade
INSERT INTO configuracao (chave, valor) VALUES ('whats_por_minuto', '4');         -- ritmo: poucas mensagens por minuto evitam bloqueio do número
INSERT INTO configuracao (chave, valor) VALUES ('whats_max_dia', '80');
INSERT INTO configuracao (chave, valor) VALUES ('whats_ultimo_erro', '');
