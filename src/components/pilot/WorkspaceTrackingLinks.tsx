import { trackingUrls } from "@/lib/trackingUrls";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useFlowContext } from "./useFlowContext";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
  slug?: string;
  medium?: string;
  content?: string;
  term?: string;
  stage_id?: string;
  whatsapp_account_id?: string;
  capture_lead?: boolean;
  code_style?: string;
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
  busy,
  act,
}: {
  workspace: string;
  links: Link[];
  busy: boolean;
  act: (fn: () => PromiseLike<unknown>) => Promise<void>;
}) {
  const { user } = useAuth();
  const context = useFlowContext(workspace);
  const [editingId, setEditingId] = useState("");
  const [saveError, setSaveError] = useState("");
  const [builder, setBuilder] = useState(false),
    [copied, setCopied] = useState(false),
    [copyError, setCopyError] = useState("");
  const [slug, setSlug] = useState("");
  const [installationLink, setInstallationLink] = useState("");
  const [account, setAccount] = useState(""),
    [stage, setStage] = useState(""),
    [capture, setCapture] = useState(true),
    [codeStyle, setCodeStyle] = useState("invisible"),
    [code, setCode] = useState("");
  const [name, setName] = useState(""),
    [destination, setDestination] = useState("whatsapp"),
    [url, setUrl] = useState(""),
    [form, setForm] = useState(""),
    [phone, setPhone] = useState(""),
    [text, setText] = useState("Olá! Gostaria de mais informações."),
    [fixedTags, setFixedTags] = useState("");
  const q = useQuery({
    queryKey: ["tracking-attribution", user?.id, workspace],
    queryFn: async () => {
      const [forms, clicks, summary] = await Promise.all([
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
        workspaceDb.rpc("agency_workspace_tracking_summary", {
          p_workspace: workspace,
          p_days: 30,
        }),
      ]);
      if (forms.error) throw forms.error;
      if (clicks.error) throw clicks.error;
      if (summary.error) throw summary.error;
      return {
        forms: forms.data as {
          id: string;
          title: string;
          token: string;
          slug?: string;
          enabled: boolean;
        }[],
        clicks: clicks.data as Click[],
        summary: (summary.data || []) as {
          id: string;
          clicks: number;
          conversations: number;
          leads: number;
          google: number;
          last_click: string | null;
        }[],
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
        ? `https://wa.me/${(context.data?.accounts.find((a) => a.id === account)?.phone || phone).replace(/\D/g, "")}?text=${encodeURIComponent(text)}`
        : url;
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold">Links rastreáveis e atribuição</h3>
        <Button
          onClick={() => {
            setEditingId("");
            setSaveError("");
            setName("");
            setSlug("");
            setDestination("whatsapp");
            setAccount(context.data?.accounts[0]?.id || "");
            setPhone("");
            setStage("");
            setCapture(true);
            setCodeStyle("invisible");
            setText("Olá! Gostaria de mais informações.");
            setFixedTags("");
            setBuilder(true);
          }}
        >
          Novo link rastreável
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        O clique é registrado ao abrir o link. O lead é identificado ao enviar
        um formulário desta empresa ou a mensagem do WhatsApp com a referência
        incluída. Em sites externos, encaminhe os parâmetros de atribuição ao
        formulário ou webhook; só a visita não identifica a pessoa.
      </p>
      <div className="grid sm:grid-cols-4 gap-3">
        {[
          [
            "Cliques (30 dias)",
            q.data?.summary.reduce((n, s) => n + s.clicks, 0) || 0,
          ],
          [
            "Conversas rastreadas",
            q.data?.summary.reduce((n, s) => n + s.conversations, 0) || 0,
          ],
          [
            "Taxa de rastreio",
            (
              ((q.data?.summary.reduce((n, s) => n + s.conversations, 0) || 0) /
                Math.max(
                  1,
                  q.data?.summary.reduce((n, s) => n + s.clicks, 0) || 0,
                )) *
              100
            ).toFixed(1) + "%",
          ],
          [
            "Vieram do Google",
            q.data?.summary.reduce((n, s) => n + s.google, 0) || 0,
          ],
        ].map(([l, v]) => (
          <article className="border rounded-xl p-3" key={l}>
            <p className="text-xs text-muted-foreground">{l}</p>
            <strong className="text-xl">{v}</strong>
          </article>
        ))}
      </div>
      <Dialog
        open={builder}
        onOpenChange={(open) => {
          if (!busy) setBuilder(open);
        }}
      >
        <DialogContent className="max-w-md sm:max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Editar link rastreável" : "Novo link rastreável"}
            </DialogTitle>
            <DialogDescription>
              Leva para o seu WhatsApp e diz de onde a conversa veio.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            id="tracking-link-builder"
            onSubmit={(e) => {
              e.preventDefault();
              const tags = new URLSearchParams(fixedTags.replace(/^\?/, ""));
              const utm = Object.fromEntries(
                ["source", "medium", "campaign", "content", "term"].map((k) => [
                  k,
                  tags.get("utm_" + k) || "",
                ]),
              );
              if (Object.values(utm).some((v) => v.length > 200)) {
                setSaveError(
                  "Cada marcação deve ter no máximo 200 caracteres.",
                );
                return;
              }
              const values = {
                workspace_id: workspace,
                name,
                slug: slug || null,
                destination: target,
                ...utm,
                whatsapp_account_id: account || null,
                stage_id: stage || null,
                capture_lead: capture,
                code_style: codeStyle,
              };
              setSaveError("");
              void act(async () => {
                try {
                  const r = editingId
                    ? await workspaceDb
                        .from("agency_workspace_tracking_links")
                        .update(values)
                        .eq("workspace_id", workspace)
                        .eq("id", editingId)
                    : await workspaceDb
                        .from("agency_workspace_tracking_links")
                        .insert(values);
                  if (r.error) setSaveError(r.error.message);
                  if (!r.error) {
                    setEditingId("");
                    setBuilder(false);
                  }
                  return r;
                } catch (e) {
                  setSaveError((e as Error).message);
                  throw e;
                }
              });
            }}
          >
            <label className="block text-sm space-y-1.5">
              <span>Nome do link</span>
              <Input
                aria-label="Nome do link"
                required
                value={name}
                placeholder="Site principal"
                onChange={(e) => setName(e.target.value)}
              />
              <span className="block text-xs text-muted-foreground">
                Aparece como origem do lead.
              </span>
            </label>
            <label className="block text-sm space-y-1.5">
              <span>Nome curto do link</span>
              <Input
                aria-label="Nome curto do link"
                value={slug}
                minLength={3}
                maxLength={60}
                pattern="[a-z0-9][a-z0-9-]{2,59}"
                placeholder="google-comercial"
                onChange={(e) => setSlug(e.target.value)}
              />
              <span className="block text-xs text-muted-foreground break-all">
                É como o link aparece no código: /functions/v1/link-rastreavel/
                {slug || "nome-curto"}
              </span>
            </label>
            {destination === "whatsapp" && (
              <>
                <label className="block text-sm space-y-1.5">
                  <span>WhatsApp que recebe</span>
                  <select
                    aria-label="WhatsApp que recebe"
                    className={selectClass + " w-full"}
                    value={account}
                    onChange={(e) => setAccount(e.target.value)}
                  >
                    <option value="">Informar número manualmente</option>
                    {context.data?.accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.phone}
                      </option>
                    ))}
                  </select>
                  <span className="block text-xs text-muted-foreground">
                    É para este número que a conversa vai. O número do botão do
                    site é ignorado.
                  </span>
                </label>
                {!account && (
                  <label className="block text-sm space-y-1.5">
                    <span>WhatsApp com DDI</span>
                    <Input
                      required
                      pattern="[0-9+ ()-]{10,20}"
                      placeholder="5511999999999"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </label>
                )}
                <label className="block text-sm space-y-1.5">
                  <span>Mensagem pronta</span>
                  <Textarea
                    aria-label="Mensagem inicial"
                    required
                    maxLength={1000}
                    rows={3}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                  />
                  <span className="block text-xs text-muted-foreground">
                    Se o botão do site já tiver uma frase, ela é usada no lugar
                    desta.
                  </span>
                </label>
                <label className="block text-sm space-y-1.5">
                  <span>Código na mensagem</span>
                  <select
                    aria-label="Código na mensagem"
                    className={selectClass + " w-full"}
                    value={codeStyle}
                    onChange={(e) => setCodeStyle(e.target.value)}
                  >
                    <option value="invisible">
                      Invisível — a pessoa não vê nada diferente
                    </option>
                    <option value="visible">
                      Visível — referência no final da mensagem
                    </option>
                  </select>
                  <span className="block text-xs text-muted-foreground">
                    Alguns aplicativos removem códigos invisíveis. Se isso
                    acontecer, use a referência visível.
                  </span>
                </label>
              </>
            )}
            <fieldset className="border rounded-lg p-3 space-y-3">
              <legend className="px-1 text-sm font-medium">
                Quando a conversa chegar
              </legend>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm space-y-1.5">
                  <span>Origem no CRM</span>
                  <select
                    aria-label="Origem no CRM"
                    className={selectClass + " w-full"}
                    value={
                      context.data?.stages.find((s) => s.id === stage)
                        ?.pipeline_id || ""
                    }
                    onChange={(e) =>
                      setStage(
                        context.data?.stages.find(
                          (s) => s.pipeline_id === e.target.value,
                        )?.id || "",
                      )
                    }
                  >
                    <option value="">A origem padrão do CRM</option>
                    {context.data?.pipelines.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm space-y-1.5">
                  <span>Etapa</span>
                  <select
                    aria-label="Etapa dos contatos do link"
                    className={selectClass + " w-full"}
                    value={stage}
                    onChange={(e) => setStage(e.target.value)}
                  >
                    <option value="">Padrão da conexão</option>
                    {context.data?.stages
                      .filter(
                        (s) =>
                          !stage ||
                          s.pipeline_id ===
                            context.data?.stages.find((x) => x.id === stage)
                              ?.pipeline_id,
                      )
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>Criar oportunidade no CRM automaticamente</span>
                <Switch
                  aria-label="Criar oportunidade no CRM ao chegar uma conversa"
                  checked={capture}
                  onCheckedChange={setCapture}
                />
              </label>
            </fieldset>
            <label className="block text-sm space-y-1.5">
              <span>Marcação fixa do link (opcional)</span>
              <Input
                aria-label="Marcação fixa do link"
                placeholder="utm_source=instagram&utm_medium=bio"
                value={fixedTags}
                onChange={(e) => setFixedTags(e.target.value)}
              />
              <span className="block text-xs text-muted-foreground">
                A marcação que vier do anúncio tem prioridade sobre esta.
              </span>
            </label>
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">
                Outros destinos: site ou formulário
              </summary>
              <div className="space-y-3 pt-3">
                <label className="block space-y-1.5">
                  <span>Destino</span>
                  <select
                    aria-label="Destino"
                    className={selectClass + " w-full"}
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                  >
                    <option value="whatsapp">WhatsApp</option>
                    <option value="website">Site externo</option>
                    <option value="form">Formulário desta empresa</option>
                  </select>
                </label>
                {destination === "form" && (
                  <label className="block space-y-1.5">
                    <span>Formulário</span>
                    <select
                      aria-label="Formulário"
                      required
                      className={selectClass + " w-full"}
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
                )}
                {destination === "website" && (
                  <label className="block space-y-1.5">
                    <span>URL HTTPS</span>
                    <Input
                      required
                      type="url"
                      pattern="https://.*"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                    />
                  </label>
                )}
              </div>
            </details>
            {saveError && (
              <p
                role="alert"
                className="sm:col-span-2 text-sm text-destructive"
              >
                {saveError}
              </p>
            )}
            <div className="flex justify-end gap-2 border-t pt-3">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setBuilder(false)}
              >
                Cancelar
              </Button>
              <Button
                disabled={
                  busy ||
                  !target ||
                  !name.trim() ||
                  (destination === "whatsapp" && !account && !phone.trim())
                }
              >
                {editingId ? "Salvar link" : "Criar link"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      {q.error && <p role="alert">{q.error.message}</p>}
      {links.map((l) => (
        <article key={l.id} className="border rounded-xl p-4 bg-card space-y-2">
          <div className="flex justify-between gap-3">
            <div>
              <h4 className="font-semibold">{l.name}</h4>
              <p className="text-xs text-muted-foreground">
                {q.data?.summary.find((s) => s.id === l.id)?.clicks || 0}{" "}
                cliques ·{" "}
                {q.data?.summary.find((s) => s.id === l.id)?.conversations || 0}{" "}
                conversas rastreadas · últimos 30 dias ·{" "}
                {l.enabled ? "Ativo" : "Pausado"}
              </p>
            </div>
            <RecordMenu
              enabled={!busy}
              edit={() => {
                setEditingId(l.id);
                setSaveError("");
                setBuilder(true);
                setName(l.name);
                setSlug(l.slug || "");
                setFixedTags(
                  new URLSearchParams(
                    Object.fromEntries(
                      Object.entries({
                        source: l.source,
                        medium: l.medium,
                        campaign: l.campaign,
                        content: l.content,
                        term: l.term,
                      })
                        .filter(([, v]) => !!v)
                        .map(([k, v]) => ["utm_" + k, v!]),
                    ),
                  ).toString(),
                );
                setAccount(l.whatsapp_account_id || "");
                setStage(l.stage_id || "");
                setCapture(l.capture_lead !== false);
                setCodeStyle(l.code_style || "visible");
                const u = new URL(l.destination);
                const linkedForm = q.data?.forms.find(
                  (f) =>
                    u.origin === window.location.origin &&
                    u.pathname === `/captura/${f.token}`,
                );
                if (linkedForm) {
                  setDestination("form");
                  setForm(linkedForm.id);
                } else if (
                  ["wa.me", "api.whatsapp.com", "web.whatsapp.com"].includes(
                    u.hostname,
                  )
                ) {
                  setDestination("whatsapp");
                  setPhone(u.searchParams.get("phone") || u.pathname.slice(1));
                  setText(u.searchParams.get("text") || "Olá!");
                } else {
                  setDestination("website");
                  setUrl(l.destination);
                }
              }}
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
          <p className="text-xs text-muted-foreground">
            Últimos 30 dias:{" "}
            {q.data?.summary.find((s) => s.id === l.id)?.clicks || 0} cliques ·{" "}
            {q.data?.summary.find((s) => s.id === l.id)?.conversations || 0}{" "}
            conversas · Google:{" "}
            {q.data?.summary.find((s) => s.id === l.id)?.google || 0}
          </p>
          <ShareLink
            url={trackingUrls(window.location.origin, l.slug || l.token).direct}
          />
          {/^https:\/\/(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)\//.test(
            l.destination,
          ) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const urls = trackingUrls(
                  window.location.origin,
                  l.slug || l.token,
                );
                setCode(urls.snippet);
                setInstallationLink(urls.direct);
              }}
            >
              Código do site
            </Button>
          )}
        </article>
      ))}
      <Dialog
        open={!!code}
        onOpenChange={(open) => {
          if (!open) {
            setCode("");
            setCopied(false);
            setCopyError("");
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Código para instalar no site</DialogTitle>
            <DialogDescription>
              Instale uma vez no &lt;head&gt; de todas as páginas do site.
            </DialogDescription>
          </DialogHeader>
          <section className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Cole no &lt;head&gt; de todas as páginas ou como HTML
              personalizado no Google Tag Manager, com acionamento All Pages. O
              código identifica cliques nos botões de WhatsApp e preserva os
              dados do anúncio por até 90 dias neste navegador. Instale um único
              código por página.
            </p>
            <textarea
              aria-label="Código do site"
              readOnly
              className="w-full bg-background border p-3 text-xs"
              value={code}
            />
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(code);
                  setCopied(true);
                  setCopyError("");
                } catch {
                  setCopyError(
                    "Não foi possível copiar automaticamente. Selecione o código acima e copie.",
                  );
                }
              }}
            >
              {copied ? "Código copiado" : "Copiar código"}
            </Button>
            {copyError && (
              <p role="alert" className="text-sm text-destructive">
                {copyError}
              </p>
            )}
            <ol className="text-sm list-decimal pl-5 space-y-2">
              <li>
                Mantenha o anúncio apontando para o seu site e a marcação
                automática do Google Ads ativada.
              </li>
              <li>
                Para um botão usar outro link, adicione
                data-central-link="outro-nome-curto" ao botão.
              </li>
              <li>
                Após instalar, abra a página com os parâmetros do anúncio e
                clique no botão de WhatsApp.
              </li>
              <li>
                Envie a mensagem com a referência para associar o contato ao
                clique. Clicar sem enviar não identifica a conversa.
              </li>
            </ol>
            <div className="space-y-2 border-t pt-3">
              <h4 className="font-medium text-sm">
                Sem site? Use o link direto
              </h4>
              <p className="text-xs text-muted-foreground">
                Para bio, e-mail ou QR Code. Em anúncios que levam ao seu site,
                mantenha o endereço do site como destino do anúncio.
              </p>
              <ShareLink url={installationLink} />
            </div>
            <p className="text-xs text-muted-foreground">
              Este código registra a origem. As conversões nas plataformas
              dependem da conexão Meta/Google e de regras de conversão ativas.
              Configure o consentimento e a política de privacidade do site para
              o armazenamento dos identificadores.
            </p>
          </section>
        </DialogContent>
      </Dialog>
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
