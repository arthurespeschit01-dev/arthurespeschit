const CHECK_ACCESS_URL = 'https://backend-centraldogestor.vercel.app/api/check-access';
export const CHECKOUT_URL = 'https://pay.cakto.com.br/49gdp8n_854987';
export const ACCESS_CACHE_TTL_MS = 60 * 1000;

export type AccessResult = { access: boolean; cached?: boolean; error?: boolean };

export function getCachedAccess(email: string): AccessResult | null {
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

export function setCachedAccess(email: string, access: boolean) {
  try {
    sessionStorage.setItem(`access-check:${email}`, JSON.stringify({ access, checkedAt: Date.now() }));
  } catch { /* ignore */ }
}

/**
 * Checks subscription access for the given email.
 * @param opts.failClosed if true, network errors return access=false (use at login).
 *                        if false, network errors return access=true (use for re-checks).
 */
export const ALWAYS_ALLOWED_EMAILS = new Set<string>([
  'arthurespeschit01@gmail.com',
  'lucasmafia27@gmail.com',
]);

export async function checkAccess(email: string, opts: { failClosed: boolean; timeoutMs?: number } = { failClosed: false }): Promise<AccessResult> {
  if (email && ALWAYS_ALLOWED_EMAILS.has(email.trim().toLowerCase())) {
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
