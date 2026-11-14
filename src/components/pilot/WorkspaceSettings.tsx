import { Link } from "react-router-dom";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Building2,
  Shield,
  MessageSquare,
  ChartNoAxesCombined,
  Wallet,
  Calendar,
  Webhook,
} from "lucide-react";
export default function WorkspaceSettings({
  workspace,
}: {
  workspace: string;
}) {
  const [search, setSearch] = useState("");
  const base = "/laboratorio/subcontas/" + workspace;
  const groups = [
    {
      name: "Workspace e equipe",
      items: [
        [
          "Empresa",
          "Dados e identidade desta empresa",
          "configuracoes",
          Building2,
        ],
        [
          "Funções e permissões",
          "Membros, convites e papéis de acesso",
          "equipe",
          Shield,
        ],
      ],
    },
    {
      name: "Integrações e canais",
      items: [
        [
          "WhatsApp",
          "Conexão exclusiva desta empresa e recebimento de mensagens",
          "integracoes",
          MessageSquare,
        ],
        [
          "Google Agenda",
          "Calendário e disponibilidade da empresa",
          "integracoes",
          Calendar,
        ],
        [
          "Rastreamento de anúncios",
          "Meta, Google Ads, atribuição e regras de conversão",
          "rastreamento",
          ChartNoAxesCombined,
        ],
        [
          "E-mail e SMS",
          "Remetentes, provedores e limites de envio",
          "canais",
          Webhook,
        ],
        [
          "Créditos e consumo",
          "Envios e limites das contas conectadas",
          "creditos",
          Wallet,
        ],
      ],
    },
  ];
  return (
    <div className="space-y-8">
      <header className="rounded-2xl border bg-card p-6 sm:p-8 space-y-3">
        <span className="text-xs text-primary font-semibold">
          Configurações
        </span>
        <h2 className="text-2xl sm:text-3xl font-bold">
          Central de configurações
        </h2>
        <p className="text-sm text-muted-foreground">
          Personalize o workspace, gerencie sua equipe e conecte os canais da
          empresa.
        </p>
        <Input
          className="max-w-sm"
          aria-label="Buscar configuração"
          placeholder="Buscar configuração…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </header>
      {groups.map((g) => (
        <section key={g.name} className="space-y-4">
          <h3 className="text-xs tracking-widest uppercase text-muted-foreground font-semibold">
            {g.name}
          </h3>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {g.items
              .filter(([name, desc]) =>
                (String(name) + desc)
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .map(([title, desc, path, Icon]) => {
                const I = Icon as typeof Building2;
                return (
                  <Link
                    key={String(title)}
                    to={base + "/" + path}
                    className="border rounded-xl bg-card p-5 hover:border-primary flex gap-4 items-start"
                  >
                    <span className="bg-primary/10 text-primary p-3 rounded-xl">
                      <I size={20} />
                    </span>
                    <div>
                      <h4 className="font-semibold text-sm">{String(title)}</h4>
                      <p className="text-xs text-muted-foreground mt-1">
                        {String(desc)}
                      </p>
                    </div>
                  </Link>
                );
              })}
          </div>
        </section>
      ))}
    </div>
  );
}
