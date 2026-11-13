import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import {useQueryClient} from '@tanstack/react-query';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<{requiresConfirmation:boolean}>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient=useQueryClient();
  const identity=useRef<string|null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;let authEventVersion=0;

    const applySession = (nextSession: Session | null) => {
      if (cancelled) return;
      const nextId=nextSession?.user.id||null;
      if(identity.current!==nextId){
        const prior=identity.current;identity.current=nextId;
        void queryClient.cancelQueries();queryClient.clear();
        try{for(const key of ['user_email','meta-onboarding-form','meta-tab-return','google-ads-return',...(prior?[`meta-onboarding-form:${prior}`]:[])])localStorage.removeItem(key)}catch{/* session cleanup can proceed without browser storage */}
      }
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoading(false);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      authEventVersion++;applySession(nextSession);
    });

    const initialVersion=authEventVersion;
    supabase.auth.getSession().then(({ data: { session: initial } }) => {
      if(authEventVersion===initialVersion)applySession(initial);
    }).catch(()=>{if(!cancelled&&authEventVersion===initialVersion)applySession(null)});

    return () => { cancelled = true; subscription.unsubscribe(); };
  }, [queryClient]);

  const signUp = async (email: string, password: string) => {
    const { data,error } = await supabase.auth.signUp({ email:email.trim(), password,options:{emailRedirectTo:`${window.location.origin}/auth/callback`} });
    if (error) throw error;
    return {requiresConfirmation:!data.session};
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email:email.trim(), password });
    if (error) throw error;
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
