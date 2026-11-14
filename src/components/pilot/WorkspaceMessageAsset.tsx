import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { workspaceOperation } from "@/lib/workspaceCommercial";
export default function WorkspaceMessageAsset({
  workspace,
  path,
}: {
  workspace: string;
  path: string;
}) {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["workspace-message-asset", user?.id, workspace, path],
    queryFn: () =>
      workspaceOperation<{ url: string; name: string; kind: string }>(
        "asset_url",
        { workspace_id: workspace, path },
      ),
    staleTime: 1800000,
    retry: 1,
  });
  if (q.isPending) return <p className="text-xs">Carregando anexo…</p>;
  if (q.error) return <p className="text-xs">Anexo indisponível.</p>;
  return (
    <div className="space-y-2">
      {q.data.kind === "imagem" ? (
        <img
          src={q.data.url}
          alt={q.data.name}
          className="max-w-full max-h-72 rounded-lg"
          loading="lazy"
        />
      ) : q.data.kind === "audio" ? (
        <audio
          className="max-w-full"
          controls
          preload="none"
          src={q.data.url}
        />
      ) : q.data.kind === "video" ? (
        <video
          className="max-w-full max-h-72 rounded-lg"
          controls
          preload="metadata"
          src={q.data.url}
        />
      ) : null}
      <a
        href={q.data.url}
        target="_blank"
        rel="noreferrer"
        className="text-xs underline break-all"
      >
        {q.data.name}
      </a>
    </div>
  );
}
