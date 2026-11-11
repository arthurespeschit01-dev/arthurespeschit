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
  const content = record(data.msgContent || data.message);
  const message = record(content.message || content);
  const chat = record(data.chat);
  const sentByUs = data.fromMe ?? record(data.key).fromMe;
  const fromMe = sentByUs === true || sentByUs === "true";
  const sender = String(fromMe ? (chat.id || data.phone || data.to || record(data.key).remoteJid || "") : (
    record(data.sender).id || data.phone || chat.id || data.from || ""),
  );
  const event = String(payload.event || data.event || "");
  if (
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
    direction: fromMe ? "saida" : "entrada",
    contactName: !fromMe ? String(record(data.sender).pushName || data.pushName || "").slice(0,160) || null : null,
    createdAt: (() => { const n=Number(data.moment || data.timestamp); const date=new Date(n*(n>1e12?1:1000)); return n && Number.isFinite(date.getTime()) && date.getTime() < Date.now()+300000 ? date.toISOString() : new Date().toISOString(); })(),
    body: String(text).slice(0, 10000) || `[${kind}]`,
    kind,
  };
}
