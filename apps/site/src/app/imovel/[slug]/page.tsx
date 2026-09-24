import { PROPERTY_STATUS_LABEL, rotuloDaComodidade } from '@juliana/contracts';
import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';

import { BotaoWhatsApp } from '@/components/BotaoWhatsApp';
import { CartaoDeImovel } from '@/components/imoveis/CartaoDeImovel';
import { Caracteristicas } from '@/components/imoveis/Caracteristicas';
import { Preco } from '@/components/imoveis/Preco';
import { JsonLd } from '@/components/JsonLd';
import { Migalhas } from '@/components/Migalhas';
import { SITE } from '@/config/site';
import { reais } from '@/lib/formato';
import { buscarImovel, carregarImoveisPublicados } from '@/lib/imoveis/dados';
import { bairrosDe, cidadeDoImovel, filtrarImoveis, urlDaListagem } from '@/lib/imoveis/listagem';
import { resumoDoImovel } from '@/lib/imoveis/texto';
import { STATUS_NA_VITRINE } from '@/lib/imoveis/tipos';
import { schemaDoImovel, type Migalha } from '@/lib/seo/schema';

export const revalidate = 3600;

export async function generateStaticParams() {
  const imoveis = await carregarImoveisPublicados();
  return imoveis.map((imovel) => ({ slug: imovel.slug }));
}

async function carregar(props: PageProps<'/imovel/[slug]'>) {
  const { slug } = await props.params;
  const imovel = await buscarImovel(slug);
  if (!imovel) notFound();
  return imovel;
}

export async function generateMetadata(props: PageProps<'/imovel/[slug]'>): Promise<Metadata> {
  const imovel = await carregar(props);
  const url = `/imovel/${imovel.slug}`;
  const description = resumoDoImovel(imovel);
  const capa = imovel.fotos[0];

  return {
    title: imovel.titulo,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: imovel.titulo,
      description,
      url,
      images: capa ? [{ url: capa.url, width: capa.largura, height: capa.altura, alt: capa.alt }] : undefined,
    },
    ...(STATUS_NA_VITRINE.includes(imovel.status) ? {} : { robots: { index: false, follow: true } }),
  };
}

export default async function Page(props: PageProps<'/imovel/[slug]'>) {
  const imovel = await carregar(props);
  const todos = await carregarImoveisPublicados();

  const naVitrine = STATUS_NA_VITRINE.includes(imovel.status);
  const finalidade = imovel.finalidades[0] ?? 'aluguel';
  const cidade = cidadeDoImovel(imovel);
  const bairro = cidade && imovel.bairro
    ? bairrosDe(todos).find((b) => b.cidade.slug === cidade.slug && b.nome === imovel.bairro?.trim()) ?? null
    : null;

  const migalhas: Migalha[] = [
    { nome: finalidade === 'aluguel' ? 'Aluguel' : 'Venda', caminho: urlDaListagem({ finalidade }) },
  ];
  if (cidade) migalhas.push({ nome: cidade.nome, caminho: urlDaListagem({ finalidade, cidade }) });
  if (cidade && bairro) {
    migalhas.push({ nome: bairro.nome, caminho: urlDaListagem({ finalidade, cidade, bairro: bairro.slug }) });
  }
  migalhas.push({ nome: `Cód. ${imovel.codigo}`, caminho: `/imovel/${imovel.slug}` });

  const parecidos = filtrarImoveis(todos, { finalidade, tipo: null, cidade, bairro: null })
    .filter((outro) => outro.codigo !== imovel.codigo)
    .slice(0, 3);

  const [capa, ...demaisFotos] = imovel.fotos;
  const mensagem = `Olá, Juliana! Tenho interesse no imóvel cód. ${imovel.codigo}: ${SITE.url}/imovel/${imovel.slug}`;

  return (
    <article className="mx-auto max-w-6xl space-y-6 px-4 py-6">
      <JsonLd dados={schemaDoImovel(imovel, `${SITE.url}/imovel/${imovel.slug}`)} />
      <Migalhas itens={migalhas} />

      {!naVitrine && (
        <p role="status" className="rounded-lg bg-destaque/10 p-4 text-sm">
          Este imóvel está {PROPERTY_STATUS_LABEL[imovel.status].toLowerCase()} e não está mais disponível.
          {parecidos.length > 0 && ' Veja abaixo opções parecidas.'}
        </p>
      )}

      <div className="space-y-2">
        <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-linha sm:aspect-[16/9]">
          {capa ? (
            <Image src={capa.url} alt={capa.alt} fill priority sizes="(min-width: 1152px) 1152px, 100vw" className="object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-suave">Sem foto</div>
          )}
        </div>
        {demaisFotos.length > 0 && (
          <ul className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4">
            {demaisFotos.map((foto) => (
              <li key={foto.url} className="relative aspect-[4/3] w-48 shrink-0 snap-start overflow-hidden rounded-lg sm:w-64">
                <Image src={foto.url} alt={foto.alt} fill sizes="256px" className="object-cover" />
              </li>
            ))}
          </ul>
        )}
      </div>

      <header className="space-y-2">
        <h1 className="text-2xl font-semibold leading-tight sm:text-3xl">{imovel.titulo}</h1>
        <p className="text-suave">{[imovel.bairro, imovel.cidade].filter(Boolean).join(', ')}</p>
        <Caracteristicas imovel={imovel} />
      </header>

      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          {imovel.descricao && (
            <section className="space-y-2">
              <h2 className="text-lg font-semibold">Sobre o imóvel</h2>
              <p className="whitespace-pre-line leading-relaxed">{imovel.descricao}</p>
            </section>
          )}

          {imovel.comodidades.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-lg font-semibold">Comodidades</h2>
              <ul className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                {imovel.comodidades.map((comodidade) => (
                  <li key={comodidade}>{rotuloDaComodidade(comodidade)}</li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* No celular, preço e botão vêm logo depois do título, antes da descrição:
            é o que decide se a pessoa chama ou vai embora. */}
        <aside className="order-first h-fit space-y-4 rounded-xl border border-linha bg-white p-5 lg:sticky lg:top-20 lg:order-none">
          <Preco imovel={imovel} />
          <dl className="space-y-1 text-sm text-suave">
            {imovel.condominioCents ? (
              <div className="flex justify-between">
                <dt>Condomínio</dt>
                <dd>{reais(imovel.condominioCents)}/mês</dd>
              </div>
            ) : null}
            {imovel.iptuAnualCents ? (
              <div className="flex justify-between">
                <dt>IPTU</dt>
                <dd>{reais(imovel.iptuAnualCents)}/ano</dd>
              </div>
            ) : null}
            <div className="flex justify-between">
              <dt>Código</dt>
              <dd>{imovel.codigo}</dd>
            </div>
          </dl>
          {naVitrine && <BotaoWhatsApp mensagem={mensagem} rotulo="Quero saber mais" />}
          <p className="text-xs text-suave">
            {SITE.nome} · {SITE.creci}
          </p>
        </aside>
      </div>

      {parecidos.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Parecidos{cidade ? ` em ${cidade.nome}` : ''}</h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {parecidos.map((outro) => (
              <li key={outro.codigo}>
                <CartaoDeImovel imovel={outro} finalidade={finalidade} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
