import type { RefObject } from 'react';
import { ClipboardCheck, Loader2 } from 'lucide-react';
import { UNIT_STATUS_LABEL, nomeDoMesDaTabela, reaisComCentavos, type UnitStatus } from '@contracts';
import type { Unidade } from '@/hooks/useUnidades';
import { COR_DA_SITUACAO } from '@/components/properties/Empreendimento';
import { contagem } from '@/lib/contagem';
import {
  formatarVariacao,
  juntarComE,
  variacao,
  type ConferenciaDaTabela,
  type Destaque,
  type MudancaDePreco,
} from '@/lib/unidades';
import { cn } from '@/lib/utils';
import { Erro, botaoPrimario, botaoSecundario } from './Formulario';

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
export function PainelDaConferencia({
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
