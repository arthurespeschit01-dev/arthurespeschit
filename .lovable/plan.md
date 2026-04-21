
## Adicionar filtro completo de período nas campanhas

Vou expandir o seletor de período da aba de campanhas para incluir todas as opções de análise que você precisa, igual ao Gerenciador de Anúncios da Meta.

## O que vou implementar

### 1. Novo seletor de período em `src/components/DateRangePicker.tsx`

Adicionar os presets que faltam:

- **Hoje**
- **Ontem**
- **Últimos 7 dias** (já existe)
- **Últimos 14 dias** (já existe)
- **Últimos 30 dias** (já existe)
- **Últimos 90 dias** (já existe)
- **Esta semana**
- **Semana passada**
- **Este mês**
- **Mês passado**
- **Máximo / Tudo** (lifetime — desde o início da conta)
- **Personalizado** (calendário com seleção de intervalo — já existe, vou melhorar)

### 2. Atualizar tipos e mapeamento

Em `DateRangePicker.tsx` o tipo `DatePreset` ganha:
`'today' | 'yesterday' | 'last_7d' | 'last_14d' | 'last_30d' | 'last_90d' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'maximum' | 'custom'`

### 3. Edge Functions reconhecerem os novos presets

Atualizar a lista `VALID_PRESETS` em:
- `supabase/functions/meta-campaign-insights/index.ts`
- `supabase/functions/meta-import-campaigns/index.ts`
- `supabase/functions/meta-import-adsets/index.ts`
- `supabase/functions/meta-import-creatives/index.ts`

Para aceitar todos os presets oficiais da Meta:
`today, yesterday, this_week_mon_sun, last_week_mon_sun, this_month, last_month, last_7d, last_14d, last_30d, last_90d, maximum`

Mapeamento interno: `this_week → this_week_mon_sun`, `last_week → last_week_mon_sun`.

### 4. Frontend (`src/pages/ClientDetail.tsx`)

- Garantir que o `dateRange` selecionado é enviado em todas as chamadas (campanhas, conjuntos, criativos e PDF) — já está feito via `buildPeriodBody()`, só preciso confirmar que os novos presets passam por ele.
- Atualizar o label exibido no PDF para refletir o novo período (ex.: "Hoje", "Ontem", "Este mês", "Máximo").

### 5. Layout do popover

Reorganizar o popover do `DateRangePicker` em duas colunas para caber bem todos os presets:

```text
┌──────────────────┬────────────────┐
│ Hoje             │                │
│ Ontem            │   Calendário   │
│ Últimos 7 dias   │  Personalizado │
│ Últimos 14 dias  │                │
│ Últimos 30 dias  │                │
│ Últimos 90 dias  │                │
│ Esta semana      │                │
│ Semana passada   │                │
│ Este mês         │                │
│ Mês passado      │                │
│ Máximo           │                │
└──────────────────┴────────────────┘
```

## Arquivos afetados

- `src/components/DateRangePicker.tsx`
- `src/pages/ClientDetail.tsx`
- `src/lib/exportCampaignsPDF.ts` (label de período)
- `supabase/functions/meta-campaign-insights/index.ts`
- `supabase/functions/meta-import-campaigns/index.ts`
- `supabase/functions/meta-import-adsets/index.ts`
- `supabase/functions/meta-import-creatives/index.ts`
