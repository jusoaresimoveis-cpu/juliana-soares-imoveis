import type { Metadata, Viewport } from 'next';
import { Inter, Playfair_Display } from 'next/font/google';

import { BarraInferior } from '@/components/BarraInferior';
import { Cabecalho } from '@/components/Cabecalho';
import { JsonLd } from '@/components/JsonLd';
import { Rodape } from '@/components/Rodape';
import { SITE, SITE_INDEXAVEL } from '@/config/site';
import { schemaDaCorretora } from '@/lib/seo/schema';

import './globals.css';

// `next/font` serve as fontes do próprio domínio, só com os caracteres latinos:
// sem ida ao Google Fonts e sem o texto piscando com a fonte trocada.
const titulo = Playfair_Display({
  variable: '--font-titulo',
  subsets: ['latin'],
  // Só o peso normal: é o único que os títulos usam. A versão variável traz
  // todos os pesos e pesava o dobro, disputando banda com a foto do topo no 4G.
  weight: '400',
  display: 'swap',
});

const texto = Inter({
  variable: '--font-texto',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: `${SITE.nome} | Aluguel e venda em Itapema e Porto Belo`,
    template: `%s | ${SITE.nomeCurto} Imóveis`,
  },
  description: SITE.descricao,
  applicationName: SITE.nome,
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: SITE.nome,
  },
  robots: SITE_INDEXAVEL ? { index: true, follow: true } : { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#f8f5f0',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="pt-BR" className={`${titulo.variable} ${texto.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <JsonLd dados={schemaDaCorretora()} />
        <Cabecalho />
        <main className="flex-1">{children}</main>
        <Rodape />
        <BarraInferior />
      </body>
    </html>
  );
}
