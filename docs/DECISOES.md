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
- **Os endereços definitivos antes do lançamento** (25/09): o site em
  `julianasoaresimoveis.com.br` e o CRM em `app.julianasoaresimoveis.com.br`.
  Sessão, app instalado e aviso no celular ficam guardados por endereço:
  mudar o CRM de endereço depois faria a Juliana entrar, instalar e ligar o
  aviso de novo. O site no domínio continua fora do Google até `SITE_NO_AR=sim`.
- **O CRM num subdomínio, não em `/app` do site** (decisão do usuário, 25/09).
  No mesmo endereço do site, os scripts de anúncio (pixel da Meta, tag do
  Google) rodariam onde o CRM guarda a sessão e conseguiriam lê-la. Separado, o
  CRM também não depende do deploy do site. É o mesmo arranjo do CRM de origem
  (`app.hvaimoveis.com.br`). Detalhes em `docs/DEPLOY.md`, "Os endereços".

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
- **Os botões do site já levam o `Ref.`** (decisão do usuário, 25/09): o do
  imóvel manda `(Ref. 1000-A)` com o link da página, e os outros ganham
  `(Ref. SITE-A)` no fim (`refDoSite`, em `packages/contracts/src/rastreio.ts`).
  Todo contato que vem do site vira lead, ligado ao imóvel quando há um,
  inclusive o proprietário que chama pelo "Cadastrar imóvel". O `A` é só
  porque a leitura do CRM de origem exige uma variante; o site não tem A/B/C.
- **Link rastreado (a fazer):** `/w/<código>` registra o clique (canal, imóvel,
  UTMs, `gclid`, `fbclid`) antes de abrir o WhatsApp com o mesmo `Ref.`. Até
  lá, o lead do site chega sem UTM nem `gclid`: dá para saber que veio do
  site, não de qual campanha.
- **OLX, ZAP e VivaReal:** integração oficial do Grupo OLX, com webhook de leads
  e feed XML. Exige plano de anunciante profissional e homologação do endpoint.
  Docs: https://developers.grupozap.com/webhooks/integration_leads.html
- **Marketplace orgânico:** não tem API. Código por imóvel mais link rastreado.
- **Feito em 25/09 (`organizations.whatsapp_numero_pessoal`, ligado no seed da
  Juliana):** com a marca, conversa sem lead e sem prova de origem não é
  gravada (nem conversa, nem mensagem, nem aviso), o conteúdo bruto sai da
  fila e grupo nunca entra. A origem guardava toda conversa na tela de
  Conversas, porque lá o número é da empresa; sem a marca, continua assim.
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

### Como o clone foi feito (24/09/2026, origem no commit 64a81ec)

- **Base consolidada** (`supabase/migrations/20260924000000_base.sql`): as 152
  migrations da origem aplicadas num banco vazio e extraídas com `pg_dump`, com
  as funções no texto original do autor. Conferida de três jeitos: o `pg_dump`
  dela é idêntico ao das 152 aplicadas; ela aplica num Postgres 17.6 (o major do
  Supabase); e os 188 testes de RLS passam contra ela. Só um bloco de dado da HV
  (reconciliação de três conversas de anúncio, migration 114) precisou sair
  para as migrations rodarem num banco vazio.
- **Sem landing pages no CRM.** A origem gera páginas de anúncio no próprio CRM
  (SPA). Aqui a página pública é o site; o gerador, as rotas públicas e o
  `api/lp.js` não vieram. As tabelas ficam no banco, vazias: arrancá-las
  mexeria em funções de atribuição que dependem delas.
- **Aluguel no imóvel** (`20260924000100_aluguel.sql`): `for_sale` e
  `for_rent` no lugar de uma finalidade só, `price_cents` é o preço de VENDA e
  `rent_cents` o aluguel MENSAL, mais `rental_guarantees` (lista fechada, em
  `packages/contracts/src/aluguel.ts`). `purpose` virou coluna calculada, porque
  a origem ainda a lê.
- **O site lê por uma função** (`site_imoveis`, em `20260924000200_site.sql`),
  e não pela tabela: só o publicado, sem dono, observação interna ou valor de
  regime desligado. Um gatilho por comando em `properties` e `property_media`
  chama `/api/revalidar` do site pelo `pg_net`, com endereço e segredo no Vault.
- **React 18 no CRM e 19 no site**, no mesmo monorepo: `resolve.dedupe` no Vite e
  `paths` no tsconfig do CRM (ver `apps/crm/README.md`).
- **O CRM abre no claro e no bronze** (decisão do usuário, 25/09), qualquer que
  seja o tema do aparelho. A origem seguia o aparelho; aqui o escuro vale só
  quando a pessoa escolhe no botão do topo, e a escolha fica no aparelho. A cor
  segue o perfil, como na origem.
- **Testes.** Os testes do CRM que liam o texto das migrations passaram a ler a
  base pelo módulo `supabase/testes/esquema.ts`; os que só conferiam histórico
  (a migration N existia, a N fez tal backfill) saíram. Nove testes de RLS já
  estavam desatualizados na origem (o job `rls` de lá está vermelho desde
  22/08) e foram corrigidos aqui.
- **Achado na origem:** as policies `documentos_read` e `documentos_write` do
  storage continuam valendo lá, porque a migration 021 quis trocá-las pelas
  versões por lead mas apagou pelo nome errado. Como policies permissivas se
  somam, qualquer corretor da organização lê e grava documento de lead que não
  é dele. Na origem o risco hoje é baixo (o app não usa o bucket `documentos`),
  mas a correção lá é um `drop policy` de cada. Aqui a base já nasce sem elas.

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
- [x] Galeria do imóvel (25/09): no computador, a capa à esquerda e duas
      colunas de 4 à direita numa altura só (o título aparece sem rolar);
      clicar abre a foto em destaque, com setas, teclado e arrastar. O CRM
      reduz cada foto para 2048 px em JPEG antes de subir (perto de 400 KB).
- [ ] Detalhe do imóvel no desenho do modelo: mapa, formulário de interesse,
      botões fixos de WhatsApp e visita, e as garantias do aluguel (o
      `site_imoveis` ainda não devolve `rental_guarantees`).
- [ ] Formulário de captação (Cadastrar Imóvel), depois do banco.
- [ ] **Painel do proprietário** (ideia do usuário, 25/09; para depois). O dono
      que entrega o imóvel para a Juliana administrar a locação acompanha, num
      painel só dele, o desempenho do SEU imóvel: visitas à página, cliques no
      WhatsApp, contatos, visitas agendadas.
      - **Feito em 25/09:** o cadastro do dono, na aba "Proprietário" do
        formulário do imóvel (nome completo, cidade onde mora, telefone), numa
        tabela própria (`property_owners`) achada pelo telefone, com
        `user_id` reservado para o login; e o contador de visitas à página de
        cada imóvel, que a ficha do CRM mostra ao lado dos leads. Falta o
        painel e o login do dono.
      - Acesso, como o usuário definiu: login é o telefone com DDD; a senha é
        fixa, sem troca, os 4 últimos dígitos do telefone seguidos do
        primeiro nome em minúsculas (ex.: `4111maria`). Ele vê só o imóvel
        dele.
      - A decidir quando for fazer: essa senha se adivinha sabendo o telefone
        e o nome do dono. Mostrando só números (sem nome nem telefone de quem
        procurou, que é dado pessoal pela LGPD), o risco fica pequeno. A
        alternativa com o mesmo trabalho para o dono é um código aleatório
        gerado pelo CRM e mandado pela Juliana.
      - Os números: as visitas à página já contam desde 25/09 (uma por
        aparelho, por imóvel e por dia, só na produção, robôs fora). Os
        cliques no WhatsApp vêm com o link rastreado `/w/`. Contatos e visitas
        agendadas já existem no CRM (leads e agenda ligados ao imóvel).
- [ ] Depoimentos do Google: pedir acesso à API do Perfil da Empresa.
- [ ] CEP exato do escritório (`config/site.ts`).
- [ ] Endereço no Perfil da Empresa: hoje está "sem local físico". Decidir se
      mostra a sala da Rua 143.
- [ ] Links do Facebook e do YouTube dela para o `sameAs` do schema.
- [x] Clone do CRM, schema base, aluguel no imóvel e o site lendo do banco
      (24/09). O código está pronto; falta subir (item abaixo).
- [x] Banco no ar (25/09): projeto `qwwsvyofjpoqpaniikke` (sa-east-1), as 5
      migrations aplicadas, as 14 edge functions publicadas, segredos das
      funções e do Vault gravados (valores em `.secrets/`, fora do Git).
      Criado com a exposição automática de tabelas DESLIGADA e a RLS automática
      ligada: tabela nova precisa de GRANT explícito, inclusive para o
      `service_role`.
- [x] Usuários e seed (25/09): a Juliana é GERENTE e a agência
      (gutobuyno@gmail.com) é ADMIN, como no CRM de origem. Cadastro público
      desligado no Auth: quem cria corretor é o CRM (`criar-corretor`).
- [x] Vercel (25/09): as variáveis do site e o projeto do CRM
      (`juliana-soares-crm`, variáveis em `.secrets/crm.env`).
- [x] Endereços definitivos (25/09): o site em `julianasoaresimoveis.com.br`
      (o `www` redireciona) e o CRM em `app.julianasoaresimoveis.com.br`, com
      os registros no Cloudflare, o `APP_ORIGIN` e o Site URL / Redirect URLs
      do Auth. Os `.vercel.app` redirecionam para o domínio. Ver
      `docs/DEPLOY.md`, "Os endereços".
- [ ] WhatsApp da Juliana: o mesmo servidor uazapi do Igor, instância nova
      (segredos gravados em 25/09). Falta ela conectar o número pelo CRM
      (Configurações → WhatsApp) e conferir que conversa pessoal não entra.
- [ ] Meta da Juliana: conectar a conta de anúncio no CRM (Anúncios).
- [ ] Link rastreado `/w/<código>` e captura completa de UTMs e click IDs. O
      `Ref.` já vai na mensagem desde 25/09; falta registrar o clique.
- [ ] Política de privacidade (LGPD), exigida antes de ligar Google Ads.
- [ ] Página "Sobre", com a bio que a Juliana escrever.
- [ ] **Lançamento:** `SITE_NO_AR=sim` nas variáveis de produção do site e o
      sitemap enviado no Search Console. O domínio já está no ar desde 25/09,
      fora do Google até lá. **Não apagar** o TXT `google-site-verification`.
