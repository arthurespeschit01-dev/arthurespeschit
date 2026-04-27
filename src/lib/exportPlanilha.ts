import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export type FunnelConfig = {
  pageView: boolean;
  addToCart: boolean;
  lead: boolean;
  checkout: boolean;
};

export const INPUT_KEYS = [
  "investment",
  "clicks",
  "impressions",
  "pageViews",
  "addToCart",
  "leads",
  "checkout",
  "sales",
  "salesValue",
] as const;
export type InputKey = typeof INPUT_KEYS[number];

export type MonthlyData = Record<InputKey, number[]>;
export type Objectives = Record<InputKey, number>;
export type PlatformData = { funnel: FunnelConfig; monthly: MonthlyData; objectives: Objectives };

const sum = (arr: number[]) => arr.reduce((a, b) => a + (Number(b) || 0), 0);
const safeDiv = (a: number, b: number): number | null => !b || !isFinite(b) ? null : a / b;
const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtInt = (v: number) => Math.round(v).toLocaleString("pt-BR");
const fmtPct = (v: number | null) => v === null || !isFinite(v) ? "—" : `${v.toFixed(2)}%`;
const fmtRoas = (v: number | null) => v === null || !isFinite(v) ? "—" : v.toFixed(2);

type Row = {
  label: string;
  type: "money" | "int" | "pct" | "roas";
  values: (number | null)[]; // 12 months
  total: number | null;
  objective: number | null;
};

function buildRows(data: PlatformData): Row[] {
  const { funnel, monthly, objectives } = data;
  const inv = monthly.investment, cl = monthly.clicks, im = monthly.impressions;
  const pv = monthly.pageViews, ac = monthly.addToCart, ld = monthly.leads;
  const ck = monthly.checkout, sl = monthly.sales, sv = monthly.salesValue;

  const months = Array.from({ length: 12 }, (_, i) => i);
  const inputRow = (label: string, key: InputKey, type: "money" | "int"): Row => ({
    label, type,
    values: months.map((i) => monthly[key][i] || 0),
    total: sum(monthly[key]),
    objective: objectives[key] || null,
  });
  const calcRow = (
    label: string,
    type: "money" | "pct" | "roas",
    fn: (i: number) => number | null,
    totalFn: () => number | null,
  ): Row => ({
    label, type,
    values: months.map((i) => fn(i)),
    total: totalFn(),
    objective: null,
  });

  const pct = (a: number, b: number) => { const r = safeDiv(a, b); return r === null ? null : r * 100; };
  const r: Row[] = [];
  r.push(inputRow("Investimento em mídia", "investment", "money"));
  r.push(inputRow("Cliques", "clicks", "int"));
  r.push(inputRow("Impressões", "impressions", "int"));
  r.push(calcRow("Custo por Clique", "money", (i) => safeDiv(inv[i] || 0, cl[i] || 0), () => safeDiv(sum(inv), sum(cl))));
  if (funnel.pageView) {
    r.push(inputRow("Visualização de página", "pageViews", "int"));
    r.push(calcRow("Custo por Visualização de página", "money", (i) => safeDiv(inv[i] || 0, pv[i] || 0), () => safeDiv(sum(inv), sum(pv))));
  }
  if (funnel.addToCart) {
    r.push(inputRow("Adição ao carrinho", "addToCart", "int"));
    r.push(calcRow("Custo por Adição", "money", (i) => safeDiv(inv[i] || 0, ac[i] || 0), () => safeDiv(sum(inv), sum(ac))));
  }
  if (funnel.lead) {
    r.push(inputRow("Lead", "leads", "int"));
    r.push(calcRow("Custo por Lead", "money", (i) => safeDiv(inv[i] || 0, ld[i] || 0), () => safeDiv(sum(inv), sum(ld))));
  }
  if (funnel.checkout) {
    r.push(inputRow("Finalização de compra", "checkout", "int"));
    r.push(calcRow("Custo por Finalização", "money", (i) => safeDiv(inv[i] || 0, ck[i] || 0), () => safeDiv(sum(inv), sum(ck))));
  }
  r.push(inputRow("Vendas", "sales", "int"));
  r.push(calcRow("Custo por Venda", "money", (i) => safeDiv(inv[i] || 0, sl[i] || 0), () => safeDiv(sum(inv), sum(sl))));
  r.push(inputRow("Valor em Vendas", "salesValue", "money"));
  r.push(calcRow("ROAS", "roas", (i) => safeDiv(sv[i] || 0, inv[i] || 0), () => safeDiv(sum(sv), sum(inv))));

  // Conversion rates (header marker as separate)
  const conv: Row[] = [];
  conv.push(calcRow("CTR (Cliques / Impressões)", "pct", (i) => pct(cl[i] || 0, im[i] || 0), () => pct(sum(cl), sum(im))));
  if (funnel.pageView) conv.push(calcRow("Taxa de Visualização de Página", "pct", (i) => pct(pv[i] || 0, cl[i] || 0), () => pct(sum(pv), sum(cl))));
  if (funnel.addToCart) conv.push(calcRow("Taxa de Adição ao Carrinho", "pct", (i) => pct(ac[i] || 0, funnel.pageView ? (pv[i] || 0) : (cl[i] || 0)), () => pct(sum(ac), funnel.pageView ? sum(pv) : sum(cl))));
  if (funnel.lead) conv.push(calcRow("Taxa de Leads", "pct", (i) => pct(ld[i] || 0, cl[i] || 0), () => pct(sum(ld), sum(cl))));
  if (funnel.checkout && funnel.addToCart) conv.push(calcRow("Carrinho → Checkout", "pct", (i) => pct(ck[i] || 0, ac[i] || 0), () => pct(sum(ck), sum(ac))));
  if (funnel.checkout) conv.push(calcRow("Taxa de Venda", "pct", (i) => pct(sl[i] || 0, ck[i] || 0), () => pct(sum(sl), sum(ck))));
  conv.push(calcRow("Taxa de Conversão (Venda/Clique)", "pct", (i) => pct(sl[i] || 0, cl[i] || 0), () => pct(sum(sl), sum(cl))));

  return [...r, { label: "__SEP__TAXAS DE CONVERSÃO", type: "int", values: [], total: null, objective: null }, ...conv];
}

const fmtCell = (v: number | null, type: Row["type"]): string => {
  if (v === null || !isFinite(v)) return "—";
  if (type === "money") return fmtBRL(v);
  if (type === "pct") return fmtPct(v);
  if (type === "roas") return fmtRoas(v);
  return fmtInt(v);
};

const rawCell = (v: number | null): number | string => {
  if (v === null || !isFinite(v)) return "—";
  return Number(v.toFixed(4));
};

function buildHeader(year: number): string[] {
  const months = ["jan.", "fev.", "mar.", "abr.", "mai.", "jun.", "jul.", "ago.", "set.", "out.", "nov.", "dez."];
  const yy = String(year).slice(-2);
  return ["Métrica", "OBJETIVO", ...months.map((m) => `${m}/${yy}`), "TOTAL"];
}

function buildMatrix(data: PlatformData, year: number, formatted: boolean): (string | number)[][] {
  const header = buildHeader(year);
  const rows = buildRows(data);
  const matrix: (string | number)[][] = [header];
  rows.forEach((r) => {
    if (r.label.startsWith("__SEP__")) {
      matrix.push([r.label.replace("__SEP__", ""), ...Array(13).fill("")]);
      return;
    }
    const obj = r.objective !== null && r.objective > 0
      ? (formatted ? fmtCell(r.objective, r.type) : rawCell(r.objective))
      : "—";
    const months = r.values.map((v) => formatted ? fmtCell(v, r.type) : rawCell(v));
    const total = formatted ? fmtCell(r.total, r.type) : rawCell(r.total);
    matrix.push([r.label, obj, ...months, total]);
  });
  return matrix;
}

export function exportCSV(data: PlatformData, year: number, filename: string) {
  const matrix = buildMatrix(data, year, true);
  const csv = matrix.map((row) =>
    row.map((cell) => {
      const s = String(cell ?? "");
      return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(";")
  ).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, `${filename}.csv`);
}

export function exportXLSX(data: PlatformData, year: number, filename: string, sheetName: string) {
  const matrix = buildMatrix(data, year, false);
  const ws = XLSX.utils.aoa_to_sheet(matrix);
  ws["!cols"] = [{ wch: 36 }, { wch: 14 }, ...Array(12).fill({ wch: 12 }), { wch: 14 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export function exportPDF(data: PlatformData, year: number, filename: string, title: string) {
  const matrix = buildMatrix(data, year, true);
  const [head, ...body] = matrix;
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a3" });
  doc.setFontSize(14);
  doc.text(title, 40, 40);
  doc.setFontSize(10);
  doc.text(`Ano: ${year}`, 40, 58);
  autoTable(doc, {
    head: [head as string[]],
    body: body as any,
    startY: 75,
    styles: { fontSize: 7, cellPadding: 3 },
    headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: 150, fontStyle: "bold" } },
    didParseCell: (d) => {
      const cell = d.cell.raw;
      if (typeof cell === "string" && d.section === "body" && d.column.index === 0) {
        // section separator row
        if (d.row.raw && (d.row.raw as any[])[1] === "") {
          d.cell.styles.fillColor = [30, 64, 175];
          d.cell.styles.textColor = 255;
          d.cell.styles.fontStyle = "bold";
        }
      }
    },
  });
  doc.save(`${filename}.pdf`);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
