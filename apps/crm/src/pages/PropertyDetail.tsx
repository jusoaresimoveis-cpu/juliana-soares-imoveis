import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Loader2,
  Pencil,
  MapPin,
  BedDouble,
  Bath,
  Car,
  Ruler,
  Users,
  MessageCircle,
  EyeOff,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { env } from '@/lib/env';
import {
  useProperty,
  useInteressados,
  usePropertyMedia,
  useProprietario,
  useVisitasDoImovel,
  urlPublica,
} from '@/hooks/useProperties';
import { usePipelineStages } from '@/hooks/useLeadsBoard';
import { PropertyFormDialog, type AbaDoImovel } from '@/components/properties/PropertyFormDialog';
import { telefoneLegivel } from '@/exportacao';
import {
  PROPERTY_TYPE_LABEL,
  PROPERTY_STATUS_LABEL,
  RENTAL_GUARANTEE_LABEL,
  rotuloDoRegime,
  type RentalGuarantee,
} from '@contracts';
import { brlCents, cn, valoresDoImovel } from '@/lib/utils';

export default function PropertyDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const orgId = profile?.organization_id;

  const { data: imovel, isLoading, isError } = useProperty(id);
  const { data: midia } = usePropertyMedia(id);
  const { data: interessados } = useInteressados(id);
  const { data: visitas } = useVisitasDoImovel(id);
  const { data: proprietario } = useProprietario(imovel?.owner_id);
  const { data: etapas } = usePipelineStages(orgId);

  // A aba em que o formulário abre; nulo é fechado.
  const [editando, setEditando] = useState<AbaDoImovel | null>(null);
  const [foto, setFoto] = useState(0);

  if (isLoading) {
    return (
      <div className="grid place-items-center py-24">
        <Loader2 className="h-5 w-5 animate-spin text-pri" />
      </div>
    );
  }

  if (isError || !imovel) {
    return (
      <div className="rounded-lg bg-dng-soft p-5 text-md text-dng">
        <strong className="block font-bold">Imóvel não encontrado.</strong>
        <Link to="/imoveis" className="mt-1 inline-block underline">
          Voltar à lista
        </Link>
      </div>
    );
  }

  const imagens = (midia ?? []).filter((m) => m.kind === 'image');
  const capa = imagens[foto] ?? imagens[0];

  return (
    <div className="flex flex-col gap-4 pb-4">
      <header className="flex flex-wrap items-start gap-4">
        <button
          onClick={() => navigate(-1)}
          aria-label="Voltar"
          className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line-2 bg-card text-tx-2 transition-colors hover:border-pri hover:text-pri"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold uppercase text-tx-3">
            {imovel.public_code} · {PROPERTY_TYPE_LABEL[imovel.property_type]} · {rotuloDoRegime(imovel)}
          </p>
          <h1 className="mt-0.5 text-2xl font-bold leading-tight">{imovel.title}</h1>
          {(imovel.neighborhood || imovel.city) && (
            <p className="mt-1 flex items-center gap-1.5 text-base text-tx-2">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-tx-3" />
              {[imovel.neighborhood, imovel.city, imovel.state].filter(Boolean).join(', ')}
            </p>
          )}
        </div>

        {/*
          `w-full` no celular. Ver o mesmo comentário em `LeadDetail`: o bloco do
          título é `flex-1`, cuja base é zero, então ele nunca força a quebra e
          fica com o farelo que os botões deixam.
        */}
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <span
            className={cn(
              'rounded-full px-3.5 py-2 text-base font-semibold',
              imovel.is_published ? 'bg-ok-soft text-ok' : 'bg-card-2 text-tx-3',
            )}
          >
            {imovel.is_published ? 'Publicado' : 'Rascunho'}
          </span>
          {/* O site se refaz sozinho quando o imóvel muda (o banco avisa), então
              o link já abre a versão que acabou de ser salva. */}
          {imovel.is_published && env.publicSiteUrl && imovel.slug && (
            <a
              href={`${env.publicSiteUrl.replace(/\/+$/, '')}/imovel/${imovel.slug}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-line-2 bg-card px-4 py-2 text-base font-semibold text-tx-2 hover:border-pri hover:text-pri"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Ver no site
            </a>
          )}
          <button
            onClick={() => setEditando('dados')}
            className="inline-flex items-center gap-1.5 rounded-full bg-pri px-4 py-2 text-base font-semibold text-pri-fg hover:bg-pri-deep"
          >
            <Pencil className="h-3.5 w-3.5" />
            Editar
          </button>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="flex flex-col gap-4 lg:col-span-2">
          {/* galeria */}
          <div className="overflow-hidden rounded-lg bg-card shadow-card">
            {capa ? (
              <img
                src={urlPublica(capa.storage_path)}
                alt={imovel.title}
                className="aspect-[16/10] w-full object-cover"
              />
            ) : (
              <div className="grid aspect-[16/10] w-full place-items-center bg-card-2 text-base text-tx-3">
                Sem foto
              </div>
            )}

            {imagens.length > 1 && (
              <div className="flex gap-1.5 overflow-x-auto p-2.5">
                {imagens.map((m, i) => (
                  <button
                    key={m.id}
                    onClick={() => setFoto(i)}
                    aria-label={`Foto ${i + 1}`}
                    className={cn(
                      'h-14 w-20 shrink-0 overflow-hidden rounded-md ring-2 transition-all',
                      i === foto ? 'ring-pri' : 'ring-transparent hover:ring-line-2',
                    )}
                  >
                    <img src={urlPublica(m.storage_path)} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* números */}
          <div className="rounded-lg bg-card p-5 shadow-card">
            <p className="text-3xl font-extrabold leading-none text-pri">
              {valoresDoImovel(imovel).join(' · ') || 'Sob consulta'}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-base text-tx-2">
              {imovel.condo_fee_cents ? <span>Condomínio {brlCents(imovel.condo_fee_cents)}</span> : null}
              {imovel.iptu_year_cents ? <span>IPTU {brlCents(imovel.iptu_year_cents)}/ano</span> : null}
            </div>
            {imovel.for_rent && imovel.rental_guarantees && imovel.rental_guarantees.length > 0 && (
              <p className="mt-1.5 text-base text-tx-2">
                Garantias:{' '}
                {imovel.rental_guarantees
                  .map((g) => RENTAL_GUARANTEE_LABEL[g as RentalGuarantee] ?? g)
                  .join(', ')}
              </p>
            )}

            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 sm:grid-cols-4">
              <Numero icone={BedDouble} valor={imovel.bedrooms} rotulo="dorm." extra={imovel.suites ? `${imovel.suites} suíte${imovel.suites > 1 ? 's' : ''}` : null} />
              <Numero icone={Bath} valor={imovel.bathrooms} rotulo="banh." />
              <Numero icone={Car} valor={imovel.parking_spots} rotulo="vagas" />
              <Numero
                icone={Ruler}
                valor={imovel.area_total}
                rotulo="m² total"
                extra={imovel.area_built ? `${imovel.area_built} m² úteis` : null}
              />
            </div>
          </div>

          {/* descrição — o campo que a lista não trazia */}
          <div className="rounded-lg bg-card p-5 shadow-card">
            <h2 className="mb-2 text-lg font-bold">Descrição</h2>
            {imovel.description ? (
              <p className="whitespace-pre-wrap text-base leading-relaxed text-tx-2">
                {imovel.description}
              </p>
            ) : (
              <p className="text-base text-tx-3">
                Sem descrição. É ela que vira o texto da landing page — vale escrever.
              </p>
            )}

            {imovel.amenities?.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5 border-t border-line pt-4">
                {imovel.amenities.map((a) => (
                  <span key={a} className="rounded-full bg-card-2 px-2.5 py-1 text-sm font-semibold text-tx-2">
                    {a}
                  </span>
                ))}
              </div>
            )}
          </div>

          {imovel.internal_notes && (
            <div className="rounded-lg bg-warn-soft p-5">
              <h2 className="mb-1 flex items-center gap-1.5 text-lg font-bold text-warn">
                <EyeOff className="h-4 w-4" />
                Nota interna
              </h2>
              <p className="text-sm text-warn">Nunca aparece na landing page nem para o cliente.</p>
              <p className="mt-2 whitespace-pre-wrap text-base text-tx-2">{imovel.internal_notes}</p>
            </div>
          )}
        </section>

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
      </div>

      {editando && (
        <PropertyFormDialog
          orgId={orgId}
          imovel={imovel}
          proprietario={proprietario ?? null}
          abaInicial={editando}
          onFechar={() => setEditando(null)}
        />
      )}
    </div>
  );
}

function Numero({
  icone: Icone,
  valor,
  rotulo,
  extra,
}: {
  icone: typeof BedDouble;
  valor: number | null;
  rotulo: string;
  extra?: string | null;
}) {
  return (
    <div>
      <p className="flex items-baseline gap-1.5">
        <Icone className="h-3.5 w-3.5 shrink-0 self-center text-tx-3" />
        <b className="text-lg font-bold tabular-nums">{valor ?? '—'}</b>
        <span className="text-sm text-tx-3">{rotulo}</span>
      </p>
      {extra && <p className="ml-5 text-sm text-tx-3">{extra}</p>}
    </div>
  );
}

function Contador({ valor, rotulo, dica }: { valor: number; rotulo: string; dica?: string | null }) {
  return (
    <div className="rounded-lg bg-card-2 px-3 py-2.5">
      <b className="block text-2xl font-bold tabular-nums">{valor.toLocaleString('pt-BR')}</b>
      <span className="text-sm text-tx-3">{rotulo}</span>
      {dica && <span className="block text-2xs text-tx-3">{dica}</span>}
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <p className="flex items-baseline justify-between gap-3 border-b border-line py-1.5 last:border-0">
      <span className="text-sm text-tx-3">{rotulo}</span>
      <span className="text-base font-semibold">{valor}</span>
    </p>
  );
}
