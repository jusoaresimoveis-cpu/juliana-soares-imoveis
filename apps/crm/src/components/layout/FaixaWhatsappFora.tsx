import { Link } from 'react-router-dom';
import { PlugZap } from 'lucide-react';
import { useAlarmesWhatsapp, type AlarmeWhatsapp } from '@/hooks/useAlarmesWhatsapp';

/**
 * A FAIXA DE NÚMERO FORA DO AR.
 *
 * Um WhatsApp caiu às 22h31 e ninguém soube por dezessete horas. A Meta
 * entregou dois leads nesse intervalo, a corretora confirmou que as conversas
 * chegaram no celular dela, e nenhum dos dois existe no CRM. A conta gastou o
 * dia inteiro comprando lead que evaporava na entrada.
 *
 * O estado estava no banco o tempo todo. Faltava alguém olhar — e a tela onde
 * ele aparecia é a de configuração, que ninguém abre por hábito.
 *
 * Por isso a faixa mora no ESQUELETO e não numa página. Uma faixa no Painel
 * seria invisível para quem passa o dia no Kanban ou nas Conversas, e este é
 * justamente o aviso que não pode depender de a pessoa estar no lugar certo.
 *
 * Ela não tem botão de fechar, de propósito. Some sozinha quando o número
 * voltar, e enquanto não voltar não há o que dispensar: cada minuto dela de pé
 * é lead entrando e se perdendo.
 */
export function FaixaWhatsappFora() {
  const { data } = useAlarmesWhatsapp();
  if (!data?.length) return null;

  return (
    <div
      role="alert"
      className="shrink-0 px-4 pb-1 md:pl-[106px] md:pr-8 lg:pl-[118px] lg:pr-11"
    >
      <div className="flex flex-col gap-1.5 rounded-md border border-dng/35 bg-dng-soft px-3.5 py-2.5">
        {data.map((a) => (
          <Linha key={a.id} alarme={a} />
        ))}
      </div>
    </div>
  );
}

function Linha({ alarme }: { alarme: AlarmeWhatsapp }) {
  const { label, telefone, e_meu, desde } = alarme;

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <PlugZap className="h-4 w-4 shrink-0 text-dng" aria-hidden />

      <span className="font-bold text-tx">
        {e_meu ? 'Seu WhatsApp está fora do ar' : `WhatsApp de ${label} fora do ar`}
      </span>

      {/*
        A frase diz a CONSEQUÊNCIA, não o estado. "Desconectado" é informação de
        sistema e não move ninguém; "todo lead está sendo perdido" é o que faz
        alguém largar o que está fazendo — que é exatamente o que precisava ter
        acontecido naquela noite.

        E o NÚMERO some no celular. A faixa é fixa acima do conteúdo: cada linha
        que ela ocupa é uma linha que o trabalho perde, e num aparelho de 375px
        a frase inteira comia um quarto da tela. Quem é o número já está dito no
        título; os dígitos só desempatam quando alguém tem dois, e isso é caso
        de tela grande.
      */}
      <span className="text-tx-2">
        Todo lead que chegar
        {telefone && <span className="hidden sm:inline"> em {bonito(telefone)}</span>}{' '}
        está sendo perdido
        {' · '}
        <span className="whitespace-nowrap">há {ha(desde)}</span>
      </span>

      {/*
        Tinta FIXA no botão, e não um token de tema.
        `text-white` sobre `bg-dng` mede 2,62:1 no escuro e 3,93:1 no claro — as
        duas reprovam. Qualquer token de texto acompanha o tema e inverte junto,
        mas `--dng` é claro nos DOIS; só uma tinta escura fixa serve para os
        dois lados. Medido: 6,9:1 no escuro, 4,61:1 no claro.
      */}
      <Link
        to="/configuracoes?aba=whatsapp"
        className="ml-auto shrink-0 rounded-sm bg-dng px-2.5 py-1 text-xs font-bold text-[#2C0A14] transition-opacity hover:opacity-90"
      >
        {e_meu ? 'Reconectar' : 'Ver conexão'}
      </Link>
    </div>
  );
}

/** `+554991338182` → `+55 49 9133-8182`. Fora desse formato, devolve como veio. */
function bonito(e164: string): string {
  const m = /^\+55(\d{2})(\d{4,5})(\d{4})$/.exec(e164);
  return m ? `+55 ${m[1]} ${m[2]}-${m[3]}` : e164;
}

/**
 * Há quanto tempo, em palavras.
 *
 * Arredonda para baixo e nunca mostra "0 min": abaixo de um minuto vira
 * "instantes". Um alarme que diz "há 0 minutos" parece defeito da tela e tira a
 * credibilidade justamente do aviso que precisa ser levado a sério.
 */
function ha(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return 'instantes';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return h === 1 ? '1 hora' : `${h} horas`;
  const d = Math.floor(h / 24);
  return d === 1 ? '1 dia' : `${d} dias`;
}
