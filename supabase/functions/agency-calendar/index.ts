import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.2";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};
const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });
const scope = "https://www.googleapis.com/auth/calendar.events";
const tokenEndpoint = "https://oauth2.googleapis.com/token";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers });
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const clientId = Deno.env.get("GOOGLE_CALENDAR_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CALENDAR_CLIENT_SECRET");
  const appUrl = Deno.env.get("AGENCY_APP_URL");
  if (!clientId || !clientSecret || !appUrl)
    return respond(
      {
        error:
          "A conexão com Google Agenda ainda precisa ser configurada pela agência.",
      },
      503,
    );
  const redirectUri = `${supabaseUrl}/functions/v1/agency-calendar?callback=1`;
  const db = createClient(
    supabaseUrl,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const returnToApp = (status: string) =>
    Response.redirect(
      `${appUrl.replace(/\/$/, "")}/comercial?agenda=${status}`,
      303,
    );
  try {
    const url = new URL(req.url);
    if (req.method === "GET" && url.searchParams.get("callback") === "1") {
      const state = url.searchParams.get("state");
      if (!state || !/^[a-f0-9]{64}$/.test(state))
        return respond({ error: "Autorização inválida" }, 400);
      // DELETE ... RETURNING consumes state atomically, preventing replay.
      const { data: pending, error } = await db
        .from("agency_calendar_states")
        .delete()
        .eq("state", state)
        .gt("expires_at", new Date().toISOString())
        .select("user_id")
        .maybeSingle();
      if (error) throw error;
      if (!pending)
        return respond(
          { error: "Autorização expirada. Conecte a agenda novamente." },
          400,
        );
      const code = url.searchParams.get("code");
      if (!code || url.searchParams.has("error"))
        return returnToApp("cancelada");
      const tokenRes = await fetch(tokenEndpoint, {
        method: "POST",
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });
      const tokens = await tokenRes.json();
      if (!tokenRes.ok || !tokens.access_token || !tokens.refresh_token)
        return returnToApp("erro");
      if (
        !String(tokens.scope || "")
          .split(" ")
          .includes(scope)
      )
        return returnToApp("permissao");
      const { error: saveError } = await db
        .from("agency_calendar_connections")
        .upsert({
          user_id: pending.user_id,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: new Date(
            Date.now() + Number(tokens.expires_in || 3600) * 1000,
          ).toISOString(),
        });
      if (saveError) throw saveError;
      return returnToApp("conectada");
    }
    if (req.method !== "POST")
      return respond({ error: "Método inválido" }, 405);
    const authorization = req.headers.get("authorization") || "";
    const auth = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authorization } },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    const {
      data: { user },
      error: authError,
    } = await auth.auth.getUser();
    if (authError || !user)
      return respond({ error: "Entre na sua conta novamente." }, 401);
    const raw = await req.text();
    if (raw.length > 12000)
      return respond({ error: "Solicitação muito grande" }, 413);
    const body = JSON.parse(raw);
    if (body.action === "connect") {
      const state =
        crypto.randomUUID().replace(/-/g, "") +
        crypto.randomUUID().replace(/-/g, "");
      await db.from("agency_calendar_states").delete().eq("user_id", user.id);
      const { error } = await db.from("agency_calendar_states").insert({
        state,
        user_id: user.id,
        expires_at: new Date(Date.now() + 600000).toISOString(),
      });
      if (error) throw error;
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope,
        access_type: "offline",
        prompt: "consent",
        state,
      });
      return respond({
        url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
      });
    }
    const { data: connection, error } = await db
      .from("agency_calendar_connections")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;
    if (body.action === "status") return respond({ connected: !!connection });
    if (!connection)
      return respond({ error: "Conecte sua conta do Google Agenda." }, 409);
    if (body.action === "disconnect") {
      const result = await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        body: new URLSearchParams({ token: connection.refresh_token }),
      });
      if (!result.ok && result.status !== 400)
        return respond(
          { error: "Não foi possível revogar a autorização. Tente novamente." },
          502,
        );
      const { error: deleteError } = await db
        .from("agency_calendar_connections")
        .delete()
        .eq("user_id", user.id);
      if (deleteError) throw deleteError;
      return respond({ ok: true });
    }
    let accessToken = connection.access_token;
    if (new Date(connection.expires_at).getTime() <= Date.now() + 60000) {
      const refreshed = await fetch(tokenEndpoint, {
        method: "POST",
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "refresh_token",
          refresh_token: connection.refresh_token,
        }),
      });
      const tokens = await refreshed.json();
      if (!refreshed.ok || !tokens.access_token)
        return respond(
          { error: "A autorização expirou. Conecte sua agenda novamente." },
          409,
        );
      accessToken = tokens.access_token;
      const { error: refreshError } = await db
        .from("agency_calendar_connections")
        .update({
          access_token: accessToken,
          expires_at: new Date(
            Date.now() + Number(tokens.expires_in || 3600) * 1000,
          ).toISOString(),
        })
        .eq("user_id", user.id);
      if (refreshError) throw refreshError;
    }
    const googleHeaders = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    };
    if (body.action === "list") {
      const params = new URLSearchParams({
        timeMin: new Date().toISOString(),
        timeMax: new Date(Date.now() + 60 * 86400000).toISOString(),
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "100",
      });
      const result = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
        { headers: googleHeaders },
      );
      if (!result.ok)
        return respond(
          {
            error:
              "Não foi possível consultar sua agenda. Verifique a autorização do Google.",
          },
          502,
        );
      const data = await result.json();
      return respond({
        events: (data.items || []).map(
          (event: {
            id: string;
            summary?: string;
            start: unknown;
            end: unknown;
            htmlLink: string;
          }) => ({
            id: event.id,
            title: event.summary || "Sem título",
            start: event.start,
            end: event.end,
            url: event.htmlLink,
          }),
        ),
        has_more: !!data.nextPageToken,
      });
    }
    if (body.action === "create") {
      const start = new Date(body.start);
      const end = new Date(body.end);
      if (
        typeof body.title !== "string" ||
        !body.title.trim() ||
        body.title.length > 160 ||
        Number.isNaN(start.getTime()) ||
        Number.isNaN(end.getTime()) ||
        end <= start
      )
        return respond(
          { error: "Informe título, início e término válidos." },
          400,
        );
      const result = await fetch(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events",
        {
          method: "POST",
          headers: googleHeaders,
          body: JSON.stringify({
            summary: body.title.trim(),
            start: { dateTime: start.toISOString() },
            end: { dateTime: end.toISOString() },
          }),
        },
      );
      if (!result.ok)
        return respond(
          { error: "Não foi possível criar o agendamento no Google." },
          502,
        );
      const event = await result.json();
      return respond({ id: event.id, url: event.htmlLink });
    }
    return respond({ error: "Ação inválida" }, 400);
  } catch (error) {
    if (error instanceof SyntaxError)
      return respond({ error: "Solicitação inválida" }, 400);
    console.error(
      "agency-calendar failed",
      error instanceof Error ? error.name : "database error",
    );
    return respond(
      { error: "Não foi possível concluir a conexão com Google Agenda." },
      500,
    );
  }
});
