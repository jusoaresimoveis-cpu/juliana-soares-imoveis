import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { MolduraDeErro } from './components/Erro';
import { instalarCaptura } from './lib/rastro';
import './index.css';

/**
 * A captura entra ANTES de qualquer coisa renderizar.
 *
 * Um erro no `AuthProvider` ou na leitura das variáveis de ambiente acontece
 * antes do primeiro componente existir. Instalada aqui, ela pega até isso — que
 * é o erro que mais se parece com "o app não abre" e o que menos deixa pista.
 */
instalarCaptura();

/**
 * Registra o service worker e procura versão nova de minuto em minuto.
 *
 * O perfil de uso pede isso: o corretor deixa o CRM aberto o dia inteiro e
 * raramente recarrega. Sem a verificação periódica, uma correção publicada de
 * manhã só chega ao aparelho dele quando fechar todas as abas — o que pode não
 * acontecer na semana.
 */
registerSW({
  immediate: true,
  onRegisteredSW(_url, registro) {
    if (!registro) return;
    setInterval(() => void registro.update().catch(() => {}), 60_000);
  },
});

const root = document.getElementById('root');
if (!root) throw new Error('Elemento #root não encontrado no index.html');

/*
 * A moldura de fora fica acima de TODOS os provedores.
 *
 * A de dentro, no `App`, preserva o shell quando uma tela quebra. Esta aqui
 * existe para o que quebra antes de haver shell: o provedor de sessão, o
 * roteador, a landing page. Sem ela, esses casos continuam sendo página branca —
 * que é exatamente o problema que este par de molduras veio resolver.
 */
createRoot(root).render(
  <StrictMode>
    <MolduraDeErro>
      <App />
    </MolduraDeErro>
  </StrictMode>,
);
