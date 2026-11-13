import {useEffect,useState} from 'react';
import {whatsappMediaRequest} from '@/lib/whatsapp';
import {Button} from '@/components/ui/button';
interface Media{status:'ready'|'processing'|'unavailable';url?:string;name?:string;mime?:string;error?:string}
export default function WhatsAppMedia({id,kind,accountId,caption}:{id:string;kind:string;accountId?:string;caption?:string}){
 const [media,setMedia]=useState<Media|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{let alive=true,timer:ReturnType<typeof setTimeout>;let tries=0;setMedia(null);setError('');const load=async()=>{try{const data=await whatsappMediaRequest<Media>({message_id:id,account_id:accountId,retry:retry>0&&tries===0});tries++;if(!alive)return;setMedia(data);if(data.status!=='ready'&&tries<60)timer=setTimeout(()=>void load(),data.status==='processing'?2500:30000)}catch(e){if(alive)setError((e as Error).message)}};void load();return()=>{alive=false;clearTimeout(timer)}},[id,accountId,retry]);
 if(!media&&!error)return <p role="status" className="text-xs text-muted-foreground py-3">Recuperando arquivo…</p>;
 if(error||media?.status!=='ready'||!media.url)return <div className="max-w-xs py-2"><p className="text-xs text-muted-foreground">{error||media?.error||'Arquivo em recuperação automática.'}</p><Button className="mt-2" variant="outline" size="sm" onClick={()=>setRetry(n=>n+1)}>Tentar recuperar mídia</Button></div>;
 const failed=()=>setError('Não foi possível abrir o arquivo. Tente recarregar a mídia.');
 if(kind==='imagem')return <a href={media.url} target="_blank" rel="noopener noreferrer" aria-label="Abrir imagem"><img src={media.url} alt={caption||'Imagem do WhatsApp'} loading="lazy" className="max-w-full max-h-96 rounded-lg object-contain" onError={failed}/></a>;
 if(kind==='audio')return <div><audio aria-label="Áudio do WhatsApp" controls preload="metadata" src={media.url} onError={failed} className="w-[280px] max-w-full min-w-0"/><a className="text-xs underline" href={media.url} target="_blank" rel="noopener noreferrer">Abrir áudio</a></div>;
 if(kind==='video')return <video aria-label="Vídeo do WhatsApp" controls playsInline preload="metadata" src={media.url} onError={failed} className="max-w-full max-h-96 rounded-lg"/>;
 return <a href={media.url} target="_blank" rel="noopener noreferrer" className="text-sm underline break-all">{media.name||'Baixar documento'}</a>;
}
