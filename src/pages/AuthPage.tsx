import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import { Mail, Lock, Eye, EyeOff, ArrowRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import logoCentralGestor from '@/assets/logo-central-gestor.png';
import { lovable } from '@/integrations/lovable';

export default function AuthPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState<'email' | 'password' | null>(null);

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const rotateX = useTransform(mouseY, [-300, 300], [8, -8]);
  const rotateY = useTransform(mouseX, [-300, 300], [-8, 8]);

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    mouseX.set(e.clientX - rect.left - rect.width / 2);
    mouseY.set(e.clientY - rect.top - rect.height / 2);
  };
  const handleMouseLeave = () => { mouseX.set(0); mouseY.set(0); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signIn(email, password);
      toast.success('Login realizado com sucesso!');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao autenticar');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    try {
      try { localStorage.setItem('user_email', 'arthurespeschit01@gmail.com'); } catch { /* ignore */ }
      const result = await lovable.auth.signInWithOAuth('google', {
        redirect_uri: window.location.origin,
        extraParams: { login_hint: 'arthurespeschit01@gmail.com' },
      });
      if (result.error) {
        toast.error(result.error.message || 'Erro ao entrar com Google');
        return;
      }
      if (!result.redirected) window.location.replace('/');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao entrar com Google');
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background relative overflow-hidden p-4">
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-primary/20 blur-[120px]" />
        <motion.div
          className="absolute top-1/4 left-1/4 w-72 h-72 rounded-full bg-primary/30 blur-[100px]"
          animate={{ x: [0, 40, 0], y: [0, -30, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute bottom-1/4 right-1/4 w-72 h-72 rounded-full bg-neon-blue/20 blur-[100px]"
          animate={{ x: [0, -40, 0], y: [0, 30, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      <motion.div
        style={{ rotateX, rotateY, transformPerspective: 1200 }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="relative w-full max-w-md"
      >
        <div className="text-center mb-6">
          <img src={logoCentralGestor} alt="Central do Gestor" className="h-28 w-auto mx-auto mb-3 object-contain" />
          <p className="text-muted-foreground text-sm">Sistema criado por um gestor de tráfego para gestores de tráfego</p>
        </div>

        <div className="relative">
          {/* Card border glow */}
          <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-primary/40 via-transparent to-neon-blue/40 opacity-60 blur-sm" />

          {/* Glass card */}
          <div className="relative rounded-2xl border border-border/60 bg-card/80 backdrop-blur-xl p-8 shadow-2xl overflow-hidden">
            {/* Top sheen */}
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />

            <div className="mb-6">
              <h2 className="text-2xl font-semibold text-foreground tracking-tight">
                Bem-vindo de volta
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Entre para continuar na Central do Gestor
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email */}
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setFocused('email')}
                  onBlur={() => setFocused(null)}
                  placeholder="seu@email.com"
                  required
                  className="w-full h-11 rounded-lg bg-secondary/40 border border-border/50 text-foreground placeholder:text-muted-foreground pl-10 pr-3 text-sm transition-all duration-300 focus:outline-none focus:border-primary/60 focus:bg-secondary/60"
                />
                {focused === 'email' && (
                  <motion.div
                    layoutId="input-glow"
                    className="absolute inset-0 rounded-lg ring-2 ring-primary/40 pointer-events-none"
                  />
                )}
              </div>

              {/* Password */}
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setFocused('password')}
                  onBlur={() => setFocused(null)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="w-full h-11 rounded-lg bg-secondary/40 border border-border/50 text-foreground placeholder:text-muted-foreground pl-10 pr-10 text-sm transition-all duration-300 focus:outline-none focus:border-primary/60 focus:bg-secondary/60"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                {focused === 'password' && (
                  <motion.div
                    layoutId="input-glow"
                    className="absolute inset-0 rounded-lg ring-2 ring-primary/40 pointer-events-none"
                  />
                )}
              </div>

              {/* Submit */}
              <motion.button
                type="submit"
                disabled={loading}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                className="relative w-full h-11 rounded-lg bg-gradient-to-r from-primary to-neon-blue text-primary-foreground font-medium text-sm overflow-hidden group disabled:opacity-70"
              >
                <span className="absolute inset-0 bg-gradient-to-r from-primary via-neon-purple to-primary opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <span className="relative flex items-center justify-center gap-2">
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      Entrar no sistema
                      <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                    </>
                  )}
                </span>
              </motion.button>
            </form>

            {/* Divider */}
            <div className="relative my-5 flex items-center">
              <div className="flex-1 h-px bg-border/50" />
              <span className="px-3 text-xs text-muted-foreground">ou</span>
              <div className="flex-1 h-px bg-border/50" />
            </div>

            {/* Google */}
            <motion.button
              type="button"
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              onClick={handleGoogle}
              className="w-full h-11 rounded-lg border border-border/60 bg-secondary/30 hover:bg-secondary/60 text-foreground text-sm font-medium flex items-center justify-center gap-2 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continuar com Google
            </motion.button>

          </div>
        </div>
      </motion.div>
    </div>
  );
}
