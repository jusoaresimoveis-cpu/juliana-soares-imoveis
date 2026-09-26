import { SITE } from '@/config/site';

import { AvaliacoesDoGoogle } from './AvaliacoesDoGoogle';

/**
 * Depoimentos: as avaliações REAIS do Perfil da Empresa da Juliana no Google,
 * pelo widget da Trustindex (decisão do usuário, 25/09/2026). O pedido de
 * acesso à API do Perfil da Empresa, que traria as avaliações para o nosso
 * banco, foi recusado na checagem automática do Google.
 */
export function Depoimentos() {
  if (!SITE.widgetDeAvaliacoes) return null;
  return <AvaliacoesDoGoogle widget={SITE.widgetDeAvaliacoes} />;
}
