import { lerReais, type UnitStatus } from '@contracts';

/**
 * A célula da tabela do mês: o que ela mostra e como se lê o que a Juliana
 * digitou. A grade e a conferência partem daqui; `unidades.ts` reexporta.
 */

/** O mínimo de uma unidade que a grade e a conferência leem. */
export interface UnidadeDaTabela {
  id: string;
  label: string;
  floor: number | null;
  price_cents: number | null;
  status: string;
}

/* -------------------------------------------------------------------------- */
/* A célula                                                                   */
/* -------------------------------------------------------------------------- */

/** O preço como a tabela da construtora escreve, sem o "R$": "840.569,40". */
export function formatarPreco(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * O que a célula mostra ao abrir: o estado de hoje. Disponível é o preço,
 * vendida é "v", reservada é "r" (e guarda o preço que já tinha).
 */
export function textoDaCelula(u: Pick<UnidadeDaTabela, 'status' | 'price_cents'>): string {
  if (u.status === 'vendido') return 'v';
  if (u.status === 'reservado') return 'r';
  return u.price_cents != null ? formatarPreco(u.price_cents) : '';
}

export type LeituraDaCelula =
  | { ok: true; status: UnitStatus; price_cents: number | null }
  | { ok: false; erro: string };

const SEM_ACENTO = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * O que a Juliana digitou na célula: o preço ("840.569,40") é disponível, "v"
 * é vendida, "r" é reservada. A reservada mantém o preço que tinha, ou o que
 * vier depois do "r" ("r 850.000,00"); a vendida mantém o dela, porque o site
 * não a mostra e preço trocado à toa conta como mudança.
 *
 * Célula vazia é erro, e não "sem mudança": disponível sem preço o banco
 * recusa, e vazio por engano não pode virar nada em silêncio.
 */
export function lerCelula(texto: string, precoAtual: number | null): LeituraDaCelula {
  // Sem o "R$" antes de tudo: o "R" dele seria lido como "reservada".
  const t = SEM_ACENTO(texto.replace(/r\$/gi, ' ').trim().toLowerCase());
  if (!t) return { ok: false, erro: 'Vazia: digite o preço, v (vendida) ou r (reservada).' };

  if (/^v(endid[ao])?\.?$/.test(t)) return { ok: true, status: 'vendido', price_cents: precoAtual };

  const reservada = /^r(eservad[ao])?\.?\s*(.*)$/.exec(t);
  if (reservada) {
    const resto = reservada[2] ?? '';
    if (!resto) return { ok: true, status: 'reservado', price_cents: precoAtual };
    const preco = lerReais(resto);
    return preco === null
      ? { ok: false, erro: 'Preço da reservada ilegível. Ex.: r 850.000,00' }
      : { ok: true, status: 'reservado', price_cents: preco };
  }

  if (/^d(isponivel)?\.?$/.test(t)) {
    return precoAtual === null
      ? { ok: false, erro: 'Disponível sem preço: digite o preço.' }
      : { ok: true, status: 'disponivel', price_cents: precoAtual };
  }

  const preco = lerReais(t);
  return preco === null
    ? { ok: false, erro: 'Não entendi: digite o preço (840.569,40), v ou r.' }
    : { ok: true, status: 'disponivel', price_cents: preco };
}

/**
 * A mesma célula em duas partes, para a lista do celular (situação num
 * seletor, preço num campo). Os dois jeitos escrevem o mesmo texto, então a
 * grade do computador e a lista nunca discordam.
 */
export function partesDaCelula(texto: string, precoAtual: number | null): { status: UnitStatus; preco: string } {
  const leitura = lerCelula(texto, precoAtual);
  const t = texto.replace(/R\$\s*/gi, '').trim();
  // O texto sem a palavra da situação: o que sobra é o preço digitado.
  const resto = t.replace(/^(reservad[ao]|r|disponível|disponivel|d)\b\.?\s*/i, '');
  const status: UnitStatus = leitura.ok
    ? leitura.status
    : /^r/i.test(t)
      ? 'reservado'
      : /^v/i.test(t)
        ? 'vendido'
        : 'disponivel';
  if (status === 'vendido') return { status, preco: '' };
  if (resto && lerReais(resto) !== null) return { status, preco: resto };
  const preco = leitura.ok ? leitura.price_cents : null;
  return { status, preco: preco != null ? formatarPreco(preco) : resto };
}

export function celulaDasPartes(status: UnitStatus, preco: string): string {
  if (status === 'vendido') return 'v';
  if (status === 'reservado') return preco.trim() ? `r ${preco.trim()}` : 'r';
  return preco.trim();
}
