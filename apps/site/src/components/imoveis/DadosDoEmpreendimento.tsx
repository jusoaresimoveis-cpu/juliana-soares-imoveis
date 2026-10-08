import { CONSTRUCTION_STATUS_LABEL, nomeDoMesDaTabela } from '@juliana/contracts';

import type { Empreendimento } from '@/lib/imoveis/tipos';

/**
 * O que acompanha o "a partir de" na lateral da página: de que tabela é o
 * preço, a obra, a entrega e o pagamento, e o atalho para as unidades.
 *
 * A construtora não aparece: fica só no CRM, para o cliente não ir comprar
 * direto com ela (decisão do usuário, 08/10).
 */
export function DadosDoEmpreendimento({ empreendimento }: { empreendimento: Empreendimento }) {
  const { tabelaVigente, tabelaDoMes, unidadesDisponiveis, obra, anoDeEntrega, condicaoDePagamento, plantas } =
    empreendimento;
  // "Pronto · Entrega em 2024" leria como atraso: no pronto, a entrega já passou.
  const situacao = [
    obra ? CONSTRUCTION_STATUS_LABEL[obra] : null,
    anoDeEntrega && obra !== 'pronto' ? `Entrega em ${anoDeEntrega}` : null,
  ].filter((parte) => parte !== null);
  // A tabela vigente só qualifica um preço que aparece: sem disponível (só
  // reservadas), o preço é "Consulte", e "Valores da tabela de outubro" ao lado
  // dele não diria de que valores.
  const tabela = !tabelaVigente
    ? 'Preços em atualização'
    : tabelaDoMes && unidadesDisponiveis > 0
      ? `Valores da tabela de ${nomeDoMesDaTabela(tabelaDoMes)}`
      : null;

  return (
    <div className="space-y-2 text-sm">
      {tabela && <p className="text-xs text-suave">{tabela}</p>}
      {situacao.length > 0 && <p className="font-medium">{situacao.join(' · ')}</p>}
      {condicaoDePagamento && (
        <p>
          <span className="text-suave">Pagamento: </span>
          {condicaoDePagamento}
        </p>
      )}
      {plantas.length > 0 && (
        <a href="#unidades" className="inline-block font-medium text-bronze hover:underline">
          Ver as unidades
        </a>
      )}
    </div>
  );
}

/**
 * O registro de incorporação e o cartório, em letra pequena. A Lei 4.591/64,
 * art. 32, § 3º, exige o número do registro no anúncio de imóvel na planta.
 */
export function RegistroDaIncorporacao({ empreendimento }: { empreendimento: Empreendimento }) {
  if (!empreendimento.registroDeIncorporacao) return null;
  return (
    <p className="text-xs text-suave">
      Registro de incorporação: {empreendimento.registroDeIncorporacao}
      {empreendimento.cartorio && ` (${empreendimento.cartorio})`}
    </p>
  );
}
