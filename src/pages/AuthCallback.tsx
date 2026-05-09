import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

export default function AuthCallback() {
  useEffect(() => {
    // Supabase client (with detectSessionInUrl) processes the OAuth tokens
    // from the URL hash automatically. We just wait briefly and redirect.
    let cancelled = false;

    const finish = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (cancelled) return;
      if (error) {
        toast.error(error.message || 'Erro ao concluir login');
        window.location.href = 'https://www.centraldogestor.site';
        return;
      }
      if (data.session) {
        window.location.href = 'https://www.centraldogestor.site';
      } else {
        // Give the SDK a moment to parse the hash and persist the session
        setTimeout(async () => {
          const { data: d2 } = await supabase.auth.getSession();
          if (cancelled) return;
          window.location.href = 'https://www.centraldogestor.site';
        }, 800);
      }
    };

    finish();
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
