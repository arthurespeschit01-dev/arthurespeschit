const LIMIT=16*1024*1024;
export function uploadName(name:unknown){return String(name||'arquivo').replace(/[^a-zA-Z0-9_.-]/g,'_').slice(-120)||'arquivo'}
export function mediaKind(mime:string){return mime.startsWith('image/')?'imagem':mime.startsWith('audio/')?'audio':mime.startsWith('video/')?'video':'documento'}
export function ownedUpload(path:unknown,user:string,account:string){return typeof path==='string'&&path.startsWith(`${user}/${account}/outgoing/`)&&!path.includes('..')&&/^[a-zA-Z0-9_./-]+$/.test(path)&&path.split('/').length===5}
export async function prepareUpload(db:any,user:string,account:string,body:any){
 if(!Number.isInteger(body.size)||body.size<=0||body.size>LIMIT)throw Error('Escolha um arquivo de até 16 MB.');
 const path=`${user}/${account}/outgoing/${crypto.randomUUID()}/${uploadName(body.name)}`;const {data,error}=await db.storage.from('agency-whatsapp-media').createSignedUploadUrl(path);if(error)throw Error('Não foi possível preparar o anexo.');return {path,token:data.token};
}
export async function uploadedFile(db:any,user:string,account:string,path:unknown){
 if(!ownedUpload(path,user,account))throw Error('Anexo não pertence à conta conectada.');const parts=(path as string).split('/'),name=parts.pop()!;
 const {data,error}=await db.storage.from('agency-whatsapp-media').list(parts.join('/'),{search:name,limit:100});const file=data?.find((item:any)=>item.name===name);if(error||!file||!file.metadata?.size||file.metadata.size>LIMIT)throw Error('Anexo não encontrado ou maior que 16 MB.');
 const mime=String(file.metadata.mimetype||'application/octet-stream').split(';')[0];const {data:signed,error:signError}=await db.storage.from('agency-whatsapp-media').createSignedUrl(path,3600);if(signError)throw Error('Não foi possível acessar o anexo.');return {path,name,mime,bytes:file.metadata.size,kind:mediaKind(mime),url:signed.signedUrl};
}
export function providerMedia(file:any,phone:string,caption:string){
 const route:any={imagem:['send-image','image'],video:['send-video','video'],audio:['send-audio','audio'],documento:['send-document','document']};const [action,key]=route[file.kind];return {action:`message/${action}`,body:{phone,[key]:file.url,...(['imagem','video'].includes(file.kind)?{caption}:{}),...(file.kind==='documento'?{fileName:file.name,extension:file.name.split('.').pop()}:{})}};
}
