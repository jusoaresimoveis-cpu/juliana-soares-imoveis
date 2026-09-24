import type { NextConfig } from 'next';

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

  images: {
    // AVIF primeiro: foto de imóvel é o que mais pesa na página, e no 4G do
    // celular é ela que decide se a página abre rápido ou não.
    formats: ['image/avif', 'image/webp'],
    // As fotos vão morar no Storage do Supabase. O host exato entra aqui
    // quando o projeto da Juliana estiver criado — qualquer outro host fica
    // bloqueado, de propósito.
    remotePatterns: [],
  },
};

export default nextConfig;
