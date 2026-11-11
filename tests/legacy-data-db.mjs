import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

// Representative existing account, with active clients, tasks and paid invoices.
// Uses an isolated PostgreSQL instance; never reads or writes the live account.
const db = new PGlite();
const owner = "11111111-1111-4111-8111-111111111111";
const client = "22222222-2222-4222-8222-222222222222";
await db.exec(`
  create role authenticated;
  create role anon;
  create role service_role bypassrls;
  create schema auth;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$select '${owner}'::uuid$$;
  grant usage on schema auth to authenticated;
  grant execute on function auth.uid() to authenticated;
  create function public.update_updated_at_column() returns trigger language plpgsql as $$begin new.updated_at=now(); return new; end$$;
  create table public.clients(id uuid primary key,user_id uuid,name text,status text,monthly_fee numeric,payment_day int,phone text,account_ids jsonb);
  create table public.operational_tasks(id uuid primary key,user_id uuid,client_id uuid,title text,status text,priority text,end_date date);
  create table public.profiles(user_id uuid primary key,notif_email boolean,notif_config jsonb,onboarding_completed boolean);
  create table public.mensalidades(id uuid primary key,user_id uuid,cliente_id uuid,valor numeric,status text,vencimento date,data_pagamento date);
  create table public.transacoes(id uuid primary key,user_id uuid,cliente_id uuid,tipo text,descricao text,valor numeric,data date);
  insert into auth.users values('${owner}');
  insert into public.clients values('${client}','${owner}','Cliente ativo existente','Ativo',3500,5,'11999990000','{"bm":"123456","google_ads":"987654"}');
  insert into public.operational_tasks values(gen_random_uuid(),'${owner}','${client}','Campanha em execução','em andamento','alta','2026-12-05');
  insert into public.profiles values('${owner}',true,'{"task_vencendo":true,"saldo_baixo":true}',true);
  insert into public.mensalidades values(gen_random_uuid(),'${owner}','${client}',3500,'pago','2026-11-05','2026-11-04');
  insert into public.transacoes values(gen_random_uuid(),'${owner}','${client}','entrada','Pagamento existente',3500,'2026-11-04');
`);
const tables = [
  "clients",
  "operational_tasks",
  "profiles",
  "mensalidades",
  "transacoes",
];
for (const table of tables)
  await db.exec(
    `alter table public.${table} enable row level security; create policy existing_owner on public.${table} for select to authenticated using (user_id=auth.uid()); grant select on public.${table} to authenticated;`,
  );
const snapshot = async () => {
  const result = {};
  for (const table of tables)
    result[table] = (
      await db.query(
        `select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') as data from public.${table} t`,
      )
    ).rows[0].data;
  return result;
};
const before = await snapshot();
await db.exec("set role authenticated");
const accountBefore = await snapshot();
await db.exec("reset role");
for (const name of [
  "20261111144901_agency_pipelines.sql",
  "20261111145150_agency_portal_forms.sql",
  "20261111145643_agency_calendar.sql",
  "20261111152507_agency_whatsapp.sql",
]) {
  await db.exec(
    await readFile(
      new URL(`../supabase/migrations/${name}`, import.meta.url),
      "utf8",
    ),
  );
  assert.deepEqual(
    await snapshot(),
    before,
    `Existing data changed after ${name}`,
  );
}
await db.exec("set role authenticated");
assert.deepEqual(
  await snapshot(),
  accountBefore,
  "Existing account must retain access to the same records",
);
assert.equal(
  (await db.query("select count(*)::int n from clients where status='Ativo'"))
    .rows[0].n,
  1,
);
await db.close();
console.log(
  "PASS: all four migrations preserve existing active clients, account IDs, tasks, settings, paid invoices, transactions and account access",
);
