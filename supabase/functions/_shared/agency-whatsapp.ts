export function whatsappPhone(value: unknown): string {
 const raw=String(value||'').trim();
 if(/^[0-9-]{5,40}@g\.us$/.test(raw))return raw;
 if(/^[0-9]{5,40}@lid$/.test(raw))return raw;
 if(raw.includes('@lid'))return '';
 let phone=raw.replace(/\D/g,'');if(phone.length===10||phone.length===11)phone='55'+phone;return phone;
}
export function whatsappPhoneKey(value:unknown):string{
 const phone=whatsappPhone(value);return /^55\d{10,11}$/.test(phone)?phone.slice(2,4)+phone.slice(-8):phone;
}
export function validWhatsappAddress(value:string){return /^\d{10,15}$/.test(value)||/^[0-9-]{5,40}@g\.us$/.test(value)||/^[0-9]{5,40}@lid$/.test(value)}
export function normalizeWhatsappEvent(payload:Record<string,unknown>){
 const record=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
 const data=payload.data&&typeof payload.data==='object'?record(payload.data):payload;
 const content=record(data.msgContent||data.message),message=record(content.message||content),chat=record(data.chat),key=record(data.key||content.key);
 const event=String(payload.event||data.event||'');
 const fromMe=data.fromMe===true||data.fromMe==='true'||key.fromMe===true||key.fromMe==='true'||/^webhookDelivery$/i.test(event);
 const rawChat=String(chat.id||key.remoteJid||data.phone||data.to||'');
 const isGroup=data.isGroup===true||data.isGroup==='true'||rawChat.endsWith('@g.us');
 let address=isGroup?rawChat:fromMe?rawChat:String(record(data.sender).id||data.phone||chat.id||data.from||key.remoteJid||'');
 if(isGroup&&!address.includes('@'))address+='@g.us';
 const phone=whatsappPhone(address);if(!validWhatsappAddress(phone))return null;
 if(/status|ack|deliver|read|receipt|presence|connect/i.test(event)&&!/received/i.test(event)&&!/^webhookDelivery$/i.test(event))return null;
 const doc=record(message.documentMessage||record(record(message.documentWithCaptionMessage).message).documentMessage);
 const raw=message.conversation||record(message.extendedTextMessage).text||record(message.imageMessage).caption||record(message.videoMessage).caption||doc.caption||message.text||'';
 const text=typeof raw==='string'?raw:'';
 const kind=message.imageMessage||message.stickerMessage?'imagem':message.audioMessage?'audio':message.videoMessage?'video':message.documentMessage||message.documentWithCaptionMessage?'documento':'texto';
 const providerId=data.messageId||key.id;if(typeof providerId!=='string'||!providerId||providerId.length>200||(!text&&kind==='texto'))return null;
 const savedName=String(chat.subject||chat.name||record(data.groupMetadata).subject||'').trim();
 const pushName=!fromMe?String(record(data.sender).pushName||record(data.sender).name||data.pushName||'').trim():'';
 const n=Number(data.moment||data.timestamp),date=new Date(n*(n>1e12?1:1000));
 return {phone,providerId,isGroup,direction:fromMe?'saida':'entrada',contactName:(savedName||(!isGroup?pushName:'' )).slice(0,200)||null,nameSource:isGroup?'group':savedName?'contact':'push',senderName:!fromMe?pushName.slice(0,160)||null:null,createdAt:n&&Number.isFinite(date.getTime())&&date.getTime()<Date.now()+300000?date.toISOString():new Date().toISOString(),body:text.slice(0,10000)||`[${kind}]`,kind};
}
