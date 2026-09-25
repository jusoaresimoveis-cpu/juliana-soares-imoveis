import { Component, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, Check, RefreshCw } from 'lucide-react';
import { comentar, enviarRelato, montarRelato, type Relato } from '@/lib/rastro';

/**
 * A moldura de erro, e a tela que ela mostra.
 *
 * Sem isto, um erro durante a renderização desmonta a árvore inteira do React e
 * o que sobra é uma página branca — sem mensagem, sem botão, sem nada em que
 * clicar. A pessoa recarrega, cai no mesmo erro, e o relato que chega é um áudio
 * dizendo "não abre".
 *
 * A tela daqui faz três coisas, nesta ordem de importância: registra o erro
 * sozinha, dá um caminho de volta, e só então pergunta o que a pessoa estava
 * fazendo. A pergunta vem por último porque é a única parte que pode ficar sem
 * resposta e ainda assim deixar o incidente investigável.
 */

interface Estado {
  erro: Error | null;
}

export class MolduraDeErro extends Component<{ children: ReactNode }, Estado> {
  state: Estado = { erro: null };

  static getDerivedStateFromError(erro: Error): Estado {
    return { erro };
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    /*
     * `componentStack` no lugar da pilha do JavaScript quando ela existe.
     *
     * A pilha diz em qual função quebrou; a de componentes diz em qual TELA. Com
     * o código já compilado e sem sourcemap na build de produção, a segunda é a
     * que dá para ler. As duas vão, uma embaixo da outra.
     */
    const pilha = [erro.stack, info.componentStack].filter(Boolean).join('\n---\n');
    console.error('moldura de erro:', erro.message);
    this.setState({ erro: Object.assign(erro, { pilhaCompleta: pilha }) });
  }

  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <TelaDeErro
        erro={this.state.erro}
        recomecar={() => this.setState({ erro: null })}
      />
    );
  }
}

function TelaDeErro({ erro, recomecar }: { erro: Error; recomecar: () => void }) {
  const [id, setId] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const [enviado, setEnviado] = useState(false);

  /*
   * Uma vez por queda, e uma só.
   *
   * Medido no navegador: sem esta trava o relato saía TRÊS vezes na mesma
   * quebra. O `StrictMode` roda o efeito duas vezes de propósito, e o React
   * ainda chama `componentDidCatch` de novo na segunda renderização — o objeto
   * de erro troca de identidade, a dependência muda, e o efeito dispara mais uma
   * vez. Três linhas iguais na tabela para um incidente só, e o número da
   * ocorrência que a pessoa lê na tela não seria o de nenhuma delas.
   */
  const jaFoi = useRef(false);

  /*
   * O relato sai sozinho, assim que a tela aparece.
   *
   * Depender do clique perderia justamente o caso mais comum: a pessoa fecha a
   * aba e conta por WhatsApp três horas depois. O que ela escreve, se escrever,
   * cola na mesma linha pelo id.
   */
  useEffect(() => {
    if (jaFoi.current) return;
    jaFoi.current = true;

    const pilha = (erro as Error & { pilhaCompleta?: string }).pilhaCompleta ?? erro.stack;
    const relato: Relato = montarRelato('tela', erro.message, pilha);
    void enviarRelato(relato).then(setId);
  }, [erro]);

  async function enviarComentario() {
    if (!id || !texto.trim()) return;
    setEnviado(true);
    await comentar(id, texto.trim());
  }

  return (
    <div className="flex min-h-[60svh] items-center justify-center p-4">
      <div className="w-full max-w-[42rem] rounded-lg bg-card p-6 shadow-card sm:p-8">
        <AlertTriangle className="h-8 w-8 text-tx-3" aria-hidden />

        <h1 className="mt-3 text-2xl font-bold">Alguma coisa quebrou nesta tela.</h1>
        <p className="mt-2 max-w-[52ch] text-md text-tx-2">
          O erro foi registrado com a rota, a versão e os últimos passos. Você não
          precisa fazer mais nada — mas se contar o que estava fazendo, fica bem
          mais rápido de corrigir.
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={recomecar}
            className="inline-flex items-center gap-2 rounded-lg bg-pri px-5 py-2.5 text-md font-semibold text-pri-fg hover:bg-pri-deep"
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            Tentar de novo
          </button>
          <button
            type="button"
            /*
             * `assign` e não `href = '/'`: uma navegação de verdade, que
             * remonta o app do zero. Trocar a rota pelo roteador manteria de pé
             * exatamente o estado que acabou de quebrar.
             */
            onClick={() => window.location.assign('/')}
            className="rounded-lg border border-line-2 px-5 py-2.5 text-md font-semibold text-tx-2"
          >
            Ir para o início
          </button>
        </div>

        {enviado ? (
          <p className="mt-6 inline-flex items-center gap-2 text-md text-tx-2">
            <Check className="h-4 w-4" aria-hidden />
            Recebido. Obrigado.
          </p>
        ) : (
          <div className="mt-6">
            <label htmlFor="relato" className="text-md font-semibold">
              O que você estava fazendo?
            </label>
            <textarea
              id="relato"
              rows={3}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Cliquei em salvar o imóvel e a tela sumiu."
              className="mt-2 w-full rounded-md border border-line-2 bg-card-2 px-3 py-2.5 text-md outline-none focus:border-pri"
            />
            <button
              type="button"
              onClick={() => void enviarComentario()}
              /*
               * Desligado enquanto o id não voltou: sem ele o comentário não tem
               * onde colar. Segundos, no pior caso — e é melhor um botão apagado
               * do que um "enviar" que não envia.
               */
              disabled={!id || !texto.trim()}
              className="mt-2 rounded-lg border border-line-2 px-5 py-2.5 text-md font-semibold text-tx-2 disabled:opacity-50"
            >
              Enviar
            </button>
          </div>
        )}

        <p className="mt-6 text-sm text-tx-3">
          Versão {typeof __VERSAO__ === 'undefined' ? 'dev' : __VERSAO__}
          {id ? ` · ocorrência ${id.slice(0, 8)}` : ''}
        </p>
      </div>
    </div>
  );
}
