import {supabase} from '@/integrations/supabase/client';
import {settingsResources} from '@/lib/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import NotificationBar from '@/components/NotificationBar';
import SupportFAB from '@/components/SupportFAB';
import ThemeToggle from '@/components/ThemeToggle';
import OnboardingTour from '@/components/OnboardingTour';

import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, ClipboardList,
  FileText, MessageSquare,
  BarChart3, LogOut, Zap, Menu, X, ListTodo, ChevronDown, Folder, Link2, Search, DollarSign, PanelLeftClose, PanelLeftOpen, Settings
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import logoCentralGestor from '@/assets/logo-central-gestor.png';

const mainNavItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, tourId: 'nav-dashboard' },
  { to: '/clientes', label: 'Clientes', icon: Users, tourId: 'nav-clientes' },
  {to:'/tasks',label:'Tarefas',icon:ListTodo,tourId:'nav-tasks'},
  {to:'/comercial/conversas',label:'Conversas',icon:MessageSquare,tourId:'nav-conversas'},
  // { to: '/planilha', label: 'Planilha', icon: BarChart3 },
  { to: '/configuracoes', label: 'Configurações', icon: Settings, tourId: 'nav-config' },
];

const gestaoSubItems = [
 {to:'/financeiro',label:'Financeiro',icon:DollarSign},
 {to:'/contratos',label:'Contratos',icon:FileText},
];
const ferramentasSubItems = [{to:'/utm',label:'Gerador de UTMs',icon:Link2}];
const operacoesSubItems = [
  {to:'/chamados',label:'Chamados',icon:MessageSquare},
  {to:'/planilha-teste',label:'Planilha de acompanhamento',icon:BarChart3},
  { to: '/relatorios', label: 'Relatórios', icon: FileText },
  { to: '/operacao', label: 'Onboarding e execução', icon: ClipboardList },
];

const comercialSubItems = [
  { to: '/comercial', label: 'Dashboard comercial', icon: LayoutDashboard },
  { to: '/comercial/crm', label: 'CRM', icon: Users },
  { to: '/comercial/formularios', label: 'Formulários', icon: FileText },
  { to: '/comercial/agendamentos', label: 'Agendamentos', icon: ClipboardList },
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
  const [canAccessProspecting,setCanAccessProspecting]=useState(false);
  useEffect(()=>{let alive=true;setCanAccessProspecting(false);if(user?.id)void supabase.auth.getUser().then(({data,error})=>{if(alive&&!error&&data.user?.id===user.id)setCanAccessProspecting(data.user.app_metadata?.central_prospecting===true)}).catch(()=>{});return()=>{alive=false}},[user?.id]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [navSearch,setNavSearch]=useState('');
  const [gestaoOpen,setGestaoOpen]=useState(()=>gestaoSubItems.some(item=>item.to===pathname));
  const [ferramentasOpen,setFerramentasOpen]=useState(()=>ferramentasSubItems.some(item=>item.to===pathname));
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
  });
  const [comercialOpen, setComercialOpen] = useState(() => comercialSubItems.some(item=>item.to===pathname));
  const [operacoesOpen, setOperacoesOpen] = useState(() => operacoesSubItems.some(item => pathname === item.to));
  useEffect(() => {
    setNavSearch('');setSidebarOpen(false);
    if(gestaoSubItems.some(item=>item.to===pathname))setGestaoOpen(true);
    if(ferramentasSubItems.some(item=>item.to===pathname))setFerramentasOpen(true);
    setComercialOpen(comercialSubItems.some(item=>item.to===pathname));
    if (operacoesSubItems.some(item => item.to === pathname)) setOperacoesOpen(true);
  }, [pathname]);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0'); } catch {}
      if (next) { setOperacoesOpen(false); setComercialOpen(false); }
      return next;
    });
  };

  const renderNavGroup = (group: { name: string; id: string; items: {to:string;label:string;icon:LucideIcon}[]; open: boolean; setOpen: (open: boolean) => void }) => {
              const query=navSearch.trim().toLocaleLowerCase('pt-BR');
              const items=group.items.filter(item=>!query||`${group.name} ${item.label}`.toLocaleLowerCase('pt-BR').includes(query));
              if(!items.length)return null;
              const expanded=group.open||!!query;
              const active = group.items.some(item => pathname === item.to);
              return <div key={group.id} className={collapsed ? 'w-10 flex justify-center' : ''}>
                <button
                  aria-label={group.name}
                  aria-expanded={!collapsed && expanded}
                  aria-controls={`nav-${group.id}-items`}
                  data-tour-id={`nav-${group.id}`}
                  onClick={() => { if (collapsed) { setCollapsed(false); try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, '0'); } catch {} group.setOpen(true); } else group.setOpen(!group.open); }}
                  className={`${collapsed ? SIDEBAR_ICON_BUTTON_CLASS : 'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm w-full'} transition-all duration-200 ${active ? 'bg-primary/15 text-primary font-medium' : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'}`}
                >
                  <SidebarIcon icon={Folder} />
                  {!collapsed && <><span className="flex-1 text-left">{group.name}</span><ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} /></>}
                </button>
                {expanded && !collapsed && <div id={`nav-${group.id}-items`} className="ml-3 pl-3 border-l border-sidebar-border space-y-0.5 mt-0.5">
                  {items.map(item => <NavLink key={item.to} to={item.to} end={item.to === '/comercial'} onClick={() => setSidebarOpen(false)} className={({isActive}) => `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${isActive ? 'bg-primary/15 text-primary font-medium' : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'}`}><SidebarIcon icon={item.icon} /><span>{item.label}</span></NavLink>)}
                </div>}
              </div>;

  };

  const currentGroup=[{name:'Operações',items:operacoesSubItems},{name:'Comercial',items:comercialSubItems},{name:'Gestão',items:gestaoSubItems},{name:'Configurações',items:settingsResources},{name:'Ferramentas',items:ferramentasSubItems}].find(group=>group.items.some(item=>item.to===pathname));
  const currentPage=[...mainNavItems,...operacoesSubItems,...comercialSubItems,...gestaoSubItems,...settingsResources,...ferramentasSubItems].find(item=>item.to===pathname)?.label||(pathname.startsWith('/clientes/')?'Detalhes do cliente':'Central do Gestor');
  const asideWidth = collapsed ? 'lg:w-16' : 'lg:w-64';


  return (
    <TooltipProvider delayDuration={0}>
      <OnboardingTour />
      <div className="min-h-screen flex bg-background">
        {sidebarOpen && (
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
        )}

        <aside className={`fixed lg:sticky top-0 left-0 z-50 h-dvh bg-sidebar border-r border-sidebar-border flex flex-col transition-all duration-300 overflow-hidden ${collapsed ? 'w-16' : 'w-64'} ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
          <div className={`flex items-center border-b border-sidebar-border relative ${collapsed ? 'p-2 justify-center' : 'p-4 justify-center'}`}>
            <img src={logoCentralGestor} alt="Central do Gestor" className={`object-contain transition-all ${collapsed ? 'h-12 w-12' : 'h-14 w-auto'}`} />
            {!collapsed && (
              <button onClick={() => setSidebarOpen(false)} aria-label="Fechar menu" className="absolute right-1 top-1 w-11 h-11 flex items-center justify-center lg:hidden text-muted-foreground">
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          <nav className={`flex-1 p-3 overflow-y-auto overflow-x-hidden ${collapsed ? 'flex flex-col items-center gap-1' : 'space-y-1'}`}>
            {!collapsed&&<div className="relative mb-3"><Search size={15} className="absolute left-3 top-3 text-muted-foreground"/><input aria-label="Buscar página" placeholder="Buscar página…" value={navSearch} onChange={e=>setNavSearch(e.target.value)} className="w-full h-10 rounded-lg border border-sidebar-border bg-transparent pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"/></div>}
            {mainNavItems.filter(item=>item.to!=='/configuracoes').map((item) => {
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
              const matches=!navSearch||item.label.toLocaleLowerCase('pt-BR').includes(navSearch.toLocaleLowerCase('pt-BR'));
              const wrapped = !matches?null:collapsed ? (
                <Tooltip key={item.to}>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              ) : link;
              return item.to === '/comercial/conversas' ? <div key={item.to}>{wrapped}{renderNavGroup({ name: 'Operações', id: 'operacoes', items: operacoesSubItems, open: operacoesOpen, setOpen: setOperacoesOpen })}{renderNavGroup({ name: 'Comercial', id: 'comercial', items: comercialSubItems, open: comercialOpen, setOpen: setComercialOpen })}</div> : wrapped;
            })}

            {canAccessProspecting&&(!navSearch||'prospecção'.includes(navSearch.toLocaleLowerCase('pt-BR')))&&<a href="/prospeccao" aria-label="Prospecção" className={`${collapsed?SIDEBAR_ICON_BUTTON_CLASS:'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm'} text-sidebar-foreground hover:bg-sidebar-accent`}><SidebarIcon icon={Search}/>{!collapsed&&<span>Prospecção</span>}</a>}
            {renderNavGroup({name:'Gestão',id:'gestao',items:gestaoSubItems,open:gestaoOpen,setOpen:setGestaoOpen})}
            {renderNavGroup({name:'Ferramentas',id:'ferramentas',items:ferramentasSubItems,open:ferramentasOpen,setOpen:setFerramentasOpen})}
            {(!navSearch||'configurações'.includes(navSearch.toLocaleLowerCase('pt-BR')))&&<NavLink to="/configuracoes" data-tour-id="nav-config" aria-label="Configurações" className={({isActive})=>`${collapsed?SIDEBAR_ICON_BUTTON_CLASS:'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm'} mt-3 border-t border-sidebar-border ${isActive||settingsResources.some(item=>item.to===pathname)?'bg-primary/15 text-primary':'text-sidebar-foreground hover:bg-sidebar-accent'}`}><SidebarIcon icon={Settings}/>{!collapsed&&<span>Configurações</span>}</NavLink>}
          </nav>

          <div className={`p-3 border-t border-sidebar-border ${collapsed ? 'flex flex-col items-center gap-1' : 'space-y-1'}`}>
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={signOut}
                    className={`${SIDEBAR_ICON_BUTTON_CLASS} text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-200`}
                  >
                    <SidebarIcon icon={LogOut} />
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
                <SidebarIcon icon={LogOut} />
                Sair
              </Button>
            )}
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={toggleCollapsed}
                    className={`${SIDEBAR_ICON_BUTTON_CLASS} text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-all duration-200`}
                  >
                    <SidebarIcon icon={PanelLeftOpen} />
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
                <SidebarIcon icon={PanelLeftClose} /> Minimizar
              </Button>
            )}
          </div>
        </aside>

        <div className="flex-1 flex flex-col min-h-screen min-w-0">
          <header className="sticky top-0 z-30 h-14 flex items-center px-4 lg:px-6 border-b border-border bg-background/80 backdrop-blur-xl">
            <button
              onClick={() => {setCollapsed(false);setSidebarOpen(true)}}
              className="flex lg:hidden mr-3 text-muted-foreground hover:text-foreground items-center justify-center w-11 h-11 rounded-md hover:bg-accent"
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
          {pathname!=='/comercial/conversas'&&<div aria-label="Localização atual" className="px-4 lg:px-6 pt-3 text-xs text-muted-foreground flex items-center gap-2 min-w-0"><NavLink to="/" className="hover:text-foreground shrink-0">Início</NavLink>{currentGroup&&<><span>/</span><span>{currentGroup.name}</span></>}<span>/</span><span className="text-foreground truncate">{currentPage}</span></div>}
          <main className="flex-1 min-w-0 p-4 lg:p-6">
            {children}
          </main>
        </div>

        {pathname !== '/comercial/conversas' && <SupportFAB />}
      </div>
    </TooltipProvider>
  );
}
