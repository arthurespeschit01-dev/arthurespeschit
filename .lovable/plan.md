
# Auditoria e Otimização de Performance

Antes de mexer em qualquer coisa, preciso fazer uma análise real do projeto (bundle, dependências, queries, componentes). Vou propor um plano em fases para não quebrar nada e te entregar resultados mensuráveis.

## Fase 1 — Auditoria (somente leitura, sem alterações)

1. Rodar `bun run build` e analisar tamanho dos chunks gerados.
2. Listar dependências do `package.json` e identificar:
   - Bibliotecas pesadas (ex: `html2canvas`, `jspdf`, `recharts`) que podem virar lazy.
   - Pacotes não utilizados (varrer com `rg` por imports).
   - Componentes shadcn-ui não usados em `src/components/ui/`.
3. Mapear páginas/componentes pesados:
   - Tamanho de `MetaAdsTab.tsx`, `Planilha.tsx`, `Dashboard.tsx`, `Financeiro.tsx`, `ClientDetail.tsx`.
   - Falta de `React.memo`, `useMemo`, `useCallback` em listas grandes.
4. Auditar queries Supabase:
   - `select('*')` desnecessários.
   - Queries N+1 dentro de loops.
   - Falta de paginação em tabelas grandes.
5. Checar Edge Functions (35 functions Meta/Google) — duplicação de helpers.
6. Verificar imagens em `src/assets/` e `public/` (formatos, tamanhos).
7. Rodar Lighthouse/perf profile no preview.

**Entrega da Fase 1:** relatório com:
- O que está deixando pesado (com números: KB do bundle, ms de query, etc.)
- Lista priorizada de otimizações (impacto vs risco)

## Fase 2 — Otimizações de baixo risco (após sua aprovação)

- Remover imports e arquivos não usados.
- Remover componentes shadcn-ui não referenciados.
- Remover dependências `package.json` órfãs.
- Adicionar `React.memo` em componentes de lista (cards de cliente, linhas de tabela).
- Trocar `select('*')` por colunas específicas onde aplicável.
- Lazy-load de libs pesadas (`jspdf`, `html2canvas`, `xlsx`) só quando o usuário clica em exportar.
- Otimizar imagens (converter para webp/avif quando aplicável).

## Fase 3 — Refatorações maiores (mediante aprovação por item)

- Quebrar componentes monstro (>500 linhas) em subcomponentes.
- Consolidar Edge Functions Meta com helpers compartilhados (igual ao `_shared/google-ads.ts`).
- Revisar React Query: chaves, `staleTime`, invalidações.
- Code-splitting adicional por rota onde fizer sentido.

## Fase 4 — Polimento

- SEO técnico (meta tags, JSON-LD onde aplicável).
- Validação mobile final.
- Documentar padrões adotados.

## Regras que vou seguir

- Nada de quebrar funcionalidade — após cada mudança, build deve passar.
- Design preservado (zero mudança visual sem você pedir).
- Mudanças críticas (remover libs, refatorar página inteira, mexer em auth/queries de dados) eu te mostro antes.
- Commits lógicos e pequenos para você reverter se quiser.

## Próximo passo

Se aprovar, começo pela **Fase 1** e te trago o relatório de auditoria com números reais antes de tocar em qualquer arquivo. Posso já incluir alguma otimização óbvia da Fase 2 no mesmo turno (ex: remover imports não usados) se preferir ganhar tempo.
