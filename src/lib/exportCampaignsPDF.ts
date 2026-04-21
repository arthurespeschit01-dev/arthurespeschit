import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '@/integrations/supabase/client';

const fmtBRL = (v: number) => `R$ ${(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}`;
const fmtInt = (v: number) => (v || 0).toLocaleString('pt-BR');
const fmtPct = (v: number) => `${(v || 0).toFixed(2)}%`;

interface ExportParams {
  clientName: string;
  periodLabel: string;
  campaigns: any[];
}

// Retorna 3 colunas relevantes (label/value) para cada objetivo
function objectiveMetrics(objective: string, row: any): { label: string; value: string }[] {
  const obj = (objective || '').toUpperCase();
  const spend = { label: 'Gasto', value: fmtBRL(row.spend) };
  if (obj.includes('LEAD')) {
    const cpl = row.leads ? row.spend / row.leads : 0;
    return [spend, { label: 'Leads', value: fmtInt(row.leads) }, { label: 'CPL', value: fmtBRL(cpl) }];
  }
  if (obj.includes('SALES') || obj.includes('CONVERSIONS') || obj.includes('PURCHASE')) {
    const roas = row.spend ? (row.revenue || 0) / row.spend : 0;
    return [spend, { label: 'Compras', value: fmtInt(row.purchases) }, { label: 'ROAS', value: `${roas.toFixed(2)}x` }];
  }
  if (obj.includes('MESSAGES') || obj.includes('ENGAGEMENT')) {
    const cpm = row.messages ? row.spend / row.messages : 0;
    return [spend, { label: 'Conversas', value: fmtInt(row.messages) }, { label: 'Custo/Conv', value: fmtBRL(cpm) }];
  }
  if (obj.includes('TRAFFIC') || obj.includes('LINK_CLICKS')) {
    return [spend, { label: 'Cliques', value: fmtInt(row.clicks) }, { label: 'CPC', value: fmtBRL(row.cpc) }];
  }
  if (obj.includes('AWARENESS') || obj.includes('REACH') || obj.includes('VIDEO')) {
    return [spend, { label: 'Alcance', value: fmtInt(row.reach) }, { label: 'CPM', value: fmtBRL(row.cpm) }];
  }
  return [spend, { label: 'CTR', value: fmtPct(row.ctr) }, { label: 'CPC', value: fmtBRL(row.cpc) }];
}

export async function exportCampaignsPDF({ clientName, periodLabel, campaigns }: ExportParams) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();

  // Cabeçalho
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageW, 80, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.text('Relatório de Desempenho — Meta Ads', 40, 40);
  doc.setFontSize(11);
  doc.setTextColor(200, 210, 230);
  doc.text(`Cliente: ${clientName}`, 40, 58);
  doc.text(`Período: ${periodLabel}`, 40, 72);
  doc.setTextColor(120, 130, 145);
  doc.setFontSize(8);
  doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, pageW - 40, 72, { align: 'right' });

  let cursorY = 100;

  // Resumo geral por campanha
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(13);
  doc.text('Resumo das Campanhas', 40, cursorY);
  cursorY += 10;

  const campRows = campaigns.map(c => {
    const m = objectiveMetrics(c.objective, c);
    return [
      c.name,
      c.objective || '—',
      c.status || '—',
      m[0]?.value || '—',
      `${m[1]?.label}: ${m[1]?.value || '—'}`,
      `${m[2]?.label}: ${m[2]?.value || '—'}`,
    ];
  });

  autoTable(doc, {
    startY: cursorY + 6,
    head: [['Campanha', 'Objetivo', 'Status', 'Gasto', 'Resultado', 'Custo/ROAS']],
    body: campRows,
    styles: { fontSize: 9, cellPadding: 6 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 40, right: 40 },
  });

  // Detalhe por campanha (conjuntos + criativos)
  for (const camp of campaigns) {
    const [{ data: adsets }, { data: creatives }] = await Promise.all([
      supabase.from('ad_sets' as any).select('*').eq('campaign_id', camp.id).order('spend', { ascending: false }),
      supabase.from('creatives' as any).select('*').eq('campaign_id', camp.id).order('spend', { ascending: false }),
    ]);

    doc.addPage();
    // Cabeçalho da página
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageW, 56, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.text(camp.name, 40, 28);
    doc.setFontSize(9);
    doc.setTextColor(180, 190, 210);
    doc.text(`Objetivo: ${camp.objective || '—'}  •  Status: ${camp.status || '—'}  •  ${periodLabel}`, 40, 46);

    let y = 80;

    // Métricas da campanha
    const m = objectiveMetrics(camp.objective, camp);
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(11);
    doc.text('Métricas da Campanha', 40, y);
    autoTable(doc, {
      startY: y + 6,
      head: [['Gasto', 'Impressões', 'Cliques', 'CTR', 'CPC', m[1]?.label || '—', m[2]?.label || '—']],
      body: [[
        fmtBRL(camp.spend),
        fmtInt(camp.impressions),
        fmtInt(camp.clicks),
        fmtPct(camp.ctr),
        fmtBRL(camp.cpc),
        m[1]?.value || '—',
        m[2]?.value || '—',
      ]],
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [37, 99, 235], textColor: 255 },
      margin: { left: 40, right: 40 },
    });
    y = (doc as any).lastAutoTable.finalY + 18;

    // Conjuntos
    doc.setFontSize(11);
    doc.text(`Conjuntos de Anúncio (${adsets?.length || 0})`, 40, y);
    if (adsets && adsets.length > 0) {
      autoTable(doc, {
        startY: y + 6,
        head: [['Conjunto', 'Gasto', 'Impressões', 'Cliques', 'CTR', 'Resultado', 'Custo']],
        body: adsets.map((a: any) => {
          const am = objectiveMetrics(camp.objective, a);
          return [
            a.name,
            fmtBRL(a.spend),
            fmtInt(a.impressions),
            fmtInt(a.clicks),
            fmtPct(a.ctr),
            am[1]?.value || '—',
            am[2]?.value || '—',
          ];
        }),
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: [16, 185, 129], textColor: 255 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: 40, right: 40 },
      });
      y = (doc as any).lastAutoTable.finalY + 18;
    } else {
      doc.setFontSize(9);
      doc.setTextColor(120, 130, 145);
      doc.text('Nenhum conjunto importado.', 40, y + 16);
      doc.setTextColor(15, 23, 42);
      y += 32;
    }

    // Criativos
    if (y > 700) { doc.addPage(); y = 60; }
    doc.setFontSize(11);
    doc.text(`Criativos (${creatives?.length || 0})`, 40, y);
    if (creatives && creatives.length > 0) {
      autoTable(doc, {
        startY: y + 6,
        head: [['Criativo', 'Status', 'Gasto', 'Impressões', 'Cliques', 'CTR', 'Resultado', 'Custo']],
        body: creatives.map((c: any) => {
          const cm = objectiveMetrics(camp.objective, c);
          return [
            c.name,
            c.status || '—',
            fmtBRL(c.spend),
            fmtInt(c.impressions),
            fmtInt(c.clicks),
            fmtPct(c.ctr),
            cm[1]?.value || '—',
            cm[2]?.value || '—',
          ];
        }),
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: [168, 85, 247], textColor: 255 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: 40, right: 40 },
      });
    } else {
      doc.setFontSize(9);
      doc.setTextColor(120, 130, 145);
      doc.text('Nenhum criativo importado.', 40, y + 16);
    }
  }

  // Rodapé com numeração
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140, 150, 165);
    doc.text(`Página ${i} de ${pageCount}`, pageW - 40, doc.internal.pageSize.getHeight() - 20, { align: 'right' });
  }

  const safeName = clientName.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  doc.save(`relatorio-${safeName}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
