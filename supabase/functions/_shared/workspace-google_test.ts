import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { googleBusy, syncGoogle, startGoogle } from "./workspace-google.ts";
Deno.test(
  "Google sync uses scoped credentials, deterministic event IDs and preserves edit snapshots",
  async () => {
    const original = fetch,
      updates: Record<string, unknown>[] = [],
      requests: { url: string; method: string; body: any }[] = [];
    const workspace = "11111111-1111-4111-8111-111111111111",
      appointment = {
        id: "22222222-2222-4222-8222-222222222222",
        workspace_id: workspace,
        name: "Contato de teste",
        phone: "5511999990000",
        email: "test@example.invalid",
        notes: "Teste local",
        starts_at: "2026-11-16T12:00:00Z",
        ends_at: "2026-11-16T12:30:00Z",
        status: "confirmed",
        updated_at: "2026-11-13T10:00:00Z",
        google_synced_at: null,
      };
    const db = {
      rpc: (_name: string, args: Record<string, unknown>) => {
        assertEquals(args.p_workspace, workspace);
        return Promise.resolve({
          data: {
            access_token: "synthetic-access",
            refresh_token: "synthetic-refresh",
            expires_at: "2099-01-01T00:00:00Z",
          },
          error: null,
        });
      },
      from: (table: string) => {
        assertEquals(table, "agency_workspace_appointments");
        const builder = {
          select: () => builder,
          eq: (key: string, value: string) => {
            if (key === "workspace_id") assertEquals(value, workspace);
            return builder;
          },
          order: () => builder,
          limit: () => Promise.resolve({ data: [appointment], error: null }),
          update: (value: Record<string, unknown>) => {
            updates.push(value);
            return builder;
          },
          then: (resolve: (v: unknown) => unknown) =>
            Promise.resolve({ data: null, error: null }).then(resolve),
        };
        return builder;
      },
    };
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      assertEquals(new URL(url).hostname, "www.googleapis.com");
      assertEquals(
        new Headers(init?.headers).get("Authorization"),
        "Bearer synthetic-access",
      );
      requests.push({
        url,
        method: init?.method || "GET",
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      return new Response("{}", { status: init?.method === "PUT" ? 404 : 201 });
    };
    try {
      await syncGoogle(db, workspace);
      assertEquals(requests.length, 2);
      assertEquals(
        requests[0].url.endsWith("/events/cg22222222222242228222222222222222"),
        true,
      );
      assertEquals(requests[1].body.id, "cg22222222222242228222222222222222");
      assertEquals(updates[0].google_synced_at, appointment.updated_at);
      assertEquals(updates[0].google_sync_error, null);
    } finally {
      globalThis.fetch = original;
    }
  },
);
Deno.test("Google busy lookup fails closed on provider errors", async () => {
  const original = fetch;
  const db = {
    rpc: () =>
      Promise.resolve({
        data: { access_token: "synthetic", expires_at: "2099-01-01T00:00:00Z" },
        error: null,
      }),
  };
  globalThis.fetch = async () =>
    Response.json({
      calendars: { primary: { errors: [{ reason: "forbidden" }] } },
    });
  try {
    await assertRejects(() =>
      googleBusy(
        db,
        "workspace",
        "2026-11-16T12:00:00Z",
        "2026-11-16T13:00:00Z",
      ),
    );
  } finally {
    globalThis.fetch = original;
  }
});
