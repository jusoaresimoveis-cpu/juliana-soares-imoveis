import { MessageCircleReply } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { desde, type useEsperando } from '@/hooks/usePainel';
import type { useFotosGuardadas } from '@/hooks/useFotosGuardadas';
import { Avatar } from '@/components/Avatar';
import { SeloDeTemperatura } from '@/components/leads/SeloDeTemperatura';
import { Tag } from '@/components/dashboard/Tag';

export function EsperandoResposta({
  fila,
  fotos,
}: {
  fila: ReturnType<typeof useEsperando>;
  fotos: ReturnType<typeof useFotosGuardadas>;
}) {
  return (
    <section className="col-span-12 self-start rounded-lg bg-card p-5 shadow-card lg:col-span-6">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <MessageCircleReply className="h-4 w-4 text-warn" />
          Esperando resposta
        </h2>
        <p className="text-sm text-tx-3">
          {(fila.data ?? []).length === 1
            ? 'uma pessoa escreveu e ainda não teve retorno'
            : `${(fila.data ?? []).length} pessoas escreveram e ainda não tiveram retorno`}
        </p>
      </div>

      <ul>
        {(fila.data ?? []).map((lead, i) => (
          <li
            key={lead.id}
            className={cn(
              'grid grid-cols-[34px_1fr_auto] items-center gap-3 py-3',
              i < (fila.data ?? []).length - 1 && 'border-b border-line',
            )}
          >
            <Avatar
              nome={lead.full_name}
              foto={(lead.foto_path && fotos.data?.[lead.foto_path]) || lead.foto_url}
              className="h-[34px] w-[34px] rounded-[11px] text-sm"
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-md font-bold">
                <Link to={`/leads/${lead.id}`} className="truncate hover:text-pri">
                  {lead.full_name}
                </Link>
                <SeloDeTemperatura valor={lead.temperatura} />
                {lead.etapa && <Tag tom="neutro">{lead.etapa}</Tag>}
              </div>
              <p className="mt-0.5 truncate text-sm text-tx-3">
                {lead.ultima_mensagem ?? 'Mensagem sem texto'}
              </p>
            </div>
            {/*
              O tempo é o assunto desta lista, então ele é o que tem cor.
              Acima de duas horas vira alerta — é o limite em que uma pessoa
              que perguntou preço já procurou outra imobiliária.
            */}
            <time
              className={cn(
                'text-right text-xs font-bold tabular-nums',
                Date.now() - new Date(lead.esperando_desde).getTime() > 2 * 3_600_000
                  ? 'text-dng'
                  : 'text-tx-3',
              )}
            >
              {desde(lead.esperando_desde)}
            </time>
          </li>
        ))}
      </ul>
    </section>
  );
}
