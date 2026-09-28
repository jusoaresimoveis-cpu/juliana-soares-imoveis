import type { MetadataRoute } from 'next';

import { SITE, SITE_INDEXAVEL } from '@/config/site';

export default function robots(): MetadataRoute.Robots {
  // Pré-visualização da Vercel não entra no Google (ver `SITE_INDEXAVEL`). A
  // política de privacidade fica aberta: a Meta confere o endereço dela para
  // publicar o app do CRM e os formulários de anúncio. Ela continua com
  // `noindex`, como o resto do site, então não aparece em busca.
  if (!SITE_INDEXAVEL) {
    return { rules: { userAgent: '*', allow: '/politica-de-privacidade', disallow: '/' } };
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
