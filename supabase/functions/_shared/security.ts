// Regras de segurança puras (sem rede), usadas pelas Edge Functions e testadas no Vitest.

export function escapeHtml(valor: unknown): string {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Comparação em tempo constante para segredos
export function iguaisSeguro(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const EMAIL_TESTE = {
  assunto: "✅ Notificações ativadas — Central do Gestor",
  icone: "✅",
  titulo: "Tudo funcionando!",
  mensagem:
    "Suas notificações estão configuradas. Você receberá alertas conforme as preferências definidas.",
};

export type PedidoEmail = {
  destinatario?: unknown;
  assunto?: unknown;
  icone?: unknown;
  titulo?: unknown;
  mensagem?: unknown;
};

// Decide quem pode enviar e o que pode ser enviado.
// - servidor (chave de serviço): conteúdo livre, mas sempre escapado depois
// - usuário logado: só o e-mail de teste fixo, só para o próprio e-mail ou o destino salvo no perfil
export function autorizarEnvioEmail(
  chamador:
    | { tipo: "servico" }
    | { tipo: "usuario"; email: string | null; destinoSalvo: string | null }
    | { tipo: "anonimo" },
  pedido: PedidoEmail,
):
  | { ok: true; destinatario: string; assunto: string; icone: string; titulo: string; mensagem: string }
  | { ok: false; status: number; erro: string } {
  const destino = String(pedido.destinatario ?? "").trim().toLowerCase();
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(destino))
    return { ok: false, status: 400, erro: "Destinatário inválido" };
  if (chamador.tipo === "anonimo")
    return { ok: false, status: 401, erro: "Não autorizado" };
  if (chamador.tipo === "servico") {
    const assunto = String(pedido.assunto ?? "").slice(0, 200);
    const titulo = String(pedido.titulo ?? "").slice(0, 200);
    const mensagem = String(pedido.mensagem ?? "").slice(0, 5000);
    if (!assunto || !titulo || !mensagem)
      return { ok: false, status: 400, erro: "Campos obrigatórios faltando" };
    return { ok: true, destinatario: destino, assunto, icone: String(pedido.icone ?? "🔔").slice(0, 8), titulo, mensagem };
  }
  const permitidos = [chamador.email, chamador.destinoSalvo]
    .filter(Boolean)
    .map((e) => String(e).trim().toLowerCase());
  if (!permitidos.includes(destino))
    return { ok: false, status: 403, erro: "Só é possível enviar o teste para o seu e-mail cadastrado" };
  return { ok: true, destinatario: destino, ...EMAIL_TESTE };
}

// Origens aceitas no retorno dos logins do Google/Meta
export function origemPermitida(origem: string | null | undefined): string | null {
  if (!origem) return null;
  let u: URL;
  try {
    u = new URL(origem);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  const ok =
    (u.protocol === "https:" &&
      (host === "centraldogestor.site" ||
        host === "www.centraldogestor.site" ||
        /^arthurespeschit-[a-z0-9-]+\.vercel\.app$/.test(host))) ||
    (u.protocol === "http:" && (host === "localhost" || host === "127.0.0.1"));
  return ok ? u.toString() : null;
}

// Mensagens do chat de estratégia: só usuário/assistente, com limites
export function sanitizarMensagens(
  mensagens: unknown,
  { max = 30, maxChars = 8000 } = {},
): { role: "user" | "assistant"; content: string }[] {
  if (!Array.isArray(mensagens)) return [];
  return mensagens
    .filter(
      (m: any) =>
        m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string",
    )
    .slice(-max)
    .map((m: any) => ({ role: m.role, content: m.content.slice(0, maxChars) }));
}

// Anexos: tipos e tamanho aceitos
export const ANEXO_MAX_BYTES = 20 * 1024 * 1024;
export const ANEXO_TIPOS = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "video/mp4",
  "video/quicktime",
  "audio/mpeg",
  "audio/ogg",
  "application/zip",
];
export function validarAnexo(arquivo: { type: string; size: number; name: string }): string | null {
  if (arquivo.size > ANEXO_MAX_BYTES) return "Arquivo maior que 20 MB.";
  if (!ANEXO_TIPOS.includes(arquivo.type))
    return "Tipo de arquivo não permitido. Envie PDF, imagem, documento do Office, planilha, texto, vídeo, áudio ou ZIP.";
  return null;
}

// Extrai o caminho do arquivo de uma URL pública antiga ou de um caminho já salvo
export function caminhoDoAnexo(valor: string, bucket: string): string | null {
  if (!valor) return null;
  if (!/^https?:\/\//.test(valor)) return valor.replace(/^\/+/, "");
  const m = valor.match(
    new RegExp(`/storage/v1/object/(?:public|sign|authenticated)/${bucket}/([^?#]+)`),
  );
  return m ? decodeURIComponent(m[1]) : null;
}
