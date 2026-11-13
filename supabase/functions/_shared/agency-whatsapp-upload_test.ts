import {ownedUpload,prepareUpload,uploadedFile,providerMedia} from './agency-whatsapp-upload.ts';
const assert=(v:unknown)=>{if(!v)throw Error('Assertion failed')};
Deno.test('uploads enforce owner/account, file limit and actual stored metadata',async()=>{
 assert(ownedUpload('owner/account/outgoing/uuid/photo.jpg','owner','account'));assert(!ownedUpload('foreign/account/outgoing/uuid/photo.jpg','owner','account'));assert(!ownedUpload('owner/other/outgoing/uuid/photo.jpg','owner','account'));assert(!ownedUpload('owner/account/outgoing/../photo.jpg','owner','account'));
 const db={storage:{from:()=>({createSignedUploadUrl:async(path:string)=>({data:{token:'fixture',path}}),list:async()=>({data:[{name:'audio.webm',metadata:{size:100,mimetype:'audio/webm'}}]}),createSignedUrl:async()=>({data:{signedUrl:'https://fixture.invalid/private'}})})}};
 for(const size of [0,17*1024*1024,-1]){let rejected=false;try{await prepareUpload(db,'owner','account',{name:'photo.jpg',size})}catch{rejected=true}assert(rejected)}
 const file=await uploadedFile(db,'owner','account','owner/account/outgoing/uuid/audio.webm');assert(file.kind==='audio'&&file.bytes===100);const outgoing=providerMedia(file,'5511999990000','');assert(outgoing.action==='message/send-audio'&&(outgoing.body as Record<string,unknown>).audio==='https://fixture.invalid/private');
});
