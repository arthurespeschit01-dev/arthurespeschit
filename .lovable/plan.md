# Corrigir ERR_BLOCKED_BY_RESPONSE no OAuth do Google Ads

## Causa
O fluxo atual abre `accounts.google.com` em uma nova aba via `window.open(...)`, mas como o app roda dentro do iframe do preview do Lovable, o navegador trata a aba como originária de um contexto de iframe e o Google bloqueia (`ERR_BLOCKED_BY_RESPONSE`). A solução é redirecionar a janela de topo (top-level) com `window.location.href`, sem `window.open`, sem `_blank`, sem iframe.

## Mudanças

### 1. `src/components/GoogleAdsTab.tsx` — usar redirect top-level
- Trocar `window.open(json.auth_url, '_blank', ...)` e o polling por:
  ```ts
  const target = window.top || window;
  target.location.href = json.auth_url;
  ```
- Antes de redirecionar, salvar no `localStorage` a flag `google-ads-return: { clientId, ts }` para que ao voltar do callback consigamos reabrir a aba do cliente certo e mostrar toast de sucesso.
- Ao montar o componente, se `localStorage` tiver a flag e o `clientId` bater + URL contiver `?google_ads=ok|err`, exibir toast e limpar a flag e o param.
- Passar `?origin=<window.location.origin>/clientes/<clientId>` na chamada de `google-ads-auth` para que o callback saiba para onde redirecionar.
- Remover bloco do listener `message` do popup (não é mais necessário) e o polling de 2.5s.

### 2. `supabase/functions/google-ads-auth/index.ts` — propagar `origin`
- Ler `origin` do query string.
- Codificar `origin` dentro do `state` no formato `uuid~base64(origin)` para recuperar no callback (a tabela `google_ads_oauth_states` já aceita string arbitrária).

### 3. `supabase/functions/google-ads-auth-callback/index.ts` — redirecionar de volta
- Decodificar `origin` do `state` (parte após `~`).
- Em vez de devolver HTML com botão "Fechar" + `postMessage`, responder com `302 Redirect` para `${origin}?google_ads=ok` (ou `?google_ads=err&msg=...` em caso de erro).
- Se não houver `origin` no state (fallback), manter a tela HTML atual.

## Garantias
- O `redirect_uri` registrado no Google Cloud Console (`https://ffvmmnzvmjiddqtywkko.supabase.co/functions/v1/google-ads-auth-callback`) não muda — continua exatamente igual.
- Nenhum outro fluxo é tocado (Meta Ads, demais abas, OAuth do app etc.).
- Após autorizar, o usuário cai direto na tela do cliente, com toast de sucesso e a lista de contas Google Ads aparecendo automaticamente.

## Arquivos afetados
- `src/components/GoogleAdsTab.tsx`
- `supabase/functions/google-ads-auth/index.ts`
- `supabase/functions/google-ads-auth-callback/index.ts`
