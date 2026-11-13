import { useState } from "react";
import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
  useLocation,
} from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { usePilotAccess } from "@/hooks/usePilotAccess";
import ThemeToggle from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  MoreHorizontal,
  ArrowLeft,
  LayoutDashboard,
  Columns3,
  Settings,
  Building2,
} from "lucide-react";
import {
  workspaceDb,
  workspaceData,
  workspaceList,
  workspaceKey,
  workspaceError,
  money,
  type ClientWorkspace,
  type WorkspaceLead,
} from "@/lib/clientWorkspaces";
import {
  WorkspaceDialog,
  LeadDialog,
  PipelineDialog,
} from "@/components/pilot/WorkspaceDialogs";
function Menu({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={label}>
          <MoreHorizontal size={18} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}
function PilotGate({ children }: { children: React.ReactNode }) {
  const access = usePilotAccess();
  if (access.isPending)
    return (
      <p role="status" className="p-8 text-muted-foreground">
        Verificando acesso ao piloto…
      </p>
    );
  if (access.isError)
    return (
      <div className="p-8 space-y-3">
        <p role="alert">Não foi possível verificar seu acesso.</p>
        <Button onClick={() => void access.refetch()}>Tentar novamente</Button>
        <Button asChild variant="outline">
          <Link to="/">Voltar à Central</Link>
        </Button>
      </div>
    );
  if (!access.data) return <Navigate to="/" replace />;
  return <>{children}</>;
}
export default function PilotWorkspaces() {
  return (
    <PilotGate>
      <div className="min-h-dvh bg-background text-foreground">
        <header className="min-h-16 border-b flex items-center justify-between gap-3 px-4 sm:px-6 py-3">
          <div className="flex gap-3 items-center min-w-0">
            <img
              className="w-9 h-9 shrink-0"
              src="/favicon.svg?v=cg-transparent-3"
              alt="Central do Gestor"
            />
            <div className="min-w-0">
              <p className="font-semibold truncate">Central do Gestor</p>
              <p className="text-xs text-muted-foreground">
                Subcontas de clientes · Piloto
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="outline" asChild>
              <Link to="/">
                <ArrowLeft size={16} />
                <span className="hidden sm:inline">Voltar à Central</span>
              </Link>
            </Button>
          </div>
        </header>
        <Routes>
          <Route path="subcontas" element={<WorkspaceList />} />
          <Route path="subcontas/:workspaceId/*" element={<WorkspaceRoute />} />
          <Route path="*" element={<Navigate to="subcontas" replace />} />
        </Routes>
      </div>
    </PilotGate>
  );
}
function WorkspaceList() {
  const { user } = useAuth(),
    client = useQueryClient(),
    navigate = useNavigate();
  const query = useQuery({
    queryKey: workspaceKey(user?.id),
    queryFn: workspaceList,
    refetchOnMount: "always",
  });
  const [dialog, setDialog] = useState<ClientWorkspace | "new" | null>(null),
    [filter, setFilter] = useState("active"),
    [search, setSearch] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const refresh = () =>
    void client.invalidateQueries({
      queryKey: ["pilot-client-workspaces", user?.id],
    });
  const change = async (w: ClientWorkspace, remove = false) => {
    if (
      remove &&
      !window.confirm(
        `Excluir a subconta “${w.name}” e todos os leads e pipelines dela? Os dados da agência serão preservados.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const r = remove
        ? await workspaceDb
            .from("agency_client_workspaces")
            .delete()
            .eq("id", w.id)
        : await workspaceDb
            .from("agency_client_workspaces")
            .update({ status: w.status === "active" ? "archived" : "active" })
            .eq("id", w.id);
      if (r.error) throw r.error;
      refresh();
    } catch (e) {
      setError(workspaceError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex flex-wrap gap-3 justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold">Subcontas de clientes</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cada empresa tem seu próprio CRM. Selecione uma subconta para
            trabalhar.
          </p>
        </div>
        <Button onClick={() => setDialog("new")}>
          <Plus size={16} />
          Nova subconta
        </Button>
      </div>
      <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
        Esta área piloto está liberada somente para sua conta de testes. Nenhum
        cliente, tarefa ou conversa da agência é copiado para as subcontas.
      </div>
      <div className="flex gap-3 flex-wrap">
        <Input
          aria-label="Buscar subcontas"
          placeholder="Buscar empresa…"
          className="sm:max-w-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label="Status das subcontas"
          className="h-10 rounded-md border bg-background px-3 text-sm"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="active">Ativas</option>
          <option value="archived">Arquivadas</option>
          <option value="all">Todas</option>
        </select>
      </div>
      {(error || query.error) && (
        <p role="alert" className="text-sm text-destructive">
          {error || workspaceError(query.error)}
        </p>
      )}
      {query.isPending ? (
        <p role="status">Carregando subcontas…</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {query.data
            ?.filter(
              (w) =>
                (filter === "all" || w.status === filter) &&
                w.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
            )
            .map((w) => (
              <article
                key={w.id}
                className="border rounded-xl bg-card p-4 flex flex-col gap-3"
              >
                <div className="flex gap-2 justify-between items-start">
                  <Building2 className="text-primary shrink-0" size={28} />
                  <Menu label={`Opções da subconta ${w.name}`}>
                    <DropdownMenuItem
                      disabled={busy}
                      onSelect={() => setDialog(w)}
                    >
                      Editar subconta
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={busy}
                      onSelect={() => void change(w)}
                    >
                      {w.status === "active" ? "Arquivar" : "Reativar"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={busy}
                      className="text-destructive"
                      onSelect={() => void change(w, true)}
                    >
                      Excluir subconta
                    </DropdownMenuItem>
                  </Menu>
                </div>
                <h2 className="font-semibold break-words">{w.name}</h2>
                <p className="text-xs text-muted-foreground">
                  {w.status === "active"
                    ? "Ativa"
                    : "Arquivada · somente leitura"}
                </p>
                <p className="text-sm text-muted-foreground break-words flex-1">
                  {w.description || "CRM independente para esta empresa."}
                </p>
                <Button variant="outline" asChild>
                  <Link to={`/laboratorio/subcontas/${w.id}`}>
                    Abrir subconta
                  </Link>
                </Button>
              </article>
            ))}
        </div>
      )}
      {!query.isPending && !query.data?.length && (
        <div className="border border-dashed rounded-xl p-8 text-center">
          <h2 className="font-semibold">Sua primeira subconta começa aqui</h2>
          <p className="text-muted-foreground text-sm mt-2">
            Crie uma empresa para testar o CRM separado da sua operação
            principal.
          </p>
        </div>
      )}
      {dialog && (
        <WorkspaceDialog
          workspace={dialog === "new" ? undefined : dialog}
          onClose={() => setDialog(null)}
          onSaved={refresh}
          onCreated={(id) => navigate(`/laboratorio/subcontas/${id}`)}
        />
      )}
    </main>
  );
}
function WorkspaceRoute() {
  const { workspaceId } = useParams();
  return <WorkspaceView key={workspaceId} />;
}
function WorkspaceView() {
  const { workspaceId = "" } = useParams(),
    { user } = useAuth(),
    location = useLocation(),
    navigate = useNavigate(),
    client = useQueryClient();
  const query = useQuery({
      queryKey: workspaceKey(user?.id, workspaceId),
      queryFn: () => workspaceData(workspaceId),
      refetchOnMount: "always",
    }),
    all = useQuery({
      queryKey: workspaceKey(user?.id),
      queryFn: workspaceList,
      refetchOnMount: "always",
    });
  const [pipelineId, setPipelineId] = useState(""),
    [leadDialog, setLeadDialog] = useState<WorkspaceLead | "new" | null>(null),
    [pipelineDialog, setPipelineDialog] = useState<"new" | "edit" | null>(null),
    [workspaceDialog, setWorkspaceDialog] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState("");
  const refresh = () =>
    void client.invalidateQueries({
      queryKey: ["pilot-client-workspaces", user?.id],
    });
  const data = query.data,
    w = data?.workspace;
  const pipeline =
      data?.pipelines.find((p) => p.id === pipelineId) || data?.pipelines[0],
    stages = data?.stages.filter((s) => s.pipeline_id === pipeline?.id) || [],
    leads = data?.leads.filter((l) => l.pipeline_id === pipeline?.id) || [];
  const base = `/laboratorio/subcontas/${workspaceId}`,
    section = location.pathname.endsWith("/crm")
      ? "crm"
      : location.pathname.endsWith("/configuracoes")
        ? "settings"
        : "dashboard";
  const enabled = !!w && w.status === "active" && !query.isFetching;
  const operation = async (action: () => PromiseLike<{ error: unknown }>) => {
    setBusy(true);
    setError("");
    try {
      const r = await action();
      if (r.error) throw r.error;
      refresh();
    } catch (e) {
      setError(workspaceError(e));
    } finally {
      setBusy(false);
    }
  };
  const moveLead = (lead: WorkspaceLead, stage: string) =>
    void operation(() =>
      workspaceDb
        .from("agency_workspace_leads")
        .update({ stage_id: stage })
        .eq("id", lead.id)
        .eq("workspace_id", workspaceId),
    );
  if (query.isPending)
    return (
      <p role="status" className="p-8">
        Carregando subconta…
      </p>
    );
  if (query.error)
    return (
      <p role="alert" className="p-8 text-destructive">
        {workspaceError(query.error)}
      </p>
    );
  if (!w)
    return (
      <div className="p-8 space-y-3">
        <p>Subconta não encontrada ou sem acesso.</p>
        <Button asChild>
          <Link to="/laboratorio/subcontas">Voltar às subcontas</Link>
        </Button>
      </div>
    );
  const won = leads.filter(
      (l) => stages.find((s) => s.id === l.stage_id)?.kind === "won",
    ),
    lost = leads.filter(
      (l) => stages.find((s) => s.id === l.stage_id)?.kind === "lost",
    );
  return (
    <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)] min-h-[calc(100dvh-4rem)]">
      <aside className="border-b lg:border-b-0 lg:border-r p-4 space-y-4 bg-sidebar">
        <label className="block text-xs text-muted-foreground">
          Empresa
          <select
            aria-label="Alternar subconta"
            className="w-full mt-2 h-11 rounded-md border bg-background px-2 text-sm text-foreground"
            value={workspaceId}
            onChange={(e) => {
              setPipelineId("");
              setSearch("");
              setLeadDialog(null);
              setPipelineDialog(null);
              navigate(`/laboratorio/subcontas/${e.target.value}`);
            }}
          >
            {all.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.status === "archived" ? " (arquivada)" : ""}
              </option>
            ))}
          </select>
        </label>
        <nav className="flex lg:flex-col gap-1 overflow-x-auto">
          {[
            { to: base, label: "Dashboard", icon: LayoutDashboard },
            { to: base + "/crm", label: "CRM", icon: Columns3 },
            {
              to: base + "/configuracoes",
              label: "Configurações",
              icon: Settings,
            },
          ].map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-lg px-3 py-3 text-sm shrink-0 ${isActive ? "bg-primary/15 text-primary font-semibold" : "text-sidebar-foreground hover:bg-sidebar-accent"}`
              }
            >
              <n.icon size={17} />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <Button variant="ghost" asChild className="w-full justify-start">
          <Link to="/laboratorio/subcontas">
            <ArrowLeft size={16} />
            Todas as subcontas
          </Link>
        </Button>
      </aside>
      <main className="p-4 sm:p-6 min-w-0 space-y-5">
        <div>
          <h1 className="text-2xl font-bold break-words">{w.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {section === "crm"
              ? "CRM da empresa"
              : section === "settings"
                ? "Configurações da subconta"
                : "Dashboard da empresa"}
          </p>
        </div>
        {!enabled && (
          <p className="border rounded-lg p-3 text-sm text-muted-foreground">
            Subconta arquivada. Os dados continuam disponíveis para consulta.
          </p>
        )}
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        {section !== "settings" && (
          <div className="flex flex-wrap gap-2 items-center">
            <select
              aria-label="Pipeline da subconta"
              className="h-11 border rounded-md bg-background px-3 text-sm min-w-0 max-w-full"
              value={pipeline?.id || ""}
              onChange={(e) => setPipelineId(e.target.value)}
            >
              {data?.pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <Menu label="Opções da pipeline">
              <DropdownMenuItem
                disabled={!enabled || busy}
                onSelect={() => setPipelineDialog("new")}
              >
                Nova pipeline
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!enabled || !pipeline || busy}
                onSelect={() => setPipelineDialog("edit")}
              >
                Configurar pipeline
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                disabled={!enabled || !pipeline || !!leads.length || busy}
                onSelect={() => {
                  if (
                    pipeline &&
                    window.confirm(`Excluir a pipeline “${pipeline.name}”?`)
                  )
                    void operation(() =>
                      workspaceDb
                        .from("agency_workspace_pipelines")
                        .delete()
                        .eq("id", pipeline.id)
                        .eq("workspace_id", workspaceId),
                    );
                }}
              >
                Excluir pipeline vazia
              </DropdownMenuItem>
            </Menu>
            {section === "crm" && (
              <Button
                disabled={!enabled || !stages.length || busy}
                onClick={() => setLeadDialog("new")}
              >
                <Plus size={16} />
                Novo lead
              </Button>
            )}
          </div>
        )}
        {section === "dashboard" && (
          <>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
              {[
                ["Total de leads", leads.length],
                ["Em aberto", leads.length - won.length - lost.length],
                ["Ganhos", won.length],
                [
                  "Valor ganho",
                  money(won.reduce((sum, l) => sum + Number(l.value), 0)),
                ],
              ].map(([label, value]) => (
                <div key={label} className="border rounded-xl bg-card p-4">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-xl font-bold mt-2 break-words">{value}</p>
                </div>
              ))}
            </div>
            <section className="border rounded-xl bg-card p-4 space-y-4">
              <h2 className="font-semibold">Distribuição por etapa</h2>
              {stages.map((s) => {
                const count = leads.filter((l) => l.stage_id === s.id).length;
                return (
                  <div key={s.id} className="space-y-2">
                    <div className="flex justify-between gap-3 text-sm">
                      <span className="break-words">{s.name}</span>
                      <span className="font-semibold">{count}</span>
                    </div>
                    <div className="h-2 rounded-full bg-secondary overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          background: s.color,
                          width: `${leads.length ? (count / leads.length) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
              {!leads.length && (
                <p className="text-sm text-muted-foreground">
                  Os indicadores serão atualizados quando você cadastrar e
                  movimentar leads nesta subconta.
                </p>
              )}
            </section>
            <p className="text-xs text-muted-foreground">
              Os números refletem os leads e as etapas desta pipeline. Nenhuma
              conversa da agência entra nestes indicadores.
            </p>
          </>
        )}
        {section === "crm" && (
          <>
            <Input
              aria-label="Buscar leads na subconta"
              placeholder="Buscar por nome, telefone ou e-mail…"
              className="max-w-xl"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {!pipeline && (
              <Button
                disabled={!enabled}
                onClick={() => setPipelineDialog("new")}
              >
                Criar primeira pipeline
              </Button>
            )}
            <div
              className="flex gap-3 overflow-x-auto pb-4 items-start"
              aria-label="Pipeline da empresa"
            >
              {stages.map((s) => (
                <section
                  key={s.id}
                  className="w-[280px] shrink-0 max-w-[85vw] rounded-xl border bg-secondary/40"
                  onDragOver={(e) => enabled && e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const l = leads.find(
                      (l) => l.id === e.dataTransfer.getData("text/plain"),
                    );
                    if (enabled && l) moveLead(l, s.id);
                  }}
                >
                  <header
                    className="border-t-4 rounded-t-xl p-3 flex items-center justify-between gap-2"
                    style={{ borderColor: s.color }}
                  >
                    <h2 className="font-semibold text-sm break-words">
                      {s.name}
                    </h2>
                    <span className="text-xs text-muted-foreground">
                      {leads.filter((l) => l.stage_id === s.id).length}
                    </span>
                  </header>
                  <div className="p-2 space-y-2 min-h-24">
                    {leads
                      .filter(
                        (l) =>
                          l.stage_id === s.id &&
                          `${l.name} ${l.phone} ${l.email}`
                            .toLocaleLowerCase()
                            .includes(search.toLocaleLowerCase()),
                      )
                      .map((l) => (
                        <article
                          key={l.id}
                          draggable={enabled && !busy}
                          onDragStart={(e) =>
                            e.dataTransfer.setData("text/plain", l.id)
                          }
                          className="rounded-lg border bg-card p-3 space-y-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <button
                              className="text-left text-sm font-semibold break-words min-w-0"
                              onClick={() => setLeadDialog(l)}
                              disabled={!enabled}
                            >
                              {l.name}
                            </button>
                            <Menu label={`Opções do lead ${l.name}`}>
                              <DropdownMenuItem
                                disabled={!enabled || busy}
                                onSelect={() => setLeadDialog(l)}
                              >
                                Editar lead
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={!enabled || busy}
                                className="text-destructive"
                                onSelect={() => {
                                  if (
                                    window.confirm(
                                      `Excluir o lead “${l.name}” desta subconta?`,
                                    )
                                  )
                                    void operation(() =>
                                      workspaceDb
                                        .from("agency_workspace_leads")
                                        .delete()
                                        .eq("id", l.id)
                                        .eq("workspace_id", workspaceId),
                                    );
                                }}
                              >
                                Excluir lead
                              </DropdownMenuItem>
                            </Menu>
                          </div>
                          {l.phone && (
                            <p className="text-xs text-muted-foreground break-all">
                              {l.phone}
                            </p>
                          )}
                          <p className="text-sm">{money(l.value)}</p>
                          <select
                            aria-label={`Etapa de ${l.name}`}
                            className="w-full h-10 rounded-md border bg-background px-2 text-xs"
                            value={l.stage_id}
                            disabled={!enabled || busy}
                            onChange={(e) => moveLead(l, e.target.value)}
                          >
                            {stages.map((stage) => (
                              <option key={stage.id} value={stage.id}>
                                {stage.name}
                              </option>
                            ))}
                          </select>
                        </article>
                      ))}
                  </div>
                </section>
              ))}
            </div>
          </>
        )}
        {section === "settings" && (
          <>
            <section className="border rounded-xl p-4 space-y-3 bg-card">
              <h2 className="font-semibold">Empresa</h2>
              <p className="text-sm text-muted-foreground break-words">
                {w.description || "Nenhuma descrição cadastrada."}
              </p>
              <Button
                variant="outline"
                onClick={() => setWorkspaceDialog(true)}
              >
                Editar subconta
              </Button>
            </section>
            <section className="border rounded-xl p-4 space-y-3 bg-card">
              <h2 className="font-semibold">Equipe e acesso</h2>
              <p className="text-sm">Você · Proprietário</p>
              <p className="text-sm text-muted-foreground">
                Neste piloto, o acesso fica restrito à conta de testes. Convites
                para clientes e outros membros serão liberados em uma próxima
                etapa.
              </p>
            </section>
            <section className="border rounded-xl p-4 space-y-2 bg-card">
              <h2 className="font-semibold">Próximas integrações</h2>
              <p className="text-sm text-muted-foreground">
                WhatsApp, formulários, agendamentos e automações serão
                conectados por subconta. As conexões da sua agência continuam na
                Central.
              </p>
            </section>
          </>
        )}
        {workspaceDialog && (
          <WorkspaceDialog
            workspace={w}
            onClose={() => setWorkspaceDialog(false)}
            onSaved={refresh}
          />
        )}
        {leadDialog && pipeline && (
          <LeadDialog
            key={leadDialog === "new" ? "new" : leadDialog.id}
            workspace={workspaceId}
            pipeline={pipeline.id}
            stages={stages}
            lead={leadDialog === "new" ? undefined : leadDialog}
            onClose={() => setLeadDialog(null)}
            onSaved={refresh}
          />
        )}
        {pipelineDialog && (
          <PipelineDialog
            workspace={workspaceId}
            pipeline={pipelineDialog === "edit" ? pipeline : undefined}
            stages={pipelineDialog === "edit" ? stages : []}
            leads={leads}
            onClose={() => setPipelineDialog(null)}
            onSaved={refresh}
          />
        )}
      </main>
    </div>
  );
}
