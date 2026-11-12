import {useEffect,useRef} from 'react';import {useAuth} from '@/contexts/AuthContext';import {supabase} from '@/integrations/supabase/client';
export function useCommercialLive(onUpdate:()=>void){const {user}=useAuth();const callback=useRef(onUpdate);callback.current=onUpdate;
 useEffect(()=>{if(!user)return;let alive=true;let timer:ReturnType<typeof setTimeout>;const refresh=()=>{clearTimeout(timer);timer=setTimeout(()=>{if(alive)callback.current()},150)};let channel=supabase.channel(`commercial-${user.id}-${crypto.randomUUID()}`);
 for(const table of ['agency_forms','agency_form_responses','agency_pipeline_cards','agency_pipeline_stages','agency_pipelines'])channel=channel.on('postgres_changes',{event:'*',schema:'public',table,filter:`user_id=eq.${user.id}`},refresh);
 channel.subscribe(status=>{if(status==='SUBSCRIBED')refresh()});const interval=setInterval(()=>{if(!document.hidden)refresh()},10000);window.addEventListener('focus',refresh);
 return()=>{alive=false;clearTimeout(timer);clearInterval(interval);window.removeEventListener('focus',refresh);void supabase.removeChannel(channel)};
 },[user?.id]);
}
