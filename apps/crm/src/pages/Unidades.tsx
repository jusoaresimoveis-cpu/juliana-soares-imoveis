import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ClipboardCheck, Loader2, Pencil, Plus, Trash2, Undo2 } from 'lucide-react';
import {
  ROTULO_DA_UNIDADE,
  UNIT_STATUSES,
  UNIT_STATUS_LABEL,
  aPartirDe,
  mesCorrente,
  nomeDoMesDaTabela,
  reaisComCentavos,
  resumoDoEmpreendimento,
  rotuloDaUnidade,
  tabelaVigente,
  type PropertyType,
  type UnitStatus,
} from '@contracts';
import { useAuth } from '@/hooks/useAuth';
import { useProperty } from '@/hooks/useProperties';
import {
  useAplicarTabela,
  useApagarPlanta,
  useApagarUnidade,
  useCriarUnidades,
  useMoverParaAPlanta,
  useMudarUnidade,
  useSalvarPlanta,
  useUnidades,
  type Planta,
  type Unidade,
} from '@/hooks/useUnidades';
import { AvisoDaTabela, COR_DA_SITUACAO } from '@/components/properties/Empreendimento';
import {
  celulaDasPartes,
  conferirTabela,
  finalDaUnidade,
  formatarPreco,
  formatarVariacao,
  juntarComE,
  lerCelula,
  lerFinais,
  listaCurta,
  montarGrade,
  ordenarUnidades,
  partesDaCelula,
  prepararGeracao,
  resumoDaPlanta,
  situacoesNoMeioDoMes,
  textoDaCelula,
  unidadesQueSeguemOsFinais,
  variacao,
  VARIACAO_SUSPEITA,
  type CelulaEditada,
  type ConferenciaDaTabela,
  type Destaque,
  type MudancaDePreco,
} from '@/lib/unidades';
import { cn } from '@/lib/utils';

/**
 * As unidades de um empreendimento: as plantas, as unidades e a tabela do mês.
 *
 * O empreendimento é UM imóvel (uma página no site, um código, os leads); a
 * unidade não tem página nem código. Aqui a Juliana cadastra as plantas, gera
 * as unidades do prédio de uma vez e, todo mês, aplica a tabela da construtora
 * (que sai no 1º dia útil, com o CUB/SC). Até ela aplicar, o site mostra
 * "Consulte" no lugar dos preços.
 */

type Aba = 'tabela' | 'unidades' | 'plantas';

export default function Unidades() {
  const { id = '' } = useParams();
  const { profile } = useAuth();
  const orgId = profile?.organization_id;
  const imovel = useProperty(id);
  const dados = useUnidades(id);
  const [aba, setAba] = useState<Aba | null>(null);

  // Na primeira visita, o passo que falta: planta, depois unidades, depois a
  // tabela. Escolhido uma vez, quando os dados chegam; recalculado a cada
  // releitura, criar a primeira planta pularia para "Unidades" e criar a
  // primeira sala pularia para "Tabela do mês", com a Juliana no meio do passo.
  if (aba === null && dados.data) {
    const { plantas: ps, unidades: us } = dados.data;
    setAba(ps.length === 0 ? 'plantas' : us.length === 0 ? 'unidades' : 'tabela');
  }

  if (imovel.isLoading || dados.isLoading) {
    return (
      <div className="grid place-items-center py-24">
        <Loader2 className="h-5 w-5 animate-spin text-pri" />
      </div>
    );
  }

  // Só sem dado nenhum: o erro de uma releitura (a do "Conferir", a da volta à
  // aba) mantém o que já veio, e a tabela digitada não some por um soluço da rede.
  if (!imovel.data || !dados.data) {
    return (
      <div className="rounded-lg bg-dng-soft p-5 text-md text-dng">
        <strong className="block font-bold">Não consegui carregar as unidades.</strong>
        <Link to={id ? `/imoveis/${id}` : '/imoveis'} className="mt-1 inline-block underline">
          Voltar ao imóvel
        </Link>
      </div>
    );
  }

  const p = imovel.data;
  const { plantas, unidades } = dados.data;

  if (!p.has_units) {
    return (
      <div className="rounded-lg bg-card p-8 shadow-card">
        <h1 className="text-2xl font-bold">Unidades</h1>
        <p className="mt-2 max-w-[60ch] text-md text-tx-2">
          {p.title} não é um empreendimento com unidades. Para cadastrar plantas e unidades, ligue “Empreendimento com
          várias unidades” no cadastro do imóvel (Editar → Dados).
        </p>
        <Link to={`/imoveis/${id}`} className="mt-3 inline-block font-semibold text-pri hover:underline">
          Voltar ao imóvel
        </Link>
      </div>
    );
  }

  const tipo = p.property_type;
  const abaAtiva: Aba = aba ?? 'tabela';
  const semTabela = !p.units_table_month;
  const resumo = resumoDoEmpreendimento(unidades);
  const aPartir = aPartirDe(resumo);
  // O imóvel também é relido: o mês da tabela gravado nele decide se gravar
  // aplica a tabela do mês, e outro aparelho pode tê-la aplicado.
  const recarregar = async () => {
    const [r, i] = await Promise.all([dados.refetch(), imovel.refetch()]);
    if (r.isError || !r.data) throw r.error ?? new Error('Sem as unidades.');
    return { unidades: r.data.unidades, mesAplicado: (i.data ?? p).units_table_month ?? null };
  };

  return (
    <div className="flex flex-col gap-4 pb-4">
      <header className="flex flex-wrap items-start gap-4">
        <Link
          to={`/imoveis/${id}`}
          aria-label="Voltar à ficha do imóvel"
          className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line-2 bg-card text-tx-2 transition-colors hover:border-pri hover:text-pri"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold uppercase text-tx-3">{p.public_code} · Unidades</p>
          <h1 className="mt-0.5 text-2xl font-bold leading-tight">{p.title}</h1>
          <p className="mt-1 text-base text-tx-2">
            {aPartir !== null && (
              <>
                A partir de <b className="text-pri">{reaisComCentavos(aPartir)}</b> ·{' '}
              </>
            )}
            {contagem(resumo.disponiveis, 'disponível', 'disponíveis')} ·{' '}
            {contagem(resumo.reservadas, 'reservada', 'reservadas')} · {contagem(resumo.total, 'unidade', 'unidades')}
          </p>
        </div>
      </header>

      <AvisoDaTabela mesAplicado={p.units_table_month} temUnidades={unidades.length > 0} />

      <nav className="flex gap-1 overflow-x-auto rounded-full bg-card-2 p-1 sm:self-start">
        {(
          [
            ['tabela', 'Tabela do mês'],
            ['unidades', 'Unidades'],
            ['plantas', 'Plantas'],
          ] as const
        ).map(([k, rotulo]) => (
          <button
            key={k}
            type="button"
            onClick={() => setAba(k)}
            className={cn(
              'flex-1 whitespace-nowrap rounded-full px-4 py-2 text-base font-semibold transition-colors',
              abaAtiva === k ? 'bg-card text-pri shadow-card' : 'text-tx-2 hover:text-tx',
            )}
          >
            {rotulo}
          </button>
        ))}
      </nav>

      {abaAtiva === 'plantas' && (
        <SecaoPlantas orgId={orgId} propertyId={id} tipo={tipo} plantas={plantas} unidades={unidades} />
      )}

      {abaAtiva === 'unidades' &&
        (plantas.length === 0 ? (
          <Vazio>
            Cadastre as plantas primeiro: cada unidade segue uma.{' '}
            <button type="button" onClick={() => setAba('plantas')} className="font-semibold text-pri hover:underline">
              Ir para Plantas
            </button>
          </Vazio>
        ) : (
          <SecaoUnidades
            orgId={orgId}
            propertyId={id}
            tipo={tipo}
            plantas={plantas}
            unidades={unidades}
            semTabela={semTabela}
            irParaTabela={() => setAba('tabela')}
          />
        ))}

      {unidades.length === 0 ? (
        abaAtiva === 'tabela' && (
          <Vazio>
            Ainda não há unidades para a tabela.{' '}
            <button
              type="button"
              onClick={() => setAba(plantas.length ? 'unidades' : 'plantas')}
              className="font-semibold text-pri hover:underline"
            >
              {plantas.length ? 'Gerar as unidades' : 'Cadastrar as plantas'}
            </button>
          </Vazio>
        )
      ) : (
        // Montada mesmo escondida: a tabela digitada pela metade não pode se
        // perder porque a Juliana foi olhar a aba de unidades.
        <div hidden={abaAtiva !== 'tabela'}>
          <SecaoTabela
            propertyId={id}
            tipo={tipo}
            plantas={plantas}
            unidades={unidades}
            recarregar={recarregar}
            irParaSituacao={() => setAba('unidades')}
          />
        </div>
      )}
    </div>
  );
}

function contagem(n: number, um: string, varios: string) {
  return `${n} ${n === 1 ? um : varios}`;
}

/* ========================================================================== */
/* Plantas                                                                    */
/* ========================================================================== */

function SecaoPlantas({
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
  const [editando, setEditando] = useState<string | 'nova' | null>(plantas.length === 0 ? 'nova' : null);
  const apagar = useApagarPlanta(propertyId);
  const usadas = (plantaId: string) => unidades.filter((u) => u.floorplan_id === plantaId).length;
  const proximaPosicao = plantas.reduce((m, p) => Math.max(m, p.position), -1) + 1;

  return (
    <section className="flex flex-col gap-3">
      <p className="max-w-[75ch] text-sm text-tx-3">
        A planta é o tipo de unidade: quartos, suítes, banheiros, vagas e área. Os finais dizem quais unidades a seguem
        (o 804 é final 04), e é por eles que “Gerar unidades” acha a planta de cada uma. O site mostra as plantas que
        ainda têm unidade à venda, cada unidade com a planta gravada nela: dar um final novo a uma planta oferece trazer
        as unidades dele, e uma unidade sozinha troca de planta em “Situação de cada unidade”, na aba Unidades.
      </p>

      {plantas.map((planta) =>
        editando === planta.id ? (
          <FormularioDaPlanta
            key={planta.id}
            orgId={orgId}
            propertyId={propertyId}
            tipo={tipo}
            planta={planta}
            outras={plantas.filter((p) => p.id !== planta.id)}
            unidades={unidades}
            posicao={planta.position}
            onFechar={() => setEditando(null)}
          />
        ) : (
          <div key={planta.id} className="flex flex-wrap items-start gap-3 rounded-lg bg-card p-4 shadow-card">
            <div className="min-w-0 flex-1">
              <h2 className="text-md font-bold">{planta.name}</h2>
              <p className="mt-0.5 text-base text-tx-2">{resumoDaPlanta(planta) || 'Sem quartos nem área informados.'}</p>
              <p className="mt-0.5 text-sm text-tx-3">
                {planta.finals.length ? `Finais ${planta.finals.join(', ')}` : 'Sem finais (só unidade avulsa)'} ·{' '}
                {contagem(usadas(planta.id), 'unidade', 'unidades')}
              </p>
            </div>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setEditando(planta.id)}
                className="inline-flex items-center gap-1 rounded-full border border-line-2 bg-card px-3 py-1.5 text-sm font-semibold text-tx-2 hover:border-pri hover:text-pri"
              >
                <Pencil className="h-3.5 w-3.5" />
                Editar
              </button>
              {/* Planta com unidade não se apaga (o banco também recusa). */}
              {usadas(planta.id) === 0 && (
                <button
                  type="button"
                  disabled={apagar.isPending}
                  onClick={() => window.confirm(`Apagar a planta “${planta.name}”?`) && apagar.mutate(planta.id)}
                  aria-label={`Apagar a planta ${planta.name}`}
                  className="grid h-8 w-8 place-items-center rounded-full text-tx-3 hover:bg-dng-soft hover:text-dng disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        ),
      )}

      {apagar.isError && <Erro>{(apagar.error as Error).message}</Erro>}

      {editando === 'nova' ? (
        <FormularioDaPlanta
          orgId={orgId}
          propertyId={propertyId}
          tipo={tipo}
          planta={null}
          outras={plantas}
          unidades={unidades}
          posicao={proximaPosicao}
          onFechar={() => setEditando(null)}
          podeCancelar={plantas.length > 0}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditando('nova')}
          className="inline-flex items-center gap-1.5 self-start rounded-full bg-pri px-4 py-2 text-base font-semibold text-pri-fg hover:bg-pri-deep"
        >
          <Plus className="h-3.5 w-3.5" />
          Nova planta
        </button>
      )}
    </section>
  );
}

/** Campo numérico: vazio é nulo, e zero é zero ("2 suítes + lavabo" tem 0 quartos sem suíte). */
const inteiroOuNulo = (v: string) => (v.trim() === '' ? null : Number(v));
const areaOuNula = (v: string) => {
  const n = Number(v.replace(',', '.'));
  return v.trim() === '' || !Number.isFinite(n) || n <= 0 ? null : Math.round(n * 100) / 100;
};
const soDigitos = (v: string) => v.replace(/\D/g, '');

function FormularioDaPlanta({
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

/* ========================================================================== */
/* Unidades                                                                   */
/* ========================================================================== */

function SecaoUnidades({
  orgId,
  propertyId,
  tipo,
  plantas,
  unidades,
  semTabela,
  irParaTabela,
}: {
  orgId: string | undefined;
  propertyId: string;
  tipo: PropertyType;
  plantas: Planta[];
  unidades: Unidade[];
  /** Nenhuma tabela aplicada ainda: o imóvel fica com a situação que tinha, e o site mostra "Consulte". */
  semTabela: boolean;
  irParaTabela: () => void;
}) {
  return (
    <section className="flex flex-col gap-4">
      <GerarUnidades
        orgId={orgId}
        propertyId={propertyId}
        tipo={tipo}
        plantas={plantas}
        unidades={unidades}
        semTabela={semTabela}
      />
      <AdicionarUnidade orgId={orgId} propertyId={propertyId} tipo={tipo} plantas={plantas} unidades={unidades} />
      {unidades.length > 0 && (
        <SituacaoDasUnidades
          propertyId={propertyId}
          tipo={tipo}
          plantas={plantas}
          unidades={unidades}
          irParaTabela={irParaTabela}
        />
      )}
    </section>
  );
}

const natural = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { numeric: true });

/**
 * O prédio inteiro de uma vez: do primeiro ao último andar, um apartamento por
 * final, cada um com a planta do seu final. Mostra a conta antes de criar.
 */
function GerarUnidades({
  orgId,
  propertyId,
  tipo,
  plantas,
  unidades,
  semTabela,
}: {
  orgId: string | undefined;
  propertyId: string;
  tipo: PropertyType;
  plantas: Planta[];
  unidades: Unidade[];
  semTabela: boolean;
}) {
  const criar = useCriarUnidades(orgId, propertyId);
  const sugestao = useMemo(() => [...new Set(plantas.flatMap((p) => p.finals))].sort(natural).join(', '), [plantas]);
  const [aberto, setAberto] = useState(unidades.length === 0);
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [finaisTexto, setFinaisTexto] = useState(sugestao);
  const [criadas, setCriadas] = useState<number | null>(null);

  const andar = (v: string) => (/^-?\d{1,3}$/.test(v.trim()) ? Number(v) : null);
  const primeiro = andar(de);
  const ultimo = andar(ate);
  const { finais, invalidos } = lerFinais(finaisTexto);
  const geracao =
    primeiro !== null && ultimo !== null && finais.length
      ? prepararGeracao({
          primeiroAndar: primeiro,
          ultimoAndar: ultimo,
          finais,
          plantas,
          existentes: unidades.map((u) => u.label),
        })
      : null;

  const problema = invalidos.length
    ? `Final inválido: ${invalidos.join(', ')}.`
    : geracao?.semPlanta.length
      ? `Nenhuma planta tem o final ${geracao.semPlanta.join(', ')}. Ponha o final numa planta, ou tire-o daqui.`
      : geracao?.emDuasPlantas.length
        ? geracao.emDuasPlantas.map((d) => `O final ${d.final} está em duas plantas (${d.plantas.join(' e ')}).`).join(' ')
        : geracao?.invalidas.length
          ? `Andar fora de -10 a 300, ou número grande demais: ${geracao.invalidas.slice(0, 5).join(', ')}.`
          : geracao && geracao.novas.length > 2000
            ? 'Mais de 2.000 unidades de uma vez: confira os andares.'
            : null;

  const novas = geracao?.novas ?? [];
  const primeira = novas[0];
  const ultima = novas[novas.length - 1];

  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)} className={cn(botaoSecundario, 'self-start px-4')}>
        <Plus className="h-3.5 w-3.5" />
        Gerar mais unidades (andar por final)
      </button>
    );
  }

  return (
    <div className="rounded-lg bg-card p-5 shadow-card">
      <h2 className="text-lg font-bold">Gerar unidades</h2>
      <p className="mt-0.5 max-w-[75ch] text-sm text-tx-3">
        Do primeiro ao último andar, uma unidade por final: andares 5 a 19 com os finais 01 a 06 dão 501, 502… 1906. A
        planta de cada uma sai do final. Todas nascem vendidas e só aparecem no site quando a tabela do mês as der como
        disponíveis. As que já existem ficam como estão.
        {semTabela &&
          ' Até a primeira tabela, o imóvel fica com a situação que tinha, e o site mostra “Consulte” no lugar do preço, sem a lista de unidades.'}
      </p>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Campo rotulo="Primeiro andar">
          <input inputMode="numeric" value={de} onChange={(e) => setDe(e.target.value.replace(/[^\d-]/g, ''))} placeholder="5" className={inputCls} />
        </Campo>
        <Campo rotulo="Último andar">
          <input inputMode="numeric" value={ate} onChange={(e) => setAte(e.target.value.replace(/[^\d-]/g, ''))} placeholder="19" className={inputCls} />
        </Campo>
        <Campo className="col-span-2" rotulo="Finais">
          <input value={finaisTexto} onChange={(e) => setFinaisTexto(e.target.value)} placeholder="01, 02, 03" className={inputCls} />
        </Campo>
      </div>

      {problema ? (
        <Erro>{problema}</Erro>
      ) : geracao ? (
        <p className="mt-3 rounded-xl bg-card-2 p-3 text-sm text-tx-2">
          {novas.length && primeira && ultima ? (
            <>
              <b>{contagem(novas.length, 'unidade nova', 'unidades novas')}</b>:{' '}
              {novas.length === 1
                ? rotuloDaUnidade(tipo, primeira.label)
                : `${rotuloDaUnidade(tipo, primeira.label)} a ${rotuloDaUnidade(tipo, ultima.label)}`}
              .
            </>
          ) : (
            'Nenhuma unidade nova.'
          )}
          {geracao.jaExistem.length > 0 && ` ${contagem(geracao.jaExistem.length, 'já existe e fica', 'já existem e ficam')} como está.`}
        </p>
      ) : null}

      {criar.isError && <Erro>{(criar.error as Error).message}</Erro>}
      {criadas !== null && !criar.isPending && (
        <p className="mt-3 rounded-xl bg-ok-soft p-3 text-sm font-semibold text-ok">
          {contagem(criadas, 'unidade criada', 'unidades criadas')}, como vendidas. Na “Tabela do mês”, diga quais estão
          disponíveis e o preço de cada uma.
          {semTabela &&
            ' Até lá, o imóvel fica com a situação que tinha, e o site mostra “Consulte” no lugar do preço, sem a lista de unidades.'}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        {unidades.length > 0 && (
          <button type="button" onClick={() => setAberto(false)} className={botaoSecundario}>
            Fechar
          </button>
        )}
        <button
          type="button"
          disabled={!novas.length || !!problema || criar.isPending}
          onClick={() => criar.mutate(novas, { onSuccess: (n) => setCriadas(n) })}
          className={botaoPrimario}
        >
          {criar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {novas.length ? `Criar ${contagem(novas.length, 'unidade', 'unidades')}` : 'Criar unidades'}
        </button>
      </div>
    </div>
  );
}

/** Sala comercial (sem andar na grade) ou unidade fora do padrão andar + final. */
function AdicionarUnidade({
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

/**
 * A venda no meio do mês: troca a situação direto na unidade, sem aplicar
 * tabela (aplicar mudaria o mês da tabela, e o site voltaria a mostrar preço
 * de tabela vencida).
 *
 * Só para a frente: disponível reserva ou vende, reservada vende. Reservada e
 * vendida não voltam à venda por aqui, porque voltariam com o preço de uma
 * tabela antiga e sem conferência; quem as devolve é a tabela do mês.
 *
 * A planta também se troca aqui, uma unidade por vez: o site agrupa as
 * unidades pela planta gravada nelas, e não pelo final.
 */
function SituacaoDasUnidades({
  propertyId,
  tipo,
  plantas,
  unidades,
  irParaTabela,
}: {
  propertyId: string;
  tipo: PropertyType;
  plantas: Planta[];
  unidades: Unidade[];
  irParaTabela: () => void;
}) {
  const mudar = useMudarUnidade(propertyId);
  const apagar = useApagarUnidade(propertyId);
  const planta = new Map(plantas.map((p) => [p.id, p]));
  const aVenda = unidades.filter((u) => u.status !== 'vendido');
  // Num prédio quase vendido, a venda do meio do mês é de uma das poucas à
  // venda: a lista abre só com elas, e as vendidas ficam a um toque.
  const [soAVenda, setSoAVenda] = useState(aVenda.length > 0);
  const [aviso, setAviso] = useState<string | null>(null);
  const lista = ordenarUnidades(soAVenda ? aVenda : unidades);

  return (
    <div className="rounded-lg bg-card p-5 shadow-card">
      <h2 className="text-lg font-bold">Situação de cada unidade</h2>
      <p className="mt-0.5 max-w-[75ch] text-sm text-tx-3">
        Vendeu ou reservou no meio do mês? Troque aqui: o preço e o mês da tabela ficam como estão, e o “a partir de”
        do site se ajusta sozinho. A planta de cada unidade também se troca aqui.
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {(
          [
            [true, `À venda (${aVenda.length})`],
            [false, `Todas (${unidades.length})`],
          ] as const
        ).map(([valor, rotulo]) => (
          <button
            key={rotulo}
            type="button"
            onClick={() => setSoAVenda(valor)}
            aria-pressed={soAVenda === valor}
            className={cn(
              'rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors',
              soAVenda === valor ? 'border-pri bg-pri text-pri-fg' : 'border-line-2 bg-card text-tx-2 hover:text-tx',
            )}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {aviso && !mudar.isPending && <p className="mt-3 text-sm font-semibold text-ok">{aviso}</p>}
      {(mudar.isError || apagar.isError) && <Erro>{((mudar.error ?? apagar.error) as Error).message}</Erro>}
      {lista.length === 0 && <p className="mt-3 text-base text-tx-3">Nenhuma unidade à venda.</p>}
      {lista.some((u) => u.status !== 'disponivel') && (
        <p className="mt-3 text-sm text-tx-3">
          Reservada e vendida não voltam à venda por aqui: o preço guardado nelas pode ser de uma tabela antiga. Para
          voltar à venda, use a{' '}
          <button type="button" onClick={irParaTabela} className="font-semibold text-pri hover:underline">
            Tabela do mês
          </button>
          .
        </p>
      )}

      <ul className="mt-3 divide-y divide-line">
        {lista.map((u) => {
          const pl = planta.get(u.floorplan_id);
          const area = u.area_built ?? pl?.area_built;
          const ocupada = (mudar.isPending && mudar.variables?.id === u.id) || (apagar.isPending && apagar.variables === u.id);
          const possiveis = situacoesNoMeioDoMes(u.status);
          const voltaPelaTabela = u.status !== 'disponivel' ? 'Para voltar à venda, use a Tabela do mês' : undefined;
          return (
            <li key={u.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2">
              <div className="min-w-[10rem] flex-1">
                <b className="text-base font-bold">{rotuloDaUnidade(tipo, u.label)}</b>
                <span className="ml-2 text-sm text-tx-3">
                  {[plantas.length > 1 ? null : pl?.name, area ? `${area.toLocaleString('pt-BR')} m²` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </div>
              {plantas.length > 1 && (
                <select
                  value={u.floorplan_id}
                  disabled={ocupada}
                  onChange={(e) => {
                    const destino = planta.get(e.target.value);
                    mudar.mutate(
                      { id: u.id, floorplan_id: e.target.value },
                      {
                        onSuccess: () =>
                          setAviso(`${rotuloDaUnidade(tipo, u.label)}: planta “${destino?.name ?? ''}”.`),
                      },
                    );
                  }}
                  aria-label={`Planta de ${rotuloDaUnidade(tipo, u.label)}`}
                  className="w-44 truncate rounded-xl border border-line-2 bg-card px-2.5 py-1.5 text-sm text-tx-2 outline-none focus:border-pri"
                >
                  {plantas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
              <span className="w-32 text-right text-sm tabular-nums text-tx-2">
                {u.price_cents != null ? reaisComCentavos(u.price_cents) : 'sem preço'}
              </span>
              {possiveis.length === 1 ? (
                <span
                  title={voltaPelaTabela}
                  className={cn('rounded-xl border px-2.5 py-1.5 text-sm font-semibold', COR_DA_SITUACAO[u.status])}
                >
                  {UNIT_STATUS_LABEL[u.status]}
                </span>
              ) : (
                <select
                  value={u.status}
                  disabled={ocupada}
                  title={voltaPelaTabela}
                  onChange={(e) => {
                    const status = e.target.value as UnitStatus;
                    // A vendida sai da lista "À venda": o aviso diz para onde ela foi.
                    mudar.mutate(
                      { id: u.id, status },
                      { onSuccess: () => setAviso(`${rotuloDaUnidade(tipo, u.label)}: ${UNIT_STATUS_LABEL[status]}.`) },
                    );
                  }}
                  aria-label={`Situação de ${rotuloDaUnidade(tipo, u.label)}`}
                  className={cn('rounded-xl border px-2.5 py-1.5 text-sm font-semibold outline-none', COR_DA_SITUACAO[u.status])}
                >
                  {possiveis.map((s) => (
                    <option key={s} value={s}>
                      {UNIT_STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              )}
              <span className="grid w-8 place-items-center">
                {ocupada ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-pri" />
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      window.confirm(`Apagar ${rotuloDaUnidade(tipo, u.label)}? Ela sai do CRM e do site.`) &&
                      apagar.mutate(u.id)
                    }
                    aria-label={`Apagar ${rotuloDaUnidade(tipo, u.label)}`}
                    className="grid h-8 w-8 place-items-center rounded-full text-tx-3 hover:bg-dng-soft hover:text-dng"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ========================================================================== */
/* A tabela do mês                                                            */
/* ========================================================================== */

function SecaoTabela({
  propertyId,
  tipo,
  plantas,
  unidades,
  recarregar,
  irParaSituacao,
}: {
  propertyId: string;
  tipo: PropertyType;
  plantas: Planta[];
  unidades: Unidade[];
  /**
   * Relê do banco as unidades e o mês da tabela gravado no imóvel: a
   * conferência compara com o de agora, e não com o de quando a página abriu.
   */
  recarregar: () => Promise<{ unidades: Unidade[]; mesAplicado: string | null }>;
  /** A venda avulsa do meio do mês é em "Situação de cada unidade", na aba Unidades. */
  irParaSituacao: () => void;
}) {
  const aplicar = useAplicarTabela(propertyId);
  // Só as células que a Juliana editou, cada uma com a unidade como estava
  // quando ela digitou; o resto da grade é o estado gravado. Depois de gravar,
  // esvaziar basta para a grade mostrar o banco de novo.
  const [edicoes, setEdicoes] = useState<Record<string, CelulaEditada>>({});
  // A conferência é feita contra o banco relido no clique, e fica parada: o que
  // a Juliana confere é exatamente o que grava.
  const [conferida, setConferida] = useState<{ mes: string; c: ConferenciaDaTabela<Unidade> } | null>(null);
  const [relendo, setRelendo] = useState(false);
  const [problema, setProblema] = useState<string | null>(null);
  const [conferido, setConferido] = useState(false);
  const [aplicada, setAplicada] = useState<{ mes: string; mudaram: number } | null>(null);
  const painel = useRef<HTMLElement>(null);
  // Uma edição durante a releitura invalida a conferência que estava a caminho.
  const versao = useRef(0);
  // Sem seletor de mês: a tabela aplicada é sempre a do mês corrente. Mês
  // futuro deixaria o preço no site para sempre, e mês passado regravaria
  // preço velho sem tirar o "Consulte".
  const mes = mesCorrente();

  const previa = useMemo(() => conferirTabela(unidades, edicoes), [unidades, edicoes]);
  const grade = useMemo(() => montarGrade(unidades), [unidades]);
  const naGrade = useMemo(() => {
    const fora = new Set(grade.foraDaGrade.map((u) => u.id));
    return ordenarUnidades(unidades.filter((u) => !fora.has(u.id)));
  }, [unidades, grade]);
  const nomeDaPlanta = useMemo(() => new Map(plantas.map((p) => [p.id, p.name])), [plantas]);

  const texto = (u: Unidade) => edicoes[u.id]?.texto ?? textoDaCelula(u);
  // A legenda da célula editada compara com o que a Juliana via ao digitar.
  const vista = (u: Unidade) => edicoes[u.id]?.antes ?? u;
  const editar = (u: Unidade, valor: string) => {
    versao.current++;
    setEdicoes((e) => ({
      ...e,
      [u.id]: { texto: valor, antes: e[u.id]?.antes ?? { label: u.label, status: u.status, price_cents: u.price_cents } },
    }));
    setConferida(null);
    setConferido(false);
    setAplicada(null);
    setProblema(null);
  };
  const editadas = Object.values(edicoes).filter((e) => e.texto !== textoDaCelula(e.antes)).length;

  const erros = [...(conferida?.c.erros ?? previa.erros).entries()];
  const rotulo = (u: Pick<Unidade, 'label'>) => rotuloDaUnidade(tipo, u.label);

  useEffect(() => {
    if (conferida && !conferida.c.erros.size) painel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [conferida]);

  async function conferir() {
    const inicio = versao.current;
    setRelendo(true);
    setProblema(null);
    setAplicada(null);
    setConferido(false);
    try {
      const doBanco = await recarregar();
      if (versao.current !== inicio) return;
      const doMes = mesCorrente();
      setConferida({
        mes: doMes,
        c: conferirTabela(doBanco.unidades, edicoes, { aplicada: doBanco.mesAplicado, mes: doMes }),
      });
    } catch {
      setProblema('Não consegui reler as unidades para conferir. Confira a internet e tente de novo.');
    } finally {
      setRelendo(false);
    }
  }

  function gravar() {
    if (!conferida) return;
    // A conferência é do mês em que foi feita: se ele virou com a tela aberta,
    // os preços digitados são da tabela velha.
    if (mesCorrente() !== conferida.mes) {
      setConferida(null);
      setConferido(false);
      setProblema(
        `Virou o mês desde a conferência: a tabela de ${nomeDoMesDaTabela(conferida.mes)} não vale mais. Confira com a de ${nomeDoMesDaTabela(mesCorrente())}.`,
      );
      return;
    }
    const { mes: doMes, c } = conferida;
    aplicar.mutate(
      { mes: doMes, linhas: c.linhas },
      {
        onSuccess: (mudaram) => {
          setEdicoes({});
          setConferida(null);
          setConferido(false);
          setAplicada({ mes: doMes, mudaram });
        },
      },
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 rounded-lg bg-card p-5 shadow-card">
        <h2 className="text-lg font-bold">Tabela de {nomeDoMesDaTabela(mes)}</h2>
        <p className="max-w-[75ch] text-sm text-tx-3">
          Digite como está na tabela da construtora: o preço para disponível (840.569,40), <b>v</b> para vendida e{' '}
          <b>r</b> para reservada (mantém o preço; <b>r 850.000,00</b> troca). A grade começa com o que está gravado
          hoje, e só as células que você mudar vão para o banco. Enter desce para o andar de baixo.
        </p>
      </div>

      {grade.linhas.length > 0 && (
        <div className="hidden overflow-x-auto rounded-lg bg-card p-3 shadow-card md:block">
          <GradeDaTabela
            grade={grade}
            texto={texto}
            vista={vista}
            editar={editar}
            rotulo={rotulo}
            nomeDaPlanta={nomeDaPlanta}
          />
        </div>
      )}

      {/* No celular a grade não cabe: a mesma tabela vira lista. */}
      {naGrade.length > 0 && (
        <ListaDaTabela
          className="md:hidden"
          unidades={naGrade}
          texto={texto}
          vista={vista}
          editar={editar}
          rotulo={rotulo}
          nomeDaPlanta={nomeDaPlanta}
        />
      )}
      {grade.foraDaGrade.length > 0 && (
        <ListaDaTabela
          titulo={naGrade.length ? 'Sem andar na grade' : undefined}
          unidades={grade.foraDaGrade}
          texto={texto}
          vista={vista}
          editar={editar}
          rotulo={rotulo}
          nomeDaPlanta={nomeDaPlanta}
        />
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-lg bg-card p-4 shadow-card">
        <p className="min-w-[12rem] flex-1 text-sm text-tx-2">
          {erros.length ? (
            <b className="text-dng">
              {erros.length === 1 ? '1 célula para corrigir' : `${erros.length} células para corrigir`}: disponível sem
              preço não grava.
            </b>
          ) : editadas ? (
            contagem(editadas, 'célula editada', 'células editadas')
          ) : (
            'Nada digitado: a grade mostra o que está gravado.'
          )}
        </p>
        {editadas > 0 && (
          <button
            type="button"
            onClick={() => {
              versao.current++;
              setEdicoes({});
              setConferida(null);
            }}
            className={botaoSecundario}
          >
            <Undo2 className="h-3.5 w-3.5" />
            Desfazer
          </button>
        )}
        <button
          type="button"
          disabled={!!previa.erros.size || relendo}
          onClick={() => void conferir()}
          className={botaoPrimario}
        >
          {relendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
          Conferir
        </button>
      </div>

      {problema && <Erro>{problema}</Erro>}

      {erros.length > 0 && (
        <ul className="rounded-lg bg-dng-soft p-4 text-sm text-dng">
          {erros.map(([id, erro]) => {
            const u = unidades.find((x) => x.id === id);
            return (
              <li key={id}>
                <b>{u ? rotulo(u) : id}</b>: {erro}
              </li>
            );
          })}
        </ul>
      )}

      {aplicada && (
        <p role="status" className="rounded-lg bg-ok-soft p-4 text-base font-semibold text-ok">
          Tabela de {nomeDoMesDaTabela(aplicada.mes)} gravada:{' '}
          {aplicada.mudaram === 0 ? 'nenhuma unidade mudou' : contagem(aplicada.mudaram, 'unidade mudou', 'unidades mudaram')}.
          {tabelaVigente(aplicada.mes) ? ' O site já mostra os preços.' : ''}
        </p>
      )}

      {conferida && !conferida.c.erros.size && (
        <PainelDaConferencia
          alvo={painel}
          c={conferida.c}
          rotulo={rotulo}
          mes={conferida.mes}
          conferido={conferido}
          setConferido={setConferido}
          gravando={aplicar.isPending}
          erro={aplicar.isError ? (aplicar.error as Error).message : null}
          onVoltar={() => setConferida(null)}
          onGravar={gravar}
          irParaSituacao={irParaSituacao}
        />
      )}
    </section>
  );
}

interface Legenda {
  texto: string;
  ok: boolean;
  mudou: boolean;
  status: UnitStatus | null;
  /** Preço que caiu ou subiu mais de 10%: o mesmo destaque da conferência, já na célula. */
  alerta: boolean;
}

type Vista = Pick<Unidade, 'price_cents'> & { status: string };

/**
 * A legenda embaixo do valor, para a Juliana ver como o CRM leu o que ela
 * digitou. `u` é a unidade como a grade a mostrava quando ela digitou.
 */
function legendaDaCelula(u: Vista, t: string): Legenda {
  const leitura = lerCelula(t, u.price_cents);
  if (!leitura.ok) return { texto: 'Corrigir', ok: false, mudou: true, status: null, alerta: false };
  const mudou = leitura.status !== u.status || leitura.price_cents !== u.price_cents;
  if (leitura.status === 'vendido') return { texto: 'Vendida', ok: true, mudou, status: 'vendido', alerta: false };
  const v = u.status !== 'vendido' ? variacao(u.price_cents, leitura.price_cents) : null;
  const alerta = v !== null && (v < 0 || v > VARIACAO_SUSPEITA);
  if (leitura.status === 'reservado') {
    return {
      texto: leitura.price_cents != null ? `Reservada · ${formatarPreco(leitura.price_cents)}` : 'Reservada, sem preço',
      ok: true,
      mudou,
      status: 'reservado',
      alerta,
    };
  }
  return {
    texto: v ? `${formatarVariacao(v)} no preço` : u.status !== 'disponivel' ? 'Volta à venda' : 'Disponível',
    ok: true,
    mudou,
    status: 'disponivel',
    alerta,
  };
}

/**
 * A grade, como a tabela da construtora: andares nas linhas (do mais alto para
 * o mais baixo) e finais nas colunas. Tab anda para o lado, Enter desce.
 */
function GradeDaTabela({
  grade,
  texto,
  vista,
  editar,
  rotulo,
  nomeDaPlanta,
}: {
  grade: ReturnType<typeof montarGrade<Unidade>>;
  texto: (u: Unidade) => string;
  vista: (u: Unidade) => Vista;
  editar: (u: Unidade, valor: string) => void;
  rotulo: (u: Unidade) => string;
  nomeDaPlanta: Map<string, string>;
}) {
  const totalDeLinhas = grade.linhas.length;

  function mover(e: KeyboardEvent<HTMLInputElement>, linha: number, coluna: number) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const passo = e.shiftKey ? -1 : 1;
    // Pula o buraco (o andar que não tem aquele final).
    for (let l = linha + passo; l >= 0 && l < totalDeLinhas; l += passo) {
      const alvo = document.querySelector<HTMLInputElement>(`[data-celula="${l}-${coluna}"]`);
      if (alvo) {
        alvo.focus();
        return;
      }
    }
  }

  return (
    <table className="border-separate border-spacing-1">
      <thead>
        <tr>
          <th className="px-1 text-left text-2xs font-bold uppercase text-tx-3">Andar</th>
          {grade.finais.map((f) => (
            <th key={f} className="px-1 text-left text-2xs font-bold uppercase text-tx-3">
              Final {f}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {grade.linhas.map(({ andar, celulas }, l) => (
          <tr key={andar}>
            <th scope="row" className="pr-1 text-left text-sm font-semibold tabular-nums text-tx-3">
              {andar}º
            </th>
            {celulas.map((u, c) => {
              if (!u) return <td key={`vazio-${c}`} />;
              const t = texto(u);
              const base = vista(u);
              const leg = legendaDaCelula(base, t);
              const erro = lerCelula(t, base.price_cents);
              return (
                <td key={u.id}>
                  {/* O foco fica na célula inteira (o contorno escuro), e não no
                      campo de dentro: o anel do campo cobriria o valor. */}
                  <label
                    title={erro.ok ? undefined : erro.erro}
                    className={cn(
                      'block w-[7.75rem] rounded-md border px-1.5 pb-1 pt-0.5 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-tx',
                      leg.status ? COR_DA_SITUACAO[leg.status] : 'border-dng bg-dng-soft text-dng',
                      leg.mudou && leg.ok && 'ring-2 ring-pri',
                    )}
                  >
                    <span className="flex items-baseline justify-between text-2xs font-bold">
                      <span>{u.label}</span>
                      {leg.mudou && leg.ok && <span className="text-pri">mudou</span>}
                    </span>
                    <input
                      value={t}
                      onChange={(e) => editar(u, e.target.value)}
                      onFocus={(e) => e.currentTarget.select()}
                      onKeyDown={(e) => mover(e, l, c)}
                      data-celula={`${l}-${c}`}
                      aria-label={`${rotulo(u)}, ${nomeDaPlanta.get(u.floorplan_id) ?? ''}`}
                      aria-invalid={!erro.ok || undefined}
                      spellCheck={false}
                      autoComplete="off"
                      className="w-full bg-transparent text-sm font-semibold tabular-nums text-tx outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                    />
                    <span className={cn('block truncate text-2xs', leg.alerta && 'font-bold text-dng')}>{leg.texto}</span>
                  </label>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** A tabela em lista: situação num seletor e preço num campo, que escrevem a mesma célula da grade. */
function ListaDaTabela({
  unidades,
  texto,
  vista,
  editar,
  rotulo,
  nomeDaPlanta,
  titulo,
  className,
}: {
  unidades: Unidade[];
  texto: (u: Unidade) => string;
  vista: (u: Unidade) => Vista;
  editar: (u: Unidade, valor: string) => void;
  rotulo: (u: Unidade) => string;
  nomeDaPlanta: Map<string, string>;
  titulo?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {titulo && <h2 className="text-sm font-bold uppercase text-tx-3">{titulo}</h2>}
      <ul className="flex flex-col gap-2">
        {unidades.map((u) => {
          const t = texto(u);
          const base = vista(u);
          const partes = partesDaCelula(t, base.price_cents);
          const leg = legendaDaCelula(base, t);
          const erro = lerCelula(t, base.price_cents);
          return (
            <li
              key={u.id}
              className={cn(
                'rounded-lg border bg-card p-3 shadow-card',
                !leg.ok ? 'border-dng' : leg.mudou ? 'border-pri' : 'border-transparent',
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="min-w-[8rem] flex-1">
                  <b className="text-base font-bold">{rotulo(u)}</b>
                  <span className="block text-sm text-tx-3">{nomeDaPlanta.get(u.floorplan_id)}</span>
                </p>
                <select
                  value={partes.status}
                  onChange={(e) => {
                    const s = e.target.value as UnitStatus;
                    const preco = partes.preco || (base.price_cents != null ? formatarPreco(base.price_cents) : '');
                    editar(u, celulaDasPartes(s, s === 'vendido' ? '' : preco));
                  }}
                  aria-label={`Situação de ${rotulo(u)}`}
                  className={cn('rounded-xl border px-2.5 py-2 text-sm font-semibold outline-none', COR_DA_SITUACAO[partes.status])}
                >
                  {UNIT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {UNIT_STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
                <input
                  inputMode="decimal"
                  value={partes.preco}
                  disabled={partes.status === 'vendido'}
                  onChange={(e) => editar(u, celulaDasPartes(partes.status, e.target.value))}
                  onFocus={(e) => e.currentTarget.select()}
                  placeholder={partes.status === 'vendido' ? '—' : '840.569,40'}
                  aria-label={`Preço de ${rotulo(u)}`}
                  aria-invalid={!erro.ok || undefined}
                  className={cn(inputCls, 'w-36 py-2 tabular-nums disabled:opacity-50', !erro.ok && 'border-dng')}
                />
              </div>
              {!erro.ok ? (
                <p className="mt-1 text-sm font-semibold text-dng">{erro.erro}</p>
              ) : leg.mudou ? (
                <p className="mt-1 text-sm text-pri">Mudou: {leg.texto}</p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const ROTULO_DO_DESTAQUE: Record<Destaque, string> = {
  caiu: 'Caiu',
  subiu: 'Subiu mais de 10%',
  longe: 'Longe das outras',
};

/**
 * A conferência antes de gravar: o que muda, o "a partir de" novo ao lado do
 * anterior e os preços que pedem um segundo olhar. Com destaque, gravar exige
 * marcar que conferiu: um erro de digitação na mais barata vira o preço do
 * anúncio no site. O mesmo vale para a célula de uma unidade que outro
 * aparelho mudou depois que a grade abriu: gravar desfaz o que foi feito lá.
 * E para a primeira gravação do mês: ela faz da grade inteira a tabela do mês,
 * e quem só queria registrar uma venda publicaria os preços velhos como novos.
 */
function PainelDaConferencia({
  alvo,
  c,
  rotulo,
  mes,
  conferido,
  setConferido,
  gravando,
  erro,
  onVoltar,
  onGravar,
  irParaSituacao,
}: {
  /** Para a tela rolar até a conferência quando ela abre. */
  alvo: RefObject<HTMLElement>;
  c: ConferenciaDaTabela<Unidade>;
  rotulo: (u: Pick<Unidade, 'label'>) => string;
  mes: string;
  conferido: boolean;
  setConferido: (v: boolean) => void;
  gravando: boolean;
  erro: string | null;
  onVoltar: () => void;
  onGravar: () => void;
  irParaSituacao: () => void;
}) {
  const v = variacao(c.aPartirDeAntes, c.aPartirDeDepois);
  const bloqueado = c.exigeConferi && !conferido;
  const outros = c.outroAparelho.length;
  const oQueConferi = [
    c.destaques === 1
      ? 'com a tabela da construtora o preço em destaque'
      : c.destaques > 1
        ? `com a tabela da construtora os ${c.destaques} preços em destaque`
        : null,
    outros === 1
      ? 'a unidade que mudou em outro aparelho'
      : outros > 1
        ? `as ${outros} unidades que mudaram em outro aparelho`
        : null,
    c.tabelaNova ? `que os preços que não mudei são os da tabela de ${nomeDoMesDaTabela(mes)}` : null,
  ].filter((t): t is string => t !== null);

  return (
    <section
      ref={alvo}
      aria-label="Conferência da tabela"
      className="flex scroll-mt-4 flex-col gap-4 rounded-lg border-2 border-pri bg-card p-5 shadow-card"
    >
      <header>
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <ClipboardCheck className="h-4 w-4 text-pri" />
          Conferência da tabela de {nomeDoMesDaTabela(mes)}
        </h2>
        <p className="mt-0.5 text-sm text-tx-3">
          {c.mudaram === 0 ? 'Nenhuma unidade muda.' : `${contagem(c.mudaram, 'unidade muda', 'unidades mudam')}.`} Nada
          foi gravado ainda.
        </p>
      </header>

      {outros > 0 && (
        <div className="rounded-xl bg-dng-soft p-3 text-sm text-dng">
          <h3 className="font-bold">Mudou em outro aparelho desde que você abriu: confira</h3>
          <ul className="mt-1 flex flex-col gap-0.5">
            {c.outroAparelho.map((m) => (
              <li key={m.unidade.id}>
                <b>{rotulo(m.unidade)}</b>: você viu {descreverSituacao(m.visto)}; agora está{' '}
                {descreverSituacao(m.unidade)}; vai gravar <b>{descreverSituacao(m.vai)}</b>.
              </li>
            ))}
          </ul>
        </div>
      )}

      {c.apagadas.length > 0 && (
        <p className="rounded-xl bg-warn-soft p-3 text-sm font-semibold text-warn">
          {c.apagadas.map((label) => rotulo({ label })).join(', ')}{' '}
          {c.apagadas.length === 1 ? 'foi apagada' : 'foram apagadas'} em outro aparelho: o que você digitou{' '}
          {c.apagadas.length === 1 ? 'nela fica' : 'nelas fica'} de fora.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className={cn('rounded-xl p-3', c.aPartirDeCaiu ? 'bg-dng-soft text-dng' : 'bg-card-2')}>
          <p className="text-2xs font-bold uppercase text-tx-3">“A partir de”: o preço do anúncio</p>
          <p className="mt-1 text-base">
            <span className="tabular-nums text-tx-3">
              {c.aPartirDeAntes != null ? reaisComCentavos(c.aPartirDeAntes) : 'sem preço'}
            </span>{' '}
            →{' '}
            <b className="text-lg tabular-nums">
              {c.aPartirDeDepois != null ? reaisComCentavos(c.aPartirDeDepois) : 'sem preço'}
            </b>
            {v ? <span className="tabular-nums"> ({formatarVariacao(v)})</span> : null}
          </p>
          {c.unidadeDoAPartirDe && <p className="text-sm">Vem do {rotulo(c.unidadeDoAPartirDe)}.</p>}
          {c.aPartirDeCaiu && (
            <p className="mt-1 text-sm font-semibold">
              Baixou. Confira esse preço na tabela da construtora: um erro de digitação na mais barata vira o preço do
              anúncio.
            </p>
          )}
        </div>
        <div className="rounded-xl bg-card-2 p-3">
          <p className="text-2xs font-bold uppercase text-tx-3">Disponíveis</p>
          <p className="mt-1 text-base">
            <span className="tabular-nums text-tx-3">{c.antes.disponiveis}</span> →{' '}
            <b className="text-lg tabular-nums">{c.depois.disponiveis}</b>
          </p>
          <p className="text-sm text-tx-3">
            {contagem(c.depois.reservadas, 'reservada', 'reservadas')} ·{' '}
            {contagem(c.depois.total - c.depois.disponiveis - c.depois.reservadas, 'vendida', 'vendidas')}
          </p>
        </div>
      </div>

      {c.precos.length > 0 && <ListaDeMudancas titulo={`Preço novo (${c.precos.length})`} itens={c.precos} rotulo={rotulo} />}
      {c.voltaram.length > 0 && (
        <ListaDeMudancas titulo={`Voltam à venda (${c.voltaram.length})`} itens={c.voltaram} rotulo={rotulo} />
      )}
      {c.reservadas.length > 0 && (
        <ListaDeMudancas titulo={`Reservadas (${c.reservadas.length})`} itens={c.reservadas} rotulo={rotulo} />
      )}
      {c.vendidas.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-sm font-bold uppercase text-tx-3">Vendidas ({c.vendidas.length})</h3>
          <div className="flex flex-wrap gap-1">
            {c.vendidas.map((u) => (
              <span key={u.id} className={cn('rounded border px-1.5 py-0.5 text-xs font-semibold', COR_DA_SITUACAO.vendido)}>
                {rotulo(u)}
              </span>
            ))}
          </div>
        </div>
      )}

      {c.mudaram === 0 && (
        <p className="rounded-xl bg-card-2 p-3 text-sm text-tx-2">
          Os preços e as situações ficam como estão no banco.
          {!c.tabelaNova && ` Gravar registra a tabela de ${nomeDoMesDaTabela(mes)}, o mês corrente.`}
        </p>
      )}

      {/* Mesmo com mudanças: o que não mudou também vira a tabela do mês. */}
      {c.tabelaNova && (
        <p className="rounded-xl bg-warn-soft p-3 text-sm font-semibold text-warn">
          Gravar aplica a tabela de {nomeDoMesDaTabela(mes)}: os preços que você não mudou passam a valer como de{' '}
          {nomeDoMesDaTabela(mes)}, e o site deixa de mostrar “Consulte”. Para registrar só uma venda, use{' '}
          <button type="button" onClick={irParaSituacao} className="underline hover:no-underline">
            “Situação de cada unidade”
          </button>
          .
        </p>
      )}

      {c.exigeConferi && (
        <label className="flex items-start gap-2 rounded-xl bg-warn-soft p-3 text-sm font-semibold text-warn">
          <input
            type="checkbox"
            checked={conferido}
            onChange={(e) => setConferido(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-warn"
          />
          Conferi {juntarComE(oQueConferi)}.
        </label>
      )}

      {erro && <Erro>{erro}</Erro>}

      <footer className="flex flex-wrap gap-2.5">
        <button type="button" onClick={onVoltar} className={cn(botaoSecundario, 'flex-1')}>
          Voltar e corrigir
        </button>
        <button type="button" onClick={onGravar} disabled={gravando || bloqueado} className={cn(botaoPrimario, 'flex-1')}>
          {gravando && <Loader2 className="h-4 w-4 animate-spin" />}
          Gravar a tabela de {nomeDoMesDaTabela(mes)}
        </button>
      </footer>
    </section>
  );
}

/** "Disponível · R$ 840.569,40"; a vendida vai sem preço, porque o site não a mostra. */
function descreverSituacao(u: { status: string; price_cents: number | null }): string {
  const nome = UNIT_STATUS_LABEL[u.status as UnitStatus] ?? u.status;
  return u.status !== 'vendido' && u.price_cents != null ? `${nome} · ${reaisComCentavos(u.price_cents)}` : nome;
}

function ListaDeMudancas({
  titulo,
  itens,
  rotulo,
}: {
  titulo: string;
  itens: MudancaDePreco<Unidade>[];
  rotulo: (u: Unidade) => string;
}) {
  return (
    <div>
      <h3 className="mb-1.5 text-sm font-bold uppercase text-tx-3">{titulo}</h3>
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
        {itens.map((m) => (
          <li
            key={m.unidade.id}
            className={cn(
              'flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-2 text-sm',
              m.destaque === 'caiu' ? 'bg-dng-soft' : m.destaque ? 'bg-warn-soft' : '',
            )}
          >
            <b className="min-w-[6rem]">{rotulo(m.unidade)}</b>
            {/* A reservada que mantém o preço não tem "de → para". */}
            {m.de !== m.para && (
              <>
                <span className="tabular-nums text-tx-3">{m.de != null ? reaisComCentavos(m.de) : 'sem preço'}</span>
                <span aria-hidden>→</span>
              </>
            )}
            <b className="tabular-nums">{m.para != null ? reaisComCentavos(m.para) : 'sem preço'}</b>
            {m.variacao ? <span className="tabular-nums text-tx-2">{formatarVariacao(m.variacao)}</span> : null}
            {m.destaque && (
              <span
                className={cn(
                  'ml-auto rounded-full px-2 py-0.5 text-2xs font-bold uppercase',
                  m.destaque === 'caiu' ? 'bg-dng text-pri-fg' : 'bg-warn text-white',
                )}
              >
                {ROTULO_DO_DESTAQUE[m.destaque]}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ========================================================================== */
/* Peças                                                                      */
/* ========================================================================== */

const inputCls =
  'w-full rounded-xl border border-line-2 bg-card px-3 py-2.5 text-md outline-none transition-colors focus:border-pri';
const botaoPrimario =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-pri px-4 py-2.5 text-md font-semibold text-pri-fg hover:bg-pri-deep disabled:opacity-60';
const botaoSecundario =
  'inline-flex items-center justify-center gap-1.5 rounded-xl border border-line-2 bg-card px-3 py-2.5 text-md font-semibold text-tx-2 hover:text-tx';

function Campo({ rotulo, children, className }: { rotulo: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('flex flex-col gap-1.5', className)}>
      <span className="text-sm font-semibold text-tx-2">{rotulo}</span>
      {children}
    </label>
  );
}

function Erro({ children }: { children: ReactNode }) {
  return <p className="mt-3 rounded-md bg-dng-soft px-3 py-2 text-base text-dng">{children}</p>;
}

function Vazio({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-line-2 py-10 text-center text-base text-tx-3">{children}</p>;
}
