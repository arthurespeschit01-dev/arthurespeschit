import { chromium } from "playwright";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";

// Local browser → PostgREST-compatible test adapter → real PostgreSQL migrations.
// All remote API calls are intercepted. No production credentials/data are used.
const db = new PGlite();
const owner = randomUUID();
const mailboxA=randomUUID(),mailboxB=randomUUID();let activeMailbox=mailboxA,fixtureConnected=true;let statusCalls=0;
const activeClient = randomUUID();
await db.exec(`
  create role authenticated;
  create role anon;
  create role service_role bypassrls;
  create schema auth;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$select '${owner}'::uuid$$;
  create table public.clients(id uuid primary key default gen_random_uuid(), user_id uuid, name text, status text,
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
const taskBase=await readFile(new URL('../supabase/migrations/20260416021855_a62b0b3d-1228-4ace-a4b7-e4ee215bd546.sql',import.meta.url),'utf8');
await db.exec(taskBase.split('-- Storage bucket')[0]);
await db.exec(await readFile(new URL('../supabase/migrations/20260416022733_4abf73de-3b98-4c14-8d99-332e0ea6a01c.sql',import.meta.url),'utf8'));
await db.exec(await readFile(new URL('../supabase/migrations/20260422161434_1bb772b8-8950-4b83-8ce3-f50120c7d2f9.sql',import.meta.url),'utf8'));
await db.exec(await readFile(new URL('../supabase/migrations/20260422162705_c172d709-3f2d-4b9b-841d-cf4b466b3aeb.sql',import.meta.url),'utf8'));
await db.query("insert into operational_tasks(user_id,title,status,priority,end_date) values($1,'Entrega em aberto','pendente','alta','2026-10-22'),($1,'Concluída antiga','concluída','média','2026-10-22'),($1,'Cancelada antiga','cancelada','baixa','2026-10-22')",[owner]);
for (const name of [
  "20260421044957_6c23a9e6-bbdf-4b99-9db9-f66c2eb12105.sql",
  "20261111144901_agency_pipelines.sql",
  "20261111145150_agency_portal_forms.sql",
  "20261111145643_agency_calendar.sql",
  "20261111152507_agency_whatsapp.sql",
  "20261111171948_commercial_dashboard_client_operations.sql",
  "20261111183242_whatsapp_inbox_shared.sql",
  "20261111185241_whatsapp_live_conversations.sql",
  "20261111190630_whatsapp_directory_availability.sql",
  "20261111192108_whatsapp_number_mailboxes_crm.sql",
  "20261112194308_client_billing_schedule.sql",
  "20261112195910_task_closure_history.sql",
  "20261112201959_forms_deletion_finance_alignment.sql",
])
  await db.exec(
    await readFile(
      new URL(`../supabase/migrations/${name}`, import.meta.url),
      "utf8",
    ),
  );
await db.query("insert into agency_whatsapp_accounts(id,user_id,phone) values($1,$2,'553171789803'),($3,$2,'5531999991111')",[mailboxA,owner,mailboxB]);
await db.query('insert into agency_whatsapp_account_state(user_id,account_id,connected) values($1,$2,true)',[owner,mailboxA]);
await db.exec(`alter table agency_whatsapp_messages alter column account_id set default '${mailboxA}'::uuid`);
await db.query("update clients set monthly_fee=case when status='Ativo' then 550 when status='Pausado' then 600 else monthly_fee end where user_id=$1",[owner]);
await db.query("insert into mensalidades(user_id,cliente_id,valor,vencimento,status) select user_id,id,case when status='Ativo' then 650 else 700 end,date_trunc('month',now())::date+14,'pendente' from clients where user_id=$1 and status in('Ativo','Pausado')",[owner]);
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
  sessionStorage.setItem(`access-check:${session.user.email}`, JSON.stringify({ access: false, checkedAt: Date.now() }));
}, session);
const response = (route, data, status = 200) =>
  route.fulfill({
    status,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*" },
    body: JSON.stringify(data,(key,value)=>['vencimento','data','data_pagamento','entry_date','first_payment_date','start_date','end_date'].includes(key)&&typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(value)?value.slice(0,10):value),
  });
let subscriptionChecks = 0;
await context.route("https://backend-centraldogestor.vercel.app/**", (route) => {
  subscriptionChecks++;
  return response(route, { access: false });
});
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
        if (body.action === 'reconcile')return response(route,{ok:true});
        if (body.action === "status") {
          statusCalls++;
          await db.query('update agency_whatsapp_account_state set account_id=$1,connected=$2,checked_at=now() where user_id=$3',[activeMailbox,fixtureConnected,owner]);
          return response(route, {
            configured: true,
            connected: fixtureConnected,
            account_id:fixtureConnected?activeMailbox:null,
            phone:activeMailbox===mailboxA?"553171789803":"5531999991111",
            instance_id: "fixture",
            receiving_enabled: true,
          });
        }
        if (body.action === "connect")
          return response(route, {
            qrcode:
              "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lV8AAAAASUVORK5CYII=",
          });
        let card = (
          await db.query(
            "select phone,whatsapp_phone_key from agency_pipeline_cards where id=$1",
            [body.card_id],
          )
        ).rows[0];
        if (!card && body.phone) card = {phone:body.phone,whatsapp_phone_key:(await db.query("select agency_whatsapp_phone_key($1) key",[body.phone])).rows[0].key};
        if (body.action === "messages")
          return response(route, {
            messages: (
              await db.query(
                "select * from agency_whatsapp_messages where user_id=$1 and phone_key=$2 and account_id=$3 order by created_at",
                [owner, card.whatsapp_phone_key,activeMailbox],
              )
            ).rows,
          });
        if (body.action === "send") {
          await db.query(
            "insert into agency_whatsapp_messages(user_id,request_id,phone,body,direction,status) values($1,$2,$3,$4,'saida','enviado')",
            [owner, body.request_id, card.phone.startsWith("55") ? card.phone : "55" + card.phone, body.text],
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
    if (url.pathname.endsWith('/rpc/agency_whatsapp_mark_read')) {await db.query('select agency_whatsapp_mark_read($1)',[body.p_address]);return response(route,null);}
    if (url.pathname.endsWith('/rpc/agency_whatsapp_inbox') || url.pathname.endsWith('/rpc/agency_whatsapp_inbox_v2')) { const result=await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]); const inbox=await db.query('select agency_whatsapp_inbox_v2($1,$2,$3) result',[body.p_search,body.p_offset,body.p_filter||'all']); return response(route,inbox.rows[0].result); }
    if(url.pathname.endsWith('/rpc/agency_delete_item')){await db.query('select agency_delete_item($1,$2)',[body.p_kind,body.p_id]);return response(route,null);}
    if(url.pathname.endsWith('/rpc/ensure_agency_monthly_invoices')){const r=await db.query('select * from ensure_agency_monthly_invoices($1)',[body.p_month]);return response(route,r.rows);}
    if (url.pathname.endsWith('/rpc/save_agency_client')) {
      const result = await db.query('select public.save_agency_client($1,$2::jsonb,$3::jsonb) id',[body.p_id,JSON.stringify(body.p_client),JSON.stringify(body.p_operation)]);
      return response(route,result.rows[0].id);
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
    if (!/^agency_[a-z_]+$/.test(table) && !["clients","operational_tasks","task_comments","task_attachments","mensalidades","transacoes"].includes(table))
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
  if(!process.env.TEST_TASKS_ONLY){
  await page.goto(`${base}/comercial/crm`, { waitUntil: "domcontentloaded" });
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
  assert.equal(await page.getByRole('navigation').getByRole('link', { name: 'Clientes', exact: true }).evaluate(link => link.nextElementSibling?.textContent), 'Tarefas');
  fixtureConnected=false;
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
  fixtureConnected=true;
  await page.goto(`${base}/comercial/crm`);
  await page.getByRole("button", { name: "Novo card", exact: true }).click();
  await page
    .getByLabel("Título", { exact: true })
    .fill("Oportunidade de teste");
  await page.getByLabel("Telefone", { exact: true }).fill("11999990000");
  await page.getByLabel("Valor da oportunidade (R$)").fill("1500");
  await page
    .getByLabel("Status de resposta", { exact: true })
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
  await db.query("insert into agency_whatsapp_messages(user_id,phone,body,direction,status,contact_name) values($1,'5511888880000','Mensagem recebida fora do CRM','entrada','recebido','Contato externo')",[owner]);
  await page.goto(`${base}/comercial/conversas`);
  await page.getByRole('button').filter({hasText:'Contato externo'}).click();
  await page.getByText('Mensagem recebida fora do CRM',{exact:true}).filter({visible:true}).last().waitFor();
  await page.getByLabel('Mensagem WhatsApp',{exact:true}).fill('Resposta sem card');
  await page.getByRole('button',{name:'Enviar pelo WhatsApp',exact:true}).click();
  await page.getByText('Resposta sem card',{exact:true}).filter({visible:true}).last().waitFor();
  assert.equal((await db.query("select count(*)::int n from agency_pipeline_cards where phone='5511888880000'")).rows[0].n,1);
  assert.equal(await page.getByRole('button',{name:'Atualizar conversas',exact:true}).count(),0);
  await db.query("insert into agency_whatsapp_messages(user_id,provider_message_id,phone,body,direction,status) values($1,'automatic-reply','5511888880000','Chegou sem atualizar a página','entrada','recebido')",[owner]);
  await page.getByLabel('Mensagens da conversa').getByText('Chegou sem atualizar a página',{exact:true}).waitFor({timeout:12000});
  await db.query("select agency_whatsapp_account_metadata($1,$2,'120363123456789@g.us','Renata Guedes','group',true)",[owner,mailboxA]);
  await db.query("insert into agency_whatsapp_messages(user_id,provider_message_id,phone,body,direction,status,sender_name) values($1,'group-reply','120363123456789@g.us','Mensagem no grupo','entrada','recebido','Participante')",[owner]);
  await page.getByRole('button').filter({hasText:'Renata Guedes'}).waitFor({timeout:12000});
  await page.getByRole('button').filter({hasText:'Renata Guedes'}).click();
  await page.getByText('Grupo do WhatsApp',{exact:true}).waitFor();
  await page.getByLabel('Mensagens da conversa').getByText('Participante',{exact:true}).waitFor();
  if(process.env.TEST_SCREENSHOT_DIR) await page.screenshot({path:`${process.env.TEST_SCREENSHOT_DIR}/conversations-desktop.png`,fullPage:true});
  assert(await page.getByLabel('Mensagens da conversa').evaluate(el=>el.getBoundingClientRect().height>500));
  await page.setViewportSize({width:390,height:844});
  if(process.env.TEST_SCREENSHOT_DIR) await page.screenshot({path:`${process.env.TEST_SCREENSHOT_DIR}/conversations-mobile.png`,fullPage:true,animations:'disabled'});
  await page.getByRole('button',{name:'Voltar às conversas',exact:true}).click();
  await page.getByRole('heading',{name:/^Conversas/}).waitFor();
  await page.getByRole('button').filter({hasText:'Renata Guedes'}).click();
  await page.setViewportSize({width:390,height:430});
  await page.getByLabel('Mensagem WhatsApp',{exact:true}).focus();
  await page.waitForFunction(()=>document.querySelector('textarea[aria-label="Mensagem WhatsApp"]').getBoundingClientRect().bottom<=innerHeight);
  assert(await page.getByRole('button',{name:'Enviar pelo WhatsApp',exact:true}).evaluate(el=>el.getBoundingClientRect().height>=44));
  await page.setViewportSize({width:390,height:844});
  await page.bringToFront();
  activeMailbox=mailboxB;
  await page.getByText('Conectado · 5531999991111',{exact:true}).waitFor({timeout:12000});
  assert.equal(await page.getByLabel('Mensagens da conversa').count(),0,'switching sender must close the old conversation');
  await db.query("insert into agency_whatsapp_messages(user_id,account_id,provider_message_id,phone,body,direction,status,contact_name) values($1,$2,'other-account','5511888880000','Conversa exclusiva da Vanessa','entrada','recebido','Contato no outro número')",[owner,mailboxB]);
  await page.getByRole('button').filter({hasText:'Contato no outro número'}).waitFor({timeout:12000});
  assert.equal(await page.getByRole('button').filter({hasText:'Renata Guedes'}).count(),0);
  fixtureConnected=false;
  await page.getByText('WhatsApp desconectado',{exact:true}).waitFor({timeout:12000});
  fixtureConnected=true;activeMailbox=mailboxA;
  await page.getByText('Conectado · 553171789803',{exact:true}).waitFor({timeout:12000});
  await page.getByRole('button').filter({hasText:'Renata Guedes'}).waitFor({timeout:12000});

  await page.setViewportSize({width:1440,height:1000});

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
  const finalStage = await db.query("select id from agency_pipeline_stages where pipeline_id=(select id from agency_pipelines where area='operacao') and name='Concluído'");
  await page.getByLabel('Mover Cliente ativo de teste para etapa').selectOption(finalStage.rows[0].id);
  await page.getByRole('region',{name:'Concluído',exact:true}).getByRole('button',{name:'Cliente ativo de teste',exact:true}).waitFor();
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
  await page.getByText('Em execução · Concluído',{exact:true}).filter({visible:true}).first().waitFor();
  await page.getByRole('button',{name:'Novo Cliente',exact:true}).click();
  await page.getByRole('button',{name:'Pular e continuar',exact:true}).click();
  await page.setViewportSize({width:390,height:844});
  await page.waitForFunction(()=>{const el=document.querySelector('[role=dialog]');return el&&el.getBoundingClientRect().right<=innerWidth&&el.getBoundingClientRect().left>=0});
  await page.getByLabel('Nome do cliente *',{exact:true}).fill('Novo cliente em onboarding');
  await page.getByLabel('Data de entrada',{exact:true}).fill('2026-11-20');
  await page.getByLabel('Dia de pagamento',{exact:true}).fill('15');
  assert.equal(await page.getByLabel('Primeiro vencimento',{exact:true}).inputValue(),'2026-12-15');
  await page.getByLabel('Nicho *',{exact:true}).fill('Serviços');
  await page.getByLabel('Verba mensal (R$) *',{exact:true}).fill('1500');
  await page.getByLabel('Fase de trabalho',{exact:true}).selectOption('onboarding');
  await page.getByRole('dialog').getByRole('button',{name:'Salvar',exact:true}).click();
  await page.getByRole('heading',{name:'Novo cliente em onboarding',exact:true}).first().waitFor();
  await page.setViewportSize({width:1440,height:1000});
  await page.getByText('Onboarding · Entrada',{exact:true}).filter({visible:true}).first().waitFor();
  assert.equal((await db.query("select first_payment_date::text d from clients where name='Novo cliente em onboarding'")).rows[0].d,'2026-12-15');
  assert.equal((await db.query("select count(*)::int n from agency_pipeline_cards where title='Novo cliente em onboarding'")).rows[0].n,1);
  await page.goto(`${base}/operacao`);
  await page.getByLabel('Mover Novo cliente em onboarding para etapa').selectOption(finalStage.rows[0].id);
  await page.getByRole('region',{name:'Concluído',exact:true}).getByRole('button',{name:'Novo cliente em onboarding',exact:true}).waitFor();
  await page.goto(`${base}/clientes`);
  await page.getByRole('heading',{name:'Novo cliente em onboarding',exact:true}).filter({visible:true}).locator('..').locator('..').getByText('Em execução · Concluído',{exact:true}).waitFor();

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
  if(await page.getByRole("button", { name: "Operações", exact: true }).getAttribute("aria-expanded")!=="true")await page.getByRole("button", { name: "Operações", exact: true }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "Operações", exact: true })
      .getAttribute("aria-expanded"),
    "true",
  );
  for (const label of ["Chamados", "Relatórios", "Tarefas"])
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
  await page.getByLabel('Buscar página',{exact:true}).fill('Financeiro');
  await page.getByRole('navigation').getByRole('link',{name:'Financeiro',exact:true}).click();
  await page.getByRole('heading',{name:'Financeiro',exact:true}).waitFor();
  await page.getByLabel('Localização atual').getByText('Gestão',{exact:true}).waitFor();
  await page.getByText('A receber · ativos',{exact:true}).locator('..').locator('..').getByText('R$ 550,00',{exact:true}).waitFor();
  assert.equal(Number((await db.query('select valor from mensalidades where cliente_id=$1',[activeClient])).rows[0].valor),550);
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Abrir menu',exact:true}).click();
  await page.getByLabel('Buscar página',{exact:true}).fill('Formulários');
  await page.getByRole('navigation').getByRole('link',{name:'Formulários',exact:true}).click();
  await page.getByRole('heading',{name:'Comercial',exact:true}).waitFor();
  await page.waitForFunction(()=>document.querySelector('nav')?.getBoundingClientRect().right<=0);
  await page.goto(`${base}/comercial/crm`);
  await page.setViewportSize({width:390,height:844});
  await page.getByRole("tab", { name: "Formulários", exact: true }).click();
  await page
    .getByRole("button", { name: "Novo formulário", exact: true })
    .click();
  await page
    .getByLabel("Título", { exact: true })
    .fill("Briefing de onboarding");
  await page.getByLabel("Campo 1", { exact: true }).fill("Objetivo do projeto");
  assert(await page.getByRole('dialog').evaluate(el=>el.getBoundingClientRect().right<=innerWidth&&el.getBoundingClientRect().left>=0),'form editor fits mobile width');
  await page.getByLabel('Campo 1',{exact:true}).fill('Precisa de design?');
  await page.getByLabel('Tipo do campo 1',{exact:true}).selectOption('select');
  await page.getByLabel('Opções do campo 1',{exact:true}).fill('Sim\nNão');
  await page.getByRole('button',{name:'Adicionar campo',exact:true}).click();
  await page.getByLabel('Campo 2',{exact:true}).fill('Orçamento');
  await page.getByLabel('Tipo do campo 2',{exact:true}).selectOption('number');
  await page.getByLabel('Obrigatório',{exact:true}).nth(1).check();
  await page.getByLabel('Exibir este campo somente se',{exact:true}).nth(1).check();
  await page.getByLabel('Valor da condição 2',{exact:true}).fill('Sim');
  await page.getByRole('button',{name:'Pré-visualizar formulário',exact:true}).click();
  assert.equal(await page.getByLabel('Orçamento *',{exact:true}).count(),0);
  await page.getByLabel('Precisa de design?',{exact:true}).selectOption('Sim');
  await page.getByLabel('Orçamento *',{exact:true}).waitFor();
  await page.getByLabel('Precisa de design?',{exact:true}).selectOption('Não');
  assert.equal(await page.getByLabel('Orçamento *',{exact:true}).count(),0);
  await page.getByRole('button',{name:'Voltar ao editor',exact:true}).click();

  await page
    .getByRole("button", { name: "Salvar formulário", exact: true })
    .click();
  await page.getByRole("heading", { name: /Briefing de onboarding/ }).waitFor();
  const createdForm=(await db.query("select id from agency_forms where title='Briefing de onboarding'")).rows[0].id;
  await db.query("insert into agency_form_responses(user_id,form_id,answers) values($1,$2,'{}')",[owner,createdForm]);
  await page.getByRole('button',{name:'Excluir Briefing de onboarding',exact:true}).click();
  await page.getByRole('alertdialog').getByRole('button',{name:'Cancelar',exact:true}).click();
  assert.equal((await db.query('select count(*)::int n from agency_forms')).rows[0].n,1);
  await page.getByRole('button',{name:'Excluir Briefing de onboarding',exact:true}).click();
  await page.getByRole('button',{name:'Confirmar exclusão',exact:true}).click();
  await page.getByText('Nenhum formulário criado.',{exact:true}).waitFor();
  assert.equal((await db.query('select count(*)::int n from agency_form_responses')).rows[0].n,0);

  await page.getByRole('tab',{name:'Agendamentos',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Conectar Google Agenda',exact:true}).count(),0);
  await page.getByLabel('Título do agendamento',{exact:true}).fill('Reunião manual de onboarding');
  await page.getByLabel('Início',{exact:true}).fill('2026-12-01T10:00');
  await page.getByLabel('Término',{exact:true}).fill('2026-12-01T11:00');
  await page.getByLabel('Cliente (opcional)',{exact:true}).selectOption(activeClient);
  await page.getByRole('button',{name:'Salvar agendamento',exact:true}).click();
  await page.getByRole('heading',{name:'Reunião manual de onboarding',exact:true}).waitFor();
  await page.reload();
  await page.getByRole('heading',{name:'Reunião manual de onboarding',exact:true}).waitFor();
  await page.getByRole('button',{name:'Editar agendamento',exact:true}).click();
  await page.getByLabel('Status do agendamento',{exact:true}).selectOption('cancelado');
  await page.getByRole('button',{name:'Salvar agendamento',exact:true}).click();
  await page.getByLabel('Mostrar histórico e cancelados',{exact:true}).check();
  await page.getByRole('heading',{name:'Reunião manual de onboarding',exact:true}).waitFor();
  assert.equal((await db.query('select status from agency_appointments')).rows[0].status,'cancelado');
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(`${base}/comercial`);
  await page.getByRole('heading',{name:'Dashboard Comercial',exact:true}).waitFor();
  await page.getByLabel('Indicadores por etapa').getByText('Diagnóstico',{exact:true}).waitFor();
  await page.getByLabel('Indicadores por etapa').locator('article').filter({hasText:'Diagnóstico'}).getByText('2',{exact:true}).waitFor();
  if (process.env.TEST_SCREENSHOT_DIR) await page.screenshot({path:`${process.env.TEST_SCREENSHOT_DIR}/commercial-desktop.png`,fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>[...document.querySelectorAll('main h1, main article')].every(e=>e.getBoundingClientRect().right<=innerWidth+1)),true,'Dashboard headings and metric cards must fit a mobile screen');
  if (process.env.TEST_SCREENSHOT_DIR) await page.screenshot({path:`${process.env.TEST_SCREENSHOT_DIR}/commercial-mobile.png`,fullPage:true,animations:'disabled'});
  await page.setViewportSize({width:1440,height:1000});
  await page.getByRole('tab',{name:'Conversas do WhatsApp',exact:true}).click();
  await page.getByText('Mensagens recebidas',{exact:true}).waitFor();
  assert.equal(await page.getByText('Visualizações',{exact:true}).count(),0);
  await page.getByRole('navigation').getByRole('button',{name:'Comercial',exact:true}).waitFor();
  assert.equal(await page.locator('#nav-operacoes-items').getByRole('link').count(),0);
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
          {id:"design",label:"Precisa de design?",type:"select",required:true,options:["Sim","Não"]},
          {id:"budget",label:"Orçamento",type:"number",required:true,condition:{fieldId:"design",operator:"equals",value:"Sim"}},
        ],
      });
    if (body.action === "submit_form") {
      assert.equal(body.answers.goal, "Aumentar vendas");
      assert.equal(body.answers.design,"Não");assert.equal(body.answers.budget,undefined);
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
  await publicPage.getByLabel("Precisa de design? *",{exact:true}).selectOption("Sim");
  await publicPage.getByLabel("Orçamento *",{exact:true}).fill("500");
  await publicPage.getByLabel("Precisa de design? *",{exact:true}).selectOption("Não");
  assert.equal(await publicPage.getByLabel("Orçamento *",{exact:true}).count(),0);
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
  }
  await page.goto(`${base}/tasks`);
  const directLinks=await page.getByRole('navigation').getByRole('link').allTextContents();
  assert(directLinks.indexOf('Tarefas')===directLinks.indexOf('Clientes')+1);
  assert(directLinks.indexOf('Conversas')===directLinks.indexOf('Tarefas')+1);
  assert.equal(await page.locator('#nav-operacoes-items').getByRole('link',{name:'Tarefas',exact:true}).count(),0);

  await page.getByRole('heading',{name:'Entrega em aberto',exact:true}).waitFor();
  assert.equal(await page.getByRole('heading',{name:'Concluída antiga',exact:true}).count(),0);
  await page.getByText('Filtros e ordenação',{exact:true}).click();
  await page.getByLabel('Filtrar prioridade das tarefas',{exact:true}).selectOption('baixa');
  assert.equal(await page.getByRole('heading',{name:'Entrega em aberto',exact:true}).count(),0);
  await page.getByRole('button',{name:'Limpar filtros',exact:true}).click();
  await page.getByRole('heading',{name:'Entrega em aberto',exact:true}).waitFor();
  await page.getByRole('tab',{name:'Histórico',exact:true}).click();
  await page.getByLabel('Período de encerramento',{exact:true}).selectOption('todos');
  await page.getByRole('heading',{name:'Concluída antiga',exact:true}).waitFor();
  await page.getByRole('heading',{name:'Cancelada antiga',exact:true}).waitFor();
  assert.equal(await page.getByText('Data de encerramento não registrada',{exact:true}).count(),2);
  await page.getByLabel('Período de encerramento',{exact:true}).selectOption('semana');
  await page.getByText('Nenhuma tarefa encontrada.',{exact:true}).waitFor();
  await page.getByRole('tab',{name:'Quadro de trabalho',exact:true}).click();
  await page.getByRole('button',{name:'Alterar status de Entrega em aberto',exact:true}).click();
  await page.getByRole('menuitem',{name:'Concluída',exact:true}).click();
  await page.getByRole('button',{name:'Mostrar concluídas desta semana (1)',exact:true}).waitFor();
  assert.equal(await page.getByRole('heading',{name:'Entrega em aberto',exact:true}).count(),0);
  await page.getByRole('button',{name:'Mostrar concluídas desta semana (1)',exact:true}).click();
  await page.getByRole('heading',{name:'Entrega em aberto',exact:true}).waitFor();
  await page.getByText('Tarefa concluída. Disponível no histórico.',{exact:true}).waitFor();
  assert((await db.query("select closed_at from operational_tasks where title='Entrega em aberto'")).rows[0].closed_at);
  await page.getByRole('tab',{name:'Histórico',exact:true}).click();
  await page.getByLabel('Período de encerramento',{exact:true}).selectOption('todos');
  await page.setViewportSize({width:390,height:844});
  const reOpen=page.getByRole('button',{name:'Reabrir Concluída antiga',exact:true});
  assert(await reOpen.evaluate(el=>el.getBoundingClientRect().height>=44));
  await reOpen.click();
  await page.getByText('Tarefa reaberta.',{exact:true}).waitFor();
  await page.getByRole('tab',{name:'Quadro de trabalho',exact:true}).click();
  await page.getByRole('heading',{name:'Concluída antiga',exact:true}).waitFor();
  await page.getByRole('button',{name:'Alterar status de Concluída antiga',exact:true}).click();
  await page.getByRole('menuitem',{name:'Cancelada',exact:true}).click();
  await page.getByRole('button',{name:'Ver tarefas canceladas',exact:true}).click();
  await page.getByRole('heading',{name:'Concluída antiga',exact:true}).waitFor();
  assert.equal((await db.query("select status from operational_tasks where title='Concluída antiga'")).rows[0].status,'cancelada');
  assert.equal((await db.query('select count(*)::int n from operational_tasks')).rows[0].n,3);
  await page.setViewportSize({width:1440,height:1000});
  assert.equal(subscriptionChecks, 0, "Login must never consult the retired purchase gate");
  assert.equal(apiErrors.length, 0, apiErrors.join("\n"));
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(
    process.env.TEST_TASKS_ONLY?"PASS: task board/history, legacy preservation, completion dates, cancellation and mobile reopening":"PASS: browser → RPC → PostgreSQL, pipelines, client onboarding, manual calendar, commercial dashboard, forms, portal and task board/history",
  );
} catch (error) {
  console.error("Original browser failure:", error, {statusCalls,activeMailbox,fixtureConnected,visibility:await page.evaluate(()=>({visibility:document.visibilityState,account:document.querySelector('[data-account-id]')?.getAttribute('data-account-id')})).catch(()=>null)});
  console.error(
    "Browser evidence:",
    await page.locator("body").innerText({timeout:2000}).catch(()=>"Page unavailable"),
    apiErrors,
    errors,
  );
  throw error;
} finally {
  await browser.close();
  await db.close();
}
