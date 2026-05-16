## Diagnóstico

Investiguei `verificar-notificacoes`, `meta-account-balances`, `Financeiro.tsx` e os dados reais da tabela `mensalidades`. Encontrei 3 bugs que explicam exatamente os sintomas relatados.

### Bug 1 — Saldo baixo nunca envia (causa raiz)

`verificar-notificacoes` chama `meta-account-balances` passando `Authorization: Bearer <SERVICE_ROLE_KEY>` e `user_id` no body. Mas `meta-account-balances` ignora o body e faz `supabase.auth.getUser()` no token. Como o service role key não é um JWT de usuário, retorna `null` → resposta 401 → o loop pula tudo e nenhuma notificação de saldo é enviada.

### Bug 2 — Saldo enviado pode ser falso (R$ 0,00)

Em `verificar-notificacoes` (linha 195):
```ts
const saldo = Number(a.balance ?? a.spend_cap_remaining ?? 0);
```
Para contas **pós-pagas** (cartão), `meta-account-balances` retorna `available_balance: null` e `balance: 0` (não existe saldo real, só fatura em aberto). Resultado: toda conta pós-paga seria reportada como "saldo R$ 0,00 — abaixo do limite", o que é falso. Só contas pré-pagas (`is_prepaid: true`) têm saldo real.

### Bug 3 — Inadimplência não detecta clientes realmente atrasados

A query usa `.eq('status', 'atrasado')`. Mas o status só é atualizado para `atrasado` quando o usuário **abre a página Financeiro** (linhas 92-104 de `Financeiro.tsx`). Se ele não abrir, mensalidades vencidas continuam como `pendente` e nunca disparam alerta — mesmo que estejam vencidas há semanas. Confirmei nos dados: existem mensalidades pendentes além da data.

Os "dias de atraso" em si já são calculados corretamente a partir de `vencimento`, então o número é confiável uma vez que a mensalidade entre na lista.

## Correções

### 1. `supabase/functions/meta-account-balances/index.ts`
Permitir chamada interna autenticada com service role:
- Se `Authorization` for o `SUPABASE_SERVICE_ROLE_KEY`, ler `user_id` do body em vez de chamar `auth.getUser()`.
- Caso contrário, manter o fluxo atual (JWT do usuário).

### 2. `supabase/functions/verificar-notificacoes/index.ts`

**Saldo baixo:**
- Usar `a.available_balance` (não `a.balance`) como fonte de verdade.
- Pular contas onde `available_balance == null` ou `is_prepaid === false` — pós-pagas não têm saldo real para alertar.
- Pular contas com `error` retornado pela API.
- Validar que `saldo` é número finito antes de comparar/enviar.

**Inadimplência:**
- Trocar `.eq('status', 'atrasado')` por `.neq('status', 'pago').lte('vencimento', limiteData)` — pega pendentes vencidos também, sem depender do frontend.
- Manter cálculo de `diasAtraso` a partir de `vencimento` (já correto).
- Validar `valor` numérico antes de enviar.

**Geral:** adicionar `console.log` de contagem por gatilho para facilitar debug futuro nos logs.

### 3. (Opcional, não obrigatório) Backfill leve
Não vou rodar UPDATE em massa; o filtro novo já cobre os casos sem precisar mexer no schema.

## O que NÃO vou mexer

- Não vou alterar UI, schema, RLS, ou outras edge functions.
- Não vou mudar o cron job (a função continua sendo a mesma rota).
- Frontend de Financeiro continua atualizando status como hoje — a correção é resiliente a isso.

## Como validar depois

1. Chamar manualmente `verificar-notificacoes` via curl e checar logs: deve listar quantas contas com saldo abaixo do limite e quantos inadimplentes detectados.
2. Conferir email recebido: valor do saldo bate com o exibido no painel "Saldos das contas".
3. Conferir que contas pós-pagas (cartão) **não** disparam alerta de saldo baixo.
