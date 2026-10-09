import { useMemo, useState } from 'react';
import { Loader2, TriangleAlert, Info } from 'lucide-react';
import { formatarGasto } from '@contracts';
import { useInteligencia } from '@/hooks/useInteligencia';
import { PERIODOS, janelaDe, periodoInicial, type ChaveDePeriodo } from '@/hooks/usePainel';
import { acharProblemas, type Achado, type Inteligencia as Dados } from '@/inteligencia';
import { PorAngulo } from '@/components/inteligencia/PorAngulo';
import { AVolta } from '@/components/inteligencia/AVolta';
import { Cadeia } from '@/components/inteligencia/Cadeia';
import { MetaDeCpl } from '@/components/inteligencia/MetaDeCpl';
import { Achados } from '@/components/inteligencia/Achados';
import { Linha } from '@/components/inteligencia/LinhaDaCampanha';
import { cn } from '@/lib/utils';

/**
 * A MESA DE DECISÃO DE VERBA.
 *
 * A tela não tenta responder "qual campanha é a melhor" — com um a cinco leads
 * por dia espalhados por doze campanhas, essa pergunta não tem resposta, e
 * fingir que tem é como ela erraria.
 *
 * Ela responde três outras, que têm:
 *
 *   quanto de verba está saindo, e por onde;
 *   quanto disso deixa rastro até o CRM;
 *   o que a conta INTEIRA está dizendo — que é onde mora o volume.
 *
 * A peça de desenho que carrega tudo isso é a barra de faixa do custo por lead.
 * Um número sozinho ("R$ 8,64") convida à decisão; o mesmo número com a faixa
 * desenhada ao redor ("de R$ 4,05 a — não sabemos") desconvida na mesma
 * olhada, sem precisar de um parágrafo de aviso que ninguém lê.
 */

/* -------------------------------------------------------------------------- */

function Cartao({
  titulo,
  valor,
  nota,
  alerta,
}: {
  titulo: string;
  valor: string;
  nota?: string | null;
  alerta?: boolean;
}) {
  return (
    <div className="rounded-md bg-card p-4 shadow-card">
      <div className="text-2xs font-semibold uppercase text-tx-3">{titulo}</div>
      <div className={cn('mt-1.5 text-2xl font-bold', alerta && 'text-dng')}>{valor}</div>
      {nota ? <div className="mt-0.5 text-xs text-tx-3">{nota}</div> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * A tela, separada de quem busca o dado.
 *
 * A separação existe para haver um lugar onde OLHAR o desenho sem produção:
 * a prévia de desenvolvimento monta este componente com um retrato real
 * capturado do banco. É o mesmo recurso que os modelos de landing page já usam,
 * e pela mesma razão — desenho que só pode ser visto entrando na conta do
 * cliente é desenho que ninguém revisa.
 */
export function PainelDeInteligencia({
  data,
  chave,
  setChave,
}: {
  data: Dados;
  chave: ChaveDePeriodo;
  setChave: (c: ChaveDePeriodo) => void;
}) {
  const achados = useMemo(() => (!data.erro ? acharProblemas(data) : []), [data]);

  if (data.erro) {
    return (
      <div className="rounded-md bg-card p-8 shadow-card">
        <h1 className="text-xl font-bold">Área restrita</h1>
        <p className="mt-2 max-w-[52ch] text-md text-tx-2">
          Esta área é do administrador da imobiliária.
        </p>
      </div>
    );
  }

  return <Corpo data={data} achados={achados} chave={chave} setChave={setChave} />;
}

export default function Inteligencia() {
  const [chave, setChave] = useState<ChaveDePeriodo>(periodoInicial);
  const janela = useMemo(() => janelaDe(chave), [chave]);
  const { data, isLoading, error } = useInteligencia(janela.de, janela.ate);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-20 text-base text-tx-3">
        <Loader2 className="h-4 w-4 animate-spin" />
        Juntando gasto, lead e funil…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-md bg-card p-8 shadow-card">
        <h1 className="text-xl font-bold">Não deu para carregar</h1>
        <p className="mt-2 text-md text-tx-2">
          A consulta falhou. Se persistir, verifique a conexão com a Meta em Anúncios.
        </p>
      </div>
    );
  }

  return <PainelDeInteligencia data={data} chave={chave} setChave={setChave} />;
}

function Corpo({
  data,
  achados,
  chave,
  setChave,
}: {
  data: Dados;
  achados: Achado[];
  chave: ChaveDePeriodo;
  setChave: (c: ChaveDePeriodo) => void;
}) {
  const moeda = data.resumo.moeda ?? 'BRL';
  const janela = janelaDe(chave);
  const misturada = data.resumo.moedas > 1;
  const cob = data.cobertura;
  const pctCobertura = cob.leads > 0 ? Math.round((cob.na_tela / cob.leads) * 100) : null;

  // O custo por lead da CONTA — o único com volume para significar alguma coisa
  // nesta escala, e por isso o número grande do topo.
  const leadsNaTela = data.campanhas.reduce((t, c) => t + c.leads, 0);
  const cplConta = data.resumo.gasto != null && leadsNaTela > 0 ? data.resumo.gasto / leadsNaTela : null;

  /*
   * Ordem: quem gasta mais em cima.
   *
   * Não é ranking por eficiência de propósito. Ordenar por custo por lead
   * colocaria em primeiro a campanha de três leads que teve sorte — e a
   * primeira linha de uma tabela é lida como recomendação, mesmo sem rótulo
   * nenhum. Gasto é um fato sobre reais, não sobre amostra.
   */
  const campanhas = [...data.campanhas].sort((a, b) => b.gasto - a.gasto);
  const ativas = campanhas.filter((c) => (c.status ?? '').toUpperCase() === 'ACTIVE');
  const paradas = campanhas.filter((c) => (c.status ?? '').toUpperCase() !== 'ACTIVE');

  return (
    <div className="flex flex-col gap-5 pb-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Inteligência</h1>
          <p className="mt-0.5 text-sm text-tx-2">
            Onde a verba está entrando, e quanto dela chega ao CRM.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {data.teto_cpl != null ? (
            <MetaDeCpl alvo={data.meta_cpl} teto={data.teto_cpl} moeda={moeda} compacto />
          ) : null}
          <div className="flex gap-1 rounded-full bg-card p-1 shadow-card">
            {PERIODOS.filter((p) => p.key !== 'personalizado').map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setChave(p.key)}
                className={cn(
                  'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                  chave === p.key ? 'bg-pri text-pri-fg' : 'text-tx-2 hover:text-tx',
                )}
              >
                {p.rotulo}
              </button>
            ))}
          </div>
        </div>
      </header>

      {data.teto_cpl == null || data.meta_cpl == null ? (
        <MetaDeCpl alvo={data.meta_cpl} teto={data.teto_cpl} moeda={moeda} />
      ) : null}

      {!data.sincronizacao.ok ? (
        <div className="flex items-start gap-2 rounded-md border border-warn/40 bg-warn-soft/40 p-3">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
          <p className="text-sm text-tx-2">
            A última importação de gasto não terminou bem. Enquanto isso, nenhum veredito é emitido —
            número instável não sustenta decisão de cortar verba.
          </p>
        </div>
      ) : null}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Cartao
          titulo="Investido"
          valor={misturada ? '—' : formatarGasto(data.resumo.gasto, moeda)}
          nota={
            misturada
              ? `${data.resumo.moedas} moedas — não somamos`
              : `${data.resumo.campanhas} campanhas · ${data.resumo.contas} contas`
          }
        />
        <Cartao
          titulo="Leads no CRM"
          valor={String(cob.leads)}
          nota={`${cob.na_tela} com anúncio identificado`}
        />
        <Cartao
          titulo="Custo por lead"
          valor={cplConta == null ? '—' : formatarGasto(Math.round(cplConta), moeda)}
          nota="da conta inteira, onde há volume"
        />
        <Cartao
          titulo="Cobertura"
          valor={pctCobertura == null ? '—' : `${pctCobertura}%`}
          nota="dos leads casam com gasto"
          alerta={pctCobertura != null && pctCobertura < 70}
        />
      </section>

      <Achados lista={achados} />

      {/* Antes da tabela de campanhas de propósito: "qual argumento traz gente"
          é a pergunta que muda o criativo de amanhã; "qual campanha gastou" é a
          que muda o orçamento de hoje. A primeira decide a segunda. */}
      <PorAngulo de={janela.de} ate={janela.ate} moeda={moeda} />

      {/* Logo depois do ângulo, e antes das campanhas: o ângulo diz qual
          argumento traz gente, esta diz o que acontece com a gente que veio.
          As duas juntas respondem a pergunta que o custo por lead não
          responde — de que adianta o anúncio barato se o lead dele não anda. */}
      <Cadeia de={janela.de} ate={janela.ate} moeda={moeda} />

      {/* Depois do angulo e antes das campanhas: o angulo diz o que a Meta
          entregou, este cartao diz o que ela ficou sabendo em troca. Os dois
          juntos sao o ciclo — e ele so fecha quando a volta existe. */}
      <AVolta />

      <section className="rounded-md bg-card shadow-card">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-4">
          <h2 className="text-md font-bold">Campanhas no ar</h2>
          <span className="text-2xs text-tx-3">
            ordenadas por gasto — não por eficiência, para a primeira linha não parecer recomendação
          </span>
        </div>
        <div className="mt-3">
          {ativas.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-tx-3">Nenhuma campanha ativa no período.</p>
          ) : (
            ativas.map((c) => <Linha key={c.id} c={c} d={data} moeda={moeda} />)
          )}
        </div>
      </section>

      {paradas.length > 0 ? (
        <section className="rounded-md bg-card shadow-card">
          <div className="px-4 pt-4">
            <h2 className="text-md font-bold">Já paradas, com gasto no período</h2>
            <p className="text-sm text-tx-2">
              Histórico. O dinheiro já saiu e não há ação possível aqui — elas aparecem para o total
              fechar.
            </p>
          </div>
          <div className="mt-3">
            {paradas.map((c) => (
              <Linha key={c.id} c={c} d={data} moeda={moeda} />
            ))}
          </div>
        </section>
      ) : null}

      <footer className="flex items-start gap-2 rounded-md border border-line px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-tx-3" />
        <div className="text-sm text-tx-3">
          <p className="max-w-[80ch]">
            <span className="font-semibold text-tx-2">O que ainda não medimos:</span> alcance e
            frequência (a Meta só os entrega por período fechado, e somar dia a dia contaria a mesma
            pessoa várias vezes), criativo como entidade própria, e o valor da proposta separado do
            valor da venda. Enquanto não medirmos, estes campos ficam em branco em vez de estimados.
          </p>
          <p className="mt-1.5 max-w-[80ch]">
            Os três últimos dias ainda podem mudar: a Meta revisa gasto retroativamente por até 28
            dias.
            {data.sincronizacao.quando
              ? ` Última leitura em ${new Date(data.sincronizacao.quando).toLocaleString('pt-BR')}.`
              : ''}
          </p>
        </div>
      </footer>
    </div>
  );
}
