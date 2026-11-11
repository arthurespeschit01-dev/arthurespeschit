import {useWhatsAppAccount} from '@/hooks/useWhatsAppAccount';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {supabase} from '@/integrations/supabase/client';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {whatsappRequest} from '@/lib/whatsapp';
import {useWhatsAppLive} from '@/hooks/useWhatsAppLive';
import WhatsAppConversation from '@/components/WhatsAppConversation';
import {ArrowLeft,CheckCheck,MessageSquare,Plus,Search,Users} from 'lucide-react';
interface Contact{account_id?:string;phone_key:string;phone:string;name:string;body:string;direction:string;status:string;created_at:string;card_id:string|null;is_group?:boolean;unread_count?:number}
const initials=(name:string)=>name.split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase();
export default function WhatsAppInbox(){
 const activeAccount=useWhatsAppAccount();
 const accountId=!activeAccount.isError&&activeAccount.data?.connected?activeAccount.data.account_id:null;
 const [viewportHeight,setViewportHeight]=useState<number|null>(null);
 useEffect(()=>{const viewport=window.visualViewport;const resize=()=>setViewportHeight(viewport?.height||window.innerHeight);resize();viewport?.addEventListener('resize',resize);window.addEventListener('resize',resize);return()=>{viewport?.removeEventListener('resize',resize);window.removeEventListener('resize',resize)}},[]);
 const navigate=useNavigate();const [contacts,setContacts]=useState<Contact[]>([]),[selected,setSelected]=useState<Contact|null>(null),[search,setSearch]=useState(''),[phone,setPhone]=useState(''),[newOpen,setNewOpen]=useState(false),[filter,setFilter]=useState('all');
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[more,setMore]=useState(false);const status=activeAccount.isError?{...activeAccount.data,connected:false}:activeAccount.data;
 const count=useRef(50),sequence=useRef(0),contactsRef=useRef(contacts);contactsRef.current=contacts;
 const load=useCallback(async(append=false)=>{
  const version=++sequence.current;
  if(!accountId){setContacts([]);setSelected(null);setMore(false);setBusy(false);return;}
  setBusy(true);const pages=append?1:Math.ceil(count.current/50);let rows:Contact[]=[];let hasMore=false;
  for(let page=0;page<pages;page++){
   const offset=append?contactsRef.current.length:page*50;
   const {data,error}=await supabase.rpc('agency_whatsapp_inbox_v2',{p_search:search,p_offset:offset,p_filter:filter});if(version!==sequence.current)return;
   if(error){setError('A conexão foi interrompida. Tentando restabelecer as atualizações…');setBusy(false);return;}
   const items=(data as unknown as Contact[]).filter(c=>!c.account_id||c.account_id===accountId);rows.push(...items.slice(0,50));hasMore=items.length>50;if(!hasMore)break;
  }
  setContacts(current=>append?[...current,...rows.filter(r=>!current.some(c=>c.phone_key===r.phone_key))]:rows);setMore(hasMore);setBusy(false);setError('');if(append)count.current+=50;
  setSelected(current=>current?rows.find(c=>c.phone_key===current.phone_key)||current:null);
 },[search,filter,accountId]);
 useEffect(()=>{sequence.current++;count.current=50;setContacts([]);setSelected(null)},[accountId]);
 const realtime=useWhatsAppLive(()=>void load());
 useEffect(()=>{count.current=50;const timer=setTimeout(()=>void load(),200);return()=>clearTimeout(timer)},[load]);
 useEffect(()=>{
  let mounted=true;
  const reconnect=()=>{if(!document.hidden)void whatsappRequest('reconcile').then(()=>{if(mounted)void load()}).catch(()=>{if(mounted)setError('A sincronização está atrasada. O sistema tentará se reconectar automaticamente.')})};
  reconnect();const timer=setInterval(reconnect,60000);window.addEventListener('online',reconnect);window.addEventListener('focus',reconnect);
  return()=>{mounted=false;clearInterval(timer);window.removeEventListener('online',reconnect);window.removeEventListener('focus',reconnect)};
 },[load]);
 const visible=contacts.filter(c=>filter==='all'||filter==='unread'&&(c.unread_count||0)>0||filter==='crm'&&!!c.card_id||filter==='outside'&&!c.card_id||filter==='groups'&&c.is_group);
 const unread=contacts.reduce((sum,c)=>sum+(c.unread_count||0),0);
 return <div data-account-id={accountId||''} style={viewportHeight?{height:Math.max(180,viewportHeight-56)}:undefined} className="-m-4 lg:-m-6 h-[calc(100dvh-3.5rem)] overflow-hidden grid lg:grid-cols-[350px_minmax(0,1fr)]" aria-label="Caixa de conversas">
  <section className={`${selected?'hidden lg:flex':'flex'} flex-col min-h-0 border-r bg-background`} aria-label="Lista de conversas">
   <header className="px-4 pt-5 pb-3 shrink-0 border-b space-y-3"><div className="flex items-center justify-between gap-2"><h1 className="text-lg font-semibold flex items-center gap-2">Conversas{unread>0&&<span className="rounded-full bg-primary text-primary-foreground px-2 py-0.5 text-xs">{unread}</span>}</h1><Button size="sm" disabled={!accountId} onClick={()=>setNewOpen(true)} className="gap-1"><Plus size={15}/>Nova</Button></div>
    <div className={`text-xs rounded-md px-3 py-2 flex items-center gap-2 ${status?.connected?'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400':'bg-muted text-muted-foreground'}`}><span className={`w-1.5 h-1.5 rounded-full ${status?.connected?'bg-emerald-500':'bg-amber-500'}`}/>{status?.connected?`Conectado${status.phone?` · ${status.phone}`:''}`:status?'WhatsApp desconectado':'Verificando conexão…'}</div>
    {!!status?.legacy_count&&<p className="text-[11px] text-muted-foreground">Histórico antigo sem número de origem preservado separadamente ({status.legacy_count} mensagens).</p>}
    <div className="relative"><Search size={15} className="absolute left-3 top-3 text-muted-foreground"/><Input className="pl-9" aria-label="Buscar conversas" placeholder="Buscar nome, número ou mensagem" value={search} onChange={e=>setSearch(e.target.value)}/></div>
    <div className="flex gap-1.5 overflow-x-auto pb-1">{[['all','Todas'],['unread','Não lidas'],['crm','No CRM'],['outside','Fora do CRM'],['groups','Grupos']].map(([id,label])=><button key={id} onClick={()=>setFilter(id)} aria-pressed={filter===id} className={`shrink-0 text-[11px] rounded-full border px-2 py-1 ${filter===id?'bg-primary/10 border-primary/40 text-primary':'text-muted-foreground'}`}>{label}</button>)}</div>
   </header>
   {(error||status?.sync_error)&&<p role="alert" className="text-xs text-destructive px-4 py-2 border-b">{error||status?.sync_error}</p>}
   <div className="overflow-y-auto flex-1 min-h-0" aria-label="Contatos do WhatsApp">{visible.map(c=><button key={c.phone_key} onClick={()=>setSelected(c)} className={`flex gap-3 px-4 py-4 text-left w-full border-b transition-colors ${selected?.phone_key===c.phone_key?'bg-primary/10':'hover:bg-muted/50'}`}>
    <span className="rounded-full bg-primary/10 text-primary w-10 h-10 flex items-center justify-center shrink-0 text-xs font-semibold">{c.is_group?<Users size={19}/>:initials(c.name)}</span><span className="min-w-0 flex-1"><span className="flex items-center gap-2 justify-between"><strong className="text-sm truncate">{c.name}</strong><time className="text-[10px] text-muted-foreground shrink-0">{c.created_at?new Date(c.created_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):''}</time></span><span className="flex items-center gap-1 mt-1 text-xs text-muted-foreground"><span>{c.is_group?'Grupo':c.card_id?'No CRM':'Contato'}</span></span><span className="flex gap-2 items-center justify-between mt-1"><span className="text-xs text-muted-foreground truncate flex items-center gap-1">{c.direction==='saida'&&<CheckCheck className="shrink-0" size={13}/>}<span className="truncate">{c.body}</span></span>{!!c.unread_count&&<span className="shrink-0 rounded-full bg-primary text-primary-foreground text-[10px] min-w-5 h-5 px-1 inline-flex items-center justify-center">{c.unread_count}</span>}</span></span>
   </button>)}{!visible.length&&!busy&&<p className="text-center text-sm text-muted-foreground p-8">{accountId?`Nenhuma conversa ${filter==='all'?'encontrada':'neste filtro'}.`:'Conecte um número para ver somente as conversas dele. O histórico dos outros números permanece preservado.'}</p>}{busy&&!contacts.length&&<p role="status" className="p-6 text-sm text-muted-foreground">Carregando conversas…</p>}{more&&<Button variant="ghost" className="w-full" disabled={busy} onClick={()=>void load(true)}>Mais conversas</Button>}</div>
   <p className="text-[10px] text-muted-foreground px-4 py-2 border-t">{realtime?'Atualizações em tempo real':'Atualização automática ativa'}</p>
  </section>
  <section className={`${selected?'flex':'hidden lg:flex'} flex-col min-h-0 min-w-0 bg-background`} aria-label="Conversa selecionada">
   {selected?<><header className="shrink-0 min-h-16 flex items-center justify-between gap-3 px-4 py-3 border-b"><div className="flex gap-3 items-center min-w-0"><Button variant="ghost" size="icon" className="lg:hidden shrink-0" aria-label="Voltar às conversas" onClick={()=>setSelected(null)}><ArrowLeft size={18}/></Button><span className="rounded-full bg-primary/10 text-primary w-10 h-10 items-center justify-center shrink-0 hidden sm:flex text-xs font-semibold">{selected.is_group?<Users size={18}/>:initials(selected.name)}</span><div className="min-w-0"><h2 className="text-sm font-semibold truncate">{selected.name}</h2><p className="text-xs text-muted-foreground truncate">{selected.is_group?'Grupo do WhatsApp':selected.phone}</p></div></div>{selected.card_id&&<Button variant="outline" size="sm" onClick={()=>navigate('/comercial/crm')}>Ver no CRM</Button>}</header><WhatsAppConversation key={`${accountId}:${selected.phone_key}`} accountId={accountId||undefined} phone={selected.phone} onChanged={()=>void load()} fullHeight isGroup={selected.is_group}/></>:<div className="flex flex-1 items-center justify-center text-center p-8"><div><MessageSquare className="mx-auto mb-5 text-primary/60" size={48}/><h2 className="text-lg font-semibold">Suas conversas em um só lugar</h2><p className="text-sm text-muted-foreground mt-2">Selecione um contato ou grupo para conversar.</p></div></div>}
  </section>
  <Dialog open={newOpen} onOpenChange={setNewOpen}><DialogContent><DialogHeader><DialogTitle>Nova conversa</DialogTitle><DialogDescription>Informe o telefone com DDI e DDD.</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={e=>{e.preventDefault();if(!/^\+?[\d\s()-]{10,25}$/.test(phone)){setError('Informe um telefone válido.');return;}setSelected({phone,phone_key:phone,name:phone,body:'',created_at:'',direction:'',status:'',card_id:null});setNewOpen(false);setError('')}}><Label htmlFor="new-whatsapp-phone">Telefone da nova conversa</Label><Input id="new-whatsapp-phone" value={phone} onChange={e=>setPhone(e.target.value)}/><Button type="submit">Abrir conversa</Button></form></DialogContent></Dialog>
 </div>;
}
