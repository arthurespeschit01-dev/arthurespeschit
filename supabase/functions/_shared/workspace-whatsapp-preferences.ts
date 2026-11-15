import { whatsappPhone } from "./agency-whatsapp.ts";
export const defaultOptOutPhrases = [
  "parar",
  "sair",
  "descadastrar",
  "remover",
  "não quero mais receber",
  "pare de me mandar",
  "cancelar inscrição",
  "vou bloquear",
  "stop",
];
export function matchesOptOut(text: string, phrases: string[]) {
  const fold = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  const body = fold(text);
  return phrases.some((p) => {
    const term = fold(p);
    if (!term) return false;
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp("(?:^|[^a-z0-9])" + escaped + "(?:$|[^a-z0-9])").test(
      body,
    );
  });
}
export async function receiveOptOut(db: any, workspace: string, event: any) {
  if (event.direction !== "entrada" || event.isGroup) return;
  const { data: settings, error } = await db.rpc(
    "agency_workspace_whatsapp_preferences",
    { p_workspace: workspace },
  );
  if (error)
    throw Error("Não foi possível verificar as preferências de recebimento.");
  if (
    settings.optout_enabled &&
    matchesOptOut(String(event.body || ""), settings.phrases)
  ) {
    const { error } = await db.rpc("agency_workspace_whatsapp_optout", {
      p_workspace: workspace,
      p_phone: whatsappPhone(event.phone),
      p_mark: true,
    });
    if (error) throw Error("Não foi possível registrar o descadastro.");
  }
}
export async function assertCampaignAllowed(
  db: any,
  workspace: string,
  phone: string,
) {
  const { data, error } = await db.rpc("agency_workspace_whatsapp_optout", {
    p_workspace: workspace,
    p_phone: whatsappPhone(phone),
  });
  if (error || data) {
    const e = new Error(
      data
        ? "Este contato pediu descadastro e não pode receber mensagens automáticas."
        : "Não foi possível conferir o descadastro do contato.",
    );
    (e as any).explicit = true;
    throw e;
  }
}
