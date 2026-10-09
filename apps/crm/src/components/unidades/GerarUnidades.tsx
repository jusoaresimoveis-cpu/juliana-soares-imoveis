import { useMemo, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { rotuloDaUnidade, type PropertyType } from '@contracts';
import { useCriarUnidades, type Planta, type Unidade } from '@/hooks/useUnidades';
import { contagem } from '@/lib/contagem';
import { lerFinais, natural, prepararGeracao } from '@/lib/unidades';
import { cn } from '@/lib/utils';
import { botaoPrimario, botaoSecundario, Campo, Erro, inputCls } from './Formulario';

/**
 * O prédio inteiro de uma vez: do primeiro ao último andar, um apartamento por
 * final, cada um com a planta do seu final. Mostra a conta antes de criar.
 */
export function GerarUnidades({
  orgId,
  propertyId,
  tipo,
  plantas,
  unidades,
  semTabela,
}: {
  orgId: string | undefined;
  propertyId: string;
  tipo: PropertyType;
  plantas: Planta[];
  unidades: Unidade[];
  semTabela: boolean;
}) {
  const criar = useCriarUnidades(orgId, propertyId);
  const sugestao = useMemo(() => [...new Set(plantas.flatMap((p) => p.finals))].sort(natural).join(', '), [plantas]);
  const [aberto, setAberto] = useState(unidades.length === 0);
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [finaisTexto, setFinaisTexto] = useState(sugestao);
  const [criadas, setCriadas] = useState<number | null>(null);

  const andar = (v: string) => (/^-?\d{1,3}$/.test(v.trim()) ? Number(v) : null);
  const primeiro = andar(de);
  const ultimo = andar(ate);
  const { finais, invalidos } = lerFinais(finaisTexto);
  const geracao =
    primeiro !== null && ultimo !== null && finais.length
      ? prepararGeracao({
          primeiroAndar: primeiro,
          ultimoAndar: ultimo,
          finais,
          plantas,
          existentes: unidades.map((u) => u.label),
        })
      : null;

  const problema = invalidos.length
    ? `Final inválido: ${invalidos.join(', ')}.`
    : geracao?.semPlanta.length
      ? `Nenhuma planta tem o final ${geracao.semPlanta.join(', ')}. Ponha o final numa planta, ou tire-o daqui.`
      : geracao?.emDuasPlantas.length
        ? geracao.emDuasPlantas.map((d) => `O final ${d.final} está em duas plantas (${d.plantas.join(' e ')}).`).join(' ')
        : geracao?.invalidas.length
          ? `Andar fora de -10 a 300, ou número grande demais: ${geracao.invalidas.slice(0, 5).join(', ')}.`
          : geracao && geracao.novas.length > 2000
            ? 'Mais de 2.000 unidades de uma vez: confira os andares.'
            : null;

  const novas = geracao?.novas ?? [];
  const primeira = novas[0];
  const ultima = novas[novas.length - 1];

  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)} className={cn(botaoSecundario, 'self-start px-4')}>
        <Plus className="h-3.5 w-3.5" />
        Gerar mais unidades (andar por final)
      </button>
    );
  }

  return (
    <div className="rounded-lg bg-card p-5 shadow-card">
      <h2 className="text-lg font-bold">Gerar unidades</h2>
      <p className="mt-0.5 max-w-[75ch] text-sm text-tx-3">
        Do primeiro ao último andar, uma unidade por final: andares 5 a 19 com os finais 01 a 06 dão 501, 502… 1906. A
        planta de cada uma sai do final. Todas nascem vendidas e só aparecem no site quando a tabela do mês as der como
        disponíveis. As que já existem ficam como estão.
        {semTabela &&
          ' Até a primeira tabela, o imóvel fica com a situação que tinha, e o site mostra “Consulte” no lugar do preço, sem a lista de unidades.'}
      </p>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Campo rotulo="Primeiro andar">
          <input inputMode="numeric" value={de} onChange={(e) => setDe(e.target.value.replace(/[^\d-]/g, ''))} placeholder="5" className={inputCls} />
        </Campo>
        <Campo rotulo="Último andar">
          <input inputMode="numeric" value={ate} onChange={(e) => setAte(e.target.value.replace(/[^\d-]/g, ''))} placeholder="19" className={inputCls} />
        </Campo>
        <Campo className="col-span-2" rotulo="Finais">
          <input value={finaisTexto} onChange={(e) => setFinaisTexto(e.target.value)} placeholder="01, 02, 03" className={inputCls} />
        </Campo>
      </div>

      {problema ? (
        <Erro>{problema}</Erro>
      ) : geracao ? (
        <p className="mt-3 rounded-xl bg-card-2 p-3 text-sm text-tx-2">
          {novas.length && primeira && ultima ? (
            <>
              <b>{contagem(novas.length, 'unidade nova', 'unidades novas')}</b>:{' '}
              {novas.length === 1
                ? rotuloDaUnidade(tipo, primeira.label)
                : `${rotuloDaUnidade(tipo, primeira.label)} a ${rotuloDaUnidade(tipo, ultima.label)}`}
              .
            </>
          ) : (
            'Nenhuma unidade nova.'
          )}
          {geracao.jaExistem.length > 0 && ` ${contagem(geracao.jaExistem.length, 'já existe e fica', 'já existem e ficam')} como está.`}
        </p>
      ) : null}

      {criar.isError && <Erro>{(criar.error as Error).message}</Erro>}
      {criadas !== null && !criar.isPending && (
        <p className="mt-3 rounded-xl bg-ok-soft p-3 text-sm font-semibold text-ok">
          {contagem(criadas, 'unidade criada', 'unidades criadas')}, como vendidas. Na “Tabela do mês”, diga quais estão
          disponíveis e o preço de cada uma.
          {semTabela &&
            ' Até lá, o imóvel fica com a situação que tinha, e o site mostra “Consulte” no lugar do preço, sem a lista de unidades.'}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        {unidades.length > 0 && (
          <button type="button" onClick={() => setAberto(false)} className={botaoSecundario}>
            Fechar
          </button>
        )}
        <button
          type="button"
          disabled={!novas.length || !!problema || criar.isPending}
          onClick={() => criar.mutate(novas, { onSuccess: (n) => setCriadas(n) })}
          className={botaoPrimario}
        >
          {criar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {novas.length ? `Criar ${contagem(novas.length, 'unidade', 'unidades')}` : 'Criar unidades'}
        </button>
      </div>
    </div>
  );
}
