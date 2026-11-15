import { expect, it, vi } from "vitest";
import { metaSignupEvent, launchMetaSignup } from "./metaWhatsAppSignup";
it("rejects forged or malformed Meta asset messages", () => {
  const message = {
    type: "WA_EMBEDDED_SIGNUP",
    event: "FINISH",
    data: { waba_id: "123456", phone_number_id: "789012" },
  };
  expect(
    metaSignupEvent("https://www.facebook.com.attacker.invalid", message),
  ).toBeNull();
  expect(
    metaSignupEvent("https://www.facebook.com", JSON.stringify(message)),
  ).toEqual(message.data);
  expect(
    metaSignupEvent("https://www.facebook.com", {
      ...message,
      data: { waba_id: "123", phone_number_id: "bad" },
    }),
  ).toBeNull();
});
it("joins the SDK code with trusted session assets and removes the listener", async () => {
  const init = vi.fn(),
    login = vi.fn(
      (
        cb: (r: { authResponse?: { code?: string } }) => void,
        options: { extras: { version: string; sessionInfoVersion?: string } },
      ) => {
        expect(options.extras.version).toBe("v4");
        expect(options.extras.sessionInfoVersion).toBeUndefined();
        cb({ authResponse: { code: "authorized-code" } });
      },
    );
  const promise = launchMetaSignup(
    { init, login },
    "configuration",
    "new_number",
  );
  window.dispatchEvent(
    new MessageEvent("message", {
      origin: "https://www.facebook.com",
      data: JSON.stringify({
        type: "WA_EMBEDDED_SIGNUP",
        event: "FINISH",
        data: { waba_id: "123456", phone_number_id: "789012" },
      }),
    }),
  );
  await expect(promise).resolves.toEqual({
    code: "authorized-code",
    waba_id: "123456",
    phone_number_id: "789012",
  });
});
it("reports cancellation without submitting a backend authorization", async () => {
  const result = launchMetaSignup(
    { init: vi.fn(), login: (cb) => cb({}) },
    "configuration",
    "business_app",
  );
  await expect(result).rejects.toThrow("autorização");
});
