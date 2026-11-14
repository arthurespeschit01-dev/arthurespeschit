import { chromium } from "playwright";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const preview = process.env.VISUAL_PREVIEW === "1";
const base = process.env.TEST_APP_URL || "http://localhost:8081";
const browser = await chromium.launch({
  headless: true,
  executablePath: "/usr/bin/chromium",
});
const errors = [];
const writes = [];
const today = new Date().toLocaleDateString("en-CA");
async function open(kind) {
  const id = randomUUID(),
    clientId = randomUUID();
  const ctx = await browser.newContext({
    viewport: { width: 1500, height: 1000 },
  });
  await ctx.addInitScript(
    ({ id }) => {
      const user = {
        id,
        email: "visual@example.invalid",
        aud: "authenticated",
        role: "authenticated",
        app_metadata: { provider: "email" },
        user_metadata: { pilot_owner: true },
      };
      const session = {
        access_token:
          "fixture." +
          btoa(JSON.stringify({ sub: id, exp: 4102444800 })) +
          ".fixture",
        refresh_token: "fixture",
        expires_at: 4102444800,
        expires_in: 3600,
        token_type: "bearer",
        user,
      };
      for (const ref of ["ffvmmnzvmjiddqtywkko", "dycyskikaljvokaxsxnh"])
        localStorage.setItem(
          "sb-" + ref + "-auth-token",
          JSON.stringify(session),
        );
      localStorage.setItem("app-theme", "light");
    },
    { id },
  );
  const client = {
    id: clientId,
    user_id: id,
    name: "Atlas Engenharia",
    status: "Ativo",
    monthly_fee: 3500,
    payment_day: 19,
    niche: "Construção",
    phone: "5511999990000",
    services: "Tráfego",
    account_ids: {},
    verba_mensal: 1000,
    contract_duration: "12",
    created_at: new Date().toISOString(),
  };
  const task = {
    id: randomUUID(),
    title: "Relatório semanal de desempenho",
    description: "",
    status: "pendente",
    priority: "média",
    start_date: today,
    end_date: today,
    client_id: clientId,
    created_at: new Date().toISOString(),
    closed_at: null,
    recurrence: "weekly",
    recurrence_interval: 1,
    recurrence_days: [3],
    assignee_name: "Responsável de teste",
    assignee_user_id: id,
    recurrence_of: null,
    area: "Tráfego",
    recurrence_anchor: today,
  };
  await ctx.route("https://*.supabase.co/**", async (route) => {
    const req = route.request(),
      u = new URL(req.url()),
      name = u.pathname.split("/").pop(),
      body = req.postDataJSON();
    const reply = (data, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    if (u.pathname.includes("/auth/"))
      return reply(
        name === "logout"
          ? {}
          : {
              id,
              email: "visual@example.invalid",
              app_metadata: { provider: "email" },
              user_metadata: { pilot_owner: true },
            },
      );
    if (u.pathname.includes("/functions/"))
      return reply(
        name === "meta-account-balances"
          ? { accounts: [] }
          : { configured: false, connected: false },
      );
    if (name === "agency_workspace_identity")
      return kind === "failure"
        ? reply({ message: "Identity unavailable" }, 500)
        : reply({ pilot_owner: kind === "owner" });
    if (name === "agency_pilot_status")
      return reply(kind === "owner" || kind === "invited");
    if (name === "agency_task_summary")
      return reply({
        pendente: preview ? 4 : 1,
        concluída: 0,
        cancelada: 0,
        "em andamento": 0,
        scheduled: 0,
      });
    if (name === "agency_tasks_list")
      return reply(
        body.p_scope === "history"
          ? []
          : preview
            ? [
                task,
                {
                  ...task,
                  id: randomUUID(),
                  title: "Revisar campanha de captação",
                  priority: "alta",
                  area: "Tráfego",
                },
                {
                  ...task,
                  id: randomUUID(),
                  title: "Aprovar calendário de conteúdo",
                  priority: "média",
                  area: "Social Media",
                },
                {
                  ...task,
                  id: randomUUID(),
                  title: "Preparar apresentação de resultados",
                  priority: "baixa",
                  area: "Atendimento",
                },
              ]
            : [task],
      );
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method())) {
      writes.push(name);
      return reply({ message: "Unexpected write" }, 400);
    }
    let data =
      name === "profiles"
        ? [{ user_id: id, onboarding_completed: true }]
        : name === "clients"
          ? preview
            ? [
                client,
                {
                  ...client,
                  id: randomUUID(),
                  name: "Horizonte Clínica",
                  niche: "Saúde",
                  monthly_fee: 2800,
                },
                {
                  ...client,
                  id: randomUUID(),
                  name: "Studio Forma",
                  niche: "Arquitetura",
                  monthly_fee: 2400,
                },
                {
                  ...client,
                  id: randomUUID(),
                  name: "Vértice Educação",
                  niche: "Educação",
                  monthly_fee: 4200,
                },
                {
                  ...client,
                  id: randomUUID(),
                  name: "Casa Botânica",
                  niche: "Varejo",
                  monthly_fee: 1900,
                  status: "Pausado",
                },
              ]
            : [client]
          : name === "mensalidades" && preview
            ? Array.from({ length: 6 }, (_, i) => ({
                id: randomUUID(),
                cliente_id: clientId,
                valor: 9400 + i * 750,
                status: "pago",
                vencimento: new Date(
                  new Date().getFullYear(),
                  new Date().getMonth() - 5 + i,
                  12,
                ).toLocaleDateString("en-CA"),
              }))
            : [];
    return reply(
      req.headers().accept?.includes("vnd.pgrst.object")
        ? data[0] || null
        : data,
    );
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (e) => errors.push(e.message));
  return { ctx, page };
}
const signature = (page) =>
  page
    .locator(".agency-content")
    .evaluate((el) =>
      Array.from(el.querySelectorAll('h1,h2,button,[role="tab"],th')).map(
        (n) => [n.tagName, n.textContent.trim(), n.getAttribute("aria-label")],
      ),
    );
try {
  const ordinary = await open("ordinary"),
    owner = await open("owner");
  const screens = [
    ["/", "Dashboard"],
    ["/tasks", "Tarefas Operacionais"],
    ["/clientes", "Clientes"],
  ];
  for (const [path, title] of screens) {
    await ordinary.page.goto(base + path);
    await ordinary.page
      .getByRole("heading", { name: title, exact: true })
      .waitFor();
    if (path === "/tasks")
      await ordinary.page
        .getByRole("button", {
          name: "Relatório semanal de desempenho",
          exact: true,
        })
        .waitFor();
    await owner.page.goto(base + path);
    await owner.page
      .getByRole("heading", { name: title, exact: true })
      .waitFor();
    await owner.page.locator('html[data-product-skin="pilot"]').waitFor();
    if (path === "/tasks")
      await owner.page
        .getByRole("button", {
          name: "Relatório semanal de desempenho",
          exact: true,
        })
        .waitFor();
    if (path === "/clientes")
      for (const page of [ordinary.page, owner.page])
        await page
          .getByRole("heading", { name: "Atlas Engenharia", exact: true })
          .waitFor();
    assert.equal(
      await ordinary.page.locator("html").getAttribute("data-product-skin"),
      null,
    );
    assert.deepEqual(
      await signature(owner.page),
      await signature(ordinary.page),
      "Content/controls changed: " + path,
    );
    for (const theme of ["light", "dark"]) {
      if ((await owner.page.locator("html").getAttribute("class")) !== theme)
        await owner.page
          .getByRole("button", {
            name: theme === "dark" ? "Ativar modo escuro" : "Ativar modo claro",
            exact: true,
          })
          .click();
      await owner.page.locator("html." + theme).waitFor();
      assert.equal(
        await owner.page.locator("html").getAttribute("data-product-skin"),
        "pilot",
      );
      await owner.page.waitForTimeout(1200);
      await owner.page.screenshot({
        animations: "disabled",
        path:
          (preview ? "/workspace/work/proposal-" : "/workspace/work/visual-") +
          (path === "/" ? "dashboard" : path.slice(1)) +
          "-" +
          theme +
          ".png",
        fullPage: true,
      });
    }
  }
  await owner.page.goto(base + "/tasks");
  for (const label of [
    "Quadro de trabalho",
    "Planejamento",
    "Histórico",
    "Tabela",
  ]) {
    await owner.page.getByRole("tab", { name: label, exact: true }).click();
    assert.equal(
      await owner.page
        .getByRole("tab", { name: label, exact: true })
        .getAttribute("aria-selected"),
      "true",
    );
  }
  await owner.page
    .getByRole("button", { name: "Nova Tarefa", exact: true })
    .click();
  await owner.page.getByRole("dialog").waitFor();
  assert.equal(
    await owner.page
      .getByRole("dialog")
      .evaluate((el) => getComputedStyle(el).borderRadius),
    "10px",
  );
  await owner.page.keyboard.press("Escape");
  await owner.page.setViewportSize({ width: 390, height: 844 });
  assert(
    await owner.page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await owner.page
    .getByRole("button", { name: "Abrir menu", exact: true })
    .click();
  await owner.page
    .getByRole("button", { name: "Fechar menu", exact: true })
    .click();
  await owner.page.setViewportSize({ width: 1500, height: 1000 });
  await owner.page.getByRole("button", { name: "Sair", exact: true }).click();
  await owner.page.getByLabel("E-mail", { exact: true }).waitFor();
  assert.equal(
    await owner.page.locator("html").getAttribute("data-product-skin"),
    null,
  );
  for (const kind of ["invited", "failure"]) {
    const c = await open(kind);
    await c.page.goto(base + "/");
    await c.page
      .getByRole("heading", { name: "Dashboard", exact: true })
      .waitFor();
    await c.page.waitForTimeout(kind === "failure" ? 2200 : 200);
    assert.equal(
      await c.page.locator("html").getAttribute("data-product-skin"),
      null,
      kind + " must keep original design",
    );
    await c.ctx.close();
  }
  assert.deepEqual(writes, []);
  assert.deepEqual(errors, []);
  await owner.ctx.close();
  await ordinary.ctx.close();
  console.log(
    "PASS pilot owner only: light/dark dashboard, tasks and clients; unchanged page content/controls; task views/dialogs, mobile, logout cleanup; invited/ordinary/failure keep original styling; no writes.",
  );
} finally {
  await browser.close();
}
