import { AlertTriangle, Loader2, Send } from 'lucide-react';
import {
  CONVERSOES_DEVOLVIDAS,
  CONVERSAO_META,
  CONVERSAO_JANELA_DIAS,
  CONVERSAO_MINIMO_SEMANAL,
} from '@contracts';
import { useConversoesDevolvidas, usePendenciaDaVolta } from '@/hooks/useInteligencia';
import { cn } from '@/lib/utils';

/**
 * A VOLTA — o que o CRM conta de volta para a Meta.
 *
 * Todo o resto desta tela é a Meta contando para a casa: gastei isto, entreguei
 * aquilo. Esta seção é o caminho contrário, e ela existe porque até 24/09 esse
 * caminho era uma parede.
 *
 * O QUE A MEDIÇÃO ENCONTROU: 187 leads vivos, todos do anúncio que abre o
 * WhatsApp, nenhum jamais devolvido. A API de Conversões estava escrita desde
 * agosto — dentro da função do FORMULÁRIO da landing page, que nunca recebeu um
 * envio. O cano existia; estava instalado na porta que ninguém usa.
 *
 * Enquanto isso, o que a Meta tinha para aprender era "quem abriu conversa" —
 * e conversa inclui o "oi" que sumiu, o engano e quem queria emprego.
 *
 * POR QUE A SEÇÃO MOSTRA O ENCANAMENTO E NÃO UM GRÁFICO: a pergunta aqui não é
 * de marketing, é de manutenção. Passou? Quanto travou? Um número que para de
 * subir é a única coisa que denuncia um token vencido — e token vencido aqui
 * não quebra nada visível, só faz o algoritmo voltar a aprender com o "oi".
 */
export function AVolta() {
  const { data, isLoading } = useConversoesDevolvidas();
  const pendencia = usePendenciaDaVolta();

  const porEvento = new Map((data ?? []).map((l) => [l.evento, l]));
  const total = (data ?? []).reduce(
    (a, l) => ({
      enviados: a.enviados + l.enviados,
      na_fila: a.na_fila + l.na_fila,
      travados: a.travados + l.falhou + l.expirou,
    }),
    { enviados: 0, na_fila: 0, travados: 0 },
  );

  return (
    <section className="rounded-md bg-card shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-4">
        <h2 className="flex items-center gap-2 text-md font-bold">
          <Send className="h-4 w-4 text-pri" />O que a Meta ficou sabendo
        </h2>
        <span className="text-2xs text-tx-3">
          o caminho contrário do resto da tela — daqui para lá
        </span>
      </div>

      <p className="px-4 pt-2 text-sm text-tx-2">
        Sem isto o algoritmo aprende com quem <strong>clicou</strong>, e clique é de graça. Com isto
        ele aprende com quem virou ficha, marcou visita e fez proposta.
      </p>

      {isLoading ? (
        <p className="flex items-center gap-2 px-4 py-6 text-sm text-tx-3">
          <Loader2 className="h-4 w-4 animate-spin" />
          Contando…
        </p>
      ) : (
        <>
          <ul className="mt-3 divide-y divide-line">
            {CONVERSOES_DEVOLVIDAS.map((evento) => {
              const l = porEvento.get(evento);
              const travados = (l?.falhou ?? 0) + (l?.expirou ?? 0);
              return (
                <li
                  key={evento}
                  className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold">{CONVERSAO_META[evento].label}</p>
                    <p className="truncate text-2xs text-tx-3">{CONVERSAO_META[evento].fato}</p>
                  </div>
                  <div className="flex items-center gap-3 text-right tabular-nums">
                    {/*
                      Zero não vira traço nem some. "Visita realizada: 0" é a
                      informação mais útil desta lista hoje — em toda a história
                      do CRM isso aconteceu uma vez, e o número precisa dizer
                      isso em vez de parecer um campo vazio.
                    */}
                    <span
                      className={cn(
                        'text-md font-bold',
                        (l?.enviados ?? 0) === 0 && 'text-tx-3',
                      )}
                    >
                      {l?.enviados ?? 0}
                    </span>
                    {(l?.na_fila ?? 0) > 0 && (
                      <span className="text-2xs text-tx-3">{l?.na_fila} na fila</span>
                    )}
                    {travados > 0 && (
                      <span className="flex items-center gap-1 text-2xs font-bold text-dng">
                        <AlertTriangle className="h-3 w-3" />
                        {travados}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {total.travados > 0 && (
            <div className="mx-4 mb-3 mt-3 rounded border border-dng/35 bg-dng-soft px-3 py-2.5">
              {/*
                O único alarme desta seção, e ele é discreto de propósito: uma
                conversão que não voltou NÃO é um lead perdido. O lead está aqui
                dentro, com o corretor. O que degradou foi o relatório.
              */}
              <p className="text-2xs text-tx-2">
                <strong>{total.travados}</strong> não chegaram à Meta. Os leads continuam no CRM — o
                que se perdeu foi o aprendizado do algoritmo. A Meta recusa qualquer fato com mais
                de {CONVERSAO_JANELA_DIAS} dias, então o que ficou parado além disso não volta mais.
              </p>

              {/*
                E o MOTIVO, nas palavras da própria Meta.

                Durante a construção ela recusou cinco vezes, cada uma por um
                campo diferente, e nenhum deles estava documentado junto. Sem
                esta linha, a fila parada seria indistinguível de uma fila
                funcionando mal — e as duas somem da cabeça de quem olha a tela
                em uma semana.
              */}
              {pendencia.data && (
                <p className="mt-2 border-t border-dng/25 pt-2 text-2xs text-tx-2">
                  <strong>{pendencia.data.titulo}</strong>
                  {pendencia.data.detalhe ? ` — ${pendencia.data.detalhe}` : null}
                </p>
              )}
            </div>
          )}

          <p className="border-t border-line px-4 py-3 text-2xs text-tx-3">
            {/*
              A frase que impede a decisão errada. A tentação natural de quem vê
              "Visita agendada" no Gerenciador de Eventos é trocar o objetivo da
              campanha para ela — e a campanha entraria em aprendizado e
              ficaria lá, porque visita acontece uma ou duas vezes por mês.
            */}
            Isto alimenta o <strong>relatório</strong>, não o objetivo da campanha. A Meta precisa de
            cerca de {CONVERSAO_MINIMO_SEMANAL} conversões por semana para sair do aprendizado, e
            nem o “virou lead” chega perto disso hoje. Serve para responder qual criativo traz quem
            avança — trocar o objetivo da campanha para visita deixaria a entrega travada.
          </p>
        </>
      )}
    </section>
  );
}
