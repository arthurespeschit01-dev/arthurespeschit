import { useState } from 'react';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export type DatePreset = 'today' | 'yesterday' | 'last_7d' | 'last_14d' | 'last_30d' | 'last_90d' | 'custom';

export interface DateRangeValue {
  preset: DatePreset;
  since?: string; // YYYY-MM-DD
  until?: string;
}

const PRESETS: { value: DatePreset; label: string }[] = [
  { value: 'today', label: 'Hoje' },
  { value: 'yesterday', label: 'Ontem' },
  { value: 'last_7d', label: '7 dias' },
  { value: 'last_14d', label: '14 dias' },
  { value: 'last_30d', label: '30 dias' },
  { value: 'last_90d', label: '90 dias' },
];

export function DateRangePicker({ value, onChange }: { value: DateRangeValue; onChange: (v: DateRangeValue) => void }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState<Date | undefined>(value.since ? new Date(value.since) : undefined);
  const [to, setTo] = useState<Date | undefined>(value.until ? new Date(value.until) : undefined);

  const label = value.preset === 'custom' && value.since && value.until
    ? `${value.since} → ${value.until}`
    : PRESETS.find(p => p.value === value.preset)?.label || '30 dias';

  const applyCustom = () => {
    if (from && to) {
      onChange({
        preset: 'custom',
        since: format(from, 'yyyy-MM-dd'),
        until: format(to, 'yyyy-MM-dd'),
      });
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 h-8 text-xs">
          <CalendarIcon className="w-3 h-3" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <div className="flex">
          <div className="flex flex-col p-2 border-r border-border min-w-[120px]">
            {PRESETS.map(p => (
              <Button
                key={p.value}
                variant={value.preset === p.value ? 'secondary' : 'ghost'}
                size="sm"
                className="justify-start text-xs h-8"
                onClick={() => { onChange({ preset: p.value }); setOpen(false); }}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <div className="p-2">
            <p className="text-xs text-muted-foreground px-2 py-1">Personalizado</p>
            <Calendar
              mode="range"
              selected={{ from, to }}
              onSelect={(r: any) => { setFrom(r?.from); setTo(r?.to); }}
              numberOfMonths={2}
              className={cn('p-3 pointer-events-auto')}
            />
            <div className="flex justify-end gap-2 px-2">
              <Button size="sm" variant="ghost" onClick={() => { setFrom(undefined); setTo(undefined); }}>Limpar</Button>
              <Button size="sm" onClick={applyCustom} disabled={!from || !to}>Aplicar</Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
