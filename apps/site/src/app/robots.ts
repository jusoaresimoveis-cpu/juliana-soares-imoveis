import type { MetadataRoute } from 'next';

import { SITE, SITE_INDEXAVEL } from '@/config/site';

export default function robots(): MetadataRoute.Robots {
  // Pré-visualização da Vercel não entra no Google (ver `SITE_INDEXAVEL`).
  if (!SITE_INDEXAVEL) {
    return { rules: { userAgent: '*', disallow: '/' } };
  }

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // `/w/` é o redirecionamento rastreado para o WhatsApp e `/versao` é
      // diagnóstico de deploy: nenhum dos dois é página.
      disallow: ['/w/', '/api/', '/versao'],
    },
    sitemap: `${SITE.url}/sitemap.xml`,
  };
}
