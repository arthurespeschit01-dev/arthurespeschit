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

    fetch(`${CHECK_ACCESS_URL}?email=${encodeURIComponent(user.email)}`, { signal: controller.signal, cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        sessionStorage.setItem(cacheKey, JSON.stringify({ access: !!data.access, checkedAt: Date.now() }));
        if (!data.access) {
          navigate('/bloqueado', { replace: true });
        }
      })
      .catch(() => {
        // fail-open: do not block on network error
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
      });

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [user?.email, navigate]);
}
