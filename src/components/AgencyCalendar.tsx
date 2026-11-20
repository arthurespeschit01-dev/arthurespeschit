import WorkspaceCalendarView from "@/components/pilot/WorkspaceCalendarView";
import { RecordMenu, Empty } from "@/components/pilot/CommercialShared";
import { useAgencyWorkspace } from "@/hooks/useAgencyWorkspace";
import { workspaceDb } from "@/lib/clientWorkspaces";
import { dateLabel, selectClass } from "@/lib/workspaceCommercial";
import { Link } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { type Appointment, localDateTime } from "@/lib/appointments";
import { toast } from "sonner";
import { workspaceOperation } from "@/lib/workspaceCommercial";

type GoogleEvent = { id: string; title: string; starts_at: string; ends_at: string; all_day: boolean; url: string | null };

const statuses: Record<Appointment["status"], string> = {
  agendado: "Agendado",
  concluido: "Concluído",
  cancelado: "Cancelado",
};
const empty = {
  title: "",
  start: "",
  end: "",
  client_id: "",
  notes: "",
  status: "agendado" as Appointment["status"],
};
const toDraft = (e: Appointment) => ({
  title: e.title,
  start: localDateTime(e.starts_at),
  end: localDateTime(e.ends_at),
  client_id: e.client_id || "",
  notes: e.notes,
  status: e.status,
});

export default function AgencyCalendar({
  workspace,
}: { workspace?: string } = {}) {
  const { user } = useAuth();
  const context = useAgencyWorkspace(!workspace);
  const account = workspace || context.data;
  const [canWrite, setCanWrite] = useState(false),
    [canManage, setCanManage] = useState(false),
    [google, setGoogle] = useState(false),
    [view, setView] = useState<"calendar" | "list">("calendar");
  const [events, setEvents] = useState<Appointment[]>([]);
  const [googleEvents, setGoogleEvents] = useState<GoogleEvent[]>([]);
  const [clients, setClients] = useState<
    { id: string; name: string; status: string }[]
  >([]);
  const [draft, setDraft] = useState({ ...empty });
  const [editing, setEditing] = useState<string | null>(null);
  const [dialog, setDialog] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    if (!user) return;
    if (!account) return;
    const r = await workspaceDb.rpc("agency_account_calendar", {
      p_workspace: account,
    });
    if (r.error) {
      setError("Não foi possível carregar os agendamentos. " + r.error.message);
      return;
    }
    const data = r.data as {
      events: Appointment[];
      clients: { id: string; name: string; status: string }[];
      can_write: boolean;
      can_manage: boolean;
      google_connected: boolean;
    };
    setEvents(data.events);
    setClients(data.clients);
    setCanWrite(data.can_write);
    setCanManage(data.can_manage);
    setGoogle(data.google_connected);
    setError("");
  }, [user, account]);
  useEffect(() => {
    void load();
  }, [load]);

  // Eventos criados direto no Google Agenda aparecem aqui também (atualiza a cada minuto e ao voltar para a aba)
  const loadGoogle = useCallback(async () => {
    if (!account || !google) { setGoogleEvents([]); return; }
    try {
      const r = await workspaceOperation<{ events: GoogleEvent[] }>("google_events", {
        workspace_id: account,
        start: new Date(Date.now() - 60 * 86400000).toISOString(),
        end: new Date(Date.now() + 120 * 86400000).toISOString(),
      });
      setGoogleEvents(r.events || []);
      void load();
    } catch {
      /* mantém o último resultado */
    }
  }, [account, google, load]);
  useEffect(() => {
    void loadGoogle();
    const timer = setInterval(() => void loadGoogle(), 60000);
    const onFocus = () => void loadGoogle();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, [loadGoogle]);

  const persist = async (
    id: string | null,
    values: typeof empty,
  ): Promise<boolean> => {
    if (!account) return false;
    const start = new Date(values.start),
      end = new Date(values.end);
    const result = await workspaceDb.rpc("agency_account_calendar", {
      p_workspace: account,
      p_action: "save",
      p_id: id,
      p_values: {
        title: values.title.trim(),
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        notes: values.notes,
        client_id: values.client_id || null,
        status: values.status,
      },
    });
    return !result.error;
  };

  const openNew = () => {
    setEditing(null);
    setDraft({ ...empty });
    setFormError("");
    setDialog(true);
  };
  const openEdit = (e: Appointment) => {
    setEditing(e.id);
    setDraft(toDraft(e));
    setFormError("");
    setDialog(true);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || !account || !canWrite || busy) return;
    const start = new Date(draft.start),
      end = new Date(draft.end);
    if (
      !draft.title.trim() ||
      !Number.isFinite(start.getTime()) ||
      !Number.isFinite(end.getTime()) ||
      end <= start
    ) {
      setFormError("Informe um título e um término posterior ao início.");
      return;
    }
    setBusy(true);
    setFormError("");
    const ok = await persist(editing, draft);
    setBusy(false);
    if (!ok) {
      setFormError(
        "Não foi possível salvar o agendamento. Os dados do formulário foram mantidos.",
      );
      return;
    }
    setDialog(false);
    setDraft({ ...empty });
    setEditing(null);
    toast.success("Agendamento salvo!");
    await load();
  };

  const changeStatus = async (e: Appointment, status: Appointment["status"]) => {
    if (!canWrite || busy) return;
    setBusy(true);
    const ok = await persist(e.id, { ...toDraft(e), status });
    setBusy(false);
    if (!ok) {
      setError("Não foi possível alterar o status do agendamento.");
      return;
    }
    await load();
  };

  const remove = async (e: Appointment) => {
    if (!account || busy) return;
    if (!canManage) {
      setError("Você não tem permissão para excluir agendamentos.");
      return;
    }
    if (!window.confirm("Excluir ou cancelar este agendamento?")) return;
    setBusy(true);
    const r = await workspaceDb.rpc("agency_account_calendar", {
      p_workspace: account,
      p_action: "delete",
      p_id: e.id,
    });
    setBusy(false);
    if (r.error) {
      setError(r.error.message);
      return;
    }
    if (selected === e.id) setSelected(null);
    await load();
  };

  return (
    <div className="space-y-5">
      <div className="flex justify-between gap-3">
        <h2 className="text-xl font-semibold">Agendamentos</h2>
        <div className="flex gap-2 flex-wrap">
          {canWrite && (
            <Button variant="outline" onClick={openNew}>
              Novo agendamento
            </Button>
          )}
        </div>
      </div>
      {context.error && !workspace && (
        <p role="alert">{context.error.message}</p>
      )}
      {error && (
        <p role="alert" className="border border-destructive/40 rounded-xl p-4">
          {error}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {google
          ? "Google Agenda conectada · sincronização automática em até um minuto."
          : "Google Agenda ainda não conectada."}{" "}
        {!workspace && !google && (
          <Link
            to="/configuracoes/google-agenda"
            className="text-primary underline"
          >
            Conectar Google Agenda
          </Link>
        )}
      </p>
      <div className="flex gap-2" aria-label="Visualização de agendamentos">
        <Button
          variant={view === "calendar" ? "default" : "outline"}
          aria-pressed={view === "calendar"}
          onClick={() => setView("calendar")}
        >
          Calendário
        </Button>
        <Button
          variant={view === "list" ? "default" : "outline"}
          aria-pressed={view === "list"}
          onClick={() => setView("list")}
        >
          Lista
        </Button>
      </div>
      {view === "calendar" && (
        <WorkspaceCalendarView
          appointments={events.map((e) => ({
            id: e.id,
            calendar_id: "",
            name: e.title,
            phone: "",
            email: "",
            notes: e.notes,
            starts_at: e.starts_at,
            ends_at: e.ends_at,
            status:
              e.status === "cancelado"
                ? "cancelled"
                : e.status === "concluido"
                  ? "completed"
                  : "confirmed",
            lead_id: null,
          })).concat(googleEvents.map((g) => ({
            id: "g:" + g.id,
            calendar_id: "",
            name: "Google · " + g.title,
            phone: "",
            email: "",
            notes: "",
            starts_at: g.starts_at,
            ends_at: g.ends_at,
            status: "confirmed" as const,
            lead_id: null,
          })))}
          onSelect={(id) => {
            setSelected(id);
            setTimeout(
              () =>
                document
                  .getElementById(`appointment-${id}`)
                  ?.scrollIntoView({ behavior: "smooth", block: "center" }),
              0,
            );
          }}
        />
      )}
      <section className="space-y-2">
        <h3 className="font-semibold">Compromissos</h3>
        {[...events]
          .filter((e) => view === "list" || e.id === selected)
          .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
          .map((e) => (
            <article
              key={e.id}
              id={`appointment-${e.id}`}
              className="border rounded-xl p-4 bg-card flex flex-wrap gap-3 justify-between items-center"
            >
              <div>
                <p className="font-medium">{e.title}</p>
                <p className="text-sm">
                  {dateLabel(e.starts_at)}
                  {e.client_id &&
                    ` · ${clients.find((c) => c.id === e.client_id)?.name || ""}`}
                </p>
                {e.notes && (
                  <p className="text-sm mt-1 whitespace-pre-wrap">{e.notes}</p>
                )}
              </div>
              <div className="flex gap-2">
                <select
                  aria-label={`Status do agendamento ${e.title}`}
                  disabled={!canWrite || busy}
                  className={selectClass}
                  value={e.status}
                  onChange={(ev) =>
                    void changeStatus(
                      e,
                      ev.target.value as Appointment["status"],
                    )
                  }
                >
                  {Object.entries(statuses).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
                <RecordMenu
                  enabled={canWrite && !busy}
                  edit={() => openEdit(e)}
                  remove={() => void remove(e)}
                />
              </div>
            </article>
          ))}
        {[...googleEvents]
          .filter((g) => view === "list" || "g:" + g.id === selected)
          .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
          .map((g) => (
            <article
              key={"g:" + g.id}
              id={`appointment-g:${g.id}`}
              className="border rounded-xl p-4 bg-card flex flex-wrap gap-3 justify-between items-center"
            >
              <div>
                <p className="font-medium">
                  {g.title}{" "}
                  <span className="ml-1 text-[11px] rounded-full border px-2 py-0.5 text-muted-foreground align-middle">Google Agenda</span>
                </p>
                <p className="text-sm">{g.all_day ? "Dia inteiro · " + new Date(g.starts_at).toLocaleDateString("pt-BR") : dateLabel(g.starts_at)}</p>
              </div>
              {g.url && (
                <a href={g.url} target="_blank" rel="noreferrer" className="text-sm text-primary underline">
                  Abrir no Google
                </a>
              )}
            </article>
          ))}
        {!events.length && !googleEvents.length && (
          <Empty>
            Nenhum agendamento cadastrado. Clique em “Novo agendamento” para
            adicionar um compromisso.
          </Empty>
        )}
      </section>
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar agendamento" : "Novo agendamento"}
            </DialogTitle>
            <DialogDescription>
              O horário usa o fuso do seu dispositivo (
              {Intl.DateTimeFormat().resolvedOptions().timeZone}).
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-3" onSubmit={save}>
            <Input
              aria-label="Título do agendamento"
              required
              maxLength={160}
              placeholder="Título"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">
                Início
                <Input
                  type="datetime-local"
                  required
                  value={draft.start}
                  onChange={(e) =>
                    setDraft({ ...draft, start: e.target.value })
                  }
                />
              </label>
              <label className="text-sm">
                Término
                <Input
                  type="datetime-local"
                  required
                  min={draft.start}
                  value={draft.end}
                  onChange={(e) => setDraft({ ...draft, end: e.target.value })}
                />
              </label>
            </div>
            <select
              aria-label="Cliente do agendamento"
              className={selectClass + " w-full"}
              value={draft.client_id}
              onChange={(e) => setDraft({ ...draft, client_id: e.target.value })}
            >
              <option value="">Sem cliente vinculado</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.status === "Ativo" ? "" : ` (${c.status})`}
                </option>
              ))}
            </select>
            <select
              aria-label="Status do agendamento"
              className={selectClass + " w-full"}
              value={draft.status}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  status: e.target.value as Appointment["status"],
                })
              }
            >
              {Object.entries(statuses).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <Textarea
              aria-label="Observações do agendamento"
              placeholder="Observações"
              maxLength={10000}
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            />
            {formError && (
              <p role="alert" className="text-sm text-destructive">
                {formError}
              </p>
            )}
            <Button type="submit" disabled={busy}>
              {busy ? "Salvando…" : editing ? "Salvar alterações" : "Agendar"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
