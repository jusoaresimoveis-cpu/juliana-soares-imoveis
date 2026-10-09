import type { SetURLSearchParams } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import {
  ESTADOS_DE_CONVERSA,
  ESTADO_META,
  type EstadoDeConversa,
  type Conversa,
  type useConversas,
  type useContagemDeConversas,
} from '@/hooks/useConversas';
import { cn } from '@/lib/utils';
import { ItemDaCaixa } from '@/components/conversas/ItemDaCaixa';

export function CaixaDeConversas({
  aberta,
  estado,
  params,
  setParams,
  conversas,
  contagem,
  lista,
}: {
  aberta: string | null;
  estado: EstadoDeConversa;
  params: URLSearchParams;
  setParams: SetURLSearchParams;
  conversas: ReturnType<typeof useConversas>;
  contagem: ReturnType<typeof useContagemDeConversas>;
  lista: Conversa[];
}) {
  return (
    <aside
      className={cn(
        'flex w-full min-w-0 flex-col rounded-lg bg-card shadow-card md:w-[320px] md:shrink-0',
        aberta && 'hidden md:flex',
      )}
    >
      <header className="border-b border-line px-4 py-3">
        <h1 className="text-lg font-bold">Conversas</h1>

        {/* As três abas ficam SEMPRE à vista, com a contagem de cada uma.
            Esconder conversa sem dizer quantas ficaram de fora é o mesmo que
            perdê-las: a pessoa não procura o que não sabe que existe. */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {ESTADOS_DE_CONVERSA.map((e) => (
            <button
              key={e}
              onClick={() => {
                const p = new URLSearchParams(params);
                p.set('e', e);
                // Trocar de aba fecha a conversa aberta: ela provavelmente
                // não está na lista nova, e o painel ficaria mostrando uma
                // conversa que a lista ao lado não contém.
                p.delete('c');
                setParams(p, { replace: true });
              }}
              title={ESTADO_META[e].explicacao}
              className={cn(
                'rounded-full border px-2.5 py-1 text-sm font-semibold transition-colors',
                estado === e
                  ? 'border-pri bg-pri text-pri-fg'
                  : 'border-line-2 bg-card text-tx-2 hover:border-pri-light hover:text-tx',
              )}
            >
              {ESTADO_META[e].rotulo}
              {contagem.data && (
                <span className={cn('ml-1.5 tabular-nums', estado === e ? 'opacity-80' : 'text-tx-3')}>
                  {contagem.data[e]}
                </span>
              )}
            </button>
          ))}
        </div>

        <p className="mt-1.5 text-2xs leading-snug text-tx-3">
          {ESTADO_META[estado].explicacao}
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!conversas.isLoading && lista.length === 0 && (
          <div className="px-4 py-10 text-center">
            <MessageCircle className="mx-auto h-6 w-6 text-tx-3" />
            <p className="mt-2 text-base font-semibold text-tx-2">
              {estado === 'lead'
                ? 'Nenhuma conversa de lead'
                : estado === 'pessoal'
                  ? 'Nenhuma marcada como pessoal'
                  : 'Nada sem origem'}
            </p>
            <p className="mt-1 text-sm text-tx-3">
              {/* Contagem zerada em TODAS as abas é uma coisa; zerada só nesta
                  é outra, e mandar a pessoa "esperar um cliente escrever"
                  quando há 12 conversas na aba ao lado seria mentira. */}
              {(contagem.data?.lead ?? 0) +
                (contagem.data?.sem_origem ?? 0) +
                (contagem.data?.pessoal ?? 0) ===
              0
                ? 'Elas aparecem aqui quando um cliente escreve para um número conectado.'
                : 'Há conversas nas outras abas acima.'}
            </p>
          </div>
        )}

        {lista.map((c) => (
          <ItemDaCaixa
            key={c.id}
            conversa={c}
            ativa={c.id === aberta}
            onAbrir={() => {
              const p = new URLSearchParams(params);
              p.set('c', c.id);
              setParams(p, { replace: true });
            }}
          />
        ))}
      </div>
    </aside>
  );
}
