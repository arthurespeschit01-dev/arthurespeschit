## Objetivo

Garantir que `lucasmafia27@gmail.com` tenha exatamente o mesmo tratamento de `arthurespeschit01@gmail.com`: nunca passa por verificação de assinatura, nunca vê tela de "Verificando assinatura...", nunca é redirecionado para checkout/bloqueado.

## Diagnóstico

O e-mail já está em `ALWAYS_ALLOWED_EMAILS` (`src/lib/checkAccess.ts`) e o bypass funciona dentro de `checkAccess`. Porém, três pontos ainda fazem o usuário sentir "verificação":

1. **`AuthCallback.tsx`** — sempre mostra o spinner "Verificando assinatura..." e chama `checkAccess` (mesmo que retorne instantâneo, há um `getSession` + `setTimeout(800ms)` antes).
2. **`AuthContext.gateSession`** — chama `checkAccess` no `INITIAL_SESSION` antes de liberar o app. Para e-mails whitelisted, isso é trabalho desnecessário e pode atrasar o render.
3. **`Bloqueado.tsx` (handleCheckPayment)** — bate direto no endpoint sem checar a whitelist; se o usuário whitelisted cair lá por qualquer motivo, ainda fica "Verificando…".
4. **Cache negativo antigo em `sessionStorage`** — se o e-mail tiver um registro `access:false` anterior à introdução da whitelist, ele é ignorado por `isAlwaysAllowed` mas só é limpo quando `checkAccess` é chamado. Vale limpar de forma proativa no boot.

## Mudanças

### 1. `src/pages/AuthCallback.tsx`
- Antes de qualquer `checkAccess`, ler o e-mail da sessão e, se `isAlwaysAllowed(email)`, redirecionar imediatamente para `https://www.centraldogestor.site` (mesmo destino do fluxo de sucesso).
- Mantém o restante do fluxo igual para os demais usuários.

### 2. `src/contexts/AuthContext.tsx`
- Em `gateSession`, se `isAlwaysAllowed(session.user.email)`, devolver a sessão sem chamar `checkAccess`.
- Em `signIn`, se `isAlwaysAllowed(email)`, pular o `checkAccess` pós-login.

### 3. `src/pages/Bloqueado.tsx`
- No `useEffect` inicial: se o e-mail do usuário for `isAlwaysAllowed`, redirecionar para `/` automaticamente (fail-safe caso ele caia aqui por engano).
- Em `handleCheckPayment`, se whitelisted, ir direto para `/` sem fetch.

### 4. `src/hooks/useAccessCheck.ts`
- Já usa `getCachedAccess` que respeita a whitelist; adicionar early-return explícito no topo para `isAlwaysAllowed(user.email)` (zero trabalho, zero rede).

### 5. `src/lib/checkAccess.ts`
- Exportar uma função `clearAccessCache(email)` e chamá-la para os e-mails whitelisted no boot do `AuthContext` (limpa qualquer `access:false` antigo persistido em `sessionStorage`).

## Resultado esperado

- Login com Google em `lucasmafia27@gmail.com` → spinner curtíssimo (só o tempo do OAuth) → entra no app sem nenhuma chamada ao backend de assinatura.
- Mesmo comportamento idêntico ao do `arthurespeschit01@gmail.com`.
- Nenhum impacto para os demais usuários (todo o fluxo de verificação real continua intacto).
