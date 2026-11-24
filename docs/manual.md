# Manual do Mukifosystem

Este manual é para quem opera o bar: balcão, cozinha, gerência e dono. Ele é montado a partir do arquivo `docs/manual.md`. Quando algo no sistema muda, o texto muda aqui e o manual é gerado de novo (veja "Para quem mantém o sistema" no fim).

## 1. Primeiros passos

### Entrar e quem vê o quê
- Quem trabalha entra com **nome e senha**. O primeiro acesso cria o **superadmin** (o dono), usando o código de primeiro acesso guardado na Cloudflare.
- O superadmin vê tudo e, na aba **Conta**, escolhe o que cada gerente pode ver (painel de permissões). O sistema também bloqueia no servidor: esconder o botão não é o único cuidado.
- Módulos que podem ser liberados ou escondidos: Venda, Produção, Caixa, Estoque, Recomendado, Produtos e lucro, Combos, Níveis, Fotos, Registrar, Fornecedores, Clientes, Campeonato, Desempenho, Financeiro e Excel. **Desempenho, Financeiro e Excel** vêm desligados para gerentes novos.
- A sessão fica salva no aparelho. Para trocar de pessoa, use **Conta → Sair**.

### Visual e modo teste
- O visual (Escuro, Claro, Vinho, Alto contraste) é escolhido na gestão e fica salvo no aparelho.
- O **modo teste** (só superadmin) faz os pagamentos serem aprovados sozinhos, para treinar a equipe sem dinheiro de verdade. **Desligue antes de abrir ao público.**

### Telas do sistema
| Tela | Endereço | Para quem |
|---|---|---|
| Gestão | `/gestao.html` | gerência e dono |
| Venda (balcão) | `/venda.html` | balcão |
| Produção | `/producao.html` | cozinha e bar |
| Compras (celular) | `/compras/` | quem faz as compras |
| App do cliente | `/cliente.html` | clientes |
| Campeonato (jogador) | `/campeonato.html` | clientes |
| Mesa do campeonato | `/torneio.html` | equipe |
| Fila da sinuca (cliente) | `/sinuca.html` | clientes |
| Mesas e fila (equipe) | `/mesas.html` | equipe |
| Pagamentos | `/pagamentos.html` | financeiro |
| Monitor de Pix | `/pix.html` | financeiro |
| Notas fiscais | `/fiscal.html` | financeiro |
| Manual | `/manual.html` | todos |

## 2. Gestão

### Estoque
O estoque de cada item é a soma dos movimentos (compras, vendas, contagens, perdas). Nunca é sobrescrito. As colunas são clicáveis para ordenar: um toque ordena, o segundo inverte, o terceiro volta ao normal.

### Recomendado (lista de compras)
- Mostra o que comprar na **segunda** (cobre terça e quarta) e na **quinta** (cobre quinta a domingo).
- O mínimo de cada item é a média de consumo dos dias cobertos mais 20% de folga. A sugestão é o mínimo menos o que há em estoque, com arredondamentos (inteiros para cima; destilados pela garrafa mais próxima; limão e produção de 0,5 em 0,5).
- Botões de gerar: **Segunda**, **Quinta** e **Pelo estoque**. "Pelo estoque" monta a lista só com o que está abaixo do mínimo ou do nível de alerta, sem depender do dia da semana.
- No celular (`/compras/`) marca-se cada item com um toque. Funciona sem internet e envia quando a conexão volta. Ao finalizar, o sistema cria a compra por fornecedor, dá entrada no estoque e atualiza o preço real.

### Produtos e lucro
Criar produto, trocar nome e preço, escolher se **dá baixa no estoque**, montar a **ficha técnica** (ingredientes e quantidades) e desativar. Mostra custo (CMV) e lucro por produto. O custo de cada drink vem da ficha técnica.

### Combos
Pacotes de produtos com preço próprio. A baixa de estoque desce nos itens de dentro do combo.

### Níveis (alertas de estoque)
Define, por item, com quantas embalagens o sistema avisa que está acabando.

### Fotos
Grade de fotos de produtos e insumos, com filtro "só os que faltam", tirar ou escolher a foto e remover. A foto é reduzida no próprio aparelho antes de subir.

### Registrar
Registro de compras, contagem de estoque e importação do relatório de vendas.

### Fornecedores e Clientes
- **Fornecedores:** cadastro e contatos.
- **Clientes:** lista de quem tem conta no app, pontos e nível, saldo da carteira e ajuste de saldo. O cliente enxerga só o **nível** (de Caramelo a Nota de 200), nunca os pontos nem quanto gastou.

### Desempenho
Relatórios e indicadores: vendas, tempos de preparo por etapa, CMV e comparativos.

### Atividades
Aba para o superadmin: registro de quem fez o quê no sistema.

## 3. Financeiro

### Caixa do turno
Qualquer pessoa logada lança **sangria** (tirar dinheiro do caixa) e **suprimento** (pôr dinheiro) e fecha o caixa contando o dinheiro. O sistema mostra a diferença entre o esperado e o contado. O dia do turno vira às 6h da manhã.

### Contas a pagar
- Cadastre contas (aluguel, luz, fornecedores). Marque **repete todo mês** nas fixas e use **Gerar contas do mês**.
- **Paguei** dá baixa. A lixeira apaga.
- **Nota fiscal da conta:** o botão **🧾 Lançar NF** guarda a chave de acesso (44 números, conferida pelo dígito verificador), número, série, emissão e CNPJ do fornecedor. Ao colar a chave, número, série e CNPJ preenchem sozinhos. A mesma nota não entra em duas contas. Dá para anexar a foto ou PDF da nota (até 900 KB) e consultar o CNPJ na Receita Federal.

### Resultado do mês, Fluxo de caixa e Taxas
- **Resultado do mês:** faturamento menos taxas, custo das mercadorias e despesas.
- **Fluxo de caixa:** o que entra e sai por semana, com contas vencidas e o que a casa tem a receber (pelos prazos de cada forma de pagamento).
- **Taxas:** o quanto cada forma de pagamento (Pix, débito, crédito, dinheiro) cobra e em quantos dias o dinheiro cai.

## 4. Venda no balcão
- Produtos por categoria, com botões grandes. Escolha a forma de pagamento (Pix, débito, crédito ou dinheiro) e, quando houver mais de uma maquininha, qual delas.
- Dinheiro: o sistema calcula o **troco**.
- O pedido pago desce para a **Produção** e dá baixa no estoque pela ficha técnica.
- A **trava de estoque** impede vender o que não tem (pode ser desligada).

## 5. Produção
- Quadro com três colunas: **Recebido**, **Em produção** e **Entregue**.
- Cada pedido mostra o tempo de espera. É possível marcar **pronto por item** e fazer **entrega parcial** (REP 1, REP 2…), quando só parte do pedido ficou pronta.
- O cliente é avisado quando o pedido fica pronto: vibração e som na tela, e notificação no celular quando os avisos push estão configurados.
- No balcão, a entrega confere o **QR** do cliente. Pedido do app que ainda não foi pago aparece como **não pago**: não entregue.

## 6. App do cliente
- **A primeira tela é o login.** A conta fica salva no aparelho e define o que a pessoa vê. Dá para entrar com celular e senha (e com Google, quando configurado). Há "esqueci a senha" por e-mail, quando o envio de e-mail está configurado.
- **Pedir:** o cliente escolhe os itens, paga no Pix ou com saldo e **só então** o pedido é aceito. O QR do pedido é validado no balcão.
- **Carteira:** saldo pré-pago por recarga via Pix. O saldo pode ser usado nos pedidos e na inscrição de campeonatos.
- **Nível:** o cliente vê só o nível, nunca pontos ou valores gastos.
- Atalhos no topo: 🏆 campeonato e 🎱 fila da sinuca.

## 6.1. Pagamentos pelo celular do cliente
O Pix do app é gerado com um código copia e cola e um QR. O sistema funciona de três jeitos:
1. **Com gateway** (Mercado Pago ou Woovi): o pagamento é aprovado sozinho.
2. **Pix direto na chave** com o **Monitor de Pix** (seção 9).
3. **Pix direto na chave, sem monitor:** a equipe confirma o pagamento à mão.

## 7. Campeonato de sinuca

### Para o jogador (`/campeonato.html`)
- Vê os campeonatos e as **modalidades** (por exemplo Bola 8, Bola 9).
- Se cadastra na modalidade e paga a inscrição por **Pix** ou **saldo**. Só entra na chave depois de pago.
- Acompanha a **chave** e o **placar ao vivo** (atualiza sozinho) e o **ranking** com pontos por colocação.

### Para a equipe (`/torneio.html`)
- Cria o campeonato (nome, data, local) e as modalidades (taxa, vagas, divisão do prêmio em %).
- Confirma Pix de inscrição à mão e inscreve gente no balcão (dinheiro ou maquininha).
- **Sorteia a chave**: fecha as inscrições. Com número ímpar, os primeiros sorteados folgam na 1ª rodada. Há disputa de 3º lugar quando há 4 ou mais jogadores.
- Lança o placar pelo celular com os botões + e −, finaliza a partida (sinuca não empata) e pode **corrigir** uma partida já finalizada.
- O prêmio é calculado sobre o que foi arrecadado e a diferença fica com a casa.

## 8. Fila da sinuca

### Para o cliente (`/sinuca.html`)
1. Entre na conta (a fila é só para quem tem cadastro).
2. Toque em **Entrar na fila** e permita a localização do celular. Você precisa estar dentro do bar.
3. Quando a mesa liberar, você é **chamado**: o celular vibra e mostra o aviso (com notificação, se ativada). Você tem alguns minutos para tocar **Cheguei na mesa**.
4. Ao terminar o jogo, toque **Terminei** para liberar.
- Viu uma mesa "em jogo" que já acabou? Toque em **Terminou**. Se o jogador discordar em até 60 segundos ("Ainda jogando"), a mesa continua e quem avisou perde pontos.

### Conduta
Todo cliente começa com 100 pontos. Perde: chamado que não aparece (−15), desistir depois de chamado (−10), aviso de "terminou" falso (−25), tentativas de longe do bar (−10). Ganha: terminar um jogo (+2), aviso confirmado (+3). Com 60 pontos ou menos há **bloqueio de 24 horas** (7 dias a partir do terceiro). O cliente vê só o nível: Ótima, Boa, Atenção ou Bloqueado.

### Para a equipe (`/mesas.html`)
- **Marcar a localização do bar:** fique no meio do salão e toque **Usar minha localização como a do bar**. Sem isso a fila não abre para clientes. Ajuste o raio permitido e o tempo para chegar.
- Criar, desativar e **liberar** mesas; remover pessoas da fila; **penalizar** ou **perdoar** a conduta de um cliente; ligar e desligar a fila.

## 9. Pagamentos e Monitor de Pix

### Gateway (`/pagamentos.html`)
- Escolha como o Pix é cobrado: **manual** (chave do bar), **Mercado Pago** ou **Woovi**. Só o superadmin troca.
- A tela traz a **tabela comparativa** de taxas (inclui Getnet, Asaas, AbacatePay, InfinitePay) e um **simulador** com o seu movimento.
- O aviso de pagamento do gateway nunca é aceito sem conferência: o sistema consulta o gateway e só aprova se estiver pago e com o mesmo valor.
- Pix pago depois que o pedido venceu não é aprovado sozinho: devolva o valor ao cliente.

### Monitor de Pix (`/pix.html`)
Para Pix que cai **direto na chave**, sem gateway.
- Como o banco não avisa o sistema, um aviso chega por um **encaminhador de notificações** no celular do bar (ou pela API Pix do banco). O endereço e as instruções estão no topo da tela.
- O sistema procura a cobrança esperando **exatamente aquele valor** (pedido, recarga ou inscrição). Se houver uma só, sugere; se houver duas ou mais, ou nenhuma, a equipe escolhe com **Aprovar: ...**
- **Aprovação automática** (só superadmin liga) aprova sozinha apenas quando existe uma única cobrança com o valor e até o limite definido.
- Dá para **lançar à mão** um Pix visto no app do banco.
- Valor diferente nunca é aprovado: devolva ou ajuste o pedido.
- O segredo do monitor funciona como senha: quem o tem consegue forjar um pagamento.

## 10. Notas fiscais (NFC-e)
- Em `/fiscal.html`. A emissão vem **desligada**; nada vai à Receita enquanto não for configurada.
- **Para ligar:** contratar um emissor (Focus NFe) com certificado digital A1 e CSC da SEFAZ-RS; guardar o token na Cloudflare; informar o CNPJ e os padrões de NCM, CFOP e CSOSN (confirme com o contador); preencher os dados fiscais dos produtos; emitir em **homologação**, conferir o DANFE e só então passar para produção.
- **Emitir:** informe o número do pedido de hoje. Só pedido pago recebe nota, e a soma dos itens precisa bater com o total.
- Produto sem NCM, CFOP ou CSOSN válido bloqueia a emissão e o sistema lista quais faltam. Cada pedido tem uma nota viva só. Nota rejeitada mostra o motivo e pode ser emitida de novo.
- **Cancelar** pede justificativa de 15 letras ou mais e depende do prazo da SEFAZ.
- Ainda não existe: emissão automática ao pagar, modo offline (contingência), impressão do DANFE no balcão, NF-e (modelo 55) e NFS-e.

## 11. Excel
Aba **Excel**: exporta e importa planilhas (fornecedores, insumos, produtos, fichas, combos, contagem, taxas, despesas, compras e vendas). Importar com o código preenchido atualiza o registro; em branco cria um novo.

## 12. Problemas comuns
- **Cliente pagou o Pix e o pedido não liberou:** abra o Monitor de Pix e veja se o aviso chegou. Se não, lance o Pix à mão. Sem monitor, confirme o pagamento no pedido.
- **A fila da sinuca não abre:** falta marcar a localização do bar em `/mesas.html`.
- **Cliente diz que não consegue entrar na fila:** pode estar longe do bar, com GPS fraco ou bloqueado por conduta. A mensagem na tela diz o motivo; a equipe pode perdoar a conduta.
- **A nota não sai:** confira se o emissor está ligado, se há token e se todos os itens do pedido têm NCM, CFOP e CSOSN.
- **Esqueci a senha (equipe):** peça ao superadmin para trocar.

## 13. Para quem mantém o sistema
- **Regra de ouro:** toda alteração no sistema entra em dois lugares: uma linha em `docs/alteracoes.md` (o que mudou e quando) e o texto correspondente neste manual (`docs/manual.md`).
- Depois de editar, rode `npm run manual` para gerar a tela `/manual.html`. O teste automático falha se o manual gerado estiver desatualizado ou se uma tela nova não for citada aqui.
- Segredos da Cloudflare (nunca no código): `CODIGO_PRIMEIRO_ACESSO`, `ADMIN_TOKEN`, `VAPID_PUBLICA`, `VAPID_PRIVADA`, `VAPID_CONTATO`, `GOOGLE_CLIENT_ID`, `RESEND_API_KEY`, `EMAIL_REMETENTE`, `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `FOCUSNFE_TOKEN`, `PIX_MONITOR_SECRET`.
