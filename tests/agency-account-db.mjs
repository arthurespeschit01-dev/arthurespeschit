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
  await db.exec(`create role service_role bypassrls;alter table auth.users add column email_confirmed_at timestamptz default now();
 create function public.update_updated_at_column() returns trigger language plpgsql as $$begin new.updated_at=now();return new;end$$;
 alter table clients add column services text default '',add column account_ids jsonb default '{}',add column payment_day int,add column contract_duration text default '',add column verba_mensal numeric default 0,add column niche text default '';`);
  const owner = randomUUID(),
    other = randomUUID(),
    member = randomUUID();
  for (const [id, email] of [
    [owner, "owner@example.invalid"],
    [other, "other@example.invalid"],
    [member, "design@example.invalid"],
  ])
    await db.query("insert into auth.users(id,email) values($1,$2)", [
      id,
      email,
    ]);
  for (const file of [
    "20261111144901_agency_pipelines.sql",
    "20261111145150_agency_portal_forms.sql",
    "20261111152507_agency_whatsapp.sql",
    "20261111171948_commercial_dashboard_client_operations.sql",
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
    "20261116125048_workspace_standard_release.sql",
    "20261116135124_workspace_invitation_delivery_roles.sql",
    "20261116135146_agency_account_workspace.sql",
  ])
    await db.exec(
      await readFile(
        new URL("../supabase/migrations/" + file, import.meta.url),
        "utf8",
      ),
    );
  await db.exec(
    "grant usage on schema public to service_role;grant all on all tables in schema public to service_role",
  );
  const as = async (id) => {
    await db.exec("reset role;set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  };
  await as(owner);
  const pipeline = (
    await db.query(
      "select save_agency_pipeline(null,'comercial','Atual',0,$1,'{}') id",
      [
        JSON.stringify([
          {
            id: randomUUID(),
            name: "Novo",
            color: "#123456",
            position: 0,
            outcome: "in_progress",
          },
          {
            id: randomUUID(),
            name: "Ganho",
            color: "#654321",
            position: 1,
            outcome: "won",
          },
        ]),
      ],
    )
  ).rows[0].id;
  const stages = (
    await db.query(
      "select * from agency_pipeline_stages where pipeline_id=$1 order by position",
      [pipeline],
    )
  ).rows;
  const card = (
    await db.query(
      "insert into agency_pipeline_cards(user_id,pipeline_id,stage_id,title,phone,value) values($1,$2,$3,'Oportunidade atual','5511999990000',1200) returning *",
      [owner, pipeline, stages[0].id],
    )
  ).rows[0];
  const before = (await db.query("select * from agency_pipeline_cards")).rows;
  const stagesBefore = (
    await db.query("select * from agency_pipeline_stages order by id")
  ).rows;
  const pipesBefore = (
    await db.query("select * from agency_pipelines order by id")
  ).rows;
  const w = (await db.query("select agency_account_workspace() id")).rows[0].id;
  assert.equal(
    (await db.query("select agency_account_workspace() id")).rows[0].id,
    w,
  );
  assert.deepEqual(
    (await db.query("select * from agency_pipeline_cards")).rows,
    before,
  );
  assert.equal(
    (
      await db.query(
        "select account_kind from agency_client_workspaces where id=$1",
        [w],
      )
    ).rows[0].account_kind,
    "agency",
  );
  assert.equal(
    (
      await db.query("select name from agency_workspace_leads where id=$1", [
        card.id,
      ])
    ).rows[0].name,
    card.title,
  );
  await db.query("update agency_pipeline_cards set stage_id=$1 where id=$2", [
    stages[1].id,
    card.id,
  ]);
  assert.equal(
    (
      await db.query(
        "select stage_id from agency_workspace_leads where id=$1",
        [card.id],
      )
    ).rows[0].stage_id,
    stages[1].id,
  );
  await db.query(
    "update agency_workspace_leads set name='Atualizada pela equipe' where id=$1",
    [card.id],
  );
  assert.equal(
    (
      await db.query("select title from agency_pipeline_cards where id=$1", [
        card.id,
      ])
    ).rows[0].title,
    "Atualizada pela equipe",
  );
  const role = (
    await db.query("select agency_workspace_save_role($1,null,$2) id", [
      w,
      JSON.stringify({
        name: "Design",
        permissions: { crm: "read", forms: "read", calendar: "read" },
        notifications: {},
      }),
    ])
  ).rows[0].id;
  const invite = (
    await db.query(
      "insert into agency_workspace_invitations(workspace_id,email,display_name,role,custom_role_id) values($1,'design@example.invalid','Designer','admin',$2) returning *",
      [w, role],
    )
  ).rows[0];
  assert.equal(invite.role, "viewer");
  await as(other);
  await assert.rejects(() =>
    db.query("select agency_workspace_accept_invite($1)", [invite.token]),
  );
  assert.equal(
    (await db.query("select agency_account_workspace() id")).rows[0].id === w,
    false,
  );
  await assert.rejects(() =>
    db.query("select agency_account_calendar($1)", [w]),
  );
  await as(member);
  assert.equal(
    (
      await db.query("select agency_workspace_accept_invite($1) id", [
        invite.token,
      ])
    ).rows[0].id,
    w,
  );
  const perms = (
    await db.query("select agency_workspace_permissions($1) p", [w])
  ).rows[0].p;
  assert.equal(perms.modules.crm.read, true);
  assert.equal(perms.modules.crm.write, false);
  assert.equal(perms.modules.forms.read, true);
  assert.equal(perms.modules.flows.read, false);
  assert.equal(perms.can_manage, false);
  assert.equal(
    (
      await db.query(
        "update agency_workspace_leads set name='Proibido' where id=$1 returning id",
        [card.id],
      )
    ).rows.length,
    0,
  );
  await assert.rejects(() =>
    db.query("select agency_account_calendar($1,'save',null,$2)", [
      w,
      JSON.stringify({
        title: "Proibido",
        status: "agendado",
        starts_at: "2026-11-20T14:00:00Z",
        ends_at: "2026-11-20T14:30:00Z",
      }),
    ]),
  );
  await assert.rejects(() =>
    db.query("select agency_workspace_invite_email($1,$2)", [w, invite.id]),
  );
  await as(owner);
  await db.query("select agency_account_calendar($1,'save',null,$2)", [
    w,
    JSON.stringify({
      title: "Compromisso da Central",
      status: "agendado",
      starts_at: "2026-11-20T14:00:00Z",
      ends_at: "2026-11-20T14:30:00Z",
    }),
  ]);
  const agenda = (await db.query("select agency_account_calendar($1) a", [w]))
    .rows[0].a;
  assert.equal(agenda.events.length, 1);
  const appointment = agenda.events[0];
  await as(member);
  assert.equal(
    (await db.query("select agency_account_calendar($1) a", [w])).rows[0].a
      .events.length,
    1,
  );
  await as(owner);
  await db.query(
    "select agency_workspace_set_member_role($1,$2,'agent',null)",
    [w, member],
  );
  await as(member);
  await db.query("select agency_account_calendar($1,'save',$2,$3)", [
    w,
    appointment.id,
    JSON.stringify({ ...appointment, title: "Alterado com permissão" }),
  ]);
  await db.exec("reset role");
  assert.equal(
    (
      await db.query("select title from agency_appointments where id=$1", [
        appointment.id,
      ])
    ).rows[0].title,
    "Alterado com permissão",
  );
  assert.equal(
    (
      await db.query("select user_id from agency_appointments where id=$1", [
        appointment.id,
      ])
    ).rows[0].user_id,
    owner,
  );
  await as(owner);
  const pendingInvite = (
    await db.query(
      "insert into agency_workspace_invitations(workspace_id,email,role) values($1,'retry@example.invalid','viewer') returning *",
      [w],
    )
  ).rows[0];
  await assert.rejects(() =>
    db.query(
      "update agency_workspace_invitations set email_sent_at=now() where id=$1",
      [pendingInvite.id],
    ),
  );
  await db.exec("reset role;set role service_role");
  const claim = (
    await db.query("select agency_workspace_invite_email($1,$2) d", [
      w,
      pendingInvite.id,
    ])
  ).rows[0].d;
  await assert.rejects(() =>
    db.query("select agency_workspace_invite_email($1,$2)", [
      w,
      pendingInvite.id,
    ]),
  );
  await db.query("select agency_workspace_invite_email($1,$2,$3,null)", [
    w,
    pendingInvite.id,
    claim.claim,
  ]);
  assert.equal(
    (
      await db.query(
        "select email_error is null and email_sent_at is not null ok from agency_workspace_invitations where id=$1",
        [pendingInvite.id],
      )
    ).rows[0].ok,
    true,
  );
  await as(owner);
  await db.query(
    "insert into agency_workspace_conversion_rules(workspace_id,name,provider,event_name,trigger_type,phrase,enabled) values($1,'Mensagem real','meta','Purchase','message_received','fechado',true)",
    [w],
  );
  await db.exec("reset role;set role service_role");
  const message = (
    await db.query(
      "insert into agency_whatsapp_messages(user_id,provider_message_id,phone,direction,status,body) values($1,'unique-message','5511999990000','entrada','recebido','Está fechado') returning id",
      [owner],
    )
  ).rows[0].id;
  await db.query(
    "update agency_whatsapp_messages set status='recebido' where id=$1",
    [message],
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from agency_workspace_action_outbox where workspace_id=$1 and payload->>'event_name'='Purchase'",
        [w],
      )
    ).rows[0].n,
    1,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from agency_workspace_leads where workspace_id=$1",
        [w],
      )
    ).rows[0].n,
    1,
  );
  const pending = (
    await db.query("select agency_account_calendar_pending($1) rows", [w])
  ).rows[0].rows;
  assert.equal(pending.length, 1);
  await db.query(
    "update agency_appointments set google_event_id='ca'||replace(id::text,'-',''),google_synced_at=updated_at where id=$1",
    [appointment.id],
  );
  assert.equal(
    (await db.query("select agency_account_calendar_pending($1) rows", [w]))
      .rows[0].rows.length,
    0,
  );
  await db.query("delete from agency_appointments where id=$1", [
    appointment.id,
  ]);
  assert.equal(
    (
      await db.query("select agency_account_calendar_cancellations($1) rows", [
        w,
      ])
    ).rows[0].rows.length,
    1,
  );
  if (process.env.ACCOUNT_BROWSER && !process.env.INVITED_ACCESS) {
    const { verifyAgencyBrowser } = await import(
      "./agency-account-browser.mjs"
    );
    await verifyAgencyBrowser(db, owner, w);
  }
  if(process.env.INVITED_ACCESS) { const {verifyInvitedAccess}=await import("./invited-access-checks.mjs");await verifyInvitedAccess(db,owner); }
  if(process.env.MCP_TEST){const {verifyMcp}=await import("./minutes-mcp-checks.mjs");await verifyMcp(db,owner,other);}
  console.log(
    "PASS primary account: isolated owner context, existing CRM preserved and synchronized both ways, custom invitation role, read-only enforcement, foreign denial and scoped calendar CRUD",
  );
} finally {
  await db.close();
}
