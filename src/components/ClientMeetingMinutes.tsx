import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { workspaceDb } from "@/lib/clientWorkspaces";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
interface Minute {
  id: string;
  title: string;
  meeting_date: string;
  participants: string;
  agenda: string;
  decisions: string;
  next_steps: string;
  revision: number;
  updated_at: string;
}
const blank = () => ({
  title: "",
  meeting_date: new Date().toLocaleDateString("sv-SE"),
  participants: "",
  agenda: "",
  decisions: "",
  next_steps: "",
});
export default function ClientMeetingMinutes({
  clientId,
}: {
  clientId: string;
}) {
  const { user } = useAuth(),
    cache = useQueryClient();
  const key = ["client-minutes", user?.id, clientId];
  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      const r = await workspaceDb
        .from("agency_client_meeting_minutes")
        .select("*")
        .eq("user_id", user!.id)
        .eq("client_id", clientId)
        .order("meeting_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (r.error) throw r.error;
      return r.data as Minute[];
    },
  });
  const [draft, setDraft] = useState(blank),
    [editing, setEditing] = useState<Minute | null>(null),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const edit = (minute: Minute | null) => {
    setEditing(minute);
    setDraft(
      minute
        ? {
            title: minute.title,
            meeting_date: minute.meeting_date,
            participants: minute.participants,
            agenda: minute.agenda,
            decisions: minute.decisions,
            next_steps: minute.next_steps,
          }
        : blank(),
    );
    setError("");
    setOpen(true);
  };
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap justify-between gap-3">
        <h2 className="text-xl font-semibold">Atas de reuniões</h2>
        <Button onClick={() => edit(null)}>Nova ata</Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Registre o que foi discutido, as decisões e os próximos passos deste
        cliente.
      </p>
      {q.error && (
        <p role="alert">
          Não foi possível carregar as atas.{" "}
          <Button variant="outline" onClick={() => void q.refetch()}>
            Tentar novamente
          </Button>
        </p>
      )}
      {open && (
        <form
          className="rounded-xl border bg-card p-5 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy || !user) return;
            setBusy(true);
            setError("");
            try {
              const payload = { ...draft, title: draft.title.trim() };
              const r = editing
                ? await workspaceDb
                    .from("agency_client_meeting_minutes")
                    .update(payload)
                    .eq("id", editing.id)
                    .eq("client_id", clientId)
                    .eq("user_id", user.id)
                    .eq("revision", editing.revision)
                    .select("id")
                : await workspaceDb
                    .from("agency_client_meeting_minutes")
                    .insert({
                      ...payload,
                      user_id: user.id,
                      client_id: clientId,
                    })
                    .select("id");
              if (r.error) throw r.error;
              if (!r.data?.length) {
                await cache.invalidateQueries({ queryKey: key });
                throw Error(
                  "Esta ata foi alterada em outra sessão. Reabra a versão atual antes de salvar. Seu texto foi mantido.",
                );
              }
              await cache.invalidateQueries({ queryKey: key });
              setOpen(false);
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Não foi possível salvar.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <h3 className="font-semibold">
            {editing ? "Editar ata" : "Nova ata"}
          </h3>
          <Label htmlFor="minutes-title">Título da reunião</Label>
          <Input
            id="minutes-title"
            required
            maxLength={180}
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
          <Label htmlFor="minutes-date">Data da reunião</Label>
          <Input
            id="minutes-date"
            required
            type="date"
            value={draft.meeting_date}
            onChange={(e) =>
              setDraft({ ...draft, meeting_date: e.target.value })
            }
          />
          {(
            [
              ["participants", "Participantes", 4000],
              ["agenda", "Pauta e assuntos discutidos", 20000],
              ["decisions", "Decisões", 20000],
              ["next_steps", "Próximos passos e responsáveis", 20000],
            ] as const
          ).map(([field, label, max]) => (
            <div key={field} className="space-y-2">
              <Label htmlFor={"minutes-" + field}>{label}</Label>
              <Textarea
                id={"minutes-" + field}
                maxLength={max}
                rows={field === "participants" ? 2 : 5}
                value={draft[field]}
                onChange={(e) =>
                  setDraft({ ...draft, [field]: e.target.value })
                }
              />
            </div>
          ))}
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button disabled={busy}>{busy ? "Salvando…" : "Salvar ata"}</Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
          </div>
        </form>
      )}
      {q.isPending ? (
        <p role="status">Carregando atas…</p>
      ) : !q.data?.length && !q.error ? (
        <p className="rounded-xl border p-5 text-muted-foreground">
          Nenhuma ata registrada para este cliente.
        </p>
      ) : (
        q.data?.map((m) => (
          <details key={m.id} className="rounded-xl border bg-card p-4">
            <summary className="cursor-pointer font-medium">
              {m.title} ·{" "}
              {new Date(m.meeting_date + "T12:00:00").toLocaleDateString(
                "pt-BR",
              )}
            </summary>
            <div className="space-y-3 mt-4">
              {(
                [
                  ["participants", "Participantes"],
                  ["agenda", "Pauta"],
                  ["decisions", "Decisões"],
                  ["next_steps", "Próximos passos"],
                ] as const
              ).map(
                ([field, label]) =>
                  m[field] && (
                    <div key={field}>
                      <h3 className="text-sm font-semibold">{label}</h3>
                      <p className="text-sm whitespace-pre-wrap break-words">
                        {m[field]}
                      </p>
                    </div>
                  ),
              )}
              <Button variant="outline" onClick={() => edit(m)}>
                Editar ata
              </Button>
            </div>
          </details>
        ))
      )}
    </section>
  );
}
