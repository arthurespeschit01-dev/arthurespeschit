// Lightweight runtime monitor: tracks fetch requests per endpoint and render times.
// Subscribe to receive updates; data is kept in-memory only.

export type EndpointStat = {
  endpoint: string;
  count: number;
  totalMs: number;
  lastMs: number;
  errors: number;
  lastAt: number;
};

export type RenderStat = {
  name: string;
  count: number;
  totalMs: number;
  lastMs: number;
  maxMs: number;
};

type Snapshot = {
  endpoints: EndpointStat[];
  renders: RenderStat[];
  totalRequests: number;
  startedAt: number;
};

const endpoints = new Map<string, EndpointStat>();
const renders = new Map<string, RenderStat>();
let totalRequests = 0;
const startedAt = Date.now();
const listeners = new Set<() => void>();
let cachedSnapshot: Snapshot = {
  endpoints: [],
  renders: [],
  totalRequests: 0,
  startedAt,
};
let dirty = true;

function notify() {
  dirty = true;
  listeners.forEach((l) => l());
}

export function subscribeDebug(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function getDebugSnapshot(): Snapshot {
  if (dirty) {
    cachedSnapshot = {
      endpoints: Array.from(endpoints.values()).sort((a, b) => b.count - a.count),
      renders: Array.from(renders.values()).sort((a, b) => b.lastMs - a.lastMs),
      totalRequests,
      startedAt,
    };
    dirty = false;
  }
  return cachedSnapshot;
}

export function resetDebug() {
  endpoints.clear();
  renders.clear();
  totalRequests = 0;
  notify();
}

export function recordRender(name: string, ms: number) {
  const s = renders.get(name) ?? { name, count: 0, totalMs: 0, lastMs: 0, maxMs: 0 };
  s.count += 1;
  s.totalMs += ms;
  s.lastMs = ms;
  if (ms > s.maxMs) s.maxMs = ms;
  renders.set(name, s);
  notify();
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url, window.location.origin);
    // For Supabase REST: keep /rest/v1/<table>
    const path = u.pathname.replace(/\/+$/, "");
    return `${u.host}${path}`;
  } catch {
    return url;
  }
}

let installed = false;
export function installFetchMonitor() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const start = performance.now();
    const input = args[0];
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
    const endpoint = normalizeUrl(url);
    totalRequests += 1;
    let errored = false;
    try {
      const res = await original(...args);
      if (!res.ok) errored = true;
      return res;
    } catch (e) {
      errored = true;
      throw e;
    } finally {
      const ms = performance.now() - start;
      const s = endpoints.get(endpoint) ?? {
        endpoint,
        count: 0,
        totalMs: 0,
        lastMs: 0,
        errors: 0,
        lastAt: 0,
      };
      s.count += 1;
      s.totalMs += ms;
      s.lastMs = ms;
      if (errored) s.errors += 1;
      s.lastAt = Date.now();
      endpoints.set(endpoint, s);
      notify();
    }
  };
}
