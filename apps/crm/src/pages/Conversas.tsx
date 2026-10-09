import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Loader2,
  Send,
  AlertCircle,
  UserPlus,
  ExternalLink,
} from 'lucide-react';
import {
  useConversas,
  useContagemDeConversas,
  useClassificarConversa,
  useMensagens,
  useEnviar,
  useMarcarLida,
  useConversasAoVivo,
  type EstadoDeConversa,
} from '@/hooks/useConversas';
import { WA_INSTANCE_META } from '@contracts';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/Avatar';
import { CaixaDeConversas } from '@/components/conversas/CaixaDeConversas';
import { Classificar } from '@/components/conversas/Classificar';
import { Midia } from '@/components/conversas/Midia';
import { hora } from '@/components/conversas/hora';

export default function Conversas() {
  const [params, setParams] = useSearchParams();
  const aberta = params.get('c');

  /*
   * O filtro mora na URL.
   *
   * Assim a aba sobrevive ao F5, e o link que alguém manda no grupo do time
   * abre a mesma lista que essa pessoa está vendo. `lead` é o padrão porque é
   * a caixa de trabalho: quem abre Conversas está atendendo cliente.
   */
  const estado = (params.get('e') as EstadoDeConversa | null) ?? 'lead';

  useConversasAoVivo();
  const conversas = useConversas(estado);
  const contagem = useContagemDeConversas();
  const classificar = useClassificarConversa();
  const mensagens = useMensagens(aberta);
  const enviar = useEnviar(aberta);
  const marcarLida = useMarcarLida();

  const [texto, setTexto] = useState('');
  const fim = useRef<HTMLDivElement>(null);

  const conversa = useMemo(
    () => conversas.data?.find((c) => c.id === aberta) ?? null,
    [conversas.data, aberta],
  );

  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'end' });
  }, [mensagens.data]);

  useEffect(() => {
    if (aberta && conversa && conversa.unread_count > 0) marcarLida.mutate(aberta);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberta, conversa?.unread_count]);

  /*
   * O número vem COM a conversa, e não de uma lista à parte.
   *
   * Cruzar `instance_id` com a lista de números da organização parou de
   * funcionar quando a 080 recortou essa lista por dono: um lead repassado pelo
   * gerente traz uma conversa que entrou pelo número DELE, e o corretor não
   * acha esse número em lista nenhuma. Resultado: "número removido" e resposta
   * travada, com a mensagem do cliente na tela.
   */
  const podeEnviar = conversa?.numero_estado === 'conectada' && !!conversa?.contact_e164;

  const lista = conversas.data ?? [];

  return (
    <div className="flex h-full gap-3">
      {/* caixa */}
      <CaixaDeConversas
        aberta={aberta}
        estado={estado}
        params={params}
        setParams={setParams}
        conversas={conversas}
        contagem={contagem}
        lista={lista}
      />

      {/* janela */}
      <section
        className={cn(
          'flex min-w-0 flex-1 flex-col rounded-lg bg-card shadow-card',
          !aberta && 'hidden md:flex',
        )}
      >
        {!conversa && (
          <div className="grid flex-1 place-items-center px-6 text-center">
            <p className="text-base text-tx-3">Escolha uma conversa à esquerda.</p>
          </div>
        )}

        {conversa && (
          <>
            <header className="flex flex-wrap items-center gap-2.5 border-b border-line px-4 py-3">
              <button
                onClick={() => {
                  const p = new URLSearchParams(params);
                  p.delete('c');
                  setParams(p, { replace: true });
                }}
                className="text-sm font-semibold text-tx-3 md:hidden"
              >
                Voltar
              </button>

              <Avatar
                nome={conversa.contact_name ?? conversa.contact_e164 ?? '?'}
                foto={conversa.foto_url}
                className="h-9 w-9 text-xs"
              />

              <div className="min-w-0">
                <p className="truncate text-base font-bold">
                  {conversa.contact_name ?? conversa.contact_e164 ?? 'Contato'}
                </p>
                <p className="truncate text-sm text-tx-3">
                  {conversa.numero_rotulo ?? 'número removido'}
                  {conversa.ref_code && ` · veio de ${conversa.ref_code}`}
                </p>
              </div>

              <div className="ml-auto flex flex-wrap items-center gap-2">
                <Classificar
                  conversa={conversa}
                  souDono={conversa.numero_e_meu}
                  ocupado={classificar.isPending}
                  onEscolher={(c) =>
                    classificar.mutate({ conversaId: conversa.id, classificacao: c })
                  }
                />

                {conversa.lead_id ? (
                  <Link
                    to={`/leads/${conversa.lead_id}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-line-2 px-3 py-1.5 text-sm font-semibold text-tx-2 hover:border-pri hover:text-pri"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Ficha
                  </Link>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-warn-soft px-3 py-1.5 text-sm font-semibold text-warn">
                    <UserPlus className="h-3 w-3" />
                    Sem lead
                  </span>
                )}
              </div>
            </header>

            {classificar.error && (
              <p className="flex items-start gap-2 border-b border-line bg-dng-soft px-4 py-2 text-sm text-dng">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Não foi possível classificar: {(classificar.error as Error).message}
              </p>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {mensagens.isLoading && (
                <p className="flex items-center justify-center gap-2 py-8 text-sm text-tx-3">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Carregando
                </p>
              )}

              {(mensagens.data ?? []).map((m) => (
                <div
                  key={m.id}
                  className={cn('mb-2 flex', m.direction === 'saida' ? 'justify-end' : 'justify-start')}
                >
                  <div
                    className={cn(
                      'max-w-[76%] rounded-2xl px-3.5 py-2',
                      m.direction === 'saida'
                        ? 'rounded-br-md bg-pri text-pri-fg'
                        : 'rounded-bl-md bg-card-2 text-tx',
                      m.status === 'falhou' && 'ring-1 ring-dng',
                    )}
                  >
                    {m.kind !== 'texto' && <Midia mensagem={m} />}

                    {m.body && (
                      <p className="whitespace-pre-wrap text-base leading-snug">{m.body}</p>
                    )}

                    <p
                      className={cn(
                        'mt-0.5 flex items-center justify-end gap-1.5 text-2xs',
                        m.direction === 'saida' ? 'text-pri-fg/70' : 'text-tx-3',
                      )}
                    >
                      {hora(m.occurred_at)}
                      {m.direction === 'saida' && (
                        <span>
                          {m.status === 'enfileirada' && '· enviando'}
                          {m.status === 'enviada' && '· enviada'}
                          {m.status === 'entregue' && '· entregue'}
                          {m.status === 'lida' && '· lida'}
                        </span>
                      )}
                    </p>

                    {/* A mensagem que falhou CONTINUA aqui, com o motivo. Na
                        referência ela sumia do histórico e o corretor achava
                        que tinha enviado. */}
                    {/* A falha vai em faixa própria, e não em texto colorido
                        sobre o balão. `text-dng` é cor de erro para fundo
                        CLARO: sobre o roxo do balão de saída ela vira rosa
                        sobre roxo, praticamente ilegível — e é justamente o
                        aviso que o corretor precisa ler. Só apareceu olhando a
                        tela; nenhum teste pegaria. */}
                    {m.status === 'falhou' && (
                      <p
                        className={cn(
                          'mt-1.5 flex items-start gap-1 rounded-lg px-2 py-1 text-2xs font-bold',
                          m.direction === 'saida' ? 'bg-white/95 text-dng' : 'bg-dng-soft text-dng',
                        )}
                      >
                        <AlertCircle className="mt-px h-2.5 w-2.5 shrink-0" />
                        Não enviada — {m.error ?? 'motivo desconhecido'}
                      </p>
                    )}
                  </div>
                </div>
              ))}
              <div ref={fim} />
            </div>

            <footer className="border-t border-line p-3">
              {!podeEnviar && (
                <p className="mb-2 flex items-start gap-2 rounded-xl bg-warn-soft p-2.5 text-sm text-warn">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {!conversa.contact_e164
                    ? 'Este contato veio sem número identificado. Vincule a um lead para responder.'
                    : `O número ${conversa.numero_rotulo ?? ''} não está conectado. ${
                        conversa.numero_estado
                          ? WA_INSTANCE_META[conversa.numero_estado].instrucao
                          : ''
                      }`}
                </p>
              )}

              <form
                className="flex items-end gap-2"
                onSubmit={(e: FormEvent) => {
                  e.preventDefault();
                  if (!texto.trim()) return;
                  enviar.mutate(texto.trim(), { onSuccess: () => setTexto('') });
                }}
              >
                <textarea
                  rows={1}
                  value={texto}
                  disabled={!podeEnviar}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (texto.trim()) enviar.mutate(texto.trim(), { onSuccess: () => setTexto('') });
                    }
                  }}
                  placeholder={podeEnviar ? 'Escreva uma mensagem…' : 'Envio indisponível'}
                  className="max-h-32 min-h-[42px] flex-1 resize-y rounded-xl border border-line-2 bg-card px-3.5 py-2.5 text-base outline-none focus:border-pri disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={!podeEnviar || !texto.trim() || enviar.isPending}
                  aria-label="Enviar"
                  className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-xl bg-pri text-pri-fg hover:bg-pri-deep disabled:opacity-40"
                >
                  {enviar.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </button>
              </form>

              {enviar.isError && (
                <p className="mt-2 text-sm text-dng">{(enviar.error as Error).message}</p>
              )}
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
