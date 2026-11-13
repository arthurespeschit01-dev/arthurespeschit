const clientId = () => Deno.env.get("GOOGLE_CALENDAR_CLIENT_ID") || "";
const clientSecret = () => Deno.env.get("GOOGLE_CALENDAR_CLIENT_SECRET") || "";
export const googleReady = () => !!(clientId() && clientSecret());
export const googleRedirect = () =>
  `${Deno.env.get("SUPABASE_URL")}/functions/v1/workspace-operations?google_callback=1`;
export async function googleConfig(
  db: any,
  workspace: string | null,
  action = "get",
  values: unknown = {},
) {
  const { data, error } = await db.rpc("agency_workspace_google", {
    p_workspace: workspace,
    p_action: action,
    p_values: values,
  });
  if (error) throw Error("Não foi possível acessar a conexão Google.");
  return data;
}
export async function startGoogle(db: any, workspace: string, user: string) {
  if (!googleReady())
    throw Error(
      "Configure GOOGLE_CALENDAR_CLIENT_ID e GOOGLE_CALENDAR_CLIENT_SECRET no servidor e autorize o URI de retorno exibido.",
    );
  const state =
    crypto.randomUUID().replaceAll("-", "") +
    crypto.randomUUID().replaceAll("-", "");
  await googleConfig(db, workspace, "state", { state, user_id: user });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  Object.entries({
    client_id: clientId(),
    redirect_uri: googleRedirect(),
    response_type: "code",
    scope:
      "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.freebusy",
    access_type: "offline",
    prompt: "consent",
    state,
  }).forEach(([k, v]) => url.searchParams.set(k, v));
  return url.toString();
}
async function tokenRequest(values: Record<string, string>) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId(),
      client_secret: clientSecret(),
      ...values,
    }),
    signal: AbortSignal.timeout(12000),
  });
  const data = await r.json();
  if (!r.ok || !data.access_token)
    throw Error("Google não autorizou a conexão. Conecte a agenda novamente.");
  return data;
}
export async function googleCallback(db: any, state: string, code: string) {
  if (!/^[a-f0-9]{64}$/.test(state)) throw Error("Estado OAuth inválido.");
  const context = await googleConfig(db, null, "consume", { state });
  if (!context) throw Error("Autorização expirada ou acesso removido.");
  const token = await tokenRequest({
    code,
    grant_type: "authorization_code",
    redirect_uri: googleRedirect(),
  });
  if (!token.refresh_token)
    throw Error(
      "O Google não enviou autorização offline. Tente conectar novamente.",
    );
  await googleConfig(db, context.workspace_id, "save", {
    refresh_token: token.refresh_token,
    access_token: token.access_token,
    expires_at: new Date(Date.now() + token.expires_in * 1000).toISOString(),
  });
  return context.workspace_id;
}
async function access(db: any, workspace: string) {
  let c = await googleConfig(db, workspace);
  if (!c) return null;
  if (Date.parse(c.expires_at) < Date.now() + 60000) {
    const token = await tokenRequest({
      refresh_token: c.refresh_token,
      grant_type: "refresh_token",
    });
    c = {
      ...c,
      access_token: token.access_token,
      expires_at: new Date(Date.now() + token.expires_in * 1000).toISOString(),
    };
    await googleConfig(db, workspace, "save", c);
  }
  return c.access_token as string;
}
async function api(
  token: string,
  path: string,
  method = "GET",
  body?: unknown,
) {
  return await fetch("https://www.googleapis.com/calendar/v3/" + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
  });
}
export async function googleBusy(
  db: any,
  workspace: string,
  start: string,
  end: string,
) {
  const token = await access(db, workspace);
  if (!token) return [];
  const r = await api(token, "freeBusy", "POST", {
    timeMin: start,
    timeMax: end,
    items: [{ id: "primary" }],
  });
  const data = await r.json();
  if (!r.ok || data.calendars?.primary?.errors)
    throw Error(
      "Não foi possível consultar a disponibilidade do Google. Tente novamente.",
    );
  return (data.calendars?.primary?.busy || []).map(
    (x: { start: string; end: string }) => ({
      starts_at: x.start,
      ends_at: x.end,
    }),
  );
}
export async function syncGoogle(db: any, workspace: string) {
  const token = await access(db, workspace);
  if (!token) return;
  const { data: rows, error } = await db
    .from("agency_workspace_appointments")
    .select("*")
    .eq("workspace_id", workspace)
    .order("updated_at")
    .limit(1000);
  if (error) throw Error("Não foi possível ler os agendamentos.");
  for (const a of (rows || [])
    .filter(
      (a: any) => !a.google_synced_at || a.google_synced_at < a.updated_at,
    )
    .slice(0, 10)) {
    const id = a.google_event_id || "cg" + a.id.replaceAll("-", "");
    try {
      if (a.status === "cancelled") {
        const r = await api(token, "calendars/primary/events/" + id, "DELETE");
        if (!r.ok && ![404, 410].includes(r.status))
          throw Error("Cancelamento não confirmado.");
      } else {
        const event = {
          summary: a.name,
          description: `${a.phone || ""}\n${a.email || ""}\n${a.notes || ""}`,
          start: { dateTime: a.starts_at },
          end: { dateTime: a.ends_at },
        };
        let r = await api(
          token,
          "calendars/primary/events/" + id,
          "PUT",
          event,
        );
        if (r.status === 404) {
          r = await api(token, "calendars/primary/events", "POST", {
            id,
            ...event,
          });
          if (r.status === 409)
            r = await api(
              token,
              "calendars/primary/events/" + id,
              "PUT",
              event,
            );
        }
        if (!r.ok) throw Error("Sincronização não confirmada.");
      }
      // Snapshot timestamp prevents losing concurrent edits during the provider call.
      await db
        .from("agency_workspace_appointments")
        .update({
          google_event_id: id,
          google_synced_at: a.updated_at,
          google_sync_error: null,
        })
        .eq("workspace_id", workspace)
        .eq("id", a.id);
    } catch {
      await db
        .from("agency_workspace_appointments")
        .update({
          google_sync_error:
            "Não foi possível sincronizar com o Google. Verifique a conexão.",
        })
        .eq("workspace_id", workspace)
        .eq("id", a.id);
    }
  }
}
