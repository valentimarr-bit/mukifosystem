# Mukifo

Sistema do bar Mukifo: estoque por ficha técnica, lista de compras, POS (Ingenico DX8000) e pedidos pelo celular.
Roda na Cloudflare (Workers + D1). Detalhes para quem desenvolve: [CLAUDE.md](CLAUDE.md).

## Rodar no computador
```bash
npm install
npm run dev          # abre em http://localhost:8787
```

## Publicar
```bash
npx wrangler login   # só na primeira vez
npm run deploy
```

## Banco de dados (fase 2) — uma vez
```bash
npm run db:criar                  # cria o D1 "mukifo"; copie o database_id que aparecer
# cole o database_id no wrangler.jsonc (bloco d1_databases) e descomente o bloco
npm run db:migrar                 # cria as tabelas
npm run seed                      # carrega itens, fichas, fornecedores e 31 dias de vendas da planilha
npx wrangler secret put ADMIN_TOKEN   # senha de gerente para registrar compras, contagens e relatórios
npm run deploy
```
Depois abra `/gestao.html`, vá em **Registrar** e faça a primeira **contagem** (sem ela o estoque aparece zerado).

> ⚠️ `npm run seed` APAGA e recarrega tudo (inclusive vendas, compras e contagens). Use só na carga inicial.

Para rodar no computador: copie `.dev.vars.exemplo` para `.dev.vars`, depois `npm run db:migrar:local`, `npm run seed:local` e `npm run dev`.

## Testes
```bash
npm test     # compara as contas do sistema com a planilha antiga (test/gabarito.json) e testa a API
```
Se mudar a planilha antiga: `npm run seed:gerar` e `npm run gabarito` (precisam de Python + openpyxl + LibreOffice).

## API
| Rota | O que faz |
|---|---|
| `GET /api/estoque?dia=segunda\|quinta` | Estoque atual, mínimos, sugestão e situação por item |
| `GET /api/lista-compras?dia=...` | Lista de compras por fornecedor + produção da casa |
| `GET /api/produtos` | Preço, CMV, lucro e ficha de cada produto |
| `POST /api/vendas/relatorio` | Importa o relatório do dia e dá baixa pela ficha (senha) |
| `POST /api/contagem` | Contagem física; diferença vira perda/sobra (senha) |
| `POST /api/compras` | Compra recebida; atualiza estoque e preço (senha) |

## Trabalhar de qualquer conta Claude ou aparelho
Ver [docs/colaborar.md](docs/colaborar.md): colaboradores no GitHub, `main` protegida, deploy automático pela Cloudflare (Workers Builds) e `docs/andamento.md` atualizado em toda sessão.

## Pastas
| Pasta | O que tem |
|---|---|
| `src/` | API (Cloudflare Worker); regras de cálculo em `src/dominio/` |
| `scripts/` | Extração da planilha, seed e gabarito |
| `seed/` | Dados extraídos da planilha e `seed.sql` |
| `test/` | Testes (`npm test`) |
| `public/` | Páginas: painel, app de pedidos, tela da fila |
| `migrations/` | Banco de dados D1 |
| `legado/planilha/` | Planilha Excel atual, regras e histórico de vendas |
| `docs/` | Planos e decisões |
