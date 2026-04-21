import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import AuthPage from "./pages/AuthPage";
import AppLayout from "./components/AppLayout";
import Dashboard from "./pages/Dashboard";
import Clientes from "./pages/Clientes";
import ClientDetail from "./pages/ClientDetail";
import Calculadora from "./pages/Calculadora";
import Processos from "./pages/Processos";
import Estudos from "./pages/Estudos";
import Contratos from "./pages/Contratos";
import Scripts from "./pages/Scripts";
import Objecoes from "./pages/Objecoes";
import Planilha from "./pages/Planilha";
import Tasks from "./pages/Tasks";
import UTMGenerator from "./pages/UTMGenerator";
import Bloqueado from "./pages/Bloqueado";
import NotFound from "./pages/NotFound";
import { useAccessCheck } from "@/hooks/useAccessCheck";

const queryClient = new QueryClient();

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
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/clientes" element={<Clientes />} />
            <Route path="/clientes/:id" element={<ClientDetail />} />
            <Route path="/calculadora" element={<Calculadora />} />
            <Route path="/processos" element={<Processos />} />
            <Route path="/estudos" element={<Estudos />} />
            <Route path="/contratos" element={<Contratos />} />
            <Route path="/scripts" element={<Scripts />} />
            <Route path="/objecoes" element={<Objecoes />} />
            <Route path="/planilha" element={<Planilha />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/utm" element={<UTMGenerator />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AppLayout>
      } />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
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
