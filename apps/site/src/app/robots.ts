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
      // `/w/` é o redirecionamento rastreado para o WhatsApp: não é página.
      disallow: ['/w/', '/api/'],
    },
    sitemap: `${SITE.url}/sitemap.xml`,
  };
}
