-- Nível de alerta por item, definido pelo gerente (na mesma unidade da coluna "Tem": embalagens).
-- NULL = sem alerta. Quando o estoque atual fica igual ou abaixo, o item aparece em alerta.
ALTER TABLE insumo ADD COLUMN minimo_alerta REAL;
