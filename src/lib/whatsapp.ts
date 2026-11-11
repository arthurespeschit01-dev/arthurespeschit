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
