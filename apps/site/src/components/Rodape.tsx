import Link from 'next/link';

import { SITE } from '@/config/site';
import { urlDaListagem } from '@/lib/imoveis/listagem';

export function Rodape() {
  const { endereco } = SITE;

  return (
    <footer className="mt-16 border-t border-linha bg-white">
      {/* Folga embaixo para o botão flutuante do WhatsApp não cobrir o rodapé. */}
      <div className="mx-auto grid max-w-6xl gap-8 px-4 pb-24 pt-10 text-sm sm:grid-cols-3">
        {/* Nome, endereço e telefone iguais aos do Perfil da Empresa no Google. */}
        <address className="not-italic">
          <p className="font-semibold text-marca">{SITE.nome}</p>
          <p className="text-suave">{SITE.creci}</p>
          <p className="mt-3">
            {endereco.logradouro} · {endereco.complemento}
            <br />
            {endereco.bairro} · {endereco.cidade} - {endereco.uf}
          </p>
          <p className="mt-3">
            <a href={`tel:${SITE.telefone.e164}`} className="hover:text-marca">
              {SITE.telefone.exibicao}
            </a>
          </p>
        </address>

        <nav aria-label="Imóveis por cidade">
          <p className="font-semibold">Imóveis por cidade</p>
          <ul className="mt-3 space-y-2">
            {SITE.areaAtendida.flatMap((cidade) =>
              (['aluguel', 'venda'] as const).map((finalidade) => (
                <li key={`${finalidade}-${cidade.slug}`}>
                  <Link href={urlDaListagem({ finalidade, cidade })} className="hover:text-marca">
                    {finalidade === 'aluguel' ? 'Alugar' : 'Comprar'} em {cidade.nome}
                  </Link>
                </li>
              )),
            )}
          </ul>
        </nav>

        <div>
          <p className="font-semibold">Siga a Juliana</p>
          <ul className="mt-3 space-y-2">
            <li>
              <a href={SITE.redes.instagram} rel="me noopener" target="_blank" className="hover:text-marca">
                Instagram
              </a>
            </li>
            <li>
              <Link href="/anuncie" className="hover:text-marca">
                Quero anunciar meu imóvel
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
