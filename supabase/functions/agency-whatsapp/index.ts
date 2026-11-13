import {resolveWhatsappAccount,mirrorToVertice} from '../_shared/agency-whatsapp-accounts.ts';
import {ingestWhatsapp,reconcileWhatsapp} from '../_shared/agency-whatsapp-sync.ts';
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.2";
import {
  normalizeWhatsappEvent,
  whatsappPhone,
  validWhatsappAddress,
} from "../_shared/agency-whatsapp.ts";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};
const respond = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers });
interface Connection {
  user_id: string;
  instance_id: string;
  token: string;
  webhook_secret: string;
  receiving_enabled: boolean;
  bridge_url?: string;
}
async function provider(
  connection: Pick<Connection, "instance_id" | "token">,
  method: string,
  path: string,
  body?: unknown,
) {
  const url = new URL(`https://api.w-api.app/v1/${path}`);
  url.searchParams.set("instanceId", connection.instance_id);
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${connection.token}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error(
      response.status === 401
        ? "Confira a configuração da conexão WhatsApp."
        : "O provedor WhatsApp não concluiu a solicitação. Tente novamente.",
    );
  const data = await response.json();
  if (data.error === true)
    throw new Error("O provedor WhatsApp não concluiu a solicitação.");
  return data;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers });
  if (request.method !== "POST")
    return respond({ error: "Método inválido" }, 405);
  const url = new URL(request.url);
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const db = createClient(
    supabaseUrl,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  try {
    const raw = await request.text();
    if (raw.length > 256000)
      return respond({ error: "Solicitação muito grande" }, 413);
    const body = JSON.parse(raw);
    if (url.searchParams.has("webhook") || url.searchParams.has("reconcile")) {
      const secret = url.searchParams.get("webhook") || url.searchParams.get("reconcile") || "";
      if (!/^[a-f0-9]{64}$/.test(secret))
        return respond({ error: "Não autorizado" }, 401);
      const { data: connection, error } = await db
        .from("agency_whatsapp_connections")
        .select("*")
        .eq("webhook_secret", secret)
        .eq("receiving_enabled", true)
        .maybeSingle();
      if (error) throw error;
      if (!connection) return respond({ error: "Não autorizado" }, 401);
      if(url.searchParams.has('reconcile'))return respond(await reconcileWhatsapp(db,connection));
      const instanceId=body.instanceId||body.data?.instanceId;
      if(instanceId&&instanceId!==connection.instance_id)return respond({error:'Instância inválida'},403);
      const result=await ingestWhatsapp(db,connection,body);
      await db.from("agency_whatsapp_connections").update({last_webhook_at:new Date().toISOString()}).eq('user_id',connection.user_id);
      return respond(result);
    }
    const auth = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: {
        headers: { Authorization: request.headers.get("authorization") || "" },
      },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const {
      data: { user },
      error: authError,
    } = await auth.auth.getUser();
    if (authError || !user)
      return respond({ error: "Entre na sua conta novamente." }, 401);
    const { data: connection, error: connectionError } = await db
      .from("agency_whatsapp_connections")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    if (connectionError) throw connectionError;
    if (body.action === "configure") {
      const instanceId = String(body.instance_id || "").trim();
      if (!/^[\w-]{1,160}$/.test(instanceId))
        return respond(
          { error: "Informe uma instância válida." },
          400,
        );
      const sameInstance = connection?.instance_id === instanceId;
      const token = String(
        body.token || (sameInstance ? connection?.token : "") || "",
      ).trim();
      if (!token || token.length > 4000)
        return respond({ error: "Informe o token da instância." }, 400);
      await provider(
        { instance_id: instanceId, token },
        "GET",
        "instance/fetch-instance",
      );
      const { error } = await db
        .from("agency_whatsapp_connections")
        .upsert({
          user_id: user.id,
          instance_id: instanceId,
          token,
          ...(!sameInstance
            ? {
                receiving_enabled: false,
                bridge_url: null,
                active_account_id:null,
                reconciled_at:null,
                directory_synced_at:null,
                delivery_configured_at:null,delivery_error:null,
                webhook_secret:
                  crypto.randomUUID().replace(/-/g, "") +
                  crypto.randomUUID().replace(/-/g, ""),
              }
            : {}),
        });
      if (error)
        return respond(
          {
            error:
              error.code === "23505"
                ? "Esta instância já está vinculada a outra conta da Central."
                : "Não foi possível salvar a conexão.",
          },
          400,
        );
      if(!sameInstance)await db.from('agency_whatsapp_account_state').upsert({user_id:user.id,account_id:null,connected:false,checked_at:new Date().toISOString()});
      return respond({ ok: true });
    }
    if(body.action==='messages'||body.action==='send'||body.action==='status'){
      if(connection){const active=await resolveWhatsappAccount(db,connection,body.action==='send'||body.action==='status');
       connection.active_number=active.phone;connection.active_account_id=active.account_id;
       if(body.action!=='status'&&(!active.connected || body.account_id && body.account_id!==active.account_id))return respond({error:'O número conectado mudou ou foi desconectado. Abra a conversa no número correto.'},409);
      }else if(body.action!=='status')return respond({error:'Conecte o WhatsApp para abrir as conversas.'},409);
    }
    if (body.action === "messages") {
      let phone = whatsappPhone(body.phone);
      if (body.card_id) {
        const {data:card,error}=await db.from('agency_pipeline_cards').select('phone').eq('id',body.card_id).eq('user_id',user.id).maybeSingle();
        if(error) throw error;
        if(!card) return respond({error:'Card não encontrado.'},404);
        phone=whatsappPhone(card.phone);
      }
      if (!validWhatsappAddress(phone)) return respond({error:'Informe um telefone válido.'},400);
      const {whatsappPhoneKey}=await import('../_shared/agency-whatsapp.ts');
      const { data, error: messageError } = await db
        .from("agency_whatsapp_messages")
        .select("id,direction,status,body,kind,created_at,sender_name")
        .eq("user_id", user.id)
        .eq("phone_key", whatsappPhoneKey(phone))
        .eq("account_id",connection.active_account_id)
        .is("duplicate_of",null)
        .order("created_at", { ascending: false })
        .order("id")
        .range(Math.max(0,Number(body.offset)||0),Math.max(0,Number(body.offset)||0)+99);
      if (messageError) throw messageError;
      return respond({ messages: data.reverse(), has_more:data.length===100 });
    }
    if (!connection)
      return body.action === "status"
        ? respond({ configured: false, connected: false })
        : respond(
            {
              error: "Configure a conexão da agência antes de gerar o QR Code.",
            },
            409,
          );
    if(body.action === 'reconcile') return respond(connection.bridge_url ? await reconcileWhatsapp(db,connection) : {ok:true});
    if(body.action === 'sync_history') return respond({error:'O histórico é recuperado automaticamente por número conectado.'},409);
    if (body.action === "status") {
      const {count:legacyCount}=await db.from('agency_whatsapp_messages').select('id',{count:'exact',head:true}).eq('user_id',user.id).is('account_id',null);
      const info = {connected:!!connection.active_account_id,connectedPhone:connection.active_number};
      return respond({
        configured: true,
        legacy_count:legacyCount||0,
        connected: !!info.connected,
        phone: info.connectedPhone || null,
        instance_id: connection.instance_id,
        account_id:connection.active_account_id,
        receiving_enabled: connection.receiving_enabled,
        shared: !!connection.bridge_url,
        delivery_enabled:!!connection.delivery_configured_at,delivery_error:connection.delivery_error||null,
        last_webhook_at: connection.last_webhook_at || null,
        reconciled_at:connection.reconciled_at || null,
        sync_error:connection.sync_error || null,
        directory_warning:connection.directory_warning || null,
        webhook_url: `${supabaseUrl}/functions/v1/agency-whatsapp?webhook=${connection.webhook_secret}`,
      });
    }
    if (body.action === "connect") {
      const callback = `${supabaseUrl}/functions/v1/agency-whatsapp?webhook=${connection.webhook_secret}`;
      if(connection.bridge_url) {
        const response=await fetch(connection.bridge_url,{method:'POST',headers:{'content-type':'application/json','x-central-secret':connection.webhook_secret},body:JSON.stringify({action:'activate',instance_id:connection.instance_id}),signal:AbortSignal.timeout(20000)});
        if(!response.ok) return respond({error:'Não foi possível ativar o webhook compartilhado. Tente novamente.'},502);
      } else {
        const info=await provider(connection,'GET','instance/fetch-instance');
        const current=String(info.webhookReceivedUrl || '');
        if((current && current!==callback)||(info.webhookDeliveryUrl&&info.webhookDeliveryUrl!==callback)) return respond({error:'Esta instância já usa outro webhook. Configure o compartilhamento antes de alterar o recebimento.'},409);
        await provider(connection, "PUT", "webhook/update-webhook-received", {value: callback, enabled:true});
        await provider(connection, "PUT", "webhook/update-webhook-delivery", {value: callback, enabled:true});
      }
      const { error } = await db
        .from("agency_whatsapp_connections")
        .update({ receiving_enabled: true,delivery_configured_at:new Date().toISOString(),delivery_error:null })
        .eq("user_id", user.id);
      if (error) throw error;
      const connected=await provider(connection,"GET","instance/fetch-instance");
      if(connected.connected) return respond({connected:true,qrcode:null});
      const data = await provider(connection, "GET", "instance/qr-code");
      const rawQr = data.qrcode || data.qrCode || data.value || "";
      const qrcode =
        typeof rawQr === "string" &&
        /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=\s]+$/.test(rawQr)
          ? rawQr
          : typeof rawQr === "string" && /^[A-Za-z0-9+/=\s]{40,}$/.test(rawQr)
            ? `data:image/png;base64,${rawQr}`
            : null;
      if (!qrcode || qrcode.length > 3000000)
        return respond(
          {
            error: "QR Code indisponível. Atualize o status e tente novamente.",
          },
          502,
        );
      return respond({ qrcode });
    }
    if (body.action === "disconnect") {
      await provider(connection, "GET", "instance/disconnect");
      await db.from('agency_whatsapp_account_state').upsert({user_id:user.id,account_id:null,connected:false,checked_at:new Date().toISOString()});
      return respond({ ok: true });
    }
    if (body.action === "send") {
      if (
        typeof body.text !== "string" ||
        !body.text.trim() ||
        body.text.length > 10000 ||
        !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(
          body.request_id || "",
        )
      )
        return respond({ error: "Escreva uma mensagem válida." }, 400);
      let phone=whatsappPhone(body.phone);
      if(body.card_id) {
        const {data:card,error}=await db.from('agency_pipeline_cards').select('id,phone,pipeline_id').eq('id',body.card_id).eq('user_id',user.id).maybeSingle();
        if(error)throw error;
        if(!card)return respond({error:'Card não encontrado.'},404);
        const {data:pipeline}=await db.from('agency_pipelines').select('id').eq('id',card.pipeline_id).eq('area','comercial').eq('user_id',user.id).maybeSingle();
        if(!pipeline)return respond({error:'A conversa deve estar vinculada a um card comercial.'},400);
        phone=whatsappPhone(card.phone);
      }
      if (!validWhatsappAddress(phone))
        return respond({ error: "Cadastre um telefone válido no card." }, 400);
      const { data: existing, error: existingError } = await db
        .from("agency_whatsapp_messages")
        .select("id,status,phone,body")
        .eq("user_id", user.id)
        .eq("request_id", body.request_id)
        .eq("account_id",connection.active_account_id)
        .maybeSingle();
      if (existingError) throw existingError;
      if (
        existing &&
        (existing.phone !== phone || existing.body !== body.text.trim())
      )
        return respond(
          { error: "Este identificador já foi utilizado em outra mensagem." },
          409,
        );
      if (existing)
        return respond(
          { ok: existing.status === "enviado", message: existing },
          existing.status === "enviado" ? 200 : 409,
        );
      const { data: info } = await db
        .from("agency_whatsapp_messages")
        .insert({
          user_id: user.id,
          request_id: body.request_id,
          account_id:connection.active_account_id,
          phone,
          body: body.text.trim(),
          direction: "saida",
          status: "enviando",
        })
        .select("id")
        .single();
      if (!info)
        return respond(
          {
            error:
              "Não foi possível registrar o envio. Atualize a conversa antes de tentar novamente.",
          },
          409,
        );
      try {
        const result = await provider(connection, "POST", "message/send-text", {
          phone,
          message: body.text.trim(),
        });
        const { error: updateError } = await db.rpc('agency_confirm_whatsapp_send',{p_user_id:user.id,p_id:info.id,p_provider_id:result.messageId || null});
        if (updateError)
          return respond(
            {
              error:
                "Mensagem aceita pelo WhatsApp, mas o histórico não foi atualizado. Confira a conversa antes de reenviar.",
            },
            502,
          );
        const {data:sent}=await db.from('agency_whatsapp_messages').select('*').eq('id',info.id).eq('user_id',user.id).single();
        if(sent?.duplicate_of){const {data:canonical}=await db.from('agency_whatsapp_messages').select('provider_message_id').eq('id',sent.duplicate_of).eq('user_id',user.id).eq('account_id',sent.account_id).single();if(canonical)sent.provider_message_id=canonical.provider_message_id;}
        let synced=false;try{if(sent)synced=(await mirrorToVertice(db,connection,sent,connection.active_number)).delivered;}catch{/* durable recovery retries without resending WhatsApp */}
        return respond({ ok: true,sync_pending:!!connection.bridge_url&&!synced });
      } catch {
        await db
          .from("agency_whatsapp_messages")
          .update({ status: "erro" })
          .eq("id", info.id)
          .eq("user_id", user.id);
        return respond(
          {
            error:
              "O envio não foi confirmado. Confira o WhatsApp antes de tentar novamente.",
          },
          502,
        );
      }
    }
    return respond({ error: "Ação inválida" }, 400);
  } catch (error) {
    if (error instanceof SyntaxError)
      return respond({ error: "Solicitação inválida" }, 400);
    return respond(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível concluir a solicitação WhatsApp.",
      },
      500,
    );
  }
});
