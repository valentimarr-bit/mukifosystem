-- App do cliente: pedido pelo celular só vale depois de pago; retirada no balcão por QR de uso único.
ALTER TABLE pedido ADD COLUMN celular TEXT;
ALTER TABLE pedido ADD COLUMN token_hash TEXT;      -- SHA-256 do segredo do QR (o segredo em si nunca é guardado)
ALTER TABLE pedido ADD COLUMN origem_hash TEXT;     -- SHA-256 do IP do cliente (só para limitar abuso; não dá para voltar ao IP)
ALTER TABLE pedido ADD COLUMN expira_em TEXT;       -- pedido não pago some depois disso
ALTER TABLE pedido ADD COLUMN retirado_em TEXT;
CREATE INDEX idx_pedido_celular ON pedido (celular, criado_em);
INSERT INTO configuracao (chave, valor) VALUES ('pix_chave', '');
INSERT INTO configuracao (chave, valor) VALUES ('pix_nome', 'MUKIFO');
INSERT INTO configuracao (chave, valor) VALUES ('pix_cidade', 'PORTO ALEGRE');
