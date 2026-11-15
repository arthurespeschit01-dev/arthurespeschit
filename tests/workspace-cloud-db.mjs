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

  await db.exec("reset role");
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/20261115223409_workspace_whatsapp_cloud_transport.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/20261115225048_workspace_whatsapp_optout_addresses.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.query(
    "insert into public.agency_whatsapp_connections(instance_id) values('legacy-preserved')",
  );
  await db.exec("set role service_role");
  const call = async (name, args) =>
    (
      await db.query(
        `select public.${name}(${args.map((_, i) => "$" + (i + 1)).join(",")}) result`,
        args,
      )
    ).rows[0].result;
  await call("agency_workspace_connection", [
    w,
    "whatsapp",
    JSON.stringify({
      instance_id: "fixture-exclusive",
      token: "fixture-token",
      pipeline_id: stages[0].pipeline_id,
      stage_id: stages[0].id,
    }),
  ]);
  const baseline = await call("agency_workspace_connection", [
    w,
    "whatsapp",
    null,
  ]);
  assert.equal(baseline.transport, "wapi");
  assert.equal(baseline.instance_id, "fixture-exclusive");
  const session = await call("agency_workspace_cloud_signup", [
    w,
    owner,
    "new_number",
    null,
  ]);
  await assert.rejects(() =>
    call("agency_workspace_cloud_signup", [
      w,
      other,
      "new_number",
      session.nonce,
    ]),
  );
  assert.equal(
    (
      await call("agency_workspace_cloud_signup", [
        w,
        owner,
        "new_number",
        session.nonce,
      ])
    ).nonce,
    session.nonce,
  );
  await assert.rejects(() =>
    call("agency_workspace_cloud_signup", [
      w,
      owner,
      "new_number",
      session.nonce,
    ]),
  );
  const expired = await call("agency_workspace_cloud_signup", [
    w,
    owner,
    "business_app",
    null,
  ]);
  await db.exec("reset role");
  await db.query(
    "update agency_private.workspace_cloud_signup set expires_at=now()-interval '1 second' where nonce=$1",
    [expired.nonce],
  );
  await db.exec("set role service_role");
  await assert.rejects(() =>
    call("agency_workspace_cloud_signup", [
      w,
      owner,
      "business_app",
      expired.nonce,
    ]),
  );
  await call("agency_workspace_connection", [
    w,
    "whatsapp",
    JSON.stringify({ enabled: true }),
  ]);
  const pair = await call("agency_workspace_pair_link", [w, null]);
  assert.equal(
    (await call("agency_workspace_pair_link", [null, pair.token])).workspace_id,
    w,
  );
  const renewed = await call("agency_workspace_pair_link", [w, null]);
  assert.equal(
    await call("agency_workspace_pair_link", [null, pair.token]),
    null,
  );
  await db.exec("reset role");
  await db.query(
    "update agency_private.workspace_whatsapp_pair_links set expires_at=now()-interval '1 second' where token=$1",
    [renewed.token],
  );
  await db.exec("set role service_role");
  assert.equal(
    await call("agency_workspace_pair_link", [null, renewed.token]),
    null,
  );
  const values = {
    waba_id: "123456789",
    phone_number_id: "987654321",
    token: "fixture-cloud-token-1234567890",
    pipeline_id: stages[0].pipeline_id,
    stage_id: stages[0].id,
    coexistence: true,
    pin: "123456",
  };
  await assert.rejects(() =>
    call("agency_workspace_cloud_setup", [w, JSON.stringify(values)]),
  );
  await call("agency_workspace_connection", [
    w,
    "whatsapp",
    JSON.stringify({ enabled: false }),
  ]);
  const cloud = await call("agency_workspace_cloud_setup", [
    w,
    JSON.stringify(values),
  ]);
  assert.equal(cloud.transport, "cloud");
  assert.equal(cloud.enabled, false);
  assert.equal(
    await call("agency_workspace_cloud_find", [
      values.waba_id,
      values.phone_number_id,
    ]),
    null,
  );
  const account = (
    await db.query(
      "insert into agency_workspace_whatsapp_accounts(workspace_id,phone) values($1,'5511999990011') returning id",
      [w],
    )
  ).rows[0].id;
  await call("agency_workspace_connection", [
    w,
    "whatsapp",
    JSON.stringify({ enabled: true, active_account_id: account }),
  ]);
  assert.equal(
    (
      await call("agency_workspace_cloud_find", [
        values.waba_id,
        values.phone_number_id,
      ])
    ).workspace_id,
    w,
  );
  assert.equal(
    await call("agency_workspace_cloud_find", [
      "111111111",
      values.phone_number_id,
    ]),
    null,
  );
  const event = {
    providerId: "wamid.fixture",
    phone: "5511988880000",
    body: "Olá",
    direction: "entrada",
    kind: "texto",
    createdAt: new Date().toISOString(),
  };
  const message = await call("agency_workspace_ingest_message", [
    w,
    account,
    JSON.stringify(event),
  ]);
  assert.equal(
    await call("agency_workspace_ingest_message", [
      w,
      account,
      JSON.stringify(event),
    ]),
    message,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from agency_workspace_messages where provider_id='wamid.fixture'",
      )
    ).rows[0].n,
    1,
  );
  const prefs = await call("agency_workspace_whatsapp_preferences", [w, null]);
  assert.equal(prefs.optout_enabled, true);
  await assert.rejects(() =>
    call("agency_workspace_whatsapp_preferences", [
      w,
      JSON.stringify({ optout_enabled: true, phrases: [] }),
    ]),
  );
  await call("agency_workspace_whatsapp_preferences", [
    w,
    JSON.stringify({ optout_enabled: true, phrases: ["parar"] }),
  ]);
  assert.equal(
    await call("agency_workspace_whatsapp_optout", [w, event.phone, true]),
    true,
  );
  assert.equal(
    await call("agency_workspace_whatsapp_optout", [w2, event.phone, false]),
    false,
  );
  assert.equal(
    await call("agency_workspace_whatsapp_optout", [
      w,
      "123456789012345@lid",
      true,
    ]),
    true,
  );
  assert.equal(
    await call("agency_workspace_whatsapp_optout", [
      w2,
      "123456789012345@lid",
      false,
    ]),
    false,
  );
  await call("agency_workspace_connection", [
    w,
    "whatsapp",
    JSON.stringify({ enabled: false, active_account_id: null }),
  ]);
  const otherStages = (
    await db.query(
      "select * from agency_workspace_stages where workspace_id=$1 order by position",
      [w2],
    )
  ).rows;
  await assert.rejects(() =>
    call("agency_workspace_cloud_setup", [
      w2,
      JSON.stringify({
        ...values,
        pipeline_id: otherStages[0].pipeline_id,
        stage_id: otherStages[0].id,
      }),
    ]),
  );
  await call("agency_workspace_connection", [
    w,
    "whatsapp",
    JSON.stringify({
      instance_id: "another-exclusive",
      token: "fixture",
      pipeline_id: stages[0].pipeline_id,
      stage_id: stages[0].id,
    }),
  ]);
  const reset = await call("agency_workspace_connection", [
    w,
    "whatsapp",
    null,
  ]);
  assert.equal(reset.transport, "wapi");
  assert.equal(reset.cloud_phone_id, null);
  assert.equal(reset.cloud_pin, null);
  await db.exec("reset role;set role anon");
  for (const sql of [
    "select * from agency_private.workspace_whatsapp",
    "select * from agency_private.workspace_cloud_signup",
    `select public.agency_workspace_cloud_setup('${w}','{}')`,
    `select public.agency_workspace_cloud_find('123456789','987654321')`,
    `select public.agency_workspace_whatsapp_preferences('${w}',null)`,
  ])
    await assert.rejects(() => db.query(sql));
  await as(other);
  await assert.rejects(() =>
    db.query(
      "select public.agency_workspace_cloud_signup($1,$2,'new_number',null)",
      [w, other],
    ),
  );
  await db.exec("reset role");
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from public.agency_whatsapp_connections where instance_id='legacy-preserved'",
      )
    ).rows[0].n,
    1,
  );
  console.log(
    "PASS Cloud transport: one-use scoped onboarding, inactive/foreign/duplicate denial, signed-path ingestion dedup, private secrets, opt-out scope, W-API restoration, legacy preservation",
  );
} catch (e) {
  console.error(e);
  process.exit(1);
}
