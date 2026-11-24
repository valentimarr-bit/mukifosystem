-- LGPD: só recebe convite por WhatsApp quem aceitou (opcional, separado dos termos) e pode desligar quando quiser.
ALTER TABLE cliente ADD COLUMN whats_aceite_em TEXT;            -- preenchido = aceitou receber; vazio = não aceitou ou desligou
CREATE TABLE consentimento_whats (                               -- prova do consentimento: cada aceite e cada revogação
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id TEXT NOT NULL,
  acao       TEXT NOT NULL,                                      -- aceitou | revogou
  origem     TEXT NOT NULL,                                      -- cadastro | conta (app do cliente) | balcao (equipe)
  celular    TEXT,                                               -- número no momento
  texto      TEXT NOT NULL,                                      -- texto exato mostrado (versão)
  em         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_consent_cliente ON consentimento_whats (cliente_id, id);
