/**
 * O `initdb` do Postgres nativo no Windows não roda de uma pasta com acento no
 * caminho, e a deste projeto tem "Imóveis". Em vez de um erro que não diz nada
 * ("init script exited with code 1"), a instrução do que fazer.
 */
export function exigirCaminhoSemAcento(pasta) {
  if (/^[\x20-\x7e]*$/.test(pasta)) return;
  console.error(
    [
      `Esta pasta tem acento no caminho, e o Postgres nativo não roda daqui:`,
      `  ${pasta}`,
      ``,
      `Copie a pasta ferramentas/banco para um caminho sem acento e rode de lá,`,
      `passando as pastas do repositório. Por exemplo, no PowerShell:`,
      ``,
      `  Copy-Item -Recurse ferramentas\\banco $env:TEMP\\juliana-banco -Exclude node_modules`,
      `  cd $env:TEMP\\juliana-banco; npm install`,
      `  node rls-local.mjs "<repositório>\\supabase\\migrations" "<repositório>\\apps\\crm"`,
    ].join('\n'),
  );
  process.exit(2);
}
