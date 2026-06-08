import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { isAlwaysAllowed, setCachedAccess, clearAccessCache } from '@/lib/checkAccess';

export default function AuthCallback() {
  useEffect(() => {
    let cancelled = false;

    const finish = async () => {
      // PKCE: exchange the ?code= in the URL for a session on this origin.
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get('code');
        if (code) {
          await Promise.race([
            supabase.auth.exchangeCodeForSession(code),
            new Promise((resolve) => window.setTimeout(resolve, 6000)),
          ]);
        }
      } catch (e) {
        console.warn('exchangeCodeForSession failed', e);
      }

      // Retry getting the session for up to ~8s.
      let session = (await supabase.auth.getSession()).data.session;
      for (let i = 0; i < 16 && !session; i++) {
        await new Promise((r) => setTimeout(r, 500));
        session = (await supabase.auth.getSession()).data.session;
        if (cancelled) return;
      }

      const email =
        session?.user?.email ||
        (() => { try { return localStorage.getItem('user_email') || ''; } catch { return ''; } })();

      // Whitelist: bypass total — sem checagem de assinatura
      if (isAlwaysAllowed(email)) {
        if (email) { try { localStorage.setItem('user_email', email); } catch { /* ignore */ } }
        clearAccessCache(email);
        setCachedAccess(email, true);
        window.location.replace('/');
        return;
      }

      if (!session?.user?.email) {
        toast.error('Não foi possível concluir o login');
        window.location.replace('/');
        return;
      }

      window.location.replace('/');
    };

    finish().catch(() => {
      if (!cancelled) window.location.replace('/');
    });

    return () => { cancelled = true; };
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-3">
        <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm text-muted-foreground">Concluindo login...</p>
      </div>
    </div>
  );
}
