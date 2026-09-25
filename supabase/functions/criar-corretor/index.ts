import { servir } from '../_shared/wa.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Cria uma conta para a equipe.
 *
 * Existe como edge function por um motivo só: criar usuário exige a chave de
 * serviço, e chave de serviço no navegador é chave publicada. Todo o resto da
 * gestão de equipe (trocar papel, desativar) roda direto pelo cliente, porque o
 * RLS e os gatilhos da 007 já bastam.
 *
 * A ORGANIZAÇÃO NUNCA VEM DO CORPO DA REQUISIÇÃO. Ela é lida do perfil de quem
 * chamou. No CRM auditado, a função equivalente aceitava o tenant como
 * parâmetro e rodava com service_role sem conferir o `Authorization` — bastava
 * conhecer a URL para escrever na conta de qualquer cliente. Aqui não há
 * parâmetro para forjar.
 */

/*
 * `APP_ORIGIN` é uma LISTA, separada por vírgula — mesmo formato do módulo de
 * WhatsApp, e pelo mesmo motivo: o app é servido por três endereços mais o
 * `localhost`. Com um valor só, chamar de qualquer um dos outros devolvia
 * "Failed to send a request to the Edge Function", que não menciona origem.
 *
 * Continua sendo lista e não `*`: isto aqui CRIA USUÁRIO. `*` seria convite
 * para qualquer página aberta no navegador chamar em nome de quem está logado.
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

/** Carimba a origem na saída, num ponto só. Ver o gêmeo em `_shared/wa.ts`. */
function comOrigem(resposta: Response, req: Request): Response {
  const h = new Headers(resposta.headers);
  h.set('Access-Control-Allow-Origin', origemPermitida(req));
  h.append('Vary', 'Origin');
  return new Response(resposta.body, { status: resposta.status, headers: h });
}

const CORS = {
  'Access-Control-Allow-Origin': PERMITIDAS[0] ?? '*',
  // Os quatro são obrigatórios: o `supabase-js` manda `apikey` e
  // `x-client-info` em toda chamada, além do token. Uma primeira versão daqui
  // listava só `authorization, content-type` — o preflight recusava e o
  // navegador nem chegava a enviar, com a mensagem inútil "Failed to send a
  // request to the Edge Function". A lista da referência não era excesso.
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
 * Sem 0/O nem 1/l/I: o gerente vai ditar isso por telefone ou WhatsApp para o
 * corretor, e caractere ambíguo vira chamado de suporte.
 */
function senhaTemporaria(): string {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  return Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join('');
}

/*
 * `servir` e não `Deno.serve` cru.
 *
 * O padrão anterior tinha um buraco: se `tratar` ESTOURA, o `await` rejeita,
 * `comOrigem` nunca roda e o runtime devolve um 500 sem CORS. O navegador
 * descarta a resposta e a tela mostra erro de rede — foi exatamente assim que a
 * criação da segunda corretora falhou em silêncio, com preflight certo e função
 * alcançável. `createUser` é a chamada que pode estourar aqui.
 *
 * O envelope vem do módulo compartilhado; o `comOrigem` e o `CORS` locais deste
 * arquivo continuam sendo os mesmos por construção — os dois leem o mesmo
 * APP_ORIGIN. Unificar o resto fica para quando alguém encostar nesta função de
 * novo; hoje o que importa é nenhuma exceção sair muda.
 */
servir(tratar);

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

    // 2 · De qual organização, e com qual papel? Os dois vêm do banco.
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
      return json({ erro: 'Só gerente ou administrador pode criar contas.' }, 403);
    }

    // 3 · O que estão pedindo
    const corpo = await req.json().catch(() => null);
    const email = String(corpo?.email ?? '').trim().toLowerCase();
    const nome = String(corpo?.nome ?? '').trim();
    const papel = String(corpo?.papel ?? 'corretor');
    const creci = String(corpo?.creci ?? '').trim() || null;

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ erro: 'E-mail inválido.' }, 400);
    if (nome.length < 3) return json({ erro: 'Informe o nome completo.' }, 400);
    if (!['admin', 'gerente', 'corretor'].includes(papel)) return json({ erro: 'Papel inválido.' }, 400);

    // A mesma regra do gatilho da 007, repetida aqui para a mensagem sair
    // legível em vez de virar erro de banco.
    if (papel === 'admin' && !souAdmin) {
      return json({ erro: 'Só um administrador pode criar outro administrador.' }, 403);
    }

    // 4 · Cria
    const senha = senhaTemporaria();
    const { data: criado, error: erroCriar } = await admin.auth.admin.createUser({
      email,
      password: senha,
      // Sem confirmação por e-mail: o plano gratuito limita envio, e a conta
      // precisa funcionar no minuto em que o gerente termina de cadastrar.
      email_confirm: true,
      user_metadata: { full_name: nome },
    });

    if (erroCriar || !criado.user) {
      const jaExiste = /already|registered|exists/i.test(erroCriar?.message ?? '');
      return json(
        { erro: jaExiste ? 'Já existe uma conta com esse e-mail.' : 'Não foi possível criar a conta.' },
        jaExiste ? 409 : 500,
      );
    }

    // 5 · Perfil e papel, na organização de QUEM CHAMOU
    const { error: erroPerfil } = await admin.from('profiles').insert({
      id: criado.user.id,
      organization_id: perfil.organization_id,
      full_name: nome,
      email,
      creci,
    });

    if (erroPerfil) {
      // Sem perfil a conta é um fantasma que consegue autenticar e não pertence
      // a lugar nenhum. Desfaz.
      await admin.auth.admin.deleteUser(criado.user.id);
      return json({ erro: 'Não foi possível criar o perfil.' }, 500);
    }

    const { error: erroPapel } = await admin.from('user_roles').insert({
      user_id: criado.user.id,
      organization_id: perfil.organization_id,
      role: papel,
    });

    if (erroPapel) {
      await admin.from('profiles').delete().eq('id', criado.user.id);
      await admin.auth.admin.deleteUser(criado.user.id);
      return json({ erro: 'Não foi possível atribuir o papel.' }, 500);
    }

    // A senha volta UMA vez. Não fica guardada em lugar nenhum em texto puro —
    // quem cria anota e entrega, e o corretor troca em Configurações.
    return json({ id: criado.user.id, email, senhaTemporaria: senha });
  } catch (e) {
    console.error('criar-corretor:', e);
    // Detalhe de erro fica no log do servidor. O CRM auditado devolvia o rastro
    // de pilha na resposta de uma função sem autenticação.
    return json({ erro: 'Erro interno.' }, 500);
  }
}
