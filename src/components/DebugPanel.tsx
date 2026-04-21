import { useEffect, useState, useSyncExternalStore } from "react";
import { Activity, X, RotateCcw, ChevronDown, ChevronUp } from "lucide-react";
import { getDebugSnapshot, subscribeDebug, resetDebug, installFetchMonitor } from "@/lib/debugMonitor";
import { Button } from "@/components/ui/button";

// Install once at module load
installFetchMonitor();

function useDebugSnapshot() {
  return useSyncExternalStore(subscribeDebug, getDebugSnapshot, getDebugSnapshot);
}

function shortEndpoint(ep: string) {
  // Strip host, keep path; trim long table names
  const idx = ep.indexOf("/");
  const path = idx >= 0 ? ep.slice(idx) : ep;
  return path.length > 60 ? path.slice(0, 57) + "…" : path;
}

export default function DebugPanel() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"net" | "render">("net");
  const [fps, setFps] = useState(0);
  const snap = useDebugSnapshot();

  // FPS meter
  useEffect(() => {
    let frames = 0;
    let last = performance.now();
    let raf = 0;
    const loop = () => {
      frames += 1;
      const now = performance.now();
      if (now - last >= 1000) {
        setFps(Math.round((frames * 1000) / (now - last)));
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const runtimeS = Math.max(1, Math.round((Date.now() - snap.startedAt) / 1000));
  const rps = (snap.totalRequests / runtimeS).toFixed(2);

  return (
    <div className="fixed bottom-4 left-4 z-[100] font-mono text-xs">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-full bg-card border border-border shadow-lg hover:bg-accent transition-colors"
          title="Abrir painel de debug"
        >
          <Activity className="w-3.5 h-3.5 text-primary" />
          <span className="text-foreground">{snap.totalRequests} req</span>
          <span className="text-muted-foreground">· {fps} fps</span>
        </button>
      ) : (
        <div className="w-[420px] max-h-[60vh] flex flex-col rounded-lg bg-card border border-border shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/40">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              <span className="font-semibold text-foreground">Debug</span>
              <span className="text-muted-foreground">{fps} fps · {rps} req/s · {snap.totalRequests} total</span>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={resetDebug} className="p-1 hover:bg-accent rounded" title="Resetar">
                <RotateCcw className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
              <button onClick={() => setOpen(false)} className="p-1 hover:bg-accent rounded" title="Fechar">
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </div>
          </div>

          <div className="flex border-b border-border">
            <button
              onClick={() => setTab("net")}
              className={`flex-1 px-3 py-1.5 ${tab === "net" ? "bg-primary/10 text-primary font-semibold" : "text-muted-foreground hover:bg-accent"}`}
            >
              Network ({snap.endpoints.length})
            </button>
            <button
              onClick={() => setTab("render")}
              className={`flex-1 px-3 py-1.5 ${tab === "render" ? "bg-primary/10 text-primary font-semibold" : "text-muted-foreground hover:bg-accent"}`}
            >
              Renders ({snap.renders.length})
            </button>
          </div>

          <div className="overflow-y-auto flex-1">
            {tab === "net" ? (
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-muted/60 backdrop-blur">
                  <tr className="text-muted-foreground">
                    <th className="px-2 py-1 font-normal">Endpoint</th>
                    <th className="px-2 py-1 font-normal text-right">Qtd</th>
                    <th className="px-2 py-1 font-normal text-right">Méd</th>
                    <th className="px-2 py-1 font-normal text-right">Últ</th>
                    <th className="px-2 py-1 font-normal text-right">Err</th>
                  </tr>
                </thead>
                <tbody>
                  {snap.endpoints.length === 0 && (
                    <tr><td colSpan={5} className="px-2 py-4 text-center text-muted-foreground">Sem requisições ainda</td></tr>
                  )}
                  {snap.endpoints.map((e) => {
                    const avg = e.totalMs / e.count;
                    const slow = avg > 500 || e.lastMs > 1000;
                    return (
                      <tr key={e.endpoint} className={`border-t border-border/60 ${slow ? "bg-destructive/5" : ""}`}>
                        <td className="px-2 py-1 truncate max-w-[200px] text-foreground" title={e.endpoint}>{shortEndpoint(e.endpoint)}</td>
                        <td className="px-2 py-1 text-right text-foreground">{e.count}</td>
                        <td className={`px-2 py-1 text-right ${avg > 500 ? "text-destructive" : "text-foreground"}`}>{avg.toFixed(0)}ms</td>
                        <td className={`px-2 py-1 text-right ${e.lastMs > 1000 ? "text-destructive" : "text-foreground"}`}>{e.lastMs.toFixed(0)}ms</td>
                        <td className={`px-2 py-1 text-right ${e.errors > 0 ? "text-destructive font-semibold" : "text-muted-foreground"}`}>{e.errors}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-muted/60 backdrop-blur">
                  <tr className="text-muted-foreground">
                    <th className="px-2 py-1 font-normal">Componente</th>
                    <th className="px-2 py-1 font-normal text-right">Renders</th>
                    <th className="px-2 py-1 font-normal text-right">Últ</th>
                    <th className="px-2 py-1 font-normal text-right">Máx</th>
                  </tr>
                </thead>
                <tbody>
                  {snap.renders.length === 0 && (
                    <tr><td colSpan={4} className="px-2 py-4 text-center text-muted-foreground">Use useRenderTimer("Nome") em componentes para medir</td></tr>
                  )}
                  {snap.renders.map((r) => (
                    <tr key={r.name} className="border-t border-border/60">
                      <td className="px-2 py-1 text-foreground">{r.name}</td>
                      <td className="px-2 py-1 text-right text-foreground">{r.count}</td>
                      <td className={`px-2 py-1 text-right ${r.lastMs > 100 ? "text-destructive" : "text-foreground"}`}>{r.lastMs.toFixed(0)}ms</td>
                      <td className={`px-2 py-1 text-right ${r.maxMs > 250 ? "text-destructive" : "text-foreground"}`}>{r.maxMs.toFixed(0)}ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="px-3 py-1.5 border-t border-border bg-muted/30 text-[10px] text-muted-foreground">
            Vermelho = lento (req &gt;500ms média / render &gt;100ms)
          </div>
        </div>
      )}
    </div>
  );
}
