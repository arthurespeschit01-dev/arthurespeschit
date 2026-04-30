## Diagnóstico

Verifiquei a resposta crua da Meta para as duas contas:

| Conta | `funding_source_details.type` | Significado | `balance` retornado |
|---|---|---|---|
| **CA - Replay Imports BH** | `20` (Pré-pago / "Saldo disponível") | Crédito real carregado na conta | R$ 144,08 → display "Saldo disponível R$114,47" |
| **CA2 - Vida Melhor Farma** | `1` (Cartão de crédito — pós-pago) | **Fatura em aberto** (gasto ainda não cobrado) | R$ 632,52 — **NÃO é saldo, é dívida pendente** |

Além disso, `account_status: 3` da Vida Melhor Farma significa **"unsettled"** — fatura não paga, conta entra em estado de problema na Meta.

Hoje a função `getAvailableFunds()` está fazendo fallback do `balance` cru quando `type !== 20`. Isso pinta a dívida como saldo positivo verde "OK".

E o badge "1 conta sem saldo" na página `/clientes` está errado: o que tem é "1 conta com saldo baixo" (R$ 114,47 abaixo do threshold R$ 200) — "sem saldo" é categoria diferente (`empty` = `<= 0`).

---

## Mudanças

### 1. `supabase/functions/meta-account-balances/index.ts`

Substituir `getAvailableFunds()` por `computeBalance()` que devolve estrutura rica:

- **Conta pré-paga** (`type === 20`): `available_balance` = valor do `display_string` (ou `balance` como fallback), `pending_bill = 0`.
- **Conta pós-paga** (qualquer outro `type`): `available_balance = null` (não existe saldo disponível em cartão), `pending_bill` = `balance` cru (fatura em aberto a ser cobrada).

A resposta passa a incluir, por conta:
- `available_balance: number | null`
- `pending_bill: number` (>= 0)
- `is_prepaid: boolean`
- `funding_type: number | null`
- `account_status: number` (1=ativa, 2=desabilitada, 3=fatura não paga, 7=revisão, 9=encerrada…)
- `funding_label: string` (ex: "Mastercard *0121", "Saldo disponível")

### 2. `src/components/AccountBalancesPanel.tsx`

Atualizar `AccountBalance` interface para refletir os novos campos.

Reescrever `getBalanceStatus(a)` com regra ampliada:

- `error` → erro técnico ou conta com status problemático (2, 3, 7, 9, 100, 101, 102…)
- `empty` → pré-paga com `available_balance <= 0`
- `low` → pré-paga com `available_balance <= 200`
- `ok` → pré-paga com saldo > 200, **OU** pós-paga com conta saudável (status 1)
- Novo estado: `postpaid` (cor azul/cinza, label "Cartão de crédito") quando pós-pago + status OK — não conta como problema

Renderização da linha:
- **Pré-paga**: continua mostrando "R$ X,XX" como saldo principal.
- **Pós-paga saudável**: mostra label "Cartão de crédito" + linha secundária "Fatura em aberto: R$ X,XX" (em cor neutra, NÃO verde de "saldo OK"). Não dispara badge de problema.
- **Pós-paga com `account_status` problemático**: dispara estado `error` com mensagem específica ("Fatura em atraso", "Conta desabilitada", etc.).

### 3. `src/pages/Clientes.tsx`

Trocar a label do badge para refletir a realidade:
- 1 problema → "1 conta com problema"
- N problemas → "N contas com problema"
- Tornar o badge **clicável**, scrollando até o painel de saldos e expandindo-o, para o usuário ver imediatamente qual conta tem o problema.

### 4. `STATUS_CONFIG` no painel

Adicionar entrada `postpaid` (ícone CreditCard, cor neutra), e ajustar `error` para também aceitar mensagens de status da conta (não só erro técnico de fetch).

---

## Resultado esperado

- **Replay** continua aparecendo 🟡 SALDO BAIXO R$ 114,47 (correto).
- **Vida Melhor Farma** passa a aparecer com label "Cartão de crédito" + "Fatura em aberto R$ 632,52" — sem o número grande verde simulando saldo. Se a Meta indicar `account_status = 3` (fatura não paga), aparece 🔴 com mensagem "Fatura em atraso na Meta".
- Badge no header de Clientes vira "1 conta com problema" (clicável → abre painel).
