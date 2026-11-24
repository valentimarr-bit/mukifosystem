# Decisões

| Data | Decisão |
|---|---|
| 2026-11-23 | Tudo na Cloudflare: Workers (API + páginas), D1 (banco), Durable Objects (fila em tempo real). Substitui a sugestão inicial de Supabase. |
| 2026-11-23 | Maquininhas: 2× Ingenico AXIUM DX8000 (vermelhas). Adquirente provável: Getnet — confirmar. |
| 2026-11-23 | Estoque guardado em embalagens (garrafa, lata, kg); fichas na unidade do insumo (ml, g, un). Conversão pelo campo `conteudo`, como na planilha. |
| 2026-11-23 | Relatório do sistema de vendas importado por dia (um "pedido" de origem `relatorio`) até a POS própria existir. |
| 2026-11-23 | Escritas na API protegidas por senha única de gerente (`ADMIN_TOKEN`) até haver login por perfil (fase 3). |
| 2026-11-23 | Lista de compras vai para um **app no celular** (PWA em `/compras/`): marca item a item, ajusta quantidade/valor, finaliza → entra no estoque. Funciona offline e em vários celulares. Impressão na DX8000 vira opcional. |
| 2026-11-24 | Login por nome e senha (PBKDF2, sessão de 30 dias). O primeiro acesso cria o superadmin e exige `CODIGO_PRIMEIRO_ACESSO`, para quem achar o site antes não tomar o sistema. Um superadmin por vez; ele passa o cargo. Substitui a senha única de gerente. |
| 2026-11-24 | Deploy sem terminal: D1 criado pelo deploy e banco montado pelo próprio Worker no primeiro acesso (migrações + seed embutidos). Ficamos na Cloudflare em vez de migrar para a Vercel. |

## Em aberto
- Confirmar a adquirente das DX8000.
- Provedor de Pix/cartão para o app do celular.
- Logo do Mukifo (arquivo original ou print do @mukifopoa).
- Respostas sobre o hortifruti.
