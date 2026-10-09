import type { CSSProperties } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Star, Trash2, FileText, Video, Sparkles } from 'lucide-react';
import { urlPublica, type PropertyMedia } from '@/hooks/useProperties';
import { cn } from '@/lib/utils';

export function MediaCard({
  media,
  lugar,
  onCapa,
  onIlustrativa,
  onRemover,
}: {
  media: PropertyMedia;
  lugar: number;
  onCapa: () => void;
  onIlustrativa: () => void;
  onRemover: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: media.id,
    attributes: { roleDescription: 'foto que muda de lugar' },
  });
  const estilo: CSSProperties = { transform: CSS.Translate.toString(transform), transition };

  return (
    <li
      // O cartão inteiro é a alça. Registrado também como "ativador", o teclado
      // só pega a foto quando o foco está nela: espaço num botão de dentro
      // continua apertando o botão.
      ref={(no) => {
        setNodeRef(no);
        setActivatorNodeRef(no);
      }}
      style={estilo}
      {...attributes}
      {...listeners}
      aria-label={`Foto ${lugar}${media.is_cover ? ', capa' : ''}${media.is_illustrative ? ', ilustrativa' : ''}`}
      className={cn(
        // `touch-manipulation`: o dedo ainda rola a tela, e o arraste só pega
        // quem segura. Sem o menu de "salvar imagem" do toque longo, que
        // chegaria antes do arraste.
        'group relative cursor-grab touch-manipulation select-none overflow-hidden rounded-md border border-line bg-card-2 outline-none [-webkit-touch-callout:none] focus-visible:ring-2 focus-visible:ring-pri active:cursor-grabbing',
        // O lugar de onde a foto saiu fica marcado enquanto ela anda.
        isDragging && 'opacity-40',
      )}
    >
      <Miniatura media={media} />

      {media.is_cover && (
        <span className="absolute left-1.5 top-1.5 rounded bg-pri px-1.5 py-0.5 text-2xs font-bold uppercase text-pri-fg">
          Capa
        </span>
      )}
      {media.is_illustrative && (
        <span className="absolute right-1.5 top-1.5 rounded bg-tx/85 px-1.5 py-0.5 text-2xs font-bold uppercase text-sheet">
          Ilustrativa
        </span>
      )}

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-end gap-1 bg-gradient-to-t from-black/70 to-transparent p-1.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        {media.kind === 'image' && !media.is_cover && (
          <BotaoMini rotulo="Usar como capa (vai para o primeiro lugar)" onClick={onCapa}>
            <Star className="h-3 w-3" />
          </BotaoMini>
        )}
        {media.kind === 'image' && (
          <BotaoMini
            rotulo={media.is_illustrative ? 'Desmarcar "Imagem ilustrativa"' : 'Marcar como imagem ilustrativa'}
            onClick={onIlustrativa}
            ativo={media.is_illustrative}
          >
            <Sparkles className="h-3 w-3" />
          </BotaoMini>
        )}
        <BotaoMini rotulo="Remover" onClick={onRemover} perigo>
          <Trash2 className="h-3 w-3" />
        </BotaoMini>
      </div>
    </li>
  );
}

/** A foto em 4:3. Também é a que acompanha o dedo (`levantada`) durante o arraste. */
export function Miniatura({ media, levantada = false }: { media: PropertyMedia; levantada?: boolean }) {
  return (
    // A foto por cima da caixa (absolute): no fluxo, uma foto em pé esticaria
    // a miniatura além do 4:3 (ver a mesma nota em `pages/Properties.tsx`).
    <div
      className={cn(
        'relative aspect-[4/3] w-full overflow-hidden bg-card-2',
        levantada && 'scale-105 cursor-grabbing rounded-md shadow-sheet ring-2 ring-pri',
      )}
    >
      {media.kind === 'image' ? (
        <img
          src={urlPublica(media.storage_path)}
          alt={media.alt_text ?? ''}
          loading="lazy"
          // Quem arrasta é o cartão: o arraste nativo de imagem do navegador
          // levaria uma cópia fantasma em vez de mudar a ordem.
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-tx-3">
          {media.kind === 'video' ? <Video className="h-6 w-6" /> : <FileText className="h-6 w-6" />}
        </div>
      )}
    </div>
  );
}

function BotaoMini({
  children,
  rotulo,
  onClick,
  disabled,
  perigo,
  ativo,
}: {
  children: React.ReactNode;
  rotulo: string;
  onClick: () => void;
  disabled?: boolean;
  perigo?: boolean;
  /** Botão de liga e desliga, ligado. */
  ativo?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={rotulo}
      aria-pressed={ativo}
      title={rotulo}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'grid h-6 w-6 place-items-center rounded bg-white/90 text-tx transition-colors disabled:opacity-30',
        perigo ? 'hover:bg-dng hover:text-pri-fg' : 'hover:bg-pri hover:text-pri-fg',
        ativo && 'bg-pri text-pri-fg',
      )}
    >
      {children}
    </button>
  );
}
