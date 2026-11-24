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

## Botões grandes e otimização
- Toda a interface com alvos de toque ≥ 48 px e fonte 16 px (gestão, venda, cliente, compras, início com botões grandes).
- Banco: índices novos (migração 0011) para pedidos, itens, cobranças, movimentos, fichas, combos.
- Cardápio público com cache de 5 s (alivia o D1 quando muitos clientes abrem); a trava de estoque continua conferida no servidor a cada item. Tela do balcão ignora o cache.
- Criação de pedido do app: 1 consulta para todos os produtos (antes 1 por item). `public/_headers` com cache para scripts estáveis.
- Fotos já saem com cache de 1 ano (URL leva a versão).
- Ideias futuras: PWA/offline para o app do cliente e para a venda; compactar fotos no envio em WebP; medir tempos com o plugin backend-performance-review.

## Financeiro e Excel em tudo
- Aba **Financeiro** (gestão): **Caixa do turno** (qualquer usuário logado: vendido por forma, sangria/suprimento, dinheiro esperado × contado, fechamento com diferença), e, só superadmin: **Resultado do mês** (faturamento − taxas − CMV − despesas fixas/variáveis, margens, ponto de equilíbrio por mês e por dia), **Contas a pagar** (cadastro, "Paguei", repetir todo mês), **Fluxo de caixa** (5 semanas: entra pelos prazos/taxas × sai pelas contas; vencidas) e **Taxas** (% , fixa e dias por forma).
- API: `/api/financeiro/*` (migração 0012: `despesa`, `taxa_pagamento`, `caixa_mov`, `caixa_fechamento`).
- Aba **Excel**: para cada cadastro há **Baixar modelo** (com aba "Como preencher"), **Exportar Excel** e **Importar Excel**. Planilhas: fornecedores, insumos, produtos, fichas técnicas, combos, contagem de estoque, compras, despesas, taxas e vendas (só exportar). Botões também aparecem nas abas Produtos, Contas a pagar e Taxas.
- Importação: o arquivo é conferido por inteiro; se houver erro, **nada é gravado** e a tela lista as linhas com problema. Há prévia (novos × atualizados) antes de "Aplicar". Célula em branco = não muda o que já existe. Só o superadmin importa. Máx. 5.000 linhas por vez.
- API: `GET /api/planilhas`, `GET /api/planilhas/:id`, `POST /api/planilhas/:id[?simular=1]`. A leitura do .xlsx é feita no navegador (SheetJS em `public/vendor/`, carregado só ao clicar).

### Como alimentar com os donos (ordem)
1. Fornecedores → 2. Insumos (embalagem, conteúdo, preço, estoque recomendado) → 3. Produtos (preço e categoria) → 4. Fichas técnicas → 5. Combos → 6. Contagem de estoque (primeira contagem completa; liga a trava de verdade) → 7. Taxas (maquininhas/Pix) → 8. Despesas fixas (aluguel, luz, folha, internet…) marcando "repete todo mês".
- Taxas e prazos reais vêm do contrato de cada maquininha; sem eles o resultado do mês mostra taxa zero.

## Clientes, pontos, produção, avisos e permissões
- **Recomendado separado:** cada insumo tem `estoque_recomendado_segunda` e `_quinta` (aba Níveis; planilha de insumos). Aba Recomendado tem os botões "de segunda" e "de quinta". Em branco = automático pelo histórico.
- **Fornecedores:** aba própria (nome, como pedir, contato, CNPJ, endereço, prazo, pedido mínimo, ativo). Não apaga fornecedor com itens ou compras: desative.
- **Conta do cliente** (`/cliente.html`): criar conta (nome, celular, e-mail opcional, senha, aceite dos termos) ou entrar; bloqueio de 10 min após 5 senhas erradas. **Google:** pronto no código, liga ao definir o secret `GOOGLE_CLIENT_ID`. **Celular por SMS e e-mail por código** precisam de um serviço de envio (fica para quando escolherem). Quem tem conta não digita nome/celular e ganha pontos.
- **Pontos:** 1 ponto por R$ 1 pago, só depois do pagamento confirmado, uma vez por pedido. Balcão pode ligar a venda a um cliente pelo celular (`POST /api/venda/comandas/:id/cliente`; botão na tela de venda ainda não existe).
- **Níveis** (por pontos acumulados, nunca caem): Caramelo 🐕 0 · Pão de Queijo 🧀 150 · Cuia de Chimarrão 🧉 400 · Pastel de Feira 🥟 800 · Churrasco de Domingo 🍖 1.500 · Samba no Pé 🪘 2.500 · Onça-Pintada 🐆 4.000 · Nota de 200 💸 6.000. Ajuste os números em `src/dominio/niveis.js`. **Prêmios/benefícios por nível ainda não definidos** (pergunta para os donos).
- **Área de clientes** na gestão: busca, nível, pontos, histórico, ajuste de pontos (superadmin), desativar conta.
- **Tela de Produção** (`/producao.html`): só pedidos do app já pagos; mostra o número (C1, C2…), nome, minutos de espera e a **receita de cada item** (combo mostra a receita de cada produto). Botões "Começar a preparar" e "Pronto". O pedido **sai da tela quando o QR é lido no balcão**. O app não tem comanda: é pagar e pedir.
- **Aviso que vibra:** ao tocar em "Começar a preparar" o celular do cliente vibra (app aberto) e recebe notificação push (app instalado/fechado). Push exige as chaves: rode `node scripts/gerar_vapid.mjs` e cadastre `VAPID_PUBLICA` e `VAPID_PRIVADA` como secrets. Vibração: Android sim; iPhone não permite vibrar por página, só o som/vibração padrão da notificação (precisa instalar na tela inicial).
- **App nativo:** o site já é instalável (manifest + service worker). App de loja (Android/iOS) = embrulhar com Capacitor; exige conta Google Play (US$ 25) e Apple (US$ 99/ano).
- **Painel de permissões** (Conta → superadmin): marque quais módulos cada gerente enxerga (venda, produção, caixa, estoque, recomendado, produtos, combos, níveis, fotos, registrar, fornecedores, clientes, desempenho, financeiro, excel). O **servidor também barra** rotas desses módulos (403). Padrão do gerente: tudo menos desempenho, financeiro e Excel. Superadmin sempre vê tudo.
- Migração `0013_clientes_e_dias`.

## 24/11 — Limpar lista, visual da casa, modo teste, otimização
- **Lista de compras**: botão "🗑 Limpar" + confirmação "Tem certeza?" (mostra quantos itens e quantos já marcados). `POST /api/listas/:id/limpar` cancela a lista aberta (não mexe no estoque).
- **Visual da casa**: `GET/PUT /api/visual` (leitura pública, gravação só superadmin; valores inválidos viram padrão). Painel de personalização em `tema.js`.
- **Modo teste** (Gestão → Conta, só superadmin; `GET/PUT /api/teste`): pagamento do balcão e do app entra na hora (cobrança com operador `teste`), trava de estoque, limite de pedidos pendentes e bloqueio de login do cliente desligados; faixa laranja "MODO TESTE" em todas as telas. ⚠ As vendas de teste entram nos relatórios — desligue antes de abrir ao público.
- **Otimização** (medido localmente com 30 mil movimentos de estoque; produção/D1 não medida): migração `0014` — `WHERE tipo='venda' AND referencia=?` (a cada venda) fazia SCAN da tabela inteira, agora usa índice; saldo por insumo lido só no índice (covering). Sondagem do app/produção/venda pausa com a aba escondida; `tema.js` duplicado removido do venda; cache de scripts/ícones/vendor.

## 24/11 (tarde) — Troco, histórico, gerar lista
- **Cobrança em dinheiro** (`venda.html`): campo "Valor recebido", atalhos de notas (exato/10/20/50/100/200) e troco na hora ("Falta R$…" se for menos). Cálculo só na tela; o sistema continua registrando o valor cobrado. Após cobrar, o troco fica 15 s na tela.
- **Histórico de pedidos**: aba "Histórico" na Venda (`GET /api/venda/historico?dia=`): todos os pedidos do dia (balcão e app) com hora, status, itens, forma de pagamento, total e cancelados; seletor de data.
- **App de compras**: botão fixo "🛒 Gerar" — compara estoque recomendado × estoque atual, manda comprar a diferença por fornecedor (segunda ou quinta); avisa que substitui a lista atual.
- **Produção também mostra vendas de balcão**: antes só pedidos do app pagos entravam; venda de balcão nasce "entregue" e nunca aparecia. Agora fica na produção do dia (🍸 balcão / 📱 app) até marcar "Pronto"; o status no banco não muda (só preparo_em/pronto_em), sem aviso por push (não há cliente do app).
- **Leitura do QR na retirada**: a câmera usa o leitor nativo quando existe e, no iPhone/Safari/computador, a biblioteca jsQR (`public/vendor/jsqr.min.js`, carregada só quando precisa). Ao ler pela câmera ou por leitor USB/Bluetooth (digita o código + Enter), o sistema confere E já dá a baixa (entrega) — o pedido sai da produção na hora. O botão "Conferir código" continua mostrando antes de entregar.
- **Produção em kanban**: 3 colunas — 📥 RECEBIDO · 🔥 EM PRODUÇÃO (preparando e "pronto" esperando o QR) · ✅ ENTREGUE (últimos 30 do dia: app com QR lido, balcão marcado pronto). `GET /api/producao` agora devolve também `entregues`.
- **Desempenho — tempos por etapa e mais indicadores**: cada pedido já grava a hora de cada etapa (criado → pago → começou a preparar → pronto → retirado). `GET /api/desempenho` agora devolve `tempos` (média, mediana, 90% até e mais lento de: atendimento até pagar, fila, preparo, retirada, pago→entregue, pedido inteiro; geral/balcão/app; média por hora; 5 mais lentos; % acima de 10 min; variação vs. período anterior) e `operadores`/`clientes` (vendas por operador, pedidos de cadastrados, novos clientes, pontos dados). Esperas > 180 min ficam fora das médias. O Histórico da Venda mostra os tempos pedido a pedido. Só entram na fila/preparo os pedidos que passaram pela tela de Produção.
- **Esqueci minha senha (cliente)**: link na tela de entrada → celular/e-mail + código de 6 dígitos + senha nova. O código vem (a) da equipe: Gestão → Clientes → cliente → "Gerar código de recuperação" (uso único, 15 min, 5 tentativas), ou (b) por e-mail se os secrets `RESEND_API_KEY` e `EMAIL_REMETENTE` (Resend) estiverem configurados — sem eles só o balcão funciona. Só o hash do código é guardado (migração `0015`). Ao trocar a senha, as sessões antigas caem e o bloqueio por tentativas zera. `esqueci` responde igual exista a conta ou não.
- **Cliente vê só o NÍVEL** (decisão do dono: ele não deve saber quanto está gastando): as respostas da conta do cliente não trazem mais pontos, "faltam X", barra de progresso, mínimos por nível, regra "1 ponto por R$ 1" nem valores dos pedidos; a tela mostra nível, frase, nome do próximo nível e a lista de níveis. Pontos continuam sendo guardados e aparecem só na gestão.
- **Aviso de preparo chama a atenção** (`cliente.html`): quando o pedido muda para "preparando" (laranja) ou "pronto" (verde), o app abre tela cheia PISCANDO (alterna a cor a cada 0,25 s), com texto grande, vibração repetida a cada 2,2 s, bipe e tela mantida acesa, até o cliente tocar "Entendi" (ou 25 s). Se a tela estava apagada/em outro app, a notificação push (que agora fica na tela até tocar) abre o app e a tela pisca na hora. Limite do navegador: não dá para piscar a lanterna/LED do celular nem vibrar no iPhone — isso só no app nativo (Capacitor).
- **Registro de atividades por login (aba "Atividades", só superadmin)**: tudo que muda algo no sistema é gravado — quem (login da equipe, cliente ou visitante), quando (horário de Brasília), o quê (frase em português, ex.: "Cobrou a venda"), o que foi enviado (resumo sem senhas, códigos, chaves nem fotos), resultado (✔ ou erro 4xx) e um pedaço do hash do IP para distinguir aparelhos. Também os logins, inclusive tentativas com senha errada. Consultas (GET) não entram. Filtros por pessoa, data, texto e "só erros"; tabela "Por pessoa" com ações, erros e último login. Guarda 180 dias (migração `0016`, `src/auditoria.js`; gravação em segundo plano, nunca derruba a operação). `GET /api/auditoria` responde 403 a quem não é superadmin.
- **"Seus últimos pedidos" (cliente)** mostra o que foi pedido (ex.: "2× A lá minuta carne"), sem preço nem total. Na aba Atividades, tentativas de login erradas passam a contar na pessoa certa (mesmo nome), para enxergar tentativa de invasão.

## Tempo de espera estimado (ao pedir)
- Migração `0017_tempo_preparo` (precisa ser aplicada no D1 de produção): `produto.tempo_preparo_min`.
- A média do dia é estatística formada sozinha: pago_em → pronto_em dos últimos 10 pedidos de hoje, tempos gravados pelo avanço das etapas no kanban da produção. Mínimo de 3 pedidos; senão vale o tempo do produto (o mais demorado + 1 min por unidade extra); sem tempo no produto, o padrão geral (Conta → Tempo de espera, 5 min).
- Aparece no app do cliente (barra do carrinho) e na venda; campo "Tempo de preparo" no cadastro do produto.

## Avisos conforme o pedido
- Migração `0018_pronta_entrega` (aplicar no D1): `produto.pronta_entrega` (checkbox no cadastro do produto).
- `src/textos.js`: um único produto em produção → "Seu Gin Tônica começou a ser preparado"; vários → "Seu pedido…"; itens de pronta entrega → "Já pode buscar no balcão: Heineken". Usado no push e na tela piscante do app (vem em `textos` no status do pedido).

## Entrega parcial (REP n)
- Migração `0019_entrega_parcial` (aplicar no D1): `item_pedido.entregue_qtd`, `pedido.remessa`.
- Leitura do QR na venda: pedido de 1 item/1 unidade dá a baixa direto; senão abre a lista com caixas (e quantidade) para marcar o que está saindo. Se algo ficar faltando: o pedido continua aberto, marcador **REP 1/2/…**, e o QR muda (`MKF1.id.chave.remessa`) — o QR antigo é recusado. O app do cliente troca o QR sozinho no próximo ciclo de atualização (4 s) e mostra o que já saiu e o que falta.
- Produção mostra só o que falta (quantidade restante) e o selo REP n. Todos os itens entregues → pedido entregue.

## Carteira do cliente (saldo pré-pago)
- Migração `0020_carteira` (aplicar no D1): `cliente.saldo`, `carteira_mov` (extrato), `recarga`.
- Cliente: Conta → "💳 Sua carteira": adiciona saldo (R$ 5–500, teto R$ 1000) por Pix; entra quando o balcão toca "Pix recebido ✓" (aba Retiradas, bloco "Recargas de saldo") — crédito único (índice único). No modo teste credita na hora. No pedido: botão "Pagar com saldo" quando o saldo cobre; débito atômico.
- Equipe: Gestão → cliente → "Carteira" lança +/− com motivo (recarga em dinheiro, estorno).
- Contabilidade: recarga NÃO é venda; a venda entra quando o pedido é pago com saldo (cobrança forma pix, operador "saldo"). Saldo de cliente é dinheiro a devolver: conversar com o contador (regras de estorno/validade).
- Apple Pay / Google Pay para recarregar: precisa de gateway com carteira digital (pendente de escolher gateway). O webhook do gateway pode chamar `confirmarRecarga`.

## Pronto por item (produção)
- Migração `0021_item_pronto`: `item_pedido.pronto_em`. Cada item do cartão tem "✔ Item pronto" (e "desfazer"). Marcar um item já inicia o preparo; ao marcar o último item de produção, o pedido vira PRONTO e o cliente é avisado. Itens "pronta entrega" não têm botão (entregues no balcão). Enquanto faltam itens, o cliente recebe o aviso "Seu <item> está pronto". O botão "Pronto" do pedido inteiro continua e marca todos os itens.
- Rota: `POST /api/producao/:pedido/item/:item/pronto` `{pronto: true|false}`.

- Retirada na venda: removidos o campo de digitar código e o botão "Conferir código". A aba abre a câmera sozinha; o QR (`MKF1.id.chave.remessa`) é lido pela câmera (leitor nativo ou jsQR) e confere/dá baixa. Verificado: o QR gerado pelo app é decodificado pelo jsQR.

- Leitura do QR abre um popup que ocupa quase a tela toda (letras grandes, itens em lista, botões altos, botão Fechar); vale para entrega total, parcial e erro.

- Gestão no celular (≤760px): cabeçalho e títulos de tabela deixam de ser fixos (antes cobriam os produtos); estoque vira cartões (item, Tem / Recomendado / Comprar, situação) com os títulos de ordenação como botões redondos no topo.

- Celular, passada geral (testado com Chrome em 390 px contra o app local): menu da gestão em uma linha que rola (antes ocupava 5 linhas); botão flutuante 🎨 removido de venda/produção/cliente/compras (cobria botões — o editor de design fica em Gestão → Conta); painel do pedido na venda mais baixo, sem texto de ajuda quando vazio; cabeçalho da produção enxuto.

- Todas as tabelas da gestão ordenam pelo título (toque = crescente, de novo = decrescente; ▲▼). `public/ordenar.js`: entende R$, %, datas dd/mm e texto; linhas de total ficam no fim; vazio vai para o fim; mantém a ordem quando a tabela é redesenhada. O estoque mantém a própria ordenação (data-ordem); `data-sem-ordem` na tabela desliga.

- Botões Baixar modelo / Exportar / Importar de Produtos e Fichas saíram da aba Produtos; ficam só na aba Excel (que já os tinha).

- Menu da gestão em 5 grupos (📦 Estoque · 🍹 Cardápio · 💰 Resultado · 👥 Clientes · ⚙️ Sistema) com abas do grupo numa segunda linha; Venda/Produção fixos no topo. O <nav id=navAbas> original fica escondido e continua mandando (permissões e lógica não mudaram).
- Desempenho: nova caixa "Desempenho por produto" (sempre visível): todos os produtos vendidos no período com Qtd, vs período anterior, faturamento, % do total, custo, lucro e margem; ordenável pelo título. Servidor: `produtos` em /api/desempenho.

- App do cliente: card "Fila de pedidos" (depois de pago, até ficar pronto): posição ("3º da fila"), quantos pedidos na frente, quantos em produção agora e a espera estimada (média do dia ou tempo padrão). Fila = pedidos pagos de hoje (app + balcão) ainda não prontos, por ordem de pagamento. `fila` e `espera` vêm em GET /api/cliente/pedidos/:id.

## App do cliente: login primeiro
- Sem conta salva e sem pedido em andamento, a primeira tela é o login/cadastro (`primeiroLogin`); após entrar vai ao cardápio. Sessão fica salva no aparelho (`mukifo_conta`), então só pede uma vez. O botão Voltar some nessa tela inicial.
- Acesso por usuário: cliente vê o próprio perfil/nível/carteira; equipe usa o login do gestão (perfis definem os módulos). Obrigatoriedade ainda só no front: o servidor não recusa pedido sem conta (pendente, se quiser exigir).

## Campeonato de sinuca (v1)
- Migração `0022_campeonato`: `campeonato` → `modalidade` (nome, taxa, vagas, % de prêmio) → `inscricao` (Pix, carteira, balcão ou grátis) → `partida`.
- `src/dominio/chaves.js`: gerador de mata-mata (folgas na 1ª rodada, disputa de 3º com 4+ jogadores), pontos por colocação (100/70/50/40/25/15/10) e divisão do prêmio (o que sobra fica com a casa).
- `src/campeonato.js`: rotas públicas `/api/campeonato` (lista, modalidade, ranking, minhas, inscrever) e da equipe `/api/campeonato/gestao/*` (módulo `campeonato`, padrão para gerente): criar, inscrever no balcão, confirmar Pix, cancelar (devolve à carteira só o que saiu dela), sortear, placar ao vivo, finalizar, corrigir resultado (enquanto a próxima partida não começou).
- Telas: `public/campeonato.html` (jogador: inscrição com Pix/saldo, chave e placar ao vivo, ranking) e `public/torneio.html` (equipe, link "Campeonato →" no gestão). 🎱 no topo do app do cliente.
- Pendente: webhook do gateway chamar `confirmarInscricao`; formatos dupla eliminação/grupos; entrada da taxa no financeiro (hoje não entra no resultado); duplas; push de "sua partida vai começar".
