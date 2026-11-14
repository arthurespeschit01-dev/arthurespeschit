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
  await db.exec(await readFile(new URL('../supabase/migrations/20261114011614_workspace_action_cancellation_guards.sql',import.meta.url),'utf8'));
  const as = async (id) => {
    await db.exec("reset role;set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  };
  await as(owner);
  const w = (
    await db.query("select agency_workspace_create('Empresa A','') id")
  ).rows[0].id;
  const stages = (
    await db.query(
      "select * from agency_workspace_stages where workspace_id=$1 order by position",
      [w],
    )
  ).rows;
  const form = (
    await db.query(
      "insert into agency_workspace_forms(workspace_id,title,fields,pipeline_id,stage_id) values($1,'Captação',$2,$3,$4) returning *",
      [
        w,
        JSON.stringify([
          { id: "name", label: "Nome", type: "text", required: true },
          { id: "phone", label: "WhatsApp", type: "tel", required: true },
        ]),
        stages[0].pipeline_id,
        stages[0].id,
      ],
    )
  ).rows[0];
  const req = randomUUID(),
    answers = {
      name: { label: "Nome", value: "Carla" },
      phone: { label: "WhatsApp", value: "5511999990000" },
    };
  await db.exec("reset role;set role service_role");
  await db.query("select agency_workspace_submit_form($1,$2,$3)", [
    form.token,
    req,
    JSON.stringify(answers),
  ]);
  await db.query("select agency_workspace_submit_form($1,$2,$3)", [
    form.token,
    req,
    JSON.stringify(answers),
  ]);
  await db.query("select agency_workspace_submit_form($1,$2,$3)", [
    form.token,
    randomUUID(),
    JSON.stringify(answers),
  ]);
  await db.exec("reset role");
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from agency_workspace_form_submissions",
      )
    ).rows[0].n,
    2,
  );
  assert.equal(
    (await db.query("select count(*)::int n from agency_workspace_leads"))
      .rows[0].n,
    1,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from agency_workspace_events where event_type='form_submitted'",
      )
    ).rows[0].n,
    2,
  );

  // The default form starts a durable, idempotent internal automation.
  await db.exec("reset role;set role service_role");
  const defaultForm = (
    await db.query(
      "select * from agency_workspace_forms where workspace_id=$1 and title='Captação de contatos'",
      [w],
    )
  ).rows[0];
  await db.query("select agency_workspace_submit_form($1,$2,$3)", [
    defaultForm.token,
    randomUUID(),
    JSON.stringify(answers),
  ]);
  await db.query("select agency_workspace_process_due($1)", [w]);
  await db.exec("reset role");
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from agency_workspace_flow_runs where status='completed'",
      )
    ).rows[0].n,
    1,
  );
  assert.equal(
    (await db.query("select count(*)::int n from agency_workspace_tasks"))
      .rows[0].n,
    1,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from agency_workspace_notifications",
      )
    ).rows[0].n,
    1,
  );
  assert.deepEqual(
    (await db.query("select tags from agency_workspace_leads")).rows[0].tags,
    ["Formulário"],
  );
  await db.query("select agency_workspace_process_due($1)", [w]);
  assert.equal(
    (await db.query("select count(*)::int n from agency_workspace_tasks"))
      .rows[0].n,
    1,
  );
  // Manual bookings capture CRM contacts and reject overlapping appointments transactionally.
  await as(owner);
  const cal = (
    await db.query(
      "select * from agency_workspace_calendars where workspace_id=$1",
      [w],
    )
  ).rows[0];
  const start = new Date(Date.now() + 3 * 86400000).toISOString(),
    end = new Date(Date.parse(start) + 30 * 60000).toISOString();
  await db.query(
    "insert into agency_workspace_appointments(workspace_id,calendar_id,name,phone,starts_at,ends_at) values($1,$2,'Agendada','5511988887777',$3,$4)",
    [w, cal.id, start, end],
  );
  await assert.rejects(() =>
    db.query(
      "insert into agency_workspace_appointments(workspace_id,calendar_id,name,phone,starts_at,ends_at) values($1,$2,'Conflito','5511988886666',$3,$4)",
      [w, cal.id, start, end],
    ),
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from agency_workspace_appointments",
      )
    ).rows[0].n,
    1,
  );
  // Malicious loops cannot be activated.
  await assert.rejects(() =>
    db.query(
      "insert into agency_workspace_flows(workspace_id,name,enabled,definition) values($1,'Loop',true,$2)",
      [
        w,
        JSON.stringify({
          nodes: [
            { id: "a", type: "trigger", data: { event: "lead_created" } },
            { id: "b", type: "notify", data: { text: "x" } },
            { id: "c", type: "notify", data: { text: "y" } },
          ],
          edges: [
            { id: "1", source: "a", target: "b" },
            { id: "2", source: "b", target: "c" },
            { id: "3", source: "c", target: "b" },
          ],
        }),
      ],
    ),
  );
  // Own-account message isolation, webhook idempotence, and no browser credential access.
  await db.exec("reset role;set role service_role");
  await db.query("select agency_workspace_connection($1,'whatsapp',$2)", [
    w,
    JSON.stringify({
      instance_id: "isolated-fixture",
      token: "synthetic-secret",
      pipeline_id: stages[0].pipeline_id,
      stage_id: stages[0].id,
    }),
  ]);
  const account = (
    await db.query(
      "insert into agency_workspace_whatsapp_accounts(workspace_id,phone) values($1,'5511777770000') returning id",
      [w],
    )
  ).rows[0].id;
  await db.query("select agency_workspace_connection($1,'whatsapp',$2)", [
    w,
    JSON.stringify({ enabled: true, active_account_id: account }),
  ]);
  const event = {
    phone: "5511666660000",
    providerId: "provider-fixture",
    isGroup: false,
    direction: "saida",
    contactName: "Telefone",
    body: "Mensagem enviada no telefone",
    kind: "texto",
  };
  await db.query("select agency_workspace_ingest_message($1,$2,$3)", [
    w,
    account,
    JSON.stringify(event),
  ]);
  await db.query("select agency_workspace_ingest_message($1,$2,$3)", [
    w,
    account,
    JSON.stringify(event),
  ]);
  assert.equal(
    (await db.query("select count(*)::int n from agency_workspace_messages"))
      .rows[0].n,
    1,
  );
  await as(owner);
  await assert.rejects(() =>
    db.query("select * from agency_private.workspace_whatsapp"),
  );
  await assert.rejects(() =>
    db.query("select agency_workspace_connection($1,'whatsapp')", [w]),
  );

  await as(owner);
  const invite = (
    await db.query(
      "insert into agency_workspace_invitations(workspace_id,email,display_name,role) values($1,'member@example.invalid','Atendente','agent') returning *",
      [w],
    )
  ).rows[0];
  await as(other);
  await assert.rejects(() =>
    db.query("select agency_workspace_accept_invite($1)", [invite.token]),
  );
  await as(member);
  assert.equal(
    (
      await db.query("select agency_workspace_accept_invite($1) w", [
        invite.token,
      ])
    ).rows[0].w,
    w,
  );
  assert.equal(
    (await db.query("select agency_pilot_status() enabled")).rows[0].enabled,
    true,
  );
  assert.equal(
    (await db.query("select count(*)::int n from agency_workspace_leads"))
      .rows[0].n,
    3,
  );
  await assert.rejects(() =>
    db.query(
      "insert into agency_workspace_forms(workspace_id,title,fields,pipeline_id,stage_id) values($1,'Forbidden',$2,$3,$4)",
      [
        w,
        JSON.stringify([{ id: "name", label: "Nome" }]),
        stages[0].pipeline_id,
        stages[0].id,
      ],
    ),
  );
  await as(other);
  assert.equal(
    (await db.query("select count(*)::int n from agency_workspace_leads"))
      .rows[0].n,
    0,
  );
  await as(owner);
  await db.query("select agency_workspace_manage_member($1,$2,null)", [
    w,
    member,
  ]);
  await as(member);
  assert.equal(
    (await db.query("select agency_pilot_status() enabled")).rows[0].enabled,
    false,
  );
  await db.exec("reset role");
  // Conditions, timers, graph snapshots and later CRM/assignment actions run without a browser.
  await as(owner);
  const timedGraph = {
    nodes: [
      { id: "t", type: "trigger", data: { event: "lead_created" } },
      {
        id: "c",
        type: "condition",
        data: {
          match: "all",
          rules: [{ field: "value", operator: "greater_than", value: "50" }],
        },
      },
      { id: "w", type: "wait", data: { minutes: 1 } },
      { id: "m", type: "move_stage", data: { stage_id: stages[3].id } },
      { id: "a", type: "assign_user", data: { user_id: owner } },
      { id: "g", type: "add_tags", data: { tags: ["Qualificado"] } },
    ].map((n, i) => ({ ...n, position: { x: 100, y: 100 + i * 120 } })),
    edges: [
      { id: "1", source: "t", target: "c" },
      { id: "2", source: "c", target: "w", branch: "yes" },
      { id: "3", source: "w", target: "m" },
      { id: "4", source: "m", target: "a" },
      { id: "5", source: "a", target: "g" },
    ],
  };
  const timedFlow = (
    await db.query(
      "insert into agency_workspace_flows(workspace_id,name,enabled,definition) values($1,'Qualificação com espera',true,$2) returning id",
      [w, JSON.stringify(timedGraph)],
    )
  ).rows[0].id;
  const timedLead = (
    await db.query(
      "insert into agency_workspace_leads(workspace_id,pipeline_id,stage_id,name,value) values($1,$2,$3,'Oportunidade qualificada',100) returning id",
      [w, stages[0].pipeline_id, stages[0].id],
    )
  ).rows[0].id;
  await db.exec("reset role;set role service_role");
  await db.query("select agency_workspace_process_due($1)", [w]);
  let timedRun = (
    await db.query(
      "select * from agency_workspace_flow_runs where flow_id=$1",
      [timedFlow],
    )
  ).rows[0];
  assert.equal(timedRun.status, "waiting");
  await as(owner);
  await db.query(
    "update agency_workspace_flows set definition=$2 where id=$1",
    [
      timedFlow,
      JSON.stringify({
        ...timedGraph,
        nodes: timedGraph.nodes.map((n) =>
          n.id === "g" ? { ...n, data: { tags: ["Nova versão"] } } : n,
        ),
      }),
    ],
  );
  await db.exec("reset role");
  await db.query(
    "update agency_workspace_flow_runs set next_run_at=now()-interval '1 second' where id=$1",
    [timedRun.id],
  );
  await db.exec("set role service_role");
  await db.query("select agency_workspace_process_due($1)", [w]);
  timedRun = (
    await db.query("select * from agency_workspace_flow_runs where id=$1", [
      timedRun.id,
    ])
  ).rows[0];
  assert.equal(timedRun.status, "completed");
  const qualified = (
    await db.query("select * from agency_workspace_leads where id=$1", [
      timedLead,
    ])
  ).rows[0];
  assert.equal(qualified.stage_id, stages[3].id);
  assert.equal(qualified.assignee_user_id, owner);
  assert.deepEqual(qualified.tags, ["Qualificado"]);
  // The outgoing provider call is simulated at the DB boundary; no network message is sent.
  const outbound = (
    await db.query(
      "insert into agency_workspace_message_outbox(workspace_id,phone,body,request_id) values($1,'5511444440000','Teste local',$2) returning id",
      [w, randomUUID()],
    )
  ).rows[0].id;
  const claimed = (
    await db.query("select agency_workspace_claim_message($1) m", [w])
  ).rows[0].m;
  assert.equal(claimed.id, outbound);
  assert.equal(
    (await db.query("select agency_workspace_claim_message($1) m", [w])).rows[0]
      .m,
    null,
  );
  await db.query(
    "select agency_workspace_finish_message($1,'sent','local-provider-confirmation')",
    [outbound],
  );
  await db.query(
    "select agency_workspace_finish_message($1,'sent','local-provider-confirmation')",
    [outbound],
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from agency_workspace_messages where provider_id='local-provider-confirmation'",
      )
    ).rows[0].n,
    1,
  );
  await as(owner);
  const replyGraph = {
    nodes: [
      { id: "t", type: "trigger", data: { event: "lead_created" } },
      { id: "wait", type: "wait_response", data: { minutes: 1 } },
      { id: "yes", type: "notify", data: { text: "Contato respondeu" } },
      { id: "no", type: "notify", data: { text: "Prazo sem resposta" } },
    ].map((n, i) => ({ ...n, position: { x: 100, y: i * 160 } })),
    edges: [
      { id: "1", source: "t", target: "wait" },
      { id: "2", source: "wait", target: "yes", branch: "yes" },
      { id: "3", source: "wait", target: "no", branch: "no" },
    ],
  };
  const replyFlow = (
    await db.query(
      "insert into agency_workspace_flows(workspace_id,name,enabled,definition) values($1,'Aguardar resposta',true,$2) returning id",
      [w, JSON.stringify(replyGraph)],
    )
  ).rows[0].id;
  const replyLead = (
    await db.query(
      "insert into agency_workspace_leads(workspace_id,pipeline_id,stage_id,name,phone) values($1,$2,$3,'Contato da espera','5511333330000') returning id",
      [w, stages[0].pipeline_id, stages[0].id],
    )
  ).rows[0].id;
  await db.exec("reset role;set role service_role");
  await db.query("select agency_workspace_process_due($1)", [w]);
  let replyRun = (
    await db.query(
      "select * from agency_workspace_flow_runs where flow_id=$1 and event_id in (select id from agency_workspace_events where lead_id=$2)",
      [replyFlow, replyLead],
    )
  ).rows[0];
  assert.equal(replyRun.status, "waiting");
  assert.equal(replyRun.cursor, "wait");
  await db.query("select agency_workspace_ingest_message($1,$2,$3)", [
    w,
    account,
    JSON.stringify({
      phone: "5511333330000",
      providerId: "response-after-wait",
      isGroup: false,
      direction: "entrada",
      contactName: "Contato da espera",
      body: "Respondi",
      kind: "texto",
    }),
  ]);
  await db.query("select agency_workspace_process_due($1)", [w]);
  replyRun = (
    await db.query("select * from agency_workspace_flow_runs where id=$1", [
      replyRun.id,
    ])
  ).rows[0];
  assert.equal(replyRun.status, "completed");
  assert.equal(
    (
      await db.query(
        "select detail from agency_workspace_flow_steps where run_id=$1 and node_id='wait'",
        [replyRun.id],
      )
    ).rows[0].detail,
    "yes",
  );
  await as(owner);
  const splitGraph = {
    nodes: [
      { id: "t", type: "trigger", data: { event: "lead_created" } },
      {
        id: "s",
        type: "split",
        data: {
          branches: [
            { id: "a", weight: 20, label: "A" },
            { id: "b", weight: 30, label: "B" },
            { id: "c", weight: 50, label: "C" },
          ],
        },
      },
      ...["a", "b", "c"].map((id) => ({
        id,
        type: "notify",
        data: { text: "Caminho " + id },
      })),
    ].map((n, i) => ({ ...n, position: { x: 100, y: i * 140 } })),
    edges: [
      { id: "t-s", source: "t", target: "s" },
      ...["a", "b", "c"].map((id) => ({
        id: "s-" + id,
        source: "s",
        target: id,
        branch: id,
      })),
    ],
  };
  const splitFlow = (
    await db.query(
      "insert into agency_workspace_flows(workspace_id,name,enabled,definition) values($1,'Divisão em três',true,$2) returning id",
      [w, JSON.stringify(splitGraph)],
    )
  ).rows[0].id;
  await db.query(
    "insert into agency_workspace_leads(workspace_id,pipeline_id,stage_id,name) values($1,$2,$3,'Lead da divisão')",
    [w, stages[0].pipeline_id, stages[0].id],
  );
  await db.exec("reset role;set role service_role");
  await db.query("select agency_workspace_process_due($1)", [w]);
  const splitRun = (
    await db.query(
      "select * from agency_workspace_flow_runs where flow_id=$1",
      [splitFlow],
    )
  ).rows[0];
  assert.equal(splitRun.status, "completed");
  const splitStep = (
    await db.query(
      "select detail from agency_workspace_flow_steps where run_id=$1 and node_id='s'",
      [splitRun.id],
    )
  ).rows[0];
  assert(["a", "b", "c"].includes(splitStep.detail));
  await as(owner);
  const rule = (
    await db.query(
      "insert into agency_workspace_conversion_rules(workspace_id,name,provider,event_name,trigger_type,stage_id,enabled) values($1,'Contato qualificado','meta','Lead','stage_changed',$2,true) returning id",
      [w, stages[1].id],
    )
  ).rows[0];
  await db.query("update agency_workspace_leads set stage_id=$2 where id=$1", [
    replyLead,
    stages[1].id,
  ]);
  await db.exec("reset role");
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from agency_workspace_action_outbox where rule_id=$1",
        [rule.id],
      )
    ).rows[0].n,
    1,
  );
  await as(other);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from agency_workspace_action_outbox",
      )
    ).rows[0].n,
    0,
  );
  await assert.rejects(() =>
    db.query("select agency_workspace_provider($1,'meta')", [w]),
  );
  await db.exec("reset role");
  await as(owner);
  await db.query(
    "update agency_client_workspaces set status='archived' where id=$1",
    [w],
  );
  await assert.rejects(() =>
    db.query(
      "insert into agency_workspace_leads(workspace_id,pipeline_id,stage_id,name) values($1,$2,$3,'Forbidden')",
      [w, stages[0].pipeline_id, stages[0].id],
    ),
  );
  await db.exec("reset role");
  await db.close();
  console.log(
    "PASS forms→CRM dedupe/events and workspace-only invited team access, revocation and foreign-account denial",
  );
} catch (e) {
  console.error(
    "TEST_ERROR",
    e.message,
    e.code,
    "position",
    e.position,
    "where",
    e.where,
  );
  process.exit(1);
}
