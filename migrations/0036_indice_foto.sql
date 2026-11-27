-- Índice para checar se a foto mudou (cache das imagens), sem ler o conteúdo.
CREATE INDEX IF NOT EXISTS idx_foto_versao ON foto (tipo, ref_id, atualizada_em);
