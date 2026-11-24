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

## Pastas
| Pasta | O que tem |
|---|---|
| `src/` | API (Cloudflare Worker) |
| `public/` | Páginas: painel, app de pedidos, tela da fila |
| `migrations/` | Banco de dados D1 |
| `legado/planilha/` | Planilha Excel atual, regras e histórico de vendas |
| `docs/` | Planos e decisões |
