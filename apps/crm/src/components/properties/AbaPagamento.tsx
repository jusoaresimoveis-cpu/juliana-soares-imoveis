import type { Dispatch, SetStateAction } from 'react';
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABEL,
  REINFORCEMENT_PERIODS,
  REINFORCEMENT_PERIOD_LABEL,
  RENTAL_GUARANTEES,
  RENTAL_GUARANTEE_LABEL,
  resumoDoPlano,
  type PaymentMethod,
  type RentalGuarantee,
} from '@contracts';
import { cn } from '@/lib/utils';
import { Campo, inputCls } from './CampoDoFormulario';
import { apenasDigitos, campoParaCents, campoParaInteiro, mascaraBRL } from './formularioDoImovel';
import type { EstadoDoImovel, MudarCampo } from './PropertyFormDialog';

interface Props {
  f: EstadoDoImovel;
  set: MudarCampo;
  garantias: RentalGuarantee[];
  setGarantias: Dispatch<SetStateAction<RentalGuarantee[]>>;
  formas: PaymentMethod[];
  setFormas: Dispatch<SetStateAction<PaymentMethod[]>>;
}

/** A aba "Pagamento": as garantias do aluguel e o plano de pagamento da venda, com a conta conferida. */
export function AbaPagamento({ f, set, garantias, setGarantias, formas, setFormas }: Props) {
  return (
    <div className="flex flex-col gap-4">
      {f.for_rent && (
        <div>
          <p className="text-sm font-semibold text-tx-2">Garantias aceitas na locação</p>
          <p className="mt-0.5 text-sm text-tx-3">
            Marque todas as que o proprietário aceita. É a primeira pergunta de quem quer alugar.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {RENTAL_GUARANTEES.map((g) => {
              const ativa = garantias.includes(g);
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGarantias((s) => (ativa ? s.filter((x) => x !== g) : [...s, g]))}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors',
                    ativa
                      ? 'border-pri bg-pri text-pri-fg'
                      : 'border-line-2 bg-card text-tx-2 hover:border-pri-light hover:text-tx',
                  )}
                >
                  {RENTAL_GUARANTEE_LABEL[g]}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* O plano de pagamento é de venda: entrada, parcelas e chaves não existem num aluguel. */}
      {f.for_sale && (
        <>
      {/* A condição da construtora vem em percentual e vale para todas as
          unidades: no empreendimento ela é o texto, e sai no site. */}
      {f.has_units && (
        <Campo
          rotulo="Condição de pagamento"
          nota="Como a construtora escreve, para todas as unidades. Sai no site, na página do empreendimento."
        >
          <textarea
            rows={2}
            value={f.payment_notes}
            onChange={(e) => set('payment_notes')(e.target.value)}
            placeholder="10% de entrada + 100 mensais + 7 anuais"
            className={cn(inputCls, 'resize-none')}
          />
        </Campo>
      )}

      <div>
        <p className="text-sm font-semibold text-tx-2">Formas aceitas</p>
        <p className="mt-0.5 text-sm text-tx-3">
          Marque todas. O mesmo imóvel costuma aceitar mais de uma, e obrigar a
          escolher uma faria as outras virarem pergunta no WhatsApp.
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {PAYMENT_METHODS.map((m) => {
            const ativa = formas.includes(m);
            return (
              <button
                key={m}
                type="button"
                onClick={() =>
                  setFormas((s) => (ativa ? s.filter((x) => x !== m) : [...s, m]))
                }
                className={cn(
                  'rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors',
                  ativa
                    ? 'border-pri bg-pri text-pri-fg'
                    : 'border-line-2 bg-card text-tx-2 hover:border-pri-light hover:text-tx',
                )}
              >
                {PAYMENT_METHOD_LABEL[m]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Campo className="col-span-2" rotulo="Entrada (R$)">
          <input
            inputMode="numeric"
            value={f.entrada}
            onChange={(e) => set('entrada')(mascaraBRL(e.target.value))}
            placeholder="80.000"
            className={inputCls}
          />
        </Campo>

        <Campo className="col-span-2" rotulo="Nas chaves (R$)">
          <input
            inputMode="numeric"
            value={f.chaves}
            onChange={(e) => set('chaves')(mascaraBRL(e.target.value))}
            placeholder="120.000"
            className={inputCls}
          />
        </Campo>

        <Campo rotulo="Parcelas">
          <input
            inputMode="numeric"
            value={f.parcelas}
            onChange={(e) => set('parcelas')(apenasDigitos(e.target.value))}
            placeholder="60"
            className={inputCls}
          />
        </Campo>

        <Campo rotulo="Valor da parcela (R$)">
          <input
            inputMode="numeric"
            value={f.parcela}
            onChange={(e) => set('parcela')(mascaraBRL(e.target.value))}
            placeholder="2.400"
            className={inputCls}
          />
        </Campo>

        <Campo rotulo="Reforços">
          <input
            inputMode="numeric"
            value={f.reforcos}
            onChange={(e) => set('reforcos')(apenasDigitos(e.target.value))}
            placeholder="8"
            className={inputCls}
          />
        </Campo>

        <Campo rotulo="Valor do reforço (R$)">
          <input
            inputMode="numeric"
            value={f.reforco}
            onChange={(e) => set('reforco')(mascaraBRL(e.target.value))}
            placeholder="15.000"
            className={inputCls}
          />
        </Campo>

        {/* Só aparece quando há reforço: periodicidade sem reforço é um
            seletor que não decide nada. */}
        {f.reforcos && f.reforco && (
          <Campo className="col-span-2" rotulo="Periodicidade do reforço">
            <select
              value={f.periodo}
              onChange={(e) => set('periodo')(e.target.value)}
              className={inputCls}
            >
              {REINFORCEMENT_PERIODS.map((r) => (
                <option key={r} value={r}>
                  {REINFORCEMENT_PERIOD_LABEL[r]}
                </option>
              ))}
            </select>
          </Campo>
        )}

        {!f.has_units && (
          <Campo className="col-span-2 sm:col-span-4" rotulo="Observações da condição">
            <input
              value={f.payment_notes}
              onChange={(e) => set('payment_notes')(e.target.value)}
              placeholder="Saldo corrigido pelo INCC. Desconto de 5% à vista."
              className={inputCls}
            />
          </Campo>
        )}
      </div>

      {/* Com unidades, cada uma tem o seu preço: a soma do plano não tem
          com que fechar. */}
      {!f.has_units && (
        <Conferencia
          precoCents={f.preco ? Number(apenasDigitos(f.preco)) * 100 : null}
          entradaCents={campoParaCents(f.entrada)}
          parcelas={campoParaInteiro(f.parcelas)}
          parcelaCents={campoParaCents(f.parcela)}
          reforcos={campoParaInteiro(f.reforcos)}
          reforcoCents={campoParaCents(f.reforco)}
          chavesCents={campoParaCents(f.chaves)}
        />
      )}
        </>
      )}
    </div>
  );
}

/**
 * A conta do plano, conferida na hora do cadastro.
 *
 * Existe para o erro aparecer AQUI, e não na página pública — onde quem faz a
 * soma é o comprador, e a diferença aparece na hora da proposta, que é o pior
 * momento possível.
 *
 * Saldo positivo é normal: é o que o banco financia. Saldo negativo é erro de
 * digitação, e por isso ele grita em vez de informar.
 */
function Conferencia(props: Parameters<typeof resumoDoPlano>[0]) {
  const r = resumoDoPlano(props);
  if (r.vazio) return null;

  const brl = (c: number) =>
    (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div
      className={cn(
        'rounded-xl p-3 text-sm',
        r.excede ? 'bg-dng-soft text-dng' : 'bg-card-2 text-tx-2',
      )}
    >
      <p>
        O plano soma <b>{brl(r.somaCents)}</b>.
      </p>
      {r.saldoCents === null ? (
        // Sem preço não há "quanto falta": devolver o negativo da soma seria
        // inventar uma resposta para uma pergunta que não foi feita.
        <p className="mt-0.5 text-tx-3">Preencha o valor do imóvel para conferir o saldo.</p>
      ) : r.excede ? (
        <p className="mt-0.5 font-semibold">
          Passou {brl(-r.saldoCents)} do valor do imóvel — confira os campos.
        </p>
      ) : r.saldoCents === 0 ? (
        <p className="mt-0.5">Fecha exatamente com o valor do imóvel.</p>
      ) : (
        <p className="mt-0.5">
          Restam <b>{brl(r.saldoCents)}</b> — é o saldo a financiar.
        </p>
      )}
    </div>
  );
}
