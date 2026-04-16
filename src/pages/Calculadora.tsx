import { useState, useMemo } from 'react';

export default function Calculadora() {
  const [preco, setPreco] = useState(197);
  const [custo, setCusto] = useState(30);
  const [taxasPct, setTaxasPct] = useState(7.9);
  const [taxasFixa, setTaxasFixa] = useState(1);
  const [impostos, setImpostos] = useState(6);
  const [margem, setMargem] = useState(20);
  const [orcamento, setOrcamento] = useState(100);

  const results = useMemo(() => {
    const taxaTotal = (taxas + impostos) / 100;
    const margemDesejada = margem / 100;
    const lucroVenda = preco - custo - (preco * taxaTotal);
    const margemLiquida = preco > 0 ? (lucroVenda / preco) * 100 : 0;
    const cpaMax = lucroVenda * (1 - margemDesejada);
    const roasMin = cpaMax > 0 ? preco / cpaMax : 0;
    const vendasBreakeven = orcamento > 0 && lucroVenda > 0 ? Math.ceil(orcamento / lucroVenda) : 0;
    const lucroMeta = lucroVenda * vendasBreakeven - orcamento;
    const viabilidade = margemLiquida > 30 ? 'Excelente' : margemLiquida > 15 ? 'Boa' : margemLiquida > 5 ? 'Apertada' : 'Inviável';
    const viabilidadeColor = margemLiquida > 30 ? 'bg-emerald-500' : margemLiquida > 15 ? 'bg-neon-blue' : margemLiquida > 5 ? 'bg-amber-500' : 'bg-red-500';
    const viabilidadePct = Math.min(Math.max(margemLiquida, 0), 50) * 2;

    return { cpaMax, roasMin, margemLiquida, vendasBreakeven, lucroMeta, viabilidade, viabilidadeColor, viabilidadePct };
  }, [preco, custo, taxas, impostos, margem, orcamento]);

  const fields = [
    { label: 'Preço do Produto (R$)', value: preco, set: setPreco },
    { label: 'Custo / COGS (R$)', value: custo, set: setCusto },
    { label: 'Taxas da Plataforma (%)', value: taxas, set: setTaxas },
    { label: 'Impostos (%)', value: impostos, set: setImpostos },
    { label: 'Margem de Lucro Desejada (%)', value: margem, set: setMargem },
    { label: 'Orçamento Diário (R$)', value: orcamento, set: setOrcamento },
  ];

  const outputs = [
    { label: 'CPA Máximo', value: `R$ ${results.cpaMax.toFixed(2)}` },
    { label: 'ROAS Mínimo', value: results.roasMin.toFixed(2) + 'x' },
    { label: 'Margem Líquida/Venda', value: results.margemLiquida.toFixed(1) + '%' },
    { label: 'Vendas/Dia p/ Breakeven', value: results.vendasBreakeven.toString() },
    { label: 'Lucro Estimado (meta)', value: `R$ ${results.lucroMeta.toFixed(2)}` },
  ];

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Calculadora de Viabilidade</h1>
        <p className="text-muted-foreground text-sm mt-1">Analise a viabilidade financeira das suas campanhas</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-surface rounded-xl p-6 space-y-4">
          <h2 className="font-semibold text-foreground text-sm uppercase tracking-wider">Entradas</h2>
          {fields.map(f => (
            <div key={f.label}>
              <label className="text-xs text-muted-foreground">{f.label}</label>
              <input type="number" value={f.value} onChange={(e) => f.set(Number(e.target.value))}
                className="w-full mt-1 px-3 py-2 rounded-lg bg-secondary/50 border border-border/50 text-foreground text-sm focus:border-primary focus:outline-none transition-colors" />
            </div>
          ))}
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {outputs.map(o => (
              <div key={o.label} className="glass-surface rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">{o.label}</p>
                <p className="text-xl font-bold text-foreground">{o.value}</p>
              </div>
            ))}
          </div>

          <div className="glass-surface rounded-xl p-5">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-muted-foreground">Viabilidade da Campanha</span>
              <span className="text-sm font-semibold text-foreground">{results.viabilidade}</span>
            </div>
            <div className="w-full h-3 bg-secondary rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-500 ${results.viabilidadeColor}`} style={{ width: `${results.viabilidadePct}%` }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
