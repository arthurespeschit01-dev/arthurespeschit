import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Plus, Edit2, Trash2, Search, BookOpen, Store, ShoppingBag, Puzzle } from 'lucide-react';
import { toast } from 'sonner';

interface CaseStudy {
  id: string; client_name: string; niche: string; challenge: string; strategy: string; results: string; learnings: string;
}

interface StaticStudy {
  title: string;
  subtitle: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  content: { heading: string; text: string }[];
  questions: string[];
  lessons: string[];
}

const staticStudies: StaticStudy[] = [
  {
    title: 'Lanchonete Sabor Único',
    subtitle: 'Transformação Digital com Tráfego Pago',
    icon: Store,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    content: [
      { heading: 'Introdução', text: 'Na movimentada cidade de São Paulo, a lanchonete Sabor Único era conhecida por seus deliciosos hambúrgueres artesanais. Gerida por Pedro e Luísa, a lanchonete sempre teve uma clientela fiel, mas com o aumento da concorrência e a chegada de grandes redes de fast food, os desafios para atrair novos clientes se tornaram evidentes. Decididos a expandir seu alcance, Pedro e Luísa optaram por investir em estratégias de tráfego pago.' },
      { heading: 'Capítulo 1: Identificação dos Desafios', text: 'Pedro e Luísa notaram que, apesar da qualidade dos seus produtos, a lanchonete não estava conseguindo atrair a atenção dos clientes fora do seu bairro. Eles perceberam que precisavam de uma presença online mais forte e de uma forma eficaz de direcionar novos clientes para a lanchonete.\n\nAo pesquisar sobre marketing digital, descobriram que o tráfego pago poderia ser a solução. No entanto, com um orçamento limitado e pouca experiência, enfrentavam a dúvida sobre como começar e onde investir.' },
      { heading: 'Capítulo 2: A Construção da Estratégia', text: 'Após contratar uma agência de marketing digital, Pedro e Luísa participaram de uma reunião detalhada para traçar a estratégia de tráfego pago. A equipe de marketing explicou que o sucesso dependia de uma segmentação precisa, criativos atrativos e uma análise contínua dos resultados.\n\nA estratégia foi elaborada em várias etapas:\n\n1. Segmentação de Público: Identificaram os clientes potenciais como jovens e adultos entre 18 e 35 anos, interessados em gastronomia e comidas artesanais.\n2. Geolocalização: Decidiram focar em um raio de 10 km ao redor da lanchonete para atrair clientes locais.\n3. Criação de Conteúdo: Desenvolveram anúncios com fotos de alta qualidade dos hambúrgueres, destacando ingredientes frescos e promoções especiais.\n4. Campanhas Sazonais: Planejaram campanhas para eventos locais e datas comemorativas, como a Semana do Hambúrguer.' },
      { heading: 'Capítulo 3: Implementação das Campanhas', text: 'Com a estratégia definida, a agência lançou campanhas no Google Ads e Facebook Ads. Pedro e Luísa estavam apreensivos, mas animados para ver os resultados.\n\nOs primeiros dias foram de intenso monitoramento. Os anúncios começaram a gerar cliques e visitas ao site da lanchonete, onde os clientes podiam ver o menu e fazer pedidos. A promoção da Semana do Hambúrguer foi um grande sucesso, trazendo muitos novos clientes.' },
      { heading: 'Capítulo 4: Desafios e Ajustes', text: 'Mesmo com os resultados positivos, Pedro e Luísa enfrentaram desafios. Notaram que, em algumas semanas, as vendas não aumentavam conforme esperado. A equipe de marketing realizou uma análise detalhada e identificou que os anúncios precisavam de ajustes.\n\nImplementaram mudanças nos horários de exibição dos anúncios, focando nos horários de almoço e jantar. Além disso, criaram novos criativos com vídeos curtos mostrando a preparação dos hambúrgueres, o que aumentou o engajamento.' },
      { heading: 'Capítulo 5: Resultados a Longo Prazo', text: 'Após seis meses de campanhas de tráfego pago, a Sabor Único viu uma transformação significativa. As vendas aumentaram e a lanchonete se tornou um ponto de referência na região. A presença online também cresceu, com mais seguidores nas redes sociais e uma base de clientes fiéis.\n\nPedro e Luísa perceberam que, além das vendas, o tráfego pago ajudou a construir uma marca forte e a conectar-se com a comunidade local de maneira mais profunda.' },
    ],
    questions: [
      'Segmentação Precisa: Como você definiria o público-alvo para o seu negócio? Que fatores demográficos e comportamentais são mais importantes?',
      'Geolocalização: Como a geolocalização pode ajudar a otimizar suas campanhas de tráfego pago? Quais são os melhores métodos para definir a área de alcance?',
      'Conteúdo Visual: Quais tipos de conteúdo visual (fotos, vídeos, etc.) são mais eficazes para atrair e engajar seu público?',
      'Ajustes Contínuos: Por que é importante ajustar continuamente suas campanhas de tráfego pago? Que métricas você deve monitorar?',
      'Integração com Eventos Locais: Como você pode integrar suas campanhas de tráfego pago com eventos locais e datas comemorativas para aumentar o impacto?',
    ],
    lessons: [
      'Segmentação de Público: Uma segmentação precisa é crucial para alcançar o público certo. Entender quem são seus clientes e onde eles estão é fundamental para o sucesso das campanhas.',
      'Uso da Geolocalização: A geolocalização ajuda a concentrar os esforços de marketing em áreas específicas, maximizando a relevância dos anúncios e aumentando a probabilidade de conversão.',
      'Importância do Conteúdo Visual: Conteúdos visuais atraentes, como fotos de alta qualidade e vídeos envolventes, são essenciais para capturar a atenção do público e destacá-los dos concorrentes.',
      'Ajustes e Otimizações: Monitorar e ajustar continuamente as campanhas é essencial para garantir o sucesso a longo prazo. Pequenos ajustes nos horários de exibição e nos criativos podem ter um grande impacto.',
      'Integração com Eventos e Promoções: Aproveitar eventos locais e datas comemorativas pode aumentar significativamente o impacto das campanhas de tráfego pago, criando uma conexão mais forte com a comunidade.',
    ],
  },
  {
    title: 'Loja de Moda Beleza Rara',
    subtitle: 'Revolução Digital com Tráfego Pago',
    icon: ShoppingBag,
    color: 'text-rose-400',
    bg: 'bg-rose-500/10',
    content: [
      { heading: 'Introdução', text: 'Beleza Rara, uma loja de moda feminina localizada em Belo Horizonte, era conhecida por suas roupas elegantes e de alta qualidade. Dirigida por Clara, a loja tinha uma clientela fiel, mas lutava para competir com as grandes marcas online e atrair novos clientes. Clara decidiu que era hora de levar sua loja para o próximo nível através de estratégias de tráfego pago.' },
      { heading: 'Capítulo 1: Identificação dos Problemas', text: 'Clara percebeu que, apesar de seu produto ser de alta qualidade, ela estava perdendo clientes para concorrentes que tinham uma forte presença online. As vendas na loja física eram estáveis, mas as vendas online eram mínimas. Ela precisava de uma maneira eficaz de aumentar o tráfego do site e converter visitantes em clientes pagantes.\n\nAo estudar o marketing digital, Clara descobriu que o tráfego pago poderia ser a solução. No entanto, ela enfrentava desafios em termos de orçamento e conhecimento técnico sobre como implementar essas estratégias.' },
      { heading: 'Capítulo 2: Desenvolvendo a Estratégia', text: 'Clara decidiu contratar uma consultoria de marketing digital para ajudá-la a criar uma estratégia de tráfego pago. Durante as reuniões iniciais, a equipe de marketing explicou a importância de entender o comportamento de compra online e a criação de uma presença digital forte.\n\nA estratégia foi dividida em várias etapas:\n\n1. Análise do Comportamento de Compra: Identificar os padrões de compra dos clientes e entender o que os motiva a fazer uma compra online.\n2. Remarketing: Implementar estratégias de remarketing para reconectar com visitantes que não concluíram uma compra.\n3. Anúncios de Produtos Dinâmicos: Utilizar anúncios de produtos dinâmicos para mostrar itens específicos com base nos interesses e comportamentos dos usuários.\n4. Campanhas de Influenciadores: Colaborar com influenciadores digitais para aumentar a visibilidade e credibilidade da marca.' },
      { heading: 'Capítulo 3: Implementação das Campanhas', text: 'A equipe de marketing iniciou campanhas no Google Ads, Facebook Ads e Instagram Ads. Clara ficou especialmente animada com a ideia de usar anúncios dinâmicos, pois eles mostrariam produtos específicos para pessoas que já haviam visitado o site.\n\nAs primeiras semanas foram cruciais. A loja viu um aumento significativo no tráfego do site e, mais importante, as taxas de conversão começaram a melhorar. Clara notou que os anúncios de remarketing estavam trazendo muitos visitantes de volta ao site para concluir suas compras.' },
      { heading: 'Capítulo 4: Desafios e Aprendizados', text: 'Apesar do sucesso inicial, Clara enfrentou alguns desafios. Ela percebeu que muitos clientes abandonavam o carrinho antes de finalizar a compra. A equipe de marketing sugeriu a implementação de campanhas de recuperação de carrinho, enviando e-mails personalizados para lembrar os clientes dos itens deixados no carrinho.\n\nAlém disso, Clara notou que as vendas eram sazonais, com picos em épocas específicas do ano. A equipe ajudou a ajustar as campanhas para aproveitar melhor essas épocas, focando em promoções de final de ano e lançamentos de novas coleções.' },
      { heading: 'Capítulo 5: Resultados a Longo Prazo', text: 'Após um ano de campanhas de tráfego pago, Beleza Rara se transformou digitalmente. As vendas online aumentaram significativamente, e a loja física também viu um fluxo constante de novos clientes atraídos pelas campanhas online. Clara ficou impressionada com o impacto das campanhas de influenciadores, que não só aumentaram as vendas, mas também fortaleceram a imagem da marca.\n\nAlém do aumento nas vendas, Clara aprendeu que o tráfego pago era uma ferramenta poderosa para entender melhor seus clientes e adaptar suas estratégias de marketing com base em dados concretos.' },
    ],
    questions: [
      'Comportamento de Compra: Como você pode identificar e analisar os padrões de compra dos seus clientes? Quais ferramentas podem ajudar nesse processo?',
      'Remarketing: Como as estratégias de remarketing podem ser aplicadas ao seu negócio para reconectar com clientes potenciais?',
      'Anúncios Dinâmicos: Quais são os benefícios dos anúncios de produtos dinâmicos e como eles podem melhorar suas taxas de conversão?',
      'Campanhas de Influenciadores: Como você pode escolher os influenciadores certos para sua marca e medir o impacto de suas campanhas?',
      'Recuperação de Carrinho: Que estratégias você pode implementar para reduzir o abandono de carrinho e recuperar vendas perdidas?',
    ],
    lessons: [
      'Análise do Comportamento de Compra: Entender os padrões de compra dos clientes é essencial para criar campanhas de marketing eficazes. Ferramentas como Google Analytics podem ajudar a identificar esses padrões e ajustar suas estratégias.',
      'Importância do Remarketing: O remarketing é uma estratégia eficaz para reconectar com visitantes que não concluíram uma compra. Ele mantém sua marca na mente dos clientes e aumenta as chances de conversão.',
      'Anúncios de Produtos Dinâmicos: Esses anúncios são poderosos porque mostram produtos específicos com base no comportamento dos usuários. Eles são altamente personalizados e aumentam as chances de conversão.',
      'Impacto dos Influenciadores: Colaborar com influenciadores pode aumentar significativamente a visibilidade e a credibilidade da sua marca. Escolher influenciadores que se alinhem com os valores da sua marca é crucial.',
      'Estratégias de Recuperação de Carrinho: Implementar campanhas de recuperação de carrinho pode ajudar a recuperar vendas perdidas e melhorar suas taxas de conversão. E-mails personalizados e ofertas de desconto são exemplos de táticas eficazes.',
    ],
  },
  {
    title: 'Loja Brilha Brinquedos',
    subtitle: 'A Jornada de Sucesso com Tráfego Pago',
    icon: Puzzle,
    color: 'text-violet-400',
    bg: 'bg-violet-500/10',
    content: [
      { heading: 'Introdução', text: 'No coração de uma cidade movimentada, existia uma pequena loja de brinquedos chamada Brilha Brinquedos. Fundada por Ana e Marcos, dois amigos de infância com uma paixão compartilhada por trazer alegria às crianças, a loja era conhecida por sua vasta coleção de brinquedos educativos e inovadores. No entanto, apesar da qualidade dos produtos, Ana e Marcos enfrentavam dificuldades para atrair mais clientes e aumentar as vendas.' },
      { heading: 'Capítulo 1: O Desafio', text: 'Ana e Marcos perceberam que o tráfego de clientes em sua loja física estava diminuindo. Eles decidiram criar uma loja online para alcançar um público maior. No entanto, mesmo com a presença online, as vendas não aumentaram como esperavam. Foi então que ouviram falar sobre o poder do tráfego pago.\n\nAna, curiosa e determinada, começou a pesquisar sobre como os anúncios pagos poderiam ajudar a aumentar as visitas ao site da Brilha Brinquedos. Ela descobriu que, através de plataformas como Google Ads e Facebook Ads, poderiam alcançar potenciais clientes de forma mais eficaz.' },
      { heading: 'Capítulo 2: A Estratégia', text: 'Decididos a investir em tráfego pago, Ana e Marcos contrataram uma empresa de marketing digital especializada. A primeira reunião com a equipe de marketing foi reveladora. A equipe explicou que, para atrair os clientes certos, era crucial entender o público-alvo e criar anúncios que ressoassem com eles.\n\nA estratégia foi dividida em várias etapas:\n\n1. Pesquisa de Mercado: Analisaram os concorrentes e identificaram palavras-chave relevantes.\n2. Segmentação de Público: Definiram o público-alvo como pais de crianças de 3 a 10 anos, com interesse em brinquedos educativos.\n3. Criação de Anúncios: Desenvolveram anúncios visuais e de texto atraentes, destacando a qualidade e os benefícios dos brinquedos.\n4. Otimização Contínua: Implementaram testes A/B para otimizar os anúncios e ajustar as segmentações.' },
      { heading: 'Capítulo 3: O Lançamento das Campanhas', text: 'Com tudo preparado, a equipe de marketing lançou as campanhas nas plataformas escolhidas. No início, Ana e Marcos estavam nervosos, mas confiavam no processo. Os primeiros dias foram dedicados ao monitoramento intenso das campanhas.\n\nOs resultados começaram a aparecer rapidamente. O tráfego no site aumentou significativamente e, mais importante, as vendas começaram a subir. Ana e Marcos ficaram animados ao verem os pedidos chegarem de diversas partes do país.' },
      { heading: 'Capítulo 4: Ajustes e Otimizações', text: 'Apesar do sucesso inicial, a equipe de marketing não descansou. Eles continuaram a analisar os dados e a fazer ajustes nas campanhas. Notaram que certos anúncios tinham melhor desempenho durante horários específicos do dia e ajustaram os lances e a segmentação de acordo.\n\nAlém disso, implementaram novas campanhas focadas em datas comemorativas, como o Dia das Crianças e o Natal, momentos em que a demanda por brinquedos era maior.' },
      { heading: 'Capítulo 5: O Impacto a Longo Prazo', text: 'Seis meses após o início das campanhas de tráfego pago, a Brilha Brinquedos se transformou. O site se tornou uma das principais fontes de receita, e a loja física também viu um aumento no número de clientes, muitos dos quais conheceram a loja online primeiro.\n\nAna e Marcos aprenderam que o tráfego pago não era apenas uma ferramenta para aumentar visitas ao site, mas uma estratégia poderosa para construir uma marca e fidelizar clientes.' },
    ],
    questions: [
      'Compreensão do Público-Alvo: Como você definiria o público-alvo para o seu negócio? Que características e interesses eles possuem?',
      'Estratégia de Anúncios: Quais elementos são essenciais na criação de um anúncio eficaz? Como você pode testar e otimizar esses elementos?',
      'Monitoramento e Ajustes: Por que é importante monitorar continuamente as campanhas de tráfego pago? Quais métricas você considera mais importantes?',
      'Datas Comemorativas e Promoções: Como você pode aproveitar datas comemorativas e eventos especiais para impulsionar suas campanhas de tráfego pago?',
      'Resultados a Longo Prazo: De que maneiras o tráfego pago pode ajudar a construir uma marca e fidelizar clientes, além de aumentar as vendas imediatas?',
    ],
    lessons: [
      'Importância do Público-Alvo: Entender quem são seus clientes e o que eles procuram é crucial para o sucesso de qualquer campanha de marketing. Definir claramente o público-alvo permite criar anúncios mais relevantes e eficazes.',
      'Criação de Anúncios Atraentes: Anúncios visuais e de texto devem destacar os benefícios dos produtos e atrair a atenção do público. Testes A/B ajudam a identificar quais anúncios são mais eficazes.',
      'Otimização Contínua: Monitorar e ajustar continuamente as campanhas é essencial para maximizar o ROI. Pequenos ajustes na segmentação, lances e horários podem fazer uma grande diferença nos resultados.',
      'Aproveitar Oportunidades: Utilizar datas comemorativas e eventos especiais pode aumentar significativamente o impacto das campanhas. Planejar campanhas sazonais é uma estratégia eficaz para aumentar as vendas.',
      'Construção de Marca: O tráfego pago não é apenas sobre vendas imediatas. Ele ajuda a construir a marca e a criar uma base de clientes fiéis, proporcionando crescimento sustentável a longo prazo.',
    ],
  },
];

export default function Estudos() {
  const { user } = useAuth();
  const [cases, setCases] = useState<CaseStudy[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CaseStudy | null>(null);
  const [form, setForm] = useState({ client_name: '', niche: '', challenge: '', strategy: '', results: '', learnings: '' });
  const [selectedStatic, setSelectedStatic] = useState<StaticStudy | null>(null);
  const [search, setSearch] = useState('');

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from('case_studies').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    setCases(data || []);
  };

  useEffect(() => { load(); }, [user]);

  const openNew = () => { setEditing(null); setForm({ client_name: '', niche: '', challenge: '', strategy: '', results: '', learnings: '' }); setOpen(true); };
  const openEdit = (c: CaseStudy) => { setEditing(c); setForm({ client_name: c.client_name, niche: c.niche || '', challenge: c.challenge || '', strategy: c.strategy || '', results: c.results || '', learnings: c.learnings || '' }); setOpen(true); };

  const save = async () => {
    if (!user) return;
    if (editing) {
      await supabase.from('case_studies').update(form).eq('id', editing.id);
      toast.success('Estudo atualizado!');
    } else {
      await supabase.from('case_studies').insert({ ...form, user_id: user.id });
      toast.success('Estudo criado!');
    }
    setOpen(false); load();
  };

  const remove = async (id: string) => {
    await supabase.from('case_studies').delete().eq('id', id);
    toast.success('Removido!'); load();
  };

  const filteredStatic = staticStudies.filter(s =>
    s.title.toLowerCase().includes(search.toLowerCase()) || s.subtitle.toLowerCase().includes(search.toLowerCase())
  );

  const filteredCases = cases.filter(c =>
    c.client_name.toLowerCase().includes(search.toLowerCase()) || (c.niche || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Estudos de Caso</h1>
          <p className="text-muted-foreground text-sm mt-1">Casos de sucesso em tráfego pago</p>
        </div>
        <Button onClick={openNew} className="neon-glow gap-2"><Plus className="w-4 h-4" /> Novo Estudo</Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Buscar estudos..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 bg-secondary/50 border-border/50" />
      </div>

      {/* Static Studies */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredStatic.map((s, idx) => {
          const Icon = s.icon;
          return (
            <div key={idx} onClick={() => setSelectedStatic(s)} className="glass-surface rounded-xl p-5 cursor-pointer hover:border-primary/30 border border-border/20 transition-all hover:scale-[1.02] group">
              <div className="flex items-center gap-3 mb-3">
                <div className={`p-2 rounded-lg ${s.bg}`}>
                  <Icon className={`w-5 h-5 ${s.color}`} />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground text-sm">{s.title}</h3>
                  <p className={`text-xs ${s.color}`}>{s.subtitle}</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground line-clamp-2">{s.content[0].text}</p>
              <p className="text-xs text-primary mt-3 opacity-0 group-hover:opacity-100 transition-opacity">Clique para ler →</p>
            </div>
          );
        })}

        {/* User's custom studies */}
        {filteredCases.map(c => (
          <div key={c.id} onClick={() => { setEditing(null); }} className="glass-surface rounded-xl p-5 border border-border/20 group">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <BookOpen className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-foreground text-sm">{c.client_name}</h3>
                <p className="text-xs text-primary">{c.niche}</p>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openEdit(c); }}><Edit2 className="w-3 h-3" /></Button>
                <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); remove(c.id); }} className="hover:text-destructive"><Trash2 className="w-3 h-3" /></Button>
              </div>
            </div>
            <p className="text-sm text-muted-foreground line-clamp-2">{c.challenge}</p>
          </div>
        ))}
      </div>

      {filteredStatic.length === 0 && filteredCases.length === 0 && (
        <p className="text-center py-12 text-muted-foreground">Nenhum estudo encontrado.</p>
      )}

      {/* Static Study Popup */}
      <Dialog open={!!selectedStatic} onOpenChange={() => setSelectedStatic(null)}>
        <DialogContent className="bg-card border-border max-w-2xl max-h-[85vh] overflow-y-auto">
          {selectedStatic && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${selectedStatic.bg}`}>
                    <selectedStatic.icon className={`w-5 h-5 ${selectedStatic.color}`} />
                  </div>
                  <div>
                    <DialogTitle className="text-lg">{selectedStatic.title}</DialogTitle>
                    <DialogDescription className={selectedStatic.color}>{selectedStatic.subtitle}</DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-6 mt-4">
                {selectedStatic.content.map((c, i) => (
                  <div key={i}>
                    <h3 className="font-semibold text-foreground mb-2">{c.heading}</h3>
                    <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">{c.text}</p>
                  </div>
                ))}

                <div className="border-t border-border/30 pt-4">
                  <h3 className="font-semibold text-foreground mb-3">💡 Questionamentos ao Leitor</h3>
                  <div className="space-y-2">
                    {selectedStatic.questions.map((q, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="text-primary font-bold text-sm mt-0.5">{i + 1}.</span>
                        <p className="text-sm text-muted-foreground">{q}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t border-border/30 pt-4">
                  <h3 className="font-semibold text-foreground mb-3">📚 Ensinamentos</h3>
                  <div className="space-y-2">
                    {selectedStatic.lessons.map((l, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="text-emerald-400 font-bold text-sm mt-0.5">✓</span>
                        <p className="text-sm text-muted-foreground">{l}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Create/Edit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? 'Editar Estudo' : 'Novo Estudo de Caso'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {[{ l: 'Nome do cliente', k: 'client_name' as const, input: true }, { l: 'Nicho', k: 'niche' as const, input: true }, { l: 'Desafio', k: 'challenge' as const }, { l: 'Estratégia', k: 'strategy' as const }, { l: 'Resultados', k: 'results' as const }, { l: 'Aprendizados', k: 'learnings' as const }].map(f => (
              <div key={f.k}><Label className="text-muted-foreground text-sm">{f.l}</Label>
                {f.input ? <Input value={form[f.k]} onChange={(e) => setForm({ ...form, [f.k]: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" /> : <Textarea value={form[f.k]} onChange={(e) => setForm({ ...form, [f.k]: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" rows={3} />}
              </div>
            ))}
            <Button onClick={save} className="w-full neon-glow">Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
