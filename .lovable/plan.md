## Problema

No menu lateral recolhido, o ícone da pasta (Processos) aparece deslocado para a esquerda em relação ao ícone de engrenagem (Configurações).

## Causa

Em `src/components/AppLayout.tsx` (linha ~135), o ícone `Folder` da pasta Processos tem a classe `-translate-x-0.5`, que empurra o ícone 2px para a esquerda. Os demais itens do menu não têm esse deslocamento, então a pasta fica visualmente desalinhada.

Além disso, o novo wrapper que adicionei para Configurações (`<div className="pt-6 mt-2 border-t ...">`) envolve apenas o link, enquanto Processos não está dentro de um wrapper equivalente — isso pode causar uma diferença sutil de alinhamento horizontal por causa do padding/borda.

## Mudanças

Em `src/components/AppLayout.tsx`:

1. Remover `-translate-x-0.5` da classe do ícone `Folder` no modo collapsed para que ele use o mesmo alinhamento dos outros ícones.
2. Garantir que o NavLink colapsado da pasta Processos use exatamente as mesmas classes de alinhamento do NavLink de Configurações (mesmo `px`, mesmo `justify-center`, mesmo tamanho de ícone `w-4 h-4`).
3. Manter a linha separadora/espaçamento que já foi adicionada, aplicada de forma consistente tanto para Configurações quanto para Processos (ambos no mesmo bloco com `border-t` no topo), garantindo que o eixo X dos dois ícones fique idêntico.

Resultado: os dois ícones (engrenagem e pasta) ficam perfeitamente centralizados na mesma coluna vertical da sidebar recolhida.