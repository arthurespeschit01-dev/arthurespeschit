import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import type { PlatformData as ExportPlatformData } from "@/lib/exportPlanilha";

type Client = { id: string; name: string };

type Platform = "facebook" | "google";

type FunnelConfig = {
  pageView: boolean;
  addToCart: boolean;
  lead: boolean;
  checkout: boolean;
};

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

type MonthlyData = Record<InputKey, number[]>;
type Objectives = Record<InputKey, number>;
type PlatformData = { funnel: FunnelConfig; monthly: MonthlyData; objectives: Objectives };

const MONTH_LABELS = [
  "jan.", "fev.", "mar.", "abr.", "mai.", "jun.",
  "jul.", "ago.", "set.", "out.", "nov.", "dez.",
];

const emptyMonthly = (): MonthlyData =>
  INPUT_KEYS.reduce((acc, k) => { acc[k] = Array(12).fill(0); return acc; }, {} as MonthlyData);
const emptyObjectives = (): Objectives =>
  INPUT_KEYS.reduce((acc, k) => { acc[k] = 0; return acc; }, {} as Objectives);
const defaultFunnel = (): FunnelConfig => ({ pageView: true, addToCart: true, lead: true, checkout: true });
const emptyPlatform = (): PlatformData => ({ funnel: defaultFunnel(), monthly: emptyMonthly(), objectives: emptyObjectives() });

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtInt = (v: number) => Math.round(v).toLocaleString("pt-BR");
const fmtPct = (v: number | null) => v === null || !isFinite(v) ? "—" : `${v.toFixed(2)}%`;
const fmtRoas = (v: number | null) => v === null || !isFinite(v) ? "—" : v.toFixed(2);
const safeDiv = (a: number, b: number): number | null => !b || !isFinite(b) ? null : a / b;
const sum = (arr: number[]) => arr.reduce((a, b) => a + (Number(b) || 0), 0);
const addArr = (a: number[], b: number[]) => a.map((v, i) => (v || 0) + (b[i] || 0));

const YEARS = Array.from({ length: 7 }, (_, i) => 2023 + i);

type RowDef = {
  key: string;
  label: string;
  type: "input-money" | "input-int" | "calc-money" | "calc-pct" | "calc-roas";
  inputKey?: InputKey;
  calc?: (monthIdx: number) => number | null;
  higherIsBetter?: boolean;
};

export default function PlanilhaTeste() {
  const { user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState<string>("");
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [tab, setTab] = useState<"facebook" | "google" | "geral">("facebook");

  const [facebook, setFacebook] = useState<PlatformData>(emptyPlatform());
  const [google, setGoogle] = useState<PlatformData>(emptyPlatform());

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recordId, setRecordId] = useState<string | null>(null);

  // Load clients
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data, error } = await supabase.from("clients").select("id, name").eq("status", "Ativo").order("name");
      if (error) { toast.error("Erro ao carregar clientes"); return; }
      setClients(data || []);
      if (data && data.length && !clientId) setClientId(data[0].id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Helpers to normalize loaded JSON
  const normalizePlatform = (raw: any): PlatformData => {
    const funnel = { ...defaultFunnel(), ...(raw?.funnel || {}) };
    const md = raw?.monthly || {};
    const filled = emptyMonthly();
    INPUT_KEYS.forEach((k) => {
      if (Array.isArray(md[k]) && md[k].length === 12) filled[k] = md[k].map((n: any) => Number(n) || 0);
    });
    const obj = raw?.objectives || {};
    const filledObj = emptyObjectives();
    INPUT_KEYS.forEach((k) => { filledObj[k] = Number(obj[k]) || 0; });
    return { funnel, monthly: filled, objectives: filledObj };
  };

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
      if (error && error.code !== "PGRST116") toast.error("Erro ao carregar planilha");

      if (data) {
        setRecordId(data.id);
        const md: any = data.monthly_data || {};
        const fc: any = data.funnel_config || {};
        const obj: any = data.objectives || {};

        // New format: monthly_data has { facebook: {...}, google: {...} }
        if (md.facebook || md.google) {
          setFacebook(normalizePlatform({
            funnel: fc.facebook || defaultFunnel(),
            monthly: md.facebook || emptyMonthly(),
            objectives: obj.facebook || emptyObjectives(),
          }));
          setGoogle(normalizePlatform({
            funnel: fc.google || defaultFunnel(),
            monthly: md.google || emptyMonthly(),
            objectives: obj.google || emptyObjectives(),
          }));
        } else {
          // Legacy: flat structure → migrate to facebook tab
          setFacebook(normalizePlatform({ funnel: fc, monthly: md, objectives: obj }));
          setGoogle(emptyPlatform());
        }
      } else {
        setRecordId(null);
        setFacebook(emptyPlatform());
        setGoogle(emptyPlatform());
      }
      setLoading(false);
    })();
  }, [user, clientId, year]);

  // Auto-save
  const persist = useCallback(async () => {
    if (!user || !clientId) return;
    setSaving(true);
    const payload = {
      user_id: user.id,
      client_id: clientId,
      year,
      funnel_config: { facebook: facebook.funnel, google: google.funnel } as any,
      monthly_data: { facebook: facebook.monthly, google: google.monthly } as any,
      objectives: { facebook: facebook.objectives, google: google.objectives } as any,
    };
    const { data, error } = await supabase
      .from("traffic_records")
      .upsert(payload, { onConflict: "user_id,client_id,year" })
      .select("id")
      .single();
    if (error) toast.error("Erro ao salvar");
    else if (data) setRecordId(data.id);
    setSaving(false);
  }, [user, clientId, year, facebook, google]);

  useEffect(() => {
    if (!user || !clientId || loading) return;
    const t = setTimeout(() => { void persist(); }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facebook, google]);

  // Combined "Geral" data (read-only)
  const geral = useMemo<PlatformData>(() => {
    const monthly = INPUT_KEYS.reduce((acc, k) => {
      acc[k] = addArr(facebook.monthly[k], google.monthly[k]);
      return acc;
    }, {} as MonthlyData);
    const funnel: FunnelConfig = {
      pageView: facebook.funnel.pageView || google.funnel.pageView,
      addToCart: facebook.funnel.addToCart || google.funnel.addToCart,
      lead: facebook.funnel.lead || google.funnel.lead,
      checkout: facebook.funnel.checkout || google.funnel.checkout,
    };
    const objectives = INPUT_KEYS.reduce((acc, k) => {
      acc[k] = (facebook.objectives[k] || 0) + (google.objectives[k] || 0);
      return acc;
    }, {} as Objectives);
    return { funnel, monthly, objectives };
  }, [facebook, google]);

  const monthHeaders = MONTH_LABELS.map((m) => `${m}/${String(year).slice(-2)}`);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4 justify-between">
        <div>
          <h1 className="text-2xl font-bold">Planilha de acompanhamento</h1>
          <p className="text-sm text-muted-foreground">Acompanhamento mensal de tráfego pago por cliente e plataforma.</p>
        </div>
        <div className="flex items-center gap-3">
          {saving && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" /> Salvando...
            </span>
          )}
          <DownloadMenu
            disabled={!clientId || loading}
            clientName={clients.find((c) => c.id === clientId)?.name || "cliente"}
            year={year}
            facebook={facebook as unknown as ExportPlatformData}
            google={google as unknown as ExportPlatformData}
            geral={geral as unknown as ExportPlatformData}
            currentTab={tab}
          />
        </div>
      </div>

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

      {!clientId ? (
        <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">Selecione um cliente para começar.</div>
      ) : loading ? (
        <div className="rounded-lg border bg-card p-10 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="w-full">
          <TabsList>
            <TabsTrigger value="facebook">Facebook Ads</TabsTrigger>
            <TabsTrigger value="google">Google Ads</TabsTrigger>
            <TabsTrigger value="geral">Geral</TabsTrigger>
          </TabsList>

          <TabsContent value="facebook" className="space-y-4">
            <PlatformSheet
              data={facebook}
              setData={setFacebook}
              monthHeaders={monthHeaders}
              readOnly={false}
              title="Facebook Ads"
            />
          </TabsContent>
          <TabsContent value="google" className="space-y-4">
            <PlatformSheet
              data={google}
              setData={setGoogle}
              monthHeaders={monthHeaders}
              readOnly={false}
              title="Google Ads"
            />
          </TabsContent>
          <TabsContent value="geral" className="space-y-4">
            <PlatformSheet
              data={geral}
              setData={() => {}}
              monthHeaders={monthHeaders}
              readOnly
              title="Geral (Facebook + Google)"
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

// =================== Sub-component: one platform sheet ===================
function PlatformSheet({
  data,
  setData,
  monthHeaders,
  readOnly,
  title,
}: {
  data: PlatformData;
  setData: (updater: (prev: PlatformData) => PlatformData) => void;
  monthHeaders: string[];
  readOnly: boolean;
  title: string;
}) {
  const { funnel, monthly, objectives } = data;

  const setCell = (key: InputKey, monthIdx: number, value: number) => {
    setData((prev) => {
      const copy: PlatformData = { ...prev, monthly: { ...prev.monthly, [key]: [...prev.monthly[key]] } };
      copy.monthly[key][monthIdx] = value;
      return copy;
    });
  };
  const setObjective = (key: InputKey, value: number) => {
    setData((prev) => ({ ...prev, objectives: { ...prev.objectives, [key]: value } }));
  };
  const setFunnel = (key: keyof FunnelConfig, v: boolean) => {
    setData((prev) => ({ ...prev, funnel: { ...prev.funnel, [key]: v } }));
  };

  const valAt = (arr: number[], i: number) => (i === -1 ? sum(arr) : arr[i] || 0);

  const rows: RowDef[] = useMemo(() => {
    const inv = monthly.investment, cl = monthly.clicks, im = monthly.impressions;
    const pv = monthly.pageViews, ac = monthly.addToCart, ld = monthly.leads;
    const ck = monthly.checkout, sl = monthly.sales, sv = monthly.salesValue;
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
    const cl = monthly.clicks, im = monthly.impressions, pv = monthly.pageViews;
    const ac = monthly.addToCart, ld = monthly.leads, ck = monthly.checkout, sl = monthly.sales;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [funnel, monthly]);

  const parseNum = (s: string): number => {
    if (!s) return 0;
    const n = Number(String(s).replace(",", "."));
    return isFinite(n) ? n : 0;
  };

  const renderInputCell = (row: RowDef, monthIdx: number) => {
    const k = row.inputKey!;
    const v = monthly[k][monthIdx] || 0;
    const isMoney = row.type === "input-money";
    if (readOnly) {
      return <span className="text-xs">{isMoney ? fmtBRL(v) : fmtInt(v)}</span>;
    }
    return (
      <input
        type="text"
        inputMode="decimal"
        value={v === 0 ? "" : String(v)}
        onChange={(e) => setCell(k, monthIdx, parseNum(e.target.value))}
        className="w-full bg-transparent text-right text-xs px-2 py-1.5 outline-none focus:bg-background focus:ring-2 focus:ring-primary rounded"
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
    if (row.type === "input-money") return <span className="font-semibold text-xs">{fmtBRL(sum(monthly[row.inputKey!]))}</span>;
    if (row.type === "input-int") return <span className="font-semibold text-xs">{fmtInt(sum(monthly[row.inputKey!]))}</span>;
    return <span className="font-semibold text-xs">{(() => {
      const v = row.calc!(-1);
      if (v === null || !isFinite(v)) return "—";
      if (row.type === "calc-money") return fmtBRL(v);
      if (row.type === "calc-pct") return fmtPct(v);
      return fmtRoas(v);
    })()}</span>;
  };

  const renderObjectiveCell = (row: RowDef) => {
    // Objetivo só existe na linha de "Investimento em mídia"
    if (row.key !== "investment") {
      return <span className="text-xs text-muted-foreground">—</span>;
    }
    const v = objectives.investment || 0;
    if (readOnly) {
      return <span className="text-xs font-semibold">{v === 0 ? "—" : fmtBRL(v)}</span>;
    }
    return (
      <input
        type="text"
        inputMode="decimal"
        value={v === 0 ? "" : String(v)}
        onChange={(e) => setObjective("investment", parseNum(e.target.value))}
        className="w-full bg-transparent text-right text-xs px-2 py-1.5 outline-none focus:bg-background focus:ring-2 focus:ring-primary rounded font-semibold"
        placeholder="R$ 0,00"
      />
    );
  };

  return (
    <>
      <div className="rounded-lg border bg-card p-4">
        <h3 className="text-sm font-semibold mb-3">
          Configuração do funil — {title}
          {readOnly && <span className="ml-2 text-xs font-normal text-muted-foreground">(automático: ativo se ativo em qualquer plataforma)</span>}
        </h3>
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
                onCheckedChange={(v) => setFunnel(f.key as keyof FunnelConfig, v)}
                disabled={readOnly}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-xs border-collapse min-w-[1200px]">
          <thead>
            <tr className="bg-primary text-primary-foreground">
              <th className="text-left px-3 py-2 font-semibold sticky left-0 bg-primary z-20 min-w-[220px]">Métrica</th>
              <th className="px-3 py-2 font-semibold sticky left-[220px] bg-primary z-20 min-w-[120px] border-l border-primary-foreground/20">OBJETIVO</th>
              {monthHeaders.map((m) => (
                <th key={m} className="px-2 py-2 font-semibold min-w-[90px]">{m}</th>
              ))}
              <th className="px-3 py-2 font-semibold min-w-[100px] bg-primary/90">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const isInput = row.type === "input-money" || row.type === "input-int";
              // Zebra sutil: linhas pares vs ímpares
              const rowBg = idx % 2 === 0 ? "bg-card" : "bg-muted/30";
              const stickyBg = idx % 2 === 0 ? "bg-card" : "bg-[hsl(var(--muted))]";
              return (
                <tr key={row.key} className={`${rowBg} border-b border-border/50 hover:bg-accent/5 transition-colors`}>
                  <td className={`px-3 py-1 sticky left-0 ${stickyBg} z-10 font-medium text-foreground border-r border-border min-w-[220px]`}>{row.label}</td>
                  <td className={`sticky left-[220px] ${stickyBg} z-10 border-r border-border min-w-[120px]`}>{renderObjectiveCell(row)}</td>
                  {Array.from({ length: 12 }).map((_, i) => (
                    <td key={i} className="text-right px-1 border-r border-border/40 text-foreground">
                      {isInput ? renderInputCell(row, i) : <div className="px-2 py-1.5">{renderCalcCell(row, i)}</div>}
                    </td>
                  ))}
                  <td className={`text-right px-3 py-1.5 border-l border-border ${stickyBg} font-semibold text-foreground`}>{renderTotalCell(row)}</td>
                </tr>
              );
            })}

            {/* Separador de seção */}
            <tr className="bg-primary/15 border-y border-primary/30">
              <td colSpan={15} className="px-0 py-0">
                <div className="sticky left-0 px-3 py-2 inline-block text-xs font-semibold uppercase tracking-wide text-primary">
                  Taxas de conversão
                </div>
              </td>
            </tr>
            {conversionRows.map((row, idx) => {
              const rowBg = idx % 2 === 0 ? "bg-card" : "bg-muted/30";
              const stickyBg = idx % 2 === 0 ? "bg-card" : "bg-[hsl(var(--muted))]";
              return (
                <tr key={row.key} className={`${rowBg} border-b border-border/50 hover:bg-accent/5 transition-colors`}>
                  <td className={`px-3 py-1.5 sticky left-0 ${stickyBg} z-10 font-medium text-foreground border-r border-border min-w-[220px]`}>{row.label}</td>
                  <td className={`sticky left-[220px] ${stickyBg} z-10 border-r border-border text-center text-muted-foreground min-w-[120px]`}>—</td>
                  {Array.from({ length: 12 }).map((_, i) => (
                    <td key={i} className="text-right px-3 py-1.5 border-r border-border/40 text-foreground">{renderCalcCell(row, i)}</td>
                  ))}
                  <td className={`text-right px-3 py-1.5 border-l border-border ${stickyBg} font-semibold text-foreground`}>{renderTotalCell(row)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// =================== Download menu ===================
function DownloadMenu({
  disabled, clientName, year, facebook, google, geral, currentTab,
}: {
  disabled: boolean;
  clientName: string;
  year: number;
  facebook: ExportPlatformData;
  google: ExportPlatformData;
  geral: ExportPlatformData;
  currentTab: "facebook" | "google" | "geral";
}) {
  const slug = clientName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "cliente";

  const platforms: { key: "facebook" | "google" | "geral"; label: string; data: ExportPlatformData }[] = [
    { key: "facebook", label: "Facebook Ads", data: facebook },
    { key: "google", label: "Google Ads", data: google },
    { key: "geral", label: "Geral", data: geral },
  ];

  const handle = async (format: "csv" | "xlsx" | "pdf", p: { key: string; label: string; data: ExportPlatformData }) => {
    const filename = `planilha-${slug}-${p.key}-${year}`;
    const title = `Planilha ${p.label} — ${clientName} — ${year}`;
    try {
      const mod = await import("@/lib/exportPlanilha");
      if (format === "csv") mod.exportCSV(p.data, year, filename);
      else if (format === "xlsx") mod.exportXLSX(p.data, year, filename, p.label);
      else mod.exportPDF(p.data, year, filename, title);
      toast.success(`Exportado: ${p.label} (${format.toUpperCase()})`);
    } catch (e) {
      console.error(e);
      toast.error("Erro ao exportar");
    }
  };

  const current = platforms.find((p) => p.key === currentTab)!;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <Download className="w-4 h-4 mr-1" /> Baixar
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Aba atual: {current.label}</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => handle("csv", current)}>Baixar CSV</DropdownMenuItem>
        <DropdownMenuItem onClick={() => handle("xlsx", current)}>Baixar XLSX</DropdownMenuItem>
        <DropdownMenuItem onClick={() => handle("pdf", current)}>Baixar PDF</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Outras abas</DropdownMenuLabel>
        {platforms.filter((p) => p.key !== currentTab).flatMap((p) => [
          <DropdownMenuItem key={`${p.key}-csv`} onClick={() => handle("csv", p)}>{p.label} — CSV</DropdownMenuItem>,
          <DropdownMenuItem key={`${p.key}-xlsx`} onClick={() => handle("xlsx", p)}>{p.label} — XLSX</DropdownMenuItem>,
          <DropdownMenuItem key={`${p.key}-pdf`} onClick={() => handle("pdf", p)}>{p.label} — PDF</DropdownMenuItem>,
        ])}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
