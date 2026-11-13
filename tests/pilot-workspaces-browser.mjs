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
await db.exec("create role service_role bypassrls");
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
await db.query(
  "insert into agency_private.pilot_accounts(user_id,enabled) values($1,true)",
  [pilot],
);
let queue = Promise.resolve(),
  featureReads = 0,
  sends = 0;
const run = (id, fn) => {
  const next = queue.then(async () => {
    await db.exec("reset role;set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
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
            Object.values(body),
          );
        if (req.method() === "PATCH")
          return db.query(
            `update public."${table}" set ${fields.map((k, i) => '"' + k + '"=$' + (i + 1)).join(",")}${where.replace(/\$(\d+)/g, (_, n) => "$" + (Number(n) + fields.length))} returning *`,
            [...Object.values(body), ...values],
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
  await page.getByRole("link", { name: "CRM", exact: true }).click();
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
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
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
  await page.getByRole("link", { name: "CRM", exact: true }).click();
  await page
    .getByRole("heading", { name: "Entrada personalizada", exact: true })
    .waitFor();
  await page.getByRole("heading", { name: "Retorno", exact: true }).waitFor();
  await page
    .getByRole("link", { name: "Todas as subcontas", exact: true })
    .click();
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
  await page.getByRole("link", { name: "CRM", exact: true }).click();
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
  await page.getByRole("link", { name: "CRM", exact: true }).click();
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
    .getByRole("link", { name: "Todas as subcontas", exact: true })
    .click();
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
  await page.getByRole("link", { name: "Abrir subconta", exact: true }).click();
  await page
    .getByText(
      "Subconta arquivada. Os dados continuam disponíveis para consulta.",
      { exact: true },
    )
    .waitFor();
  await page.getByRole("link", { name: "CRM", exact: true }).click();
  assert(
    await page
      .getByRole("button", { name: "Novo lead", exact: true })
      .isDisabled(),
  );
  await page
    .getByRole("link", { name: "Todas as subcontas", exact: true })
    .click();
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
  throw e;
} finally {
  await browser.close();
  await db.close();
}
