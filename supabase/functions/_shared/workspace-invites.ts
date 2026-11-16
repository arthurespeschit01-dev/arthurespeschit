const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export async function sendWorkspaceInvite(
  db: any,
  workspace: string,
  id: string,
  appUrl: string,
  apiKey: string,
  request: typeof fetch = fetch,
) {
  const claimed = await db.rpc("agency_workspace_invite_email", {
    p_workspace: workspace,
    p_invite: id,
  });
  if (claimed.error)
    throw Error(
      claimed.error.message || "Não foi possível preparar o convite.",
    );
  const invite = claimed.data;
  let error: string | null = null;
  try {
    if (!apiKey)
      throw Error(
        "O envio de convites por e-mail ainda não está configurado. Use o link do convite.",
      );
    const origin = new URL(appUrl);
    if (
      origin.protocol !== "https:" ||
      origin.pathname !== "/" ||
      origin.username ||
      origin.password
    )
      throw Error("Endereço do sistema inválido.");
    if (!/^[a-f0-9]{64}$/.test(invite.token)) throw Error("Convite inválido.");
    const link = `${origin.origin}/convite-equipe/${invite.token}`;
    const response = await request("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `workspace-invite/${id}/${invite.claim}`,
      },
      body: JSON.stringify({
        from: "Central do Gestor <notificacoes@centraldogestor.site>",
        to: [invite.email],
        subject: "Seu convite para a Central do Gestor",
        html: `<h1>Você recebeu um convite</h1><p>Olá, ${escapeHtml(invite.display_name || "você")}.</p><p>Acesse o convite e entre ou crie sua conta usando o e-mail que recebeu esta mensagem. As permissões são definidas pela função escolhida pelo administrador.</p><p><a href="${link}">Acessar convite</a></p><p>Este convite expira em sete dias a partir da criação.</p>`,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json();
    if (!response.ok || !data.id)
      throw Error(
        "Não foi possível enviar o e-mail. O convite foi salvo; você pode copiar o link ou reenviar depois.",
      );
  } catch (e) {
    error =
      e instanceof Error ? e.message : "Não foi possível enviar o e-mail.";
  }
  const result = await db.rpc("agency_workspace_invite_email", {
    p_workspace: workspace,
    p_invite: id,
    p_claim: invite.claim,
    p_error: error,
  });
  if (result.error)
    throw Error(
      "Não foi possível confirmar o envio. Verifique o estado do convite antes de reenviar.",
    );
  return { email_sent: !error, email_error: error };
}
