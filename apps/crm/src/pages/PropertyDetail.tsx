import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Loader2,
  Pencil,
  MapPin,
  BedDouble,
  BedSingle,
  Bath,
  Car,
  Ruler,
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
import { useUnidades } from '@/hooks/useUnidades';
import { PropertyFormDialog, type AbaDoImovel } from '@/components/properties/PropertyFormDialog';
import { BlocoDasUnidades } from '@/components/properties/BlocoDasUnidades';
import { LateralDoImovel } from '@/components/properties/LateralDoImovel';
import { Numero } from '@/components/properties/PecasDaFicha';
import {
  PROPERTY_TYPE_LABEL,
  RENTAL_GUARANTEE_LABEL,
  caracteristicasParaMostrar,
  normalizarCaracteristicas,
  precoDeTabela,
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
  const { data: doEmpreendimento } = useUnidades(id, !!imovel?.has_units);

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
  // O "de" do "de R$ X por R$ Y" que o site mostra.
  const tabela = imovel.for_sale ? precoDeTabela(imovel.price_cents, imovel.original_price_cents) : null;
  const sobre = caracteristicasParaMostrar(normalizarCaracteristicas(imovel.features), imovel.property_type);

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
        {/* `min-w-0`: o espelho das unidades é largo, e sem isto a coluna do grid
            cresceria até ele caber, passando da tela do celular. Assim ele rola. */}
        <section className="flex min-w-0 flex-col gap-4 lg:col-span-2">
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
              {tabela ? (
                <span>
                  Preço de tabela <s>{brlCents(tabela)}</s>
                </span>
              ) : null}
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

            {/* Quartos e suítes lado a lado, com os ícones do site: no cadastro, os
                quartos não contam as suítes (2 quartos e 1 suíte são 3 dormitórios).
                No empreendimento eles são de cada planta, no bloco "Unidades". */}
            {!imovel.has_units && (
              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 sm:grid-cols-5">
                <Numero icone={BedSingle} valor={imovel.bedrooms} rotulo={imovel.bedrooms === 1 ? 'quarto' : 'quartos'} />
                <Numero icone={BedDouble} valor={imovel.suites} rotulo={imovel.suites === 1 ? 'suíte' : 'suítes'} />
                <Numero icone={Bath} valor={imovel.bathrooms} rotulo="banh." />
                <Numero icone={Car} valor={imovel.parking_spots} rotulo={imovel.parking_spots === 1 ? 'vaga' : 'vagas'} />
                <Numero
                  icone={Ruler}
                  valor={imovel.area_total}
                  rotulo="m² total"
                  extra={imovel.area_built ? `${imovel.area_built} m² úteis` : null}
                />
              </div>
            )}
          </div>

          {imovel.has_units && (
            <BlocoDasUnidades
              imovelId={imovel.id}
              tipo={imovel.property_type}
              mesDaTabela={imovel.units_table_month ?? null}
              plantas={doEmpreendimento?.plantas}
              unidades={doEmpreendimento?.unidades}
            />
          )}

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

          </div>

          {/* "Sobre o imóvel": o que o site mostra abaixo da descrição. */}
          <div className="rounded-lg bg-card p-5 shadow-card">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold">Sobre o imóvel</h2>
              <button
                type="button"
                onClick={() => setEditando('sobre')}
                className="inline-flex items-center gap-1 text-sm font-semibold text-pri hover:underline"
              >
                <Pencil className="h-3.5 w-3.5" />
                {sobre.length ? 'Editar' : 'Marcar itens'}
              </button>
            </div>
            {sobre.length ? (
              <div className="flex flex-col gap-3">
                {sobre.map(({ categoria, titulo, itens }) => (
                  <div key={categoria}>
                    <p className="mb-1.5 text-sm font-bold uppercase text-tx-3">{titulo}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {itens.map((item) => (
                        <span key={item} className="rounded-full bg-card-2 px-2.5 py-1 text-sm font-semibold text-tx-2">
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-base text-tx-3">
                Nenhum item marcado. Piscina, box de praia, churrasqueira: é o que o cliente procura no anúncio.
              </p>
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

        <LateralDoImovel
          imovel={imovel}
          interessados={interessados}
          visitas={visitas}
          etapas={etapas}
          proprietario={proprietario}
          setEditando={setEditando}
        />
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
