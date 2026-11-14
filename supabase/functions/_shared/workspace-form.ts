import {
  formDefinitionError,
  visibleFormFields,
  type ConditionalField,
} from "./form-conditions.ts";
import { validateAnswers } from "./agency-validation.ts";
export interface WorkspaceFormField extends ConditionalField {
  description?: string;
  placeholder?: string;
  button_text?: string;
  input_style?: "dropdown" | "radio" | "multi" | "rating" | "yesno" | "url";
}
export function workspaceFormDefinition(
  fields: WorkspaceFormField[],
  presentation: Record<string, unknown> = {},
) {
  const base = formDefinitionError(fields);
  if (base) return base;
  for (const f of fields) {
    if (
      ![
        "text",
        "textarea",
        "email",
        "tel",
        "number",
        "date",
        "select",
      ].includes(f.type)
    )
      return "Tipo de campo não suportado.";
    if (
      f.input_style &&
      !["dropdown", "radio", "multi", "rating", "yesno", "url"].includes(
        f.input_style,
      )
    )
      return "Apresentação de campo inválida.";
    if (
      ["radio", "multi", "rating", "yesno"].includes(f.input_style || "") &&
      (!f.options?.length ||
        f.options.length > 50 ||
        f.options.some((v) => !v.trim() || v.length > 200) ||
        new Set(f.options).size !== f.options.length)
    )
      return `Revise as opções de ${f.label}.`;
    if (
      (f.input_style === "multi" && f.type !== "textarea") ||
      (["radio", "rating", "yesno", "dropdown"].includes(f.input_style || "") &&
        f.type !== "select")
    )
      return "O estilo não corresponde ao tipo de resposta.";
    if (
      (f.placeholder || "").length > 200 ||
      (f.description || "").length > 1000 ||
      (f.button_text || "").length > 80
    )
      return "Texto de campo muito longo.";
  }
  for (const key of ["primary", "background", "text"])
    if (
      presentation[key] &&
      !/^#[a-fA-F0-9]{6}$/.test(String(presentation[key]))
    )
      return "Cor inválida.";
  if (
    presentation.font &&
    !["sans", "serif", "mono"].includes(String(presentation.font))
  )
    return "Fonte inválida.";
  if (
    presentation.alignment &&
    !["left", "center"].includes(String(presentation.alignment))
  )
    return "Alinhamento inválido.";
  return null;
}
export function workspaceAnswerError(
  fields: WorkspaceFormField[],
  answers: unknown,
) {
  const e = validateAnswers(fields, answers);
  if (e) return e;
  const values = answers as Record<string, string>;
  for (const f of visibleFormFields(fields, values)) {
    const value = values[f.id];
    if (!value) continue;
    if (f.input_style === "multi") {
      try {
        const selected = JSON.parse(value);
        if (
          !Array.isArray(selected) ||
          selected.some(
            (v) => typeof v !== "string" || !f.options?.includes(v),
          ) ||
          new Set(selected).size !== selected.length ||
          (f.required && !selected.length)
        )
          return `Seleção inválida: ${f.label}`;
      } catch {
        return `Seleção inválida: ${f.label}`;
      }
    }
    if (f.input_style === "url") {
      try {
        if (!["https:", "http:"].includes(new URL(value).protocol))
          return `Site inválido: ${f.label}`;
      } catch {
        return `Site inválido: ${f.label}`;
      }
    }
  }
  return null;
}
