import {
  googleReady,
  googleRedirect,
  googleConfig,
  startGoogle,
  googleCallback,
  googleBusy,
  syncGoogle,
} from "../_shared/workspace-google.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.2";
import {
  formAnswers,
  publicContact,
  bookingSlots,
  uuid,
} from "../_shared/workspace-public.ts";
import {
  normalizeWhatsappEvent,
  whatsappPhone,
  validWhatsappAddress,
} from "../_shared/agency-whatsapp.ts";
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};
const reply = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers });
const base = Deno.env.get("SUPABASE_URL") || "";
const db = createClient(base, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "", {
  auth: { persistSession: false, autoRefreshToken: false },
});
const checked = async (p: PromiseLike<{ data: unknown; error: unknown }>) => {
  const { data, error } = await p;
  if (error) throw error;
  return data as any;
};
async function provider(c: any, path: string, method = "GET", body?: unknown) {
  const url = new URL("https://api.w-api.app/v1/" + path);
  url.searchParams.set("instanceId", c.instance_id);
  const r = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${c.token}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok)
    throw Error("O provedor recusou a operação. Verifique instância e token.");
  const data = await r.json();
  if (data.error) throw Error("O provedor não confirmou a operação.");
  return data;
}
async function connection(
  workspace: string,
  kind = "whatsapp",
  values?: unknown,
) {
  return await checked(
    db.rpc("agency_workspace_connection", {
      p_workspace: workspace,
      p_kind: kind,
      p_values: values ?? null,
    }),
  );
}
async function account(c: any) {
  const info = await provider(c, "instance/fetch-instance");
  let id: string | null = null;
  let phone: string | null = null;
  if (info.connected) {
    phone = whatsappPhone(info.connectedPhone);
    if (!validWhatsappAddress(phone) || phone.includes("@"))
      throw Error("Não foi possível identificar o número conectado.");
    const row = await checked(
      db
        .from("agency_workspace_whatsapp_accounts")
        .upsert(
          { workspace_id: c.workspace_id, phone },
          { onConflict: "workspace_id,phone" },
        )
        .select("id")
        .single(),
    );
    id = row.id;
  }
  await connection(c.workspace_id, "whatsapp", { active_account_id: id });
  return { connected: !!id, account_id: id, phone };
}
async function work(workspace: string) {
  await syncGoogle(db, workspace).catch(() => {});
  await checked(
    db.rpc("agency_workspace_process_due", { p_workspace: workspace }),
  );
  const c = await connection(workspace);
  if (!c?.enabled) return;
  const state = await account(c);
  if (!state.connected) return;
  for (let i = 0; i < 5; i++) {
    const m = await checked(
      db.rpc("agency_workspace_claim_message", { p_workspace: workspace }),
    );
    if (!m) break;
    let status = "uncertain",
      id: string | null = null;
    try {
      const result = await provider(c, "message/send-text", "POST", {
        phone: m.phone,
        message: m.body,
      });
      id =
        String(result.messageId || result.id || result.key?.id || "") || null;
      status = id ? "sent" : "uncertain";
    } catch {
      /* Ambiguous failures are never resent automatically. */
    }
    await checked(
      db.rpc("agency_workspace_finish_message", {
        p_id: m.id,
        p_status: status,
        p_provider: id,
      }),
    );
  }
  await checked(
    db.rpc("agency_workspace_process_due", { p_workspace: workspace }),
  );
}
async function active(workspace: string) {
  const ok = await checked(
    db.rpc("agency_workspace_available", { p_workspace: workspace }),
  );
  if (!ok) throw Error("Subconta indisponível.");
}
async function publicResource(kind: string, token: unknown) {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token))
    throw Error("Link inválido.");
  const table =
    kind === "form"
      ? "agency_workspace_forms"
      : kind === "calendar"
        ? "agency_workspace_calendars"
        : "agency_workspace_invitations";
  const row = await checked(
    db.from(table).select("*").eq("token", token).maybeSingle(),
  );
  if (
    !row ||
    (kind !== "invite" && !row.enabled) ||
    (kind === "invite" &&
      (row.status !== "pending" || Date.parse(row.expires_at) < Date.now()))
  )
    throw Error("Link inválido, expirado ou desativado.");
  await active(row.workspace_id);
  return row;
}
export async function handle(req: Request) {
  if (req.method === "OPTIONS") return new Response(null, { headers });
  const callbackUrl = new URL(req.url);
  if (req.method === "GET" && callbackUrl.searchParams.get("google_callback")) {
    const app =
      Deno.env.get("AGENCY_APP_URL") || "https://www.centraldogestor.site";
    try {
      const workspace = await googleCallback(
        db,
        callbackUrl.searchParams.get("state") || "",
        callbackUrl.searchParams.get("code") || "",
      );
      return Response.redirect(
        `${app}/laboratorio/subcontas/${workspace}/integracoes?google=connected`,
        303,
      );
    } catch {
      return new Response(
        "Não foi possível conectar o Google. A autorização expirou, foi recusada ou a configuração do aplicativo precisa ser revisada. Volte à subconta e tente novamente.",
        {
          status: 400,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store",
          },
        },
      );
    }
  }
  if (req.method !== "POST")
    return reply({ error: "Método não permitido." }, 405);
  try {
    if (Number(req.headers.get("content-length") || 0) > 100000)
      return reply({ error: "Solicitação muito grande." }, 413);
    const raw = await req.text();
    if (raw.length > 100000)
      return reply({ error: "Solicitação muito grande." }, 413);
    const body = JSON.parse(raw || "{}"),
      url = new URL(req.url);
    const googleWorker = url.searchParams.get("google_worker");
    if (googleWorker) {
      const c = await googleConfig(db, null, "worker", {
        secret: googleWorker,
      });
      if (!c) return reply({ error: "Conexão inválida." }, 403);
      await active(c.workspace_id);
      await syncGoogle(db, c.workspace_id);
      return reply({ ok: true });
    }
    const hook = url.searchParams.get("whatsapp"),
      worker = url.searchParams.get("worker");
    if (hook || worker) {
      const c = await checked(
        db.rpc("agency_workspace_find_connection", {
          p_secret: hook || worker,
          p_worker: !!worker,
        }),
      );
      if (!c) return reply({ error: "Conexão inválida." }, 403);
      await active(c.workspace_id);
      if (worker) {
        await work(c.workspace_id);
        return reply({ ok: true });
      }
      const state = await account(c);
      if (!state.connected) return reply({ ok: true });
      const event = normalizeWhatsappEvent(body);
      if (event)
        await checked(
          db.rpc("agency_workspace_ingest_message", {
            p_workspace: c.workspace_id,
            p_account: state.account_id,
            p_event: event,
          }),
        );
      await work(c.workspace_id);
      return reply({ ok: true });
    }
    const external = url.searchParams.get("intake");
    if (external) {
      if (!uuid(body.request_id))
        throw Error("Informe request_id UUID para evitar duplicação.");
      const result = await checked(
        db.rpc("agency_workspace_external_capture", {
          p_token: external,
          p_request: body.request_id,
          p_contact: publicContact(body.contact),
        }),
      );
      await work(result.workspace_id);
      return reply({ ok: true });
    }
    if (body.action === "public_form") {
      const f = await publicResource("form", body.token);
      if (uuid(body.view_id))
        await checked(
          db.from("agency_workspace_form_views").upsert(
            {
              form_id: f.id,
              workspace_id: f.workspace_id,
              view_id: body.view_id,
            },
            { onConflict: "form_id,view_id", ignoreDuplicates: true },
          ),
        );
      return reply({
        title: f.title,
        description: f.description,
        fields: f.fields,
      });
    }
    if (body.action === "submit_form") {
      const f = await publicResource("form", body.token);
      if (!uuid(body.request_id)) throw Error("Solicitação inválida.");
      const answers = formAnswers(f.fields, body.answers);
      const result = await checked(
        db.rpc("agency_workspace_submit_form", {
          p_token: body.token,
          p_request: body.request_id,
          p_answers: answers,
        }),
      );
      await work(f.workspace_id).catch(() => {});
      return reply(result);
    }
    if (body.action === "public_invite") {
      const i = await publicResource("invite", body.token);
      const w = await checked(
        db
          .from("agency_client_workspaces")
          .select("name")
          .eq("id", i.workspace_id)
          .single(),
      );
      return reply({ name: w.name, role: i.role, expires_at: i.expires_at });
    }
    if (body.action === "public_calendar") {
      const c = await publicResource("calendar", body.token);
      const rows = body.date
        ? await checked(
            db
              .from("agency_workspace_appointments")
              .select("starts_at,ends_at")
              .eq("workspace_id", c.workspace_id)
              .eq("calendar_id", c.id)
              .eq("status", "confirmed")
              .gte(
                "starts_at",
                new Date(
                  Date.parse(String(body.date) + "T00:00:00Z") - 86400000,
                ).toISOString(),
              )
              .lte(
                "starts_at",
                new Date(
                  Date.parse(String(body.date) + "T00:00:00Z") + 2 * 86400000,
                ).toISOString(),
              ),
          )
        : [];
      return reply({
        title: c.title,
        description: c.description,
        duration_minutes: c.duration_minutes,
        timezone: c.timezone,
        slots: body.date
          ? bookingSlots(
              c,
              [
                ...rows,
                ...(await googleBusy(
                  db,
                  c.workspace_id,
                  new Date(
                    Date.parse(String(body.date) + "T00:00:00Z") - 86400000,
                  ).toISOString(),
                  new Date(
                    Date.parse(String(body.date) + "T00:00:00Z") + 2 * 86400000,
                  ).toISOString(),
                )),
              ],
              String(body.date),
            )
          : [],
      });
    }
    if (body.action === "book") {
      const c = await publicResource("calendar", body.token);
      if (!uuid(body.request_id)) throw Error("Solicitação inválida.");
      const contact = publicContact(body.contact);
      const end = new Date(
        Date.parse(body.starts_at) + c.duration_minutes * 60000,
      ).toISOString();
      if ((await googleBusy(db, c.workspace_id, body.starts_at, end)).length)
        throw Error("Este horário está ocupado no Google. Escolha outro.");
      const result = await checked(
        db.rpc("agency_workspace_book", {
          p_token: body.token,
          p_request: body.request_id,
          p_name: contact.name,
          p_phone: contact.phone,
          p_email: contact.email,
          p_start: body.starts_at,
          p_notes: String(body.notes || "").slice(0, 4000),
        }),
      );
      await work(c.workspace_id).catch(() => {});
      return reply(result);
    }
    // Authorization is checked using the user's JWT and current membership, never body-supplied roles.
    const jwt = req.headers.get("authorization");
    if (!jwt?.startsWith("Bearer "))
      return reply({ error: "Entre na sua conta." }, 401);
    const client = createClient(base, Deno.env.get("SUPABASE_ANON_KEY") || "", {
      global: { headers: { Authorization: jwt } },
      auth: { persistSession: false },
    });
    const {
      data: { user },
      error: authError,
    } = await client.auth.getUser();
    if (authError || !user) return reply({ error: "Sessão inválida." }, 401);
    if (!uuid(body.workspace_id)) throw Error("Subconta inválida.");
    const workspace = body.workspace_id,
      permissions = await checked(
        client.rpc("agency_workspace_permissions", { p_workspace: workspace }),
      );
    if (!permissions.can_read)
      return reply({ error: "Sem acesso a esta subconta." }, 403);
    const managers = [
      "google_connect",
      "google_disconnect",
      "save_whatsapp",
      "connect_whatsapp",
      "disconnect_whatsapp",
      "save_webhook",
      "integration_settings",
    ];
    if (managers.includes(body.action) && !permissions.can_manage)
      return reply(
        { error: "Somente administradores podem configurar integrações." },
        403,
      );
    if (["send", "process"].includes(body.action) && !permissions.can_write)
      return reply({ error: "Sem permissão de edição." }, 403);
    if (body.action === "google_connect") {
      await active(workspace);
      return reply({ url: await startGoogle(db, workspace, user.id) });
    }
    if (body.action === "google_disconnect") {
      await googleConfig(db, workspace, "disconnect");
      return reply({ ok: true });
    }
    if (body.action === "integration_settings") {
      const c = await connection(workspace),
        h = await connection(workspace, "webhook");
      return reply({
        google: {
          configured: googleReady(),
          connected: !!(await googleConfig(db, workspace)),
          redirect_uri: googleRedirect(),
        },
        whatsapp: c
          ? {
              instance_id: c.instance_id,
              enabled: c.enabled,
              account_id: c.active_account_id,
              pipeline_id: c.pipeline_id,
              stage_id: c.stage_id,
            }
          : null,
        webhook: h
          ? {
              enabled: h.enabled,
              pipeline_id: h.pipeline_id,
              stage_id: h.stage_id,
              url: `${base}/functions/v1/workspace-operations?intake=${h.token}`,
            }
          : null,
      });
    }
    if (body.action === "save_whatsapp") {
      await active(workspace);
      if (
        !/^[\w-]{1,160}$/.test(body.instance_id) ||
        typeof body.token !== "string" ||
        !body.token.trim() ||
        body.token.length > 4000
      )
        throw Error("Informe a instância e o token.");
      const info = await provider(body, "instance/fetch-instance");
      if (
        info.webhookReceivedUrl &&
        !String(info.webhookReceivedUrl).startsWith(
          base + "/functions/v1/workspace-operations?whatsapp=",
        )
      )
        throw Error(
          "Esta instância usa outro webhook. Utilize uma instância exclusiva para esta subconta.",
        );
      await connection(workspace, "whatsapp", {
        instance_id: body.instance_id,
        token: body.token.trim(),
        pipeline_id: body.pipeline_id,
        stage_id: body.stage_id,
      });
      return reply({ ok: true });
    }
    if (body.action === "save_webhook") {
      await active(workspace);
      const h = await connection(workspace, "webhook", {
        pipeline_id: body.pipeline_id,
        stage_id: body.stage_id,
        enabled: body.enabled,
      });
      return reply({
        ok: true,
        url: `${base}/functions/v1/workspace-operations?intake=${h.token}`,
      });
    }
    const c = await connection(workspace);
    if (body.action === "disconnect_whatsapp") {
      if (c)
        await connection(workspace, "whatsapp", {
          enabled: false,
          active_account_id: null,
        });
      return reply({ ok: true });
    }
    if (body.action === "connect_whatsapp") {
      if (!c) throw Error("Salve a instância primeiro.");
      await active(workspace);
      const callback = `${base}/functions/v1/workspace-operations?whatsapp=${c.webhook_secret}`,
        info = await provider(c, "instance/fetch-instance");
      if (
        [info.webhookReceivedUrl, info.webhookDeliveryUrl].some(
          (x) => x && x !== callback,
        )
      )
        throw Error(
          "Esta instância usa outro webhook. A conexão existente foi preservada.",
        );
      await provider(c, "webhook/update-webhook-received", "PUT", {
        value: callback,
        enabled: true,
      });
      await provider(c, "webhook/update-webhook-delivery", "PUT", {
        value: callback,
        enabled: true,
      });
      const verify = await provider(c, "instance/fetch-instance");
      if (
        verify.webhookReceivedUrl !== callback ||
        verify.webhookDeliveryUrl !== callback
      )
        throw Error("O provedor ainda não confirmou os dois webhooks.");
      await connection(workspace, "whatsapp", { enabled: true });
      const state = await account({ ...c, enabled: true });
      let qrcode = null;
      if (!state.connected) {
        const qr = await provider(c, "instance/qr-code");
        const value = qr.qrcode || qr.qrCode || qr.value || "";
        if (
          /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=\s]+$/.test(value)
        )
          qrcode = value;
      }
      return reply({ ...state, qrcode });
    }
    if (body.action === "whatsapp_status") {
      if (!c?.enabled)
        return reply({ connected: false, account_id: null, phone: null });
      await active(workspace);
      return reply(await account(c));
    }
    if (body.action === "send") {
      await active(workspace);
      if (!c?.enabled) throw Error("Conecte o WhatsApp desta subconta.");
      const state = await account(c);
      if (!state.connected || state.account_id !== body.account_id)
        throw Error("O número conectado mudou. Atualize a conversa.");
      const phone = whatsappPhone(body.phone);
      if (
        !validWhatsappAddress(phone) ||
        !uuid(body.request_id) ||
        typeof body.text !== "string" ||
        !body.text.trim() ||
        body.text.length > 4000
      )
        throw Error("Mensagem ou destinatário inválido.");
      await checked(
        db.from("agency_workspace_message_outbox").upsert(
          {
            workspace_id: workspace,
            account_id: state.account_id,
            phone,
            body: body.text.trim(),
            request_id: body.request_id,
          },
          { onConflict: "workspace_id,request_id", ignoreDuplicates: true },
        ),
      );
      await work(workspace);
      const outbox = await checked(
        db
          .from("agency_workspace_message_outbox")
          .select("status,error")
          .eq("workspace_id", workspace)
          .eq("request_id", body.request_id)
          .single(),
      );
      return reply(outbox);
    }
    if (body.action === "process") {
      await work(workspace);
      return reply({ ok: true });
    }
    return reply({ error: "Operação inválida." }, 400);
  } catch (e) {
    const error = e as { message?: string; code?: string };
    const message =
      error.code === "23505"
        ? "Esta instância já pertence a outra subconta."
        : error.message || "Não foi possível concluir.";
    return reply(
      {
        error:
          message.includes("agency_") ||
          message.includes("relation ") ||
          message.includes("column ")
            ? "Não foi possível concluir. Revise a configuração."
            : message,
      },
      400,
    );
  }
}
Deno.serve(handle);
