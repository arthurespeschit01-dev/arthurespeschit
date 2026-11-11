import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { whatsappRequest } from "@/lib/whatsapp";

interface Status {
  configured: boolean;
  connected: boolean;
  phone?: string;
  instance_id?: string;
  receiving_enabled?: boolean;
}
export default function AgencyWhatsApp() {
  const [status, setStatus] = useState<Status | null>(null);
  const [qr, setQr] = useState("");
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [form, setForm] = useState({
    instance_id: "",
    token: "",
    dedicated: false,
  });
  const refresh = useCallback(async () => {
    try {
      const data = await whatsappRequest<Status>("status");
      setStatus(data);
      setError("");
      if (data.connected) setQr("");
      return data;
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (!open || !qr) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) void refresh();
    }, 4000);
    return () => window.clearInterval(timer);
  }, [open, qr, refresh]);
  const connect = async () => {
    setOpen(true);
    setBusy(true);
    setError("");
    try {
      const current = await refresh();
      if (!current) return;
      if (!current.configured) {
        setSettings(true);
        return;
      }
      setSettings(false);
      if (!current.connected || !current.receiving_enabled) {
        const data = await whatsappRequest<{ qrcode: string }>("connect");
        setQr(data.qrcode);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const configure = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await whatsappRequest("configure", form);
      setForm({ instance_id: "", token: "", dedicated: false });
      setSettings(false);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const disconnect = async () => {
    setBusy(true);
    setError("");
    try {
      await whatsappRequest("disconnect");
      setQr("");
      setConfirmDisconnect(false);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className="rounded-xl border bg-card p-4 space-y-3"
      aria-labelledby="whatsapp-settings-title"
    >
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h2 id="whatsapp-settings-title" className="font-semibold">
            Conexão WhatsApp
          </h2>
          <p className="text-sm text-muted-foreground">
            {status?.connected
              ? `Conectado${status.phone ? ` · ${status.phone}` : ""}`
              : "Escolha o número lendo o QR Code com o WhatsApp desejado."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => void connect()} disabled={busy}>
            {status?.connected ? "Gerenciar WhatsApp" : "Conectar WhatsApp"}
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => { setOpen(true); setSettings(true); setForm({ instance_id: status?.instance_id || '', token: '', dedicated: false }); }}>Configurar instância e token</Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void refresh()}
          >
            Atualizar conexão
          </Button>
        </div>
      </div>
      {error && !open && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) {
            setOpen(value);
            if (!value) {
              setQr("");
              setSettings(false);
              setForm({ instance_id: "", token: "", dedicated: false });
            }
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Conectar WhatsApp</DialogTitle>
            <DialogDescription>
              Use o celular do número que deseja atender na Central. Você poderá
              trocar o número desconectando e lendo um novo QR Code.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {status?.connected && !settings && (
            <div className="space-y-3">
              <p>
                WhatsApp conectado{status.phone ? `: ${status.phone}` : ""}.
              </p>
              <p className="text-sm text-muted-foreground">
                Abra um card com telefone no CRM para conversar.
              </p>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setConfirmDisconnect(true)}
              >
                Trocar número ou desconectar
              </Button>
            </div>
          )}
          {qr && !status?.connected && !settings && (
            <div className="space-y-3">
              <img
                src={qr}
                alt="QR Code para conectar seu WhatsApp à Central"
                className="w-64 h-64 mx-auto bg-white p-3 rounded-lg"
              />
              <p className="text-sm">
                No WhatsApp do número escolhido, abra Dispositivos conectados →
                Conectar dispositivo e leia o código.
              </p>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void connect()}
              >
                Atualizar QR Code
              </Button>
            </div>
          )}
          {status?.configured && !status.connected && !qr && !settings && (
            <Button disabled={busy} onClick={() => void connect()}>
              Gerar QR Code
            </Button>
          )}
          {(settings || !status?.configured) && (
            <form className="space-y-3" onSubmit={configure}>
              <h3 className="font-medium">Configuração inicial da conexão</h3>
              <p className="text-sm text-muted-foreground">
                A agência configura uma instância W-API dedicada à Central uma
                vez. Depois, qualquer número pode ser conectado pelo QR Code. O
                token fica somente no servidor.
              </p>
              <Label htmlFor="whatsapp-instance">ID da instância</Label>
              <Input
                id="whatsapp-instance"
                required
                value={form.instance_id}
                onChange={(e) =>
                  setForm({ ...form, instance_id: e.target.value })
                }
                maxLength={160}
              />
              <Label htmlFor="whatsapp-token">Token da instância</Label>
              <Input
                id="whatsapp-token"
                required={!status?.configured}
                type="password"
                autoComplete="off"
                value={form.token}
                onChange={(e) => setForm({ ...form, token: e.target.value })}
                maxLength={4000}
              />
              <label className="flex items-start gap-2 text-sm">
                <input
                  required
                  type="checkbox"
                  checked={form.dedicated}
                  onChange={(e) =>
                    setForm({ ...form, dedicated: e.target.checked })
                  }
                />
                Esta instância é dedicada à Central. Conectar direciona o
                recebimento dela para este CRM.
              </label>
              <Button type="submit" disabled={busy}>
                Salvar configuração
              </Button>
            </form>
          )}
          {status?.configured && !settings && (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setSettings(true);
                setForm({
                  instance_id: status.instance_id || "",
                  token: "",
                  dedicated: false,
                });
              }}
            >
              Configurar conexão
            </Button>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={confirmDisconnect} onOpenChange={setConfirmDisconnect}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Desconectar este número?</DialogTitle>
            <DialogDescription>
              O histórico será preservado. Para usar este ou outro número, será
              necessário ler um novo QR Code.
            </DialogDescription>
          </DialogHeader>
          <Button disabled={busy} onClick={() => void disconnect()}>
            Desconectar WhatsApp
          </Button>
        </DialogContent>
      </Dialog>
    </section>
  );
}
