-- Estoque recomendado: quanto o bar QUER ter de cada item (em embalagens). Vazio = o sistema calcula pelas vendas.
ALTER TABLE insumo ADD COLUMN estoque_recomendado REAL;
