# Controle de Estoque do Bar (drinks) — pacote para continuar em outro Claude

Planilha Excel (.xlsx, compatível com **Excel Online**) que dá baixa no estoque a partir do relatório de vendas do sistema do bar, sugere compras e calcula **CMV / lucro** por produto.
Feita pelo Julio (dono do NØT, Porto Alegre) para ajudar uma amiga a controlar o bar/restaurante dela. A pessoa que vai usar tem **pouca experiência com planilhas**: tudo deve ser simples, com palavras do dia a dia.

## Como gerar
```bash
pip install openpyxl   # e LibreOffice (soffice) para o gerar_teste.py recalcular
python3 gerar_planilha.py saida/Controle_Estoque_Bar.xlsx      # planilha em branco (para entregar)
python3 gerar_teste.py                                          # cópia de teste preenchida
```
Para conferir as fórmulas sem Excel: `soffice --headless --convert-to xlsx --outdir /tmp/calc arquivo.xlsx` e ler com `openpyxl(data_only=True)`.
**Sempre** rodar esse teste (sem `#VALUE!`, `#REF!` etc.) antes de entregar.

## Arquivos
| Arquivo | O que é |
|---|---|
| `gerar_planilha.py` | Gera a planilha inteira (itens, fichas/receitas, fórmulas, formatos, textos da aba Observações). **Toda alteração é feita aqui.** |
| `gerar_teste.py` | Gera a cópia de teste com TODAS as lacunas preenchidas (valores aproximados; contatos fictícios). Sempre preencher tudo no teste. |
| `dados/relatorio_sabado.csv` | Relatório real de um sábado (base do consumo, dos Estoques Mínimos e do Preço de Venda). |
| `dados/relatorio_colado_coluna_A.txt` | Como o relatório fica quando colado no Excel Online (tudo na coluna A). |
| `dados/teste_estoque_inicio.txt` | Sequência de Estoque Início para teste (77 itens, colar na F6). |
| `dados/precos_referencia.py` | Preços de referência (R$/unidade) usados no teste — estimativas, não custos reais. |
| `saida/` | Últimas versões geradas. |

## Estrutura da planilha
- **Vendas** — colar o relatório na **A1**. Pode cair tudo na coluna A (texto com vírgulas) ou dividido em colunas: colunas ocultas I/J/K separam Produto e Qtd. Fórmulas usam `INDEX($A:$A;ROW())` para resistir a células apagadas/inseridas. Coluna G avisa "SEM FICHA".
- **Ficha** — receita de cada produto (nome **igual ao relatório**). Colunas: Produto | **CMV** | **Preço de Venda** | **Lucro R$** | **Lucro %** | Ingrediente | **Custo ingrediente** | Quantidade | Medida | Vendidos | Consumo em Quantidade | Observação. Produto/CMV/preço/lucro/vendidos mesclados por produto. Linhas livres no fim para receitas novas.
- **Compras** — mesmos itens do Estoque: unidades compradas/produzidas, valor pago, preço por unidade.
- **Estoque** — topo: **Dia da compra** (lista Segunda/Quinta) + caixa "Quando comprar". Colunas: Item | Tipo | Medida | Quantidade por Unidade | Embalagem | **Estoque Início** | **Compra/Produção** | Consumo em Quantidade | Consumo em Unidade | Estoque Atual | **Estoque Mínimo Segunda** (dura ter+qua) | **Estoque Mínimo Quinta** (dura qui→dom) | Situação | **Sugestão de Compra** | Estoque Esperado (semana passada) | Perda / Sobra da semana | **Preço da Unidade (R$)**.
- **Lista de Compras** — gerada sozinha a partir da Sugestão de Compra, agrupada por fornecedor (colunas ocultas H/I/J com SMALL/INDEX; chave = índice do fornecedor × 1000 + linha do Estoque, coluna oculta T do Estoque). Coluna "Comprado ✔" risca a linha.
- **Produção** — separada das compras: plano do gelo da máquina (4 sacos de 5 L na quarta, quinta e sexta = 12 sacos para o fim de semana) e xaropes/preparos com fornecedor "Produção própria" (coluna oculta V do Estoque). Esses itens NÃO entram na Lista de Compras.
- **Fornecedores** — 19 fornecedores do documento MUKIFO_Produtos_e_Fornecedores (como recebe, contato, observação), itens/valor do pedido do dia e **mensagem pronta para WhatsApp** (`_xlfn.TEXTJOIN` em ArrayFormula). Estoque tem "Fornecedor principal" (lista suspensa) e "Outros fornecedores".
- **Histórico 30 dias** — já vem com os 31 relatórios reais (20/10 a 20/11/2026, em `dados/historico/`); coluna G = motivo para ficar fora da média (feriado/véspera, chuva forte com venda baixa, ±35% do normal, segundas). Colar um relatório por dia na coluna B (um embaixo do outro), data na coluna A só na linha do cabeçalho. Colunas ocultas Q..U fazem a leitura; H:I contam os dias por dia da semana.
- **Média por Dia** — média de unidades vendidas por produto em cada dia da semana (Ter..Dom). A Ficha tem colunas ocultas M..R com o consumo médio de cada ingrediente por dia.
- **IMPRESSÕES** — folha A4 para imprimir: Item | Medida | Início do Movimento (digitado do papel) | Produção do dia (média do dia × 1,2 − início; sem histórico usa referência: Sex/Sáb = 1 sábado, demais = 1/3) | Final do Movimento (em branco, a equipe preenche no fechamento). Seções: produções da casa, gelo (plano da aba Produção), adiantamentos (limão Taiti cortado = 100 g/limão, siciliano = 150 g/limão, laranja em fatias), hortifruti.
- **Observações** — glossário (Quantidade = ml/L/g/kg; Unidade = garrafas/latas/pacotes), rotina, regras e estimativas.

## Regras de negócio combinadas (não mudar sem o Julio pedir)
- Bar abre **terça a domingo**. Ter/Qua/Qui/Dom vendem **1/3 de um sábado**; sexta = sábado. Segunda fechado.
- Compras **físicas, segunda e quinta**, antes de abrir. Segunda dura ter+qua (2/3 sáb); quinta dura qui+sex+sáb+dom (8/3 sáb). Mínimos são **fórmulas**: média de consumo (Histórico → Média por Dia → Ficha M..R → Estoque W..AB) dos dias cobertos × (1 + folga da célula Estoque!B3, 20%). Dia da semana sem histórico usa referência (sex/sáb = 1 sábado, demais = 1/3).
- Sugestão = Mínimo do dia escolhido − Estoque Atual. Arredonda: itens inteiros p/ cima; destilados/licores p/ garrafa mais próxima; limão e produção da casa de 0,5 em 0,5.
- Não alcoólicos (refri, água, energético, tônica, Baly): sempre unidades inteiras, consumo arredondado p/ cima.
- Estoque Início **sem vírgula** para destilados, licores (exceto vinho/espumante), cervejas, não alcoólicos e descartáveis. Colunas D e H continuam em **litros com vírgula**.
- Bebidas em **litros** no Estoque; fichas em **ml**. Limões em **kg da fruta** (1 kg Taiti ≈ 400 ml suco; siciliano ≈ 350 ml; 1 limão ≈ 100 g); laranja por unidade (8 fatias); ervas por maço (~50 folhas).
- **Gelo**: 100% produção própria (máquina), fora das receitas; só o plano na aba Produção. Hortifruti: fornecedor principal = **Ceasa**. Comidas sem ficha. Fichas de sinuca não baixam estoque.
- Kit dos Guri = só Passport; Caipa Copão = só cachaça Velho Barreiro; Promo Caipirinha Dose Dupla = 2 caipirinhas; Promo Heineken 600 = 2, Latão = 3, Long Neck = 3; doses 50 ml; dose de tequila usa item "Tequila" (separado da Tequisla).
- Visual: todas as colunas centralizadas, exceto nomes (produto/ingrediente/item) e observações (à esquerda). Amarelo = preencher; branco = fórmula.

## Preferências do Julio
- Português do Brasil; respostas diretas e concretas; verificar tudo antes de entregar (preços, contas).
- Convenções do **Excel Online** (separador `;` na tela; nada exclusivo do Excel desktop). Evitar `LET`, macros.
- Para pesquisar preços: mercado brasileiro real (Mercado Livre, Amazon.com.br, atacados).

## Pendências / ideias
- Fichas que faltam (produtos vendidos no histórico sem receita): Kit Red Bull (whisky ou vodka?), doses de Conhaque Domecq, Cachaça especial, Black Label, Theros Gin, Baileys, Amarula; revenda sem cadastro (Mascate, Fanta Guaraná, Tônica Schweppes, Corona Zero, Red Bull sem açúcar/sabores, Stella latão, Guaraná Zero, Citrus Fruki, Del Valle, Limonada mineral); Vinho da casa, Kit Duvidoso, Kit das Guria, Hecho en Peru. Copo Gelo G: sugestão = sem baixa (gelo da máquina).
- Confirmar: White Horse com Baly, Jäger Tonic, promos de litrão (1 por venda).
- Para conferir o histórico fora do Excel: `soffice` + openpyxl, ou o script de análise em `analise_historico.py`.
- Contatos dos fornecedores em branco.
- Preço da Unidade real (o teste usa estimativas).
- Ficha do Macunaíma: copo de 400 ml é estimativa.
- Drinks que ainda não apareceram no relatório: conferir se o nome na Ficha bate com o sistema.
