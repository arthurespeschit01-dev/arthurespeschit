import {ensureDeliveryWebhook} from './agency-whatsapp-delivery.ts';
import {accountForNumber,resolveWhatsappAccount,flushMirrors} from './agency-whatsapp-accounts.ts';
import {normalizeWhatsappEvent,whatsappPhone,validWhatsappAddress} from './agency-whatsapp.ts';
// Service-side helpers. No provider token or bridge capability is exposed to the browser.
export async function ingestWhatsapp(db:any,connection:any,payload:any){
 const instance=payload.instanceId||payload.data?.instanceId;if(instance&&instance!==connection.instance_id)throw new Error('Instância inválida');
 const event=normalizeWhatsappEvent(payload);if(!event)return {ignored:true};
 const number=payload.connectedPhone||payload.source_number||payload.data?.connectedPhone;
 const account=await accountForNumber(db,connection.user_id,number);
 if(!account){const {error}=await db.from('agency_whatsapp_unattributed_events').insert({user_id:connection.user_id,payload});if(error)throw error;return {ok:true,unattributed:true};}
 // A legacy record can be classified only by a matching provider ID in a numbered event.
 await db.from('agency_whatsapp_messages').update({account_id:account.id}).eq('user_id',connection.user_id).eq('provider_message_id',event.providerId).is('account_id',null);

 const {error}=await db.from('agency_whatsapp_messages').insert({user_id:connection.user_id,account_id:account.id,phone:event.phone,provider_message_id:event.providerId,body:event.body,kind:event.kind,direction:event.direction,status:event.direction==='saida'?'enviado':'recebido',contact_name:event.contactName,sender_name:event.senderName,created_at:event.createdAt});
 if(error&&error.code!=='23505')throw error;
 if(error?.code==='23505'&&event.isGroup){
  const {error:correction}=await db.from('agency_whatsapp_messages').update({phone:event.phone,contact_name:event.contactName,sender_name:event.senderName}).eq('user_id',connection.user_id).eq('provider_message_id',event.providerId).eq('account_id',account.id).neq('phone',event.phone);if(correction)throw correction;
 }

 const {error:metadata}=await db.rpc('agency_whatsapp_account_metadata',{p_user_id:connection.user_id,p_account_id:account.id,p_address:event.phone,p_name:event.contactName||'',p_source:event.nameSource,p_group:event.isGroup});if(metadata)throw metadata;
 return {ok:true};
}
async function bridge(connection:any,action:string,payload:any={}){
 if(connection.bridge_url!=='https://vertice-gmn.vercel.app/api/central-whatsapp')throw new Error('Ponte compartilhada indisponível');
 const response=await fetch(connection.bridge_url,{method:'POST',headers:{'content-type':'application/json','x-central-secret':connection.webhook_secret},body:JSON.stringify({action,instance_id:connection.instance_id,...payload}),signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw new Error('A sincronização automática não foi confirmada pelo Vértice.');return response.json();
}
export async function reconcileWhatsapp(db:any,connection:any){
 const mirrors=await flushMirrors(db,connection);
 const active=await resolveWhatsappAccount(db,connection,true);
 if(!active.connected)return {ok:true,connected:false};
 const account={id:active.account_id,phone:active.phone};
 if(connection.active_account_id!==account.id){connection.reconciled_at=null;connection.directory_synced_at=null;}
 const now=new Date();
 const {data:claimed,error:claimError}=await db.from('agency_whatsapp_connections').update({sync_lease_until:new Date(Date.now()+110000).toISOString()}).eq('user_id',connection.user_id).or(`sync_lease_until.is.null,sync_lease_until.lt.${now.toISOString()}`).select('user_id');
 if(claimError)throw claimError;if(!claimed?.length)return {busy:true};
 let imported=0;
 try{
  await ensureDeliveryWebhook(db,connection,Deno.env.get('SUPABASE_URL')||'');
  if(!connection.reconciled_at){
   let offset=0;
   for(let page=0;page<30;page++){const history=await bridge(connection,'events',{include_delivered:true,source_number:account.phone,offset});for(const event of history.events||[])await ingestWhatsapp(db,connection,event.payload);if(!history.has_more)break;offset=history.next_offset;}
  }
  const pending=await bridge(connection,'events');const keys=[];
  for(const event of pending.events||[]){await ingestWhatsapp(db,connection,event.payload);keys.push(event.event_key);}
  if(keys.length)await bridge(connection,'ack',{keys});
  const since=connection.reconciled_at?new Date(new Date(connection.reconciled_at).getTime()-300000).toISOString():new Date(Date.now()-86400000).toISOString();
  // Provider logs recover phone/group events even if an upstream webhook was briefly unavailable.
  try{
   for(let page=1;page<=10;page++){
    const data=await bridge(connection,'provider_events',{since,page});
    for(const payload of data.events||[])await ingestWhatsapp(db,connection,payload);
    if(!data.has_more || data.oldest && Date.parse(data.oldest)<Date.parse(since))break;
   }
  }catch{/* Durable outbox + history remain active if this provider endpoint is unavailable. */}
  let offset=0;
  for(let page=0;page<20;page++){
   const result=await bridge(connection,'history',{since,offset,source_number:account.phone});
   const verified=(result.messages||[]).filter((m:any)=>m.source_number===account.phone);
   for(const m of verified){const {error}=await db.from('agency_whatsapp_messages').update({account_id:account.id}).eq('user_id',connection.user_id).eq('provider_message_id',m.provider_id).is('account_id',null);if(error)throw error;}
   const rows=verified.map((m:any)=>({user_id:connection.user_id,account_id:account.id,provider_message_id:m.provider_id,phone:whatsappPhone(m.phone),body:String(m.body||`[${m.kind}]`).slice(0,10000),kind:m.kind,direction:m.direction,status:m.status,created_at:m.created_at})).filter((m:any)=>validWhatsappAddress(m.phone));
   if(rows.length){const {error}=await db.from('agency_whatsapp_messages').upsert(rows,{onConflict:'user_id,account_id,provider_message_id',ignoreDuplicates:true});if(error)throw error;imported+=rows.length;}
   offset+=(result.messages||[]).length;if(!result.has_more)break;
   if(page===19)throw new Error('Há mensagens pendentes; a sincronização continuará automaticamente.');
  }
  await db.from('agency_whatsapp_connections').update({reconciled_at:now.toISOString(),sync_error:mirrors.failed?'Há mensagens enviadas aguardando sincronização com o Vértice.':null}).eq('user_id',connection.user_id).eq('active_account_id',account.id);
  if(!connection.directory_synced_at||Date.now()-new Date(connection.directory_synced_at).getTime()>900000){
   let directoryError=false;
   for(const kind of ['groups','known','contacts','chats']){
    try{
     for(let page=1;page<=50;page++){
      const {data}=await bridge(connection,'directory',{kind,page,source_number:account.phone});
      const list=Array.isArray(data)?data:data[kind]||data.data?.[kind]||data.data||[];
      if(!Array.isArray(list))break;
      const {data:groups}=await db.from('agency_whatsapp_chats').select('address').eq('user_id',connection.user_id).eq('is_group',true).eq('account_id',account.id);
      const groupAddresses=new Set((groups||[]).map((g:any)=>g.address));
      for(const item of list){
       let id=String(item.id||item.jid||item.groupId||item.phoneNumber||item.phone||'');const group=kind==='groups'||id.endsWith('@g.us')||item.isGroup===true||groupAddresses.has(id+'@g.us');
       if(group&&!id.includes('@'))id+='@g.us';const address=whatsappPhone(id);if(!validWhatsappAddress(address))continue;
       const name=String(group?(item.subject||item.name||item.groupName||''):(item.name||item.shortName||item.displayName||item.contact?.name||item.notify||item.pushName||item.verifiedName||'')).trim();
       if(!name)continue;
       const {error}=await db.rpc('agency_whatsapp_account_metadata',{p_user_id:connection.user_id,p_account_id:account.id,p_address:address,p_name:name,p_source:kind==='known'?'push':group?'group':item.name||item.shortName||item.displayName||item.contact?.name?'contact':'push',p_group:group});if(error)throw error;
       if(group && kind==='groups'){const {error:fix}=await db.from('agency_whatsapp_messages').update({phone:address,contact_name:name}).eq('user_id',connection.user_id).eq('phone',address.split('@')[0]).eq('account_id',account.id);if(fix)throw fix;}
      }
      if(kind==='groups'||page>=Number(data.totalPages||data.pagination?.totalPages||1))break;
     }
    }catch{directoryError=true;}
   }
   await db.from('agency_whatsapp_connections').update({directory_synced_at:now.toISOString(),directory_warning:directoryError?'A agenda de contatos não foi disponibilizada pelo provedor. Nomes conhecidos e grupos continuam disponíveis.':null}).eq('user_id',connection.user_id).eq('active_account_id',account.id);
  }
  return {ok:true,imported};
 }catch(error){await db.from('agency_whatsapp_connections').update({sync_error:'A sincronização automática será tentada novamente.'}).eq('user_id',connection.user_id);throw error;}
 finally{await db.from('agency_whatsapp_connections').update({sync_lease_until:null}).eq('user_id',connection.user_id);}
}
