## Problema

O botão "Ir para Pagamentos" às vezes abre uma tela genérica do Billing Hub em vez de abrir direto a página de cobrança da conta de anúncio do cliente que está sendo visualizado.

A URL canônica da Meta (que comprovadamente funciona) tem este formato:

```
https://business.facebook.com/billing_hub/accounts/details/
  ?placement=ads_manager
  &asset_id={ID_DA_CONTA}
  &business_id={ID_DO_BUSINESS}
  &payment_account_id_from_jsmodule={ID_DA_CONTA}
  &payment_account_id={ID_DA_CONTA}
  &entrypoint=ads_ecosystem_navigation_ads_billing_tool_plugin
```

Hoje o sistema só envia `asset_id`, `business_id` e `placement`, faltando os parâmetros `payment_account_id*` e `entrypoint`, que são o que ancoram a navegação na conta certa.

## Correção

Atualizar a construção da URL em `src/components/AccountBalanceActionDialog.tsx` para usar o formato canônico completo, sempre derivado dos dados do cliente atualmente selecionado no popup (`accId` e `account.business_id`):

1. **Quando a conta tem `business_id`** (caso da maioria — Business Portfolio):
   ```
   https://business.facebook.com/billing_hub/accounts/details/
     ?placement=ads_manager
     &asset_id={accId}
     &business_id={business_id}
     &payment_account_id={accId}
     &payment_account_id_from_jsmodule={accId}
     &entrypoint=ads_ecosystem_navigation_ads_billing_tool_plugin
   ```
   → Abre direto a página de cobrança da conta do cliente.

2. **Fallback (sem `business_id`** — conta pessoal sem Business):
   ```
   https://business.facebook.com/billing_hub/payment_settings?asset_id={accId}
   ```
   → Billing Hub aceita `asset_id` sem `business_id` para contas pessoais.

3. Garantir que a URL é reconstruída a cada abertura do dialog (já é, pois `accId` e `account.business_id` vêm do `account` passado por prop — cada cliente clicado gera sua própria URL).

## Detalhes técnicos

- **Arquivo único alterado:** `src/components/AccountBalanceActionDialog.tsx` (linhas 39-41) — substituir o cálculo de `billingUrl`.
- Usar `encodeURIComponent` nos valores por segurança (apesar de IDs serem numéricos).
- Nenhuma mudança em edge function, schema ou outros componentes — `business_id` já é retornado por `meta-account-balances` e propagado via `AccountBalance.business_id`.
- O botão "Abrir Gerenciador de Anúncios" continua igual (já funciona corretamente por cliente via `act={accId}`).

## Resultado esperado

Ao clicar em qualquer cliente com saldo baixo/sem saldo e depois em "Ir para Pagamentos", o Meta abre **direto na página de cobrança específica daquele cliente**, exatamente como o link que você colou manualmente — sem cair em tela genérica.