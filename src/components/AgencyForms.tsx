import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  agencySelectClass,
  type AgencyForm,
  type FormField,
  type FormResponse,
} from "@/lib/agency";
import { toast } from "sonner";

const fieldTypes = {
  text: "Texto curto",
  textarea: "Texto longo",
  email: "E-mail",
  date: "Data",
  number: "Número",
};
const newField = (): FormField => ({
  id: crypto.randomUUID(),
  label: "",
  type: "text",
  required: false,
});
type Draft = {
  id?: string;
  title: string;
  description: string;
  fields: FormField[];
};

export default function AgencyForms() {
  const { user } = useAuth();
  const [forms, setForms] = useState<AgencyForm[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [selected, setSelected] = useState<AgencyForm | null>(null);
  const [responses, setResponses] = useState<FormResponse[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("agency_forms")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) {
      setError(
        "Não foi possível carregar os formulários. Verifique a conexão e a atualização do banco.",
      );
      return;
    }
    setError("");
    setForms(data);
  }, [user]);
  useEffect(() => {
    void load();
  }, [load]);
  const selectedId = selected?.id;
  useEffect(() => {
    let cancelled = false;
    setResponses([]);
    if (selectedId)
      void supabase
        .from("agency_form_responses")
        .select("*")
        .eq("form_id", selectedId)
        .order("created_at", { ascending: false })
        .then(({ data, error }) => {
          if (cancelled) return;
          if (error) toast.error("Falha ao carregar respostas.");
          else setResponses(data);
        });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);
  const save = async () => {
    if (!draft || !user) return;
    if (
      !draft.title.trim() ||
      !draft.fields.length ||
      draft.fields.some((f) => !f.label.trim())
    ) {
      toast.error("Preencha o título e o nome de cada campo.");
      return;
    }
    setBusy(true);
    const payload = {
      title: draft.title.trim(),
      description: draft.description,
      fields: draft.fields.map((f) => ({ ...f, label: f.label.trim() })),
    };
    const { error } = draft.id
      ? await supabase
          .from("agency_forms")
          .update(payload)
          .eq("id", draft.id)
          .select("id")
          .single()
      : await supabase
          .from("agency_forms")
          .insert({
            ...payload,
            user_id: user.id,
            enabled: true,
            token:
              crypto.randomUUID().replace(/-/g, "") +
              crypto.randomUUID().replace(/-/g, ""),
          })
          .select("id")
          .single();
    setBusy(false);
    if (error) {
      toast.error("Não foi possível salvar o formulário.");
      return;
    }
    setDraft(null);
    toast.success("Formulário salvo!");
    await load();
  };
  const toggle = async (form: AgencyForm) => {
    setBusy(true);
    const { error } = await supabase
      .from("agency_forms")
      .update({ enabled: !form.enabled })
      .eq("id", form.id)
      .select("id")
      .single();
    setBusy(false);
    if (error) {
      toast.error("Falha ao atualizar o formulário.");
      return;
    }
    await load();
  };
  const patchField = (id: string, patch: Partial<FormField>) =>
    draft &&
    setDraft({
      ...draft,
      fields: draft.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    });
  return (
    <div className="space-y-4">
      <div className="flex justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Formulários</h2>
          <p className="text-sm text-muted-foreground">
            Crie briefings, onboarding e formulários internos. Compartilhe o
            link para receber respostas.
          </p>
        </div>
        <Button
          onClick={() =>
            setDraft({ title: "", description: "", fields: [newField()] })
          }
        >
          Novo formulário
        </Button>
      </div>
      {error && <p role="alert">{error}</p>}
      {forms.map((form) => (
        <article key={form.id} className="border rounded-xl p-4 space-y-3">
          <h3 className="font-semibold">
            {form.title}{" "}
            <span className="text-sm text-muted-foreground">
              · {form.enabled ? "Ativo" : "Desativado"}
            </span>
          </h3>
          <p className="text-sm text-muted-foreground">{form.description}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() =>
                setDraft({
                  id: form.id,
                  title: form.title,
                  description: form.description,
                  fields: form.fields.map((f) => ({ ...f })),
                })
              }
            >
              Editar
            </Button>
            <Button
              variant="outline"
              disabled={!form.enabled}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    `${location.origin}/formulario/${form.token}`,
                  );
                  toast.success("Link copiado!");
                } catch {
                  toast.error("Não foi possível copiar o link.");
                }
              }}
            >
              Copiar link
            </Button>
            <Button variant="outline" onClick={() => setSelected(form)}>
              Ver respostas
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => void toggle(form)}
            >
              {form.enabled ? "Desativar" : "Ativar"}
            </Button>
          </div>
        </article>
      ))}
      {!error && !forms.length && (
        <p className="text-muted-foreground">Nenhum formulário criado.</p>
      )}
      <Dialog
        open={!!draft}
        onOpenChange={(open) => {
          if (!open && !busy) setDraft(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {draft?.id ? "Editar formulário" : "Novo formulário"}
            </DialogTitle>
            <DialogDescription>
              As respostas anteriores são preservadas com os nomes dos campos no
              momento do envio.
            </DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="space-y-4">
              <Label htmlFor="form-title">Título</Label>
              <Input
                id="form-title"
                maxLength={160}
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
              <Label htmlFor="form-description">Descrição</Label>
              <Textarea
                id="form-description"
                maxLength={3000}
                value={draft.description}
                onChange={(e) =>
                  setDraft({ ...draft, description: e.target.value })
                }
              />
              {draft.fields.map((field, i) => (
                <div key={field.id} className="border rounded-lg p-3 space-y-3">
                  <Label htmlFor={`field-${field.id}`}>Campo {i + 1}</Label>
                  <Input
                    id={`field-${field.id}`}
                    maxLength={160}
                    value={field.label}
                    onChange={(e) =>
                      patchField(field.id, { label: e.target.value })
                    }
                  />
                  <select
                    className={agencySelectClass}
                    aria-label={`Tipo do campo ${i + 1}`}
                    value={field.type}
                    onChange={(e) =>
                      patchField(field.id, {
                        type: e.target.value as FormField["type"],
                      })
                    }
                  >
                    {Object.entries(fieldTypes).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={field.required}
                      onChange={(e) =>
                        patchField(field.id, { required: e.target.checked })
                      }
                    />
                    Obrigatório
                  </label>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={i === 0}
                      onClick={() => {
                        const fields = [...draft.fields];
                        [fields[i], fields[i - 1]] = [fields[i - 1], fields[i]];
                        setDraft({ ...draft, fields });
                      }}
                    >
                      Subir
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={draft.fields.length === 1}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          fields: draft.fields.filter((f) => f.id !== field.id),
                        })
                      }
                    >
                      Remover
                    </Button>
                  </div>
                </div>
              ))}
              <div className="flex justify-between gap-2">
                <Button
                  variant="outline"
                  disabled={draft.fields.length >= 40}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      fields: [...draft.fields, newField()],
                    })
                  }
                >
                  Adicionar campo
                </Button>
                <Button disabled={busy} onClick={() => void save()}>
                  Salvar formulário
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Respostas · {selected?.title}</DialogTitle>
            <DialogDescription>
              {responses.length} resposta(s) recebida(s).
            </DialogDescription>
          </DialogHeader>
          {responses.map((response) => (
            <article
              key={response.id}
              className="border rounded-lg p-4 space-y-3"
            >
              <p className="text-xs text-muted-foreground">
                {new Date(response.created_at).toLocaleString("pt-BR")}
              </p>
              {Object.entries(response.answers).map(([id, answer]) => (
                <div key={id}>
                  <p className="font-medium text-sm">{answer.label}</p>
                  <p className="whitespace-pre-wrap text-sm">
                    {answer.value || "—"}
                  </p>
                </div>
              ))}
            </article>
          ))}
        </DialogContent>
      </Dialog>
    </div>
  );
}
