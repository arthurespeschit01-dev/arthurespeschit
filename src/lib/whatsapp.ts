import { supabase } from "@/integrations/supabase/client";

export async function whatsappRequest<T>(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await supabase.functions.invoke("agency-whatsapp", {
    body: { action, ...payload },
  });
  if (error) {
    let message = "Não foi possível acessar o WhatsApp da Central.";
    try {
      message = (await error.context?.json())?.error || message;
    } catch {
      /* use fallback */
    }
    throw new Error(message);
  }
  return data as T;
}

let mediaActive=0;const mediaWaiters:Array<()=>void>=[];
export async function whatsappMediaRequest<T>(payload:Record<string,unknown>):Promise<T>{
 if(mediaActive>=3)await new Promise<void>(resolve=>mediaWaiters.push(resolve));else mediaActive++;
 try{return await whatsappRequest<T>('media',payload)}finally{const next=mediaWaiters.shift();if(next)next();else mediaActive--}
}
