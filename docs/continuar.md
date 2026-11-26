# Continuar em outra conta (passagem de bastão)

Estado em 2026-11-24: tudo commitado e enviado a `main` (https://github.com/valentimarr-bit/mukifosystem). 73 testes passando (`npm test`).

## Primeiros passos para quem assume
1. Clonar o repositório, `npm install`, `npm test` (deve passar tudo).
2. Ler `CLAUDE.md`, depois `docs/andamento.md` (seções mais novas em cima) e `docs/decisoes.md`.
3. Rodar local: `npm run dev` (wrangler). Telas: `/gestao.html`, `/venda.html`, `/producao.html`, `/cliente.html`, `/compras/`.

## Regras que não podem ser esquecidas
- Tudo em português do Brasil; quem opera tem pouca prática com tecnologia (botões grandes, palavras simples).
- **Depois de criar ou mudar qualquer migração**: `node scripts/embutir_sql.mjs` (gera `src/banco/sql.js`; os testes falham se estiver velho) e acrescentar o nome da migração na lista de **todos** os arquivos de `test/` que listam migrações (dois formatos: `arq('../migrations/00XX_nome.sql')` ou string `'00XX_nome'`).
- Banco se monta sozinho: o Worker aplica migrações e seed no primeiro acesso (`src/banco/preparar.js`). Migrações atuais: até `0020_carteira`.
- **HTML com JS em linha**: um comentário `//` dentro de linha única engole o resto da linha (já quebrou 2 vezes). Depois de editar qualquer `.html`, validar todos os `<script>` com `new Function(...)`.
- Horários no banco em UTC (`YYYY-MM-DD HH:MM:SS`); exibir com `America/Sao_Paulo`. O dia do turno vira às 6h (`diaDoTurno()`).
- Privacidade do cliente: nunca mostrar a ele pontos ou valores gastos — só o **nível** (`paraCliente`/`nivelPublico`). O **saldo da carteira** ele pode ver (decisão do dono).
- Commits terminam com as linhas de atribuição pedidas pelo ambiente (Co-Authored-By / Claude-Session).

## Segredos / variáveis (Cloudflare → Worker → Configurações; nunca no código)
| Nome | Para quê | Obrigatório |
|---|---|---|
| `CODIGO_PRIMEIRO_ACESSO` | cria o primeiro superadmin | sim, no começo |
| `ADMIN_TOKEN` | acesso técnico | opcional |
| `PAGAMENTO_WEBHOOK_SECRET` | assinatura do webhook de pagamento (Pix automático) | quando houver gateway |
| `VAPID_PUBLICA`, `VAPID_PRIVADA`, `VAPID_CONTATO` | avisos push no celular | para push |
| `LOGIN_DEMO` | `sim` liga o botão "Só quero ver" (login de demonstração, só leitura) | opcional |
| `GOOGLE_CLIENT_ID` | entrar com Google | opcional |
| `RESEND_API_KEY`, `EMAIL_REMETENTE` | e-mail de recuperar senha | opcional |
| `NAVI_API_URL`, `NAVI_TOKEN` | integração Navi | pendente |

## O que foi feito nesta rodada (ver `andamento.md` para detalhe)
Modo teste, otimização, troco, histórico, gerar lista de compras, kanban de produção (RECEBIDO / EM PRODUÇÃO / ENTREGUE), QR com baixa, desempenho com tempos por etapa, esqueci a senha, nível sem pontos, alerta piscante, auditoria por login (aba Atividades do superadmin), tempo de espera estimado (média do dia pelo kanban, senão tempo por produto), avisos "Seu pedido / Seu <produto>" + pronta entrega, **entrega parcial com REP n e QR novo**, **carteira do cliente (saldo por Pix)**.

## Pendências (nada disso bloqueia o que já existe)
- **Gateway de pagamento** (Pix automático, cartão, Apple/Google Pay): escolher provedor (Mercado Pago, Asaas, Efí, Pagar.me); ligar o webhook a `confirmarRecarga` (carteira) e `conferirQuitacao` (pedidos). Hoje o Pix é confirmado à mão ("Pix recebido ✓").
- Tap to Pay do vendedor = app da operadora (não dá pelo site).
- Saldo de cliente: combinar com o contador estorno/validade.
- Navi, hortifruti (Ceasa), Armant 360, modo offline (PWA venda/cliente), prêmios dos níveis, botão no balcão para ligar a venda a um cliente.
- Etiqueta NFC na mesa abrindo o app (links por mesa) — oferecido, não pedido.
- Opcional: excluir cobranças `operador='teste'` dos relatórios.
- Latência do D1 em produção nunca foi medida (local: 7–50 ms).
- Dado a corrigir na planilha antiga: "Promo Caipirinha Dose Dupla" com Limão Taiti 25 kg (provável 0,25).

## Para a conta nova do Claude
Abra uma sessão neste repositório e diga: "Leia `docs/continuar.md` e `docs/andamento.md` e continue." O Claude novo não tem a memória desta conversa; tudo que precisa está no repositório.
