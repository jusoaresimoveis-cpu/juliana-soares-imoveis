import { Link } from 'react-router-dom';
import { LEAD_SOURCE_LABEL_CURTO, type LeadSource } from '@contracts';
import { cn } from '@/lib/utils';
import { desde, type useUltimosLeads } from '@/hooks/usePainel';
import type { usePaginaDoLead, useEtiquetasDoLead } from '@/hooks/useLead';
import type { useFotosGuardadas } from '@/hooks/useFotosGuardadas';
import { Avatar } from '@/components/Avatar';
import { Tag } from '@/components/dashboard/Tag';

export function UltimosLeads({
  recentes,
  fotos,
  paginas,
  etiquetas,
}: {
  recentes: ReturnType<typeof useUltimosLeads>;
  fotos: ReturnType<typeof useFotosGuardadas>;
  paginas: ReturnType<typeof usePaginaDoLead>;
  etiquetas: ReturnType<typeof useEtiquetasDoLead>;
}) {
  return (
    <section className="col-span-12 rounded-lg bg-card p-5 shadow-card lg:col-span-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-bold">Últimos leads</h2>
        <button className="text-sm font-semibold text-tx-3 transition-colors hover:text-pri">
          Ver todos
        </button>
      </div>

      {recentes.isLoading ? (
        <p className="py-6 text-base text-tx-3">Carregando…</p>
      ) : (recentes.data ?? []).length === 0 ? (
        /* Vazio de verdade é informação. Antes havia cinco nomes inventados
           aqui, e nome inventado na primeira dobra do painel ensina a
           desconfiar de todo o resto da tela. */
        <p className="py-6 text-base text-tx-3">
          Nenhum lead ainda. O primeiro que entrar — por anúncio, WhatsApp ou cadastro — aparece
          aqui.
        </p>
      ) : (
        <ul>
          {(recentes.data ?? []).map((lead, i) => {
            const pagina = paginas.data?.[lead.id];
            const conta = etiquetas.data?.[lead.id]?.conta;
            return (
              <li
                key={lead.id}
                className={cn(
                  'grid grid-cols-[34px_1fr_auto] items-center gap-3 py-3',
                  i < (recentes.data ?? []).length - 1 && 'border-b border-line',
                )}
              >
                <Avatar
                  nome={lead.full_name}
                  foto={(lead.foto_path && fotos.data?.[lead.foto_path]) || lead.foto_url}
                  className="h-[34px] w-[34px] rounded-[11px] text-sm"
                />
                <div className="min-w-0">
                  {/* `flex-wrap` porque a linha ganhou duas etiquetas: com quatro
                      delas num nome longo, sem quebra a última sai da tela. */}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-md font-bold">
                    <Link to={`/leads/${lead.id}`} className="truncate hover:text-pri">
                      {lead.full_name}
                    </Link>
                    <Tag tom={lead.source === 'meta_ads' ? 'pri' : lead.source === 'google_ads' ? 'ok' : 'warn'}>
                      {LEAD_SOURCE_LABEL_CURTO[lead.source as LeadSource] ?? lead.source}
                    </Tag>
                    {/* O canal e a PÁGINA são coisas diferentes: dois leads de
                        "WhatsApp" podem ter vindo de páginas diferentes, e é a
                        página que está em teste. */}
                    {/* Nome longo de empreendimento não pode empurrar a linha:
                        corta no CSS e o título completo fica no `title`. */}
                    {pagina && (
                      <Tag tom="neutro" titulo={pagina.rotulo}>
                        {pagina.rotulo}
                      </Tag>
                    )}
                    {/*
                      De qual CONTA DE ANÚNCIO veio.
                      Com duas BMs na casa, "Meta Ads" parou de identificar: dois
                      leads do mesmo canal podem ter saído da conta do gerente ou
                      da corretora, e é essa diferença que diz de quem é o
                      resultado. Sem conta conhecida a etiqueta não aparece — o
                      anúncio ainda não teve gasto importado, e etiqueta
                      adivinhada é pior do que etiqueta ausente.
                    */}
                    {conta && (
                      <Tag tom="warn" titulo={conta}>
                        {conta}
                      </Tag>
                    )}
                    {/* Quem atende. "Sem responsável" é informação, não lacuna:
                        é o lead que está esperando alguém pegar. */}
                    <Tag
                      tom={etiquetas.data?.[lead.id]?.responsavel ? 'ok' : 'neutro'}
                      titulo={etiquetas.data?.[lead.id]?.responsavel ?? 'Ninguém pegou este lead'}
                    >
                      {etiquetas.data?.[lead.id]?.responsavel ?? 'Sem responsável'}
                    </Tag>
                  </div>
                  <p className="mt-0.5 truncate text-sm text-tx-3">
                    {lead.ultima_mensagem ?? lead.etapa ?? '—'}
                  </p>
                </div>
                <div className="text-right">
                  <time className="block text-xs font-semibold text-tx-3">
                    {desde(lead.created_at)}
                  </time>
                  {lead.nao_lidas > 0 && (
                    <span className="mt-1 inline-grid h-[18px] min-w-[18px] place-items-center rounded-full bg-pri px-1 text-2xs font-bold text-pri-fg">
                      {lead.nao_lidas}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
