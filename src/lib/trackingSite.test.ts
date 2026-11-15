import { beforeEach, expect, it } from "vitest";
import { trackingSiteScript } from "../../supabase/functions/_shared/workspace-tracking";
import { trackingRedirect } from "../../supabase/functions/_shared/workspace-triggers";
beforeEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
});
it("tracks whatsapp schemes, per-button override and preserves text on repeated clicks", () => {
  const script = trackingSiteScript(
    "https://example.invalid/functions/v1/workspace-operations",
    "a".repeat(64),
  );
  const doc = document.implementation.createHTMLDocument();
  const a = doc.createElement("a");
  a.href = "whatsapp://send?phone=5511999990000&text=Quero%20uma%20consulta";
  a.setAttribute("data-central-link", "b".repeat(64));
  doc.body.append(a);
  new Function(
    "document",
    "location",
    "localStorage",
    "URL",
    "WeakMap",
    script,
  )(
    doc,
    new URL("https://site.invalid/?gclid=click&utm_campaign=Campanha"),
    localStorage,
    URL,
    WeakMap,
  );
  a.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  let target = new URL(a.href);
  expect(target.searchParams.get("link")).toBe("b".repeat(64));
  expect(target.searchParams.get("text")).toBe("Quero uma consulta");
  expect(target.searchParams.get("gclid")).toBe("click");
  a.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  target = new URL(a.href);
  expect(target.searchParams.get("text")).toBe("Quero uma consulta");
  const final = new URL(
    trackingRedirect(
      {
        destination: "https://wa.me/5511999990000?text=Outro",
        click_ref: "0123456789abcdef",
      },
      target,
    ),
  );
  expect(final.searchParams.get("text")).toBe(
    "Quero uma consulta\nRef: CG-0123456789abcdef",
  );
});
it("a new ad click clears identifiers and campaign fields from the preceding platform", () => {
  localStorage.setItem(
    "cg_attribution",
    JSON.stringify({
      time: Date.now(),
      attrs: { gclid: "old", utm_campaign: "old_campaign" },
    }),
  );
  new Function(
    "document",
    "location",
    "localStorage",
    "URL",
    "WeakMap",
    trackingSiteScript("https://example.invalid/function", "a".repeat(64)),
  )(
    document,
    new URL("https://site.invalid/?fbclid=new"),
    localStorage,
    URL,
    WeakMap,
  );
  const attrs = JSON.parse(localStorage.getItem("cg_attribution")!).attrs;
  expect(attrs.fbclid).toBe("new");
  expect(attrs.gclid).toBeUndefined();
  expect(attrs.utm_campaign).toBeUndefined();
});

it("supports public slugs, existing Meta browser cookie and an override slug", () => {
  const doc = document.implementation.createHTMLDocument();
  Object.defineProperty(doc, "cookie", { value: "_fbp=fb.1.12345.browser1" });
  const a = doc.createElement("a");
  a.href = "https://wa.me/5511999990000?text=Meu%20pedido";
  a.setAttribute("data-central-link", "outro-link");
  doc.body.append(a);
  a.addEventListener("click", (e) => e.preventDefault());
  new Function(
    "document",
    "location",
    "localStorage",
    "URL",
    "WeakMap",
    trackingSiteScript("https://central.invalid/function", "google-comercial"),
  )(
    doc,
    new URL("https://site.invalid/?fbclid=meta-click"),
    localStorage,
    URL,
    WeakMap,
  );
  a.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  const url = new URL(a.href);
  expect(url.searchParams.get("link")).toBe("outro-link");
  expect(url.searchParams.get("fbp")).toBe("fb.1.12345.browser1");
  expect(url.searchParams.get("fbc")).toMatch(/^fb\.1\.[0-9]+\.meta-click$/);
  expect(url.searchParams.get("text")).toBe("Meu pedido");
});
