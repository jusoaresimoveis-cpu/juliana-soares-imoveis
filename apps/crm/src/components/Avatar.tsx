import { useState } from 'react';
import { cn, initials } from '@/lib/utils';

/**
 * A CARA DA PESSOA, com as iniciais como chão.
 *
 * Até aqui o projeto tinha sete lugares desenhando o mesmo círculo de iniciais
 * copiado à mão, e nenhuma peça compartilhada — só a função `initials()`. Esta
 * é a peça: quem tem foto mostra foto, quem não tem continua exatamente como
 * estava.
 *
 * A QUEDA É O COMPORTAMENTO PRINCIPAL, não o caso de erro. O link da foto vem
 * assinado pelo CDN da Meta e vence em cerca de dois dias; entre uma mensagem e
 * outra ele envelhece e para de carregar. Quando isso acontece o avatar volta
 * para as iniciais sem piscar erro nenhum, e se conserta sozinho na mensagem
 * seguinte, que traz assinatura nova.
 *
 * Por isso `onError` não é zelo: é o caminho normal de metade das fotos, todo
 * dia. Um `<img>` quebrado com o ícone de imagem partida na lista de conversas
 * seria pior do que nunca ter mostrado foto.
 */
export function Avatar({
  nome,
  foto,
  className,
}: {
  nome: string;
  /** Link da foto. Nulo, vazio ou quebrado cai para as iniciais. */
  foto?: string | null;
  /** Tamanho e forma vêm de fora: `h-9 w-9 text-xs`. */
  className?: string;
}) {
  const [caiu, setCaiu] = useState(false);

  const base = 'shrink-0 overflow-hidden rounded-full';

  if (foto && !caiu) {
    return (
      <img
        src={foto}
        /*
         * `alt` vazio de propósito. O nome da pessoa está SEMPRE desenhado do
         * lado, em todos os sete usos — dar o mesmo nome ao `alt` faria o
         * leitor de tela dizer duas vezes, que é o defeito clássico de avatar
         * em lista.
         */
        alt=""
        loading="lazy"
        decoding="async"
        /*
         * O CDN é da Meta. Sem isto o navegador entrega o endereço da tela do
         * CRM no cabeçalho `Referer` a cada avatar carregado — inclusive o id
         * do lead que está aberto. Não custa nada e fecha o vazamento.
         */
        referrerPolicy="no-referrer"
        onError={() => setCaiu(true)}
        className={cn(base, 'bg-card-2 object-cover', className)}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        base,
        'grid place-items-center bg-gradient-to-br from-pri-light to-pri-deep font-bold text-pri-fg',
        className,
      )}
    >
      {initials(nome)}
    </span>
  );
}
