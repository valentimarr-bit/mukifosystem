# Andamento

Atualize no fim de cada sessão. Mais recente em cima.

## 2026-11-24 — login e deploy só pelo site
**Feito**
- Código enviado ao GitHub (`main`).
- Login (`migrations/0003_usuarios.sql`, `src/auth.js`, `public/entrar.js`): o primeiro acesso, com `CODIGO_PRIMEIRO_ACESSO`, cria o **superadmin**; ele troca a senha, adiciona gerentes e passa o cargo (só um superadmin por vez). Gestão (aba Conta) e app de compras usam o mesmo login. `ADMIN_TOKEN` virou chave de emergência.
- Banco se monta sozinho: `wrangler.jsonc` sem `database_id` (o deploy cria o D1) e o Worker aplica migrações + seed no primeiro acesso. Seed agrupado em 20 comandos (limites do D1). Testado no D1 local do wrangler com banco vazio.
- 25 testes passando.
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
