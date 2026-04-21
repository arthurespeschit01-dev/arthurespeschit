import { lazy, Suspense, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import AuthPage from "./pages/AuthPage";
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
const Tasks = lazy(() => import("./pages/Tasks"));
const UTMGenerator = lazy(() => import("./pages/UTMGenerator"));
const Estrategias = lazy(() => import("./pages/Estrategias"));
const Bloqueado = lazy(() => import("./pages/Bloqueado"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

const PageFallback = () => (
  <div className="min-h-[60vh] flex items-center justify-center">
    <div className="text-muted-foreground text-sm">Carregando...</div>
  </div>
);

function RouteBoundary({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  // Reset boundary state when route changes so a crash on one page doesn't stick on the next
  return <ErrorBoundary key={location.pathname}>{children}</ErrorBoundary>;
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
                <Route path="/financeiro" element={<Financeiro />} />
                <Route path="/calculadora" element={<Navigate to="/financeiro" replace />} />
                <Route path="/processos" element={<Processos />} />
                <Route path="/estudos" element={<Estudos />} />
                <Route path="/contratos" element={<Contratos />} />
                <Route path="/scripts" element={<Scripts />} />
                <Route path="/objecoes" element={<Objecoes />} />
                <Route path="/planilha" element={<Planilha />} />
                <Route path="/tasks" element={<Tasks />} />
                <Route path="/estrategias" element={<Estrategias />} />
                <Route path="/utm" element={<UTMGenerator />} />
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
    const isChunkError = (msg?: string) =>
      !!msg && (/Loading chunk|Loading CSS chunk|dynamically imported module|Importing a module script failed/i.test(msg));
    const handler = (event: ErrorEvent) => {
      if (isChunkError(event.message)) {
        // Stale build after deploy: hard reload once
        const key = "__chunk_reloaded__";
        if (!sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, "1");
          window.location.reload();
        }
      }
    };
    const rejHandler = (event: PromiseRejectionEvent) => {
      const msg = event.reason?.message || String(event.reason || "");
      if (isChunkError(msg)) {
        const key = "__chunk_reloaded__";
        if (!sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, "1");
          window.location.reload();
        }
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
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ChunkErrorRecovery />
        <ScrollToTop />
        <AuthProvider>
          <Routes>
            <Route path="/*" element={<ProtectedRoutes />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
