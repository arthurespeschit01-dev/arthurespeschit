import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
export async function createCommercialFixture({applyIntake=true}={}){
const db=new PGlite(),owner=randomUUID(),other=randomUUID(),active=randomUUID(),paused=randomUUID(),paid=randomUUID();
await db.exec(`create role authenticated;create role anon;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
create table clients(id uuid primary key default gen_random_uuid(),user_id uuid,name text,services text default '',monthly_fee numeric default 0,contract_duration text default '',status text default 'Ativo',payment_day int,account_ids jsonb default '{}',verba_mensal numeric default 0,niche text default '',phone text default '',created_at timestamptz default now());alter table clients enable row level security;create policy owner on clients for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));grant select,insert,update on clients to authenticated;
create function update_updated_at_column() returns trigger language plpgsql as $$begin new.updated_at=now();return new;end$$;insert into auth.users values('${owner}'),('${other}');insert into clients(id,user_id,name,monthly_fee,status,payment_day) values('${active}','${owner}','Ativo',550,'Ativo',15),('${paused}','${owner}','Pausado',600,'Pausado',15),('${paid}','${owner}','Pago',1000,'Ativo',15);`);
for(const file of ['20260421044957_6c23a9e6-bbdf-4b99-9db9-f66c2eb12105.sql','20261111144901_agency_pipelines.sql','20261111145150_agency_portal_forms.sql','20261111145643_agency_calendar.sql','20261111152507_agency_whatsapp.sql','20261111171948_commercial_dashboard_client_operations.sql','20261111183242_whatsapp_inbox_shared.sql','20261111185241_whatsapp_live_conversations.sql','20261111190630_whatsapp_directory_availability.sql','20261111192108_whatsapp_number_mailboxes_crm.sql','20261112194308_client_billing_schedule.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
await db.exec('grant select,insert,update,delete on mensalidades,transacoes to authenticated');

await db.exec(await readFile(new URL('../supabase/migrations/20261112201959_forms_deletion_finance_alignment.sql',import.meta.url),'utf8'));
const migrateIntake=()=>db.exec(readIntake);const readIntake=await readFile(new URL('../supabase/migrations/20261112214328_commercial_form_intake.sql',import.meta.url),'utf8');
if(applyIntake)await migrateIntake();
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
return {db,owner,other,active,paused,paid,migrateIntake};
}
