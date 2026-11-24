-- Trava de segurança: não vender o que não tem no estoque (ligada por padrão; o superadmin pode desligar).
INSERT INTO configuracao (chave, valor) VALUES ('travar_estoque', 'sim');
