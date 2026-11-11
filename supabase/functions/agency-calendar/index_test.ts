let handler: (req: Request) => Promise<Response>;
const serve = Deno.serve;
Deno.serve = ((fn: typeof handler) => {
  handler = fn;
  return {};
}) as typeof Deno.serve;
await import("./index.ts");
Deno.serve = serve;
for (const [key, value] of Object.entries({
  SUPABASE_URL: "https://fixture.invalid",
  SUPABASE_ANON_KEY: "anon-fixture",
  SUPABASE_SERVICE_ROLE_KEY: "service-fixture",
  GOOGLE_CALENDAR_CLIENT_ID: "client-fixture",
  GOOGLE_CALENDAR_CLIENT_SECRET: "secret-fixture",
  AGENCY_APP_URL: "https://agency.invalid",
}))
  Deno.env.set(key, value);
const check = (value: unknown, message: string) => {
  if (!value) throw new Error(message);
};

Deno.test(
  "calendar callback consumes state once and never returns provider tokens to browser",
  async () => {
    const originalFetch = globalThis.fetch;
    let consumed = false;
    let stored = false;
    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      const url = new URL(String(input));
      const json = (data: unknown) =>
        new Response(JSON.stringify(data), {
          headers: { "Content-Type": "application/json" },
        });
      if (url.pathname.endsWith("/agency_calendar_states")) {
        check(init?.method === "DELETE", "state must be consumed atomically");
        check(
          url.searchParams.get("expires_at")?.startsWith("gt."),
          "state expiry must be verified",
        );
        const result = consumed ? [] : [{ user_id: "owner-a" }];
        consumed = true;
        return json(result);
      }
      if (url.hostname === "oauth2.googleapis.com")
        return json({
          access_token: "provider-access",
          refresh_token: "provider-refresh",
          expires_in: 3600,
          scope: "https://www.googleapis.com/auth/calendar.events",
        });
      if (url.pathname.endsWith("/agency_calendar_connections")) {
        stored = true;
        return new Response(null, { status: 201 });
      }
      throw new Error("Unexpected network call");
    }) as typeof fetch;
    try {
      const url = `https://edge.invalid?callback=1&state=${"a".repeat(64)}&code=fixture`;
      const result = await handler(new Request(url));
      check(
        result.status === 303 &&
          result.headers.get("location") ===
            "https://agency.invalid/comercial?agenda=conectada",
        "fixed safe redirect",
      );
      check(stored, "tokens stored server-side");
      check(
        !(await result.text()).includes("provider-"),
        "tokens never sent to browser",
      );
      const replay = await handler(new Request(url));
      check(replay.status === 400, "state replay denied");
    } finally {
      globalThis.fetch = originalFetch;
    }
  },
);

Deno.test("calendar API requires an authenticated user", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(JSON.stringify({ message: "Invalid JWT" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    )) as typeof fetch;
  try {
    const result = await handler(
      new Request("https://edge.invalid", {
        method: "POST",
        headers: { authorization: "Bearer invalid-fixture" },
        body: JSON.stringify({ action: "list" }),
      }),
    );
    check(result.status === 401, "unauthenticated access denied");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
