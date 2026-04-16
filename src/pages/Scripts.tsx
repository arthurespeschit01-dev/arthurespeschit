import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Search, FileText, Plus, Trash2 } from 'lucide-react';

interface ScriptSection {
  heading: string;
  content: string;
}

interface ScriptModel {
  id: number;
  title: string;
  sections: ScriptSection[];
}

const defaultScripts: ScriptModel[] = [
  {
    id: 1,
    title: 'Script de Fechamento — Modelo 01',
    sections: [
      { heading: 'Introdução', content: `"Olá [Nome do Cliente], é um prazer falar com você hoje. Agradeço pela oportunidade de conversarmos sobre como podemos impulsionar os resultados da [Nome da Empresa] através de uma estratégia avançada de tráfego pago. Estou confiante de que juntos podemos alcançar e até superar seus objetivos."` },
      { heading: '1. Conectando e Criando Empatia', content: `"Antes de começarmos, quero dizer que admiro muito o trabalho da [Nome da Empresa], especialmente [mencionar algo específico e positivo sobre a empresa, como seu compromisso com a inovação ou a qualidade excepcional dos seus produtos/serviços]. Isso torna nosso potencial de parceria ainda mais empolgante para mim."` },
      { heading: '2. Diagnóstico Inicial', content: `"Para começarmos, gostaria de entender melhor suas metas e desafios. Quais são os principais objetivos que você espera atingir com uma campanha de tráfego pago? E quais dificuldades específicas você está enfrentando atualmente?"\n\n(Aguardar a resposta e anotar os pontos principais)` },
      { heading: '3. Alinhamento de Expectativas', content: `"Perfeito, [Nome do Cliente]. Com base no que você mencionou, o foco principal é [resumo dos objetivos, como aumentar as vendas online, gerar leads qualificados, melhorar a visibilidade da marca, etc.], e os desafios incluem [resumo dos desafios, como alta concorrência, baixa taxa de conversão, etc.]. Vamos trabalhar juntos para superar esses desafios e atingir suas metas."` },
      { heading: '4. Apresentando a Proposta', content: `"Minha proposta é uma solução integrada e personalizada, que inclui os seguintes pontos-chave:\n\n● Análise de Mercado Profunda: Vamos realizar uma análise detalhada para identificar oportunidades de mercado e benchmarking com concorrentes.\n● Criação de Campanhas Customizadas: Desenvolveremos campanhas específicas para suas necessidades, focando em [objetivos específicos, como aumentar a taxa de conversão ou expandir o alcance].\n● Segmentação Avançada: Utilizaremos dados detalhados para segmentar seu público-alvo de forma precisa, garantindo que suas mensagens alcancem as pessoas certas.\n● Otimização Contínua: Monitoramento constante e ajustes das campanhas para maximizar o ROI.\n● Relatórios Transparentes e Detalhados: Relatórios regulares que mostram claramente os resultados e o desempenho das campanhas."` },
      { heading: '5. Valor Agregado e Diferenciais', content: `"O que nos distingue é nosso compromisso com a excelência e os resultados tangíveis. Ao optar por nossa parceria, você terá:\n\n● Resultados Tangíveis: Campanhas focadas em maximizar seu retorno sobre o investimento.\n● Gestão Integral: Cuidamos de todo o processo, permitindo que você se concentre em outras áreas estratégicas da empresa.\n● Tecnologia de Ponta: Utilizamos as melhores ferramentas e tecnologias para garantir campanhas eficientes e otimizadas.\n● Suporte Exclusivo: Atendimento personalizado para qualquer necessidade ou ajuste necessário.\n● Adaptação Rápida: Flexibilidade para ajustar as estratégias conforme as necessidades e mudanças do mercado."` },
      { heading: '6. Detalhamento do Investimento', content: `"Para garantir que alcancemos esses resultados, o investimento necessário será de [valor do investimento]. Esse valor cobre todas as etapas, desde a concepção até a otimização contínua das campanhas. Considerando os benefícios esperados, como [resultados esperados, como aumento de X% nas vendas, Y número de leads qualificados, etc.], estou confiante de que este é um investimento estratégico para a [Nome da Empresa]."` },
      { heading: '7. Prova Social e Credibilidade', content: `"Para reforçar nossa credibilidade, temos inúmeros casos de sucesso, como o da [Nome do Cliente/Caso de Sucesso], que conseguiu [detalhar resultados específicos, como aumento significativo em vendas ou redução no custo por lead]. Posso compartilhar detalhes adicionais desses casos para demonstrar nossa capacidade de gerar resultados semelhantes para você."` },
      { heading: '8. Técnicas de Persuasão Avançadas', content: `● Escassez: "Atualmente, estamos limitando a aceitação de novos clientes para garantir um serviço de alta qualidade. Isso significa que temos poucas vagas disponíveis para novos projetos este mês."\n\n● Urgência: "Para começarmos a ver resultados o quanto antes, é essencial iniciarmos o processo ainda esta semana. Assim, podemos aproveitar as atuais oportunidades de mercado."\n\n● Reciprocidade: "Para assegurar que você se sinta confortável com nossa parceria, estou oferecendo [oferta especial, como um período de serviço gratuito ou um desconto inicial] para você experimentar nossos serviços sem compromisso."\n\n● Autoridade: "Com [anos de experiência, certificações, cases de sucesso], minha equipe e eu temos a expertise necessária para gerar resultados excepcionais com tráfego pago."` },
      { heading: '9. Chamado à Ação', content: `"Estou realmente empolgado com a possibilidade de trabalharmos juntos e ajudar a [Nome da Empresa] a crescer ainda mais. Podemos começar imediatamente, e para isso, só precisamos formalizar nosso acordo. Você está pronto para dar esse próximo passo e começar a ver os resultados que discutimos?"\n\n(Aguardar resposta)` },
      { heading: '10. Lidando com Objeções', content: `● Objeção Comum 1 — Custo: "Entendo que o custo possa ser uma preocupação. O que posso garantir é que o valor investido será retornado através do aumento de [vendas/conversões/etc.]. Além disso, oferecemos a possibilidade de parcelamento, facilitando o pagamento para sua empresa."\n\n● Objeção Comum 2 — Tempo: "Sei que você pode estar preocupado com o tempo necessário para ver os resultados. O que posso assegurar é que nossa abordagem focada em otimização contínua garante que você comece a ver melhorias significativas em [tempo esperado, como 1 a 2 meses]. Além disso, cuidamos de todas as etapas, economizando seu tempo."\n\n● Objeção Comum 3 — Resultados Anteriores: "É natural querer garantir que essa estratégia funcione. Temos vários casos de sucesso, como o da [Nome do Cliente], que conseguiu [resultado específico]. Posso compartilhar mais detalhes e estudos de caso que demonstram nossa capacidade de alcançar resultados semelhantes para a [Nome da Empresa]."\n\n● Objeção Comum 4 — Comprometimento: "Entendo que você possa estar preocupado com um compromisso de longo prazo. Oferecemos um período de teste de [duração do teste, como 3 meses], durante o qual você pode avaliar nossos serviços sem compromissos de longo prazo."\n\n● Objeção Comum 5 — Adequação da Estratégia: "Posso garantir que nossa estratégia será adaptada especificamente para as necessidades da [Nome da Empresa]. Cada plano é personalizado para maximizar os resultados com base nas suas metas e desafios."` },
      { heading: '11. Finalizando', content: `"Perfeito, [Nome do Cliente]. Vou preparar o contrato e enviar para seu e-mail. Podemos agendar nossa primeira reunião de alinhamento para [sugerir data e horário]. Agradeço novamente pela confiança e estou ansioso para começarmos essa jornada de sucesso juntos."` },
      { heading: '12. Follow-up', content: `(Se o cliente precisar de mais tempo para pensar)\n\n"Compreendo que você queira pensar mais um pouco sobre essa decisão. Vamos fazer o seguinte: vou enviar um resumo do que discutimos e o contrato para seu e-mail. Podemos agendar uma ligação rápida em [sugerir data e horário] para revisarmos juntos e esclarecer qualquer dúvida adicional que possa surgir. Pode ser?"` },
    ],
  },
  {
    id: 2,
    title: 'Script de Fechamento — Modelo 02',
    sections: [
      { heading: 'Introdução', content: `"Olá [Nome do Cliente], tudo bem? Quero agradecer pela oportunidade de conversar sobre como podemos alavancar os resultados da [Nome da Empresa] através de uma estratégia de tráfego pago cuidadosamente elaborada. Estou entusiasmado para mostrar como podemos transformar seus objetivos em realidade."` },
      { heading: '1. Iniciando a Conexão', content: `"Antes de começarmos, gostaria de expressar minha admiração pela [Nome da Empresa]. O compromisso de vocês com [algo positivo sobre a empresa, como atendimento ao cliente, inovação, qualidade, etc.] é inspirador e torna nossa potencial parceria ainda mais interessante."` },
      { heading: '2. Diagnóstico Personalizado', content: `"Para fornecer a melhor solução possível, preciso entender mais sobre suas metas e desafios atuais. Quais são os principais objetivos que você espera alcançar com uma campanha de tráfego pago? E quais são os maiores desafios que você está enfrentando atualmente?"\n\n(Aguardar a resposta e anotar os pontos principais)` },
      { heading: '3. Confirmando a Compreensão', content: `"Obrigado por compartilhar, [Nome do Cliente]. Para garantir que estamos alinhados, você mencionou que seus objetivos principais são [resumo dos objetivos, como aumentar as vendas online, gerar leads qualificados, expandir a visibilidade da marca, etc.], e os desafios incluem [resumo dos desafios, como alta concorrência, baixa taxa de conversão, etc.]. Correto?"\n\n(Aguardar confirmação)` },
      { heading: '4. Proposta Detalhada', content: `"Com base nas suas necessidades, desenvolvi uma estratégia personalizada que inclui:\n\n● Análise de Mercado: Investigação aprofundada do mercado e concorrentes para identificar oportunidades e ameaças.\n● Desenvolvimento de Campanhas: Criação de campanhas personalizadas focadas em seus objetivos específicos.\n● Segmentação Precisa: Uso de dados detalhados para segmentar seu público-alvo com precisão cirúrgica.\n● Otimização Contínua: Ajustes e melhorias constantes para maximizar o retorno sobre o investimento.\n● Relatórios Detalhados: Transparência total com relatórios claros que destacam os resultados e insights das campanhas."` },
      { heading: '5. Benefícios Exclusivos', content: `"Nosso diferencial está na nossa dedicação aos resultados tangíveis e à total transparência. Ao trabalhar conosco, você obterá:\n\n● ROI Elevado: Campanhas otimizadas para maximizar o retorno sobre o investimento.\n● Eficiência Operacional: Gestão completa de todas as etapas, liberando seu tempo para focar em outras áreas.\n● Tecnologia Avançada: Ferramentas de última geração para garantir campanhas eficientes.\n● Suporte Personalizado: Atendimento dedicado para resolver qualquer necessidade rapidamente.\n● Flexibilidade: Adaptamos nossas estratégias conforme necessário para manter a eficácia diante das mudanças do mercado."` },
      { heading: '6. Detalhamento do Investimento', content: `"O investimento necessário para atingir esses resultados é de [valor do investimento]. Esse valor cobre todas as etapas, desde a criação até a otimização contínua das campanhas. Considerando os benefícios esperados, como [resultados esperados, como aumento de X% nas vendas, Y número de leads qualificados, etc.], estou confiante de que este é um investimento estratégico para a [Nome da Empresa]."` },
      { heading: '7. Garantia e Casos de Sucesso', content: `"Para reforçar sua confiança, oferecemos uma garantia de [detalhar garantia, como satisfação, resultados mínimos, etc.]. Além disso, temos inúmeros casos de sucesso, como o da [Nome do Cliente/Caso de Sucesso], que conseguiu [detalhar resultados específicos, como aumento significativo em vendas ou redução no custo por lead]. Posso compartilhar detalhes adicionais desses casos para demonstrar nossa capacidade de gerar resultados semelhantes para você."` },
      { heading: '8. Técnicas Avançadas de Persuasão', content: `● Escassez: "Estamos limitando nossa capacidade de novos clientes para garantir um serviço de alta qualidade. Isso significa que temos poucas vagas disponíveis para novos projetos este mês."\n\n● Urgência: "Para começarmos a ver resultados o quanto antes, é essencial iniciarmos o processo ainda esta semana. Assim, podemos aproveitar as atuais oportunidades de mercado."\n\n● Reciprocidade: "Para assegurar que você se sinta confortável com nossa parceria, estou oferecendo [oferta especial, como um período de serviço gratuito ou um desconto inicial] para você experimentar nossos serviços sem compromisso."\n\n● Autoridade: "Com [anos de experiência, certificações, cases de sucesso], minha equipe e eu temos a expertise necessária para gerar resultados excepcionais com tráfego pago."` },
      { heading: '9. Chamado à Ação', content: `"Estou realmente empolgado com a possibilidade de trabalharmos juntos e ajudar a [Nome da Empresa] a crescer ainda mais. Podemos começar imediatamente, e para isso, só precisamos formalizar nosso acordo. Você está pronto para dar esse próximo passo e começar a ver os resultados que discutimos?"\n\n(Aguardar resposta)` },
      { heading: '10. Lidando com Objeções', content: `● Objeção Comum 1 — Custo: "Entendo que o custo possa ser uma preocupação. O que posso garantir é que o valor investido será retornado através do aumento de [vendas/conversões/etc.]. Além disso, oferecemos a possibilidade de parcelamento, facilitando o pagamento para sua empresa."\n\n● Objeção Comum 2 — Tempo: "Sei que você pode estar preocupado com o tempo necessário para ver os resultados. O que posso assegurar é que nossa abordagem focada em otimização contínua garante que você comece a ver melhorias significativas em [tempo esperado, como 1 a 2 meses]. Além disso, cuidamos de todas as etapas, economizando seu tempo."\n\n● Objeção Comum 3 — Resultados Anteriores: "É natural querer garantir que essa estratégia funcione. Temos vários casos de sucesso, como o da [Nome do Cliente], que conseguiu [resultado específico]. Posso compartilhar mais detalhes e estudos de caso que demonstram nossa capacidade de alcançar resultados semelhantes para a [Nome da Empresa]."\n\n● Objeção Comum 4 — Comprometimento: "Entendo que você possa estar preocupado com um compromisso de longo prazo. Oferecemos um período de teste de [duração do teste, como 3 meses], durante o qual você pode avaliar nossos serviços sem compromissos de longo prazo."\n\n● Objeção Comum 5 — Adequação da Estratégia: "Posso garantir que nossa estratégia será adaptada especificamente para as necessidades da [Nome da Empresa]. Cada plano é personalizado para maximizar os resultados com base nas suas metas e desafios."\n\n● Objeção Comum 6 — Capacidade de Atendimento: "Sei que pode haver preocupações sobre nossa capacidade de atender às suas necessidades de forma eficiente. Posso garantir que temos uma equipe dedicada e especializada que trabalhará exclusivamente no seu projeto para garantir os melhores resultados."` },
      { heading: '11. Finalizando', content: `"Perfeito, [Nome do Cliente]. Vou preparar o contrato e enviar para seu e-mail. Podemos agendar nossa primeira reunião de alinhamento para [sugerir data e horário]. Agradeço novamente pela confiança e estou ansioso para começarmos essa jornada de sucesso juntos."` },
      { heading: '12. Follow-up', content: `(Se o cliente precisar de mais tempo para pensar)\n\n"Compreendo que você queira pensar mais um pouco sobre essa decisão. Vamos fazer o seguinte: vou enviar um resumo do que discutimos e o contrato para seu e-mail. Podemos agendar uma ligação rápida em [sugerir data e horário] para revisarmos juntos e esclarecer qualquer dúvida adicional que possa surgir. Pode ser?"` },
    ],
  },
  {
    id: 3,
    title: 'Script de Fechamento — Modelo 03',
    sections: [
      { heading: 'Introdução', content: `"Olá [Nome do Cliente], é um prazer falar com você hoje. Agradeço pela oportunidade de conversarmos sobre como podemos impulsionar os resultados da [Nome da Empresa] através de uma estratégia avançada de tráfego pago. Estou confiante de que juntos podemos alcançar e até superar seus objetivos."` },
      { heading: '1. Conectando e Criando Empatia', content: `"Antes de começarmos, quero dizer que admiro muito o trabalho da [Nome da Empresa], especialmente [mencionar algo específico e positivo sobre a empresa, como seu compromisso com a inovação ou a qualidade excepcional dos seus produtos/serviços]. Isso torna nosso potencial de parceria ainda mais empolgante para mim."` },
      { heading: '2. Diagnóstico Inicial', content: `"Para começarmos, gostaria de entender melhor suas metas e desafios. Quais são os principais objetivos que você espera atingir com uma campanha de tráfego pago? E quais dificuldades específicas você está enfrentando atualmente?"\n\n(Aguardar a resposta e anotar os pontos principais)` },
      { heading: '3. Alinhamento de Expectativas', content: `"Perfeito, [Nome do Cliente]. Com base no que você mencionou, o foco principal é [resumo dos objetivos, como aumentar as vendas online, gerar leads qualificados, melhorar a visibilidade da marca, etc.], e os desafios incluem [resumo dos desafios, como alta concorrência, baixa taxa de conversão, etc.]. Vamos trabalhar juntos para superar esses desafios e atingir suas metas."` },
      { heading: '4. Apresentando a Proposta', content: `"Minha proposta é uma solução integrada e personalizada, que inclui os seguintes pontos-chave:\n\n● Análise de Mercado Profunda: Vamos realizar uma análise detalhada para identificar oportunidades de mercado e benchmarking com concorrentes.\n● Criação de Campanhas Customizadas: Desenvolveremos campanhas específicas para suas necessidades, focando em [objetivos específicos, como aumentar a taxa de conversão ou expandir o alcance].\n● Segmentação Avançada: Utilizaremos dados detalhados para segmentar seu público-alvo de forma precisa, garantindo que suas mensagens alcancem as pessoas certas.\n● Otimização Contínua: Monitoramento constante e ajustes das campanhas para maximizar o ROI.\n● Relatórios Transparentes e Detalhados: Relatórios regulares que mostram claramente os resultados e o desempenho das campanhas."` },
      { heading: '5. Valor Agregado e Diferenciais', content: `"O que nos distingue é nosso compromisso com a excelência e os resultados tangíveis. Ao optar por nossa parceria, você terá:\n\n● Resultados Tangíveis: Campanhas focadas em maximizar seu retorno sobre o investimento.\n● Gestão Integral: Cuidamos de todo o processo, permitindo que você se concentre em outras áreas estratégicas da empresa.\n● Tecnologia de Ponta: Utilizamos as melhores ferramentas e tecnologias para garantir campanhas eficientes e otimizadas.\n● Suporte Exclusivo: Atendimento personalizado para qualquer necessidade ou ajuste necessário.\n● Adaptação Rápida: Flexibilidade para ajustar as estratégias conforme as necessidades e mudanças do mercado."` },
      { heading: '6. Detalhamento do Investimento', content: `"Para garantir que alcancemos esses resultados, o investimento necessário será de [valor do investimento]. Esse valor cobre todas as etapas, desde a concepção até a otimização contínua das campanhas. Considerando os benefícios esperados, como [resultados esperados, como aumento de X% nas vendas, Y número de leads qualificados, etc.], estou confiante de que este é um investimento estratégico para a [Nome da Empresa]."` },
      { heading: '7. Prova Social e Credibilidade', content: `"Para reforçar nossa credibilidade, temos inúmeros casos de sucesso, como o da [Nome do Cliente/Caso de Sucesso], que conseguiu [detalhar resultados específicos, como aumento significativo em vendas ou redução no custo por lead]. Posso compartilhar detalhes adicionais desses casos para demonstrar nossa capacidade de gerar resultados semelhantes para você."` },
      { heading: '8. Técnicas de Persuasão Avançadas', content: `● Escassez: "Atualmente, estamos limitando a aceitação de novos clientes para garantir um serviço de alta qualidade. Isso significa que temos poucas vagas disponíveis para novos projetos este mês."\n\n● Urgência: "Para começarmos a ver resultados o quanto antes, é essencial iniciarmos o processo ainda esta semana. Assim, podemos aproveitar as atuais oportunidades de mercado."\n\n● Reciprocidade: "Para assegurar que você se sinta confortável com nossa parceria, estou oferecendo [oferta especial, como um período de serviço gratuito ou um desconto inicial] para você experimentar nossos serviços sem compromisso."\n\n● Autoridade: "Com [anos de experiência, certificações, cases de sucesso], minha equipe e eu temos a expertise necessária para gerar resultados excepcionais com tráfego pago."` },
      { heading: '9. Chamado à Ação', content: `"Estou realmente empolgado com a possibilidade de trabalharmos juntos e ajudar a [Nome da Empresa] a crescer ainda mais. Podemos começar imediatamente, e para isso, só precisamos formalizar nosso acordo. Você está pronto para dar esse próximo passo e começar a ver os resultados que discutimos?"\n\n(Aguardar resposta)` },
      { heading: '10. Lidando com Objeções', content: `● Objeção Comum 1 — Custo: "Entendo que o custo possa ser uma preocupação. O que posso garantir é que o valor investido será retornado através do aumento de [vendas/conversões/etc.]. Além disso, oferecemos a possibilidade de parcelamento, facilitando o pagamento para sua empresa."\n\n● Objeção Comum 2 — Tempo: "Sei que você pode estar preocupado com o tempo necessário para ver os resultados. O que posso assegurar é que nossa abordagem focada em otimização contínua garante que você comece a ver melhorias significativas em [tempo esperado, como 1 a 2 meses]. Além disso, cuidamos de todas as etapas, economizando seu tempo."\n\n● Objeção Comum 3 — Resultados Anteriores: "É natural querer garantir que essa estratégia funcione. Temos vários casos de sucesso, como o da [Nome do Cliente], que conseguiu [resultado específico]. Posso compartilhar mais detalhes e estudos de caso que demonstram nossa capacidade de alcançar resultados semelhantes para a [Nome da Empresa]."\n\n● Objeção Comum 4 — Comprometimento: "Entendo que você possa estar preocupado com um compromisso de longo prazo. Oferecemos um período de teste de [duração do teste, como 3 meses], durante o qual você pode avaliar nossos serviços sem compromissos de longo prazo."\n\n● Objeção Comum 5 — Adequação da Estratégia: "Posso garantir que nossa estratégia será adaptada especificamente para as necessidades da [Nome da Empresa]. Cada plano é personalizado para maximizar os resultados com base nas suas metas e desafios."` },
      { heading: '11. Finalizando', content: `"Perfeito, [Nome do Cliente]. Vou preparar o contrato e enviar para seu e-mail. Podemos agendar nossa primeira reunião de alinhamento para [sugerir data e horário]. Agradeço novamente pela confiança e estou ansioso para começarmos essa jornada de sucesso juntos."` },
      { heading: '12. Follow-up', content: `(Se o cliente precisar de mais tempo para pensar)\n\n"Compreendo que você queira pensar mais um pouco sobre essa decisão. Vamos fazer o seguinte: vou enviar um resumo do que discutimos e o contrato para seu e-mail. Podemos agendar uma ligação rápida em [sugerir data e horário] para revisarmos juntos e esclarecer qualquer dúvida adicional que possa surgir. Pode ser?"` },
    ],
  },
];

export default function Scripts() {
  const [search, setSearch] = useState('');
  const [allScripts, setAllScripts] = useState<ScriptModel[]>(defaultScripts);
  const [selected, setSelected] = useState<ScriptModel | null>(null);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');

  const filtered = allScripts.filter((s) =>
    s.title.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = () => {
    if (!newTitle.trim() || !newContent.trim()) return;
    const newScript: ScriptModel = {
      id: Date.now(),
      title: newTitle,
      sections: [{ heading: newTitle, content: newContent }],
    };
    setAllScripts([...allScripts, newScript]);
    setNewTitle('');
    setNewContent('');
    setCreating(false);
  };

  const handleDelete = (id: number) => {
    setAllScripts(allScripts.filter((s) => s.id !== id));
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Scripts de Fechamento</h1>
          <p className="text-muted-foreground text-sm mt-1">Modelos prontos de scripts para fechar contratos de tráfego pago</p>
        </div>
        <Button onClick={() => setCreating(true)} className="neon-glow gap-2">
          <Plus className="w-4 h-4" /> Novo Script
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar script..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 bg-secondary/50 border-border/50"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((s) => (
          <div key={s.id} className="glass-surface rounded-xl p-6 flex flex-col items-center gap-4 hover:border-primary/50 transition-colors group relative">
            <button
              onClick={() => handleDelete(s.id)}
              className="absolute top-3 right-3 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button onClick={() => setSelected(s)} className="flex flex-col items-center gap-4 w-full">
              <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-lg">
                <FileText className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-foreground text-sm text-center">{s.title}</h3>
              <span className="text-xs text-muted-foreground group-hover:text-primary transition-colors">
                Clique para abrir
              </span>
            </button>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-center text-muted-foreground py-8">Nenhum script encontrado.</p>
      )}

      {/* View Script Dialog */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="bg-card border-border max-w-3xl max-h-[90vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="text-lg">{selected.title}</DialogTitle>
              </DialogHeader>
              <div className="space-y-6 mt-4">
                {selected.sections.map((sec, i) => (
                  <div key={i}>
                    <h3 className="font-semibold text-primary text-sm mb-2">{sec.heading}</h3>
                    <div className="bg-secondary/30 rounded-lg p-4">
                      <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">{sec.content}</p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Script Dialog */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="bg-card border-border max-w-2xl">
          <DialogHeader>
            <DialogTitle>Novo Script</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label className="text-muted-foreground text-sm">Título</Label>
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Ex: Script de Fechamento — Modelo 04"
                className="bg-secondary/50 border-border/50 mt-1"
              />
            </div>
            <div>
              <Label className="text-muted-foreground text-sm">Conteúdo do Script</Label>
              <Textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="Cole ou escreva seu script aqui..."
                className="bg-secondary/50 border-border/50 mt-1 font-mono text-xs"
                rows={15}
              />
            </div>
            <Button onClick={handleCreate} className="w-full neon-glow">Salvar Script</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
