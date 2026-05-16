import { Suspense, useEffect } from "react";
import { lazyWithRetry as lazy } from "@/lib/lazyWithRetry";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import AuthPage from "./pages/AuthPage";
import AuthCallback from "./pages/AuthCallback";
import AppLayout from "./components/AppLayout";
import ErrorBoundary from "./components/ErrorBoundary";
import ScrollToTop from "./components/ScrollToTop";
import { useAccessCheck } from "@/hooks/useAccessCheck";

// Lazy load pages so a single failing chunk doesn't blank the app
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Clientes = lazy(() => import("./pages/Clientes"));
const ClientDetail = lazy(() => import("./pages/ClientDetail"));
const Financeiro = lazy(() => import("./pages/Financeiro"));
const Processos = lazy(() => import("./pages/Processos"));
const Estudos = lazy(() => import("./pages/Estudos"));
const Contratos = lazy(() => import("./pages/Contratos"));
const Scripts = lazy(() => import("./pages/Scripts"));
const Objecoes = lazy(() => import("./pages/Objecoes"));
const Planilha = lazy(() => import("./pages/Planilha"));
const PlanilhaTeste = lazy(() => import("./pages/PlanilhaTeste"));
const Tasks = lazy(() => import("./pages/Tasks"));
const UTMGenerator = lazy(() => import("./pages/UTMGenerator"));
const Estrategias = lazy(() => import("./pages/Estrategias"));
const RelatoriosDiarios = lazy(() => import("./pages/RelatoriosDiarios"));
const Configuracoes = lazy(() => import("./pages/Configuracoes"));
const Bloqueado = lazy(() => import("./pages/Bloqueado"));
const NotFound = lazy(() => import("./pages/NotFound"));

function RoutePrefetcher() {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void import("./pages/Dashboard");
      void import("./pages/Clientes");
      void import("./pages/ClientDetail");
      void import("./pages/Financeiro");
      void import("./pages/Processos");
      void import("./pages/Estudos");
      void import("./pages/Contratos");
      void import("./pages/Scripts");
      void import("./pages/Objecoes");
      void import("./pages/Planilha");
      void import("./pages/Tasks");
      void import("./pages/UTMGenerator");
      void import("./pages/Estrategias");
      void import("./pages/Bloqueado");
      void import("./pages/NotFound");
    }, 1200);

    return () => window.clearTimeout(timer);
  }, []);

  return null;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60_000,
      gcTime: 15 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      retry: 1,
    },
  },
});

const PageFallback = () => (
  <div className="min-h-[60vh] p-6 space-y-4 animate-pulse">
    <div className="h-8 w-48 bg-muted/40 rounded" />
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="h-24 bg-muted/30 rounded-xl" />
      <div className="h-24 bg-muted/30 rounded-xl" />
      <div className="h-24 bg-muted/30 rounded-xl" />
      <div className="h-24 bg-muted/30 rounded-xl" />
    </div>
    <div className="h-64 bg-muted/20 rounded-xl" />
  </div>
);

function RouteBoundary({ children }: { children: React.ReactNode }) {
  // No key by route: keeps tree mounted between navigations to avoid flashes.
  // ErrorBoundary will still catch real errors.
  return <ErrorBoundary>{children}</ErrorBoundary>;
}

function ProtectedRoutes() {
  const { user, loading } = useAuth();
  useAccessCheck();
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-background"><div className="text-muted-foreground">Carregando...</div></div>;
  if (!user) return <AuthPage />;
  return (
    <Routes>
      <Route path="/bloqueado" element={<Bloqueado />} />
      <Route path="*" element={
        <AppLayout>
          <RouteBoundary>
            <Suspense fallback={<PageFallback />}>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/clientes" element={<Clientes />} />
                <Route path="/clientes/:id" element={<ClientDetail />} />
                <Route path="/relatorios" element={<RelatoriosDiarios />} />
                <Route path="/financeiro" element={<Financeiro />} />
                <Route path="/calculadora" element={<Navigate to="/financeiro" replace />} />
                <Route path="/processos" element={<Processos />} />
                <Route path="/estudos" element={<Estudos />} />
                <Route path="/contratos" element={<Contratos />} />
                <Route path="/scripts" element={<Scripts />} />
                <Route path="/objecoes" element={<Objecoes />} />
                <Route path="/planilha" element={<Planilha />} />
                <Route path="/planilha-teste" element={<PlanilhaTeste />} />
                <Route path="/tasks" element={<Tasks />} />
                <Route path="/estrategias" element={<Estrategias />} />
                <Route path="/utm" element={<UTMGenerator />} />
                <Route path="/configuracoes" element={<Configuracoes />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </RouteBoundary>
        </AppLayout>
      } />
    </Routes>
  );
}

function ChunkErrorRecovery() {
  useEffect(() => {
    const key = "__chunk_reloaded_at__";
    const isChunkError = (msg?: string) =>
      !!msg && (/Loading chunk \d+ failed|Loading CSS chunk \d+ failed|Failed to fetch dynamically imported module|Importing a module script failed/i.test(msg));
    const isBenignDom = (msg?: string) =>
      !!msg && (/Failed to execute 'removeChild' on 'Node'|Failed to execute 'insertBefore' on 'Node'|The node to be removed is not a child of this node|não é filho deste nó/i.test(msg));
    const reloadIfNeeded = () => {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, String(Date.now()));
      window.location.reload();
    };
    const handler = (event: ErrorEvent) => {
      if (isBenignDom(event.message)) {
        // Suprime erros benignos de DOM (extensões do navegador / race conditions de portals)
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (isChunkError(event.message)) {
        reloadIfNeeded();
      }
    };
    const rejHandler = (event: PromiseRejectionEvent) => {
      const msg = event.reason?.message || String(event.reason || "");
      if (isBenignDom(msg)) {
        event.preventDefault();
        return;
      }
      if (isChunkError(msg)) {
        reloadIfNeeded();
      }
    };
    window.addEventListener("error", handler);
    window.addEventListener("unhandledrejection", rejHandler);
    return () => {
      window.removeEventListener("error", handler);
      window.removeEventListener("unhandledrejection", rejHandler);
    };
  }, []);
  return null;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
        <ChunkErrorRecovery />
        <RoutePrefetcher />
        <ScrollToTop />
        <AuthProvider>
          <Routes>
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/*" element={<ProtectedRoutes />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
