import FlowReplyFields from "./FlowReplyFields";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import AudioRecorder from "@/components/AudioRecorder";
import { workspaceDb } from "@/lib/clientWorkspaces";
import {
  selectClass,
  workspaceOperation,
  type TeamMember,
} from "@/lib/workspaceCommercial";
export default function FlowAdvancedFields({
  type,
  data,
  patch,
  members,
  workspace,
  calendars,
}: {
  type: string;
  data: Record<string, unknown>;
  patch: (v: Record<string, unknown>) => void;
  members: TeamMember[];
  workspace: string;
  calendars: import("@/lib/workspaceCommercial").WorkspaceCalendar[];
}) {
  const [uploading, setUploading] = useState(false),
    [error, setError] = useState("");
  const upload = async (file: File) => {
    setUploading(true);
    setError("");
    try {
      const r = await workspaceOperation<{ path: string; token: string }>(
        "asset_upload",
        { workspace_id: workspace, name: file.name, size: file.size },
      );
      const result = await workspaceDb.storage
        .from("workspace-automation-assets")
        .uploadToSignedUrl(r.path, r.token, file, {
          contentType: file.type || "application/octet-stream",
        });
      if (result.error) throw result.error;
      patch({ file_path: r.path, file_name: file.name });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };
  return (
    <div className="space-y-3">
      {["team_response", "wait_response"].includes(type) && (
        <FlowReplyFields
          type={type as "team_response" | "wait_response"}
          workspace={workspace}
          data={data}
          patch={patch}
        />
      )}
      {["wait_appointment", "send_event"].includes(type) && (
        <label className="text-sm block">
          Agenda da reunião
          <select
            aria-label="Agenda da reunião"
            className={selectClass + " w-full"}
            value={String(data.calendar_id || "")}
            onChange={(e) => patch({ calendar_id: e.target.value })}
          >
            <option value="">Próxima reunião em qualquer agenda</option>
            {calendars.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">
            O lead precisa ter uma reunião confirmada nessa agenda quando chegar
            ao bloco.
          </span>
        </label>
      )}
      {type === "add_participants" && (
        <label className="text-sm block">
          Grupo de destino (opcional)
          <Input
            aria-label="ID do grupo de destino"
            placeholder="120…@g.us · vazio: grupo criado neste fluxo"
            value={String(data.group_id || "")}
            onChange={(e) => patch({ group_id: e.target.value })}
          />
        </label>
      )}
      {type === "stage" && (
        <label className="text-sm block">
          Descrição do estágio
          <Textarea
            value={String(data.description || "")}
            onChange={(e) => patch({ description: e.target.value })}
          />
          <span className="text-xs text-muted-foreground">
            Este bloco organiza o percurso e continua pela conexão de saída.
            Para decidir entre caminhos, use Condição SE/SENÃO.
          </span>
        </label>
      )}
      {type === "wait_appointment" && (
        <>
          <label className="text-sm block">
            {type === "wait_appointment"
              ? "Antecedência da reunião (minutos)"
              : "Prazo máximo (minutos)"}
            <Input
              type="number"
              min="1"
              max="43200"
              value={Number(data.minutes || 60)}
              onChange={(e) => patch({ minutes: Number(e.target.value) })}
            />
          </label>
          <p className="text-xs text-muted-foreground">
            {type === "wait_appointment"
              ? "Usa a próxima reunião confirmada do contato. Se o horário já chegou, continua imediatamente."
              : `A saída Sim continua quando ${type === "wait_response" ? "o contato" : "a equipe"} responde. A saída Não continua quando o prazo termina. Considere somente mensagens posteriores à entrada neste bloco.`}
          </p>
        </>
      )}
      {type === "business_hours" && (
        <>
          <label className="text-sm block">
            Fuso horário
            <Input
              value={String(data.timezone || "America/Sao_Paulo")}
              onChange={(e) => patch({ timezone: e.target.value })}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map(
              (name, i) => (
                <label className="text-xs flex gap-1" key={name}>
                  <input
                    type="checkbox"
                    checked={((data.days as number[]) || []).includes(i + 1)}
                    onChange={(e) =>
                      patch({
                        days: e.target.checked
                          ? [...((data.days as number[]) || []), i + 1]
                          : ((data.days as number[]) || []).filter(
                              (d) => d !== i + 1,
                            ),
                      })
                    }
                  />
                  {name}
                </label>
              ),
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              ["start", "Abre às"],
              ["end", "Fecha às"],
            ].map(([key, label]) => (
              <label className="text-sm" key={key}>
                {label}
                <Input
                  type="time"
                  value={String(data[key] || "09:00")}
                  onChange={(e) => patch({ [key]: e.target.value })}
                />
              </label>
            ))}
          </div>
        </>
      )}
      {type === "split" && (
        <div className="space-y-2">
          {(
            (data.branches as {
              id: string;
              label: string;
              weight: number;
            }[]) || [
              { id: "yes", label: "Caminho A", weight: 50 },
              { id: "no", label: "Caminho B", weight: 50 },
            ]
          ).map((b, i, all) => (
            <div key={b.id} className="grid grid-cols-[1fr_70px_auto] gap-1">
              <Input
                aria-label={`Nome do caminho ${i + 1}`}
                value={b.label}
                onChange={(e) =>
                  patch({
                    branches: all.map((x) =>
                      x.id === b.id ? { ...x, label: e.target.value } : x,
                    ),
                  })
                }
              />
              <Input
                aria-label={`Peso do caminho ${i + 1}`}
                type="number"
                min="1"
                max="99"
                value={b.weight}
                onChange={(e) =>
                  patch({
                    branches: all.map((x) =>
                      x.id === b.id
                        ? { ...x, weight: Number(e.target.value) }
                        : x,
                    ),
                  })
                }
              />
              <Button
                size="sm"
                variant="ghost"
                disabled={all.length <= 2}
                onClick={() =>
                  patch({ branches: all.filter((x) => x.id !== b.id) })
                }
              >
                ×
              </Button>
            </div>
          ))}
          <Button
            size="sm"
            variant="outline"
            disabled={((data.branches as unknown[]) || []).length >= 10}
            onClick={() =>
              patch({
                branches: [
                  ...((data.branches as unknown[]) || [
                    { id: "yes", label: "Caminho A", weight: 50 },
                    { id: "no", label: "Caminho B", weight: 50 },
                  ]),
                  {
                    id: "branch_" + crypto.randomUUID().slice(0, 6),
                    label: "Novo caminho",
                    weight: 1,
                  },
                ],
              })
            }
          >
            Adicionar caminho
          </Button>
          <p className="text-xs text-muted-foreground">
            Os pesos precisam somar 100%. O mesmo lead mantém o caminho em novas
            entradas no mesmo funil.
          </p>
        </div>
      )}
      {type === "distribute" && (
        <div className="space-y-2">
          <p className="text-sm">Atendentes participantes</p>
          {members
            .filter((m) => m.role !== "viewer")
            .map((m) => (
              <label className="flex gap-2 text-sm" key={m.user_id}>
                <input
                  type="checkbox"
                  checked={((data.user_ids as string[]) || []).includes(
                    m.user_id,
                  )}
                  onChange={(e) =>
                    patch({
                      user_ids: e.target.checked
                        ? [...((data.user_ids as string[]) || []), m.user_id]
                        : ((data.user_ids as string[]) || []).filter(
                            (id) => id !== m.user_id,
                          ),
                    })
                  }
                />
                {m.display_name || m.email || "Proprietário"}
              </label>
            ))}
          <p className="text-xs text-muted-foreground">
            O próximo lead fica com a pessoa com menos contatos atribuídos.
            Empates seguem uma ordem estável.
          </p>
        </div>
      )}
      {["create_group", "add_participants"].includes(type) && (
        <label className="text-sm block">
          Participantes adicionais (um número por linha, com DDI)
          <Textarea
            value={((data.participants as string[]) || []).join("\n")}
            onChange={(e) =>
              patch({
                participants: e.target.value.split("\n").filter(Boolean),
              })
            }
          />
          <span className="text-xs text-muted-foreground">
            {type === "create_group"
              ? "O WhatsApp do lead é incluído automaticamente."
              : "Usa o grupo criado antes nesta execução."}
          </span>
        </label>
      )}
      {type === "create_group" && (
        <label className="text-sm block">
          Nome do grupo
          <Input
            value={String(data.text || "Atendimento de {nome}")}
            maxLength={100}
            onChange={(e) => patch({ text: e.target.value })}
          />
        </label>
      )}
      {type === "send_event" && (
        <p className="text-xs text-muted-foreground">
          Envia o convite .ics da próxima reunião confirmada pelo WhatsApp. O
          cliente pode adicioná-lo à agenda.
        </p>
      )}
      {["send_email", "send_sms"].includes(type) && (
        <>
          {type === "send_email" && (
            <label className="text-sm block">
              Assunto
              <Input
                required
                maxLength={200}
                value={String(data.subject || "")}
                onChange={(e) => patch({ subject: e.target.value })}
              />
            </label>
          )}
          <label className="text-sm block">
            Mensagem
            <Textarea
              maxLength={type === "send_sms" ? 160 : 4000}
              value={String(data.text || "")}
              onChange={(e) => patch({ text: e.target.value })}
            />
          </label>
          <p className="text-xs text-muted-foreground">
            Variáveis: {"{nome}, {telefone}, {email}, {valor}"}. O provedor deve
            estar ativado em Configurações → Geral → E-mail e SMS.
          </p>
        </>
      )}
      {type === "meta_event" && (
        <label className="text-sm block">
          Evento da Meta
          <select
            className={selectClass + " w-full"}
            value={String(data.event_name || "Lead")}
            onChange={(e) => patch({ event_name: e.target.value })}
          >
            {[
              "Lead",
              "Contact",
              "CompleteRegistration",
              "Schedule",
              "Purchase",
              "SubmitApplication",
            ].map((event) => (
              <option key={event}>{event}</option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">
            Usa o pixel desta empresa e a atribuição do lead. Não representa
            aprovação do aplicativo pela Meta.
          </span>
        </label>
      )}
      {type === "send_message" && (
        <section className="border rounded-lg p-3 space-y-2">
          <label className="text-sm block">
            Anexo / mídia
            <input
              className="block mt-2 text-xs max-w-full"
              aria-label="Anexar arquivo à automação"
              type="file"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
                e.target.value = "";
              }}
            />
          </label>
          <AudioRecorder
            disabled={uploading}
            onFile={(f) => void upload(f)}
            onError={setError}
          />
          {data.file_path && (
            <div className="text-xs">
              <p className="break-all">
                {String(data.file_name || "Anexo salvo")}
              </p>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => patch({ file_path: null, file_name: null })}
              >
                Remover anexo
              </Button>
            </div>
          )}
          {uploading && (
            <p role="status" className="text-xs">
              Enviando anexo…
            </p>
          )}
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
