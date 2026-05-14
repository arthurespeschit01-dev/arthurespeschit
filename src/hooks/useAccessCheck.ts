import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { checkAccess, getCachedAccess, isAlwaysAllowed } from '@/lib/checkAccess';

export function useAccessCheck() {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user?.email) return;
    if (window.location.pathname === '/bloqueado') return;

    try { localStorage.setItem('user_email', user.email); } catch { /* ignore */ }

    // Whitelist: nunca verificar
    if (isAlwaysAllowed(user.email)) return;

    const cached = getCachedAccess(user.email);
    if (cached) {
      if (!cached.access) navigate('/bloqueado', { replace: true });
      return;
    }

    let cancelled = false;
    // Re-check (post-login): fail-open so transient outages don't kick legitimate users.
    checkAccess(user.email, { failClosed: false }).then((result) => {
      if (cancelled) return;
      if (!result.access) navigate('/bloqueado', { replace: true });
    });

    return () => { cancelled = true; };
  }, [user?.email, navigate]);
}
