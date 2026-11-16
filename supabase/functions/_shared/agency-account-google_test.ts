import {
  assertEquals,
  assert,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { syncAgencyAccountGoogle } from "./agency-account-google.ts";
Deno.test("client subaccounts never read principal appointments", async () => {
  let reads = 0;
  await syncAgencyAccountGoogle(
    {
      rpc: () => Promise.resolve({ data: null, error: null }),
      from: () => {
        reads++;
        throw Error("No");
      },
    },
    "client",
    "synthetic",
  );
  assertEquals(reads, 0);
});
Deno.test(
  "principal calendar sync scopes owner, keeps event IDs, snapshots edits and handles cancellation/deletion",
  async () => {
    const owner = "11111111-1111-4111-8111-111111111111",
      workspace = "22222222-2222-4222-8222-222222222222";
    const row = {
      id: "33333333-3333-4333-8333-333333333333",
      user_id: owner,
      title: "Meeting",
      notes: "Notes",
      starts_at: "2026-12-01T12:00:00Z",
      ends_at: "2026-12-01T12:30:00Z",
      status: "agendado",
      updated_at: "2026-11-16T12:00:00Z",
      google_synced_at: null,
    };
    const updates: any[] = [],
      requests: any[] = [];
    let acknowledged = false;
    const db = {
      rpc: (name: string, args: any) => {
        assertEquals(args.p_workspace, workspace);
        if (name === "agency_account_calendar_pending")
          return Promise.resolve({ data: [row], error: null });
        if (name === "agency_account_owner")
          return Promise.resolve({ data: owner, error: null });
        if (args.p_event) acknowledged = true;
        return Promise.resolve({
          data: args.p_event ? [] : ["ca44444444444444448444444444444444"],
          error: null,
        });
      },
      from: (table: string) => {
        assertEquals(table, "agency_appointments");
        const q = {
          select: () => q,
          eq: (key: string, value: string) => {
            if (key === "user_id") assertEquals(value, owner);
            return q;
          },
          order: () => q,
          limit: () => Promise.resolve({ data: [row], error: null }),
          update: (v: any) => {
            updates.push(v);
            return q;
          },
          then: (r: any) => Promise.resolve({ error: null }).then(r),
        };
        return q;
      },
    };
    const fetcher: typeof fetch = async (input, init) => {
      assertEquals(new URL(String(input)).hostname, "www.googleapis.com");
      assertEquals(
        new Headers(init?.headers).get("Authorization"),
        "Bearer synthetic",
      );
      requests.push({
        url: String(input),
        method: init?.method,
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      return Response.json({}, { status: init?.method === "PUT" ? 404 : 200 });
    };
    await syncAgencyAccountGoogle(db, workspace, "synthetic", fetcher);
    assert(acknowledged);
    assertEquals(requests[0].method, "DELETE");
    assertEquals(requests[1].method, "PUT");
    assertEquals(requests[2].method, "POST");
    assertEquals(requests[2].body.id, "ca" + row.id.replaceAll("-", ""));
    assertEquals(updates[0].google_synced_at, row.updated_at);
    requests.length = 0;
    row.status = "cancelado";
    await syncAgencyAccountGoogle(db, workspace, "synthetic", fetcher);
    assertEquals(requests[1].method, "DELETE");
    assert(requests[1].url.endsWith("ca" + row.id.replaceAll("-", "")));
  },
);
