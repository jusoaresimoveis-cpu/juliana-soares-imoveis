import { PROPERTY_STATUS_LABEL } from '@juliana/contracts';
import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';

import { BotaoWhatsApp } from '@/components/BotaoWhatsApp';
import { CartaoDeImovel } from '@/components/imoveis/CartaoDeImovel';
import { ContadorDeVisita } from '@/components/imoveis/ContadorDeVisita';
import { GaleriaDoImovel } from '@/components/imoveis/GaleriaDoImovel';
import { Caracteristicas } from '@/components/imoveis/Caracteristicas';
import { Preco } from '@/components/imoveis/Preco';
import { SobreOImovel } from '@/components/imoveis/SobreOImovel';
import { JsonLd } from '@/components/JsonLd';
import { Migalhas } from '@/components/Migalhas';
import { SITE } from '@/config/site';
import { reais } from '@/lib/formato';
import { buscarImovel, buscarPorSlugAntigo, carregarImoveisPublicados } from '@/lib/imoveis/dados';
import { bairrosDe, cidadeDoImovel, filtrarImoveis, urlDaListagem } from '@/lib/imoveis/listagem';
import { resumoDoImovel } from '@/lib/imoveis/texto';
import { STATUS_NA_VITRINE } from '@/lib/imoveis/tipos';
import { schemaDoImovel, type Migalha } from '@/lib/seo/schema';
import { mensagemDoImovel } from '@/lib/whatsapp';

export const revalidate = 3600;

export async function generateStaticParams() {
  const imoveis = await carregarImoveisPublicados();
  return imoveis.map((imovel) => ({ slug: imovel.slug }));
}

async function carregar(props: PageProps<'/imovel/[slug]'>) {
  const { slug } = await props.params;
  const imovel = await buscarImovel(slug);
  if (imovel) return imovel;
  // Nome público trocado no CRM: o endereço velho leva ao novo (308), em vez
  // de um 404 para quem clicou num anúncio ou num link de WhatsApp.
  const renomeado = await buscarPorSlugAntigo(slug);
  if (renomeado) permanentRedirect(`/imovel/${renomeado.slug}`);
  notFound();
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
    .slice(0, 4);

  const mensagem = mensagemDoImovel(imovel);

  return (
    <article className="mx-auto max-w-7xl space-y-6 px-4 py-6 lg:px-8 lg:py-10">
      <JsonLd dados={schemaDoImovel(imovel, `${SITE.url}/imovel/${imovel.slug}`)} />
      <Migalhas itens={migalhas} />

      {!naVitrine && (
        <p role="status" className="rounded-lg bg-areia p-4 text-sm">
          Este imóvel está {PROPERTY_STATUS_LABEL[imovel.status].toLowerCase()} e não está mais disponível.
          {parecidos.length > 0 && ' Veja abaixo opções parecidas.'}
        </p>
      )}

      <GaleriaDoImovel fotos={imovel.fotos} titulo={imovel.titulo} />
      <ContadorDeVisita codigo={imovel.codigo} />

      <header className="space-y-2">
        <h1 className="font-serif text-3xl leading-tight sm:text-4xl">{imovel.titulo}</h1>
        <p className="text-suave">{[imovel.bairro, imovel.cidade].filter(Boolean).join(', ')}</p>
        <Caracteristicas imovel={imovel} />
      </header>

      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <SobreOImovel imovel={imovel} />
        </div>

        {/* No celular, preço e botão vêm logo depois do título, antes da descrição:
            é o que decide se a pessoa chama ou vai embora. */}
        <aside className="order-first h-fit space-y-4 rounded-lg bg-white p-5 shadow-sm ring-1 ring-linha lg:sticky lg:top-20 lg:order-none">
          <Preco imovel={imovel} tamanho="grande" />
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
          <h2 className="font-serif text-2xl">Parecidos{cidade ? ` em ${cidade.nome}` : ''}</h2>
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
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
