export function qrImage(value: unknown, depth = 0): string | null {
  if (depth > 3) return null;
  const payload = value as Record<string, unknown> | null;
  const raw =
    typeof value === "string"
      ? value
      : payload?.qrcode ||
        payload?.qrCode ||
        payload?.base64 ||
        payload?.value ||
        (payload?.data && qrImage(payload.data, depth + 1));
  if (typeof raw !== "string" || raw.length > 800000) return null;
  const match = raw.match(
    /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=\s]+)$/,
  );
  const encoded = (match ? match[2] : raw).replace(/\s/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length < 16)
    return null;
  try {
    const head = atob(encoded.slice(0, 24));
    const mime = head.startsWith("\x89PNG\r\n\x1a\n")
      ? "png"
      : head.startsWith("\xff\xd8\xff")
        ? "jpeg"
        : head.startsWith("RIFF") && head.slice(8, 12) === "WEBP"
          ? "webp"
          : null;
    if (!mime || (match && match[1] !== mime)) return null;
    return `data:image/${mime};base64,${encoded}`;
  } catch {
    return null;
  }
}
export async function fetchWorkspaceQr(
  c: { instance_id: string; token: string },
  request: typeof fetch = fetch,
) {
  const url = new URL("https://api.w-api.app/v1/instance/qr-code");
  url.searchParams.set("instanceId", c.instance_id);
  url.searchParams.set("image", "enable");
  const response = await request(url, {
    headers: {
      Authorization: `Bearer ${c.token}`,
      Accept: "application/json,image/png,image/jpeg,image/webp",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw Error(
      "Não foi possível gerar o QR Code. Confira a instância e tente atualizar.",
    );
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > 600000)
    throw Error("O provedor retornou um QR Code maior que o permitido.");
  let result: string | null = null;
  if (response.headers.get("content-type")?.startsWith("image/")) {
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    result = qrImage(btoa(binary));
  } else {
    try {
      result = qrImage(JSON.parse(new TextDecoder().decode(bytes)));
    } catch {
      result = null;
    }
  }
  if (!result)
    throw Error(
      "O provedor não retornou uma imagem de QR Code válida. Atualize para gerar outra.",
    );
  return result;
}
