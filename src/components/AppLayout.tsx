import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import NotificationBar from '@/components/NotificationBar';
import SupportFAB from '@/components/SupportFAB';
import ThemeToggle from '@/components/ThemeToggle';

import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Users, ClipboardList,
  BookOpen, FileText, MessageSquare, ShieldAlert,
  BarChart3, LogOut, Zap, Menu, X, ListTodo, ChevronDown, FolderOpen, Link2, Sparkles, DollarSign, PanelLeftClose, PanelLeftOpen
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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

const SIDEBAR_COLLAPSED_KEY = 'sidebar:collapsed';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
  });
  const [processosOpen, setProcessosOpen] = useState(false);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0'); } catch {}
      if (next) setProcessosOpen(false);
      return next;
    });
  };

  const asideWidth = collapsed ? 'lg:w-16' : 'lg:w-64';

  return (
    <TooltipProvider delayDuration={0}>
      <div className="min-h-screen flex bg-background">
        {sidebarOpen && (
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
        )}

        <aside className={`fixed lg:sticky top-0 left-0 z-50 h-screen bg-sidebar border-r border-sidebar-border flex flex-col transition-all duration-300 overflow-hidden ${collapsed ? 'w-16' : 'w-64'} ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
          <div className={`flex items-center border-b border-sidebar-border relative ${collapsed ? 'p-2 justify-center' : 'p-4 justify-center'}`}>
            <img src={logoCentralGestor} alt="Central do Gestor" className={`object-contain transition-all ${collapsed ? 'h-10 w-10' : 'h-24 w-auto'}`} />
            {!collapsed && (
              <button onClick={() => setSidebarOpen(false)} className="absolute right-3 top-3 lg:hidden text-muted-foreground">
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          <nav className="flex-1 p-3 space-y-1 overflow-y-auto overflow-x-hidden">
            {mainNavItems.map((item) => {
              const link = (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  onClick={() => { if (!collapsed) setSidebarOpen(false); }}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 ${
                      collapsed ? 'justify-center px-2' : ''
                    } ${
                      isActive
                        ? 'bg-primary/15 text-primary font-medium'
                        : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                    }`
                  }
                >
                  <item.icon className="w-4 h-4 shrink-0" />
                  <span className={collapsed ? 'hidden' : ''}>{item.label}</span>
                </NavLink>
              );
              if (collapsed) {
                return (
                  <Tooltip key={item.to}>
                    <TooltipTrigger asChild>{link}</TooltipTrigger>
                    <TooltipContent side="right">{item.label}</TooltipContent>
                  </Tooltip>
                );
              }
              return link;
            })}

            {/* Processos folder */}
            <div>
              {collapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={toggleCollapsed}
                      className="flex items-center justify-center gap-3 px-2 py-2.5 rounded-lg text-sm transition-all duration-200 w-full text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    >
                      <FolderOpen className="w-4 h-4 shrink-0" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Processos</TooltipContent>
                </Tooltip>
              ) : (
                <button
                  onClick={() => setProcessosOpen(!processosOpen)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 w-full text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                >
                  <FolderOpen className="w-4 h-4 shrink-0" />
                  <span className="flex-1 text-left">Processos</span>
                  <ChevronDown className={`w-4 h-4 shrink-0 transition-transform duration-200 ${processosOpen ? 'rotate-180' : ''}`} />
                </button>
              )}
              {processosOpen && !collapsed && (
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

          <div className="p-3 border-t border-sidebar-border space-y-1">
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    onClick={signOut}
                    size="icon"
                    className="w-full text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  >
                    <LogOut className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Sair</TooltipContent>
              </Tooltip>
            ) : (
              <Button
                variant="ghost"
                onClick={signOut}
                className="w-full justify-start gap-3 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              >
                <LogOut className="w-4 h-4" />
                Sair
              </Button>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  onClick={toggleCollapsed}
                  size={collapsed ? 'icon' : 'sm'}
                  className={`hidden lg:flex text-muted-foreground hover:text-foreground ${collapsed ? 'w-full' : 'w-full justify-start gap-3'}`}
                >
                  {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <><PanelLeftClose className="w-4 h-4" /> Minimizar</>}
                </Button>
              </TooltipTrigger>
              {collapsed && <TooltipContent side="right">Expandir menu</TooltipContent>}
            </Tooltip>
          </div>
        </aside>

        <div className="flex-1 flex flex-col min-h-screen min-w-0">
          <header className="sticky top-0 z-30 h-14 flex items-center px-4 lg:px-6 border-b border-border bg-background/80 backdrop-blur-xl">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden mr-3 text-muted-foreground hover:text-foreground">
              <Menu className="w-5 h-5" />
            </button>
            <button
              onClick={toggleCollapsed}
              className="hidden lg:flex mr-3 text-muted-foreground hover:text-foreground items-center justify-center w-8 h-8 rounded-md hover:bg-accent"
              aria-label={collapsed ? 'Expandir menu' : 'Minimizar menu'}
              title={collapsed ? 'Expandir menu' : 'Minimizar menu'}
            >
              {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </button>
            <div className="ml-auto flex items-center gap-2 sm:gap-3 min-w-0">
              <ThemeToggle />
              <NotificationBar />
              <span className="text-sm text-muted-foreground truncate max-w-[140px] sm:max-w-[220px] md:max-w-none">{user?.email}</span>
            </div>
          </header>
          <main className="flex-1 min-w-0 p-4 lg:p-6">
            {children}
          </main>
        </div>

        <SupportFAB />
      </div>
    </TooltipProvider>
  );
}
