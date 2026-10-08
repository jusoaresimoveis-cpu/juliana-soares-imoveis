import { PROPERTY_TYPE_LABEL, caracteristicasParaMostrar, type PropertyType } from '@juliana/contracts';

import { SITE } from '@/config/site';
import { dormitoriosDoImovel, numerosDasPlantas, plantasAVenda, precosDisponiveis } from '@/lib/imoveis/empreendimento';
import { STATUS_NA_VITRINE, type Imovel } from '@/lib/imoveis/tipos';

/**
 * Dados estruturados (schema.org) — o que o Google lê além do texto.
 *
 * A corretora tem um `@id` fixo, e todo imóvel aponta para ele. É assim que o
 * Google liga os anúncios à mesma pessoa do Perfil da Empresa e do Instagram,
 * e não à outra "Juliana" da cidade.
 */

const ID_DA_CORRETORA = `${SITE.url}/#corretora`;

type Schema = Record<string, unknown>;

export function schemaDaCorretora(): Schema {
  return {
    '@context': 'https://schema.org',
    '@type': 'RealEstateAgent',
    '@id': ID_DA_CORRETORA,
    name: SITE.nome,
    description: SITE.descricao,
    url: SITE.url,
    telephone: SITE.telefone.e164,
    address: {
      '@type': 'PostalAddress',
      streetAddress: `${SITE.endereco.logradouro} - ${SITE.endereco.complemento}`,
      addressLocality: SITE.endereco.cidade,
      addressRegion: SITE.endereco.uf,
      addressCountry: 'BR',
    },
    areaServed: SITE.areaAtendida.map((cidade) => ({
      '@type': 'City',
      name: `${cidade.nome}, ${cidade.uf}`,
    })),
    sameAs: [SITE.redes.instagram],
  };
}

/** O tipo schema.org mais próximo de cada tipo do CRM. */
function tipoNoSchema(tipo: PropertyType): string {
  switch (tipo) {
    case 'apartamento':
    case 'cobertura':
    case 'studio':
    case 'kitnet':
      return 'Apartment';
    case 'casa':
    case 'casa_condominio':
      return 'House';
    default:
      return 'Place';
  }
}

/** Um número só vira `value`; vários, `minValue` e `maxValue` (a área das plantas, "65 a 90 m²"). */
function faixaNoSchema(valores: readonly number[]): Schema {
  const menor = Math.min(...valores);
  const maior = Math.max(...valores);
  return menor === maior
    ? { '@type': 'QuantitativeValue', value: menor }
    : { '@type': 'QuantitativeValue', minValue: menor, maxValue: maior };
}

/**
 * O empreendimento é uma oferta com várias unidades: `AggregateOffer`, do menor
 * ao maior preço entre as DISPONÍVEIS. Sem a tabela do mês, a oferta sai sem
 * preço: o site mostra "Consulte", e o Google não pode ler um preço vencido.
 * Sem disponível (só reservadas, suspenso), sem preço e sem `offerCount`: a
 * reservada não chega com preço e não é oferta, e a contagem é `units_available`.
 */
function ofertaDoEmpreendimento(imovel: Imovel, disponibilidade: string): Schema {
  const precos = precosDisponiveis(imovel);
  const unidades = imovel.empreendimento?.unidadesDisponiveis ?? 0;
  return {
    '@type': 'AggregateOffer',
    businessFunction: 'http://purl.org/goodrelations/v1#Sell',
    availability: disponibilidade,
    ...(unidades > 0 ? { offerCount: unidades } : {}),
    ...(precos.length
      ? { lowPrice: Math.min(...precos) / 100, highPrice: Math.max(...precos) / 100, priceCurrency: 'BRL' }
      : {}),
  };
}

export function schemaDoImovel(imovel: Imovel, url: string): Schema {
  const disponibilidade = STATUS_NA_VITRINE.includes(imovel.status)
    ? 'https://schema.org/InStock'
    : 'https://schema.org/SoldOut';

  const ofertas: Schema[] = [];
  if (imovel.finalidades.includes('aluguel') && imovel.aluguelCents) {
    ofertas.push({
      '@type': 'Offer',
      businessFunction: 'http://purl.org/goodrelations/v1#LeaseOut',
      availability: disponibilidade,
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price: imovel.aluguelCents / 100,
        priceCurrency: 'BRL',
        unitCode: 'MON',
      },
    });
  }
  if (imovel.empreendimento) {
    ofertas.push(ofertaDoEmpreendimento(imovel, disponibilidade));
  } else if (imovel.finalidades.includes('venda') && imovel.precoVendaCents) {
    ofertas.push({
      '@type': 'Offer',
      businessFunction: 'http://purl.org/goodrelations/v1#Sell',
      availability: disponibilidade,
      price: imovel.precoVendaCents / 100,
      priceCurrency: 'BRL',
    });
  }

  // O que a unidade, o condomínio e o lazer têm, como "comodidades" do schema.org.
  // As informações adicionais ficam de fora: são texto livre, não comodidade.
  const comodidades = caracteristicasParaMostrar(imovel.caracteristicas, imovel.tipo)
    .filter((categoria) => categoria.categoria !== 'adicionais')
    .flatMap((categoria) => categoria.itens);

  // No cadastro, os quartos não contam as suítes: o total é a soma. No
  // empreendimento, a faixa das plantas à venda ("2 ou 3 dormitórios").
  const dormitorios = [...new Set(dormitoriosDoImovel(imovel))];
  const plantas = plantasAVenda(imovel);
  const dasPlantas = plantas.length > 0 ? numerosDasPlantas(plantas) : null;
  const areas = dasPlantas ? dasPlantas.areas : imovel.areaM2 ? [imovel.areaM2] : [];
  const banheiros = [...new Set(dasPlantas ? dasPlantas.banheiros : imovel.banheiros ? [imovel.banheiros] : [])];

  return {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    name: imovel.titulo,
    description: imovel.descricao,
    url,
    image: imovel.fotos.map((foto) => foto.url),
    dateModified: imovel.atualizadoEm,
    offers: ofertas.map((oferta) => ({ ...oferta, seller: { '@id': ID_DA_CORRETORA } })),
    about: {
      '@type': tipoNoSchema(imovel.tipo),
      name: PROPERTY_TYPE_LABEL[imovel.tipo],
      ...(dormitorios.length === 1 ? { numberOfBedrooms: dormitorios[0] } : {}),
      ...(dormitorios.length > 1 ? { numberOfBedrooms: faixaNoSchema(dormitorios) } : {}),
      // O schema.org só aceita um número inteiro aqui: com plantas diferentes, fica de fora.
      ...(banheiros.length === 1 ? { numberOfBathroomsTotal: banheiros[0] } : {}),
      ...(areas.length ? { floorSize: { ...faixaNoSchema(areas), unitCode: 'MTK' } } : {}),
      ...(comodidades.length
        ? {
            amenityFeature: comodidades.map((nome) => ({
              '@type': 'LocationFeatureSpecification',
              name: nome,
              value: true,
            })),
          }
        : {}),
      address: {
        '@type': 'PostalAddress',
        // Só bairro e cidade: o endereço exato é decisão do corretor, imóvel a imóvel.
        ...(imovel.bairro ? { streetAddress: imovel.bairro } : {}),
        ...(imovel.cidade ? { addressLocality: imovel.cidade } : {}),
        addressRegion: 'SC',
        addressCountry: 'BR',
      },
    },
  };
}

export interface Migalha {
  nome: string;
  /** Caminho a partir da raiz: "/aluguel". */
  caminho: string;
}

export function schemaDasMigalhas(migalhas: readonly Migalha[]): Schema {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: migalhas.map((migalha, indice) => ({
      '@type': 'ListItem',
      position: indice + 1,
      name: migalha.nome,
      item: `${SITE.url}${migalha.caminho}`,
    })),
  };
}
