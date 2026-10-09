import { useMemo, useState } from 'react';
import { Loader2, AlertCircle, ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react';
import {
  META_AD_LEVEL_LABEL,
  formatarGasto,
  custoPorResultado,
  tipoDeResultado,
  resultadoDaLinha,
  type MetaAdLevel,
} from '@contracts';
import {
  useCampanhasNoPainel,
  useAlternarCampanhaNoPainel,
  type LinhaDeGasto,
} from '@/hooks/useMeta';
import {
  PRIMEIRO_CLIQUE,
  colunasDaTabela,
  ordenar,
  type ChaveDeOrdem,
  type LinhaCalculada,
  type Ordem,
} from '@/lib/anuncios';
import { cn } from '@/lib/utils';
import { LinhaDeDesempenho } from './LinhaDeDesempenho';

function Cabecalho({
  chave,
  ordem,
  aoClicar,
  direita,
  titulo,
  children,
}: {
  chave: ChaveDeOrdem;
  ordem: Ordem;
  aoClicar: (c: ChaveDeOrdem) => void;
  direita?: boolean;
  titulo?: string;
  children: React.ReactNode;
}) {
  const ativa = ordem.chave === chave;
  const Seta = !ativa ? ChevronsUpDown : ordem.desc ? ArrowDown : ArrowUp;

  return (
    <th
      scope="col"
      // `aria-sort` é o que faz um leitor de tela anunciar a ordem. Sem ele a
      // seta é informação só para quem enxerga.
      aria-sort={ativa ? (ordem.desc ? 'descending' : 'ascending') : 'none'}
      className={cn('px-2 py-2 font-semibold', direita ? 'text-right' : 'text-left')}
    >
      <button
        type="button"
        onClick={() => aoClicar(chave)}
        title={titulo ?? 'Ordenar por esta coluna'}
        className={cn(
          'inline-flex items-center gap-1 rounded-sm transition-colors hover:text-tx',
          direita && 'flex-row-reverse',
          ativa && 'text-tx',
        )}
      >
        {children}
        <Seta className={cn('h-3 w-3 shrink-0', ativa ? 'text-pri' : 'opacity-35')} />
      </button>
    </th>
  );
}

export function TabelaDeDesempenho({
  linhas,
  carregando,
  nivel,
  erro,
  filtrando,
  ehHoje,
}: {
  linhas: LinhaDeGasto[];
  carregando: boolean;
  nivel: MetaAdLevel;
  erro: string | null;
  filtrando: boolean;
  ehHoje: boolean;
}) {
  /*
   * Os ganchos vêm ANTES dos retornos curtos — carregando, erro, lista vazia.
   * Chamados depois, a quantidade de ganchos mudaria entre uma renderização e
   * outra e o React quebra a tela inteira com "rendered fewer hooks than
   * expected".
   */
  // O padrão é o mesmo que o banco já devolvia: mais caro em cima.
  const [ordem, setOrdem] = useState<Ordem>({ chave: 'gasto', desc: true });
  const noPainel = useCampanhasNoPainel();
  const alternar = useAlternarCampanhaNoPainel();

  const calculadas = useMemo<LinhaCalculada[]>(
    () =>
      linhas.map((l) => {
        const tipo = tipoDeResultado(l.objective, l.cadastros, l.conversas);
        const resultados = resultadoDaLinha(tipo, l);
        return { l, tipo, resultados, custo: custoPorResultado(l.spend_minor, resultados) };
      }),
    [linhas],
  );

  const ordenadas = useMemo(() => ordenar(calculadas, ordem), [calculadas, ordem]);

  const aoClicar = (chave: ChaveDeOrdem) =>
    setOrdem((o) => (o.chave === chave ? { chave, desc: !o.desc } : { chave, desc: PRIMEIRO_CLIQUE[chave] }));

  if (carregando) {
    return (
      <p className="flex items-center gap-2 py-6 text-base text-tx-3">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
      </p>
    );
  }

  if (erro) {
    return (
      <p className="flex items-start gap-2 rounded-xl bg-dng-soft p-3 text-sm text-dng">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Não foi possível ler o gasto. {erro}
      </p>
    );
  }

  if (linhas.length === 0) {
    /*
     * Duas ausências diferentes, duas frases diferentes.
     *
     * "Nenhum gasto no período" com o filtro ligado seria mentira: o gasto
     * existe, o que não existe é nada entregando agora. Quem lesse a frase
     * errada iria conferir a importação em vez de olhar o gerenciador.
     */
    return filtrando ? (
      <p className="py-6 text-base text-tx-3">
        Nada no ar neste período. Desligue <b>Só no ar</b> para ver o que já rodou.
      </p>
    ) : ehHoje ? (
      /*
       * "Hoje" vazio de manhã cedo é o normal, não defeito. O gasto é lido de
       * hora em hora, aos 7 minutos; antes da primeira leitura do dia não há o
       * que mostrar — e a frase de "acabou de conectar" mandaria a pessoa
       * conferir a importação à toa.
       */
      <p className="py-6 text-base text-tx-3">
        Nenhum gasto hoje ainda. O gasto é lido de hora em hora, aos 7 minutos — o que a Meta já
        contou do dia aparece na próxima leitura.
      </p>
    ) : (
      <p className="py-6 text-base text-tx-3">
        Nenhum gasto no período. Se você acabou de conectar, a primeira importação roda na próxima
        hora — ou clique em <b>Importar agora</b> acima.
      </p>
    );
  }

  const totalGasto = linhas.reduce((s, l) => s + l.spend_minor, 0);
  const moeda = linhas[0]?.currency ?? 'BRL';
  // Moedas diferentes não se somam. Se houver mais de uma, o total vira '—'.
  const umaMoeda = linhas.every((l) => l.currency === moeda);

  /*
   * O total sai POR TIPO, e nunca somado.
   *
   * "18 resultados" quando 5 são cadastro de formulário e 13 são conversa de
   * WhatsApp é um número que não responde pergunta nenhuma — nem "quantos
   * cadastros eu tive", nem "quantas conversas". A Meta soma assim no
   * Gerenciador; aqui não.
   */
  const totais = calculadas.reduce(
    (acc, x) => {
      if (x.resultados != null) acc[x.tipo] += x.resultados;
      return acc;
    },
    { cadastro: 0, conversa: 0, clique: 0 },
  );

  const { mostrarCampanha, rotulo: colsDeRotulo, cauda: colsDaCauda } = colunasDaTabela(nivel);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] border-collapse text-base">
        <thead>
          {/*
            Todo cabeçalho ordena. Ordenar por "Conta" é o que junta numa faixa
            só tudo que saiu da mesma conta — que era a pergunta com duas contas
            ligadas e as linhas intercaladas.
          */}
          <tr className="border-b border-line text-sm text-tx-3">
            <Cabecalho chave="nome" ordem={ordem} aoClicar={aoClicar}>
              {META_AD_LEVEL_LABEL[nivel]}
            </Cabecalho>
            {mostrarCampanha && (
              <Cabecalho chave="campanha" ordem={ordem} aoClicar={aoClicar}>
                Campanha
              </Cabecalho>
            )}
            <Cabecalho
              chave="conta"
              ordem={ordem}
              aoClicar={aoClicar}
              titulo="Agrupa as linhas de cada conta de anúncio"
            >
              Conta
            </Cabecalho>
            <Cabecalho chave="gasto" ordem={ordem} aoClicar={aoClicar} direita titulo="Quem gastou mais">
              Gasto
            </Cabecalho>
            {/* Sem plural fixo: cada linha diz se são cadastros ou conversas. */}
            <Cabecalho
              chave="resultados"
              ordem={ordem}
              aoClicar={aoClicar}
              direita
              titulo="Quem teve mais resultado"
            >
              Resultados
            </Cabecalho>
            <Cabecalho
              chave="custo"
              ordem={ordem}
              aoClicar={aoClicar}
              direita
              // Abre no MENOR: é a pergunta que a coluna responde. Quem ainda
              // não tem custo fica no fim, nos dois sentidos.
              titulo="Menor custo primeiro"
            >
              Custo
            </Cabecalho>
            <Cabecalho chave="cliques" ordem={ordem} aoClicar={aoClicar} direita>
              Cliques
            </Cabecalho>
            {nivel === 'ad' && (
              <Cabecalho
                chave="crm"
                ordem={ordem}
                aoClicar={aoClicar}
                direita
                titulo="Leads que realmente entraram no CRM, por atribuição de primeiro toque"
              >
                No CRM
              </Cabecalho>
            )}
          </tr>
        </thead>
        <tbody>
          {ordenadas.map((x) => (
            <LinhaDeDesempenho
              key={x.l.object_id}
              x={x}
              nivel={nivel}
              mostrarCampanha={mostrarCampanha}
              noPainel={noPainel.data?.[x.l.object_id] ?? true}
              ocupado={alternar.isPending}
              onAlternar={(conta) => alternar.mutate({ objectId: x.l.object_id, conta })}
            />
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-line font-bold">
            {/* O "Total" cobre as colunas de TEXTO — nome, campanha e conta. Se
                o número de colunas mudar sem que estas contas mudem junto, o
                rodapé desalinha das colunas de cima e o total aparece embaixo
                do número errado. */}
            <td className="px-2 py-2.5" colSpan={colsDeRotulo}>
              Total
            </td>
            <td className="px-2 py-2.5 text-right tabular-nums">
              {umaMoeda ? (
                formatarGasto(totalGasto, moeda)
              ) : (
                <span className="text-tx-3" title="Há contas em moedas diferentes">
                  —
                </span>
              )}
            </td>
            <td className="px-2 py-2.5 text-right text-sm tabular-nums">
              <span className="flex flex-col items-end gap-0.5">
                {totais.cadastro > 0 && <span>{totais.cadastro} cadastros</span>}
                {totais.conversa > 0 && <span>{totais.conversa} conversas</span>}
                {totais.cadastro === 0 && totais.conversa === 0 && (
                  <span className="text-tx-3">—</span>
                )}
              </span>
            </td>
            {/* Custo, cliques e — no nível do anúncio — "No CRM". */}
            <td colSpan={colsDaCauda} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
