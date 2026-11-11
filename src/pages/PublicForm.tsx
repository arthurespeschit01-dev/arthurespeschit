import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { FormField } from "@/lib/agency";

export default function PublicForm() {
  const { token } = useParams();
  const [form, setForm] = useState<{
    title: string;
    description: string;
    fields: FormField[];
  } | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    setForm(null);
    setAnswers({});
    setSent(false);
    setError("");
    void supabase.functions
      .invoke("agency-portal", { body: { action: "form", token } })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error)
          setError(
            "Este link é inválido, foi desativado ou não pôde ser carregado.",
          );
        else setForm(data);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabase.functions.invoke("agency-portal", {
      body: { action: "submit_form", token, answers },
    });
    setBusy(false);
    if (error) {
      let message = "Não foi possível enviar suas respostas.";
      try {
        message = (await error.context?.json())?.error || message;
      } catch {
        /* use fallback */
      }
      setError(message);
      return;
    }
    setSent(true);
  };
  return (
    <main className="max-w-2xl mx-auto p-5 py-12 space-y-6 min-h-screen">
      <p className="text-sm text-primary">Central do Gestor</p>
      {error && (
        <p role="alert" className="border border-destructive rounded-lg p-3">
          {error}
        </p>
      )}
      {sent ? (
        <div className="border rounded-xl p-8">
          <h1 className="text-2xl font-bold">Respostas enviadas</h1>
          <p className="mt-3 text-muted-foreground">
            Obrigado! Suas informações foram recebidas.
          </p>
        </div>
      ) : form ? (
        <form onSubmit={submit} className="border rounded-xl p-6 space-y-5">
          <h1 className="text-2xl font-bold">{form.title}</h1>
          <p className="text-muted-foreground whitespace-pre-wrap">
            {form.description}
          </p>
          {form.fields.map((field) => (
            <div key={field.id} className="space-y-2">
              <Label htmlFor={field.id}>
                {field.label}
                {field.required ? " *" : ""}
              </Label>
              {field.type === "textarea" ? (
                <Textarea
                  id={field.id}
                  required={field.required}
                  maxLength={5000}
                  value={answers[field.id] || ""}
                  onChange={(e) =>
                    setAnswers({ ...answers, [field.id]: e.target.value })
                  }
                />
              ) : (
                <Input
                  id={field.id}
                  required={field.required}
                  type={field.type}
                  maxLength={5000}
                  value={answers[field.id] || ""}
                  onChange={(e) =>
                    setAnswers({ ...answers, [field.id]: e.target.value })
                  }
                />
              )}
            </div>
          ))}
          <Button disabled={busy} type="submit">
            {busy ? "Enviando…" : "Enviar respostas"}
          </Button>
        </form>
      ) : (
        !error && <p role="status">Carregando formulário…</p>
      )}
    </main>
  );
}
