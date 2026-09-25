import { servir, admin, json, passouNoLimite, quemChamou, CORS } from '../_shared/wa.ts';

/**
 * A caixa-preta do CRM.
 *
 * Recebe o que quebrou — da moldura de erro, de um erro solto na janela ou de
 * uma promessa sem `catch` — e grava em `error_reports`.
 *
 * `verify_jwt = false`, e é o ponto todo: o erro mais caro de reproduzir depois
 * é o da tela de entrar, onde não existe sessão. Exigir token aqui recusaria
 * justamente o relato que não tem como ser refeito. Quando o token vem, ele é
 * usado para carimbar a organização e o usuário; quando não vem, a linha nasce
 * órfã e ainda vale.
 *
 * A porta é pública, então ela tem o mesmo limite por acesso da `landing-lead`.
 */

/** Teto de cada campo. O cliente já corta; aqui corta de novo, porque o cliente
    é justamente a parte que não se controla. */
const MAX = {
  mensagem: 500,
  pilha: 4000,
  rota: 500,
  agente: 300,
  tela: 20,
  versao: 40,
  comentario: 2000,
  passo: 200,
} as const;

const ORIGENS = ['tela', 'janela', 'promessa'];
const MAX_PASSOS = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const texto = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim().slice(0, max);
  return t === '' ? null : t;
};

interface Passo {
  ms: number;
  tipo: string;
  texto: string;
}

/**
 * O rastro, reconstruído campo a campo.
 *
 * Nada de `jsonb` vindo cru do corpo: a coluna aceitaria um objeto de qualquer
 * formato e de qualquer tamanho, e uma tabela de diagnóstico com conteúdo livre
 * enviado pela internet é um depósito, não um registro.
 */
function limparRastro(v: unknown): Passo[] {
  if (!Array.isArray(v)) return [];
  const passos: Passo[] = [];
  for (const bruto of v.slice(0, MAX_PASSOS)) {
    if (typeof bruto !== 'object' || bruto === null) continue;
    const p = bruto as Record<string, unknown>;
    const t = texto(p.texto, MAX.passo);
    if (!t) continue;
    passos.push({
      ms: typeof p.ms === 'number' && Number.isFinite(p.ms) ? Math.round(p.ms) : 0,
      tipo: p.tipo === 'rota' || p.tipo === 'console' ? p.tipo : 'console',
      texto: t,
    });
  }
  return passos;
}

servir(responder);

async function responder(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ erro: 'método' }, 405);

  const c = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const sb = admin();

  if (!(await passouNoLimite(req, sb, 'reportar-erro'))) {
    return json({ erro: 'limite' }, 429);
  }

  /*
   * Dois formatos no mesmo endereço.
   *
   * O relato sai sozinho quando a tela quebra; o comentário vem depois, se a
   * pessoa escrever. Separar em duas funções significaria duas entradas no
   * `config.toml`, dois deploys e dois lugares para lembrar do limite de acesso
   * — para uma diferença de quatro linhas.
   */
  const id = texto(c.id, 40);
  if (id) {
    if (!UUID.test(id)) return json({ erro: 'id' }, 400);
    const comentario = texto(c.comentario, MAX.comentario);
    if (!comentario) return json({ erro: 'campos' }, 400);

    /*
     * `is null` no filtro é o que fecha a porta.
     *
     * O id é um UUID sorteado e só chega a quem acabou de receber a resposta —
     * conhecê-lo já é a credencial. Ainda assim, sem esta condição um id vazado
     * poderia ser reescrito indefinidamente, e o relato original se perderia.
     * Assim ele se escreve uma vez e nunca mais.
     */
    const { error } = await sb
      .from('error_reports')
      .update({ comentario })
      .eq('id', id)
      .is('comentario', null);

    if (error) {
      console.error('reportar-erro (comentário):', error.message);
      return json({ erro: 'falha' }, 500);
    }
    return json({ ok: true });
  }

  const origem = typeof c.origem === 'string' && ORIGENS.includes(c.origem) ? c.origem : null;
  const mensagem = texto(c.mensagem, MAX.mensagem);
  if (!origem || !mensagem) return json({ erro: 'campos' }, 400);

  // Quando há sessão, o relato ganha dono. Quando não há — tela de entrar,
  // token vencido — ele entra órfão, que é melhor do que não entrar.
  const quem = await quemChamou(req, sb);

  const { data, error } = await sb
    .from('error_reports')
    .insert({
      organization_id: quem?.orgId ?? null,
      user_id: quem?.userId ?? null,
      origem,
      mensagem,
      pilha: texto(c.pilha, MAX.pilha),
      rota: texto(c.rota, MAX.rota),
      agente: texto(c.agente, MAX.agente),
      tela: texto(c.tela, MAX.tela),
      versao: texto(c.versao, MAX.versao),
      rastro: limparRastro(c.rastro),
    })
    .select('id')
    .single();

  if (error) {
    console.error('reportar-erro:', error.message);
    return json({ erro: 'falha' }, 500);
  }

  // O id volta para o comentário poder alcançar esta mesma linha, e para a tela
  // mostrar os oito primeiros caracteres como número da ocorrência.
  return json({ id: (data as { id: string }).id });
}
