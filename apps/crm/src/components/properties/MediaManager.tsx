import { useRef, useState } from 'react';
import { Upload, Star, Trash2, ArrowLeft, ArrowRight, FileText, Video, Loader2 } from 'lucide-react';
import { usePropertyMedia, useMediaActions, urlPublica, type PropertyMedia } from '@/hooks/useProperties';
import { cn } from '@/lib/utils';

interface Props {
  orgId: string | undefined;
  propertyId: string | null;
}

export function MediaManager({ orgId, propertyId }: Props) {
  const { data: midias } = usePropertyMedia(propertyId);
  const { enviar, definirCapa, remover, mover } = useMediaActions(orgId, propertyId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);

  if (!propertyId) {
    return (
      <p className="rounded-md border border-dashed border-line-2 py-10 text-center text-base text-tx-3">
        Salve o imóvel primeiro. As fotos precisam de um lugar para morar.
      </p>
    );
  }

  const lista = midias ?? [];

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          const arquivos = Array.from(e.dataTransfer.files);
          if (arquivos.length) enviar.mutate(arquivos);
        }}
        className={cn(
          'flex flex-col items-center gap-2 rounded-md border-[1.5px] border-dashed border-line-2 py-8 transition-colors hover:border-pri hover:bg-pri-soft',
          arrastando && 'border-pri bg-pri-soft',
        )}
      >
        {enviar.isPending ? (
          <Loader2 className="h-5 w-5 animate-spin text-pri" />
        ) : (
          <Upload className="h-5 w-5 text-pri" />
        )}
        <span className="text-base font-semibold text-tx-2">
          {enviar.isPending ? 'Enviando…' : 'Arraste fotos aqui ou clique para escolher'}
        </span>
        <span className="text-sm text-tx-3">JPG, PNG, WebP, MP4 ou PDF · até 25 MB cada</span>
      </button>

      {/* Sem PDF no `accept`: este seletor alimenta o bucket `property-media`,
          que é público de propósito para a landing page servir foto sem
          autenticação. Documento — matrícula, contrato, papel de proprietário —
          vai para o bucket `documentos`, fechado e servido por URL assinada.
          Ver migration 009. */}
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm"
        className="hidden"
        onChange={(e) => {
          const arquivos = Array.from(e.target.files ?? []);
          if (arquivos.length) enviar.mutate(arquivos);
          e.target.value = '';
        }}
      />

      {enviar.isError && (
        <p className="rounded-md bg-dng-soft px-3 py-2 text-base text-dng">
          {(enviar.error as Error).message}
        </p>
      )}

      {lista.length > 0 && (
        <>
          <p className="text-sm text-tx-3">
            A primeira imagem é a capa. Ela é o que aparece no card, no anúncio e no preview do link
            compartilhado — vale escolher com cuidado.
          </p>

          <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
            {lista.map((m, i) => (
              <MediaCard
                key={m.id}
                media={m}
                primeiro={i === 0}
                ultimo={i === lista.length - 1}
                onCapa={() => definirCapa.mutate(m.id)}
                onRemover={() => remover.mutate(m)}
                onMover={(dir) => mover.mutate({ lista, de: i, para: i + dir })}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function MediaCard({
  media,
  primeiro,
  ultimo,
  onCapa,
  onRemover,
  onMover,
}: {
  media: PropertyMedia;
  primeiro: boolean;
  ultimo: boolean;
  onCapa: () => void;
  onRemover: () => void;
  onMover: (direcao: -1 | 1) => void;
}) {
  return (
    <li className="group relative overflow-hidden rounded-md border border-line bg-card-2">
      <div className="aspect-[4/3] w-full">
        {media.kind === 'image' ? (
          <img
            src={urlPublica(media.storage_path)}
            alt={media.alt_text ?? ''}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full place-items-center text-tx-3">
            {media.kind === 'video' ? <Video className="h-6 w-6" /> : <FileText className="h-6 w-6" />}
          </div>
        )}
      </div>

      {media.is_cover && (
        <span className="absolute left-1.5 top-1.5 rounded bg-pri px-1.5 py-0.5 text-2xs font-bold uppercase text-pri-fg">
          Capa
        </span>
      )}

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/70 to-transparent p-1.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <div className="flex gap-1">
          <BotaoMini rotulo="Mover para trás" disabled={primeiro} onClick={() => onMover(-1)}>
            <ArrowLeft className="h-3 w-3" />
          </BotaoMini>
          <BotaoMini rotulo="Mover para frente" disabled={ultimo} onClick={() => onMover(1)}>
            <ArrowRight className="h-3 w-3" />
          </BotaoMini>
        </div>
        <div className="flex gap-1">
          {media.kind === 'image' && !media.is_cover && (
            <BotaoMini rotulo="Definir como capa" onClick={onCapa}>
              <Star className="h-3 w-3" />
            </BotaoMini>
          )}
          <BotaoMini rotulo="Remover" onClick={onRemover} perigo>
            <Trash2 className="h-3 w-3" />
          </BotaoMini>
        </div>
      </div>
    </li>
  );
}

function BotaoMini({
  children,
  rotulo,
  onClick,
  disabled,
  perigo,
}: {
  children: React.ReactNode;
  rotulo: string;
  onClick: () => void;
  disabled?: boolean;
  perigo?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={rotulo}
      title={rotulo}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'grid h-6 w-6 place-items-center rounded bg-white/90 text-tx transition-colors disabled:opacity-30',
        perigo ? 'hover:bg-dng hover:text-pri-fg' : 'hover:bg-pri hover:text-pri-fg',
      )}
    >
      {children}
    </button>
  );
}
