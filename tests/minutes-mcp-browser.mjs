import { chromium } from "playwright";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createMcpHandler } from "../supabase/functions/_shared/central-mcp.ts";
export async function verifyMcpBrowser(db, owner, client, workspace) {
  let queue = Promise.resolve();
  const run = (role, fn) => {
    const next = queue.then(async () => {
      await db.exec("reset role;set role " + role);
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        role === "authenticated" ? owner : "",
      ]);
      return fn();
    });
    queue = next.catch(() => {});
    return next;
  };
  const rpc = async (name, args = {}) => {
    try {
      const keys = Object.keys(args);
      assert(/^[a-z_]+$/.test(name) && keys.every((k) => /^[a-z_]+$/.test(k)));
      const r = await run("service_role", () =>
        db.query(
          `select public.${name}(${keys.map((k, i) => `${k}=>$${i + 1}`).join(",")}) result`,
          keys.map((k) =>
            typeof args[k] === "object" &&
            !Array.isArray(args[k]) &&
            args[k] !== null
              ? JSON.stringify(args[k])
              : args[k],
          ),
        ),
      );
      return { data: r.rows[0].result, error: null };
    } catch (e) {
      return { data: null, error: { message: e.message } };
    }
  };
  const origin = process.env.TEST_APP_URL || "http://localhost:8081",
    resource = origin + "/mcp";
  const handler = createMcpHandler(
    { rpc },
    async () => ({ id: owner, confirmed: true, central: true }),
    origin,
  );
  const jsonPost = (route, body) =>
    handler(
      new Request(origin + "/mcp?route=" + route, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  const challengeResponse = await jsonPost("mcp", {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "test", version: "1" },
    },
  });
  assert.equal(challengeResponse.status, 401);
  assert(
    challengeResponse.headers
      .get("WWW-Authenticate")
      .includes("/.well-known/oauth-protected-resource/mcp"),
  );
  const metadata = await (
    await handler(new Request(origin + "/mcp?route=resource"))
  ).json();
  assert.equal(metadata.resource, resource);
  assert.equal(
    (
      await jsonPost("register", {
        client_name: "Invalid",
        redirect_uris: ["http://untrusted.example.invalid/callback"],
      })
    ).status,
    400,
  );
  const clientRegistration = await (
    await jsonPost("register", {
      client_name: "Ferramenta de teste MCP",
      redirect_uris: ["https://client.example.invalid/callback"],
      token_endpoint_auth_method: "none",
    })
  ).json();
  assert(clientRegistration.client_id);
  const verifier = "v".repeat(64),
    challenge = createHash("sha256").update(verifier).digest("base64url");
  const params = {
    client_id: clientRegistration.client_id,
    redirect_uri: "https://client.example.invalid/callback",
    response_type: "code",
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource,
    state: "state-must-return",
    scope: "crm:read crm:write tasks:read tasks:write",
  };
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/usr/bin/chromium",
    args: process.env.TEST_APP_URL ? ["--ignore-certificate-errors"] : [],
  });
  const context = await browser.newContext({
    ignoreHTTPSErrors: !!process.env.TEST_APP_URL,
  });
  const errors = [];
  let callback;
  const user = {
    id: owner,
    email: "agency-owner@example.invalid",
    aud: "authenticated",
    role: "authenticated",
    app_metadata: {},
    user_metadata: { full_name: "Responsável da Agência" },
  };
  await context.routeWebSocket("**", (ws) => ws.close());
  await context.addInitScript((user) => {
    const session = {
      access_token:
        "eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjQxMDI0NDQ4MDAsInN1YiI6ImZpeHR1cmUifQ.fixture",
      refresh_token: "fixture",
      expires_at: 4102444800,
      token_type: "bearer",
      user,
    };
    for (const ref of ["ffvmmnzvmjiddqtywkko", "dycyskikaljvokaxsxnh"])
      localStorage.setItem(
        "sb-" + ref + "-auth-token",
        JSON.stringify(session),
      );
  }, user);
  await context.route("https://client.example.invalid/**", async (route) => {
    callback = new URL(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<h1>Autorização recebida</h1>",
    });
  });
  await context.route("https://*.supabase.co/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      name = url.pathname.split("/").pop(),
      body = request.postDataJSON();
    const reply = (value, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(value),
      });
    try {
      if (url.pathname.includes("/auth/")) return reply(user);
      if (url.pathname.includes("/functions/v1/central-mcp")) {
        const response = await handler(
          new Request(url, {
            method: request.method(),
            headers: request.headers(),
            body: request.postData(),
          }),
        );
        return route.fulfill({
          status: response.status,
          contentType: "application/json",
          body: await response.text(),
        });
      }
      if (url.pathname.includes("/functions/")) return reply({});
      if (name === "agency_login_access")
        return reply({
          central_allowed: true,
          workspaces: [],
          invitation_path: null,
        });
      if (name === "agency_central_access") return reply(true);
      if (name === "agency_mcp_connections") {
        const r = await run("authenticated", () =>
          db.query("select agency_mcp_connections($1) result", [
            body.p_revoke || null,
          ]),
        );
        return reply(r.rows[0].result);
      }
      if (name === "profiles")
        return reply([
          { user_id: owner, onboarding_completed: true, notif_config: {} },
        ]);
      if (
        [
          "clients",
          "agency_client_meeting_minutes",
          "agency_client_workspaces",
        ].includes(name)
      ) {
        const args = [],
          where = [];
        for (const [key, value] of url.searchParams) {
          if (/^[a-z_]+$/.test(key) && value.startsWith("eq.")) {
            args.push(value.slice(3));
            where.push(`${key}=$${args.length}`);
          }
        }
        const clause = where.length ? " where " + where.join(" and ") : "";
        let r;
        if (request.method() === "GET")
          r = await run("authenticated", () =>
            db.query(`select * from ${name}${clause}`, args),
          );
        else if (request.method() === "POST") {
          const keys = Object.keys(body);
          assert(keys.every((k) => /^[a-z_]+$/.test(k)));
          r = await run("authenticated", () =>
            db.query(
              `insert into ${name}(${keys.join(",")}) values(${keys.map((_, i) => "$" + (i + 1)).join(",")}) returning *`,
              keys.map((k) => body[k]),
            ),
          );
        } else if (request.method() === "PATCH") {
          const keys = Object.keys(body);
          assert(keys.every((k) => /^[a-z_]+$/.test(k)));
          const shifted = clause.replace(
            /\$(\d+)/g,
            (_, n) => "$" + (Number(n) + keys.length),
          );
          r = await run("authenticated", () =>
            db.query(
              `update ${name} set ${keys.map((k, i) => `${k}=$${i + 1}`).join(",")}${shifted} returning *`,
              [...keys.map((k) => body[k]), ...args],
            ),
          );
        } else throw Error("Unexpected table mutation");
        return reply(
          request.headers().accept?.includes("vnd.pgrst.object")
            ? r.rows[0] || null
            : r.rows,
        );
      }
      return reply([]);
    } catch (e) {
      errors.push(e.message);
      return reply({ message: e.message }, 400);
    }
  });
  try {
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    const base = process.env.TEST_APP_URL || "http://localhost:8081";
    await page.goto(base + "/clientes/" + client);
    await page
      .getByRole("button", { name: "Atas de reuniões", exact: true })
      .click();
    await page.getByRole("button", { name: "Nova ata", exact: true }).click();
    await page
      .getByLabel("Título da reunião", { exact: true })
      .fill("Ata escrita na ficha do cliente");
    await page
      .getByLabel("Participantes", { exact: true })
      .fill("Agência e cliente");
    await page
      .getByLabel("Pauta e assuntos discutidos", { exact: true })
      .fill("Planejamento da campanha");
    await page.getByLabel("Decisões", { exact: true }).fill("Aprovar briefing");
    await page.getByRole("button", { name: "Salvar ata", exact: true }).click();
    await page.getByText(/Ata escrita na ficha do cliente ·/).waitFor();
    const saved = await run("authenticated", () =>
      db.query(
        "select * from agency_client_meeting_minutes where client_id=$1 and title='Ata escrita na ficha do cliente'",
        [client],
      ),
    );
    assert.equal(saved.rows.length, 1);
    assert.equal(saved.rows[0].decisions, "Aprovar briefing");
    await page.goto(base + "/configuracoes/mcp");
    await page.getByLabel("URL do servidor MCP", { exact: true }).waitFor();
    await page
      .getByText("Conectar com token de acesso", { exact: true })
      .click();
    await page
      .getByLabel("Nome da conexão", { exact: true })
      .fill("Cliente MCP padrão");
    await page
      .getByRole("button", { name: "Gerar token MCP", exact: true })
      .click();
    const token = page.getByLabel("Token privado — copie agora", {
      exact: true,
    });
    await token.waitFor();
    const access = await token.inputValue();
    assert(access.startsWith("cdg_pat_"));
    const { Client } = await import(
      "@modelcontextprotocol/sdk/client/index.js"
    );
    const { StreamableHTTPClientTransport } = await import(
      "@modelcontextprotocol/sdk/client/streamableHttp.js"
    );
    const standard = new Client({
      name: "central-standard-client-test",
      version: "1.0.0",
    });
    await standard.connect(
      new StreamableHTTPClientTransport(new URL(resource), {
        fetch: (input, init) => handler(new Request(input, init)),
        requestInit: { headers: { Authorization: "Bearer " + access } },
      }),
    );
    const tools = await standard.listTools();
    assert(tools.tools.some((t) => t.name === "list_clients"));
    assert(!tools.tools.some((t) => t.name === "create_lead"));
    const listed = await standard.callTool({
      name: "list_clients",
      arguments: {},
    });
    assert.equal(listed.isError, false);
    assert(JSON.stringify(listed.structuredContent).includes(client));
    await page
      .getByRole("button", {
        name: "Revogar acesso de Cliente MCP padrão",
        exact: true,
      })
      .click();
    await page
      .getByText(
        "Conexão revogada. A ferramenta não poderá mais acessar os dados.",
        { exact: true },
      )
      .waitFor();
    await assert.rejects(standard.listTools());
    await standard.close();
    await page.goto(base + "/mcp/authorize?" + new URLSearchParams(params));
    await page
      .getByRole("heading", {
        name: "Autorizar Ferramenta de teste MCP",
        exact: true,
      })
      .waitFor();
    await page.getByLabel("Conta da agência", { exact: true }).uncheck();
    await page.getByLabel("MCP autorizada", { exact: true }).check();
    await page
      .getByLabel("Criar leads e mudar etapas", { exact: true })
      .check();
    await page
      .getByRole("button", { name: "Autorizar conexão", exact: true })
      .click();
    await page.waitForURL("https://client.example.invalid/callback?**");
    assert(callback, "OAuth callback must be intercepted by the test client");
    assert.equal(callback.searchParams.get("state"), params.state);
    const exchange = await jsonPost("token", {
      grant_type: "authorization_code",
      client_id: params.client_id,
      redirect_uri: params.redirect_uri,
      resource,
      code: callback.searchParams.get("code"),
      code_verifier: verifier,
    });
    assert.equal(exchange.status, 200);
    const oauth = await exchange.json();
    const scoped = new Client({ name: "scoped-client", version: "1.0.0" });
    await scoped.connect(
      new StreamableHTTPClientTransport(new URL(resource), {
        fetch: (input, init) => handler(new Request(input, init)),
        requestInit: {
          headers: { Authorization: "Bearer " + oauth.access_token },
        },
      }),
    );
    const contexts = await scoped.callTool({
      name: "list_contexts",
      arguments: {},
    });
    const allowed = contexts.structuredContent.result;
    assert.equal(allowed.agency, false);
    assert.deepEqual(
      allowed.subaccounts.map((x) => x.id),
      [workspace],
    );
    const request = randomUUID();
    const stage = (
      await run("authenticated", () =>
        db.query(
          "select id from agency_workspace_stages where workspace_id=$1 limit 1",
          [workspace],
        ),
      )
    ).rows[0].id;
    const created = await scoped.callTool({
      name: "create_lead",
      arguments: {
        workspace_id: workspace,
        stage_id: stage,
        name: "Lead do cliente MCP padrão",
        request_id: request,
      },
    });
    assert.equal(created.isError, false);
    const retry = await scoped.callTool({
      name: "create_lead",
      arguments: {
        workspace_id: workspace,
        stage_id: stage,
        name: "Lead do cliente MCP padrão",
        request_id: request,
      },
    });
    assert.equal(
      created.structuredContent.result.id,
      retry.structuredContent.result.id,
    );
    const outside = await scoped.callTool({
      name: "list_leads",
      arguments: {},
    });
    assert.equal(outside.isError, true);
    await scoped.close();
    assert.deepEqual(errors, []);
    console.log(
      "PASS minutes + MCP browser/standard SDK: client minutes persisted, one-time manual token, initialize/list/call interoperability, immediate revoke, explicit OAuth consent + PKCE, selected subaccount only and idempotent CRM write",
    );
  } finally {
    await browser.close();
  }
}
