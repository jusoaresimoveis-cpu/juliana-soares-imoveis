import type { Metadata } from 'next';

import { Migalhas } from '@/components/Migalhas';
import { SITE } from '@/config/site';

export const metadata: Metadata = {
  title: 'Política de privacidade',
  description: `Como a ${SITE.nome} usa dados pessoais no site, no WhatsApp e nos anúncios, e como pedir a exclusão dos seus.`,
  alternates: { canonical: '/politica-de-privacidade' },
};

/**
 * A política de privacidade, escrita a partir do que o site e o CRM FAZEM.
 *
 * Cada frase tem lastro no código: sem cookie nem pixel no site, favoritos e o
 * controle de visita no navegador (`lib/favoritos.ts`, `ContadorDeVisita`), a
 * contagem por imóvel sem quem visitou (`/api/visita`), o widget da Trustindex,
 * o WhatsApp que só registra conversa com prova de origem, e as conversões que
 * voltam para a Meta com telefone e e-mail em hash (`meta-conversoes`). Mudou
 * o que o sistema faz, muda aqui.
 *
 * `#exclusao` é o endereço das instruções de exclusão de dados no app da Meta.
 */
export default function Page() {
  const { endereco } = SITE;
  const contato = (
    <>
      pelo WhatsApp{' '}
      <a href={`https://wa.me/${SITE.whatsapp}`} target="_blank" rel="noopener" className="text-bronze hover:underline">
        {SITE.telefone.exibicao}
      </a>{' '}
      ou pelo e-mail{' '}
      <a href={`mailto:${SITE.email}`} className="text-bronze hover:underline">
        {SITE.email}
      </a>
    </>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8 lg:py-12">
      <Migalhas itens={[{ nome: 'Política de privacidade', caminho: '/politica-de-privacidade' }]} />

      <header className="space-y-3">
        <h1 className="font-serif text-3xl leading-tight sm:text-4xl">Política de privacidade</h1>
        <p className="text-sm text-suave">Atualizada em 28 de setembro de 2026.</p>
        <p className="text-lg text-suave">
          Quais dados pessoais a {SITE.nome} usa, para quê, e como você pode ver, corrigir ou apagar os seus. Vale
          para este site, para o atendimento pelo WhatsApp e para os formulários dos anúncios no Facebook e no
          Instagram.
        </p>
      </header>

      <div className="space-y-8 leading-relaxed [&_h2]:mb-3 [&_h2]:font-serif [&_h2]:text-2xl [&_li]:mt-1.5 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5">
        <section>
          <h2>Quem cuida dos seus dados</h2>
          <p>
            {SITE.nome}, {SITE.creci}, {endereco.logradouro}, {endereco.complemento}, {endereco.bairro},{' '}
            {endereco.cidade} - {endereco.uf}. Para qualquer assunto de privacidade, fale {contato}.
          </p>
        </section>

        <section>
          <h2>O que o site guarda</h2>
          <ul>
            <li>
              Este site não usa cookies nem ferramentas de anúncio ou de estatística que acompanham você de um site para
              outro.
            </li>
            <li>
              <b>Favoritos:</b> os imóveis que você marca ficam guardados só no seu aparelho, no próprio navegador. Eles
              não chegam até nós.
            </li>
            <li>
              <b>Visitas aos imóveis:</b> quando você abre a página de um imóvel, somamos uma visita àquele imóvel no dia.
              Não guardamos quem visitou. Para não contar a mesma pessoa duas vezes, o seu navegador guarda uma anotação
              dos imóveis vistos no dia.
            </li>
            <li>
              <b>Hospedagem:</b> como em qualquer site, o servidor registra dados técnicos do acesso, como o endereço IP e
              o navegador, para segurança e funcionamento.
            </li>
            <li>
              <b>Avaliações:</b> a seção de depoimentos mostra as avaliações do Google por meio da Trustindex, que carrega
              o próprio conteúdo e segue a política de privacidade dela.
            </li>
          </ul>
        </section>

        <section>
          <h2>Quando você fala com a Juliana</h2>
          <p>
            Os botões do site abrem o WhatsApp com uma mensagem pronta e um código de referência do imóvel ou da página.
            Também dá para falar por telefone, pelo Instagram ou preenchendo um formulário de anúncio no Facebook ou no
            Instagram.
          </p>
          <p className="mt-3">
            Desses contatos, o nosso sistema de atendimento guarda: nome, telefone, e-mail (quando você informa), as
            mensagens e respostas enviadas, o imóvel de interesse, as visitas agendadas e de qual anúncio ou página o
            contato veio. De quem confia um imóvel à Juliana, guardamos também nome, cidade, telefone e os dados do
            imóvel.
          </p>
          <p className="mt-3">
            O WhatsApp da Juliana também é pessoal. Por isso, só entram no sistema de atendimento as conversas que
            começam pelos botões deste site ou pelos anúncios dela.
          </p>
        </section>

        <section>
          <h2>Para que usamos</h2>
          <ul>
            <li>Responder ao seu contato e apresentar imóveis.</li>
            <li>Agendar visitas, negociar e preparar contratos.</li>
            <li>Saber quais anúncios trazem contatos e mostrar os anúncios a pessoas com interesse parecido.</li>
          </ul>
          <p className="mt-3">Não vendemos nem alugamos os seus dados.</p>
        </section>

        <section>
          <h2>Anúncios no Facebook e no Instagram</h2>
          <p>
            Se você chegou por um anúncio, o sistema de atendimento avisa a Meta quando o contato avança, por exemplo
            quando uma visita é marcada. O telefone e o e-mail vão codificados de forma irreversível (hash), e servem só
            para a Meta medir o resultado dos anúncios.
          </p>
        </section>

        <section>
          <h2>Com quem os dados são compartilhados</h2>
          <p>Só com os serviços que fazem o site e o atendimento funcionarem, e só no necessário:</p>
          <ul className="mt-2">
            <li>Vercel: hospedagem do site e do sistema de atendimento.</li>
            <li>Supabase: banco de dados e arquivos, com servidores em São Paulo.</li>
            <li>Meta (Facebook, Instagram e WhatsApp): quando você fala conosco por lá ou chega por um anúncio.</li>
            <li>O serviço que conecta o WhatsApp ao sistema de atendimento.</li>
            <li>Trustindex: as avaliações do Google no site.</li>
          </ul>
          <p className="mt-3">
            Alguns desses serviços têm servidores fora do Brasil, e a transferência segue as regras da LGPD. Os dados
            também podem ir para as partes de uma negociação, no que for preciso para fechá-la, e para autoridades,
            quando a lei exigir.
          </p>
        </section>

        <section>
          <h2>Base legal</h2>
          <p>
            Pela Lei Geral de Proteção de Dados (Lei 13.709/2018), usamos os seus dados para atender o seu pedido e as
            etapas de um contrato (art. 7º, V), para cumprir obrigações legais e profissionais (art. 7º, II), com o seu
            consentimento nos formulários de anúncio (art. 7º, I) e no legítimo interesse de medir os anúncios (art. 7º,
            IX).
          </p>
        </section>

        <section>
          <h2>Por quanto tempo</h2>
          <p>
            Enquanto houver atendimento ou negócio em andamento e, depois, pelo prazo que a lei exigir para contratos e
            registros profissionais. Você pode pedir a exclusão antes disso.
          </p>
        </section>

        <section>
          <h2>Seus direitos</h2>
          <p>
            Você pode pedir a qualquer momento a confirmação de que tratamos os seus dados, o acesso a eles, a correção,
            a exclusão, a portabilidade, a lista de com quem foram compartilhados e a revogação do consentimento.
            Respondemos em até 15 dias.
          </p>
        </section>

        <section id="exclusao">
          <h2>Como pedir a exclusão dos seus dados</h2>
          <ol>
            <li>Mande o pedido &quot;Excluir meus dados&quot; {contato}.</li>
            <li>Informe o nome e o telefone ou e-mail que você usou no contato, para encontrarmos o seu cadastro.</li>
            <li>
              Em até 15 dias, apagamos os seus dados do sistema de atendimento e avisamos você. Fica guardado só o que a
              lei obriga, pelo prazo que ela exige.
            </li>
          </ol>
        </section>

        <section>
          <h2>Segurança</h2>
          <p>
            O sistema de atendimento só abre com login, os dados trafegam criptografados e as chaves de acesso às
            contas ficam guardadas em cofre.
          </p>
        </section>

        <section>
          <h2>Mudanças nesta política</h2>
          <p>Quando algo mudar, esta página é atualizada e a data do topo muda junto.</p>
        </section>
      </div>
    </div>
  );
}
