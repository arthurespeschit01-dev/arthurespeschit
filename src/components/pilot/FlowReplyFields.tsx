import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { selectClass } from "@/lib/workspaceCommercial";
import { useFlowContext } from "./useFlowContext";
export default function FlowReplyFields({
  workspace,
  type,
  data,
  patch,
}: {
  workspace: string;
  type: "team_response" | "wait_response";
  data: Record<string, unknown>;
  patch: (v: Record<string, unknown>) => void;
}) {
  const context = useFlowContext(workspace),
    team = type === "team_response",
    minutes = Number(data.minutes || 15);
  return (
    <section className="space-y-3">
      <h4 className="font-semibold text-sm">
        {team ? "Conferir resposta da equipe" : "Aguardar resposta do contato"}
      </h4>
      <p className="text-xs text-muted-foreground">
        {team
          ? "Monitora mensagens enviadas pela Central, telefone e WhatsApp Web para o mesmo contato e número."
          : "Monitora a próxima resposta recebida do contato no número escolhido."}
      </p>
      <label className="text-sm block">
        {team
          ? "Avisar se ninguém responder em"
          : "Prazo para o contato responder"}
      </label>
      <div className="flex flex-wrap gap-2">
        {[
          [5, "5 min"],
          [15, "15 min"],
          [30, "30 min"],
          [60, "1 hora"],
          [120, "2 horas"],
          [240, "4 horas"],
        ].map(([n, label]) => (
          <Button
            type="button"
            key={n}
            size="sm"
            variant={minutes === n ? "default" : "outline"}
            onClick={() => patch({ minutes: Number(n) })}
          >
            {label}
          </Button>
        ))}
      </div>
      <label className="text-sm block">
        Outro tempo (minutos)
        <Input
          type="number"
          min="1"
          max="43200"
          value={minutes}
          aria-label="Prazo de resposta em minutos"
          onChange={(e) => patch({ minutes: Number(e.target.value) })}
        />
      </label>
      <label className="text-sm block">
        Começar a contar a partir de
        <select
          aria-label="Início do prazo de resposta"
          className={selectClass + " w-full"}
          value={String(data.reply_anchor || "block_entry")}
          onChange={(e) => patch({ reply_anchor: e.target.value })}
        >
          <option value="block_entry">Entrada do contato neste bloco</option>
          <option value="last_incoming">
            Primeira mensagem recebida após a última resposta da equipe
          </option>
          <option value="last_outgoing">
            Última mensagem enviada ao contato
          </option>
        </select>
      </label>
      <label className="text-sm block">
        Quando continuar
        <select
          aria-label="Momento de conferir resposta"
          className={selectClass + " w-full"}
          value={String(data.response_mode || "immediate")}
          onChange={(e) => patch({ response_mode: e.target.value })}
        >
          <option value="immediate">Assim que houver resposta</option>
          <option value="deadline">
            No fim do prazo, conferir se responderam
          </option>
        </select>
      </label>
      <label className="text-sm block">
        WhatsApp monitorado
        <select
          aria-label="WhatsApp monitorado"
          className={selectClass + " w-full"}
          value={String(data.account_id || "")}
          onChange={(e) => patch({ account_id: e.target.value })}
        >
          <option value="">
            Mesmo número que iniciou a automação (ou conectado na entrada)
          </option>
          {context.data?.accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.phone}
            </option>
          ))}
        </select>
      </label>
      <label className="flex gap-2 text-sm">
        <input
          type="checkbox"
          checked={!!data.deduplicate}
          onChange={(e) => patch({ deduplicate: e.target.checked })}
        />
        Agrupar mensagens sem resposta em um único acompanhamento
      </label>
      <p className="text-xs text-muted-foreground">
        Com o agrupamento ativo, várias mensagens seguidas não geram vários
        avisos para o mesmo funil e bloco. Uma nova sequência depois de a equipe
        responder pode iniciar outro acompanhamento.
      </p>
      <details className="text-sm space-y-2">
        <summary className="cursor-pointer">
          Filtro opcional da resposta
        </summary>
        <label className="block text-xs mt-2">
          A resposta deve conter um destes textos
          <Textarea
            aria-label="Textos aceitos como resposta"
            placeholder="Um por linha. Vazio: qualquer resposta."
            value={((data.reply_texts as string[]) || []).join("\n")}
            onChange={(e) =>
              patch({
                reply_texts: e.target.value.split("\n").filter(Boolean),
                reply_text_mode: "any",
              })
            }
          />
        </label>
      </details>
      <div className="border rounded-lg p-3 space-y-2 text-xs">
        <p>
          <strong className="text-emerald-500">Respondeu:</strong> ligue a saída
          verde às próximas ações para quem recebeu resposta.
        </p>
        <p>
          <strong className="text-rose-500">
            {team ? "Sem resposta" : "Prazo esgotado"}:
          </strong>{" "}
          ligue a saída vermelha a uma notificação, tarefa ou outra ação quando
          o prazo terminar.
        </p>
        <p className="text-muted-foreground">
          Sem conexão de saída, o acompanhamento termina naquele resultado.
        </p>
      </div>
    </section>
  );
}
