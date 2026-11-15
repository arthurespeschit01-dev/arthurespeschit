export function trackingUrls(origin: string, key: string) {
  const direct = new URL(
    `/functions/v1/link-rastreavel/${encodeURIComponent(key)}`,
    origin,
  ).href;
  const script = new URL("/rastreio.js", origin);
  script.searchParams.set("link", key);
  return {
    direct,
    script: script.href,
    snippet: `<script async src="${script.href}"></script>`,
  };
}
