import { useState, useMemo } from 'react';
import { DollarSign, TrendingUp, Target, BarChart3, ShoppingCart, Calculator } from 'lucide-react';

export default function Calculadora() {
  const [preco, setPreco] = useState(197);
  const [custo, setCusto] = useState(30);
  const [taxasPct, setTaxasPct] = useState(7.9);
  const [taxasFixa, setTaxasFixa] = useState(1);
  const [impostos, setImpostos] = useState(6);
  const [margem, setMargem] = useState(20);
  const [orcamento, setOrcamento] = useState(100);

  const results = useMemo(() => {
    const taxasValor = preco * (taxasPct / 100) + taxasFixa;
    const impostosValor = preco * (impostos / 100);
    const faturamentoLiquido = preco - taxasValor - impostosValor;
    const margemContribuicao = faturamentoLiquido - custo;
    const cpaMax = margemContribuicao;
    const cpaAlvo = margemContribuicao - (preco * margem / 100);
    const roasMin = cpaMax > 0 ? preco / cpaMax : 0;
    const margemLiquida = preco > 0 ? (margemContribuicao / preco) * 100 : 0;
    const vendasBreakeven = orcamento > 0 && margemContribuicao > 0 ? Math.ceil(orcamento / margemContribuicao) : 0;
    const viabilidade = margemLiquida > 30 ? 'Excelente' : margemLiquida > 15 ? 'Boa' : margemLiquida > 5 ? 'Apertada' : 'Inviável';
    const viabilidadeColor = margemLiquida > 30 ? 'bg-emerald-500' : margemLiquida > 15 ? 'bg-blue-500' : margemLiquida > 5 ? 'bg-amber-500' : 'bg-red-500';
    const viabilidadePct = Math.min(Math.max(margemLiquida, 0), 50) * 2;

    return { cpaMax, cpaAlvo, roasMin, margemLiquida, faturamentoLiquido, margemContribuicao, vendasBreakeven, viabilidade, viabilidadeColor, viabilidadePct, taxasValor, impostosValor };
  }, [preco, custo, taxasPct, taxasFixa, impostos, margem, orcamento]);

  const fields = [
    { label: 'Preço de Venda (R$)', value: preco, set: setPreco, icon: DollarSign },
    { label: 'Custo do Produto / COGS (R$)', value: custo, set: setCusto, icon: ShoppingCart },
    { label: 'Taxas da Plataforma (%)', value: taxasPct, set: setTaxasPct, icon: Calculator },
    { label: 'Taxa Fixa da Plataforma (R$)', value: taxasFixa, set: setTaxasFixa, icon: Calculator },
    { label: 'Impostos (%)', value: impostos, set: setImpostos, icon: BarChart3 },
    { label: 'Margem de Lucro Desejada (%)', value: margem, set: setMargem, icon: TrendingUp },
    { label: 'Orçamento Diário (R$)', value: orcamento, set: setOrcamento, icon: Target },
  ];

  const outputs = [
    { label: 'Faturamento Líquido', value: `R$ ${results.faturamentoLiquido.toFixed(2)}`, color: 'from-blue-500/20 to-blue-600/5 border-blue-500/30', text: 'text-blue-400', icon: DollarSign },
    { label: 'Margem de Contribuição', value: `R$ ${results.margemContribuicao.toFixed(2)}`, color: 'from-emerald-500/20 to-emerald-600/5 border-emerald-500/30', text: 'text-emerald-400', icon: TrendingUp },
    { label: 'CPA Máximo (Breakeven)', value: `R$ ${results.cpaMax.toFixed(2)}`, color: 'from-amber-500/20 to-amber-600/5 border-amber-500/30', text: 'text-amber-400', icon: Target },
    { label: 'CPA Alvo (c/ Lucro)', value: `R$ ${results.cpaAlvo.toFixed(2)}`, color: 'from-purple-500/20 to-purple-600/5 border-purple-500/30', text: 'text-purple-400', icon: Target },
    { label: 'ROAS Mínimo', value: results.roasMin.toFixed(2) + 'x', color: 'from-cyan-500/20 to-cyan-600/5 border-cyan-500/30', text: 'text-cyan-400', icon: BarChart3 },
    { label: 'Vendas/Dia p/ Breakeven', value: results.vendasBreakeven.toString(), color: 'from-rose-500/20 to-rose-600/5 border-rose-500/30', text: 'text-rose-400', icon: ShoppingCart },
  ];

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Calculadora de Viabilidade</h1>
        <p className="text-muted-foreground text-sm mt-1">Analise a viabilidade financeira das suas campanhas</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Inputs */}
        <div className="glass-surface rounded-xl p-6 space-y-4">
          <h2 className="font-semibold text-foreground text-sm uppercase tracking-wider flex items-center gap-2">
            <Calculator className="w-4 h-4 text-primary" />
            Entradas
          </h2>
          {fields.map(f => {
            const Icon = f.icon;
            return (
              <div key={f.label}>
                <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Icon className="w-3 h-3" />
                  {f.label}
                </label>
                <input
                  type="number"
                  value={f.value}
                  onChange={(e) => f.set(Number(e.target.value))}
                  className="w-full mt-1 px-3 py-2 rounded-lg bg-secondary/50 border border-border/50 text-foreground text-sm focus:border-primary focus:ring-1 focus:ring-primary/30 focus:outline-none transition-all"
                />
              </div>
            );
          })}
        </div>

        {/* Outputs */}
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {outputs.map(o => {
              const Icon = o.icon;
              return (
                <div
                  key={o.label}
                  className={`rounded-xl p-4 bg-gradient-to-br ${o.color} border backdrop-blur-sm transition-transform hover:scale-[1.02]`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`p-1.5 rounded-lg bg-background/30 ${o.text}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <p className="text-xs text-muted-foreground">{o.label}</p>
                  </div>
                  <p className={`text-xl font-bold ${o.text}`}>{o.value}</p>
                </div>
              );
            })}
          </div>

          {/* Viability bar */}
          <div className="glass-surface rounded-xl p-5">
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm text-muted-foreground">Viabilidade da Campanha</span>
              <span className={`text-sm font-bold px-3 py-1 rounded-full ${
                results.viabilidade === 'Excelente' ? 'bg-emerald-500/20 text-emerald-400' :
                results.viabilidade === 'Boa' ? 'bg-blue-500/20 text-blue-400' :
                results.viabilidade === 'Apertada' ? 'bg-amber-500/20 text-amber-400' :
                'bg-red-500/20 text-red-400'
              }`}>
                {results.viabilidade}
              </span>
            </div>
            <div className="w-full h-3 bg-secondary rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-700 ${results.viabilidadeColor}`} style={{ width: `${results.viabilidadePct}%` }} />
            </div>
            <p className="text-xs text-muted-foreground mt-2">Margem líquida: {results.margemLiquida.toFixed(1)}%</p>
          </div>
        </div>
      </div>
    </div>
  );
}
