// Principal-account adapter: its mapping is server-only and never resolves a client subaccount.
export async function syncAgencyAccountGoogle(
  db: any,
  workspace: string,
  token: string,
  request: typeof fetch = fetch,
) {
  const owner = await db.rpc("agency_account_owner", {
    p_workspace: workspace,
  });
  if (owner.error)
    throw Error("Não foi possível identificar a agenda da conta.");
  if (!owner.data) return;
  if (typeof owner.data !== "string" || !/^[a-f0-9-]{36}$/.test(owner.data))
    throw Error("Conta da agenda inválida.");
  const send = (path: string, method: string, body?: unknown) =>
    request(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events" + path,
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
  const deleted = await db.rpc("agency_account_calendar_cancellations", {
    p_workspace: workspace,
  });
  if (deleted.error)
    throw Error("Não foi possível ler os cancelamentos da agenda.");
  for (const id of (deleted.data || []).slice(0, 10)) {
    if (!/^[a-v0-9]{5,1024}$/.test(id)) continue;
    const r = await send("/" + id, "DELETE");
    if (r.ok || [404, 410].includes(r.status))
      await db.rpc("agency_account_calendar_cancellations", {
        p_workspace: workspace,
        p_event: id,
      });
  }
  const { data: rows, error } = await db.rpc(
    "agency_account_calendar_pending",
    { p_workspace: workspace },
  );
  if (error)
    throw Error("Não foi possível consultar os compromissos da conta.");
  for (const a of (rows || [])
    .filter(
      (a: any) =>
        a.user_id === owner.data &&
        (!a.google_synced_at ||
          Date.parse(a.google_synced_at) < Date.parse(a.updated_at)),
    )
    .slice(0, 10)) {
    const id = a.google_event_id || "ca" + a.id.replaceAll("-", "");
    try {
      if (id !== "ca" + a.id.replaceAll("-", ""))
        throw Error("Identificação do evento inválida.");
      if (a.status === "cancelado") {
        const r = await send("/" + id, "DELETE");
        if (!r.ok && ![404, 410].includes(r.status))
          throw Error("Cancelamento não confirmado.");
      } else {
        const event = {
          summary: a.title,
          description: a.notes || "",
          start: { dateTime: a.starts_at },
          end: { dateTime: a.ends_at },
        };
        let r = await send("/" + id, "PUT", event);
        if (r.status === 404) {
          r = await send("", "POST", { id, ...event });
          if (r.status === 409) r = await send("/" + id, "PUT", event);
        }
        if (!r.ok) throw Error("Sincronização não confirmada.");
      }
      await db
        .from("agency_appointments")
        .update({
          google_event_id: id,
          google_synced_at: a.updated_at,
          google_sync_error: null,
        })
        .eq("user_id", owner.data)
        .eq("id", a.id);
    } catch {
      await db
        .from("agency_appointments")
        .update({
          google_sync_error:
            "Não foi possível sincronizar com o Google. Verifique a conexão.",
        })
        .eq("user_id", owner.data)
        .eq("id", a.id);
    }
  }
}
