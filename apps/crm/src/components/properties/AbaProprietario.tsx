import { Campo, inputCls } from './CampoDoFormulario';

type CampoDoDono = 'nome' | 'cidade' | 'telefone';

interface Props {
  dono: Record<CampoDoDono, string>;
  setDonoCampo: (k: CampoDoDono) => (v: string) => void;
}

/** A aba "Proprietário": quem entregou o imóvel. O telefone é o que identifica o cadastro. */
export function AbaProprietario({ dono, setDonoCampo }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <p className="col-span-2 text-sm text-tx-3 sm:col-span-4">
        Quem entregou o imóvel para administrar. Não aparece no site. O telefone identifica o
        proprietário: o mesmo número em outro imóvel é o mesmo cadastro.
      </p>
      <Campo className="col-span-2 sm:col-span-4" rotulo="Nome completo">
        <input value={dono.nome} onChange={(e) => setDonoCampo('nome')(e.target.value)} autoComplete="off" className={inputCls} />
      </Campo>
      <Campo className="col-span-2" rotulo="Cidade onde mora">
        <input value={dono.cidade} onChange={(e) => setDonoCampo('cidade')(e.target.value)} autoComplete="off" className={inputCls} />
      </Campo>
      <Campo className="col-span-2" rotulo="Telefone com DDD">
        <input
          type="tel"
          inputMode="tel"
          value={dono.telefone}
          onChange={(e) => setDonoCampo('telefone')(e.target.value)}
          placeholder="(47) 99999-1234"
          autoComplete="off"
          className={inputCls}
        />
      </Campo>
    </div>
  );
}
