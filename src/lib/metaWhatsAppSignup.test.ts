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
        expect(options.extras.sessionInfoVersion).toBe("3");
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
it("cancels a pending login immediately and ignores a later SDK callback", async () => {
  const controller = new AbortController();
  let callback: ((r: { authResponse?: { code?: string } }) => void) | undefined;
  const promise = launchMetaSignup(
    {
      init: vi.fn(),
      login: (cb) => {
        callback = cb;
      },
    },
    "config",
    "new_number",
    controller.signal,
  );
  controller.abort();
  await expect(promise).rejects.toThrow("cancelada");
  callback?.({ authResponse: { code: "late-code" } });
});
it("waits for fbAsyncInit instead of retaining the sdk.js buffering stub", async () => {
  vi.resetModules();
  const { loadMetaSdk, currentMetaSdk } = await import("./metaWhatsAppSignup");
  const host = window as unknown as {
    FB?: import("./metaWhatsAppSignup").FacebookSdk;
    fbAsyncInit?: () => void;
  };
  const stub = { init: vi.fn(), login: vi.fn() };
  host.FB = stub;
  let ready = false;
  const promise = loadMetaSdk("123456", "v27.0").then(() => {
    ready = true;
  });
  document
    .querySelector<HTMLScriptElement>('script[src*="connect.facebook.net"]')
    ?.dispatchEvent(new Event("load"));
  await Promise.resolve();
  expect(ready).toBe(false);
  expect(stub.init).not.toHaveBeenCalled();
  const real = { init: vi.fn(), login: vi.fn() };
  host.FB = real;
  host.fbAsyncInit?.();
  await promise;
  expect(real.init).toHaveBeenCalledWith({
    appId: "123456",
    version: "v27.0",
    cookie: true,
    xfbml: false,
  });
  expect(currentMetaSdk("123456", "v27.0")).toBe(real);
  const replacement = { init: vi.fn(), login: vi.fn() };
  host.FB = replacement;
  expect(currentMetaSdk("123456", "v27.0")).toBe(replacement);
  document
    .querySelectorAll('script[src*="connect.facebook.net"]')
    .forEach((s) => s.remove());
  delete host.FB;
});
it("reports SDK initialization timeout and allows a clean retry", async () => {
  vi.useFakeTimers();
  vi.resetModules();
  const { loadMetaSdk } = await import("./metaWhatsAppSignup");
  const host = window as unknown as {
    FB?: import("./metaWhatsAppSignup").FacebookSdk;
    fbAsyncInit?: () => void;
  };
  delete host.FB;
  try {
    const timeout = expect(loadMetaSdk("123456", "v27.0")).rejects.toThrow(
      "inicializar",
    );
    await vi.advanceTimersByTimeAsync(15000);
    await timeout;
    const retry = loadMetaSdk("123456", "v27.0");
    host.FB = { init: vi.fn(), login: vi.fn() };
    host.fbAsyncInit?.();
    await expect(retry).resolves.toBeUndefined();
  } finally {
    vi.useRealTimers();
    document
      .querySelectorAll('script[src*="connect.facebook.net"]')
      .forEach((s) => s.remove());
    delete host.FB;
  }
});

it("accepts documented coexistence completion with WABA only, without guessing a phone", async () => {
  const promise = launchMetaSignup(
    {
      init: vi.fn(),
      login: (cb) => cb({ authResponse: { code: "coex-code" } }),
    },
    "config",
    "business_app",
  );
  window.dispatchEvent(
    new MessageEvent("message", {
      origin: "https://www.facebook.com",
      data: {
        type: "WA_EMBEDDED_SIGNUP",
        event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
        data: { waba_id: "123456" },
      },
    }),
  );
  await expect(promise).resolves.toEqual({
    code: "coex-code",
    waba_id: "123456",
  });
});
it("refuses account-sharing completion without a selected phone in the normal flow", async () => {
  const promise = launchMetaSignup(
    {
      init: vi.fn(),
      login: (cb) => cb({ authResponse: { code: "shared-code" } }),
    },
    "config",
    "new_number",
  );
  window.dispatchEvent(
    new MessageEvent("message", {
      origin: "https://www.facebook.com",
      data: {
        type: "WA_EMBEDDED_SIGNUP",
        event: "FINISH_ONLY_WABA",
        data: { waba_id: "123456" },
      },
    }),
  );
  await expect(promise).rejects.toThrow("sem concluir o cadastro do número");
});
it("distinguishes Facebook-only login from actual WhatsApp onboarding", async () => {
  vi.useFakeTimers();
  try {
    const result = expect(
      launchMetaSignup(
        {
          init: vi.fn(),
          login: (cb) => cb({ authResponse: { code: "login-only-code" } }),
        },
        "config",
        "new_number",
      ),
    ).rejects.toThrow("Cadastro incorporado");
    await vi.advanceTimersByTimeAsync(5000);
    await result;
  } finally {
    vi.useRealTimers();
  }
});
