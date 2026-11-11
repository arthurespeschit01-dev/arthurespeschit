// Exercise the actual Edge handler; network is replaced with a scoped fixture.
let handler: (req: Request) => Promise<Response>;
const serve = Deno.serve;
Deno.serve = ((fn: typeof handler) => {
  handler = fn;
  return {};
}) as typeof Deno.serve;
await import("./index.ts");
Deno.serve = serve;
Deno.env.set("SUPABASE_URL", "https://fixture.invalid");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "fixture-service-key");

const check = (value: unknown, message: string) => {
  if (!value) throw new Error(message);
};
const token = "a".repeat(64);
const request = (body: unknown) =>
  new Request("https://edge.invalid", {
    method: "POST",
    body: JSON.stringify(body),
  });

Deno.test(
  "portal capability cannot read another client ticket or select tenant from input",
  async () => {
    const originalFetch = globalThis.fetch;
    const inserted: { row: Record<string, unknown> | null } = { row: null };
    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      const url = new URL(String(input));
      const json = (data: unknown) =>
        new Response(JSON.stringify(data), {
          headers: { "Content-Type": "application/json" },
        });
      if (url.pathname.endsWith("/agency_client_portals"))
        return json(
          url.searchParams.get("token") === `eq.${token}`
            ? [{ id: "portal-a", user_id: "owner-a", client_id: "client-a" }]
            : [],
        );
      if (init?.method === "HEAD")
        return new Response(null, { headers: { "Content-Range": "0-0/0" } });
      if (url.pathname.endsWith("/agency_tickets")) {
        if (init?.method === "POST") {
          inserted.row = JSON.parse(String(init.body));
          return json({ id: "created-ticket" });
        }
        check(
          url.searchParams.get("portal_id") === "eq.portal-a",
          "must scope tickets to portal",
        );
        check(
          url.searchParams.get("user_id") === "eq.owner-a",
          "must scope tickets to owner",
        );
        return json([]);
      }
      throw new Error(`Unexpected fixture call: ${url.pathname}`);
    }) as typeof fetch;
    try {
      const unknown = await handler(
        request({ action: "tickets", token: "b".repeat(64) }),
      );
      check(unknown.status === 404, "unknown token denied");
      const crossClient = await handler(
        request({
          action: "messages",
          token,
          ticket_id: "another-client-ticket",
        }),
      );
      check(crossClient.status === 404, "another client ticket denied");
      const create = await handler(
        request({
          action: "new_ticket",
          token,
          title: "Alterar criativo",
          description: "Precisamos de uma nova imagem.",
          category: "design",
          user_id: "attacker",
          client_id: "other-client",
        }),
      );
      check(create.status === 200, "valid ticket accepted");
      check(
        inserted.row?.user_id === "owner-a" &&
          inserted.row?.client_id === "client-a" &&
          inserted.row?.portal_id === "portal-a",
        "tenant always derived from validated capability",
      );
      const invalidCategory = await handler(
        request({
          action: "new_ticket",
          token,
          title: "Teste",
          description: "Teste",
          category: "invalid",
        }),
      );
      check(invalidCategory.status === 400, "unknown category denied");
    } finally {
      globalThis.fetch = originalFetch;
    }
  },
);
