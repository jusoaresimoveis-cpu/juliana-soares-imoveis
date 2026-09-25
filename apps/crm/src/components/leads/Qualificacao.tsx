import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Loader2, Save } from 'lucide-react';
import {
  AVISO_DEPENDE_DE_BANCO,
  ENCAIXES_FINANCEIROS,
  ENCAIXE_FINANCEIRO_LABEL,
  FINALIDADES,
  FINALIDADE_LABEL,
  PRAZOS_DE_COMPRA,
  PRAZO_DE_COMPRA_LABEL,
  TEMPERATURAS,
  TEMPERATURA_LABEL,
  explicarTemperatura,
  type EncaixeFinanceiro,
  type Finalidade,
  type PrazoDeCompra,
  type Temperatura,
} from '@contracts';
import { useSalvarLead, type LeadFull } from '@/hooks/useLead';
import { SeloDeTemperatura } from './SeloDeTemperatura';

const campoCls =
  'w-full rounded-xl border border-line-2 bg-card-2 px-3 py-2.5 text-md outline-none transition-colors focus:border-pri';

type Respostas = {
  finalidade: Finalidade | '';
  prazo_compra: PrazoDeCompra | '';
  encaixe_financeiro: EncaixeFinanceiro | '';
};

function iguais(a: Respostas, b: Respostas): boolean {
  return (
    a.finalidade === b.finalidade &&
    a.prazo_compra === b.prazo_compra &&
    a.encaixe_financeiro === b.encaixe_financeiro
  );
}

function respostasDe(lead: LeadFull): Respostas {
  return {
    finalidade: lead.finalidade ?? '',
    prazo_compra: lead.prazo_compra ?? '',
    encaixe_financeiro: lead.encaixe_financeiro ?? '',
  };
}

/**
 * O que a pessoa disse, e a temperatura que sai disso.
 *
 * É o PRIMEIRO cartão da ficha, acima dos dados de contato. Quem abre um lead
 * quer saber quem é aquela pessoa e o que ela quer antes de conferir se o
 * telefone está certo.
 *
 * DUAS FORMAS DE SALVAR, E É DE PROPÓSITO
 *
 * As três respostas salvam JUNTAS, num botão. Cada gravação vira uma linha no
 * histórico (é um gatilho no banco, a 120), e três selects salvando sozinhos
 * deixariam três linhas seguidas — "incompleta", "morno", "quente" — para uma
 * conversa só.
 *
 * A marcação manual salva NA HORA, como a etapa e o responsável: é uma decisão
 * única, e um botão de salvar para um campo só é um clique a mais que a pessoa
 * esquece de dar.
 *
 * O selo nunca é calculado aqui. Ele vem do banco depois de salvar — a regra
 * mora lá, e uma segunda cópia dela nesta tela um dia discordaria da primeira.
 */
export function Qualificacao({ lead }: { lead: LeadFull }) {
  const salvar = useSalvarLead(lead.id);
  const [f, setF] = useState<Respostas>(() => respostasDe(lead));

  /*
   * Outra pessoa, ou o leitor do WhatsApp, pode preencher enquanto a ficha está
   * aberta. O que chega do banco substitui o que está na tela — MENOS quando há
   * edição em curso: aí quem manda é quem está escolhendo, e as escolhas dele
   * não somem porque uma consulta voltou.
   *
   * "Edição em curso" é o formulário diferente do ÚLTIMO valor que o banco
   * mandou, e por isso esse valor fica guardado numa referência.
   */
  const { finalidade, prazo_compra, encaixe_financeiro } = lead;
  const doBanco = respostasDe(lead);
  const ultimoDoBanco = useRef(doBanco);
  useEffect(() => {
    const antes = ultimoDoBanco.current;
    const agora: Respostas = {
      finalidade: finalidade ?? '',
      prazo_compra: prazo_compra ?? '',
      encaixe_financeiro: encaixe_financeiro ?? '',
    };
    ultimoDoBanco.current = agora;
    setF((atual) => (iguais(atual, antes) ? agora : atual));
  }, [finalidade, prazo_compra, encaixe_financeiro]);

  const mudou = !iguais(f, doBanco);

  return (
    <div className="rounded-lg bg-card p-5 shadow-card">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold">Qualificação</h2>
        <SeloDeTemperatura
          valor={lead.temperatura}
          manual={Boolean(lead.temperatura_manual)}
          vazio="avisar"
        />
      </div>
      <p className="mb-3 text-sm text-tx-3">{explicarTemperatura(lead)}</p>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-tx-2">O que procura</span>
          <select
            value={f.finalidade}
            onChange={(e) => setF({ ...f, finalidade: e.target.value as Respostas['finalidade'] })}
            className={campoCls}
          >
            <option value="">Não perguntado</option>
            {FINALIDADES.map((v) => (
              <option key={v} value={v}>
                {FINALIDADE_LABEL[v]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-tx-2">Quando pretende comprar</span>
          <select
            value={f.prazo_compra}
            onChange={(e) => setF({ ...f, prazo_compra: e.target.value as Respostas['prazo_compra'] })}
            className={campoCls}
          >
            <option value="">Não perguntado</option>
            {PRAZOS_DE_COMPRA.map((v) => (
              <option key={v} value={v}>
                {PRAZO_DE_COMPRA_LABEL[v]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-tx-2">Entrada e parcelas</span>
          <select
            value={f.encaixe_financeiro}
            onChange={(e) =>
              setF({ ...f, encaixe_financeiro: e.target.value as Respostas['encaixe_financeiro'] })
            }
            className={campoCls}
          >
            <option value="">Não perguntado</option>
            {ENCAIXES_FINANCEIROS.map((v) => (
              <option key={v} value={v}>
                {ENCAIXE_FINANCEIRO_LABEL[v]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {f.encaixe_financeiro === 'depende_banco' && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-warn-soft p-2.5 text-sm leading-snug text-warn">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
          {AVISO_DEPENDE_DE_BANCO}
        </p>
      )}

      {mudou && (
        <button
          onClick={() =>
            salvar.mutate({
              finalidade: f.finalidade || null,
              prazo_compra: f.prazo_compra || null,
              encaixe_financeiro: f.encaixe_financeiro || null,
            })
          }
          disabled={salvar.isPending}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-pri px-4 py-2.5 text-md font-semibold text-pri-fg hover:bg-pri-deep disabled:opacity-60"
        >
          {salvar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar qualificação
        </button>
      )}

      {salvar.isError && (
        <p className="mt-3 text-sm text-dng">
          Não consegui salvar. Confira a conexão e tente de novo.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line pt-3">
        <label className="flex items-center gap-2 text-sm font-semibold text-tx-2">
          Temperatura
          <select
            value={lead.temperatura_manual ?? ''}
            onChange={(e) =>
              salvar.mutate({ temperatura_manual: (e.target.value as Temperatura) || null })
            }
            aria-label="Marcar a temperatura à mão"
            className="rounded-xl border border-line-2 bg-card-2 px-2.5 py-1.5 text-base font-medium text-tx outline-none focus:border-pri"
          >
            <option value="">Pela regra</option>
            {TEMPERATURAS.map((v) => (
              <option key={v} value={v}>
                {TEMPERATURA_LABEL[v]}
              </option>
            ))}
          </select>
        </label>
        <p className="text-sm text-tx-3">
          Marcar à mão ganha da regra. Volte para "Pela regra" quando as respostas mudarem.
        </p>
      </div>
    </div>
  );
}
