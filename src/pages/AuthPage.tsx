import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import { Mail, Lock, Eye, EyeOff, ArrowRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import logoCentralGestor from '@/assets/logo-central-gestor.png';

export default function AuthPage() {
  const { signIn,signUp } = useAuth();
  const [mode,setMode]=useState<'login'|'signup'>('login');
  const [confirmPassword,setConfirmPassword]=useState('');
  const [confirmationSent,setConfirmationSent]=useState(false);
  const [error,setError]=useState('');
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

  const changeMode=()=>{if(loading)return;setMode(m=>m==='login'?'signup':'login');setPassword('');setConfirmPassword('');setError('');setConfirmationSent(false)};
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();if(loading)return;setError('');
    if(mode==='signup'&&password!==confirmPassword){setError('As senhas precisam ser iguais.');return;}
    setLoading(true);
    try {
      if(mode==='signup'){
        const result=await signUp(email,password);
        if(result.requiresConfirmation){setConfirmationSent(true);setPassword('');setConfirmPassword('')}
        else toast.success('Conta criada. Sua Central está pronta para começar!');
      }else {await signIn(email, password);toast.success('Login realizado com sucesso!')}
    } catch (err: unknown) {
      const message=err instanceof Error?err.message:'Não foi possível acessar sua conta. Tente novamente.';
      setError(/invalid login credentials/i.test(message)?'E-mail ou senha incorretos.':/email not confirmed/i.test(message)?'Confirme seu e-mail antes de entrar.':/rate limit/i.test(message)?'Muitas tentativas. Aguarde um pouco antes de tentar novamente.':message);
    } finally {setLoading(false)}
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
                {confirmationSent?'Confira seu e-mail':mode==='signup'?'Crie sua conta':'Bem-vindo de volta'}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {confirmationSent?'Se o cadastro puder ser concluído, você receberá um link de confirmação.':mode==='signup'?'Sua agência começa do zero, com seus próprios clientes e tarefas.':'Entre para continuar na Central do Gestor'}
              </p>
            </div>

            {confirmationSent?<div className="space-y-4"><p className="text-sm break-all font-medium">{email.trim()}</p><p className="text-sm text-muted-foreground">Confirme o endereço pelo link recebido. Depois, entre com seu e-mail e senha. Se já tiver uma conta, use a opção de entrar.</p><button type="button" className="w-full min-h-11 rounded-lg bg-primary text-primary-foreground text-sm font-medium" onClick={()=>{setMode('login');setConfirmationSent(false);setError('')}}>Voltar para entrar</button></div>:<form onSubmit={handleSubmit} className="space-y-4">
              {/* Email */}
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  aria-label="E-mail" autoComplete="email" disabled={loading}
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
                  aria-label="Senha" autoComplete={mode==='signup'?'new-password':'current-password'} disabled={loading}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setFocused('password')}
                  onBlur={() => setFocused(null)}
                  placeholder="••••••••"
                  required
                  minLength={mode==='signup'?8:undefined}
                  className="w-full h-11 rounded-lg bg-secondary/40 border border-border/50 text-foreground placeholder:text-muted-foreground pl-10 pr-10 text-sm transition-all duration-300 focus:outline-none focus:border-primary/60 focus:bg-secondary/60"
                />
                <button
                  type="button"
                  aria-label={showPassword?'Ocultar senha':'Mostrar senha'}
                  disabled={loading} onClick={() => setShowPassword(!showPassword)}
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

              {mode==='signup'&&<div className="space-y-2"><p className="text-xs text-muted-foreground">Use pelo menos 8 caracteres na senha.</p><label className="sr-only" htmlFor="signup-confirm">Confirmar senha</label><input id="signup-confirm" type={showPassword?'text':'password'} autoComplete="new-password" placeholder="Confirme sua senha" required minLength={8} disabled={loading} value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} className="w-full h-11 rounded-lg bg-secondary/40 border border-border/50 text-foreground placeholder:text-muted-foreground px-3 text-sm"/></div>}
              {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
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
                      {mode==='signup'?'Criar minha conta':'Entrar no sistema'}
                      <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                    </>
                  )}
                </span>
              </motion.button>
            </form>}

            {!confirmationSent&&<div className="mt-5 text-center text-sm text-muted-foreground"><span>{mode==='login'?'Ainda não tem uma conta?':'Já tem uma conta?'}</span><button type="button" disabled={loading} onClick={changeMode} className="ml-1 min-h-11 text-primary font-medium hover:underline">{mode==='login'?'Criar conta':'Entrar'}</button></div>}

          </div>
        </div>
      </motion.div>
    </div>
  );
}
