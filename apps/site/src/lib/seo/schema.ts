import { PROPERTY_TYPE_LABEL, type PropertyType } from '@juliana/contracts';

import { SITE } from '@/config/site';
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
  if (imovel.finalidades.includes('venda') && imovel.precoVendaCents) {
    ofertas.push({
      '@type': 'Offer',
      businessFunction: 'http://purl.org/goodrelations/v1#Sell',
      availability: disponibilidade,
      price: imovel.precoVendaCents / 100,
      priceCurrency: 'BRL',
    });
  }

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
      // No cadastro, os quartos não contam as suítes: o total é a soma.
      ...((imovel.quartos ?? 0) + (imovel.suites ?? 0) > 0
        ? { numberOfBedrooms: (imovel.quartos ?? 0) + (imovel.suites ?? 0) }
        : {}),
      ...(imovel.banheiros ? { numberOfBathroomsTotal: imovel.banheiros } : {}),
      ...(imovel.areaM2
        ? { floorSize: { '@type': 'QuantitativeValue', value: imovel.areaM2, unitCode: 'MTK' } }
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
