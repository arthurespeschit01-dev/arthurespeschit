import FormEditor from "./WorkspaceFormEditor";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import AgencyFormFields from "@/components/AgencyFormFields";
import type { FormField } from "@/lib/agency";
import { formDefinitionError } from "@/lib/formConditions";
import { workspaceDb, type WorkspaceStage } from "@/lib/clientWorkspaces";
import {
  type CaptureForm,
  type CaptureField,
  type Submission,
  selectClass,
  publicLink,
  dateLabel,
} from "@/lib/workspaceCommercial";
import { RecordMenu, ShareLink, Empty } from "./CommercialShared";
export default function WorkspaceForms({
  workspace,
  forms,
  responses,
  stages,
  manage,
  write,
  run,
}: {
  workspace: string;
  forms: CaptureForm[];
  responses: Submission[];
  stages: WorkspaceStage[];
  manage: boolean;
  write: boolean;
  run: (fn: () => PromiseLike<{ error: unknown }>) => void;
}) {
  const [editing, setEditing] = useState<CaptureForm | null>(null),
    [selected, setSelected] = useState("");
  const fresh = (): CaptureForm => ({
    id: "",
    workspace_id: workspace,
    title: "Novo formulário",
    description: "",
    fields: [
      { id: "name", label: "Nome", type: "text", required: true },
      { id: "phone", label: "WhatsApp", type: "tel", required: true },
      { id: "email", label: "E-mail", type: "email", required: false },
    ],
    contact_map: { name: "name", phone: "phone", email: "email" },
    capture_lead: true,
    pipeline_id: stages[0]?.pipeline_id || "",
    stage_id: stages[0]?.id || "",
    token: "",
    enabled: true,
    success_message: "Recebemos suas informações. Obrigado!",
    presentation: {
      layout: "step",
      primary: "#7c3aed",
      background: "#ffffff",
      text: "#18212f",
    },
  });
  return (
    <div className="space-y-5">
      <div className="flex justify-between gap-3">
        <h2 className="text-xl font-semibold">Formulários</h2>
        {manage && (
          <Button onClick={() => setEditing(fresh())}>Novo formulário</Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Cada resposta pode criar um contato no CRM e iniciar um funil. Contatos
        já existentes mantêm a etapa em que estão.
      </p>
      <div className="grid md:grid-cols-2 gap-3">
        {forms.map((f) => (
          <article
            className="border rounded-xl p-4 bg-card space-y-3"
            key={f.id}
          >
            <div className="flex justify-between items-start gap-3">
              <div>
                <h3 className="font-semibold">{f.title}</h3>
                <p className="text-xs text-muted-foreground">
                  {f.enabled ? "Ativo" : "Desativado"} ·{" "}
                  {responses.filter((r) => r.form_id === f.id).length} respostas
                </p>
              </div>
              <RecordMenu
                enabled={manage}
                edit={() => setEditing(f)}
                toggle={() =>
                  run(() =>
                    workspaceDb
                      .from("agency_workspace_forms")
                      .update({ enabled: !f.enabled })
                      .eq("workspace_id", workspace)
                      .eq("id", f.id),
                  )
                }
                remove={() =>
                  run(() =>
                    workspaceDb
                      .from("agency_workspace_forms")
                      .delete()
                      .eq("workspace_id", workspace)
                      .eq("id", f.id),
                  )
                }
              />
            </div>
            <ShareLink url={publicLink("captura", f.token)} />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelected(f.id)}
            >
              Ver respostas
            </Button>
          </article>
        ))}
      </div>
      {!forms.length && (
        <Empty>
          Crie um formulário para começar a captar contatos nesta subconta.
        </Empty>
      )}
      <section className="space-y-3">
        <div className="flex flex-wrap gap-3 items-center">
          <h3 className="font-semibold">Respostas recebidas</h3>
          <select
            className={selectClass}
            aria-label="Filtrar respostas por formulário"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">Todos os formulários</option>
            {forms.map((f) => (
              <option key={f.id} value={f.id}>
                {f.title}
              </option>
            ))}
          </select>
        </div>
        {responses
          .filter((r) => !selected || r.form_id === selected)
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .map((r) => (
            <article
              className="border rounded-xl p-4 bg-card space-y-2"
              key={r.id}
            >
              <div className="flex flex-wrap justify-between gap-3">
                <p className="font-medium">
                  {r.form_title}{" "}
                  <span className="text-xs text-muted-foreground">
                    {dateLabel(r.created_at)}
                  </span>
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!write}
                  onClick={() =>
                    run(() =>
                      workspaceDb
                        .from("agency_workspace_form_submissions")
                        .update({
                          analyzed_at: r.analyzed_at
                            ? null
                            : new Date().toISOString(),
                        })
                        .eq("workspace_id", workspace)
                        .eq("id", r.id),
                    )
                  }
                >
                  {r.analyzed_at ? "Analisado ✓" : "Marcar como analisado"}
                </Button>
              </div>
              <dl className="grid sm:grid-cols-2 gap-2">
                {Object.entries(r.answers).map(([id, a]) => (
                  <div key={id}>
                    <dt className="text-xs text-muted-foreground">{a.label}</dt>
                    <dd className="text-sm whitespace-pre-wrap break-words">
                      {a.value || "—"}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="text-xs text-muted-foreground">
                {r.lead_id
                  ? "Contato vinculado ao CRM"
                  : "Resposta sem criação de contato"}
              </p>
            </article>
          ))}
        {!responses.length && (
          <Empty>
            As respostas reais aparecerão aqui assim que seu link for
            preenchido.
          </Empty>
        )}
      </section>
      {editing && (
        <FormEditor
          key={editing.id || "new"}
          value={editing}
          stages={stages}
          onClose={() => setEditing(null)}
          onSave={(f) =>
            run(async () => {
              const { id, token: _, ...values } = f;
              const r = id
                ? await workspaceDb
                    .from("agency_workspace_forms")
                    .update(values)
                    .eq("workspace_id", workspace)
                    .eq("id", id)
                : await workspaceDb
                    .from("agency_workspace_forms")
                    .insert(values);
              if (!r.error) setEditing(null);
              return r;
            })
          }
        />
      )}
    </div>
  );
}
