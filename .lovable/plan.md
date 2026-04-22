
## Otimizar fluidez do sistema sem remover funções

Encontrei a causa real da lentidão e dos "flashes" ao navegar. Vou corrigir tudo mantendo 100% das funcionalidades.

## Problemas identificados (com base nos logs reais)

1. **Requisições duplicadas a cada minuto**: as mesmas tabelas (`operational_tasks`, `clients`, `signed_contracts`, `notification_states`) são buscadas várias vezes seguidas porque `NotificationBar` faz polling a cada 60s e o `Dashboard` faz seu próprio fetch separado, sem cache compartilhado.
2. **Tela "pisca" ao trocar de página**: o `RouteBoundary` usa `key={location.pathname}`, o que força desmontar e remontar tudo a cada navegação — perde estado, recarrega chunk, mostra fallback.
3. **`useAccessCheck` falhando**: a chamada para `backend-centraldogestor.vercel.app` retorna `Failed to fetch` e isso pode atrapalhar o ciclo de render.
4. **`React Query` instalado mas não usado**: temos `@tanstack/react-query` no provider, mas nenhuma página usa — ou seja, zero cache entre rotas.
5. **Polling fixo de 60s**: roda mesmo com aba em background, gastando rede e CPU à toa.
6. **Recarregamento por chunk error muito agressivo**: `ChunkErrorRecovery` pode disparar `window.location.reload()` causando "tela preta".

## O que vou fazer

### 1. Migrar fetches críticos para React Query (cache global)
- Criar hooks `useClients`, `useTasks`, `useContracts`, `useNotificationStates`, `useMensalidades`, `useTransacoes`.
- `staleTime: 60s` e `gcTime: 5min` → ao trocar de página, dados aparecem instantaneamente do cache.
- `Dashboard` e `NotificationBar` passam a compartilhar o mesmo cache (uma só requisição serve os dois).

### 2. Estabilizar o `RouteBoundary`
- Remover o `key={location.pathname}` para evitar desmontar a árvore a cada navegação.
- Resetar o ErrorBoundary apenas quando ocorre erro real, não a cada rota.

### 3. Pausar polling quando a aba está oculta
- `NotificationBar` só faz polling quando `document.visibilityState === 'visible'`.
- Refazer fetch imediatamente ao voltar para a aba.

### 4. Tornar `useAccessCheck` realmente não-bloqueante
- Manter cache de 5 min já existente.
- Aumentar tolerância a falha (fail-open silencioso).
- Não disparar nenhum re-render quando a verificação falha.

### 5. Suavizar o fallback de carregamento
- Trocar o `PageFallback` (texto "Carregando...") por um skeleton sutil que ocupa o mesmo espaço da página → fim do "flash preto".
- Garantir que a Suspense só apareça no primeiro carregamento de cada chunk (depois fica em cache).

### 6. Refinar `ChunkErrorRecovery`
- Só recarregar se o erro for confirmadamente de chunk (não qualquer erro).
- Aumentar debounce e limitar a 1 reload por sessão.

### 7. Otimizar renders pesados
- Memoizar cálculos em `Dashboard` (já usa `useMemo` parcialmente — ampliar).
- `NotificationBar`: memoizar `visible`, `unreadList`, `readList` com `useMemo`.
- Evitar recriar objetos em `mainNavItems` a cada render do `AppLayout`.

### 8. Reduzir payload do polling de notificações
- Selecionar só os campos necessários (já feito em parte).
- Adicionar limites razoáveis (`limit(100)`) onde faz sentido.

## Arquivos afetados

- `src/App.tsx` (RouteBoundary, ChunkErrorRecovery, PageFallback, QueryClient config)
- `src/components/NotificationBar.tsx` (React Query, visibilidade, memoização)
- `src/components/AppLayout.tsx` (memoização de listas)
- `src/pages/Dashboard.tsx` (React Query)
- `src/hooks/useAccessCheck.ts` (silenciar falhas)
- Novo: `src/hooks/queries/` com hooks compartilhados (`useClients`, `useTasks`, `useContracts`, `useNotificationStates`, `useMensalidades`, `useTransacoes`)

## Resultado esperado

- Navegação **instantânea** entre páginas (sem flash, sem refetch).
- Notificações continuam atualizando, mas sem duplicar chamadas.
- Sem mais "tela preta" durante a navegação.
- Menos consumo de rede e CPU.
- Zero funções removidas.
