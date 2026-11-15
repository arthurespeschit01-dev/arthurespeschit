interface FacebookSdk {
  init(options: Record<string, unknown>): void;
  login(
    callback: (response: { authResponse?: { code?: string } }) => void,
    options: Record<string, unknown>,
  ): void;
}
const facebook = () => (window as unknown as { FB?: FacebookSdk }).FB;
let loading: Promise<FacebookSdk> | undefined;
export function loadMetaSdk(appId: string, version: string) {
  if (!loading)
    loading = new Promise<FacebookSdk>((resolve, reject) => {
      const finish = () => {
        const sdk = facebook();
        if (!sdk) {
          reject(Error("O login da Meta não carregou."));
          return;
        }
        sdk.init({ appId, version, cookie: true, xfbml: false });
        resolve(sdk);
      };
      if (facebook()) {
        finish();
        return;
      }
      const script = document.createElement("script");
      script.src = "https://connect.facebook.net/pt_BR/sdk.js";
      script.async = true;
      script.onload = finish;
      script.onerror = () => {
        loading = undefined;
        script.remove();
        reject(
          Error(
            "Não foi possível carregar a Meta. Confira bloqueadores e conexão.",
          ),
        );
      };
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
    window.addEventListener("message", receive);
    try {
      sdk.login(
        (response) => {
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
