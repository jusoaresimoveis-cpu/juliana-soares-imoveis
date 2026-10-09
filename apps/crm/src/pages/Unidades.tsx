import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { aPartirDe, reaisComCentavos, resumoDoEmpreendimento } from '@contracts';
import { useAuth } from '@/hooks/useAuth';
import { useProperty } from '@/hooks/useProperties';
import { useUnidades } from '@/hooks/useUnidades';
import { AvisoDaTabela } from '@/components/properties/Empreendimento';
import { SecaoPlantas } from '@/components/unidades/SecaoPlantas';
import { SecaoTabela } from '@/components/unidades/SecaoTabela';
import { SecaoUnidades } from '@/components/unidades/SecaoUnidades';
import { contagem } from '@/lib/contagem';
import { cn } from '@/lib/utils';

/**
 * As unidades de um empreendimento: as plantas, as unidades e a tabela do mês.
 *
 * O empreendimento é UM imóvel (uma página no site, um código, os leads); a
 * unidade não tem página nem código. Aqui a Juliana cadastra as plantas, gera
 * as unidades do prédio de uma vez e, todo mês, aplica a tabela da construtora
 * (que sai no 1º dia útil, com o CUB/SC). Até ela aplicar, o site mostra
 * "Consulte" no lugar dos preços.
 */

type Aba = 'tabela' | 'unidades' | 'plantas';

export default function Unidades() {
  const { id = '' } = useParams();
  const { profile } = useAuth();
  const orgId = profile?.organization_id;
  const imovel = useProperty(id);
  const dados = useUnidades(id);
  const [aba, setAba] = useState<Aba | null>(null);

  // Na primeira visita, o passo que falta: planta, depois unidades, depois a
  // tabela. Escolhido uma vez, quando os dados chegam; recalculado a cada
  // releitura, criar a primeira planta pularia para "Unidades" e criar a
  // primeira sala pularia para "Tabela do mês", com a Juliana no meio do passo.
  if (aba === null && dados.data) {
    const { plantas: ps, unidades: us } = dados.data;
    setAba(ps.length === 0 ? 'plantas' : us.length === 0 ? 'unidades' : 'tabela');
  }

  if (imovel.isLoading || dados.isLoading) {
    return (
      <div className="grid place-items-center py-24">
        <Loader2 className="h-5 w-5 animate-spin text-pri" />
      </div>
    );
  }

  // Só sem dado nenhum: o erro de uma releitura (a do "Conferir", a da volta à
  // aba) mantém o que já veio, e a tabela digitada não some por um soluço da rede.
  if (!imovel.data || !dados.data) {
    return (
      <div className="rounded-lg bg-dng-soft p-5 text-md text-dng">
        <strong className="block font-bold">Não consegui carregar as unidades.</strong>
        <Link to={id ? `/imoveis/${id}` : '/imoveis'} className="mt-1 inline-block underline">
          Voltar ao imóvel
        </Link>
      </div>
    );
  }

  const p = imovel.data;
  const { plantas, unidades } = dados.data;

  if (!p.has_units) {
    return (
      <div className="rounded-lg bg-card p-8 shadow-card">
        <h1 className="text-2xl font-bold">Unidades</h1>
        <p className="mt-2 max-w-[60ch] text-md text-tx-2">
          {p.title} não é um empreendimento com unidades. Para cadastrar plantas e unidades, ligue “Empreendimento com
          várias unidades” no cadastro do imóvel (Editar → Dados).
        </p>
        <Link to={`/imoveis/${id}`} className="mt-3 inline-block font-semibold text-pri hover:underline">
          Voltar ao imóvel
        </Link>
      </div>
    );
  }

  const tipo = p.property_type;
  const abaAtiva: Aba = aba ?? 'tabela';
  const semTabela = !p.units_table_month;
  const resumo = resumoDoEmpreendimento(unidades);
  const aPartir = aPartirDe(resumo);
  // O imóvel também é relido: o mês da tabela gravado nele decide se gravar
  // aplica a tabela do mês, e outro aparelho pode tê-la aplicado.
  const recarregar = async () => {
    const [r, i] = await Promise.all([dados.refetch(), imovel.refetch()]);
    if (r.isError || !r.data) throw r.error ?? new Error('Sem as unidades.');
    return { unidades: r.data.unidades, mesAplicado: (i.data ?? p).units_table_month ?? null };
  };

  return (
    <div className="flex flex-col gap-4 pb-4">
      <header className="flex flex-wrap items-start gap-4">
        <Link
          to={`/imoveis/${id}`}
          aria-label="Voltar à ficha do imóvel"
          className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line-2 bg-card text-tx-2 transition-colors hover:border-pri hover:text-pri"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold uppercase text-tx-3">{p.public_code} · Unidades</p>
          <h1 className="mt-0.5 text-2xl font-bold leading-tight">{p.title}</h1>
          <p className="mt-1 text-base text-tx-2">
            {aPartir !== null && (
              <>
                A partir de <b className="text-pri">{reaisComCentavos(aPartir)}</b> ·{' '}
              </>
            )}
            {contagem(resumo.disponiveis, 'disponível', 'disponíveis')} ·{' '}
            {contagem(resumo.reservadas, 'reservada', 'reservadas')} · {contagem(resumo.total, 'unidade', 'unidades')}
          </p>
        </div>
      </header>

      <AvisoDaTabela mesAplicado={p.units_table_month} temUnidades={unidades.length > 0} />

      <nav className="flex gap-1 overflow-x-auto rounded-full bg-card-2 p-1 sm:self-start">
        {(
          [
            ['tabela', 'Tabela do mês'],
            ['unidades', 'Unidades'],
            ['plantas', 'Plantas'],
          ] as const
        ).map(([k, rotulo]) => (
          <button
            key={k}
            type="button"
            onClick={() => setAba(k)}
            className={cn(
              'flex-1 whitespace-nowrap rounded-full px-4 py-2 text-base font-semibold transition-colors',
              abaAtiva === k ? 'bg-card text-pri shadow-card' : 'text-tx-2 hover:text-tx',
            )}
          >
            {rotulo}
          </button>
        ))}
      </nav>

      {abaAtiva === 'plantas' && (
        <SecaoPlantas orgId={orgId} propertyId={id} tipo={tipo} plantas={plantas} unidades={unidades} />
      )}

      {abaAtiva === 'unidades' &&
        (plantas.length === 0 ? (
          <Vazio>
            Cadastre as plantas primeiro: cada unidade segue uma.{' '}
            <button type="button" onClick={() => setAba('plantas')} className="font-semibold text-pri hover:underline">
              Ir para Plantas
            </button>
          </Vazio>
        ) : (
          <SecaoUnidades
            orgId={orgId}
            propertyId={id}
            tipo={tipo}
            plantas={plantas}
            unidades={unidades}
            semTabela={semTabela}
            irParaTabela={() => setAba('tabela')}
          />
        ))}

      {unidades.length === 0 ? (
        abaAtiva === 'tabela' && (
          <Vazio>
            Ainda não há unidades para a tabela.{' '}
            <button
              type="button"
              onClick={() => setAba(plantas.length ? 'unidades' : 'plantas')}
              className="font-semibold text-pri hover:underline"
            >
              {plantas.length ? 'Gerar as unidades' : 'Cadastrar as plantas'}
            </button>
          </Vazio>
        )
      ) : (
        // Montada mesmo escondida: a tabela digitada pela metade não pode se
        // perder porque a Juliana foi olhar a aba de unidades.
        <div hidden={abaAtiva !== 'tabela'}>
          <SecaoTabela
            propertyId={id}
            tipo={tipo}
            plantas={plantas}
            unidades={unidades}
            recarregar={recarregar}
            irParaSituacao={() => setAba('unidades')}
          />
        </div>
      )}
    </div>
  );
}

function Vazio({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-line-2 py-10 text-center text-base text-tx-3">{children}</p>;
}
