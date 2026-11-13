import { useState } from "react";
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
import { workspaceDb, type WorkspaceStage } from "@/lib/clientWorkspaces";
import {
  type WorkspaceCalendar,
  type Appointment,
  publicLink,
  dateLabel,
  selectClass,
} from "@/lib/workspaceCommercial";
import { RecordMenu, ShareLink, Empty } from "./CommercialShared";
const statuses: Record<string, string> = {
  confirmed: "Confirmado",
  completed: "Realizado",
  cancelled: "Cancelado",
  no_show: "Não compareceu",
};
export default function WorkspaceScheduling({
  workspace,
  calendars,
  appointments,
  stages,
  manage,
  write,
  run,
}: {
  workspace: string;
  calendars: WorkspaceCalendar[];
  appointments: Appointment[];
  stages: WorkspaceStage[];
  manage: boolean;
  write: boolean;
  run: (fn: () => PromiseLike<{ error: unknown }>) => void;
}) {
  const [edit, setEdit] = useState<WorkspaceCalendar | null>(null),
    [newBooking, setNewBooking] = useState(false),
    [name, setName] = useState(""),
    [phone, setPhone] = useState(""),
    [when, setWhen] = useState(""),
    [calendar, setCalendar] = useState("");
  const c = calendars.find((c) => c.id === calendar) || calendars[0];
  return (
    <div className="space-y-5">
      <div className="flex justify-between gap-3">
        <h2 className="text-xl font-semibold">Agendamentos</h2>
        <div className="flex gap-2 flex-wrap">
          {write && (
            <Button
              variant="outline"
              disabled={!calendars.length}
              onClick={() => setNewBooking(true)}
            >
              Novo agendamento
            </Button>
          )}
          {manage && (
            <Button
              onClick={() =>
                setEdit({
                  id: "",
                  title: "Reunião",
                  description: "",
                  duration_minutes: 30,
                  timezone: "America/Sao_Paulo",
                  availability: {
                    days: [1, 2, 3, 4, 5],
                    start: "09:00",
                    end: "18:00",
                    buffer: 0,
                  },
                  pipeline_id: stages[0]?.pipeline_id || "",
                  stage_id: stages[0]?.id || "",
                  token: "",
                  enabled: true,
                })
              }
            >
              Criar agenda
            </Button>
          )}
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        {calendars.map((c) => (
          <article
            key={c.id}
            className="bg-card border rounded-xl p-4 space-y-3"
          >
            <div className="flex justify-between gap-2">
              <div>
                <h3 className="font-semibold">{c.title}</h3>
                <p className="text-xs text-muted-foreground">
                  {c.duration_minutes} min · {c.timezone} ·{" "}
                  {c.enabled ? "Ativa" : "Desativada"}
                </p>
              </div>
              <RecordMenu
                enabled={manage}
                edit={() => setEdit(c)}
                toggle={() =>
                  run(() =>
                    workspaceDb
                      .from("agency_workspace_calendars")
                      .update({ enabled: !c.enabled })
                      .eq("workspace_id", workspace)
                      .eq("id", c.id),
                  )
                }
                remove={() =>
                  run(() =>
                    workspaceDb
                      .from("agency_workspace_calendars")
                      .delete()
                      .eq("workspace_id", workspace)
                      .eq("id", c.id),
                  )
                }
              />
            </div>
            <ShareLink url={publicLink("reservar", c.token)} />
          </article>
        ))}
      </div>
      <section className="space-y-2">
        <h3 className="font-semibold">Compromissos</h3>
        {appointments
          .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
          .map((a) => (
            <article
              key={a.id}
              className="border rounded-xl p-4 bg-card flex flex-wrap gap-3 justify-between items-center"
            >
              <div>
                <p className="font-medium">{a.name}</p>
                <p className="text-sm">
                  {dateLabel(a.starts_at)} ·{" "}
                  {calendars.find((c) => c.id === a.calendar_id)?.title}
                </p>
                <p className="text-xs text-muted-foreground">
                  {a.phone} {a.email}
                </p>
                {a.notes && (
                  <p className="text-sm mt-1 whitespace-pre-wrap">{a.notes}</p>
                )}
              </div>
              <div className="flex gap-2">
                <select
                  aria-label={`Status do agendamento de ${a.name}`}
                  disabled={!write}
                  className={selectClass}
                  value={a.status}
                  onChange={(e) =>
                    run(() =>
                      workspaceDb
                        .from("agency_workspace_appointments")
                        .update({ status: e.target.value })
                        .eq("workspace_id", workspace)
                        .eq("id", a.id),
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
                  enabled={write}
                  remove={() =>
                    run(() =>
                      workspaceDb
                        .from("agency_workspace_appointments")
                        .delete()
                        .eq("workspace_id", workspace)
                        .eq("id", a.id),
                    )
                  }
                />
              </div>
            </article>
          ))}
        {!appointments.length && (
          <Empty>
            Compartilhe uma agenda ou adicione um compromisso. Cada novo
            agendamento cria ou vincula o contato ao CRM.
          </Empty>
        )}
      </section>
      {edit && (
        <CalendarEditor
          value={edit}
          stages={stages}
          onClose={() => setEdit(null)}
          save={(v) =>
            run(async () => {
              const { id, token: _, ...values } = v;
              const r = id
                ? await workspaceDb
                    .from("agency_workspace_calendars")
                    .update(values)
                    .eq("workspace_id", workspace)
                    .eq("id", id)
                : await workspaceDb
                    .from("agency_workspace_calendars")
                    .insert({ ...values, workspace_id: workspace });
              if (!r.error) setEdit(null);
              return r;
            })
          }
        />
      )}
      <Dialog open={newBooking} onOpenChange={setNewBooking}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo agendamento</DialogTitle>
            <DialogDescription>
              O horário usa o fuso do seu dispositivo. O sistema bloqueia
              conflitos na mesma agenda.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!c) return;
              const start = new Date(when);
              run(async () => {
                const r = await workspaceDb
                  .from("agency_workspace_appointments")
                  .insert({
                    workspace_id: workspace,
                    calendar_id: c.id,
                    name,
                    phone,
                    starts_at: start.toISOString(),
                    ends_at: new Date(
                      +start + c.duration_minutes * 60000,
                    ).toISOString(),
                  });
                if (!r.error) setNewBooking(false);
                return r;
              });
            }}
          >
            <select
              aria-label="Agenda do compromisso"
              className={selectClass + " w-full"}
              value={c?.id || ""}
              onChange={(e) => setCalendar(e.target.value)}
            >
              {calendars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
            <Input
              aria-label="Nome do contato"
              required
              maxLength={160}
              placeholder="Nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              aria-label="WhatsApp do contato"
              maxLength={40}
              placeholder="WhatsApp"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <Input
              aria-label="Data e hora"
              type="datetime-local"
              required
              value={when}
              onChange={(e) => setWhen(e.target.value)}
            />
            <Button type="submit">Agendar</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
function CalendarEditor({
  value,
  stages,
  onClose,
  save,
}: {
  value: WorkspaceCalendar;
  stages: WorkspaceStage[];
  onClose: () => void;
  save: (c: WorkspaceCalendar) => void;
}) {
  const [c, setC] = useState(value);
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configurar agenda</DialogTitle>
          <DialogDescription>
            Disponibilidade e etapa de entrada dos agendamentos no CRM.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save(c);
          }}
        >
          <label className="text-sm block">
            Nome
            <Input
              required
              maxLength={160}
              value={c.title}
              onChange={(e) => setC({ ...c, title: e.target.value })}
            />
          </label>
          <label className="text-sm block">
            Descrição
            <Textarea
              value={c.description}
              maxLength={4000}
              onChange={(e) => setC({ ...c, description: e.target.value })}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              Duração (min)
              <Input
                type="number"
                min="10"
                max="240"
                value={c.duration_minutes}
                onChange={(e) =>
                  setC({ ...c, duration_minutes: Number(e.target.value) })
                }
              />
            </label>
            <label className="text-sm">
              Intervalo (min)
              <Input
                type="number"
                min="0"
                max="120"
                value={c.availability.buffer}
                onChange={(e) =>
                  setC({
                    ...c,
                    availability: {
                      ...c.availability,
                      buffer: Number(e.target.value),
                    },
                  })
                }
              />
            </label>
          </div>
          <label className="text-sm block">
            Fuso horário
            <Input
              required
              value={c.timezone}
              onChange={(e) => setC({ ...c, timezone: e.target.value })}
            />
          </label>
          <div className="flex flex-wrap gap-3">
            {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d, i) => (
              <label className="flex gap-1 text-sm" key={d}>
                <input
                  type="checkbox"
                  checked={c.availability.days.includes(i || 7)}
                  onChange={(e) =>
                    setC({
                      ...c,
                      availability: {
                        ...c.availability,
                        days: e.target.checked
                          ? [...c.availability.days, i || 7]
                          : c.availability.days.filter((n) => n !== (i || 7)),
                      },
                    })
                  }
                />
                {d}
              </label>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              Início
              <Input
                type="time"
                required
                value={c.availability.start}
                onChange={(e) =>
                  setC({
                    ...c,
                    availability: { ...c.availability, start: e.target.value },
                  })
                }
              />
            </label>
            <label className="text-sm">
              Fim
              <Input
                type="time"
                required
                value={c.availability.end}
                onChange={(e) =>
                  setC({
                    ...c,
                    availability: { ...c.availability, end: e.target.value },
                  })
                }
              />
            </label>
          </div>
          <label className="text-sm block">
            Etapa de entrada
            <select
              className={selectClass + " w-full"}
              value={c.stage_id}
              onChange={(e) => {
                const stage = stages.find((s) => s.id === e.target.value)!;
                setC({
                  ...c,
                  pipeline_id: stage.pipeline_id,
                  stage_id: stage.id,
                });
              }}
            >
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit">Salvar agenda</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
