import Link from 'next/link';

import { schemaDasMigalhas, type Migalha } from '@/lib/seo/schema';

import { JsonLd } from './JsonLd';

/**
 * "Início › Aluguel › Itapema" — na tela e para o Google, que mostra esse
 * caminho no resultado da busca no lugar da URL crua.
 */
export function Migalhas({ itens }: { itens: readonly Migalha[] }) {
  const caminho: Migalha[] = [{ nome: 'Início', caminho: '/' }, ...itens];

  return (
    <nav aria-label="Você está em" className="text-sm text-suave">
      <ol className="flex flex-wrap items-center gap-1">
        {caminho.map((migalha, indice) => {
          const ultima = indice === caminho.length - 1;
          return (
            <li key={migalha.caminho} className="flex items-center gap-1">
              {ultima ? (
                <span aria-current="page" className="text-tinta">
                  {migalha.nome}
                </span>
              ) : (
                <>
                  <Link href={migalha.caminho} className="hover:text-marca">
                    {migalha.nome}
                  </Link>
                  <span aria-hidden="true">›</span>
                </>
              )}
            </li>
          );
        })}
      </ol>
      <JsonLd dados={schemaDasMigalhas(caminho)} />
    </nav>
  );
}
