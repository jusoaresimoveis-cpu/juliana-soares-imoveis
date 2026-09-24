# Decisões

Cada decisão com o motivo. Quando uma mudar, risque e escreva a nova embaixo
com a data. Não apague: o motivo antigo explica código que ainda pode existir.

## Escopo (24/09/2026)

- **Venda e aluguel ANUAL.** Temporada está fora. O valor `temporada` continua
  aceito no banco só porque vem do CRM de origem.
- **Só a Juliana.** Ela atua junto à imobiliária SSI, mas o site e o CRM são
  dela: nada integra com a SSI. Depois do fechamento, ela resolve por fora.
- **Cidades:** Itapema e Porto Belo, iguais à área de atendimento do Perfil da
  Empresa no Google.

## Arquitetura

- **Monorepo com npm workspaces.** Site e CRM dividem banco e vocabulário
  (`packages/contracts`). Em repositórios separados, os dois já teriam
  divergido no nome de um tipo de imóvel antes do fim do primeiro mês.
- **O site é um app separado do CRM (Next.js), no mesmo Supabase.** O CRM de
  origem é uma SPA: as páginas públicas dele são montadas no navegador, e o
  servidor só injeta o preview do link. Isso serve para landing page de anúncio,
  mas não para SEO orgânico. O site precisa de HTML completo na primeira
  resposta.
- **Cache: modelo clássico (ISR), sem Cache Components.** No Next 16, com Cache
  Components, uma página ainda não gerada é servida primeiro como "casca" e o
  conteúdo chega por streaming. O modelo clássico entrega o HTML completo já na
  primeira visita, que é o que o robô do Google e o preview do WhatsApp leem. A
  atualização vem por revalidação sob demanda: o CRM pede a revalidação quando a
  Juliana salva um imóvel, e `revalidate = 3600` fica só como rede de segurança.
- **Uma consulta, filtro em memória.** Todos os imóveis publicados vêm numa
  consulta só; listagens, bairros e sitemap saem dela. Uma corretora autônoma
  tem centenas de imóveis, não milhões.

## SEO

- **URLs:** `/{aluguel|venda}/{tipo}/{cidade}/{bairro}`, por exemplo
  `/aluguel/apartamentos/itapema/meia-praia`. `imoveis` no lugar do tipo quer
  dizer "qualquer tipo". Cada combinação é uma página que ranqueia sozinha para
  a frase que a pessoa digita. **URL é contrato:** depois de indexada, mudar
  exige 301.
- **Uma URL por conteúdo.** `/aluguel/imoveis` redireciona (308) para
  `/aluguel`; bairro com acento ou maiúscula redireciona para o slug.
- **Bairros vêm dos imóveis, não de lista fixa.** Lista à mão gera página de
  bairro vazia (conteúdo raso pesa contra o site todo) e fixa nome que ninguém
  conferiu.
- **Listagem vazia:** continua acessível, com `noindex`, e fica fora do sitemap.
- **Imóvel alugado ou vendido:** a página continua no ar, com aviso, `noindex`
  e os parecidos. O link pode estar num grupo de WhatsApp; um 404 ali é lead
  perdido.
- **Só produção indexa** (`VERCEL_ENV === 'production'`). Pré-visualização da
  Vercel tem URL pública e competiria com o site de verdade.
- **Nome, endereço e telefone** iguais aos do Perfil da Empresa no Google. Existe
  uma "Juliana Imóveis" na mesma cidade, sem relação com ela; o nome completo e o
  CRECI em todo lugar são o que separa as duas.
- **Nada inventado no site:** imóvel, depoimento, número de anos de experiência,
  promessa de serviço. Texto de marketing só com o que a Juliana confirmou.

## Leads e WhatsApp

- **O número dela é pessoal E profissional.** Só vira lead automático a
  mensagem que tem **prova** de origem:
  - anúncio de clique para WhatsApp da Meta (o ID do anúncio vem na mensagem);
  - código de rastreio (`Ref.`) de link rastreado: site, Google Ads,
    Marketplace, placa com QR code.
- **Sem prova, não entra.** Cliente orgânico (indicação, Instagram, cliente
  antigo) ela cadastra à mão; dali em diante, as mensagens daquele número entram
  sozinhas.
- **Link rastreado (a fazer):** `/w/<código>` registra o clique (canal, imóvel,
  UTMs, `gclid`, `fbclid`) e abre o WhatsApp com a mensagem já carimbada com o
  `Ref.`. Enquanto não existir, o botão do site é `wa.me` direto, e esses
  contatos **não** entram no CRM sozinhos.
- **OLX, ZAP e VivaReal:** integração oficial do Grupo OLX, com webhook de leads
  e feed XML. Exige plano de anunciante profissional e homologação do endpoint.
  Docs: https://developers.grupozap.com/webhooks/integration_leads.html
- **Marketplace orgânico:** não tem API. Código por imóvel mais link rastreado.
- **Limite da uazapi:** a Meta não aceita eventos de conversão de conversa
  (clique para WhatsApp) sem a conta oficial do WhatsApp Business (WABA). Leads
  que passam pelo site continuam podendo voltar para a Meta como evento do site.

## Clone do CRM

- **Origem:** `SelectusConnect2.0/crm` (cliente HV Imobiliária). Aquele repo é
  só leitura para este projeto.
- **As 142 migrations não são reaproveitadas como estão:** elas semeiam dados
  da HV (organização, domínio, pixel, CRECI, imóvel específico) e apagam leads
  de teste por ID. O clone começa de **um schema base consolidado, sem dados**.
- **Repo novo, sem histórico.** Trocar tudo o que é da HV: nome, domínio, pixel,
  verificação do Facebook, marca "Selectus", mercados internacionais.
- **Dado de cliente não entra em migration.** Seeds ficam separados, para que
  este código possa servir de base a outro cliente sem limpeza.

## Pendências

- [ ] Identidade visual: logo, cores, fonte, foto profissional (tokens em
      `globals.css`).
- [ ] CEP exato do escritório (`config/site.ts`).
- [ ] Endereço no Perfil da Empresa: hoje está "sem local físico". Decidir se
      mostra a sala da Rua 143.
- [ ] Links do Facebook e do YouTube dela para o `sameAs` do schema.
- [ ] Clone do CRM, schema base e ligação do site ao Supabase.
- [ ] Link rastreado `/w/<código>` e captura completa de UTMs e click IDs.
- [ ] Política de privacidade (LGPD), exigida antes de ligar Google Ads.
- [ ] Página "Sobre", com a bio que a Juliana escrever.
- [ ] Domínio na Vercel (Pro) e registros no Cloudflare. **Não apagar** o TXT
      `google-site-verification`.
