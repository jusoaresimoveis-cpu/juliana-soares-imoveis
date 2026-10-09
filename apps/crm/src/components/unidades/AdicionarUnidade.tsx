import { useState, type FormEvent } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { ROTULO_DA_UNIDADE, rotuloDaUnidade, type PropertyType } from '@contracts';
import { useCriarUnidades, type Planta, type Unidade } from '@/hooks/useUnidades';
import { cn } from '@/lib/utils';
import { areaOuNula, botaoPrimario, botaoSecundario, Campo, Erro, inputCls } from './Formulario';

/** Sala comercial (sem andar na grade) ou unidade fora do padrão andar + final. */
export function AdicionarUnidade({
  orgId,
  propertyId,
  tipo,
  plantas,
  unidades,
}: {
  orgId: string | undefined;
  propertyId: string;
  tipo: PropertyType;
  plantas: Planta[];
  unidades: Unidade[];
}) {
  const criar = useCriarUnidades(orgId, propertyId);
  const ehSala = tipo === 'sala_comercial' || tipo === 'loja';
  const [aberto, setAberto] = useState(false);
  const [f, setF] = useState({ rotulo: '', planta: plantas[0]?.id ?? '', andar: '', area: '' });
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  const rotulo = f.rotulo.trim();
  const andar = f.andar.trim() === '' ? null : /^-?\d{1,3}$/.test(f.andar.trim()) ? Number(f.andar) : undefined;
  const problema = !rotulo
    ? null
    : !ROTULO_DA_UNIDADE.test(rotulo)
      ? 'O número da unidade tem até 8 letras ou números, sem espaço: 03, 804, T1.'
      : unidades.some((u) => u.label === rotulo)
        ? `Já existe ${rotuloDaUnidade(tipo, rotulo)}.`
        : andar === undefined || (andar !== null && (andar < -10 || andar > 300))
          ? 'Andar: um número de -10 a 300, ou vazio.'
          : null;

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (!rotulo || problema || !f.planta || andar === undefined) return;
    criar.mutate(
      [{ label: rotulo, floor: andar, floorplan_id: f.planta, area_built: areaOuNula(f.area) }],
      { onSuccess: () => setF((s) => ({ ...s, rotulo: '', area: '' })) },
    );
  }

  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)} className={cn(botaoSecundario, 'self-start px-4')}>
        <Plus className="h-3.5 w-3.5" />
        {ehSala ? 'Adicionar sala' : 'Adicionar unidade avulsa'}
      </button>
    );
  }

  return (
    <form onSubmit={enviar} className="rounded-lg bg-card p-5 shadow-card">
      <h2 className="text-lg font-bold">{ehSala ? 'Adicionar sala' : 'Adicionar unidade avulsa'}</h2>
      <p className="mt-0.5 max-w-[75ch] text-sm text-tx-3">
        Para sala comercial, que tem área própria, ou unidade fora do padrão andar + final. Nasce vendida, como as
        outras: a tabela do mês é que a põe à venda.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Campo rotulo="Número">
          <input
            required
            maxLength={8}
            value={f.rotulo}
            onChange={(e) => set('rotulo')(e.target.value.replace(/\s/g, ''))}
            placeholder={ehSala ? '03' : '804'}
            className={inputCls}
          />
        </Campo>
        <Campo rotulo="Planta">
          <select value={f.planta} onChange={(e) => set('planta')(e.target.value)} className={inputCls}>
            {plantas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Andar (opcional)">
          <input inputMode="numeric" value={f.andar} onChange={(e) => set('andar')(e.target.value.replace(/[^\d-]/g, ''))} className={inputCls} />
        </Campo>
        <Campo rotulo="Área própria (m², opcional)">
          <input inputMode="decimal" value={f.area} onChange={(e) => set('area')(e.target.value)} placeholder="Vazio: a da planta" className={inputCls} />
        </Campo>
      </div>

      {problema && <Erro>{problema}</Erro>}
      {criar.isError && <Erro>{(criar.error as Error).message}</Erro>}
      {criar.isSuccess && !problema && !rotulo && (
        <p className="mt-3 text-sm font-semibold text-ok">Unidade criada. Pode adicionar a próxima.</p>
      )}

      <div className="mt-4 flex gap-2">
        <button type="button" onClick={() => setAberto(false)} className={botaoSecundario}>
          Fechar
        </button>
        <button type="submit" disabled={!rotulo || !!problema || criar.isPending} className={botaoPrimario}>
          {criar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Adicionar
        </button>
      </div>
    </form>
  );
}
