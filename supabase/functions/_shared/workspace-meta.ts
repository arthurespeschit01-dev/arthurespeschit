import { providerConfig } from "./workspace-actions.ts";
export async function verifyMetaSignature(
  raw: string,
  signature: string,
  secret: string,
) {
  if (!/^sha256=[a-f0-9]{64}$/.test(signature) || !secret) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const sig = Uint8Array.from(signature.slice(7).match(/../g)!, (x) =>
    parseInt(x, 16),
  );
  return await crypto.subtle.verify(
    "HMAC",
    key,
    sig,
    new TextEncoder().encode(raw),
  );
}
export async function receiveMetaLead(
  db: any,
  workspace: string,
  raw: string,
  signature: string,
) {
  const cfg = await providerConfig(db, workspace, "meta");
  const c = cfg?.credentials;
  if (
    !cfg?.enabled ||
    !c?.app_secret ||
    !c?.page_id ||
    !c?.entry_stage_id ||
    !(await verifyMetaSignature(raw, signature, c.app_secret))
  )
    throw Error("Webhook Meta não autorizado.");
  const payload = JSON.parse(raw);
  if (payload.object !== "page") return;
  for (const entry of (payload.entry || []).slice(0, 50)) {
    if (String(entry.id) !== c.page_id) continue;
    for (const change of (entry.changes || []).slice(0, 50)) {
      if (change.field !== "leadgen") continue;
      const id = String(change.value?.leadgen_id || "");
      if (!/^\d{5,40}$/.test(id)) continue;
      const response = await fetch(
        `https://graph.facebook.com/v25.0/${id}?fields=field_data,created_time`,
        {
          headers: { Authorization: `Bearer ${c.access_token}` },
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!response.ok)
        throw Error(
          "Não foi possível buscar o lead na Meta. Confira o acesso à página.",
        );
      const data = await response.json();
      const fields = Object.fromEntries(
        (data.field_data || []).map((x: any) => [
          x.name,
          String(x.values?.[0] || ""),
        ]),
      );
      const { error } = await db.rpc("agency_workspace_meta_lead", {
        p_workspace: workspace,
        p_provider: id,
        p_stage: c.entry_stage_id,
        p_contact: {
          name:
            fields.full_name ||
            [fields.first_name, fields.last_name].filter(Boolean).join(" ") ||
            "Contato Meta Ads",
          phone: fields.phone_number || "",
          email: fields.email || "",
        },
      });
      if (error)
        throw Error(
          "Não foi possível registrar o lead. Confira a etapa de entrada.",
        );
    }
  }
}
