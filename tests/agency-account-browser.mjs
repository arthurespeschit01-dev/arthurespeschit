import { chromium } from "playwright";
import assert from "node:assert/strict";
export async function verifyAgencyBrowser(db, owner, workspace) {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/usr/bin/chromium",
  });
  const context = await browser.newContext();
  let queue = Promise.resolve();
  const errors = [];
  const run = (fn) => {
    const next = queue.then(async () => {
      await db.exec("reset role;set role authenticated");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        owner,
      ]);
      return fn();
    });
    queue = next.catch(() => {});
    return next;
  };
  try {
    await context.routeWebSocket("**", (ws) => ws.close());
    await context.addInitScript(
      ({ owner }) => {
        for (const ref of ["dycyskikaljvokaxsxnh", "ffvmmnzvmjiddqtywkko"])
          localStorage.setItem(
            "sb-" + ref + "-auth-token",
            JSON.stringify({
              access_token:
                "eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjQxMDI0NDQ4MDAsInN1YiI6ImZpeHR1cmUifQ.fixture",
              refresh_token: "fixture",
              expires_at: 4102444800,
              token_type: "bearer",
              user: {
                id: owner,
                email: "owner@example.invalid",
                aud: "authenticated",
                role: "authenticated",
                app_metadata: {},
                user_metadata: {},
              },
            }),
          );
      },
      { owner },
    );
    await context.route("https://*.supabase.co/**", async (route) => {
      const req = route.request(),
        url = new URL(req.url()),
        name = url.pathname.split("/").pop(),
        body = req.postDataJSON();
      const reply = (data, status = 200) =>
        route.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify(data),
        });
      try {
        if (url.pathname.includes("/auth/"))
          return reply({
            id: owner,
            email: "owner@example.invalid",
            email_confirmed_at: "2026-01-01",
            app_metadata: {},
          });
        if (url.pathname.includes("/functions/"))
          return reply(
            body?.action === "team_settings"
              ? { email_configured: true }
              : {
                  google: { configured: true, connected: false },
                  providers: {
                    meta: null,
                    google_ads: null,
                    email: null,
                    sms: null,
                  },
                },
          );
        if (name === "profiles")
          return reply([{ user_id: owner, onboarding_completed: true }]);
        if (url.pathname.includes("/rpc/")) {
          const args =
            name === "agency_account_calendar"
              ? [
                  body.p_workspace,
                  body.p_action || "get",
                  body.p_id || null,
                  JSON.stringify(body.p_values || {}),
                ]
              : name === "agency_workspace_permissions"
                ? [body.p_workspace]
                : [];
          if (
            ![
              "agency_account_workspace",
              "agency_account_calendar",
              "agency_workspace_identity",
              "agency_workspace_permissions",
              "agency_workspace_status",
            ].includes(name)
          )
            return reply([]);
          const r = await run(() =>
            db.query(
              `select public.${name}(${args.map((_, i) => "$" + (i + 1)).join(",")}) result`,
              args,
            ),
          );
          return reply(r.rows[0].result);
        }
        if (
          /^agency_workspace_[a-z_]+$/.test(name) ||
          name === "agency_client_workspaces"
        ) {
          const filters = [],
            args = [];
          for (const [key, value] of url.searchParams) {
            if (/^[a-z_]+$/.test(key) && value.startsWith("eq.")) {
              args.push(value.slice(3));
              filters.push(`${key}=$${args.length}`);
            }
          }
          const r = await run(() =>
            db.query(
              `select * from public.${name}${filters.length ? " where " + filters.join(" and ") : ""}`,
              args,
            ),
          );
          return reply(r.rows);
        }
        return reply([]);
      } catch (e) {
        return reply({ message: e.message }, 400);
      }
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    const base = process.env.TEST_APP_URL || "http://localhost:8081";
    await page.goto(base + "/comercial/agendamentos");
    await page
      .getByLabel("Título do agendamento")
      .fill("Agenda principal pelo navegador");
    await page.getByLabel("Início", { exact: true }).fill("2027-02-15T10:00");
    await page.getByLabel("Término", { exact: true }).fill("2027-02-15T11:00");
    await page
      .getByRole("button", { name: "Salvar agendamento", exact: true })
      .click();
    await page.getByText("Agendamento salvo!", { exact: true }).waitFor();
    const count = await run(() =>
      db.query(
        "select count(*)::int n from agency_appointments where user_id=$1 and title='Agenda principal pelo navegador'",
        [owner],
      ),
    );
    assert.equal(count.rows[0].n, 1);
    await page.goto(base + "/configuracoes/equipe");
    await page
      .getByRole("heading", { name: "Configurações da Central", exact: true })
      .waitFor();
    await page
      .getByRole("option", { name: "Design", exact: true })
      .first()
      .waitFor({ state: "attached" });
    await page.goto(base + "/configuracoes/rastreamento");
    await page
      .getByText("Rastreamento de anúncios", { exact: true })
      .first()
      .waitFor();
    assert.deepEqual(errors, []);
    console.log(
      "PASS main browser: calendar→owner-scoped database, team custom roles and main tracking settings",
    );
  } finally {
    await browser.close();
  }
}
