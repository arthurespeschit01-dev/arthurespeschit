import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, X } from "lucide-react";

type Step = {
  icon: string;
  title: string;
  description: string;
};

const STEPS: Step[] = [
  { icon: "🎉", title: "Bem-vindo à Central do Gestor!", description: "Tudo que você precisa para gerenciar sua operação em um só lugar. Veja o que você pode fazer aqui." },
  { icon: "🖥️", title: "Dashboard — visão geral do seu negócio", description: "Acompanhe em tempo real o total de clientes, clientes ativos, campanhas em andamento e sua receita mensal recorrente. O gráfico mostra a evolução da sua receita mês a mês." },
  { icon: "👥", title: "Gerencie seus clientes", description: "Cadastre todos os seus clientes com contato, status e valor de mensalidade. Visualize quem está ativo, inativo ou inadimplente e acesse o histórico completo de cada um." },
  { icon: "📊", title: "Relatórios automáticos do Meta Ads", description: "Conecte a conta de anúncios do cliente e visualize alcance, CPM, CTR e ROAS direto no sistema. Gere relatórios em PDF profissionais com um clique para enviar ao cliente." },
  { icon: "✅", title: "Organize suas tarefas", description: "Crie tarefas por cliente com prazo e prioridade. Acompanhe o que está pendente, em andamento ou concluído — e receba alertas por email antes do prazo vencer." },
  { icon: "💰", title: "Controle financeiro da sua agência", description: "Registre entradas e saídas, acompanhe a rentabilidade por cliente e veja o DRE simplificado do mês. Descubra quais clientes dão mais lucro e quais consomem mais do que pagam." },
  { icon: "📈", title: "Planilha de acompanhamento", description: "Acompanhe métricas e indicadores dos seus clientes de forma organizada, com visão consolidada do desempenho de cada conta ao longo do tempo." },
  { icon: "📄", title: "Controle seus contratos", description: "Registre contratos por cliente com valor, início e vencimento. Receba notificações automáticas por email antes do contrato vencer para nunca ser pego de surpresa." },
  { icon: "🧠", title: "Gere estratégias com IA", description: "Informe o perfil do cliente e os objetivos da campanha — o sistema gera uma estratégia completa de marketing digital automaticamente. Economize horas de planejamento." },
  { icon: "🔗", title: "Gerador de UTMs", description: "Crie links rastreáveis para suas campanhas com parâmetros UTM padronizados. Nunca mais perca de onde vêm seus resultados." },
  { icon: "📁", title: "Processos, Scripts e muito mais", description: "Acesse o Processo de Onboarding para novos clientes, Estudos de Caso para embasar suas estratégias, Scripts prontos para vendas e atendimento, e respostas para as principais Objeções dos clientes." },
  { icon: "🔔", title: "Notificações e configurações", description: "Configure notificações por email para vencimento de contratos, pagamentos atrasados, tasks urgentes, saldo baixo e verba do Meta acabando. Tudo automático para você não perder nada." },
  { icon: "🚀", title: "Sua Central está pronta!", description: "Comece agora cadastrando seu primeiro cliente ou explore o dashboard." },
];

export default function OnboardingTour() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [show, setShow] = useState(false);
  const [step, setStep] = useState(0);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("onboarding_completed")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (!data) {
        // create profile row if missing
        await supabase.from("profiles").insert({ user_id: user.id, onboarding_completed: false } as any);
        setShow(true);
      } else if (!(data as any).onboarding_completed) {
        setShow(true);
      }
      setChecking(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const finish = async (navigateTo?: string) => {
    if (user) {
      await supabase.from("profiles").update({ onboarding_completed: true } as any).eq("user_id", user.id);
    }
    setShow(false);
    if (navigateTo) navigate(navigateTo);
  };

  if (checking || !show) return null;

  const total = STEPS.length;
  const current = STEPS[step];
  const progress = ((step + 1) / total) * 100;
  const isLast = step === total - 1;

  return (
    <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      {/* Top progress */}
      <div className="absolute top-0 left-0 right-0 px-6 pt-6">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <div className="h-1.5 flex-1 bg-secondary/60 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary to-primary/70 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <button
              onClick={() => finish()}
              className="ml-4 text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              Pular tour <X className="h-3 w-3" />
            </button>
          </div>
          <div className="flex items-center justify-center gap-1.5 mb-2">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-2 w-2 rounded-full transition-all ${
                  i === step ? "bg-primary scale-125" : i < step ? "bg-primary/60" : "bg-muted-foreground/25"
                }`}
              />
            ))}
          </div>
          <p className="text-center text-xs text-muted-foreground">Etapa {step + 1} de {total}</p>
        </div>
      </div>

      {/* Card */}
      <div
        key={step}
        className="glass-surface rounded-2xl p-8 md:p-12 max-w-xl w-full text-center animate-scale-in border border-primary/20 shadow-[0_0_60px_-15px_hsl(var(--primary)/0.4)]"
      >
        <div className="text-6xl mb-6">{current.icon}</div>
        <h2 className="text-2xl md:text-3xl font-semibold text-foreground mb-4">{current.title}</h2>
        <p className="text-muted-foreground leading-relaxed mb-8">{current.description}</p>

        {isLast ? (
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button variant="outline" onClick={() => finish("/")}>Ir para o Dashboard</Button>
            <Button className="neon-glow" onClick={() => finish("/clientes")}>Cadastrar primeiro cliente</Button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            {step > 0 ? (
              <Button variant="outline" onClick={() => setStep((s) => s - 1)}>
                <ArrowLeft className="h-4 w-4" /> Voltar
              </Button>
            ) : <div />}
            <Button className="neon-glow ml-auto" onClick={() => setStep((s) => s + 1)}>
              {step === 0 ? "Começar tour" : "Próximo"} <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
