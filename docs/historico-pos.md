# Como puxar o histórico das maquininhas

A DX8000 é travada pela adquirente (sem cabo de dados, sem instalar programa sem autorização). O histórico vem de duas fontes:

## 1. Pagamentos — adquirente (provavelmente Getnet)
- **Manual:** exportar o extrato de vendas pelo app ou portal Getnet e importar no sistema.
- **Automático:** contratar o **Extrato Eletrônico** (arquivo diário padronizado de conciliação; inclui POS, TEF e e-commerce). O sistema lê o arquivo todo dia.
- Traz valor, hora, bandeira e forma de pagamento. **Não traz os produtos.**

## 2. Produtos vendidos — sistema de vendas (PDV)
- Os relatórios atuais vêm no formato `Produto, UN, Estoque, Qtd. vendida, Total vendas` (ver legado/planilha/dados/).
- Falta descobrir **qual app/sistema gera esse relatório** (foto da tela inicial da DX8000 resolve). Dependendo dele: exportação do período todo, API/integração, ou exportação dia a dia.

## Cruzamento
O importador da fase 2 lê as duas fontes e compara o total vendido no PDV com o total pago na adquirente, por dia. Diferença = venda não registrada ou registro sem pagamento.
