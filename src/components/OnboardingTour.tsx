import { useEffect, useLayoutEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {toast} from 'sonner';
import { ArrowLeft, ArrowRight, X } from "lucide-react";

type Step = {
  icon: string;
  title: string;
  description: string;
  target?: string; // data-tour-id
};

const STEPS: Step[] = [
  {icon:'🎉',title:'Bem-vindo à Central do Gestor!',description:'Esta é a sua Central: sua conta começa vazia, com espaço para os seus clientes, tarefas e processos. Vamos conhecer o sistema.'},
  {icon:'🖥️',title:'Dashboard da sua agência',description:'Acompanhe seus clientes, entregas e financeiro. Os indicadores começam zerados e crescem conforme você cadastrar os dados.',target:'nav-dashboard'},
  {icon:'👥',title:'Cadastre seu primeiro cliente',description:'Organize contato, serviços, mensalidade, início do contrato e primeiro pagamento. Cada cliente pode ter seu próprio acompanhamento.',target:'nav-clientes'},
  {icon:'✅',title:'Seu quadro de tarefas',description:'Crie tarefas por área, com responsável e prazo. Alterne entre tabela, quadro, planejamento e histórico. As recorrências respeitam a data de início.',target:'nav-tasks'},
  {icon:'💬',title:'Conversas da sua conta',description:'Se quiser usar o WhatsApp, configure sua própria instância nas Configurações. Conversas e conexões de outras contas não são compartilhadas.',target:'nav-conversas'},
  {icon:'🗂️',title:'Acompanhe a operação',description:'Organize o onboarding, acompanhe etapas e gere relatórios dos seus clientes na área de Operações.',target:'nav-operacoes'},
  {icon:'📈',title:'Organize o comercial',description:'Configure suas pipelines, crie formulários e registre agendamentos. Respostas dos seus formulários entram no seu CRM.',target:'nav-comercial'},
  {icon:'💰',title:'Financeiro e contratos',description:'Use a área de Gestão para acompanhar recebimentos, pagamentos e contratos da sua agência.',target:'nav-gestao'},
  {icon:'⚙️',title:'Personalize sua Central',description:'Configure suas integrações e alertas. Processos e materiais de apoio também ficam nas Configurações.',target:'nav-config'},
  {icon:'🚀',title:'Sua Central está pronta!',description:'Você pode começar cadastrando um cliente ou explorar o dashboard. Seus dados ficam separados das outras contas.'},
];

const PADDING = 8;
const TOOLTIP_WIDTH = 340;
const TOOLTIP_GAP = 16;

type Rect = { top: number; left: number; width: number; height: number };

export default function OnboardingTour() {
  const { user } = useAuth();const userId=user?.id;
  const navigate = useNavigate();
  const [show, setShow] = useState(false);
  const [step, setStep] = useState(0);
  const [checking, setChecking] = useState(true);
  const [finishing,setFinishing]=useState(false);
  const [rect, setRect] = useState<Rect | null>(null);
  const [viewport, setViewport] = useState({ w: typeof window !== "undefined" ? window.innerWidth : 1024, h: typeof window !== "undefined" ? window.innerHeight : 768 });

  useEffect(() => {
    let cancelled=false;setShow(false);setStep(0);setChecking(true);
    if(!userId){setChecking(false);return;}
    (async()=>{
      let {data,error}=await supabase.from('profiles').select('onboarding_completed').eq('user_id',userId).maybeSingle();
      if(error)throw error;
      if(!data){
        const result=await supabase.from('profiles').upsert({user_id:userId,onboarding_completed:false},{onConflict:'user_id',ignoreDuplicates:true});
        if(result.error)throw result.error;
        const profile=await supabase.from('profiles').select('onboarding_completed').eq('user_id',userId).maybeSingle();
        data=profile.data;error=profile.error;if(error||!data)throw error||new Error('Perfil indisponível');
      }
      if(!cancelled)setShow(!data.onboarding_completed);
    })().catch(()=>{if(!cancelled)toast.error('Não foi possível carregar o guia inicial. Atualize a página para tentar novamente.')}).finally(()=>{if(!cancelled)setChecking(false)});
    return()=>{cancelled=true};
  },[userId]);

  const current = STEPS[step];
  const tooltipWidth=Math.min(TOOLTIP_WIDTH,viewport.w-24);

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
      const r = el.getBoundingClientRect();
      if(r.width===0||r.left<0||r.right>window.innerWidth||r.top<0||r.bottom>window.innerHeight){setRect(null);return;}
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
    if(!userId||finishing)return;setFinishing(true);
    const {error}=await supabase.from('profiles').update({onboarding_completed:true}).eq('user_id',userId).select('user_id').single();
    setFinishing(false);if(error){toast.error('Não foi possível salvar o guia inicial. Tente novamente.');return;}
    setShow(false);if(navigateTo)navigate(navigateTo);
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
      width: tooltipWidth,
    };
  } else {
    // try right of element
    const spaceRight = viewport.w - (sr.left + sr.width) - TOOLTIP_GAP;
    const spaceLeft = sr.left - TOOLTIP_GAP;
    let left: number;
    let top: number = sr.top;
    if (spaceRight >= tooltipWidth) {
      left = sr.left + sr.width + TOOLTIP_GAP;
    } else if (spaceLeft >= tooltipWidth) {
      left = sr.left - TOOLTIP_GAP - tooltipWidth;
    } else {
      // place below
      left = Math.max(16, Math.min(viewport.w - tooltipWidth - 16, sr.left));
      top = sr.top + sr.height + TOOLTIP_GAP;
    }
    // clamp vertically (estimate tooltip height ~ 280)
    const estH = 300;
    top = Math.max(80, Math.min(viewport.h - estH - 16, top));
    tooltipStyle = { top, left, width: tooltipWidth };
  }

  return (
    <div aria-label="Guia inicial da sua conta" className="fixed inset-0 z-[100] animate-fade-in" style={{ pointerEvents: "auto" }}>
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
        disabled={finishing} onClick={() => void finish()}
        className="absolute top-3 right-4 text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 z-10 bg-background/40 backdrop-blur px-2.5 py-1 min-h-11 rounded-md border border-border"
      >
        Pular tour <X className="h-3 w-3" />
      </button>

      {/* Floating tooltip card */}
      <div
        key={step}
        className="absolute max-h-[calc(100dvh-5rem)] overflow-y-auto bg-card border border-primary/30 rounded-xl p-5 shadow-[0_0_50px_-10px_hsl(var(--primary)/0.5)] animate-scale-in z-10"
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
            <Button className="w-full" disabled={finishing} onClick={() => void finish("/clientes")}>
              Cadastrar primeiro cliente
            </Button>
            <Button variant="outline" className="w-full" disabled={finishing} onClick={() => void finish("/")}>
              Ir para o Dashboard
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            {step > 0 ? (
              <Button variant="outline" size="sm" className="min-h-11" disabled={finishing} onClick={() => setStep((s) => s - 1)}>
                <ArrowLeft className="h-4 w-4" /> Voltar
              </Button>
            ) : (
              <div />
            )}
            <Button size="sm" className="ml-auto min-h-11" disabled={finishing} onClick={() => setStep((s) => s + 1)}>
              {step === 0 ? "Começar" : "Próximo"} <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
