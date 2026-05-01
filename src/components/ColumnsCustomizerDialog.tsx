import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';

export interface ColumnDef {
  key: string;
  label: string;
  group: string;
}

// Catálogo amplo de métricas disponíveis (espelha as principais do Gerenciador da Meta).
// O banco já popula spend/impressions/clicks/ctr/cpc/cpm/reach/leads/purchases/messages/link_clicks/revenue/engagements/frequency/roas/followers/profile_visits.
// As demais (CPA, CPL, CPM_msg, etc.) são derivadas em campaignMetrics.ts.
export const ALL_METRIC_COLUMNS: ColumnDef[] = [
  // Performance
  { key: 'spend', label: 'Gasto', group: 'Performance' },
  { key: 'impressions', label: 'Impressões', group: 'Performance' },
  { key: 'reach', label: 'Alcance', group: 'Performance' },
  { key: 'frequency', label: 'Frequência', group: 'Performance' },
  { key: 'cpm', label: 'CPM', group: 'Performance' },

  // Cliques
  { key: 'clicks', label: 'Cliques (todos)', group: 'Cliques' },
  { key: 'link_clicks', label: 'Cliques no link', group: 'Cliques' },
  { key: 'ctr', label: 'CTR', group: 'Cliques' },
  { key: 'cpc', label: 'CPC', group: 'Cliques' },

  // Conversões
  { key: 'leads', label: 'Leads', group: 'Conversões' },
  { key: 'cpl', label: 'CPL (Custo por lead)', group: 'Conversões' },
  { key: 'purchases', label: 'Compras', group: 'Conversões' },
  { key: 'cpa', label: 'CPA', group: 'Conversões' },
  { key: 'cpp', label: 'Custo por compra', group: 'Conversões' },
  { key: 'revenue', label: 'Receita', group: 'Conversões' },
  { key: 'roas', label: 'ROAS', group: 'Conversões' },

  // Mensagens
  { key: 'messages', label: 'Mensagens', group: 'Mensagens' },
  { key: 'cpm_msg', label: 'Custo por mensagem', group: 'Mensagens' },

  // Engajamento
  { key: 'engagements', label: 'Engajamentos', group: 'Engajamento' },
  { key: 'cost_per_engagement', label: 'Custo por engajamento', group: 'Engajamento' },
  { key: 'video_views', label: 'Visualizações de vídeo', group: 'Engajamento' },

  // Perfil
  { key: 'followers', label: 'Novos seguidores', group: 'Perfil' },
  { key: 'cost_per_follower', label: 'Custo por seguidor', group: 'Perfil' },
  { key: 'profile_visits', label: 'Visitas ao perfil', group: 'Perfil' },
];

const DEFAULT_VISIBLE = ['spend', 'reach', 'impressions', 'cpm', 'frequency'];

interface Props {
  open: boolean;
  onClose: () => void;
  visibleKeys: string[];
  onChange: (keys: string[]) => void;
}

export default function ColumnsCustomizerDialog({ open, onClose, visibleKeys, onChange }: Props) {
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<string[]>(visibleKeys);

  // Sincroniza o draft sempre que o dialog reabrir.
  useMemo(() => { if (open) setDraft(visibleKeys); }, [open]);

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = ALL_METRIC_COLUMNS.filter(c =>
      !q || c.label.toLowerCase().includes(q) || c.key.toLowerCase().includes(q)
    );
    const map = new Map<string, ColumnDef[]>();
    for (const c of filtered) {
      if (!map.has(c.group)) map.set(c.group, []);
      map.get(c.group)!.push(c);
    }
    return Array.from(map.entries());
  }, [query]);

  const toggle = (key: string) => {
    setDraft(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const apply = () => { onChange(draft); onClose(); };
  const markAll = () => setDraft(ALL_METRIC_COLUMNS.map(c => c.key));
  const clear = () => setDraft([]);
  const reset = () => setDraft(DEFAULT_VISIBLE);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Personalizar colunas</DialogTitle>
          <DialogDescription>
            Escolha quais métricas aparecem nas tabelas de Campanhas, Conjuntos e Anúncios.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar métrica..."
            className="pl-9"
          />
        </div>

        <div className="flex-1 overflow-y-auto pr-1 space-y-4">
          {grouped.length === 0 && (
            <p className="text-xs text-muted-foreground py-6 text-center">Nenhuma métrica encontrada.</p>
          )}
          {grouped.map(([group, items]) => (
            <div key={group}>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">{group}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {items.map(c => (
                  <label
                    key={c.key}
                    className="flex items-center gap-2 text-xs p-2 rounded border border-border/40 hover:bg-secondary/40 cursor-pointer"
                  >
                    <Checkbox
                      checked={draft.includes(c.key)}
                      onCheckedChange={() => toggle(c.key)}
                    />
                    <span>{c.label}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap justify-between items-center gap-2 pt-3 border-t border-border/40">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={markAll}>Marcar todas</Button>
            <Button variant="outline" size="sm" onClick={clear}>Limpar</Button>
            <Button variant="ghost" size="sm" onClick={reset}>Padrão</Button>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={apply}>Aplicar ({draft.length})</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { DEFAULT_VISIBLE as DEFAULT_VISIBLE_COLUMNS };
