# Mukifo

Sistema do bar Mukifo: estoque por ficha técnica, lista de compras, POS (Ingenico DX8000) e pedidos pelo celular.
Roda na Cloudflare (Workers + D1). Detalhes para quem desenvolve: [CLAUDE.md](CLAUDE.md).

## Rodar no computador
```bash
npm install
npm run dev          # abre em http://localhost:8787
```

## Publicar na Cloudflare (só pelo site, sem terminal)
1. Em [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Import a repository** → escolha `mukifosystem` → **Deploy**.
   O banco D1 `mukifo` é criado sozinho no deploy; as tabelas e os dados da planilha entram no primeiro acesso.
2. No Worker `mukifosystem` → **Settings** → **Variables and Secrets** → **Add**, tipo **Secret**:
   - `CODIGO_PRIMEIRO_ACESSO` — um código só seu (obrigatório: sem ele ninguém consegue o primeiro acesso).
   - `ADMIN_TOKEN` — chave de emergência (opcional; serve se todos esquecerem a senha).
3. Abra `https://mukifosystem.<seu-subdominio>.workers.dev/gestao.html`, digite nome, senha e o código: **você vira o superadmin**.
   Na aba **Conta** dá para trocar a senha, adicionar gerentes e passar o cargo de superadmin.

Depois disso, todo push na `main` publica sozinho.
Pelo terminal também funciona: `npx wrangler login` e `npm run deploy` (o banco é criado e montado do mesmo jeito).

## App de compras no celular
Abra `https://<seu-endereço>/compras/` no celular e instale na tela inicial
(Android/Chrome: menu ⋮ → *Adicionar à tela inicial*; iPhone/Safari: Compartilhar → *Adicionar à Tela de Início*).
Gere a lista de segunda ou quinta, toque em cada item que comprou (✎ para mudar quantidade ou anotar o valor pago)
e toque em **Finalizar compra**: os itens marcados entram no estoque. Funciona sem internet (as marcações sobem quando a conexão volta)
e em mais de um celular ao mesmo tempo.

Para rodar no computador: copie `.dev.vars.exemplo` para `.dev.vars` e rode `npm run dev` (o banco local se monta sozinho).

> ⚠️ `npm run seed` APAGA e recarrega tudo (inclusive vendas, compras e contagens). Não use depois que o bar começar a registrar.
> Criou uma migração ou regenerou o seed? Rode `npm run sql:embutir` (o `npm test` avisa se esquecer).

## Testes
```bash
npm test     # compara as contas do sistema com a planilha antiga (test/gabarito.json) e testa a API
```
Se mudar a planilha antiga: `npm run seed:gerar` e `npm run gabarito` (precisam de Python + openpyxl + LibreOffice).

## API
| Rota | O que faz |
|---|---|
| `GET /api/auth/estado` · `POST /api/auth/primeiro-acesso` · `POST /api/auth/entrar` | Login (o primeiro acesso cria o superadmin) |
| `POST /api/auth/trocar-senha` · `POST /api/auth/passar-cargo` · `GET/POST /api/usuarios` | Conta e pessoas com acesso |
| `GET /api/estoque?dia=segunda\|quinta` | Estoque atual, mínimos, sugestão e situação por item |
| `GET /api/lista-compras?dia=...` | Lista de compras por fornecedor + produção da casa |
| `GET /api/produtos` | Preço, CMV, lucro e ficha de cada produto |
| `POST /api/vendas/relatorio` | Importa o relatório do dia e dá baixa pela ficha (senha) |
| `POST /api/contagem` | Contagem física; diferença vira perda/sobra (senha) |
| `POST /api/compras` | Compra recebida; atualiza estoque e preço (senha) |
| `GET /api/listas/atual` · `POST /api/listas` | Lista de compras aberta / gerar nova (senha) |
| `PATCH /api/listas/:id/itens/:item` · `POST /api/listas/:id/itens` | Marcar, ajustar ou adicionar item (senha) |
| `POST /api/listas/:id/finalizar` | Lança no estoque o que foi marcado (senha) |

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
