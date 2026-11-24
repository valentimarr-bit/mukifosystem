-- Combos: um produto à venda formado por outros produtos (ex.: 2 doses + 1 porção). O combo é uma linha em `produto`.
CREATE TABLE combo_item (
  combo_id    INTEGER NOT NULL REFERENCES produto(id) ON DELETE CASCADE,
  produto_id  INTEGER NOT NULL REFERENCES produto(id),
  quantidade  INTEGER NOT NULL CHECK (quantidade > 0),
  PRIMARY KEY (combo_id, produto_id)
);
