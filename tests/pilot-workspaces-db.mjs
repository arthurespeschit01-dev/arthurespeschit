import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const db = new PGlite();
await db.exec(
  await readFile(
    new URL("./fixtures/signup-tenants.sql", import.meta.url),
    "utf8",
  ),
);
await db.exec("create role service_role bypassrls");
const pilot = randomUUID(),
  other = randomUUID(),
  viewer = randomUUID();
for (const [id, email] of [
  [pilot, "pilot@example.invalid"],
  [other, "other@example.invalid"],
  [viewer, "viewer@example.invalid"],
])
  await db.query("insert into auth.users(id,email) values($1,$2)", [id, email]);
await db.query(
  "insert into clients(user_id,name,monthly_fee) values($1,'Cliente preservado',700)",
  [other],
);
const before = (await db.query("select * from clients")).rows;
await db.exec(
  await readFile(
    new URL(
      "../supabase/migrations/20261113190913_pilot_client_workspaces.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);
await db.query(
  "insert into agency_private.pilot_accounts(user_id,enabled) values($1,true)",
  [pilot],
);
const as = async (id) => {
  await db.exec("reset role;set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
};
await as(other);
assert.equal(
  (await db.query("select agency_pilot_status() allowed")).rows[0].allowed,
  false,
);
await assert.rejects(() =>
  db.query("select agency_workspace_create('Forbidden','')"),
);
assert.equal(
  (await db.query("select count(*)::int n from agency_client_workspaces"))
    .rows[0].n,
  0,
);
await assert.rejects(() =>
  db.query(
    "insert into agency_private.pilot_accounts(user_id,enabled) values($1,true)",
    [other],
  ),
);
await as(pilot);
assert.equal(
  (await db.query("select agency_pilot_status() allowed")).rows[0].allowed,
  true,
);
const w1 = (await db.query("select agency_workspace_create('Cliente A','') id"))
    .rows[0].id,
  w2 = (await db.query("select agency_workspace_create('Cliente B','') id"))
    .rows[0].id;
const stages = (
  await db.query(
    "select * from agency_workspace_stages where workspace_id=$1 order by position",
    [w1],
  )
).rows;
const foreign = (
  await db.query(
    "select * from agency_workspace_stages where workspace_id=$1 order by position",
    [w2],
  )
).rows[0];
const lead = (
  await db.query(
    "insert into agency_workspace_leads(workspace_id,pipeline_id,stage_id,name,value) values($1,$2,$3,'Lead A',100) returning *",
    [w1, stages[0].pipeline_id, stages[0].id],
  )
).rows[0];
await assert.rejects(() =>
  db.query("update agency_workspace_leads set stage_id=$1 where id=$2", [
    foreign.id,
    lead.id,
  ]),
);
await assert.rejects(() =>
  db.query(
    "update agency_workspace_leads set workspace_id=$1,pipeline_id=$2,stage_id=$3 where id=$4",
    [w2, foreign.pipeline_id, foreign.id, lead.id],
  ),
);
await db.query("update agency_workspace_leads set stage_id=$1 where id=$2", [
  stages[3].id,
  lead.id,
]);
await assert.rejects(() =>
  db.query("select agency_workspace_save_pipeline($1,$2,$3,$4)", [
    w1,
    "Comercial",
    JSON.stringify(stages.filter((s) => s.id !== stages[3].id)),
    stages[0].pipeline_id,
  ]),
);
assert.equal(
  (
    await db.query(
      "select count(*)::int n from agency_workspace_stages where workspace_id=$1",
      [w1],
    )
  ).rows[0].n,
  5,
);
await db.query("select agency_workspace_save_pipeline($1,$2,$3,$4)", [
  w1,
  "Pipeline editada",
  JSON.stringify([...stages].reverse()),
  stages[0].pipeline_id,
]);
assert.equal(
  (
    await db.query("select name from agency_workspace_pipelines where id=$1", [
      stages[0].pipeline_id,
    ])
  ).rows[0].name,
  "Pipeline editada",
);
await assert.rejects(() =>
  db.query("select agency_workspace_save_pipeline($1,$2,null,null)", [
    w1,
    "Inválida",
  ]),
);
await as(other);
assert.equal(
  (await db.query("select count(*)::int n from agency_workspace_leads")).rows[0]
    .n,
  0,
);
assert.equal(
  (
    await db.query(
      "update agency_workspace_leads set name='forged' where id=$1 returning id",
      [lead.id],
    )
  ).rows.length,
  0,
);
await db.exec("reset role");
await db.query(
  "insert into agency_workspace_members(workspace_id,user_id,role) values($1,$2,$3)",
  [w1, viewer, "viewer"],
);
await as(viewer);
assert.equal(
  (await db.query("select count(*)::int n from agency_client_workspaces"))
    .rows[0].n,
  0,
);
await db.exec("reset role");
await db.query(
  "insert into agency_private.pilot_accounts(user_id,enabled) values($1,true)",
  [viewer],
);
await as(viewer);
assert.equal(
  (await db.query("select count(*)::int n from agency_client_workspaces"))
    .rows[0].n,
  1,
);
assert.equal(
  (await db.query("select count(*)::int n from agency_workspace_leads")).rows[0]
    .n,
  1,
);
await assert.rejects(() =>
  db.query(
    "insert into agency_workspace_leads(workspace_id,pipeline_id,stage_id,name) values($1,$2,$3,'forged')",
    [w1, stages[0].pipeline_id, stages[0].id],
  ),
);
await as(pilot);
await db.query(
  "update agency_client_workspaces set status='archived' where id=$1",
  [w1],
);
assert.equal(
  (
    await db.query(
      "update agency_workspace_leads set name='blocked' where id=$1 returning id",
      [lead.id],
    )
  ).rows.length,
  0,
);
await db.query("delete from agency_client_workspaces where id=$1", [w1]);
assert.equal(
  (await db.query("select count(*)::int n from agency_workspace_leads")).rows[0]
    .n,
  0,
);
assert.equal(
  (await db.query("select count(*)::int n from agency_client_workspaces"))
    .rows[0].n,
  1,
);
await db.exec("reset role");
assert.deepEqual((await db.query("select * from clients")).rows, before);
await db.exec("set role anon");
await assert.rejects(() => db.query("select agency_pilot_status()"));
await assert.rejects(() => db.query("select * from agency_workspace_leads"));
await db.close();
console.log(
  "PASS: private pilot enrollment, cross-account/workspace isolation, viewer permissions, stage integrity, archive/delete and unchanged legacy clients",
);
