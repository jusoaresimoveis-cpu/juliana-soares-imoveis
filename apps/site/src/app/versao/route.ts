/**
 * Qual commit está no ar.
 *
 * Existe para conferir se uma entrega já foi publicada sem precisar abrir o
 * painel da Vercel, que fica na conta da Juliana. Os dois valores são gravados
 * no build (`next.config.ts`).
 */
export function GET() {
  return Response.json({
    commit: process.env.COMMIT_DO_BUILD,
    ambiente: process.env.AMBIENTE_DO_BUILD,
  });
}
