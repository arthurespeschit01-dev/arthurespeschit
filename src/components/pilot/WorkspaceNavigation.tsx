import { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import {
  Home,
  MessageSquare,
  Briefcase,
  Settings,
  ChevronDown,
} from "lucide-react";
export default function WorkspaceNavigation({
  base,
  section,
  permissions,
}: {
  base: string;
  section: string;
  permissions?: Record<string, { read: boolean }>;
}) {
  const commercial = [
      "dashboard",
      "crm",
      "formularios",
      "agendamentos",
      "funis",
    ].includes(section),
    settings = [
      "settings",
      "equipe",
      "integracoes",
      "whatsapp",
      "google-agenda",
      "webhooks",
      "geral",
      "rastreamento",
      "creditos",
      "canais",
    ].includes(section);
  const [mobileOpen, setMobile] = useState(false);
  const [openCommercial, setCommercial] = useState(commercial),
    [openSettings, setSettings] = useState(settings);
  useEffect(() => {
    if (commercial) setCommercial(true);
    if (settings) setSettings(true);
    setMobile(false);
  }, [section, commercial, settings]);
  const link = (to: string, label: string, Icon?: typeof Home) => {
    const section = to.slice(base.length + 1);
    const module = (
      {
        conversas: "conversations",
        dashboard: "crm",
        crm: "crm",
        formularios: "forms",
        agendamentos: "calendar",
        funis: "flows",
        equipe: "team",
        geral: "settings",
        configuracoes: "settings",
      } as Record<string, string>
    )[section];
    if (module && permissions && !permissions[module]?.read) return null;
    return (
      <NavLink
        key={to}
        end
        to={to}
        className={({ isActive }) =>
          `flex items-center gap-2 rounded-lg px-3 min-h-11 py-2 text-sm ${isActive ? "bg-primary/15 text-primary font-semibold" : "text-sidebar-foreground hover:bg-sidebar-accent"}`
        }
      >
        {Icon && <Icon size={17} />}
        <span>{label}</span>
      </NavLink>
    );
  };
  return (
    <>
      <button
        className="lg:hidden w-full text-left border rounded-lg p-3 text-sm"
        aria-expanded={mobileOpen}
        onClick={() => setMobile(!mobileOpen)}
      >
        Menu da empresa
      </button>
      <nav
        aria-label="Menu da subconta"
        className={`${mobileOpen ? "block" : "hidden"} lg:block space-y-2`}
      >
        {link(base, "Início", Home)}
        {link(base + "/conversas", "Conversas", MessageSquare)}
        <div>
          <button
            aria-expanded={openCommercial}
            className="w-full flex items-center gap-2 px-3 py-3 text-xs uppercase font-semibold text-muted-foreground"
            onClick={() => setCommercial(!openCommercial)}
          >
            <Briefcase size={16} />
            Comercial
            <ChevronDown
              size={15}
              className={`ml-auto transition-transform ${openCommercial ? "rotate-180" : ""}`}
            />
          </button>
          {openCommercial && (
            <div className="pl-3 space-y-1">
              {[
                ["dashboard", "Dashboard"],
                ["crm", "CRM"],
                ["formularios", "Formulários"],
                ["agendamentos", "Agendamentos"],
                ["funis", "Funis e automações"],
              ].map(([path, name]) => link(base + "/" + path, name))}
            </div>
          )}
        </div>
        <div>
          <button
            aria-expanded={openSettings}
            className="w-full flex items-center gap-2 px-3 py-3 text-xs uppercase font-semibold text-muted-foreground"
            onClick={() => setSettings(!openSettings)}
          >
            <Settings size={16} />
            Configurações
            <ChevronDown
              size={15}
              className={`ml-auto transition-transform ${openSettings ? "rotate-180" : ""}`}
            />
          </button>
          {openSettings && (
            <div className="pl-3 space-y-1">
              {link(base + "/equipe", "Workspace")}
              {link(base + "/geral", "Geral")}
            </div>
          )}
        </div>
      </nav>
    </>
  );
}
