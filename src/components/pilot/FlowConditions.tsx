import type { WorkspaceStage } from "@/lib/clientWorkspaces";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { selectClass, type CaptureForm } from "@/lib/workspaceCommercial";
interface Rule {
  field: string;
  operator: string;
  value: string;
}
export default function FlowConditions({
  data,
  patch,
  forms,
  stages,
}: {
  data: Record<string, unknown>;
  patch: (p: Record<string, unknown>) => void;
  forms: CaptureForm[];
  stages: WorkspaceStage[];
}) {
  const rules = (data.rules as Rule[]) || [
    { field: "source", operator: "equals", value: "form" },
  ];
  const fields = [
    ["source", "Origem do lead"],
    ["tag", "Etiqueta"],
    ["stage", "Etapa do CRM"],
    ["message", "Mensagem"],
    ["value", "Valor"],
    ["email", "E-mail"],
    ["phone", "Telefone"],
    ["name", "Nome"],
    ...forms.flatMap((f) =>
      f.fields.map((x) => ["answer:" + x.id, "Resposta: " + x.label]),
    ),
  ];
  const change = (i: number, p: Partial<Rule>) =>
    patch({
      rules: rules.map((r, index) => (index === i ? { ...r, ...p } : r)),
    });
  return (
    <div className="space-y-3">
      <select
        aria-label="Combinar regras"
        className={selectClass + " w-full"}
        value={String(data.match || "all")}
        onChange={(e) => patch({ match: e.target.value })}
      >
        <option value="all">Todas as regras (E)</option>
        <option value="any">Qualquer regra (OU)</option>
      </select>
      {rules.map((r, i) => (
        <fieldset className="border rounded-lg p-2 space-y-2" key={i}>
          <legend className="text-xs">Regra {i + 1}</legend>
          <select
            aria-label={`Campo da regra ${i + 1}`}
            className={selectClass + " w-full"}
            value={r.field}
            onChange={(e) => change(i, { field: e.target.value })}
          >
            {fields.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          <select
            aria-label={`Operador da regra ${i + 1}`}
            className={selectClass + " w-full"}
            value={r.operator}
            onChange={(e) => change(i, { operator: e.target.value })}
          >
            {[
              ["equals", "Igual a"],
              ["not_equals", "Diferente de"],
              ["contains", "Contém"],
              ["filled", "Preenchido"],
              ["not_filled", "Não preenchido"],
              ["greater_than", "Maior que"],
            ].map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          {!["filled", "not_filled"].includes(r.operator) &&
            (r.field === "stage" ? (
              <select
                className={selectClass + " w-full"}
                aria-label={`Valor da regra ${i + 1}`}
                value={r.value || ""}
                onChange={(e) => change(i, { value: e.target.value })}
              >
                <option value="">Selecione uma etapa</option>
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            ) : r.field === "source" ? (
              <select
                className={selectClass + " w-full"}
                aria-label={`Valor da regra ${i + 1}`}
                value={r.value || ""}
                onChange={(e) => change(i, { value: e.target.value })}
              >
                {[
                  ["manual", "Manual"],
                  ["form", "Formulário"],
                  ["appointment", "Agendamento"],
                  ["whatsapp", "WhatsApp"],
                  ["meta", "Meta Ads"],
                  ["import", "Importação"],
                ].map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                aria-label={`Valor da regra ${i + 1}`}
                value={r.value || ""}
                onChange={(e) => change(i, { value: e.target.value })}
              />
            ))}
          <Button
            size="sm"
            variant="ghost"
            disabled={rules.length === 1}
            onClick={() =>
              patch({ rules: rules.filter((_, index) => i !== index) })
            }
          >
            Remover regra
          </Button>
        </fieldset>
      ))}
      <Button
        size="sm"
        variant="outline"
        disabled={rules.length >= 20}
        onClick={() =>
          patch({
            rules: [...rules, { field: "name", operator: "filled", value: "" }],
          })
        }
      >
        Adicionar regra
      </Button>
    </div>
  );
}
