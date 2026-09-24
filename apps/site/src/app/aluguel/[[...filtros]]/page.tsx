import { PaginaDeListagem } from '@/components/listagem/PaginaDeListagem';
import { metadataDaListagem, parametrosDaListagem } from '@/lib/imoveis/resolver-listagem';

// Rede de segurança. A atualização de verdade vem do CRM, que pede a
// revalidação na hora em que a Juliana salva um imóvel.
export const revalidate = 3600;

export function generateStaticParams() {
  return parametrosDaListagem('aluguel');
}

export async function generateMetadata(props: PageProps<'/aluguel/[[...filtros]]'>) {
  const { filtros } = await props.params;
  return metadataDaListagem('aluguel', filtros);
}

export default async function Page(props: PageProps<'/aluguel/[[...filtros]]'>) {
  const { filtros } = await props.params;
  return <PaginaDeListagem finalidade="aluguel" segmentos={filtros} />;
}
