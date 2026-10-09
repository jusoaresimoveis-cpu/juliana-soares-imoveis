import { greeting } from '@/lib/utils';
import type { usePainel } from '@/hooks/usePainel';

export function Saudacao({
  primeiroNome,
  carteiraVazia,
  esperando,
  painel,
}: {
  primeiroNome: string;
  carteiraVazia: boolean;
  esperando: number;
  painel: ReturnType<typeof usePainel>;
}) {
  return (
    <section className="col-span-12 pt-1 lg:col-span-4">
      <h1 className="text-[clamp(1.5rem,2.6vw,2rem)] font-bold leading-tight tracking-[-0.035em]">
        {greeting()}, <span className="text-pri">{primeiroNome}</span>!
        <br />
        Por onde você começa hoje?
      </h1>
      {/* A frase diz o que o banco sabe. Antes eram dois números fixos no
          código — e número inventado na primeira linha do painel ensina a
          desconfiar de todo o resto. */}
      <p className="mt-3 max-w-[34ch] text-md leading-relaxed text-tx-2">
        {carteiraVazia ? (
          <>
            Nenhum lead no seu nome neste período. Quem distribui os que chegam é a gerência —
            assim que um for seu, ele aparece aqui.
          </>
        ) : (
          <>
        {esperando > 0 ? (
          <>
            <strong className="text-tx">
              {esperando} lead{esperando === 1 ? '' : 's'}
            </strong>{' '}
            ainda sem primeiro contato
          </>
        ) : (
          <>Nenhum lead esperando primeiro contato</>
        )}
        {' '}e{' '}
        {/*
          As visitas da saudação são as que ainda VÃO acontecer, e não as do
          período. A pergunta aqui é "por onde você começa hoje?" — e visita
          agendada é sempre futura, então ela nunca cabia numa janela que
          termina hoje. O painel dizia "0 visitas" no mesmo dia em que a agenda
          mostrava uma marcada para setembro.
        */}
        {(painel.data?.atual.visitas_proximas ?? 0) === 0 ? (
          <>nenhuma visita marcada.</>
        ) : (
          <>
            <strong className="text-tx">
              {painel.data?.atual.visitas_proximas} visita
              {painel.data?.atual.visitas_proximas === 1 ? '' : 's'}
            </strong>{' '}
            marcada{painel.data?.atual.visitas_proximas === 1 ? '' : 's'}.
          </>
        )}
          </>
        )}
      </p>
    </section>
  );
}
