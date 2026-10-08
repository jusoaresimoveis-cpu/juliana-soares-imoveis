'use client';

import { ChevronLeft, ChevronRight, Images, X } from 'lucide-react';
import Image from 'next/image';
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

import type { FotoDoImovel } from '@/lib/imoveis/tipos';

import { AvisoIlustrativa } from './AvisoIlustrativa';

/**
 * As fotos do imóvel, e a foto em destaque ao clicar.
 *
 * No computador, a capa grande à esquerda e uma grade de duas colunas à
 * direita, numa altura só: o título e o preço aparecem sem rolar a página. No
 * celular, a capa e as outras numa faixa que corre para o lado.
 *
 * É a mesma lista de fotos nos dois, e só o CSS muda. Duas listas, uma
 * escondida, fariam a capa (que tem `preload`) baixar duas vezes.
 */

/** Na grade do computador cabem oito; a oitava mostra quantas ficaram de fora. */
const NA_GRADE = 8;
const LINHAS_DA_GRADE = ['lg:grid-rows-1', 'lg:grid-rows-2', 'lg:grid-rows-3', 'lg:grid-rows-4'];
const FOCO = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bronze';

export function GaleriaDoImovel({ fotos, titulo }: { fotos: FotoDoImovel[]; titulo: string }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [atual, setAtual] = useState<number | null>(null);
  const inicioDoArraste = useRef<number | null>(null);

  const [capa, ...demais] = fotos;
  if (!capa) {
    return (
      <div className="flex aspect-[4/3] items-center justify-center rounded-lg bg-areia text-suave sm:aspect-[16/9] lg:aspect-auto lg:h-[30rem]">
        Sem foto
      </div>
    );
  }

  const naGrade = Math.min(demais.length, NA_GRADE);
  const ficaramDeFora = demais.length - naGrade;

  function abrir(indice: number) {
    setAtual(indice);
    dialogo.current?.showModal();
  }

  const passar = (passo: number) => setAtual((i) => (i === null ? i : (i + passo + fotos.length) % fotos.length));

  function teclas(evento: KeyboardEvent) {
    if (evento.key === 'ArrowRight') passar(1);
    else if (evento.key === 'ArrowLeft') passar(-1);
  }

  // Arrastar para o lado troca de foto, com o dedo ou com o mouse.
  const comecarArraste = (evento: PointerEvent) => {
    inicioDoArraste.current = evento.clientX;
  };
  const terminarArraste = (evento: PointerEvent) => {
    if (inicioDoArraste.current === null) return;
    const distancia = evento.clientX - inicioDoArraste.current;
    inicioDoArraste.current = null;
    if (Math.abs(distancia) > 50) passar(distancia < 0 ? 1 : -1);
  };

  // A atual e as vizinhas: a próxima já está baixada quando a pessoa passa.
  const naTela =
    atual === null
      ? []
      : [...new Set([atual - 1, atual, atual + 1].map((i) => (i + fotos.length) % fotos.length))];

  return (
    <>
      <div
        className={
          demais.length > 0
            ? 'space-y-2 lg:grid lg:h-[30rem] lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-2 lg:space-y-0'
            : 'lg:h-[30rem]'
        }
      >
        <button
          type="button"
          onClick={() => abrir(0)}
          aria-label={`Ver as fotos em destaque, a partir da capa${capa.ilustrativa ? ' (imagem ilustrativa)' : ''}`}
          className={`group relative block aspect-[4/3] w-full overflow-hidden rounded-lg bg-areia sm:aspect-[16/9] lg:aspect-auto lg:h-full ${FOCO}`}
        >
          {/* A capa é sempre o maior elemento desta página: é o caso de `preload`. */}
          <Image
            src={capa.url}
            alt={capa.alt}
            fill
            preload
            sizes={demais.length > 0 ? '(min-width: 1280px) 808px, (min-width: 1024px) 66vw, 100vw' : '(min-width: 1280px) 1216px, 100vw'}
            className="object-cover transition duration-300 group-hover:scale-[1.02]"
          />
          {capa.ilustrativa && <AvisoIlustrativa posicao="bottom-3 left-3" />}
          <span className="absolute right-3 bottom-3 inline-flex items-center gap-1.5 rounded-md bg-white/90 px-2.5 py-1 text-sm font-medium text-tinta shadow-sm">
            <Images aria-hidden className="size-4" />
            {fotos.length} {fotos.length === 1 ? 'foto' : 'fotos'}
          </span>
        </button>

        {demais.length > 0 && (
          <ul
            className={`-mx-4 flex snap-x gap-2 overflow-x-auto px-4 lg:mx-0 lg:grid lg:h-full lg:grid-cols-2 lg:overflow-visible lg:px-0 ${LINHAS_DA_GRADE[Math.ceil(naGrade / 2) - 1]}`}
          >
            {demais.map((foto, i) => (
              <li
                key={foto.url}
                className={`relative aspect-[4/3] w-48 shrink-0 snap-start sm:w-64 lg:aspect-auto lg:w-auto ${
                  i >= NA_GRADE ? 'lg:hidden' : ''
                } ${naGrade % 2 === 1 && i === naGrade - 1 ? 'lg:col-span-2' : ''}`}
              >
                <button
                  type="button"
                  onClick={() => abrir(i + 1)}
                  aria-label={`Ver a foto ${i + 2} de ${fotos.length} em destaque${foto.ilustrativa ? ' (imagem ilustrativa)' : ''}`}
                  className={`group relative block size-full overflow-hidden rounded-lg bg-areia ${FOCO}`}
                >
                  <Image
                    src={foto.url}
                    alt={foto.alt}
                    fill
                    sizes="(min-width: 1024px) 200px, 256px"
                    className="object-cover transition duration-300 group-hover:scale-105"
                  />
                  {foto.ilustrativa && <AvisoIlustrativa />}
                  {i === NA_GRADE - 1 && ficaramDeFora > 0 && (
                    <span className="absolute inset-0 hidden items-center justify-center bg-noite/55 text-lg font-medium text-white lg:flex">
                      +{ficaramDeFora}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <dialog
        ref={dialogo}
        onClose={() => setAtual(null)}
        onKeyDown={teclas}
        aria-label={`Fotos: ${titulo}`}
        className="m-0 size-full max-h-none max-w-none border-0 bg-noite p-0 text-white backdrop:bg-noite"
      >
        {atual !== null && (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between px-4 py-3 text-sm">
              {/* O aviso fica com o contador, e não sobre a foto: ver `AvisoIlustrativa`.
                  Dentro da região viva, o leitor de tela o anuncia ao trocar de foto. */}
              <p aria-live="polite" className="flex items-center gap-3">
                <span>
                  {atual + 1} / {fotos.length}
                </span>
                {fotos[atual]?.ilustrativa && <AvisoIlustrativa naBarra />}
              </p>
              <button
                type="button"
                onClick={() => dialogo.current?.close()}
                aria-label="Fechar as fotos"
                className={`rounded-full p-2 hover:bg-white/10 ${FOCO}`}
              >
                <X aria-hidden className="size-6" />
              </button>
            </div>

            <div
              className="relative flex-1 touch-pan-y touch-pinch-zoom select-none"
              onPointerDown={comecarArraste}
              onPointerUp={terminarArraste}
            >
              {naTela.map((indice) => {
                const foto = fotos[indice]!;
                return (
                  <Image
                    key={foto.url}
                    src={foto.url}
                    alt={foto.alt}
                    fill
                    sizes="100vw"
                    loading="eager"
                    draggable={false}
                    aria-hidden={indice !== atual}
                    className={`object-contain ${indice === atual ? '' : 'invisible'}`}
                  />
                );
              })}

              {fotos.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => passar(-1)}
                    aria-label="Foto anterior"
                    className={`absolute top-1/2 left-2 -translate-y-1/2 rounded-full bg-black/40 p-2 hover:bg-black/60 sm:left-4 ${FOCO}`}
                  >
                    <ChevronLeft aria-hidden className="size-7" />
                  </button>
                  <button
                    type="button"
                    onClick={() => passar(1)}
                    aria-label="Próxima foto"
                    className={`absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-black/40 p-2 hover:bg-black/60 sm:right-4 ${FOCO}`}
                  >
                    <ChevronRight aria-hidden className="size-7" />
                  </button>
                </>
              )}
            </div>
            <p className="px-4 py-3 text-center text-sm text-white/70">{titulo}</p>
          </div>
        )}
      </dialog>
    </>
  );
}
