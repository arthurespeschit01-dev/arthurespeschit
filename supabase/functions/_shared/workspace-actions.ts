import { whatsappPhone, validWhatsappAddress } from "./agency-whatsapp.ts";
import {
  providerMedia,
  uploadName,
  mediaKind,
} from "./agency-whatsapp-upload.ts";
export const channelKinds = ["meta", "google_ads", "email", "sms"] as const;
const checks: Record<string, Record<string, RegExp>> = {
  meta: {
    pixel_id: /^\d{5,30}$/,
    page_id: /^\d{5,30}$/,
    access_token: /^[A-Za-z0-9_-]{20,4096}$/,
    app_secret: /^[a-fA-F0-9]{32}$/,
    test_event_code: /^[A-Za-z0-9_ -]{1,100}$/,
    entry_stage_id: /^[a-f0-9-]{36}$/,
    verify_token: /^[A-Za-z0-9_-]{16,160}$/,
  },
  google_ads: {
    customer_id: /^\d{10}$/,
    conversion_action: /^\d{1,30}$/,
    developer_token: /^[\w-]{10,256}$/,
    client_id: /^[\w.-]{10,300}$/,
    client_secret: /^[\w-]{10,300}$/,
    refresh_token: /^[A-Za-z0-9_.+\/=-]{10,4096}$/,
  },
  email: { api_key: /^re_[\w-]{10,256}$/, from: /^[^\r\n]{3,254}$/ },
  sms: {
    account_sid: /^AC[a-fA-F0-9]{32}$/,
    auth_token: /^[a-fA-F0-9]{32}$/,
    from: /^\+[0-9]{10,15}$/,
  },
};
export function validateProvider(
  kind: string,
  input: unknown,
  previous: Record<string, unknown> = {},
) {
  if (
    !channelKinds.includes(kind as any) ||
    !input ||
    typeof input !== "object" ||
    Array.isArray(input)
  )
    throw Error("Configuração inválida.");
  const v = input as Record<string, unknown>,
    result: Record<string, unknown> = {};
  for (const [key, pattern] of Object.entries(checks[kind])) {
    if (v[key] === undefined || v[key] === "") continue;
    const value = String(v[key]).trim();
    if (!pattern.test(value)) throw Error(`Confira o campo ${key}.`);
    result[key] = value;
  }
  const limit = Number(v.daily_limit ?? previous.daily_limit ?? 100);
  if (!Number.isInteger(limit) || limit < 1 || limit > 10000)
    throw Error("Defina um limite diário entre 1 e 10.000 ações.");
  result.daily_limit = limit;
  return { ...previous, ...result };
}
export function providerSummary(c: any) {
  if (!c) return null;
  const secret = new Set([
    "access_token",
    "api_key",
    "auth_token",
    "client_secret",
    "refresh_token",
    "developer_token",
    "app_secret",
    "verify_token",
  ]);
  return {
    enabled: c.enabled,
    credentials: Object.fromEntries(
      Object.entries(c.credentials || {}).filter(([k]) => !secret.has(k)),
    ),
    configured: Object.fromEntries(
      Object.entries(c.credentials || {})
        .filter(([k]) => secret.has(k))
        .map(([k, v]) => [k, !!v]),
    ),
  };
}
async function rpc(db: any, name: string, args: unknown) {
  const { data, error } = await db.rpc(name, args);
  if (error) throw Error("Não foi possível concluir a ação no banco.");
  return data;
}
export const providerConfig = (
  db: any,
  workspace: string,
  kind: string,
  values?: unknown,
) =>
  rpc(db, "agency_workspace_provider", {
    p_workspace: workspace,
    p_kind: kind,
    p_values: values ?? null,
  });
async function response(r: Response) {
  let data: any = {};
  try {
    data = await r.json();
  } catch {
    /* HTTP status below determines rejection */
  }
  if (!r.ok || data.error || data.partialFailureError) {
    const e = new Error(
      "O provedor recusou a ação. Revise as credenciais e os dados.",
    );
    (e as any).explicit = true;
    throw e;
  }
  return data;
}
const hash = async (s: string) =>
  [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
export async function asset(db: any, workspace: string, path: string) {
  if (
    !path.startsWith(workspace + "/outgoing/") ||
    path.includes("..") ||
    !/^[-a-zA-Z0-9_./]+$/.test(path) ||
    path.split("/").length !== 4
  )
    throw Error("Anexo não pertence a esta empresa.");
  const parts = path.split("/"),
    name = parts.pop()!;
  const { data: rows, error } = await db.storage
    .from("workspace-automation-assets")
    .list(parts.join("/"), { search: name, limit: 100 });
  const f = rows?.find((r: any) => r.name === name);
  if (error || !f?.metadata?.size || f.metadata.size > 16777216)
    throw Error("Anexo indisponível ou maior que 16 MB.");
  const { data, error: sign } = await db.storage
    .from("workspace-automation-assets")
    .createSignedUrl(path, 3600);
  if (sign) throw Error("Anexo indisponível.");
  const mime = String(f.metadata.mimetype || "application/octet-stream");
  return { url: data.signedUrl, mime, name, kind: mediaKind(mime) };
}
export async function prepareAsset(
  db: any,
  workspace: string,
  name: string,
  size: number,
) {
  if (!Number.isInteger(size) || size < 1 || size > 16777216)
    throw Error("Selecione um arquivo de até 16 MB.");
  const path = `${workspace}/outgoing/${crypto.randomUUID()}/${uploadName(name)}`;
  const { data, error } = await db.storage
    .from("workspace-automation-assets")
    .createSignedUploadUrl(path);
  if (error) throw Error("Não foi possível preparar o anexo.");
  return { path, token: data.token };
}
export async function executeWorkspaceAction(
  db: any,
  a: any,
  wapi: (c: any, path: string, method?: string, body?: unknown) => Promise<any>,
) {
  const p = a.payload;
  const kind =
    a.action === "send_email"
      ? "email"
      : a.action === "send_sms"
        ? "sms"
        : a.action === "meta_event"
          ? "meta"
          : a.action === "google_conversion"
            ? "google_ads"
            : null;
  if (!kind) {
    const c = await rpc(db, "agency_workspace_connection", {
      p_workspace: a.workspace_id,
      p_kind: "whatsapp",
      p_values: null,
    });
    if (
      !c?.enabled ||
      !c.active_account_id ||
      c.active_account_id !== p.account_id
    )
      throw Error(
        "O número conectado mudou. Revise esta execução antes de enviar.",
      );
    const phone = whatsappPhone(p.phone);
    if (!validWhatsappAddress(phone)) throw Error("Telefone do lead inválido.");
    if (a.action === "create_group") {
      const participants = [
        ...new Set([phone, ...(p.participants || []).map(whatsappPhone)]),
      ];
      if (participants.some((x) => !validWhatsappAddress(x) || x.includes("@")))
        throw Error("Participantes inválidos.");
      const result = await wapi(c, "group/create-group", "POST", {
        groupName: String(p.text).slice(0, 100),
        participants,
        autoInvite: false,
      });
      if (!result.group?.id) throw Error("O provedor não confirmou o grupo.");
      return {
        provider: result.group.id,
        result: { group_id: result.group.id },
      };
    }
    if (a.action === "add_participants") {
      if (!/^[0-9-]+@g\.us$/.test(p.group_id || ""))
        throw Error("Crie o grupo antes de adicionar participantes.");
      const participants = (p.participants || []).map(whatsappPhone);
      if (
        !participants.length ||
        participants.some(
          (x: string) => !validWhatsappAddress(x) || x.includes("@"),
        )
      )
        throw Error("Participantes inválidos.");
      const result = await wapi(c, "group/add-participant", "POST", {
        groupId: p.group_id,
        participants,
      });
      return { provider: String(result.id || a.id), result: {} };
    }
    if (a.action === "send_event") {
      // Calendar attachment is interoperable; no unsupported native-event payload is guessed.
      const escape = (v: string) =>
        String(v).replace(/[\\;\n,]/g, (x) => (x === "\n" ? "\\n" : "\\" + x));
      const stamp = (s: string) =>
        new Date(s)
          .toISOString()
          .replace(/[-:]/g, "")
          .replace(/\.\d{3}/, "");
      const ics = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Central do Gestor//Agenda//PT\r\nBEGIN:VEVENT\r\nUID:${a.id}@centraldogestor.site\r\nDTSTAMP:${stamp(a.created_at)}\r\nDTSTART:${stamp(p.starts_at)}\r\nDTEND:${stamp(p.ends_at)}\r\nSUMMARY:${escape("Reunião - " + p.name)}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;
      const path = `${a.workspace_id}/outgoing/${a.id}/reuniao.ics`;
      await db.storage
        .from("workspace-automation-assets")
        .upload(path, new Blob([ics], { type: "text/calendar" }), {
          upsert: true,
        });
      const file = await asset(db, a.workspace_id, path);
      const out = providerMedia(file, phone, "Convite da reunião");
      const result = await wapi(c, out.action, "POST", out.body);
      if (!result.messageId && !result.id && !result.key?.id)
        throw Error("Envio do convite não confirmado.");
      return {
        provider: String(result.messageId || result.id || result.key.id),
        result: {},
      };
    }
    throw Error("Ação não suportada.");
  }
  const config = await providerConfig(db, a.workspace_id, kind);
  if (!config?.enabled)
    throw Error("Conecte e ative o provedor desta empresa nas configurações.");
  const c = config.credentials;
  const { count, error: countError } = await db
    .from("agency_workspace_action_outbox")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", a.workspace_id)
    .eq("action", a.action)
    .in("status", ["sending", "sent", "uncertain"])
    .gte("created_at", new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  if (countError || Number(count) > Number(c.daily_limit || 100))
    throw Error("Limite diário do canal atingido.");
  if (kind === "email") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email || ""))
      throw Error("O lead não tem e-mail válido.");
    const data = await response(
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${c.api_key}`,
          "Content-Type": "application/json",
          "Idempotency-Key": a.id,
        },
        body: JSON.stringify({
          from: c.from,
          to: [p.email],
          subject: p.subject,
          text: p.text,
        }),
        signal: AbortSignal.timeout(15000),
      }),
    );
    if (typeof data.id !== "string" || !data.id)
      throw Error("O provedor não confirmou o e-mail.");
    return { provider: data.id, result: {} };
  }
  if (kind === "sms") {
    const phone = whatsappPhone(p.phone);
    if (!/^\d{10,15}$/.test(phone) || !p.text || p.text.length > 160)
      throw Error(
        "SMS inválido: confira o telefone e o limite de 160 caracteres.",
      );
    const data = await response(
      await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${c.account_sid}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: "Basic " + btoa(c.account_sid + ":" + c.auth_token),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            From: c.from,
            To: "+" + phone,
            Body: p.text,
          }),
          signal: AbortSignal.timeout(15000),
        },
      ),
    );
    if (typeof data.sid !== "string" || !data.sid)
      throw Error("O provedor não confirmou o SMS.");
    return { provider: data.sid, result: {} };
  }
  if (kind === "meta") {
    const attrs = p.attributes || {};
    const user: any = { external_id: [await hash(p.lead_id)] };
    if (p.email) user.em = [await hash(p.email.trim().toLowerCase())];
    if (p.phone) user.ph = [await hash(whatsappPhone(p.phone))];
    if (attrs.ctwa_clid) user.ctwa_clid = attrs.ctwa_clid;
    if (attrs.fbc) user.fbc = attrs.fbc;
    if (attrs.fbp) user.fbp = attrs.fbp;
    if (attrs.client_ip_address)
      user.client_ip_address = attrs.client_ip_address;
    if (attrs.client_user_agent)
      user.client_user_agent = attrs.client_user_agent;
    const event = {
      event_name: p.event_name,
      event_time: Math.floor(Date.parse(a.created_at) / 1000),
      event_id: a.id,
      action_source: attrs.ctwa_clid
        ? "business_messaging"
        : attrs.source_url
          ? "website"
          : "chat",
      ...(attrs.ctwa_clid ? { messaging_channel: "whatsapp" } : {}),
      ...(attrs.source_url ? { event_source_url: attrs.source_url } : {}),
      user_data: user,
      custom_data: { currency: "BRL", value: Number(p.value || 0) },
    };
    const data = await response(
      await fetch(`https://graph.facebook.com/v25.0/${c.pixel_id}/events`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${c.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          data: [event],
          ...(c.test_event_code ? { test_event_code: c.test_event_code } : {}),
        }),
        signal: AbortSignal.timeout(15000),
      }),
    );
    if (!data.events_received) throw Error("A Meta não confirmou o evento.");
    return { provider: a.id, result: {} };
  }
  const attrs = p.attributes || {};
  if (!attrs.gclid && !attrs.gbraid && !attrs.wbraid)
    throw Error("Este lead não tem identificador de clique do Google Ads.");
  const token = await response(
    await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      body: new URLSearchParams({
        client_id: c.client_id,
        client_secret: c.client_secret,
        refresh_token: c.refresh_token,
        grant_type: "refresh_token",
      }),
      signal: AbortSignal.timeout(15000),
    }),
  );
  const event = {
    adIdentifiers: attrs.gclid
      ? { gclid: attrs.gclid }
      : attrs.gbraid
        ? { gbraid: attrs.gbraid }
        : { wbraid: attrs.wbraid },
    eventTimestamp: new Date(a.created_at).toISOString(),
    transactionId: a.id,
    eventSource: "WEB",
    conversionValue: Number(p.value || 0),
    currency: "BRL",
  };
  const data = await response(
    await fetch("https://datamanager.googleapis.com/v1/events:ingest", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        destinations: [
          {
            operatingAccount: {
              accountType: "GOOGLE_ADS",
              accountId: c.customer_id,
            },
            productDestinationId: c.conversion_action,
          },
        ],
        events: [event],
      }),
      signal: AbortSignal.timeout(15000),
    }),
  );
  if (typeof data.requestId !== "string" || !data.requestId)
    throw Error("O Google Data Manager não confirmou a conversão.");
  return { provider: data.requestId, result: {} };
}
export async function processWorkspaceActions(
  db: any,
  workspace: string,
  wapi: any,
) {
  for (let i = 0; i < 5; i++) {
    const a = await rpc(db, "agency_workspace_claim_action", {
      p_workspace: workspace,
    });
    if (!a) break;
    let status = "uncertain",
      provider = null,
      result: any = {};
    try {
      const done = await executeWorkspaceAction(db, a, wapi);
      status = "sent";
      provider = done.provider;
      result = done.result;
    } catch (e) {
      const error = e as Error & { explicit?: boolean };
      status =
        error.name === "TimeoutError" ||
        error.name === "AbortError" ||
        error instanceof TypeError
          ? "uncertain"
          : "failed";
      result = { error: error.message };
    }
    await rpc(db, "agency_workspace_finish_action", {
      p_id: a.id,
      p_status: status,
      p_provider: provider,
      p_result: result,
    });
  }
}
export function attribution(input: unknown, req?: Request) {
  const v = (input || {}) as Record<string, unknown>,
    out: Record<string, string> = {};
  for (const k of [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
    "gclid",
    "gbraid",
    "wbraid",
    "fbc",
    "fbp",
    "fbclid",
    "cg_click",
  ])
    if (typeof v[k] === "string" && v[k].length <= 500) out[k] = v[k] as string;
  if (typeof v.source_url === "string") {
    try {
      const url = new URL(v.source_url);
      if (url.protocol === "https:") out.source_url = url.origin + url.pathname;
    } catch {
      /* ignore invalid URLs */
    }
  }
  if (req) {
    out.client_user_agent = (req.headers.get("user-agent") || "").slice(0, 500);
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
    if (/^[0-9a-fA-F:.]{3,45}$/.test(ip)) out.client_ip_address = ip;
  }
  if (!out.fbc && out.fbclid) out.fbc = `fb.1.${Date.now()}.${out.fbclid}`;
  return out;
}
export function whatsappAttribution(input: any) {
  const d = input?.data || input || {},
    content =
      d.msgContent?.message ||
      d.msgContent ||
      d.message?.message ||
      d.message ||
      {},
    ctx =
      content.extendedTextMessage?.contextInfo ||
      content.imageMessage?.contextInfo ||
      content.videoMessage?.contextInfo ||
      content.contextInfo ||
      {},
    ad = ctx.externalAdReply || {},
    ref = d.referral || {};
  const out: Record<string, string> = {};
  const id = ad.sourceId || ref.source_id || ref.ad_id,
    click = ad.ctwaClid || ctx.ctwaClid || ref.ctwa_clid,
    url = ad.sourceUrl || ref.source_url;
  if (id) {
    out.meta_ad_id = String(id).slice(0, 160);
    out.utm_source = "meta";
  }
  if (click) {
    out.ctwa_clid = String(click).slice(0, 500);
    out.utm_source = "meta";
  }
  if (typeof url === "string" && url.startsWith("https://"))
    out.source_url = url.slice(0, 2000);
  return out;
}
