import { describe, expect, it } from 'vitest';
import {
  WA_INSTANCE_META,
  WA_INSTANCE_STATUSES,
  WA_STATUSES_OPERANTES,
  ehIdentificadorAnonimo,
  podeEnviar,
  telefoneDoJid,
} from './index';
import {
  colunasDaTabela,
  definicaoDaFuncao,
  definicaoDoGatilho,
  privilegiosNaTabela,
  semComentarios,
  valoresDoCheck as valoresDoCheckAtual,
} from '../../../supabase/testes/esquema';

/** A definição vigente de uma função, sem comentário. */
const funcao = (nome: string) => semComentarios(definicaoDaFuncao(nome).texto);

describe('whatsapp — conexão', () => {
  it('os estados batem com o CHECK da tabela', () => {
    expect(valoresDoCheckAtual('whatsapp_instances_status_ck')).toEqual([...WA_INSTANCE_STATUSES].sort());
  });

  it('todo estado tem rótulo e instrução para o corretor', () => {
    // O estado só existe porque muda a FRASE na tela: "celular sem internet"
    // (não faça nada) é instrução oposta a "escaneie o QR" (aja agora).
    WA_INSTANCE_STATUSES.forEach((s) => {
      expect(WA_INSTANCE_META[s], `estado "${s}" sem meta`).toBeDefined();
      expect(WA_INSTANCE_META[s].instrucao.length).toBeGreaterThan(10);
    });
  });

  it('só a instância conectada envia', () => {
    expect(WA_STATUSES_OPERANTES).toEqual(['conectada']);
    expect(podeEnviar('credenciada_offline')).toBe(false);
  });

  it('o segredo do webhook é guardado como digest, nunca em claro', () => {
    const colunas = colunasDaTabela('whatsapp_instances');
    expect(colunas.has('webhook_secret_hash')).toBe(true);
    expect(colunas.has('webhook_secret')).toBe(false);
  });

  it('o token não tem coluna própria — só a referência para o Vault', () => {
    const colunas = colunasDaTabela('whatsapp_instances');
    expect(colunas.get('token_secret_id')).toMatch(/^uuid\b/);
    expect(colunas.has('token')).toBe(false);
  });

  it('segredo e referência do Vault ficam fora do GRANT de leitura', () => {
    // RLS decide linha; coluna se decide por GRANT. Se estes nomes entrarem na
    // lista, o token passa a trafegar até o navegador — e SELECT na tabela
    // inteira seria o mesmo que pô-los na lista.
    const concedido = privilegiosNaTabela('whatsapp_instances', 'authenticated');
    expect(concedido.tabela).not.toContain('select');
    const legiveis = concedido.colunas.select ?? [];
    expect(legiveis).not.toContain('token_secret_id');
    expect(legiveis).not.toContain('webhook_secret_hash');
    expect(legiveis).toContain('status');
  });

  it('o teto de instâncias é checado sob trava, não em leitura solta', () => {
    // Sem o advisory lock, dois cliques simultâneos criam duas instâncias pagas.
    const teto = definicaoDoGatilho('whatsapp_instances_teto');
    expect(teto.normal).toContain('before insert on public.whatsapp_instances');
    expect(funcao(teto.funcao)).toMatch(/pg_advisory_xact_lock/);
  });
});

describe('whatsapp — identificadores do provedor', () => {
  it('o telefone sai do JID cortando o aparelho ANTES de limpar dígitos', () => {
    // Na ordem inversa o sufixo gruda e vira número com um dígito a mais, que
    // nunca abre conversa. Foi bug de produção na referência.
    expect(telefoneDoJid('554788886666:3')).toBe('+554788886666');
    expect(telefoneDoJid('5511987654321@s.whatsapp.net')).toBe('+5511987654321');
    expect(telefoneDoJid(null)).toBeNull();
    expect(telefoneDoJid('123')).toBeNull();
  });

  it('identificador anônimo é reconhecido em vez de adivinhado', () => {
    expect(ehIdentificadorAnonimo('102938475610293@lid')).toBe(true);
    expect(ehIdentificadorAnonimo('5511987654321')).toBe(false);
  });
});
