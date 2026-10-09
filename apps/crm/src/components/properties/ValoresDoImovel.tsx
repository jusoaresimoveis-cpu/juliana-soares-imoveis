import { brlCents, cn } from '@/lib/utils';
import { Campo, inputCls } from './CampoDoFormulario';
import { apenasDigitos, mascaraBRL } from './formularioDoImovel';
import type { EstadoDoImovel, MudarCampo } from './PropertyFormDialog';

interface Props {
  f: EstadoDoImovel;
  set: MudarCampo;
  precoCents: number | null;
  tabelaCents: number | null;
  deCents: number | null;
  tabelaSemDesconto: boolean;
}

/** Os valores da aba de dados: a venda (com o "de/por"), o aluguel, o condomínio e o IPTU. */
export function ValoresDoImovel({ f, set, precoCents, tabelaCents, deCents, tabelaSemDesconto }: Props) {
  return (
    <>
      {f.for_sale && !f.has_units && (
        <>
          <Campo className="col-span-2" rotulo="Preço de venda (R$)">
            <input
              inputMode="numeric"
              value={mascaraBRL(f.preco)}
              onChange={(e) => set('preco')(apenasDigitos(e.target.value))}
              placeholder="1.850.000"
              className={inputCls}
            />
          </Campo>
          <Campo className="col-span-2" rotulo="Preço de tabela (R$)">
            <input
              inputMode="numeric"
              value={mascaraBRL(f.tabela)}
              onChange={(e) => set('tabela')(apenasDigitos(e.target.value))}
              placeholder="Vazio: sem desconto"
              aria-invalid={tabelaSemDesconto || undefined}
              className={cn(inputCls, tabelaSemDesconto && 'border-dng focus:border-dng')}
            />
          </Campo>
          {tabelaCents !== null && (
            <p
              role={tabelaSemDesconto ? 'alert' : undefined}
              className={cn(
                'col-span-2 rounded-xl p-3 text-sm sm:col-span-4',
                tabelaSemDesconto ? 'bg-dng-soft font-semibold text-dng' : 'bg-card-2 text-tx-2',
              )}
            >
              {deCents !== null && precoCents !== null ? (
                <>
                  No site: De <s>{brlCents(deCents)}</s> por <b>{brlCents(precoCents)}</b>.
                </>
              ) : precoCents === null ? (
                'Preencha o preço de venda: é o “por” do “de R$ X por R$ Y”.'
              ) : (
                'O preço de tabela tem que ser maior que o de venda. Sem desconto, deixe vazio.'
              )}
            </p>
          )}
        </>
      )}
      {f.for_rent && (
        <Campo className="col-span-2" rotulo="Aluguel mensal (R$)">
          <input
            inputMode="numeric"
            value={mascaraBRL(f.aluguel)}
            onChange={(e) => set('aluguel')(apenasDigitos(e.target.value))}
            placeholder="3.500"
            className={inputCls}
          />
        </Campo>
      )}
      <Campo rotulo="Condomínio (R$/mês)">
        <input
          inputMode="numeric"
          value={mascaraBRL(f.condominio)}
          onChange={(e) => set('condominio')(apenasDigitos(e.target.value))}
          placeholder="650"
          className={inputCls}
        />
      </Campo>
      <Campo rotulo="IPTU (R$/ano)">
        <input
          inputMode="numeric"
          value={mascaraBRL(f.iptu)}
          onChange={(e) => set('iptu')(apenasDigitos(e.target.value))}
          placeholder="1.200"
          className={inputCls}
        />
      </Campo>
    </>
  );
}
