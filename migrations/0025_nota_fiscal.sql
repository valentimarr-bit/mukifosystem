-- Nota fiscal nas contas a pagar: dados da nota (número, chave de 44 dígitos, emissão, CNPJ do fornecedor) e o arquivo (foto ou PDF).
ALTER TABLE despesa ADD COLUMN nf_numero TEXT;
ALTER TABLE despesa ADD COLUMN nf_serie TEXT;
ALTER TABLE despesa ADD COLUMN nf_chave TEXT;
ALTER TABLE despesa ADD COLUMN nf_emissao TEXT;
ALTER TABLE despesa ADD COLUMN fornecedor_cnpj TEXT;
CREATE UNIQUE INDEX idx_despesa_nf_chave ON despesa (nf_chave) WHERE nf_chave IS NOT NULL;   -- a mesma nota não entra duas vezes
CREATE TABLE despesa_anexo (
  despesa_id    INTEGER PRIMARY KEY REFERENCES despesa(id) ON DELETE CASCADE,
  nome          TEXT,
  mime          TEXT NOT NULL,
  dados_b64     TEXT NOT NULL,
  bytes         INTEGER NOT NULL,
  usuario       TEXT,
  atualizada_em TEXT NOT NULL DEFAULT (datetime('now'))
);
