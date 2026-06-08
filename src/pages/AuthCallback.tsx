import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { checkAccess, CHECKOUT_URL, isAlwaysAllowed } from '@/lib/checkAccess';

export default function AuthCallback() {
  useEffect(() => {
    let cancelled = false;

    const finish = async () => {
      // Retry up to ~8s waiting the SDK to process the OAuth hash/code exchange.
      let session = (await supabase.auth.getSession()).data.session;
      for (let i = 0; i < 16 && !session; i++) {
        await new Promise((r) => setTimeout(r, 500));
        session = (await supabase.auth.getSession()).data.session;
        if (cancelled) return;
      }

      const email = session?.user?.email || (() => {
        try { return localStorage.getItem('user_email') || ''; } catch { return ''; }
      })();

      // Whitelist: bypass total — mesmo que a sessão demore, libera direto
      if (isAlwaysAllowed(email)) {
        if (email) { try { localStorage.setItem('user_email', email); } catch { /* ignore */ } }
        window.location.href = 'https://www.centraldogestor.site';
        return;
      }

      if (!session?.user?.email) {
        toast.error('Não foi possível concluir o login');
        window.location.href = 'https://www.centraldogestor.site';
        return;
      }

      // fail-closed: must have active subscription to enter
      const result = await checkAccess(session.user.email, { failClosed: true });
      if (cancelled) return;

      if (!result.access) {
        try { await supabase.auth.signOut(); } catch { /* ignore */ }
        toast.error('Sua assinatura não está ativa. Redirecionando para o checkout...');
        window.location.href = CHECKOUT_URL;
        return;
      }

      window.location.href = 'https://www.centraldogestor.site';
    };

    finish().catch(() => {
      if (!cancelled) window.location.href = CHECKOUT_URL;
    });

    return () => { cancelled = true; };
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-3">
        <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm text-muted-foreground">Verificando assinatura...</p>
      </div>
    </div>
  );
}
