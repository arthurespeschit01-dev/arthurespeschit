import { useState } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import AgencyFormFields from "@/components/AgencyFormFields";
import type { FormField } from "@/lib/agency";
import {
  workspaceOperation,
  type CaptureField,
  roles,
} from "@/lib/workspaceCommercial";
import { workspaceDb } from "@/lib/clientWorkspaces";
import { useAuth } from "@/contexts/AuthContext";
export default function WorkspacePublic() {
  const { token = "" } = useParams(),
    location = useLocation();
  const kind = location.pathname.startsWith("/captura/") ? "form" : "calendar";
  const [view] = useState(() => crypto.randomUUID()),
    [request, setRequest] = useState(() => crypto.randomUUID()),
    [date, setDate] = useState(""),
    [slot, setSlot] = useState(""),
    [answers, setAnswers] = useState<Record<string, string>>({}),
    [name, setName] = useState(""),
    [phone, setPhone] = useState(""),
    [email, setEmail] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState("");
  const query = useQuery({
    queryKey: ["public-workspace", kind, token, date],
    queryFn: () =>
      workspaceOperation<{
        title: string;
        description: string;
        fields?: CaptureField[];
        duration_minutes?: number;
        timezone?: string;
        slots?: string[];
      }>(kind === "form" ? "public_form" : "public_calendar", {
        token,
        view_id: view,
        date,
      }),
    retry: false,
    refetchOnMount: "always",
  });
  return (
    <main className="min-h-dvh bg-background text-foreground p-4 sm:p-8">
      <div className="mx-auto max-w-xl rounded-2xl border bg-card p-5 sm:p-8 space-y-5">
        <img
          src="/favicon.svg?v=cg-transparent-3"
          alt="Central do Gestor"
          className="w-10 h-10"
        />
        {query.isPending ? (
          <p role="status">Carregando…</p>
        ) : query.error ? (
          <p role="alert">{query.error.message}</p>
        ) : done ? (
          <div role="status">
            <h1 className="text-xl font-semibold">{done}</h1>
          </div>
        ) : (
          query.data && (
            <>
              <h1 className="text-2xl font-bold">{query.data.title}</h1>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {query.data.description}
              </p>
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  setBusy(true);
                  setError("");
                  void (
                    kind === "form"
                      ? workspaceOperation<{ message: string }>("submit_form", {
                          token,
                          request_id: request,
                          answers,
                        })
                      : workspaceOperation<{ message: string }>("book", {
                          token,
                          request_id: request,
                          starts_at: slot,
                          contact: { name, phone, email },
                        })
                  )
                    .then((result) =>
                      setDone(
                        kind === "form"
                          ? result.message || "Resposta recebida!"
                          : "Agendamento confirmado!",
                      ),
                    )
                    .catch((e) => setError(e.message))
                    .finally(() => setBusy(false));
                }}
              >
                {kind === "form" ? (
                  <AgencyFormFields
                    fields={(query.data.fields as FormField[]) || []}
                    answers={answers}
                    onChange={(v) => {
                      setAnswers(v);
                      setRequest(crypto.randomUUID());
                    }}
                  />
                ) : (
                  <>
                    <p className="text-sm">
                      {query.data.duration_minutes} minutos · Horários em{" "}
                      {query.data.timezone}
                    </p>
                    <label className="text-sm block">
                      Escolha o dia
                      <Input
                        type="date"
                        required
                        min={new Date().toLocaleDateString("en-CA")}
                        value={date}
                        onChange={(e) => {
                          setDate(e.target.value);
                          setSlot("");
                          setRequest(crypto.randomUUID());
                        }}
                      />
                    </label>
                    {date && (
                      <div className="grid grid-cols-3 gap-2">
                        {query.data.slots?.map((s) => (
                          <Button
                            key={s}
                            type="button"
                            variant={slot === s ? "default" : "outline"}
                            onClick={() => setSlot(s)}
                          >
                            {new Date(s).toLocaleTimeString("pt-BR", {
                              timeZone: query.data!.timezone,
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </Button>
                        ))}
                        {!query.data.slots?.length && (
                          <p className="col-span-3 text-sm text-muted-foreground">
                            Não há horários disponíveis neste dia.
                          </p>
                        )}
                      </div>
                    )}
                    <label className="text-sm block">
                      Nome
                      <Input
                        required
                        maxLength={160}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </label>
                    <label className="text-sm block">
                      WhatsApp
                      <Input
                        type="tel"
                        required
                        maxLength={40}
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                      />
                    </label>
                    <label className="text-sm block">
                      E-mail
                      <Input
                        type="email"
                        maxLength={254}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </label>
                  </>
                )}
                {error && (
                  <p role="alert" className="text-destructive text-sm">
                    {error}
                  </p>
                )}
                <Button
                  className="w-full"
                  type="submit"
                  disabled={busy || (kind === "calendar" && !slot)}
                >
                  {busy
                    ? "Enviando…"
                    : kind === "form"
                      ? "Enviar respostas"
                      : "Confirmar agendamento"}
                </Button>
              </form>
            </>
          )
        )}
      </div>
    </main>
  );
}
export function WorkspaceInvitation() {
  const { token = "" } = useParams(),
    { user } = useAuth(),
    navigate = useNavigate(),
    client = useQueryClient();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const q = useQuery({
    queryKey: ["workspace-invite", token, user?.id],
    queryFn: () =>
      workspaceOperation<{ name: string; role: string }>("public_invite", {
        token,
      }),
    retry: false,
  });
  return (
    <main className="min-h-dvh bg-background text-foreground p-6">
      <div className="max-w-lg mx-auto mt-12 border rounded-xl p-6 bg-card space-y-4">
        <h1 className="text-2xl font-bold">Convite para a equipe</h1>
        {q.isPending ? (
          <p>Carregando convite…</p>
        ) : q.error ? (
          <p role="alert">{q.error.message}</p>
        ) : (
          <>
            <p>
              Você foi convidado para <strong>{q.data?.name}</strong>, com
              acesso de <strong>{roles[q.data?.role || ""]}</strong>.
            </p>
            <p className="text-sm text-muted-foreground">
              Você está usando {user?.email}. É necessário entrar com o e-mail
              confirmado que recebeu o convite. O acesso será limitado a esta
              subconta.
            </p>
            <Button
              disabled={busy}
              onClick={() => {
                setBusy(true);
                setError("");
                void Promise.resolve(
                  workspaceDb.rpc("agency_workspace_accept_invite", {
                    p_token: token,
                  }),
                )
                  .then(async ({ data, error }) => {
                    if (error) throw error;
                    await client.invalidateQueries();
                    navigate(`/laboratorio/subcontas/${data}`, {
                      replace: true,
                    });
                  })
                  .catch((e) => setError(e.message))
                  .finally(() => setBusy(false));
              }}
            >
              {busy ? "Aceitando…" : "Aceitar convite"}
            </Button>
          </>
        )}
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
