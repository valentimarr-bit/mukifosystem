# Roteiro de implementação

Cada fase só começa quando a anterior passa no critério. A planilha só é desligada no fim. Prazos são estimativas para uma pessoa com assistente de código.

| # | Fase | Prazo | Passa quando |
|---|---|---|---|
| 1 | Repositório + deploy na Cloudflare | feito | Página inicial e `/api/saude` no ar |
| 2 | Banco D1 + importação (planilha, histórico, extrato Getnet) | 1–2 sem | Mínimos, sugestões e CMV batem com a planilha nos mesmos dados |
| 3 | Venda na POS (DX8000): vender, cobrar, comanda, baixa por ficha, offline | 2–3 sem | 1 semana em paralelo com a planilha sem diferença de estoque |
| 4 | Estoque, perdas, contagem e lista de compras **no celular** (app `/compras/`, já pronto) | 2 sem | 2 ciclos de segunda e quinta comprando pelo app |
| 5 | Painel: CMV, lucro, perdas em R$, consumo teórico × real | 2 sem | Relatório aponta os 10 itens que mais perdem dinheiro na semana |
| 6 | Hortifruti (ver hortifruti-perguntas.md) | 1–2 sem | Fator de limpeza de cada item medido ao menos uma vez |
| 7 | Pedidos pelo celular (ver prompt-celular.md) | 3–4 sem | Piloto numa ter/qua e numa sex/sáb sem pedido pago perdido |

Depois da fase 7, a planilha vira só exportação para conferência.
