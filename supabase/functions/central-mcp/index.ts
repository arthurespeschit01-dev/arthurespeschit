import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.2";
import { createMcpHandler } from "../_shared/central-mcp.ts";
const url = Deno.env.get("SUPABASE_URL")!,
  anon = Deno.env.get("SUPABASE_ANON_KEY")!;
const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
Deno.serve(
  createMcpHandler(
    db,
    async (token) => {
      const auth = createClient(url, anon, {
        global: { headers: { Authorization: "Bearer " + token } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await auth.auth.getUser();
      if (error || !data.user) throw Error("Sessão inválida.");
      const access = await auth.rpc("agency_central_access");
      return {
        id: data.user.id,
        confirmed: !!data.user.email_confirmed_at,
        central: !access.error && access.data === true,
      };
    },
    Deno.env.get("AGENCY_APP_URL") || "https://www.centraldogestor.site",
  ),
);
