import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useTeamMap, useCorretores } from '@/hooks/useLeadsBoard';
import { useAgenda, useMudarStatusVisita, type Visita } from '@/hooks/useVisits';
import { blocksAgenda } from '@contracts';
import { cn } from '@/lib/utils';
import { CartaoVisita } from '@/components/visits/CartaoVisita';

/** Segunda-feira da semana de uma data. A grade brasileira começa na segunda. */
function segundaDa(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const dow = x.getDay(); // 0 = domingo
  x.setDate(x.getDate() - (dow === 0 ? 6 : dow - 1));
  return x;
}

const diaISO = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/**
 * Quantos dias a grade mostra: DUAS semanas, sete em cima e sete embaixo.
 *
 * Uma semana só respondia "o que tem esta semana", e obrigava a clicar para
 * responder "e a próxima?" — que é a pergunta de quem marca visita, porque
 * cliente quase nunca aceita o primeiro horário oferecido. Com quatorze dias a
 * conversa inteira cabe numa tela.
 *
 * Sete por linha vem do `xl:grid-cols-7` da grade: mudar este número sem mudar
 * as colunas quebra o alinhamento com os dias da semana, que é a única coisa que
 * torna a grade legível.
 */
const DIAS_NA_GRADE = 14;

export default function Agenda() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const [base, setBase] = useState(() => segundaDa(new Date()));
  const corretor = params.get('corretor') ?? '';

  const { data: equipe } = useTeamMap(orgId);
  const { data: corretores } = useCorretores(orgId);

  const dias = useMemo(
    () =>
      Array.from(
        { length: DIAS_NA_GRADE },
        (_, i) => new Date(base.getFullYear(), base.getMonth(), base.getDate() + i),
      ),
    [base],
  );

  const fim = useMemo(
    () => new Date(base.getFullYear(), base.getMonth(), base.getDate() + DIAS_NA_GRADE),
    [base],
  );

  const agenda = useAgenda(base.toISOString(), fim.toISOString(), corretor || undefined);
  const mudarStatus = useMudarStatusVisita();

  // Agrupa por dia local. Fatiar por string ISO daria errado no fim do dia,
  // porque o instante gravado é UTC e a virada não coincide.
  const porDia = useMemo(() => {
    const m = new Map<string, Visita[]>();
    for (const v of agenda.data ?? []) {
      const k = diaISO(new Date(v.starts_at));
      const lista = m.get(k);
      if (lista) lista.push(v);
      else m.set(k, [v]);
    }
    return m;
  }, [agenda.data]);

  const hojeISO = diaISO(new Date());
  /*
   * O rótulo do período, e não do mês do primeiro dia.
   *
   * Com quatorze dias a grade atravessa a virada do mês com frequência — e
   * escrever só "Agosto de 2026" numa tela que mostra até 6 de setembro é a
   * tela afirmando algo falso sobre o que está exibindo.
   */
  const mesLabel = useMemo(() => {
    const ultimo = dias.at(-1) ?? base;
    const so = (d: Date) => d.toLocaleDateString('pt-BR', { month: 'long' });
    const comAno = (d: Date) => d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const mesmoMes =
      base.getMonth() === ultimo.getMonth() && base.getFullYear() === ultimo.getFullYear();
    return mesmoMes ? comAno(base) : `${so(base)} – ${comAno(ultimo)}`;
  }, [base, dias]);
  const total = agenda.data?.length ?? 0;
  const abertas = (agenda.data ?? []).filter((v) => blocksAgenda(v.status)).length;

  /*
   * A virada é da GRADE inteira, não de uma semana.
   *
   * Andando sete dias, metade da tela repetiria o que já estava lá — e duas
   * telas quase iguais lado a lado leem como "não aconteceu nada". Quatorze dias
   * trocam o conteúdo inteiro, e o alinhamento com os dias da semana continua de
   * pé porque o passo é múltiplo de sete.
   */
  function andar(quinzenas: number) {
    setBase(
      (b) => new Date(b.getFullYear(), b.getMonth(), b.getDate() + quinzenas * DIAS_NA_GRADE),
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <header className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold">Agenda de visitas</h1>
          <p className="mt-0.5 text-base text-tx-2">
            {agenda.isFetching
              ? 'Carregando…'
              : `${total} ${total === 1 ? 'visita' : 'visitas'} nas duas semanas · ${abertas} em aberto`}
          </p>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select
            value={corretor}
            onChange={(e) => {
              const p = new URLSearchParams(params);
              if (e.target.value) p.set('corretor', e.target.value);
              else p.delete('corretor');
              setParams(p, { replace: true });
            }}
            className="rounded-full border border-line-2 bg-card px-3.5 py-2 text-base outline-none focus:border-pri"
          >
            <option value="">Toda a equipe</option>
            {corretores.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1 rounded-full border border-line-2 bg-card p-1">
            <button
              onClick={() => andar(-1)}
              aria-label="Duas semanas anteriores"
              className="grid h-7 w-7 place-items-center rounded-full text-tx-2 hover:bg-card-2 hover:text-tx"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setBase(segundaDa(new Date()))}
              className="rounded-full px-3 py-1 text-sm font-semibold text-tx-2 hover:text-tx"
            >
              Hoje
            </button>
            <button
              onClick={() => andar(1)}
              aria-label="Próximas duas semanas"
              className="grid h-7 w-7 place-items-center rounded-full text-tx-2 hover:bg-card-2 hover:text-tx"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <span className="text-base font-semibold capitalize text-tx-2">{mesLabel}</span>
        </div>
      </header>

      {agenda.isError && (
        <p className="flex items-center gap-2 rounded-lg bg-dng-soft p-3 text-base text-dng">
          <AlertCircle className="h-4 w-4" />
          Não foi possível carregar a agenda.
        </p>
      )}

      {/*
        `content-start` é o que faz as duas linhas terem a altura do conteúdo.
        Sem ele, a grade estica as linhas para preencher a altura disponível — e
        com uma semana só isso produzia aquela coluna enorme e vazia embaixo do
        "Livre". Com duas linhas ficariam duas.
      */}
      <div className="grid min-h-0 flex-1 content-start grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {dias.map((d) => {
          const chave = diaISO(d);
          const lista = porDia.get(chave) ?? [];
          const hoje = chave === hojeISO;
          return (
            <section
              key={chave}
              className={cn(
                'flex min-h-[140px] flex-col rounded-lg bg-card-2 p-2.5',
                hoje && 'ring-1 ring-pri/40',
              )}
            >
              <header className="mb-2 flex items-baseline gap-1.5 px-0.5">
                <span className={cn('text-2xs font-bold uppercase text-tx-3', hoje && 'text-pri')}>
                  {d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}
                </span>
                <span className={cn('text-base font-bold', hoje && 'text-pri')}>{d.getDate()}</span>
                {lista.length > 0 && (
                  <span className="ml-auto rounded-full bg-card px-1.5 py-0.5 text-2xs font-bold tabular-nums text-tx-2">
                    {lista.length}
                  </span>
                )}
              </header>

              <div className="flex flex-col gap-1.5">
                {lista.length === 0 && (
                  <p className="rounded-md border border-dashed border-line-2 py-4 text-center text-sm text-tx-3">
                    Livre
                  </p>
                )}

                {lista.map((v) => (
                  <CartaoVisita
                    key={v.id}
                    visita={v}
                    corretorNome={v.assigned_to ? equipe?.[v.assigned_to]?.full_name : undefined}
                    ocupado={mudarStatus.isPending}
                    onAbrirLead={() => navigate(`/leads/${v.lead_id}`)}
                    onStatus={(status) => mudarStatus.mutate({ id: v.id, leadId: v.lead_id, status })}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {agenda.isFetching && (
        <p className="flex items-center justify-center gap-2 text-sm text-tx-3">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Atualizando
        </p>
      )}
    </div>
  );
}
