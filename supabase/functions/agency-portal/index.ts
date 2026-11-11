import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.2";
import { validateAnswers } from "../_shared/agency-validation.ts";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};
const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });
const text = (value: unknown, max: number) =>
  typeof value === "string" && value.trim().length > 0 && value.length <= max;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST") return respond({ error: "Método inválido" }, 405);
  try {
    const raw = await req.text();
    if (raw.length > 32000)
      return respond({ error: "Solicitação muito grande" }, 413);
    const body = JSON.parse(raw);
    if (typeof body.token !== "string" || !/^[a-f0-9]{64}$/.test(body.token))
      return respond({ error: "Link inválido ou desativado" }, 404);
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    if (body.action === "form" || body.action === "submit_form") {
      const { data: form, error } = await db
        .from("agency_forms")
        .select("id,user_id,title,description,fields")
        .eq("token", body.token)
        .eq("enabled", true)
        .maybeSingle();
      if (error) throw error;
      if (!form) return respond({ error: "Link inválido ou desativado" }, 404);
      if (body.action === "form")
        return respond({
          title: form.title,
          description: form.description,
          fields: form.fields,
        });
      const invalid = validateAnswers(form.fields, body.answers);
      if (invalid) return respond({ error: invalid }, 400);
      const { count, error: countError } = await db
        .from("agency_form_responses")
        .select("id", { count: "exact", head: true })
        .eq("form_id", form.id)
        .gte("created_at", new Date(Date.now() - 60000).toISOString());
      if (countError) throw countError;
      if ((count || 0) >= 30)
        return respond({ error: "Muitos envios. Aguarde um minuto." }, 429);
      // Keep labels with answers so later edits never rewrite submission history.
      const answers = Object.fromEntries(
        form.fields.map((f: { id: string; label: string }) => [
          f.id,
          { label: f.label, value: body.answers[f.id] || "" },
        ]),
      );
      const { error: insertError } = await db
        .from("agency_form_responses")
        .insert({ user_id: form.user_id, form_id: form.id, answers });
      if (insertError) throw insertError;
      return respond({ ok: true });
    }
    const { data: portal, error: portalError } = await db
      .from("agency_client_portals")
      .select("id,user_id,client_id")
      .eq("token", body.token)
      .eq("enabled", true)
      .maybeSingle();
    if (portalError) throw portalError;
    if (!portal) return respond({ error: "Link inválido ou desativado" }, 404);
    if (body.action === "tickets") {
      const offset =
        Number.isInteger(body.offset) && body.offset >= 0 ? body.offset : 0;
      const { data: tickets, error } = await db
        .from("agency_tickets")
        .select("id,title,description,category,status,created_at,updated_at")
        .eq("portal_id", portal.id)
        .eq("user_id", portal.user_id)
        .order("created_at", { ascending: false })
        .order("id")
        .range(offset, offset + 99);
      if (error) throw error;
      const { data: client } = await db
        .from("clients")
        .select("name")
        .eq("id", portal.client_id)
        .eq("user_id", portal.user_id)
        .single();
      return respond({
        client_name: client?.name || "Cliente",
        tickets,
        has_more: tickets.length === 100,
      });
    }
    if (body.action === "new_ticket") {
      if (
        !text(body.title, 160) ||
        !text(body.description, 10000) ||
        !["trafego", "design", "sugestao", "reclamacao", "outro"].includes(
          body.category,
        )
      )
        return respond(
          { error: "Preencha título, categoria e descrição." },
          400,
        );
      const { count, error: countError } = await db
        .from("agency_tickets")
        .select("id", { count: "exact", head: true })
        .eq("portal_id", portal.id)
        .gte("created_at", new Date(Date.now() - 60000).toISOString());
      if (countError) throw countError;
      if ((count || 0) >= 10)
        return respond({ error: "Muitos chamados. Aguarde um minuto." }, 429);
      const { data, error } = await db
        .from("agency_tickets")
        .insert({
          user_id: portal.user_id,
          client_id: portal.client_id,
          portal_id: portal.id,
          title: body.title.trim(),
          description: body.description.trim(),
          category: body.category,
        })
        .select("id")
        .single();
      if (error) throw error;
      return respond({ id: data.id });
    }
    const { data: ticket, error: ticketError } = await db
      .from("agency_tickets")
      .select("id,status")
      .eq("id", body.ticket_id)
      .eq("portal_id", portal.id)
      .eq("user_id", portal.user_id)
      .maybeSingle();
    if (ticketError) throw ticketError;
    if (!ticket) return respond({ error: "Chamado não encontrado" }, 404);
    if (body.action === "messages") {
      const messages: {
        id: string;
        sender: string;
        body: string;
        created_at: string;
      }[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await db
          .from("agency_ticket_messages")
          .select("id,sender,body,created_at")
          .eq("ticket_id", ticket.id)
          .eq("user_id", portal.user_id)
          .order("created_at")
          .order("id")
          .range(offset, offset + 999);
        if (error) throw error;
        messages.push(...data);
        if (data.length < 1000) break;
      }
      return respond({ messages });
    }
    if (body.action === "reply") {
      if (!text(body.message, 10000))
        return respond(
          { error: "Escreva uma mensagem de até 10000 caracteres." },
          400,
        );
      if (ticket.status === "concluido")
        return respond(
          { error: "Este chamado foi concluído. Abra um novo chamado." },
          409,
        );
      const { count, error: countError } = await db
        .from("agency_ticket_messages")
        .select("id", { count: "exact", head: true })
        .eq("ticket_id", ticket.id)
        .gte("created_at", new Date(Date.now() - 60000).toISOString());
      if (countError) throw countError;
      if ((count || 0) >= 20)
        return respond({ error: "Muitas mensagens. Aguarde um minuto." }, 429);
      const { error } = await db.from("agency_ticket_messages").insert({
        user_id: portal.user_id,
        ticket_id: ticket.id,
        sender: "cliente",
        body: body.message.trim(),
      });
      if (error) throw error;
      return respond({ ok: true });
    }
    return respond({ error: "Ação inválida" }, 400);
  } catch (error) {
    if (error instanceof SyntaxError)
      return respond({ error: "Solicitação inválida" }, 400);
    console.error(
      "agency-portal failed",
      error instanceof Error ? error.name : "database error",
    );
    return respond(
      { error: "Não foi possível concluir. Tente novamente." },
      500,
    );
  }
});
