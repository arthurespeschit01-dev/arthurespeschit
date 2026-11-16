import { sendWorkspaceInvite } from "../_shared/workspace-invites.ts";
import {
  receiveOptOut,
  assertCampaignAllowed,
} from "../_shared/workspace-whatsapp-preferences.ts";
import {
  cloudApp,
  cloudGraph,
  exchangeCloudCode,
  verifyCloudNumber,
  cloudWebhookEvents,
  cloudMessage,
  cloudWithinWindow,
  graphVersion,
} from "../_shared/workspace-cloud.ts";
import { verifyMetaSignature } from "../_shared/workspace-meta.ts";
import { fetchWorkspaceQr } from "../_shared/workspace-qr.ts";
import { processWorkspaceAi } from "../_shared/workspace-ai.ts";
import {
  decodeClickRef,
  googleConversionCsv,
  trackingSiteScript,
  validTrackingKey,
} from "../_shared/workspace-tracking.ts";
import {
  workspaceFormDefinition,
  workspaceAnswerError,
} from "../_shared/workspace-form.ts";
import {
  mappedWebhook,
  trackingRedirect,
} from "../_shared/workspace-triggers.ts";
import { receiveMetaLead } from "../_shared/workspace-meta.ts";
import { providerMedia } from "../_shared/agency-whatsapp-upload.ts";
import {
  processWorkspaceActions,
  providerConfig,
  providerSummary,
  validateProvider,
  prepareAsset,
  asset,
  attribution,
  whatsappAttribution,
  channelKinds,
} from "../_shared/workspace-actions.ts";
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
  if (c.transport === "cloud") {
    if (path === "instance/fetch-instance") {
      const info = await cloudGraph(
        `${c.cloud_phone_id}?fields=id,display_phone_number,platform_type`,
        c.token,
      );
      return {
        connected: c.enabled && info.platform_type === "CLOUD_API",
        connectedPhone: info.display_phone_number,
      };
    }
    let payload;
    try {
      payload = cloudMessage(path, body);
    } catch (e) {
      (e as any).explicit = true;
      throw e;
    }
    await cloudWithinWindow(db, c, payload.to);
    const data = await cloudGraph(
      `${c.cloud_phone_id}/messages`,
      c.token,
      "POST",
      payload,
    );
    return { messageId: data.messages?.[0]?.id };
  }
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
  await processWorkspaceAi(db, workspace);
  await processWorkspaceActions(
    db,
    workspace,
    async (c: any, path: string, method: string, body: any) => {
      for (const phone of body?.phone ? [body.phone] : body?.participants || [])
        await assertCampaignAllowed(db, workspace, phone);
      const current = await account(c);
      if (current.account_id !== c.active_account_id)
        throw Error("O número conectado mudou.");
      return await provider(c, path, method, body);
    },
  );
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
      if (m.run_id) await assertCampaignAllowed(db, workspace, m.phone);
      const media = m.media_path
        ? providerMedia(
            await asset(db, workspace, m.media_path),
            m.phone,
            m.body,
          )
        : null;
      const result = await provider(
        c,
        media?.action || "message/send-text",
        "POST",
        media?.body || { phone: m.phone, message: m.body },
      );
      id =
        String(result.messageId || result.id || result.key?.id || "") || null;
      status = id ? "sent" : "uncertain";
    } catch (e) {
      if ((e as any).explicit) status = "failed";
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
      (!["pending", "accepted"].includes(row.status) ||
        Date.parse(row.expires_at) < Date.now()))
  )
    throw Error("Link inválido, expirado ou desativado.");
  await active(row.workspace_id);
  return row;
}
async function prepareWapi(c: any) {
  const workspace = c.workspace_id;
  if (c.transport === "cloud") throw Error("Esta conexão usa a API oficial.");
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
        `${app}/${(await checked(db.rpc("agency_account_owner", { p_workspace: workspace }))) ? `conta/${workspace}/google-agenda` : `subcontas/${workspace}/google-agenda`}?google=connected`,
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
  if (req.method === "GET" && callbackUrl.searchParams.has("tracking_script")) {
    const token = callbackUrl.searchParams.get("tracking_script") || "";
    if (!validTrackingKey(token))
      return reply({ error: "Link inválido." }, 404);
    return new Response(
      trackingSiteScript(callbackUrl.origin + callbackUrl.pathname, token),
      {
        headers: {
          "Content-Type": "application/javascript; charset=utf-8",
          "Cache-Control": "public,max-age=300",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  }
  if (req.method === "GET" && callbackUrl.searchParams.has("google_feed")) {
    const token = callbackUrl.searchParams.get("google_feed") || "";
    if (!/^[a-f0-9]{64}$/.test(token))
      return reply({ error: "Feed inválido." }, 404);
    const data = await checked(
      db.rpc("agency_workspace_google_feed_rows", { p_token: token }),
    );
    if (!data) return reply({ error: "Feed pausado ou inválido." }, 404);
    return new Response(googleConversionCsv(data.rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Disposition": 'attachment; filename="conversions.csv"',
      },
    });
  }
  if (req.method === "GET" && callbackUrl.searchParams.get("link")) {
    const incoming = attribution(
      Object.fromEntries(callbackUrl.searchParams),
      req,
    );
    const resolved = await checked(
      db.rpc("agency_workspace_resolve_tracking_link", {
        p_token: callbackUrl.searchParams.get("link"),
        p_attributes: incoming,
      }),
    );
    if (!resolved) return reply({ error: "Link indisponível." }, 404);
    return new Response(null, {
      status: 302,
      headers: {
        Location: trackingRedirect(resolved, callbackUrl),
        "Cache-Control": "no-store",
      },
    });
  }
  if (req.method === "GET" && callbackUrl.searchParams.get("meta_workspace")) {
    const workspace = callbackUrl.searchParams.get("meta_workspace")!;
    if (!uuid(workspace)) return reply({ error: "Subconta inválida." }, 400);
    const c = await providerConfig(db, workspace, "meta");
    if (
      c?.enabled &&
      c.credentials?.verify_token &&
      callbackUrl.searchParams.get("hub.mode") === "subscribe" &&
      callbackUrl.searchParams.get("hub.verify_token") ===
        c.credentials.verify_token
    )
      return new Response(callbackUrl.searchParams.get("hub.challenge") || "", {
        headers: { "content-type": "text/plain", "cache-control": "no-store" },
      });
    return reply({ error: "Verificação recusada." }, 403);
  }
  if (req.method === "GET" && callbackUrl.searchParams.has("cloud_whatsapp")) {
    const verify = Deno.env.get("META_WHATSAPP_VERIFY_TOKEN");
    if (
      verify &&
      callbackUrl.searchParams.get("hub.mode") === "subscribe" &&
      callbackUrl.searchParams.get("hub.verify_token") === verify
    )
      return new Response(callbackUrl.searchParams.get("hub.challenge") || "", {
        headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" },
      });
    return reply({ error: "Verificação recusada." }, 403);
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
    if (url.searchParams.has("pair_whatsapp")) {
      const token = url.searchParams.get("pair_whatsapp") || "";
      if (!/^[a-f0-9]{64}$/.test(token))
        return reply({ error: "Link inválido." }, 404);
      const c = await checked(
        db.rpc("agency_workspace_pair_link", { p_token: token }),
      );
      if (!c) return reply({ error: "Link expirado ou desativado." }, 404);
      const state = await account(c);
      return reply({
        connected: state.connected,
        qrcode:
          !state.connected && body.refresh === true
            ? await fetchWorkspaceQr(c)
            : null,
      });
    }
    if (url.searchParams.has("cloud_whatsapp")) {
      const secret = Deno.env.get("META_WHATSAPP_APP_SECRET") || "";
      if (
        !(await verifyMetaSignature(
          raw,
          req.headers.get("x-hub-signature-256") || "",
          secret,
        ))
      )
        return reply({ error: "Assinatura Meta inválida." }, 403);
      if (body.object !== "whatsapp_business_account")
        return reply({ ok: true });
      for (const entry of (body.entry || []).slice(0, 50)) {
        const phones = [
          ...new Set(
            (entry.changes || [])
              .map((ch: any) =>
                String(ch.value?.metadata?.phone_number_id || ""),
              )
              .filter((id: string) => /^[0-9]{5,30}$/.test(id)),
          ),
        ];
        for (const phone of phones) {
          const c = await checked(
            db.rpc("agency_workspace_cloud_find", {
              p_waba: String(entry.id),
              p_phone: phone,
            }),
          );
          if (!c?.active_account_id) continue;
          for (const event of cloudWebhookEvents(
            { object: body.object, entry: [entry] },
            c,
          )) {
            await receiveOptOut(db, c.workspace_id, event);
            await checked(
              db.rpc("agency_workspace_ingest_message", {
                p_workspace: c.workspace_id,
                p_account: c.active_account_id,
                p_event: {
                  ...event,
                  attribution: {
                    ...event.attribution,
                    ...(decodeClickRef(event.body)
                      ? { cg_ref: decodeClickRef(event.body) }
                      : {}),
                  },
                },
              }),
            );
          }
          await work(c.workspace_id);
        }
      }
      return reply({ ok: true });
    }
    const metaWorkspace = url.searchParams.get("meta_workspace");
    if (metaWorkspace) {
      if (!uuid(metaWorkspace))
        return reply({ error: "Subconta inválida." }, 400);
      await active(metaWorkspace);
      await receiveMetaLead(
        db,
        metaWorkspace,
        raw,
        req.headers.get("x-hub-signature-256") || "",
      );
      await work(metaWorkspace);
      return reply({ ok: true });
    }
    const providerWorker = url.searchParams.get("provider_worker");
    if (providerWorker) {
      const workspace = await checked(
        db.rpc("agency_workspace_provider_worker", {
          p_secret: providerWorker,
        }),
      );
      if (!workspace) return reply({ error: "Conexão inválida." }, 403);
      await active(workspace);
      await work(workspace);
      return reply({ ok: true });
    }
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
      if (event) {
        await receiveOptOut(db, c.workspace_id, event);
        await checked(
          db.rpc("agency_workspace_ingest_message", {
            p_workspace: c.workspace_id,
            p_account: state.account_id,
            p_event: {
              ...event,
              attribution: {
                ...whatsappAttribution(body),
                ...(decodeClickRef(event.body)
                  ? { cg_ref: decodeClickRef(event.body) }
                  : {}),
              },
            },
          }),
        );
      }
      await work(c.workspace_id);
      return reply({ ok: true });
    }
    const automationHook = url.searchParams.get("automation_webhook");
    if (automationHook) {
      if (!/^[a-f0-9]{64}$/.test(automationHook))
        return reply({ error: "Webhook inválido." }, 404);
      const h = await checked(
        db.rpc("agency_workspace_find_automation_webhook", {
          p_token: automationHook,
        }),
      );
      if (!h) return reply({ error: "Webhook inválido ou pausado." }, 404);
      await active(h.workspace_id);
      const mapped = await mappedWebhook(body, h.contact_map, h.id);
      const attrs = attribution(body.attribution);
      const result = await checked(
        db.rpc("agency_workspace_receive_automation_webhook", {
          p_id: h.id,
          p_request: mapped.request,
          p_contact: {
            ...mapped.contact,
            ...(Object.keys(attrs).length ? { attribution: attrs } : {}),
          },
        }),
      );
      await work(h.workspace_id).catch(() => {});
      return reply({ ...result, request_id: mapped.request });
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
        presentation: f.presentation,
      });
    }
    if (body.action === "submit_form") {
      const f = await publicResource("form", body.token);
      if (!uuid(body.request_id)) throw Error("Solicitação inválida.");
      const definitionError = workspaceFormDefinition(f.fields, f.presentation);
      if (definitionError) throw Error(definitionError);
      const answerError = workspaceAnswerError(f.fields, body.answers);
      if (answerError) throw Error(answerError);
      const answers = formAnswers(f.fields, body.answers);
      const result = await checked(
        db.rpc("agency_workspace_submit_form_v2", {
          p_token: body.token,
          p_request: body.request_id,
          p_answers: answers,
          p_attribution: attribution(body.attribution, req),
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
          .select("name,account_kind")
          .eq("id", i.workspace_id)
          .single(),
      );
      const role = i.custom_role_id
        ? await checked(
            db
              .from("agency_workspace_roles")
              .select("name")
              .eq("workspace_id", i.workspace_id)
              .eq("id", i.custom_role_id)
              .single(),
          )
        : null;
      return reply({
        name: w.name,
        account_kind: w.account_kind,
        role: i.role,
        role_name: role?.name,
        email: i.email,
        status: i.status,
        expires_at: i.expires_at,
      });
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
    if (
      ["invite_member", "send_invite_email", "team_settings"].includes(
        body.action,
      )
    ) {
      if (!permissions.can_manage)
        return reply(
          { error: "Somente administradores podem convidar membros." },
          403,
        );
      await active(workspace);
      if (body.action === "team_settings")
        return reply({ email_configured: !!Deno.env.get("RESEND_API_KEY") });
      let id = body.id;
      if (body.action === "invite_member") {
        const roleId = body.custom_role_id || null;
        if (roleId && !uuid(roleId)) throw Error("Função inválida.");
        if (!roleId && !["admin", "agent", "viewer"].includes(body.role))
          throw Error("Escolha uma função válida.");
        const saved = await checked(
          client
            .from("agency_workspace_invitations")
            .insert({
              workspace_id: workspace,
              email: String(body.email || "")
                .trim()
                .toLowerCase(),
              display_name: String(body.display_name || "").trim(),
              role: roleId ? "viewer" : body.role,
              custom_role_id: roleId,
            })
            .select("id")
            .single(),
        );
        id = saved.id;
      }
      if (!uuid(id)) throw Error("Convite inválido.");
      return reply({
        id,
        ...(await sendWorkspaceInvite(
          db,
          workspace,
          id,
          Deno.env.get("AGENCY_APP_URL") || "https://www.centraldogestor.site",
          Deno.env.get("RESEND_API_KEY") || "",
        )),
      });
    }
    const managers = [
      "google_connect",
      "google_disconnect",
      "save_whatsapp",
      "generate_whatsapp_pair_link",
      "cloud_settings",
      "cloud_begin",
      "cloud_complete",
      "whatsapp_preferences",
      "save_whatsapp_preferences",
      "ai_settings",
      "save_ai_settings",
      "provider_settings",
      "google_feed_settings",
      "save_google_feed",
      "save_ad_destination",
      "automation_webhook_settings",
      "save_automation_webhook",
      "retry_action",
      "save_provider",
      "asset_upload",
      "connect_whatsapp",
      "disconnect_whatsapp",
      "save_webhook",
      "integration_settings",
    ];
    const actionModule = [
      "automation_webhook_settings",
      "save_automation_webhook",
      "asset_upload",
    ].includes(body.action)
      ? "flows"
      : body.action === "send"
        ? "conversations"
        : "settings";
    if (
      managers.includes(body.action) &&
      !(permissions.modules?.[actionModule]?.manage ?? permissions.can_manage)
    )
      return reply(
        { error: "Somente administradores podem configurar integrações." },
        403,
      );
    if (
      ["send", "process"].includes(body.action) &&
      !(permissions.modules?.conversations?.write ?? permissions.can_write)
    )
      return reply({ error: "Sem permissão de edição." }, 403);
    if (body.action === "google_connect") {
      await active(workspace);
      return reply({ url: await startGoogle(db, workspace, user.id) });
    }
    if (body.action === "google_disconnect") {
      await googleConfig(db, workspace, "disconnect");
      return reply({ ok: true });
    }
    if (body.action === "retry_action") {
      await active(workspace);
      if (!uuid(body.id)) throw Error("Ação inválida.");
      const a = await checked(
        db
          .from("agency_workspace_action_outbox")
          .select("id,status,run_id,node_id")
          .eq("workspace_id", workspace)
          .eq("id", body.id)
          .maybeSingle(),
      );
      if (!a || !["failed", "uncertain"].includes(a.status))
        throw Error("Esta ação não pode ser repetida.");
      if (a.status === "uncertain" && body.confirmed !== true)
        throw Error("Confira o envio no provedor antes de repetir.");
      if (a.run_id) {
        const run = await checked(
          db
            .from("agency_workspace_flow_runs")
            .select("flow_id")
            .eq("workspace_id", workspace)
            .eq("id", a.run_id)
            .single(),
        );
        const flow = await checked(
          db
            .from("agency_workspace_flows")
            .select("enabled")
            .eq("workspace_id", workspace)
            .eq("id", run.flow_id)
            .single(),
        );
        if (!flow.enabled)
          throw Error("Ative o funil antes de repetir esta ação.");
        await checked(
          db
            .from("agency_workspace_flow_runs")
            .update({
              status: "waiting",
              error: null,
              next_run_at: new Date(Date.now() + 365 * 86400000).toISOString(),
            })
            .eq("workspace_id", workspace)
            .eq("id", a.run_id),
        );
        await checked(
          db
            .from("agency_workspace_flow_steps")
            .update({ status: "waiting", detail: null })
            .eq("workspace_id", workspace)
            .eq("run_id", a.run_id)
            .eq("node_id", a.node_id),
        );
      }
      await checked(
        db
          .from("agency_workspace_action_outbox")
          .update({
            status: "queued",
            error: null,
            updated_at: new Date().toISOString(),
          })
          .eq("workspace_id", workspace)
          .eq("id", a.id)
          .eq("status", a.status),
      );
      await work(workspace);
      return reply({ ok: true });
    }
    if (
      body.action === "automation_webhook_settings" ||
      body.action === "save_automation_webhook"
    ) {
      if (body.action === "save_automation_webhook") await active(workspace);
      if (body.id && !uuid(body.id)) throw Error("Webhook inválido.");
      const result = await checked(
        db.rpc("agency_workspace_automation_webhook", {
          p_workspace: workspace,
          p_id: body.id || null,
          p_values:
            body.action === "save_automation_webhook" ? body.values : null,
        }),
      );
      return reply({
        webhook: result
          ? {
              id: result.id,
              name: result.name,
              enabled: result.enabled,
              stage_id: result.stage_id,
              contact_map: result.contact_map,
              url: `${base}/functions/v1/workspace-operations?automation_webhook=${result.token}`,
            }
          : null,
      });
    }
    if (
      body.action === "google_feed_settings" ||
      body.action === "save_google_feed"
    ) {
      if (body.action === "save_google_feed") await active(workspace);
      const feed = await checked(
        db.rpc("agency_workspace_google_feed_settings", {
          p_workspace: workspace,
          p_values: body.action === "save_google_feed" ? body.values : null,
        }),
      );
      const { token, ...settings } = feed;
      return reply({
        ...settings,
        url: token
          ? `${base}/functions/v1/workspace-operations?google_feed=${token}`
          : null,
      });
    }
    if (body.action === "save_ad_destination") {
      await active(workspace);
      const result = await checked(
        db.rpc("agency_workspace_ad_destination", {
          p_workspace: workspace,
          p_values: body.values,
        }),
      );
      return reply(result);
    }
    if (body.action === "ai_settings" || body.action === "save_ai_settings") {
      if (body.action === "save_ai_settings") await active(workspace);
      const c = await checked(
        db.rpc("agency_workspace_ai_settings", {
          p_workspace: workspace,
          p_values: body.action === "save_ai_settings" ? body.values : null,
        }),
      );
      return reply({
        enabled: !!c?.enabled,
        configured: !!c?.api_key,
        model: c?.model || "openai/gpt-5.4-nano",
        daily_limit: c?.daily_limit || 100,
      });
    }
    if (body.action === "provider_settings") {
      const providers = await Promise.all(
        channelKinds.map(async (kind) => [
          kind,
          providerSummary(await providerConfig(db, workspace, kind)),
        ]),
      );
      return reply({
        providers: Object.fromEntries(providers),
        meta_destination: await checked(
          db.rpc("agency_workspace_ad_destination", { p_workspace: workspace }),
        ),
        meta_callback: `${base}/functions/v1/workspace-operations?meta_workspace=${workspace}`,
        link_base: `${base}/functions/v1/workspace-operations?link=`,
      });
    }
    if (body.action === "save_provider") {
      await active(workspace);
      const kind = String(body.kind);
      const previous = await providerConfig(db, workspace, kind);
      const credentials = validateProvider(
        kind,
        body.credentials,
        previous?.credentials,
      );
      if (credentials.entry_stage_id) {
        const stage = await checked(
          db
            .from("agency_workspace_stages")
            .select("id")
            .eq("workspace_id", workspace)
            .eq("id", credentials.entry_stage_id)
            .maybeSingle(),
        );
        if (!stage) throw Error("Escolha uma etapa desta empresa.");
      }
      const required: Record<string, string[]> = {
        meta: ["pixel_id", "access_token"],
        google_ads: [
          "customer_id",
          "conversion_action",
          "client_id",
          "client_secret",
          "refresh_token",
        ],
        email: ["api_key", "from"],
        sms: ["account_sid", "auth_token", "from"],
      };
      if (body.enabled && required[kind]?.some((k) => !credentials[k]))
        throw Error("Preencha os campos obrigatórios antes de ativar.");
      await providerConfig(db, workspace, kind, {
        enabled: body.enabled === true,
        credentials,
      });
      return reply({ ok: true });
    }
    if (body.action === "asset_upload") {
      await active(workspace);
      return reply(
        await prepareAsset(
          db,
          workspace,
          String(body.name || "arquivo"),
          Number(body.size),
        ),
      );
    }
    if (body.action === "asset_url") {
      if (
        permissions.modules &&
        !permissions.modules.conversations?.read &&
        !permissions.modules.flows?.read
      )
        return reply({ error: "Sem acesso a este arquivo." }, 403);
      return reply(await asset(db, workspace, String(body.path || "")));
    }
    if (
      ["cloud_settings", "cloud_begin", "cloud_complete"].includes(body.action)
    ) {
      const app = cloudApp((k) => Deno.env.get(k));
      const ready =
        app.ready &&
        (Deno.env.get("META_WHATSAPP_VERIFY_TOKEN") || "").length >= 16;
      const existing = await connection(workspace);
      if (body.action === "cloud_settings")
        return reply({
          configured: ready,
          app_id: ready ? app.appId : null,
          config_id: ready ? app.configId : null,
          version: graphVersion,
          webhook_url: `${base}/functions/v1/workspace-operations?cloud_whatsapp=1`,
          connected: existing?.transport === "cloud" && existing.enabled,
          phone_number_id:
            existing?.transport === "cloud" ? existing.cloud_phone_id : null,
          coexistence: existing?.transport === "cloud" && existing.coexistence,
        });
      await active(workspace);
      if (!ready)
        throw Error(
          "O aplicativo Meta ainda precisa ser configurado no servidor.",
        );
      if (existing?.enabled)
        throw Error(
          "Desconecte a conexão atual antes de trocar de modalidade.",
        );
      if (body.action === "cloud_begin") {
        if (!["business_app", "new_number"].includes(body.mode))
          throw Error("Escolha a modalidade de conexão.");
        const session = await checked(
          db.rpc("agency_workspace_cloud_signup", {
            p_workspace: workspace,
            p_user: user.id,
            p_mode: body.mode,
          }),
        );
        return reply({
          nonce: session.nonce,
          app_id: app.appId,
          config_id: app.configId,
          version: graphVersion,
        });
      }
      if (typeof body.nonce !== "string" || !/^[a-f0-9]{64}$/.test(body.nonce))
        throw Error("Autorização inválida.");
      const session = await checked(
        db.rpc("agency_workspace_cloud_signup", {
          p_workspace: workspace,
          p_user: user.id,
          p_mode: "new_number",
          p_nonce: body.nonce,
        }),
      );
      const token = await exchangeCloudCode(app, String(body.code || ""));
      const info = await verifyCloudNumber(
        String(body.waba_id || ""),
        String(body.phone_number_id || ""),
        token,
        undefined,
        session.mode === "business_app",
      );
      if (session.mode === "business_app" && !info.is_on_biz_app)
        throw Error(
          "A Meta não confirmou a coexistência com o WhatsApp Business. Confira a configuração do aplicativo.",
        );
      const pin = String(
        body.pin || crypto.getRandomValues(new Uint32Array(1))[0] % 1000000,
      ).padStart(6, "0");
      if (!/^[0-9]{6}$/.test(pin))
        throw Error("O PIN deve conter seis números.");
      const c = await checked(
        db.rpc("agency_workspace_cloud_setup", {
          p_workspace: workspace,
          p_values: {
            waba_id: body.waba_id,
            phone_number_id: info.id,
            token,
            pin,
            pipeline_id: body.pipeline_id,
            stage_id: body.stage_id,
            coexistence: !!info.is_on_biz_app,
          },
        }),
      );
      const subscribed = await cloudGraph(
        `${c.waba_id}/subscribed_apps`,
        token,
        "POST",
        {},
      );
      if (!subscribed.success)
        throw Error("A Meta não confirmou a assinatura dos eventos.");
      if (!info.is_on_biz_app) {
        const registered = await cloudGraph(
          `${c.cloud_phone_id}/register`,
          token,
          "POST",
          { messaging_product: "whatsapp", pin },
        );
        if (!registered.success)
          throw Error("A Meta não confirmou o registro do número.");
      }
      await connection(workspace, "whatsapp", { enabled: true });
      try {
        return reply(await account({ ...c, enabled: true }));
      } catch (e) {
        await connection(workspace, "whatsapp", {
          enabled: false,
          active_account_id: null,
        });
        throw e;
      }
    }
    if (
      ["whatsapp_preferences", "save_whatsapp_preferences"].includes(
        body.action,
      )
    )
      return reply(
        await checked(
          db.rpc("agency_workspace_whatsapp_preferences", {
            p_workspace: workspace,
            p_values:
              body.action === "save_whatsapp_preferences" ? body.values : null,
          }),
        ),
      );
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
              instance_id: c.transport === "cloud" ? "" : c.instance_id,
              transport: c.transport || "wapi",
              cloud_phone_id: c.cloud_phone_id,
              coexistence: c.coexistence,
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
    if (body.action === "generate_whatsapp_pair_link") {
      await active(workspace);
      const c = await connection(workspace);
      if (!c || c.transport === "cloud")
        throw Error("Configure uma instância por QR Code primeiro.");
      await prepareWapi(c);
      const link = await checked(
        db.rpc("agency_workspace_pair_link", { p_workspace: workspace }),
      );
      return reply({
        url: `${Deno.env.get("AGENCY_APP_URL") || "https://www.centraldogestor.site"}/conectar-whatsapp/${link.token}`,
        expires_at: link.expires_at,
      });
    }
    if (body.action === "save_whatsapp") {
      await active(workspace);
      const current = await connection(workspace);
      if (current?.enabled && current.transport === "cloud")
        throw Error("Desconecte a API oficial antes de configurar o QR Code.");
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
      if (c.transport === "cloud")
        throw Error("Use a aba API Oficial para conectar este número.");
      await active(workspace);
      await prepareWapi(c);
      const state = await account({ ...c, enabled: true });
      const qrcode = state.connected ? null : await fetchWorkspaceQr(c);
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
      if (c.transport === "cloud") await cloudWithinWindow(db, c, phone);
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
