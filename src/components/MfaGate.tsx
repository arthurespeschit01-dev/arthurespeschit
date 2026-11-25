// Verificação em duas etapas (2FA) obrigatória para todos os acessos, inclusive subcontas.
// Sem fator cadastrado: a pessoa configura o app autenticador. Com fator: pede o código de 6 dígitos.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, ShieldCheck } from 'lucide-react';

type Estado =
  | { fase: 'verificando' }
  | { fase: 'ok' }
  | { fase: 'desafio'; factorId: string }
  | { fase: 'cadastro'; factorId: string; qr: string; segredo: string }
  | { fase: 'erro'; mensagem: string };

const LIVRES = [/^\/auth\/callback/];

export default function MfaGate({ children }: { children: ReactNode }) {
  const { user, session, signOut } = useAuth();
  const location = useLocation();
  const [estado, setEstado] = useState<Estado>({ fase: 'verificando' });
  const [codigo, setCodigo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  const avaliar = useCallback(async () => {
    setErro('');
    const { data: nivel, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error) { setEstado({ fase: 'erro', mensagem: 'Não foi possível verificar a segurança da conta.' }); return; }
    if (nivel.currentLevel === 'aal2') { setEstado({ fase: 'ok' }); return; }
    const { data: fatores, error: e2 } = await supabase.auth.mfa.listFactors();
    if (e2) { setEstado({ fase: 'erro', mensagem: 'Não foi possível carregar a verificação em duas etapas.' }); return; }
    const verificado = fatores.totp.find((f) => f.status === 'verified');
    if (verificado) { setEstado({ fase: 'desafio', factorId: verificado.id }); return; }
    // limpa cadastros abandonados antes de começar um novo
    for (const f of fatores.all.filter((f) => f.status === 'unverified')) await supabase.auth.mfa.unenroll({ factorId: f.id });
    const { data: novo, error: e3 } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Autenticador ${new Date().toISOString().slice(0, 10)}` });
    if (e3 || !novo) { setEstado({ fase: 'erro', mensagem: 'Não foi possível iniciar a configuração do autenticador.' }); return; }
    setEstado({ fase: 'cadastro', factorId: novo.id, qr: novo.totp.qr_code, segredo: novo.totp.secret });
  }, []);

  const livre = LIVRES.some((r) => r.test(location.pathname));
  useEffect(() => {
    if (!user || livre) return;
    setEstado({ fase: 'verificando' });
    void avaliar();
  }, [user?.id, session?.access_token ? 1 : 0, livre, avaliar]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user || livre || estado.fase === 'ok') return <>{children}</>;

  const confirmar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (estado.fase !== 'desafio' && estado.fase !== 'cadastro') return;
    const limpo = codigo.replace(/\D/g, '');
    if (limpo.length !== 6) { setErro('Digite os 6 números do aplicativo.'); return; }
    setEnviando(true); setErro('');
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: estado.factorId, code: limpo });
    setEnviando(false);
    if (error) { setErro('Código inválido ou expirado. Confira o horário do celular e tente de novo.'); setCodigo(''); return; }
    setCodigo('');
    await avaliar();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 space-y-4 shadow-xl">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-semibold text-foreground">Verificação em duas etapas</h1>
        </div>

        {estado.fase === 'verificando' && (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        )}

        {estado.fase === 'erro' && (
          <>
            <p role="alert" className="text-sm text-destructive">{estado.mensagem}</p>
            <Button className="w-full" onClick={() => void avaliar()}>Tentar novamente</Button>
          </>
        )}

        {estado.fase === 'cadastro' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Para proteger sua conta, configure um app autenticador (Google Authenticator, Microsoft Authenticator ou Authy). Abra o app, escaneie o QR code e digite o código de 6 números.
            </p>
            <div className="flex justify-center rounded-lg bg-white p-3">
              <img src={estado.qr} alt="QR code para o app autenticador" className="w-44 h-44" />
            </div>
            <p className="text-xs text-muted-foreground break-all">
              Não consegue escanear? Digite esta chave no app: <code className="text-foreground">{estado.segredo}</code>
            </p>
          </div>
        )}

        {estado.fase === 'desafio' && (
          <p className="text-sm text-muted-foreground">Abra seu app autenticador e digite o código de 6 números da Central do Gestor.</p>
        )}

        {(estado.fase === 'cadastro' || estado.fase === 'desafio') && (
          <form onSubmit={confirmar} className="space-y-3">
            <Input
              autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={7}
              placeholder="000000" value={codigo} onChange={(e) => setCodigo(e.target.value)}
              className="text-center text-lg tracking-[0.4em]" aria-label="Código de 6 números"
            />
            {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
            <Button type="submit" className="w-full" disabled={enviando}>
              {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : estado.fase === 'cadastro' ? 'Ativar e entrar' : 'Verificar e entrar'}
            </Button>
          </form>
        )}

        <button className="w-full text-center text-xs text-muted-foreground underline" onClick={() => void signOut()}>
          Sair e entrar com outra conta
        </button>
      </div>
    </div>
  );
}
