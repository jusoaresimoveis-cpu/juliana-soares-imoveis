import { useRef, useState } from 'react';
import { Upload, Star, Trash2, ArrowLeft, ArrowRight, FileText, Video, Loader2 } from 'lucide-react';
import { usePropertyMedia, useMediaActions, urlPublica, type PropertyMedia } from '@/hooks/useProperties';
import { useMarcaDagua, useSalvarMarcaDagua } from '@/hooks/useSettings';
import { useAuth } from '@/hooks/useAuth';
import { Switch } from '@/components/Switch';
import { cn } from '@/lib/utils';

interface Props {
  orgId: string | undefined;
  propertyId: string | null;
}

export function MediaManager({ orgId, propertyId }: Props) {
  const { data: midias } = usePropertyMedia(propertyId);
  const { enviar, definirCapa, remover, mover, porMarca, tirarMarca } = useMediaActions(orgId, propertyId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);
  const { isAdminOrAbove } = useAuth();
  const marca = useMarcaDagua(orgId);
  const salvarMarca = useSalvarMarcaDagua(orgId);
  const [progresso, setProgresso] = useState<{ feitas: number; total: number } | null>(null);

  /*
   * A foto sai com o que a chave MOSTRA. Enquanto grava, a chave já mostra o
   * pedido; se o banco recusar, volta sozinha. Antes de a regra carregar, vale
   * ligada, que é o padrão da casa: na dúvida, a foto sai protegida.
   */
  const marcaLigada = salvarMarca.isPending ? !!salvarMarca.variables : (marca.data ?? true);
  const enviarArquivos = (arquivos: File[]) => {
    if (arquivos.length) enviar.mutate({ arquivos, marcaDagua: marcaLigada });
  };

  if (!propertyId) {
    return (
      <p className="rounded-md border border-dashed border-line-2 py-10 text-center text-base text-tx-3">
        Salve o imóvel primeiro. As fotos precisam de um lugar para morar.
      </p>
    );
  }

  const lista = midias ?? [];
  // As fotos que subiram antes da marca, e as que ganharam a marca depois (com o original guardado).
  const semMarca = lista.filter((m) => m.kind === 'image' && !m.marca_dagua);
  const comOriginal = lista.filter((m) => m.original_sem_marca);
  const ocupado = porMarca.isPending || tirarMarca.isPending;

  return (
    <div className="flex flex-col gap-3">
      {/* Regra da imobiliária, e não desta tela: vale para toda foto que subir, de qualquer imóvel. */}
      <div className="flex flex-col gap-1 rounded-md border border-line bg-card-2 px-3.5 py-3">
        <Switch
          marcado={marcaLigada}
          onMudar={(v) => salvarMarca.mutate(v)}
          rotulo="Marca d'água com a logo"
          desabilitado={!isAdminOrAbove() || salvarMarca.isPending}
        />
        <p className="pl-[46px] text-sm text-tx-3">
          {marcaLigada ? 'As fotos novas sobem com a logo no meio.' : 'As fotos novas sobem sem marca.'}
          {!isAdminOrAbove() && ' Só gerente ou administrador muda.'}
        </p>
        {salvarMarca.isError && (
          <p className="pl-[46px] text-sm text-dng">{(salvarMarca.error as Error).message}</p>
        )}

        {marcaLigada && semMarca.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 pl-[46px]">
            <span className="text-sm text-tx-2">
              {semMarca.length === 1 ? '1 foto deste imóvel subiu' : `${semMarca.length} fotos deste imóvel subiram`} antes
              da marca.
            </span>
            <button
              type="button"
              disabled={ocupado}
              onClick={() => {
                setProgresso({ feitas: 0, total: semMarca.length });
                porMarca.mutate(
                  { fotos: semMarca, aoAvancar: (feitas, total) => setProgresso({ feitas, total }) },
                  { onSettled: () => setProgresso(null) },
                );
              }}
              className="inline-flex items-center gap-1.5 rounded-full bg-pri px-3.5 py-1.5 text-sm font-semibold text-pri-fg hover:bg-pri-deep disabled:opacity-60"
            >
              {porMarca.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {porMarca.isPending && progresso
                ? `Pondo a marca… ${progresso.feitas} de ${progresso.total}`
                : semMarca.length === 1
                  ? 'Pôr a marca nela'
                  : 'Pôr a marca nelas'}
            </button>
          </div>
        )}

        {comOriginal.length > 0 && (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 pl-[46px]">
            <span className="text-sm text-tx-3">
              A marca foi posta depois em {comOriginal.length === 1 ? '1 foto' : `${comOriginal.length} fotos`}, e o
              original de cada uma ficou guardado.
            </span>
            <button
              type="button"
              disabled={ocupado}
              onClick={() => tirarMarca.mutate({ fotos: comOriginal })}
              className="text-sm font-semibold text-pri underline-offset-2 hover:underline disabled:opacity-60"
            >
              {tirarMarca.isPending ? 'Desfazendo…' : 'Desfazer'}
            </button>
          </div>
        )}

        {(porMarca.isError || tirarMarca.isError) && (
          <p className="pl-[46px] text-sm text-dng">{((porMarca.error ?? tirarMarca.error) as Error).message}</p>
        )}
      </div>

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
          enviarArquivos(Array.from(e.dataTransfer.files));
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
          enviarArquivos(Array.from(e.target.files ?? []));
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
      {/* A foto por cima da caixa (absolute): no fluxo, uma foto em pé esticaria
          a miniatura além do 4:3 (ver a mesma nota em `pages/Properties.tsx`). */}
      <div className="relative aspect-[4/3] w-full overflow-hidden">
        {media.kind === 'image' ? (
          <img
            src={urlPublica(media.storage_path)}
            alt={media.alt_text ?? ''}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-tx-3">
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
