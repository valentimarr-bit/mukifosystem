# Mukifo — instruções para quem desenvolve (humano ou IA)

Sistema do bar Mukifo (boteco, Rua Mariante 627, Rio Branco, Porto Alegre). Objetivo: saber quanto vai em cada drink e prato, quando e quanto comprar, e onde o dinheiro se perde.

## Idioma e público
- Código, comentários, commits e telas em **português do Brasil**.
- Quem opera tem pouca experiência com tecnologia: telas simples, botões grandes, palavras do dia a dia.

## Arquitetura (tudo na Cloudflare)
- **Worker** (`src/worker.js`): API em `/api/*`.
- **Páginas estáticas** (`public/`): painel de gestão, app de pedidos do cliente (PWA), tela da fila.
- **D1** (SQLite): banco único, fonte da verdade. Migrações em `migrations/`.
- **Durable Objects**: fila em tempo real (WebSocket) para o balcão, a TV e o celular do cliente.
- **App POS**: Android (Kotlin + Compose) para as duas **Ingenico AXIUM DX8000** do bar (Android 10, impressora térmica 58 mm, ~32 colunas). Pagamento por deeplink para o app da adquirente (provavelmente Getnet — confirmar). Fica em `pos-android/` (fase 3). Funciona offline e sincroniza com a API.

## Regras de negócio
As regras completas estão em `legado/planilha/README.md` e `legado/planilha/gerar_planilha.py` (planilha Excel usada hoje). Valem no sistema novo. Resumo:
- Abre ter–dom. Sexta = sábado; ter/qua/qui/dom ≈ 1/3 de sábado. Segunda fechado.
- Compras na segunda (cobre ter+qua) e na quinta (cobre qui→dom).
- Mínimo = média de consumo dos dias cobertos × (1 + folga 20%). Sugestão = mínimo − estoque atual, com arredondamentos (inteiros p/ cima; destilados p/ garrafa mais próxima; limão e produção de 0,5 em 0,5).
- Estoque atual = soma de `movimento_estoque`. Nunca sobrescrever.
- Gelo = produção própria, fora das receitas e da lista de compras. Hortifruti: fornecedor principal Ceasa (módulo próprio, fase 6).
- Histórico real de vendas: `legado/planilha/dados/historico/` (20/10 a 20/11/2026).

## Fases
1. ✅ Repositório + deploy na Cloudflare (página inicial + `/api/saude`).
2. ✅ Banco D1 + importação da planilha e do histórico. Números batem com a planilha (`npm test`). Falta: aplicar no D1 de produção e importar o extrato da adquirente.
3. App POS: vender, cobrar, imprimir comanda, baixa por ficha, offline.
4. Estoque, contagens, perdas e lista de compras — ✅ lista no celular (`/compras/`); impressão na DX8000 opcional.
5. Painel: CMV, lucro, perdas em R$, consumo teórico × real.
6. Hortifruti (peso/unidade, fator de limpeza).
7. Pedidos pelo celular: PWA, Pix, fila pública, vibração/som/push quando pronto.

## Documentos (leia antes de começar)
- `docs/continuar.md` — passagem de bastão: regras, segredos e pendências. **Comece por aqui.**
- `docs/andamento.md` — histórico do que foi feito, mais recente em cima.
- `docs/manual.md` e `docs/alteracoes.md` — **manual do sistema** (botão "📖 Manual" na gestão → `/manual.html`) e registro de alterações. **A cada mudança no sistema** (tela nova, botão, regra, segredo): atualizar o texto em `docs/manual.md`, acrescentar uma linha datada no topo de `docs/alteracoes.md` e rodar `npm run manual`. O teste `test/manual.test.js` falha se o manual gerado estiver velho ou se uma tela nova não estiver citada.
- `docs/roteiro.md` — fases e critérios.
- `docs/decisoes.md` — decisões tomadas.
- `docs/prompt-pos.md`, `docs/prompt-celular.md` — especificação das partes.
- `docs/historico-pos.md`, `docs/hortifruti-perguntas.md`, `docs/perguntas-pagamentos.md` — pendências de informação.
- `docs/colaborar.md` — como várias contas Claude trabalham no mesmo repo.

## Código
- Regras de cálculo: `src/dominio/estoque.js` (funções puras). **Qualquer mudança nelas tem que manter `npm test` passando** — o teste compara com a planilha antiga.
- API: `src/api.js`. Escritas exigem login (`src/auth.js`): `Authorization: Bearer <token da sessão>`. O primeiro acesso (com `CODIGO_PRIMEIRO_ACESSO`) cria o superadmin; `ADMIN_TOKEN` é só chave de emergência.
- Banco se monta sozinho no primeiro acesso (`src/banco/preparar.js`, SQL embutido em `src/banco/sql.js`). **Nova migração ou seed novo → `npm run sql:embutir`.**
- Página de gestão provisória: `public/gestao.html`.
- **App de compras (PWA) no celular: `public/compras/`** — a lista de compras é usada aqui (marcar o que comprou → entra no estoque). A impressão na DX8000 fica como opção secundária.

## Como trabalhar
- Trabalhe numa branch e abra pull request; a `main` é protegida e publica sozinha na Cloudflare.
- **No fim de cada sessão, atualize `docs/andamento.md`** (feito / próximo / em aberto) e registre decisões em `docs/decisoes.md`. Outras contas e aparelhos dependem disso para continuar.
- Uma fase por vez. Antes de codar uma fase, escreva o plano em `docs/` e peça aprovação.
- Testes das regras de cálculo usando o histórico real.
- Nunca guardar dados de cartão. Nunca commitar segredos (`.dev.vars`, tokens).
