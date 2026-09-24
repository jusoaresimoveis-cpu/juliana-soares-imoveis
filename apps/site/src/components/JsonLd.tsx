/**
 * Dados estruturados na página.
 *
 * O `<` vira `<` porque título e descrição do imóvel são digitados no CRM:
 * um "</script>" dentro do texto fecharia a tag e abriria espaço para injetar
 * código na página.
 */
export function JsonLd({ dados }: { dados: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(dados).replace(/</g, '\\u003c') }}
    />
  );
}
