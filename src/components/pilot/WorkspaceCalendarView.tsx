import { useState } from "react";
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Appointment } from "@/lib/workspaceCommercial";

export default function WorkspaceCalendarView({
  appointments,
  onSelect,
}: {
  appointments: Appointment[];
  onSelect: (id: string) => void;
}) {
  const [date, setDate] = useState(() => new Date());
  const [view, setView] = useState<"month" | "week">("month");
  const start = startOfWeek(view === "month" ? startOfMonth(date) : date, {
    weekStartsOn: 1,
  });
  const end = endOfWeek(view === "month" ? endOfMonth(date) : date, {
    weekStartsOn: 1,
  });
  const days = eachDayOfInterval({ start, end });
  const move = (n: number) =>
    setDate(view === "month" ? addMonths(date, n) : addWeeks(date, n));
  const time = (value: string) => format(new Date(value), "HH:mm");
  return (
    <section
      aria-label="Calendário de agendamentos"
      className="border rounded-xl bg-card overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-1">
          <Button variant="outline" onClick={() => setDate(new Date())}>
            Hoje
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Período anterior"
            onClick={() => move(-1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Próximo período"
            onClick={() => move(1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <h3 aria-live="polite" className="font-semibold capitalize">
            {view === "month"
              ? format(date, "MMMM yyyy", { locale: ptBR })
              : `${format(start, "dd MMM", { locale: ptBR })} – ${format(addDays(start, 6), "dd MMM yyyy", { locale: ptBR })}`}
          </h3>
        </div>
        <div className="flex gap-1" aria-label="Visualização do calendário">
          <Button
            variant={view === "week" ? "default" : "outline"}
            aria-pressed={view === "week"}
            onClick={() => setView("week")}
          >
            Semana
          </Button>
          <Button
            variant={view === "month" ? "default" : "outline"}
            aria-pressed={view === "month"}
            onClick={() => setView("month")}
          >
            Mês
          </Button>
        </div>
      </div>
      <p className="px-4 pb-3 text-xs text-muted-foreground">
        Horários no fuso do seu dispositivo. Selecione um compromisso para ver
        os detalhes.
      </p>
      <div className="overflow-x-auto">
        <div className="min-w-[700px]">
          <div className="grid grid-cols-7 border-t">
            {days.slice(0, 7).map((day) => (
              <div
                key={day.toISOString()}
                className="text-center p-2 text-xs font-medium text-muted-foreground"
              >
                {format(day, "EEEE", { locale: ptBR })}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day) => (
              <div
                key={day.toISOString()}
                className={`border-t border-r p-2 ${view === "week" ? "min-h-[320px]" : "min-h-[130px]"} ${!isSameMonth(day, date) && view === "month" ? "bg-muted/30" : ""}`}
              >
                <div
                  className={`mb-2 flex h-7 w-7 items-center justify-center rounded-full text-sm ${isSameDay(day, new Date()) ? "bg-primary text-primary-foreground" : ""}`}
                >
                  {format(day, "d")}
                </div>
                <div className="space-y-1">
                  {appointments
                    .filter((a) => isSameDay(new Date(a.starts_at), day))
                    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
                    .map((a) => (
                      <button
                        type="button"
                        key={a.id}
                        onClick={() => onSelect(a.id)}
                        className={`block w-full rounded border-l-2 border-primary bg-primary/10 p-1.5 text-left text-xs hover:bg-primary/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${a.status === "cancelled" ? "line-through opacity-50" : ""}`}
                        title={`${a.name} · ${time(a.starts_at)}–${time(a.ends_at)}`}
                      >
                        <span className="font-medium">{time(a.starts_at)}</span>{" "}
                        <span className="break-words">{a.name}</span>
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
