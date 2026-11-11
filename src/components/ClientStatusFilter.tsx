import {
  CLIENT_STATUSES,
  type ClientStatusFilter as Filter,
} from "@/lib/clientStatus";
import { Button } from "@/components/ui/button";

export default function ClientStatusFilter({
  value,
  onChange,
}: {
  value: Filter;
  onChange: (value: Filter) => void;
}) {
  return (
    <div
      className="flex gap-2 flex-wrap"
      role="group"
      aria-label="Status dos clientes"
    >
      {([...CLIENT_STATUSES, "Todos"] as const).map((status) => (
        <Button
          key={status}
          size="sm"
          variant={value === status ? "default" : "outline"}
          aria-pressed={value === status}
          onClick={() => onChange(status)}
        >
          {status === "Todos"
            ? "Todos os status"
            : status === "Ativo"
              ? "Ativos"
              : status === "Pausado"
                ? "Pausados"
                : "Encerrados"}
        </Button>
      ))}
    </div>
  );
}
