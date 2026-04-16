import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';

const objections = [
  {
    id: 1,
    title: 'Custo Elevado',
    objection: 'O investimento é muito alto.',
    response: 'Entendo sua preocupação com o custo. No entanto, este valor será recuperado através do aumento de vendas/conversões/etc. Além disso, o valor que iremos gerar para o seu negócio é infinitamente maior ao preço que você irá pagar.',
    explanation: 'Aqui, destacamos o retorno do investimento (ROI) esperado e destacamos o resultado que iremos gerar para o cliente.',
  },
  {
    id: 2,
    title: 'Tempo para Ver Resultados',
    objection: 'Quanto tempo leva para ver os resultados?',
    response: 'Nossa abordagem de otimização contínua garante melhorias significativas em 1 a 2 meses. E cuidamos de todas as etapas, economizando seu tempo.',
    explanation: 'Esclarecemos a expectativa de tempo e tranquilizamos o cliente quanto ao gerenciamento completo do processo.',
  },
  {
    id: 3,
    title: 'Garantia de Resultados',
    objection: 'Não há garantias de que verei resultados.',
    response: 'Oferecemos uma garantia de satisfação e resultados mínimos, e temos vários casos de sucesso que demonstram nossa capacidade de gerar resultados.',
    explanation: 'Proporcionar uma garantia e exemplos de sucesso reforça a confiança do cliente na eficácia do serviço.',
  },
  {
    id: 4,
    title: 'Comprometimento de Longo Prazo',
    objection: 'Não quero me comprometer a longo prazo.',
    response: 'Oferecemos um período de teste de 3 meses, durante o qual você pode avaliar nossos serviços sem compromissos de longo prazo.',
    explanation: 'Oferecer um período de teste permite ao cliente experimentar os serviços sem um compromisso imediato de longo prazo.',
  },
  {
    id: 5,
    title: 'Capacidade de Atendimento',
    objection: 'Você pode atender às minhas necessidades de forma eficiente?',
    response: 'Temos uma equipe dedicada e especializada que trabalhará exclusivamente no seu projeto para garantir os melhores resultados.',
    explanation: 'Destacar a especialização e dedicação da equipe transmite confiança na capacidade de atendimento e na qualidade do serviço.',
  },
  {
    id: 6,
    title: 'Concorrência',
    objection: 'Meus concorrentes também estão investindo em tráfego pago.',
    response: 'Utilizaremos uma análise detalhada de mercado para identificar oportunidades únicas e garantir que suas campanhas se destaquem.',
    explanation: 'Mostrar que a análise competitiva pode revelar oportunidades únicas ajuda a aliviar preocupações sobre a concorrência.',
  },
  {
    id: 7,
    title: 'Preferência por Outros Canais',
    objection: 'Prefiro investir em outros canais de marketing.',
    response: 'Tráfego pago pode complementar outras estratégias de marketing, potencializando os resultados gerais e aumentando o ROI.',
    explanation: 'Apresentar o tráfego pago como uma estratégia complementar, e não substitutiva, demonstra como ele pode aumentar a eficácia de outros canais.',
  },
  {
    id: 8,
    title: 'Resultados Passados',
    objection: 'Tentei tráfego pago antes e não funcionou.',
    response: 'Nossa abordagem é baseada em dados e otimização contínua. Analisaremos o que não funcionou anteriormente e ajustaremos a estratégia para garantir o sucesso.',
    explanation: 'Oferecer uma análise e ajuste da estratégia anterior mostra uma abordagem proativa e orientada por dados.',
  },
  {
    id: 9,
    title: 'Falta de Conhecimento',
    objection: 'Não entendo como o tráfego pago funciona.',
    response: 'Forneceremos relatórios detalhados e explicações claras sobre cada etapa, garantindo total transparência e compreensão.',
    explanation: 'Educar o cliente sobre o processo e fornecer transparência ajuda a aliviar a falta de conhecimento e cria confiança.',
  },
  {
    id: 10,
    title: 'Falta de Tempo',
    objection: 'Não tenho tempo para acompanhar as campanhas.',
    response: 'Gerenciamos todas as etapas, permitindo que você se concentre no core business da empresa enquanto fornecemos atualizações regulares.',
    explanation: 'Assumir a responsabilidade do gerenciamento permite ao cliente focar em outras áreas críticas do negócio.',
  },
  {
    id: 11,
    title: 'Falta de Recursos Internos',
    objection: 'Minha equipe não tem experiência em gerenciar tráfego pago.',
    response: 'Nossa equipe especializada cuidará de tudo, desde a criação até a otimização das campanhas, sem exigir esforço adicional da sua equipe.',
    explanation: 'Garantir que a equipe do cliente não precisará se envolver diretamente pode reduzir preocupações com a falta de recursos internos.',
  },
  {
    id: 12,
    title: 'Medo de Mudanças',
    objection: 'Tenho receio de mudar minha estratégia atual.',
    response: 'Implementamos mudanças de forma gradual e monitoramos os resultados de perto para garantir uma transição suave e bem-sucedida.',
    explanation: 'Abordar mudanças de forma gradual e monitorada ajuda a minimizar riscos e tranquiliza o cliente.',
  },
  {
    id: 13,
    title: 'ROI Incerteza',
    objection: 'Não estou certo sobre o retorno sobre o investimento.',
    response: 'Nossas campanhas são otimizadas para maximizar o ROI. Podemos mostrar exemplos de clientes anteriores que tiveram um aumento significativo em seus retornos.',
    explanation: 'Proporcionar exemplos concretos de ROI ajuda a criar uma imagem clara do potencial de retorno para o cliente.',
  },
  {
    id: 14,
    title: 'Resultados a Longo Prazo',
    objection: 'Estou mais focado em resultados a longo prazo.',
    response: 'Nossas estratégias são projetadas para entregar resultados imediatos e construir uma base sólida para crescimento sustentável a longo prazo.',
    explanation: 'Demonstrar como a estratégia pode oferecer resultados imediatos e sustentar crescimento a longo prazo alinha com os objetivos do cliente.',
  },
  {
    id: 15,
    title: 'Preferência por SEO',
    objection: 'Prefiro investir em SEO.',
    response: 'Tráfego pago e SEO podem trabalhar juntos. Enquanto o SEO constrói uma base orgânica, o tráfego pago traz resultados imediatos e mensuráveis.',
    explanation: 'Mostrar como tráfego pago e SEO podem ser complementares ajuda a convencer o cliente do valor de integrar ambas as estratégias.',
  },
  {
    id: 16,
    title: 'Complexidade Técnica',
    objection: 'O tráfego pago parece muito técnico e complicado.',
    response: 'Nossa equipe cuidará de toda a complexidade técnica, garantindo que você veja apenas os resultados finais através de relatórios simples e claros.',
    explanation: 'Assumir a responsabilidade pela parte técnica e fornecer relatórios simplificados tranquiliza o cliente quanto à complexidade.',
  },
  {
    id: 17,
    title: 'Preocupação com Anúncios Rejeitados',
    objection: 'E se meus anúncios forem rejeitados?',
    response: 'Nossa equipe é experiente em seguir as diretrizes das plataformas de anúncios para garantir a aprovação e a eficácia das campanhas.',
    explanation: 'Reforçar a experiência em seguir diretrizes específicas reduz o medo de rejeições e interrupções nas campanhas.',
  },
  {
    id: 18,
    title: 'Preocupação com a Relevância',
    objection: 'Como sei que os anúncios serão relevantes para meu público?',
    response: 'Usamos segmentação precisa baseada em dados demográficos, comportamentais e de interesse para garantir que seus anúncios alcancem as pessoas certas.',
    explanation: 'A segmentação precisa garante que os anúncios sejam relevantes, aumentando a probabilidade de sucesso e reduzindo a preocupação do cliente.',
  },
  {
    id: 19,
    title: 'Confiança em Fornecedores Externos',
    objection: 'Tenho receio de confiar em fornecedores externos.',
    response: 'Oferecemos total transparência e comunicação constante, além de fornecer referências de clientes satisfeitos para reforçar nossa confiabilidade.',
    explanation: 'Transparência e referências positivas de clientes anteriores ajudam a construir confiança.',
  },
  {
    id: 20,
    title: 'Falta de Controle',
    objection: 'Prefiro ter controle total sobre minhas campanhas.',
    response: 'Embora gerenciemos as campanhas, você terá acesso a relatórios detalhados e pode solicitar ajustes a qualquer momento para manter o controle.',
    explanation: 'Permitir ao cliente manter uma certa medida de controle através de relatórios e ajustes oferece uma sensação de segurança.',
  },
  {
    id: 21,
    title: 'Preocupação com Fraude em Cliques',
    objection: 'Estou preocupado com fraude em cliques.',
    response: 'Utilizamos ferramentas avançadas para monitorar e prevenir fraudes em cliques, garantindo que seu orçamento seja usado de forma eficiente.',
    explanation: 'Reforçar o uso de ferramentas antifraude ajuda a aliviar preocupações com desperdício de orçamento.',
  },
  {
    id: 22,
    title: 'Preocupação com a Mensagem dos Anúncios',
    objection: 'Quero garantir que a mensagem dos meus anúncios esteja alinhada com a marca.',
    response: 'Trabalharemos em estreita colaboração com você para desenvolver mensagens que ressoem com a identidade da sua marca e seus valores.',
    explanation: 'Colaboração estreita na criação da mensagem garante que os anúncios reflitam com precisão a marca do cliente.',
  },
  {
    id: 23,
    title: 'Concorrência em Palavras-Chave',
    objection: 'As palavras-chave são muito competitivas e caras.',
    response: 'Utilizaremos uma abordagem estratégica para encontrar palavras-chave de cauda longa e menos competitivas que ainda sejam eficazes para atingir seu público-alvo.',
    explanation: 'Usar palavras-chave de cauda longa e menos competitivas pode reduzir custos e aumentar a eficácia.',
  },
  {
    id: 24,
    title: 'Preocupação com a Medição de Resultados',
    objection: 'Como vou medir os resultados?',
    response: 'Fornecemos relatórios detalhados com métricas claras que mostram o desempenho das campanhas e o retorno sobre o investimento.',
    explanation: 'Relatórios detalhados e métricas claras oferecem transparência e permitem ao cliente medir o sucesso das campanhas.',
  },
  {
    id: 25,
    title: 'Preocupação com a Reputação Online',
    objection: 'Estou preocupado com a reputação da minha marca online.',
    response: 'Garantimos que os anúncios sejam exibidos em contextos apropriados e usamos ferramentas de monitoramento de marca para proteger sua reputação.',
    explanation: 'Usar ferramentas de monitoramento de marca e garantir contextos apropriados ajuda a proteger e manter a reputação do cliente.',
  },
  {
    id: 26,
    title: 'Preferência por Campanhas Orgânicas',
    objection: 'Prefiro investir em campanhas orgânicas.',
    response: 'Campanhas pagas e orgânicas se complementam. Enquanto as campanhas orgânicas constroem uma base a longo prazo, o tráfego pago traz resultados rápidos e mensuráveis.',
    explanation: 'Demonstrar como campanhas pagas e orgânicas podem se complementar mostra ao cliente que ambos podem trabalhar juntos para maximizar resultados.',
  },
  {
    id: 27,
    title: 'Adequação da Estratégia',
    objection: 'Como sei que sua estratégia funcionará para mim?',
    response: 'Nossa estratégia será adaptada especificamente para as necessidades da sua empresa. Cada plano é personalizado para maximizar os resultados com base nas suas metas e desafios.',
    explanation: 'Reforçar a personalização da estratégia demonstra que o serviço é adaptável e focado nas necessidades específicas do cliente.',
  },
];

export default function Objecoes() {
  const [search, setSearch] = useState('');

  const filtered = objections.filter(o =>
    o.title.toLowerCase().includes(search.toLowerCase()) ||
    o.objection.toLowerCase().includes(search.toLowerCase()) ||
    o.response.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="animate-fade-in space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">27 Objeções e Respostas para Fechar Contratos de Tráfego Pago</h1>
        <p className="text-muted-foreground text-sm mt-2 max-w-3xl">
          Fechar contratos de tráfego pago pode ser um desafio devido às diversas preocupações e objeções que os clientes podem ter. A seguir, apresentamos 27 objeções comuns juntamente com respostas detalhadas e explicações sobre como abordar e reverter essas situações.
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar objeções..." className="pl-9 bg-secondary/50 border-border/50" />
      </div>

      <div className="space-y-4">
        {filtered.map(o => (
          <div key={o.id} className="glass-surface rounded-xl p-6 space-y-3">
            <div className="flex items-center gap-3">
              <span className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 text-primary font-bold text-sm flex items-center justify-center">{o.id}</span>
              <h2 className="font-semibold text-foreground text-base">{o.title}</h2>
            </div>

            <div className="pl-11 space-y-3">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Objeção:</span>
                <p className="text-sm text-foreground mt-0.5 italic">"{o.objection}"</p>
              </div>

              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-primary">● Resposta:</span>
                <p className="text-sm text-foreground mt-0.5">{o.response}</p>
              </div>

              <div className="bg-secondary/30 rounded-lg p-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Explicação:</span>
                <p className="text-sm text-muted-foreground mt-0.5">{o.explanation}</p>
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <p className="text-center py-12 text-muted-foreground">Nenhuma objeção encontrada.</p>}
      </div>

      <div className="glass-surface rounded-xl p-6">
        <h2 className="font-semibold text-foreground text-base mb-2">Conclusão</h2>
        <p className="text-sm text-muted-foreground">
          Abordar e responder às objeções de forma eficaz é crucial para fechar contratos de tráfego pago. Cada resposta deve ser personalizada, esclarecendo as preocupações do cliente e destacando os benefícios do serviço oferecido. Através de uma comunicação clara, transparência e exemplos de sucesso, os gestores de tráfego podem construir confiança e converter objeções em oportunidades, garantindo que os clientes vejam o valor e a eficácia das campanhas de tráfego pago.
        </p>
      </div>
    </div>
  );
}
