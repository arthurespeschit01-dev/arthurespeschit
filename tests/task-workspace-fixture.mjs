import {PGlite} from '@electric-sql/pglite';import {readFile} from 'node:fs/promises';import {randomUUID} from 'node:crypto';
export const workspaceMigration='20261112222942_task_workspace.sql';
export async function createTaskWorkspace({migrate=true}={}){
 const db=new PGlite(),owner=randomUUID(),other=randomUUID(),client=randomUUID();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;insert into auth.users values('${owner}'),('${other}');create table clients(id uuid primary key,user_id uuid,name text,status text);insert into clients values('${client}','${owner}','Cliente demonstrativo','Ativo');create function update_updated_at_column() returns trigger language plpgsql as $$begin new.updated_at=now();return new;end$$;`);
 const migration=async file=>db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
 await db.exec((await readFile(new URL('../supabase/migrations/20260416021855_a62b0b3d-1228-4ace-a4b7-e4ee215bd546.sql',import.meta.url),'utf8')).split('-- Storage bucket')[0]);
 for(const file of ['20260416022733_4abf73de-3b98-4c14-8d99-332e0ea6a01c.sql','20260422161434_1bb772b8-8950-4b83-8ce3-f50120c7d2f9.sql','20260422162705_c172d709-3f2d-4b9b-841d-cf4b466b3aeb.sql','20261112195910_task_closure_history.sql'])await migration(file);
 await db.exec(`grant select,insert,update,delete on operational_tasks,task_comments,task_attachments to authenticated;grant select on clients to authenticated;select set_config('request.jwt.claim.sub','${owner}',false);`);
 if(migrate)await migration(workspaceMigration);
 return {db,owner,other,client,migrate:()=>migration(workspaceMigration)};
}
