import {
  assertEquals,
  assertRejects,
  assert,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  cloudWebhookEvents,
  signedCloudEvents,
  cloudMessage,
  verifyCloudNumber,
  cloudWithinWindow,
} from "./workspace-cloud.ts";
import { matchesOptOut } from "./workspace-whatsapp-preferences.ts";
const c = { waba_id: "123456", cloud_phone_id: "654321" };
const payload = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: c.waba_id,
      changes: [
        {
          field: "messages",
          value: {
            metadata: { phone_number_id: c.cloud_phone_id },
            messages: [
              {
                id: "wamid.fixture",
                from: "5511999990000",
                timestamp: String(Math.floor(Date.now() / 1000)),
                type: "text",
                text: { body: "Olá" },
              },
            ],
          },
        },
      ],
    },
  ],
};
Deno.test(
  "Cloud routes only the authorized WABA and number and validates HMAC",
  async () => {
    assertEquals(cloudWebhookEvents(payload, c).length, 1);
    assertEquals(cloudWebhookEvents(payload, { ...c, waba_id: "111111" }), []);
    assertEquals(
      cloudWebhookEvents(payload, { ...c, cloud_phone_id: "111111" }),
      [],
    );
    await assertRejects(() =>
      signedCloudEvents(
        JSON.stringify(payload),
        "sha256=" + "0".repeat(64),
        "fixture-secret",
        c,
      ),
    );
    const raw = JSON.stringify(payload);
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode("fixture-secret"),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const bytes = new Uint8Array(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)),
    );
    const sig =
      "sha256=" +
      [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    assertEquals(
      (await signedCloudEvents(raw, sig, "fixture-secret", c))[0].direction,
      "entrada",
    );
    await assertRejects(() =>
      signedCloudEvents(raw + " ", sig, "fixture-secret", c),
    );
  },
);
Deno.test("Coexistence echoes are outgoing and preserve the contact", () => {
  const p = structuredClone(payload) as any;
  p.entry[0].changes[0].field = "smb_message_echoes";
  const v = p.entry[0].changes[0].value;
  v.message_echoes = v.messages.map((m: any) => ({
    ...m,
    to: m.from,
    from: "5511888880000",
  }));
  delete v.messages;
  const e = cloudWebhookEvents(p, c)[0];
  assertEquals(e.direction, "saida");
  assertEquals(e.phone, "5511999990000");
});
Deno.test(
  "Cloud dispatch validates text/media and cannot target W-API group actions",
  () => {
    assertEquals(
      cloudMessage("message/send-text", {
        phone: "5511999990000",
        message: "Olá",
      }).type,
      "text",
    );
    assertEquals(
      cloudMessage("message/send-image", {
        phone: "5511999990000",
        image: "https://assets.invalid/photo",
        caption: "Foto",
      }).type,
      "image",
    );
    let refused = false;
    try {
      cloudMessage("group/create-group", { phone: "5511999990000" });
    } catch {
      refused = true;
    }
    assert(refused);
  },
);
Deno.test(
  "Cloud rejects an asset not granted by the authorized WABA",
  async () => {
    await assertRejects(() =>
      verifyCloudNumber("123456", "654321", "fixture-token", async () =>
        Response.json({ data: [{ id: "111111" }] }),
      ),
    );
  },
);
Deno.test(
  "Cloud cannot send free text without an actual incoming service window",
  async () => {
    const chain: any = {
      select() {
        return this;
      },
      eq() {
        return this;
      },
      gte() {
        return this;
      },
      limit() {
        return Promise.resolve({ data: [], error: null });
      },
    };
    await assertRejects(() =>
      cloudWithinWindow({ from: () => chain }, c, "5511999990000"),
    );
  },
);
Deno.test(
  "Opt-out matches phrases case/accent insensitively without accidental word fragments",
  () => {
    assert(
      matchesOptOut("Não quero mais RECEBER, obrigado", [
        "nao quero mais receber",
      ]),
    );
    assert(matchesOptOut("Por favor, parar.", ["parar"]));
    assertEquals(matchesOptOut("Pode preparar a visita?", ["parar"]), false);
  },
);

Deno.test(
  "WABA-only coexistence resolves only a unique authorized Business app number",
  async () => {
    let calls = 0;
    const request: typeof fetch = async () => {
      calls++;
      return Response.json(
        calls === 1
          ? {
              data: [
                {
                  id: "654321",
                  display_phone_number: "5511999990000",
                  is_on_biz_app: true,
                  platform_type: "CLOUD_API",
                },
                {
                  id: "777777",
                  is_on_biz_app: false,
                  platform_type: "CLOUD_API",
                },
              ],
            }
          : {
              id: "654321",
              display_phone_number: "5511999990000",
              is_on_biz_app: true,
              platform_type: "CLOUD_API",
            },
      );
    };
    const result = await verifyCloudNumber(
      "123456",
      "",
      "fixture-token",
      request,
      true,
    );
    assertEquals(result.id, "654321");
    assertEquals(result.phone, "5511999990000");
    await assertRejects(() =>
      verifyCloudNumber("123456", "", "fixture-token", request, false),
    );
  },
);
Deno.test(
  "WABA-only completion cannot guess among multiple or paginated phone assets",
  async () => {
    const candidates = [
      { id: "654321", is_on_biz_app: true, platform_type: "CLOUD_API" },
      { id: "777777", is_on_biz_app: true, platform_type: "CLOUD_API" },
    ];
    await assertRejects(() =>
      verifyCloudNumber(
        "123456",
        "",
        "fixture-token",
        async () => Response.json({ data: candidates }),
        true,
      ),
    );
    await assertRejects(() =>
      verifyCloudNumber(
        "123456",
        "",
        "fixture-token",
        async () =>
          Response.json({
            data: [candidates[0]],
            paging: { next: "https://graph.facebook.com/next" },
          }),
        true,
      ),
    );
    await assertRejects(() =>
      verifyCloudNumber(
        "123456",
        "",
        "fixture-token",
        async () =>
          Response.json({
            data: [
              {
                id: "777777",
                is_on_biz_app: false,
                platform_type: "CLOUD_API",
              },
            ],
          }),
        true,
      ),
    );
  },
);
