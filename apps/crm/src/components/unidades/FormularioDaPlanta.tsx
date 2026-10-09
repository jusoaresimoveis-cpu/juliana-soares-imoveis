import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { rotuloDaUnidade, type PropertyType } from '@contracts';
import { useMoverParaAPlanta, useSalvarPlanta, type Planta, type Unidade } from '@/hooks/useUnidades';
import { finalDaUnidade, juntarComE, lerFinais, listaCurta, natural, unidadesQueSeguemOsFinais } from '@/lib/unidades';
import { cn } from '@/lib/utils';
import { areaOuNula, botaoPrimario, botaoSecundario, Campo, Erro, inputCls, inteiroOuNulo, soDigitos } from './Formulario';

export function FormularioDaPlanta({
  orgId,
  propertyId,
  tipo,
  planta,
  outras: outrasPlantas,
  unidades,
  posicao,
  onFechar,
  podeCancelar = true,
}: {
  orgId: string | undefined;
  propertyId: string;
  tipo: PropertyType;
  planta: Planta | null;
  outras: Planta[];
  unidades: Unidade[];
  posicao: number;
  onFechar: () => void;
  podeCancelar?: boolean;
}) {
  const salvar = useSalvarPlanta(orgId, propertyId);
  const mover = useMoverParaAPlanta(propertyId);
  // A planta nova ganha id ao ser criada. Se as unidades não mudarem de planta
  // depois disso, tentar de novo grava por cima dela, e não cria outra igual.
  const [idSalvo, setIdSalvo] = useState<string | null>(planta?.id ?? null);
  // Os finais de quando o formulário abriu: depois de salvar, a planta relida
  // já vem com os novos, e tentar de novo não acharia mais o que mover.
  const [finaisDeAntes] = useState<readonly string[]>(() => planta?.finals ?? []);
  // Depois de criada, a própria planta volta na lista das outras.
  const outras = outrasPlantas.filter((o) => o.id !== idSalvo);
  const [f, setF] = useState({
    nome: planta?.name ?? '',
    finais: planta?.finals.join(', ') ?? '',
    quartos: planta?.bedrooms?.toString() ?? '',
    suites: planta?.suites?.toString() ?? '',
    banheiros: planta?.bathrooms?.toString() ?? '',
    vagas: planta?.parking_spots?.toString() ?? '',
    area: planta?.area_built?.toString().replace('.', ',') ?? '',
  });
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  const { finais, invalidos } = lerFinais(f.finais);
  // Um final em duas plantas deixaria "Gerar unidades" sem saber qual usar.
  const repetidos = finais.flatMap((fi) => {
    const dona = outras.find((o) => o.finals.includes(fi));
    return dona ? [`o final ${fi} já é da planta “${dona.name}”`] : [];
  });
  const problema = invalidos.length
    ? `Final inválido: ${invalidos.join(', ')}. Use até 4 letras ou números, como 01.`
    : repetidos.length
      ? `Não dá: ${repetidos.join('; ')}.`
      : null;

  // As unidades dos finais que esta planta ganhou e que estão em outra: o site
  // as mostra pela planta gravada nelas, então mudar o final não as leva junto.
  const aMover = unidadesQueSeguemOsFinais({ unidades, plantaId: idSalvo, finaisAntes: finaisDeAntes, finaisDepois: finais });
  const nomeDaPlanta = new Map(outrasPlantas.map((o) => [o.id, o.name]));
  const deOnde = [...new Set(aMover.map((u) => u.floorplan_id))].map((pid) => `“${nomeDaPlanta.get(pid) ?? 'outra planta'}”`);
  const finaisDasMovidas = [...new Set(aMover.map((u) => finalDaUnidade(u.label, u.floor) ?? ''))].sort(natural);
  const ocupado = salvar.isPending || mover.isPending;

  function salvarPlanta(moverUnidades: boolean) {
    if (!f.nome.trim() || problema) return;
    const ids = moverUnidades ? aMover.map((u) => u.id) : [];
    salvar.mutate(
      {
        id: idSalvo,
        posicao,
        dados: {
          name: f.nome.trim(),
          finals: finais,
          bedrooms: inteiroOuNulo(f.quartos),
          suites: inteiroOuNulo(f.suites),
          bathrooms: inteiroOuNulo(f.banheiros),
          parking_spots: inteiroOuNulo(f.vagas),
          area_built: areaOuNula(f.area),
        },
      },
      {
        onSuccess: (plantaId) => {
          setIdSalvo(plantaId);
          if (!ids.length) return onFechar();
          mover.mutate({ floorplan_id: plantaId, ids }, { onSuccess: onFechar });
        },
      },
    );
  }

  function enviar(e: FormEvent) {
    e.preventDefault();
    // Com unidades a mover, o Enter não escolhe por ela: mover ou não é um dos dois botões.
    if (aMover.length) return;
    salvarPlanta(false);
  }

  return (
    <form onSubmit={enviar} className="rounded-lg border-2 border-pri-light bg-card p-4 shadow-card">
      <h2 className="mb-3 text-md font-bold">{planta ? `Editar “${planta.name}”` : 'Nova planta'}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Campo className="col-span-2" rotulo="Nome">
          <input
            required
            autoFocus
            maxLength={80}
            value={f.nome}
            onChange={(e) => set('nome')(e.target.value)}
            placeholder="2 suítes + lavabo"
            className={inputCls}
          />
        </Campo>
        <Campo className="col-span-2" rotulo="Finais (separados por vírgula)">
          <input
            value={f.finais}
            onChange={(e) => set('finais')(e.target.value)}
            placeholder="02, 04, 05"
            aria-invalid={!!problema || undefined}
            className={cn(inputCls, problema && 'border-dng focus:border-dng')}
          />
        </Campo>
        <Campo rotulo="Quartos (sem as suítes)">
          <input inputMode="numeric" value={f.quartos} onChange={(e) => set('quartos')(soDigitos(e.target.value))} placeholder="0" className={inputCls} />
        </Campo>
        <Campo rotulo="Suítes">
          <input inputMode="numeric" value={f.suites} onChange={(e) => set('suites')(soDigitos(e.target.value))} placeholder="2" className={inputCls} />
        </Campo>
        <Campo rotulo="Banheiros">
          <input inputMode="numeric" value={f.banheiros} onChange={(e) => set('banheiros')(soDigitos(e.target.value))} placeholder="3" className={inputCls} />
        </Campo>
        <Campo rotulo="Vagas">
          <input inputMode="numeric" value={f.vagas} onChange={(e) => set('vagas')(soDigitos(e.target.value))} placeholder="1" className={inputCls} />
        </Campo>
        <Campo className="col-span-2" rotulo="Área privativa (m²)">
          <input inputMode="decimal" value={f.area} onChange={(e) => set('area')(e.target.value)} placeholder="70" className={inputCls} />
        </Campo>
        <p className="col-span-2 self-end pb-2.5 text-sm text-tx-3">
          Quartos são os que NÃO são suíte: 2 quartos e 1 suíte são 3 dormitórios.
        </p>
      </div>

      {problema && <Erro>{problema}</Erro>}

      {!problema && aMover.length > 0 && (
        <div role="status" className="mt-3 rounded-xl bg-warn-soft p-3 text-sm text-warn">
          <p className="font-bold">
            {aMover.length === 1
              ? `1 unidade ${finaisDasMovidas.length === 1 ? 'do final' : 'dos finais'} ${juntarComE(finaisDasMovidas)} está em outra planta.`
              : `${aMover.length} unidades ${finaisDasMovidas.length === 1 ? 'do final' : 'dos finais'} ${juntarComE(finaisDasMovidas)} estão em outra planta.`}
          </p>
          <p className="mt-0.5">
            {listaCurta(aMover.map((u) => rotuloDaUnidade(tipo, u.label)))}, hoje em {juntarComE(deOnde)}. O site mostra
            cada unidade com a planta gravada nela, e não pelo final: sem mover,{' '}
            {aMover.length === 1 ? 'ela continua' : 'elas continuam'} com a planta antiga.
          </p>
        </div>
      )}

      {salvar.isError && <Erro>{(salvar.error as Error).message}</Erro>}
      {mover.isError && (
        <Erro>A planta foi salva, mas as unidades não mudaram de planta: {(mover.error as Error).message}</Erro>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {podeCancelar && (
          <button type="button" onClick={onFechar} className={botaoSecundario}>
            Cancelar
          </button>
        )}
        {aMover.length > 0 && !problema ? (
          <>
            <button type="button" disabled={ocupado} onClick={() => salvarPlanta(false)} className={botaoSecundario}>
              Salvar sem mover
            </button>
            <button type="button" disabled={ocupado} onClick={() => salvarPlanta(true)} className={botaoPrimario}>
              {ocupado && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar e mover {aMover.length === 1 ? 'a unidade' : `as ${aMover.length} unidades`}
            </button>
          </>
        ) : (
          <button type="submit" disabled={ocupado || !!problema} className={botaoPrimario}>
            {ocupado && <Loader2 className="h-4 w-4 animate-spin" />}
            {idSalvo ? 'Salvar planta' : 'Criar planta'}
          </button>
        )}
      </div>
    </form>
  );
}
