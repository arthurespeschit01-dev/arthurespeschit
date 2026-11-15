import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { workspaceOperation } from "@/lib/workspaceCommercial";
import { defaultOptOutPhrases } from "../../../supabase/functions/_shared/workspace-whatsapp-preferences";
export default function WorkspaceWhatsAppOptOut({
  workspace,
}: {
  workspace: string;
}) {
  const { user } = useAuth(),
    [enabled, setEnabled] = useState(true),
    [phrases, setPhrases] = useState(defaultOptOutPhrases.join("\n")),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const q = useQuery({
    queryKey: ["workspace-whatsapp-preferences", user?.id, workspace],
    queryFn: () =>
      workspaceOperation<{ optout_enabled: boolean; phrases: string[] }>(
        "whatsapp_preferences",
        { workspace_id: workspace },
      ),
    refetchOnWindowFocus: false,
  });
  useEffect(() => {
    if (q.data) {
      setEnabled(q.data.optout_enabled ?? true);
      setPhrases((q.data.phrases || defaultOptOutPhrases).join("\n"));
    }
  }, [q.data]);
  const save = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await workspaceOperation("save_whatsapp_preferences", {
        workspace_id: workspace,
        values: {
          optout_enabled: enabled,
          phrases: phrases
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
        },
      });
      await q.refetch();
      setMessage("Preferências salvas.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="rounded-xl border bg-card p-4 space-y-4">
      <div className="flex justify-between gap-3">
        <div>
          <h3 className="font-semibold">Descadastro automático</h3>
          <p className="text-sm text-muted-foreground">
            Quem responder uma destas frases deixa de receber mensagens
            automáticas.
          </p>
        </div>
        <Switch
          aria-label="Ativar descadastro automático"
          checked={enabled}
          disabled={busy || q.isPending}
          onCheckedChange={setEnabled}
        />
      </div>
      <label className="block text-sm space-y-2">
        <span>Frases</span>
        <Textarea
          aria-label="Frases de descadastro"
          rows={7}
          value={phrases}
          onChange={(e) => setPhrases(e.target.value)}
          maxLength={5050}
        />
      </label>
      <p className="text-xs text-muted-foreground">
        Uma frase por linha. Ignora diferenças de maiúsculas e acentos. O
        histórico é preservado, e a equipe ainda pode responder manualmente ao
        contato.
      </p>
      <div className="flex justify-between items-center gap-3">
        <span className="text-xs text-muted-foreground">
          {phrases.split("\n").filter((s) => s.trim()).length} frases
        </span>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setPhrases(defaultOptOutPhrases.join("\n"));
              setEnabled(true);
            }}
          >
            Restaurar padrão
          </Button>
          <Button disabled={busy || q.isPending} onClick={() => void save()}>
            Salvar descadastro
          </Button>
        </div>
      </div>
      {(error || q.error) && (
        <p role="alert" className="text-sm text-destructive">
          {error || q.error?.message}
        </p>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </section>
  );
}
