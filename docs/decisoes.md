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
| 2026-11-24 | Fotos: enviadas pela própria tela (não baixadas da internet pelo sistema, por causa de direitos de imagem), reduzidas no navegador e guardadas no D1 em base64. Sem R2 por enquanto; se passar de ~50 MB, migrar para R2. |

## Em aberto
- Confirmar a adquirente das DX8000.
- Provedor de Pix/cartão para o app do celular.
- Logo do Mukifo (arquivo original ou print do @mukifopoa).
- Respostas sobre o hortifruti.

## Venda e app do cliente
- Comanda = linha em `pedido` (origem `balcao`); pedido do app = origem `celular` com número `C1`, `C2`… O "dia" vira às 6h (horário de Brasília).
- Pedido do app nasce `aguardando_pagamento` e só vira `recebido` quando a cobrança Pix é paga; `entregue` só pelo QR no balcão.
- Pix estático (BR Code) com valor e identificador do pedido: simples, sem provedor, mas a confirmação é manual até haver webhook. Aceitamos isso para ter um primeiro app funcionando sem credenciais.
- Não guardamos dados de cartão. Celular do cliente só para contato; IP guardado apenas como hash para limitar abuso.

## Trava de estoque
- Ingrediente nunca contado não trava (senão o bar não venderia nada antes da primeira contagem). Chave `travar_estoque` em `configuracao`.

## Financeiro e planilhas
- Importação tudo-ou-nada com prévia: erro em qualquer linha bloqueia a gravação inteira (evita dados pela metade numa reunião com os donos).
- Excel lido no navegador (SheetJS); o servidor só recebe linhas em JSON. Reduz peso no Worker e permite o mesmo validador para tudo.
- Fichas importadas substituem a ficha inteira do produto listado; compras passam pelo mesmo caminho de "registrar compra" (estoque e preço atualizam).
- Despesas e resultado são só do superadmin; caixa do turno é de qualquer usuário logado.

## Clientes e permissões
- Login do cliente separado do login da equipe (tabelas e cabeçalho `X-Sessao-Cliente` próprios).
- Pontos só depois de pago e únicos por pedido (índice único); nível usa pontos acumulados, saldo usa pontos atuais (para trocas futuras).
- Aviso de preparo é preso ao pedido (push por pedido), então funciona também para quem não tem conta.
- Permissões por módulo, aplicadas no servidor por prefixo de rota (`src/dominio/modulos.js`) e refletidas nas abas.
