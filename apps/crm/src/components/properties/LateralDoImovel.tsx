import { Link } from 'react-router-dom';
import { Users, MessageCircle, EyeOff } from 'lucide-react';
import type { PropertyFull, Proprietario, useInteressados, useVisitasDoImovel } from '@/hooks/useProperties';
import type { PipelineStage } from '@/types/db';
import { telefoneLegivel } from '@/exportacao';
import { CONSTRUCTION_STATUS_LABEL, PROPERTY_STATUS_LABEL, type ConstructionStatus } from '@contracts';
import type { AbaDoImovel } from './PropertyFormDialog';
import { Contador, Linha } from './PecasDaFicha';

/**
 * A lateral da ficha do imóvel: interessados e visitas, situação, empreendimento
 * e proprietário.
 *
 * Recebe os dados da página em vez de chamar os hooks. Na página, as consultas
 * começam na montagem, junto com a do imóvel; aqui só começariam depois que ele
 * carregasse. E o proprietário também vai para o formulário, que o "Cadastrar"
 * abre na aba do proprietário.
 */
export function LateralDoImovel({
  imovel,
  interessados,
  visitas,
  etapas,
  proprietario,
  setEditando,
}: {
  imovel: PropertyFull;
  interessados: ReturnType<typeof useInteressados>['data'];
  visitas: ReturnType<typeof useVisitasDoImovel>['data'];
  etapas: PipelineStage[] | undefined;
  proprietario: Proprietario | undefined;
  setEditando: (aba: AbaDoImovel) => void;
}) {
  return (
    <aside className="flex flex-col gap-4">
      <div className="rounded-lg bg-card p-5 shadow-card">
        <h2 className="mb-3 flex items-center gap-1.5 text-lg font-bold">
          <Users className="h-4 w-4 text-pri" />
          Interessados
        </h2>

        {/* Os números que o painel do proprietário vai mostrar ao dono: a
            Juliana já vê aqui. Visita é pessoa por dia na página do site. */}
        <div className="mb-4 grid grid-cols-2 gap-2">
          <Contador valor={(interessados ?? []).length} rotulo="Leads" />
          <Contador
            valor={visitas?.total ?? 0}
            rotulo="Visitas no site"
            dica={visitas?.desde ? `desde ${new Date(`${visitas.desde}T12:00`).toLocaleDateString('pt-BR')}` : null}
          />
        </div>

        {(interessados ?? []).length === 0 && (
          <p className="text-base text-tx-3">Nenhum lead vinculado ainda.</p>
        )}

        {(interessados ?? []).map((i) => {
          const etapa = etapas?.find((s) => s.id === i.leads?.stage_id);
          return (
            <div key={i.id} className="mb-2 flex items-center gap-2 last:mb-0">
              <Link
                to={`/leads/${i.leads?.id}`}
                className="min-w-0 flex-1 rounded-lg p-1.5 transition-colors hover:bg-card-2"
              >
                <span className="block truncate text-base font-bold">{i.leads?.full_name}</span>
                {etapa && (
                  <span className="text-sm font-semibold" style={{ color: etapa.color }}>
                    {etapa.label}
                  </span>
                )}
              </Link>
              {i.leads?.phone_e164 && (
                <a
                  href={`https://wa.me/${i.leads.phone_e164.replace('+', '')}`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`WhatsApp de ${i.leads.full_name}`}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-tx-3 hover:bg-ok-soft hover:text-ok"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded-lg bg-card p-5 shadow-card">
        <h2 className="mb-2.5 text-2xs font-bold uppercase text-tx-3">Situação</h2>
        <Linha rotulo="Status" valor={PROPERTY_STATUS_LABEL[imovel.status]} />
        <Linha rotulo="Código" valor={imovel.public_code} />
        {imovel.floor !== null && <Linha rotulo="Andar" valor={String(imovel.floor)} />}
        <Linha
          rotulo="Endereço exato"
          valor={imovel.show_exact_address ? 'Visível no anúncio' : 'Oculto no anúncio'}
        />
        <Linha
          rotulo="Atualizado"
          valor={new Date(imovel.updated_at).toLocaleDateString('pt-BR')}
        />
      </div>

      {imovel.has_units && (
        <div className="rounded-lg bg-card p-5 shadow-card">
          <h2 className="mb-2.5 text-2xs font-bold uppercase text-tx-3">Empreendimento</h2>
          <Linha
            rotulo="Obra"
            valor={CONSTRUCTION_STATUS_LABEL[imovel.construction_status as ConstructionStatus] ?? 'Não informada'}
          />
          <Linha rotulo="Entrega" valor={imovel.delivery_at ? imovel.delivery_at.slice(0, 4) : 'Não informada'} />
          <Linha rotulo="Registro de incorporação" valor={imovel.incorporation_registry || 'Não informado'} />
          <Linha rotulo="Cartório" valor={imovel.incorporation_registry_office || 'Não informado'} />
          {/* A construtora nunca sai no site (decisão do usuário, 08/10): o
              cliente iria comprar direto com ela. */}
          <div className="border-b border-line py-1.5 last:border-0">
            <p className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-tx-3">Construtora</span>
              <span className="text-base font-semibold">{imovel.developer || 'Não informada'}</span>
            </p>
            <p className="mt-0.5 flex items-center justify-end gap-1 text-2xs font-bold uppercase text-warn">
              <EyeOff className="h-3 w-3" />
              Só no CRM, nunca no site
            </p>
          </div>
          {imovel.payment_notes && (
            <div className="py-1.5">
              <p className="text-sm text-tx-3">Condição de pagamento</p>
              <p className="text-base font-semibold">{imovel.payment_notes}</p>
            </div>
          )}
        </div>
      )}

      <div className="rounded-lg bg-card p-5 shadow-card">
        <h2 className="mb-2.5 text-2xs font-bold uppercase text-tx-3">Proprietário</h2>
        {proprietario ? (
          <>
            <Linha rotulo="Nome" valor={proprietario.full_name} />
            {proprietario.city && <Linha rotulo="Mora em" valor={proprietario.city} />}
            <p className="flex items-baseline justify-between gap-3 py-1.5">
              <span className="text-sm text-tx-3">Telefone</span>
              <a
                href={`https://wa.me/${proprietario.phone_e164.replace('+', '')}`}
                target="_blank"
                rel="noreferrer"
                className="text-base font-semibold text-pri hover:underline"
              >
                {telefoneLegivel(proprietario.phone_e164, null)}
              </a>
            </p>
          </>
        ) : (
          <p className="text-base text-tx-3">
            Nenhum cadastrado.{' '}
            <button
              type="button"
              onClick={() => setEditando('proprietario')}
              className="font-semibold text-pri hover:underline"
            >
              Cadastrar
            </button>
          </p>
        )}
      </div>
    </aside>
  );
}
