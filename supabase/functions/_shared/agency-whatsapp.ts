export function whatsappPhone(value: unknown): string {
  let phone = String(value || "").replace(/\D/g, "");
  if (phone.length === 10 || phone.length === 11) phone = `55${phone}`;
  return phone;
}

export function whatsappPhoneKey(value: unknown): string {
  const phone = whatsappPhone(value);
  return /^55\d{10,11}$/.test(phone)
    ? phone.slice(2, 4) + phone.slice(-8)
    : phone;
}

export function normalizeWhatsappEvent(payload: Record<string, unknown>) {
  const record = (value: unknown): Record<string, unknown> =>
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const data =
    payload.data && typeof payload.data === "object"
      ? record(payload.data)
      : payload;
  const message = record(data.msgContent || data.message);
  const chat = record(data.chat);
  const sender = String(
    record(data.sender).id || data.phone || chat.id || data.from || "",
  );
  const event = String(payload.event || data.event || "");
  const sentByUs = data.fromMe ?? record(data.key).fromMe;
  const fromMe = sentByUs === true || sentByUs === "true";
  if (
    fromMe ||
    data.isGroup === true ||
    data.isGroup === "true" ||
    String(chat.id || "").includes("@g.us") ||
    sender.includes("@g.us") ||
    sender.includes("@lid")
  )
    return null;
  if (
    /status|ack|deliver|read|receipt|presence|connect/i.test(event) &&
    !/received/i.test(event)
  )
    return null;
  const phone = whatsappPhone(sender.split("@")[0]);
  if (!/^\d{10,15}$/.test(phone)) return null;
  const rawText =
    message.conversation ||
    record(message.extendedTextMessage).text ||
    record(message.imageMessage).caption ||
    record(message.videoMessage).caption ||
    record(message.documentMessage).caption ||
    message.text ||
    "";
  const text = typeof rawText === "string" ? rawText : "";
  const kind =
    message.imageMessage || message.stickerMessage
      ? "imagem"
      : message.audioMessage
        ? "audio"
        : message.videoMessage
          ? "video"
          : message.documentMessage
            ? "documento"
            : "texto";
  const providerId = data.messageId || record(data.key).id;
  if (
    !providerId ||
    typeof providerId !== "string" ||
    providerId.length > 200 ||
    (!text && kind === "texto")
  )
    return null;
  return {
    phone,
    providerId,
    body: String(text).slice(0, 10000) || `[${kind}]`,
    kind,
  };
}
