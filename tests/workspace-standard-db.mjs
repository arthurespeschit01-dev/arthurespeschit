import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const db = new PGlite();
try {
  await db.exec(
    await readFile(
      new URL("./fixtures/signup-tenants.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.exec(
    "create role service_role bypassrls;alter table auth.users add column email_confirmed_at timestamptz default now();create table public.agency_whatsapp_connections(instance_id text);grant select on public.agency_whatsapp_connections to service_role",
  );
  const owners = [randomUUID(), randomUUID()],
    viewer = randomUUID();
  for (const id of [...owners, viewer])
    await db.query("insert into auth.users(id,email) values($1,$2)", [
      id,
      id + "@example.invalid",
    ]);
  await db.query(
    "insert into clients(user_id,name,monthly_fee) values($1,'Legacy retained',700)",
    [owners[0]],
  );
  const legacy = (await db.query("select * from clients")).rows;
  for (const name of [
    "20261113190913_pilot_client_workspaces.sql",
    "20261113215540_workspace_commercial_modules.sql",
    "20261113220957_workspace_integrations.sql",
    "20261114005109_workspace_professional_automations.sql",
    "20261114011614_workspace_action_cancellation_guards.sql",
    "20261114024829_workspace_trigger_configuration.sql",
    "20261114033015_workspace_roles_and_form_builder.sql",
    "20261114033021_workspace_tracking_and_flow_audit.sql",
    "20261114034242_workspace_ai_conversion_rules.sql",
    "20261114151246_workspace_crm_and_flow_parity.sql",
    "20261115223409_workspace_whatsapp_cloud_transport.sql",
    "20261115225048_workspace_whatsapp_optout_addresses.sql",
  ])
    await db.exec(
      await readFile(
        new URL("../supabase/migrations/" + name, import.meta.url),
        "utf8",
      ),
    );
  // Emulate pg_cron's command storage; migration must replace jobs in place, preserving schedules.
  await db.exec(`create schema cron;create table cron.job(jobname text primary key,schedule text,command text);
    create function cron.schedule(text,text,text) returns bigint language plpgsql as $$begin insert into cron.job values($1,$2,$3) on conflict(jobname) do update set schedule=excluded.schedule,command=excluded.command;return 1;end$$;
    insert into cron.job values('pilot-workspace-google','* * * * *','select w.id from public.agency_client_workspaces w join agency_private.pilot_accounts p on p.user_id=w.owner_user_id and p.enabled where w.status=''active'''),('legacy-job','* * * * *','select 42');`);
  await db.query(
    "insert into agency_private.pilot_accounts(user_id,enabled) values($1,false)",
    [owners[0]],
  );
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/20261116125048_workspace_standard_release.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','agency_private') and p.prosrc like '%pilot_accounts%'",
      )
    ).rows[0].n,
    0,
  );
  const jobs = (await db.query("select * from cron.job order by jobname")).rows;
  assert.equal(jobs.length, 2);
  assert.equal(jobs[0].command, "select 42");
  assert(!jobs[1].command.includes("pilot_accounts"));
  assert(jobs[1].command.includes("w.status='active'"));
  const as = async (id) => {
    await db.exec("reset role;set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  };
  const workspaces = [];
  for (const id of owners) {
    await as(id);
    assert.equal(
      (await db.query("select agency_workspace_status() enabled")).rows[0]
        .enabled,
      true,
    );
    assert.equal(
      (await db.query("select agency_workspace_identity() value")).rows[0].value
        .can_create,
      true,
    );
    workspaces.push(
      (
        await db.query(
          "select agency_workspace_create('Independent customer','') id",
        )
      ).rows[0].id,
    );
    assert.equal(
      (await db.query("select count(*)::int n from agency_client_workspaces"))
        .rows[0].n,
      1,
    );
  }
  await as(owners[0]);
  assert.equal(
    (
      await db.query("select * from agency_client_workspaces where id=$1", [
        workspaces[1],
      ])
    ).rows.length,
    0,
  );
  const role = (
    await db.query("select agency_workspace_permissions($1) value", [
      workspaces[1],
    ])
  ).rows[0].value;
  assert.equal(role.can_read, false);
  assert.equal(role.can_manage, false);
  await assert.rejects(() =>
    db.query(
      "update agency_client_workspaces set owner_user_id=$1 where id=$2",
      [owners[1], workspaces[0]],
    ),
  );
  await db.exec("reset role");
  await db.query(
    "insert into agency_workspace_members(workspace_id,user_id,role) values($1,$2,'viewer')",
    [workspaces[0], viewer],
  );
  await as(viewer);
  assert.equal(
    (await db.query("select * from agency_client_workspaces")).rows.length,
    1,
  );
  await assert.rejects(() =>
    db.query(
      "insert into agency_workspace_leads(workspace_id,pipeline_id,stage_id,name) select workspace_id,pipeline_id,id,'Denied' from agency_workspace_stages where workspace_id=$1 limit 1",
      [workspaces[0]],
    ),
  );
  await as(owners[0]);
  await db.query(
    "update agency_client_workspaces set status='archived' where id=$1",
    [workspaces[0]],
  );
  await db.exec("reset role;set role service_role");
  assert.equal(
    (
      await db.query("select agency_workspace_available($1) active", [
        workspaces[0],
      ])
    ).rows[0].active,
    false,
  );
  assert.equal(
    (
      await db.query("select agency_workspace_available($1) active", [
        workspaces[1],
      ])
    ).rows[0].active,
    true,
  );
  await db.exec(
    "reset role;set role anon;select set_config('request.jwt.claim.sub','',false)",
  );
  await assert.rejects(() => db.query("select agency_workspace_status()"));
  await assert.rejects(() =>
    db.query("select agency_workspace_create('Denied','')"),
  );
  await db.exec("reset role");
  assert.deepEqual((await db.query("select * from clients")).rows, legacy);
  assert.equal(
    (await db.query("select enabled from agency_private.pilot_accounts"))
      .rows[0].enabled,
    false,
  );
  console.log(
    "PASS standard release: no enrollment, independent owners, scoped viewer, owner immutability, archive/anonymous denial, all runtime gates removed, cron updated in place and legacy rows preserved",
  );
} finally {
  await db.close();
}
