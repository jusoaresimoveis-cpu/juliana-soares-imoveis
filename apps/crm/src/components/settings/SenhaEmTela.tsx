import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

/**
 * A senha aparece uma vez só — depois disso nem o banco a conhece em texto puro.
 *
 * Serve à conta recém-criada E à senha redefinida. O painel é o mesmo porque o
 * ato é o mesmo: uma credencial que existe por alguns segundos na tela de quem
 * vai ditá-la. Duplicar isto renderia duas caixas que divergiriam na primeira
 * correção feita numa só.
 */
export function SenhaEmTela({
  titulo,
  descricao,
  senha,
  onFechar,
}: {
  titulo: string;
  descricao: React.ReactNode;
  senha: string;
  onFechar: () => void;
}) {
  const [copiado, setCopiado] = useState(false);

  return (
    <div className="rounded-lg bg-ok-soft p-5">
      <h2 className="text-lg font-bold text-ok">{titulo}</h2>
      <p className="mt-0.5 text-base text-tx-2">{descricao}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-card p-3">
        {/* Monoespaçada e selecionável: o gerente vai ditar isto por telefone,
            e fonte de largura fixa já dá o espaçamento uniforme que a leitura
            em voz alta precisa. */}
        <code className="flex-1 select-all font-mono text-lg font-bold">{senha}</code>
        <button
          onClick={() => {
            void navigator.clipboard.writeText(senha);
            setCopiado(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-full border border-line-2 px-3 py-1.5 text-sm font-semibold text-tx-2 hover:border-pri hover:text-pri"
        >
          {copiado ? <Check className="h-3.5 w-3.5 text-ok" /> : <Copy className="h-3.5 w-3.5" />}
          {copiado ? 'Copiado' : 'Copiar'}
        </button>
      </div>

      <button
        onClick={onFechar}
        className="mt-3 text-sm font-semibold text-tx-3 underline hover:text-tx"
      >
        Já anotei, pode fechar
      </button>
    </div>
  );
}
