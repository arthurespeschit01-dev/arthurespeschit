import { useQuery } from "@tanstack/react-query";
import { workspaceDb } from "@/lib/clientWorkspaces";
import { dateLabel } from "@/lib/workspaceCommercial";
interface PreviousForm {
  id: string;
  title: string;
  description: string;
  responses: {
    id: string;
    answers: Record<string, unknown>;
    created_at: string;
  }[];
}
export default function AgencyPreviousForms({
  workspace,
}: {
  workspace: string;
}) {
  const q = useQuery({
    queryKey: ["agency-previous-forms", workspace],
    queryFn: async () => {
      const r = await workspaceDb.rpc("agency_account_legacy_forms", {
        p_workspace: workspace,
      });
      if (r.error) throw r.error;
      return r.data as { forms: PreviousForm[] };
    },
  });
  if (q.error)
    return (
      <p role="alert">Não foi possível consultar os formulários anteriores.</p>
    );
  if (!q.data?.forms.length) return null;
  return (
    <section className="space-y-3">
      <h3 className="font-semibold">Formulários da Central</h3>
      {q.data.forms.map((f) => (
        <article key={f.id} className="border rounded-xl p-4 space-y-2">
          <h4 className="font-medium">{f.title}</h4>
          <p className="text-sm">{f.description}</p>
          <details>
            <summary className="cursor-pointer">
              Respostas ({f.responses.length})
            </summary>
            {f.responses.map((r) => (
              <div key={r.id} className="border-t py-3 text-sm">
                <p>{dateLabel(r.created_at)}</p>
                <pre className="whitespace-pre-wrap break-words">
                  {JSON.stringify(r.answers, null, 2)}
                </pre>
              </div>
            ))}
          </details>
        </article>
      ))}
    </section>
  );
}
