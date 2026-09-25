import type { NextConfig } from 'next';

/**
 * Só as fotos de imóvel do Supabase da Juliana passam pelo otimizador de
 * imagem. Liberar `*.supabase.co` deixaria qualquer projeto do mundo gastar a
 * cota de otimização do site.
 */
function fotosDoBanco(): NonNullable<NextConfig['images']>['remotePatterns'] {
  const url = process.env.SUPABASE_URL;
  if (!url) return [];
  const { hostname } = new URL(url);
  return [{ protocol: 'https', hostname, pathname: '/storage/v1/object/public/property-media/**' }];
}

const nextConfig: NextConfig = {
  // O pacote de contratos é TypeScript puro dentro do monorepo, sem build
  // próprio: quem compila é o Next.
  transpilePackages: ['@juliana/contracts'],

  poweredByHeader: false,

  // Gravado no build para o `/versao`: é o jeito de conferir qual commit está
  // no ar sem abrir o painel da Vercel (que fica na conta da Juliana).
  env: {
    COMMIT_DO_BUILD: (process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? 'local').slice(0, 7),
    AMBIENTE_DO_BUILD: process.env.VERCEL_ENV ?? 'local',
  },

  async redirects() {
    return [
      // Nome antigo da página de captação, antes do menu do modelo.
      { source: '/anuncie', destination: '/cadastrar-imovel', permanent: true },
    ];
  },

  images: {
    // AVIF primeiro: foto de imóvel é o que mais pesa na página, e no 4G do
    // celular é ela que decide se a página abre rápido ou não.
    formats: ['image/avif', 'image/webp'],
    remotePatterns: fotosDoBanco(),
  },
};

export default nextConfig;
