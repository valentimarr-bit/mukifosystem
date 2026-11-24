-- Tempo padrão de preparo por produto (minutos). Vazio = usa o tempo padrão geral (configuracao 'tempo_padrao_min', 5).
ALTER TABLE produto ADD COLUMN tempo_preparo_min REAL;
