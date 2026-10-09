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
  Google (nota 5,0). Sem marcação de estrelas no schema: o Google não mostra
  estrela de avaliação que a própria empresa publica sobre si.
- **Depoimentos pelo widget da Trustindex** (decisão do usuário, 25/09). A API
  do Perfil da Empresa, que traria todas as avaliações para o nosso banco, foi
  recusada na checagem automática do Google no mesmo dia (conta dona do perfil,
  60 dias de verificado e site no perfil são os critérios). A API do Places
  devolve só 5, exige cobrança e proíbe guardar.
  - O código do widget fica em `config/site.ts` (`widgetDeAvaliacoes`).
  - O script deles só é baixado quando a seção chega perto da tela.
  - O título "Depoimentos" só aparece quando o widget tem altura: widget vazio
    ou fora do ar não deixa um título solto.
  - Limites do plano grátis deles: layout "profissional" funciona só 7 dias e
    depois some do site; avaliação nova entra quando alguém atualiza no painel.
  - O script é de terceiro (cdn.trustindex.io): entra na política de
    privacidade.
- **Regiões: só Itapema e Porto Belo** (o modelo mostrava também Balneário
  Camboriú e Bombinhas).
- **Topo da home com o quê e onde** (26/09). O título do briefing ("Encontre o
  imóvel ideal com atendimento direto e personalizado.") não dizia cidade nem
  serviço, e o H1 é o texto da página que mais pesa para o Google depois do
  título da aba.
  - Linha de cima: "Corretora de imóveis · CRECI/SC 53396-F".
  - H1: "Imóveis à venda e para alugar em Itapema e Porto Belo", com as
    palavras de quem busca, como os títulos de /venda e /aluguel.
  - Subtítulo: "Compra, venda e aluguel anual com atendimento direto e
    personalizado, do primeiro contato ao fechamento." O jeito de atender
    desceu do título para cá.
  - "Aluguel anual" e não "locação": em Itapema, quem busca aluguel quase
    sempre quer temporada, e "locação" é palavra do mercado, não de quem busca.
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

## Marca (26/09/2026)

- **O símbolo é o do arquivo do logo:** o "JS" sob o telhado, marrom
  `#72573a` (original em `conteudo/marca`). O nome e o subtítulo continuam em
  texto, na Playfair Display e na Inter do site: decisão do usuário.
- **Um arquivo gera tudo.** `ferramentas/marca/simbolo.svg` tem o desenho com
  a caixa justa; `node ferramentas/marca/gerar.mjs` escreve os favicons e os
  ícones do site e do CRM. O cabeçalho do site desenha o mesmo símbolo no HTML
  (`Simbolo.tsx`), e um teste confere que os traços não se separam.
- **Site:**
  - cabeçalho: símbolo marrom;
  - rodapé escuro: caramelo, porque o marrom some no grafite;
  - favicon: o símbolo solto; o SVG vira caramelo com o navegador no escuro
    (o .ico não consegue e fica marrom);
  - ícone do iPhone: o símbolo marrom sobre o creme.
- **CRM:** o quadrado bronze de antes, com o símbolo em creme no lugar das
  letras. É o favicon (a aba do CRM se distingue da do site), o ícone do topo
  e da entrada e o do app instalado. O ícone maskable é calculado para caber
  no círculo que o Android garante não cortar.
- **Ícone já instalado não troca sozinho no iPhone:** o CRM na tela de início
  fica com o ícone antigo até ser removido e adicionado de novo. No Android e
  no computador, o Chrome troca quando confere o manifesto outra vez.
- **Marca d'água nas fotos** (26/09). As fotos são muitas vezes exclusivas, e
  a marca impede outro anunciante de usá-las como suas.
  - É o símbolo, branco a 50%, no meio da foto, com 35% do lado menor e uma
    sombra leve para aparecer sobre parede e cortina brancas. Os valores saíram
    de teste com fotos reais dos imóveis.
  - É desenhada NA foto, no navegador, antes de subir (`lib/marcaDagua.ts`).
    Por cima da foto na tela não protegeria: bastaria abrir o endereço da
    imagem para ter a foto limpa.
  - É regra da imobiliária (`organizations.marca_dagua_nas_fotos`), ligada por
    padrão. A chave fica na aba de fotos do imóvel, e só admin e gerente mudam.
  - Foto nova sobe com a marca, e o original fica só no aparelho de quem tirou
    a foto. Vídeo sobe sem marca.
  - Foto que já estava no CRM: com a chave ligada, a aba de fotos oferece "Pôr
    a marca nelas". Cada foto é baixada, ganha a marca e sobe num arquivo NOVO
    (o site e o navegador guardam a foto antiga por um ano no mesmo endereço).
    O arquivo sem marca fica no Storage e em `original_sem_marca`, e
    "Desfazer" volta a foto para ele. `marca_dagua` impede a marca dupla.
  - Enquanto o original fica guardado para desfazer, ele continua acessível
    pelo endereço antigo. Primeiro teste no imóvel 1004 (26/09), com cópia das
    fotos em `conteudo/backup-fotos`.
- **Ordem das fotos: segurar e arrastar** (06/10), no lugar das setinhas que
  andavam uma casa por clique. Mouse, dedo (segurar um instante; deslizar só
  rola) e teclado (espaço, setas, espaço), com `@dnd-kit`.
  - A lista do CRM é a ordem do site, e **a primeira foto é a capa**. Antes a
    capa era uma marca à parte, e a foto marcada abria o site mesmo estando no
    meio da lista do CRM. A estrela agora leva a foto para o primeiro lugar.
  - Cada soltura grava a lista inteira numa chamada (`ordenar_midia`): nada de
    meia ordem se a rede cair, duas arrastadas não chegam trocadas, e o site é
    avisado uma vez, não uma por foto. Apagar a capa passa a capa para a
    primeira foto que sobrou.
- **"Sobre o imóvel"** (08/10): aba do cadastro com itens prontos para marcar
  em três categorias (a unidade, com o nome do tipo, "Apartamento" ou "Casa";
  o empreendimento; a área de lazer), um campo para digitar o que faltar em
  cada uma, e "Informações adicionais", só texto. O site mostra na seção
  "Sobre o imóvel", logo abaixo da descrição, e manda os itens ao Google como
  `amenityFeature`.
  - A lista (`ITENS_DO_IMOVEL`, packages/contracts) saiu da pesquisa do usuário
    em portais, sem sinônimos repetidos nem enchimento, e sem repetir o que o
    cadastro já tem em campo próprio (quartos, suítes, banheiros, vagas, área).
    Os subgrupos só organizam os quadradinhos do CRM.
  - Guardado em `properties.features` (jsonb por categoria). A coluna antiga
    `amenities`, sem categoria, estava vazia em todos os imóveis e saiu do site.
    Tirar um id da lista exige migration que troque o id nos imóveis.
  - Bairro, cidade e UF foram para a aba "Dados": a aba "Localização" tinha só
    os três campos.
- **Empreendimento com unidades** (08/10). Caso que trouxe: New York Residence
  (90 apartamentos, 10 disponíveis na tabela de outubro, mesmas fotos e mesmo
  lazer). Três desenhos foram comparados por dois juízes (produto e
  engenharia); venceu o de unidades como linhas embaixo do imóvel.
  - O empreendimento é UM imóvel: uma página, uma galeria, um código público,
    os mesmos leads e a mesma campanha da Meta. As unidades (`property_units`)
    e as plantas (`property_floorplans`) ficam embaixo dele. Unidade não tem
    página nem código: ela é uma linha da página, com WhatsApp próprio e o link
    `?unidade=804`. Dez páginas quase iguais disputariam entre si no Google.
  - O "a partir de" é o menor preço entre as unidades DISPONÍVEIS, calculado
    pelo banco (gatilho); ninguém digita. A situação do imóvel também vem
    delas, menos "suspenso", que é decisão de quem cadastra.
  - A tabela da construtora sai todo 1º dia útil do mês, com o CUB/SC. Até a
    Juliana aplicar a do mês corrente, o site mostra "Consulte" no lugar dos
    preços (decisão do usuário): o banco zera os preços na leitura do site, e
    um agendamento avisa o site às 00h01 do dia 1. A tabela aplicada é sempre a
    do mês corrente, e só o que a Juliana mudou vai para o banco (o que mudou
    em outro aparelho não é desfeito).
  - Construtora só no CRM: no site, nunca (o cliente compraria direto com
    ela). No site saem a entrega (só o ano), a situação da obra e o registro de
    incorporação com o cartório, que a Lei 4.591/64 (art. 32, § 3º) exige nos
    anúncios. O nome do empreendimento no título é escolha da Juliana: ele
    também leva o cliente ao site da construtora.
  - Salas comerciais do mesmo prédio são outro cadastro: juntas, o "a partir
    de" dos apartamentos cairia para o preço da sala mais barata, e elas
    sumiriam da busca por salas.
  - Render é imagem ilustrativa: a foto marcada (`is_illustrative`) sai com o
    aviso no site.
  - Para depois: colar a tabela da imagem, unidade de interesse no lead, planta
    baixa por tipologia, entrada calculada por unidade.

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
- **O canal no código** (decisão do usuário, 05/10): o lead tem que dizer de
  onde veio, e o Google tem que aparecer medido no CRM. O canal viaja no
  segmento do meio do `Ref.` (`Ref. 1004-GO-A`), que na origem era o país da
  página de anúncio e aqui sobrava.
  - Canais (`CANAIS`, em `rastreio.ts`): `go` Google orgânico (busca e Perfil
    da Empresa), `ga` Google Ads, `ma` anúncio da Meta, `bi` link da bio,
    `ig` Instagram, `fb` Facebook, `mk` Marketplace. O banco traduz com
    `origem_do_canal` (migration 20261005000000), e um teste confere as duas
    listas. As origens ganharam `google` e `marketplace`.
  - Sem canal, a origem é o **site** (`landing_page`, rótulo "Site"), e não mais
    `whatsapp`, que é o caminho de todos e não diz de onde a pessoa veio.
  - No site, `OrigemDaVisita` anota no navegador o PRIMEIRO canal reconhecido
    (`gclid`, UTMs, página anterior), por 90 dias, e põe o canal no código na
    hora do clique no WhatsApp. Chegada direta não anota nem apaga nada.
  - Fora do site, `/w/<canal>` e `/w/<canal>/<imóvel>` abrem o WhatsApp com a
    mensagem pronta e o canal no código ("Vim pelo Google"). Canal que não
    existe abre como site, sem página de erro.
  - Lead que já existia não muda de origem: vale o primeiro contato.
  - Ainda não se registra o CLIQUE: o painel conta lead por canal, não clique.
- **OLX, ZAP e VivaReal:** integração oficial do Grupo OLX, com webhook de leads
  e feed XML. Exige plano de anunciante profissional e homologação do endpoint.
  Docs: https://developers.grupozap.com/webhooks/integration_leads.html
- **Marketplace orgânico:** não tem API. Código por imóvel mais link com canal
  (`/w/marketplace/<imóvel>`). O contato pelo Messenger do Marketplace não
  entra no CRM.
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
- **Quartos e suítes** (decisão do usuário, 25/09): no cadastro, "Quartos" são
  os que NÃO são suíte, então 2 quartos e 1 suíte são 3 dormitórios. O site
  mostra os dois lado a lado, do mesmo tamanho, na página e nos cartões. O
  total (título padrão e `numberOfBedrooms` para o Google) é a soma. No CRM o
  campo se chama "Quartos (sem as suítes)". O `bedrooms` do CRM de origem
  contava tudo.
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
- **Achado na origem (25/09):** trocar o nome público de um imóvel já
  cadastrado não salva. O gatilho `tg_property_slug` guarda o endereço antigo
  em `property_slug_history` com o papel de quem salvou, e a tabela só tem
  policy de leitura ("new row violates row-level security policy"). Aqui a
  migration `20260925000200` faz o gatilho rodar como dono da função; na
  origem, a correção é a mesma linha. Uma varredura dos outros gatilhos não
  achou outro com esse defeito.

## Pendências

- [x] Símbolo do logo (26/09): no cabeçalho, no rodapé, nos favicons e nos
      ícones do CRM (ver "Marca").
- [ ] Fotos profissionais da Juliana, em `conteudo/fotos-juliana`.
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
- [x] Depoimentos no site pelo widget da Trustindex (25/09). Em 26/09 o widget
      novo (carrossel) já veio com as avaliações: nota 5,0 e 26 avaliações no
      topo, 9 no carrossel. Falta conferir no painel deles que o layout é do
      plano grátis, ou o widget some depois de 7 dias (aí a seção se esconde
      sozinha, sem deixar buraco).
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
- [x] Meta da Juliana: conectada ao CRM e testada em 28/09. Um lead da
      ferramenta de testes, no formulário "LEAD" da página, chegou pelo webhook
      com a assinatura válida, e o CRM leu os 8 campos em 7 segundos.
  - Lead de formulário que chega sem anúncio (link da bio, Marketplace, Google)
    SEMPRE vira lead, como Instagram ou Facebook orgânico conforme a
    plataforma (decisão do usuário, 28/09). Só o lead da ferramenta de testes,
    marcado com "<test lead: dummy data…>", fica de fora
    (`_shared/lead-de-teste.ts`). Antes, `is_organic` descartava os dois. A
    `meta-trabalhador` com a regra nova foi publicada em 28/09.
  - O app "Imobilead" (320165242350871), de um sistema antigo, continua
    assinado na página e falha em toda entrega.
  - App "CRM Juliana Soares" (1646372130498346), tipo Empresa, no portfólio
    "Juliana Soares". Existe um segundo app com o mesmo nome (1578242086635759),
    que não é usado.
  - Usuário do sistema "CRM Juliana", token sem validade com ads_read,
    leads_retrieval, pages_show_list, pages_read_engagement,
    pages_manage_metadata e pages_manage_ads.
  - Webhook Página → leadgen verificado (o evento de teste do painel chegou com
    a assinatura válida), e a página Juliana Soares Corretora assinada.
  - Em desenvolvimento, a Meta só entrega os eventos de teste do painel. Lead de
    verdade só chega com o app publicado, e publicar exige a política de
    privacidade, o ícone e a categoria. Publicado em 28/09, sem verificação da
    empresa: o app é dela e só lê os ativos dela, e o acesso padrão basta.
  - O token de verificação do webhook é só o segredo do fim do endereço, e não o
    endereço inteiro, como a tela do CRM dizia. Desde 28/09 ela mostra os dois
    separados, cada um com o nome do campo da Meta.
- [x] Canal do lead (05/10): `/w/<canal>`, o canal da chegada anotado no
      site e lido pelo banco (ver "O canal no código"). Falta registrar o
      clique, para ter a taxa de clique para lead por canal.
- [ ] Pôr os links com canal nos lugares: Perfil da Empresa no Google, bio do
      Instagram e descrição dos anúncios do Marketplace.
- [x] Política de privacidade (28/09): `/politica-de-privacidade`, com link no
      rodapé. Escrita a partir do que o site e o CRM fazem de verdade (sem
      cookie nem pixel, favoritos e controle de visita no navegador, Trustindex,
      WhatsApp só com prova de origem, conversões para a Meta em hash).
  - A seção `#exclusao` tem as instruções de exclusão de dados. No app da Meta,
    o campo aponta para a página sem o `#`, que a Meta recusa.
  - O `robots.txt` do pré-lançamento libera só essa página, para a Meta ler.
  - A Juliana precisa ler e aprovar o texto. Contato de privacidade: o WhatsApp
    e o e-mail central (`SITE.email`).
- [ ] Página "Sobre", com a bio que a Juliana escrever.
- [x] **Lançamento (09/10):** `SITE_NO_AR=sim` nas variáveis de produção do
      site e o sitemap enviado no Search Console. O domínio estava no ar desde
      25/09, fora do Google até aqui. **Não apagar** o TXT
      `google-site-verification`.
  - A propriedade é de Domínio: o sitemap vai com a URL completa
    (`https://julianasoaresimoveis.com.br/sitemap.xml`). Só `sitemap.xml` dá
    "Endereço do sitemap inválido".
