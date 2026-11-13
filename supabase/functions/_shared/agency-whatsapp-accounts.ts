import {whatsappPhone} from './agency-whatsapp.ts';
export async function accountForNumber(db:any,userId:string,number:unknown){
 const phone=whatsappPhone(number);if(!/^\d{10,15}$/.test(phone))return null;
 const {data,error}=await db.from('agency_whatsapp_accounts').upsert({user_id:userId,phone},{onConflict:'user_id,phone'}).select('id,phone').single();if(error)throw error;return data;
}
export async function resolveWhatsappAccount(db:any,connection:any,force=false){
 const {data:state}=await db.from('agency_whatsapp_account_state').select('*').eq('user_id',connection.user_id).maybeSingle();
 if(!force&&state&&Date.now()-Date.parse(state.checked_at)<5000){
  if(!state.connected)return {connected:false,account_id:null,phone:null};
  const {data:account}=await db.from('agency_whatsapp_accounts').select('id,phone').eq('id',state.account_id).eq('user_id',connection.user_id).single();
  if(account)return {connected:true,account_id:account.id,phone:account.phone};
 }
 let info:any;
 try{
  const url=new URL('https://api.w-api.app/v1/instance/fetch-instance');url.searchParams.set('instanceId',connection.instance_id);
  const response=await fetch(url,{headers:{Authorization:`Bearer ${connection.token}`},signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new Error('Não foi possível verificar o número conectado.');info=await response.json();
  if(info.error)throw new Error('Não foi possível verificar o número conectado.');
 }catch(error){await db.from('agency_whatsapp_account_state').upsert({user_id:connection.user_id,account_id:null,connected:false,checked_at:new Date().toISOString()});throw error;}
 const account=info.connected?await accountForNumber(db,connection.user_id,info.connectedPhone):null;
 if((state?.account_id||null)!==(account?.id||null)){
  await db.from('agency_whatsapp_connections').update({active_account_id:account?.id||null,reconciled_at:null,directory_synced_at:null,sync_error:null,directory_warning:null}).eq('user_id',connection.user_id).eq('instance_id',connection.instance_id);
 }
 const {error}=await db.from('agency_whatsapp_account_state').upsert({user_id:connection.user_id,account_id:account?.id||null,connected:!!account,checked_at:new Date().toISOString()});if(error)throw error;
 return {connected:!!account,account_id:account?.id||null,phone:account?.phone||null};
}
export async function mirrorToVertice(db:any,connection:any,message:any,sourcePhone:string){
 if(!connection.bridge_url)return {delivered:false,not_shared:true};
 const payload={central_id:message.id,provider_id:message.provider_message_id||`central:${message.id}`,source_number:sourcePhone,phone:message.phone,body:message.body,kind:message.kind||'texto',created_at:message.created_at};
 const {error}=await db.from('agency_whatsapp_mirror_events').upsert({message_id:message.id,user_id:connection.user_id,account_id:message.account_id,payload},{onConflict:'message_id',ignoreDuplicates:true});if(error)throw error;
 return deliverMirror(db,connection,message.id,payload);
}
async function deliverMirror(db:any,connection:any,id:string,payload:any){
 try{
  const response=await fetch(connection.bridge_url,{method:'POST',headers:{'content-type':'application/json','x-central-secret':connection.webhook_secret},body:JSON.stringify({action:'receive',instance_id:connection.instance_id,message:payload}),signal:AbortSignal.timeout(15000)});
  if(!response.ok){await db.from('agency_whatsapp_mirror_events').update({attempted_at:new Date().toISOString(),last_error:`Ponte respondeu HTTP ${response.status}`}).eq('message_id',id).eq('user_id',connection.user_id);return {delivered:false};}
  const {error}=await db.from('agency_whatsapp_mirror_events').update({delivered_at:new Date().toISOString(),attempted_at:new Date().toISOString(),last_error:null}).eq('message_id',id).eq('user_id',connection.user_id);if(error)throw error;return {delivered:true};
 }catch{await db.from('agency_whatsapp_mirror_events').update({attempted_at:new Date().toISOString(),last_error:'Não foi possível confirmar a entrega ao Vértice.'}).eq('message_id',id).eq('user_id',connection.user_id);return {delivered:false};}
}
export async function flushMirrors(db:any,connection:any){
 if(!connection.bridge_url)return {failed:0,delivered:0};
 const {data,error}=await db.from('agency_whatsapp_mirror_events').select('message_id,payload').eq('user_id',connection.user_id).is('delivered_at',null).order('created_at').limit(50);if(error)throw error;
 let failed=0,delivered=0;for(const entry of data||[]){if((await deliverMirror(db,connection,entry.message_id,entry.payload)).delivered)delivered++;else failed++;}return {failed,delivered};
}
