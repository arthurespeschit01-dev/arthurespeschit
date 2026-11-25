-- Anexos: limite de 50 MB por arquivo e mais formatos comuns (webm, heic, wav, m4a).
-- Altera só a configuração dos buckets; nenhum arquivo nem registro é modificado.
update storage.buckets
set file_size_limit = 52428800,
    allowed_mime_types = array[
      'application/pdf','image/png','image/jpeg','image/webp','image/gif','image/heic',
      'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain','text/csv','video/mp4','video/quicktime','video/webm',
      'audio/mpeg','audio/ogg','audio/wav','audio/mp4','application/zip'
    ]
where id in ('client-attachments','task-attachments','contract-attachments');
