/**
 * Qual commit está no ar.
 *
 * Existe para conferir se uma entrega já foi publicada sem precisar abrir o
 * painel da Vercel, que fica na conta da Juliana.
 */
export function GET() {
  return Response.json({
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local',
    ambiente: process.env.VERCEL_ENV ?? 'local',
  });
}
