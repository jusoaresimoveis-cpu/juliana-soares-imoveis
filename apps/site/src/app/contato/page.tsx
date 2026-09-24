import { MapPin, Phone } from 'lucide-react';
import type { Metadata } from 'next';

import { BotaoWhatsApp } from '@/components/BotaoWhatsApp';
import { IconeInstagram } from '@/components/marca/IconeInstagram';
import { Migalhas } from '@/components/Migalhas';
import { SITE } from '@/config/site';

export const metadata: Metadata = {
  title: 'Contato',
  description: `Fale com a corretora ${SITE.nomeCurto} (${SITE.creci}) pelo WhatsApp ${SITE.telefone.exibicao}. Escritório no Centro de Itapema - SC.`,
  alternates: { canonical: '/contato' },
};

export default function Page() {
  const { endereco } = SITE;
  const enderecoCompleto = `${endereco.logradouro}, ${endereco.complemento} - ${endereco.bairro}, ${endereco.cidade} - ${endereco.uf}`;

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8 lg:py-12">
      <Migalhas itens={[{ nome: 'Contato', caminho: '/contato' }]} />

      <header className="space-y-3">
        <h1 className="font-serif text-3xl leading-tight sm:text-4xl">Fale com a Juliana</h1>
        <p className="text-lg text-suave">
          O jeito mais rápido é o WhatsApp. Atendimento em {SITE.areaAtendida.map((c) => c.nome).join(' e ')}.
        </p>
      </header>

      <BotaoWhatsApp mensagem="Olá, Juliana! Vim pelo site." className="w-full sm:w-auto" />

      {/* Nome, endereço e telefone iguais aos do Perfil da Empresa no Google. */}
      <address className="space-y-5 rounded-lg bg-white p-6 not-italic ring-1 ring-linha">
        <p className="font-serif text-xl">{SITE.nome}</p>
        <p className="text-sm text-suave">{SITE.creci}</p>

        <a href={`tel:${SITE.telefone.e164}`} className="flex items-center gap-3 hover:text-bronze">
          <Phone aria-hidden className="size-5 text-caramelo" />
          {SITE.telefone.exibicao}
        </a>

        <div className="flex gap-3">
          <MapPin aria-hidden className="mt-0.5 size-5 shrink-0 text-caramelo" />
          <div>
            <p>{enderecoCompleto}</p>
            {/* Link para o Google Maps, e não o mapa embutido: o mapa pesa mais que a página inteira. */}
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(enderecoCompleto)}`}
              target="_blank"
              rel="noopener"
              className="mt-1 inline-block text-sm text-bronze hover:underline"
            >
              Ver no mapa
            </a>
          </div>
        </div>

        <a href={SITE.redes.instagram} target="_blank" rel="me noopener" className="flex items-center gap-3 hover:text-bronze">
          <IconeInstagram className="size-5 text-caramelo" />
          Instagram
        </a>
      </address>
    </div>
  );
}
