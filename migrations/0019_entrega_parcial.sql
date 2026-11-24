-- Entrega parcial: quanto de cada item já foi entregue, e quantas remessas já saíram (marcador "REP n").
ALTER TABLE item_pedido ADD COLUMN entregue_qtd REAL NOT NULL DEFAULT 0;
ALTER TABLE pedido ADD COLUMN remessa INTEGER NOT NULL DEFAULT 0;
