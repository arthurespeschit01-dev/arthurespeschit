import { useEffect, useLayoutEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, X } from "lucide-react";

type Step = {
  icon: string;
  title: string;
  description: string;
  target?: string; // data-tour-id
};

const STEPS: Step[] = [
  { icon: "🎉", title: "Bem-vindo à Central do Gestor!", description: "Tudo que você precisa para gerenciar sua operação em um só lugar. Vamos fazer um tour rápido pelas funcionalidades." },
  { icon: "🖥️", title: "Dashboard — visão geral do seu negócio", description: "Acompanhe em tempo real total de clientes, ativos, campanhas e sua receita mensal recorrente, com evolução mês a mês.", target: "nav-dashboard" },
  { icon: "👥", title: "Gerencie seus clientes", description: "Cadastre clientes com contato, status e mensalidade. Veja ativos, inativos, inadimplentes e o histórico completo de cada um.", target: "nav-clientes" },
  { icon: "📊", title: "Relatórios automáticos do Meta Ads", description: "Conecte a conta de anúncios e visualize alcance, CPM, CTR e ROAS. Gere relatórios em PDF profissionais com um clique.", target: "nav-relatorios" },
  { icon: "✅", title: "Organize suas tarefas", description: "Crie tarefas por cliente com prazo e prioridade. Acompanhe status e receba alertas por email antes do vencimento.", target: "nav-tarefas" },
  { icon: "💰", title: "Controle financeiro da agência", description: "Registre entradas e saídas, veja a rentabilidade por cliente e o DRE simplificado do mês.", target: "nav-financeiro" },
  { icon: "📈", title: "Planilha de acompanhamento", description: "Acompanhe métricas e indicadores dos clientes de forma organizada, com visão consolidada do desempenho.", target: "nav-planilha" },
  { icon: "📄", title: "Controle seus contratos", description: "Registre contratos com valor, início e vencimento. Receba notificações por email antes do contrato vencer.", target: "nav-contratos" },
  { icon: "🧠", title: "Gere estratégias com IA", description: "Informe o perfil do cliente e os objetivos — o sistema gera uma estratégia completa de marketing automaticamente.", target: "nav-estrategia" },
  { icon: "🔗", title: "Gerador de UTMs", description: "Crie links rastreáveis para suas campanhas com parâmetros UTM padronizados.", target: "nav-utms" },
  { icon: "📁", title: "Processos, Scripts e mais", description: "Acesse Processo de Onboarding, Estudos de Caso, Scripts de vendas e respostas para Objeções.", target: "nav-processos" },
  { icon: "🔔", title: "Notificações e configurações", description: "Configure alertas por email para vencimentos, pagamentos atrasados, tasks urgentes e saldo baixo.", target: "nav-config" },
  { icon: "🚀", title: "Sua Central está pronta!", description: "Comece agora cadastrando seu primeiro cliente ou explore o dashboard." },
];

const PADDING = 8;
const TOOLTIP_WIDTH = 340;
const TOOLTIP_GAP = 16;

type Rect = { top: number; left: number; width: number; height: number };

export default function OnboardingTour() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [show, setShow] = useState(false);
  const [step, setStep] = useState(0);
  const [checking, setChecking] = useState(true);
  const [rect, setRect] = useState<Rect | null>(null);
  const [viewport, setViewport] = useState({ w: typeof window !== "undefined" ? window.innerWidth : 1024, h: typeof window !== "undefined" ? window.innerHeight : 768 });

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
        await supabase.from("profiles").insert({ user_id: user.id, onboarding_completed: false } as any);
        setShow(true);
      } else if (!(data as any).onboarding_completed) {
        setShow(true);
      }
      setChecking(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const current = STEPS[step];

  // Measure target element
  useLayoutEffect(() => {
    if (!show) return;
    const measure = () => {
      setViewport({ w: window.innerWidth, h: window.innerHeight });
      if (!current.target) {
        setRect(null);
        return;
      }
      const el = document.querySelector(`[data-tour-id="${current.target}"]`) as HTMLElement | null;
      if (!el) {
        setRect(null);
        return;
      }
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    measure();
    const id = setInterval(measure, 250); // re-measure for transitions/scroll
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      clearInterval(id);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [show, step, current.target]);

  const finish = async (navigateTo?: string) => {
    if (user) {
      await supabase.from("profiles").update({ onboarding_completed: true } as any).eq("user_id", user.id);
    }
    setShow(false);
    if (navigateTo) navigate(navigateTo);
  };

  if (checking || !show) return null;

  const total = STEPS.length;
  const progress = ((step + 1) / total) * 100;
  const isLast = step === total - 1;

  // Spotlight rect (with padding)
  const sr = rect
    ? {
        top: rect.top - PADDING,
        left: rect.left - PADDING,
        width: rect.width + PADDING * 2,
        height: rect.height + PADDING * 2,
      }
    : null;

  // Tooltip position
  let tooltipStyle: React.CSSProperties;
  if (!sr) {
    // centered
    tooltipStyle = {
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: TOOLTIP_WIDTH,
    };
  } else {
    // try right of element
    const spaceRight = viewport.w - (sr.left + sr.width) - TOOLTIP_GAP;
    const spaceLeft = sr.left - TOOLTIP_GAP;
    let left: number;
    let top: number = sr.top;
    if (spaceRight >= TOOLTIP_WIDTH) {
      left = sr.left + sr.width + TOOLTIP_GAP;
    } else if (spaceLeft >= TOOLTIP_WIDTH) {
      left = sr.left - TOOLTIP_GAP - TOOLTIP_WIDTH;
    } else {
      // place below
      left = Math.max(16, Math.min(viewport.w - TOOLTIP_WIDTH - 16, sr.left));
      top = sr.top + sr.height + TOOLTIP_GAP;
    }
    // clamp vertically (estimate tooltip height ~ 280)
    const estH = 300;
    top = Math.max(80, Math.min(viewport.h - estH - 16, top));
    tooltipStyle = { top, left, width: TOOLTIP_WIDTH };
  }

  return (
    <div className="fixed inset-0 z-[100] animate-fade-in" style={{ pointerEvents: "auto" }}>
      {/* SVG mask overlay */}
      <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: "auto" }}>
        <defs>
          <mask id="onboarding-spotlight-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {sr && (
              <rect
                x={sr.left}
                y={sr.top}
                width={sr.width}
                height={sr.height}
                rx="10"
                ry="10"
                fill="black"
                style={{ transition: "all 0.4s ease" }}
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(5, 2, 15, 0.82)"
          mask="url(#onboarding-spotlight-mask)"
        />
      </svg>

      {/* Purple border around spotlight */}
      {sr && (
        <div
          className="absolute pointer-events-none rounded-[10px]"
          style={{
            top: sr.top,
            left: sr.left,
            width: sr.width,
            height: sr.height,
            boxShadow: "0 0 0 2px hsl(var(--primary) / 0.85), 0 0 30px hsl(var(--primary) / 0.55)",
            transition: "all 0.4s ease",
          }}
        />
      )}

      {/* Top progress bar */}
      <div className="absolute top-0 left-0 right-0 h-[3px] bg-transparent z-10">
        <div
          className="h-full bg-primary transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Step pills */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-10">
        {STEPS.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full transition-all ${
              i === step
                ? "w-6 bg-primary"
                : i < step
                ? "w-1.5 bg-primary/70"
                : "w-1.5 bg-muted-foreground/30"
            }`}
          />
        ))}
      </div>

      {/* Skip button */}
      <button
        onClick={() => finish()}
        className="absolute top-3 right-4 text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 z-10 bg-background/40 backdrop-blur px-2.5 py-1 rounded-md border border-border"
      >
        Pular tour <X className="h-3 w-3" />
      </button>

      {/* Floating tooltip card */}
      <div
        key={step}
        className="absolute bg-card border border-primary/30 rounded-xl p-5 shadow-[0_0_50px_-10px_hsl(var(--primary)/0.5)] animate-scale-in z-10"
        style={{ ...tooltipStyle, transition: "top 0.4s ease, left 0.4s ease" }}
      >
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
          Etapa {step + 1} de {total}
        </p>
        <div className="text-4xl mb-3">{current.icon}</div>
        <h3 className="text-lg font-semibold text-foreground mb-2">{current.title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed mb-5">{current.description}</p>

        {isLast ? (
          <div className="flex flex-col gap-2">
            <Button className="w-full" onClick={() => finish("/clientes")}>
              Cadastrar primeiro cliente
            </Button>
            <Button variant="outline" className="w-full" onClick={() => finish("/")}>
              Ir para o Dashboard
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            {step > 0 ? (
              <Button variant="outline" size="sm" onClick={() => setStep((s) => s - 1)}>
                <ArrowLeft className="h-4 w-4" /> Voltar
              </Button>
            ) : (
              <div />
            )}
            <Button size="sm" className="ml-auto" onClick={() => setStep((s) => s + 1)}>
              {step === 0 ? "Começar" : "Próximo"} <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
