# Seleção automática de contas do Google Ads após OAuth

## Objetivo
Eliminar o input manual de Customer ID. Após o login via Google, listar automaticamente todas as contas que o usuário tem acesso (com nome real e ID formatado), incluindo as filhas de contas MCC, e deixar o usuário escolher qual vincular ao cliente.

## Mudanças

### 1. Edge function `google-ads-list-customers` — listagem enriquecida
Hoje retorna apenas `[{ id, formatted }]` da `customers:listAccessibleCustomers`. Trocar por um pipeline em duas etapas:

1. Chamar `customers:listAccessibleCustomers` → IDs acessíveis.
2. Em paralelo, para cada ID:
   - Consultar via GAQL `SELECT customer.id, customer.descriptive_name, customer.manager FROM customer LIMIT 1` (com `login-customer-id` igual ao próprio ID) para obter **nome** e flag **manager**.
   - Se `manager = true` (MCC), consultar `SELECT customer_client.id, customer_client.descriptive_name, customer_client.manager, customer_client.level FROM customer_client WHERE customer_client.level <= 1` e adicionar todas as filhas não-manager. Cada filha guarda `login_customer_id = id_do_MCC` (necessário para todas as chamadas futuras).
   - Se `manager = false` (conta normal), adicionar diretamente.
3. Ordenar por nome e responder `{ customers: [{ id, formatted, name, manager, login_customer_id? }] }`.

A rota de seleção (`select_customer_id`) continua igual; passa a usar o `login_customer_id` que vem junto da seleção (já implementado).

### 2. Componente `GoogleAdsTab.tsx` — UI da seleção
Remover os inputs `manualCustomerId` e `loginCustomerId`. No bloco "Selecionar conta do cliente":

- Se `loading` → spinner com texto "Buscando suas contas no Google Ads…".
- Se `customers.length === 0` → mensagem: "Nenhuma conta Google Ads encontrada para este login. Verifique se você tem acesso a alguma conta em ads.google.com" + botão "Reconectar com outra conta".
- Se houver contas → lista de cards (mesmo visual do MetaAdsTab):
  - Bolinha roxa, nome da conta em destaque, ID formatado abaixo, badge "MCC" quando aplicável.
  - Botão "Selecionar" em cada linha. Ao clicar, chamar `selectCustomer(customer.id, customer.login_customer_id)`.

A função `selectCustomer` já existe — só remover a validação de input manual e passar o `login_customer_id` da própria conta escolhida.

### 3. Loading inicial
Quando `connection` existe mas `selected_customer_id` está vazio, disparar `loadConnection` que já chama `google-ads-list-customers` e popula `customers`. Garantir estado `loadingCustomers` separado para mostrar o spinner correto.

## Arquivos afetados
- `supabase/functions/google-ads-list-customers/index.ts` — enriquecer resposta com nome + manager + filhas de MCC.
- `src/components/GoogleAdsTab.tsx` — remover inputs manuais; renderizar lista de cards com nome e ID; mensagem de vazio; estado de loading.

## Fora do escopo
- Outras telas e funcionalidades (Meta Ads, etc.) permanecem intocadas.
- Padrão visual dark roxo mantido (mesmas classes `glass-surface`, `bg-primary`).
