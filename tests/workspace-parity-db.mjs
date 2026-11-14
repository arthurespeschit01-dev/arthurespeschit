import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
try {
  const db = new PGlite();
  await db.exec(
    await readFile(
      new URL("./fixtures/signup-tenants.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.exec(
    "create role service_role bypassrls;alter table auth.users add column email_confirmed_at timestamptz default now();create table public.agency_whatsapp_connections(instance_id text);grant select on public.agency_whatsapp_connections to service_role",
  );
  const owner = randomUUID(),
    other = randomUUID(),
    member = randomUUID();
  for (const [id, email] of [
    [owner, "owner@example.invalid"],
    [other, "other@example.invalid"],
    [member, "member@example.invalid"],
  ])
    await db.query("insert into auth.users(id,email) values($1,$2)", [
      id,
      email,
    ]);
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
    [owner],
  );
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/20261113215540_workspace_commercial_modules.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/20261113220957_workspace_integrations.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/20261114005109_workspace_professional_automations.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/20261114011614_workspace_action_cancellation_guards.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/20261114024829_workspace_trigger_configuration.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  for (const name of [
    "20261114033015_workspace_roles_and_form_builder.sql",
    "20261114033021_workspace_tracking_and_flow_audit.sql",
    "20261114034242_workspace_ai_conversion_rules.sql",
  ])
    await db.exec(
      await readFile(
        new URL("../supabase/migrations/" + name, import.meta.url),
        "utf8",
      ),
    );

  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/20261114151246_workspace_crm_and_flow_parity.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const as = async (id) => {
    await db.exec("reset role;set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  };
  await as(owner);
  const w = (
    await db.query("select agency_workspace_create('Empresa A','') id")
  ).rows[0].id;
  const w2 = (
    await db.query("select agency_workspace_create('Empresa B','') id")
  ).rows[0].id;
  const stages = (
    await db.query(
      "select * from agency_workspace_stages where workspace_id=$1 order by position",
      [w],
    )
  ).rows;
  const lead = (
    await db.query(
      "insert into agency_workspace_leads(workspace_id,pipeline_id,stage_id,name,phone,attributes) values($1,$2,$3,'Teste','5511999990000',$4) returning *",
      [
        w,
        stages[0].pipeline_id,
        stages[0].id,
        { utm_campaign: "Marca_Residencial", utm_source: "google" },
      ],
    )
  ).rows[0];
  assert.equal(
    (
      await db.query(
        "select is_default from agency_workspace_pipelines where id=$1",
        [stages[0].pipeline_id],
      )
    ).rows[0].is_default,
    true,
  );
  const p2 = (
    await db.query(
      "select agency_workspace_save_pipeline($1,'Origem 2',$2) id",
      [
        w,
        JSON.stringify([{ name: "Entrada", color: "#8b5cf6", kind: "open" }]),
      ],
    )
  ).rows[0].id;
  await db.query("select agency_workspace_default_pipeline($1,$2)", [w, p2]);
  assert.equal(
    (
      await db.query(
        "select id from agency_workspace_pipelines where workspace_id=$1 and is_default",
        [w],
      )
    ).rows[0].id,
    p2,
  );
  await assert.rejects(
    db.query("select agency_workspace_default_pipeline($1,$2)", [w2, p2]),
  );
  await db.query(
    "update agency_workspace_leads set name='Atualizado' where id=$1",
    [lead.id],
  );
  const h = (
    await db.query(
      "select * from agency_workspace_crm_history where lead_id=$1",
      [lead.id],
    )
  ).rows[0];
  assert.equal(h.before_data.name, "Teste");
  assert.equal(h.after_data.name, "Atualizado");
  await db.query("select agency_workspace_undo_lead($1,$2)", [w, h.id]);
  assert.equal(
    (
      await db.query("select name from agency_workspace_leads where id=$1", [
        lead.id,
      ])
    ).rows[0].name,
    "Teste",
  );
  await assert.rejects(
    db.query("select agency_workspace_undo_lead($1,$2)", [w, h.id]),
  );
  await db.query(
    "update agency_workspace_leads set name='Nova mudança' where id=$1",
    [lead.id],
  );
  const recent = (
    await db.query(
      "select * from agency_workspace_crm_history where lead_id=$1 order by created_at desc limit 1",
      [lead.id],
    )
  ).rows[0];
  await db.query(
    "update agency_workspace_leads set notes='mudança posterior' where id=$1",
    [lead.id],
  );
  await assert.rejects(
    db.query("select agency_workspace_undo_lead($1,$2)", [w, recent.id]),
    /mudou depois/,
  );
  await assert.rejects(
    db.query(
      "update agency_workspace_crm_history set before_data=$1 where id=$2",
      [{}, h.id],
    ),
  );
  const folder = (
    await db.query(
      "insert into agency_workspace_form_folders(workspace_id,name) values($1,'Captação') returning id",
      [w],
    )
  ).rows[0].id;
  await assert.rejects(
    db.query(
      "update agency_workspace_form_folders set workspace_id=$1 where id=$2",
      [w2, folder],
    ),
  );
  await assert.rejects(
    db.query(
      "insert into agency_workspace_forms(workspace_id,title,fields,pipeline_id,stage_id,folder_id) values($1,'Erro',$2,$3,$4,$5)",
      [
        w2,
        JSON.stringify([
          { id: "name", label: "Nome", type: "text", required: true },
          { id: "phone", label: "Telefone", type: "tel", required: true },
        ]),
        stages[0].pipeline_id,
        stages[0].id,
        folder,
      ],
    ),
  );
  await as(other);
  assert.equal(
    (await db.query("select count(*)::int n from agency_workspace_crm_history"))
      .rows[0].n,
    0,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from agency_workspace_form_folders",
      )
    ).rows[0].n,
    0,
  );
  await assert.rejects(
    db.query("select agency_workspace_undo_lead($1,$2)", [w, h.id]),
  );
  await db.exec("reset role");
  for (const [field, operator, value, expected] of [
    ["utm_campaign", "starts_with", "Marca", true],
    ["utm_campaign", "ends_with", "residencial", true],
    ["utm_source", "equals", "google", true],
    ["gclid", "not_filled", "", true],
    ["utm_campaign", "contains", "industrial", false],
    ["value", "less_than", "20", true],
  ]) {
    const result = (
      await db.query(
        "select agency_private.workflow_condition($1,'all',l,'{}') ok from agency_workspace_leads l where id=$2",
        [JSON.stringify([{ field, operator, value }]), lead.id],
      )
    ).rows[0].ok;
    assert.equal(result, expected, operator);
  }
  await as(owner);
  const definition = {
    nodes: [
      {
        id: "start",
        type: "trigger",
        position: { x: 0, y: 0 },
        data: { event: "lead_created" },
      },
      {
        id: "c",
        type: "condition",
        position: { x: 0, y: 100 },
        data: {
          match: "all",
          rules: [
            { field: "utm_campaign", operator: "starts_with", value: "marca" },
          ],
        },
      },
    ],
    edges: [],
  };
  await db.query(
    "insert into agency_workspace_flows(workspace_id,name,definition,enabled) values($1,'Condição UTM',$2,false)",
    [w, definition],
  );
  definition.nodes[1].data.rules[0].field = "access_token";
  await assert.rejects(
    db.query(
      "insert into agency_workspace_flows(workspace_id,name,definition,enabled) values($1,'Condição inválida',$2,false)",
      [w, definition],
    ),
  );

  await db.exec("reset role");
  const account = (
    await db.query(
      "insert into agency_workspace_whatsapp_accounts(workspace_id,phone) values($1,'5511888880000') returning id",
      [w],
    )
  ).rows[0].id;
  await db.query(
    "insert into agency_workspace_messages(workspace_id,account_id,provider_id,phone,body,direction,lead_id,created_at) values($1,$2,'incoming','5511999990000','Oi','entrada',$3,now()-interval '10 minutes'),($1,$2,'outgoing','5511999990000','Olá','saida',$3,now()-interval '5 minutes')",
    [w, account, lead.id],
  );
  await db.query(
    "update agency_workspace_leads set attributes=$2 where id=$1",
    [lead.id, { gclid: "fixture_click" }],
  );
  await as(owner);
  const metric = (
    await db.query(
      "select agency_workspace_conversation_metrics($1,now()-interval '1 day',now()) m",
      [w],
    )
  ).rows[0].m;
  assert.equal(metric.conversations, 1);
  assert.equal(metric.google, 1);
  assert.equal(metric.waiting, 0);
  assert.equal(metric.answered, 1);
  assert.equal(metric.avg_seconds, 300);
  assert.equal(metric.daily.length, 1);
  await as(other);
  await assert.rejects(
    db.query(
      "select agency_workspace_conversation_metrics($1,now()-interval '1 day',now())",
      [w],
    ),
  );

  await db.exec("reset role");
  await db.query(
    "update agency_workspace_stages set create_meeting_task=true,meeting_due_minutes=60,probability=50 where id=$1",
    [stages[1].id],
  );
  await as(owner);
  await db.query("update agency_workspace_leads set stage_id=$1 where id=$2", [
    stages[1].id,
    lead.id,
  ]);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from agency_workspace_tasks where lead_id=$1 and title like 'Reunião:%'",
        [lead.id],
      )
    ).rows[0].n,
    1,
  );
  await db.query("update agency_workspace_leads set stage_id=$1 where id=$2", [
    stages[1].id,
    lead.id,
  ]);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from agency_workspace_tasks where lead_id=$1 and title like 'Reunião:%'",
        [lead.id],
      )
    ).rows[0].n,
    1,
  );
  await db.close();
  console.log(
    "PASS CRM defaults, folder isolation, audit/undo conflicts, denied access, UTM conditions and server validation",
  );
} catch (e) {
  console.error(e);
  process.exit(1);
}
