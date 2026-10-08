/**
 * "Imagem ilustrativa" sobre a foto: o render e o decorado de um lançamento
 * não são o imóvel que vai ser entregue, e o site não mostra nada inventado sem
 * dizer. Vai no canto, por cima da foto, e não na legenda, para seguir junto
 * quando alguém tira uma captura de tela.
 *
 * Na foto ampliada (`naBarra`), vai na barra de cima, ao lado do contador: lá a
 * foto encolhe para caber na tela, e qualquer canto fixo do quadro podia cair
 * na faixa escura em volta dela, longe da foto e fora do que se vê como parte
 * dela.
 */
export function AvisoIlustrativa({ posicao = 'bottom-2 left-2', naBarra = false }: { posicao?: string; naBarra?: boolean }) {
  if (naBarra) {
    return <span className="rounded bg-white/15 px-2 py-0.5 text-xs font-medium text-white">Imagem ilustrativa</span>;
  }
  return (
    <span
      className={`pointer-events-none absolute rounded bg-noite/70 px-2 py-0.5 text-[0.6875rem] font-medium text-white ${posicao}`}
    >
      Imagem ilustrativa
    </span>
  );
}
