import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { workspaceDb, money } from "@/lib/clientWorkspaces";
import { selectClass } from "@/lib/workspaceCommercial";
interface Metrics {
  conversations: number;
  meta: number;
  google: number;
  other: number;
  waiting: number;
  never_answered: number;
  answered: number;
  avg_seconds: number | null;
  median_seconds: number | null;
  opportunities: number;
  won: number;
  won_value: number;
  daily: { day: string; meta: number; google: number; other: number }[];
}
export default function WorkspaceSalesDashboard({
  workspace,
}: {
  workspace: string;
}) {
  const { user } = useAuth();
  const [days, setDays] = useState(30);
  const q = useQuery({
    queryKey: ["workspace-conversation-metrics", user?.id, workspace, days],
    queryFn: async () => {
      const until = new Date(),
        from = new Date(until.getTime() - days * 86400000);
      const r = await workspaceDb.rpc("agency_workspace_conversation_metrics", {
        p_workspace: workspace,
        p_from: from.toISOString(),
        p_until: until.toISOString(),
      });
      if (r.error) throw r.error;
      return r.data as Metrics;
    },
    refetchInterval: 30000,
  });
  const time = (s: number | null) =>
    s == null
      ? "Sem amostra"
      : s < 60
        ? `${Math.round(s)} s`
        : s < 3600
          ? `${Math.round(s / 60)} min`
          : `${(s / 3600).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;
  const m = q.data;
  return (
    <section className="space-y-4 border rounded-xl p-5 bg-card">
      <header className="flex flex-wrap justify-between gap-3">
        <div>
          <h2 className="font-semibold text-xl">
            Conversas, atendimento e vendas
          </h2>
          <p className="text-sm text-muted-foreground">
            Contatos cuja primeira mensagem recebida no sistema ocorreu no
            período.
          </p>
        </div>
        <select
          aria-label="Período das conversas"
          className={selectClass}
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          {[7, 30, 90].map((n) => (
            <option key={n} value={n}>
              Últimos {n} dias
            </option>
          ))}
        </select>
      </header>
      {q.isPending && <p role="status">Calculando indicadores…</p>}
      {q.error && (
        <p role="alert" className="text-destructive">
          {q.error.message}
        </p>
      )}
      {m && (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            {[
              ["Novas conversas observadas", m.conversations],
              ["Meta Ads", m.meta],
              ["Google Ads", m.google],
              ["Outro caminho", m.other],
              ["Esperando resposta", m.waiting],
              ["Sem nenhuma resposta", m.never_answered],
              ["Primeira resposta · média", time(m.avg_seconds)],
              ["Primeira resposta · mediana", time(m.median_seconds)],
            ].map(([l, v]) => (
              <article key={l} className="border rounded-lg p-3">
                <p className="text-xs text-muted-foreground">{l}</p>
                <p className="text-2xl font-semibold mt-1">{v}</p>
              </article>
            ))}
          </div>
          <div className="grid sm:grid-cols-4 gap-3">
            {[
              ["Conversas", m.conversations],
              ["Contatos no CRM", m.opportunities],
              ["Ganhos no estado atual", m.won],
              ["Valor dos ganhos", money(m.won_value)],
            ].map(([l, v]) => (
              <div key={l} className="bg-secondary/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">{l}</p>
                <strong>{v}</strong>
              </div>
            ))}
          </div>
          <details>
            <summary className="text-sm cursor-pointer">
              Conversas por dia e origem
            </summary>
            <div className="overflow-x-auto">
              <table className="w-full text-sm mt-3">
                <thead>
                  <tr>
                    {["Dia (São Paulo)", "Meta", "Google", "Outro caminho"].map(
                      (v) => (
                        <th key={v} className="p-2 text-left">
                          {v}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {m.daily.map((d) => (
                    <tr key={d.day} className="border-t">
                      <td className="p-2">
                        {d.day.split("-").reverse().join("/")}
                      </td>
                      <td className="p-2">{d.meta}</td>
                      <td className="p-2">{d.google}</td>
                      <td className="p-2">{d.other}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!m.daily.length && (
                <p className="text-sm py-3">
                  Nenhuma conversa observada no período.
                </p>
              )}
            </div>
          </details>
          <p className="text-xs text-muted-foreground">
            Amostra de resposta: {m.answered} conversa(s). Respostas automáticas
            também contam; a origem usa os identificadores armazenados no
            contato. Ganhos refletem o estado atual desses contatos, não vendas
            fechadas necessariamente no período. Histórico anterior à conexão
            não está incluído.
          </p>
        </>
      )}
    </section>
  );
}
