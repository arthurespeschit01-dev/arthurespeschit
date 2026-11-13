import { useTheme } from "@/contexts/ThemeContext";
import { useCallback, useState, useEffect, useRef } from "react";
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
  trigger: "Quando acontecer",
  condition: "Condição",
  add_tags: "Adicionar etiquetas",
  remove_tags: "Remover etiquetas",
  move_stage: "Mover no CRM",
  create_task: "Criar tarefa",
  notify: "Notificação interna",
  wait: "Esperar",
  assign_user: "Atribuir responsável",
  send_message: "Enviar WhatsApp",
};
const events: Record<string, string> = {
  form_submitted: "Formulário preenchido",
  appointment_created: "Agendamento realizado",
  lead_created: "Lead criado",
  stage_changed: "Etapa do CRM alterada",
  tag_added: "Etiqueta adicionada",
  message_received: "Mensagem no WhatsApp",
  external_webhook: "Webhook externo",
};
function Block({ data, selected }: NodeProps) {
  const kind = String(data.kind);
  return (
    <div
      className={`min-w-48 max-w-64 rounded-xl border-2 p-4 bg-card text-card-foreground shadow-sm ${selected ? "border-primary" : "border-border"}`}
    >
      <Handle type="target" position={Position.Top} />
      <p className="text-xs text-primary font-semibold uppercase">
        {kind === "trigger"
          ? "Gatilho"
          : kind === "condition"
            ? "Condição"
            : "Ação"}
      </p>
      <p className="font-semibold text-sm mt-1">{labels[kind]}</p>
      <p className="text-xs text-muted-foreground mt-2 whitespace-pre-wrap break-words">
        {String(data.summary || "Clique para configurar")}
      </p>
      {kind === "condition" ? (
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
            <span>Sim</span>
            <span>Não</span>
          </div>
        </>
      ) : (
        <Handle type="source" position={Position.Bottom} />
      )}
    </div>
  );
}
const nodeTypes = { block: Block };
const summary = (n: FlowNode) =>
  n.type === "trigger"
    ? events[String(n.data.event)] || "Escolha um gatilho"
    : n.type === "wait"
      ? `${n.data.minutes || 1} minuto(s)`
      : n.type.includes("tags")
        ? ((n.data.tags as string[]) || []).join(", ")
        : String(n.data.text || n.data.field || "Configurar ação");
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
          forms={forms}
          calendars={calendars}
          stages={stages}
          members={members}
          manage={manage}
          onClose={() => setEditing(null)}
          save={(f) =>
            run(async () => {
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
                : await workspaceDb
                    .from("agency_workspace_flows")
                    .insert(values);
              if (!r.error) setEditing(null);
              return r;
            })
          }
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
  forms,
  calendars,
  stages,
  members,
  manage,
  onClose,
  save,
}: {
  value: WorkspaceFlow;
  forms: CaptureForm[];
  calendars: WorkspaceCalendar[];
  stages: WorkspaceStage[];
  members: TeamMember[];
  manage: boolean;
  onClose: () => void;
  save: (f: WorkspaceFlow) => void;
}) {
  const { theme } = useTheme();
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
  const nodes: Node[] = raw.map((n) => ({
    id: n.id,
    type: "block",
    position: n.position,
    selected: n.id === selected,
    data: { kind: n.type, summary: summary(n) },
  }));
  const current = raw.find((n) => n.id === selected);
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setRaw((prior) => {
      const visual = prior.map((n) => ({
        id: n.id,
        position: n.position,
        data: n.data,
      }));
      const next = applyNodeChanges(changes, visual);
      return next.map((n) => ({
        ...prior.find((p) => p.id === n.id)!,
        position: n.position,
      }));
    });
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
  const add = (type: string) => {
    const id = "node_" + crypto.randomUUID().slice(0, 8);
    setRaw([
      ...raw,
      {
        id,
        type,
        position: { x: 120 + (raw.length % 2) * 300, y: 80 + raw.length * 170 },
        data:
          type === "trigger"
            ? { event: "form_submitted" }
            : type === "condition"
              ? {
                  match: "all",
                  rules: [
                    { field: "source", operator: "equals", value: "form" },
                  ],
                }
              : type === "wait"
                ? { minutes: 60 }
                : type.includes("tags")
                  ? { tags: ["Nova etiqueta"] }
                  : type === "move_stage"
                    ? { stage_id: stages[0]?.id }
                    : type === "assign_user"
                      ? { user_id: members[0]?.user_id }
                      : {
                          text:
                            type === "create_task"
                              ? "Entrar em contato com {nome}"
                              : "Novo contato: {nome}",
                        },
      },
    ]);
    setSelected(id);
  };
  const d = current?.data || {};
  const rule = (
    d.rules as { field: string; operator: string; value: string }[]
  )?.[0] || { field: "source", operator: "equals", value: "form" };
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
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
          disabled={!manage}
          onClick={() => {
            if (!name.trim()) {
              setError("Informe o nome.");
              return;
            }
            save({
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
          }}
        >
          Salvar funil
        </Button>
        <Button variant="outline" onClick={onClose}>
          Fechar editor
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Adicione blocos e arraste das saídas para as entradas. Clique em um
        bloco para configurá-lo. Selecione uma conexão e pressione Delete para
        removê-la. Use os botões de zoom também no celular.
      </p>
      <div className="grid xl:grid-cols-[180px_minmax(0,1fr)_250px] gap-3">
        <aside className="border rounded-lg p-3 flex xl:flex-col gap-2 overflow-x-auto">
          {Object.entries(labels).map(([k, v]) => (
            <Button
              key={k}
              variant="outline"
              size="sm"
              disabled={!manage || raw.length >= 40}
              onClick={() => add(k)}
              className="shrink-0 justify-start"
            >
              + {v}
            </Button>
          ))}
        </aside>
        <div
          ref={canvas}
          className="h-[540px] min-w-0 border rounded-xl bg-muted/30"
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
            minZoom={0.2}
            maxZoom={1.5}
          >
            <Background />
            <Controls />
            <MiniMap className="hidden sm:block" pannable zoomable />
          </ReactFlow>
        </div>
        <aside className="border rounded-lg p-3 space-y-3 min-w-0">
          {current ? (
            <>
              <h3 className="font-semibold text-sm">{labels[current.type]}</h3>
              <fieldset disabled={!manage} className="space-y-3 min-w-0">
                {current.type === "trigger" && (
                  <>
                    <label className="text-sm block">
                      Evento
                      <select
                        className={selectClass + " w-full"}
                        value={String(d.event || "form_submitted")}
                        onChange={(e) =>
                          patch({ event: e.target.value, source_id: "" })
                        }
                      >
                        {Object.entries(events).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </label>
                    {["form_submitted", "appointment_created"].includes(
                      String(d.event),
                    ) && (
                      <label className="text-sm block">
                        Origem
                        <select
                          className={selectClass + " w-full"}
                          value={String(d.source_id || "")}
                          onChange={(e) => patch({ source_id: e.target.value })}
                        >
                          <option value="">Todas</option>
                          {(d.event === "form_submitted"
                            ? forms
                            : calendars
                          ).map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.title}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    {d.event === "message_received" && (
                      <>
                        <Input
                          placeholder="Texto contém (opcional)"
                          aria-label="Filtro de mensagem"
                          value={String(d.contains || "")}
                          onChange={(e) => patch({ contains: e.target.value })}
                        />
                        <select
                          aria-label="Direção da mensagem"
                          className={selectClass}
                          value={String(d.direction || "incoming")}
                          onChange={(e) => patch({ direction: e.target.value })}
                        >
                          <option value="both">Qualquer direção</option>
                          <option value="incoming">Recebida</option>
                          <option value="outgoing">Enviada</option>
                        </select>
                        <label className="text-sm flex gap-2">
                          <input
                            type="checkbox"
                            checked={!!d.first_contact}
                            onChange={(e) =>
                              patch({ first_contact: e.target.checked })
                            }
                          />
                          Somente primeiro contato
                        </label>
                      </>
                    )}
                  </>
                )}
                {current.type === "condition" && (
                  <>
                    <select
                      aria-label="Campo da condição"
                      className={selectClass + " w-full"}
                      value={rule.field}
                      onChange={(e) =>
                        patch({ rules: [{ ...rule, field: e.target.value }] })
                      }
                    >
                      {[
                        ["source", "Origem do lead"],
                        ["tag", "Etiqueta"],
                        ["stage", "ID da etapa"],
                        ["message", "Mensagem"],
                        ["value", "Valor"],
                        ["email", "E-mail"],
                        ["phone", "Telefone"],
                        ["name", "Nome"],
                        ...forms.flatMap((f) =>
                          f.fields.map((x) => [
                            "answer:" + x.id,
                            `Resposta: ${x.label}`,
                          ]),
                        ),
                      ].map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Operador"
                      className={selectClass + " w-full"}
                      value={rule.operator}
                      onChange={(e) =>
                        patch({
                          rules: [{ ...rule, operator: e.target.value }],
                        })
                      }
                    >
                      {[
                        ["equals", "Igual a"],
                        ["not_equals", "Diferente de"],
                        ["contains", "Contém"],
                        ["filled", "Preenchido"],
                        ["not_filled", "Não preenchido"],
                        ["greater_than", "Maior que"],
                      ].map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                    <Input
                      aria-label="Valor da condição"
                      value={rule.value || ""}
                      onChange={(e) =>
                        patch({ rules: [{ ...rule, value: e.target.value }] })
                      }
                    />
                  </>
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
    </section>
  );
}
