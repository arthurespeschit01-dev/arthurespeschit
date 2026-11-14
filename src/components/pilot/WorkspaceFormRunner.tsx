import ReactMarkdown from "react-markdown";
import { presentationStyle } from "@/lib/workspaceFormPresentation";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { visibleFormFields } from "@/lib/formConditions";
import {
  workspaceAnswerError,
  type WorkspaceFormField,
} from "../../../supabase/functions/_shared/workspace-form";
export type FormPresentation = {
  layout?: "step" | "all";
  primary?: string;
  background?: string;
  text?: string;
  font?: "sans" | "serif" | "mono";
  alignment?: "left" | "center";
  welcome?: string;
  welcome_description?: string;
};
export function WorkspaceQuestion({
  field,
  answer,
  onChange,
}: {
  field: WorkspaceFormField;
  answer: string;
  onChange: (v: string) => void;
}) {
  const f = field;
  let multi: string[] = [];
  try {
    const parsed = JSON.parse(answer || "[]");
    multi = Array.isArray(parsed) ? parsed : [];
  } catch {
    /* invalid answers are rejected on submit */
  }
  return (
    <div className="space-y-4">
      <label
        htmlFor={"question-" + f.id}
        className="block text-xl font-medium whitespace-pre-wrap"
      >
        <ReactMarkdown
          skipHtml
          allowedElements={["p", "strong", "em", "del", "a", "code", "br"]}
          components={{
            p: ({ children }) => <span>{children}</span>,
            a: ({ children, href }) => (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                {children}
              </a>
            ),
          }}
        >
          {f.label}
        </ReactMarkdown>
        {f.required ? " *" : ""}
      </label>
      {f.description && (
        <p className="text-sm opacity-70 whitespace-pre-wrap">
          {f.description}
        </p>
      )}
      {["radio", "yesno", "rating", "multi"].includes(f.input_style || "") ? (
        <div role="group" aria-label={f.label} className="flex flex-wrap gap-2">
          {f.options?.map((v) =>
            f.input_style === "multi" ? (
              <label
                key={v}
                className="border rounded-lg p-3 inline-flex gap-2"
              >
                <input
                  type="checkbox"
                  checked={Array.isArray(multi) && multi.includes(v)}
                  onChange={(e) =>
                    onChange(
                      JSON.stringify(
                        e.target.checked
                          ? [...multi, v]
                          : multi.filter((x) => x !== v),
                      ),
                    )
                  }
                />
                {v}
              </label>
            ) : (
              <label
                key={v}
                className="border rounded-lg p-3 inline-flex gap-2"
              >
                <input
                  type="radio"
                  required={f.required}
                  name={"question-" + f.id}
                  value={v}
                  checked={answer === v}
                  onChange={() => onChange(v)}
                />
                {v}
              </label>
            ),
          )}
        </div>
      ) : f.type === "select" ? (
        <select
          id={"question-" + f.id}
          required={f.required}
          aria-label={f.label}
          className="w-full h-12 rounded border px-3 bg-transparent"
          value={answer}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">{f.placeholder || "Selecione uma opção"}</option>
          {f.options?.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      ) : f.type === "textarea" ? (
        <Textarea
          id={"question-" + f.id}
          aria-label={f.label}
          required={f.required}
          maxLength={5000}
          className="bg-transparent text-inherit"
          placeholder={f.placeholder || "Digite sua resposta…"}
          value={answer}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <Input
          id={"question-" + f.id}
          aria-label={f.label}
          required={f.required}
          maxLength={5000}
          className="bg-transparent text-inherit"
          type={f.input_style === "url" ? "url" : f.type}
          placeholder={f.placeholder || "Digite sua resposta…"}
          value={answer}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}
export default function WorkspaceFormRunner({
  fields,
  answers,
  onChange,
  presentation = {},
  busy = false,
}: {
  fields: WorkspaceFormField[];
  answers: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
  presentation?: FormPresentation;
  busy?: boolean;
}) {
  const [index, setIndex] = useState(presentation.welcome ? -1 : 0),
    [error, setError] = useState("");
  const visible = visibleFormFields(fields, answers),
    step = presentation.layout === "step",
    welcome = step && presentation.welcome && index < 0;
  const current = visible[Math.min(Math.max(index, 0), visible.length - 1)];
  if (welcome)
    return (
      <section className="py-10 space-y-6">
        <h2 className="text-3xl">{presentation.welcome}</h2>
        <p className="whitespace-pre-wrap">
          {presentation.welcome_description}
        </p>
        <Button
          type="button"
          style={{ background: "var(--form-primary)", color: "#fff" }}
          onClick={(e) => {
            e.preventDefault();
            setIndex(0);
          }}
        >
          Começar
        </Button>
      </section>
    );
  const show = step ? (current ? [current] : []) : visible;
  return (
    <section
      className="space-y-6"
      onKeyDown={(e) => {
        if (
          step &&
          e.key === "Enter" &&
          (e.target as HTMLElement).tagName !== "TEXTAREA" &&
          index < visible.length - 1
        ) {
          e.preventDefault();
          (
            e.currentTarget.querySelector(
              "[data-next]",
            ) as HTMLButtonElement | null
          )?.click();
        }
      }}
    >
      {step && (
        <p className="text-xs opacity-60">
          {Math.max(index, 0) + 1} de {visible.length}
        </p>
      )}
      {show.map((f) => (
        <WorkspaceQuestion
          key={f.id}
          field={f}
          answer={answers[f.id] || ""}
          onChange={(v) => {
            setError("");
            onChange({ ...answers, [f.id]: v });
          }}
        />
      ))}
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
      {step && (
        <div className="flex gap-2 pt-8">
          {index > 0 && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIndex(index - 1);
                setError("");
              }}
            >
              Voltar
            </Button>
          )}
          {index >= visible.length - 1 ? (
            <Button
              key="submit"
              type="submit"
              disabled={busy}
              style={{ background: "var(--form-primary)", color: "#fff" }}
            >
              {busy ? "Enviando…" : current?.button_text || "Enviar respostas"}
            </Button>
          ) : (
            <Button
              type="button"
              style={{ background: "var(--form-primary)", color: "#fff" }}
              data-next
              key="next"
              onClick={(event) => {
                event.preventDefault();
                if (!current) return;
                const e = workspaceAnswerError(
                  [{ ...current, condition: undefined }],
                  { [current.id]: answers[current.id] || "" },
                );
                if (e) setError(e);
                else setIndex(Math.max(index, 0) + 1);
              }}
            >
              {current?.button_text || "Continuar"}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
