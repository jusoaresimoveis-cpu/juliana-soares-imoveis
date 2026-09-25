import { hojeISO } from '@/hooks/usePainel';

const CAMPO =
  'rounded-full border border-line-2 bg-card px-3 py-1.5 text-sm font-semibold text-tx-2 outline-none focus:border-pri';

/**
 * As duas datas de um período escolhido à mão.
 *
 * Moravam dentro do Painel. Quando Anúncios ganhou o mesmo "Personalizado",
 * copiar os dois campos levaria junto as duas regras abaixo — e regra copiada
 * é regra que um dia existe numa tela e não na outra.
 *
 * `max={hoje}` nos dois: janela no futuro devolveria zero em tudo, e zero por
 * período impossível é indistinguível de zero por não ter acontecido nada.
 *
 * `min={de}` no segundo: o navegador impede escolher o fim antes do começo. Se
 * mesmo assim chegar invertido — digitado à mão —, `janelaPersonalizada`
 * endireita em vez de recusar.
 */
export function CamposDePeriodo({
  de,
  ate,
  onChange,
}: {
  de: string;
  ate: string;
  onChange: (janela: { de: string; ate: string }) => void;
}) {
  const hoje = hojeISO();

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <input
        type="date"
        value={de}
        max={ate || hoje}
        onChange={(e) => onChange({ de: e.target.value, ate })}
        aria-label="Data inicial"
        className={CAMPO}
      />
      <span className="text-sm text-tx-3">até</span>
      <input
        type="date"
        value={ate}
        min={de}
        max={hoje}
        onChange={(e) => onChange({ de, ate: e.target.value })}
        aria-label="Data final"
        className={CAMPO}
      />
    </span>
  );
}
