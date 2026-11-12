-- Disconnect commercial automation from WhatsApp while preserving its records.
drop trigger if exists agency_whatsapp_update_card on public.agency_whatsapp_messages;
drop trigger if exists agency_card_whatsapp_account on public.agency_pipeline_cards;
create or replace function public.agency_whatsapp_ensure_lead(p_user_id uuid,p_account_id uuid,p_phone text,p_name text) returns uuid language plpgsql security invoker set search_path='' as $$begin return null;end;$$;
alter table public.agency_forms add column pipeline_id uuid references public.agency_pipelines(id) on delete set null,add column lead_name_field_id text;
alter table public.agency_form_responses add column reviewed_at timestamptz;
alter table public.agency_pipeline_cards add column source_type text not null default 'legacy' check(source_type in('legacy','manual','whatsapp','form')),add column source_form_id uuid references public.agency_forms(id) on delete set null,add column form_response_id uuid unique references public.agency_form_responses(id) on delete set null;
alter table public.agency_pipeline_cards alter column source_type set default 'manual';
create index agency_cards_form_source on public.agency_pipeline_cards(user_id,source_type,pipeline_id);
create index agency_responses_review on public.agency_form_responses(user_id,created_at desc,reviewed_at);
create function public.agency_form_pipeline_guard() returns trigger language plpgsql security invoker set search_path='' as $$begin
 if new.pipeline_id is not null and not exists(select 1 from public.agency_pipelines where id=new.pipeline_id and user_id=new.user_id and area='comercial') then raise exception 'Escolha uma pipeline comercial da sua conta';end if;
 if new.lead_name_field_id is not null and not exists(select 1 from jsonb_array_elements(new.fields) f where f->>'id'=new.lead_name_field_id) then raise exception 'O campo de nome deve existir neste formulário';end if;
 return new;
end;$$;
revoke all on function public.agency_form_pipeline_guard() from public,anon,authenticated;
create trigger agency_form_pipeline_guard before insert or update of pipeline_id,lead_name_field_id,fields on public.agency_forms for each row execute function public.agency_form_pipeline_guard();
create function public.agency_form_card_source_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare response_form uuid;
begin
 if new.source_form_id is not null and not exists(select 1 from public.agency_forms where id=new.source_form_id and user_id=new.user_id) then raise exception 'Formulário de origem inválido';end if;
 if new.form_response_id is not null then
  select form_id into response_form from public.agency_form_responses where id=new.form_response_id and user_id=new.user_id;
  if not found or new.source_form_id is distinct from response_form then raise exception 'Resposta de origem inválida';end if;
 end if;return new;
end;$$;
revoke all on function public.agency_form_card_source_guard() from public,anon,authenticated;
create trigger agency_form_card_source_guard before insert or update of source_form_id,form_response_id on public.agency_pipeline_cards for each row execute function public.agency_form_card_source_guard();
create function public.agency_import_form_lead(p_response_id uuid) returns uuid language plpgsql security invoker set search_path='' as $$
declare r public.agency_form_responses%rowtype;f public.agency_forms%rowtype;v_card uuid;v_pipeline uuid;v_stage uuid;v_name text;v_phone text:='';v_field jsonb;v_value text;v_label text;v_pos integer:=0;
begin
 select * into r from public.agency_form_responses where id=p_response_id;
 if not found then raise exception 'Resposta indisponível';end if;
 perform pg_advisory_xact_lock(hashtextextended('form-response:'||r.id::text,0));
 select id into v_card from public.agency_pipeline_cards where form_response_id=r.id and user_id=r.user_id;
 if v_card is not null then return v_card;end if;
 select * into f from public.agency_forms where id=r.form_id and user_id=r.user_id;
 if not found then raise exception 'Formulário indisponível';end if;
 perform pg_advisory_xact_lock(hashtextextended('form-pipeline:'||r.user_id::text,0));
 v_pipeline:=f.pipeline_id;
 if v_pipeline is null then select id into v_pipeline from public.agency_pipelines where user_id=r.user_id and area='comercial' order by created_at,id limit 1;end if;
 if v_pipeline is null then
  insert into public.agency_pipelines(user_id,area,name) values(r.user_id,'comercial','Comercial') returning id into v_pipeline;
  foreach v_name in array array['Novo formulário preenchido','Em análise','Em contato','Proposta','Ganho','Perdido'] loop
   insert into public.agency_pipeline_stages(user_id,pipeline_id,name,position,color,outcome) values(r.user_id,v_pipeline,v_name,v_pos,'#8b5cf6',case when v_name='Ganho' then 'won' when v_name='Perdido' then 'lost' else 'in_progress' end);v_pos:=v_pos+1;
  end loop;
 end if;
 select id into v_stage from public.agency_pipeline_stages where pipeline_id=v_pipeline and user_id=r.user_id order by position,id limit 1;
 if v_stage is null then insert into public.agency_pipeline_stages(user_id,pipeline_id,name,position) values(r.user_id,v_pipeline,'Novo formulário preenchido',0) returning id into v_stage;end if;
 v_name:=nullif(trim(r.answers->f.lead_name_field_id->>'value'),'');
 for v_field in select value from jsonb_array_elements(f.fields) loop
  v_value:=nullif(trim(r.answers->(v_field->>'id')->>'value'),'');
  if v_value is null then continue;end if;
  v_label:=trim(regexp_replace(translate(lower(v_field->>'label'),'áàâãéêíóôõúç','aaaaeeiooouc'),'[^a-z0-9]+',' ','g'));
  if v_name is null and (v_label in('nome','nome completo','seu nome','empresa','nome da empresa') or v_label like '%seu nome%') then v_name:=v_value;end if;
  if v_phone='' and (v_label like '%telefone%' or v_label like '%whatsapp%' or v_label like '%celular%') then v_phone:=left(v_value,40);end if;
 end loop;
 v_name:=coalesce(v_name,f.title||' · '||to_char(r.created_at at time zone 'America/Sao_Paulo','DD/MM HH24:MI'));
 insert into public.agency_pipeline_cards(user_id,pipeline_id,stage_id,title,phone,source_type,source_form_id,form_response_id,created_at)
 values(r.user_id,v_pipeline,v_stage,left(v_name,160),v_phone,'form',f.id,r.id,r.created_at) returning id into v_card;
 return v_card;
end;$$;
revoke all on function public.agency_import_form_lead(uuid) from public,anon;
grant execute on function public.agency_import_form_lead(uuid) to authenticated,service_role;
create function public.agency_form_submission_received() returns trigger language plpgsql security invoker set search_path='' as $$begin perform public.agency_import_form_lead(new.id);return new;end;$$;
revoke all on function public.agency_form_submission_received() from public,anon,authenticated;
create trigger agency_form_submission_received after insert on public.agency_form_responses for each row execute function public.agency_form_submission_received();
grant update(reviewed_at) on public.agency_form_responses to authenticated;
create policy response_review_owner on public.agency_form_responses for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create function public.agency_review_form(p_response_id uuid,p_reviewed boolean) returns void language plpgsql security invoker set search_path='' as $$begin
 if auth.uid() is null then raise exception 'Autenticação obrigatória';end if;
 update public.agency_form_responses set reviewed_at=case when p_reviewed then coalesce(reviewed_at,now()) else null end where id=p_response_id and user_id=auth.uid();
 if not found then raise exception 'Resposta indisponível';end if;
end;$$;
revoke all on function public.agency_review_form(uuid,boolean) from public,anon;
grant execute on function public.agency_review_form(uuid,boolean) to authenticated;
create function public.agency_form_card_reviewed() returns trigger language plpgsql security invoker set search_path='' as $$begin
 if new.source_type='form' and new.form_response_id is not null and new.stage_id is distinct from old.stage_id then
  update public.agency_form_responses set reviewed_at=coalesce(reviewed_at,now()) where id=new.form_response_id and user_id=new.user_id;
 end if;return new;
end;$$;
revoke all on function public.agency_form_card_reviewed() from public,anon,authenticated;
create trigger agency_form_card_reviewed after update of stage_id on public.agency_pipeline_cards for each row execute function public.agency_form_card_reviewed();
-- Existing submissions are legitimate form leads; replay is idempotent.
do $$declare item record;begin for item in select id from public.agency_form_responses order by created_at,id loop perform public.agency_import_form_lead(item.id);end loop;end;$$;
do $$declare t text;begin if exists(select 1 from pg_publication where pubname='supabase_realtime') then foreach t in array array['agency_forms','agency_form_responses','agency_pipelines','agency_pipeline_stages'] loop if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then execute format('alter publication supabase_realtime add table public.%I',t);end if;end loop;end if;end;$$;
