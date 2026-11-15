import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
export default function WorkspaceWhatsAppPair() {
  const { token } = useParams(),
    [qr, setQr] = useState(""),
    [connected, setConnected] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const refresh = useRef<() => void>(() => {});
  useEffect(() => {
    if (!/^[a-f0-9]{64}$/.test(token || "")) {
      setError("Link inválido.");
      return;
    }
    let pending = false,
      finished = false,
      stopped = false,
      cancelled = false;
    const controller = new AbortController();
    const poll = async (update: boolean) => {
      if (pending || finished || stopped) return;
      pending = true;
      setBusy(true);
      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/workspace-operations?pair_whatsapp=${token}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refresh: update }),
            signal: controller.signal,
          },
        );
        const data = await response.json();
        if (!response.ok) throw Error(data.error || "Link indisponível.");
        if (cancelled) return;
        setError("");
        if (data.connected) {
          finished = true;
          setConnected(true);
          setQr("");
        } else if (data.qrcode) setQr(data.qrcode);
      } catch (e) {
        if (!cancelled) {
          stopped = true;
          setError((e as Error).message);
        }
      } finally {
        pending = false;
        if (!cancelled) setBusy(false);
      }
    };
    refresh.current = () => {
      stopped = false;
      void poll(true);
    };
    void poll(true);
    const timer = setInterval(() => void poll(false), 5000);
    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(timer);
      refresh.current = () => {};
    };
  }, [token]);
  return (
    <main className="min-h-screen bg-background text-foreground grid place-items-center p-4">
      <section className="max-w-sm w-full rounded-xl border bg-card p-6 space-y-4">
        <p className="text-sm text-muted-foreground">Central do Gestor</p>
        <h1 className="text-xl font-semibold">Conectar WhatsApp</h1>
        {connected ? (
          <p role="status">WhatsApp conectado. Você pode fechar esta página.</p>
        ) : (
          <>
            <p className="text-sm">
              No celular: WhatsApp → Aparelhos conectados → Conectar aparelho.
            </p>
            {qr && (
              <img
                alt="QR Code para conectar WhatsApp"
                src={qr}
                className="w-64 max-w-full mx-auto bg-white p-3 rounded-lg"
              />
            )}
            <p role="status" className="text-sm text-muted-foreground">
              {busy
                ? "Conferindo conexão…"
                : "A conexão será confirmada automaticamente."}
            </p>
            <Button
              disabled={busy || !/^[a-f0-9]{64}$/.test(token || "")}
              onClick={() => refresh.current()}
            >
              Atualizar QR Code
            </Button>
          </>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Este link expira em 15 minutos e permite somente conectar o número.
          Não dá acesso às conversas ou à subconta.
        </p>
      </section>
    </main>
  );
}
