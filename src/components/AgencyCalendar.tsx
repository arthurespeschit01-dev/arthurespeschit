import WorkspaceCalendarView from "@/components/pilot/WorkspaceCalendarView";
import { useAgencyWorkspace } from "@/hooks/useAgencyWorkspace";
import { workspaceDb } from "@/lib/clientWorkspaces";
import { Link } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { agencySelectClass } from "@/lib/agency";
import { type Appointment, localDateTime } from "@/lib/appointments";
import { toast } from "sonner";

const empty = {
  title: "",
  start: "",
  end: "",
  client_id: "",
  notes: "",
  status: "agendado" as Appointment["status"],
};
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
  const [clients, setClients] = useState<
    { id: string; name: string; status: string }[]
  >([]);
  const [draft, setDraft] = useState({ ...empty });
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showPast, setShowPast] = useState(false);
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
      setError("Informe um título e um término posterior ao início.");
      return;
    }
    setBusy(true);
    setError("");
    const payload = {
      title: draft.title.trim(),
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      notes: draft.notes,
      client_id: draft.client_id || null,
      status: draft.status,
    };
    const result = await workspaceDb.rpc("agency_account_calendar", {
      p_workspace: account,
      p_action: "save",
      p_id: editing,
      p_values: payload,
    });
    setBusy(false);
    if (result.error) {
      setError(
        "Não foi possível salvar o agendamento. Os dados do formulário foram mantidos.",
      );
      return;
    }
    setDraft({ ...empty });
    setEditing(null);
    toast.success("Agendamento salvo!");
    await load();
  };
  const visible = events.filter(
    (e) =>
      showPast ||
      (new Date(e.ends_at) >= new Date() && e.status === "agendado"),
  );
  return (
    <div className="space-y-5">
      <div className="flex justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Agendamentos</h1>
          <p className="text-sm text-muted-foreground">
            Cadastre e acompanhe seus compromissos na Central do Gestor.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={busy}>
          Atualizar agendamentos
        </Button>
      </div>
      {context.error && !workspace && (
        <p role="alert">{context.error.message}</p>
      )}
      {error && (
        <p role="alert" className="border border-destructive/40 rounded-lg p-4">
          {error}
        </p>
      )}
      {canWrite && (
        <form onSubmit={save} className="rounded-xl border p-5 space-y-3">
          <h3 className="font-semibold">
            {editing ? "Editar agendamento" : "Novo agendamento"}
          </h3>
          <Label htmlFor="event-title">Título do agendamento</Label>
          <Input
            id="event-title"
            required
            maxLength={160}
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="event-start">Início</Label>
              <Input
                id="event-start"
                required
                type="datetime-local"
                value={draft.start}
                onChange={(e) => setDraft({ ...draft, start: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="event-end">Término</Label>
              <Input
                id="event-end"
                required
                type="datetime-local"
                min={draft.start}
                value={draft.end}
                onChange={(e) => setDraft({ ...draft, end: e.target.value })}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Fuso horário: {Intl.DateTimeFormat().resolvedOptions().timeZone}.
          </p>
          <Label htmlFor="event-client">Cliente (opcional)</Label>
          <select
            id="event-client"
            className={agencySelectClass}
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
          <Label htmlFor="event-notes">Observações do agendamento</Label>
          <Textarea
            id="event-notes"
            maxLength={10000}
            value={draft.notes}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          />
          <Label htmlFor="event-status">Status do agendamento</Label>
          <select
            id="event-status"
            className={agencySelectClass}
            value={draft.status}
            onChange={(e) =>
              setDraft({
                ...draft,
                status: e.target.value as Appointment["status"],
              })
            }
          >
            <option value="agendado">Agendado</option>
            <option value="concluido">Concluído</option>
            <option value="cancelado">Cancelado</option>
          </select>
          <div className="flex gap-2">
            <Button disabled={busy} type="submit">
              {busy ? "Salvando…" : "Salvar agendamento"}
            </Button>
            {editing && (
              <Button
                variant="ghost"
                type="button"
                onClick={() => {
                  setEditing(null);
                  setDraft({ ...empty });
                }}
              >
                Cancelar edição
              </Button>
            )}
          </div>
        </form>
      )}
      <p className="text-sm text-muted-foreground">
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
      <div className="flex gap-2">
        <Button
          variant={view === "calendar" ? "default" : "outline"}
          onClick={() => setView("calendar")}
        >
          Calendário
        </Button>
        <Button
          variant={view === "list" ? "default" : "outline"}
          onClick={() => setView("list")}
        >
          Lista
        </Button>
      </div>
      {view === "calendar" && (
        <WorkspaceCalendarView
          appointments={events
            .filter((e) => showPast || e.status !== "cancelado")
            .map((e) => ({
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
            }))}
          onSelect={(id) => {
            const e = events.find((e) => e.id === id);
            if (!e) return;
            setEditing(e.id);
            setDraft({
              title: e.title,
              start: localDateTime(e.starts_at),
              end: localDateTime(e.ends_at),
              client_id: e.client_id || "",
              notes: e.notes,
              status: e.status,
            });
            document.getElementById("event-title")?.focus();
          }}
        />
      )}
      <label className="text-sm flex items-center gap-2">
        <input
          type="checkbox"
          checked={showPast}
          onChange={(e) => setShowPast(e.target.checked)}
        />
        Mostrar histórico e cancelados
      </label>
      {(view === "list" ? visible : events.filter((e) => e.id === editing)).map(
        (e) => (
          <article
            key={e.id}
            className="rounded-xl border p-5 flex justify-between gap-4"
          >
            <div>
              <h3 className="font-semibold">{e.title}</h3>
              <p className="text-sm text-muted-foreground">
                {new Date(e.starts_at).toLocaleString("pt-BR")} até{" "}
                {new Date(e.ends_at).toLocaleString("pt-BR")}
              </p>
              {e.client_id && (
                <p className="text-sm">
                  {clients.find((c) => c.id === e.client_id)?.name}
                </p>
              )}
              <p className="text-sm mt-2 whitespace-pre-wrap">{e.notes}</p>
              <span className="text-xs">
                {
                  {
                    agendado: "Agendado",
                    concluido: "Concluído",
                    cancelado: "Cancelado",
                  }[e.status]
                }
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {canManage && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={async () => {
                    if (
                      !account ||
                      !window.confirm("Excluir ou cancelar este agendamento?")
                    )
                      return;
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
                    if (editing === e.id) {
                      setEditing(null);
                      setDraft({ ...empty });
                    }
                    await load();
                  }}
                >
                  Excluir ou cancelar agendamento
                </Button>
              )}
              {canWrite && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setEditing(e.id);
                    setDraft({
                      title: e.title,
                      start: localDateTime(e.starts_at),
                      end: localDateTime(e.ends_at),
                      client_id: e.client_id || "",
                      notes: e.notes,
                      status: e.status,
                    });
                    document.getElementById("event-title")?.focus();
                  }}
                >
                  Editar agendamento
                </Button>
              )}
            </div>
          </article>
        ),
      )}
      {!visible.length && (
        <p className="text-muted-foreground">
          Nenhum agendamento {showPast ? "cadastrado" : "pendente"}.
        </p>
      )}
    </div>
  );
}
