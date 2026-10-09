import { useState, type KeyboardEvent } from 'react';
import { Check, Plus, Search, X } from 'lucide-react';
import {
  CATEGORIAS_DO_IMOVEL,
  ITENS_DO_IMOVEL,
  LIMITE_DO_TEXTO_LIVRE,
  chaveDeBusca,
  itemCombinaComBusca,
  itemPeloTexto,
  normalizarCaracteristicas,
  tituloDaCategoria,
  type CaracteristicasDoImovel,
  type CategoriaDoImovel,
  type PropertyType,
} from '@contracts';
import { cn } from '@/lib/utils';

interface Props {
  valor: CaracteristicasDoImovel;
  onMudar: (valor: CaracteristicasDoImovel) => void;
  /** O tipo dá o título da unidade: "Apartamento", "Casa". */
  tipo: PropertyType;
}

const EXPLICACAO: Record<CategoriaDoImovel, string> = {
  unidade: 'O que é da unidade anunciada, e não do condomínio.',
  empreendimento: 'Estrutura, segurança e serviços do condomínio.',
  lazer: 'O que o condomínio oferece para lazer, esporte e convivência.',
  adicionais: 'O que não cabe nas listas acima. Aparece no site como está escrito.',
};

/**
 * A aba "Sobre o imóvel": os itens prontos para marcar, por categoria, e um
 * campo em cada uma para digitar o que não estiver na lista.
 *
 * A lista é longa de propósito (o campo livre cobre o resto), então a busca
 * de cima filtra as três categorias ao mesmo tempo.
 */
export function SobreOImovel({ valor, onMudar, tipo }: Props) {
  const [busca, setBusca] = useState('');
  const chave = chaveDeBusca(busca);

  const alternar = (categoria: Exclude<CategoriaDoImovel, 'adicionais'>, id: string) => {
    const atuais = valor[categoria]?.itens ?? [];
    const itens = atuais.includes(id) ? atuais.filter((x) => x !== id) : [...atuais, id];
    onMudar(normalizarCaracteristicas({ ...valor, [categoria]: { ...valor[categoria], itens } }));
  };

  /*
   * O texto digitado que é um item da lista (ou um sinônimo dele) marca o
   * quadradinho, em vez de virar um item repetido. Devolve os itens marcados
   * assim, para a tela dizer qual foi.
   */
  const acrescentar = (categoria: CategoriaDoImovel, texto: string): string[] => {
    const partes = dividir(categoria, texto);
    if (!partes.length) return [];
    const marcadosPeloTexto: string[] = [];
    const atual = valor[categoria] ?? {};
    const itens = [...(atual.itens ?? [])];
    const outros = [...(atual.outros ?? [])];
    for (const parte of partes) {
      const item = categoria !== 'adicionais' ? itemPeloTexto(categoria, parte) : undefined;
      if (item) {
        if (!itens.includes(item.id)) itens.push(item.id);
        marcadosPeloTexto.push(item.rotulo);
      } else {
        outros.push(parte);
      }
    }
    onMudar(normalizarCaracteristicas({ ...valor, [categoria]: { itens, outros } }));
    return marcadosPeloTexto;
  };

  const tirarOutro = (categoria: CategoriaDoImovel, texto: string) => {
    const atual = valor[categoria] ?? {};
    onMudar(
      normalizarCaracteristicas({ ...valor, [categoria]: { ...atual, outros: (atual.outros ?? []).filter((t) => t !== texto) } }),
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tx-3" />
        <span className="sr-only">Procurar item</span>
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          // A busca mora dentro do formulário: Enter aqui salvaria o imóvel.
          onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
          placeholder="Procurar item (ex.: piscina, box de praia, porcelanato)"
          className="w-full rounded-xl border border-line-2 bg-card py-2.5 pl-9 pr-3 text-md outline-none transition-colors focus:border-pri"
        />
      </label>

      {CATEGORIAS_DO_IMOVEL.map((categoria) => {
        const marcados = valor[categoria];
        const total = (marcados?.itens?.length ?? 0) + (marcados?.outros?.length ?? 0);
        const grupos =
          categoria === 'adicionais'
            ? []
            : ITENS_DO_IMOVEL[categoria]
                .map((g) => ({ ...g, itens: g.itens.filter((i) => itemCombinaComBusca(i, busca)) }))
                .filter((g) => g.itens.length > 0);
        const outros = marcados?.outros ?? [];
        // Com busca, a categoria sem nada que combine fica de fora; a de texto livre, só se não tiver nada.
        if (chave && !grupos.length && !outros.some((t) => ` ${chaveDeBusca(t)}`.includes(` ${chave}`))) return null;

        return (
          // Com nome, a categoria diz ao leitor de tela de quem é o quadradinho:
          // "Câmeras de segurança" existe na unidade e no empreendimento.
          <section key={categoria} aria-labelledby={`sobre-${categoria}`} className="rounded-xl border border-line bg-card p-4">
            <header className="mb-3 flex items-baseline justify-between gap-3">
              <div>
                <h3 id={`sobre-${categoria}`} className="text-md font-bold uppercase text-tx">
                  {tituloDaCategoria(categoria, tipo)}
                </h3>
                <p className="text-sm text-tx-3">{EXPLICACAO[categoria]}</p>
              </div>
              {total > 0 && (
                <span className="shrink-0 rounded-full bg-pri-soft px-2.5 py-0.5 text-sm font-semibold text-pri">
                  {total} {total === 1 ? 'item' : 'itens'}
                </span>
              )}
            </header>

            {categoria !== 'adicionais' && (
              <div className="flex flex-col gap-3">
                {grupos.map((g) => (
                  <div key={g.grupo} role="group" aria-label={`${g.grupo} (${tituloDaCategoria(categoria, tipo).toLowerCase()})`}>
                    <p className="mb-1.5 text-sm font-semibold text-tx-2">{g.grupo}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {g.itens.map((item) => {
                        const ativo = marcados?.itens?.includes(item.id) ?? false;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            role="checkbox"
                            aria-checked={ativo}
                            onClick={() => alternar(categoria, item.id)}
                            className={cn(
                              'inline-flex items-center gap-1.5 rounded-full border py-1.5 pl-2 pr-3 text-sm font-semibold transition-colors',
                              ativo
                                ? 'border-pri bg-pri text-pri-fg'
                                : 'border-line-2 bg-card text-tx-2 hover:border-pri-light hover:text-tx',
                            )}
                          >
                            {/* O quadradinho: marcado mostra o visto. */}
                            <span
                              aria-hidden
                              className={cn(
                                'grid h-4 w-4 place-items-center rounded border',
                                ativo ? 'border-pri-fg/60 bg-pri-fg/15' : 'border-line-2 bg-card-2',
                              )}
                            >
                              {ativo && <Check className="h-3 w-3" strokeWidth={3} />}
                            </span>
                            {item.rotulo}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Outros
              categoria={categoria}
              outros={outros}
              titulo={categoria === 'adicionais' ? 'Informação' : `Outro item (${tituloDaCategoria(categoria, tipo).toLowerCase()})`}
              onAcrescentar={(texto) => acrescentar(categoria, texto)}
              onTirar={(texto) => tirarOutro(categoria, texto)}
            />
          </section>
        );
      })}
    </div>
  );
}

function Outros({
  categoria,
  outros,
  titulo,
  onAcrescentar,
  onTirar,
}: {
  categoria: CategoriaDoImovel;
  outros: string[];
  titulo: string;
  onAcrescentar: (texto: string) => string[];
  onTirar: (texto: string) => void;
}) {
  const [texto, setTexto] = useState('');
  const [marcou, setMarcou] = useState<string[]>([]);
  const confirmar = () => {
    if (!texto.trim()) return;
    setMarcou(onAcrescentar(texto));
    setTexto('');
  };
  // Enter aqui acrescenta o item; sem isto ele enviaria o formulário inteiro.
  const aoTeclar = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      confirmar();
    }
  };

  return (
    <div className={cn(categoria !== 'adicionais' && 'mt-3 border-t border-line pt-3')}>
      {outros.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {outros.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 rounded-full border border-pri bg-pri py-1.5 pl-3 pr-1.5 text-sm font-semibold text-pri-fg"
            >
              {t}
              <button
                type="button"
                onClick={() => onTirar(t)}
                aria-label={`Tirar ${t}`}
                title="Tirar"
                className="grid h-5 w-5 place-items-center rounded-full hover:bg-pri-fg/20"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <label className="flex-1">
          <span className="sr-only">{titulo}</span>
          <input
            value={texto}
            maxLength={LIMITE_DO_TEXTO_LIVRE * 4}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={aoTeclar}
            // Digitou e foi salvar, trocar de aba ou buscar sem clicar em
            // Adicionar: o texto entra assim mesmo, em vez de sumir.
            onBlur={confirmar}
            placeholder={
              categoria === 'adicionais' ? 'Ex.: Escriturado e com habite-se' : 'Não achou na lista? Digite aqui (vírgula separa)'
            }
            className="w-full rounded-xl border border-line-2 bg-card px-3 py-2 text-md outline-none transition-colors focus:border-pri"
          />
        </label>
        <button
          type="button"
          onClick={confirmar}
          disabled={!texto.trim()}
          className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-line-2 bg-card px-3 text-sm font-semibold text-tx-2 hover:border-pri hover:text-pri disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Adicionar
        </button>
      </div>
      {marcou.length > 0 && (
        <p role="status" className="mt-1.5 text-sm text-tx-3">
          Já está na lista: marcado {marcou.join(', ')}.
        </p>
      )}
    </div>
  );
}

/**
 * Os itens de um texto digitado. Nas categorias com lista, vírgula (fora de
 * número: "R$ 1.500,00" e "12,5 m" ficam inteiros), ponto e vírgula e quebra
 * de linha separam vários de uma vez. Em "Informações adicionais", que é
 * frase, o texto vai inteiro.
 */
export function dividir(categoria: CategoriaDoImovel, texto: string): string[] {
  if (categoria === 'adicionais') return texto.trim() ? [texto.trim()] : [];
  // Sem lookbehind: o Safari antigo do iPhone não abriria o CRM.
  return texto
    .replace(/(\d),(\d)/g, '$1\u0000$2')
    .split(/[,;\n]/)
    .map((parte) => parte.replaceAll('\u0000', ',').trim())
    .filter(Boolean);
}
