/** O menu do modelo, na mesma ordem. Cabeçalho, menu do celular e rodapé leem daqui. */
export const MENU = [
  { href: '/', rotulo: 'Home' },
  { href: '/venda', rotulo: 'Comprar' },
  { href: '/aluguel', rotulo: 'Alugar' },
  { href: '/cadastrar-imovel', rotulo: 'Cadastrar Imóvel' },
  { href: '/sobre', rotulo: 'Sobre Juliana' },
  { href: '/contato', rotulo: 'Contato' },
] as const;

/** A seção de busca da home. A barra inferior do celular aponta para cá. */
export const ANCORA_DA_BUSCA = '/#busca';
