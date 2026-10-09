import { useEffect, useState, type FormEvent } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useSalvarPerfil } from '@/hooks/useSettings';
import { ROLE_LABEL, ROLE_DESCRIPTION, papelPrincipal } from '@contracts';
import { CorDoSistema } from './CorDoSistema';
import { cn } from '@/lib/utils';
import { Cartao, Campo, Carregando, INPUT, Rodape } from './PecasDasConfiguracoes';

export function Perfil() {
  const { profile, roles, user } = useAuth();
  const salvar = useSalvarPerfil(profile?.id ?? '');
  const papel = papelPrincipal(roles);

  const [nome, setNome] = useState('');
  const [creci, setCreci] = useState('');
  const [cargo, setCargo] = useState('');

  useEffect(() => {
    if (!profile) return;
    setNome(profile.full_name);
    setCreci(profile.creci ?? '');
    setCargo(profile.title ?? '');
  }, [profile]);

  if (!profile) return <Carregando />;

  return (
    <div className="flex flex-col gap-4">
    <Cartao>
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          salvar.mutate({
            full_name: nome.trim(),
            creci: creci.trim() || null,
            title: cargo.trim() || null,
          });
        }}
      >
        <Campo rotulo="Nome">
          <input value={nome} onChange={(e) => setNome(e.target.value)} className={INPUT} />
        </Campo>

        <Campo rotulo="E-mail" dica="Trocar o e-mail de acesso exige suporte.">
          <input value={user?.email ?? ''} disabled className={cn(INPUT, 'opacity-60')} />
        </Campo>

        <div className="flex gap-3">
          <Campo rotulo="CRECI" className="flex-1">
            <input value={creci} onChange={(e) => setCreci(e.target.value)} className={INPUT} />
          </Campo>
          <Campo rotulo="Cargo" className="flex-1">
            <input value={cargo} onChange={(e) => setCargo(e.target.value)} className={INPUT} />
          </Campo>
        </div>

        {papel && (
          <div className="mt-4 rounded-xl bg-card-2 p-3.5">
            <p className="flex items-center gap-2 text-base font-bold">
              <ShieldCheck className="h-4 w-4 text-pri" />
              {ROLE_LABEL[papel]}
            </p>
            <p className="mt-1 text-sm text-tx-2">{ROLE_DESCRIPTION[papel]}</p>
            <p className="mt-2 text-sm text-tx-3">
              Só um administrador muda o papel de alguém — por isso ele não é editável aqui.
            </p>
          </div>
        )}

        <Rodape mutacao={salvar} rotulo="Salvar perfil" />
      </form>
    </Cartao>

      {/* A cor fica no perfil porque é escolha da PESSOA, não da imobiliária. */}
      <CorDoSistema />
    </div>
  );
}
