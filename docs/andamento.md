# Andamento

Atualize no fim de cada sessão. Mais recente em cima.

## 2026-11-24 — login e deploy só pelo site
**Feito**
- Código enviado ao GitHub (`main`).
- Login (`migrations/0003_usuarios.sql`, `src/auth.js`, `public/entrar.js`): o primeiro acesso, com `CODIGO_PRIMEIRO_ACESSO`, cria o **superadmin**; ele troca a senha, adiciona gerentes e passa o cargo (só um superadmin por vez). Gestão (aba Conta) e app de compras usam o mesmo login. `ADMIN_TOKEN` virou chave de emergência.
- Banco se monta sozinho: `wrangler.jsonc` sem `database_id` (o deploy cria o D1) e o Worker aplica migrações + seed no primeiro acesso. Seed agrupado em 20 comandos (limites do D1). Testado no D1 local do wrangler com banco vazio.
- 25 testes passando.
- Estoque: colunas clicáveis para ordenar (Item, Tem, Mínimo, Comprar, Situação); 1º toque ordena, 2º inverte, 3º volta ao normal.
- **Alertas de estoque** (`migrations/0005_alerta_estoque.sql`, `PUT /api/alertas`): aba **Alertas** na gestão, onde se define por item com quantas embalagens avisar. No Estoque, item em alerta (atual ≤ nível) ganha destaque, faixa no topo e filtro "só em alerta". Ainda não alimenta a lista de compras nem manda aviso fora da tela.
- **Editar produtos** (aba Produtos e lucro): criar, trocar nome/preço/"dá baixa no estoque", montar a ficha (ingredientes e quantidades) e desativar (`src/produtos.js`, `test/produtos.test.js`). Renomear mantém o histórico de vendas ligado ao produto, mas o nome precisa continuar igual ao do sistema de vendas.
- **Dado a corrigir (planilha antiga):** "Promo Caipirinha Dose Dupla" tem Limão Taiti = 25 kg na ficha (provável 0,25). Infla CMV (R$ 154,94), mínimos e lista de compras. Corrigir pela tela de edição.
- **Fotos** de produtos (149) e insumos (78): aba **Fotos** na gestão (grade com "só os que faltam", escolher/tirar foto, botão "Procurar no Google", remover). A foto é reduzida no navegador (640 px, JPEG) e guardada no D1 (`migrations/0004_fotos.sql`, `src/fotos.js`, `public/fotos.js`). Miniaturas em Estoque, Produtos e na lista de compras do celular. Leitura pública, envio/remoção exigem login.
- Corrigido: `/favicon.ico` dava erro 500 (faltava `assets.binding = "ASSETS"`).
- Seletor de **visual** (Escuro, Claro, Vinho, Alto contraste) na gestão e no app de compras (`public/tema.js`, salvo no aparelho). Cores via variáveis CSS; para criar um tema novo basta acrescentar uma linha em `TEMAS`. Falta alinhar ao Armant 360 (sem acesso ao repo) e às cores reais do Mukifo (logo).

**Próximo**
- Publicar pelo painel da Cloudflare (README → "Publicar") e criar o segredo `CODIGO_PRIMEIRO_ACESSO`.
- Aplicar a interface do Armant 360 com as cores do Mukifo (falta acesso ao repo `cscarmant/armant360` e as cores/logo do Mukifo).

**Em aberto**
- Se a criação automática do D1 falhar no build da Cloudflare: criar o D1 `mukifo` no painel e pôr o `database_id` no `wrangler.jsonc`.

## 2026-11-23 (3ª sessão) — app de compras no celular
**Feito**
- Migração `0002_lista_compras.sql` (lista_compras, item_lista).
- API de listas: gerar (segunda/quinta), marcar/ajustar item, adicionar esquecido, finalizar → compra por fornecedor + entrada no estoque + preço real atualizado.
- App `/compras/` (PWA instalável): marca com um toque (vibra), ✎ para quantidade/valor pago, ocultar comprados, funciona sem internet com fila de envio, sincroniza entre celulares a cada 20 s.
- 15 testes passando (inclui o fluxo da lista).

**Próximo**
- Repo no GitHub: https://github.com/valentimarr-bit/mukifosystem (o `origin` já está configurado; falta `git push -u origin main` pelo terminal).
- Subir o D1 no PC (README → "Banco de dados") + abrir `/compras/` no celular e instalar.

## 2026-11-23 (2ª sessão) — fase 2
**Feito**
- Dados da planilha extraídos (`scripts/extrair_planilha.py` → `seed/planilha.json`): 78 insumos, 87 fichas, 19 fornecedores, 31 dias de vendas.
- Regras de cálculo em `src/dominio/estoque.js`. **14 testes passando**: médias, consumo por dia, mínimos de segunda/quinta, baixa pela ficha, sugestão, situação e CMV batem com a planilha recalculada (78 itens).
- `seed/seed.sql` (149 produtos: 87 com ficha + 62 vendidos sem ficha).
- API: estoque, lista de compras, produtos/CMV, importar relatório, contagem, compras (escritas com senha).
- Página `/gestao.html`: estoque, lista de compras (imprime em 58 mm e copia para WhatsApp), produtos e lucro, registrar relatório e contagem.

**Próximo**
- No PC: criar o D1, migrar, `npm run seed`, `wrangler secret put ADMIN_TOKEN`, deploy (README → "Banco de dados").
- Primeira contagem real do estoque pela página.
- Importar o extrato da adquirente (depende de saber qual é e do acesso).
- Fase 3: app Android da DX8000.

**Atenção**
- Preços dos insumos ainda são as ESTIMATIVAS da planilha; o CMV só fica real depois de registrar compras com valor.
- `npm run seed` apaga tudo: só para carga inicial.

## 2026-11-23
**Feito**
- Repositório criado: Worker + página inicial + `/api/saude`, modelo de dados D1 (`migrations/0001_inicial.sql`), planilha antiga em `legado/planilha/`.
- Prompts (`prompt-pos.md`, `prompt-celular.md`), roteiro, perguntas do hortifruti, guia de colaboração.
- Maquininhas identificadas: 2× Ingenico AXIUM DX8000 (vermelhas).

**Próximo**
- Rodar `gh repo create` + `npm run deploy` (ver README) e conectar Workers Builds.
- Fase 2: criar o D1 e o importador (planilha + histórico + extrato da adquirente).

**Em aberto**
- Confirmar a adquirente (Getnet?).
- Qual app/sistema gera o relatório de vendas (`docs/historico-pos.md`).
- Acesso ao app/portal da adquirente.
- Logo do Mukifo (arquivo original ou print do @mukifopoa).
- Respostas do hortifruti (`docs/hortifruti-perguntas.md`).
- Provedor de Pix/cartão para o app do celular.

## Sessão: módulo de venda + app do cliente
- **Venda no balcão** (`/venda.html`): produtos por categoria (categorias sugeridas automaticamente 1 vez; o gerente ajusta no editor de produto), botões grandes com preço, várias comandas abertas, dividir a conta, cobrança por forma (Pix/débito/crédito/dinheiro) com **escolha da maquininha por cobrança** (padrão ou equilibrar; superadmin configura na aba Conta). Fechou o pagamento → comanda vira venda e dá baixa no estoque pela ficha técnica (uma vez só).
- **Navi (maquininhas POS)**: ainda NÃO integrado. `src/pagamentos/navi.js` é um stub: o operador passa o valor na maquininha escolhida e toca "Recebido ✓". Falta: documentação/API do Navi + segredos `NAVI_API_URL` e `NAVI_TOKEN`.
- **App do cliente** (`/cliente.html`): cardápio, nome + celular, Pix copia-e-cola com valor exato. **Pedido só entra na fila depois de pago**; não pago vence em 15 min.
- **Segurança**: preço sempre vem do servidor; QR de retirada com segredo de 128 bits (só o hash fica no banco), uso único (atualização atômica), vale só no dia do turno; o balcão recusa pedido não pago, vencido, de outro dia ou já usado; limite de pedidos não pagos por celular (2) e por aparelho/rede (6); a consulta de status exige a chave do pedido (erro idêntico para "não existe" e "chave errada"); aviso automático de pagamento só vale com assinatura HMAC (`PAGAMENTO_WEBHOOK_SECRET`).
- **Pendente**: confirmação AUTOMÁTICA do Pix (hoje o balcão toca "Pix recebido ✓" depois de ver o dinheiro no banco). Precisa de um provedor Pix (banco/PSP com cobrança e webhook) ou do Navi; o endpoint `/api/cliente/pagamento/webhook` já existe e confere a assinatura.
- Importar o relatório de vendas de um dia que já tem vendas lançadas aqui retorna 409 (evita contar em dobro no estoque); use `forcar` só se souber o que faz.

## Combos
- Aba **Combos** na gestão: combo = produto vendável (categoria "Promoções e kits") formado por outros produtos; custo e lucro calculados pelos componentes; ao vender, o estoque baixa pela ficha de cada produto do combo (sem combo dentro de combo). Combos antigos da planilha (KIT…) continuam como produtos comuns com ficha própria.
- Limitação: o cálculo de estoque mínimo por histórico de vendas ainda não "abre" combos.
- **Pergunta em aberto (Pix):** em qual conta/banco o Pix cai? Define o provedor para confirmação automática (webhook).

## Trava de estoque (não vender o que não tem)
- Balcão e app do cliente recusam item sem estoque (409 com mensagem simples). Produto esgotado aparece "ESGOTADO" e desabilitado; com 5 ou menos aparece "restam N".
- Reserva: itens de comandas abertas e de pedidos do app ainda não pagos (até vencer) contam como comprometidos, para dois operadores não venderem a última unidade duas vezes. Comanda esquecida aberta reserva estoque: cancele-a.
- Combos conferem o estoque pelos ingredientes dos produtos que levam.
- A trava só vale para ingredientes **já contados ou com entrada** (compra/ajuste/produção). Vendas sozinhas não contam; por isso, **antes da primeira contagem nada trava**. Depois da contagem passa a travar.
- Superadmin liga/desliga em Conta → "Trava de estoque" (padrão: ligada).

## Estoque recomendado e "Recomendado" (antiga lista de compras sugerida)
- Cada item pode ter **estoque recomendado** (quanto o bar quer ter; aba Níveis). Em branco = cálculo automático pelo histórico de vendas.
- A aba antes chamada "Lista de compras" na gestão agora é **Recomendado**: compra recomendada = recomendado − o que tem agora (as vendas feitas aqui já baixaram o estoque). A **lista de compras** propriamente dita é a que vai para o celular (/compras), gerada a partir do recomendado.
- API: `PUT /api/recomendados`; `/api/estoque` e `/api/lista-compras` trazem `estoque_recomendado`, `auto_*`, `tem`, `recomendado`.

## Desempenho (relatórios e indicadores)
- Aba **Desempenho** na gestão (`GET /api/desempenho?de=&ate=`, exige login): faturamento, vendas, ticket médio, itens por venda, lucro bruto estimado e margem (pela ficha técnica), perdas/diferenças de contagem, compras, estoque esgotado/em alerta; comparação com o período anterior; faturamento por dia, horário de pico, média por dia da semana, mais vendidos, quem mais dá lucro, margem baixa, categorias, formas de pagamento, por maquininha, origem da venda, vendidos sem ficha e um bloco "O que olhar".
- Relatório importado (1 linha por dia) soma no faturamento, mas não conta em nº de vendas, ticket nem horário.
- Próximos indicadores sugeridos: CMV real (consumo contado ÷ faturamento), giro/cobertura de estoque em dias, ruptura (horas com item esgotado), tempo de atendimento, cortesias/descontos, ranking por operador, previsão de demanda por dia/clima, fechamento de caixa por turno.
