import { useFlowContext } from "./useFlowContext";
import { Link } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  type WorkspacePipeline,
  type WorkspaceStage,
} from "@/lib/clientWorkspaces";
import {
  selectClass,
  type CaptureForm,
  type WorkspaceCalendar,
} from "@/lib/workspaceCommercial";
import FlowWebhookFields from "./FlowWebhookFields";
const triggerLabels: Record<string, string> = {
  form_submitted: "Formulário preenchido",
  appointment_created: "Agendamento realizado",
  lead_created: "Lead criado",
  stage_changed: "Etapa do CRM alterada",
  tag_added: "Tag adicionada",
  message_received: "Mensagem no WhatsApp",
  meta_lead: "Formulário Meta Ads",
  external_webhook: "Webhook externo",
};
export function StagePicker({
  label,
  value,
  onChange,
  stages,
  pipelines,
  pipeline,
  empty = "Qualquer etapa",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  stages: WorkspaceStage[];
  pipelines: WorkspacePipeline[];
  pipeline?: string;
  empty?: string;
}) {
  return (
    <label className="block text-sm">
      {label}
      <select
        aria-label={label}
        className={selectClass + " w-full"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{empty}</option>
        {pipelines.length
          ? pipelines
              .filter((p) => !pipeline || p.id === pipeline)
              .map((p) => (
                <optgroup key={p.id} label={p.name}>
                  {stages
                    .filter((s) => s.pipeline_id === p.id)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </optgroup>
              ))
          : stages
              .filter((s) => !pipeline || s.pipeline_id === pipeline)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
      </select>
    </label>
  );
}
export default function FlowTriggerFields({
  workspace,
  data,
  patch,
  stages,
  forms,
  calendars,
  manage,
}: {
  workspace: string;
  data: Record<string, unknown>;
  patch: (d: Record<string, unknown>) => void;
  stages: WorkspaceStage[];
  forms: CaptureForm[];
  calendars: WorkspaceCalendar[];
  manage: boolean;
}) {
  const context = useFlowContext(workspace),
    pipelines = context.data?.pipelines || [],
    event = String(data.event || "form_submitted"),
    set = (v: Record<string, unknown>) => patch({ ...v, config_version: 2 });
  return (
    <div className="space-y-3">
      <label className="block text-sm">
        Tipo de evento
        <select
          aria-label="Tipo de evento"
          className={selectClass + " w-full"}
          value={event}
          onChange={(e) =>
            set({
              event: e.target.value,
              source_id: "",
              pipeline_id: "",
              from_stage_id: "",
              to_stage_id: "",
              entry_stage_id: "",
              tag: "",
              webhook_id: null,
            })
          }
        >
          {Object.entries(triggerLabels).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {["stage_changed", "lead_created"].includes(event) && (
        <>
          <label className="text-sm block">
            Pipeline{event === "stage_changed" ? " de destino" : ""}
            <select
              aria-label="Pipeline do gatilho"
              className={selectClass + " w-full"}
              value={String(data.pipeline_id || "")}
              onChange={(e) =>
                set({
                  pipeline_id: e.target.value,
                  to_stage_id: "",
                  entry_stage_id: "",
                })
              }
            >
              <option value="">Qualquer pipeline desta empresa</option>
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <StagePicker
            label={
              event === "stage_changed"
                ? "Quando entrar na etapa"
                : "Etapa inicial do lead"
            }
            value={String(
              data[
                event === "stage_changed" ? "to_stage_id" : "entry_stage_id"
              ] || "",
            )}
            onChange={(v) =>
              set({
                [event === "stage_changed" ? "to_stage_id" : "entry_stage_id"]:
                  v,
                source_id: "",
              })
            }
            stages={stages}
            pipelines={pipelines}
            pipeline={String(data.pipeline_id || "")}
          />
          {event === "stage_changed" ? (
            <>
              <StagePicker
                label="Vindo da etapa (opcional)"
                value={String(data.from_stage_id || "")}
                onChange={(v) => set({ from_stage_id: v })}
                stages={stages}
                pipelines={pipelines}
              />
              <p className="text-xs text-muted-foreground">
                Este gatilho observa a movimentação real do CRM. Para mudar a
                etapa durante a automação, conecte uma ação “Mover no CRM”.
              </p>
            </>
          ) : (
            <label className="text-sm block">
              Origem do novo lead
              <select
                aria-label="Origem do novo lead"
                className={selectClass + " w-full"}
                value={String(data.lead_source || "")}
                onChange={(e) => set({ lead_source: e.target.value })}
              >
                {[
                  ["", "Qualquer origem"],
                  ["manual", "Manual"],
                  ["form", "Formulário / webhook"],
                  ["appointment", "Agendamento"],
                  ["whatsapp", "WhatsApp"],
                  ["meta", "Meta Ads"],
                  ["import", "Importação"],
                ].map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </>
      )}
      {["form_submitted", "appointment_created"].includes(event) && (
        <label className="text-sm block">
          {event === "form_submitted"
            ? "Formulário que dispara"
            : "Agenda que dispara"}
          <select
            aria-label={
              event === "form_submitted"
                ? "Formulário que dispara"
                : "Agenda que dispara"
            }
            className={selectClass + " w-full"}
            value={String(data.source_id || "")}
            onChange={(e) => set({ source_id: e.target.value })}
          >
            <option value="">
              {event === "form_submitted"
                ? "Qualquer formulário desta empresa"
                : "Qualquer agenda desta empresa"}
            </option>
            {(event === "form_submitted" ? forms : calendars).map((f) => (
              <option key={f.id} value={f.id}>
                {f.title}
              </option>
            ))}
          </select>
        </label>
      )}
      {event === "tag_added" && (
        <label className="text-sm block">
          Qual etiqueta foi adicionada
          <Input
            aria-label="Etiqueta que dispara"
            placeholder="Ex.: Qualificado (vazio: qualquer etiqueta)"
            maxLength={60}
            value={String(data.tag || data.source_id || "")}
            onChange={(e) => set({ tag: e.target.value, source_id: "" })}
          />
          <span className="text-xs text-muted-foreground">
            Dispara quando a etiqueta é adicionada, inclusive por outra
            automação.
          </span>
        </label>
      )}
      {event === "meta_lead" && (
        <>
          <label className="text-sm block">
            ID do formulário Meta Ads (opcional)
            <Input
              aria-label="Formulário Meta Ads que dispara"
              inputMode="numeric"
              value={String(data.meta_form_id || "")}
              onChange={(e) => set({ meta_form_id: e.target.value })}
            />
          </label>
          <p className="text-xs text-muted-foreground">
            O recebimento precisa estar conectado à página da Meta e com uma
            etapa de entrada configurada.
          </p>
          <Link
            target="_blank"
            className="text-xs text-primary underline"
            to={"/laboratorio/subcontas/" + workspace + "/rastreamento"}
          >
            Abrir conexão e webhook da Meta
          </Link>
        </>
      )}
      {event === "external_webhook" && (
        <FlowWebhookFields
          workspace={workspace}
          data={data}
          patch={set}
          stages={stages}
          manage={manage}
        />
      )}
      {event === "message_received" && (
        <>
          <label className="text-sm block">
            Quando disparar
            <select
              aria-label="Quando disparar WhatsApp"
              className={selectClass + " w-full"}
              value={String(
                data.message_mode ||
                  (data.first_contact ? "first_contact" : "any"),
              )}
              onChange={(e) =>
                set({
                  message_mode: e.target.value,
                  first_contact: e.target.value === "first_contact",
                })
              }
            >
              <option value="first_contact">
                Primeira mensagem de um contato novo no WhatsApp
              </option>
              <option value="any">Toda mensagem que atender aos filtros</option>
              <option value="first_unanswered">
                Nova sequência de mensagens após resposta da equipe
              </option>
            </select>
          </label>
          <label className="text-sm block">
            Quem pode disparar
            <select
              aria-label="Origem da conversa WhatsApp"
              className={selectClass + " w-full"}
              value={data.ad_only ? "ads" : "any"}
              onChange={(e) => set({ ad_only: e.target.value === "ads" })}
            >
              <option value="any">Qualquer contato</option>
              <option value="ads">Somente quem veio de anúncio da Meta</option>
            </select>
          </label>
          <p className="text-xs text-muted-foreground">
            A origem de anúncio é usada quando o WhatsApp fornece os dados do
            anúncio; não é deduzida pelo texto da mensagem.
          </p>
          <label className="text-sm block">
            Qual WhatsApp
            <select
              aria-label="WhatsApp que dispara"
              className={selectClass + " w-full"}
              value={String(data.account_id || "")}
              onChange={(e) => set({ account_id: e.target.value })}
            >
              <option value="">Qualquer número conectado nesta empresa</option>
              {context.data?.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.phone}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm block">
            Direção da mensagem
            <select
              aria-label="Direção da mensagem"
              className={selectClass + " w-full"}
              value={String(data.direction || "incoming")}
              onChange={(e) => set({ direction: e.target.value })}
            >
              <option value="incoming">Recebida do contato</option>
              <option value="outgoing">Enviada pela equipe ou sistema</option>
              <option value="both">Recebida ou enviada</option>
            </select>
          </label>
          <label className="text-sm block">
            Filtrar pela mensagem
            <select
              aria-label="Como filtrar mensagem"
              className={selectClass + " w-full"}
              value={String(data.text_mode || "any")}
              onChange={(e) => set({ text_mode: e.target.value })}
            >
              <option value="any">Contém um destes textos</option>
              <option value="all">Contém todos estes textos</option>
              <option value="exact">É igual a um destes textos</option>
              <option value="none">Não contém nenhum destes textos</option>
            </select>
          </label>
          <Textarea
            aria-label="Textos que filtram o gatilho"
            placeholder="Um texto por linha. Vazio: qualquer mensagem."
            value={(
              (data.texts as string[]) ||
              (data.contains ? [String(data.contains)] : [])
            ).join("\n")}
            onChange={(e) =>
              set({
                texts: e.target.value.split("\n").filter(Boolean),
                contains: "",
              })
            }
          />
          <p className="text-xs text-muted-foreground">
            Um texto por linha; a comparação ignora maiúsculas, acentos e
            espaços repetidos. Mídias sem legenda não atendem a um filtro de
            texto.
          </p>
        </>
      )}
      <label className="text-sm block">
        Exigir etiqueta no contato (opcional)
        <Input
          aria-label="Etiqueta obrigatória do gatilho"
          maxLength={60}
          placeholder="Ex.: Vendas"
          value={String(data.required_tag || "")}
          onChange={(e) => set({ required_tag: e.target.value })}
        />
      </label>
      {context.error && (
        <p role="alert" className="text-xs text-destructive">
          Não foi possível carregar as pipelines e números desta empresa.
        </p>
      )}
    </div>
  );
}
