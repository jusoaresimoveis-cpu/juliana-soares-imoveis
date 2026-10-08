import { useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Upload, Star, Trash2, FileText, Video, Loader2, Sparkles } from 'lucide-react';
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
  const { enviar, reordenar, ordenar, remover, porMarca, tirarMarca, ilustrativa } = useMediaActions(orgId, propertyId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);
  // A foto que está sendo arrastada para outro lugar da lista.
  const [pega, setPega] = useState<UniqueIdentifier | null>(null);

  const sensores = useSensors(
    // Mouse: o arraste começa depois de andar uns pixels, e o clique nos botões
    // da foto (capa, remover) continua sendo clique.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Dedo: segurar um instante. Sem a espera, encostar na foto para rolar a
    // tela já a arrastaria.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    // Teclado: espaço pega, setas movem, espaço solta.
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
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
  // Só fotos: o site mostra as imagens, e é nelas que vai o aviso.
  const fotos = lista.filter((m) => m.kind === 'image');
  const ilustrativas = fotos.filter((m) => m.is_illustrative);
  const todasIlustrativas = fotos.length > 0 && ilustrativas.length === fotos.length;

  const lugarDe = (id: UniqueIdentifier) => lista.findIndex((m) => m.id === id) + 1;
  const anuncios: Announcements = {
    onDragStart: ({ active }) => `Foto ${lugarDe(active.id)} pega.`,
    onDragOver: ({ over }) => (over ? `Sobre o lugar ${lugarDe(over.id)}.` : 'Fora da lista.'),
    onDragEnd: ({ over }) => (over ? `Foto solta no lugar ${lugarDe(over.id)}.` : 'Foto solta fora da lista.'),
    onDragCancel: () => 'Cancelado. A foto voltou ao lugar.',
  };

  function soltar({ active, over }: DragEndEvent) {
    setPega(null);
    if (!over || active.id === over.id) return;
    const de = lista.findIndex((m) => m.id === active.id);
    const para = lista.findIndex((m) => m.id === over.id);
    if (de >= 0 && para >= 0) reordenar(arrayMove(lista, de, para));
  }

  const midiaPega = pega ? lista.find((m) => m.id === pega) : undefined;

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

      {/*
        Render de empreendimento na planta, decorado, foto de banco: o site põe
        "Imagem ilustrativa" na foto marcada. Nada inventado no site, e o
        cliente não reclama que o apartamento não é aquele.
      */}
      {fotos.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-line bg-card-2 px-3.5 py-3">
          <Sparkles className="h-4 w-4 shrink-0 text-pri" />
          <span className="text-sm text-tx-2">
            <b className="font-semibold">Imagem ilustrativa</b> (render, decorado): o site avisa na foto.{' '}
            <span className="text-tx-3">
              {ilustrativas.length === 0
                ? 'Nenhuma marcada.'
                : ilustrativas.length === 1
                  ? '1 marcada.'
                  : `${ilustrativas.length} marcadas.`}
            </span>
          </span>
          <button
            type="button"
            disabled={ilustrativa.isPending}
            onClick={() =>
              ilustrativa.mutate({
                ids: (todasIlustrativas ? fotos : fotos.filter((m) => !m.is_illustrative)).map((m) => m.id),
                valor: !todasIlustrativas,
              })
            }
            className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-line-2 bg-card px-3.5 py-1.5 text-sm font-semibold text-tx-2 hover:border-pri hover:text-pri disabled:opacity-60"
          >
            {ilustrativa.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {todasIlustrativas ? 'Desmarcar todas' : 'Marcar todas'}
          </button>
          {ilustrativa.isError && (
            <p className="w-full text-sm text-dng">{(ilustrativa.error as Error).message}</p>
          )}
        </div>
      )}

      {lista.length > 0 && (
        <>
          <p className="text-sm text-tx-3">
            Segure a foto e arraste até o lugar: o site mostra nesta ordem. A primeira é a capa, que
            aparece no card, no anúncio e no preview do link compartilhado.
          </p>

          <DndContext
            sensors={sensores}
            collisionDetection={closestCenter}
            // Rola sozinho perto da borda de cima ou de baixo. O padrão (20% da
            // tela de cada lado) num celular rola quando a pessoa só quer soltar
            // a foto na primeira ou na última fileira visível.
            autoScroll={{ threshold: { x: 0, y: 0.1 } }}
            accessibility={{
              announcements: anuncios,
              screenReaderInstructions: {
                draggable:
                  'Para mudar a foto de lugar, aperte espaço, mova com as setas e aperte espaço de novo para soltar. Esc cancela.',
              },
            }}
            onDragStart={({ active, activatorEvent }) => {
              setPega(active.id);
              // No celular, uma tremidinha avisa que a foto "pegou" (o iPhone não tem).
              if (activatorEvent && 'touches' in activatorEvent && 'vibrate' in navigator) navigator.vibrate(10);
            }}
            onDragEnd={soltar}
            onDragCancel={() => setPega(null)}
          >
            <SortableContext items={lista.map((m) => m.id)} strategy={rectSortingStrategy}>
              <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
                {lista.map((m, i) => (
                  <MediaCard
                    key={m.id}
                    media={m}
                    lugar={i + 1}
                    onCapa={() => reordenar([m, ...lista.filter((x) => x.id !== m.id)])}
                    onIlustrativa={() => ilustrativa.mutate({ ids: [m.id], valor: !m.is_illustrative })}
                    onRemover={() => remover.mutate(m)}
                  />
                ))}
              </ul>
            </SortableContext>

            {/* No `body`: a foto que acompanha o dedo não pode ficar presa
                atrás do formulário nem cortada pela rolagem dele. */}
            {createPortal(
              <DragOverlay zIndex={60}>
                {/* A caixa de fora não cresce: o dnd-kit mede o primeiro filho
                    para achar o vizinho nas setas do teclado, e a foto ampliada
                    fazia a seta para a direita mirar a foto de baixo. */}
                {midiaPega ? (
                  <div>
                    <Miniatura media={midiaPega} levantada />
                  </div>
                ) : null}
              </DragOverlay>,
              document.body,
            )}
          </DndContext>

          {ordenar.isError && (
            <p className="rounded-md bg-dng-soft px-3 py-2 text-base text-dng">
              A nova ordem não foi gravada, e a lista voltou à que estava salva. Tente de novo.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function MediaCard({
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
function Miniatura({ media, levantada = false }: { media: PropertyMedia; levantada?: boolean }) {
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
