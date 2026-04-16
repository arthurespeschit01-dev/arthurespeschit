import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Edit2, Check, X, BookOpen, Users, Rocket, BarChart3, MessageSquare, Settings, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

const defaultSteps = [
  'Briefing inicial com o cliente',
  'Coleta de acessos às plataformas (Facebook, Google, etc.)',
  'Configuração de Pixel e Tags de conversão',
  'Análise de mercado e concorrência',
  'Criação de estratégia de campanha',
  'Configuração das campanhas nas plataformas',
  'Reunião de alinhamento com o cliente',
  'Lançamento das campanhas',
  'Monitoramento e otimização inicial (primeiros 7 dias)',
  'Relatório semanal de resultados',
];

interface Step { id: string; title: string; position: number; }

const guideContent = [
  {
    icon: Users,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    title: '1. Integração e Onboarding',
    sections: [
      {
        subtitle: '1.1 Reunião de Onboarding',
        items: [
          { bold: 'Introdução à Equipe:', text: 'Apresente o cliente à equipe que trabalhará no projeto, explicando os papéis de cada membro.' },
          { bold: 'Alinhamento de Expectativas:', text: 'Reiterem os objetivos, KPIs e cronograma do projeto, garantindo que todos estejam na mesma página.' },
          { bold: 'Configuração de Ferramentas:', text: 'Configure ou solicite acesso às contas de anúncios do cliente e às ferramentas de comunicação e gestão de projetos (Slack, Trello, Google Drive, etc.).' },
        ]
      },
      {
        subtitle: '1.2 Coleta de Materiais e Informações',
        items: [
          { bold: 'Briefing Detalhado:', text: 'Envie um briefing solicitando informações adicionais e materiais necessários, como logotipos, imagens, vídeos, etc.' },
          { bold: 'Aprovação de Conteúdo:', text: 'Estabeleça um processo para aprovação de conteúdos antes do lançamento das campanhas.' },
        ]
      },
      {
        subtitle: '1.3 Configuração Técnica',
        items: [
          { bold: 'Contas de Anúncios:', text: 'Configure as contas de anúncios nas plataformas escolhidas (Google Ads, Facebook Ads, Instagram Ads, etc.).' },
          { bold: 'Integração de Ferramentas:', text: 'Integre ferramentas de análise e monitoramento (Google Analytics, SEMrush, Ahrefs) para acompanhar o desempenho das campanhas.' },
        ]
      },
    ]
  },
  {
    icon: Rocket,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    title: '2. Desenvolvimento e Lançamento das Campanhas',
    sections: [
      {
        subtitle: '2.1 Pesquisa e Planejamento',
        items: [
          { bold: 'Pesquisa de Palavras-Chave:', text: 'Utilize ferramentas como Google Keyword Planner e SEMrush para identificar palavras-chave relevantes.' },
          { bold: 'Análise de Concorrentes:', text: 'Estude as campanhas dos concorrentes para identificar oportunidades e ameaças.' },
          { bold: 'Segmentação do Público-Alvo:', text: 'Defina a segmentação do público-alvo com base em dados demográficos, comportamentais e de interesse.' },
        ]
      },
      {
        subtitle: '2.2 Criação de Anúncios',
        items: [
          { bold: 'Desenvolvimento de Criativos:', text: 'Crie anúncios visuais e de texto alinhados com a marca e objetivos do cliente.' },
          { bold: 'Testes A/B:', text: 'Planeje e configure testes A/B para otimizar criativos, segmentações e estratégias de lances.' },
        ]
      },
      {
        subtitle: '2.3 Configuração e Lançamento',
        items: [
          { bold: 'Configuração de Campanhas:', text: 'Configure campanhas nas plataformas como Google Ads, Facebook Ads, Instagram Ads, entre outras.' },
          { bold: 'Monitoramento Inicial:', text: 'Lance as campanhas e monitore os primeiros resultados para garantir que tudo está funcionando conforme planejado.' },
        ]
      },
    ]
  },
  {
    icon: BarChart3,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    title: '3. Monitoramento e Otimização Contínua',
    sections: [
      {
        subtitle: '3.1 Monitoramento Diário',
        items: [
          { bold: 'Acompanhamento de KPIs:', text: 'Monitore os KPIs diariamente para garantir que as campanhas estão no caminho certo.' },
          { bold: 'Ajustes Rápidos:', text: 'Faça ajustes rápidos em lances, segmentações e criativos com base no desempenho observado.' },
        ]
      },
      {
        subtitle: '3.2 Análises Semanais',
        items: [
          { bold: 'Relatórios Semanais:', text: 'Gere relatórios semanais detalhados com métricas chave (impressões, cliques, CTR, custo por clique, CPA, etc.) e insights sobre o desempenho.' },
          { bold: 'Discussões Internas:', text: 'Realize reuniões internas para discutir os resultados semanais e planejar ajustes necessários.' },
        ]
      },
      {
        subtitle: '3.3 Testes Contínuos',
        items: [
          { bold: 'Testes A/B:', text: 'Continue realizando testes A/B para otimizar elementos das campanhas, como títulos de anúncios, descrições, imagens e segmentações.' },
          { bold: 'Experimentos de Campanha:', text: 'Teste novas estratégias e abordagens regularmente para encontrar maneiras de melhorar o desempenho.' },
        ]
      },
    ]
  },
  {
    icon: MessageSquare,
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
    title: '4. Relatórios e Comunicação com o Cliente',
    sections: [
      {
        subtitle: '4.1 Relatórios Detalhados',
        items: [
          { bold: 'Resultados Financeiros:', text: 'Apresente os resultados financeiros das campanhas, incluindo ROI, custo por aquisição (CPA) e valor do cliente (LTV).' },
          { bold: 'Visualização de Dados:', text: 'Utilize gráficos e dashboards para facilitar a compreensão dos dados.' },
          { bold: 'Insights Estratégicos:', text: 'Forneça insights sobre o desempenho e recomendações para melhorias.' },
        ]
      },
      {
        subtitle: '4.2 Calls e Reuniões Regulares',
        items: [
          { bold: 'Reuniões Periódicas:', text: 'Realize reuniões periódicas (semanais ou mensais) para apresentar resultados e alinhar estratégias.' },
          { bold: 'Feedback do Cliente:', text: 'Colete feedback do cliente para ajustar as campanhas conforme necessário.' },
          { bold: 'Planejamento Conjunto:', text: 'Trabalhe em conjunto com o cliente para planejar próximos passos e novas iniciativas.' },
        ]
      },
      {
        subtitle: '4.3 Comunicação Contínua',
        items: [
          { bold: 'Atualizações Frequentes:', text: 'Mantenha o cliente informado sobre o andamento das campanhas.' },
          { bold: 'Transparência:', text: 'Seja transparente sobre resultados, desafios e oportunidades.' },
          { bold: 'Suporte Ágil:', text: 'Esteja disponível para responder dúvidas e resolver problemas rapidamente.' },
        ]
      },
    ]
  },
  {
    icon: Settings,
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10',
    title: '5. Ajustes Estratégicos e Melhoria Contínua',
    sections: [
      {
        subtitle: '5.1 Análise de Desempenho',
        items: [
          { bold: 'Identificação de Oportunidades:', text: 'Analise os dados de desempenho para identificar oportunidades de melhoria e áreas que necessitam de ajustes.' },
          { bold: 'Análise Competitiva:', text: 'Continue monitorando a concorrência e ajustando as estratégias conforme necessário.' },
        ]
      },
      {
        subtitle: '5.2 Ajustes Baseados em Dados',
        items: [
          { bold: 'Revisão de Segmentações:', text: 'Ajuste a segmentação do público-alvo com base nos dados de desempenho para garantir que os anúncios alcancem as pessoas certas.' },
          { bold: 'Otimização de Lances:', text: 'Ajuste os lances para maximizar o ROI, garantindo que o orçamento do cliente seja utilizado de forma eficiente.' },
        ]
      },
      {
        subtitle: '5.3 Inovação e Adaptação',
        items: [
          { bold: 'Novas Ferramentas e Técnicas:', text: 'Esteja sempre atualizado sobre novas ferramentas, técnicas e tendências no marketing digital para aplicar nas campanhas.' },
          { bold: 'Feedback e Iteração:', text: 'Use o feedback dos clientes e os resultados das campanhas para iterar e melhorar continuamente as estratégias.' },
        ]
      },
    ]
  },
  {
    icon: RefreshCw,
    color: 'text-rose-400',
    bg: 'bg-rose-500/10',
    title: '6. Renovação de Contrato e Expansão do Projeto',
    sections: [
      {
        subtitle: '6.1 Revisão de Resultados',
        items: [
          { bold: 'Apresentação Consolidada:', text: 'Apresente um resumo dos resultados alcançados durante o período do contrato.' },
          { bold: 'Comparativo de Performance:', text: 'Mostre a evolução das campanhas ao longo do tempo.' },
        ]
      },
      {
        subtitle: '6.2 Proposta de Renovação',
        items: [
          { bold: 'Ajustes Estratégicos:', text: 'Proponha melhorias com base nos dados analisados.' },
          { bold: 'Novo Planejamento:', text: 'Apresente um novo plano estratégico para o próximo período.' },
        ]
      },
      {
        subtitle: '6.3 Expansão do Escopo',
        items: [
          { bold: 'Novas Iniciativas:', text: 'Sugira novas estratégias e campanhas para ampliar os resultados.' },
          { bold: 'Crescimento do Projeto:', text: 'Planeje a expansão do projeto com base no sucesso obtido.' },
        ]
      },
    ]
  },
];

export default function Processos() {
  const { user } = useAuth();
  const [steps, setSteps] = useState<Step[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from('onboarding_steps').select('*').eq('user_id', user.id).order('position');
    if (data && data.length > 0) {
      setSteps(data);
    } else {
      const inserts = defaultSteps.map((t, i) => ({ title: t, position: i, user_id: user.id }));
      await supabase.from('onboarding_steps').insert(inserts);
      load();
    }
  };

  useEffect(() => { load(); }, [user]);

  const startEdit = (s: Step) => { setEditingId(s.id); setEditText(s.title); };
  const saveEdit = async () => {
    if (!editingId) return;
    await supabase.from('onboarding_steps').update({ title: editText }).eq('id', editingId);
    setEditingId(null);
    toast.success('Etapa atualizada!');
    load();
  };

  return (
    <div className="animate-fade-in space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Processos de Entrada de Clientes</h1>
        <p className="text-muted-foreground text-sm mt-1">Guia completo de gerenciamento — do onboarding à renovação</p>
      </div>

      {/* Intro */}
      <div className="glass-surface rounded-xl p-6 border border-primary/10">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <BookOpen className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground mb-1">Sobre este guia</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              O gerenciamento eficaz de clientes é crucial para o sucesso de uma empresa de tráfego pago. Um processo bem-estruturado garante que as campanhas sejam otimizadas, os resultados sejam alcançados e os clientes estejam satisfeitos. Este guia detalhado e didático abrange todas as etapas do gerenciamento de clientes, desde a integração até a otimização contínua e a renovação de contratos.
            </p>
          </div>
        </div>
      </div>

      {/* Guide Accordion */}
      <Accordion type="multiple" className="space-y-3">
        {guideContent.map((section, idx) => {
          const Icon = section.icon;
          return (
            <AccordionItem key={idx} value={`section-${idx}`} className="glass-surface rounded-xl border border-border/30 overflow-hidden">
              <AccordionTrigger className="px-6 py-4 hover:no-underline hover:bg-secondary/30">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${section.bg}`}>
                    <Icon className={`w-5 h-5 ${section.color}`} />
                  </div>
                  <span className="font-semibold text-foreground text-left">{section.title}</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-6">
                <div className="space-y-5 pt-2">
                  {section.sections.map((sub, sIdx) => (
                    <div key={sIdx}>
                      <h4 className={`font-medium mb-3 ${section.color}`}>{sub.subtitle}</h4>
                      <div className="space-y-2 ml-1">
                        {sub.items.map((item, iIdx) => (
                          <div key={iIdx} className="flex items-start gap-2">
                            <div className={`w-1.5 h-1.5 rounded-full mt-2 shrink-0 ${section.bg} border ${section.color.replace('text-', 'border-')}`} />
                            <p className="text-sm text-muted-foreground leading-relaxed">
                              <span className="font-medium text-foreground">{item.bold}</span>{' '}{item.text}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>

      {/* Conclusion */}
      <div className="glass-surface rounded-xl p-6 border border-primary/10">
        <h3 className="font-semibold text-foreground mb-2">Conclusão</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Garantir a eficiência do tráfego pago depende diretamente de um processo bem estruturado, desde o onboarding até a escala. A consistência na execução, análise de dados e comunicação com o cliente são os pilares para resultados sustentáveis.
        </p>
      </div>

      {/* Checklist */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">Checklist de Onboarding</h2>
        <div className="glass-surface rounded-xl p-6">
          <div className="relative">
            <div className="absolute left-4 top-0 bottom-0 w-px bg-primary/20" />
            <div className="space-y-4">
              {steps.map((s, i) => (
                <div key={s.id} className="flex items-start gap-4 relative">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0 z-10">
                    {i + 1}
                  </div>
                  {editingId === s.id ? (
                    <div className="flex-1 flex gap-2 items-center">
                      <Input value={editText} onChange={(e) => setEditText(e.target.value)} className="bg-secondary/50 border-border/50" autoFocus onKeyDown={(e) => e.key === 'Enter' && saveEdit()} />
                      <Button size="sm" variant="ghost" onClick={saveEdit}><Check className="w-4 h-4 text-emerald-400" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}><X className="w-4 h-4" /></Button>
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-between group py-1.5">
                      <span className="text-sm text-foreground">{s.title}</span>
                      <Button size="sm" variant="ghost" onClick={() => startEdit(s)} className="opacity-0 group-hover:opacity-100"><Edit2 className="w-3 h-3" /></Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
