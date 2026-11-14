import {
  assertEquals,
  assertThrows,
  assertRejects,
  assert,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  mappedWebhook,
  readWebhookField,
  trackingRedirect,
} from "./workspace-triggers.ts";
Deno.test(
  "webhook maps nested fields, scopes deterministic IDs and rejects unsafe paths",
  async () => {
    const payload = {
      event: { id: "event-123" },
      person: {
        name: "Contato",
        phone: "5511999991234",
        email: "test@example.invalid",
      },
    };
    const map = {
      name: "person.name",
      phone: "person.phone",
      email: "person.email",
      request_id: "event.id",
    };
    const first = await mappedWebhook(payload, map, "hook-a"),
      retry = await mappedWebhook(payload, map, "hook-a"),
      other = await mappedWebhook(payload, map, "hook-b");
    assertEquals(first, retry);
    assert(first.request !== other.request);
    assertEquals(first.contact.phone, "5511999991234");
    assertThrows(() => readWebhookField({}, "constructor.name"));
    assertEquals(
      readWebhookField(Object.create({ inherited: "secret" }), "inherited"),
      "",
    );
    await assertRejects(() =>
      mappedWebhook({ ...payload, event: {} }, map, "hook-a"),
    );
  },
);
Deno.test(
  "tracking redirect preserves real click identifiers and binds WhatsApp text reference",
  () => {
    const target = new URL(
      trackingRedirect({
        destination: "https://wa.me/5511999991234?text=Oi",
        attributes: { utm_source: "google", gclid: "real-click-id" },
        click_id: "11111111-1111-4111-8111-111111111111",
        click_ref: "1234567890abcdef",
      }),
    );
    assertEquals(target.searchParams.get("gclid"), "real-click-id");
    assertEquals(
      target.searchParams.get("text"),
      "Oi\nRef: CG-1234567890abcdef",
    );
    assert(target.searchParams.has("cg_click"));
    assertThrows(() =>
      trackingRedirect({ destination: "javascript:alert(1)" }),
    );
    const external = new URL(
      trackingRedirect({
        destination: "https://example.invalid/form",
        attributes: { utm_campaign: "campaign" },
        click_ref: "1234567890abcdef",
      }),
    );
    assertEquals(external.searchParams.get("text"), null);
  },
);
