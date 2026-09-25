// Trechos das migrations do Igor que são DADO da HV (e falham num banco
// vazio). Cada ajuste tira só o bloco de dados; a estrutura fica.
const semBloco = (inicio, fim) => (sql) => {
  const a = sql.indexOf(inicio);
  const b = sql.indexOf(fim, a);
  if (a < 0 || b < 0) throw new Error(`bloco não encontrado: ${inicio}`);
  return sql.slice(0, a) + '/* dado da HV removido */' + sql.slice(b + fim.length);
};

export const AJUSTES = {
  // Lança 3 conversas da conta de anúncio da HV.
  '20260826180000_114_o_que_a_meta_contou_e_o_crm_nao_viu.sql': semBloco('do $reconciliar$', 'end $reconciliar$;'),
};
