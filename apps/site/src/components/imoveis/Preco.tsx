import type { FinalidadeDoSite } from '@juliana/contracts';

import { plural, reais, reaisParaBaixo } from '@/lib/formato';
import type { Imovel } from '@/lib/imoveis/tipos';

/**
 * O preço que interessa a quem está olhando.
 *
 * Na listagem de aluguel, o aluguel vem primeiro mesmo que o imóvel também
 * esteja à venda: a pessoa entrou procurando aluguel. Sem valor, fica "Consulte"
 * em vez de esconder o imóvel.
 *
 * Venda com desconto sai como "De R$ X por R$ Y". As palavras ficam no texto, e
 * não só o risco no preço antigo: leitor de tela não anuncia o risco, e sem o
 * "de" e o "por" ele leria dois preços soltos.
 */
export function Preco({
  imovel,
  finalidade,
  tamanho = 'normal',
}: {
  imovel: Imovel;
  finalidade?: FinalidadeDoSite;
  tamanho?: 'normal' | 'grande';
}) {
  const classe = tamanho === 'grande' ? 'text-2xl' : 'text-lg';
  if (imovel.empreendimento) return <PrecoDoEmpreendimento imovel={imovel} classe={classe} />;

  const aluguel = imovel.finalidades.includes('aluguel') ? imovel.aluguelCents : null;
  const venda = imovel.finalidades.includes('venda') ? imovel.precoVendaCents : null;
  const aluguelPrimeiro = finalidade ? finalidade === 'aluguel' : aluguel !== null;

  const linhas = [
    aluguel !== null ? { texto: reais(aluguel), sufixo: ' /mês', de: null } : null,
    venda !== null
      ? { texto: reais(venda), sufixo: '', de: imovel.precoDeTabelaCents ? reais(imovel.precoDeTabelaCents) : null }
      : null,
  ].filter((linha) => linha !== null);

  if (!aluguelPrimeiro) linhas.reverse();

  if (linhas.length === 0) return <p className={`${classe} font-semibold`}>Consulte</p>;

  const [principal, secundaria] = linhas;
  return (
    <div>
      {principal.de && (
        <p className="text-sm text-suave">
          De <s>{principal.de}</s> por
        </p>
      )}
      <p className={`${classe} font-semibold`}>
        {principal.texto}
        {principal.sufixo && <span className="text-sm font-normal text-suave">{principal.sufixo}</span>}
      </p>
      {secundaria && (
        <p className="text-sm text-suave">
          ou{' '}
          {secundaria.de && (
            <>
              de <s>{secundaria.de}</s> por{' '}
            </>
          )}
          {secundaria.texto}
          {secundaria.sufixo}
        </p>
      )}
    </div>
  );
}

/**
 * "A partir de R$ 840.569" e "10 unidades disponíveis".
 *
 * Os centavos são cortados para baixo, nunca arredondados para cima: o "a
 * partir de" não pode passar do preço da unidade mais barata. Sem a tabela do
 * mês, "Consulte" (a contagem continua: ela não depende do preço).
 *
 * Sem unidade disponível (só reservadas, antes da primeira tabela, suspenso), o
 * banco manda o "a partir de" nulo e `units_available` zero: fica "Consulte",
 * sem contagem. A contagem é sempre a do banco, nunca a das linhas da lista.
 */
function PrecoDoEmpreendimento({ imovel, classe }: { imovel: Imovel; classe: string }) {
  const preco = imovel.precoVendaCents;
  const disponiveis = imovel.empreendimento?.unidadesDisponiveis ?? 0;
  return (
    <div>
      {preco ? (
        <>
          <p className="text-sm text-suave">A partir de</p>
          <p className={`${classe} font-semibold`}>{reaisParaBaixo(preco)}</p>
        </>
      ) : (
        <p className={`${classe} font-semibold`}>Consulte</p>
      )}
      {disponiveis > 0 && (
        <p className="text-sm text-suave">{plural(disponiveis, 'unidade disponível', 'unidades disponíveis')}</p>
      )}
    </div>
  );
}
