import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { workspaceDb, type WorkspaceStage } from "@/lib/clientWorkspaces";
import {
  workspaceOperation,
  selectClass,
  dateLabel,
} from "@/lib/workspaceCommercial";
interface Hook {
  id: string;
  name: string;
  enabled: boolean;
  stage_id: string;
  url: string;
  contact_map: Record<string, string>;
}
export default function FlowWebhookFields({
  workspace,
  data,
  patch,
  stages,
  manage,
}: {
  workspace: string;
  data: Record<string, unknown>;
  patch: (d: Record<string, unknown>) => void;
  stages: WorkspaceStage[];
  manage: boolean;
}) {
  const { user } = useAuth(),
    client = useQueryClient();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [draft, setDraft] = useState<Partial<Hook> | null>(null),
    [copied, setCopied] = useState(false);
  const id = String(data.webhook_id || "");
  const q = useQuery({
    queryKey: ["flow-webhook", user?.id, workspace, id],
    queryFn: () =>
      workspaceOperation<{ webhook: Hook | null }>(
        "automation_webhook_settings",
        { workspace_id: workspace, id },
      ),
    enabled: !!id && manage,
    refetchOnMount: "always",
  });
  const h = q.data?.webhook;
  const values = draft ||
    h || {
      name: "Webhook do funil",
      enabled: false,
      stage_id: stages[0]?.id || "",
      contact_map: {
        name: "contact.name",
        phone: "contact.phone",
        email: "contact.email",
        request_id: "request_id",
      },
    };
  const receipts = useQuery({
    queryKey: ["flow-webhook-receipts", user?.id, workspace, id],
    queryFn: async () => {
      const r = await workspaceDb
        .from("agency_workspace_webhook_receipts")
        .select("id,request_id,created_at")
        .eq("workspace_id", workspace)
        .eq("webhook_id", id)
        .order("created_at", { ascending: false })
        .limit(5);
      if (r.error) throw r.error;
      return r.data;
    },
    enabled: !!id && manage,
    refetchInterval: 10000,
  });
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await workspaceOperation<{ webhook: Hook }>(
        "save_automation_webhook",
        { workspace_id: workspace, id: id || null, values },
      );
      client.setQueryData(
        ["flow-webhook", user?.id, workspace, result.webhook.id],
        { webhook: result.webhook },
      );
      patch({ webhook_id: result.webhook.id, config_version: 2 });
      setDraft(null);
      if (id) await q.refetch();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!manage)
    return (
      <p className="text-xs text-muted-foreground">
        Somente administradores podem ver a URL e configurar este webhook.
      </p>
    );
  const example = {
    request_id: "8f0f6000-1111-4111-8111-222222222222",
    contact: {
      name: "Nome do contato",
      phone: "5511999990000",
      email: "contato@example.com",
    },
  };
  return (
    <section className="border rounded-xl p-3 space-y-3">
      <h4 className="font-semibold text-sm">Entrada deste webhook</h4>
      <p className="text-xs text-muted-foreground">
        Gere a URL, escolha os campos e ative o recebimento. Depois salve e
        ative o funil para executar as ações conectadas a este gatilho.
      </p>
      {h && (
        <>
          <label className="text-sm block">
            URL de recebimento
            <Input
              aria-label="URL do webhook deste bloco"
              readOnly
              value={h.url}
            />
          </label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              void navigator.clipboard
                .writeText(h.url)
                .then(() => setCopied(true))
                .catch(() => window.prompt("Copie a URL", h.url))
            }
          >
            {copied ? "Copiado" : "Copiar URL"}
          </Button>
          <p className="text-xs font-medium">
            {h.enabled ? "Recebimento ativo" : "Recebimento pausado"}
          </p>
        </>
      )}
      <label className="text-sm block">
        Nome da entrada
        <Input
          aria-label="Nome da entrada webhook"
          maxLength={160}
          value={values.name || ""}
          onChange={(e) => setDraft({ ...values, name: e.target.value })}
        />
      </label>
      <label className="text-sm block">
        Etapa de entrada no CRM
        <select
          className={selectClass + " w-full"}
          value={values.stage_id || ""}
          onChange={(e) => setDraft({ ...values, stage_id: e.target.value })}
        >
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs text-muted-foreground">
        Um contato novo entra nesta etapa. Um contato já existente mantém sua
        etapa atual.
      </p>
      <div className="space-y-2">
        <h5 className="text-xs font-semibold">Mapeamento do JSON recebido</h5>
        {[
          ["name", "Campo de nome"],
          ["phone", "Campo de telefone"],
          ["email", "Campo de e-mail"],
          ["request_id", "Identificador único do envio"],
        ].map(([key, label]) => (
          <label className="text-xs block" key={key}>
            {label}
            <Input
              aria-label={label}
              value={values.contact_map?.[key] || ""}
              placeholder={
                key === "request_id" ? "request_id" : "contact." + key
              }
              onChange={(e) =>
                setDraft({
                  ...values,
                  contact_map: { ...values.contact_map, [key]: e.target.value },
                })
              }
            />
          </label>
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={!!values.enabled}
          onChange={(e) => setDraft({ ...values, enabled: e.target.checked })}
        />
        Ativar recebimento
      </label>
      <Button
        type="button"
        disabled={busy || !values.stage_id}
        onClick={() => void save()}
      >
        {busy
          ? "Salvando…"
          : id
            ? "Salvar configuração do webhook"
            : "Gerar webhook"}
      </Button>
      <details className="text-xs">
        <summary className="cursor-pointer">
          Exemplo de envio e instruções
        </summary>
        <p className="my-2 text-muted-foreground">
          Envie POST com Content-Type: application/json. O identificador deve
          ser diferente para cada envio; repetir o mesmo identificador e dados
          não duplica o contato nem a execução. Use os caminhos acima para
          adaptar seu sistema de origem.
        </p>
        <pre className="bg-muted p-2 rounded overflow-x-auto">
          {JSON.stringify(example, null, 2)}
        </pre>
        {h && (
          <pre className="bg-muted p-2 rounded overflow-x-auto mt-2">
            {"curl -X POST " +
              JSON.stringify(h.url) +
              ' \\\n  -H "Content-Type: application/json" \\\n  -d ' +
              JSON.stringify(JSON.stringify(example))}
          </pre>
        )}
      </details>
      {q.error && (
        <p role="alert" className="text-xs text-destructive">
          {q.error.message}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="border-t pt-2">
        <h5 className="font-semibold text-xs">Últimos recebimentos</h5>
        {receipts.data?.length ? (
          receipts.data.map((r) => (
            <p key={r.id} className="text-xs mt-1 break-all">
              {dateLabel(r.created_at)} · {r.request_id}
            </p>
          ))
        ) : (
          <p className="text-xs text-muted-foreground mt-1">
            Nenhum recebimento registrado. A URL só recebe dados depois de
            ativada.
          </p>
        )}
      </div>
    </section>
  );
}
