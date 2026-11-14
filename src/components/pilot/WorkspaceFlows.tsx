import FlowTriggerFields from "./FlowTriggerFields";
import FlowExecutions from "./FlowExecutions";
import FlowConditions from "./FlowConditions";
import FlowAdvancedFields from "./FlowAdvancedFields";
import { createPortal } from "react-dom";
import { workflowCatalog, flowLabels } from "./workflowCatalog";
import { useTheme } from "@/contexts/ThemeContext";
import { useCallback, useState, useEffect, useRef, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { workspaceDb, type WorkspaceStage } from "@/lib/clientWorkspaces";
import {
  type WorkspaceFlow,
  type FlowNode,
  type FlowEdge,
  type CaptureForm,
  type WorkspaceCalendar,
  type FlowRun,
  type TeamMember,
  selectClass,
  dateLabel,
} from "@/lib/workspaceCommercial";
import { RecordMenu, Empty } from "./CommercialShared";
const labels: Record<string, string> = {
  ...flowLabels,
  trigger: "Quando acontecer",
  stage: "Estágio",
  add_tags: "Adicionar etiquetas",
};
const events: Record<string, string> = {
  form_submitted: "Formulário preenchido",
  appointment_created: "Agendamento realizado",
  lead_created: "Lead criado",
  stage_changed: "Etapa do CRM alterada",
  tag_added: "Etiqueta adicionada",
  message_received: "Mensagem no WhatsApp",
  external_webhook: "Webhook externo",
  meta_lead: "Formulário Meta Ads",
};
function Block({ data, selected }: NodeProps) {
  const kind = String(data.kind);
  return (
    <div
      className={`min-w-[260px] max-w-[320px] rounded-xl border-2 p-4 bg-card text-card-foreground shadow-sm ${selected ? "border-primary" : "border-border"}`}
    >
      <Handle type="target" position={Position.Top} />
      <p className="text-xs text-primary font-semibold uppercase">
        {kind === "trigger"
          ? "Gatilho"
          : kind === "stage"
            ? "Estágio"
            : kind === "condition"
              ? "Condição"
              : "Ação"}
      </p>
      <p className="font-semibold text-sm mt-1">
        {String(data.title || labels[kind])}
      </p>
      <p className="text-xs text-muted-foreground mt-2 whitespace-pre-wrap break-words">
        {String(data.summary || "Clique para configurar")}
      </p>
      {kind !== "trigger" && data.connected === false && (
        <p className="text-xs text-muted-foreground mt-1">
          Sem conexão de entrada
        </p>
      )}
      {kind === "split" ? (
        <>
          {(
            (data.outlets as {
              id: string;
              label: string;
              weight: number;
            }[]) || [
              { id: "yes", label: "A", weight: 50 },
              { id: "no", label: "B", weight: 50 },
            ]
          ).map((b, i, all) => (
            <Handle
              key={b.id}
              type="source"
              position={Position.Bottom}
              id={b.id}
              title={b.label + " " + b.weight + "%"}
              style={{ left: `${((i + 1) * 100) / (all.length + 1)}%` }}
            />
          ))}
          <p className="text-[10px] mt-2">
            {((data.outlets as { label: string; weight: number }[]) || [])
              .map((b) => b.label + " " + b.weight + "%")
              .join(" · ")}
          </p>
        </>
      ) : ["condition", "wait_response", "team_response"].includes(kind) ? (
        <>
          <Handle
            type="source"
            position={Position.Bottom}
            id="yes"
            style={{ left: "30%", background: "#22c55e" }}
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="no"
            style={{ left: "70%", background: "#ef4444" }}
          />
          <div className="flex justify-between text-[10px] mt-2">
            <span>{String(data.yes_label || "Sim")}</span>
            <span>{String(data.no_label || "Não")}</span>
          </div>
        </>
      ) : (
        <Handle type="source" position={Position.Bottom} />
      )}
    </div>
  );
}
const nodeTypes = { block: Block };
const summary = (n: FlowNode, stages: WorkspaceStage[]) => {
  const stage = (id: unknown) => stages.find((s) => s.id === id)?.name;
  if (n.type === "trigger") {
    const event = String(n.data.event),
      label = events[event] || "Escolha um gatilho";
    if (event === "stage_changed")
      return `${label} · ${stage(n.data.from_stage_id) || "Qualquer origem"} → ${stage(n.data.to_stage_id) || "Qualquer destino"}`;
    if (event === "external_webhook")
      return n.data.webhook_id
        ? "Webhook configurado · confira a ativação"
        : "Gere a URL de recebimento";
    if (event === "tag_added")
      return `${label} · ${n.data.tag || "Qualquer etiqueta"}`;
    if (event === "message_received")
      return `${label} · ${n.data.message_mode === "first_contact" ? "Contato novo" : n.data.message_mode === "first_unanswered" ? "Nova sequência" : "Todas as mensagens"}${(n.data.texts as string[] | undefined)?.length ? " · com filtro de texto" : ""}`;
    return label;
  }
  if (n.type === "team_response" || n.type === "wait_response")
    return `${n.data.minutes || 1} min · ${n.data.response_mode === "deadline" ? "Conferir no fim do prazo" : "Continuar ao responder"}${n.data.deduplicate ? " · Agrupar mensagens" : ""}`;
  if (n.type === "move_stage")
    return `Mover para ${stage(n.data.stage_id) || "etapa a configurar"}`;
  if (n.type === "wait") return `${n.data.minutes || 1} minuto(s)`;
  if (n.type.includes("tags"))
    return ((n.data.tags as string[]) || []).join(", ");
  return String(n.data.text || n.data.field || "Configurar ação");
};
export default function WorkspaceFlows({
  workspace,
  flows,
  runs,
  forms,
  calendars,
  stages,
  members,
  manage,
  run,
}: {
  workspace: string;
  flows: WorkspaceFlow[];
  runs: FlowRun[];
  forms: CaptureForm[];
  calendars: WorkspaceCalendar[];
  stages: WorkspaceStage[];
  members: TeamMember[];
  manage: boolean;
  run: (fn: () => PromiseLike<{ error: unknown }>) => void;
}) {
  const [editing, setEditing] = useState<WorkspaceFlow | null>(null),
    [history, setHistory] = useState(""),
    [steps, setSteps] = useState<
      {
        node_id: string;
        action: string;
        status: string;
        detail: string | null;
      }[]
    >([]),
    [stepError, setStepError] = useState("");
  return (
    <div className="space-y-4">
      <div className="flex justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Funis e automações</h2>
          <p className="text-sm text-muted-foreground">
            Gatilhos → condições → ações. As execuções ficam registradas e
            esperas continuam no servidor.
          </p>
        </div>
        {manage && (
          <Button
            onClick={() =>
              setEditing({
                id: "",
                name: "Novo funil",
                enabled: false,
                version: 1,
                definition: {
                  nodes: [
                    {
                      id: "trigger",
                      type: "trigger",
                      position: { x: 120, y: 80 },
                      data: { event: "form_submitted" },
                    },
                  ],
                  edges: [],
                },
              })
            }
          >
            Novo funil
          </Button>
        )}
      </div>
      {editing ? (
        <FlowEditor
          key={editing.id || "new"}
          value={editing}
          workspace={workspace}
          forms={forms}
          calendars={calendars}
          stages={stages}
          members={members}
          manage={manage}
          onClose={() => setEditing(null)}
          save={async (f) => {
            const values = {
              workspace_id: workspace,
              name: f.name,
              enabled: f.enabled,
              definition: f.definition,
            };
            const r = f.id
              ? await workspaceDb
                  .from("agency_workspace_flows")
                  .update(values)
                  .eq("workspace_id", workspace)
                  .eq("id", f.id)
              : await workspaceDb.from("agency_workspace_flows").insert(values);
            if (r.error) throw r.error;
            run(async () => ({ error: null }));
            setEditing(null);
          }}
        />
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {flows.map((f) => (
            <article
              className="border rounded-xl bg-card p-4 space-y-3"
              key={f.id}
            >
              <div className="flex justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{f.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {f.enabled ? "Ativo" : "Pausado"} · versão {f.version} ·{" "}
                    {f.definition.nodes.length} blocos
                  </p>
                </div>
                <RecordMenu
                  enabled={manage}
                  edit={() => setEditing(f)}
                  toggle={() =>
                    run(() =>
                      workspaceDb
                        .from("agency_workspace_flows")
                        .update({ enabled: !f.enabled })
                        .eq("workspace_id", workspace)
                        .eq("id", f.id),
                    )
                  }
                  remove={() =>
                    run(() =>
                      workspaceDb
                        .from("agency_workspace_flows")
                        .delete()
                        .eq("workspace_id", workspace)
                        .eq("id", f.id),
                    )
                  }
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditing(f)}
                >
                  {manage ? "Abrir editor" : "Visualizar"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setHistory(history === f.id ? "" : f.id)}
                >
                  Execuções ({runs.filter((r) => r.flow_id === f.id).length})
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
      {!flows.length && !editing && (
        <Empty>Crie um funil e conecte um gatilho às ações desejadas.</Empty>
      )}
      <section className="space-y-2">
        <div className="flex justify-between gap-2">
          <h3 className="font-semibold">Histórico de execuções</h3>
          {history && (
            <Button variant="ghost" size="sm" onClick={() => setHistory("")}>
              Ver todos
            </Button>
          )}
        </div>
        {runs
          .filter((r) => !history || r.flow_id === history)
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .slice(0, 50)
          .map((r) => (
            <article key={r.id} className="border rounded-lg p-3 bg-card">
              <button
                className="w-full text-left text-sm flex flex-wrap gap-2 justify-between"
                onClick={() => {
                  void workspaceDb
                    .from("agency_workspace_flow_steps")
                    .select("node_id,action,status,detail")
                    .eq("workspace_id", workspace)
                    .eq("run_id", r.id)
                    .then(({ data, error }) => {
                      setSteps(data || []);
                      setStepError(
                        error ? "Não foi possível carregar os passos." : "",
                      );
                    });
                }}
              >
                <span>
                  {flows.find((f) => f.id === r.flow_id)?.name || "Funil"} ·{" "}
                  {dateLabel(r.created_at)}
                </span>
                <span>
                  {(
                    {
                      queued: "Na fila",
                      running: "Executando",
                      waiting: "Aguardando",
                      completed: "Concluído",
                      failed: "Falhou",
                      cancelled: "Cancelado",
                    } as Record<string, string>
                  )[r.status] || r.status}
                </span>
              </button>
              {r.error && (
                <p className="text-xs text-destructive mt-2">{r.error}</p>
              )}
            </article>
          ))}
        {!runs.length && (
          <Empty>
            Nenhuma execução ainda. Preencha um formulário vinculado a um funil
            ativo para testar o fluxo real.
          </Empty>
        )}
        {stepError && <p role="alert">{stepError}</p>}
        {steps.length > 0 && (
          <div className="border rounded-lg p-3 space-y-2">
            <h4 className="font-semibold text-sm">
              Passos da execução selecionada
            </h4>
            {steps.map((s) => (
              <p key={s.node_id} className="text-xs">
                {labels[s.action] || s.action} · {s.status}
                {s.detail ? ` · ${s.detail}` : ""}
              </p>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
function FlowEditor({
  value,
  workspace,
  forms,
  calendars,
  stages,
  members,
  manage,
  onClose,
  save,
}: {
  value: WorkspaceFlow;
  workspace: string;
  forms: CaptureForm[];
  calendars: WorkspaceCalendar[];
  stages: WorkspaceStage[];
  members: TeamMember[];
  manage: boolean;
  onClose: () => void;
  save: (f: WorkspaceFlow) => Promise<void>;
}) {
  const { theme } = useTheme();
  const [catalogSearch, setCatalogSearch] = useState(""),
    [catalogOpen, setCatalogOpen] = useState(false),
    [saving, setSaving] = useState(false),
    [executionOpen, setExecutionOpen] = useState(false);
  const canvas = useRef<HTMLDivElement>(null);
  const [instance, setInstance] = useState<ReactFlowInstance | null>(null);
  useEffect(() => {
    if (!canvas.current || !instance) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        void instance.fitView({ padding: 0.15, minZoom: 0.2, maxZoom: 1 });
      });
    });
    observer.observe(canvas.current);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [instance]);
  const [name, setName] = useState(value.name),
    [enabled, setEnabled] = useState(value.enabled),
    [selected, setSelected] = useState(""),
    [raw, setRaw] = useState<FlowNode[]>(value.definition.nodes),
    [edges, setEdges] = useState<Edge[]>(
      value.definition.edges.map((e) => ({
        ...e,
        sourceHandle: e.branch || null,
        label:
          e.branch === "yes" ? "Sim" : e.branch === "no" ? "Não" : undefined,
      })),
    ),
    [error, setError] = useState("");
  const [sizes, setSizes] = useState<
    Record<string, { width: number; height: number }>
  >({});
  const nodes: Node[] = useMemo(
    () =>
      raw.map((n) => ({
        id: n.id,
        type: "block",
        position: n.position,
        selected: n.id === selected,
        measured: sizes[n.id],
        data: {
          kind: n.type,
          title: n.data.label || labels[n.type],
          yes_label:
            n.type === "team_response" || n.type === "wait_response"
              ? "Respondeu"
              : "Sim",
          no_label:
            n.type === "team_response"
              ? "Sem resposta"
              : n.type === "wait_response"
                ? "Prazo esgotado"
                : "Não",
          connected: edges.some((e) => e.target === n.id),
          outlets: n.data.branches,
          summary: summary(n, stages),
        },
      })),
    [raw, selected, sizes, edges, stages],
  );
  const current = raw.find((n) => n.id === selected);
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setSizes((prior) => {
      let next = prior;
      for (const c of changes) {
        if (
          c.type === "dimensions" &&
          c.dimensions &&
          (prior[c.id]?.width !== c.dimensions.width ||
            prior[c.id]?.height !== c.dimensions.height)
        ) {
          next = { ...next, [c.id]: c.dimensions };
        }
      }
      return next;
    });
    setRaw((prior) => {
      let next = prior;
      for (const change of changes) {
        if (change.type === "position" && change.position)
          next = next.map((n) =>
            n.id === change.id ? { ...n, position: change.position! } : n,
          );
        if (change.type === "remove")
          next = next.filter((n) => n.id !== change.id);
      }
      return next;
    });
    for (const c of changes) {
      if (c.type === "select" && c.selected) setSelected(c.id);
      if (c.type === "remove")
        setEdges((prior) =>
          prior.filter((e) => e.source !== c.id && e.target !== c.id),
        );
    }
  }, []);
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) =>
      setEdges((prior) => applyEdgeChanges(changes, prior)),
    [],
  );
  const connect = (c: Connection) =>
    setEdges((prior) =>
      addEdge(
        {
          ...c,
          label:
            c.sourceHandle === "yes"
              ? "Sim"
              : c.sourceHandle === "no"
                ? "Não"
                : undefined,
        },
        prior,
      ),
    );
  const patch = (data: Record<string, unknown>) =>
    setRaw((prior) =>
      prior.map((n) =>
        n.id === selected ? { ...n, data: { ...n.data, ...data } } : n,
      ),
    );
  const add = (
    type: string,
    label = labels[type],
    event?: string,
    position?: { x: number; y: number },
  ) => {
    if (!manage || raw.length >= 40) return;
    const id = "node_" + crypto.randomUUID().slice(0, 8);
    const rect = canvas.current?.getBoundingClientRect();
    const center =
      position ||
      (instance && rect
        ? instance.screenToFlowPosition({
            x: rect.left + rect.width * 0.4,
            y: rect.top + rect.height * 0.5,
          })
        : { x: 160, y: 160 });
    const data: Record<string, unknown> =
      type === "trigger"
        ? { event: event || "form_submitted", config_version: 2 }
        : type === "condition"
          ? {
              match: "all",
              rules: [{ field: "source", operator: "equals", value: "form" }],
            }
          : ["wait_response", "team_response"].includes(type)
            ? {
                minutes: 15,
                reply_anchor:
                  type === "team_response" ? "last_incoming" : "last_outgoing",
                response_mode:
                  type === "team_response" ? "deadline" : "immediate",
                deduplicate: true,
              }
            : type === "wait"
              ? { minutes: 60 }
              : type === "wait_appointment"
                ? { minutes: 60 }
                : type === "business_hours"
                  ? {
                      days: [1, 2, 3, 4, 5],
                      start: "09:00",
                      end: "18:00",
                      timezone: "America/Sao_Paulo",
                    }
                  : type === "split"
                    ? {
                        branches: [
                          { id: "yes", label: "Caminho A", weight: 50 },
                          { id: "no", label: "Caminho B", weight: 50 },
                        ],
                      }
                    : type.includes("tags")
                      ? { tags: ["Nova etiqueta"] }
                      : type === "move_stage"
                        ? { stage_id: stages[0]?.id }
                        : type === "assign_user"
                          ? { user_id: members[0]?.user_id }
                          : type === "distribute"
                            ? {
                                user_ids: members
                                  .filter((m) => m.role !== "viewer")
                                  .map((m) => m.user_id),
                              }
                            : type === "meta_event"
                              ? { event_name: "Lead" }
                              : {
                                  text:
                                    type === "create_task"
                                      ? "Entrar em contato com {nome}"
                                      : type === "create_group"
                                        ? "Atendimento de {nome}"
                                        : "Olá, {nome}!",
                                  subject: "Contato da equipe",
                                  participants: [],
                                };
    setRaw((prior) => [
      ...prior,
      { id, type, position: center, data: { ...data, label } },
    ]);
    setSelected(id);
    setCatalogOpen(false);
    if (instance)
      void instance.setCenter(center.x + 140, center.y + 60, {
        zoom: Math.max(instance.getZoom(), 0.8),
        duration: 200,
      });
  };
  const dirty =
    JSON.stringify({
      name,
      enabled,
      definition: {
        nodes: raw,
        edges: edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          ...(e.sourceHandle ? { branch: e.sourceHandle } : {}),
        })),
      },
    }) !==
    JSON.stringify({
      name: value.name,
      enabled: value.enabled,
      definition: value.definition,
    });
  const close = () => {
    if (
      !saving &&
      (!dirty || window.confirm("Sair do editor sem salvar as alterações?"))
    )
      onClose();
  };
  useEffect(() => {
    const listener = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", listener);
    return () => window.removeEventListener("beforeunload", listener);
  }, [dirty]);
  const d = current?.data || {};
  const rule = (
    d.rules as { field: string; operator: string; value: string }[]
  )?.[0] || { field: "source", operator: "equals", value: "form" };
  return createPortal(
    <section
      aria-label="Editor de automações"
      className="fixed inset-0 z-[90] bg-background text-foreground flex flex-col"
    >
      <header className="flex flex-wrap gap-2 items-center border-b px-4 py-3 shrink-0">
        <Input
          aria-label="Nome do funil"
          className="max-w-md"
          value={name}
          disabled={!manage}
          onChange={(e) => setName(e.target.value)}
        />
        <label className="text-sm flex gap-2">
          <input
            type="checkbox"
            disabled={!manage}
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Ativo
        </label>
        <Button
          disabled={!manage || saving}
          onClick={async () => {
            if (!name.trim()) {
              setError("Informe o nome.");
              return;
            }
            setSaving(true);
            setError("");
            try {
              await save({
                ...value,
                name,
                enabled,
                definition: {
                  nodes: raw,
                  edges: edges.map((e) => ({
                    id: e.id,
                    source: e.source,
                    target: e.target,
                    ...(e.sourceHandle ? { branch: e.sourceHandle } : {}),
                  })) as FlowEdge[],
                },
              });
            } catch (e) {
              setError((e as Error).message || "Não foi possível salvar.");
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? "Salvando…" : "Salvar funil"}
        </Button>
        <Button variant="outline" disabled={saving} onClick={close}>
          Fechar editor
        </Button>
        <Button
          variant="outline"
          onClick={() => setExecutionOpen(!executionOpen)}
        >
          Execuções
        </Button>
        <Button
          variant="outline"
          className="md:hidden"
          onClick={() => setCatalogOpen(!catalogOpen)}
        >
          Blocos
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setRaw((prior) =>
              prior.map((n, i) => ({
                ...n,
                position: {
                  x: n.type === "trigger" ? 200 : 200 + (i % 2) * 340,
                  y: 80 + i * 180,
                },
              })),
            );
            requestAnimationFrame(
              () => void instance?.fitView({ padding: 0.15 }),
            );
          }}
        >
          Organizar
        </Button>
      </header>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-1 min-h-0 relative">
        {executionOpen && (
          <FlowExecutions
            workspace={workspace}
            flow={value.id}
            onClose={() => setExecutionOpen(false)}
          />
        )}
        <aside
          aria-label="Catálogo de blocos"
          className={`${catalogOpen ? "absolute inset-y-0 left-0 z-30 w-[min(320px,90vw)]" : "hidden"} md:relative md:block md:w-[300px] shrink-0 border-r bg-card overflow-y-auto p-3 space-y-3`}
        >
          <h2 className="font-semibold">Blocos</h2>
          <Input
            aria-label="Buscar bloco"
            placeholder="Buscar bloco…"
            value={catalogSearch}
            onChange={(e) => setCatalogSearch(e.target.value)}
          />
          {workflowCatalog.map((group, index) => (
            <details key={group.group} open className="border-b pb-3">
              <summary
                className={`text-xs font-semibold py-3 cursor-pointer ${index === 0 ? "text-blue-500" : index === 1 ? "text-purple-500" : "text-emerald-500"}`}
              >
                {group.group}
              </summary>
              <p className="text-xs text-muted-foreground mb-3">{group.hint}</p>
              <div className="space-y-2">
                {group.items
                  .filter(([, label, description]) =>
                    (label + " " + description)
                      .toLowerCase()
                      .includes(catalogSearch.toLowerCase()),
                  )
                  .map(([type, label, description, event]) => (
                    <button
                      key={label}
                      disabled={!manage || raw.length >= 40}
                      draggable={manage}
                      onDragStart={(e) =>
                        e.dataTransfer.setData(
                          "application/workspace-block",
                          JSON.stringify({ type, label, event }),
                        )
                      }
                      onClick={() => add(type, label, event)}
                      className="w-full text-left border rounded-xl p-3 hover:border-primary hover:bg-primary/5 focus-visible:outline-primary"
                    >
                      <span className="block text-xs font-semibold">
                        {label}
                      </span>
                      <span className="block text-xs text-muted-foreground mt-1 leading-4">
                        {description}
                      </span>
                    </button>
                  ))}
              </div>
            </details>
          ))}
        </aside>
        <div
          ref={canvas}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }}
          onDrop={(e) => {
            e.preventDefault();
            try {
              const item = JSON.parse(
                e.dataTransfer.getData("application/workspace-block"),
              );
              add(
                item.type,
                item.label,
                item.event,
                instance?.screenToFlowPosition({ x: e.clientX, y: e.clientY }),
              );
            } catch {
              /* ignore external drops */
            }
          }}
          className="flex-1 min-w-0 h-full bg-muted/20"
        >
          <ReactFlow
            colorMode={theme}
            onInit={setInstance}
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={manage ? onNodesChange : undefined}
            onEdgesChange={manage ? onEdgesChange : undefined}
            onConnect={manage ? connect : undefined}
            onNodeClick={(_, n) => setSelected(n.id)}
            nodesDraggable={manage}
            nodesConnectable={manage}
            deleteKeyCode={manage ? ["Backspace", "Delete"] : null}
            fitView
            minZoom={0.25}
            maxZoom={1.5}
          >
            <Background />
            <Controls />
            <MiniMap
              className="hidden sm:block"
              nodeColor="#8b5cf6"
              nodeStrokeColor="#a78bfa"
              pannable
              zoomable
            />
          </ReactFlow>
        </div>
        <aside
          aria-label="Configurar bloco"
          className={`${current ? "block" : "hidden"} absolute z-20 right-3 bottom-3 md:top-3 max-h-[65%] md:max-h-[calc(100%-24px)] w-[min(340px,calc(100%-24px))] bg-card shadow-xl border rounded-xl p-4 space-y-3 overflow-y-auto`}
        >
          {current ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold text-sm">
                  {String(current.data.label || labels[current.type])}
                </h3>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelected("")}
                >
                  Fechar
                </Button>
              </div>
              <fieldset disabled={!manage} className="space-y-3 min-w-0">
                <FlowAdvancedFields
                  key={current.id}
                  type={current.type}
                  data={d}
                  patch={patch}
                  members={members}
                  workspace={workspace}
                />
                <label className="block text-sm">
                  Nome do bloco
                  <Input
                    value={String(d.label || labels[current.type])}
                    maxLength={160}
                    onChange={(e) => patch({ label: e.target.value })}
                  />
                </label>
                {current.type === "trigger" && (
                  <FlowTriggerFields
                    key={current.id}
                    workspace={workspace}
                    data={d}
                    patch={patch}
                    stages={stages}
                    forms={forms}
                    calendars={calendars}
                    manage={manage}
                  />
                )}
                {current.type === "condition" && (
                  <FlowConditions
                    data={d}
                    patch={patch}
                    forms={forms}
                    stages={stages}
                  />
                )}
                {current.type.includes("tags") && (
                  <label className="text-sm block">
                    Etiquetas (separadas por vírgula)
                    <Input
                      value={((d.tags as string[]) || []).join(",")}
                      onChange={(e) =>
                        patch({
                          tags: e.target.value.split(",").map((t) => t.trim()),
                        })
                      }
                    />
                  </label>
                )}
                {current.type === "move_stage" && (
                  <select
                    aria-label="Etapa de destino"
                    className={selectClass + " w-full"}
                    value={String(d.stage_id || "")}
                    onChange={(e) => patch({ stage_id: e.target.value })}
                  >
                    <option value="">Escolha a etapa</option>
                    {stages.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                )}
                {current.type === "assign_user" && (
                  <select
                    aria-label="Responsável do lead"
                    className={selectClass + " w-full"}
                    value={String(d.user_id || "")}
                    onChange={(e) => patch({ user_id: e.target.value })}
                  >
                    <option value="">Escolha a pessoa</option>
                    {members
                      .filter((m) => m.role !== "viewer")
                      .map((m) => (
                        <option key={m.user_id} value={m.user_id}>
                          {m.display_name || m.email || "Proprietário"}
                        </option>
                      ))}
                  </select>
                )}
                {["notify", "create_task", "send_message"].includes(
                  current.type,
                ) && (
                  <label className="text-sm block">
                    Texto
                    <Textarea
                      maxLength={
                        current.type === "create_task"
                          ? 200
                          : current.type === "notify"
                            ? 500
                            : 4000
                      }
                      value={String(d.text || "")}
                      onChange={(e) => patch({ text: e.target.value })}
                    />
                    <span className="text-xs text-muted-foreground">
                      Variáveis: {"{nome}, {telefone}, {email}, {valor}"}
                    </span>
                  </label>
                )}
                {current.type === "create_task" && (
                  <label className="text-sm block">
                    Prazo em minutos
                    <Input
                      type="number"
                      min="0"
                      max="43200"
                      value={Number(d.due_minutes ?? 1440)}
                      onChange={(e) =>
                        patch({ due_minutes: Number(e.target.value) })
                      }
                    />
                  </label>
                )}
                {current.type === "wait" && (
                  <label className="text-sm block">
                    Esperar (minutos)
                    <Input
                      type="number"
                      min="1"
                      max="43200"
                      value={Number(d.minutes || 1)}
                      onChange={(e) =>
                        patch({ minutes: Number(e.target.value) })
                      }
                    />
                  </label>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const id = "node_" + crypto.randomUUID().slice(0, 8);
                    setRaw((prior) => [
                      ...prior,
                      {
                        ...current,
                        id,
                        position: {
                          x: current.position.x + 60,
                          y: current.position.y + 150,
                        },
                        data: structuredClone(current.data),
                      },
                    ]);
                    setSelected(id);
                  }}
                >
                  Duplicar bloco
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setRaw(raw.filter((n) => n.id !== selected));
                    setEdges(
                      edges.filter(
                        (e) => e.source !== selected && e.target !== selected,
                      ),
                    );
                    setSelected("");
                  }}
                >
                  Remover bloco
                </Button>
              </fieldset>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Selecione um bloco para editar suas propriedades.
            </p>
          )}
        </aside>
      </div>
    </section>,
    document.body,
  );
}
