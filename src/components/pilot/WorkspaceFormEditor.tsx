import { presentationStyle } from "@/lib/workspaceFormPresentation";
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { selectClass, type CaptureForm } from "@/lib/workspaceCommercial";
import type { WorkspaceStage } from "@/lib/clientWorkspaces";
import {
  workspaceFormDefinition,
  type WorkspaceFormField,
} from "../../../supabase/functions/_shared/workspace-form";
import WorkspaceFormRunner, {
  WorkspaceQuestion,
  type FormPresentation,
} from "./WorkspaceFormRunner";
const elements = [
  ["text", "Texto curto", "text"],
  ["textarea", "Texto longo", "textarea"],
  ["name", "Nome", "text"],
  ["email", "E-mail", "email"],
  ["tel", "Telefone", "tel"],
  ["url", "Website", "text"],
  ["address", "Endereço", "textarea"],
  ["radio", "Escolha única", "select"],
  ["multi", "Múltipla escolha", "textarea"],
  ["dropdown", "Dropdown", "select"],
  ["yesno", "Sim / Não", "select"],
  ["rating", "Avaliação", "select"],
  ["number", "Número", "number"],
  ["date", "Data", "date"],
];
export default function WorkspaceFormEditor({
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
  const questionInput = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState(value),
    [selected, setSelected] = useState(value.fields[0]?.id || "settings"),
    [tab, setTab] = useState("content"),
    [add, setAdd] = useState(false),
    [search, setSearch] = useState(""),
    [preview, setPreview] = useState(false),
    [device, setDevice] = useState("desktop"),
    [error, setError] = useState(""),
    [answers, setAnswers] = useState<Record<string, string>>({});
  const fields = form.fields as WorkspaceFormField[],
    field = fields.find((f) => f.id === selected),
    index = fields.findIndex((f) => f.id === selected),
    p: FormPresentation = form.presentation || {},
    dirty = JSON.stringify(form) !== JSON.stringify(value);
  const close = () => {
    if (
      !dirty ||
      window.confirm("Descartar alterações não salvas do formulário?")
    )
      onClose();
  };
  useEffect(() => {
    const prior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prior;
    };
  }, []);
  const patch = (v: Partial<WorkspaceFormField>) =>
    setForm({
      ...form,
      fields: fields.map((f) =>
        f.id === selected ? { ...f, ...v } : f,
      ) as CaptureForm["fields"],
    });
  const formatQuestion = (mark: string) => {
    if (!field) return;
    const input = questionInput.current;
    const start = input?.selectionStart ?? 0,
      end = input?.selectionEnd ?? field.label.length;
    const a = start === end ? 0 : start,
      b = start === end ? field.label.length : end;
    patch({
      label:
        field.label.slice(0, a) +
        mark +
        field.label.slice(a, b) +
        mark +
        field.label.slice(b),
    });
    requestAnimationFrame(() => questionInput.current?.focus());
  };
  const appearance = (v: Partial<FormPresentation>) =>
    setForm({ ...form, presentation: { ...p, ...v } });
  const save = () => {
    const e = workspaceFormDefinition(fields, p);
    if (e) {
      setError(e);
      return;
    }
    if (
      form.capture_lead &&
      (!fields.some((f) => f.id === form.contact_map.name) ||
        !["phone", "email"].some((k) =>
          fields.some((f) => f.id === form.contact_map[k]),
        ))
    ) {
      setError("Mapeie nome e telefone ou e-mail para criar contatos no CRM.");
      return;
    }
    if (form.capture_lead) {
      const name = fields.find((f) => f.id === form.contact_map.name);
      const contact = ["phone", "email"].some((k) => {
        const f = fields.find((f) => f.id === form.contact_map[k]);
        return f?.required && !f.condition;
      });
      if (!name?.required || name.condition || !contact) {
        setError(
          "Para captar leads, nome e pelo menos telefone ou e-mail devem ser obrigatórios e sempre visíveis.",
        );
        return;
      }
    }
    setError("");
    onSave(form);
  };
  const addField = (kind: string, type: string, label: string) => {
    const id = "field_" + crypto.randomUUID().slice(0, 8);
    const styled = [
      "radio",
      "multi",
      "dropdown",
      "rating",
      "yesno",
      "url",
    ].includes(kind);
    const next: WorkspaceFormField = {
      id,
      label,
      type,
      required: false,
      ...(styled
        ? { input_style: kind as WorkspaceFormField["input_style"] }
        : {}),
    };
    if (type === "select" || kind === "multi")
      next.options =
        kind === "yesno"
          ? ["Sim", "Não"]
          : kind === "rating"
            ? ["1", "2", "3", "4", "5"]
            : ["Opção 1", "Opção 2"];
    setForm({ ...form, fields: [...fields, next] as CaptureForm["fields"] });
    setSelected(id);
    setAdd(false);
  };
  const reorder = (delta: number) => {
    const next = [...fields],
      to = index + delta;
    if (to < 0 || to >= next.length) return;
    [next[index], next[to]] = [next[to], next[index]];
    const e = workspaceFormDefinition(next, p);
    if (e) {
      setError(e);
      return;
    }
    setForm({ ...form, fields: next as CaptureForm["fields"] });
  };
  return createPortal(
    <section
      aria-label="Editor de formulário"
      className="fixed inset-0 z-50 bg-background text-foreground flex flex-col"
    >
      <header className="border-b flex items-center justify-between p-3 gap-2 flex-wrap">
        <div className="flex gap-2 items-center">
          <Button variant="ghost" onClick={close}>
            Fechar editor
          </Button>
          <Input
            aria-label="Título"
            value={form.title}
            maxLength={160}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <Button
            variant={tab === "content" ? "default" : "outline"}
            onClick={() => setTab("content")}
          >
            Conteúdo
          </Button>
          <Button
            variant={tab === "logic" ? "default" : "outline"}
            onClick={() => setTab("logic")}
          >
            Lógica
          </Button>
        </div>
        <div className="flex gap-2">
          <select
            aria-label="Dispositivo da prévia"
            className={selectClass}
            value={device}
            onChange={(e) => setDevice(e.target.value)}
          >
            <option value="desktop">Desktop</option>
            <option value="tablet">Tablet</option>
            <option value="mobile">Celular</option>
          </select>
          <Button
            variant="outline"
            onClick={() => {
              setPreview(!preview);
              setAnswers({});
            }}
          >
            Prévia
          </Button>
          <Button onClick={save} disabled={!form.title.trim()}>
            Salvar formulário
          </Button>
        </div>
      </header>
      {error && (
        <p role="alert" className="text-destructive border-b p-2">
          {error}
        </p>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-[230px_minmax(0,1fr)_320px] min-h-0 flex-1 overflow-auto">
        <aside className="border-r p-3 space-y-3 overflow-y-auto">
          <div className="flex justify-between items-center">
            <strong className="text-sm">Conteúdo</strong>
            <Button
              size="sm"
              variant="outline"
              disabled={fields.length >= 50}
              onClick={() => setAdd(true)}
            >
              Adicionar campo
            </Button>
          </div>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setSelected("welcome")}
          >
            Tela de boas-vindas
          </Button>
          {fields.map((f, i) => (
            <button
              key={f.id}
              className={`w-full border rounded-lg p-3 text-left text-xs ${selected === f.id ? "border-primary bg-primary/10" : ""}`}
              onClick={() => {
                setSelected(f.id);
                setPreview(false);
              }}
            >
              {i + 1}. {f.label}
              <span className="block text-muted-foreground">
                {elements.find(
                  (e) => e[0] === (f.input_style || f.type),
                )?.[1] || f.type}
              </span>
            </button>
          ))}
          <Button
            className="w-full"
            variant="outline"
            onClick={() => setSelected("ending")}
          >
            Obrigado! · Tela final
          </Button>
          <Button
            className="w-full"
            variant="outline"
            onClick={() => setSelected("settings")}
          >
            CRM e aparência
          </Button>
        </aside>
        <main className="p-4 lg:p-8 min-w-0 flex justify-center items-start bg-muted/20 overflow-y-auto">
          <div
            className="w-full rounded-xl border shadow-lg overflow-hidden"
            style={{
              maxWidth:
                device === "mobile" ? 375 : device === "tablet" ? 650 : 850,
            }}
          >
            <div className="bg-muted px-4 py-2 text-xs text-muted-foreground">
              ● ● ● &nbsp; Prévia do formulário
            </div>
            <div
              className="p-6 lg:p-10 min-h-[480px] flex flex-col justify-center space-y-6"
              style={presentationStyle(p)}
            >
              {preview ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setSelected("ending");
                    setPreview(false);
                  }}
                >
                  <WorkspaceFormRunner
                    key={JSON.stringify(p)}
                    fields={fields}
                    answers={answers}
                    onChange={setAnswers}
                    presentation={{ ...p, layout: "step" }}
                  />
                </form>
              ) : selected === "welcome" ? (
                <>
                  <h1 className="text-3xl">{p.welcome || form.title}</h1>
                  <p className="whitespace-pre-wrap">
                    {p.welcome_description || form.description}
                  </p>
                  <Button
                    style={{
                      background: p.primary || "#7c3aed",
                      color: "#fff",
                    }}
                  >
                    Começar
                  </Button>
                </>
              ) : selected === "ending" ? (
                <h2 className="text-2xl">{form.success_message}</h2>
              ) : field ? (
                <>
                  <WorkspaceQuestion
                    field={field}
                    answer={answers[field.id] || ""}
                    onChange={(v) => setAnswers({ ...answers, [field.id]: v })}
                  />
                  <Button
                    style={{
                      background: p.primary || "#7c3aed",
                      color: "#fff",
                    }}
                    onClick={() => {
                      if (fields[index + 1]) setSelected(fields[index + 1].id);
                      else setSelected("ending");
                    }}
                  >
                    {field.button_text || "Continuar"} ✓
                  </Button>
                </>
              ) : (
                <>
                  <h1 className="text-3xl">{form.title}</h1>
                  <p>{form.description}</p>
                  <p className="text-sm opacity-70">
                    Selecione uma pergunta para visualizar.
                  </p>
                </>
              )}
            </div>
          </div>
        </main>
        <aside className="border-l p-4 space-y-4 overflow-y-auto">
          {field ? (
            <>
              <h3 className="font-semibold">
                {tab === "logic"
                  ? "Lógica da pergunta"
                  : "Propriedades da pergunta"}
              </h3>
              {tab === "content" ? (
                <>
                  <label className="text-sm block">
                    Pergunta
                    <Input
                      ref={questionInput}
                      aria-label={`Título do campo ${index + 1}`}
                      value={field.label}
                      onChange={(e) => patch({ label: e.target.value })}
                    />
                  </label>
                  <div
                    className="flex gap-2"
                    aria-label="Formatação da pergunta"
                  >
                    {[
                      ["**", "Negrito"],
                      ["*", "Itálico"],
                      ["~~", "Riscado"],
                    ].map(([mark, label]) => (
                      <Button
                        key={label}
                        size="sm"
                        variant="outline"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => formatQuestion(mark)}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                  <label className="text-sm block">
                    Descrição (opcional)
                    <Textarea
                      maxLength={1000}
                      value={field.description || ""}
                      onChange={(e) => patch({ description: e.target.value })}
                    />
                  </label>
                  <label className="text-sm block">
                    Tipo de resposta
                    <select
                      aria-label={`Tipo do campo ${index + 1}`}
                      className={selectClass + " w-full"}
                      value={field.input_style || field.type}
                      onChange={(e) => {
                        const [kind, , type] = elements.find(
                          (el) => el[0] === e.target.value,
                        )!;
                        patch({
                          type,
                          input_style: [
                            "radio",
                            "multi",
                            "dropdown",
                            "rating",
                            "yesno",
                            "url",
                          ].includes(kind)
                            ? (kind as WorkspaceFormField["input_style"])
                            : undefined,
                          options:
                            type === "select" || kind === "multi"
                              ? kind === "yesno"
                                ? ["Sim", "Não"]
                                : kind === "rating"
                                  ? ["1", "2", "3", "4", "5"]
                                  : ["Opção 1", "Opção 2"]
                              : undefined,
                        });
                      }}
                    >
                      {elements
                        .filter((e) => !["name", "address"].includes(e[0]))
                        .map(([k, l]) => (
                          <option key={k} value={k}>
                            {l}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="text-sm block">
                    Placeholder
                    <Input
                      maxLength={200}
                      value={field.placeholder || ""}
                      onChange={(e) => patch({ placeholder: e.target.value })}
                    />
                  </label>
                  {(field.type === "select" ||
                    field.input_style === "multi") && (
                    <label className="text-sm block">
                      Opções (uma por linha)
                      <Textarea
                        value={field.options?.join("\n") || ""}
                        onChange={(e) =>
                          patch({ options: e.target.value.split("\n") })
                        }
                      />
                    </label>
                  )}
                  <label className="flex justify-between text-sm">
                    Obrigatório
                    <input
                      type="checkbox"
                      aria-label="Obrigatório"
                      checked={field.required}
                      onChange={(e) => patch({ required: e.target.checked })}
                    />
                  </label>
                  <label className="text-sm block">
                    Texto do botão
                    <Input
                      maxLength={80}
                      value={field.button_text || ""}
                      placeholder="Continuar"
                      onChange={(e) => patch({ button_text: e.target.value })}
                    />
                  </label>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={index === 0}
                      onClick={() => reorder(-1)}
                    >
                      Mover acima
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={index === fields.length - 1}
                      onClick={() => reorder(1)}
                    >
                      Mover abaixo
                    </Button>
                  </div>
                  <Button
                    variant="outline"
                    disabled={fields.length <= 1}
                    onClick={() => {
                      if (
                        fields.some((f) => f.condition?.fieldId === field.id)
                      ) {
                        setError(
                          "Remova as condições que usam esta pergunta antes de excluí-la.",
                        );
                        return;
                      }
                      setForm({
                        ...form,
                        fields: fields.filter(
                          (f) => f.id !== field.id,
                        ) as CaptureForm["fields"],
                      });
                      setSelected("settings");
                    }}
                  >
                    Remover pergunta
                  </Button>
                </>
              ) : null}
              <section className="border-t pt-3 space-y-2">
                <h4 className="text-sm font-medium">
                  Exibir esta pergunta quando
                </h4>
                <select
                  aria-label={`Condição do campo ${index + 1}`}
                  className={selectClass + " w-full"}
                  value={field.condition?.fieldId || ""}
                  onChange={(e) =>
                    patch({
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
                  {fields.slice(0, index).map((f) => (
                    <option key={f.id} value={f.id}>
                      Se {f.label}…
                    </option>
                  ))}
                </select>
                {field.condition && (
                  <>
                    <select
                      aria-label="Operador da condição"
                      className={selectClass + " w-full"}
                      value={field.condition.operator}
                      onChange={(e) =>
                        patch({
                          condition: {
                            ...field.condition!,
                            operator: e.target.value as NonNullable<
                              WorkspaceFormField["condition"]
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
                      ].map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                    {!["filled", "not_filled"].includes(
                      field.condition.operator,
                    ) && (
                      <Input
                        aria-label="Valor da condição"
                        value={field.condition.value || ""}
                        onChange={(e) =>
                          patch({
                            condition: {
                              ...field.condition!,
                              value: e.target.value,
                            },
                          })
                        }
                      />
                    )}
                  </>
                )}
                <p className="text-xs text-muted-foreground">
                  A regra usa respostas anteriores. Perguntas ocultas não são
                  enviadas nem exigidas.
                </p>
              </section>
            </>
          ) : selected === "welcome" ? (
            <>
              <label className="text-sm block">
                Título de boas-vindas
                <Input
                  value={p.welcome || ""}
                  onChange={(e) => appearance({ welcome: e.target.value })}
                />
              </label>
              <label className="text-sm block">
                Descrição
                <Textarea
                  value={p.welcome_description || ""}
                  onChange={(e) =>
                    appearance({ welcome_description: e.target.value })
                  }
                />
              </label>
            </>
          ) : selected === "ending" ? (
            <label className="text-sm block">
              Mensagem de sucesso
              <Textarea
                maxLength={1000}
                value={form.success_message}
                onChange={(e) =>
                  setForm({ ...form, success_message: e.target.value })
                }
              />
            </label>
          ) : (
            <>
              <h3 className="font-semibold">Aparência do formulário</h3>
              {(
                [
                  ["primary", "Cor dos botões"],
                  ["background", "Fundo"],
                  ["text", "Texto"],
                ] as const
              ).map(([k, l]) => (
                <label key={k} className="text-sm flex justify-between">
                  {l}
                  <Input
                    className="w-16"
                    type="color"
                    aria-label={l}
                    value={
                      p[k] ||
                      (k === "primary"
                        ? "#7c3aed"
                        : k === "text"
                          ? "#18212f"
                          : "#ffffff")
                    }
                    onChange={(e) => appearance({ [k]: e.target.value })}
                  />
                </label>
              ))}
              <label className="text-sm block">
                Fonte
                <select
                  className={selectClass + " w-full"}
                  value={p.font || "sans"}
                  onChange={(e) =>
                    appearance({
                      font: e.target.value as FormPresentation["font"],
                    })
                  }
                >
                  <option value="sans">Sem serifa</option>
                  <option value="serif">Com serifa</option>
                  <option value="mono">Monoespaçada</option>
                </select>
              </label>
              <label className="text-sm block">
                Alinhamento
                <select
                  className={selectClass + " w-full"}
                  value={p.alignment || "left"}
                  onChange={(e) =>
                    appearance({
                      alignment: e.target.value as "left" | "center",
                    })
                  }
                >
                  <option value="left">À esquerda</option>
                  <option value="center">Centralizado</option>
                </select>
              </label>
              <label className="text-sm block">
                Apresentação
                <select
                  className={selectClass + " w-full"}
                  value={p.layout || "all"}
                  onChange={(e) =>
                    appearance({ layout: e.target.value as "step" | "all" })
                  }
                >
                  <option value="all">Todas as perguntas</option>
                  <option value="step">Uma pergunta por vez</option>
                </select>
              </label>
              <label className="text-sm block">
                Descrição geral
                <Textarea
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                />
              </label>
              <label className="text-sm flex gap-2">
                <input
                  type="checkbox"
                  checked={form.capture_lead}
                  onChange={(e) =>
                    setForm({ ...form, capture_lead: e.target.checked })
                  }
                />
                Criar contato no CRM ao receber resposta
              </label>
              {form.capture_lead && (
                <>
                  <label className="text-sm block">
                    Etapa de entrada
                    <select
                      className={selectClass + " w-full"}
                      value={form.stage_id}
                      onChange={(e) => {
                        const s = stages.find((s) => s.id === e.target.value)!;
                        setForm({
                          ...form,
                          stage_id: s.id,
                          pipeline_id: s.pipeline_id,
                        });
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
                  ].map(([k, l]) => (
                    <label key={k} className="text-sm block">
                      {l}
                      <select
                        className={selectClass + " w-full"}
                        value={form.contact_map[k] || ""}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            contact_map: {
                              ...form.contact_map,
                              [k]: e.target.value,
                            },
                          })
                        }
                      >
                        <option value="">Não mapear</option>
                        {fields.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </>
              )}
            </>
          )}
        </aside>
      </div>
      {add && (
        <div
          role="dialog"
          aria-label="Adicionar elemento"
          className="fixed inset-0 bg-black/60 flex items-center justify-center p-4"
        >
          <section className="bg-card rounded-xl border p-5 space-y-4 max-w-lg w-full">
            <div className="flex justify-between">
              <h3>Adicionar elemento</h3>
              <Button variant="ghost" onClick={() => setAdd(false)}>
                Fechar
              </Button>
            </div>
            <Input
              aria-label="Buscar elementos"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar elementos…"
            />
            <div className="grid grid-cols-3 gap-2">
              {elements
                .filter(([, l]) =>
                  l.toLowerCase().includes(search.toLowerCase()),
                )
                .map(([k, l, t]) => (
                  <Button
                    key={k}
                    variant="outline"
                    onClick={() => addField(k, t, l)}
                  >
                    {l}
                  </Button>
                ))}
            </div>
          </section>
        </div>
      )}
    </section>,
    document.body,
  );
}
