-- Recuperação de senha do cliente: código de 6 dígitos de uso único (só o hash fica guardado), vale 15 min, 5 tentativas.
ALTER TABLE cliente ADD COLUMN reset_hash TEXT;
ALTER TABLE cliente ADD COLUMN reset_ate TEXT;
ALTER TABLE cliente ADD COLUMN reset_falhas INTEGER NOT NULL DEFAULT 0;
