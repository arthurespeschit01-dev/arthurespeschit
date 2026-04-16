import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Edit2, Trash2, Search } from 'lucide-react';
import { toast } from 'sonner';

const defaultObjections = [
  { objection: 'Custo Elevado: "O investimento é muito alto."', response: 'Entendo sua preocupação com o custo. No entanto, este valor será recuperado através do aumento de vendas/conversões. Além disso, o valor que iremos gerar para o seu negócio é infinitamente maior ao preço que você irá pagar.' },
  { objection: 'Tempo para Ver Resultados: "Quanto tempo leva para ver os resultados?"', response: 'Nossa abordagem de otimização contínua garante melhorias significativas em 1 a 2 meses. E cuidamos de todas as etapas, economizando seu tempo.' },
  { objection: 'Garantia de Resultados: "Não há garantias de que verei resultados."', response: 'Oferecemos uma garantia de satisfação e resultados mínimos, e temos vários casos de sucesso que demonstram nossa capacidade de gerar resultados.' },
  { objection: 'Comprometimento de Longo Prazo: "Não quero me comprometer a longo prazo."', response: 'Oferecemos um período de teste de 3 meses, durante o qual você pode avaliar nossos serviços sem compromissos de longo prazo.' },
  { objection: 'Capacidade de Atendimento: "Você pode atender às minhas necessidades de forma eficiente?"', response: 'Temos uma equipe dedicada e especializada que trabalhará exclusivamente no seu projeto para garantir os melhores resultados.' },
  { objection: 'Concorrência: "Meus concorrentes também estão investindo em tráfego pago."', response: 'Utilizaremos uma análise detalhada de mercado para identificar oportunidades únicas e garantir que suas campanhas se destaquem.' },
  { objection: 'Preferência por Outros Canais: "Prefiro investir em outros canais de marketing."', response: 'Tráfego pago pode complementar outras estratégias de marketing, potencializando os resultados gerais e aumentando o ROI.' },
  { objection: 'Resultados Passados: "Tentei tráfego pago antes e não funcionou."', response: 'Nossa abordagem é baseada em dados e otimização contínua. Analisaremos o que não funcionou anteriormente e ajustaremos a estratégia para garantir o sucesso.' },
  { objection: 'Falta de Conhecimento: "Não entendo como o tráfego pago funciona."', response: 'Forneceremos relatórios detalhados e explicações claras sobre cada etapa, garantindo total transparência e compreensão.' },
  { objection: 'Falta de Tempo: "Não tenho tempo para acompanhar as campanhas."', response: 'Gerenciamos todas as etapas, permitindo que você se concentre no core business da empresa enquanto fornecemos atualizações regulares.' },
  { objection: 'Falta de Recursos Internos: "Minha equipe não tem experiência em gerenciar tráfego pago."', response: 'Nossa equipe especializada cuidará de tudo, desde a criação até a otimização das campanhas, sem exigir esforço adicional da sua equipe.' },
  { objection: 'Medo de Mudanças: "Tenho receio de mudar minha estratégia atual."', response: 'Implementamos mudanças de forma gradual e monitoramos os resultados de perto para garantir uma transição suave e bem-sucedida.' },
  { objection: 'ROI Incerteza: "Não estou certo sobre o retorno sobre o investimento."', response: 'Nossas campanhas são otimizadas para maximizar o ROI. Podemos mostrar exemplos de clientes anteriores que tiveram um aumento significativo em seus retornos.' },
  { objection: 'Resultados a Longo Prazo: "Estou mais focado em resultados a longo prazo."', response: 'Nossas estratégias são projetadas para entregar resultados imediatos e construir uma base sólida para crescimento sustentável a longo prazo.' },
  { objection: 'Preferência por SEO: "Prefiro investir em SEO."', response: 'Tráfego pago e SEO podem trabalhar juntos. Enquanto o SEO constrói uma base orgânica, o tráfego pago traz resultados imediatos e mensuráveis.' },
  { objection: 'Complexidade Técnica: "O tráfego pago parece muito técnico e complicado."', response: 'Nossa equipe cuidará de toda a complexidade técnica, garantindo que você veja apenas os resultados finais através de relatórios simples e claros.' },
  { objection: 'Preocupação com Anúncios Rejeitados: "E se meus anúncios forem rejeitados?"', response: 'Nossa equipe é experiente em seguir as diretrizes das plataformas de anúncios para garantir a aprovação e a eficácia das campanhas.' },
  { objection: 'Preocupação com a Relevância: "Como sei que os anúncios serão relevantes para meu público?"', response: 'Usamos segmentação precisa baseada em dados demográficos, comportamentais e de interesse para garantir que seus anúncios alcancem as pessoas certas.' },
  { objection: 'Confiança em Fornecedores Externos: "Tenho receio de confiar em fornecedores externos."', response: 'Oferecemos total transparência e comunicação constante, além de fornecer referências de clientes satisfeitos para reforçar nossa confiabilidade.' },
  { objection: 'Falta de Controle: "Prefiro ter controle total sobre minhas campanhas."', response: 'Embora gerenciemos as campanhas, você terá acesso a relatórios detalhados e pode solicitar ajustes a qualquer momento para manter o controle.' },
  { objection: 'Preocupação com Fraude em Cliques: "Estou preocupado com fraude em cliques."', response: 'Utilizamos ferramentas avançadas para monitorar e prevenir fraudes em cliques, garantindo que seu orçamento seja usado de forma eficiente.' },
  { objection: 'Preocupação com a Mensagem dos Anúncios: "Quero garantir que a mensagem esteja alinhada com a marca."', response: 'Trabalharemos em estreita colaboração com você para desenvolver mensagens que ressoem com a identidade da sua marca e seus valores.' },
  { objection: 'Concorrência em Palavras-Chave: "As palavras-chave são muito competitivas e caras."', response: 'Utilizaremos uma abordagem estratégica para encontrar palavras-chave de cauda longa e menos competitivas que ainda sejam eficazes para atingir seu público-alvo.' },
  { objection: 'Preocupação com a Medição de Resultados: "Como vou medir os resultados?"', response: 'Fornecemos relatórios detalhados com métricas claras que mostram o desempenho das campanhas e o retorno sobre o investimento.' },
  { objection: 'Preocupação com a Reputação Online: "Estou preocupado com a reputação da minha marca online."', response: 'Garantimos que os anúncios sejam exibidos em contextos apropriados e usamos ferramentas de monitoramento de marca para proteger sua reputação.' },
  { objection: 'Preferência por Campanhas Orgânicas: "Prefiro investir em campanhas orgânicas."', response: 'Campanhas pagas e orgânicas se complementam. Enquanto as campanhas orgânicas constroem uma base a longo prazo, o tráfego pago traz resultados rápidos e mensuráveis.' },
  { objection: 'Adequação da Estratégia: "Como sei que sua estratégia funcionará para mim?"', response: 'Nossa estratégia será adaptada especificamente para as necessidades da sua empresa. Cada plano é personalizado para maximizar os resultados com base nas suas metas e desafios.' },
];

interface Objection { id: string; objection: string; response: string; }

export default function Objecoes() {
  const { user } = useAuth();
  const [items, setItems] = useState<Objection[]>([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Objection | null>(null);
  const [form, setForm] = useState({ objection: '', response: '' });

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from('objections').select('*').eq('user_id', user.id).order('created_at');
    if (data && data.length > 0) {
      setItems(data);
    } else {
      await supabase.from('objections').insert(defaultObjections.map(o => ({ ...o, user_id: user.id })));
      load();
    }
  };

  useEffect(() => { load(); }, [user]);

  const filtered = items.filter(i => i.objection.toLowerCase().includes(search.toLowerCase()) || i.response.toLowerCase().includes(search.toLowerCase()));

  const openNew = () => { setEditing(null); setForm({ objection: '', response: '' }); setOpen(true); };
  const openEdit = (o: Objection) => { setEditing(o); setForm({ objection: o.objection, response: o.response }); setOpen(true); };

  const save = async () => {
    if (!user) return;
    if (editing) {
      await supabase.from('objections').update(form).eq('id', editing.id);
    } else {
      await supabase.from('objections').insert({ ...form, user_id: user.id });
    }
    toast.success('Salvo!'); setOpen(false); load();
  };

  const remove = async (id: string) => {
    await supabase.from('objections').delete().eq('id', id);
    toast.success('Removido!'); load();
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div><h1 className="text-2xl font-bold text-foreground">Objeções de Clientes</h1><p className="text-muted-foreground text-sm mt-1">27 objeções e respostas para fechar contratos de tráfego pago</p></div>
        <Button onClick={openNew} className="neon-glow gap-2"><Plus className="w-4 h-4" /> Nova Objeção</Button>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar objeções..." className="pl-9 bg-secondary/50 border-border/50" />
      </div>
      <div className="space-y-3">
        {filtered.map(o => (
          <div key={o.id} className="glass-surface rounded-xl p-5 group">
            <div className="flex items-start justify-between mb-2">
              <p className="font-semibold text-foreground text-sm">"{o.objection}"</p>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="sm" onClick={() => openEdit(o)}><Edit2 className="w-3 h-3" /></Button>
                <Button variant="ghost" size="sm" onClick={() => remove(o.id)} className="hover:text-destructive"><Trash2 className="w-3 h-3" /></Button>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">{o.response}</p>
          </div>
        ))}
        {filtered.length === 0 && <p className="text-center py-12 text-muted-foreground">Nenhuma objeção encontrada.</p>}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>{editing ? 'Editar' : 'Nova Objeção'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-muted-foreground text-sm">Objeção</Label><Input value={form.objection} onChange={(e) => setForm({ ...form, objection: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" /></div>
            <div><Label className="text-muted-foreground text-sm">Resposta sugerida</Label><Textarea value={form.response} onChange={(e) => setForm({ ...form, response: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" rows={5} /></div>
            <Button onClick={save} className="w-full neon-glow">Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
