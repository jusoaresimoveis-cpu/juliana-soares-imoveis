import { describe, expect, it } from 'vitest';
import { colapsado, definicaoDaFuncao, semComentarios } from '../../../supabase/testes/esquema';

/**
 * O NONO DÍGITO — a migração 139.
 *
 * O WhatsApp entrega o celular brasileiro no formato antigo, sem o nono dígito
 * (`554788887777`); quem digita numa página digita com (`5547988887777`). Até a
 * 139 os dois viravam fichas diferentes da mesma pessoa.
 *
 * A regra já existia dentro de `to_e164` desde a 001. O que não existia era ela
 * ser alcançada: uma saída antecipada devolvia qualquer número que chegasse com
 * `+` sem olhar, e todo número que vem do WhatsApp chega assim.
 *
 * Estes testes guardam as três coisas que, se saírem do lugar, quebram em
 * silêncio — sem erro, sem log, só com ficha dobrada aparecendo semanas depois.
 */

/** A definição vigente de uma função, sem comentário e com os espaços colapsados. */
const funcao = (nome: string) => colapsado(semComentarios(definicaoDaFuncao(nome).texto));

/**
 * A MESMA regra da função do banco, escrita aqui para ser executável.
 *
 * Não é a implementação — é a especificação. O teste abaixo confere que o SQL
 * vigente carrega as mesmas três condições; esta função existe para os casos
 * poderem ser lidos como casos, e não como texto dentro de uma string.
 */
function canonico(e164: string): string {
  const d = e164.replace(/\D/g, '');
  if (d.startsWith('55') && d.length === 12 && /[6-9]/.test(d.charAt(4))) {
    return `+${d.slice(0, 4)}9${d.slice(4)}`;
  }
  return `+${d}`;
}

describe('o celular brasileiro sempre com o nono dígito', () => {
  it('o que vem do WhatsApp ganha o 9', () => {
    expect(canonico('+554788887777')).toBe('+5547988887777');
    expect(canonico('+554884337192')).toBe('+5548984337192');
  });

  it('o que já vinha certo não é tocado', () => {
    expect(canonico('+5547988887777')).toBe('+5547988887777');
  });

  it('TELEFONE FIXO não ganha nada', () => {
    /*
     * A parte que separa uma regra de um estrago. Fixo no Brasil continua com
     * oito dígitos e começa em 2, 3, 4 ou 5 — pôr um 9 nele inventaria um
     * número que não existe, e a casa perderia o contato sem perceber.
     */
    expect(canonico('+554733334444')).toBe('+554733334444');
    expect(canonico('+551125556666')).toBe('+551125556666');
    expect(canonico('+556720200026')).toBe('+556720200026');
  });

  it('e número de fora do Brasil não é tocado', () => {
    expect(canonico('+59179796364')).toBe('+59179796364');
    expect(canonico('+59891234567')).toBe('+59891234567');
    expect(canonico('+12125551234')).toBe('+12125551234');
  });
});

describe('a regra do banco é a mesma', () => {
  const fn = () => funcao('to_e164');

  it('a saída antecipada canonicaliza o Brasil antes de devolver', () => {
    /*
     * A saída antecipada existe e é útil — foi ela que tornou a 126 (troca de
     * país) inofensiva para o número. O defeito era ela devolver sem olhar.
     */
    const t = fn();
    expect(t).toContain("if left(_raw, 1) = '+' and length(d) between 8 and 15 then");
    expect(t).toMatch(/left\(d, 2\) = '55' and length\(d\) = 12 and substr\(d, 5, 1\) ~ '\[6-9\]'/);
    expect(t).toContain("d := substr(d, 1, 4) || '9' || substr(d, 5);");
  });

  it('as três condições estão todas lá — tirar qualquer uma estraga', () => {
    const t = fn();
    // Sem o `= 12`, um número já canônico ganharia um segundo 9.
    expect(t).toContain('length(d) = 12');
    // Sem o `[6-9]`, telefone fixo viraria celular inexistente.
    expect(t).toContain("substr(d, 5, 1) ~ '[6-9]'");
    // Sem o `'55'`, a regra brasileira cairia em cima de outros países.
    expect(t).toContain("left(d, 2) = '55'");
  });
});

describe('as duas pontas procuram o mesmo número', () => {
  it('a mensagem que chega busca o lead pelo canônico', () => {
    /*
     * O defeito que sobraria se só a função mudasse: `find_or_create_lead`
     * compara o normalizado, mas a busca direta do `processar_inbox` comparava
     * o cru. Com as fichas canônicas, ela não acharia mais ninguém — e cada
     * mensagem de cliente conhecido viraria uma ficha nova.
     */
    const t = funcao('processar_inbox');
    expect(t).toContain(
      'phone_e164 = public.to_e164(v_e164, public.pais_da_discagem(v_e164))',
    );
    expect(t).not.toMatch(/and phone_e164 = v_e164\b/);
  });

  it('e a CONVERSA continua com o número do provedor', () => {
    /*
     * De propósito. `contact_e164` é o endereço do chat, e é ele que o
     * `enfileirar_mensagem` copia para a fila de saída — mexer ali seria mexer
     * no envio. A conversa se liga ao lead por `lead_id`, nunca por telefone.
     */
    const t = funcao('processar_inbox');
    expect(t).toContain('contact_e164, contact_lid');
    expect(t).not.toContain('contact_e164 = public.to_e164');
  });
});
