import { chromium } from "playwright";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";

// Local browser → PostgREST-compatible test adapter → real PostgreSQL migrations.
// All remote API calls are intercepted. No production credentials/data are used.
const db = new PGlite();
const owner = randomUUID();
const activeClient = randomUUID();
await db.exec(`
  create role authenticated;
  create role anon;
  create role service_role bypassrls;
  create schema auth;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$select '${owner}'::uuid$$;
  create table public.clients(id uuid primary key, user_id uuid, name text, status text,
    monthly_fee numeric default 100, payment_day int default 5, phone text default '',
    account_ids jsonb default '{}', niche text default 'Teste', services text default '',
    verba_mensal numeric default 1000, contract_duration text default '', created_at timestamptz default now());
  create function public.update_updated_at_column() returns trigger language plpgsql as $$begin new.updated_at=now(); return new; end$$;
  insert into auth.users values('${owner}');
  insert into public.clients(id,user_id,name,status) values
    ('${activeClient}','${owner}','Cliente ativo de teste','Ativo'),
    ('${randomUUID()}','${owner}','Cliente pausado de teste','Pausado'),
    ('${randomUUID()}','${owner}','Cliente encerrado de teste','Encerrado');
`);
for (const name of [
  "20261111144901_agency_pipelines.sql",
  "20261111145150_agency_portal_forms.sql",
  "20261111145643_agency_calendar.sql",
  "20261111152507_agency_whatsapp.sql",
])
  await db.exec(
    await readFile(
      new URL(`../supabase/migrations/${name}`, import.meta.url),
      "utf8",
    ),
  );
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {}),
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const errors = [];
const page = await context.newPage();
page.setDefaultTimeout(15000);
page.on("pageerror", (e) => errors.push(e.message));
const user = {
  id: owner,
  email: "browser-test@example.invalid",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: { provider: "email" },
  user_metadata: {},
  created_at: new Date().toISOString(),
};
const payload = btoa(
  JSON.stringify({
    sub: owner,
    exp: Math.floor(Date.now() / 1000) + 3600,
    role: "authenticated",
  }),
);
const session = {
  access_token: `test.${payload}.test`,
  refresh_token: "test-refresh",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user,
};
await context.addInitScript((session) => {
  localStorage.setItem(
    "sb-ffvmmnzvmjiddqtywkko-auth-token",
    JSON.stringify(session),
  );
  localStorage.setItem("onboarding-tour-completed", "true");
}, session);
const response = (route, data, status = 200) =>
  route.fulfill({
    status,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*" },
    body: JSON.stringify(data),
  });
await context.route("https://backend-centraldogestor.vercel.app/**", (route) =>
  response(route, { access: true }),
);
const apiErrors = [];
await context.route("https://*.supabase.co/**", async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const body = request.postDataJSON();
  try {
    if (url.pathname.includes("/auth/v1/"))
      return response(route, url.pathname.endsWith("/user") ? user : session);
    if (url.pathname.includes("/functions/v1/")) {
      if (url.pathname.endsWith("agency-whatsapp")) {
        if (body.action === "status")
          return response(route, {
            configured: true,
            connected: false,
            instance_id: "fixture",
            receiving_enabled: true,
          });
        if (body.action === "connect")
          return response(route, {
            qrcode:
              "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lV8AAAAASUVORK5CYII=",
          });
        const card = (
          await db.query(
            "select phone,whatsapp_phone_key from agency_pipeline_cards where id=$1",
            [body.card_id],
          )
        ).rows[0];
        if (body.action === "messages")
          return response(route, {
            messages: (
              await db.query(
                "select * from agency_whatsapp_messages where user_id=$1 and phone_key=$2 order by created_at",
                [owner, card.whatsapp_phone_key],
              )
            ).rows,
          });
        if (body.action === "send") {
          await db.query(
            "insert into agency_whatsapp_messages(user_id,request_id,phone,body,direction,status) values($1,$2,$3,$4,'saida','enviado')",
            [owner, body.request_id, "55" + card.phone, body.text],
          );
          return response(route, { ok: true });
        }
        throw new Error("Unexpected WhatsApp action");
      }
      if (url.pathname.endsWith("meta-account-balances"))
        return response(route, { accounts: [] });
      return response(
        route,
        { error: "Conexão não configurada neste teste." },
        503,
      );
    }
    if (url.pathname.endsWith("/rpc/save_agency_pipeline")) {
      const result = await db.query(
        "select public.save_agency_pipeline($1,$2,$3,$4,$5::jsonb,$6::jsonb) id",
        [
          body.p_id,
          body.p_area,
          body.p_name,
          body.p_revision,
          JSON.stringify(body.p_stages),
          JSON.stringify(body.p_moves),
        ],
      );
      return response(route, result.rows[0].id);
    }
    const table = url.pathname.split("/").pop();
    if (table === "profiles")
      return response(route, [{ user_id: owner, onboarding_completed: true }]);
    if (!/^agency_[a-z_]+$/.test(table) && table !== "clients")
      return response(route, []);
    const params = [];
    const clauses = [];
    for (const [key, val] of url.searchParams.entries()) {
      if (/^[a-z_]+$/.test(key) && val.startsWith("eq.")) {
        params.push(val.slice(3));
        clauses.push(`"${key}"=$${params.length}`);
      }
    }
    const where = clauses.length ? ` where ${clauses.join(" and ")}` : "";
    let result;
    if (request.method() === "GET")
      result = await db.query(
        `select * from public."${table}"${where}`,
        params,
      );
    else if (request.method() === "POST") {
      const fields = Object.keys(body);
      assert(fields.every((k) => /^[a-z_]+$/.test(k)));
      result = await db.query(
        `insert into public."${table}" (${fields.map((k) => `"${k}"`).join(",")}) values (${fields.map((_, i) => `$${i + 1}`).join(",")}) returning *`,
        fields.map((k) =>
          typeof body[k] === "object" && body[k] !== null
            ? JSON.stringify(body[k])
            : body[k],
        ),
      );
    } else if (request.method() === "PATCH") {
      const fields = Object.keys(body);
      assert(fields.every((k) => /^[a-z_]+$/.test(k)));
      const values = fields.map((k) =>
        typeof body[k] === "object" && body[k] !== null
          ? JSON.stringify(body[k])
          : body[k],
      );
      const shifted = where.replace(
        /\$(\d+)/g,
        (_, i) => `$${Number(i) + fields.length}`,
      );
      result = await db.query(
        `update public."${table}" set ${fields.map((k, i) => `"${k}"=$${i + 1}`).join(",")}${shifted} returning *`,
        [...values, ...params],
      );
    } else throw new Error(`Unexpected method: ${request.method()}`);
    return response(
      route,
      request.headers().accept?.includes("vnd.pgrst.object")
        ? result.rows[0] || null
        : result.rows,
    );
  } catch (error) {
    apiErrors.push(error.message);
    return response(route, { message: error.message }, 400);
  }
});
try {
  const base = process.env.TEST_APP_URL || "http://localhost:8080";
  await page.goto(`${base}/comercial`, { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Nova pipeline", exact: true })
    .click();
  await page
    .getByLabel("Nome da pipeline", { exact: true })
    .fill("Vendas da agência");
  await page
    .getByRole("button", { name: "Salvar pipeline", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Editar pipeline", exact: true })
    .waitFor();
  assert.equal(await page.getByRole('button', { name: 'Conectar WhatsApp', exact: true }).count(), 0);
  assert.equal(await page.getByRole('navigation').getByRole('link', { name: 'Clientes', exact: true }).evaluate(link => link.nextElementSibling?.querySelector('button')?.getAttribute('aria-label')), 'Operações');
  await page.goto(`${base}/configuracoes`);
  await page.getByRole('button', { name: 'Configurar instância e token', exact: true }).click();
  await page.getByLabel('ID da instância', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Token da instância', { exact: true }).getAttribute('type'), 'password');
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await page
    .getByRole("button", { name: "Conectar WhatsApp", exact: true })
    .click();
  await page
    .getByRole("img", {
      name: "QR Code para conectar seu WhatsApp à Central",
      exact: true,
    })
    .waitFor();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await page.goto(`${base}/comercial`);
  await page.getByRole("button", { name: "Novo card", exact: true }).click();
  await page
    .getByLabel("Título", { exact: true })
    .fill("Oportunidade de teste");
  await page.getByLabel("Telefone", { exact: true }).fill("11999990000");
  await page.getByLabel("Valor da oportunidade (R$)").fill("1500");
  await page
    .getByLabel("Status de resposta")
    .selectOption("aguardando_agencia");
  await page.getByRole("button", { name: "Salvar card", exact: true }).click();
  await page
    .getByRole("button", { name: "Oportunidade de teste", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Editar pipeline", exact: true })
    .click();
  await page
    .getByLabel("Nome da pipeline", { exact: true })
    .fill("Vendas personalizadas");
  await page.getByLabel("Nome da etapa 2", { exact: true }).fill("Diagnóstico");
  await page
    .getByRole("button", { name: "Remover etapa 1", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Salvar pipeline", exact: true })
    .click();
  await page
    .getByText("Escolha o destino dos cards das etapas removidas.", {
      exact: true,
    })
    .waitFor();
  const destination = await page
    .getByLabel("Destino dos cards de “Novo contato”")
    .locator("option")
    .nth(1)
    .getAttribute("value");
  await page
    .getByLabel("Destino dos cards de “Novo contato”")
    .selectOption(destination);
  await page
    .getByRole("button", { name: "Salvar pipeline", exact: true })
    .click();
  await page
    .getByRole("region", { name: "Diagnóstico", exact: true })
    .getByRole("button", { name: "Oportunidade de teste", exact: true })
    .waitFor();
  assert.equal(
    (await db.query("select count(*)::int n from agency_pipeline_cards"))
      .rows[0].n,
    1,
  );
  await page
    .getByRole("button", { name: "Oportunidade de teste", exact: true })
    .click();
  await page
    .getByLabel("Mensagem WhatsApp", { exact: true })
    .fill("Mensagem simulada de teste");
  await page
    .getByRole("button", { name: "Enviar pelo WhatsApp", exact: true })
    .click();
  await page.getByText("Mensagem simulada de teste", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Salvar card", exact: true }).click();
  await page
    .getByRole("button", { name: "Oportunidade de teste", exact: true })
    .waitFor();
  assert.equal(
    (await db.query("select contact_status from agency_pipeline_cards")).rows[0]
      .contact_status,
    "aguardando_cliente",
  );
  await page.goto(`${base}/operacao`);
  await page
    .getByRole("button", { name: "Nova pipeline", exact: true })
    .click();
  await page.getByLabel("Nome da pipeline", { exact: true }).fill("Onboarding");
  await page
    .getByRole("button", { name: "Salvar pipeline", exact: true })
    .click();
  await page.getByRole("button", { name: "Novo card", exact: true }).click();
  await page.getByLabel("Cliente", { exact: true }).selectOption(activeClient);
  await page.getByRole("button", { name: "Salvar card", exact: true }).click();
  await page
    .getByRole("button", { name: "Cliente ativo de teste", exact: true })
    .waitFor();
  await page.goto(`${base}/clientes`);
  await page
    .getByRole("heading", { name: "Cliente ativo de teste", exact: true })
    .first()
    .waitFor();
  assert.equal(
    await page
      .getByRole("heading", { name: "Cliente pausado de teste", exact: true })
      .count(),
    0,
  );
  await page.getByRole("button", { name: "Pausados", exact: true }).click();
  await page
    .getByRole("heading", { name: "Cliente pausado de teste", exact: true })
    .first()
    .waitFor();
  assert.equal(
    await page
      .getByRole("heading", { name: "Cliente ativo de teste", exact: true })
      .count(),
    0,
  );
  await page.goto(`${base}/clientes/${activeClient}`);
  await page
    .getByRole("button", { name: "Criar link de chamados", exact: true })
    .click();
  await page
    .getByLabel("Link exclusivo deste cliente", { exact: true })
    .waitFor();
  const customerLink = await page
    .getByLabel("Link exclusivo deste cliente", { exact: true })
    .inputValue();
  assert.match(customerLink, /\/portal\/[a-f0-9]{64}$/);
  await page
    .getByRole("link", { name: "Ver chamados deste cliente", exact: true })
    .click();
  await page.waitForURL(`**/chamados?cliente=${activeClient}`);
  await page.waitForFunction(
    (id) =>
      document.querySelector('[aria-label="Cliente do portal"]')?.value === id,
    activeClient,
  );
  assert.equal(
    await page.getByLabel("Cliente do portal").inputValue(),
    activeClient,
  );
  await page.getByRole("button", { name: "Operações", exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Operações", exact: true })
      .getAttribute("aria-expanded"),
    "true",
  );
  for (const label of ["Chamados", "Comercial", "Relatórios", "Tarefas"])
    assert.equal(
      await page
        .getByRole("navigation")
        .getByRole("link", { name: label, exact: true })
        .count(),
      1,
    );
  assert.equal(
    await page
      .getByRole("link", { name: "Geração de Estratégia", exact: true })
      .count(),
    0,
  );
  await page.goto(`${base}/comercial`);
  await page.getByRole("tab", { name: "Formulários", exact: true }).click();
  await page
    .getByRole("button", { name: "Novo formulário", exact: true })
    .click();
  await page
    .getByLabel("Título", { exact: true })
    .fill("Briefing de onboarding");
  await page.getByLabel("Campo 1", { exact: true }).fill("Objetivo do projeto");
  await page
    .getByRole("button", { name: "Salvar formulário", exact: true })
    .click();
  await page.getByRole("heading", { name: /Briefing de onboarding/ }).waitFor();
  await page.goto(`${base}/chamados`);
  await page.getByLabel("Cliente do portal").selectOption(activeClient);

  await page
    .getByRole("button", { name: "Copiar link", exact: true })
    .waitFor();
  assert.equal(
    (await db.query("select count(*)::int n from agency_client_portals"))
      .rows[0].n,
    1,
  );
  const publicContext = await browser.newContext();
  let publicAuthRequests = 0;
  let formSent = false;
  let ticketSent = false;
  const publicPage = await publicContext.newPage();
  publicPage.setDefaultTimeout(15000);
  await publicContext.route("https://*.supabase.co/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.includes("/auth/")) {
      publicAuthRequests++;
      return response(route, {}, 401);
    }
    const body = route.request().postDataJSON();
    if (body.action === "form")
      return response(route, {
        title: "Briefing público",
        description: "Preencha seu objetivo.",
        fields: [
          { id: "goal", label: "Objetivo", type: "text", required: true },
        ],
      });
    if (body.action === "submit_form") {
      assert.equal(body.answers.goal, "Aumentar vendas");
      formSent = true;
      return response(route, { ok: true });
    }
    if (body.action === "tickets")
      return response(route, { client_name: "Cliente do portal", tickets: [] });
    if (body.action === "new_ticket") {
      assert.equal(body.category, "design");
      assert.equal(body.title, "Novo criativo");
      ticketSent = true;
      return response(route, { id: "test-ticket" });
    }
    throw new Error("Unexpected public request");
  });
  await publicPage.goto(`${base}/formulario/${"a".repeat(64)}`, {
    waitUntil: "domcontentloaded",
  });
  await publicPage
    .getByLabel("Objetivo *", { exact: true })
    .fill("Aumentar vendas");
  await publicPage
    .getByRole("button", { name: "Enviar respostas", exact: true })
    .click();
  await publicPage
    .getByRole("heading", { name: "Respostas enviadas", exact: true })
    .waitFor();
  await publicPage.goto(`${base}/portal/${"b".repeat(64)}`, {
    waitUntil: "domcontentloaded",
  });
  await publicPage.getByLabel("Título", { exact: true }).fill("Novo criativo");
  await publicPage
    .getByLabel("Categoria", { exact: true })
    .selectOption("design");
  await publicPage
    .getByLabel("O que você precisa?", { exact: true })
    .fill("Preciso de uma imagem nova.");
  await publicPage
    .getByRole("button", { name: "Enviar chamado", exact: true })
    .click();
  await publicPage.waitForFunction(
    () => document.querySelector("#ticket-title")?.value === "",
  );
  assert.equal(formSent, true);
  assert.equal(ticketSent, true);
  assert.equal(publicAuthRequests, 0);
  await publicContext.close();
  assert.equal(apiErrors.length, 0, apiErrors.join("\n"));
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(
    "PASS: browser → RPC → PostgreSQL, pipeline editing, preserving cards, operation onboarding, active/paused filtering, form creation, client portal creation",
  );
} catch (error) {
  console.error(
    "Browser evidence:",
    await page.locator("body").innerText(),
    apiErrors,
    errors,
  );
  throw error;
} finally {
  await browser.close();
  await db.close();
}
