# Manual do Mukifosystem

Este manual é para quem opera o bar: balcão, cozinha, gerência e dono. Ele é montado a partir do arquivo `docs/manual.md`. Quando algo no sistema muda, o texto muda aqui e o manual é gerado de novo (veja "Para quem mantém o sistema" no fim).

## 1. Primeiros passos

### Entrar e quem vê o quê
- Quem trabalha entra com **nome e senha**. O primeiro acesso cria o **superadmin** (o dono), usando o código de primeiro acesso guardado na Cloudflare.
- O superadmin vê tudo e, na aba **Conta**, escolhe o que cada gerente pode ver (painel de permissões). O sistema também bloqueia no servidor: esconder o botão não é o único cuidado.
- **Zerar testes** (aba Conta, só superadmin): apaga pedidos, cobranças, carteira dos clientes e caixa feitos no sistema e devolve ao estoque o que as vendas tiraram. Mantém produtos, estoque, fotos, clientes, pessoas e o histórico importado. Não dá para desfazer.
- **Login de demonstração** (botão "Só quero ver" na tela de entrada): entra sem senha, com todas as telas liberadas, para mostrar o sistema (7 dias). Só não gerencia pessoas nem passa o cargo. **Vem ligado**: para desligar, crie `LOGIN_DEMO` = `nao` na Cloudflare (Settings → Variables and Secrets).
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
| Placar da sinuca (Hall da Fama, TV do bar) | `/placar.html` | todos, sem login |
| Mesas e fila (equipe) | `/mesas.html` | equipe |
| Pagamentos | `/pagamentos.html` | financeiro |
| Monitor de Pix | `/pix.html` | financeiro |
| Notas fiscais | `/fiscal.html` | financeiro |
| iFood e 99Food | `/canais.html` | gerência |
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
Grade de fotos de produtos e insumos, com filtro "só os que faltam", tirar ou escolher a foto e remover. A foto é cortada do centro em quadrado e reduzida (640 px) no próprio aparelho antes de subir. **Enviar várias fotos**: escolha vários arquivos de uma vez; cada um vai para o item que tem o nome parecido com o do arquivo (ex.: `caipirinha-de-limao.jpg`, `Heineken.png`). Arquivo que não acha item, ou que combina com mais de um, é listado para você renomear ou subir pelo toque no item.

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
- **Ao vivo agora:** no topo, os jogos que estão na mesa, com placar grande e o número da mesa.
- **A chave:** árvore com as fases lado a lado e linhas ligando cada jogo ao próximo. O caminho de quem venceu fica destacado e o campeão aparece no fim, com 🏆. Quem folgou na 1ª rodada já aparece direto na fase seguinte.
  - **Navegar:** arraste para os lados ou toque nas abas das fases (Oitavas, Quartas, Semifinal, Final, 🏆). A chave abre na fase que está acontecendo. Os botões − e + mudam o tamanho, e o aparelho lembra a escolha.
  - **Seguir um jogador:** toque no nome e os jogos dele ficam destacados. Quem entrou com a conta já aparece destacado. Toque de novo para parar de seguir.
  - A tela atualiza sozinha sem piscar e sem perder o ponto onde você estava.

### Score, níveis e chave justa
- **Score:** cada jogador tem um score que começa em 1000 e muda a cada jogo terminado, no estilo do xadrez (Elo): ganhar de quem é melhor sobe muito, ganhar de quem é pior sobe pouco, perder desce. Vale para quem tem conta e para quem joga só pelo balcão (pelo nome: escreva sempre igual).
- **Níveis:** Novato (menos de 3 jogos), Bronze, Prata (1025+), Ouro (1075+), Platina (1150+), Diamante (1250+). Aparecem como bolinha colorida na chave e na lista de inscritos, e em Ranking → "Níveis dos jogadores".
- **Título especial:** na lista de inscritos, o botão 🏅 dá a um jogador um título no lugar do nível, com ícone (padrão: 🐭🧠 "Pinky e Cérebro", roxo). Aparece na chave, na lista e no ranking; o score continua contando. Clique de novo no 🏅 para tirar ou trocar. Vale para o jogador em todos os campeonatos (ligado à conta, ou ao nome se for de balcão).

### Ranking de toda a sinuca (campeonato + mesa)
- O mesmo score (Elo) vale para os jogos de campeonato e para os jogos da mesa no dia a dia. O ranking aparece no fim da tela da fila (`/sinuca.html`) e em Campeonato → Ranking.
- **Como entra um jogo da mesa:** ao liberar a mesa, quem jogou vê "Quem ganhou?", escolhe o adversário pelo nome e toca em "Eu ganhei" ou "Eu perdi". O adversário recebe "Confere?" no celular dele; ao confirmar, o jogo conta. "Não foi assim" manda o caso para o balcão.
- **No balcão** (`/mesas.html`, "Resultados da mesa para conferir"): ficam os jogos contra quem não tem cadastro, os contestados e os que o adversário não respondeu em 1 hora. Botões "Vale" e "Não vale". Também dá para **lançar um jogo agora** informando os dois nomes e quem ganhou.
- **Contra fraude:** só vale depois de confirmação; máximo de 10 resultados por hora por pessoa; a mesma dupla conta no máximo 6 jogos por dia. Jogo pendente ou contestado não mexe no score.

### Placar online (`/placar.html`)
- Placar estilo fliperama, aberto para todos, sem login: posição, jogador, **jogos**, **vitórias**, **% de aproveitamento**, score e nível. Mostra 🔥 quem está numa sequência de vitórias e o recorde de cada um.
- Abas de período: **Hoje**, **7 dias**, **Mês** e **Sempre**. Ordenar por **Score**, **Vitórias**, **Jogos** ou **Sequência**. Jogos e vitórias são do período; o score é a pontuação geral do jogador.
- Conta campeonatos e jogos da mesa já confirmados (ver "Ranking de toda a sinuca").
- **Para a TV do bar:** abra `/placar.html?tv=1`. Letras grandes, atualiza sozinho a cada 15 segundos e passa de período (hoje, 7 dias, mês, sempre) a cada 20 segundos.
- Dá para fazer o jogo da mesa valer menos que o de campeonato: guarde em `configuracao` a chave `sinuca_peso_mesa` com um valor entre 0 e 1 (ex.: 0.5). Sem a chave, vale igual.

- **Formato da chave** (escolhido ao criar a modalidade, ou em "Formato da chave" antes do sorteio):
  - 🎲 **Sorteio:** qualquer um contra qualquer um.
  - ⚖️ **Por nível:** na 1ª rodada se enfrentam os parecidos (1º×2º, 3º×4º…), e quem tem o maior score folga. Os dois melhores pares só se cruzam no fim.
  - 🏅 **Cabeças de chave:** os melhores ficam separados e só se encontram no fim (modelo Copa do Mundo).
- **Séries por nível:** "Dividir em séries por nível" separa os inscritos pelo score (Série A com os melhores, depois B, C, D). Cada série vira uma modalidade com chave e prêmio próprios. Só antes do sorteio, e com pelo menos 2 jogadores por série.
- **Repescagem por recompra** (opcional, por modalidade): escolha quantas vagas (1, 2 ou 4), o valor da recompra (vazio = o mesmo da inscrição) e se o dinheiro vai para o prêmio ou para a casa.
  - No sorteio, as vagas ficam guardadas na 2ª rodada ("↩ Vem da repescagem").
  - Quem perde na 1ª rodada pode recomprar uma vez: no balcão ("Recebi R$ …" no cartão "Repescagem aberta") ou pelo app, com o saldo da carteira.
  - Quando a 1ª rodada acabar, toque em "Fechar repescagem e montar os jogos": os recompradores jogam entre si (por grupo, se houver mais de uma vaga) e cada vencedor entra na vaga reservada. Se ninguém recomprar, a vaga vira W.O. e o adversário avança sozinho.
  - Quem perde na repescagem fica com a colocação da 1ª rodada. Depois que a repescagem é montada, os jogos da 1ª rodada não podem mais ser corrigidos.

### Para a equipe (`/torneio.html`)
- **Agora:** no topo da modalidade, os jogos em andamento e os que podem começar. Toque num deles para abrir o placar.
- **Chave:** a mesma árvore do jogador. Toque num jogo para abrir o **painel de placar** (de baixo para cima): − e + grandes para cada jogador, o número da mesa e "Finalizar". Jogo terminado mostra "Corrigir resultado". Feche pelo botão, tocando fora ou com Esc.
- **Convite por WhatsApp (automático):** com a izapia ligada, cada modalidade nova convida sozinha os clientes que **aceitaram receber** (LGPD) e têm celular. O botão "Convidar clientes agora" faz o mesmo para uma modalidade que já existe e não repete quem já foi convidado.
  - **Como sai:** em fila, poucas mensagens por minuto (4 por padrão), com teto por dia (80). A mensagem leva o primeiro nome, a taxa e o link do campeonato. Se as inscrições encerrarem antes, o que sobrou na fila é cancelado.
  - **Cuidado com o número:** a izapia usa o protocolo do WhatsApp Web, não a API oficial da Meta. Mandar muito, rápido ou para quem não conhece o bar pode bloquear o número. Use um chip só do bar, não o pessoal.
  - **Consentimento (LGPD):** ao criar a conta, o cliente vê uma caixa opcional, separada dos termos: "Quero receber convites de campeonato e novidades por WhatsApp". Quem não marcou não recebe nada. O cliente liga ou desliga quando quiser em Minha conta → "Convites por WhatsApp". Cada aceite e cada revogação ficam gravados com data, origem (cadastro, app ou balcão), celular e o texto exato mostrado. O cartão do campeonato mostra quantos clientes aceitaram e quantos ainda não.
  - **Quem não quer receber:** digite o celular em "Não enviar" no cartão: o cliente sai da lista e a revogação fica registrada. Se ele mesmo aceitar de novo no app, volta a receber.
  - **Ligar:** crie a conta em `app.izapia.com`, leia o QR Code com o WhatsApp do bar e guarde `IZAPIA_API_KEY` e `IZAPIA_SID` no Cloudflare. Só o superadmin liga o envio.
  - **Sem a izapia:** "Enviar manualmente" abre o WhatsApp com o convite pronto e você toca em enviar.
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

## 10.1. iFood e 99Food
- Em `/canais.html` ("iFood/99 →" na gestão). Cada canal vem **desligado**; o superadmin liga depois de guardar as credenciais no Cloudflare.
- **Como funciona:** o sistema busca os pedidos da plataforma todo minuto (e a cada 30 segundos enquanto a Produção está aberta). O pedido entra na **Produção** como os do app, marcado como "iFood · Nome" ou "99Food · Nome", e **dá baixa no estoque** pela ficha técnica.
- **Aceite:** por padrão o pedido é aceito na plataforma assim que chega (as plataformas cancelam sozinhas o que ninguém aceita a tempo). O superadmin pode desligar isso.
- **Andamento:** ao marcar **Preparando** e **Pronto** na Produção, a plataforma é avisada. Em `/canais.html`, "Entregador levou" ou "Cliente retirou" encerra o pedido e avisa a plataforma.
- **Cancelamento:** pedido cancelado pelo cliente ou pela plataforma é cancelado aqui e o estoque volta.
- **Vínculo dos produtos:** no cadastro do produto na plataforma, use como código externo o **número do produto no Mukifo**. Sem código, o sistema tenta o nome igual. Item sem vínculo entra no pedido, mas **não baixa estoque**: a tela mostra o aviso.
- **iFood:** precisa de cadastro de desenvolvedor no portal do iFood (a loja de teste serve para ensaiar). **99Food:** usa o padrão Open Delivery e o acesso é liberado pela 99Food a softwares parceiros.
- **Se a plataforma ficar fora do ar:** a Produção continua; o erro aparece no pedido e o sistema tenta aceitar de novo.
- **Ainda não faz:** pedidos agendados com tratamento especial, edição de cardápio e preços nas plataformas, abrir e fechar a loja pelo sistema, comissão no resultado do mês.

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
- Segredos da Cloudflare (nunca no código): `CODIGO_PRIMEIRO_ACESSO`, `ADMIN_TOKEN`, `VAPID_PUBLICA`, `VAPID_PRIVADA`, `VAPID_CONTATO`, `GOOGLE_CLIENT_ID`, `RESEND_API_KEY`, `EMAIL_REMETENTE`, `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `FOCUSNFE_TOKEN`, `PIX_MONITOR_SECRET`, `IZAPIA_API_KEY`, `IZAPIA_SID`, `IFOOD_CLIENT_ID`, `IFOOD_CLIENT_SECRET`, `IFOOD_MERCHANT_ID`, `OD_99FOOD_BASE_URL`, `OD_99FOOD_CLIENT_ID`, `OD_99FOOD_CLIENT_SECRET`, `OD_99FOOD_TOKEN_URL`.
