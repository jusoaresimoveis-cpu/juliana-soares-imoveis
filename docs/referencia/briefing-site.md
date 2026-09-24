# Briefing do site (recebido em 24/09/2026)

Referência visual: [modelo-site.webp](modelo-site.webp) (desktop à esquerda,
celular à direita). Texto do briefing como veio, resumido por seção. A análise
e o que muda estão em `docs/DECISOES.md`.

## Projeto e marca

- Site responsivo, mobile-first, focado em **marca pessoal**. Não pode parecer
  imobiliária: todo contato vai para a Juliana.
- Nome: Juliana Soares. Subtítulo: Corretora de Imóveis.
- Posicionamento: "Atendimento personalizado para compra, venda e locação de imóveis."
- Transmitir confiança, sofisticação, proximidade, credibilidade e atendimento humano.
- Seguir fielmente o layout de referência: moderno, elegante, minimalista, voltado para conversão.

## Menu

- Desktop: Home, Comprar, Alugar, Cadastrar Imóvel, Sobre Juliana, Contato,
  mais o botão destacado "Falar no WhatsApp".
- Mobile: menu hambúrguer e barra inferior fixa (Home, Buscar, Favoritos, WhatsApp).

## Home

1. **Hero**
   - Título: "Encontre o imóvel ideal com atendimento direto e personalizado."
   - Subtítulo: "Compra, venda e locação de imóveis com acompanhamento completo do início ao fechamento."
   - Botões: Ver imóveis à venda, Ver imóveis para alugar, Falar no WhatsApp.
   - Foto profissional grande da Juliana; a assinatura dela como elemento visual.
2. **Busca**: Comprar/Alugar, cidade, bairro, faixa de preço e o botão Buscar.
3. **Imóveis em destaque**: 4 por linha no desktop, 2 no tablet, 1 no celular.
   - Cada card: foto, etiqueta de venda/aluguel, valor, cidade, bairro, quartos,
     banheiros, vagas, área, botão "Ver detalhes" e favoritar.
4. **Sobre Juliana**: foto e o título "Mais do que vender imóveis, meu objetivo é
   ajudar pessoas a encontrarem o lugar certo para viver ou investir."
   - Diferenciais: atendimento personalizado, acompanhamento documental, suporte
     na negociação, conhecimento do mercado local.
   - Botão: "Saiba mais sobre mim".
5. **Serviços**
   - Compra: auxílio para encontrar o imóvel ideal.
   - Venda: estratégias para venda rápida.
   - Locação: intermediação de aluguel.
6. **Regiões atendidas**: Itapema, Porto Belo, Balneário Camboriú e Bombinhas.
   Clicar numa região filtra os imóveis.
7. **Depoimentos**: carrossel com nome, cidade, avaliação e comentário,
   cadastrados pelo painel.
8. **Captação**
   - Título: "Quer vender ou alugar seu imóvel?"
   - Texto: "Conte com minha experiência para avaliar, divulgar e encontrar o melhor negócio para você."
   - Botão "Cadastrar meu imóvel", que leva à página de cadastro.

## Cadastro de imóvel pelo proprietário

**Fluxo:** o proprietário envia → fica pendente → a Juliana é notificada → agenda
visita → avalia → aprova ou rejeita → só depois de aprovado pode ser publicado.

**Campos:**
- Proprietário: nome, telefone, WhatsApp, e-mail.
- Imóvel: tipo, venda ou locação, cidade, bairro, endereço, área, quartos,
  banheiros, vagas, valor desejado, descrição.
- Uploads: fotos, vídeos e documentos, com limite configurável e preview.

## Área administrativa

Login só da Juliana.

- **Dashboard:** total de imóveis, ativos, pendentes, vendidos, alugados e leads.
- **Imóveis:** criar, editar, excluir, aprovar e desativar. Status: rascunho,
  pendente, publicado, vendido, alugado, arquivado.
- **Leads:** todo formulário é registrado, com nome, telefone, e-mail, imóvel
  de interesse e data.
- **Proprietários:** aprovar, rejeitar e adicionar observações.

## Listagem

- Filtros: compra ou locação, cidade, bairro, faixa de preço, quartos e banheiros.
- Ordenação: menor preço, maior preço, mais recentes.

## Detalhe do imóvel

- Galeria grande.
- Informações: valor, cidade, bairro, área, quartos, banheiros e vagas.
- Seções: descrição, características, localização, imóveis semelhantes e
  formulário de interesse.
- Botões fixos: WhatsApp e Solicitar visita.

## Integrações, SEO e performance

- Integrações: WhatsApp, Google Maps, Google Analytics, Meta Pixel e Google Tag Manager.
- SEO: URLs amigáveis, meta title e description, Open Graph, schema de imóveis
  e sitemap automático.
- Performance: Lighthouse acima de 90, lazy loading, imagens otimizadas em WebP
  e responsividade completa.

## Tecnologia sugerida

Next.js, TypeScript, Tailwind, PostgreSQL e Prisma.

## Observações do briefing

- Imóveis fictícios até existir o cadastro real.
- As fotos definitivas da Juliana e dos imóveis entram depois.
- Tudo preparado para gerenciar pelo painel.
- O formulário "Cadastrar Imóvel" é das funcionalidades mais importantes.
