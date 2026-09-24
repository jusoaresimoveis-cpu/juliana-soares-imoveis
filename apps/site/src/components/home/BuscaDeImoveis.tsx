'use client';

import { cidadePeloSlug, type FinalidadeDoSite } from '@juliana/contracts';
import { ChevronDown, House, KeyRound, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';

import type { OpcoesDaBusca } from '@/lib/imoveis/busca';
import { urlDaListagem } from '@/lib/imoveis/listagem';
import { FAIXAS_DE_PRECO } from '@/lib/imoveis/preco';

const ABAS: { finalidade: FinalidadeDoSite; rotulo: string; Icone: typeof House }[] = [
  { finalidade: 'venda', rotulo: 'Comprar', Icone: House },
  { finalidade: 'aluguel', rotulo: 'Alugar', Icone: KeyRound },
];

/**
 * A busca do modelo: Comprar ou Alugar, cidade, bairro e faixa de preço.
 *
 * Não tem resultado próprio: monta a URL da listagem (a mesma que o Google
 * indexa) e navega para ela. A faixa de preço vai como `?preco=`.
 */
export function BuscaDeImoveis({ opcoes }: { opcoes: OpcoesDaBusca }) {
  const router = useRouter();
  const id = useId();
  const [finalidade, setFinalidade] = useState<FinalidadeDoSite>('venda');
  const [cidade, setCidade] = useState('');
  const [bairro, setBairro] = useState('');
  const [preco, setPreco] = useState('');

  const bairros = cidade ? (opcoes.bairros[finalidade][cidade] ?? []) : [];

  function trocarFinalidade(nova: FinalidadeDoSite) {
    setFinalidade(nova);
    // Bairro e faixa dependem da finalidade: aluguel e venda têm outros bairros
    // com imóvel e outra escala de preço.
    setBairro('');
    setPreco('');
  }

  function buscar(evento: FormEvent) {
    evento.preventDefault();
    const cidadeEscolhida = cidadePeloSlug(cidade);
    const url = urlDaListagem({
      finalidade,
      cidade: cidadeEscolhida,
      bairro: cidadeEscolhida && bairro ? bairro : null,
    });
    router.push(preco ? `${url}?preco=${preco}` : url);
  }

  const campo =
    'w-full appearance-none rounded-md border border-linha bg-white py-3 pr-10 pl-3 text-sm text-tinta disabled:bg-creme disabled:text-suave';

  return (
    <div id="busca" className="relative z-10 mx-auto -mt-20 max-w-5xl px-4 lg:px-8">
      <div role="group" aria-label="O que você procura" className="flex">
        {ABAS.map(({ finalidade: valor, rotulo, Icone }) => (
          <button
            key={valor}
            type="button"
            onClick={() => trocarFinalidade(valor)}
            aria-pressed={finalidade === valor}
            className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-t-lg border-b-2 border-transparent bg-white/85 px-6 text-sm font-medium text-suave transition aria-pressed:border-bronze aria-pressed:bg-white aria-pressed:text-tinta sm:flex-none"
          >
            <Icone aria-hidden className="size-4" />
            {rotulo}
          </button>
        ))}
      </div>

      <form
        onSubmit={buscar}
        className="grid gap-4 rounded-b-lg rounded-tr-lg bg-white p-4 shadow-xl shadow-tinta/10 sm:p-6 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end"
      >
        <div>
          <label htmlFor={`${id}-cidade`} className="mb-1.5 block text-xs font-medium text-suave">
            Cidade
          </label>
          <div className="relative">
            <select
              id={`${id}-cidade`}
              value={cidade}
              onChange={(evento) => {
                setCidade(evento.target.value);
                setBairro('');
              }}
              className={campo}
            >
              <option value="">Todas as cidades</option>
              {opcoes.cidades.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.nome}
                </option>
              ))}
            </select>
            <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-suave" />
          </div>
        </div>

        <div>
          <label htmlFor={`${id}-bairro`} className="mb-1.5 block text-xs font-medium text-suave">
            Bairro
          </label>
          <div className="relative">
            <select
              id={`${id}-bairro`}
              value={bairro}
              onChange={(evento) => setBairro(evento.target.value)}
              disabled={!cidade || bairros.length === 0}
              className={campo}
            >
              <option value="">
                {!cidade ? 'Escolha a cidade primeiro' : bairros.length === 0 ? 'Nenhum bairro com imóvel' : 'Todos os bairros'}
              </option>
              {bairros.map((b) => (
                <option key={b.slug} value={b.slug}>
                  {b.nome}
                </option>
              ))}
            </select>
            <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-suave" />
          </div>
        </div>

        <div>
          <label htmlFor={`${id}-preco`} className="mb-1.5 block text-xs font-medium text-suave">
            Faixa de preço
          </label>
          <div className="relative">
            <select id={`${id}-preco`} value={preco} onChange={(evento) => setPreco(evento.target.value)} className={campo}>
              <option value="">Qualquer valor</option>
              {FAIXAS_DE_PRECO[finalidade].map((faixa) => (
                <option key={faixa.valor} value={faixa.valor}>
                  {faixa.rotulo}
                  {finalidade === 'aluguel' ? ' /mês' : ''}
                </option>
              ))}
            </select>
            <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-suave" />
          </div>
        </div>

        <button
          type="submit"
          className="flex min-h-12 items-center justify-center gap-2 rounded-md bg-grafite px-8 text-sm font-semibold text-white transition-colors hover:bg-grafite-claro"
        >
          <Search aria-hidden className="size-4" />
          Buscar
        </button>
      </form>
    </div>
  );
}
