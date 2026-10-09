import { useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardCheck, Loader2, Undo2 } from 'lucide-react';
import { mesCorrente, nomeDoMesDaTabela, rotuloDaUnidade, tabelaVigente, type PropertyType } from '@contracts';
import { useAplicarTabela, type Planta, type Unidade } from '@/hooks/useUnidades';
import { contagem } from '@/lib/contagem';
import {
  conferirTabela,
  montarGrade,
  ordenarUnidades,
  textoDaCelula,
  type CelulaEditada,
  type ConferenciaDaTabela,
} from '@/lib/unidades';
import { Erro, botaoPrimario, botaoSecundario } from './Formulario';
import { GradeDaTabela } from './GradeDaTabela';
import { ListaDaTabela } from './ListaDaTabela';
import { PainelDaConferencia } from './PainelDaConferencia';

export function SecaoTabela({
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
