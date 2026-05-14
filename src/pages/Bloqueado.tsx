import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { isAlwaysAllowed } from '@/lib/checkAccess';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Lock, ShieldCheck, LifeBuoy, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import logoCentralGestor from '@/assets/logo-central-gestor.png';

const REACTIVATE_URL = 'https://pay.cakto.com.br/49gdp8n_854987';
const CHECK_ACCESS_URL = 'https://backend-centraldogestor.vercel.app/api/check-access';

export default function Bloqueado() {
  const { user } = useAuth();
  const [checking, setChecking] = useState(false);

  // Whitelist: redireciona automaticamente para o app
  useEffect(() => {
    const email = user?.email || localStorage.getItem('user_email');
    if (isAlwaysAllowed(email)) {
      window.location.href = '/';
    }
  }, [user?.email]);

  const handleCheckPayment = async () => {
    const email = user?.email || localStorage.getItem('user_email');
    if (!email) {
      toast.error('Não foi possível identificar seu e-mail. Faça login novamente.');
      return;
    }
    if (isAlwaysAllowed(email)) {
      window.location.href = '/';
      return;
    }
    setChecking(true);
    try {
      const res = await fetch(`${CHECK_ACCESS_URL}?email=${encodeURIComponent(email)}`);
      const data = await res.json();
      if (data.access) {
        window.location.href = '/';
      } else {
        toast.info('Ainda não identificamos a confirmação do pagamento. Aguarde alguns instantes e tente novamente.');
      }
    } catch (err) {
      toast.error('Não foi possível verificar o pagamento agora. Tente novamente em instantes.');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-xl">
        <div className="flex justify-center mb-8">
          <img src={logoCentralGestor} alt="Central do Gestor" className="h-24 w-auto object-contain" />
        </div>

        <Card className="p-8 md:p-12 border-border/60 shadow-2xl bg-card/80 backdrop-blur">
          <div className="flex justify-center mb-6">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center ring-1 ring-primary/20">
              <Lock className="w-6 h-6 text-primary" />
            </div>
          </div>

          <div className="text-center space-y-3 mb-8">
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-foreground">
              Acesso temporariamente indisponível
            </h1>
            <p className="text-base text-muted-foreground">
              Sua assinatura não está ativa no momento
            </p>
          </div>

          <p className="text-sm md:text-base text-muted-foreground text-center leading-relaxed mb-8">
            Para continuar utilizando todas as funcionalidades da plataforma e manter
            acesso aos seus dados, é necessário renovar sua assinatura.
          </p>

          <div className="flex flex-col gap-3 mb-8">
            <Button
              size="lg"
              className="w-full h-12 text-base font-medium shadow-lg shadow-primary/20"
              onClick={() => window.open(REACTIVATE_URL, '_blank')}
            >
              Reativar acesso
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="w-full h-12 text-base"
              onClick={handleCheckPayment}
              disabled={checking}
            >
              {checking ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Verificando...
                </>
              ) : (
                'Já realizei o pagamento'
              )}
            </Button>
          </div>

          <div className="space-y-3 pt-6 border-t border-border/60">
            <div className="flex items-start gap-3 text-sm text-muted-foreground">
              <ShieldCheck className="w-4 h-4 mt-0.5 text-primary shrink-0" />
              <span>Seus dados permanecem seguros e disponíveis após a reativação.</span>
            </div>
            <div className="flex items-start gap-3 text-sm text-muted-foreground">
              <LifeBuoy className="w-4 h-4 mt-0.5 text-primary shrink-0" />
              <span>Precisa de ajuda? Entre em contato com nosso suporte.</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
