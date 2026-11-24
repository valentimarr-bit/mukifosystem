# Como trabalhar no projeto de qualquer conta Claude e qualquer aparelho

O repositório no GitHub é a única fonte de tudo: código, regras, decisões e andamento. Memória e documentos do Claude ficam presos a cada conta, então **tudo que importa tem que estar aqui**.

## Configuração (uma vez)
1. **Repo no GitHub** — idealmente numa organização "mukifo" (github.com/organizations/plan), para não depender de uma pessoa só. Cada pessoa entra como membro/colaborador.
2. **Proteger a `main`** — Settings → Branches → Add rule `main`: exigir pull request antes do merge. Mudança só entra por PR.
3. **Deploy automático** — painel Cloudflare → Workers & Pages → mukifo → Settings → Builds → conectar ao repo do GitHub:
   - push/merge na `main` → publica o site oficial;
   - cada PR ganha um link de prévia.
4. **Segredos** (tokens Getnet, Pix, etc.) — só como *secrets* na Cloudflare (`npx wrangler secret put NOME`) e no GitHub. Nunca no código.

## Para cada conta Claude
- Conectar o GitHub na conta (Claude Code na web: claude.ai/code — funciona no celular e no PC).
- Abrir uma sessão no repo mukifo. O Claude lê o `CLAUDE.md` automaticamente.
- Trabalhar numa branch, abrir PR, testar no link de prévia, fazer merge.

## Regra de ouro
No fim de cada sessão, atualizar `docs/andamento.md` (o que foi feito, o que falta, o que está em aberto) e registrar decisões em `docs/decisoes.md`. É assim que a próxima sessão — de qualquer conta — continua de onde parou.
