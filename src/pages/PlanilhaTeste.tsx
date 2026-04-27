import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

type Client = { id: string; name: string };

type FunnelConfig = {
  pageView: boolean;
  addToCart: boolean;
  lead: boolean;
  checkout: boolean;
};

// Input metric keys (data the user enters)
const INPUT_KEYS = [
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
type InputKey = typeof INPUT_KEYS[number];

type MonthlyData = Record<InputKey, number[]>; // each array length 12
type Objectives = Record<InputKey, number>;

const MONTH_LABELS = [
  "jan.", "fev.", "mar.", "abr.", "mai.", "jun.",
  "jul.", "ago.", "set.", "out.", "nov.", "dez.",
];

const emptyMonthly = (): MonthlyData =>
  INPUT_KEYS.reduce((acc, k) => {
    acc[k] = Array(12).fill(0);
    return acc;
  }, {} as MonthlyData);

const emptyObjectives = (): Objectives =>
  INPUT_KEYS.reduce((acc, k) => {
    acc[k] = 0;
    return acc;
  }, {} as Objectives);

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtInt = (v: number) => Math.round(v).toLocaleString("pt-BR");
const fmtPct = (v: number | null) =>
  v === null || !isFinite(v) ? "—" : `${v.toFixed(2)}%`;
const fmtRoas = (v: number | null) =>
  v === null || !isFinite(v) ? "—" : v.toFixed(2);
const safeDiv = (a: number, b: number): number | null =>
  !b || !isFinite(b) ? null : a / b;

const sum = (arr: number[]) => arr.reduce((a, b) => a + (Number(b) || 0), 0);

const YEARS = Array.from({ length: 7 }, (_, i) => 2023 + i);

export default function PlanilhaTeste() {
  const { user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState<string>("");
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [funnel, setFunnel] = useState<FunnelConfig>({
    pageView: true, addToCart: true, lead: true, checkout: true,
  });
  const [monthly, setMonthly] = useState<MonthlyData>(emptyMonthly());
  const [objectives, setObjectives] = useState<Objectives>(emptyObjectives());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recordId, setRecordId] = useState<string | null>(null);

  // Load clients
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name")
        .order("name");
      if (error) { toast.error("Erro ao carregar clientes"); return; }
      setClients(data || []);
      if (data && data.length && !clientId) setClientId(data[0].id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Load record on client/year change
  useEffect(() => {
    if (!user || !clientId) return;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from("traffic_records")
        .select("*")
        .eq("client_id", clientId)
        .eq("year", year)
        .maybeSingle();
      if (error && error.code !== "PGRST116") {
        toast.error("Erro ao carregar planilha");
      }
      if (data) {
        setRecordId(data.id);
        setFunnel({ ...{ pageView: true, addToCart: true, lead: true, checkout: true }, ...(data.funnel_config as any) });
        const md = (data.monthly_data as any) || {};
        const filled = emptyMonthly();
        INPUT_KEYS.forEach((k) => {
          if (Array.isArray(md[k]) && md[k].length === 12) filled[k] = md[k].map((n: any) => Number(n) || 0);
        });
        setMonthly(filled);
        const obj = (data.objectives as any) || {};
        const filledObj = emptyObjectives();
        INPUT_KEYS.forEach((k) => { filledObj[k] = Number(obj[k]) || 0; });
        setObjectives(filledObj);
      } else {
        setRecordId(null);
        setFunnel({ pageView: true, addToCart: true, lead: true, checkout: true });
        setMonthly(emptyMonthly());
        setObjectives(emptyObjectives());
      }
      setLoading(false);
    })();
  }, [user, clientId, year]);

  // Auto-save (debounced)
  const persist = useCallback(async () => {
    if (!user || !clientId) return;
    setSaving(true);
    const payload = {
      user_id: user.id,
      client_id: clientId,
      year,
      funnel_config: funnel as any,
      monthly_data: monthly as any,
      objectives: objectives as any,
    };
    const { data, error } = await supabase
      .from("traffic_records")
      .upsert(payload, { onConflict: "user_id,client_id,year" })
      .select("id")
      .single();
    if (error) toast.error("Erro ao salvar");
    else if (data) setRecordId(data.id);
    setSaving(false);
  }, [user, clientId, year, funnel, monthly, objectives]);

  useEffect(() => {
    if (!user || !clientId || loading) return;
    const t = setTimeout(() => { void persist(); }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [funnel, monthly, objectives]);

  const setCell = (key: InputKey, monthIdx: number, value: number) => {
    setMonthly((prev) => {
      const copy = { ...prev, [key]: [...prev[key]] };
      copy[key][monthIdx] = value;
      return copy;
    });
  };

  const setObjective = (key: InputKey, value: number) => {
    setObjectives((prev) => ({ ...prev, [key]: value }));
  };

  // Build rows definition based on funnel
  type RowDef = {
    key: string;
    label: string;
    type: "input-money" | "input-int" | "calc-money" | "calc-pct" | "calc-roas";
    inputKey?: InputKey;
    // for calc rows: function(monthIdx) => number | null; monthIdx === -1 means TOTAL
    calc?: (monthIdx: number) => number | null;
    // higher better => for objective comparison; default true
    higherIsBetter?: boolean;
  };

  const rows: RowDef[] = useMemo(() => {
    const inv = monthly.investment;
    const cl = monthly.clicks;
    const im = monthly.impressions;
    const pv = monthly.pageViews;
    const ac = monthly.addToCart;
    const ld = monthly.leads;
    const ck = monthly.checkout;
    const sl = monthly.sales;
    const sv = monthly.salesValue;

    const valAt = (arr: number[], i: number) => (i === -1 ? sum(arr) : arr[i] || 0);

    const r: RowDef[] = [];
    r.push({ key: "investment", label: "Investimento em mídia", type: "input-money", inputKey: "investment", higherIsBetter: false });
    r.push({ key: "clicks", label: "Cliques", type: "input-int", inputKey: "clicks" });
    r.push({ key: "impressions", label: "Impressões", type: "input-int", inputKey: "impressions" });
    r.push({ key: "cpc", label: "Custo por Clique", type: "calc-money", calc: (i) => safeDiv(valAt(inv, i), valAt(cl, i)), higherIsBetter: false });

    if (funnel.pageView) {
      r.push({ key: "pageViews", label: "Visualização de página", type: "input-int", inputKey: "pageViews" });
      r.push({ key: "cpv", label: "Custo por Visualização de página", type: "calc-money", calc: (i) => safeDiv(valAt(inv, i), valAt(pv, i)), higherIsBetter: false });
    }
    if (funnel.addToCart) {
      r.push({ key: "addToCart", label: "Adição ao carrinho", type: "input-int", inputKey: "addToCart" });
      r.push({ key: "cpac", label: "Custo por Adição", type: "calc-money", calc: (i) => safeDiv(valAt(inv, i), valAt(ac, i)), higherIsBetter: false });
    }
    if (funnel.lead) {
      r.push({ key: "leads", label: "Lead", type: "input-int", inputKey: "leads" });
      r.push({ key: "cpl", label: "Custo por Lead", type: "calc-money", calc: (i) => safeDiv(valAt(inv, i), valAt(ld, i)), higherIsBetter: false });
    }
    if (funnel.checkout) {
      r.push({ key: "checkout", label: "Finalização de compra", type: "input-int", inputKey: "checkout" });
      r.push({ key: "cpck", label: "Custo por Finalização", type: "calc-money", calc: (i) => safeDiv(valAt(inv, i), valAt(ck, i)), higherIsBetter: false });
    }

    r.push({ key: "sales", label: "Vendas", type: "input-int", inputKey: "sales" });
    r.push({ key: "cps", label: "Custo por Venda", type: "calc-money", calc: (i) => safeDiv(valAt(inv, i), valAt(sl, i)), higherIsBetter: false });
    r.push({ key: "salesValue", label: "Valor em Vendas", type: "input-money", inputKey: "salesValue" });
    r.push({ key: "roas", label: "ROAS", type: "calc-roas", calc: (i) => safeDiv(valAt(sv, i), valAt(inv, i)) });

    return r;
  }, [funnel, monthly]);

  const conversionRows: RowDef[] = useMemo(() => {
    const cl = monthly.clicks;
    const im = monthly.impressions;
    const pv = monthly.pageViews;
    const ac = monthly.addToCart;
    const ld = monthly.leads;
    const ck = monthly.checkout;
    const sl = monthly.sales;
    const valAt = (arr: number[], i: number) => (i === -1 ? sum(arr) : arr[i] || 0);
    const pct = (a: number, b: number) => { const r = safeDiv(a, b); return r === null ? null : r * 100; };

    const out: RowDef[] = [];
    out.push({ key: "ctr", label: "CTR (Cliques / Impressões)", type: "calc-pct", calc: (i) => pct(valAt(cl, i), valAt(im, i)) });
    if (funnel.pageView) out.push({ key: "tpv", label: "Taxa de Visualização de Página", type: "calc-pct", calc: (i) => pct(valAt(pv, i), valAt(cl, i)) });
    if (funnel.addToCart) out.push({ key: "tac", label: "Taxa de Adição ao Carrinho", type: "calc-pct", calc: (i) => pct(valAt(ac, i), funnel.pageView ? valAt(pv, i) : valAt(cl, i)) });
    if (funnel.lead) out.push({ key: "tld", label: "Taxa de Leads", type: "calc-pct", calc: (i) => pct(valAt(ld, i), valAt(cl, i)) });
    if (funnel.checkout && funnel.addToCart) out.push({ key: "tco", label: "Carrinho → Checkout", type: "calc-pct", calc: (i) => pct(valAt(ck, i), valAt(ac, i)) });
    if (funnel.checkout) out.push({ key: "tvd", label: "Taxa de Venda", type: "calc-pct", calc: (i) => pct(valAt(sl, i), valAt(ck, i)) });
    out.push({ key: "tcv", label: "Taxa de Conversão (Venda/Clique)", type: "calc-pct", calc: (i) => pct(valAt(sl, i), valAt(cl, i)) });
    return out;
  }, [funnel, monthly]);

  // helpers for cell rendering
  const renderInputCell = (row: RowDef, monthIdx: number) => {
    const k = row.inputKey!;
    const v = monthly[k][monthIdx] || 0;
    const isMoney = row.type === "input-money";
    return (
      <input
        type="number"
        step={isMoney ? "0.01" : "1"}
        value={v === 0 ? "" : v}
        onChange={(e) => setCell(k, monthIdx, Number(e.target.value) || 0)}
        className="w-full bg-transparent text-right text-xs px-2 py-1.5 outline-none focus:bg-white focus:ring-2 focus:ring-blue-400 rounded"
        placeholder={isMoney ? "R$ 0,00" : "0"}
      />
    );
  };

  const renderCalcCell = (row: RowDef, monthIdx: number) => {
    const v = row.calc!(monthIdx);
    let txt = "—";
    if (v !== null && isFinite(v)) {
      if (row.type === "calc-money") txt = fmtBRL(v);
      else if (row.type === "calc-pct") txt = fmtPct(v);
      else if (row.type === "calc-roas") txt = fmtRoas(v);
    }
    return <span className="text-xs">{txt}</span>;
  };

  const renderTotalCell = (row: RowDef) => {
    if (row.type === "input-money") {
      const t = sum(monthly[row.inputKey!]);
      return <span className="font-semibold text-xs">{fmtBRL(t)}</span>;
    }
    if (row.type === "input-int") {
      const t = sum(monthly[row.inputKey!]);
      return <span className="font-semibold text-xs">{fmtInt(t)}</span>;
    }
    return <span className="font-semibold text-xs">{(() => {
      const v = row.calc!(-1);
      if (v === null || !isFinite(v)) return "—";
      if (row.type === "calc-money") return fmtBRL(v);
      if (row.type === "calc-pct") return fmtPct(v);
      return fmtRoas(v);
    })()}</span>;
  };

  const renderObjectiveCell = (row: RowDef) => {
    if (row.type !== "input-money" && row.type !== "input-int") {
      return <span className="text-xs text-muted-foreground">—</span>;
    }
    const k = row.inputKey!;
    const v = objectives[k] || 0;
    const isMoney = row.type === "input-money";
    const total = sum(monthly[k]);
    const goal = v;
    let color = "";
    if (goal > 0) {
      const better = row.higherIsBetter !== false;
      const meets = better ? total >= goal : total <= goal;
      color = meets ? "text-green-600" : "text-red-600";
    }
    return (
      <input
        type="number"
        step={isMoney ? "0.01" : "1"}
        value={v === 0 ? "" : v}
        onChange={(e) => setObjective(k, Number(e.target.value) || 0)}
        className={`w-full bg-transparent text-right text-xs px-2 py-1.5 outline-none focus:bg-white focus:ring-2 focus:ring-blue-400 rounded font-semibold ${color}`}
        placeholder={isMoney ? "R$ 0,00" : "0"}
      />
    );
  };

  const monthHeaders = MONTH_LABELS.map((m) => `${m}/${String(year).slice(-4)}`);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4 justify-between">
        <div>
          <h1 className="text-2xl font-bold">Planilha teste</h1>
          <p className="text-sm text-muted-foreground">Acompanhamento mensal de tráfego pago por cliente.</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {saving && <><Loader2 className="w-3 h-3 animate-spin" /> Salvando...</>}
        </div>
      </div>

      {/* Selectors */}
      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Cliente</Label>
          <Select value={clientId} onValueChange={setClientId}>
            <SelectTrigger className="w-64"><SelectValue placeholder="Selecionar cliente" /></SelectTrigger>
            <SelectContent>
              {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Ano</Label>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Funnel toggles */}
      <div className="rounded-lg border bg-card p-4">
        <h3 className="text-sm font-semibold mb-3">Configuração do funil</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { key: "pageView", label: "Visualização de Página" },
            { key: "addToCart", label: "Adição ao Carrinho" },
            { key: "lead", label: "Lead" },
            { key: "checkout", label: "Finalização de Compra" },
          ].map((f) => (
            <div key={f.key} className="flex items-center justify-between rounded-md border px-3 py-2">
              <span className="text-sm">{f.label}</span>
              <Switch
                checked={funnel[f.key as keyof FunnelConfig]}
                onCheckedChange={(v) => setFunnel((p) => ({ ...p, [f.key]: v }))}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Table */}
      {!clientId ? (
        <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">Selecione um cliente para começar.</div>
      ) : loading ? (
        <div className="rounded-lg border bg-card p-10 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="rounded-lg border bg-white overflow-x-auto">
          <table className="w-full text-xs border-collapse min-w-[1200px]">
            <thead>
              <tr className="bg-[#1e3a5f] text-white">
                <th className="text-left px-3 py-2 font-semibold sticky left-0 bg-[#1e3a5f] z-10 min-w-[220px]">Métrica</th>
                <th className="px-3 py-2 font-semibold min-w-[110px]">OBJETIVO</th>
                {monthHeaders.map((m) => (
                  <th key={m} className="px-2 py-2 font-semibold min-w-[90px]">{m}</th>
                ))}
                <th className="px-3 py-2 font-semibold min-w-[100px] bg-[#16294a]">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isInput = row.type === "input-money" || row.type === "input-int";
                const bg = isInput ? "bg-[#E8F4FD]" : "bg-white";
                return (
                  <tr key={row.key} className={`${bg} border-b border-slate-200`}>
                    <td className={`px-3 py-1 sticky left-0 ${bg} z-[1] font-medium text-slate-700 border-r border-slate-200`}>{row.label}</td>
                    <td className="border-r border-slate-200">{renderObjectiveCell(row)}</td>
                    {Array.from({ length: 12 }).map((_, i) => (
                      <td key={i} className="text-right px-1 border-r border-slate-100">
                        {isInput ? renderInputCell(row, i) : <div className="px-2 py-1.5">{renderCalcCell(row, i)}</div>}
                      </td>
                    ))}
                    <td className="text-right px-3 py-1.5 bg-slate-50 border-l border-slate-300">{renderTotalCell(row)}</td>
                  </tr>
                );
              })}

              {/* Section header */}
              <tr className="bg-[#1e3a5f] text-white">
                <td colSpan={15} className="px-3 py-2 font-semibold sticky left-0 bg-[#1e3a5f]">TAXAS DE CONVERSÃO</td>
              </tr>
              {conversionRows.map((row) => (
                <tr key={row.key} className="bg-white border-b border-slate-200">
                  <td className="px-3 py-1.5 sticky left-0 bg-white z-[1] font-medium text-slate-700 border-r border-slate-200">{row.label}</td>
                  <td className="border-r border-slate-200 text-center text-muted-foreground">—</td>
                  {Array.from({ length: 12 }).map((_, i) => (
                    <td key={i} className="text-right px-3 py-1.5 border-r border-slate-100">{renderCalcCell(row, i)}</td>
                  ))}
                  <td className="text-right px-3 py-1.5 bg-slate-50 border-l border-slate-300 font-semibold">{renderTotalCell(row)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
