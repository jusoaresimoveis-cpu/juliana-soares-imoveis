import type { Metadata } from 'next';

import { BotaoWhatsApp } from '@/components/BotaoWhatsApp';
import { Migalhas } from '@/components/Migalhas';
import { SITE } from '@/config/site';

export const metadata: Metadata = {
  title: 'Anuncie seu imóvel em Itapema e Porto Belo',
  description: `Quer alugar ou vender seu imóvel em Itapema ou Porto Belo? Fale com a corretora ${SITE.nomeCurto}, ${SITE.creci}.`,
  alternates: { canonical: '/anuncie' },
};

/*
 * Captação: o proprietário que quer alugar ou vender. Texto enxuto de propósito
 * até a Juliana contar como trabalha (avaliação, fotos, contrato, garantias).
 * Promessa que ela não fez não entra na página dela.
 */
export default function Page() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <Migalhas itens={[{ nome: 'Anuncie seu imóvel', caminho: '/anuncie' }]} />
      <h1 className="text-2xl font-semibold leading-tight sm:text-3xl">
        Quer alugar ou vender seu imóvel em Itapema ou Porto Belo?
      </h1>
      <p className="leading-relaxed">
        Mande uma mensagem para a {SITE.nomeCurto} contando onde fica o imóvel e se você quer alugar ou
        vender. Ela responde pelo WhatsApp.
      </p>
      <BotaoWhatsApp mensagem="Olá, Juliana! Quero anunciar meu imóvel." rotulo="Quero anunciar meu imóvel" />
    </div>
  );
}
