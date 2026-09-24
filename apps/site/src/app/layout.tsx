import type { Metadata, Viewport } from 'next';
import { Geist } from 'next/font/google';

import { BotaoWhatsApp } from '@/components/BotaoWhatsApp';
import { Cabecalho } from '@/components/Cabecalho';
import { JsonLd } from '@/components/JsonLd';
import { Rodape } from '@/components/Rodape';
import { SITE, SITE_INDEXAVEL } from '@/config/site';
import { schemaDaCorretora } from '@/lib/seo/schema';

import './globals.css';

// Fonte provisória até a identidade visual chegar. `next/font` serve o arquivo
// do próprio domínio: sem ida ao Google Fonts, sem atraso no primeiro texto.
const texto = Geist({
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
  themeColor: '#1f3a5f',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="pt-BR" className={`${texto.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <JsonLd dados={schemaDaCorretora()} />
        <Cabecalho />
        <main className="flex-1">{children}</main>
        <Rodape />
        <BotaoWhatsApp flutuante rotulo="WhatsApp" mensagem="Olá, Juliana! Vim pelo site." />
      </body>
    </html>
  );
}
