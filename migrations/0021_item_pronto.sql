-- Pronto por item: a produção marca cada item do pedido quando fica pronto; todos prontos = pedido pronto.
ALTER TABLE item_pedido ADD COLUMN pronto_em TEXT;
