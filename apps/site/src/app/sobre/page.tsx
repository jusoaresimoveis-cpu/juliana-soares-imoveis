import type { Metadata } from 'next';

import { BotaoWhatsApp } from '@/components/BotaoWhatsApp';
import { DIFERENCIAIS, RetratoDaJuliana } from '@/components/home/SobreJuliana';
import { Migalhas } from '@/components/Migalhas';
import { MIDIA } from '@/config/midia';
import { SITE } from '@/config/site';

export const metadata: Metadata = {
  title: 'Sobre Juliana Soares, corretora de imóveis em Itapema',
  description: `Conheça a corretora ${SITE.nomeCurto} (${SITE.creci}): compra, venda e locação de imóveis em Itapema e Porto Belo com atendimento direto.`,
  alternates: { canonical: '/sobre' },
};

/*
 * A bio da Juliana ainda não chegou. Até lá a página diz só o que foi
 * confirmado: posicionamento e diferenciais do briefing, CRECI e cidades.
 * História, anos de mercado e números entram quando ela escrever.
 */
export default function Page() {
  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 lg:px-8 lg:py-12">
      <Migalhas itens={[{ nome: 'Sobre Juliana', caminho: '/sobre' }]} />

      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,26rem)_1fr] lg:gap-16">
        {/* Sem retrato próprio, vale a foto do topo da home: aqui não há outra foto dela na página. */}
        <RetratoDaJuliana foto={MIDIA.julianaRetrato ?? MIDIA.julianaHero} className="aspect-[4/5] w-full" preload />

        <div className="space-y-6">
          <p className="text-xs font-semibold tracking-[0.3em] text-bronze uppercase">Sobre Juliana</p>
          <h1 className="font-serif text-3xl leading-tight sm:text-4xl">
            Mais do que vender imóveis, meu objetivo é ajudar pessoas a encontrarem o lugar certo para viver ou
            investir.
          </h1>
          <p className="text-lg text-suave">
            Sou a Juliana Soares, corretora de imóveis ({SITE.creci}). Atendo compra, venda e locação em{' '}
            {SITE.areaAtendida.map((cidade) => cidade.nome).join(' e ')}, sempre com atendimento direto comigo, do
            primeiro contato ao fechamento.
          </p>

          <ul className="grid gap-4 sm:grid-cols-2">
            {DIFERENCIAIS.map(({ Icone, texto }) => (
              <li key={texto} className="flex items-center gap-3 rounded-lg bg-white p-4 ring-1 ring-linha">
                <Icone aria-hidden className="size-6 shrink-0 text-caramelo" strokeWidth={1.5} />
                <span>{texto}</span>
              </li>
            ))}
          </ul>

          <BotaoWhatsApp mensagem="Olá, Juliana! Vim pelo site." rotulo="Falar com a Juliana" className="w-full sm:w-auto" />
        </div>
      </div>
    </div>
  );
}
