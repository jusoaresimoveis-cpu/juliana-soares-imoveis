import type { CampoDeModelo } from '@/hooks/useDocumentos';

/**
 * Preenche os marcadores do modelo.
 *
 * Duas coisas que o sistema de referência não fazia, e que aqui não são
 * opcionais porque o resultado é um contrato:
 *
 * 1. ESCAPA o valor. Um nome com `<` ou um campo longo colado de outro lugar
 *    conseguiam injetar marcação no corpo do documento — e o documento é
 *    guardado como HTML e reimpresso depois.
 * 2. Marcador sem valor não fica na tela como `{{comprador_cpf}}`. Vira uma
 *    lacuna visível para ser preenchida à caneta, que é o que se faz num
 *    contrato quando o dado ainda não existe.
 */
export function preencher(html: string, valores: Record<string, string>): string {
  return html.replace(/\{\{\s*([a-z0-9_.]+)\s*\}\}/gi, (_todo, chave: string) => {
    const valor = valores[chave];
    if (valor === undefined || valor === null || String(valor).trim() === '') {
      return '<span class="lacuna">&nbsp;</span>';
    }
    return escapar(String(valor)).replace(/\n/g, '<br>');
  });
}

function escapar(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Formata cada valor pelo TIPO declarado no modelo.
 *
 * Sem isto, o que o navegador entrega vai cru para o papel: `<input type=date>`
 * devolve `2026-08-09`, e um contrato que diz "posse em 2026-08-09" está errado
 * em português. Dinheiro digitado como `450000` vira "R$ 450.000,00".
 *
 * É por aqui que se vê a utilidade dos campos serem DECLARADOS em vez de
 * varridos do HTML: sem o tipo, não haveria como saber o que formatar.
 */
export function formatarValores(
  campos: CampoDeModelo[],
  valores: Record<string, string>,
): Record<string, string> {
  const saida: Record<string, string> = { ...valores };

  for (const campo of campos) {
    const bruto = (valores[campo.k] ?? '').trim();
    if (!bruto) continue;

    if (campo.t === 'data') {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(bruto);
      if (m) saida[campo.k] = `${m[3]}/${m[2]}/${m[1]}`;
    } else if (campo.t === 'dinheiro') {
      // Aceita "450000", "450.000,00" e "450000.00" — as três formas que uma
      // pessoa realmente digita.
      const n = Number(bruto.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, ''));
      if (Number.isFinite(n)) {
        saida[campo.k] = n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      }
    }
  }

  return saida;
}

/** Os marcadores que o modelo realmente usa, na ordem em que aparecem. */
export function marcadoresDe(html: string): string[] {
  const achados = [...html.matchAll(/\{\{\s*([a-z0-9_.]+)\s*\}\}/gi)].map((m) => m[1] ?? '');
  return [...new Set(achados)];
}

/**
 * Campos que a organização e o corretor preenchem sozinhos.
 *
 * Não vão para o formulário: pedir o nome da imobiliária a cada documento é
 * pedir para alguém digitar errado uma vez.
 */
export function valoresAutomaticos(ctx: {
  imobiliaria: string;
  cnpj: string | null;
  corretor: string;
  creci: string | null;
}): Record<string, string> {
  const hoje = new Date();
  return {
    imobiliaria_nome: ctx.imobiliaria,
    imobiliaria_cnpj: ctx.cnpj ?? '',
    corretor_nome: ctx.corretor,
    corretor_creci: ctx.creci ?? '',
    data_documento: hoje.toLocaleDateString('pt-BR'),
    cidade_data: hoje.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }),
  };
}

/** O que ainda falta, para o botão poder recusar em vez de emitir pela metade. */
export function faltando(campos: CampoDeModelo[], valores: Record<string, string>): CampoDeModelo[] {
  return campos.filter((c) => c.obrig && !(valores[c.k] ?? '').trim());
}

/**
 * A folha impressa.
 *
 * Fica aqui e não num arquivo CSS porque viaja JUNTO com o documento para a
 * janela de impressão — que é um documento novo, sem acesso ao estilo do app.
 */
export const ESTILO_IMPRESSAO = `
  @page { size: A4; margin: 18mm 16mm; }
  body { font: 11.5pt/1.6 Georgia, 'Times New Roman', serif; color: #16161a; }
  .timbre { display: flex; align-items: center; justify-content: space-between;
            border-bottom: 3px solid var(--marca, #4526DE); padding-bottom: 10px; margin-bottom: 22px; }
  .timbre .nome { font-size: 15pt; font-weight: 700; color: var(--marca, #4526DE); }
  .timbre .dados { text-align: right; font-size: 8.5pt; line-height: 1.4; color: #55555f; }
  h1 { font-size: 15pt; text-align: center; margin: 0 0 18px; text-transform: uppercase; letter-spacing: .04em; }
  h2 { font-size: 11.5pt; margin: 18px 0 6px; }
  p { margin: 0 0 10px; text-align: justify; }
  ul { margin: 0 0 10px 18px; }
  li { margin-bottom: 4px; }
  .lacuna { display: inline-block; min-width: 120px; border-bottom: 1px solid #16161a; }
  .assinaturas { display: flex; gap: 40px; margin-top: 46px; page-break-inside: avoid; }
  .assinaturas .linha { flex: 1; text-align: center; border-top: 1px solid #16161a; padding-top: 6px; font-size: 10pt; }
  .assinaturas small { color: #55555f; font-size: 8.5pt; }
  .rodape { margin-top: 30px; text-align: center; font-size: 8.5pt; color: #55555f; }
`;

/** Monta a página inteira: timbre, corpo e rodapé. */
export function montarFolha(opcoes: {
  corpo: string;
  comTimbre: boolean;
  imobiliaria: string;
  cnpj: string | null;
  endereco: string | null;
  cor: string | null;
  cidade: string | null;
}): string {
  const cor = opcoes.cor || '#4526DE';
  const timbre = opcoes.comTimbre
    ? `<div class="timbre">
         <div class="nome">${opcoes.imobiliaria}</div>
         <div class="dados">
           ${opcoes.cnpj ? `CNPJ ${opcoes.cnpj}<br>` : ''}
           ${opcoes.endereco ?? ''}
         </div>
       </div>`
    : '';

  const local = opcoes.cidade
    ? `<p class="rodape">${opcoes.cidade}, ${new Date().toLocaleDateString('pt-BR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })}.</p>`
    : '';

  return `<div style="--marca:${cor}">${timbre}${opcoes.corpo}${local}</div>`;
}
