import {whatsappPhone,whatsappPhoneKey,validWhatsappAddress} from './agency-whatsapp.ts';
import {avatarFromResponse} from './whatsapp-avatar-format.js';
export async function profilePicture(db:any,connection:any,userId:string,address:unknown){
 const phone=whatsappPhone(address);if(!validWhatsappAddress(phone)||connection.user_id!==userId)return {url:null};
 const {data:known,error}=await db.from('agency_whatsapp_messages').select('id').eq('user_id',userId).eq('account_id',connection.active_account_id).eq('phone_key',whatsappPhoneKey(phone)).limit(1);if(error)throw error;if(!known?.length){const {data:chat,error:chatError}=await db.from('agency_whatsapp_chats').select('chat_key').eq('user_id',userId).eq('account_id',connection.active_account_id).eq('chat_key',whatsappPhoneKey(phone)).limit(1);if(chatError)throw chatError;if(!chat?.length)return {url:null};}
 if(connection.bridge_url){
  if(connection.bridge_url!=='https://vertice-gmn.vercel.app/api/central-whatsapp')return {url:null};
  try{const response=await fetch(connection.bridge_url,{method:'POST',headers:{'content-type':'application/json','x-central-secret':connection.webhook_secret},body:JSON.stringify({action:'avatar',instance_id:connection.instance_id,source_number:connection.active_number,address:phone}),signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('Ponte indisponível');const result=await response.json();
  try{const url=new URL(result.url);if(url.protocol==='https:'&&url.hostname==='qeihqjhencqqjwqtvtsp.supabase.co'&&url.pathname.startsWith('/storage/v1/object/sign/whatsapp/avatars/'))return {url:url.href};}catch{} }catch{/* The owned active instance can resolve directory-only contacts directly. */}
 }
 const endpoint=new URL('https://api.w-api.app/v1/contacts/profile-picture');endpoint.searchParams.set('instanceId',connection.instance_id);endpoint.searchParams.set('phoneNumber',phone);
 try{const response=await fetch(endpoint,{headers:{Authorization:`Bearer ${connection.token}`},signal:AbortSignal.timeout(10000)});return {url:response.ok?avatarFromResponse(await response.json()):null}}catch{return {url:null}};
}
