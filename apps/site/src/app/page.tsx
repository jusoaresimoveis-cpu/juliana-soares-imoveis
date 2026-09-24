import { BuscaDeImoveis } from '@/components/home/BuscaDeImoveis';
import { ChamadaCaptacao } from '@/components/home/ChamadaCaptacao';
import { Depoimentos } from '@/components/home/Depoimentos';
import { Destaques } from '@/components/home/Destaques';
import { Hero } from '@/components/home/Hero';
import { Regioes } from '@/components/home/Regioes';
import { Servicos } from '@/components/home/Servicos';
import { SobreJuliana } from '@/components/home/SobreJuliana';
import { opcoesDaBusca } from '@/lib/imoveis/busca';
import { carregarImoveisPublicados } from '@/lib/imoveis/dados';

export const revalidate = 3600;

/** A home do modelo, na mesma ordem de seções. */
export default async function Home() {
  const imoveis = await carregarImoveisPublicados();

  return (
    <>
      <Hero />
      <BuscaDeImoveis opcoes={opcoesDaBusca(imoveis)} />
      <Destaques imoveis={imoveis} />
      <SobreJuliana />
      <Servicos />
      <Regioes />
      <Depoimentos />
      <ChamadaCaptacao />
    </>
  );
}
