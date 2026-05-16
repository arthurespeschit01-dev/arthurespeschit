import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import NotificationBar from '@/components/NotificationBar';
import SupportFAB from '@/components/SupportFAB';
import ThemeToggle from '@/components/ThemeToggle';
import OnboardingTour from '@/components/OnboardingTour';

import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, ClipboardList,
  BookOpen, FileText, MessageSquare, ShieldAlert,
  BarChart3, LogOut, Zap, Menu, X, ListTodo, ChevronDown, Folder, Link2, Sparkles, DollarSign, PanelLeftClose, PanelLeftOpen, Settings
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import logoCentralGestor from '@/assets/logo-central-gestor.png';

const mainNavItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, tourId: 'nav-dashboard' },
  { to: '/clientes', label: 'Clientes', icon: Users, tourId: 'nav-clientes' },
  { to: '/relatorios', label: 'Relatórios ', icon: FileText, tourId: 'nav-relatorios' },
  { to: '/tasks', label: 'Tarefas', icon: ListTodo, tourId: 'nav-tarefas' },
  { to: '/financeiro', label: 'Financeiro', icon: DollarSign, tourId: 'nav-financeiro' },
  // { to: '/planilha', label: 'Planilha', icon: BarChart3 },
  { to: '/planilha-teste', label: 'Planilha de acompanhamento', icon: BarChart3, tourId: 'nav-planilha' },
  { to: '/contratos', label: 'Contratos', icon: FileText, tourId: 'nav-contratos' },
  { to: '/estrategias', label: 'Geração de Estratégia', icon: Sparkles, tourId: 'nav-estrategia' },
  { to: '/utm', label: 'Gerador de UTMs', icon: Link2, tourId: 'nav-utms' },
  { to: '/configuracoes', label: 'Configurações', icon: Settings, tourId: 'nav-config' },
];

const processosSubItems = [
  { to: '/processos', label: 'Processo de Onboarding', icon: ClipboardList },
  { to: '/estudos', label: 'Estudos de Caso', icon: BookOpen },
  { to: '/scripts', label: 'Scripts', icon: MessageSquare },
  { to: '/objecoes', label: 'Objeções', icon: ShieldAlert },
];

const SIDEBAR_COLLAPSED_KEY = 'sidebar:collapsed';
const SIDEBAR_ICON_CLASS = 'w-5 h-5 shrink-0';
const SIDEBAR_ICON_BUTTON_CLASS = 'flex items-center justify-center w-10 h-10 rounded-lg';
const SIDEBAR_ICON_STROKE_WIDTH = 1.8;
const iconOpticalAdjustments = new Map<LucideIcon, string>([
  [Settings, 'translate(0.5px, 0px)'],
  [Folder, 'translate(0px, -0.5px)'],
  [LogOut, 'translate(0.5px, 0px)'],
  [PanelLeftOpen, 'translate(0px, 0.5px)'],
  [PanelLeftClose, 'translate(0px, 0.5px)'],
]);

function SidebarIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <Icon
      className={SIDEBAR_ICON_CLASS}
      strokeWidth={SIDEBAR_ICON_STROKE_WIDTH}
      style={{ transform: iconOpticalAdjustments.get(Icon) }}
    />
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const { pathname } = useLocation();
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
  const processosActive = processosSubItems.some((item) => pathname === item.to);

  return (
    <TooltipProvider delayDuration={0}>
      <OnboardingTour />
      <div className="min-h-screen flex bg-background">
        {sidebarOpen && (
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
        )}

        <aside className={`fixed lg:sticky top-0 left-0 z-50 h-screen bg-sidebar border-r border-sidebar-border flex flex-col transition-all duration-300 overflow-hidden ${collapsed ? 'w-16' : 'w-64'} ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
          <div className={`flex items-center border-b border-sidebar-border relative ${collapsed ? 'p-2 justify-center' : 'p-4 justify-center'}`}>
            <img src={logoCentralGestor} alt="Central do Gestor" className={`object-contain transition-all ${collapsed ? 'h-12 w-12' : 'h-32 w-auto'}`} />
            {!collapsed && (
              <button onClick={() => setSidebarOpen(false)} className="absolute right-3 top-3 lg:hidden text-muted-foreground">
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          <nav className={`flex-1 p-3 overflow-y-auto overflow-x-hidden ${collapsed ? 'flex flex-col items-center gap-1' : 'space-y-1'}`}>
            {mainNavItems.map((item) => {
              const isConfig = item.to === '/configuracoes';
              const link = (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  data-tour-id={item.tourId}
                  onClick={() => { if (!collapsed) setSidebarOpen(false); }}
                  className={({ isActive }) =>
                    `${collapsed
                      ? SIDEBAR_ICON_BUTTON_CLASS
                      : 'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm'
                    } transition-all duration-200 ${
                      isActive
                        ? 'bg-primary/15 text-primary font-medium'
                        : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                    }`
                  }
                >
                  <SidebarIcon icon={item.icon} />
                  {!collapsed && <span>{item.label}</span>}
                </NavLink>
              );
              const wrapped = collapsed ? (
                <Tooltip key={item.to}>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              ) : link;
              if (isConfig) {
                return (
                  <div
                    key={item.to}
                    className={`${collapsed ? 'w-10 flex justify-center' : ''} pt-6 mt-2 border-t border-sidebar-border`}
                  >
                    {wrapped}
                  </div>
                );
              }
              return wrapped;
            })}

            {/* Processos folder */}
            <div className={collapsed ? 'w-10 flex justify-center' : ''}>
              {collapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <NavLink
                      to="/processos"
                      data-tour-id="nav-processos"
                      className={`${SIDEBAR_ICON_BUTTON_CLASS} transition-all duration-200 ${
                        processosActive
                          ? 'bg-primary/15 text-primary font-medium'
                          : 'text-primary hover:bg-sidebar-accent hover:text-primary'
                      }`}
                    >
                      <SidebarIcon icon={Folder} />
                    </NavLink>
                  </TooltipTrigger>
                  <TooltipContent side="right">Processos</TooltipContent>
                </Tooltip>
              ) : (
                <button
                  onClick={() => setProcessosOpen(!processosOpen)}
                  data-tour-id="nav-processos"
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 w-full ${
                    processosActive
                      ? 'bg-primary/15 text-primary font-medium'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                  }`}
                >
                  <SidebarIcon icon={Folder} />
                  <span className="flex-1 text-left">Processos</span>
                  <ChevronDown className={`w-4 h-4 shrink-0 transition-transform duration-200 ${processosOpen ? 'rotate-180' : ''}`} strokeWidth={SIDEBAR_ICON_STROKE_WIDTH} />
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
                      <SidebarIcon icon={item.icon} />
                      <span>{item.label}</span>
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          </nav>

          <div className={`p-3 border-t border-sidebar-border ${collapsed ? 'flex flex-col items-center gap-1' : 'space-y-1'}`}>
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={signOut}
                    className="flex items-center justify-center w-10 h-10 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-200"
                  >
                    <LogOut className="w-5 h-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">Sair</TooltipContent>
              </Tooltip>
            ) : (
              <Button
                variant="ghost"
                onClick={signOut}
                className="w-full justify-start gap-3 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              >
                <LogOut className="w-5 h-5" />
                Sair
              </Button>
            )}
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={toggleCollapsed}
                    className="flex items-center justify-center w-10 h-10 rounded-lg text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-all duration-200"
                  >
                    <PanelLeftOpen className="w-5 h-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">Expandir menu</TooltipContent>
              </Tooltip>
            ) : (
              <Button
                variant="ghost"
                onClick={toggleCollapsed}
                size="sm"
                className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground"
              >
                <PanelLeftClose className="w-5 h-5" /> Minimizar
              </Button>
            )}
          </div>
        </aside>

        <div className="flex-1 flex flex-col min-h-screen min-w-0">
          <header className="sticky top-0 z-30 h-14 flex items-center px-4 lg:px-6 border-b border-border bg-background/80 backdrop-blur-xl">
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex lg:hidden mr-3 text-muted-foreground hover:text-foreground items-center justify-center w-8 h-8 rounded-md hover:bg-accent"
              aria-label="Abrir menu"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="ml-auto flex items-center gap-2 sm:gap-3 min-w-0">
              <ThemeToggle />
              <NotificationBar />
              <span className="text-sm text-muted-foreground truncate max-w-[140px] sm:max-w-[220px] md:max-w-none">{user?.email}</span>
              {(() => {
                const isGoogle =
                  user?.app_metadata?.provider === 'google' ||
                  (user?.app_metadata?.providers as string[] | undefined)?.includes('google');
                if (!isGoogle) return null;
                const avatarUrl = (user?.user_metadata as any)?.avatar_url || (user?.user_metadata as any)?.picture;
                const fullName = (user?.user_metadata as any)?.full_name || (user?.user_metadata as any)?.name || user?.email || '';
                const initials = fullName.split(' ').map((p: string) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'U';
                return (
                  <Avatar className="w-9 h-9">
                    {avatarUrl && <AvatarImage src={avatarUrl} alt="Foto de perfil" referrerPolicy="no-referrer" />}
                    <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                  </Avatar>
                );
              })()}
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
