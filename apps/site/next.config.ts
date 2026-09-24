import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // O pacote de contratos é TypeScript puro dentro do monorepo, sem build
  // próprio: quem compila é o Next.
  transpilePackages: ['@juliana/contracts'],

  poweredByHeader: false,

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
