import { textoDasCaracteristicas } from '@/lib/imoveis/texto';
import type { Imovel } from '@/lib/imoveis/tipos';

/** "72 m² · 2 quartos · 1 vaga" — só o que foi preenchido. */
export function Caracteristicas({ imovel }: { imovel: Imovel }) {
  const itens = textoDasCaracteristicas(imovel);
  if (itens.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-suave">
      {itens.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}
