import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { AppShell } from '@/components/layout/AppShell';
import { MolduraDeErro } from '@/components/Erro';
import { anotar } from '@/lib/rastro';
import Auth, { FullPageLoader } from '@/pages/Auth';

// Uma rota por chunk. Os dois sistemas de referência importam todas as páginas
// de uma vez; aqui cada tela só é baixada quando alguém abre.
const Esqueci = lazy(() => import('@/pages/Senha'));
const Redefinir = lazy(() => import('@/pages/Senha').then((m) => ({ default: m.Redefinir })));
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Leads = lazy(() => import('@/pages/Leads'));
const Properties = lazy(() => import('@/pages/Properties'));
const LeadDetail = lazy(() => import('@/pages/LeadDetail'));
const Agenda = lazy(() => import('@/pages/Agenda'));
const Settings = lazy(() => import('@/pages/Settings'));
const PropertyDetail = lazy(() => import('@/pages/PropertyDetail'));
const Conversas = lazy(() => import('@/pages/Conversas'));
const Anuncios = lazy(() => import('@/pages/Anuncios'));
const Documentos = lazy(() => import('@/pages/Documentos'));
const Inteligencia = lazy(() => import('@/pages/Inteligencia'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * Cada troca de rota vira um passo do rastro.
 *
 * É a metade da história que a pilha não conta. "Quebrou em `Detalhe`" diz onde;
 * "estava na agenda, abriu o lead, clicou em documentos" diz o que fazer para
 * ver acontecer de novo — que é a única coisa que importa às sete da noite.
 */
function Rastreador() {
  const { pathname } = useLocation();
  useEffect(() => {
    anotar('rota', pathname);
  }, [pathname]);
  return null;
}

/**
 * A porta fechada, quando a rota existe mas o cargo não alcança.
 *
 * Dentro do shell de propósito: quem digitou a URL errada continua com o menu
 * e sai dali num toque. Uma página inteira de erro deixaria a pessoa com o
 * botão de voltar do navegador como única saída.
 */
function SemPermissao() {
  return (
    <div className="rounded-lg bg-card p-8 shadow-card">
      <h1 className="text-2xl font-bold">Área restrita</h1>
      <p className="mt-2 max-w-[52ch] text-md text-tx-2">
        Esta área é do administrador da imobiliária. Se você precisa dela, peça a quem administra a
        conta para ajustar o seu perfil.
      </p>
    </div>
  );
}

/**
 * `papel` é o que faltava, e a falta era real.
 *
 * O comentário do menu em `AppShell` dizia que "a rota também é guardada em
 * App" — não era. `Protegida` checava sessão e mais nada, e o filtro do menu
 * procurava uma propriedade `gestao` que nenhum item declarava: código morto
 * fingindo proteção. Qualquer autenticado alcançava qualquer tela digitando o
 * endereço.
 *
 * Isto aqui esconde a tela de quem não deve vê-la. Quem FECHA continua sendo o
 * banco — `e_admin` na função e a RLS na tabela —, porque guard de rota mora no
 * navegador e navegador é território de quem está do outro lado.
 *
 * `loading` cobre o carregamento dos papéis: `AuthProvider` só o desliga depois
 * de `hydrate`. Sem isso, o primeiro quadro teria `roles` vazio e a tela piscaria
 * "área restrita" para o próprio administrador.
 */
function Protegida({ children, papel }: { children: ReactNode; papel?: 'admin' | 'gestao' }) {
  const { user, loading, isAdmin, isAdminOrAbove } = useAuth();
  const location = useLocation();

  if (loading) return <FullPageLoader />;
  if (!user) return <Navigate to="/entrar" state={{ from: location.pathname }} replace />;

  const barrado = papel === 'admin' ? !isAdmin() : papel === 'gestao' ? !isAdminOrAbove() : false;
  if (barrado) {
    return (
      <AppShell>
        <SemPermissao />
      </AppShell>
    );
  }

  // O shell fica AQUI, no roteador — não dentro de cada página. Assim a
  // moldura não remonta a cada navegação, que é metade da sensação de
  // velocidade que o CRM de referência tem e o outro não.
  /*
   * A moldura fica DENTRO do shell, e é de propósito.
   *
   * Assim uma tela que quebra derruba só ela: a barra de baixo e o cabeçalho
   * continuam de pé, e a pessoa sai dali para outra parte do CRM em um toque,
   * em vez de ficar com uma página inteira de erro e o botão de voltar do
   * navegador. Há uma segunda moldura acima do roteador para o que acontecer
   * fora daqui — na landing page e na tela de entrar, que não têm shell.
   */
  return (
    <AppShell>
      <MolduraDeErro>
        <Suspense fallback={<div className="py-20 text-center text-base text-tx-3">Carregando…</div>}>
          {children}
        </Suspense>
      </MolduraDeErro>
    </AppShell>
  );
}

function EmBreve({ titulo }: { titulo: string }) {
  return (
    <div className="rounded-lg bg-card p-8 shadow-card">
      <h1 className="text-2xl font-bold">{titulo}</h1>
      <p className="mt-2 max-w-[52ch] text-md text-tx-2">
        Módulo previsto no roteiro. Ver <code className="rounded bg-card-2 px-1.5 py-0.5">docs/ARQUITETURA.md</code> para
        a ordem de construção.
      </p>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Rastreador />
          <Routes>
            <Route path="/entrar" element={<Auth />} />

            {/*
              As duas metades da recuperação de senha, fora da `Protegida`.
              Quem chega aqui é justamente quem NÃO consegue entrar — exigir
              sessão seria pedir a chave para quem veio dizer que a perdeu.
            */}
            <Route
              path="/esqueci"
              element={
                <Suspense fallback={<FullPageLoader />}>
                  <Esqueci />
                </Suspense>
              }
            />
            <Route
              path="/redefinir"
              element={
                <Suspense fallback={<FullPageLoader />}>
                  <Redefinir />
                </Suspense>
              }
            />

            <Route path="/" element={<Protegida><Dashboard /></Protegida>} />
            <Route path="/leads" element={<Protegida><Leads /></Protegida>} />
            <Route path="/leads/:id" element={<Protegida><LeadDetail /></Protegida>} />
            <Route path="/imoveis" element={<Protegida><Properties /></Protegida>} />
            <Route path="/imoveis/:id" element={<Protegida><PropertyDetail /></Protegida>} />
            <Route path="/conversas" element={<Protegida><Conversas /></Protegida>} />
            <Route path="/agenda" element={<Protegida><Agenda /></Protegida>} />
            <Route path="/anuncios" element={<Protegida><Anuncios /></Protegida>} />
            {/*
              A mesa de decisão de verba. `papel="admin"` de verdade — é a
              primeira rota deste CRM que checa cargo, e a checagem existe
              também no banco (`e_admin`), porque esta aqui é só cortesia.
            */}
            <Route
              path="/inteligencia"
              element={
                <Protegida papel="admin">
                  <Inteligencia />
                </Protegida>
              }
            />
            <Route path="/atribuicao" element={<Protegida><EmBreve titulo="Atribuição" /></Protegida>} />
            <Route path="/automacoes" element={<Protegida><EmBreve titulo="Automações" /></Protegida>} />
            <Route path="/documentos" element={<Protegida><Documentos /></Protegida>} />
            <Route path="/configuracoes" element={<Protegida><Settings /></Protegida>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
