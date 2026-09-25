import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A permissão do número de WhatsApp deixou de ser por PAPEL e passou a ser por
 * DONO. Estes testes guardam a diferença.
 *
 * Nada aqui fala com banco — quem interroga as policies e os gatilhos é
 * `supabase/testes/numero.test.ts`, contra um Postgres de verdade. O que sobra
 * para cá é a camada onde a regra pode sumir sem nenhum teste ficar vermelho:
 * a função de borda e a tela.
 */

const RAIZ = join(__dirname, '..');
const FUNCAO = readFileSync(
  join(RAIZ, '..', '..', 'supabase', 'functions', 'whatsapp-instancia', 'index.ts'),
  'utf8',
);
const TELA = readFileSync(join(RAIZ, 'src', 'components', 'settings', 'WhatsApp.tsx'), 'utf8');
/* JSX quebra frase no meio para caber na coluna. Procurar o texto como ele sai
   na TELA, e não como ele está no arquivo, evita um teste que falha por causa
   de formatação — o tipo de vermelho que ensina a ignorar vermelho. */
const TELA_CORRIDA = TELA.replace(/\s+/g, ' ');

describe('a função de borda', () => {
  it('confere o DONO antes de mexer num número existente', () => {
    /*
     * O gate antigo era uma linha só: `if (acao !== 'status' && !chamador.gestor)`.
     * Ela impedia a corretora de conectar o próprio celular — e o pareamento é
     * um QR code que ela precisa ler no aparelho dela, então a alternativa era
     * o gerente com o telefone dela na mão.
     */
    expect(FUNCAO).toContain('podeMexer');
    expect(FUNCAO).toMatch(/if\s*\(instanciaId\s*&&\s*!\(await podeMexer\(/);
  });

  it('e a checagem compara o dono com quem chamou', () => {
    // `podeMexer` que devolvesse `true` sempre compilaria, rodaria e passaria no
    // teste acima.
    expect(FUNCAO).toContain('data.owner_id === chamador.userId');
  });

  it('remover continua sendo da gestão', () => {
    /*
     * Desconectar encerra a sessão e o número volta com o mesmo QR. Remover
     * apaga a instância paga no provedor e o token no cofre, e leva junto o
     * vínculo das conversas. São ações de peso diferente e não podem ter a
     * mesma permissão.
     */
    expect(FUNCAO).toMatch(/remover === true && !chamador\.gestor/);
  });

  it('a origem é carimbada mesmo quando o handler estoura', () => {
    // `comOrigem(await tratar(req), req)` não roda quando `tratar` rejeita: sai
    // um 500 sem cabeçalho de origem, e o navegador chama isso de erro de rede.
    expect(FUNCAO).toContain('servir(tratar)');
  });
});

describe('a tela de configurações', () => {
  it('não oferece remover a quem não é gestão', () => {
    expect(TELA).toMatch(/onRemover=\{\s*gestor \?/);
  });

  it('não filtra a lista de números por conta própria', () => {
    /*
     * Quem recorta é a policy da 080. Um filtro por dono aqui criaria uma
     * segunda versão da mesma regra — e seria esta, a da tela, a ficar para trás
     * no dia em que a regra mudar. Pior: daria a impressão de proteção onde a
     * proteção real é outra.
     */
    expect(TELA).not.toMatch(/\.filter\([^)]*owner_id/);
  });

  it('diz na cara de quem vai conectar o celular que conversa pessoal é privada', () => {
    // É a dúvida de quem liga o próprio aparelho ao sistema do patrão, e a
    // resposta já está no banco desde a 067. Faltava estar na tela onde a
    // decisão é tomada.
    expect(TELA).toContain('pessoal');
    expect(TELA_CORRIDA).toMatch(/Nem a ger[êe]ncia nem a administra[çc][ãa]o/);
  });
});
