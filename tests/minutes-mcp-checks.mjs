import { readFile } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import assert from "node:assert/strict";
const hash = (s) => createHash("sha256").update(s).digest("hex");
export async function verifyMcp(db, owner, other) {
  await db.exec("reset role");
  await db.exec(
    "alter table auth.users add column if not exists banned_until timestamptz",
  );
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/20261116142008_invited_workspace_access.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/20261117003329_client_minutes_mcp.sql",
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
  const client = (
    await db.query(
      "insert into clients(user_id,name) values($1,'Cliente das atas') returning id",
      [owner],
    )
  ).rows[0].id;
  const minute = (
    await db.query(
      "insert into agency_client_meeting_minutes(user_id,client_id,title,agenda) values($1,$2,'Reunião inicial','Pauta') returning *",
      [owner, client],
    )
  ).rows[0];
  await as(other);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from agency_client_meeting_minutes",
      )
    ).rows[0].n,
    0,
  );
  await assert.rejects(
    db.query(
      "insert into agency_client_meeting_minutes(user_id,client_id,title) values($1,$2,'Intrusão')",
      [other, client],
    ),
    /row-level security/,
  );
  await as(owner);
  const w = (
    await db.query("select agency_workspace_create('MCP autorizada','') id")
  ).rows[0].id;
  const denied = (
    await db.query(
      "select agency_workspace_create('MCP não selecionada','') id",
    )
  ).rows[0].id;
  await db.exec("reset role;set role service_role");
  const key = hash("manual");
  const resource = "https://app.example.invalid/mcp";
  const cid = (
    await db.query("select agency_mcp_manual($1,$2,$3,$4,true,$5,$6) id", [
      owner,
      "Teste",
      [
        "clients:read",
        "minutes:read",
        "minutes:write",
        "tasks:read",
        "tasks:write",
        "crm:read",
        "crm:write",
        "calendar:read",
      ],
      [w],
      key,
      resource,
    ])
  ).rows[0].id;
  const call = async (tool, args = {}) =>
    (
      await db.query("select agency_mcp_tool($1,$2,$3,$4) result", [
        key,
        resource,
        tool,
        JSON.stringify(args),
      ])
    ).rows[0].result;
  assert((await call("list_clients")).some((c) => c.id === client));
  assert.equal(
    (await call("get_meeting_minutes", { id: minute.id })).title,
    "Reunião inicial",
  );
  const req = randomUUID();
  const write = {
    request_id: req,
    client_id: client,
    title: "Ata pelo MCP",
    meeting_date: "2026-11-16",
    decisions: "Aprovar briefing",
  };
  const created = await call("create_meeting_minutes", write);
  assert.equal((await call("create_meeting_minutes", write)).id, created.id);
  await assert.rejects(
    call("create_meeting_minutes", { ...write, title: "Outro conteúdo" }),
    /request_id/,
  );
  assert.equal(
    (
      await call("update_meeting_minutes", {
        id: created.id,
        revision: 1,
        request_id: randomUUID(),
        title: "Ata revisada",
      })
    ).revision,
    2,
  );
  await assert.rejects(
    call("update_meeting_minutes", {
      id: created.id,
      revision: 1,
      request_id: randomUUID(),
      title: "Edição antiga",
    }),
    /alterado/,
  );
  assert.deepEqual(
    (await call("list_contexts")).subaccounts.map((x) => x.id),
    [w],
  );
  await assert.rejects(
    call("list_leads", { workspace_id: denied }),
    /Subconta não autorizada/,
  );
  const stage = (
    await db.query(
      "select id from agency_workspace_stages where workspace_id=$1 limit 1",
      [w],
    )
  ).rows[0].id;
  const lead = await call("create_lead", {
    workspace_id: w,
    stage_id: stage,
    name: "Lead MCP",
    request_id: randomUUID(),
  });
  assert(
    (await call("list_leads", { workspace_id: w })).some(
      (l) => l.id === lead.id,
    ),
  );
  const task = await call("create_task", {
    workspace_id: w,
    title: "Preparar proposta",
    lead_id: lead.id,
    request_id: randomUUID(),
  });
  assert.equal(
    (
      await call("update_task", {
        workspace_id: w,
        id: task.id,
        completed: true,
        request_id: randomUUID(),
      })
    ).completed,
    true,
  );
  const readKey = hash("read");
  await db.query("select agency_mcp_manual($1,$2,$3,$4,false,$5,$6)", [
    owner,
    "Leitura",
    ["crm:read"],
    [w],
    readKey,
    resource,
  ]);
  await assert.rejects(
    db.query("select agency_mcp_tool($1,$2,$3,$4)", [
      readKey,
      resource,
      "create_lead",
      JSON.stringify({
        workspace_id: w,
        stage_id: stage,
        name: "No",
        request_id: randomUUID(),
      }),
    ]),
    /permissão/,
  );
  await assert.rejects(
    db.query("select agency_mcp_tool($1,$2,$3,$4)", [
      readKey,
      resource,
      "list_leads",
      "{}",
    ]),
    /Informe uma subconta/,
  );
  await as(other);
  await db.query("select agency_mcp_connections($1)", [cid]);
  await db.exec("reset role;set role service_role");
  assert(
    (await db.query("select agency_mcp_principal($1,$2) p", [key, resource]))
      .rows[0].p,
    "foreign user cannot revoke",
  );
  await as(owner);
  await db.query("select agency_mcp_connections($1)", [cid]);
  await db.exec("reset role;set role service_role");
  assert.equal(
    (await db.query("select agency_mcp_principal($1,$2) p", [key, resource]))
      .rows[0].p,
    null,
  );
  const oauth = (
    await db.query("select agency_mcp_register($1,$2,$3) id", [
      "MCP client",
      ["https://client.example.invalid/callback"],
      "test-ip",
    ])
  ).rows[0].id;
  const challenge = "a".repeat(43);
  await db.query("select agency_mcp_grant($1,$2,$3,$4,$5,$6,$7,true,$8)", [
    hash("code"),
    owner,
    oauth,
    "https://client.example.invalid/callback",
    challenge,
    ["minutes:read"],
    [],
    resource,
  ]);
  let exchange = (
    await db.query("select agency_mcp_exchange($1,$2,$3,$4,$5,$6,$7,$8) r", [
      "authorization_code",
      hash("code"),
      oauth,
      "https://client.example.invalid/callback",
      "b".repeat(43),
      resource,
      hash("a1"),
      hash("r1"),
    ])
  ).rows[0].r;
  assert.equal(exchange.error, "invalid_grant");
  exchange = (
    await db.query("select agency_mcp_exchange($1,$2,$3,$4,$5,$6,$7,$8) r", [
      "authorization_code",
      hash("code"),
      oauth,
      "https://client.example.invalid/callback",
      challenge,
      resource,
      hash("a1"),
      hash("r1"),
    ])
  ).rows[0].r;
  assert.equal(exchange.scope, "minutes:read");
  assert.equal(
    (
      await db.query("select agency_mcp_exchange($1,$2,$3,$4,$5,$6,$7,$8) r", [
        "authorization_code",
        hash("code"),
        oauth,
        "https://client.example.invalid/callback",
        challenge,
        resource,
        hash("a2"),
        hash("r2"),
      ])
    ).rows[0].r.error,
    "invalid_grant",
  );
  assert(
    !(
      await db.query("select agency_mcp_exchange($1,$2,$3,$4,$5,$6,$7,$8) r", [
        "refresh_token",
        hash("r1"),
        oauth,
        "",
        "",
        resource,
        hash("a2"),
        hash("r2"),
      ])
    ).rows[0].r.error,
  );
  assert.equal(
    (
      await db.query("select agency_mcp_exchange($1,$2,$3,$4,$5,$6,$7,$8) r", [
        "refresh_token",
        hash("r1"),
        oauth,
        "",
        "",
        resource,
        hash("a3"),
        hash("r3"),
      ])
    ).rows[0].r.error,
    "invalid_grant",
  );
  assert.equal(
    (
      await db.query("select agency_mcp_principal($1,$2) p", [
        hash("a2"),
        resource,
      ])
    ).rows[0].p,
    null,
  );
  const invited = randomUUID();
  await db.exec("reset role");
  await db.query(
    "insert into auth.users(id,email) values($1,'mcp-invited@example.invalid')",
    [invited],
  );
  await db.query(
    "insert into agency_private.workspace_only_users(user_id) values($1)",
    [invited],
  );
  await as(invited);
  await assert.rejects(db.query("select agency_mcp_connections()"), /Somente/);
  await db.exec("reset role;set role service_role");
  await assert.rejects(
    db.query("select agency_mcp_manual($1,$2,$3,$4,true,$5,$6)", [
      invited,
      "No",
      ["clients:read"],
      [],
      hash("invited"),
      resource,
    ]),
    /inválidos/,
  );
  if (process.env.MCP_BROWSER) {
    const { verifyMcpBrowser } = await import("./minutes-mcp-browser.mjs");
    await verifyMcpBrowser(db, owner, client, w);
  }
  console.log(
    "PASS minutes/MCP PostgreSQL: own-client RLS, immutable ownership, scoped agency/subaccounts, write scopes, idempotency, revision conflict, OAuth PKCE/code single use, refresh replay revocation, foreign revoke denial and invitation-only creation denial",
  );
}
