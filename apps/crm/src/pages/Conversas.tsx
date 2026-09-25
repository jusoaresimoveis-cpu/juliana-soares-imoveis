import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Loader2,
  Send,
  AlertCircle,
  MessageCircle,
  UserPlus,
  ExternalLink,
  Lock,
  UserCheck,
  RotateCcw,
} from 'lucide-react';
import {
  useConversas,
  useContagemDeConversas,
  useClassificarConversa,
  useMensagens,
  useEnviar,
  useMarcarLida,
  useConversasAoVivo,
  useMidiaAssinada,
  ESTADOS_DE_CONVERSA,
  ESTADO_META,
  type EstadoDeConversa,
  type Conversa,
  type Mensagem,
} from '@/hooks/useConversas';
import { WA_INSTANCE_META } from '@contracts';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/Avatar';

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

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

/**
 * Marcar a conversa como pessoal — ou trazê-la de volta.
 *
 * Um botão só, que muda conforme onde a conversa está. Três botões sempre
 * visíveis seriam três decisões a cada conversa aberta, e quem está atendendo
 * cliente não quer decidir taxonomia: quer responder.
 *
 * Quando a classificação foi feita à mão, aparece também o "voltar ao
 * automático" — é como se desfaz um engano, e sem ele a marcação vira uma
 * porta de mão única.
 */
function Classificar({
  conversa,
  souDono,
  ocupado,
  onEscolher,
}: {
  conversa: Conversa;
  /** Quem conectou o número. É a única pessoa que pode classificar — e a única
      que enxerga o resultado depois de "Não é lead". */
  souDono: boolean;
  ocupado: boolean;
  onEscolher: (c: 'lead' | 'pessoal' | null) => void;
}) {
  const manual = conversa.classification !== null;

  /*
   * Sem o número, sem o botão.
   *
   * O gatilho no banco recusa a escrita de quem não conectou aquele número, e
   * mostrar um botão que sempre falha é pior do que não mostrar: a pessoa
   * clica, lê um erro que não a ajuda, e passa a desconfiar do resto da tela.
   */
  if (!souDono) return null;

  return (
    <span className="inline-flex items-center gap-1.5">
      {conversa.estado === 'pessoal' ? (
        <button
          /*
           * A volta de um GRUPO só existe forçando 'lead': grupo sem
           * classificação é pessoal por definição, então devolver ao automático
           * o traria de volta para cá no mesmo instante.
           */
          onClick={() => onEscolher(conversa.is_group ? 'lead' : null)}
          disabled={ocupado}
          title="Volta a aparecer para a equipe e a contar no painel"
          className="inline-flex items-center gap-1.5 rounded-full border border-line-2 px-3 py-1.5 text-sm font-semibold text-tx-2 transition-colors hover:border-ok hover:text-ok disabled:opacity-60"
        >
          {ocupado ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserCheck className="h-3 w-3" />}
          Tirar de pessoais
        </button>
      ) : (
        <button
          onClick={() => onEscolher('pessoal')}
          disabled={ocupado}
          title="Vira particular: só você enxerga, nem o gestor nem o administrador. Sai de toda contagem do painel."
          className="inline-flex items-center gap-1.5 rounded-full border border-line-2 px-3 py-1.5 text-sm font-semibold text-tx-2 transition-colors hover:border-dng hover:text-dng disabled:opacity-60"
        >
          {ocupado ? <Loader2 className="h-3 w-3 animate-spin" /> : <Lock className="h-3 w-3" />}
          Tornar pessoal
        </button>
      )}

      {manual && conversa.estado !== 'pessoal' && (
        <button
          onClick={() => onEscolher(null)}
          disabled={ocupado}
          title="Volta a decidir pela origem rastreada"
          aria-label="Voltar ao automático"
          className="grid h-[30px] w-[30px] place-items-center rounded-full border border-line-2 text-tx-3 transition-colors hover:text-tx disabled:opacity-60"
        >
          <RotateCcw className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

function ItemDaCaixa({
  conversa,
  ativa,
  onAbrir,
}: {
  conversa: Conversa;
  ativa: boolean;
  onAbrir: () => void;
}) {
  return (
    <button
      onClick={onAbrir}
      className={cn(
        'flex w-full gap-2.5 border-b border-line px-4 py-3 text-left transition-colors hover:bg-card-2',
        ativa && 'bg-pri-soft/40',
      )}
    >
      <Avatar
        nome={conversa.contact_name ?? conversa.contact_e164 ?? '?'}
        foto={conversa.foto_url}
        className="h-9 w-9 text-xs"
      />

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <b className="truncate text-base font-bold">
            {conversa.contact_name ?? conversa.contact_e164 ?? 'Contato'}
          </b>
          {conversa.last_message_at && (
            <time className="ml-auto shrink-0 text-2xs text-tx-3">
              {hora(conversa.last_message_at)}
            </time>
          )}
        </span>

        <span className="mt-0.5 flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm text-tx-3">
            {conversa.last_message_body ?? '—'}
          </span>
          {conversa.unread_count > 0 && (
            <span className="grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full bg-pri px-1 text-2xs font-bold text-pri-fg">
              {conversa.unread_count}
            </span>
          )}
        </span>

        {conversa.ref_code && (
          <span className="mt-1 inline-block rounded bg-pri-soft px-1.5 py-0.5 text-2xs font-bold text-pri">
            {conversa.ref_code}
          </span>
        )}
      </span>
    </button>
  );
}

/**
 * A mídia recebida, servida por URL assinada.
 *
 * Os quatro estados aparecem, e cada um diz uma coisa diferente ao corretor:
 * baixando, pronta, falhou, ou ainda sem arquivo. Deixar tudo como um ícone
 * genérico é o que faz alguém concluir que "o sistema não recebe foto".
 */
function Midia({ mensagem }: { mensagem: Mensagem }) {
  const { data: url, isLoading } = useMidiaAssinada(
    mensagem.media_status === 'pronta' ? mensagem.media_path : null,
  );

  if (mensagem.media_status === 'pendente') {
    return (
      <p className="mb-1 flex items-center gap-1.5 text-sm opacity-80">
        <Loader2 className="h-3 w-3 animate-spin" />
        Baixando {mensagem.kind}…
      </p>
    );
  }

  if (mensagem.media_status === 'falhou') {
    return (
      <p className="mb-1 flex items-start gap-1.5 text-sm">
        <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
        Não foi possível baixar este arquivo.
      </p>
    );
  }

  if (isLoading) {
    return <p className="mb-1 text-sm opacity-70">Abrindo…</p>;
  }

  if (!url) {
    return <p className="mb-1 text-sm opacity-70">({mensagem.kind})</p>;
  }

  const ehImagem = mensagem.media_mime?.startsWith('image/');
  const ehAudio = mensagem.media_mime?.startsWith('audio/');
  const ehVideo = mensagem.media_mime?.startsWith('video/');

  if (ehImagem) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="mb-1 block">
        <img src={url} alt="" className="max-h-64 w-full rounded-lg object-cover" />
      </a>
    );
  }
  if (ehAudio) return <audio controls src={url} className="mb-1 w-full max-w-[240px]" />;
  if (ehVideo) return <video controls src={url} className="mb-1 max-h-64 w-full rounded-lg" />;

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="mb-1 flex items-center gap-1.5 text-sm font-semibold underline"
    >
      <ExternalLink className="h-3 w-3" />
      {mensagem.media_filename ?? 'Abrir arquivo'}
    </a>
  );
}
