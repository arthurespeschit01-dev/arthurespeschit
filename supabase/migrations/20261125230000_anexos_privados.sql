-- Anexos: buckets privados, só tipos de arquivo conhecidos e até 20 MB.
-- Altera apenas a configuração dos buckets; nenhum arquivo nem registro é modificado.
update storage.buckets
set public = false,
    file_size_limit = 20971520,
    allowed_mime_types = array[
      'application/pdf','image/png','image/jpeg','image/webp','image/gif',
      'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain','text/csv','video/mp4','video/quicktime','audio/mpeg','audio/ogg','application/zip'
    ]
where id in ('client-attachments','task-attachments','contract-attachments');
