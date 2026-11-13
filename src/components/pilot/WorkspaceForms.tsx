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
function FormEditor({
  value,
  stages,
  onClose,
  onSave,
}: {
  value: CaptureForm;
  stages: WorkspaceStage[];
  onClose: () => void;
  onSave: (v: CaptureForm) => void;
}) {
  const [f, setF] = useState(value),
    [error, setError] = useState(""),
    [preview, setPreview] = useState(false),
    [answers, setAnswers] = useState<Record<string, string>>({});
  const field = (index: number, patch: Partial<CaptureField>) =>
    setF({
      ...f,
      fields: f.fields.map((x, i) => (i === index ? { ...x, ...patch } : x)),
    });
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="max-w-4xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configurar formulário</DialogTitle>
          <DialogDescription>
            Campos, condições e entrada automática no CRM desta empresa.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const err = formDefinitionError(f.fields);
            if (err) {
              setError(err);
              return;
            }
            if (f.capture_lead && !f.contact_map.name) {
              setError("Selecione o campo de nome do contato.");
              return;
            }
            onSave(f);
          }}
        >
          <label className="block text-sm">
            Título
            <Input
              required
              maxLength={160}
              value={f.title}
              onChange={(e) => setF({ ...f, title: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            Descrição
            <Textarea
              maxLength={4000}
              value={f.description}
              onChange={(e) => setF({ ...f, description: e.target.value })}
            />
          </label>
          {f.fields.map((x, i) => (
            <fieldset key={x.id} className="border rounded-lg p-3 space-y-3">
              <legend className="text-xs px-1">Campo {i + 1}</legend>
              <div className="grid sm:grid-cols-[1fr_150px_auto] gap-2">
                <Input
                  aria-label={`Título do campo ${i + 1}`}
                  required
                  value={x.label}
                  onChange={(e) => field(i, { label: e.target.value })}
                />
                <select
                  aria-label={`Tipo do campo ${i + 1}`}
                  className={selectClass}
                  value={x.type}
                  onChange={(e) =>
                    field(i, { type: e.target.value as CaptureField["type"] })
                  }
                >
                  {[
                    ["text", "Texto"],
                    ["textarea", "Texto longo"],
                    ["email", "E-mail"],
                    ["tel", "Telefone"],
                    ["number", "Número"],
                    ["date", "Data"],
                    ["select", "Seleção"],
                  ].map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  disabled={f.fields.length === 1}
                  onClick={() =>
                    setF({ ...f, fields: f.fields.filter((_, j) => j !== i) })
                  }
                >
                  Remover
                </Button>
              </div>
              <div className="flex flex-wrap gap-3">
                <label className="text-sm flex gap-2 items-center">
                  <input
                    type="checkbox"
                    checked={x.required}
                    onChange={(e) => field(i, { required: e.target.checked })}
                  />
                  Obrigatório
                </label>
                {i > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      const fields = [...f.fields];
                      [fields[i - 1], fields[i]] = [fields[i], fields[i - 1]];
                      setF({ ...f, fields });
                    }}
                  >
                    Mover acima
                  </Button>
                )}
              </div>
              {x.type === "select" && (
                <label className="text-sm block">
                  Opções (uma por linha)
                  <Textarea
                    value={x.options?.join("\n") || ""}
                    onChange={(e) =>
                      field(i, { options: e.target.value.split("\n") })
                    }
                  />
                </label>
              )}
              {i > 0 && (
                <div className="grid sm:grid-cols-3 gap-2">
                  <select
                    aria-label={`Condição do campo ${i + 1}`}
                    className={selectClass}
                    value={x.condition?.fieldId || ""}
                    onChange={(e) =>
                      field(i, {
                        condition: e.target.value
                          ? {
                              fieldId: e.target.value,
                              operator: "equals",
                              value: "",
                            }
                          : undefined,
                      })
                    }
                  >
                    <option value="">Sempre mostrar</option>
                    {f.fields.slice(0, i).map((y) => (
                      <option key={y.id} value={y.id}>
                        Se {y.label}…
                      </option>
                    ))}
                  </select>
                  {x.condition && (
                    <>
                      <select
                        aria-label="Operador da condição"
                        className={selectClass}
                        value={x.condition.operator}
                        onChange={(e) =>
                          field(i, {
                            condition: {
                              ...x.condition!,
                              operator: e.target.value as NonNullable<
                                CaptureField["condition"]
                              >["operator"],
                            },
                          })
                        }
                      >
                        {[
                          ["equals", "Igual a"],
                          ["not_equals", "Diferente de"],
                          ["contains", "Contém"],
                          ["filled", "Preenchido"],
                          ["not_filled", "Não preenchido"],
                        ].map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                      {!["filled", "not_filled"].includes(
                        x.condition.operator,
                      ) && (
                        <Input
                          aria-label="Valor da condição"
                          value={x.condition.value || ""}
                          onChange={(e) =>
                            field(i, {
                              condition: {
                                ...x.condition!,
                                value: e.target.value,
                              },
                            })
                          }
                        />
                      )}
                    </>
                  )}
                </div>
              )}
            </fieldset>
          ))}
          <Button
            type="button"
            variant="outline"
            disabled={f.fields.length >= 50}
            onClick={() =>
              setF({
                ...f,
                fields: [
                  ...f.fields,
                  {
                    id: "field_" + crypto.randomUUID().slice(0, 8),
                    label: "Novo campo",
                    type: "text",
                    required: false,
                  },
                ],
              })
            }
          >
            Adicionar campo
          </Button>
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={f.capture_lead}
              onChange={(e) => setF({ ...f, capture_lead: e.target.checked })}
            />
            Criar contato no CRM ao receber resposta
          </label>
          {f.capture_lead && (
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="text-sm">
                Etapa de entrada
                <select
                  className={selectClass + " w-full"}
                  value={f.stage_id}
                  onChange={(e) => {
                    const s = stages.find((s) => s.id === e.target.value)!;
                    setF({ ...f, stage_id: s.id, pipeline_id: s.pipeline_id });
                  }}
                >
                  {stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              {[
                ["name", "Campo do nome"],
                ["phone", "Campo do WhatsApp"],
                ["email", "Campo do e-mail"],
              ].map(([key, label]) => (
                <label key={key} className="text-sm">
                  {label}
                  <select
                    className={selectClass + " w-full"}
                    value={f.contact_map[key] || ""}
                    onChange={(e) =>
                      setF({
                        ...f,
                        contact_map: {
                          ...f.contact_map,
                          [key]: e.target.value,
                        },
                      })
                    }
                  >
                    <option value="">Não mapear</option>
                    {f.fields.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.label}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          )}
          <label className="text-sm block">
            Mensagem de sucesso
            <Input
              maxLength={1000}
              value={f.success_message}
              onChange={(e) => setF({ ...f, success_message: e.target.value })}
            />
          </label>
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          <div className="flex gap-2 flex-wrap">
            <Button type="submit">Salvar formulário</Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPreview(!preview)}
            >
              Pré-visualizar
            </Button>
          </div>
          {preview && (
            <section className="border rounded-xl p-4 space-y-4">
              <h3 className="font-semibold">{f.title}</h3>
              <AgencyFormFields
                fields={f.fields as FormField[]}
                answers={answers}
                onChange={setAnswers}
              />
            </section>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
