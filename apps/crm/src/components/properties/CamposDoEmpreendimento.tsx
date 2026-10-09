import { CONSTRUCTION_STATUSES, CONSTRUCTION_STATUS_LABEL } from '@contracts';
import { cn } from '@/lib/utils';
import { Campo, inputCls } from './CampoDoFormulario';
import { apenasDigitos } from './formularioDoImovel';
import type { EstadoDoImovel, MudarCampo } from './PropertyFormDialog';

interface Props {
  f: EstadoDoImovel;
  set: MudarCampo;
  entregaInvalida: boolean;
}

/*
  O empreendimento. Entrega (só o ano), obra e registro saem no site;
  a construtora NÃO (decisão do usuário, 08/10): o cliente iria
  comprar direto com ela.
*/
export function CamposDoEmpreendimento({ f, set, entregaInvalida }: Props) {
  return (
    <>
      <Campo className="col-span-2" rotulo="Situação da obra">
        <select
          value={f.construction_status}
          onChange={(e) => set('construction_status')(e.target.value)}
          className={inputCls}
        >
          <option value="">Não informada</option>
          {CONSTRUCTION_STATUSES.map((c) => (
            <option key={c} value={c}>
              {CONSTRUCTION_STATUS_LABEL[c]}
            </option>
          ))}
        </select>
      </Campo>
      <Campo className="col-span-2" rotulo="Entrega (ano)">
        <input
          inputMode="numeric"
          maxLength={4}
          value={f.entrega}
          onChange={(e) => set('entrega')(apenasDigitos(e.target.value).slice(0, 4))}
          placeholder="2030"
          aria-invalid={entregaInvalida || undefined}
          className={cn(inputCls, entregaInvalida && 'border-dng focus:border-dng')}
        />
        {entregaInvalida && (
          <span role="alert" className="text-sm font-semibold text-dng">
            O ano, com quatro dígitos: 2030.
          </span>
        )}
      </Campo>
      <Campo className="col-span-2 sm:col-span-4" rotulo="Construtora" nota="Só no CRM: nunca aparece no site.">
        <input value={f.developer} onChange={(e) => set('developer')(e.target.value)} autoComplete="off" className={inputCls} />
      </Campo>
      <Campo className="col-span-2" rotulo="Registro de incorporação">
        <input
          maxLength={80}
          value={f.incorporation_registry}
          onChange={(e) => set('incorporation_registry')(e.target.value)}
          placeholder="R-8 96.726"
          className={inputCls}
        />
      </Campo>
      <Campo className="col-span-2" rotulo="Cartório do registro">
        <input
          maxLength={120}
          value={f.incorporation_registry_office}
          onChange={(e) => set('incorporation_registry_office')(e.target.value)}
          placeholder="Registro de Imóveis de Itapema"
          className={inputCls}
        />
      </Campo>
      <p className="col-span-2 text-sm text-tx-3 sm:col-span-4">
        Entrega, situação da obra e o registro com o cartório saem no site. O registro de incorporação é
        obrigatório no anúncio de imóvel na planta (Lei 4.591/64, art. 32, § 3º).
      </p>
    </>
  );
}
