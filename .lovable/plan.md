## Objetivo

Corrigir o saldo exibido para refletir exatamente o `balance` retornado pela API do Meta (em centavos → reais) e simplificar a interface mostrando apenas: nome da conta, saldo e badge de status.

## Mudanças

### 1. Edge function `supabase/functions/meta-account-balances/index.ts`
- Alterar a query da Graph API para pedir apenas os campos necessários:
  `GET /act_{id}?fields=name,balance,currency,account_status`
- Remover o uso de `spend_cap`, `amount_spent` e o cálculo de `remaining`.
- Retornar por conta: `client_id`, `client_name`, `account_id`, `account_name`, `currency`, `balance` (já dividido por 100), `account_status`.

### 2. Frontend `src/components/AccountBalancesPanel.tsx`
- Remover do tipo `AccountBalance` os campos `spend_cap`, `amount_spent`, `remaining`.
- Status (`getBalanceStatus`) já passou a usar `balance` — manter como está:
  - `≤ 0` → 🔴 Sem saldo
  - `≤ R$ 200` → 🟡 Saldo baixo
  - `> R$ 200` → 🟢 Saldo OK
- Em cada item da lista, exibir somente:
  - Nome da conta (e nome do cliente).
  - Saldo em destaque (`fmt(a.balance, a.currency)`).
  - Badge com emoji + label de status.
- Remover a linha "Limite da conta" (spend_cap) que ainda existe no JSX.

### 3. Página `src/pages/Clientes.tsx`
- Nenhuma mudança de lógica necessária; apenas garantir que o badge de contagem de problemas continua usando `getBalanceStatus(a)` (já está).

## Resultado
Cada cartão de conta no painel mostrará apenas: nome da conta + cliente, saldo formatado e o badge colorido de status, com o valor refletindo fielmente o campo `balance` da Meta.