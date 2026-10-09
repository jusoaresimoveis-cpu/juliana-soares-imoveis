import { ESTILO_IMPRESSAO } from '@/lib/documentos';

/**
 * A prévia mora num iframe isolado.
 *
 * O documento é HTML montado a partir de campos que a pessoa digita. Renderizar
 * isso dentro da página do CRM — com `dangerouslySetInnerHTML`, que é o que a
 * referência fazia — dá ao conteúdo o mesmo contexto da aplicação: mesma
 * sessão, mesmo armazenamento. O iframe com `sandbox` corta esse acesso, e o
 * estilo de impressão viaja junto porque lá dentro não existe o CSS do app.
 */
export function Previa({ html }: { html: string }) {
  const documento = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>${ESTILO_IMPRESSAO}
    body { padding: 14px; background: #fff; }</style></head><body>${html}</body></html>`;

  return (
    <iframe
      title="Prévia do documento"
      sandbox=""
      srcDoc={documento}
      className="h-[560px] w-full rounded-xl border border-line-2 bg-white"
    />
  );
}

export function abrirParaImprimir(html: string, titulo: string) {
  const janela = window.open('', '_blank', 'width=860,height=1000');
  if (!janela) return;
  janela.document.write(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${titulo}</title>` +
      `<style>${ESTILO_IMPRESSAO}</style></head><body>${html}</body></html>`,
  );
  janela.document.close();
  janela.focus();
  // Sem o adiamento, o Chrome abre o diálogo antes de a folha ser aplicada e
  // imprime o documento sem estilo nenhum.
  setTimeout(() => janela.print(), 350);
}
