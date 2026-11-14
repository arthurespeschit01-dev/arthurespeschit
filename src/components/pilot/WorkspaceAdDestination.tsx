import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { WorkspaceStage } from "@/lib/clientWorkspaces";
import { selectClass } from "@/lib/workspaceCommercial";
export default function WorkspaceAdDestination({
  stages,
  value,
  save,
  busy,
}: {
  stages: WorkspaceStage[];
  value?: { create_leads: boolean; stage_id: string | null };
  save: (values: unknown) => void;
  busy: boolean;
}) {
  const [draft, setDraft] = useState(
    value || { create_leads: true, stage_id: null as string | null },
  );
  return (
    <section className="border rounded-xl bg-card p-4 space-y-3">
      <h3 className="font-semibold">
        Destino dos leads do Meta Ads · Anúncio de WhatsApp
      </h3>
      <p className="text-xs text-muted-foreground">
        Usa a referência real do anúncio recebida pelo WhatsApp. Contatos já
        cadastrados mantêm a etapa atual.
      </p>
      <label className="flex gap-2 text-sm">
        <input
          type="checkbox"
          checked={draft.create_leads}
          onChange={(e) =>
            setDraft({ ...draft, create_leads: e.target.checked })
          }
        />
        Criar leads automaticamente a partir de anúncios
      </label>
      <label className="text-sm block">
        Etapa no CRM
        <select
          aria-label="Destino dos leads Meta"
          className={selectClass + " w-full"}
          value={draft.stage_id || ""}
          onChange={(e) =>
            setDraft({ ...draft, stage_id: e.target.value || null })
          }
        >
          <option value="">Etapa padrão da conexão</option>
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <Button disabled={busy} onClick={() => save(draft)}>
        Salvar destino
      </Button>
    </section>
  );
}
