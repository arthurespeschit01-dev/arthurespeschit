import { encodeClickRef } from "./workspace-tracking.ts";
import { publicContact, uuid } from "./workspace-public.ts";
export function readWebhookField(input: unknown, path: string) {
  if (
    !/^[A-Za-z0-9_.-]{1,100}$/.test(path) ||
    path
      .split(".")
      .some((k) => ["__proto__", "prototype", "constructor"].includes(k))
  )
    throw Error("Caminho de campo inválido.");
  let value: unknown = input;
  for (const key of path.split(".")) {
    if (
      !value ||
      typeof value !== "object" ||
      !Object.prototype.hasOwnProperty.call(value, key)
    )
      return "";
    value = (value as Record<string, unknown>)[key];
  }
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).trim();
}
export async function mappedWebhook(
  payload: unknown,
  map: Record<string, string>,
  hook: string,
) {
  const contact = publicContact({
    name: readWebhookField(payload, map.name),
    phone: map.phone ? readWebhookField(payload, map.phone) : "",
    email: map.email ? readWebhookField(payload, map.email) : "",
  });
  const rawId = readWebhookField(payload, map.request_id);
  if (!rawId || rawId.length > 200)
    throw Error("Informe o identificador único do envio no campo configurado.");
  let request = rawId;
  if (!uuid(rawId)) {
    const bytes = new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(hook + ":" + rawId),
      ),
    );
    const hex = [...bytes]
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 32);
    request =
      hex.slice(0, 8) +
      "-" +
      hex.slice(8, 12) +
      "-4" +
      hex.slice(13, 16) +
      "-8" +
      hex.slice(17, 20) +
      "-" +
      hex.slice(20);
  }
  return { contact, request };
}
export function trackingRedirect(
  link: {
    destination: string;
    attributes?: Record<string, string>;
    click_id?: string;
    click_ref?: string;
    source?: string;
    campaign?: string;
    code_style?: string;
  },
  incoming?: URL,
) {
  const target = new URL(link.destination);
  if (target.protocol !== "https:") throw Error("Destino do link inválido.");
  const attrs = link.attributes || {
    utm_source: link.source || "",
    utm_campaign: link.campaign || "",
  };
  for (const key of [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
    "gclid",
    "gbraid",
    "wbraid",
    "fbclid",
  ]) {
    const value = attrs[key] || incoming?.searchParams.get(key);
    if (value && value.length <= 500) target.searchParams.set(key, value);
  }
  if (link.click_id) target.searchParams.set("cg_click", link.click_id);
  if (
    link.click_ref &&
    ["wa.me", "api.whatsapp.com", "web.whatsapp.com"].includes(target.hostname)
  ) {
    const text =
      target.searchParams.get("text") || "Olá! Gostaria de mais informações.";
    target.searchParams.set(
      "text",
      text +
        "\n" +
        encodeClickRef(link.click_ref, link.code_style === "invisible"),
    );
  }
  return target.toString();
}
