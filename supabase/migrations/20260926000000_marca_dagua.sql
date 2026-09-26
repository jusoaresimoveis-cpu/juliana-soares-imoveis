/*
 * A marca d'água nas fotos dos imóveis (decisão de 26/09).
 *
 * Com a chave ligada, o CRM desenha o símbolo da marca no meio de cada foto
 * antes de subir. As fotos são muitas vezes exclusivas, tiradas pela própria
 * Juliana, e a marca é o que impede outro anunciante de usá-las como suas.
 *
 * É regra da imobiliária inteira, e não preferência de aparelho: a foto sai
 * igual subindo do celular ou do computador, de quem for. Quem muda é quem
 * administra (admin ou gerente), pela política `organizations_write` que já
 * existe; as permissões da tabela já cobrem a coluna nova.
 *
 * Nasce ligada: esquecer de ligar deixaria justamente as primeiras fotos sem
 * marca.
 */

alter table public.organizations
  add column marca_dagua_nas_fotos boolean not null default true;

comment on column public.organizations.marca_dagua_nas_fotos is
  'Liga o símbolo da marca no meio das fotos que o CRM sobe. Vale para a imobiliária inteira; só admin e gerente mudam.';
