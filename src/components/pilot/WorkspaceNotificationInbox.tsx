import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { workspaceDb } from "@/lib/clientWorkspaces";
import { dateLabel } from "@/lib/workspaceCommercial";
import { Button } from "@/components/ui/button";
export default function WorkspaceNotificationInbox({
  workspace,
}: {
  workspace: string;
}) {
  const { user } = useAuth(),
    client = useQueryClient();
  const key = ["workspace-personal-notifications", user?.id, workspace];
  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      const r = await workspaceDb
        .from("agency_workspace_member_notifications")
        .select("id,title,read_at,created_at")
        .eq("workspace_id", workspace)
        .eq("user_id", user?.id)
        .order("created_at", { ascending: false })
        .limit(30);
      if (r.error) throw r.error;
      return r.data;
    },
    refetchInterval: 10000,
  });
  if (!q.data?.length) return null;
  return (
    <section className="border rounded-xl p-4 space-y-3">
      <h3 className="font-semibold">Suas notificações</h3>
      {q.data.map((n) => (
        <div key={n.id} className="flex justify-between gap-3 text-sm">
          <p className={n.read_at ? "text-muted-foreground" : "font-medium"}>
            {n.title}
            <span className="block text-xs">{dateLabel(n.created_at)}</span>
          </p>
          {!n.read_at && (
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await workspaceDb
                  .from("agency_workspace_member_notifications")
                  .update({ read_at: new Date().toISOString() })
                  .eq("workspace_id", workspace)
                  .eq("id", n.id);
                await client.invalidateQueries({ queryKey: key });
              }}
            >
              Marcar como lida
            </Button>
          )}
        </div>
      ))}
    </section>
  );
}
