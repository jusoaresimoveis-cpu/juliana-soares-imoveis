# Inteligência de Marketing

A mesa onde se decide verba. Documento de leitura: o que a tela faz, o que ela
se recusa a fazer, e por quê.

---

## 1. A medição que veio antes do desenho

Antes de escrever uma linha, medi a conta real. Em 23/08/2026:

| | |
|---|---|
| Campanhas com gasto | 42 |
| Gasto total (13/07 a 23/08) | R$ 3.288,49 |
| Campanhas ativas | 12 |
| Orçamento diário das ativas | R$ 7 a R$ 22 cada |
| Leads no CRM | 32, todos entre 18 e 23/08 |
| Leads com anúncio identificado | 30 de 32 — **94%** |
| Maior campanha do período | 9 leads |
| Leads em visita realizada, proposta ou venda | **0** |
| Conjuntos com destino WhatsApp | 197 de 211 |

Três consequências saíram daí, e elas moldaram tudo.

**A operação é clique-para-WhatsApp, não formulário.** 30 dos 32 leads vieram
por `ctwa`. O "lead" desta casa é uma conversa iniciada — e a Meta conta isso em
`messaging_count`, não em `lead_count`, que vem quase todo zerado. Uma tela que
lesse `lead_count` mostraria a conta inteira produzindo nada.

**Nenhuma campanha tem volume para um veredito.** Com 9 resultados, o intervalo
de 95% do custo por lead vai de R$ 7,92 a R$ 37,64 — quase cinco vezes de
largura. Com 3, o limite superior não existe. Duas campanhas de desempenho REAL
idêntico e 4 leads cada aparecem diferindo em mais de 2× em 42% das semanas.

**O funil morre na posição 2.** Zero visitas realizadas, zero propostas, zero
vendas. Toda métrica que dependa delas — CPQL, CAC, taxa de conversão — é
"Dados não disponíveis" hoje, e continuará sendo por meses.

---

## 2. O que a tela NÃO faz

### Não acende um semáforo sempre

O pedido original era verde-escala / amarelo-espera / vermelho-pausa em toda
linha, sempre. Nos volumes acima isso é um gerador de números aleatórios com
legenda — e as recomendações que ele produz são as mais fáceis de acatar
(desligar um anúncio é barato e parece prudente), logo as mais seguidas.

O veredito tem **seis estados**, e o mais comum é `sem leitura`:

| Estado | Quando aparece |
|---|---|
| **Parada** | a campanha não está entregando. O dinheiro já saiu e não há ação possível |
| **Sem meta** | nenhum teto de CPL declarado — o semáforo inteiro está desligado |
| **Sem leitura** | menos de 10 resultados. Diz quantos faltam e quanto custaria chegar lá |
| **Observar** | a faixa atravessa uma das duas linhas — não dá para afirmar |
| **Rende** | o custo bate o alvo **e** o topo da faixa ainda cabe no teto |
| **Revisar** | o piso da faixa já passou do teto, **ou** gasto ≥ 4 × teto com zero resultado |

### Duas linhas, não uma

O primeiro desenho tinha um número só — "a meta" — e o semáforo era montado em
volta dele com multiplicadores **que eu escolhi**: verde abaixo de 0,8×, vermelho
acima de 1,5×.

O cliente digitou R$ 12 e explicou depois: *"não é uma meta, é como se fosse um
máximo. A meta seria cinco, seis"*. Com o número lido como alvo, o vermelho só
apareceria em R$ 18 — cinquenta por cento **acima** do máximo que ele aceita
pagar. A tela diria "observar" para um custo que, para ele, já é motivo de parar.

O modelo dele é o de qualquer gestor de mídia, e é melhor que o meu:

| | |
|---|---|
| **Alvo** | onde a casa quer chegar. Abaixo dele, a campanha rende |
| **Teto** | o máximo que ela aceita pagar. Acima dele, para |

Com os dois, os multiplicadores somem e no lugar deles entram as **pontas da
faixa** — que já eram calculadas e só eram exibidas:

- **vermelho**: o piso (ponta otimista) já está no teto. Não é azar de amostra, é preço.
- **verde**: o palpite bate o alvo **e** o topo da faixa ainda cabe no teto.

Isso é mais forte do que comparar o custo medido com um limiar, porque a faixa
carrega o tamanho da amostra dentro dela. Campanha com 3 leads não tem topo de
faixa — logo nunca fica verde, sem precisar de regra de contagem separada. O
limiar de 25 leads deixou de existir: era muleta para o que a faixa já resolve.

O piso de 10 leads fica, e por motivo da **fórmula**: a faixa usa a aproximação
normal da Poisson, ruim abaixo de cerca de dez eventos.

**O alvo é opcional.** Sem teto não há semáforo; sem alvo há vermelho e amarelo,
mas o verde nunca acende — não existe contra o que dizer que a campanha está
rendendo, só que ela é aceitável.

`Parada` vem antes de tudo, inclusive da meta. Veredito é recomendação de AÇÃO,
e campanha que não entrega não tem ação possível — mandar "revisar" uma campanha
pausada recomenda algo que já foi feito. O defeito apareceu com dado real: as
duas primeiras campanhas que o semáforo pintou de vermelho, R$ 65,29 e R$ 64,47
sem nenhum lead, já estavam pausadas havia dias.

`Sem leitura` não é falha. É a resposta certa quase sempre, e ela vem com o
número que falta — "faltam 6 leads, cerca de R$ 78 no ritmo atual" é acionável;
um verde inventado não é.

### Não compara campanhas de objetivos diferentes

Formulário nativo, clique-para-WhatsApp e tráfego não compartilham denominador.
A tela mostra o objetivo e o destino em cada linha, e denuncia a mistura como
achado.

### Não soma moedas

Uma organização pode ter duas BMs e contas em moedas diferentes. Todo agregado
monetário devolve nulo quando há mais de uma — mesma regra que `painel_janela`
já aplica.

### Não chama clique total de CTR

`meta_ads_spend.clicks` conta curtida, comentário, expandir foto e arrastar
carrossel. Medido nesta conta: **CTR total 1,34% contra CTR de link 0,40%** — um
fator de 3,3. A 105 passou a coletar `inline_link_clicks`, e o CTR da tela usa
só ele. Data anterior à coleta aparece em branco, nunca em zero.

---

## 3. A faixa — o elemento central do desenho

Cada linha desenha três coisas na mesma régua: onde a meta está, onde o custo
medido caiu, e o quanto esse custo pode estar errado.

```
R$ 13,09  · R$ 7,92 a R$ 37,77                          meta R$ 40,00
──────────[███████████████]──────────────┃───────────────────────────
           piso    ┃ medido    teto      meta
```

Quando a amostra não sustenta um teto — o que acontece com qualquer contagem
até 3 — a barra sai da tela pela direita em degradê, em vez de terminar num
ponto. Barra que termina afirma um limite; esta precisa dizer que não há.

A escala é **fixa em 2,5 × a meta**. Escala automática pelo maior valor faria a
mesma campanha mudar de aparência quando OUTRA campanha muda, e quem lê juraria
que algo aconteceu com esta.

A matemática: contagem de lead é Poisson, o desvio de `n` eventos é `√n`, então
o intervalo de 95% da contagem é `n ± 1,96√n`. Como custo é gasto ÷ contagem, o
intervalo do custo se inverte — o piso vem da contagem maior. Quando
`n − 1,96√n ≤ 0`, o teto não existe e a coluna devolve nulo.

---

## 4. Os achados valem mais que o semáforo

O semáforo compara UMA campanha com a meta e precisa de volume. Os achados
olham a **conta inteira**, que tem volume: "doze campanhas dividindo R$ 150 por
dia" é um fato sobre 150 reais, não sobre 9 leads.

| Achado | Gravidade | O que dispara |
|---|---|---|
| **Semáforo desligado** | alta | nenhuma meta de CPL declarada |
| **Verba pulverizada** | alta | mediana de orçamento diária que não produz 50 resultados por semana |
| **Gasto sem rastro** | alta | resultado na Meta, zero lead no CRM |
| **Cobertura baixa** | alta | menos de 70% dos leads casam com gasto |
| **Objetivos misturados** | média | mais de um objetivo no mesmo ranking |
| **Atendimento lento** | média | mediana da campanha > 2× a da casa |
| **Sem clique de link** | baixa | coleta ainda não alcançou aquele período |
| **Sem orçamento** | baixa | não achado nem na campanha nem nos conjuntos |

**Verba pulverizada** é o achado principal desta conta. A Meta precisa de ~50
eventos de conversão por semana por conjunto para sair da fase de aprendizado.
Com mediana de R$ 22/dia e CPL de R$ 24, cada campanha faz ~6 por semana.
Nenhuma sai. A mesma verba em menos campanhas otimiza; espalhada, ela paga o
aprendizado doze vezes e não termina nenhum.

**Atendimento lento** trava o vermelho, e isso é uma decisão de projeto. A regra
da 095 manda o lead para quem paga o anúncio, então cada campanha cai sempre na
mesma carteira — "qualidade da campanha" e "velocidade do corretor" ficam
confundidas. Sem a trava, a ferramenta mandaria pausar a campanha do corretor
lento. É confundimento estrutural: mais dados não corrigem.

---

## 5. Onde cada coisa mora

| Camada | Arquivo | Responsabilidade |
|---|---|---|
| Segurança | `104_admin_de_verdade.sql` | `e_admin()`, `revoke` em `meta_ads_spend` |
| Coleta | `105_o_que_faltava_medir.sql` | clique de link, orçamento, lance, imóvel, meta de CPL |
| Ingestão | `meta-insights/entrega.ts` | campos por nível; orçamento já vem em unidade mínima |
| Fato | `107_inteligencia_de_marketing.sql` | junção gasto × lead × funil, faixa de confiança |
| Leitura | `src/inteligencia.ts` | vereditos em texto, link do gerenciador |
| Leitura | `src/achados.ts`, `src/inteligencia-por-anuncio.ts` | achados da conta; leitura por anúncio |
| Tela | `src/pages/Inteligencia.tsx` | desenho |
| Prévia | `src/pages/InteligenciaPrevia.tsx` | retrato de 23/08, só em desenvolvimento |
| Travas | `src/inteligencia.test.ts`, `src/inteligencia-sql.test.ts` | as regras, não os números; as travas do veredito no SQL |

A divisão fato/leitura é de propósito. Fato vem do banco, onde estão as junções
e a RLS. Leitura vem do TypeScript, porque é ela que muda de opinião quando
aprendemos algo — e mudar de opinião num arquivo TS custa um teste, enquanto
mudar dentro de uma função SQL custa uma migração.

### Três portas, e só a última fecha

1. o item do menu some para quem não é admin (`AppShell`)
2. a rota devolve "área restrita" (`Protegida papel="admin"`)
3. **a função recusa** (`e_admin` dentro de `mkt_inteligencia`)

As duas primeiras existem para ninguém ver uma porta que não abre. Guard de rota
mora no navegador, e navegador é território de quem está do outro lado.

---

## 6. O que ainda não medimos, e por quê

**Alcance e frequência.** `reach` é métrica não aditiva: somar 30 dias não dá o
alcance do mês, porque a mesma pessoa aparece em vários dias. A 017 deixou a
coluna de fora por escrito, e está certa. Só sai com tabela própria por janela
fechada — e a fadiga de criativo, que é a causa nº 1 de campanha boa virar ruim
em imobiliário, fica sem sensor até lá. O substituto calculável enquanto isso é
a inclinação de CPM e CTR de link por anúncio, 7 dias contra os 7 anteriores.

**Criativo como entidade.** O nível mais fino do sistema é o ANÚNCIO. O mesmo
vídeo em quatro conjuntos vira quatro linhas independentes, cada uma com volume
pequeno demais. Precisa de `creative_id` na borda `/ads`.

**Valor da proposta separado do valor da venda.** `deal_value_cents` é uma
coluna só, escrita pelas duas etapas, e a segunda sobrescreve a primeira.

**Data da venda confiável.** `stage_changed_at` é reescrito em qualquer
transição posterior: mover um lead já fechado muda o mês da venda. Enquanto não
houver `won_at` gravado uma vez só, não há CAC por coorte possível — e CAC por
janela, num ciclo de 60 a 120 dias, mede a razão entre duas coisas que não se
referem uma à outra.

Nenhuma dessas aparece estimada. Campo sem fonte fica em branco, e a tela diz no
rodapé o que não mede.

---

## 7. Decisões em aberto

**Na origem, o dono da imobiliária era `gerente`, não `admin`.** O pedido dizia "somente o ADMINISTRADOR", e
foi assim que ficou. Com os papéis como estão hoje, o dono da imobiliária não
alcança a tela. As duas saídas são dar o papel de admin a ele, ou trocar
`e_admin` por `is_admin_or_above` — a primeira mantém a separação, a segunda
abre a tela de verba para o cargo de operação.

**A meta de CPL não está declarada.** Enquanto não estiver, todo veredito é
`sem meta`. Uma forma de chegar nela: comissão média por venda × fatia que a
casa aceita gastar em mídia ÷ leads por venda.

**Campanha não conhece empreendimento.** A coluna `property_id` existe em
`meta_ad_dimensions` desde a 105 e o privilégio de escrita está concedido, mas
falta o seletor na tela. Sem ele não há CPL por lançamento nem a trava "não
sugerir pausar a única campanha ativa de um empreendimento".
