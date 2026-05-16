import { lazy, ComponentType } from "react";

/**
 * Wraps React.lazy with:
 *  - automatic retry (network blips)
 *  - one-shot full page reload when a chunk is missing after a deploy
 *    (Failed to fetch dynamically imported module)
 *
 * This prevents the "Algo deu errado" screen when the user had the app
 * open while a new version was deployed and the old chunk hash no longer
 * exists on the CDN.
 */
const RELOAD_KEY = "__chunk_reloaded_at__";
const RELOAD_TTL_MS = 30_000;

const isChunkLoadError = (err: unknown) => {
  const msg = (err as Error)?.message || String(err || "");
  return /Failed to fetch dynamically imported module|Loading chunk \d+ failed|Loading CSS chunk \d+ failed|Importing a module script failed|error loading dynamically imported module/i.test(
    msg,
  );
};

export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (err) {
      // Retry once after a small delay — handles transient network errors
      try {
        await new Promise((r) => setTimeout(r, 400));
        return await factory();
      } catch (err2) {
        if (isChunkLoadError(err2) || isChunkLoadError(err)) {
          try {
            const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
            if (!last || Date.now() - last > RELOAD_TTL_MS) {
              sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
              window.location.reload();
              // Return a never-resolving promise so React keeps Suspense
              // showing the fallback while the page reloads.
              return await new Promise<{ default: T }>(() => {});
            }
          } catch {
            // ignore storage errors
          }
        }
        throw err2;
      }
    }
  });
}
