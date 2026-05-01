Vou corrigir o botão “Ir para Pagamentos” para replicar o link que funcionou e evitar o caminho que está gerando `ERR_BLOCKED_BY_RESPONSE`.

O problema mais provável é este: para essa mesma conta, o link que funcionou tinha `business_id`, `payment_account_id_from_jsmodule`, `payment_account_id` e `entrypoint`. Agora o navegador caiu em `/latest/billing_hub/payment_settings/?asset_id=...`, que é o fallback sem `business_id`. Ou seja, em algumas contas o sistema não está recebendo/enviando o `business_id`, então ele monta um link incompleto.

Plano de correção:

1. Ajustar a busca dos saldos/contas
   - Na função que carrega as contas Meta, também buscar `account_ids` do cliente.
   - Usar como `business_id` principal o retorno da Meta (`business.id`).
   - Se a Meta não retornar `business.id`, usar o campo “BM (Business Manager)” salvo no cadastro do cliente (`account_ids.bm`) como fallback.
   - Sanitizar o ID para remover caracteres que não sejam números.

2. Replicar exatamente o formato do link que funcionou
   - Para contas com `business_id`, montar:

```text
https://business.facebook.com/billing_hub/accounts/details/?placement=ads_manager&asset_id=CONTA&business_id=BM&payment_account_id_from_jsmodule=CONTA&payment_account_id=CONTA&entrypoint=ads_ecosystem_navigation_ads_billing_tool_plugin
```

   - Manter `asset_id`, `payment_account_id_from_jsmodule` e `payment_account_id` sempre com o ID da conta sem `act_`.

3. Remover o fallback problemático
   - Não usar mais diretamente:

```text
business.facebook.com/billing_hub/payment_settings?asset_id=...
```

   - Esse é o caminho que aparece no print com erro.
   - Quando não houver BM disponível, o fallback será o Gerenciador de Anúncios na área de cobrança:

```text
https://adsmanager.facebook.com/adsmanager/manage/billing?act=CONTA
```

4. Melhorar a segurança contra dados incompletos
   - Se a conta não tiver `business_id`, ainda abrir uma tela útil de cobrança pelo Ads Manager, em vez de abrir uma página bloqueada.
   - Isso garante que todos os clientes tenham comportamento consistente: abrir cobrança/pagamentos da conta correta quando houver BM e abrir cobrança no Gerenciador quando não houver.

Arquivos a alterar:

- `supabase/functions/meta-account-balances/index.ts`
- `src/components/AccountBalanceActionDialog.tsx`
- Se necessário, apenas ajuste de tipo em `src/components/AccountBalancesPanel.tsx` já que `business_id` já existe na interface.