-- Índices de desempenho do estoque (só índices: não muda nenhum dado).
-- 1) Conferir se uma venda já deu baixa (WHERE tipo = 'venda' AND referencia = ?) varria a tabela inteira a cada venda.
CREATE INDEX IF NOT EXISTS idx_mov_tipo_ref ON movimento_estoque (tipo, referencia);
-- 2) O saldo (SUM(quantidade) por insumo) e "tem entrada além de venda?" passam a ser lidos só no índice, sem abrir a tabela.
CREATE INDEX IF NOT EXISTS idx_mov_cobre ON movimento_estoque (insumo_id, tipo, quantidade);
-- O antigo (insumo_id, tipo) fica coberto pelo novo.
DROP INDEX IF EXISTS idx_movimento_insumo;
