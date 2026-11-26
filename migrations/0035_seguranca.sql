-- Papéis da equipe (atendente), troca obrigatória de senha e limite de tentativas
ALTER TABLE usuario ADD COLUMN cargo TEXT;
ALTER TABLE usuario ADD COLUMN trocar_senha INTEGER NOT NULL DEFAULT 0;
CREATE TABLE tentativa (chave TEXT PRIMARY KEY, falhas INTEGER NOT NULL DEFAULT 0, bloqueado_ate TEXT);
DELETE FROM sessao WHERE usuario_id IN (SELECT id FROM usuario WHERE nome = 'Demonstração');
UPDATE usuario SET ativo = 0 WHERE nome = 'Demonstração';
