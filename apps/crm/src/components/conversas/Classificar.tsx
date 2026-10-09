import { Loader2, Lock, UserCheck, RotateCcw } from 'lucide-react';
import type { Conversa } from '@/hooks/useConversas';

/**
 * Marcar a conversa como pessoal — ou trazê-la de volta.
 *
 * Um botão só, que muda conforme onde a conversa está. Três botões sempre
 * visíveis seriam três decisões a cada conversa aberta, e quem está atendendo
 * cliente não quer decidir taxonomia: quer responder.
 *
 * Quando a classificação foi feita à mão, aparece também o "voltar ao
 * automático" — é como se desfaz um engano, e sem ele a marcação vira uma
 * porta de mão única.
 */
export function Classificar({
  conversa,
  souDono,
  ocupado,
  onEscolher,
}: {
  conversa: Conversa;
  /** Quem conectou o número. É a única pessoa que pode classificar — e a única
      que enxerga o resultado depois de "Não é lead". */
  souDono: boolean;
  ocupado: boolean;
  onEscolher: (c: 'lead' | 'pessoal' | null) => void;
}) {
  const manual = conversa.classification !== null;

  /*
   * Sem o número, sem o botão.
   *
   * O gatilho no banco recusa a escrita de quem não conectou aquele número, e
   * mostrar um botão que sempre falha é pior do que não mostrar: a pessoa
   * clica, lê um erro que não a ajuda, e passa a desconfiar do resto da tela.
   */
  if (!souDono) return null;

  return (
    <span className="inline-flex items-center gap-1.5">
      {conversa.estado === 'pessoal' ? (
        <button
          /*
           * A volta de um GRUPO só existe forçando 'lead': grupo sem
           * classificação é pessoal por definição, então devolver ao automático
           * o traria de volta para cá no mesmo instante.
           */
          onClick={() => onEscolher(conversa.is_group ? 'lead' : null)}
          disabled={ocupado}
          title="Volta a aparecer para a equipe e a contar no painel"
          className="inline-flex items-center gap-1.5 rounded-full border border-line-2 px-3 py-1.5 text-sm font-semibold text-tx-2 transition-colors hover:border-ok hover:text-ok disabled:opacity-60"
        >
          {ocupado ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserCheck className="h-3 w-3" />}
          Tirar de pessoais
        </button>
      ) : (
        <button
          onClick={() => onEscolher('pessoal')}
          disabled={ocupado}
          title="Vira particular: só você enxerga, nem o gestor nem o administrador. Sai de toda contagem do painel."
          className="inline-flex items-center gap-1.5 rounded-full border border-line-2 px-3 py-1.5 text-sm font-semibold text-tx-2 transition-colors hover:border-dng hover:text-dng disabled:opacity-60"
        >
          {ocupado ? <Loader2 className="h-3 w-3 animate-spin" /> : <Lock className="h-3 w-3" />}
          Tornar pessoal
        </button>
      )}

      {manual && conversa.estado !== 'pessoal' && (
        <button
          onClick={() => onEscolher(null)}
          disabled={ocupado}
          title="Volta a decidir pela origem rastreada"
          aria-label="Voltar ao automático"
          className="grid h-[30px] w-[30px] place-items-center rounded-full border border-line-2 text-tx-3 transition-colors hover:text-tx disabled:opacity-60"
        >
          <RotateCcw className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}
