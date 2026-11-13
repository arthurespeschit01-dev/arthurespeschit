import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ArrowUp, ArrowDown, Plus, Trash2 } from "lucide-react";
import {
  workspaceDb,
  workspaceError,
  type ClientWorkspace,
  type WorkspaceLead,
  type WorkspacePipeline,
  type WorkspaceStage,
} from "@/lib/clientWorkspaces";
interface Base {
  onClose: () => void;
  onSaved: () => void;
}
export function WorkspaceDialog({
  workspace,
  onClose,
  onSaved,
  onCreated,
}: { workspace?: ClientWorkspace; onCreated?: (id: string) => void } & Base) {
  const [name, setName] = useState(workspace?.name || ""),
    [description, setDescription] = useState(workspace?.description || ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Dialog open onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {workspace ? "Editar subconta" : "Nova subconta de cliente"}
          </DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              if (workspace) {
                const { error } = await workspaceDb
                  .from("agency_client_workspaces")
                  .update({
                    name: name.trim(),
                    description: description.trim(),
                  })
                  .eq("id", workspace.id);
                if (error) throw error;
              } else {
                const { data, error } = await workspaceDb.rpc(
                  "agency_workspace_create",
                  { p_name: name.trim(), p_description: description.trim() },
                );
                if (error) throw error;
                onCreated?.(data);
              }
              onSaved();
              onClose();
            } catch (e) {
              setError(workspaceError(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <div>
            <Label htmlFor="workspace-name">Nome da empresa</Label>
            <Input
              id="workspace-name"
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="workspace-description">Descrição</Label>
            <Textarea
              id="workspace-description"
              maxLength={2000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            A subconta começa com CRM vazio e uma pipeline configurável. Os
            dados da agência não são copiados.
          </p>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy || !name.trim()}>
            {busy
              ? "Salvando…"
              : workspace
                ? "Salvar alterações"
                : "Criar subconta"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
export function LeadDialog({
  workspace,
  pipeline,
  stages,
  lead,
  onClose,
  onSaved,
}: {
  workspace: string;
  pipeline: string;
  stages: WorkspaceStage[];
  lead?: WorkspaceLead;
} & Base) {
  const [form, setForm] = useState({
      name: lead?.name || "",
      phone: lead?.phone || "",
      email: lead?.email || "",
      value: String(lead?.value || 0),
      notes: lead?.notes || "",
      stage_id: lead?.stage_id || stages[0]?.id || "",
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const field =
    (key: keyof typeof form) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  return (
    <Dialog open onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{lead ? "Editar lead" : "Novo lead"}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const row = {
                ...form,
                name: form.name.trim(),
                value: Number(form.value),
              };
              const result = lead
                ? await workspaceDb
                    .from("agency_workspace_leads")
                    .update(row)
                    .eq("id", lead.id)
                    .eq("workspace_id", workspace)
                : await workspaceDb
                    .from("agency_workspace_leads")
                    .insert({
                      ...row,
                      workspace_id: workspace,
                      pipeline_id: pipeline,
                    });
              if (result.error) throw result.error;
              onSaved();
              onClose();
            } catch (e) {
              setError(workspaceError(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <div>
            <Label htmlFor="lead-name">Nome</Label>
            <Input
              id="lead-name"
              required
              maxLength={160}
              value={form.name}
              onChange={field("name")}
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="lead-phone">Telefone</Label>
              <Input
                id="lead-phone"
                type="tel"
                maxLength={40}
                value={form.phone}
                onChange={field("phone")}
              />
            </div>
            <div>
              <Label htmlFor="lead-email">E-mail</Label>
              <Input
                id="lead-email"
                type="email"
                maxLength={254}
                value={form.email}
                onChange={field("email")}
              />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="lead-value">Valor da oportunidade</Label>
              <Input
                id="lead-value"
                type="number"
                step="0.01"
                min="0"
                max="9999999999.99"
                value={form.value}
                onChange={field("value")}
              />
            </div>
            <div>
              <Label htmlFor="lead-stage">Etapa</Label>
              <select
                id="lead-stage"
                className="h-10 w-full rounded-md border bg-background px-2 text-sm"
                value={form.stage_id}
                onChange={field("stage_id")}
              >
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <Label htmlFor="lead-notes">Observações</Label>
            <Textarea
              id="lead-notes"
              maxLength={10000}
              value={form.notes}
              onChange={field("notes")}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button
            type="submit"
            disabled={busy || !form.name.trim() || !form.stage_id}
          >
            {busy ? "Salvando…" : "Salvar lead"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
export function PipelineDialog({
  workspace,
  pipeline,
  stages,
  leads,
  onClose,
  onSaved,
}: {
  workspace: string;
  pipeline?: WorkspacePipeline;
  stages: WorkspaceStage[];
  leads: WorkspaceLead[];
} & Base) {
  const [name, setName] = useState(pipeline?.name || ""),
    [items, setItems] = useState(() =>
      stages.length
        ? stages.map((s) => ({ ...s }))
        : [
            {
              id: "",
              name: "Novo contato",
              color: "#8b5cf6",
              kind: "open" as const,
              position: 0,
              workspace_id: workspace,
              pipeline_id: "",
            },
          ],
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const move = (i: number, step: number) =>
    setItems((a) => {
      const n = [...a];
      [n[i], n[i + step]] = [n[i + step], n[i]];
      return n;
    });
  return (
    <Dialog open onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {pipeline ? "Configurar pipeline" : "Nova pipeline"}
          </DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const { error } = await workspaceDb.rpc(
                "agency_workspace_save_pipeline",
                {
                  p_workspace: workspace,
                  p_id: pipeline?.id || null,
                  p_name: name.trim(),
                  p_stages: items.map((s) => ({
                    id: s.id || null,
                    name: s.name.trim(),
                    color: s.color,
                    kind: s.kind,
                  })),
                },
              );
              if (error) throw error;
              onSaved();
              onClose();
            } catch (e) {
              setError(workspaceError(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Label htmlFor="pipeline-name">Nome da pipeline</Label>
          <Input
            id="pipeline-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={120}
          />
          <p className="text-xs text-muted-foreground">
            As etapas Ganho e Perdido determinam os resultados do dashboard.
            Mova os leads antes de excluir uma etapa ocupada.
          </p>
          {items.map((s, i) => (
            <div
              key={s.id || `new-${i}`}
              className="border rounded-lg p-3 space-y-2"
            >
              <div className="flex gap-2">
                <Input
                  aria-label={`Nome da etapa ${i + 1}`}
                  value={s.name}
                  maxLength={100}
                  required
                  onChange={(e) =>
                    setItems((a) =>
                      a.map((x, j) =>
                        j === i ? { ...x, name: e.target.value } : x,
                      ),
                    )
                  }
                />
                <input
                  type="color"
                  aria-label={`Cor da etapa ${i + 1}`}
                  className="h-10 w-10 shrink-0 rounded border bg-background p-1"
                  value={s.color}
                  onChange={(e) =>
                    setItems((a) =>
                      a.map((x, j) =>
                        j === i ? { ...x, color: e.target.value } : x,
                      ),
                    )
                  }
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <select
                  aria-label={`Tipo da etapa ${i + 1}`}
                  className="h-10 flex-1 min-w-28 rounded-md border bg-background px-2 text-sm"
                  value={s.kind}
                  onChange={(e) =>
                    setItems((a) =>
                      a.map((x, j) =>
                        j === i
                          ? {
                              ...x,
                              kind: e.target.value as WorkspaceStage["kind"],
                            }
                          : x,
                      ),
                    )
                  }
                >
                  <option value="open">Em aberto</option>
                  <option value="won">Ganho</option>
                  <option value="lost">Perdido</option>
                </select>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={`Subir etapa ${i + 1}`}
                  disabled={!i || busy}
                  onClick={() => move(i, -1)}
                >
                  <ArrowUp size={16} />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={`Descer etapa ${i + 1}`}
                  disabled={i === items.length - 1 || busy}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown size={16} />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={`Remover etapa ${i + 1}`}
                  disabled={
                    busy ||
                    items.length === 1 ||
                    leads.some((l) => l.stage_id === s.id)
                  }
                  onClick={() => setItems((a) => a.filter((_, j) => j !== i))}
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            disabled={busy || items.length >= 30}
            onClick={() =>
              setItems((a) => [
                ...a,
                {
                  id: "",
                  name: "Nova etapa",
                  color: "#8b5cf6",
                  kind: "open",
                  position: a.length,
                  workspace_id: workspace,
                  pipeline_id: pipeline?.id || "",
                },
              ])
            }
          >
            <Plus size={16} />
            Adicionar etapa
          </Button>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div>
            <Button
              type="submit"
              disabled={
                busy || !name.trim() || items.some((s) => !s.name.trim())
              }
            >
              {busy ? "Salvando…" : "Salvar pipeline"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
