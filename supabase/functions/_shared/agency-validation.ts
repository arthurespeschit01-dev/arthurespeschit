export function validateAnswers(
  fields: { id: string; label: string; type: string; required: boolean }[],
  answers: unknown,
): string | null {
  if (!answers || typeof answers !== "object" || Array.isArray(answers))
    return "Respostas inválidas.";
  const values = answers as Record<string, unknown>;
  const ids = new Set(fields.map((f) => f.id));
  if (Object.keys(values).some((key) => !ids.has(key)))
    return "O formulário mudou. Atualize a página antes de enviar.";
  for (const field of fields) {
    const value = values[field.id] ?? "";
    if (typeof value !== "string" || value.length > 5000)
      return `Resposta inválida: ${field.label}`;
    if (field.required && !value.trim()) return `Preencha: ${field.label}`;
    if (
      value &&
      field.type === "email" &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    )
      return `E-mail inválido: ${field.label}`;
    if (value && field.type === "number" && !Number.isFinite(Number(value)))
      return `Número inválido: ${field.label}`;
    if (
      value &&
      field.type === "date" &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)))
    )
      return `Data inválida: ${field.label}`;
  }
  return null;
}
