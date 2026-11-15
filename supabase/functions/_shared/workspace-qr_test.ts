import {
  assertEquals,
  assertRejects,
  assert,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { qrImage, fetchWorkspaceQr } from "./workspace-qr.ts";
const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII=";
Deno.test(
  "QR accepts supported image payloads but rejects arbitrary URLs and SVG",
  () => {
    assertEquals(qrImage(png), "data:image/png;base64," + png);
    assertEquals(
      qrImage({ data: { qrCode: "data:image/png;base64," + png } }),
      "data:image/png;base64," + png,
    );
    assertEquals(qrImage("https://external.invalid/qr"), null);
    assertEquals(qrImage("data:image/svg+xml;base64,PHN2Zz4="), null);
  },
);
Deno.test(
  "QR requests the documented image mode and handles JSON/binary errors",
  async () => {
    let used = false;
    const fake: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      assertEquals(url.origin, "https://api.w-api.app");
      assertEquals(url.searchParams.get("image"), "enable");
      assertEquals(url.searchParams.get("instanceId"), "fixture");
      assertEquals(
        new Headers(init?.headers).get("Authorization"),
        "Bearer fixture",
      );
      used = true;
      return Response.json({ qrcode: png });
    };
    assert(
      (
        await fetchWorkspaceQr(
          { instance_id: "fixture", token: "fixture" },
          fake,
        )
      ).startsWith("data:image/png"),
    );
    assert(used);
    await assertRejects(() =>
      fetchWorkspaceQr({ instance_id: "fixture", token: "fixture" }, async () =>
        Response.json({ qrcode: "unusable" }),
      ),
    );
  },
);
