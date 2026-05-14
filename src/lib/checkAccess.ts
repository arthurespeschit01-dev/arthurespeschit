const CHECK_ACCESS_URL = 'https://backend-centraldogestor.vercel.app/api/check-access';
export const CHECKOUT_URL = 'https://pay.cakto.com.br/49gdp8n_854987';
export const ACCESS_CACHE_TTL_MS = 60 * 1000;

export type AccessResult = { access: boolean; cached?: boolean; error?: boolean };

/**
 * Emails que SEMPRE têm acesso, sem nenhuma verificação de assinatura.
 * Comparação é case-insensitive e ignora espaços.
 */
export const ALWAYS_ALLOWED_EMAILS = new Set<string>([
  'arthurespeschit01@gmail.com',
  'lucasmafia27@gmail.com',
]);

export function isAlwaysAllowed(email?: string | null): boolean {
  if (!email) return false;
  return ALWAYS_ALLOWED_EMAILS.has(email.trim().toLowerCase());
}

export function getCachedAccess(email: string): AccessResult | null {
  if (isAlwaysAllowed(email)) return { access: true, cached: true };
  try {
    const raw = sessionStorage.getItem(`access-check:${email}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { access: boolean; checkedAt: number };
    if (Date.now() - parsed.checkedAt < ACCESS_CACHE_TTL_MS) {
      return { access: parsed.access, cached: true };
    }
  } catch { /* ignore */ }
  return null;
}

export function clearAccessCache(email: string) {
  try { sessionStorage.removeItem(`access-check:${email}`); } catch { /* ignore */ }
}

export function setCachedAccess(email: string, access: boolean) {
  try {
    sessionStorage.setItem(`access-check:${email}`, JSON.stringify({ access, checkedAt: Date.now() }));
  } catch { /* ignore */ }
}

export async function checkAccess(email: string, opts: { failClosed: boolean; timeoutMs?: number } = { failClosed: false }): Promise<AccessResult> {
  if (isAlwaysAllowed(email)) {
    // Limpa qualquer cache negativo anterior e marca como permitido.
    try { sessionStorage.removeItem(`access-check:${email}`); } catch { /* ignore */ }
    setCachedAccess(email, true);
    return { access: true };
  }
  const cached = getCachedAccess(email);
  if (cached) return cached;

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), opts.timeoutMs ?? 6000);
  try {
    const res = await fetch(`${CHECK_ACCESS_URL}?email=${encodeURIComponent(email)}`, {
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const access = !!data.access;
    setCachedAccess(email, access);
    return { access };
  } catch {
    return { access: !opts.failClosed, error: true };
  } finally {
    window.clearTimeout(timeoutId);
  }
}
