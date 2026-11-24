# Prompt 1 — Sistema na POS smart (Ingenico AXIUM DX8000)

Use este prompt numa sessão nova do Claude Code dentro deste repositório. Antes, troque `[ADQUIRENTE]` pela empresa que aparece na tela das maquininhas (provavelmente Getnet).

```markdown
# Papel
Você é um engenheiro de software sênior em apps Android para POS smart brasileiras e sistemas de gestão para bares. Escreva código de produção, testado e documentado em português do Brasil.

# Contexto do negócio
- Bar: Mukifo (boteco, Rua Mariante 627, Rio Branco, Porto Alegre). Drinks, cervejas, petiscos, pastel e almoço à la minuta.
- Abre de terça a domingo; segunda fechado. Sexta vende igual a sábado; ter, qua, qui e dom vendem cerca de 1/3 de um sábado.
- Compras físicas na segunda e na quinta, antes de abrir. A compra de segunda cobre ter+qua; a de quinta cobre qui+sex+sáb+dom.
- Quem opera tem pouca experiência com tecnologia. Telas simples, palavras do dia a dia, botões grandes, nada de jargão.
- Hoje o controle é uma planilha Excel (pasta legado/planilha). Leia o README.md e o gerar_planilha.py inteiros: eles têm as fichas técnicas, os 77 itens de estoque, os 19 fornecedores, as regras de arredondamento e as conversões (limão em kg, bebidas em litros, fichas em ml). Essas regras valem no sistema novo, salvo quando este prompt disser outra coisa.
- Os 31 relatórios em legado/planilha/dados/historico/ são vendas reais (20/10 a 20/11/2026). Use-os para semear o banco e testar.

# Objetivo
Um sistema que: (1) registra vendas na POS; (2) dá baixa automática dos ingredientes pela ficha técnica; (3) calcula estoque, mínimos e sugestão de compra; (4) imprime a lista de compras na própria POS; (5) mostra CMV, lucro e perdas por produto. O objetivo final é saber quanto vai em cada prato e drink, quando e quanto comprar e onde o dinheiro se perde.

# Hardware alvo
- POS smart: Ingenico AXIUM DX8000 (Android 10, impressora térmica de 58 mm, cerca de 32 colunas), credenciada pela [ADQUIRENTE]. O bar tem duas unidades; o app roda nas duas, cada uma identificada pelo número de série.
- Antes de codar, pesquise a documentação oficial atual da adquirente para a DX8000 (na Getnet, o pagamento é chamado por deeplink para o app dela): pagamento, API de impressão, versão mínima de Android, loja de apps, regras de publicação. Escreva um resumo em docs/maquininha.md.
- Isole pagamento e impressão atrás de interfaces (Pagamento, Impressora), com uma implementação para a DX8000 e uma falsa para testes e emulador. Trocar de maquininha não pode exigir mexer no resto do código.

# Arquitetura (já decidida — ver CLAUDE.md)
- Backend: Cloudflare Workers (API) + D1 (banco) + Durable Objects (tempo real). Única fonte da verdade. Modelo inicial em migrations/0001_inicial.sql.
- App POS: Kotlin + Jetpack Compose em pos-android/, banco local (Room) e funcionamento offline. Vendas sem internet entram numa fila e sincronizam quando a conexão volta, sem duplicar (id gerado no aparelho).
- Painel de gestão: páginas em public/ servidas pelo Worker.
- Pedidos têm origem "pos" ou "celular" e status recebido, preparando, pronto e entregue (o app do celular vem no prompt-celular.md).

# Regras de cálculo (as mesmas da planilha)
- Mínimo de segunda = média de consumo de ter+qua × (1 + folga). Mínimo de quinta = média de qui+sex+sáb+dom × (1 + folga). Folga padrão 20%, editável.
- Média por dia da semana vem do histórico, excluindo dias fora da média (feriado, véspera, chuva forte, ±35% do normal). Sem histórico daquele dia: sex/sáb = 1 sábado, demais = 1/3.
- Sugestão de compra = mínimo do dia − estoque atual, com os arredondamentos do README.
- Estoque atual = soma de movimento_estoque. Nunca sobrescrever.
- Gelo é produção própria e não entra na lista de compras. Comidas sem ficha não dão baixa e aparecem como "produto sem ficha".
- CMV do produto = soma de (quantidade × custo unitário atual) dos ingredientes. Lucro = preço − CMV.

# Telas da POS
1. Vender: grade por categoria, carrinho, cobrar pela maquininha (crédito, débito, Pix) ou registrar dinheiro. Imprime comanda de preparo.
2. Fila: pedidos em preparo e prontos (incluindo os do celular). Botões grandes "Pronto" e "Entregue".
3. Estoque: busca por item, estoque atual e situação (ok, perto do mínimo, comprar).
4. Lista de compras: escolher Segunda ou Quinta, ver agrupada por fornecedor e imprimir.
5. Registrar: compra recebida, perda (quebra, vencido, erro de preparo, cortesia) e contagem de fechamento.
6. Perfis com PIN: bar só vende e registra perda; gerente vê tudo e ajusta.

# Impressão da lista de compras (58 mm)
- Cabeçalho: MUKIFO, "LISTA DE COMPRAS", dia (Segunda/Quinta), data e hora, quem imprimiu.
- Um bloco por fornecedor: nome e como pede. Uma linha por item: quantidade + unidade + nome, até 32 colunas; nome longo quebra recuado.
- Hortifruti/Ceasa num bloco próprio no fim.
- Rodapé: total estimado em R$ por fornecedor e geral; "[ ]" ao lado de cada item para marcar a caneta.
- Botão "Reimprimir". Erro de impressora (sem papel, tampa aberta) em palavras simples.
- Mesma lista como texto pronto para o WhatsApp de cada fornecedor.
- Opcional: logo em bitmap monocromático de 384 px no topo.

# Relatórios do painel
- CMV e lucro por produto e categoria; ranking dos que mais e menos dão lucro.
- Perdas: diferença de contagem por insumo, em quantidade e R$, por semana.
- Consumo teórico (vendas) × real (contagem) por insumo.
- Vendas por dia da semana e por hora.
- Produtos vendidos sem ficha técnica.

# Importação inicial
- Script que lê legado/planilha (gerar_planilha.py e CSVs do histórico) e popula insumos, produtos, fichas, fornecedores e vendas históricas. Relatório do que não conseguiu importar.
- Enquanto o sistema novo não for confiável, o bar segue com a planilha. Preveja exportar o estoque para .xlsx no mesmo layout para comparar.

# Qualidade
- Testes automáticos das regras de cálculo com os dados reais. Os números têm que bater com a planilha.
- Nenhum dado de cartão armazenado.
- Auditoria: quem fez cada ajuste, perda ou contagem.

# Como trabalhar
1. Leia o repositório e escreva docs/regras.md com todas as regras. Pare e mostre.
2. Escreva docs/maquininha.md. Pare e mostre.
3. Proponha telas e ajustes no modelo de dados. Espere aprovação.
4. Implemente uma fase por vez (ver docs/roteiro.md), com testes, e atualize docs/andamento.md no fim de cada sessão.
```
