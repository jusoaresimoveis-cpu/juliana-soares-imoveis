/**
 * Perguntas sobre o aparelho, num lugar só.
 *
 * Duas telas dependem destas respostas — instalar o app e ligar o aviso no
 * celular — e elas precisam CONCORDAR. Se cada uma decidir por conta o que é um
 * iPhone e o que é "já instalado", uma manda instalar primeiro enquanto a outra
 * some com o botão de instalar, e o corretor fica preso entre as duas.
 */

/** O modo de exibição de quem foi instalado: janela própria, sem barra de endereço. */
export const MODO_APP = '(display-mode: standalone)';

export function rodandoComoApp(): boolean {
  return (
    window.matchMedia(MODO_APP).matches ||
    // O Safari do iPhone não implementa `display-mode`; sobra esta bandeira
    // antiga, que é a única forma de saber que ele abriu pela tela de início.
    (navigator as { standalone?: boolean }).standalone === true
  );
}

export function ehIOS(): boolean {
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    // iPad moderno se anuncia como Mac — o exemplo de referência olha só o
    // userAgent e por isso trata iPad como desktop, oferecendo um clique que
    // nunca vem. O toque é o que distingue os dois.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}
