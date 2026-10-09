# Qualificação do lead

O que a pessoa disse, e quem atender primeiro. Documento de leitura: o que a
ficha faz, o que ela se recusa a fazer, e por quê.

---

## 1. De onde veio

Em setembro de 2026 o dono trouxe dois documentos: o resumo de uma aula de
tráfego imobiliário (um funil de anúncio, landing, formulário, qualificação e
CRM) e uma ideia de "score de intenção" com quiz, simulador e pontos por
comportamento. A medição da casa, no mesmo dia:

| | |
|---|---|
| Leads em 30 dias | 138 |
| Por clique-para-WhatsApp | 138 |
| Pela landing com formulário | 0 (a primeira campanha fez 343 sessões e nenhum lead) |
| Parados em "Novo" | 97 |
| Em visita agendada ou proposta | 3 |

Duas consequências moldaram tudo. O funil dos documentos é de formulário, e o
desta casa é de WhatsApp: a pergunta tem de acontecer na conversa. E com 3 leads
passando da segunda etapa num mês, nenhum peso de score pode ser aprendido do
dado — qualquer número seria escolhido à mão.

---

## 2. Três respostas

| Campo | Valores |
|---|---|
| `finalidade` | morar, investir, segunda residência, ainda avaliando |
| `prazo_compra` | 30 dias, 1 a 3 meses, 3 a 6 meses, mais de 6 meses, só pesquisando |
| `encaixe_financeiro` | entrada e parcelas cabem, precisa de mais prazo, depende de financiamento bancário |

São as perguntas que o corretor já faz na primeira conversa. Faixa de
investimento ficou de fora porque a página já diz o preço.

**Não existe pergunta sobre financiamento aprovado.** A maioria dos imóveis da
casa está na planta, e na planta o pagamento é direto com a construtora: entrada,
parcelas, reforços e chaves. Banco só entra em imóvel pronto, e o saldo das
chaves também segue com a construtora. `depende_banco` existe como *resposta*:
quem depende de banco está dizendo que precisa de imóvel pronto, e o corretor tem
de saber disso antes de mandar a tabela de um lançamento.

---

## 3. A temperatura é regra

| Respostas | Temperatura |
|---|---|
| sem prazo | nenhuma ("sem qualificação") |
| prazo até 3 meses **e** a entrada cabe | quente |
| prazo até 6 meses | morno |
| o resto | frio |

`depende_banco` nunca passa de morno pela regra.

### O que ela NÃO é

**Não é soma de pontos.** A proposta original dava +20 por "investir", +2 por
rolar 25% da página, +10 por mexer num simulador. Peso escolhido à mão produz
número com cara de preciso, e esta casa já recusou um semáforo assim na
Inteligência. Regra escrita se explica em voz alta, se testa, e se troca quando
o dado mostrar que está errada.

**Não pontua comportamento.** Rolagem, galeria e tempo de página são ruído no
celular, e a página hoje nem guarda nada por pessoa (a tabela de eventos crus é
a peça 009 do roteiro). Quando existir, comportamento entra como *fato* na ficha
("simulou três cenários"), sem ponto, até haver dado para saber se prevê algo.

**Não é veredito sobre a campanha.** Temperatura declarada ordena o dia do
corretor. Medir campanha continua sendo comportamento: respondeu, agendou visita.

### Onde mora

No banco: `temperatura_pela_regra(prazo, encaixe)`, na 120. Quem precisa do selo
é SQL (o filtro do quadro, a exportação, o aviso de lead quente), então a tela só
lê. `temperatura_regra` e `temperatura` são **colunas geradas**: ninguém escreve
nelas.

O corretor pode marcar à mão (`temperatura_manual`), e a marcação ganha da regra.
As duas ficam guardadas lado a lado, para daqui a um trimestre dar para
perguntar: quando ele discordou da regra, quem estava certo?

> **Mudar a regra** é recriar a função **e** reescrever as linhas
> (`update public.leads set prazo_compra = prazo_compra`), na mesma migração.
> Coluna gerada não se recalcula sozinha quando a função muda.

---

## 4. As quatro portas

| Porta | Como entra | Estado |
|---|---|---|
| Ficha | o corretor anota o que ouviu; salva pela tabela, sob a RLS | 120 |
| WhatsApp | o leitor da primeira mensagem | 121 |
| Landing | o seletor "O que você procura" manda o código | 121 |
| Formulário da Meta | as respostas já ficam guardadas cruas em `meta_lead_submissions` | a fazer, quando houver campanha de formulário com pergunta |

Tudo o que grava sem ser a ficha passa por **uma função só**,
`lead_preencher_qualificacao`. Ela garante as duas regras que nenhuma porta pode
esquecer: só preenche o que está vazio, e avisa o histórico de onde veio. Toda
mudança vira linha no histórico por gatilho, com os rótulos do contrato.

### O leitor do WhatsApp

O anúncio de clique-para-WhatsApp aceita perguntas pré-preenchidas. A pessoa
toca em uma e aquilo vira a **primeira mensagem** dela. As frases combinadas:

| Português | Espanhol | Grava |
|---|---|---|
| Quero investir | Quiero invertir | investir |
| Quero morar em Porto Belo | Quiero vivir en Porto Belo | morar |
| Quero um apartamento para veraneio | Quiero un departamento para vacaciones | segunda residência |
| Quero valores e plantas | Quiero precios y planos | nada |

O leitor casa pelo **miolo** ("quero morar"), porque a cidade muda de campanha
para campanha. E se recusa, sempre para o mesmo lado:

1. só lê mensagem com **prova de origem** — o contexto de anúncio que a Meta
   manda junto, ou o nosso código de referência. Conversa solta não é lida;
2. só lê **finalidade**. "Será que a entrada cabe?" é pergunta, e viraria
   resposta;
3. negação em qualquer lugar do texto cala o leitor;
4. duas finalidades na mesma mensagem não escolhem uma;
5. nunca sobrescreve o que o corretor anotou;
6. nunca derruba a entrada da mensagem: engole a própria exceção.

Campo vazio o corretor preenche na primeira conversa. Campo errado ele não
confere, e a fila passa a mentir.

---

## 5. Nome de anúncio

A convenção de nomes continua a mesma (campanha `EMPREENDIMENTO | Destino`,
conjunto `Público | Geo`, anúncio `Ângulo | Formato | vN`). A primeira palavra do
anúncio passa a ser a família do ângulo, em maiúscula e sem acento:

```
DOR Dinheiro parado | Imagem | v1
DESEJO Pe na areia | Imagem | v1
COMPARACAO Outro lado do rio | Imagem | v1
OBJECAO Sem banco | Imagem | v1
CURIOSIDADE Pier Oporto | Video15 | v1
```

O resto do campo é o que o corretor lê na ficha antes de dar oi. A junção com o
gasto continua por ID, nunca por nome; o nome serve para gente ler e, adiante,
para a Inteligência agrupar por ângulo.

---

## 6. Onde cada coisa mora

| Camada | Arquivo | Responsabilidade |
|---|---|---|
| Contrato | `packages/contracts/qualificacao.ts` | listas, rótulos, a frase que explica |
| Contrato | `packages/contracts/qualificacao-leitor.ts`, `retomada.ts` | as frases do leitor; o motivo de retomar um lead |
| Banco | `120_o_que_o_lead_disse.sql` | colunas, regra, colunas geradas, histórico, exportação |
| Banco | `121_a_pessoa_responde_sozinha.sql` | porta única, leitor, prova de origem, releitura das mensagens antigas |
| Borda | `functions/landing-lead` | grava a finalidade do seletor pela porta da landing |
| Tela | `components/leads/Qualificacao.tsx` | o cartão da ficha |
| Tela | `components/leads/SeloDeTemperatura.tsx` | o selo, nos dois temas |
| Tela | `pages/Leads.tsx`, `hooks/useLeadsBoard.ts` | filtro por temperatura, uma chave de cache só |
| Planilha | `src/exportacao.ts` | quatro colunas no fim |
| Travas | `packages/contracts/qualificacao.test.ts` | contrato contra o banco, a regra literal, os rótulos |
| Travas | `packages/contracts/qualificacao-leitor.test.ts` | o leitor, a porta única, a cópia das finalidades na landing |
| Travas | `supabase/testes/qualificacao.test.ts` | tabela-verdade, RLS, coluna gerada |
| Travas | `supabase/testes/qualificacao_leitor.test.ts` | leitor de verdade, a primeira mensagem, a porta única |
| Fila | `122_o_cartao_anda_quando_alguem_responde.sql` | o cartão sai de "Novo" na primeira resposta humana |
| Fila | `123_os_que_ja_tinham_sido_respondidos.sql` | o remanejamento de uma vez |
| Travas | `src/atendimento.test.ts`, `supabase/testes/atendimento.test.ts` | o desenho e os sete comportamentos do gatilho |

A frase da ficha (`explicarTemperatura`) **descreve** as respostas e nunca
recalcula o selo. Se recalculasse haveria duas regras, e no dia em que uma
mudasse a ficha passaria a explicar um selo que não é o que está na tela.

---

## 6.1 A fila: "Novo" quer dizer o que ninguém tocou

Medido na conta de origem: cem leads em "Novo", **mais de 90% já respondidos**,
com mediana de minutos até a primeira resposta. A casa atendia quase
tudo e quase nada é movido de etapa depois — e `painel_funil`, que conta por
`furthest_position`, afirmava 22% de atendimento onde a verdade era 95%.

A **122** faz o cartão andar sozinho: quando alguém da imobiliária responde, o
lead sai da primeira etapa para "Em atendimento".

A lógica mora no gatilho da **mensagem**, e não num gatilho em `leads`. Três
motivos, e os três são armadilhas de verdade:

1. `whatsapp_messages.automatica` não existe em `leads`. É a coluna que separa
   gente de robô — e sem ela, no dia em que o agente de IA for ligado, a saudação
   automática esvaziaria a coluna "Novo" sem ninguém ter atendido nada.
2. O BEFORE da 003 carimba `first_contact_at` em **qualquer** saída da posição 1,
   porque olha só a etapa velha. Um gatilho reagindo a esse carimbo desfaria o
   arrastar do cartão na mesma transação: o corretor move o lead e vê ele voltar,
   sem erro em lugar nenhum.
3. Some a classe de risco de fiação — ordem alfabética entre gatilhos, re-disparo,
   e atribuir `new.stage_id` num BEFORE (que não acorda `leads_marca_avanco` e
   deixaria o quadro e o funil discordando).

As guardas, e o que cada uma impede:

| Guarda | Sem ela |
|---|---|
| `direction = 'saida'` | a mensagem do cliente tira o lead de "Novo" |
| `not automatica` | a resposta do robô conta como atendimento |
| está na primeira etapa ativa | todo salto que pula a segunda etapa é desfeito; o lead criado em "Perdido" é ressuscitado |
| destino pela **chave** `em_atendimento` | `position = 2` pode devolver duas linhas (só `(organization_id, key)` é único) e derrubar o INSERT da mensagem |
| `is_active`, não `is_lost`, não `is_won`, posição maior | o lead cai numa etapa que o quadro não desenha, ou anda para trás |
| bloco que engole a própria exceção | o cartão não andar vira "a mensagem do cliente sumiu" |

A **123** move de uma vez os que já foram respondidos. É migração separada de
propósito: a regra de amanhã é decisão de produto, mover 93 fichas de cliente é
decisão de quem é dono do dado.

O que o remanejamento faz, medido em ensaio contra a produção: "Novo" cai de 101
para 8, "Em atendimento" sobe de 24 para 117, nascem 93 linhas de histórico
assinadas "Sistema", e **zero** notificações e push. A data de entrada na etapa
fica sendo a da **resposta**, e não "agora" — com "agora" os 93 apareceriam
recém-chegados e o alerta de "parado há mais de 7 dias" apagaria para todos.

---

## 6.2 A cobrança: alguém escreveu e ninguém voltou

A **124** criou a fila (`leads.esperando_desde`) e disse, no próprio cabeçalho,
que não criaria alarme por tempo: "é uma linha de `cron` em cima desta coluna, e
ela só vale depois de alguém olhar a fila por uns dias e dizer qual é o limite
que incomoda". A **128** é essa linha, e o limite saiu de medição.

**45 dias de conversa real, 696 esperas — 15,5 por dia:**

| Tempo até a resposta da casa | Esperas |
|---|---|
| até 15 min | 387 (56%) |
| 15 min a 1h | 90 (69% acumulado) |
| 1h a 3h | 33 |
| 3h a 6h | 26 |
| 6h a 24h | 26 |
| mais de um dia | 62 |
| **nunca responderam** | **72** |

O ritmo da casa é bom, e o que decide o limite não é a média: é a forma da curva
depois da primeira hora, e ela é **plana**. Passaram de 1h 219 esperas, de 2h
194, de 3h 185, de 24h 124 — quem não é respondido na primeira hora quase nunca é
respondido no mesmo dia. Apertar de 3h para 1h acrescenta 0,8 aviso por dia; é o
limite FROUXO que faz estrago, porque deixa a pessoa esperando o dia inteiro
antes de alguém ser avisado.

**Duas horas**, então (~4,3 avisos por dia), em `organizations.aviso_espera_horas`
— nulo desliga a casa inteira, e quem muda é gerente ou admin, na aba
Notificações. Cada um silencia para si o tipo `lead_esperando`.

As guardas, e o que cada uma impede:

| Guarda | Sem ela |
|---|---|
| janela de 8h às 20h **na hora da imobiliária** | celular tocando às 2h da manhã: 164 das 696 esperas começam entre 21h e 23h |
| a janela é conferida **dentro da função** | o `cron` do Supabase roda em UTC: `'2 8-20 * * *'` avisaria das 5h às 17h em Porto Belo, e o cron marcaria "succeeded" em todas as execuções |
| `espera_avisada` guarda **qual** espera foi avisada | com um sim/não, a segunda vez que o cliente ficar sem resposta não é cobrada |
| marcar **depois** de avisar, no mesmo bloco | um aviso que falhou some sem deixar rastro |
| ganho, perdido e excluído ficam de fora | cobra-se resposta de quem já foi encerrado, e a lista vira ruído |
| a fila que já existia nasce **marcada** | 65 notificações e 65 pushes na primeira execução, para duas pessoas |
| o corpo diz o **tempo**, não a mensagem | o texto da conversa acende na tela de bloqueio do celular |

Não há escalonamento ("avisa de novo em 6h") de propósito: o cartão "Esperando
resposta" do painel já mostra quem está parado há dias, e alarme que repete é
alarme que se aprende a fechar sem ler.

## 7. O que ainda não existe, e por quê

~~**Aviso de lead quente e alarme de quente sem resposta.**~~ Feito: o
`lead_quente` na 124 e o `lead_esperando` na 128 (seção 6.2). O que o alarme
ainda não sabe é a **temperatura**: hoje ele cobra a mesma duas horas do lead
quente e do curioso. Só vale mexer nisso depois de a qualificação ter dado — com
176 leads e nenhuma temperatura preenchida, um limite por temperatura seria um
limite por coluna vazia.

**Quiz na landing.** A landing com formulário ainda não converteu. O desenho
previsto manda as respostas dentro da própria mensagem do WhatsApp, que a pessoa
envia — sem disparo automático nosso, que é o padrão que leva número a bloqueio.

**Comportamento por pessoa.** Depende da peça 009 (eventos crus com id de
sessão), do id de sessão no formulário e da decisão de consentimento.

**Calibração.** A cada trimestre, cruzar temperatura declarada com atendido,
visita e proposta. Se o "quente" não responder mais que o "morno", as perguntas
estão erradas — e troca-se a pergunta, não o peso.
