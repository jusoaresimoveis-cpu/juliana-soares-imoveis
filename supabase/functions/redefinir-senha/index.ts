import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Redefine a senha de OUTRA pessoa da equipe.
 *
 * O caso real é banal e frequente: o corretor esqueceu a senha, está na rua, e
 * não existe "esqueci minha senha" nesta conta — o envio de e-mail do plano
 * gratuito é limitado e o CRM nunca dependeu dele. Sem esta função, a saída era
 * o gerente ligar para alguém que soubesse mexer no painel do Supabase.
 *
 * A senha é GERADA, nunca escolhida por quem redefine. Duas razões, e as duas
 * pesam mais do que a comodidade de digitar uma:
 *
 *   1. Senha escolhida por terceiro é senha fraca. "hva2026" resolveria a
 *      ligação e viraria a senha permanente de alguém com acesso à base de
 *      clientes.
 *   2. Quem escolhe, sabe. Uma senha temporária que o dono troca depois é
 *      diferente de uma senha que o gerente conhece para sempre — e que a
 *      pessoa provavelmente reusa em outros lugares.
 *
 * O QUE ISTO NÃO FAZ: não derruba as sessões que a pessoa já tem abertas. A
 * API de administração do GoTrue só encerra sessão com o token do próprio
 * usuário em mãos, que aqui não existe. Para "fulano saiu da empresa" a
 * ferramenta certa é DESATIVAR — a 007 corta o acesso pelo `is_active`, e as
 * políticas do banco leem isso em toda consulta. Redefinir senha é para quem
 * continua na equipe e perdeu a chave.
 */

/*
 * `APP_ORIGIN` é uma LISTA, separada por vírgula — mesmo formato das outras
 * funções. Um valor só quebra o app quando ele é servido por mais de um
 * endereço, e o sintoma é "Failed to send a request to the Edge Function", que
 * não menciona origem nenhuma.
 */
const PERMITIDAS = (Deno.env.get('APP_ORIGIN') ?? '')
  .split(',')
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter(Boolean);

function origemPermitida(req: Request): string {
  const pedida = (req.headers.get('Origin') ?? '').replace(/\/$/, '');
  if (PERMITIDAS.length === 0) return '*';
  return PERMITIDAS.includes(pedida) ? pedida : (PERMITIDAS[0] as string);
}

function comOrigem(resposta: Response, req: Request): Response {
  const h = new Headers(resposta.headers);
  h.set('Access-Control-Allow-Origin', origemPermitida(req));
  h.append('Vary', 'Origin');
  return new Response(resposta.body, { status: resposta.status, headers: h });
}

const CORS = {
  'Access-Control-Allow-Origin': PERMITIDAS[0] ?? '*',
  // Os quatro são obrigatórios: o `supabase-js` manda `apikey` e
  // `x-client-info` em toda chamada, além do token.
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

/**
 * Senha temporária legível em voz alta.
 *
 * Sem 0/O nem 1/l/I: o gerente vai ditar isto por telefone, e caractere ambíguo
 * vira uma segunda ligação. É a mesma regra de `criar-corretor`.
 */
function senhaTemporaria(): string {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  return Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join('');
}

Deno.serve(async (req) => comOrigem(await tratar(req), req));

async function tratar(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ erro: 'Método não permitido' }, 405);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  try {
    // 1 · Quem está chamando?
    const cabecalho = req.headers.get('Authorization');
    if (!cabecalho?.startsWith('Bearer ')) return json({ erro: 'Sem autenticação.' }, 401);

    const { data: chamador, error: erroAuth } = await admin.auth.getUser(
      cabecalho.replace('Bearer ', ''),
    );
    if (erroAuth || !chamador.user) return json({ erro: 'Sessão inválida.' }, 401);

    /*
     * 2 · Organização e papel vêm do BANCO, nunca do corpo da requisição.
     *
     * É a mesma regra de `criar-corretor` e do módulo de WhatsApp: na
     * referência auditada o tenant chegava como parâmetro, e bastava conhecer a
     * URL para agir na conta de qualquer cliente. Aqui não há o que forjar.
     */
    const { data: perfil } = await admin
      .from('profiles')
      .select('organization_id, is_active')
      .eq('id', chamador.user.id)
      .single();

    if (!perfil?.organization_id || !perfil.is_active) {
      return json({ erro: 'Conta sem organização ativa.' }, 403);
    }

    const { data: papeis } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', chamador.user.id)
      .eq('organization_id', perfil.organization_id);

    const meus = (papeis ?? []).map((p) => p.role as string);
    const souAdmin = meus.includes('admin');
    if (!souAdmin && !meus.includes('gerente')) {
      return json({ erro: 'Só gerente ou administrador redefine senha.' }, 403);
    }

    // 3 · Quem é o alvo
    const corpo = await req.json().catch(() => null);
    const alvoId = String(corpo?.userId ?? '').trim();
    if (!alvoId) return json({ erro: 'Informe de quem é a conta.' }, 400);

    /*
     * A própria conta sai por aqui, não por ali.
     *
     * Quem sabe a senha atual troca em Configurações → Senha, informando a
     * antiga. Passar pelo caminho de administração dispensaria essa prova — e
     * um computador esquecido destravado viraria troca de senha sem que o dono
     * precise sabê-la.
     */
    if (alvoId === chamador.user.id) {
      return json({ erro: 'Para trocar a sua própria senha, use a aba Senha.' }, 400);
    }

    const { data: alvo } = await admin
      .from('profiles')
      .select('id, full_name, organization_id')
      .eq('id', alvoId)
      .single();

    // Mesma mensagem para "não existe" e "é de outra imobiliária": responder
    // coisas diferentes transformaria isto num verificador de quem existe.
    if (!alvo || alvo.organization_id !== perfil.organization_id) {
      return json({ erro: 'Pessoa não encontrada nesta imobiliária.' }, 404);
    }

    const { data: papeisAlvo } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', alvoId)
      .eq('organization_id', perfil.organization_id);

    /*
     * 4 · Gerente não redefine senha de administrador.
     *
     * Sem esta linha o painel tem uma escada: qualquer gerente redefine a senha
     * do admin, entra com ela e vira admin. É a mesma regra que a tela já
     * aplica para editar papel — repetida aqui porque tela não é defesa, é
     * conveniência.
     */
    const alvoEhAdmin = (papeisAlvo ?? []).some((p) => p.role === 'admin');
    if (alvoEhAdmin && !souAdmin) {
      return json({ erro: 'Só um administrador redefine a senha de outro administrador.' }, 403);
    }

    // 5 · Redefine
    const senha = senhaTemporaria();
    const { error: erroTrocar } = await admin.auth.admin.updateUserById(alvoId, {
      password: senha,
    });

    if (erroTrocar) {
      console.error('redefinir-senha:', erroTrocar);
      return json({ erro: 'Não foi possível redefinir a senha.' }, 500);
    }

    // A senha volta UMA vez, como em `criar-corretor`. Não fica guardada em
    // lugar nenhum em texto puro.
    return json({ nome: alvo.full_name, senhaTemporaria: senha });
  } catch (e) {
    console.error('redefinir-senha:', e);
    // Detalhe de erro fica no log do servidor, nunca na resposta.
    return json({ erro: 'Erro interno.' }, 500);
  }
}
