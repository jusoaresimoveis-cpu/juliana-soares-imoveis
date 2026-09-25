import { MapPin, MessageCircle, Phone } from 'lucide-react';
import Link from 'next/link';

import { MENU } from '@/config/navegacao';
import { SITE } from '@/config/site';
import { urlDaListagem } from '@/lib/imoveis/listagem';
import { linkDoWhatsApp } from '@/lib/whatsapp';

import { IconeInstagram } from './marca/IconeInstagram';
import { Marca } from './marca/Marca';

export function Rodape() {
  const { endereco } = SITE;

  return (
    <footer className="bg-grafite text-white/80">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 text-sm sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1fr] lg:px-8">
        <div className="space-y-4">
          <Marca tom="claro" />
          <p className="text-white/60">{SITE.creci}</p>
        </div>

        <nav aria-label="Links rápidos">
          <h2 className="mb-3 font-semibold text-white">Links rápidos</h2>
          <ul className="grid grid-cols-2 gap-x-6 gap-y-2">
            {MENU.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="hover:text-white">
                  {item.rotulo}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Nome, endereço e telefone iguais aos do Perfil da Empresa no Google. */}
        <div>
          <h2 className="mb-3 font-semibold text-white">Entre em contato</h2>
          <address className="space-y-2 not-italic">
            <a href={`tel:${SITE.telefone.e164}`} className="flex items-center gap-2 hover:text-white">
              <Phone aria-hidden className="size-4 text-caramelo" />
              {SITE.telefone.exibicao}
            </a>
            <a
              href={linkDoWhatsApp()}
              target="_blank"
              rel="noopener"
              className="flex items-center gap-2 hover:text-white"
            >
              <MessageCircle aria-hidden className="size-4 text-caramelo" />
              WhatsApp
            </a>
            <p className="flex gap-2">
              <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-caramelo" />
              <span>
                {endereco.logradouro} · {endereco.complemento}
                <br />
                {endereco.bairro}, {endereco.cidade} - {endereco.uf}
              </span>
            </p>
          </address>
        </div>

        <div>
          <h2 className="mb-3 font-semibold text-white">Siga nas redes</h2>
          <a
            href={SITE.redes.instagram}
            target="_blank"
            rel="me noopener"
            aria-label="Instagram da Juliana Soares"
            className="inline-flex size-10 items-center justify-center rounded-full border border-white/25 hover:border-white hover:text-white"
          >
            <IconeInstagram className="size-5" />
          </a>

          <h2 className="mt-6 mb-2 font-semibold text-white">Imóveis por cidade</h2>
          <ul className="space-y-1.5">
            {SITE.areaAtendida.map((cidade) => (
              <li key={cidade.slug}>
                <Link href={urlDaListagem({ finalidade: 'venda', cidade })} className="hover:text-white">
                  Comprar em {cidade.nome}
                </Link>
                {' · '}
                <Link href={urlDaListagem({ finalidade: 'aluguel', cidade })} className="hover:text-white">
                  Alugar
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* No celular, folga embaixo (da cor do rodapé) para a barra fixa não cobrir o fim da página. */}
      <div className="border-t border-white/10 pb-16 lg:pb-0">
        <p className="mx-auto max-w-7xl px-4 py-5 text-center text-xs text-white/50 lg:px-8">
          © {new Date().getFullYear()} {SITE.nome} · {SITE.creci}. Todos os direitos reservados.
        </p>
      </div>
    </footer>
  );
}
