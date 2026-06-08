import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { checkAccess, CHECKOUT_URL, isAlwaysAllowed, clearAccessCache, setCachedAccess } from '@/lib/checkAccess';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function gateSession(session: Session | null): Promise<Session | null> {
  // Returns session only if access is allowed. Otherwise signs out and redirects.
  if (!session?.user?.email) return session;
  const email = session.user.email;
  try { localStorage.setItem('user_email', email); } catch { /* ignore */ }
  // Whitelist: bypass total — limpa cache antigo e libera
  if (isAlwaysAllowed(email)) {
    clearAccessCache(email);
    setCachedAccess(email, true);
    return session;
  }
  // fail-closed at login/initial session load
  const result = await checkAccess(email, { failClosed: true });
  if (!result.access) {
    try { await supabase.auth.signOut(); } catch { /* ignore */ }
    if (typeof window !== 'undefined' && window.location.pathname !== '/bloqueado') {
      window.location.href = CHECKOUT_URL;
    }
    return null;
  }
  return session;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (event === 'SIGNED_OUT' || !newSession) {
        if (cancelled) return;
        setSession(null);
        setUser(null);
        setLoading(false);
        return;
      }

      if (isAlwaysAllowed(newSession.user.email)) {
        const email = newSession.user.email!;
        try { localStorage.setItem('user_email', email); } catch { /* ignore */ }
        clearAccessCache(email);
        setCachedAccess(email, true);
        if (cancelled) return;
        setSession(newSession);
        setUser(newSession.user);
        setLoading(false);
        return;
      }

      // For SIGNED_IN (login moments) gate with fail-closed; for TOKEN_REFRESHED/USER_UPDATED, trust the cache.
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        const gated = await gateSession(newSession);
        if (cancelled) return;
        setSession(gated);
        setUser(gated?.user ?? null);
        setLoading(false);
      } else {
        if (cancelled) return;
        setSession(newSession);
        setUser(newSession.user);
        setLoading(false);
      }
    });

    supabase.auth.getSession().then(async ({ data: { session: initial } }) => {
      const gated = await gateSession(initial);
      if (cancelled) return;
      setSession(gated);
      setUser(gated?.user ?? null);
      setLoading(false);
    });

    return () => { cancelled = true; subscription.unsubscribe(); };
  }, []);

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    // Whitelist: bypass total
    if (isAlwaysAllowed(email)) {
      clearAccessCache(email);
      setCachedAccess(email, true);
      return;
    }
    // Block here with fail-closed before considering the user logged in.
    const result = await checkAccess(email, { failClosed: true });
    if (!result.access) {
      try { await supabase.auth.signOut(); } catch { /* ignore */ }
      if (typeof window !== 'undefined') {
        window.location.href = CHECKOUT_URL;
      }
      throw new Error('Sua assinatura não está ativa. Redirecionando para o checkout...');
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
