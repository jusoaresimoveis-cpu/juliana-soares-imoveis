# Decisões

Cada decisão com o motivo. Quando uma mudar, risque e escreva a nova embaixo
com a data. Não apague: o motivo antigo explica código que ainda pode existir.

## Escopo (24/09/2026)

- **Venda e aluguel ANUAL.** Temporada está fora. O valor `temporada` continua
  aceito no banco só porque vem do CRM de origem.
- **Só a Juliana.** Ela atua junto à imobiliária SSI, mas o site e o CRM são
  dela: nada integra com a SSI. Depois do fechamento, ela resolve por fora.
- **Ela também faz gestão de locação**, não só intermediação (confirmado em
  24/09). O site pode oferecer "gestão e intermediação de aluguel". Se o CRM vai
  ter módulo de administração (contratos, cobrança, repasse ao proprietário) é
  escopo a definir na fase do CRM.
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
- **Só a produção lançada indexa**: `VERCEL_ENV === 'production'` E
  `SITE_NO_AR=sim`. Pré-visualização da Vercel tem URL pública, e até o
  lançamento a produção vive num `.vercel.app`: indexada, competiria com o
  domínio oficial.
- **Nome, endereço e telefone** iguais aos do Perfil da Empresa no Google. Existe
  uma "Juliana Imóveis" na mesma cidade, sem relação com ela; o nome completo e o
  CRECI em todo lugar são o que separa as duas.
- **Nada inventado no site:** imóvel, depoimento, número de anos de experiência,
  promessa de serviço. Texto de marketing só com o que a Juliana confirmou.

## Deploy (24/09/2026)

- **Plano gratuito na Vercel e no Supabase por enquanto** (decisão do usuário,
  24/09). Os riscos estão em `docs/DEPLOY.md`: o Hobby é não comercial pelos
  termos da Vercel, e o Supabase gratuito não tem backup.
- **Commits com a identidade da conta dona** (`jusoaresimoveis-cpu`, e-mail
  noreply do GitHub), igual ao CRM do Igor. O Hobby bloqueia o deploy de commit
  de colaborador em repositório privado.
- **Publicar pelo GitHub Actions com token NÃO contorna isso.** Foi testado: a
  CLI envia o autor do commit e a Vercel bloqueia igual. O Actions ficou só
  com os testes (`verificar.yml`), e quem publica é a integração Git da Vercel.

## Briefing do site (24/09/2026)

Referência em `docs/referencia/`. O visual segue o modelo. O que mudou em
relação ao briefing, já combinado:

- **Nenhum imóvel fictício publicado.** O lançamento é com os imóveis reais que
  a Juliana tem autorização para anunciar (material em `conteudo/imoveis`).
  Anúncio de imóvel inexistente é infração no CRECI, propaganda enganosa e
  motivo de reprovação no Google Ads.
- **Nenhum depoimento inventado.** Os depoimentos vêm das avaliações reais do
  Google (nota 5,0). Para puxar TODAS é preciso a API do Perfil da Empresa
  (acesso sob aprovação do Google). A API do Places devolve só 5. Sem marcação
  de estrelas no schema: o Google não mostra estrela de avaliação que a própria
  empresa publica sobre si.
- **Regiões: só Itapema e Porto Belo** (o modelo mostrava também Balneário
  Camboriú e Bombinhas).
- **A área administrativa é o CRM.** Cadastro de imóvel, leads, dashboard,
  aprovação da captação e depoimentos: tudo no CRM. O site só lê.
- **Supabase (PostgreSQL), sem Prisma.** O Prisma brigaria com as migrations e
  o RLS do CRM.
- **Captação (proprietário cadastra o imóvel):**
  - consentimento LGPD;
  - arquivos em bucket privado;
  - documentos só depois da visita, não no formulário;
  - vídeo com limite e envio direto ao Storage;
  - anti-spam (Cloudflare Turnstile).
  - O envio vira lead de captação no CRM, com notificação para a Juliana.
- **Performance acima de 90 no celular:**
  - um único GTM, carregado depois da interação;
  - mapa que só carrega ao tocar;
  - foto do hero otimizada;
  - favoritos no próprio aparelho, sem login.
- **CRECI real** (53396-F) no lugar do "00000" do modelo.

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

- [ ] Logo (o usuário vai criar) e fotos profissionais da Juliana, em
      `conteudo/marca` e `conteudo/fotos-juliana`.
- [ ] Imóveis iniciais reais em `conteudo/imoveis`.
- [x] Visual do modelo (24/09):
  - Playfair Display nos títulos e Inter no texto; paleta creme, grafite e bronze;
  - cabeçalho, menu e barra inferior no celular;
  - todas as seções da home, com busca e faixa de preço;
  - favoritos no aparelho;
  - páginas Cadastrar Imóvel, Sobre, Contato e Favoritos.
  - Lighthouse no celular: desempenho 92 a 97, acessibilidade 100, boas práticas 100.
- [x] Fotos do topo (24/09): fundo da sala com vista para o mar e a Juliana
      recortada. A página /sobre usa a mesma foto.
  - Home no celular: desempenho de 90 a 92 no Lighthouse local; desktop: 99.
  - O que segurou a nota:
    - fundo com `preload`;
    - foto da Juliana sem prioridade alta;
    - fonte dos títulos só no peso 400;
    - sem desfoque provisório no fundo e sem backdrop-blur no cabeçalho.
  - Cuidado ao medir localmente: no Windows, o Chrome headless limita a
    produção de quadros (VSync) e atrasa a primeira pintura da home em uns
    2 s. Não é o site. Para medir aqui, usar
    `--chrome-flags="--headless=new --disable-gpu-vsync --disable-frame-rate-limit"`,
    ou medir o site publicado no PageSpeed Insights.
- [x] Fundo do topo panorâmico e recorte novo do cabelo da Juliana (24/09).
  - O fundo usa direção de arte (`<picture>` com `getImageProps`), com um
    corte por tela, cada um na proporção da caixa em que aparece: panorâmica
    no desktop, corte largo da janela no tablet (640-1023px) e corte quase
    quadrado no celular. Cada tela baixa só um: 28 KB no celular, 68 KB no
    desktop.
  - Sombra preta só atrás do texto, com leve desfoque, sumindo até o meio
    (desktop). No celular, o texto sobe por cima da parte de baixo da foto, e
    a foto escurece até o preto só ali. A Juliana e o mar ficam com a cor
    real.
  - Lighthouse: celular 90 a 92, desktop 99.
- [x] Retrato da seção Sobre (24/09): a Juliana sentada no sofá, na home
      (quadrado no desktop, sem corte) e na página /sobre.
- [ ] Fotos que ainda faltam (`config/midia.ts`):
  - o fundo de "Regiões atendidas";
  - o fundo da chamada de captação;
  - a assinatura dela (elemento do modelo, ao lado da foto do topo).
- [ ] Listagem: filtros de quartos e banheiros, e ordenação.
- [ ] Detalhe do imóvel no desenho do modelo: galeria grande, mapa, formulário
      de interesse, botões fixos de WhatsApp e visita.
- [ ] Formulário de captação (Cadastrar Imóvel), depois do banco.
- [ ] Depoimentos do Google: pedir acesso à API do Perfil da Empresa.
- [ ] CEP exato do escritório (`config/site.ts`).
- [ ] Endereço no Perfil da Empresa: hoje está "sem local físico". Decidir se
      mostra a sala da Rua 143.
- [ ] Links do Facebook e do YouTube dela para o `sameAs` do schema.
- [ ] Clone do CRM, schema base e ligação do site ao Supabase.
- [ ] Link rastreado `/w/<código>` e captura completa de UTMs e click IDs.
- [ ] Política de privacidade (LGPD), exigida antes de ligar Google Ads.
- [ ] Página "Sobre", com a bio que a Juliana escrever.
- [ ] **Lançamento:** domínio na Vercel, registros no Cloudflare e
      `SITE_NO_AR=sim` nas variáveis de produção. **Não apagar** o TXT
      `google-site-verification`.
