import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { workspaceDb } from "@/lib/clientWorkspaces";
import {
  workspaceOperation,
  dateLabel,
  selectClass,
} from "@/lib/workspaceCommercial";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
interface Rule {
  id: string;
  name: string;
  criteria: string;
  provider: string;
  event_name: string;
  value: number;
  enabled: boolean;
}
export default function WorkspaceAiRules({ workspace }: { workspace: string }) {
  const { user } = useAuth(),
    client = useQueryClient(),
    [key, setKey] = useState(""),
    [limit, setLimit] = useState<number | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [draft, setDraft] = useState<Rule | null>(null);
  const cache = ["workspace-ai", user?.id, workspace];
  const q = useQuery({
    queryKey: cache,
    queryFn: async () => {
      const [settings, rules, checks] = await Promise.all([
        workspaceOperation<{
          enabled: boolean;
          configured: boolean;
          model: string;
          daily_limit: number;
        }>("ai_settings", { workspace_id: workspace }),
        workspaceDb
          .from("agency_workspace_ai_rules")
          .select("*")
          .eq("workspace_id", workspace)
          .order("created_at"),
        workspaceDb
          .from("agency_workspace_ai_checks")
          .select("id,rule_id,status,error,created_at")
          .eq("workspace_id", workspace)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);
      if (rules.error) throw rules.error;
      if (checks.error) throw checks.error;
      return { settings, rules: rules.data as Rule[], checks: checks.data };
    },
    refetchInterval: 10000,
  });
  const act = async (fn: () => PromiseLike<unknown>) => {
    setBusy(true);
    setError("");
    try {
      const r = (await fn()) as { error?: { message: string } };
      if (r.error) throw r.error;
      await client.invalidateQueries({ queryKey: cache });
      setKey("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      <section className="border rounded-xl p-4 space-y-3">
        <h3 className="font-semibold">Conversões pela IA</h3>
        <p className="text-sm text-muted-foreground">
          Analisa até 20 mensagens de texto da mesma conversa e identifica o
          critério da regra. Áudios sem transcrição e imagens não são
          interpretados. A IA pode errar: valide os critérios antes de ativar
          conversões de venda.
        </p>
        <p className="text-xs text-muted-foreground">
          Chave do AI Gateway própria da empresa. A ativação envia o texto da
          conversa ao provedor e utiliza os créditos da sua conta. Modelo:{" "}
          {q.data?.settings.model || "openai/gpt-5.4-nano"}.
        </p>
        <label className="text-sm block">
          Chave do AI Gateway
          <Input
            type="password"
            autoComplete="new-password"
            aria-label="Chave do AI Gateway"
            value={key}
            placeholder={
              q.data?.settings.configured
                ? "Chave cadastrada · deixe vazio para manter"
                : "Informe a chave no sistema"
            }
            onChange={(e) => setKey(e.target.value)}
          />
        </label>
        <label className="text-sm block">
          Limite de análises por dia
          <Input
            type="number"
            min="1"
            max="1000"
            value={limit ?? q.data?.settings.daily_limit ?? 100}
            onChange={(e) => setLimit(Number(e.target.value))}
          />
        </label>
        <div className="flex gap-2">
          <Button
            disabled={busy}
            onClick={() =>
              void act(() =>
                workspaceOperation("save_ai_settings", {
                  workspace_id: workspace,
                  values: {
                    api_key: key,
                    daily_limit: limit ?? q.data?.settings.daily_limit ?? 100,
                    enabled: q.data?.settings.enabled || false,
                  },
                }),
              )
            }
          >
            Salvar conexão da IA
          </Button>
          <Button
            variant="outline"
            disabled={busy || !q.data?.settings.configured}
            onClick={() => {
              if (
                !q.data?.settings.enabled &&
                !window.confirm(
                  "Ativar análises automáticas de texto usando os créditos da empresa?",
                )
              )
                return;
              void act(() =>
                workspaceOperation("save_ai_settings", {
                  workspace_id: workspace,
                  values: {
                    enabled: !q.data?.settings.enabled,
                    daily_limit: limit ?? q.data?.settings.daily_limit ?? 100,
                  },
                }),
              );
            }}
          >
            {q.data?.settings.enabled
              ? "Desativar análises"
              : "Ativar análises"}
          </Button>
        </div>
      </section>
      <div className="flex justify-between">
        <h3 className="font-semibold">Regras pela IA</h3>
        <Button
          onClick={() =>
            setDraft({
              id: "",
              name: "Nova regra",
              criteria: "",
              provider: "meta",
              event_name: "Lead",
              value: 0,
              enabled: false,
            })
          }
        >
          Nova regra pela IA
        </Button>
      </div>
      {draft && (
        <form
          className="border rounded-xl p-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              const { id, ...v } = draft;
              const r = id
                ? await workspaceDb
                    .from("agency_workspace_ai_rules")
                    .update(v)
                    .eq("workspace_id", workspace)
                    .eq("id", id)
                : await workspaceDb
                    .from("agency_workspace_ai_rules")
                    .insert({ workspace_id: workspace, ...v });
              if (!r.error) setDraft(null);
              return r;
            });
          }}
        >
          <label className="text-sm block">
            Nome
            <Input
              required
              maxLength={160}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <label className="text-sm block">
            Quando considerar uma conversão
            <Textarea
              required
              minLength={10}
              maxLength={2000}
              placeholder="Ex.: o cliente confirmou explicitamente a compra e informou que concluiu o pagamento."
              value={draft.criteria}
              onChange={(e) => setDraft({ ...draft, criteria: e.target.value })}
            />
          </label>
          <div className="grid sm:grid-cols-3 gap-3">
            <select
              aria-label="Destino da conversão por IA"
              className={selectClass}
              value={draft.provider}
              onChange={(e) => setDraft({ ...draft, provider: e.target.value })}
            >
              <option value="meta">Meta Ads</option>
              <option value="google_ads">Google Ads</option>
            </select>
            <label className="text-sm">
              Nome do evento/conversão
              <Input
                required
                value={draft.event_name}
                maxLength={draft.provider === "meta" ? 60 : 200}
                pattern={
                  draft.provider === "meta"
                    ? "[A-Za-z][A-Za-z0-9_]*"
                    : undefined
                }
                onChange={(e) =>
                  setDraft({ ...draft, event_name: e.target.value })
                }
              />
            </label>
            <label className="text-sm">
              Valor (R$)
              <Input
                type="number"
                min="0"
                step="0.01"
                value={draft.value}
                onChange={(e) =>
                  setDraft({ ...draft, value: Number(e.target.value) })
                }
              />
            </label>
          </div>
          <label className="flex gap-2">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(e) =>
                setDraft({ ...draft, enabled: e.target.checked })
              }
            />
            Regra ativa
          </label>
          <Button disabled={busy}>Salvar regra</Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setDraft(null)}
          >
            Cancelar
          </Button>
        </form>
      )}
      {q.data?.rules.map((r) => (
        <article key={r.id} className="border rounded-xl p-4 space-y-2">
          <p className="font-semibold">
            {r.name} · {r.enabled ? "Ativa" : "Pausada"}
          </p>
          <p className="text-xs text-muted-foreground">{r.criteria}</p>
          <p className="text-xs">
            {r.provider === "meta" ? "Meta" : "Google"} → {r.event_name}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setDraft(r)}>
              Editar
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => {
                if (window.confirm("Excluir esta regra de IA?"))
                  void act(() =>
                    workspaceDb
                      .from("agency_workspace_ai_rules")
                      .delete()
                      .eq("workspace_id", workspace)
                      .eq("id", r.id),
                  );
              }}
            >
              Excluir
            </Button>
          </div>
        </article>
      ))}
      {!q.data?.rules.length && (
        <p className="text-sm text-muted-foreground">
          Nenhuma regra de IA criada. Regras por frase são configuradas nas abas
          Meta e Google.
        </p>
      )}
      <section className="border rounded-xl p-4 space-y-2">
        <h3 className="font-semibold">Últimas análises</h3>
        {q.data?.checks.map((c) => (
          <p key={c.id} className="border-t pt-2 text-xs">
            {dateLabel(c.created_at)} ·{" "}
            {q.data?.rules.find((r) => r.id === c.rule_id)?.name} ·{" "}
            {
              (
                {
                  queued: "Na fila",
                  processing: "Analisando",
                  matched: "Critério identificado",
                  ignored: "Critério não identificado",
                  failed: "Falhou",
                  cancelled: "Cancelada",
                } as Record<string, string>
              )[c.status]
            }
            {c.error ? " · " + c.error : ""}
          </p>
        ))}
        {!q.data?.checks.length && (
          <p className="text-sm text-muted-foreground">
            Nenhuma análise executada.
          </p>
        )}
      </section>
      {(error || q.error) && (
        <p role="alert" className="text-destructive">
          {error || q.error?.message}
        </p>
      )}
    </div>
  );
}
