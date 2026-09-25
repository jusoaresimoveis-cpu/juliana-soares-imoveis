# Arquitetura

Documento vivo. Toda decisão que atravessa camadas é registrada aqui antes de
virar código.

---

## 1. Esquema de URL

```
https://{dominio-do-cliente}/{locale?}/imovel/{slug}?v={a|b|c}
```

| Parte | Onde vive | Por quê |
|---|---|---|
| domínio | tabela `tenant_domains` | resolve o cliente; o anúncio roda na marca dele, não em `*.supabase.co` |
| idioma | **path** | é o que o Google indexa e o que casa com `hreflang` |
| slug do imóvel | path | legível, com código curto estável ao final (`cobertura-vista-mar-a7k3`) |
| variante | **query** | dimensão descartável de tráfego pago; colapsa sob `canonical` e pode ser desligada sem quebrar link já compartilhado |

Renomear um imóvel **não** mata a URL que já está rodando em anúncio: o slug
antigo vai para `property_slug_history` e responde com redirecionamento
permanente.

A URL sem prefixo de idioma existe só como `x-default`: negocia o idioma,
responde com `no-store`, e **nenhum anúncio aponta para ela**.

### O que a URL do anúncio carrega

UTM continua existindo porque é o que humano lê no relatório. Mas a atribuição
real não depende dela — nome de campanha muda, ID não:

```
?utm_source=meta&utm_medium=cpc&utm_campaign=lancamento-moema
&sc_cid={{campaign.id}}&sc_asid={{adset.id}}&sc_aid={{ad.id}}&sc_plc={{placement}}
```

**`sc_aid` é a identidade do teste.** Um template = um anúncio. A tabela
`landing_page_variants` amarra `meta_ad_id → landing_page → template → variante`,
então mesmo que o `?v=` se perca no caminho, a variante é recuperável.

---

## 2. Cache de borda — regra sem exceção

A resposta HTML da landing page **nunca** emite `Set-Cookie` e **nunca** emite
`Vary`.

Motivo: `Set-Cookie` numa resposta cacheável leva a um de dois desastres — ou o
CDN recusa cachear (e cada clique pago paga uma invocação de função), ou ele
cacheia e todos os visitantes daquele ponto de presença recebem o **mesmo**
identificador de visitante, o que faz a contagem de sessões únicas virar lixo.

Idioma e variante entram na chave de cache **por construção**, porque estão na
URL. Nada de negociar por cabeçalho na rota quente.

```
Cache-Control: public, max-age=0, s-maxage=300, stale-while-revalidate=86400
```

A identidade nasce no primeiro sinal de comportamento: o endpoint de ingestão
responde `no-store` e é ele quem grava o cookie de primeira parte.

---

## 3. Camada de dados

Migrations em `supabase/migrations/`, aplicadas em ordem.

| # | Conteúdo | Estado |
|---|---|---|
| 001 | organização, perfis, papéis, helpers, etapas do funil, rede de RLS | ✅ aplicada |
| 002 | imóveis, mídia, slug e histórico de slug | ✅ aplicada |
| 003 | leads, atribuição (`ft_*` / `lt_*`), interesses, deduplicação por E.164 | ✅ aplicada |
| 004 | visitas: agenda, disponibilidade, bloqueios, confirmação e comparecimento | ✅ aplicada |
| 005 | notificações, preferências por papel, lembretes agendados (pg_cron) | ✅ aplicada |
| 006 | remove o horário de silêncio | ✅ aplicada |
| 007 | push: inscrição do aparelho, fila de envio, service worker | a fazer |
| 008 | domínios, landing pages, templates, variantes, traduções | a fazer |
| 009 | eventos de comportamento (particionado por mês) e rollup diário | a fazer |
| 010 | gasto de mídia por anúncio/dia e as filas de conversão de volta | a fazer |

As visitas subiram de 007 para 004, e as landing pages desceram na mesma
medida. Dois motivos, um técnico e um de produto.

O técnico: o funil já nascia em 001 com as etapas "Visita agendada" e "Visita
realizada", e a linha do tempo em 003 já aceitava a categoria `visita`. O
produto prometia a visita em três lugares e não havia nada que a registrasse —
arrastar o lead para a etapa não dizia ao corretor quando ele deveria estar no
imóvel.

O de produto: a decisão é do cliente. As landing pages dependem de conectar
contas de anúncio, e o CRM precisa estar inteiro antes de receber dado real.

### Princípios que valem para toda migration

- `organization_id` em toda tabela, RLS ligada, policies chamando as funções
  dentro de `(select ...)` — sem o wrap o Postgres reavalia por linha.
- Fila para toda integração externa: `status`, `attempts`, `error`, `sent_at`.
  Nada de disparar e torcer.
- Índice parcial e composto na ordem de filtro, não índice genérico por coluna.
- Tabela de evento é particionada **desde o dia 1**. Particionar depois exige
  reescrever a tabela.
- Nada de gatilho por linha em caminho de escrita quente.

---

## 4. Medição de comportamento

Duas camadas, de propósito:

**Evento cru** (`lp_events`, particionada por mês) — uma linha por evento, com
sessão, visitante, página, variante, idioma e propriedades. É o que responde
"quem rolou 75% e não clicou".

**Rollup diário** (`lp_daily`) — agregado por página, variante, idioma, dia,
origem e dispositivo. É o que alimenta o painel sem varrer a tabela crua.

O catálogo de eventos é fechado e vive em
[`packages/contracts/events.ts`](../packages/contracts/events.ts). O coletor da
página é inline, pequeno, com buffer, e envia por `sendBeacon` — nada de CDN
externo, porque a política de segurança da página não permite.

**Consentimento vem antes de qualquer escrita persistente.** Enquanto não houver
decisão do visitante, o coletor guarda em memória e não envia. Isso vale também
para os identificadores de clique de anúncio: sem consentimento de marketing, o
registro guarda apenas página, variante e idioma — que são dado de conteúdo, não
de publicidade.

---

## 5. Como o dinheiro encontra a venda

```
gasto (ad_id, dia)
  → variante  (landing_page_variants.meta_ad_id)
    → sessão  (lp_events.variant + session_id)
      → lead  (leads.ft_variant, ft_meta_ad_id)
        → visita realizada
          → venda (valor e comissão)
```

Tudo junta por **ID**, nunca por nome. Os dois sistemas de referência casam
gasto e lead comparando trechos de nome de campanha — quebra em silêncio no dia
em que alguém renomeia a campanha no gerenciador.

---

## 6. Ordem de construção

**Fase 1 — o CRM funcionando.** Imóveis, leads, funil, WhatsApp e agenda. Sem
landing page ainda. Critério de pronto: o corretor opera o dia inteiro aqui e não
volta para a planilha.

**Fase 2 — a página e a medição.** Gerador com os 3 templates, renderização no
servidor, domínio do cliente, multi-idioma e coleta de comportamento. Critério de
pronto: um anúncio aponta para a página, o lead chega no CRM com variante e
idioma carimbados.

**Fase 3 — o ciclo fechado.** Gasto por anúncio, painel de comparação com
tamanho de amostra, e conversão devolvida para Meta e Google.

**O que não fazer na fase 1:** painel administrativo, planos e assinatura,
automações, agente de IA, portal do cliente. Nada disso gera valor antes de o
básico rodar, e tudo isso já está mapeado nos sistemas de referência para quando
a hora chegar.

---

## 7. Origem de cada peça

O projeto herda de dois CRMs já em produção. A comparação completa está no plano
de fusão; o resumo:

| Vem do CRM médico | Vem do CRM imobiliário atual |
|---|---|
| camada de WhatsApp (contrato fixo, uma chamada por operação) | integração Meta (gasto por anúncio/dia, junção por ID) |
| Google Ads: OAuth, sync e conversão offline | distribuição de leads entre corretores |
| renderização no servidor com domínio próprio | imóveis e interesse do lead |
| encurtador com evento por clique | modelos jurídicos imobiliários |
| motor de automações e agente de tráfego | papel escopado por organização |
| disponibilidade de agenda calculada no banco | React Query como camada de dados |

**Construção nova:** medição de comportamento, identidade do visitante, motor de
A/B/C, Pixel e Conversions API da Meta, agregação no banco e multi-idioma.
