## Limpar dados do Meta ao desconectar

**Problema:** Ao desconectar a conta de anúncio ou desconectar o Meta totalmente, os dados de campanhas, conjuntos e criativos importados continuam visíveis no cliente.

**Causa:** As funções `disconnectAccount` e `disconnectMetaFully` em `src/components/MetaAdsTab.tsx` apenas removem/limpam a linha de `meta_connections`, mas não apagam os registros já importados nas tabelas `campaigns`, `ad_sets` e `creatives`.

### Alterações

**`src/components/MetaAdsTab.tsx`**

1. Adicionar helper `clearMetaData()` que, para o `clientId` atual, executa:
   - `DELETE FROM creatives WHERE client_id = ? AND source = 'meta'`
   - `DELETE FROM ad_sets WHERE client_id = ?`
   - `DELETE FROM campaigns WHERE client_id = ? AND source = 'meta'`

2. `disconnectAccount` (desconectar conta de anúncio):
   - Atualizar mensagem de confirmação avisando que os dados serão removidos
   - Após o `update` de `meta_connections`, chamar `clearMetaData()`
   - Disparar `onCampaignsImported?.()` para recarregar a lista no pai

3. `disconnectMetaFully` (desconectar Meta totalmente):
   - Atualizar mensagem de confirmação
   - Após o `delete` de `meta_connections`, chamar `clearMetaData()`
   - Disparar `onCampaignsImported?.()`

Nenhuma outra parte do sistema é alterada. RLS já garante que apenas o dono do cliente apaga seus próprios registros.
