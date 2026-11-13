export const MEDIA_LIMIT=32*1024*1024;
export function mediaDescriptor(payload){
 const d=payload?.data||payload||{},c=d.msgContent||d.message||{},m=c.message||c;
 const doc=m.documentMessage||m.documentWithCaptionMessage?.message?.documentMessage;
 const [type,v]=m.imageMessage?['image',m.imageMessage]:m.stickerMessage?['image',m.stickerMessage]:m.audioMessage?['audio',m.audioMessage]:m.videoMessage?['video',m.videoMessage]:doc?['document',doc]:[];
 if(!v)return null;let key=v.mediaKey;if(key?.data&&Array.isArray(key.data))key=btoa(String.fromCharCode(...key.data));
 if(typeof key!=='string'||key.length>500||typeof v.directPath!=='string'||!v.directPath.startsWith('/')||v.directPath.startsWith('//')||v.directPath.length>4096)return null;
 const mime=String(v.mimetype||({image:'image/jpeg',audio:'audio/ogg',video:'video/mp4',document:'application/octet-stream'})[type]).split(';')[0].toLowerCase();
 if(!validMediaMime(mime,type))return null;
 return {mediaKey:key,directPath:v.directPath,type,mimetype:mime,fileName:String(v.fileName||`${type}.${extension(mime)}`).replace(/[\\/\x00-\x1f]/g,'_').slice(0,180)};
}
export function validMediaMime(mime,type){return type==='image'?/^image\/(jpeg|png|webp|gif)$/.test(mime):type==='audio'?/^audio\/(ogg|opus|mpeg|mp3|mp4|aac|wav|x-wav|amr|webm)$/.test(mime):type==='video'?/^video\/(mp4|webm|quicktime|3gpp)$/.test(mime):type==='document'&&!/html|javascript|svg|xml/.test(mime)&&/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(mime);}
export function extension(mime){return ({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','audio/ogg':'ogg','audio/opus':'opus','audio/mpeg':'mp3','audio/mp3':'mp3','audio/mp4':'m4a','audio/wav':'wav','audio/x-wav':'wav','audio/aac':'aac','audio/amr':'amr','audio/webm':'webm','video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov','application/pdf':'pdf'})[mime]||'bin'}
export function trustedMediaUrl(value){let u;try{u=new URL(value)}catch{throw Error('Link de mídia inválido')}
 const h=u.hostname.toLowerCase();if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'||!(['api.w-api.app','storage.googleapis.com','firebasestorage.googleapis.com'].includes(h)||['.w-api.app','.amazonaws.com','.supabase.co','.r2.dev','.r2.cloudflarestorage.com'].some(s=>h.endsWith(s))))throw Error('Origem de mídia não permitida');return u.href;
}
export async function fetchMediaFile(providerResult,descriptor,fetcher=fetch){
 const r=providerResult?.data||providerResult;const b64=providerResult?.base64||r?.base64;let bytes;
 if(typeof b64==='string'){const value=b64.replace(/^data:[^,]+,/,'');if(value.length>Math.ceil(MEDIA_LIMIT*4/3)+4)throw Error('Arquivo excede 32 MB');const binary=atob(value);bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));}
 else {const raw=typeof r==='string'?r:r?.url||r?.fileLink||r?.fileUrl||r?.downloadUrl||r?.mediaUrl||r?.link||providerResult?.url;if(!raw)throw Error('Provedor não disponibilizou o arquivo');let url=trustedMediaUrl(raw),response;
  for(let i=0;i<3;i++){response=await fetcher(url,{redirect:'manual',signal:AbortSignal.timeout(20000)});if(response.status>=300&&response.status<400){url=trustedMediaUrl(new URL(response.headers.get('location')||'',url).href);continue;}break;}
  if(!response?.ok)throw Error('Arquivo indisponível no provedor');if(Number(response.headers.get('content-length'))>MEDIA_LIMIT)throw Error('Arquivo excede 32 MB');const reader=response.body?.getReader();if(!reader)throw Error('Arquivo vazio');const chunks=[];let size=0;while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MEDIA_LIMIT){await reader.cancel();throw Error('Arquivo excede 32 MB')}chunks.push(value)}bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 }
 if(!bytes.length||bytes.length>MEDIA_LIMIT)throw Error('Arquivo vazio ou excede 32 MB');const head=new TextDecoder().decode(bytes.slice(0,80)).trim().toLowerCase();if(head.startsWith('<!doctype')||head.startsWith('<html')||head.startsWith('<svg'))throw Error('Provedor retornou uma página em vez da mídia');return{bytes,mime:descriptor.mimetype,name:descriptor.fileName};
}
