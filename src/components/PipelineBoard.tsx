import DeleteItemButton from '@/components/DeleteItemButton';
import {useWhatsAppAccount} from '@/hooks/useWhatsAppAccount';
import {useWhatsAppLive} from '@/hooks/useWhatsAppLive';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import WhatsAppConversation from "@/components/WhatsAppConversation";
import { readAllRows } from "@/lib/readAllRows";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Plus, Settings2, ArrowUp, ArrowDown, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  CONTACT_LABELS,
  DEFAULT_STAGES,
  validateStages,
  stageOutcome,
  type Pipeline,
  type PipelineArea,
  type PipelineCard,
  type Stage,
} from "@/lib/pipelines";

const selectClass =
  "h-10 rounded-md border border-input bg-background px-3 text-sm w-full";
const money = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
type ClientOption = { id: string; name: string; status: string | null };
type CardDraft = Omit<PipelineCard, "id" | "updated_at"> & { id?: string };

export default function PipelineBoard({ area }: { area: PipelineArea }) {
  const { user } = useAuth();
  const account=useWhatsAppAccount();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const [contactFilter, setContactFilter] = useState(params.get("resposta") || "all");
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [cards, setCards] = useState<PipelineCard[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [selected, setSelected] = useState(params.get("pipeline") || "");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const activeClientIds = new Set(
    clients.filter((c) => c.status === "Ativo").map((c) => c.id),
  );
  const [dragged, setDragged] = useState<string | null>(null);
  const [editor, setEditor] = useState<{
    pipeline: Pipeline | null;
    name: string;
    stages: Stage[];
    moves: Record<string, string>;
  } | null>(null);
  const [draft, setDraft] = useState<CardDraft | null>(null);
  const [contactStatusDirty, setContactStatusDirty] = useState(false);
  useEffect(()=>{setDraft(null)},[account.data?.account_id]);
  const activePipeline = pipelines.find((p) => p.id === selected);
  const boardStages = stages
    .filter((s) => s.pipeline_id === selected)
    .sort((a, b) => a.position - b.position);
  const boardCards = cards.filter(
    (c) =>
      c.pipeline_id === selected &&
      (area!=="comercial" || !c.whatsapp_account_id || c.whatsapp_account_id===account.data?.account_id && account.data?.connected) &&
      (area !== "comercial" || contactFilter === "all" || c.contact_status === contactFilter) &&
      (showInactive || !c.client_id || activeClientIds.has(c.client_id)) &&
      `${c.title} ${c.phone}`.toLowerCase().includes(search.toLowerCase()),
  );

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [p, s, c, cl] = await Promise.all([
      readAllRows<Pipeline>((from, to) =>
        supabase
          .from("agency_pipelines")
          .select("*")
          .eq("user_id", user.id)
          .eq("area", area)
          .order("created_at")
          .range(from, to),
      ),
      readAllRows<Stage>((from, to) =>
        supabase
          .from("agency_pipeline_stages")
          .select("*")
          .eq("user_id", user.id)
          .order("position")
          .order("id")
          .range(from, to),
      ),
      readAllRows<PipelineCard>((from, to) =>
        supabase
          .from("agency_pipeline_cards")
          .select("*")
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false })
          .order("id")
          .range(from, to),
      ),
      readAllRows<ClientOption>((from, to) =>
        supabase
          .from("clients")
          .select("id,name,status")
          .eq("user_id", user.id)
          .order("name")
          .order("id")
          .range(from, to),
      ),
    ]);
    const error = p.error || s.error || c.error || cl.error;
    setLoading(false);
    if (error) {
      setLoadError(
        "Não foi possível carregar suas pipelines. Tente atualizar o quadro.",
      );
      return;
    }
    setLoadError("");
    void queryClient.invalidateQueries({ queryKey: ["agency-client-progress", user.id] });
    setPipelines(p.data);
    setStages(s.data);
    setCards(c.data);
    setClients(cl.data);
    setSelected((current) =>
      p.data.some((x) => x.id === current) ? current : p.data[0]?.id || "",
    );
    return c.data;
  }, [user, area, queryClient]);
  useEffect(() => {
    void load();
  }, [load]);
  useWhatsAppLive(()=>{if(area==="comercial")void load()});
  const refreshConversation = useCallback(async () => {
    const updated = await load();
    if (updated)
      setDraft((current) =>
        current
          ? {
              ...current,
              contact_status:
                updated.find((card) => card.id === current.id)
                  ?.contact_status || current.contact_status,
            }
          : current,
      );
  }, [load]);

  const openEditor = (pipeline: Pipeline | null) => {
    const id = pipeline?.id || "";
    setEditor({
      pipeline,
      name: pipeline?.name || "",
      moves: {},
      stages: pipeline
        ? stages
            .filter((s) => s.pipeline_id === id)
            .sort((a, b) => a.position - b.position)
            .map((s) => ({ ...s, outcome: stageOutcome(s) }))
        : DEFAULT_STAGES[area].map((name, position) => ({
            id: crypto.randomUUID(),
            pipeline_id: "",
            name,
            color: "#8b5cf6",
            position,
            outcome: stageOutcome({ name }),
          })),
    });
  };
  const reorder = (index: number, offset: number) => {
    if (!editor) return;
    const next = [...editor.stages];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    setEditor({ ...editor, stages: next });
  };
  const savePipeline = async () => {
    if (!editor || !user) return;
    const invalid = validateStages(editor.stages);
    if (!editor.name.trim() || editor.name.trim().length > 100) {
      toast.error("Informe um nome de até 100 caracteres.");
      return;
    }
    if (invalid) {
      toast.error(invalid);
      return;
    }
    const removed = stages.filter(
      (s) =>
        s.pipeline_id === editor.pipeline?.id &&
        !editor.stages.some((x) => x.id === s.id),
    );
    if (
      removed.some(
        (s) =>
          cards.some((c) => c.stage_id === s.id) &&
          !editor.stages.some((x) => x.id === editor.moves[s.id]),
      )
    ) {
      toast.error("Escolha o destino dos cards das etapas removidas.");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.rpc("save_agency_pipeline", {
      p_id: editor.pipeline?.id || null,
      p_area: area,
      p_name: editor.name.trim(),
      p_revision: editor.pipeline?.revision || 0,
      p_stages: editor.stages.map((s, position) => ({
        id: s.id,
        name: s.name.trim(),
        color: s.color,
        position,
        outcome: s.outcome || null,
      })),
      p_moves: editor.moves,
    });
    setBusy(false);
    if (error) {
      toast.error(
        error.message.includes("alterada")
          ? "Esta pipeline mudou em outra sessão. Feche o editor e atualize o quadro antes de editar novamente."
          : "Não foi possível salvar a pipeline. Os cards foram preservados.",
      );
      return;
    }
    setEditor(null);
    setSelected(data);
    toast.success("Pipeline salva!");
    await load();
  };
  const newCard = () => {
    if (!boardStages[0]) return;
    setContactStatusDirty(false);
    setDraft({
      title: "",
      phone: "",
      notes: "",
      value: 0,
      contact_status: "novo",
      meeting_at: null,
      client_id: null,
      pipeline_id: selected,
      stage_id: boardStages[0].id,
    });
  };
  const saveCard = async () => {
    if (!draft || !user) return;
    if (!draft.title.trim()) {
      toast.error("Informe o título do card.");
      return;
    }
    if (area === "operacao" && !draft.client_id) {
      toast.error("Selecione o cliente.");
      return;
    }
    if (!Number.isFinite(Number(draft.value)) || Number(draft.value) < 0) {
      toast.error("Informe um valor válido.");
      return;
    }
    setBusy(true);
    const id = draft.id;
    const payload = {
      user_id: user.id,
      pipeline_id: draft.pipeline_id,
      stage_id: draft.stage_id,
      client_id: draft.client_id,
      title: draft.title.trim(),
      phone: draft.phone,
      notes: draft.notes,
      value: Number(draft.value),
      meeting_at: draft.meeting_at,
    };
    const result = id
      ? await supabase
          .from("agency_pipeline_cards")
          .update({
            ...payload,
            ...(contactStatusDirty
              ? { contact_status: draft.contact_status }
              : {}),
          })
          .eq("id", id)
          .select("id")
          .single()
      : await supabase
          .from("agency_pipeline_cards")
          .insert({ ...payload, contact_status: draft.contact_status })
          .select("id")
          .single();
    setBusy(false);
    if (result.error) {
      toast.error("Não foi possível salvar o card.");
      return;
    }
    setDraft(null);
    toast.success("Card salvo!");
    await load();
  };
  const moveCard = async (card: PipelineCard, stageId: string) => {
    if (busy || card.stage_id === stageId) return;
    setBusy(true);
    const { error } = await supabase
      .from("agency_pipeline_cards")
      .update({ stage_id: stageId })
      .eq("id", card.id)
      .eq("stage_id", card.stage_id)
      .select("id")
      .single();
    setBusy(false);
    if (error)
      toast.error("Não foi possível mover o card. Atualize e tente novamente.");
    await load();
  };

  if (loading && !pipelines.length)
    return <p role="status">Carregando pipelines…</p>;
  return (
    <div className="space-y-5">
      {loadError && (
        <div className="rounded-xl border p-4 space-y-2">
          <p role="alert">{loadError}</p>
          <Button variant="outline" onClick={() => void load()}>
            Tentar novamente
          </Button>
        </div>
      )}
      <div className="flex flex-wrap gap-3 items-center">
        <label className="min-w-48">
          <span className="sr-only">Pipeline</span>
          <select
            className={selectClass}
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            {!pipelines.length && <option value="">Nenhuma pipeline</option>}
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <Button variant="outline" onClick={() => openEditor(null)}>
          <Plus className="w-4 h-4 mr-2" />
          Nova pipeline
        </Button>
        <Button
          variant="outline"
          disabled={!activePipeline}
          onClick={() => activePipeline && openEditor(activePipeline)}
        >
          <Settings2 className="w-4 h-4 mr-2" />
          Editar pipeline
        </Button>
        <Button disabled={!boardStages.length || busy} onClick={newCard}>
          Novo card
        </Button>
        <Button
          variant="ghost"
          disabled={loading || busy}
          onClick={() => void load()}
        >
          Atualizar
        </Button>
        <Input
          className="max-w-xs"
          aria-label="Buscar cards"
          placeholder="Buscar por nome ou telefone"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {selected&&<DeleteItemButton kind="pipeline" id={selected} title={pipelines.find(p=>p.id===selected)?.name||'pipeline'} description="A pipeline, suas etapas e seus cards serão excluídos. Clientes e conversas permanecem na base." onDeleted={async()=>{setSelected('');await load()}}/>}
      {area === 'comercial' && <label className="block max-w-xs space-y-2 text-sm">Status de resposta<select className={selectClass} value={contactFilter} onChange={e=>setContactFilter(e.target.value)}><option value="all">Todos os status</option>{Object.entries(CONTACT_LABELS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>}
      <label className="flex gap-2 items-center text-sm">
        <input
          type="checkbox"
          checked={showInactive}
          onChange={(e) => setShowInactive(e.target.checked)}
        />
        Mostrar cards de clientes pausados e encerrados
      </label>
      {!pipelines.length && (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <h2 className="font-semibold">Monte seu primeiro fluxo</h2>
          <p className="text-muted-foreground mt-2">
            Crie uma pipeline e personalize as etapas aqui no quadro.
          </p>
        </div>
      )}
      {area === "comercial" && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            [
              "Contatos nesta pipeline",
              cards.filter((c) => c.pipeline_id === selected && (!c.whatsapp_account_id || c.whatsapp_account_id===account.data?.account_id && account.data?.connected)).length,
            ],
            [
              "Aguardando nossa resposta",
              cards.filter(
                (c) =>
                  c.pipeline_id === selected &&
      (area!=="comercial" || !c.whatsapp_account_id || c.whatsapp_account_id===account.data?.account_id && account.data?.connected) &&
                  c.contact_status === "aguardando_agencia",
              ).length,
            ],
            [
              "Aguardando cliente",
              cards.filter(
                (c) =>
                  c.pipeline_id === selected &&
      (area!=="comercial" || !c.whatsapp_account_id || c.whatsapp_account_id===account.data?.account_id && account.data?.connected) &&
                  c.contact_status === "aguardando_cliente",
              ).length,
            ],
            [
              "Valor das oportunidades",
              money(
                cards
                  .filter((c) => c.pipeline_id === selected && (!c.whatsapp_account_id || c.whatsapp_account_id===account.data?.account_id && account.data?.connected))
                  .reduce((sum, c) => sum + Number(c.value), 0),
              ),
            ],
          ].map(([label, value]) => (
            <div className="rounded-xl border p-4" key={label}>
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="text-2xl font-semibold mt-2">{value}</p>
            </div>
          ))}
        </div>
      )}
      {area === "comercial" && (
        <p className="text-xs text-muted-foreground">
          Os indicadores de resposta refletem o status do card e são atualizados
          pelas mensagens do WhatsApp conectado.
        </p>
      )}
      <div
        className="flex gap-4 overflow-x-auto pb-5"
        aria-label="Quadro de pipelines"
      >
        {boardStages.map((stage) => (
          <section
            key={stage.id}
            aria-label={stage.name}
            className="rounded-xl border bg-muted/20 w-72 min-w-72"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const card = cards.find((c) => c.id === dragged);
              setDragged(null);
              if (card) void moveCard(card, stage.id);
            }}
          >
            <header
              className="p-4 border-b border-t-4 rounded-t-xl flex justify-between"
              style={{ borderTopColor: stage.color }}
            >
              <h2 className="font-medium">{stage.name}</h2>
              <span>
                {boardCards.filter((c) => c.stage_id === stage.id).length}
              </span>
            </header>
            <div className="p-3 space-y-3">
              {boardCards
                .filter((c) => c.stage_id === stage.id)
                .map((card) => (
                  <article
                    key={card.id}
                    draggable={!busy}
                    onDragStart={() => setDragged(card.id)}
                    onDragEnd={() => setDragged(null)}
                    className="rounded-lg border bg-background p-3 space-y-3"
                  >
                    <button
                      className="text-left w-full font-semibold hover:text-primary"
                      onClick={() => {
                        setContactStatusDirty(false);
                        setDraft({ ...card });
                      }}
                    >
                      {card.title}
                    </button>
                    {card.client_id && (
                      <p className="text-xs text-muted-foreground">
                        {clients.find((c) => c.id === card.client_id)?.name ||
                          "Cliente indisponível"}
                      </p>
                    )}
                    {area === "comercial" && (
                      <>
                        <p className="text-xs">
                          {CONTACT_LABELS[card.contact_status]}
                        </p>
                        {Number(card.value) > 0 && (
                          <p className="text-sm">{money(Number(card.value))}</p>
                        )}
                      </>
                    )}
                    {card.meeting_at && (
                      <p className="text-xs">
                        {new Date(card.meeting_at).toLocaleString("pt-BR")}
                      </p>
                    )}
                    <DeleteItemButton kind="card" id={card.id} title={card.title} description="Este card e seu vínculo com a pipeline serão removidos. O cliente e as conversas permanecem na base." onDeleted={load}/>
                    <select
                      className={selectClass}
                      aria-label={`Mover ${card.title} para etapa`}
                      disabled={busy}
                      value={card.stage_id}
                      onChange={(e) => void moveCard(card, e.target.value)}
                    >
                      {boardStages.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </article>
                ))}
              {!boardCards.some((c) => c.stage_id === stage.id) && (
                <p className="text-sm text-muted-foreground py-5 text-center">
                  Nenhum card nesta etapa
                </p>
              )}
            </div>
          </section>
        ))}
      </div>
      <Dialog
        open={!!editor}
        onOpenChange={(open) => {
          if (!open && !busy) setEditor(null);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editor?.pipeline ? "Editar pipeline" : "Nova pipeline"}
            </DialogTitle>
            <DialogDescription>
              Configure nomes, cores e ordem das etapas. Cards de etapas
              removidas precisam de um destino.
            </DialogDescription>
          </DialogHeader>
          {editor && (
            <div className="space-y-4">
              <Label htmlFor="pipeline-name">Nome da pipeline</Label>
              <Input
                id="pipeline-name"
                maxLength={100}
                value={editor.name}
                onChange={(e) => setEditor({ ...editor, name: e.target.value })}
              />
              {editor.stages.map((stage, index) => (
                <div key={stage.id} className="flex flex-wrap gap-2 items-center rounded-lg border p-3">
                  <input
                    type="color"
                    aria-label={`Cor da etapa ${index + 1}`}
                    value={stage.color}
                    onChange={(e) =>
                      setEditor({
                        ...editor,
                        stages: editor.stages.map((s) =>
                          s.id === stage.id
                            ? { ...s, color: e.target.value }
                            : s,
                        ),
                      })
                    }
                    className="w-10 h-10 shrink-0"
                  />
                  <Input
                    className="flex-1 min-w-32"
                    aria-label={`Nome da etapa ${index + 1}`}
                    maxLength={80}
                    value={stage.name}
                    onChange={(e) =>
                      setEditor({
                        ...editor,
                        stages: editor.stages.map((s) =>
                          s.id === stage.id
                            ? { ...s, name: e.target.value }
                            : s,
                        ),
                      })
                    }
                  />
                  <select className={`${selectClass} max-w-40`} aria-label={`Tipo da etapa ${index + 1}`} value={stageOutcome(stage)} onChange={e => setEditor({ ...editor, stages: editor.stages.map(s => s.id === stage.id ? { ...s, outcome: e.target.value as Stage['outcome'] } : s) })}>
                    <option value="in_progress">Em andamento</option>
                    {area === 'operacao' ? <option value="completed">Conclui onboarding</option> : <><option value="won">Venda ganha</option><option value="lost">Oportunidade perdida</option></>}
                  </select>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Subir etapa ${index + 1}`}
                    disabled={index === 0}
                    onClick={() => reorder(index, -1)}
                  >
                    <ArrowUp className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Descer etapa ${index + 1}`}
                    disabled={index === editor.stages.length - 1}
                    onClick={() => reorder(index, 1)}
                  >
                    <ArrowDown className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Remover etapa ${index + 1}`}
                    disabled={editor.stages.length === 1}
                    onClick={() =>
                      setEditor({
                        ...editor,
                        stages: editor.stages.filter((s) => s.id !== stage.id),
                      })
                    }
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                disabled={editor.stages.length >= 40}
                onClick={() =>
                  setEditor({
                    ...editor,
                    stages: [
                      ...editor.stages,
                      {
                        id: crypto.randomUUID(),
                        name: "",
                        color: "#8b5cf6",
                        position: editor.stages.length,
                        pipeline_id: editor.pipeline?.id || "",
                      },
                    ],
                  })
                }
              >
                Adicionar etapa
              </Button>
              {stages
                .filter(
                  (s) =>
                    s.pipeline_id === editor.pipeline?.id &&
                    !editor.stages.some((x) => x.id === s.id),
                )
                .map((s) => (
                  <label key={s.id} className="block space-y-2">
                    <span className="text-sm">
                      Destino dos cards de “{s.name}”
                    </span>
                    <select
                      className={selectClass}
                      value={editor.moves[s.id] || ""}
                      onChange={(e) =>
                        setEditor({
                          ...editor,
                          moves: { ...editor.moves, [s.id]: e.target.value },
                        })
                      }
                    >
                      <option value="">Escolha uma etapa de destino</option>
                      {editor.stages.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name || "Nova etapa"}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => setEditor(null)}
                >
                  Cancelar
                </Button>
                <Button disabled={busy} onClick={() => void savePipeline()}>
                  {busy ? "Salvando…" : "Salvar pipeline"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!draft}
        onOpenChange={(open) => {
          if (!open && !busy) setDraft(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Editar card" : "Novo card"}</DialogTitle>
            <DialogDescription>
              Registre dados, próximos passos e a etapa do acompanhamento.
            </DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="space-y-3">
              <Label htmlFor="card-title">Título</Label>
              <Input
                id="card-title"
                maxLength={160}
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
              <Label htmlFor="card-client">
                Cliente {area === "comercial" && "(opcional)"}
              </Label>
              <select
                id="card-client"
                className={selectClass}
                value={draft.client_id || ""}
                onChange={(e) => {
                  const client = clients.find((c) => c.id === e.target.value);
                  setDraft({
                    ...draft,
                    client_id: e.target.value || null,
                    title: draft.title || client?.name || "",
                  });
                }}
              >
                <option value="">Selecione o cliente</option>
                {clients
                  .filter(
                    (c) => c.status === "Ativo" || c.id === draft.client_id,
                  )
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.status !== "Ativo" ? ` (${c.status})` : ""}
                    </option>
                  ))}
              </select>
              <Label htmlFor="card-pipeline">Pipeline</Label>
              <select
                id="card-pipeline"
                className={selectClass}
                value={draft.pipeline_id}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    pipeline_id: e.target.value,
                    stage_id:
                      stages
                        .filter((s) => s.pipeline_id === e.target.value)
                        .sort((a, b) => a.position - b.position)[0]?.id || "",
                  })
                }
              >
                {pipelines.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <Label htmlFor="card-stage">Etapa</Label>
              <select
                id="card-stage"
                className={selectClass}
                value={draft.stage_id}
                onChange={(e) =>
                  setDraft({ ...draft, stage_id: e.target.value })
                }
              >
                {stages
                  .filter((s) => s.pipeline_id === draft.pipeline_id)
                  .sort((a, b) => a.position - b.position)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
              {area === "comercial" && (
                <>
                  <Label htmlFor="card-phone">Telefone</Label>
                  <Input
                    id="card-phone"
                    maxLength={40}
                    value={draft.phone}
                    onChange={(e) =>
                      setDraft({ ...draft, phone: e.target.value })
                    }
                  />
                  <Label htmlFor="card-value">Valor da oportunidade (R$)</Label>
                  <Input
                    id="card-value"
                    type="number"
                    min={0}
                    step="0.01"
                    value={draft.value}
                    onChange={(e) =>
                      setDraft({ ...draft, value: Number(e.target.value) })
                    }
                  />
                  <Label htmlFor="card-contact">Status de resposta</Label>
                  <select
                    id="card-contact"
                    className={selectClass}
                    value={draft.contact_status}
                    onChange={(e) => {
                      setContactStatusDirty(true);
                      setDraft({
                        ...draft,
                        contact_status: e.target
                          .value as PipelineCard["contact_status"],
                      });
                    }}
                  >
                    {Object.entries(CONTACT_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </>
              )}
              <Label htmlFor="card-meeting">
                {area === "comercial" ? "Reunião" : "Prazo"}
              </Label>
              <Input
                id="card-meeting"
                type="datetime-local"
                value={
                  draft.meeting_at
                    ? new Date(
                        new Date(draft.meeting_at).getTime() -
                          new Date(draft.meeting_at).getTimezoneOffset() *
                            60000,
                      )
                        .toISOString()
                        .slice(0, 16)
                    : ""
                }
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    meeting_at: e.target.value
                      ? new Date(e.target.value).toISOString()
                      : null,
                  })
                }
              />
              <Label htmlFor="card-notes">Observações e próximos passos</Label>
              <Textarea
                id="card-notes"
                maxLength={10000}
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              />
              <Button disabled={busy} onClick={() => void saveCard()}>
                {busy ? "Salvando…" : "Salvar card"}
              </Button>
              {area === "comercial" && draft.id && (
                <WhatsAppConversation
                  key={draft.id}
                  cardId={draft.id}
                  phone={cards.find((c) => c.id === draft.id)?.phone || ""}
                  onChanged={refreshConversation}
                />
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
