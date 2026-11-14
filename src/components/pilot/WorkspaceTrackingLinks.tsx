import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { workspaceDb } from "@/lib/clientWorkspaces";
import { dateLabel, selectClass } from "@/lib/workspaceCommercial";
import { RecordMenu, ShareLink } from "./CommercialShared";
interface Link {
  id: string;
  name: string;
  destination: string;
  source: string;
  campaign: string;
  token: string;
  clicks: number;
  enabled: boolean;
}
interface Click {
  id: string;
  link_id: string;
  lead_id: string | null;
  created_at: string;
  attributes: Record<string, string>;
}
export default function TrackingLinks({
  workspace,
  links,
  base,
  busy,
  act,
}: {
  workspace: string;
  links: Link[];
  base: string;
  busy: boolean;
  act: (fn: () => PromiseLike<unknown>) => Promise<void>;
}) {
  const { user } = useAuth();
  const [name, setName] = useState(""),
    [destination, setDestination] = useState("website"),
    [url, setUrl] = useState(""),
    [form, setForm] = useState(""),
    [phone, setPhone] = useState(""),
    [text, setText] = useState("Olá! Gostaria de mais informações."),
    [utm, setUtm] = useState({
      source: "",
      medium: "",
      campaign: "",
      content: "",
      term: "",
    });
  const q = useQuery({
    queryKey: ["tracking-attribution", user?.id, workspace],
    queryFn: async () => {
      const [forms, clicks] = await Promise.all([
        workspaceDb
          .from("agency_workspace_forms")
          .select("id,title,token,enabled")
          .eq("workspace_id", workspace),
        workspaceDb
          .from("agency_workspace_tracking_clicks")
          .select("id,link_id,lead_id,created_at,attributes")
          .eq("workspace_id", workspace)
          .order("created_at", { ascending: false })
          .limit(100),
      ]);
      if (forms.error) throw forms.error;
      if (clicks.error) throw clicks.error;
      return {
        forms: forms.data as {
          id: string;
          title: string;
          token: string;
          enabled: boolean;
        }[],
        clicks: clicks.data as Click[],
      };
    },
    refetchInterval: 10000,
  });
  const selected = q.data?.forms.find((f) => f.id === form);
  const target =
    destination === "form"
      ? selected
        ? `${window.location.origin}/captura/${selected.token}`
        : ""
      : destination === "whatsapp"
        ? `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`
        : url;
  return (
    <section className="space-y-4">
      <h3 className="font-semibold">Links rastreáveis e atribuição</h3>
      <p className="text-sm text-muted-foreground">
        O clique é registrado ao abrir o link. O lead é identificado ao enviar
        um formulário desta empresa ou a mensagem do WhatsApp com a referência
        incluída. Em sites externos, encaminhe os parâmetros de atribuição ao
        formulário ou webhook; só a visita não identifica a pessoa.
      </p>
      <form
        className="border rounded-xl p-4 bg-card grid sm:grid-cols-2 gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void act(() =>
            workspaceDb.from("agency_workspace_tracking_links").insert({
              workspace_id: workspace,
              name,
              destination: target,
              ...utm,
            }),
          );
        }}
      >
        <label className="text-sm space-y-1">
          Nome do link
          <Input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="text-sm space-y-1">
          Destino
          <select
            aria-label="Destino"
            className={selectClass}
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
          >
            <option value="website">Site externo</option>
            <option value="form">Formulário desta empresa</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
        </label>
        {destination === "form" ? (
          <label className="text-sm space-y-1">
            Formulário
            <select
              aria-label="Formulário"
              required
              className={selectClass}
              value={form}
              onChange={(e) => setForm(e.target.value)}
            >
              <option value="">Selecione</option>
              {q.data?.forms
                .filter((f) => f.enabled)
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.title}
                  </option>
                ))}
            </select>
          </label>
        ) : destination === "whatsapp" ? (
          <>
            <label className="text-sm space-y-1">
              WhatsApp com DDI
              <Input
                required
                pattern="[0-9+ ()-]{10,20}"
                placeholder="5511999999999"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </label>
            <label className="text-sm space-y-1">
              Mensagem inicial
              <Input
                required
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </label>
          </>
        ) : (
          <label className="text-sm space-y-1">
            URL HTTPS
            <Input
              required
              type="url"
              pattern="https://.*"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </label>
        )}
        {(
          [
            ["source", "Origem (utm_source)"],
            ["medium", "Meio (utm_medium)"],
            ["campaign", "Campanha (utm_campaign)"],
            ["content", "Anúncio/conteúdo (utm_content)"],
            ["term", "Palavra-chave (utm_term)"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="text-sm space-y-1">
            {label}
            <Input
              maxLength={200}
              value={utm[key]}
              onChange={(e) => setUtm({ ...utm, [key]: e.target.value })}
            />
          </label>
        ))}
        <p className="sm:col-span-2 break-all text-xs text-muted-foreground">
          Destino: {target || "Preencha o destino"}
        </p>
        <Button disabled={busy || !target}>Criar link</Button>
      </form>
      {q.error && <p role="alert">{q.error.message}</p>}
      {links.map((l) => (
        <article key={l.id} className="border rounded-xl p-4 bg-card space-y-2">
          <div className="flex justify-between gap-3">
            <div>
              <h4 className="font-semibold">{l.name}</h4>
              <p className="text-xs text-muted-foreground">
                {l.clicks} cliques totais ·{" "}
                {q.data?.clicks.filter((c) => c.link_id === l.id && c.lead_id)
                  .length || 0}{" "}
                cliques vinculados a leads entre os 100 mais recentes ·{" "}
                {l.enabled ? "Ativo" : "Pausado"}
              </p>
            </div>
            <RecordMenu
              enabled={!busy}
              toggle={() =>
                void act(() =>
                  workspaceDb
                    .from("agency_workspace_tracking_links")
                    .update({ enabled: !l.enabled })
                    .eq("workspace_id", workspace)
                    .eq("id", l.id),
                )
              }
              remove={() =>
                void act(() =>
                  workspaceDb
                    .from("agency_workspace_tracking_links")
                    .delete()
                    .eq("workspace_id", workspace)
                    .eq("id", l.id),
                )
              }
            />
          </div>
          <p className="text-xs break-all text-muted-foreground">
            {l.destination}
          </p>
          <ShareLink url={base + l.token} />
        </article>
      ))}
      <section className="border rounded-xl p-4 space-y-3">
        <h4 className="font-semibold">Últimos cliques recebidos</h4>
        <p className="text-xs text-muted-foreground">
          Google Ads precisa de gclid, gbraid ou wbraid recebido do anúncio.
          Meta usa os identificadores e dados do contato disponíveis. Configure
          o provedor e uma regra de conversão; a confirmação de envio aparece no
          histórico de ações externas e não garante a atribuição no relatório do
          anúncio.
        </p>
        {!q.data?.clicks.length && (
          <p className="text-sm">Nenhum clique recebido ainda.</p>
        )}
        {q.data?.clicks.map((c) => (
          <div key={c.id} className="border-t pt-2 text-xs space-y-1">
            <p>
              {dateLabel(c.created_at)} ·{" "}
              {links.find((l) => l.id === c.link_id)?.name || "Link removido"} ·{" "}
              {c.lead_id
                ? "Lead identificado"
                : "Aguardando identificação do lead"}
            </p>
            <p className="text-muted-foreground">
              {c.attributes.utm_source || "Sem origem"} /{" "}
              {c.attributes.utm_campaign || "Sem campanha"} · Google:{" "}
              {c.attributes.gclid || c.attributes.gbraid || c.attributes.wbraid
                ? "identificador recebido"
                : "sem identificador"}{" "}
              · Meta:{" "}
              {c.attributes.fbclid ? "identificador recebido" : "sem fbclid"}
            </p>
          </div>
        ))}
      </section>
    </section>
  );
}
