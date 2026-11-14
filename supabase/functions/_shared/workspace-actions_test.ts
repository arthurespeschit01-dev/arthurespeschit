import {
  assertEquals,
  assertThrows,
  assertRejects,
  assert,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  validateProvider,
  providerSummary,
  executeWorkspaceAction,
  processWorkspaceActions,
  asset,
  attribution,
} from "./workspace-actions.ts";
import { verifyMetaSignature } from "./workspace-meta.ts";
Deno.test(
  "provider settings preserve secrets without returning them and reject invalid inputs",
  () => {
    const input = validateProvider(
      "meta",
      { pixel_id: "12345678", access_token: "", daily_limit: 20 },
      { access_token: "synthetic-token-retained" },
    );
    assertEquals(input.access_token, "synthetic-token-retained");
    const summary = providerSummary({
      enabled: true,
      credentials: { ...input, verify_token: "private-verification" },
    });
    assert(summary);
    assertEquals(summary.credentials.access_token, undefined);
    assertEquals(summary.credentials.verify_token, undefined);
    assertEquals(summary.configured.access_token, true);
    assertThrows(() =>
      validateProvider("meta", { pixel_id: "https://wrong.invalid" }),
    );
    assertThrows(() => validateProvider("sms", { daily_limit: 0 }));
    assertEquals(
      attribution({
        gclid: "click-id",
        source_url: "javascript:bad",
        ignored: "bad",
      }),
      { gclid: "click-id" },
    );
  },
);
const workspace = "11111111-1111-4111-8111-111111111111";
function mockDb(config: unknown) {
  return {
    rpc: (name: string, args: any) => {
      assertEquals(name, "agency_workspace_provider");
      assertEquals(args.p_workspace, workspace);
      return Promise.resolve({ data: config, error: null });
    },
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        in: () => q,
        gte: () => Promise.resolve({ count: 1, error: null }),
      };
      return q;
    },
  };
}
Deno.test(
  "Meta conversions hash personal fields and keep a stable event ID",
  async () => {
    const original = fetch;
    let request: any;
    globalThis.fetch = async (url, init) => {
      assertEquals(new URL(String(url)).hostname, "graph.facebook.com");
      request = JSON.parse(String(init?.body));
      return Response.json({ events_received: 1 });
    };
    try {
      const db = mockDb({
        enabled: true,
        credentials: {
          pixel_id: "12345678",
          access_token: "synthetic",
          daily_limit: 100,
        },
      });
      const a = {
        id: "event-id",
        workspace_id: workspace,
        action: "meta_event",
        created_at: "2026-11-13T20:00:00Z",
        payload: {
          lead_id: "lead-id",
          phone: "5511999990000",
          email: "contact@example.invalid",
          event_name: "Lead",
          attributes: {
            fbc: "fb.1.fixture",
            source_url: "https://example.invalid/form",
          },
          value: 100,
        },
      };
      const result = await executeWorkspaceAction(db, a, () =>
        Promise.reject("not used"),
      );
      assertEquals(result.provider, a.id);
      assertEquals(request.data[0].event_id, a.id);
      assertEquals(request.data[0].custom_data.value, 100);
      assertEquals(request.data[0].user_data.ph[0].length, 64);
      assert(!JSON.stringify(request).includes(a.payload.phone));
      assert(!JSON.stringify(request).includes(a.payload.email));
    } finally {
      globalThis.fetch = original;
    }
  },
);
Deno.test(
  "Email uses provider idempotency, SMS validates length, and missing provider fails explicitly",
  async () => {
    const original = fetch;
    globalThis.fetch = async (url, init) => {
      assertEquals(String(url), "https://api.resend.com/emails");
      assertEquals(
        new Headers(init?.headers).get("Idempotency-Key"),
        "email-action",
      );
      return Response.json({ id: "confirmed-email" });
    };
    try {
      const a = {
        id: "email-action",
        workspace_id: workspace,
        action: "send_email",
        payload: {
          email: "contact@example.invalid",
          subject: "Assunto",
          text: "Conteúdo",
        },
      };
      const result = await executeWorkspaceAction(
        mockDb({
          enabled: true,
          credentials: { api_key: "synthetic", from: "sender@example.invalid" },
        }),
        a,
        () => Promise.reject("not used"),
      );
      assertEquals(result.provider, "confirmed-email");
      await assertRejects(() =>
        executeWorkspaceAction(mockDb(null), a, () =>
          Promise.reject("not used"),
        ),
      );
      await assertRejects(() =>
        executeWorkspaceAction(
          mockDb({ enabled: true, credentials: {} }),
          {
            ...a,
            action: "send_sms",
            payload: { phone: "5511999990000", text: "x".repeat(161) },
          },
          () => Promise.reject("not used"),
        ),
      );
    } finally {
      globalThis.fetch = original;
    }
  },
);
Deno.test(
  "ambiguous provider failure is not automatically resent",
  async () => {
    const original = fetch;
    let claims = 0,
      sends = 0;
    const finishes: any[] = [];
    const db: any = mockDb({
      enabled: true,
      credentials: { api_key: "synthetic", from: "sender@example.invalid" },
    });
    const providerRpc = db.rpc;
    db.rpc = (name: string, args: any) =>
      name === "agency_workspace_claim_action"
        ? Promise.resolve({
            data:
              claims++ === 0
                ? {
                    id: "a",
                    workspace_id: workspace,
                    action: "send_email",
                    payload: {
                      email: "contact@example.invalid",
                      subject: "S",
                      text: "T",
                    },
                  }
                : null,
            error: null,
          })
        : name === "agency_workspace_finish_action"
          ? (finishes.push(args), Promise.resolve({ data: null, error: null }))
          : providerRpc(name, args);
    globalThis.fetch = async () => {
      sends++;
      throw new TypeError("Connection interrupted");
    };
    try {
      await processWorkspaceActions(db, workspace, () =>
        Promise.reject("not used"),
      );
      assertEquals(sends, 1);
      assertEquals(finishes[0].p_status, "uncertain");
    } finally {
      globalThis.fetch = original;
    }
  },
);
Deno.test(
  "Meta webhook signatures and asset scope are checked before accepting data",
  async () => {
    const raw = '{"object":"page"}',
      secret = "synthetic-secret";
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const mac = [
      ...new Uint8Array(
        await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)),
      ),
    ]
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
    assertEquals(await verifyMetaSignature(raw, "sha256=" + mac, secret), true);
    assertEquals(
      await verifyMetaSignature(raw + " ", "sha256=" + mac, secret),
      false,
    );
    assertEquals(await verifyMetaSignature(raw, "bad", secret), false);
    await assertRejects(() =>
      asset({}, workspace, "other-workspace/outgoing/id/file.png"),
    );
  },
);
Deno.test(
  "new Google Ads integrations use the supported Data Manager endpoint",
  async () => {
    const original = fetch;
    const calls: any[] = [];
    globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), body: String(init?.body) });
      if (String(url) === "https://oauth2.googleapis.com/token")
        return Response.json({ access_token: "scoped-access" });
      assertEquals(
        String(url),
        "https://datamanager.googleapis.com/v1/events:ingest",
      );
      const body = JSON.parse(String(init?.body));
      assertEquals(
        body.destinations[0].operatingAccount.accountType,
        "GOOGLE_ADS",
      );
      assertEquals(body.events[0].adIdentifiers.gclid, "actual-click-id");
      assertEquals(body.events[0].transactionId, "unique-conversion");
      return Response.json({ requestId: "confirmed-import" });
    };
    try {
      const db = mockDb({
        enabled: true,
        credentials: {
          customer_id: "1234567890",
          conversion_action: "1234",
          client_id: "client",
          client_secret: "secret",
          refresh_token: "refresh",
        },
      });
      const done = await executeWorkspaceAction(
        db,
        {
          id: "unique-conversion",
          workspace_id: workspace,
          created_at: "2026-11-13T20:00:00Z",
          action: "google_conversion",
          payload: { attributes: { gclid: "actual-click-id" }, value: 50 },
        },
        () => Promise.reject("not used"),
      );
      assertEquals(done.provider, "confirmed-import");
      assertEquals(calls.length, 2);
    } finally {
      globalThis.fetch = original;
    }
  },
);
