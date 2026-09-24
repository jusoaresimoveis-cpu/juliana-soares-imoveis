import { ClipboardCheck, House, MessageCircle, Search } from 'lucide-react';
import type { Metadata } from 'next';

import { BotaoWhatsApp } from '@/components/BotaoWhatsApp';
import { Migalhas } from '@/components/Migalhas';
import { SITE } from '@/config/site';

export const metadata: Metadata = {
  title: 'Cadastre seu imóvel para vender ou alugar',
  description: `Quer vender ou alugar seu imóvel em Itapema ou Porto Belo? Cadastre com a corretora ${SITE.nomeCurto}, ${SITE.creci}.`,
  alternates: { canonical: '/cadastrar-imovel' },
};

/** O caminho do briefing: nada é publicado sem a Juliana ver o imóvel antes. */
const ETAPAS = [
  { Icone: MessageCircle, texto: 'Você manda os dados e as fotos do imóvel.' },
  { Icone: Search, texto: 'A Juliana analisa e agenda uma visita.' },
  { Icone: ClipboardCheck, texto: 'Ela avalia o imóvel com você.' },
  { Icone: House, texto: 'Aprovado, o imóvel é anunciado.' },
] as const;

/*
 * PROVISÓRIO: o formulário de cadastro (dados do proprietário, do imóvel e
 * fotos, com consentimento LGPD e anti-spam) entra quando o banco estiver no ar.
 * Até lá, o contato é pelo WhatsApp.
 */
export default function Page() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8 lg:py-12">
      <Migalhas itens={[{ nome: 'Cadastrar imóvel', caminho: '/cadastrar-imovel' }]} />

      <header className="space-y-3">
        <p className="text-xs font-semibold tracking-[0.3em] text-bronze uppercase">Para proprietários</p>
        <h1 className="font-serif text-3xl leading-tight sm:text-4xl">Quer vender ou alugar seu imóvel?</h1>
        <p className="text-lg text-suave">
          Conte com minha experiência para avaliar, divulgar e encontrar o melhor negócio para você.
        </p>
      </header>

      <section aria-labelledby="titulo-como" className="rounded-lg bg-white p-6 ring-1 ring-linha">
        <h2 id="titulo-como" className="font-serif text-2xl">
          Como funciona
        </h2>
        <ol className="mt-5 space-y-4">
          {ETAPAS.map(({ Icone, texto }, indice) => (
            <li key={texto} className="flex items-center gap-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-creme text-caramelo">
                <Icone aria-hidden className="size-5" strokeWidth={1.5} />
              </span>
              <span>
                <span className="sr-only">Etapa {indice + 1}: </span>
                {texto}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <div className="space-y-3">
        <p>Mande uma mensagem contando onde fica o imóvel e se você quer vender ou alugar.</p>
        <BotaoWhatsApp mensagem="Olá, Juliana! Quero cadastrar meu imóvel." rotulo="Cadastrar pelo WhatsApp" className="w-full sm:w-auto" />
      </div>
    </div>
  );
}
