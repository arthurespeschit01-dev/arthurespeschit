import { expect, it } from "vitest";
import { trackingUrls } from "./trackingUrls";
import { validTrackingKey } from "../../supabase/functions/_shared/workspace-tracking";
it("generates the public link and async head snippet with the same slug", () => {
  const urls = trackingUrls("https://central.example", "google-comercial");
  expect(urls.direct).toBe(
    "https://central.example/functions/v1/link-rastreavel/google-comercial",
  );
  expect(urls.snippet).toBe(
    '<script async src="https://central.example/rastreio.js?link=google-comercial"></script>',
  );
  expect(validTrackingKey("google-comercial")).toBe(true);
  expect(validTrackingKey("a".repeat(64))).toBe(true);
  for (const key of ["../foo", "abc?link=x", "<script>", "x".repeat(64), ""])
    expect(validTrackingKey(key)).toBe(false);
});
