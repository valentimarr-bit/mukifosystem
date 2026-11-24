# Prompt 2 — Pedidos pelo celular

Roda depois das fases 2 a 5 (mesmo banco e mesmas fichas). Troque `[PROVEDOR]` pelo provedor de Pix/cartão escolhido.

Limite conhecido: o navegador do iPhone não vibra por comando de página. Por isso há som, tela piscando e notificação como alternativa.

```markdown
# Papel
Você é um engenheiro full-stack sênior. Continue o sistema do Mukifo neste repositório (leia CLAUDE.md, docs/regras.md e migrations/ antes de começar).

# Objetivo
Acabar com a fila no balcão. O cliente pede e paga pelo celular; o balcão só prepara e entrega. Quando o pedido fica pronto, o celular do cliente vibra e avisa.

# Formato
- PWA servida pelo Worker (public/pedir/), sem loja de apps. O cliente abre por QR Code no balcão, nas mesas e na entrada.
- Mobile first, rápido em 4G fraco, fontes grandes, alto contraste (bar escuro e barulhento).
- Português do Brasil, palavras simples. Sem cadastro obrigatório: só nome (aparece na fila) e celular opcional.

# Fluxo do cliente
1. Abre o cardápio (mesmos produtos e preços do sistema). Produto sem estoque aparece "esgotado" na hora.
2. Monta o pedido e confirma ter 18 anos ou mais quando houver bebida alcoólica. O balcão pode pedir documento na entrega.
3. Paga por Pix (QR Code e copia-e-cola) ou cartão pelo [PROVEDOR]. O pedido só entra na fila depois que o webhook confirmar o pagamento.
4. Recebe um número curto (ex.: A27) e vê "Seu pedido": posição na fila, pedidos na frente, tempo estimado e status.
5. Quando fica "pronto": vibra (navigator.vibrate com padrão longo, onde houver suporte), toca som, tela pisca em cor forte com o número grande e "RETIRE NO BALCÃO".
6. Página fechada: notificação Web Push. No iPhone, push só funciona com o site adicionado à tela de início; mostrar passo a passo curto. Opcional: aviso por WhatsApp.
7. Manter a tela acesa (Wake Lock, onde houver) e reconectar sozinho se a internet cair.

# Lista de espera pública
- Página para TV/tablet (public/fila/): "Preparando" e "Pronto para retirar", só número e primeiro nome. Pronto pisca alguns segundos e sai depois de entregue.
- O cliente vê a mesma fila resumida.

# Lado do balcão
- Pedidos do celular aparecem na tela Fila da POS e numa tela de preparo em tempo real, junto com os da POS, por ordem de pagamento.
- Impressão automática da comanda na DX8000 quando um pedido pago chega (pode desligar).
- Botões grandes: Preparando, Pronto, Entregue. "Pronto" dispara o aviso. "Entregue" pede número ou nome para conferir.
- "Pausar pedidos pelo celular" para lotação extrema ou falta de produto.
- Cancelamento e estorno só pelo gerente, com motivo.

# Estoque e números
- Pedido pago pelo celular dá baixa pela ficha técnica, igual à POS.
- Relatórios por origem; tempo pagar→pronto, pronto→retirar, pedidos por hora.

# Técnico
- Tempo real com Durable Objects (WebSocket por pedido e da fila).
- Service worker para push e cache do cardápio.
- Nada de dado de cartão no servidor; checkout/SDK do provedor; validar assinatura do webhook; pedido não pago expira em 15 min.
- Proteção contra pedido duplicado e número repetido no mesmo dia.
- Testar em Android (Chrome) e iPhone (Safari), com e sem o site na tela de início; documentar o que funciona em cada um.

# Como trabalhar
1. Pesquise a documentação atual do [PROVEDOR] (Pix, cartão, webhooks, taxas) e o suporte atual a Vibration API, Web Push e Wake Lock no Chrome Android e Safari iOS. Resuma em docs/celular.md. Pare e mostre.
2. Rascunho das telas antes de codar.
3. Implemente por partes: cardápio e carrinho → pagamento → fila e status → avisos → tela pública → relatórios. Atualize docs/andamento.md no fim de cada sessão.
```
