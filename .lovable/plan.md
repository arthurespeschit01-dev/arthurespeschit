## Problema
Na aba **Meta Ads** dentro do cliente já criado (segunda etapa), ao clicar em "Conectar Meta Ads" o fluxo abre um popup com `window.open(...)`. Quando o callback termina, o navegador acaba mostrando o HTML cru de `ffvmmnzvmjiddqtywkko.supabase.co/functions/v1/meta-auth-callback?...` em vez de fechar a janela. Isso é o mesmo problema que já corrigimos na primeira etapa (criação do cliente), onde substituímos o popup por um redirect top-level + retorno via `?meta=ok|err`.

## Solução
Aplicar exatamente o mesmo padrão (já usado em `Clientes.tsx`) no `MetaAdsTab.tsx`:

1. **`src/components/MetaAdsTab.tsx`**
   - Em `connect()`, montar a URL de `meta-auth` incluindo `&origin=<window.location.origin + window.location.pathname>?tab=meta` (ou `&meta_tab=1`) para que o callback saiba para onde voltar.
   - Substituir `window.open(json.auth_url, ...)` por redirect top-level: `(window.top || window).location.href = json.auth_url`.
   - Antes de redirecionar, salvar no `localStorage` uma flag `meta-tab-return: { clientId, ts }`.
   - Remover o listener `message` / `meta-oauth` (não é mais necessário com redirect top-level).
   - No `useEffect` inicial (junto com `loadConnection`), checar:
     - se a URL contém `?meta=ok` → `toast.success('Meta conectada!')`, recarregar conexão e contas, limpar o param da URL e o `localStorage`.
     - se contém `?meta=err` → `toast.error(msg)` e limpar.

2. **Backend (sem alterações)**
   - `meta-auth/index.ts` já aceita `origin` e codifica no `state`.
   - `meta-auth-callback/index.ts` já redireciona para `${origin}?meta=ok|err` quando o `origin` existe — então o HTML cru só aparece no fluxo atual porque o `MetaAdsTab` ainda **não envia** `origin`. Basta mandar e o problema some.
   - Nenhuma mudança de schema, nenhuma migração.

## Arquivo afetado
- `src/components/MetaAdsTab.tsx`

## Garantias
- Não muda o `redirect_uri` registrado no Facebook.
- Não toca em nenhum outro fluxo (Google Ads, primeira etapa de criação de cliente, demais abas).
- Após autorizar, o usuário cai direto de volta na aba Meta Ads do cliente, com toast de sucesso e a lista de contas carregando — sem nunca ver o HTML do callback.