import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
export default function AccountNameSettings() {
  const { user } = useAuth();
  const initial = String(
    user?.user_metadata?.full_name || user?.user_metadata?.name || "",
  );
  const [name, setName] = useState(initial),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => setName(initial), [initial]);
  return (
    <form
      className="rounded-xl border bg-card p-5 space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setMessage("");
        try {
          const clean = name.trim();
          if (!clean || clean.includes("@"))
            throw Error("Informe seu nome, sem usar um endereço de e-mail.");
          const { error } = await supabase.auth.updateUser({
            data: { full_name: clean },
          });
          if (error) throw error;
          setMessage("Nome atualizado. Ele será exibido no campo Responsável.");
        } catch (e) {
          setMessage(
            e instanceof Error
              ? e.message
              : "Não foi possível salvar seu nome.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="text-lg font-semibold">Seu perfil</h2>
      <Label htmlFor="account-full-name">Nome</Label>
      <Input
        id="account-full-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        maxLength={120}
        autoComplete="name"
        placeholder="Seu nome"
      />
      <p className="text-xs text-muted-foreground">
        Nome exibido como responsável nas tarefas.
      </p>
      <Button disabled={busy}>{busy ? "Salvando…" : "Salvar nome"}</Button>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </form>
  );
}
