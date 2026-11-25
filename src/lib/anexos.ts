// Anexos privados: o link é gerado na hora (assinado, válido por 1 hora) em vez de URL pública permanente.
import { supabase } from '@/integrations/supabase/client';
import { caminhoDoAnexo, validarAnexo } from '../../supabase/functions/_shared/security';

export type BucketAnexo = 'client-attachments' | 'task-attachments' | 'contract-attachments';
export { validarAnexo };

export async function urlAssinada(bucket: BucketAnexo, valor: string, segundos = 3600): Promise<string | null> {
  const caminho = caminhoDoAnexo(valor, bucket);
  if (!caminho) return null;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(caminho, segundos);
  return error ? null : data.signedUrl;
}

// Abre em nova aba sem cair no bloqueador de pop-up (a aba abre no clique e recebe o link depois)
export async function abrirAnexo(bucket: BucketAnexo, valor: string, baixarComo?: string) {
  const aba = window.open('', '_blank');
  if (aba) aba.opener = null;
  const url = await urlAssinada(bucket, valor);
  if (!url) { aba?.close(); throw new Error('Não foi possível abrir o anexo'); }
  const final = baixarComo ? `${url}&download=${encodeURIComponent(baixarComo)}` : url;
  if (aba) aba.location.href = final; else window.location.href = final;
}
