# Roteiro de implementação

Cada fase só termina quando passa no critério. A planilha só é desligada no fim. Legenda: ✅ feito · 🟡 parcial · ⏳ esperando informação ou terceiro · ⬜ não começou.
Atualizado em 24/11/2026.

| # | Fase | Situação | O que já existe | O que falta para passar |
|---|---|---|---|---|
| 1 | Repositório + deploy na Cloudflare | ✅ | Site no ar, banco monta sozinho, deploy automático pelo GitHub | — |
| 2 | Banco D1 + importação | 🟡 | Planilha carregada (78 insumos, produtos, fichas), importação do relatório diário, login com superadmin | Conferir mínimos/CMV contra a planilha com dados reais; importar extrato Getnet (se ainda for usado) |
| 3 | Venda no balcão | 🟡 | Tela de venda por categoria, comandas, dividir conta, escolha da maquininha por cobrança, baixa por ficha, trava de estoque, combos | **Navi** (documentação/API); **modo offline**; 1 semana em paralelo com a planilha sem diferença de estoque |
| 4 | Estoque, perdas, contagem e compras no celular | 🟡 | Estoque, alertas, estoque recomendado, aba Recomendado, lista de compras no celular, fotos, editar produtos | **1ª contagem completa** (hoje o estoque está zerado); 2 ciclos de segunda/quinta comprando pelo app |
| 5 | Painel de desempenho | 🟡 | Aba Desempenho: faturamento, ticket, margem, pico, mix, pagamentos, perdas | CMV real × teórico, cobertura de estoque em dias, ruptura; "10 itens que mais perdem dinheiro" |
| 6 | Hortifruti | ⏳ | Perguntas em `hortifruti-perguntas.md` | Suas respostas; depois fator de limpeza por item |
| 7 | Pedidos pelo celular | 🟡 | App do cliente com fotos, Pix com valor exato, pedido só vale pago, QR de uso único no balcão, limites anti-abuso | **Conta/banco do Pix** (`perguntas-pagamentos.md`) para confirmação automática; fotos dos produtos; piloto numa ter/qua e numa sex/sáb |
| 8 | Fechamento de caixa por turno | ⬜ | — | Esperado × contado por forma de pagamento e operador; diferença do dia |
| 9 | Financeiro (só superadmin) | ⬜ | Já temos: cobranças por forma e maquininha, compras com valor, margem no Desempenho | Despesas fixas e variáveis, contas a pagar com vencimento, taxas da maquininha e do Pix (bruto × líquido), recebíveis do cartão, sangria/suprimento, fluxo de caixa, resultado do mês (DRE simples) e ponto de equilíbrio |
| 10 | Modo offline (PWA) | ⬜ | Lista de compras já é PWA | Venda e app do cliente funcionando com internet ruim; fila de envio |
| 11 | Integrações de pagamento | ⏳ | Estrutura pronta (maquininha, webhook com assinatura) | Navi (API) e provedor Pix com aviso automático |
| 12 | Desligar a planilha | ⬜ | — | Planilha vira só exportação para conferência |

## Próximos passos (ordem sugerida)
1. **Você:** fazer a 1ª contagem completa do estoque (liga a trava de estoque em tudo e tira os zeros).
2. **Você:** responder `perguntas-pagamentos.md` (conta do Pix, banco, Navi) e `hortifruti-perguntas.md`.
3. **Você:** subir as fotos dos produtos (aba Fotos); preencher chave Pix em Conta.
4. **Eu:** fechamento de caixa por turno (fase 8).
5. **Eu:** modo offline da venda e do app do cliente (fase 9).
6. **Eu:** hortifruti (fase 6) e CMV real (fase 5), quando houver respostas.
7. **Eu:** Navi e Pix automático (fase 10) quando houver documentação.
8. **Piloto** do app do cliente em duas noites, depois fase 11.

## Já entregue fora do roteiro original
Login com superadmin, temas, fotos por produto, edição de produtos com busca de ingredientes, categorias, combos, trava de estoque, desempenho, design adaptável ao celular, botões grandes e otimização (índices, cache do cardápio).
