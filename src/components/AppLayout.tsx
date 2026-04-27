import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import NotificationBar from '@/components/NotificationBar';
import SupportFAB from '@/components/SupportFAB';

import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Users, ClipboardList,
  BookOpen, FileText, MessageSquare, ShieldAlert,
  BarChart3, LogOut, Zap, Menu, X, ListTodo, ChevronDown, FolderOpen, Link2, Sparkles, DollarSign
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import logoCentralGestor from '@/assets/logo-central-gestor.png';

const mainNavItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/clientes', label: 'Clientes', icon: Users },
  { to: '/tasks', label: 'Tasks', icon: ListTodo },
  { to: '/financeiro', label: 'Financeiro', icon: DollarSign },
  // { to: '/planilha', label: 'Planilha', icon: BarChart3 },
  { to: '/planilha-teste', label: 'Planilha acompanhamento', icon: BarChart3 },
  { to: '/contratos', label: 'Contratos', icon: FileText },
  { to: '/estrategias', label: 'Geração de Estratégia', icon: Sparkles },
  { to: '/utm', label: 'Gerador de UTMs', icon: Link2 },
];

const processosSubItems = [
  { to: '/processos', label: 'Processo de Onboarding', icon: ClipboardList },
  { to: '/estudos', label: 'Estudos de Caso', icon: BookOpen },
  { to: '/scripts', label: 'Scripts', icon: MessageSquare },
  { to: '/objecoes', label: 'Objeções', icon: ShieldAlert },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [processosOpen, setProcessosOpen] = useState(false);

  return (
    <div className="min-h-screen flex bg-background">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`fixed lg:sticky top-0 left-0 z-50 h-screen w-64 bg-sidebar border-r border-sidebar-border flex flex-col transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="p-4 flex items-center justify-center border-b border-sidebar-border relative">
          <img src={logoCentralGestor} alt="Central do Gestor" className="h-24 w-auto object-contain" />
          <button onClick={() => setSidebarOpen(false)} className="absolute right-3 top-3 lg:hidden text-muted-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {mainNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 ${
                  isActive
                    ? 'bg-primary/15 text-primary font-medium'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                }`
              }
            >
              <item.icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          ))}

          {/* Processos folder */}
          <div>
            <button
              onClick={() => setProcessosOpen(!processosOpen)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 w-full text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <FolderOpen className="w-4 h-4 shrink-0" />
              <span className="flex-1 text-left">Processos</span>
              <ChevronDown className={`w-4 h-4 shrink-0 transition-transform duration-200 ${processosOpen ? 'rotate-180' : ''}`} />
            </button>
            {processosOpen && (
              <div className="ml-3 pl-3 border-l border-sidebar-border space-y-0.5 mt-0.5">
                {processosSubItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setSidebarOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200 ${
                        isActive
                          ? 'bg-primary/15 text-primary font-medium'
                          : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                      }`
                    }
                  >
                    <item.icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        </nav>

        <div className="p-3 border-t border-sidebar-border">
          <Button
            variant="ghost"
            onClick={signOut}
            className="w-full justify-start gap-3 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          >
            <LogOut className="w-4 h-4" />
            Sair
          </Button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-h-screen min-w-0">
        <header className="sticky top-0 z-30 h-14 flex items-center px-4 lg:px-6 border-b border-border bg-background/80 backdrop-blur-xl">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden mr-3 text-muted-foreground hover:text-foreground">
            <Menu className="w-5 h-5" />
          </button>
          <div className="ml-auto flex items-center gap-3">
            <NotificationBar />
            <span className="text-sm text-muted-foreground">{user?.email}</span>
          </div>
        </header>
        <main className="flex-1 min-w-0 p-4 lg:p-6">
          {children}
        </main>
      </div>

      <SupportFAB />
    </div>
  );
}
