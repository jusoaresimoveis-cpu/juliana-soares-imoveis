import { Check, AlertCircle } from 'lucide-react';
import { PALETAS } from '@/lib/cores';
import { useCorDoSistema, useTemaEscuro } from '@/hooks/useCorDoSistema';
import { cn } from '@/lib/utils';

/**
 * Escolher a cor do sistema.
 *
 * A amostra de cada paleta é desenhada com os tokens REAIS daquela paleta, não
 * com uma bolinha aproximada: o que a pessoa vê no seletor é exatamente o que
 * o CRM vai virar. Amostra que não bate com o resultado transforma a escolha
 * em tentativa e erro.
 */
export function CorDoSistema() {
  const { cor, escolher, erro } = useCorDoSistema();
  // O MESMO tema que o resto do app: lido da classe do elemento raiz, não de
  // uma cópia local que só este componente atualiza.
  const escuro = useTemaEscuro();

  return (
    <section className="rounded-lg bg-card p-5 shadow-card">
      <h2 className="text-lg font-bold">Cor do sistema</h2>
      <p className="mt-0.5 text-base text-tx-2">
        Vale para <b>a sua conta</b> — acompanha você no computador e no celular. Não muda o que os
        colegas veem.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {PALETAS.map((p) => {
          const t = escuro ? p.escuro : p.claro;
          const ativa = p.key === cor;

          return (
            <button
              key={p.key}
              type="button"
              onClick={() => escolher(p.key)}
              aria-pressed={ativa}
              className={cn(
                'group flex flex-col gap-2 rounded-xl border-2 p-2.5 text-left transition-colors',
                ativa ? 'border-pri' : 'border-line-2 hover:border-line',
              )}
            >
              {/* Uma miniatura do sistema: a barra do menu, um botão e uma
                  etiqueta — os três lugares onde a cor mais aparece. */}
              <span
                className="flex h-[52px] items-center gap-1.5 overflow-hidden rounded-lg p-1.5"
                style={{ background: `hsl(${escuro ? '246 34% 11%' : '0 0% 100%'})` }}
              >
                <span
                  className="h-full w-3 shrink-0 rounded"
                  style={{ background: `linear-gradient(hsl(${t.pri3}), hsl(${t.pri}))` }}
                />
                <span className="flex min-w-0 flex-col gap-1">
                  <span
                    className="rounded px-1.5 py-0.5 text-[9px] font-bold leading-none"
                    style={{ background: `hsl(${t.pri})`, color: `hsl(${t.priFg})` }}
                  >
                    Botão
                  </span>
                  <span
                    className="rounded px-1.5 py-0.5 text-[9px] font-bold leading-none"
                    style={{ background: `hsl(${t.priSoft})`, color: `hsl(${t.pri})` }}
                  >
                    Etiqueta
                  </span>
                </span>
              </span>

              <span className="flex items-center justify-between gap-1">
                <span className="text-sm font-semibold">{p.nome}</span>
                {ativa && <Check className="h-3.5 w-3.5 shrink-0 text-pri" />}
              </span>
            </button>
          );
        })}
      </div>

      {erro && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-warn-soft p-3 text-sm text-warn">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {erro}
        </p>
      )}

      <p className="mt-3 border-t border-line pt-3 text-sm text-tx-3">
        Cada cor tem uma versão para o tema claro e outra para o escuro — não é o mesmo tom
        clareado. No escuro o texto sobre os botões fica escuro em vez de branco, porque a cor de
        fundo é clara e branco sobre claro não se lê.
      </p>
    </section>
  );
}
