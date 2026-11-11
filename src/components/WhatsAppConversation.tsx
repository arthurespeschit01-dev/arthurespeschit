import {useCallback,useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {Textarea} from '@/components/ui/textarea';
import {whatsappRequest} from '@/lib/whatsapp';
import {supabase} from '@/integrations/supabase/client';
import {useWhatsAppLive} from '@/hooks/useWhatsAppLive';
import {Check,CheckCheck,Send} from 'lucide-react';
interface Message{id:string;direction:'entrada'|'saida';body:string;status:string;created_at:string;kind:string;sender_name?:string|null}
export default function WhatsAppConversation({cardId,phone,onChanged,fullHeight=false,isGroup=false}:{cardId?:string;phone:string;onChanged:()=>void;fullHeight?:boolean;isGroup?:boolean}){
 const [messages,setMessages]=useState<Message[]>([]),[text,setText]=useState(''),[hasMore,setHasMore]=useState(false),[olderBusy,setOlderBusy]=useState(false),[error,setError]=useState(''),[sending,setSending]=useState(false),[loading,setLoading]=useState(true);
 const requestId=useRef<string|null>(null),lastId=useRef<string|null>(null),olderLoaded=useRef(false),loadingRef=useRef(false),viewport=useRef<HTMLDivElement>(null),follow=useRef(true),onChangedRef=useRef(onChanged),alive=useRef(true);onChangedRef.current=onChanged;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 const load=useCallback(async()=>{
  if(!phone.trim()||loadingRef.current)return;loadingRef.current=true;
  try{
   const data=await whatsappRequest<{messages:Message[];has_more?:boolean}>('messages',{card_id:cardId,phone});if(!alive.current)return;
   setMessages(current=>{const ids=new Set(data.messages.map(m=>m.id));return [...current.filter(m=>!ids.has(m.id)&&new Date(m.created_at)<new Date(data.messages[0]?.created_at||0)),...data.messages]});
   if(!olderLoaded.current)setHasMore(!!data.has_more);setError('');setLoading(false);
   const latest=data.messages.at(-1)?.id||null;
   if(lastId.current!==latest){lastId.current=latest;onChangedRef.current();if(!document.hidden){await supabase.rpc('agency_whatsapp_mark_read',{p_address:phone});window.dispatchEvent(new Event('agency-whatsapp-update'))}}
  }catch(e){if(alive.current){setError((e as Error).message);setLoading(false)}}finally{loadingRef.current=false}
 },[cardId,phone]);
 useWhatsAppLive(()=>void load());
 useEffect(()=>{void load()},[load]);
 useEffect(()=>{if(follow.current&&viewport.current)viewport.current.scrollTop=viewport.current.scrollHeight},[messages]);
 const loadOlder=async()=>{if(olderBusy)return;setOlderBusy(true);const height=viewport.current?.scrollHeight||0;try{const data=await whatsappRequest<{messages:Message[];has_more:boolean}>('messages',{card_id:cardId,phone,offset:messages.length});olderLoaded.current=true;follow.current=false;setMessages(current=>[...data.messages.filter(m=>!current.some(c=>c.id===m.id)),...current]);setHasMore(data.has_more);requestAnimationFrame(()=>{if(viewport.current)viewport.current.scrollTop=viewport.current.scrollHeight-height})}catch(e){setError((e as Error).message)}finally{setOlderBusy(false)}};
 const send=async(event:React.FormEvent)=>{event.preventDefault();if(!text.trim()||sending)return;setSending(true);setError('');requestId.current||=crypto.randomUUID();try{await whatsappRequest('send',{card_id:cardId,phone,text:text.trim(),request_id:requestId.current});setText('');requestId.current=null;follow.current=true;await load();onChangedRef.current()}catch(e){setError((e as Error).message)}finally{setSending(false)}};
 const day=(value:string)=>new Date(value).toLocaleDateString('pt-BR');
 return <section className={fullHeight?'flex flex-col flex-1 min-h-0 overflow-hidden':'flex flex-col h-[28rem] border-t mt-3'} aria-label="Conversa WhatsApp do card">
  <div ref={viewport} onScroll={e=>{const el=e.currentTarget;follow.current=el.scrollHeight-el.scrollTop-el.clientHeight<100}} className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-8 py-5 bg-muted/20" aria-live="polite" aria-label="Mensagens da conversa">
   {hasMore&&<div className="text-center mb-4"><Button variant="outline" size="sm" disabled={olderBusy} onClick={()=>void loadOlder()}>Carregar mensagens anteriores</Button></div>}
   {loading&&<p role="status" className="text-center text-sm text-muted-foreground">Carregando mensagens…</p>}
   {messages.map((m,i)=><div key={m.id}>{(!i||day(m.created_at)!==day(messages[i-1].created_at))&&<div className="text-center my-5"><span className="rounded-md border bg-background px-3 py-1 text-xs text-muted-foreground">{day(m.created_at)===day(new Date().toISOString())?'Hoje':day(m.created_at)}</span></div>}<div className={`flex mb-2 ${m.direction==='saida'?'justify-end':'justify-start'}`}><article className={`max-w-[88%] sm:max-w-[75%] xl:max-w-[65%] rounded-xl px-3 py-2 shadow-sm border ${m.direction==='saida'?'bg-primary/10 border-primary/15 rounded-tr-sm':'bg-background rounded-tl-sm'}`}>
    {isGroup&&m.direction==='entrada'&&m.sender_name&&<p className="text-xs font-semibold text-primary mb-1">{m.sender_name}</p>}
    <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm leading-relaxed">{m.body}</p><div className="flex gap-1 justify-end items-center mt-1 text-[10px] text-muted-foreground"><time dateTime={m.created_at}>{new Date(m.created_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</time>{m.direction==='saida'&&(m.status==='enviado'?<CheckCheck size={13}/>:m.status==='erro'?<span className="text-destructive">Não confirmado</span>:<Check size={12}/>)}</div>
   </article></div></div>)}
   {!loading&&!messages.length&&<p className="text-center text-sm text-muted-foreground py-12">Nenhuma mensagem registrada nesta conversa.</p>}
  </div>
  {error&&<p role="alert" className="text-sm text-destructive border-t px-4 py-2">{error}</p>}
  <form onSubmit={send} className="shrink-0 border-t bg-background px-3 sm:px-5 py-3 flex items-end gap-3">
   <Textarea aria-label="Mensagem WhatsApp" maxLength={10000} value={text} onChange={e=>{setText(e.target.value);requestId.current=null}} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send(e)}}} disabled={sending} placeholder="Escreva uma mensagem" rows={1} className="min-h-11 max-h-36 resize-none rounded-xl flex-1"/>
   <Button type="submit" disabled={sending||!text.trim()} aria-label="Enviar pelo WhatsApp" className="h-11 gap-2"><Send size={17}/><span className="hidden sm:inline">{sending?'Enviando…':'Enviar'}</span></Button>
  </form>
 </section>;
}
