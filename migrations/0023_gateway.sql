-- Pix criado num gateway (Mercado Pago, Woovi...): guarda o código copia e cola e o id do gateway, ligados à referência do Mukifo
-- (cob-… pedido do app, rec-… recarga da carteira, ins-… inscrição do campeonato). Sem linha aqui = Pix estático da chave do bar.
CREATE TABLE pix_externo (
  ref        TEXT PRIMARY KEY,
  gateway    TEXT NOT NULL,
  externo    TEXT,
  copia_cola TEXT NOT NULL,
  valor      REAL NOT NULL,
  criado_em  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_pix_externo_ext ON pix_externo (gateway, externo);
