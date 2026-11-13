// Uses the already configured receiving callback. It never changes an unrelated
// callback, forwards to a new host, or calls any WhatsApp message-send endpoint.
export async function ensureDeliveryWebhook(db:any,connection:any,projectUrl:string){
 if(!connection.receiving_enabled||connection.delivery_configured_at)return {configured:!!connection.delivery_configured_at};
 const headers={Authorization:`Bearer ${connection.token}`};
 const api=new URL('https://api.w-api.app/v1/instance/fetch-instance');api.searchParams.set('instanceId',connection.instance_id);
 const info=async()=>{const response=await fetch(api,{headers,signal:AbortSignal.timeout(12000)});if(!response.ok)throw new Error('status');const value=await response.json();if(value.error)throw new Error('status');return value};
 try{
  const current=await info();const received=String(current.webhookReceivedUrl||'');
  if(connection.bridge_url){
   const target=new URL(received);
   if(connection.bridge_url!=='https://vertice-gmn.vercel.app/api/central-whatsapp'||target.origin!=='https://vertice-gmn.vercel.app'||!/^\/api\/wh\/[A-Za-z0-9_-]{8,200}$/.test(target.pathname)||target.search||target.hash||target.username||target.password)throw new Error('receiver');
  }else if(received!==`${projectUrl.replace(/\/$/,'')}/functions/v1/agency-whatsapp?webhook=${connection.webhook_secret}`)throw new Error('receiver');
  if(current.webhookDeliveryUrl&&current.webhookDeliveryUrl!==received){
   await db.from('agency_whatsapp_connections').update({delivery_error:'O evento de mensagens enviadas usa outro destino. Revise a configuração para compartilhar esse evento.'}).eq('user_id',connection.user_id);return {configured:false,conflict:true};
  }
  const endpoint=new URL('https://api.w-api.app/v1/webhook/update-webhook-delivery');endpoint.searchParams.set('instanceId',connection.instance_id);
  const response=await fetch(endpoint,{method:'PUT',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({value:received,enabled:true}),signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new Error('delivery');const result=await response.json();if(result.error)throw new Error('delivery');
  const verified=await info();if(verified.webhookReceivedUrl!==received||verified.webhookDeliveryUrl!==received)throw new Error('verification');
  const {error}=await db.from('agency_whatsapp_connections').update({delivery_configured_at:new Date().toISOString(),delivery_error:null}).eq('user_id',connection.user_id);if(error)throw error;
  return {configured:true};
 }catch{
  await db.from('agency_whatsapp_connections').update({delivery_error:'Não foi possível confirmar o recebimento das mensagens enviadas pelo telefone. A ativação será tentada novamente.'}).eq('user_id',connection.user_id);return {configured:false};
 }
}
