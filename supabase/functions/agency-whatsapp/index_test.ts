let handler: (request: Request) => Promise<Response>;
const originalServe = Deno.serve;
Deno.serve = ((callback: typeof handler) => {
  handler = callback;
  return {};
}) as typeof Deno.serve;
await import("./index.ts");
Deno.serve = originalServe;
Deno.env.set("SUPABASE_URL", "https://fixture.invalid");
Deno.env.set("SUPABASE_ANON_KEY", "anon-fixture");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-fixture");
const check = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const request = (body: unknown, query = "") =>
  new Request(`https://edge.invalid${query}`, {
    method: "POST",
    headers: { authorization: "Bearer fixture" },
    body: JSON.stringify(body),
  });
const secret = "a".repeat(64);

const accountFixtures=(next:typeof fetch):typeof fetch => ((input:RequestInfo|URL,init?:RequestInit)=>{
 const url=new URL(String(input));
 if(url.pathname.endsWith('/agency_whatsapp_messages') && init?.method==='HEAD')return Promise.resolve(new Response(null,{headers:{'content-range':'*/0'}}));
 if(url.pathname.endsWith('/agency_whatsapp_account_state'))return Promise.resolve(json(init?.method&&init.method!=='GET'?null:[{user_id:'owner-a',account_id:'account-a',connected:true,checked_at:new Date().toISOString()}]));
 if(url.pathname.endsWith('/agency_whatsapp_accounts'))return Promise.resolve(json({id:'account-a',phone:'5511999990000'}));
 return next(input,init);
}) as typeof fetch;


Deno.test(
  "WhatsApp requires login and keeps provider credentials server-side",
  async () => {
    const originalFetch = globalThis.fetch;
    let loggedIn = false;
    globalThis.fetch = accountFixtures(((input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.includes("/auth/"))
        return Promise.resolve(
          loggedIn
            ? json({ id: "owner-a" })
            : json({ message: "Invalid JWT" }, 401),
        );
      if (url.pathname.endsWith("/agency_whatsapp_connections")) {
        check(
          url.searchParams.get("user_id") === "eq.owner-a",
          "connection scoped to authenticated owner",
        );
        return Promise.resolve(
          json([
            {
              user_id: "owner-a",
              instance_id: "dedicated",
              token: "provider-secret-fixture",
              webhook_secret: secret,
              receiving_enabled: true,
            },
          ]),
        );
      }
      if (url.hostname === "api.w-api.app")
        return Promise.resolve(
          json({ connected: true, connectedPhone: "5511999990000" }),
        );
      throw new Error("Unexpected fixture call");
    }) as typeof fetch);
    try {
      check(
        (await handler(request({ action: "status" }))).status === 401,
        "login is mandatory",
      );
      loggedIn = true;
      const result = await handler(
        request({ action: "status", user_id: "attacker" }),
      );
      const text = await result.text();
      check(
        result.status === 200 && text.includes("5511999990000"),
        "connection status rendered",
      );
      check(
        !text.includes("provider-secret-fixture") && text.includes("webhook_url"),
        "provider token never returned; authenticated owner can configure their webhook",
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  },
);

Deno.test(
  "WhatsApp webhook rejects wrong capabilities and derives owner from connection",
  async () => {
    const originalFetch = globalThis.fetch;
    const inserted: { value?: Record<string, unknown> } = {};
    globalThis.fetch = accountFixtures(((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/agency_whatsapp_connections"))
        return Promise.resolve(
          json(
            url.searchParams.get("webhook_secret") === `eq.${secret}`
              ? [{ user_id: "owner-a", instance_id: "dedicated" }]
              : [],
          ),
        );
      if(url.pathname.endsWith('/rpc/agency_whatsapp_account_metadata'))return Promise.resolve(json(null));
      if (
        url.pathname.endsWith("/agency_whatsapp_messages") &&
        init?.method === "POST"
      ) {
        inserted.value = JSON.parse(String(init.body));
        return Promise.resolve(json(null, 201));
      }
      throw new Error("Unexpected fixture call");
    }) as typeof fetch);
    try {
      const payload = {
        instanceId: "dedicated",
        connectedPhone:"5511999990000",
        user_id: "attacker",
        data: {
          messageId: "received-1",
          sender: { id: "5511999990000@s.whatsapp.net" },
          msgContent: { conversation: "Quero uma proposta" },
        },
      };
      check(
        (await handler(request(payload, `?webhook=${"b".repeat(64)}`)))
          .status === 401,
        "wrong webhook secret rejected",
      );
      check(
        (
          await handler(
            request(
              { ...payload, instanceId: "another" },
              `?webhook=${secret}`,
            ),
          )
        ).status === 403,
        "wrong instance rejected",
      );
      check(
        (await handler(request(payload, `?webhook=${secret}`))).status === 200,
        "valid inbound message accepted",
      );
      check(
        inserted.value?.user_id === "owner-a" &&
          inserted.value?.direction === "entrada",
        "owner cannot be selected by caller",
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  },
);

Deno.test(
  "WhatsApp duplicate sends do not contact provider twice; foreign cards are rejected",
  async () => {
    const originalFetch = globalThis.fetch;
    let foreignCard = false;
    globalThis.fetch = accountFixtures(((input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.includes("/auth/"))
        return Promise.resolve(json({ id: "owner-a" }));
      if (url.pathname.endsWith("/agency_whatsapp_connections"))
        return Promise.resolve(
          json([{ instance_id: "dedicated", token: "fixture" }]),
        );
      if (url.pathname.endsWith("/agency_pipeline_cards")) {
        check(
          url.searchParams.get("user_id") === "eq.owner-a",
          "card owner must be checked",
        );
        return Promise.resolve(
          json(
            foreignCard
              ? []
              : [
                  {
                    id: "card-a",
                    phone: "11999990000",
                    pipeline_id: "pipeline-a",
                  },
                ],
          ),
        );
      }
      if (url.pathname.endsWith("/agency_pipelines"))
        return Promise.resolve(json([{ id: "pipeline-a" }]));
      if (url.pathname.endsWith("/agency_whatsapp_messages"))
        return Promise.resolve(
          json([
            {
              id: "already-sent",
              status: "enviado",
              phone: "5511999990000",
              body: "Olá",
            },
          ]),
        );
      if(url.hostname==='api.w-api.app' && url.pathname.endsWith('/instance/fetch-instance'))return Promise.resolve(json({connected:true,connectedPhone:'5511999990000'}));
      throw new Error("Provider send must not be called for a duplicate request");
    }) as typeof fetch);
    try {
      const payload = {
        action: "send",
        card_id: "card-a",
        text: "Olá",
        request_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      };
      check(
        (await handler(request(payload))).status === 200,
        "already-sent request returns recorded result",
      );
      foreignCard = true;
      check(
        (await handler(request(payload))).status === 404,
        "another owner card cannot send",
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  },
);

Deno.test(
  "WhatsApp QR binds the callback to its owner and rejects external image URLs",
  async () => {
    const originalFetch = globalThis.fetch;
    let externalQr = false;
    let callbackConfigured = false;
    globalThis.fetch = accountFixtures(((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname.includes("/auth/"))
        return Promise.resolve(json({ id: "owner-a" }));
      if (url.pathname.endsWith("/agency_whatsapp_connections")) {
        check(
          url.searchParams.get("user_id") === "eq.owner-a",
          "connection belongs to authenticated owner",
        );
        return Promise.resolve(
          init?.method === "PATCH"
            ? json(null)
            : json([
                {
                  instance_id: "dedicated",
                  token: "provider-fixture",
                  webhook_secret: secret,
                },
              ]),
        );
      }
      if (url.hostname === "api.w-api.app") {
        check(
          url.searchParams.get("instanceId") === "dedicated",
          "dedicated instance selected",
        );
        if (url.pathname.endsWith("/webhook/update-webhook-received")) {
          const body = JSON.parse(String(init?.body));
          check(
            body.value ===
              `https://fixture.invalid/functions/v1/agency-whatsapp?webhook=${secret}`,
            "callback uses server-generated capability",
          );
          callbackConfigured = true;
          return Promise.resolve(json({ ok: true }));
        }
        return Promise.resolve(
          json({
            qrcode: externalQr
              ? "https://external.invalid/private-image"
              : "data:image/png;base64," + "b".repeat(80),
          }),
        );
      }
      throw new Error("Unexpected fixture call");
    }) as typeof fetch);
    try {
      const qr = await handler(request({ action: "connect" }));
      const body = await qr.json();
      check(
        qr.status === 200 && body.qrcode.startsWith("data:image/png;base64,"),
        "QR available to scan",
      );
      check(
        callbackConfigured && !JSON.stringify(body).includes(secret),
        "webhook capability never returned to browser",
      );
      externalQr = true;
      check(
        (await handler(request({ action: "connect" }))).status === 502,
        "external image URLs not exposed",
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  },
);

Deno.test('Central mirrors confirmed sends to Vértice without sending WhatsApp twice; failures stay queued',async()=>{
 const {mirrorToVertice,flushMirrors}=await import('../_shared/agency-whatsapp-accounts.ts');
 const originalFetch=globalThis.fetch;let deliveries=0;let accepted=false;let pending:any=null;
 const db:any={from(table:string){check(table==='agency_whatsapp_mirror_events','only private delivery outbox is used');return {async upsert(value:any){pending=value;return {error:null}},select(){return this},eq(){return this},is(){return this},order(){return this},limit(){return Promise.resolve({data:pending&&!accepted?[{message_id:pending.message_id,payload:pending.payload}]:[],error:null})},update(){accepted=true;return this},then(resolve:any){return Promise.resolve({error:null}).then(resolve)}}}};
 globalThis.fetch=((input:RequestInfo|URL,init?:RequestInit)=>{const url=new URL(String(input));check(url.hostname==='vertice-gmn.vercel.app','mirror never calls W-API send endpoint');deliveries++;const body=JSON.parse(String(init?.body));check(body.action==='receive'&&body.message.source_number==='553171789803','captured sender number accompanies the mirror');return Promise.resolve(json({},deliveries===1?503:200))}) as typeof fetch;
 try{
  const conn={user_id:'owner-a',instance_id:'same',bridge_url:'https://vertice-gmn.vercel.app/api/central-whatsapp',webhook_secret:secret};
  const message={id:'message-a',account_id:'account-a',provider_message_id:'provider-a',phone:'5511999990000',body:'Confirmada',created_at:new Date().toISOString()};
  check(!(await mirrorToVertice(db,conn,message,'553171789803')).delivered,'failed mirror does not pretend success');
  check(!!pending,'confirmed message remains in durable outbox');
  await flushMirrors(db,conn);check(accepted&&deliveries===2,'retry delivers the history record without another WhatsApp send');
 }finally{globalThis.fetch=originalFetch}
});
