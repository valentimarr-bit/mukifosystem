# Alterações do sistema

Uma linha por alteração, mais recente em cima. Toda mudança entra aqui **e** no `docs/manual.md`; depois rode `npm run manual`.
Formato: `- AAAA-MM-DD — o que mudou (onde ver no sistema)`.

- 2026-11-25 — **Placar online da sinuca** (Hall da Fama): jogos, vitórias, aproveitamento e sequência por período, com modo TV (`/placar.html`, `/placar.html?tv=1`).
- 2026-11-25 — **Ranking de toda a sinuca**: jogos da mesa, confirmados pelo adversário ou pelo balcão, entram no mesmo score dos campeonatos (`/sinuca.html`, `/mesas.html`).
- 2026-11-25 — **Título especial por jogador** (ex.: "Pinky e Cérebro" 🐭🧠) no lugar do nível, pelo botão 🏅 na lista de inscritos (`/torneio.html`).
- 2026-11-25 — **Fotos**: corte quadrado do centro e envio de várias fotos de uma vez, pelo nome do arquivo (Gestão → Fotos).
- 2026-11-24 — **LGPD no WhatsApp**: só recebe convite quem aceitou (caixa opcional no cadastro e opção em Minha conta), com registro de aceite e revogação.
- 2026-11-24 — **Campeonato**: convite por WhatsApp automático pela izapia (fila, ritmo, teto por dia e recusa) na mesa do campeonato (`/torneio.html`).
- 2026-11-24 — **iFood e 99Food**: pedidos das plataformas entram na Produção, baixam estoque e a plataforma é avisada do andamento (`/canais.html`).
- 2026-11-24 — **Manual do sistema**: botão "📖 Manual" na gestão abre `/manual.html`, gerado de `docs/manual.md` e deste arquivo.
- 2026-11-24 — **Monitor de Pix**: aprova Pix que cai direto na chave, por aviso do celular ou da API do banco (`/pix.html`).
- 2026-11-24 — **Notas fiscais (NFC-e)**: emissão pronta para ligar, desligada por padrão (`/fiscal.html`).
- 2026-11-24 — **Nota fiscal nas contas a pagar**: chave, número, CNPJ, anexo e consulta na Receita (Financeiro → Contas a pagar).
- 2026-11-24 — **Fila da sinuca**: entrada com cadastro e localização, chamada, aviso de término e conduta (`/sinuca.html`, `/mesas.html`).
- 2026-11-24 — **Lista de compras "Pelo estoque"**: novo botão em Recomendado.
- 2026-11-24 — **Gateways de pagamento** plugáveis (Mercado Pago, Woovi) e tabela comparativa com Getnet (`/pagamentos.html`).
- 2026-11-24 — **Campeonato de sinuca**: modalidades, inscrição por Pix, chave, placar ao vivo e ranking (`/campeonato.html`, `/torneio.html`).
- 2026-11-24 — **App do cliente**: a primeira tela passou a ser o login.
- 2026-11-25 — **Campeonato justo**: score por jogador (estilo Elo) e níveis, chave por nível ou cabeças de chave, divisão em séries e repescagem por recompra (balcão ou saldo), configuráveis por modalidade.
- 2026-11-24 — **Chave do campeonato nova**: árvore com linhas ligando os jogos, caminho do vencedor destacado, campeão no fim, abas por fase, zoom, "Ao vivo agora" e seguir um jogador; atualiza sem piscar nem perder a posição. Na mesa da equipe, bloco "Agora" e painel grande de placar ao tocar num jogo.
- 2026-11-24 — **Correção**: os botões − e + do placar na mesa do campeonato davam "Rota não encontrada" (o número da partida ia codificado). Também protegido o botão de entrega dos pedidos de iFood/99Food.
