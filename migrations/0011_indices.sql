-- Índices para as consultas mais frequentes (cardápio, trava de estoque, comandas, desempenho).
CREATE INDEX IF NOT EXISTS idx_pedido_origem_status ON pedido (origem, status, dia);
CREATE INDEX IF NOT EXISTS idx_item_pedido_produto ON item_pedido (produto_id);
CREATE INDEX IF NOT EXISTS idx_cobranca_status ON cobranca (status);
CREATE INDEX IF NOT EXISTS idx_movimento_insumo ON movimento_estoque (insumo_id, tipo);
CREATE INDEX IF NOT EXISTS idx_ficha_produto ON ficha_tecnica (produto_id);
CREATE INDEX IF NOT EXISTS idx_combo_item_produto ON combo_item (produto_id);
CREATE INDEX IF NOT EXISTS idx_contagem_insumo ON contagem (insumo_id);
CREATE INDEX IF NOT EXISTS idx_produto_norm ON produto (nome_normalizado);
