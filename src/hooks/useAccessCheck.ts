import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

const CHECK_ACCESS_URL = 'https://backend-centraldogestor.vercel.app/api/check-access';

export function useAccessCheck() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!user?.email) return;
    if (location.pathname === '/bloqueado') return;

    localStorage.setItem('user_email', user.email);

    fetch(`${CHECK_ACCESS_URL}?email=${encodeURIComponent(user.email)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!data.access) {
          navigate('/bloqueado', { replace: true });
        }
      })
      .catch(() => {
        // fail-open: do not block on network error
      });
  }, [user?.email, location.pathname, navigate]);
}
