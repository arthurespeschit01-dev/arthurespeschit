import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

// Runs the real migration in an isolated PostgreSQL engine. Never connects to production.
const db = new PGlite();
const owner = randomUUID();
const other = randomUUID();
const client = randomUUID();
await db.exec(`
  create role authenticated;
  create role anon;
  create role service_role bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to authenticated, anon;
  grant execute on function auth.uid() to authenticated, anon;
  create table public.clients (id uuid primary key, user_id uuid not null);
  alter table public.clients enable row level security;
  create policy owner on public.clients for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
  grant select on public.clients to authenticated;
  create function public.update_updated_at_column() returns trigger language plpgsql as
    $$ begin new.updated_at = now(); return new; end $$;
  insert into auth.users values ('${owner}'), ('${other}');
  insert into public.clients values ('${client}', '${other}');
`);
await db.exec(
  await readFile(
    new URL(
      "../supabase/migrations/20261111144901_agency_pipelines.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);
const login = async (id) => {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [
    id || "",
  ]);
  await db.exec(`set role ${id ? "authenticated" : "anon"}`);
};
const save = async (id, stages, moves = {}, revision = 1, area = "comercial") =>
  (
    await db.query(
      "select public.save_agency_pipeline($1, $2, $3, $4, $5::jsonb, $6::jsonb) as id",
      [
        id,
        area,
        "Minha pipeline",
        revision,
        JSON.stringify(stages),
        JSON.stringify(moves),
      ],
    )
  ).rows[0].id;
const stage = (name, position) => ({
  id: randomUUID(),
  name,
  color: "#123abc",
  position,
});
const first = stage("Entrada", 0);
const second = stage("Proposta", 1);
await login(owner);
const pipeline = await save(null, [first, second]);
const card = randomUUID();
await db.query(
  "insert into public.agency_pipeline_cards(id,user_id,pipeline_id,stage_id,title) values ($1,$2,$3,$4,$5)",
  [card, owner, pipeline, first.id, "Contato"],
);
await assert.rejects(() => save(pipeline, [second]), /destino/);
assert.equal(
  (await db.query("select revision from public.agency_pipelines")).rows[0]
    .revision,
  1,
  "failed saves roll back revision",
);
assert.equal(
  (await db.query("select stage_id from public.agency_pipeline_cards")).rows[0]
    .stage_id,
  first.id,
  "failed saves preserve cards",
);
await save(pipeline, [second], { [first.id]: second.id });
assert.equal(
  (await db.query("select stage_id from public.agency_pipeline_cards")).rows[0]
    .stage_id,
  second.id,
);
assert.equal(
  (
    await db.query(
      "select count(*)::int as n from public.agency_pipeline_stages",
    )
  ).rows[0].n,
  1,
);
await assert.rejects(() => save(pipeline, [second], {}, 1), /alterada/);
await assert.rejects(() => save(pipeline, [], {}, 2), /1 a 40/);
await assert.rejects(() => save(pipeline, [second, second], {}, 2), /IDs/);
await assert.rejects(() => save(pipeline, [{ ...second, name: "" }], {}, 2));
const third = stage("Outra", 0);
const anotherPipeline = await save(null, [third]);
await assert.rejects(
  () =>
    db.query(
      "update public.agency_pipeline_cards set stage_id=$1 where id=$2",
      [third.id, card],
    ),
  /foreign key/,
);
await assert.rejects(
  () =>
    db.query(
      "update public.agency_pipeline_cards set client_id=$1 where id=$2",
      [client, card],
    ),
  /row-level security/,
);
await db.query(
  "update public.agency_pipeline_cards set pipeline_id=$1, stage_id=$2 where id=$3",
  [anotherPipeline, third.id, card],
);
const operation = await save(null, [stage("Onboarding", 0)], {}, 1, "operacao");
const operationStage = (
  await db.query(
    "select id from public.agency_pipeline_stages where pipeline_id=$1",
    [operation],
  )
).rows[0].id;
await assert.rejects(
  () =>
    db.query(
      "insert into public.agency_pipeline_cards(user_id,pipeline_id,stage_id,title) values ($1,$2,$3,$4)",
      [owner, operation, operationStage, "Sem cliente"],
    ),
  /row-level security/,
);
await login(other);
for (const table of [
  "agency_pipelines",
  "agency_pipeline_stages",
  "agency_pipeline_cards",
]) {
  assert.equal(
    (await db.query(`select count(*)::int as n from public.${table}`)).rows[0]
      .n,
    0,
    `tenant isolation: ${table}`,
  );
}
await assert.rejects(() => save(pipeline, [second], {}, 2), /não encontrada/);
await assert.rejects(
  () =>
    db.query(
      "insert into public.agency_pipeline_stages(user_id,pipeline_id,name,position) values ($1,$2,$3,0)",
      [other, pipeline, "Ataque"],
    ),
  /foreign key/,
);
await login(null);
await assert.rejects(
  () => db.query("select * from public.agency_pipeline_cards"),
  /permission denied/,
);
await assert.rejects(() => save(null, [first]), /permission denied/);
await db.exec("reset role");
for (const name of [
  "20261111145150_agency_portal_forms.sql",
  "20261111145643_agency_calendar.sql",
])
  await db.exec(
    await readFile(
      new URL(`../supabase/migrations/${name}`, import.meta.url),
      "utf8",
    ),
  );
const ownClient = randomUUID();
await db.query("insert into public.clients values ($1,$2)", [ownClient, owner]);
await login(owner);
await assert.rejects(
  () =>
    db.query(
      "insert into public.agency_client_portals(user_id,client_id) values ($1,$2)",
      [owner, client],
    ),
  /row-level security/,
);
const portal = (
  await db.query(
    "insert into public.agency_client_portals(user_id,client_id) values ($1,$2) returning id,token",
    [owner, ownClient],
  )
).rows[0];
assert.match(portal.token, /^[a-f0-9]{64}$/);
const ticket = (
  await db.query(
    "insert into public.agency_tickets(user_id,client_id,portal_id,title,category,description) values ($1,$2,$3,'Criativo','design','Novo design') returning id",
    [owner, ownClient, portal.id],
  )
).rows[0].id;
await assert.rejects(
  () =>
    db.query(
      "insert into public.agency_ticket_messages(user_id,ticket_id,sender,body) values ($1,$2,'cliente','Impersonation')",
      [owner, ticket],
    ),
  /row-level security/,
);
await db.query(
  "insert into public.agency_ticket_messages(user_id,ticket_id,sender,body) values ($1,$2,'agencia','Resposta')",
  [owner, ticket],
);
await db.exec("reset role; set role service_role");
await db.query(
  "insert into public.agency_ticket_messages(user_id,ticket_id,sender,body) values ($1,$2,'cliente','Retorno do cliente')",
  [owner, ticket],
);
assert.equal(
  (
    await db.query("select status from public.agency_tickets where id=$1", [
      ticket,
    ])
  ).rows[0].status,
  "em_andamento",
);
await db.query(
  "update public.agency_tickets set status='concluido' where id=$1",
  [ticket],
);
await assert.rejects(
  () =>
    db.query(
      "insert into public.agency_ticket_messages(user_id,ticket_id,sender,body) values ($1,$2,'cliente','Depois de concluir')",
      [owner, ticket],
    ),
  /concluído/,
);
await login(owner);
const form = (
  await db.query(
    `insert into public.agency_forms(user_id,title,fields) values ($1,'Briefing','[{"id":"goal","label":"Objetivo","type":"text","required":true}]') returning id`,
    [owner],
  )
).rows[0].id;
await assert.rejects(
  () => db.query("select * from public.agency_calendar_connections"),
  /permission denied/,
);
await assert.rejects(
  () => db.query("select * from public.agency_calendar_states"),
  /permission denied/,
);
await db.exec("reset role; set role service_role");
await db.query(
  `insert into public.agency_form_responses(user_id,form_id,answers) values ($1,$2,'{"goal":{"label":"Objetivo","value":"Crescer"}}')`,
  [owner, form],
);
await login(owner);
assert.equal(
  (await db.query("select count(*)::int n from public.agency_form_responses"))
    .rows[0].n,
  1,
);
await login(other);
for (const table of [
  "agency_client_portals",
  "agency_tickets",
  "agency_ticket_messages",
  "agency_forms",
  "agency_form_responses",
])
  assert.equal(
    (await db.query(`select count(*)::int n from public.${table}`)).rows[0].n,
    0,
  );
await login(null);
for (const table of [
  "agency_client_portals",
  "agency_tickets",
  "agency_ticket_messages",
  "agency_forms",
  "agency_form_responses",
  "agency_calendar_connections",
  "agency_calendar_states",
])
  await assert.rejects(
    () => db.query(`select * from public.${table}`),
    /permission denied/,
  );
console.log(
  "PASS: portals, tickets, form responses, tenant isolation, client impersonation denial, service-only calendar secrets",
);
await db.close();
console.log(
  "PASS: migration, card preservation, rollback, revisions, pipeline moves, tenant isolation, operation ownership, anonymous denial",
);
