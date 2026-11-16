export interface FacebookSdk {
  init(options: Record<string, unknown>): void;
  login(
    callback: (response: {
      authResponse?: { code?: string };
      error?: { message?: string };
    }) => void,
    options: Record<string, unknown>,
  ): void;
}
interface MetaWindow {
  FB?: FacebookSdk;
  fbAsyncInit?: () => void;
}
const metaWindow = () => window as unknown as MetaWindow;
let loading: Promise<void> | undefined;
let initialized: string | undefined;
export function currentMetaSdk(
  appId: string,
  version: string,
): FacebookSdk | null {
  return initialized === `${appId}:${version}` ? metaWindow().FB || null : null;
}
export function loadMetaSdk(appId: string, version: string): Promise<void> {
  const identity = `${appId}:${version}`;
  if (initialized === identity && metaWindow().FB) return Promise.resolve();
  if (initialized && metaWindow().FB) {
    try {
      metaWindow().FB!.init({ appId, version, cookie: true, xfbml: false });
      initialized = identity;
      return Promise.resolve();
    } catch {
      return Promise.reject(
        Error("Não foi possível configurar o login da Meta."),
      );
    }
  }
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const host = metaWindow();
    const previous = host.fbAsyncInit;
    const script = document.createElement("script");
    const cleanup = () => {
      clearTimeout(timer);
      if (host.fbAsyncInit === ready) host.fbAsyncInit = previous;
    };
    const fail = () => {
      cleanup();
      loading = undefined;
      script.remove();
      reject(
        Error(
          "Não foi possível inicializar a Meta. Confira a conexão ou bloqueadores e tente novamente.",
        ),
      );
    };
    const ready = () => {
      try {
        previous?.();
        const sdk = host.FB;
        if (!sdk) throw Error("SDK indisponível");
        sdk.init({ appId, version, cookie: true, xfbml: false });
        initialized = identity;
        cleanup();
        resolve();
      } catch {
        fail();
      }
    };
    const timer = setTimeout(fail, 15000);
    // sdk.js first exposes a buffering stub. Only fbAsyncInit signals that the real SDK is ready.
    host.fbAsyncInit = ready;
    script.src = "https://connect.facebook.net/pt_BR/sdk.js";
    script.async = true;
    script.onerror = fail;
    document.head.append(script);
  });
  return loading;
}
export function metaSignupEvent(origin: string, input: unknown) {
  if (
    ![
      "https://www.facebook.com",
      "https://web.facebook.com",
      "https://facebook.com",
    ].includes(origin)
  )
    return null;
  try {
    const message = typeof input === "string" ? JSON.parse(input) : input;
    if (message?.type !== "WA_EMBEDDED_SIGNUP") return null;
    if (["CANCEL", "ERROR"].includes(message.event))
      return { cancelled: true } as const;
    if (
      !["FINISH", "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING"].includes(
        message.event,
      )
    )
      return null;
    const { waba_id, phone_number_id } = message.data || {};
    if (
      !/^[0-9]{5,30}$/.test(waba_id) ||
      !/^[0-9]{5,30}$/.test(phone_number_id)
    )
      return null;
    return {
      waba_id: String(waba_id),
      phone_number_id: String(phone_number_id),
    };
  } catch {
    return null;
  }
}
export function launchMetaSignup(
  sdk: FacebookSdk,
  configId: string,
  mode: "business_app" | "new_number",
  signal?: AbortSignal,
) {
  return new Promise<{
    code: string;
    waba_id: string;
    phone_number_id: string;
  }>((resolve, reject) => {
    let code = "",
      ids: { waba_id: string; phone_number_id: string } | null = null,
      done = false,
      assetTimer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      window.removeEventListener("message", receive);
      clearTimeout(timeout);
      clearTimeout(assetTimer);
      signal?.removeEventListener("abort", abort);
    };
    const finish = () => {
      if (!done && code && ids) {
        done = true;
        cleanup();
        resolve({ code, ...ids });
      }
    };
    const fail = (message: string) => {
      if (done) return;
      done = true;
      cleanup();
      reject(Error(message));
    };
    const abort = () => fail("Conexão cancelada. Você pode tentar novamente.");
    const receive = (e: MessageEvent) => {
      const result = metaSignupEvent(e.origin, e.data);
      if (!result) return;
      if ("cancelled" in result) {
        fail("Conexão cancelada na Meta.");
        return;
      }
      ids = result;
      finish();
    };
    const timeout = setTimeout(
      () => fail("O tempo para conectar terminou. Tente novamente."),
      300000,
    );
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });
    window.addEventListener("message", receive);
    try {
      sdk.login(
        (response) => {
          if (done) return;
          code = response.authResponse?.code || "";
          if (!code) {
            fail("A autorização não foi concluída na Meta.");
            return;
          }
          finish();
          if (!done)
            assetTimer = setTimeout(
              () =>
                fail(
                  "A Meta não informou o número selecionado. Tente novamente.",
                ),
              5000,
            );
        },
        {
          config_id: configId,
          response_type: "code",
          override_default_response_type: true,
          extras: {
            version: "v4",
            ...(mode === "business_app"
              ? { featureType: "whatsapp_business_app_onboarding" }
              : {}),
          },
        },
      );
    } catch {
      fail(
        "Não foi possível abrir a Meta. Permita a janela de conexão e tente novamente.",
      );
    }
  });
}
