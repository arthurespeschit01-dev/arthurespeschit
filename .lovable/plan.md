## Objetivo

Reorganizar o gerador de Relatórios Diários para que a escolha do **tipo de campanha** e da **variação (Resumo Rápido / Detalhado / Executivo)** aconteça **dentro do card "Configurações"**, em frente ao "Cliente" — substituindo o dropdown "Template" atual. Sem passos prévios em tela cheia.

## Layout final do card "Configurações"

```text
┌─ Configurações ──────────────────────────────────────────────┐
│  Modelo do relatório                                         │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ Tipo de campanha                                     │    │
│  │ [💬 Mensagens] [🛒 Vendas] [🖱 Tráfego] [📢 Alcance] │    │
│  │ [❤️ Engajamento] [📋 Leads] [🎥 Vídeo] [⚙️ Person.] │    │
│  │                                                      │    │
│  │ Modelo (após escolher tipo)                          │    │
│  │ ┌──────────┐ ┌──────────┐ ┌──────────┐               │    │
│  │ │ Resumo   │ │Detalhado │ │Executivo │               │    │
│  │ │ Rápido ✓ │ │          │ │          │               │    │
│  │ └──────────┘ └──────────┘ └──────────┘               │    │
│  │                          ✏ Personalizar este template│    │
│  │ ─────────────────────────────────────────────────    │    │
│  │ Ou usar um template salvo  [ Selecionar... ▾ ]       │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  Cliente   [ Selecionar... ▾ ]                               │
│  Período   [Hoje][Ontem][7d][Mês][Personalizado]             │
│  Campanhas a incluir ...                                     │
│  [ Gerar relatório ]                                         │
└──────────────────────────────────────────────────────────────┘
```

## Mudanças de comportamento

- **Remover** as duas telas em passos (`step === 'kind'` e `step === 'variant'`). Não há mais navegação por passos antes de chegar nas configurações.
- **Tipo de campanha** vira uma fileira de chips com emoji + nome. Clicar destaca em roxo.
  - Ao escolher um tipo, a variação atual (`short` por padrão) é auto-selecionada.
  - Clicar em "⚙️ Personalizado" abre direto o editor com um template em branco.
- **Variação** aparece logo abaixo, em 3 cards compactos (Resumo Rápido / Detalhado / Executivo). Card ativo destacado em roxo, com badge "PRÉ-PRONTO".
- **Personalizar este template**: link discreto à direita dos cards de variação que abre o editor com o conteúdo do preset selecionado pré-carregado.
- **Atalho para template salvo**: dropdown "Ou usar um template salvo" mantido dentro do mesmo bloco, separado por uma linha. Selecionar um template salvo limpa a seleção de tipo/variação.
- **Botão "Gerar relatório"**: continua habilitado quando há (preset OU template salvo) + cliente + ≥1 campanha selecionada.

## Mudanças técnicas

Arquivo: `src/pages/RelatoriosDiarios.tsx`, função `ReportGenerator`.

1. Remover o estado `step` e o `if (step === 'kind') return ...` / `if (step === 'variant') return ...`.
2. Manter os estados `selectedKind` e `selectedPreset`.
3. Manter o estado `templateId` (continua suportando entrada via lista de templates salvos).
4. Substituir o dropdown "Template" atual por um sub-bloco "Modelo do relatório" dentro do `Card` de Configurações, contendo:
   - Linha de chips com `REPORT_KINDS`.
   - Grid de 3 botões com as variações `getPresetsByKind(selectedKind)`.
   - Link "Personalizar este template" → `onCustomize(...)`.
   - `<Select>` opcional de templates salvos.
5. Lógica de seleção mutuamente exclusiva: escolher preset limpa `templateId`; escolher template salvo limpa `selectedKind`/`selectedPreset`.
6. Banner roxo de "selecionado" no topo (introduzido na iteração anterior) é removido — a própria área de modelo já mostra a seleção ativa.
7. `generate()` continua usando `selectedPreset?.blocks` quando presente, senão `templates.find(t => t.id === templateId)?.blocks`.

## Fora de escopo

- Lista de templates salvos (`TemplatesList`), editor (`TemplateEditor`), variáveis e geração de mensagem permanecem inalterados.
- Sem mudança de banco de dados.
