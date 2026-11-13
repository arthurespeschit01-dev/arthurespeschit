import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Copy } from "lucide-react";
export function RecordMenu({
  edit,
  toggle,
  remove,
  enabled,
}: {
  edit?: () => void;
  toggle?: () => void;
  remove: () => void;
  enabled: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Opções do registro">
          <MoreHorizontal size={18} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {edit && (
          <DropdownMenuItem disabled={!enabled} onSelect={edit}>
            Editar
          </DropdownMenuItem>
        )}
        {toggle && (
          <DropdownMenuItem disabled={!enabled} onSelect={toggle}>
            Ativar / desativar
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          disabled={!enabled}
          className="text-destructive"
          onSelect={() => {
            if (
              window.confirm(
                "Excluir este registro? Esta ação não pode ser desfeita.",
              )
            )
              remove();
          }}
        >
          Excluir
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
export function ShareLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2 items-center min-w-0">
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="text-primary underline text-xs truncate"
      >
        Abrir link público
      </a>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          void navigator.clipboard
            .writeText(url)
            .then(() => setCopied(true))
            .catch(() => window.prompt("Copie o link:", url));
        }}
      >
        <Copy size={14} />
        {copied ? "Copiado" : "Copiar link"}
      </Button>
    </div>
  );
}
export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="border border-dashed rounded-xl p-6 text-sm text-muted-foreground">
      {children}
    </p>
  );
}
