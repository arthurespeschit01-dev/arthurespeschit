import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { workspaceDb, type WorkspaceStage } from "@/lib/clientWorkspaces";
import {
  workspaceOperation,
  dateLabel,
  selectClass,
} from "@/lib/workspaceCommercial";
import { RecordMenu, ShareLink, Empty } from "./CommercialShared";
const fields: Record<string, [string, string, boolean][]> = {
  meta: [
    ["pixel_id", "Pixel ID", false],
    ["access_token", "Token de acesso", true],
    ["test_event_code", "Código de teste (opcional)", false],
    ["page_id", "Page ID (para captar formulários Meta)", false],
    ["app_secret", "Segredo do aplicativo (webhook Meta)", true],
    ["verify_token", "Token de verificação do webhook", true],
  ],
  google_ads: [
    ["customer_id", "ID da conta (10 dígitos, sem hífens)", false],
    ["conversion_action", "ID da ação de conversão", false],
    ["client_id", "OAuth Client ID", false],
    ["client_secret", "OAuth Client Secret", true],
    ["refresh_token", "OAuth Refresh Token com escopo Data Manager", true],
  ],
  email: [
    ["from", "Remetente verificado no Resend", false],
    ["api_key", "Chave da API Resend", true],
  ],
  sms: [
    ["from", "Número remetente Twilio (com +DDI)", false],
    ["account_sid", "Account SID Twilio", false],
    ["auth_token", "Auth Token Twilio", true],
  ],
};
interface Provider {
  enabled: boolean;
  credentials: Record<string, unknown>;
  configured: Record<string, boolean>;
}
interface Rule {
  id: string;
  name: string;
  provider: string;
  event_name: string;
  trigger_type: string;
  stage_id: string | null;
  phrase: string;
  direction: string;
  value: number;
  enabled: boolean;
}
interface Action {
  id: string;
  action: string;
  status: string;
  error: string | null;
  created_at: string;
}
interface TrackingLink {
  id: string;
  name: string;
  destination: string;
  source: string;
  campaign: string;
  token: string;
  clicks: number;
  enabled: boolean;
}
export default function WorkspaceProviders({
  workspace,
  manage,
  stages,
  mode,
}: {
  workspace: string;
  manage: boolean;
  stages: WorkspaceStage[];
  mode: "tracking" | "channels" | "credits";
}) {
  const { user } = useAuth(),
    client = useQueryClient();
  const [tab, setTab] = useState(mode === "channels" ? "email" : "meta"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const key = ["workspace-providers", user?.id, workspace];
  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      const [config, rules, actions, links] = await Promise.all([
        workspaceOperation<{
          providers: Record<string, Provider | null>;
          meta_callback: string;
          link_base: string;
        }>("provider_settings", { workspace_id: workspace }),
        workspaceDb
          .from("agency_workspace_conversion_rules")
          .select("*")
          .eq("workspace_id", workspace),
        workspaceDb
          .from("agency_workspace_action_outbox")
          .select("id,action,status,error,created_at")
          .eq("workspace_id", workspace)
          .order("created_at", { ascending: false })
          .limit(100),
        workspaceDb
          .from("agency_workspace_tracking_links")
          .select("*")
          .eq("workspace_id", workspace),
      ]);
      for (const r of [rules, actions, links]) if (r.error) throw r.error;
      return {
        config,
        rules: rules.data as Rule[],
        actions: actions.data as Action[],
        links: links.data as TrackingLink[],
      };
    },
    enabled: manage,
    refetchOnMount: "always",
    refetchInterval: 10000,
  });
  const act = async (fn: () => PromiseLike<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = (await fn()) as { error?: { message: string } };
      if (r?.error) throw r.error;
      await client.invalidateQueries({ queryKey: key });
      setMessage("Configuração salva.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!manage)
    return (
      <p className="text-sm text-muted-foreground">
        Somente administradores podem configurar os provedores, regras e limites
        desta empresa.
      </p>
    );
  if (q.isPending) return <p role="status">Carregando configurações…</p>;
  if (q.error) return <p role="alert">{q.error.message}</p>;
  const d = q.data!;
  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-2xl font-bold">
          {mode === "tracking"
            ? "Rastreamento de anúncios"
            : mode === "channels"
              ? "E-mail e SMS"
              : "Créditos e consumo"}
        </h2>
        <p className="text-sm text-muted-foreground mt-2">
          {mode === "tracking"
            ? "Envie à Meta e ao Google os resultados reais dos leads, por etapa do CRM ou por mensagem."
            : "Os envios utilizam as contas próprias desta empresa. A cobrança e o saldo financeiro são administrados diretamente pelo provedor."}
        </p>
      </header>
      {mode !== "credits" && (
        <div className="flex gap-2 flex-wrap">
          {(mode === "tracking"
            ? [
                ["meta", "Meta Ads"],
                ["google_ads", "Google Ads"],
                ["links", "Links rastreáveis"],
              ]
            : [
                ["email", "E-mail · Resend"],
                ["sms", "SMS · Twilio"],
              ]
          ).map(([k, v]) => (
            <Button
              key={k}
              variant={tab === k ? "default" : "outline"}
              onClick={() => setTab(k)}
            >
              {v}
            </Button>
          ))}
        </div>
      )}
      {mode === "credits" ? (
        <>
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {[
              ["email", "E-mail"],
              ["sms", "SMS"],
              ["meta", "Meta"],
              ["google_ads", "Google Ads"],
            ].map(([kind, label]) => {
              const actions = d.actions.filter(
                (a) =>
                  a.action ===
                  (
                    {
                      email: "send_email",
                      sms: "send_sms",
                      meta: "meta_event",
                      google_ads: "google_conversion",
                    } as Record<string, string>
                  )[kind],
              );
              return (
                <article
                  key={kind}
                  className="border rounded-xl p-4 bg-card space-y-2"
                >
                  <h3 className="font-semibold">{label}</h3>
                  <p className="text-sm">
                    {d.config.providers[kind]?.enabled ? "Ativo" : "Desativado"}
                  </p>
                  <p className="text-xl font-bold">
                    {actions.filter((a) => a.status === "sent").length}{" "}
                    confirmados
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Limite diário configurado:{" "}
                    {String(
                      d.config.providers[kind]?.credentials.daily_limit || 100,
                    )}{" "}
                    · Histórico recente de até 100 ações.
                  </p>
                </article>
              );
            })}
          </div>
          <p className="text-sm text-muted-foreground">
            Esta tela mostra utilização registrada pelo sistema; não representa
            um saldo pré-pago. Não existe compra ou cobrança automática de
            créditos pela Central.
          </p>
        </>
      ) : tab === "links" ? (
        <TrackingLinks
          workspace={workspace}
          links={d.links}
          base={d.config.link_base}
          busy={busy}
          act={act}
        />
      ) : (
        <>
          <ProviderForm
            key={tab}
            kind={tab}
            provider={d.config.providers[tab]}
            workspace={workspace}
            stages={stages}
            callback={d.config.meta_callback}
            disabled={busy}
            save={(v) =>
              void act(() =>
                workspaceOperation("save_provider", {
                  workspace_id: workspace,
                  kind: tab,
                  ...v,
                }),
              )
            }
          />
          {mode === "tracking" && (
            <ConversionRules
              workspace={workspace}
              provider={tab}
              rules={d.rules.filter((r) => r.provider === tab)}
              stages={stages}
              busy={busy}
              act={act}
            />
          )}
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      <section className="border rounded-xl bg-card p-4 space-y-3">
        <h3 className="font-semibold">Histórico de ações externas</h3>
        {d.actions.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr>
                  <th className="p-2">Data</th>
                  <th className="p-2">Ação</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Detalhe</th>
                </tr>
              </thead>
              <tbody>
                {d.actions.map((a) => (
                  <tr key={a.id} className="border-t">
                    <td className="p-2 whitespace-nowrap">
                      {dateLabel(a.created_at)}
                    </td>
                    <td className="p-2">{a.action}</td>
                    <td className="p-2">
                      {
                        (
                          {
                            queued: "Na fila",
                            sending: "Enviando",
                            sent: "Confirmado",
                            failed: "Falhou",
                            uncertain: "Não confirmado",
                            cancelled: "Cancelado",
                          } as Record<string, string>
                        )[a.status]
                      }
                    </td>
                    <td className="p-2">
                      {a.error || "—"}
                      {["failed", "uncertain"].includes(a.status) && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => {
                            if (
                              window.confirm(
                                a.status === "uncertain"
                                  ? "Confira se a ação já chegou ao destinatário ou provedor. Repetir pode duplicar o envio e gerar custos. Deseja reenviar mesmo assim?"
                                  : "Repetir esta ação pelo provedor configurado?",
                              )
                            )
                              void act(() =>
                                workspaceOperation("retry_action", {
                                  workspace_id: workspace,
                                  id: a.id,
                                  confirmed: true,
                                }),
                              );
                          }}
                        >
                          Tentar novamente
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Nenhuma ação externa executada nesta empresa.</Empty>
        )}
      </section>
    </div>
  );
}
function ProviderForm({
  kind,
  provider,
  workspace,
  stages,
  callback,
  disabled,
  save,
}: {
  kind: string;
  provider: Provider | null;
  workspace: string;
  stages: WorkspaceStage[];
  callback: string;
  disabled: boolean;
  save: (v: { enabled: boolean; credentials: Record<string, unknown> }) => void;
}) {
  const [values, setValues] = useState<Record<string, unknown>>(() => ({
      ...provider?.credentials,
    })),
    [enabled, setEnabled] = useState(provider?.enabled || false);
  return (
    <form
      className="border rounded-xl p-5 bg-card space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save({ enabled, credentials: values });
      }}
    >
      <div className="flex justify-between gap-3">
        <h3 className="font-semibold">
          Conexão{" "}
          {
            (
              {
                meta: "com a Meta",
                google_ads: "com Google Ads",
                email: "com Resend",
                sms: "com Twilio",
              } as Record<string, string>
            )[kind]
          }
        </h3>
        <span className="text-xs text-muted-foreground">
          {provider?.enabled ? "Ativa" : "Não ativa"}
        </span>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        {fields[kind]?.map(([key, label, secret]) => (
          <label key={key} className="text-sm block">
            {label}
            <Input
              type={secret ? "password" : "text"}
              autoComplete="off"
              value={String(values[key] || "")}
              maxLength={4096}
              placeholder={
                provider?.configured[key]
                  ? "Já configurado; deixe vazio para manter"
                  : ""
              }
              onChange={(e) => setValues({ ...values, [key]: e.target.value })}
            />
          </label>
        ))}
        <label className="text-sm block">
          Limite diário de ações
          <Input
            type="number"
            min="1"
            max="10000"
            value={Number(values.daily_limit || 100)}
            onChange={(e) =>
              setValues({ ...values, daily_limit: Number(e.target.value) })
            }
          />
        </label>
        {kind === "google_ads" && (
          <p className="text-xs text-muted-foreground">
            Usa a API Google Data Manager para novas integrações. Ative essa API
            no Google Cloud e autorize o escopo
            https://www.googleapis.com/auth/datamanager. A ação de conversão
            deve aceitar importação de cliques.
          </p>
        )}
        {kind === "meta" && (
          <label className="text-sm block">
            Destino dos formulários Meta Ads
            <select
              className={selectClass + " w-full"}
              value={String(values.entry_stage_id || "")}
              onChange={(e) =>
                setValues({ ...values, entry_stage_id: e.target.value })
              }
            >
              <option value="">Não configurado</option>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {kind === "meta" && (
        <details className="text-sm">
          <summary className="cursor-pointer">
            Conectar formulários Meta Ads por webhook
          </summary>
          <p className="text-xs text-muted-foreground mt-2">
            Configure Page ID, segredo do aplicativo, token de verificação e
            etapa de entrada. Autorize o aplicativo para receber leadgen da
            página e cadastre este retorno no painel da Meta:
          </p>
          <Input readOnly aria-label="URL do webhook Meta" value={callback} />
          <p className="text-xs text-muted-foreground mt-2">
            A aprovação e as permissões do aplicativo são concedidas pela Meta.
            O recebimento verifica a assinatura do webhook.
          </p>
        </details>
      )}
      <label className="flex gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        Ativar{" "}
        {kind === "meta" || kind === "google_ads"
          ? "envio de conversões"
          : "envios por este provedor"}
      </label>
      {["email", "sms"].includes(kind) && (
        <p className="text-xs text-muted-foreground">
          Ao ativar, os funis poderão enviar pela sua conta conectada e consumir
          a franquia ou gerar custos no provedor.
        </p>
      )}
      <Button disabled={disabled} type="submit">
        Salvar conexão
      </Button>
    </form>
  );
}
function ConversionRules({
  workspace,
  provider,
  rules,
  stages,
  busy,
  act,
}: {
  workspace: string;
  provider: string;
  rules: Rule[];
  stages: WorkspaceStage[];
  busy: boolean;
  act: (fn: () => PromiseLike<unknown>) => Promise<void>;
}) {
  const [editing, setEditing] = useState<Partial<Rule> | null>(null);
  return (
    <section className="space-y-3">
      <div className="flex justify-between gap-3">
        <h3 className="font-semibold">Regras de conversão</h3>
        <Button
          variant="outline"
          onClick={() =>
            setEditing({
              name: "Nova regra",
              provider,
              event_name: "Lead",
              trigger_type: "stage_changed",
              stage_id: stages[0]?.id,
              phrase: "",
              direction: "incoming",
              value: 0,
              enabled: false,
            })
          }
        >
          Nova regra
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Estas regras enviam conversões; os contatos continuam entrando por
        formulário, agenda, WhatsApp e webhook. Cada evento é enfileirado uma
        única vez por regra.
      </p>
      {rules.map((r) => (
        <article
          key={r.id}
          className="border rounded-xl p-4 bg-card flex justify-between gap-3"
        >
          <div>
            <p className="font-medium">
              {r.name} · {r.event_name}
            </p>
            <p className="text-xs text-muted-foreground">
              {r.enabled ? "Ativa" : "Pausada"} ·{" "}
              {r.trigger_type === "stage_changed"
                ? stages.find((s) => s.id === r.stage_id)?.name ||
                  "Etapa removida"
                : `Mensagem contém: ${r.phrase}`}
            </p>
          </div>
          <RecordMenu
            enabled={!busy}
            edit={() => setEditing(r)}
            toggle={() =>
              void act(() =>
                workspaceDb
                  .from("agency_workspace_conversion_rules")
                  .update({ enabled: !r.enabled })
                  .eq("workspace_id", workspace)
                  .eq("id", r.id),
              )
            }
            remove={() =>
              void act(() =>
                workspaceDb
                  .from("agency_workspace_conversion_rules")
                  .delete()
                  .eq("workspace_id", workspace)
                  .eq("id", r.id),
              )
            }
          />
        </article>
      ))}
      {editing && (
        <form
          className="border rounded-xl p-4 bg-card space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const { id, ...values } = editing;
            void act(async () => {
              const row = {
                ...values,
                provider,
                workspace_id: workspace,
                stage_id:
                  editing.trigger_type === "stage_changed"
                    ? editing.stage_id
                    : null,
              };
              const r = id
                ? await workspaceDb
                    .from("agency_workspace_conversion_rules")
                    .update(row)
                    .eq("workspace_id", workspace)
                    .eq("id", id)
                : await workspaceDb
                    .from("agency_workspace_conversion_rules")
                    .insert(row);
              if (!r.error) setEditing(null);
              return r;
            });
          }}
        >
          <Input
            aria-label="Nome da regra"
            required
            value={editing.name || ""}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
          />
          <select
            aria-label="Gatilho da regra de conversão"
            className={selectClass}
            value={editing.trigger_type}
            onChange={(e) =>
              setEditing({ ...editing, trigger_type: e.target.value })
            }
          >
            <option value="stage_changed">Por etapa do CRM</option>
            <option value="message_received">Por mensagem WhatsApp</option>
          </select>
          {editing.trigger_type === "stage_changed" ? (
            <select
              className={selectClass}
              aria-label="Etapa da regra"
              value={editing.stage_id || ""}
              onChange={(e) =>
                setEditing({ ...editing, stage_id: e.target.value })
              }
            >
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          ) : (
            <>
              <Input
                aria-label="Frase da regra"
                required
                maxLength={500}
                placeholder="Mensagem contém…"
                value={editing.phrase || ""}
                onChange={(e) =>
                  setEditing({ ...editing, phrase: e.target.value })
                }
              />
              <select
                className={selectClass}
                aria-label="Direção da regra"
                value={editing.direction}
                onChange={(e) =>
                  setEditing({ ...editing, direction: e.target.value })
                }
              >
                <option value="incoming">Recebida</option>
                <option value="outgoing">Enviada</option>
                <option value="both">Ambas</option>
              </select>
            </>
          )}
          <label className="text-sm block">
            Evento
            <Input
              required
              value={editing.event_name || ""}
              onChange={(e) =>
                setEditing({ ...editing, event_name: e.target.value })
              }
            />
          </label>
          <label className="text-sm block">
            Valor (0 usa o valor do lead)
            <Input
              type="number"
              min="0"
              step="0.01"
              value={editing.value || 0}
              onChange={(e) =>
                setEditing({ ...editing, value: Number(e.target.value) })
              }
            />
          </label>
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!editing.enabled}
              onChange={(e) =>
                setEditing({ ...editing, enabled: e.target.checked })
              }
            />
            Ativar regra
          </label>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              Salvar regra
            </Button>
            <Button
              variant="outline"
              type="button"
              onClick={() => setEditing(null)}
            >
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
function TrackingLinks({
  workspace,
  links,
  base,
  busy,
  act,
}: {
  workspace: string;
  links: TrackingLink[];
  base: string;
  busy: boolean;
  act: (fn: () => PromiseLike<unknown>) => Promise<void>;
}) {
  const [name, setName] = useState(""),
    [url, setUrl] = useState(""),
    [source, setSource] = useState(""),
    [campaign, setCampaign] = useState("");
  return (
    <section className="space-y-3">
      <h3 className="font-semibold">Links rastreáveis</h3>
      <form
        className="border rounded-xl p-4 bg-card grid sm:grid-cols-2 gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void act(() =>
            workspaceDb.from("agency_workspace_tracking_links").insert({
              workspace_id: workspace,
              name,
              destination: url,
              source,
              campaign,
            }),
          );
        }}
      >
        <Input
          required
          aria-label="Nome do link"
          placeholder="Nome do link"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          required
          type="url"
          pattern="https://.*"
          aria-label="Destino do link"
          placeholder="https://…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <Input
          aria-label="Origem UTM"
          placeholder="Origem (utm_source)"
          value={source}
          onChange={(e) => setSource(e.target.value)}
        />
        <Input
          aria-label="Campanha UTM"
          placeholder="Campanha (utm_campaign)"
          value={campaign}
          onChange={(e) => setCampaign(e.target.value)}
        />
        <Button disabled={busy}>Criar link</Button>
      </form>
      {links.map((l) => (
        <article key={l.id} className="border rounded-xl p-4 bg-card space-y-2">
          <div className="flex justify-between gap-3">
            <div>
              <h4 className="font-semibold">{l.name}</h4>
              <p className="text-xs text-muted-foreground">
                {l.clicks} cliques · {l.enabled ? "Ativo" : "Pausado"}
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
          <ShareLink url={base + l.token} />
        </article>
      ))}
    </section>
  );
}
