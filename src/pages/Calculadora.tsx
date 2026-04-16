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
    const taxasValor = preco * (taxasPct / 100) + taxasFixa;
    const impostosValor = preco * (impostos / 100);
    const faturamentoLiquido = preco - taxasValor - impostosValor;
    const margemContribuicao = faturamentoLiquido - custo;
    const cpaMax = margemContribuicao; // breakeven
    const cpaAlvo = margemContribuicao - (preco * margem / 100);
    const roasMin = cpaMax > 0 ? preco / cpaMax : 0;
    const margemLiquida = preco > 0 ? (margemContribuicao / preco) * 100 : 0;
    const vendasBreakeven = orcamento > 0 && margemContribuicao > 0 ? Math.ceil(orcamento / margemContribuicao) : 0;
    const lucroMeta = cpaAlvo > 0 ? cpaAlvo * vendasBreakeven - orcamento + (vendasBreakeven * (preco * margem / 100)) : 0;
    const viabilidade = margemLiquida > 30 ? 'Excelente' : margemLiquida > 15 ? 'Boa' : margemLiquida > 5 ? 'Apertada' : 'Inviável';
    const viabilidadeColor = margemLiquida > 30 ? 'bg-emerald-500' : margemLiquida > 15 ? 'bg-neon-blue' : margemLiquida > 5 ? 'bg-amber-500' : 'bg-red-500';
    const viabilidadePct = Math.min(Math.max(margemLiquida, 0), 50) * 2;

    return { cpaMax, cpaAlvo, roasMin, margemLiquida, faturamentoLiquido, margemContribuicao, vendasBreakeven, viabilidade, viabilidadeColor, viabilidadePct, taxasValor, impostosValor };
  }, [preco, custo, taxasPct, taxasFixa, impostos, margem, orcamento]);

  const fields = [
    { label: 'Preço de Venda (R$)', value: preco, set: setPreco },
    { label: 'Custo do Produto / COGS (R$)', value: custo, set: setCusto },
    { label: 'Taxas da Plataforma (%)', value: taxasPct, set: setTaxasPct },
    { label: 'Taxa Fixa da Plataforma (R$)', value: taxasFixa, set: setTaxasFixa },
    { label: 'Impostos (%)', value: impostos, set: setImpostos },
    { label: 'Margem de Lucro Desejada (%)', value: margem, set: setMargem },
    { label: 'Orçamento Diário (R$)', value: orcamento, set: setOrcamento },
  ];

  const outputs = [
    { label: 'Faturamento Líquido', value: `R$ ${results.faturamentoLiquido.toFixed(2)}` },
    { label: 'Margem de Contribuição', value: `R$ ${results.margemContribuicao.toFixed(2)}` },
    { label: 'CPA Máximo (Breakeven)', value: `R$ ${results.cpaMax.toFixed(2)}` },
    { label: 'CPA Alvo (c/ Lucro)', value: `R$ ${results.cpaAlvo.toFixed(2)}` },
    { label: 'ROAS Mínimo', value: results.roasMin.toFixed(2) + 'x' },
    { label: 'Vendas/Dia p/ Breakeven', value: results.vendasBreakeven.toString() },
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
