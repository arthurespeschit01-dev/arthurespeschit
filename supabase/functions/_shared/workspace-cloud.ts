import { verifyMetaSignature } from "./workspace-meta.ts";
export const graphVersion = "v27.0";
export function cloudApp(env: (key: string) => string | undefined) {
  const appId = env("META_WHATSAPP_APP_ID") || "",
    secret = env("META_WHATSAPP_APP_SECRET") || "",
    configId = env("META_WHATSAPP_CONFIG_ID") || "";
  return {
    appId,
    secret,
    configId,
    ready:
      /^[0-9]{5,30}$/.test(appId) &&
      secret.length >= 32 &&
      /^[0-9]{5,30}$/.test(configId),
  };
}
export async function cloudGraph(
  path: string,
  token: string,
  method = "GET",
  body?: unknown,
  request: typeof fetch = fetch,
) {
  if (!/^[0-9]+(?:\/[a-z_]+)?(?:\?[a-zA-Z0-9_,=&]+)?$/.test(path))
    throw Error("Recurso Meta inválido.");
  const r = await request(
    `https://graph.facebook.com/${graphVersion}/${path}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000),
    },
  );
  const data = await r.json();
  if (!r.ok || data.error) {
    const error = new Error(
      "A Meta recusou a operação. Confira as permissões, o número e a configuração do aplicativo.",
    );
    (error as any).explicit = true;
    throw error;
  }
  return data;
}
export async function exchangeCloudCode(
  app: ReturnType<typeof cloudApp>,
  code: string,
  request: typeof fetch = fetch,
) {
  if (!app.ready || !code || code.length > 4096)
    throw Error("Autorização Meta inválida.");
  const r = await request(
    `https://graph.facebook.com/${graphVersion}/oauth/access_token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: app.appId,
        client_secret: app.secret,
        code,
      }),
      signal: AbortSignal.timeout(15000),
    },
  );
  const data = await r.json();
  if (
    !r.ok ||
    typeof data.access_token !== "string" ||
    data.access_token.length < 20
  )
    throw Error(
      "Não foi possível concluir a autorização. Inicie a conexão novamente.",
    );
  return data.access_token as string;
}
export async function verifyCloudNumber(
  waba: string,
  phone: string,
  token: string,
  request: typeof fetch = fetch,
  allowCoexistenceDiscovery = false,
) {
  if (
    !/^[0-9]{5,30}$/.test(waba) ||
    (phone ? !/^[0-9]{5,30}$/.test(phone) : !allowCoexistenceDiscovery)
  )
    throw Error("Identificação do número Meta inválida.");
  const numbers = await cloudGraph(
    `${waba}/phone_numbers?fields=id,display_phone_number,is_on_biz_app,platform_type&limit=100`,
    token,
    "GET",
    undefined,
    request,
  );
  if (!phone) {
    const eligible = (numbers.data || []).filter(
      (n: any) =>
        n.is_on_biz_app === true &&
        n.platform_type === "CLOUD_API" &&
        /^[0-9]{5,30}$/.test(n.id),
    );
    if (eligible.length !== 1 || numbers.paging?.next)
      throw Error(
        "A Meta retornou a conta sem identificar um único número em coexistência. Conclua a seleção do número no cadastro incorporado.",
      );
    phone = eligible[0].id;
  }
  if (!numbers.data?.some((n: any) => n.id === phone))
    throw Error("O número não pertence à conta WhatsApp autorizada.");
  const info = await cloudGraph(
    `${phone}?fields=id,display_phone_number,verified_name,is_on_biz_app,platform_type`,
    token,
    "GET",
    undefined,
    request,
  );
  if (info.id !== phone)
    throw Error("A Meta não confirmou a identificação do número.");
  const digits = String(info.display_phone_number || "").replace(/\D/g, "");
  if (!/^[0-9]{10,15}$/.test(digits))
    throw Error("A Meta não confirmou o telefone.");
  return { ...info, phone: digits };
}
export function cloudWebhookEvents(payload: any, c: any) {
  if (payload.object !== "whatsapp_business_account") return [];
  const events: any[] = [];
  for (const entry of (payload.entry || []).slice(0, 50)) {
    if (String(entry.id) !== c.waba_id) continue;
    for (const change of (entry.changes || []).slice(0, 100)) {
      const v = change.value;
      if (String(v?.metadata?.phone_number_id) !== c.cloud_phone_id) continue;
      const echo = change.field === "smb_message_echoes";
      if (!echo && change.field !== "messages") continue;
      for (const m of (echo ? v.message_echoes || [] : v.messages || []).slice(
        0,
        100,
      )) {
        const phone = String(echo ? m.to : m.from).replace(/\D/g, "");
        if (
          !/^[0-9]{10,15}$/.test(phone) ||
          typeof m.id !== "string" ||
          m.id.length > 500
        )
          continue;
        const stamp = Number(m.timestamp) * 1000;
        if (!Number.isFinite(stamp) || stamp < 0 || stamp > Date.now() + 300000)
          continue;
        const type = String(m.type || ""),
          content = m[type] || {};
        const body = String(
          m.text?.body ||
            content.caption ||
            m.button?.text ||
            m.interactive?.button_reply?.title ||
            m.interactive?.list_reply?.title ||
            `[${type || "mensagem"}]`,
        ).slice(0, 10000);
        events.push({
          providerId: m.id,
          phone,
          body,
          direction: echo ? "saida" : "entrada",
          isGroup: false,
          kind:
            (
              {
                image: "imagem",
                audio: "audio",
                video: "video",
                document: "documento",
              } as Record<string, string>
            )[type] || "texto",
          contactName:
            v.contacts?.find((x: any) => x.wa_id === phone)?.profile?.name ||
            phone,
          createdAt: new Date(stamp).toISOString(),
          attribution: m.referral
            ? {
                utm_source: "meta",
                ctwa_clid: String(m.referral.ctwa_clid || ""),
                source_url: String(m.referral.source_url || ""),
              }
            : {},
        });
      }
    }
  }
  return events;
}
export async function signedCloudEvents(
  raw: string,
  signature: string,
  secret: string,
  c: any,
) {
  if (!(await verifyMetaSignature(raw, signature, secret)))
    throw Error("Assinatura Meta inválida.");
  return cloudWebhookEvents(JSON.parse(raw), c);
}
export function cloudMessage(path: string, body: any) {
  const phone = String(body?.phone || "").replace(/\D/g, "");
  if (!/^[0-9]{10,15}$/.test(phone) || String(body?.phone || "").includes("@"))
    throw Error(
      "A API oficial aceita este envio somente para um contato individual.",
    );
  if (path === "message/send-text")
    return {
      messaging_product: "whatsapp",
      to: phone,
      type: "text",
      text: { body: String(body.message), preview_url: false },
    };
  const type = (
    {
      "message/send-image": "image",
      "message/send-video": "video",
      "message/send-audio": "audio",
      "message/send-document": "document",
    } as Record<string, string>
  )[path];
  if (!type) throw Error("Esta ação não está disponível neste canal oficial.");
  const link = new URL(body[type]);
  if (link.protocol !== "https:") throw Error("O anexo precisa usar HTTPS.");
  return {
    messaging_product: "whatsapp",
    to: phone,
    type,
    [type]: {
      link: link.href,
      ...(["image", "video"].includes(type) && body.caption
        ? { caption: body.caption }
        : {}),
      ...(type === "document" && body.fileName
        ? { filename: body.fileName }
        : {}),
    },
  };
}
export async function cloudWithinWindow(db: any, c: any, phone: string) {
  const { data, error } = await db
    .from("agency_workspace_messages")
    .select("created_at")
    .eq("workspace_id", c.workspace_id)
    .eq("account_id", c.active_account_id)
    .eq("phone", phone)
    .eq("direction", "entrada")
    .gte("created_at", new Date(Date.now() - 86400000).toISOString())
    .limit(1);
  if (error || !data?.length) {
    const e = new Error(
      "A janela de atendimento de 24 horas da Meta está fechada. Aguarde uma mensagem do contato ou use um modelo aprovado.",
    );
    (e as any).explicit = true;
    throw e;
  }
}
