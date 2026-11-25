// Anexos privados: o link é gerado na hora (assinado, válido por 1 hora) em vez de URL pública permanente.
import { supabase } from '@/integrations/supabase/client';
import { caminhoDoAnexo, nomeSeguro, tipoDoArquivo, validarAnexo } from '../../supabase/functions/_shared/security';

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

// Envia o arquivo e devolve o valor salvo em file_url (mesmo formato de antes).
// Erros viram mensagens claras em português.
export async function enviarAnexo(bucket: BucketAnexo, pasta: string, file: File): Promise<string> {
  const invalido = validarAnexo(file);
  if (invalido) throw new Error(invalido);
  const caminho = `${pasta}/${Date.now()}_${nomeSeguro(file.name)}`;
  const { error } = await supabase.storage.from(bucket).upload(caminho, file, {
    contentType: tipoDoArquivo(file),
    upsert: false,
  });
  if (error) throw new Error(mensagemDeErro(error));
  return supabase.storage.from(bucket).getPublicUrl(caminho).data.publicUrl;
}

// Se o registro do anexo não puder ser salvo, apaga o arquivo para não sobrar lixo no armazenamento
export async function descartarAnexo(bucket: BucketAnexo, valor: string) {
  const caminho = caminhoDoAnexo(valor, bucket);
  if (caminho) await supabase.storage.from(bucket).remove([caminho]);
}

export function mensagemDeErro(erro: unknown): string {
  const msg = String((erro as { message?: string })?.message ?? erro ?? '');
  if (/exceeded the maximum|too large|413/i.test(msg)) return 'Arquivo maior que 50 MB. Comprima ou envie um link.';
  if (/mime type|not supported/i.test(msg)) return 'Tipo de arquivo não permitido.';
  if (/row-level security|unauthorized|403/i.test(msg)) return 'Sem permissão para enviar aqui. Saia e entre de novo e tente outra vez.';
  if (/failed to fetch|network/i.test(msg)) return 'Falha de conexão durante o envio. Verifique a internet e tente de novo.';
  return msg ? `Não foi possível enviar: ${msg}` : 'Não foi possível enviar o arquivo.';
}
