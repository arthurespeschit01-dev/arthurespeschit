import { workflowCatalog } from "../src/components/pilot/workflowCatalog.ts";
import { formAnswers } from "../supabase/functions/_shared/workspace-public.ts";
import { chromium } from "playwright";
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
await db.exec(
  "create role service_role bypassrls;alter table auth.users add column email_confirmed_at timestamptz default now();create table public.agency_whatsapp_connections(instance_id text);grant select on public.agency_whatsapp_connections to service_role",
);
const pilot = randomUUID(),
  other = randomUUID();
for (const id of [pilot, other])
  await db.query("insert into auth.users(id,email) values($1,$2)", [
    id,
    id + "@example.invalid",
  ]);
await db.query(
  "insert into clients(user_id,name,monthly_fee) values($1,'Original preservado',700)",
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
await db.exec(
  await readFile(
    new URL(
      "../supabase/migrations/20261113215540_workspace_commercial_modules.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);
for (const name of [
  "20261113220957_workspace_integrations.sql",
  "20261114005109_workspace_professional_automations.sql",
  "20261114011614_workspace_action_cancellation_guards.sql",
  "20261114024829_workspace_trigger_configuration.sql",
  "20261114033015_workspace_roles_and_form_builder.sql",
  "20261114033021_workspace_tracking_and_flow_audit.sql",
  "20261114034242_workspace_ai_conversion_rules.sql",
  "20261114151246_workspace_crm_and_flow_parity.sql",
])
  await db.exec(
    await readFile(
      new URL("../supabase/migrations/" + name, import.meta.url),
      "utf8",
    ),
  );
await db.query(
  "insert into agency_private.pilot_accounts(user_id,enabled) values($1,true)",
  [pilot],
);
let queue = Promise.resolve(),
  featureReads = 0,
  sends = 0;
let qrConnected = false;
const run = (id, fn) => {
  const next = queue.then(async () => {
    await db.exec(
      id
        ? "reset role;set role authenticated"
        : "reset role;set role service_role",
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      id || "",
    ]);
    return fn();
  });
  queue = next.catch(() => {});
  return next;
};
const browser = await chromium.launch({
  headless: true,
  executablePath: "/usr/bin/chromium",
});
const errors = [];
const base = process.env.TEST_APP_URL || "http://localhost:8081";
async function contextFor(id) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    ignoreHTTPSErrors: !!process.env.TEST_APP_URL,
  });
  await context.routeWebSocket("**", (ws) => ws.close());
  await context.addInitScript(
    ({ id }) => {
      const session = {
        access_token:
          "eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjQxMDI0NDQ4MDAsInN1YiI6ImZpeHR1cmUifQ.fixture",
        refresh_token: "fixture",
        expires_at: 4102444800,
        expires_in: 3600,
        token_type: "bearer",
        user: {
          id,
          email: "fixture@example.invalid",
          aud: "authenticated",
          role: "authenticated",
          app_metadata: {},
          user_metadata: {},
        },
      };
      for (const ref of ["dycyskikaljvokaxsxnh", "ffvmmnzvmjiddqtywkko"])
        localStorage.setItem(
          "sb-" + ref + "-auth-token",
          JSON.stringify(session),
        );
    },
    { id },
  );
  await context.route("https://*.supabase.co/**", async (route) => {
    const req = route.request(),
      u = new URL(req.url()),
      table = u.pathname.split("/").pop(),
      body = req.postDataJSON();
    const reply = (data, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    try {
      if (u.pathname.includes("/auth/")) return reply({ id, app_metadata: {} });
      if (u.pathname.includes("/functions/")) {
        if (body?.action === "public_form" || body?.action === "submit_form") {
          const f = (
            await run(null, () =>
              db.query("select * from agency_workspace_forms where token=$1", [
                body.token,
              ]),
            )
          ).rows[0];
          if (!f) return reply({ error: "Não encontrado" }, 404);
          if (body.action === "public_form")
            return reply({
              title: f.title,
              description: f.description,
              fields: f.fields,
              presentation: f.presentation,
            });
          const answers = formAnswers(f.fields, body.answers);
          await run(null, () =>
            db.query("select agency_workspace_submit_form_v2($1,$2,$3,$4)", [
              f.token,
              body.request_id,
              JSON.stringify(answers),
              "{}",
            ]),
          );
          return reply({ message: f.success_message });
        }

        if (body?.action === "provider_settings")
          return reply({
            providers: { meta: null, google_ads: null, email: null, sms: null },
            meta_callback: "https://fixture.invalid/meta",
            link_base: "https://fixture.invalid/link?token=",
          });
        if (body?.action === "cloud_settings")
          return reply({
            configured: false,
            connected: false,
            webhook_url: "https://fixture.invalid/meta-whatsapp",
          });
        if (body?.action === "whatsapp_preferences")
          return reply({ optout_enabled: true, phrases: ["parar", "sair"] });
        if (body?.action === "integration_settings")
          return reply({
            google: {
              configured: false,
              connected: false,
              redirect_uri: "https://example.invalid/callback",
            },
            whatsapp: { instance_id: "exclusive-fixture", enabled: true },
            webhook: null,
          });
        if (body?.action === "connect_whatsapp")
          return reply({
            connected: false,
            qrcode:
              "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII=",
          });
        if (body?.action === "whatsapp_status")
          return reply({
            connected: qrConnected,
            phone: qrConnected ? "5511999990000" : null,
            account_id: null,
          });
        if (body?.action === "send") sends++;
        return reply({ configured: false, connected: false });
      }
      if (table === "profiles")
        return reply([{ user_id: id, onboarding_completed: true }]);
      if (table === "agency_pilot_status") {
        const r = await run(id, () =>
          db.query("select agency_pilot_status() allowed"),
        );
        return reply(r.rows[0].allowed);
      }
      if (
        table === "agency_workspace_identity" ||
        table === "agency_workspace_permissions"
      ) {
        const r = await run(id, () =>
          table === "agency_workspace_identity"
            ? db.query("select agency_workspace_identity() result")
            : db.query("select agency_workspace_permissions($1) result", [
                body.p_workspace,
              ]),
        );
        return reply(r.rows[0].result);
      }
      if (
        [
          "agency_workspace_default_pipeline",
          "agency_workspace_undo_lead",
          "agency_workspace_conversation_metrics",
        ].includes(table)
      ) {
        const args =
          table === "agency_workspace_default_pipeline"
            ? [body.p_workspace, body.p_pipeline]
            : table === "agency_workspace_undo_lead"
              ? [body.p_workspace, body.p_history]
              : [body.p_workspace, body.p_from, body.p_until];
        const r = await run(id, () =>
          db.query(
            `select public.${table}(${args.map((_, i) => "$" + (i + 1)).join(",")}) result`,
            args,
          ),
        );
        return reply(r.rows[0].result);
      }
      if (table === "agency_workspace_flow_issues") {
        const r = await run(id, () =>
          db.query("select agency_workspace_flow_issues($1,$2) result", [
            body.p_workspace,
            JSON.stringify(body.p_definition),
          ]),
        );
        return reply(r.rows[0].result);
      }
      if (table === "agency_workspace_save_role") {
        const r = await run(id, () =>
          db.query("select agency_workspace_save_role($1,$2,$3) result", [
            body.p_workspace,
            body.p_id,
            JSON.stringify(body.p_values),
          ]),
        );
        return reply(r.rows[0].result);
      }
      if (table === "agency_workspace_tracking_summary") {
        const r = await run(id, () =>
          db.query("select agency_workspace_tracking_summary($1,$2) result", [
            body.p_workspace,
            body.p_days,
          ]),
        );
        return reply(r.rows[0].result);
      }
      if (table === "agency_workspace_create") {
        const r = await run(id, () =>
          db.query("select agency_workspace_create($1,$2) id", [
            body.p_name,
            body.p_description,
          ]),
        );
        return reply(r.rows[0].id);
      }
      if (table === "agency_workspace_save_pipeline") {
        const r = await run(id, () =>
          db.query("select agency_workspace_save_pipeline($1,$2,$3,$4) id", [
            body.p_workspace,
            body.p_name,
            JSON.stringify(body.p_stages),
            body.p_id,
          ]),
        );
        return reply(r.rows[0].id);
      }
      if (
        ![
          "agency_client_workspaces",
          "agency_workspace_pipelines",
          "agency_workspace_stages",
          "agency_workspace_leads",
          "agency_workspace_members",
          "agency_workspace_action_outbox",
          "agency_workspace_conversion_rules",
          "agency_workspace_tracking_links",
          "agency_workspace_tracking_clicks",
          "agency_workspace_whatsapp_accounts",
          "agency_workspace_webhook_receipts",
          "agency_workspace_roles",
          "agency_workspace_member_roles",
          "agency_workspace_member_notifications",
          "agency_workspace_ai_rules",
          "agency_workspace_ai_checks",
          ...[
            "forms",
            "form_folders",
            "crm_history",
            "form_submissions",
            "form_views",
            "calendars",
            "appointments",
            "flows",
            "flow_runs",
            "flow_steps",
            "tasks",
            "notifications",
            "invitations",
          ].map((t) => "agency_workspace_" + t),
        ].includes(table)
      )
        return reply([]);
      featureReads++;
      const values = [],
        filters = [];
      for (const [key, value] of u.searchParams) {
        if (/^[a-z_]+$/.test(key) && value.startsWith("eq.")) {
          values.push(value.slice(3));
          filters.push('"' + key + '"=$' + values.length);
        }
      }
      const where = filters.length ? " where " + filters.join(" and ") : "";
      const r = await run(id, async () => {
        if (req.method() === "GET") {
          const order = (u.searchParams.get("order") || "")
            .split(",")
            .map((part) => part.split("."))
            .filter(([key]) => /^[a-z_]+$/.test(key))
            .map(
              ([key, direction]) =>
                '"' + key + '" ' + (direction === "desc" ? "desc" : "asc"),
            )
            .join(",");
          return db.query(
            `select * from public."${table}"${where}${order ? " order by " + order : ""}`,
            values,
          );
        }
        if (req.method() === "DELETE")
          return db.query(
            `delete from public."${table}"${where} returning *`,
            values,
          );
        const fields = Object.keys(body);
        assert(fields.every((k) => /^[a-z_]+$/.test(k)));
        if (req.method() === "POST")
          return db.query(
            `insert into public."${table}"(${fields.map((k) => '"' + k + '"').join(",")}) values(${fields.map((_, i) => "$" + (i + 1)).join(",")}) returning *`,
            Object.values(body).map((v) =>
              v && typeof v === "object" && !Array.isArray(v)
                ? JSON.stringify(v)
                : v,
            ),
          );
        if (req.method() === "PATCH")
          return db.query(
            `update public."${table}" set ${fields.map((k, i) => '"' + k + '"=$' + (i + 1)).join(",")}${where.replace(/\$(\d+)/g, (_, n) => "$" + (Number(n) + fields.length))} returning *`,
            [
              ...Object.values(body).map((v) =>
                v && typeof v === "object" && !Array.isArray(v)
                  ? JSON.stringify(v)
                  : v,
              ),
              ...values,
            ],
          );
        throw Error("Unsupported method");
      });
      return reply(
        req.headers().accept?.includes("vnd.pgrst.object")
          ? r.rows[0] || null
          : r.rows,
      );
    } catch (e) {
      return reply(
        { message: e.message, code: e.code },
        e.code === "42501" ? 403 : 400,
      );
    }
  });
  return context;
}
async function navigateModule(page, name) {
  const link = page.getByRole("link", { name, exact: true });
  if (
    [
      "CRM",
      "Dashboard",
      "Formulários",
      "Agendamentos",
      "Funis e automações",
      "Workspace",
      "Geral",
    ].includes(name)
  ) {
    const mobile = page.getByRole("button", {
      name: "Menu da empresa",
      exact: true,
    });
    if (
      (await mobile.isVisible()) &&
      (await mobile.getAttribute("aria-expanded")) === "false"
    )
      await mobile.click();
    const group = page.getByRole("button", {
      name: ["Workspace", "Geral"].includes(name)
        ? "Configurações"
        : "Comercial",
      exact: true,
    });
    if ((await group.getAttribute("aria-expanded")) === "false")
      await group.click();
  }
  await link.click();
}
try {
  const context = await contextFor(pilot),
    page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto(base + "/laboratorio/subcontas");
  await page
    .getByRole("button", { name: "Nova subconta", exact: true })
    .click();
  await page
    .getByLabel("Nome da empresa", { exact: true })
    .fill("Empresa Alpha");
  await page
    .getByRole("button", { name: "Criar subconta", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Empresa Alpha", exact: true })
    .waitFor();
  const alpha = page.url().split("/subcontas/")[1];
  // Real module definitions and visual canvas, without provider sends.
  await navigateModule(page, "Formulários");
  await page
    .getByRole("heading", { name: "Captação de contatos", exact: true })
    .waitFor();
  await page.getByLabel("Nome da nova pasta").fill("Campanhas");
  await page.getByRole("button", { name: "Nova pasta", exact: true }).click();
  await page
    .getByLabel("Pasta dos formulários")
    .selectOption({ label: "Campanhas (0)" });
  await page
    .getByRole("button", { name: "Novo formulário", exact: true })
    .click();
  await page.getByLabel("Título", { exact: true }).fill("Briefing de teste");
  await page.getByRole("button", { name: "Negrito", exact: true }).click();
  assert.equal(
    await page
      .locator('[aria-label="Editor de formulário"] main strong')
      .count(),
    1,
  );
  await page.getByRole("button", { name: "Riscado", exact: true }).click();
  assert.equal(
    await page.locator('[aria-label="Editor de formulário"] main del').count(),
    1,
  );
  await page.getByLabel("Título do campo 1", { exact: true }).fill("Nome");
  await page
    .getByRole("button", { name: "Adicionar campo", exact: true })
    .click();
  await page.getByRole("button", { name: "Texto curto", exact: true }).click();
  await page.getByLabel("Título do campo 4").fill("Objetivo");
  await page.getByLabel("Condição do campo 4").selectOption("name");
  await page.getByLabel("Valor da condição").fill("Carla");
  await page
    .getByRole("button", { name: "Salvar formulário", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Briefing de teste", exact: true })
    .waitFor();
  const publicForm = (
    await run(pilot, () =>
      db.query(
        "select * from agency_workspace_forms where workspace_id=$1 and title='Briefing de teste'",
        [alpha],
      ),
    )
  ).rows[0];
  assert(publicForm.folder_id);
  await page
    .getByRole("button", { name: "Duplicar formulário", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Salvar formulário", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Briefing de teste · cópia", exact: true })
    .waitFor();
  const copied = (
    await run(pilot, () =>
      db.query(
        "select * from agency_workspace_forms where workspace_id=$1 and title=$2",
        [alpha, "Briefing de teste · cópia"],
      ),
    )
  ).rows[0];
  assert.equal(copied.enabled, false);
  assert.notEqual(copied.token, publicForm.token);
  const publicPage = await context.newPage();
  await publicPage.goto(base + "/captura/" + publicForm.token);
  await publicPage.getByLabel("Nome", { exact: true }).fill("Carla");
  await publicPage
    .getByRole("button", { name: "Continuar", exact: true })
    .click();
  await publicPage
    .getByLabel("WhatsApp", { exact: true })
    .fill("5511988883456");
  await publicPage
    .getByRole("button", { name: "Continuar", exact: true })
    .click();
  await publicPage
    .getByLabel("E-mail", { exact: true })
    .fill("carla-form@example.invalid");
  await publicPage
    .getByRole("button", { name: "Continuar", exact: true })
    .click();
  await publicPage
    .getByLabel("Objetivo", { exact: true })
    .fill("Solicitar atendimento");
  await publicPage
    .getByRole("button", { name: "Enviar respostas", exact: true })
    .click();
  await publicPage
    .getByRole("heading", {
      name: "Recebemos suas informações. Obrigado!",
      exact: true,
    })
    .waitFor();
  const captured = (
    await run(pilot, () =>
      db.query(
        "select * from agency_workspace_leads where workspace_id=$1 and phone='5511988883456'",
        [alpha],
      ),
    )
  ).rows;
  assert.equal(captured.length, 1);
  await publicPage.close();
  await navigateModule(page, "Funis e automações");
  await page.getByRole("button", { name: "Abrir editor", exact: true }).click();
  await page
    .locator(".react-flow")
    .waitFor()
    .catch(async (e) => {
      console.error((await page.locator("body").innerText()).slice(-3000));
      await page.screenshot({
        path: "/workspace/work/commercial-flow-failed.png",
      });
      throw e;
    });
  assert.equal(await page.locator(".react-flow__node").count(), 4);
  const originalEdges = await page.locator(".react-flow__edge").count();
  await page
    .locator(".react-flow__node")
    .filter({ hasText: "Notificar equipe" })
    .click();
  await page
    .getByRole("button", { name: "Timer / Espera", exact: false })
    .click();
  assert.equal(await page.locator(".react-flow__node").count(), 5);
  assert.equal(
    await page.locator(".react-flow__edge").count(),
    originalEdges + 1,
  );
  await page
    .getByRole("button", { name: "Desfazer diagrama", exact: true })
    .click();
  assert.equal(await page.locator(".react-flow__node").count(), 4);
  await page
    .getByRole("button", { name: "Refazer diagrama", exact: true })
    .click();
  assert.equal(await page.locator(".react-flow__node").count(), 5);
  await page
    .getByRole("button", { name: "Remover bloco", exact: true })
    .click();
  assert.equal(await page.locator(".react-flow__edge").count(), originalEdges);

  await page
    .getByRole("button", { name: "Ver fluxo inteiro", exact: true })
    .click();
  await page.waitForTimeout(350);
  const editor = page.locator('[aria-label="Editor de automações"]');
  await page
    .locator(".react-flow__node")
    .filter({ hasText: "GATILHO" })
    .click();
  await page
    .getByLabel("Tipo de evento", { exact: true })
    .selectOption("stage_changed");
  await page.getByLabel("Quando entrar na etapa", { exact: true }).waitFor();
  assert(
    (await page
      .getByLabel("Quando entrar na etapa", { exact: true })
      .locator("option")
      .count()) > 1,
  );
  await page
    .getByLabel("Tipo de evento", { exact: true })
    .selectOption("external_webhook");
  await page
    .getByRole("button", { name: "Gerar webhook", exact: false })
    .waitFor();
  await page
    .getByLabel("Tipo de evento", { exact: true })
    .selectOption("form_submitted");
  await page
    .getByRole("button", { name: "Equipe respondeu?", exact: false })
    .click();
  await page.getByRole("button", { name: "15 min", exact: true }).click();
  await page.getByRole("button", { name: "30 min", exact: true }).click();
  assert.equal(
    await page.getByLabel("Prazo de resposta em minutos").inputValue(),
    "30",
  );
  await page
    .getByLabel("Momento de conferir resposta")
    .selectOption("deadline");
  await page
    .getByRole("button", { name: "Remover bloco", exact: true })
    .click();

  await page
    .getByRole("button", { name: "Estágio padrão", exact: false })
    .click();
  await page
    .getByLabel("Nome do bloco", { exact: true })
    .fill("Estágio revisado");
  const newNode = page
    .locator(".react-flow__node")
    .filter({ hasText: "Estágio revisado" });
  await newNode.waitFor();
  const nodeId = await newNode.getAttribute("data-id");
  const beforePosition = await newNode.getAttribute("style");
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  const box = await newNode.boundingBox();
  await page.mouse.move(box.x + 60, box.y + 35);
  await page.mouse.down();
  await page.mouse.move(box.x + 150, box.y + 130, { steps: 15 });
  await page.mouse.up();
  assert.notEqual(await newNode.getAttribute("style"), beforePosition);
  await newNode.click();
  assert.equal(
    await page.getByLabel("Nome do bloco", { exact: true }).inputValue(),
    "Estágio revisado",
  );
  // An unfinished draft can be saved, reopened, edited and deleted.
  await page.getByLabel("Ativo", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Salvar funil", exact: true }).click();
  assert.equal(
    await page.locator('[aria-label="Editor de automações"]').count(),
    1,
  );
  await page
    .getByRole("button", { name: "Fechar editor", exact: true })
    .click();
  if (await page.getByRole("alert").count())
    console.error(await page.getByRole("alert").allTextContents());
  await page
    .locator('[aria-label="Editor de automações"]')
    .waitFor({ state: "detached" });
  await page.getByRole("button", { name: "Abrir editor", exact: true }).click();
  await page.locator(`[data-id="${nodeId}"]`).click();
  assert.equal(
    await page.getByLabel("Nome do bloco", { exact: true }).inputValue(),
    "Estágio revisado",
  );
  await page
    .getByRole("button", { name: "Remover bloco", exact: true })
    .click();
  await page.getByLabel("Ativo", { exact: true }).check();
  await page.getByRole("button", { name: "Salvar funil", exact: true }).click();
  assert.equal(
    await page.locator('[aria-label="Editor de automações"]').count(),
    1,
  );
  await page
    .getByRole("button", { name: "Fechar editor", exact: true })
    .click();
  if (await page.getByRole("alert").count())
    console.error(await page.getByRole("alert").allTextContents());
  await page
    .locator('[aria-label="Editor de automações"]')
    .waitFor({ state: "detached" });
  await page.getByRole("button", { name: "Abrir editor", exact: true }).click();

  for (const item of workflowCatalog.flatMap((g) => g.items)) {
    const [type, label] = item;
    await page.getByRole("button", { name: label, exact: false }).click();
    await page.getByLabel("Nome do bloco", { exact: true }).waitFor();
    const fields = await page
      .locator('[aria-label="Editor de automações"] fieldset')
      .locator("input,textarea,select")
      .count();
    assert(fields > 1, `Block ${label} lacks configuration`);
    await page
      .getByRole("button", { name: "Remover bloco", exact: true })
      .click();
  }
  await page.screenshot({
    path: "/workspace/work/workspace-flow-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: "/workspace/work/workspace-flow-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("button", { name: "Fechar editor", exact: true })
    .click();
  const exportWait = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Exportar JSON", exact: true })
    .click();
  const exported = await exportWait;
  const text = await readFile(await exported.path(), "utf8");
  await page.getByLabel("Arquivo do funil").setInputFiles({
    name: "funil.json",
    mimeType: "application/json",
    buffer: Buffer.from(text),
  });
  await page.locator('[aria-label="Editor de automações"]').waitFor();
  assert.equal(
    await page.getByLabel("Ativo", { exact: true }).isChecked(),
    false,
  );
  await page.getByRole("button", { name: "Salvar funil", exact: true }).click();
  assert.equal(
    await page.locator('[aria-label="Editor de automações"]').count(),
    1,
  );
  await page
    .getByRole("button", { name: "Fechar editor", exact: true })
    .click();
  await page
    .locator('[aria-label="Editor de automações"]')
    .waitFor({ state: "detached" });
  const imported = (
    await run(pilot, () =>
      db.query(
        "select * from agency_workspace_flows where workspace_id=$1 and name like '%importado'",
        [alpha],
      ),
    )
  ).rows;
  assert.equal(imported.length, 1);
  assert.equal(imported[0].enabled, false);
  await navigateModule(page, "Geral");
  await page
    .getByRole("link", { name: "WhatsApp", exact: false })
    .filter({ hasText: "Conexão exclusiva" })
    .click();
  await page.getByRole("heading", { name: "WhatsApp", exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Ler QR Code aqui", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByAltText("QR Code para conectar o WhatsApp da subconta")
    .waitFor();
  qrConnected = true;
  await page.getByRole("dialog").waitFor({ state: "detached" });
  await page
    .getByText("● Conectado · 5511999990000", { exact: true })
    .waitFor();

  await page
    .getByRole("tab", { name: "API Oficial (Meta)", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "WhatsApp API Oficial", exact: true })
    .waitFor();
  assert(
    await page
      .getByRole("button", {
        name: "Conectar meu número do WhatsApp Business",
        exact: true,
      })
      .isDisabled(),
  );
  await page.getByText("Ativação pendente:", { exact: false }).waitFor();
  await page
    .getByRole("heading", { name: "Descadastro automático", exact: true })
    .waitFor();
  await page
    .getByRole("tab", { name: "WhatsApp por QR Code", exact: true })
    .click();
  assert.equal(
    await page
      .getByRole("heading", { name: "Google Agenda", exact: true })
      .count(),
    0,
  );
  assert.equal(
    await page
      .getByRole("heading", { name: "Webhook externo", exact: true })
      .count(),
    0,
  );
  // Reproduce the SDK buffering stub and verify login opens synchronously on click.
  let completedMeta = 0,
    metaConnected = false;
  await page.route("**/functions/v1/workspace-operations", async (route) => {
    const request = route.request();
    if (request.method() !== "POST") return route.fallback();
    const body = request.postDataJSON();
    let value;
    if (body.action === "cloud_settings")
      value = {
        configured: true,
        connected: metaConnected,
        app_id: "123456789",
        config_id: "987654321",
        version: "v27.0",
        webhook_url: "https://fixture.invalid/meta",
      };
    else if (body.action === "cloud_begin")
      value = {
        nonce: "a".repeat(64),
        app_id: "123456789",
        config_id: "987654321",
        version: "v27.0",
      };
    else if (body.action === "integration_settings")
      value = {
        google: {
          configured: false,
          connected: false,
          redirect_uri: "https://fixture.invalid/google",
        },
        whatsapp: metaConnected ? { transport: "cloud", enabled: true } : null,
        webhook: null,
      };
    else if (body.action === "cloud_complete") {
      assert.equal(body.code, "fixture-code");
      assert.equal(body.phone_number_id, "654321");
      completedMeta++;
      metaConnected = true;
      value = { connected: true };
    } else return route.fallback();
    return route.fulfill({
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify(value),
    });
  });
  await page.route("https://connect.facebook.net/pt_BR/sdk.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `
    window.FB={init:function(){},login:function(){throw Error('Buffering SDK used');}};
    setTimeout(function(){window.FB={init:function(){},login:function(callback,options){
      window.__metaEventType=window.event&&window.event.type;
      if(!navigator.userActivation.isActive)throw Error('Login lost user activation');
      window.__metaMode=options.extras.featureType||'new_number';
      window.open('/meta-popup-fixture','meta-fixture','width=500,height=600');
      window.__completeMeta=function(){callback({authResponse:{code:'fixture-code'}});window.dispatchEvent(new MessageEvent('message',{origin:'https://www.facebook.com',data:JSON.stringify({type:'WA_EMBEDDED_SIGNUP',event:'FINISH',data:{waba_id:'123456',phone_number_id:'654321'}})}));};
    }};window.fbAsyncInit&&window.fbAsyncInit();},80);
  `,
    }),
  );
  await page.route("**/meta-popup-fixture", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<h1>Autorização Meta de teste</h1>",
    }),
  );
  await navigateModule(page, "Geral");
  await page
    .getByRole("link", { name: "WhatsApp", exact: false })
    .filter({ hasText: "Conexão exclusiva" })
    .click();
  await page
    .getByRole("tab", { name: "API Oficial (Meta)", exact: true })
    .click();
  const newNumber = page.getByRole("button", {
    name: "Conectar número novo",
    exact: true,
  });
  await page.waitForFunction(() =>
    [...document.querySelectorAll("button")].some(
      (b) => b.textContent === "Conectar número novo" && !b.disabled,
    ),
  );
  const popupPromise = page.waitForEvent("popup");
  await newNumber.click();
  const metaPopup = await popupPromise;
  assert.equal(await page.evaluate(() => window.__metaEventType), "click");
  await page
    .getByRole("button", { name: "Cancelar conexão", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Conexão cancelada" })
    .waitFor();
  assert.equal(completedMeta, 0);
  await metaPopup.close();
  const businessButton = page.getByRole("button", {
    name: "Conectar meu número do WhatsApp Business",
    exact: true,
  });
  const secondPopup = page.waitForEvent("popup");
  await businessButton.click();
  const businessPopup = await secondPopup;
  assert.equal(
    await page.evaluate(() => window.__metaMode),
    "whatsapp_business_app_onboarding",
  );
  await page.evaluate(() => window.__completeMeta());
  await page.getByText("Conectado", { exact: true }).waitFor();
  assert.equal(completedMeta, 1);
  await businessPopup.close();
  await navigateModule(page, "Geral");
  await page.getByRole("link", { name: "Google Agenda", exact: false }).click();
  await page
    .getByRole("heading", { name: "Google Agenda", exact: true })
    .first()
    .waitFor();
  assert.equal(
    await page.getByRole("heading", { name: "WhatsApp", exact: true }).count(),
    0,
  );
  assert.equal(
    await page
      .getByRole("heading", { name: "Webhook externo", exact: true })
      .count(),
    0,
  );
  await navigateModule(page, "Geral");
  await page
    .getByRole("link", { name: "Rastreamento de anúncios", exact: false })
    .click();
  await page
    .getByRole("button", { name: "Links rastreáveis", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Novo link rastreável", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("Código na mensagem", { exact: true }).inputValue(),
    "invisible",
  );
  assert.equal(
    await page.getByLabel("Marcação fixa do link", { exact: true }).count(),
    1,
  );
  await page.screenshot({ path: "/workspace/work/tracking-dialog-pilot.png" });
  await page
    .getByText("Outros destinos: site ou formulário", { exact: true })
    .click();
  await page.getByLabel("Destino", { exact: true }).selectOption("form");
  await page
    .getByLabel("Formulário", { exact: true })
    .getByRole("option", { name: "Briefing de teste", exact: true })
    .waitFor({ state: "attached" });
  assert(
    (await page
      .getByLabel("Formulário", { exact: true })
      .locator("option")
      .count()) > 1,
  );
  await page
    .getByLabel("Nome do link", { exact: true })
    .fill("Captação de teste");
  await page
    .getByLabel("Formulário", { exact: true })
    .selectOption({ label: "Briefing de teste" });
  // The development origin is HTTP; production form links are HTTPS.
  // Persist a WhatsApp link to exercise the same creation path without weakening destination constraints.
  await page.getByLabel("Destino", { exact: true }).selectOption("whatsapp");
  await page
    .getByLabel("WhatsApp que recebe", { exact: true })
    .selectOption("");
  await page
    .getByLabel("WhatsApp com DDI", { exact: true })
    .fill("5511999990000");
  await page
    .getByLabel("Marcação fixa do link", { exact: true })
    .fill("utm_source=google");
  await page
    .getByLabel("Origem no CRM", { exact: true })
    .selectOption({ index: 1 });
  const trackingStage = await page
    .getByLabel("Etapa dos contatos do link", { exact: true })
    .inputValue();
  assert(trackingStage);
  await page.getByRole("button", { name: "Criar link", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  await page
    .getByRole("heading", { name: "Captação de teste", exact: true })
    .waitFor();
  const createdTracking = (
    await db.query(
      "select destination,source,code_style,stage_id from public.agency_workspace_tracking_links where name='Captação de teste'",
    )
  ).rows;
  assert.equal(createdTracking.length, 1);
  assert.equal(createdTracking[0].source, "google");
  assert.equal(createdTracking[0].code_style, "invisible");
  assert.equal(createdTracking[0].stage_id, trackingStage);
  assert(
    createdTracking[0].destination.startsWith(
      "https://wa.me/5511999990000?text=",
    ),
  );
  await navigateModule(page, "Workspace");
  await page.getByRole("button", { name: "Funções", exact: true }).click();
  await page.getByRole("button", { name: "Nova função", exact: true }).click();
  await page
    .getByLabel("Nome da função", { exact: true })
    .fill("Comercial de teste");
  await page.getByLabel("Acesso a CRM", { exact: true }).selectOption("write");
  await page
    .getByRole("button", { name: "Salvar função", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Comercial de teste", exact: false })
    .waitFor();
  await page.getByRole("button", { name: "Membros", exact: true }).click();
  await page.getByLabel("E-mail do convidado").fill("member@example.invalid");
  await page.getByLabel("Nome do convidado").fill("Atendente");
  await page
    .getByRole("button", { name: "Criar convite", exact: true })
    .click();
  await page.getByText("Atendente · Atendente", { exact: false }).waitFor();
  await navigateModule(page, "CRM");
  await page.getByRole("button", { name: "Novo lead", exact: true }).click();
  await page.getByLabel("Nome", { exact: true }).fill("Carla piloto");
  await page.getByLabel("Telefone", { exact: true }).fill("11999990000");
  await page.getByLabel("Valor da oportunidade", { exact: true }).fill("300");
  await page.getByRole("button", { name: "Salvar lead", exact: true }).click();
  await page
    .getByRole("button", { name: "Carla piloto", exact: true })
    .waitFor();
  await page
    .getByLabel("Etapa de Carla piloto", { exact: true })
    .selectOption({ label: "Ganho" });
  await navigateModule(page, "Dashboard");
  await page.getByText("R$ 300,00", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Opções da pipeline", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Configurar pipeline", exact: true })
    .click();
  await page
    .getByLabel("Nome da etapa 1", { exact: true })
    .fill("Entrada personalizada");
  await page
    .getByRole("button", { name: "Adicionar etapa", exact: true })
    .click();
  await page.getByLabel("Nome da etapa 6", { exact: true }).fill("Retorno");
  await page
    .getByRole("button", { name: "Salvar pipeline", exact: true })
    .click();
  await navigateModule(page, "CRM");
  await page
    .getByRole("heading", { name: "Entrada personalizada", exact: true })
    .waitFor();
  await page.getByRole("heading", { name: "Retorno", exact: true }).waitFor();
  await navigateModule(page, "Todas as subcontas");
  await page
    .getByRole("button", { name: "Nova subconta", exact: true })
    .click();
  await page
    .getByLabel("Nome da empresa", { exact: true })
    .fill("Empresa Beta");
  await page
    .getByRole("button", { name: "Criar subconta", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Empresa Beta", exact: true })
    .waitFor();
  await navigateModule(page, "CRM");
  assert.equal(
    await page
      .getByRole("button", { name: "Carla piloto", exact: true })
      .count(),
    0,
  );
  await page
    .getByLabel("Alternar subconta", { exact: true })
    .selectOption(alpha);
  await page
    .getByRole("heading", { name: "Empresa Alpha", exact: true })
    .waitFor();
  await navigateModule(page, "CRM");
  await page
    .getByRole("button", { name: "Carla piloto", exact: true })
    .waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page
    .getByRole("button", { name: "Opções do lead Carla piloto", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Editar lead", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("Telefone", { exact: true }).inputValue(),
    "11999990000",
  );
  await page.getByLabel("Nome", { exact: true }).fill("Carla revisada");
  await page.getByRole("button", { name: "Salvar lead", exact: true }).click();
  await page
    .getByRole("button", { name: "Carla revisada", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Lista de oportunidades", exact: true })
    .click();
  assert.equal(await page.getByLabel("Pipeline da empresa").isVisible(), false);
  await page
    .getByRole("button", { name: "Histórico do CRM", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Últimas 100 alterações da empresa" })
    .waitFor();
  await page
    .getByRole("button", { name: "Desfazer", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Desfeito", exact: true }).waitFor();
  assert.equal(
    (
      await run(pilot, () =>
        db.query(
          "select name from agency_workspace_leads where workspace_id=$1 and phone='11999990000'",
          [alpha],
        ),
      )
    ).rows[0].name,
    "Carla piloto",
  );

  await navigateModule(page, "Todas as subcontas");
  await page
    .getByRole("button", {
      name: "Opções da subconta Empresa Alpha",
      exact: true,
    })
    .click();
  await page.getByRole("menuitem", { name: "Arquivar", exact: true }).click();
  await page
    .getByLabel("Status das subcontas", { exact: true })
    .selectOption("archived");
  await navigateModule(page, "Abrir subconta");
  await page
    .getByText(
      "Subconta arquivada. Os dados continuam disponíveis para consulta.",
      { exact: true },
    )
    .waitFor();
  await navigateModule(page, "CRM");
  assert(
    await page
      .getByRole("button", { name: "Novo lead", exact: true })
      .isDisabled(),
  );
  await navigateModule(page, "Todas as subcontas");
  await page
    .getByLabel("Status das subcontas", { exact: true })
    .selectOption("archived");
  await page
    .getByRole("button", {
      name: "Opções da subconta Empresa Alpha",
      exact: true,
    })
    .click();
  await page
    .getByRole("menuitem", { name: "Excluir subconta", exact: true })
    .click();
  await page
    .getByLabel("Status das subcontas", { exact: true })
    .selectOption("all");
  await page
    .getByRole("heading", { name: "Empresa Beta", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("heading", { name: "Empresa Alpha", exact: true })
      .count(),
    0,
  );
  assert.deepEqual(errors, []);
  await context.close();
  const foreign = await contextFor(other),
    foreignPage = await foreign.newPage();
  const beforeReads = featureReads;
  await foreignPage.goto(base + "/laboratorio/subcontas");
  await foreignPage.waitForURL(base + "/");
  assert.equal(featureReads, beforeReads);
  assert.equal(
    await foreignPage
      .getByRole("link", {
        name: "Subcontas de clientes (piloto)",
        exact: true,
      })
      .count(),
    0,
  );
  await foreign.close();
  await queue;
  await db.exec("reset role");
  assert.deepEqual((await db.query("select * from clients")).rows, before);
  assert.equal(sends, 0);
  console.log(
    "PASS browser→RLS database: create isolated subaccounts, lead edits/moves, real dashboard, pipeline edits, workspace switching, archive/delete, mobile and non-pilot denial; legacy data unchanged",
  );
} catch (e) {
  console.error(e);
  console.error("PAGE_ERRORS", errors);
  throw e;
} finally {
  await browser.close();
  await db.close();
}
