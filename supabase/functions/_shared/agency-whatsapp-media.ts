import {mediaDescriptor,fetchMediaFile,extension} from './whatsapp-media-format.js';
const BUCKET='agency-whatsapp-media';
export async function queueMedia(db:any,connection:any,account:any,event:any,payload:any){
 if(event.kind==='texto')return;const {data:message,error}=await db.from('agency_whatsapp_messages').select('id').eq('user_id',connection.user_id).eq('account_id',account.id).eq('provider_message_id',event.providerId).maybeSingle();if(error)throw error;if(!message)return;
 const {error:queued}=await db.from('agency_whatsapp_media').upsert({message_id:message.id,user_id:connection.user_id,account_id:account.id},{onConflict:'message_id',ignoreDuplicates:true});if(queued)throw queued;const descriptor=mediaDescriptor(payload);if(descriptor){const {error:saved}=await db.from('agency_whatsapp_media').update({descriptor}).eq('message_id',message.id).eq('user_id',connection.user_id).is('descriptor',null);if(saved)throw saved;}
}
async function bridgeMedia(connection:any,source:string,provider:string){
 if(connection.bridge_url!=='https://vertice-gmn.vercel.app/api/central-whatsapp')throw Error('Ponte de mídia indisponível');const response=await fetch(connection.bridge_url,{method:'POST',headers:{'content-type':'application/json','x-central-secret':connection.webhook_secret},body:JSON.stringify({action:'media',instance_id:connection.instance_id,source_number:source,provider_id:provider}),signal:AbortSignal.timeout(50000)});if(!response.ok)throw Error('Não foi possível acessar o arquivo no Vértice');return response.json();
}
export async function ensureMedia(db:any,connection:any,message:any,source:string,{retry=false}={}){
 if(!message||message.user_id!==connection.user_id||!message.account_id||message.kind==='texto')return {status:'unavailable',error:'Arquivo não encontrado nesta conta'};
 const {data:media,error}=await db.from('agency_whatsapp_media').select('*').eq('message_id',message.id).eq('user_id',connection.user_id).eq('account_id',message.account_id).maybeSingle();if(error)throw error;if(!media)return{status:'processing'};
 if(media.storage_path){const {data,error:signed}=await db.storage.from(BUCKET).createSignedUrl(media.storage_path,3600,message.kind==='documento'?{download:media.name||true}:{});if(signed)throw signed;return{status:'ready',url:data.signedUrl,mime:media.mime,name:media.name,bytes:media.bytes,expires_in:3600};}
 if(!retry&&media.attempted_at&&Date.now()-Date.parse(media.attempted_at)<300000)return{status:media.state==='processing'?'processing':'unavailable',error:media.last_error||'Recuperação do arquivo em andamento'};
 const {data:claimed,error:claim}=await db.from('agency_whatsapp_media').update({state:'processing',attempted_at:new Date().toISOString(),last_error:null}).eq('message_id',message.id).eq('user_id',connection.user_id).is('storage_path',null).or(`attempted_at.is.null,attempted_at.lt.${new Date(Date.now()-60000).toISOString()}`).select('message_id');if(claim)throw claim;if(!claimed?.length)return{status:'processing'};
 try{
  let file;
  if(connection.bridge_url){const remote=await bridgeMedia(connection,source,message.provider_message_id);if(remote.status!=='ready'){await db.from('agency_whatsapp_media').update({state:remote.status==='processing'?'pending':'unavailable',last_error:remote.error||null,attempted_at:remote.status==='processing'?null:new Date().toISOString()}).eq('message_id',message.id).eq('user_id',connection.user_id);return{status:remote.status,error:remote.error};}
   file=await fetchMediaFile({url:remote.url},{mimetype:remote.mime||media.descriptor?.mimetype||({imagem:'image/jpeg',audio:'audio/ogg',video:'video/mp4',documento:'application/octet-stream'}as any)[message.kind],fileName:remote.name||'arquivo'});
  }else{
   const descriptor=media.descriptor;if(!descriptor)throw Error('Os dados de download deste arquivo não estão mais disponíveis');const url=new URL('https://api.w-api.app/v1/message/download-media');url.searchParams.set('instanceId',connection.instance_id);const response=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${connection.token}`,'content-type':'application/json'},body:JSON.stringify({mediaKey:descriptor.mediaKey,directPath:descriptor.directPath,type:descriptor.type,mimetype:descriptor.mimetype}),signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('Provedor não disponibilizou o arquivo (HTTP '+response.status+')');file=await fetchMediaFile(await response.json(),descriptor);
  }
  const path=`${connection.user_id}/${message.account_id}/${message.id}.${extension(file.mime)}`;const {error:uploaded}=await db.storage.from(BUCKET).upload(path,file.bytes,{contentType:file.mime,upsert:false});if(uploaded&&!['409','Duplicate'].includes(String(uploaded.statusCode||uploaded.error)))throw Error('Não foi possível armazenar o arquivo');
  const {error:saved}=await db.from('agency_whatsapp_media').update({storage_path:path,mime:file.mime,name:file.name,bytes:file.bytes.length,state:'ready',last_error:null}).eq('message_id',message.id).eq('user_id',connection.user_id);if(saved)throw saved;return ensureMedia(db,connection,message,source);
 }catch(e){const safe=e instanceof Error&&/^(Os dados|Provedor|Arquivo|Origem|Link|Não foi)/.test(e.message)?e.message:'Não foi possível recuperar o arquivo neste momento';await db.from('agency_whatsapp_media').update({state:'unavailable',last_error:safe}).eq('message_id',message.id).eq('user_id',connection.user_id);return{status:'unavailable',error:safe};}
}
export async function recoverMedia(db:any,connection:any,account:any){
 if(!account?.id||!account.phone)return;const {error:enqueued}=await db.rpc('agency_enqueue_media',{p_user:connection.user_id,p_account:account.id});if(enqueued)throw enqueued;
 const {data,error}=await db.from('agency_whatsapp_media').select('message_id').eq('user_id',connection.user_id).eq('account_id',account.id).is('storage_path',null).or(`attempted_at.is.null,attempted_at.lt.${new Date(Date.now()-300000).toISOString()}`).order('attempted_at',{ascending:true,nullsFirst:true}).order('created_at',{ascending:false}).limit(100);if(error)throw error;
 if(!data?.length)return [];
 const {data:messages,error:readError}=await db.from('agency_whatsapp_messages').select('*').eq('user_id',connection.user_id).eq('account_id',account.id).in('id',data.map((e:any)=>e.message_id));if(readError)throw readError;
 const byId=new Map((messages||[]).map((m:any)=>[m.id,m]));const candidates=data.map((e:any)=>byId.get(e.message_id)).filter(Boolean) as any[];const chosen:any[]=[];
 for(const kind of ['imagem','audio','video','documento']){const next=candidates.find(m=>m.kind===kind);if(next&&chosen.length<3)chosen.push(next);}
 for(const m of candidates){if(chosen.length>=3)break;if(!chosen.some(c=>c.id===m.id))chosen.push(m);}
 return Promise.all(chosen.map(message=>ensureMedia(db,connection,message,account.phone)));
}
