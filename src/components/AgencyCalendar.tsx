import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface CalendarEvent {
  id: string;
  title: string;
  start: { dateTime?: string; date?: string };
  url: string;
}
export default function AgencyCalendar() {
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [draft, setDraft] = useState({ title: "", start: "", end: "" });
  const call = useCallback(async (action: string, payload = {}) => {
    const { data, error } = await supabase.functions.invoke("agency-calendar", {
      body: { action, ...payload },
    });
    if (error) {
      let message = "Não foi possível acessar sua agenda.";
      try {
        message = (await error.context?.json())?.error || message;
      } catch {
        /* use fallback */
      }
      throw new Error(message);
    }
    return data;
  }, []);
  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const status = await call("status");
      setConnected(status.connected);
      if (status.connected) {
        const data = await call("list");
        setEvents(data.events);
        setHasMore(data.has_more);
      } else setEvents([]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [call]);
  useEffect(() => {
    void load();
  }, [load]);
  const connect = async () => {
    setBusy(true);
    try {
      const data = await call("connect");
      location.assign(data.url);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await call("create", {
        title: draft.title,
        start: new Date(draft.start).toISOString(),
        end: new Date(draft.end).toISOString(),
      });
      toast.success("Agendamento criado no Google Agenda!");
      setDraft({ title: "", start: "", end: "" });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const disconnect = async () => {
    setBusy(true);
    try {
      await call("disconnect");
      setConnected(false);
      setEvents([]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-5">
      <div className="flex justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold">Agendamentos</h2>
          <p className="text-sm text-muted-foreground">
            Conecte a agenda principal do Google para consultar e criar
            compromissos.
          </p>
        </div>
        <div className="flex gap-2">
          <Button disabled={busy} onClick={() => void connect()}>
            {connected ? "Reconectar Google Agenda" : "Conectar Google Agenda"}
          </Button>
          {connected && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void disconnect()}
            >
              Desconectar
            </Button>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="border rounded-lg p-4">
          {error}
        </p>
      )}
      {connected && (
        <>
          <form className="rounded-xl border p-5 space-y-3" onSubmit={create}>
            <h3 className="font-semibold">Novo agendamento</h3>
            <Label htmlFor="event-title">Título</Label>
            <Input
              id="event-title"
              required
              maxLength={160}
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
            <Label htmlFor="event-start">Início</Label>
            <Input
              id="event-start"
              required
              type="datetime-local"
              value={draft.start}
              onChange={(e) => setDraft({ ...draft, start: e.target.value })}
            />
            <Label htmlFor="event-end">Término</Label>
            <Input
              id="event-end"
              required
              type="datetime-local"
              min={draft.start}
              value={draft.end}
              onChange={(e) => setDraft({ ...draft, end: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Horários no fuso do seu dispositivo:{" "}
              {Intl.DateTimeFormat().resolvedOptions().timeZone}.
            </p>
            <Button type="submit" disabled={busy}>
              Criar no Google Agenda
            </Button>
          </form>
          <div className="flex justify-between items-center">
            <h3 className="font-semibold">Próximos 60 dias</h3>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void load()}
            >
              Atualizar
            </Button>
          </div>
          {events.map((event) => (
            <a
              key={event.id}
              href={event.url}
              target="_blank"
              rel="noreferrer"
              className="block rounded-xl border p-4"
            >
              <strong>{event.title}</strong>
              <p className="text-sm text-muted-foreground">
                {event.start.dateTime
                  ? new Date(event.start.dateTime).toLocaleString("pt-BR")
                  : `${event.start.date?.split("-").reverse().join("/")} · Dia inteiro`}
              </p>
            </a>
          ))}
          {!events.length && (
            <p className="text-muted-foreground">
              Nenhum compromisso neste período.
            </p>
          )}
          {hasMore && (
            <p className="text-sm text-muted-foreground">
              Exibindo os primeiros 100 compromissos. Consulte os demais no
              Google Agenda.
            </p>
          )}
        </>
      )}
    </div>
  );
}
