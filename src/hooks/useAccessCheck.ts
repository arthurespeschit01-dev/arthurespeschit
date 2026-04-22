import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

const CHECK_ACCESS_URL = 'https://backend-centraldogestor.vercel.app/api/check-access';
const ACCESS_CACHE_TTL_MS = 5 * 60 * 1000;

export function useAccessCheck() {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user?.email) return;
    if (window.location.pathname === '/bloqueado') return;

    localStorage.setItem('user_email', user.email);

    const cacheKey = `access-check:${user.email}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as { access: boolean; checkedAt: number };
        if (Date.now() - parsed.checkedAt < ACCESS_CACHE_TTL_MS) {
          if (!parsed.access) {
            navigate('/bloqueado', { replace: true });
          }
          return;
        }
      } catch {
        sessionStorage.removeItem(cacheKey);
      }
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 4000);

    // Defer to idle time to avoid blocking navigation/render.
    const run = () => {
      fetch(`${CHECK_ACCESS_URL}?email=${encodeURIComponent(user.email)}`, { signal: controller.signal, cache: 'no-store' })
        .then((res) => res.json())
        .then((data) => {
          try {
            sessionStorage.setItem(cacheKey, JSON.stringify({ access: !!data.access, checkedAt: Date.now() }));
          } catch { /* ignore quota */ }
          if (!data.access) {
            navigate('/bloqueado', { replace: true });
          }
        })
        .catch(() => {
          // fail-open: silent. Do not log to avoid console noise.
        })
        .finally(() => {
          window.clearTimeout(timeoutId);
        });
    };

    const idleId = (window as unknown as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback
      ? (window as unknown as { requestIdleCallback: (cb: () => void) => number }).requestIdleCallback(run)
      : window.setTimeout(run, 200);

    return () => {
      window.clearTimeout(timeoutId);
      const w = window as unknown as { cancelIdleCallback?: (id: number) => void };
      if (w.cancelIdleCallback && typeof idleId === 'number') {
        try { w.cancelIdleCallback(idleId); } catch { /* ignore */ }
      } else {
        window.clearTimeout(idleId as number);
      }
      controller.abort();
    };
  }, [user?.email, navigate]);
}
