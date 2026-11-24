-- Produto de pronta entrega (cerveja, lata...): não passa pela produção; o cliente só retira no balcão.
ALTER TABLE produto ADD COLUMN pronta_entrega INTEGER NOT NULL DEFAULT 0;
