import { ExternalLink } from 'lucide-react';

export default function Planilha() {
  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Planilha de Acompanhamento</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Acompanhamento de performance por cliente
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <a
          href="https://docs.google.com/spreadsheets/d/1xeOxh4KHEcMjkZ5qynEQ7wWqGx53xHVuvH_9lZgoyiY/edit?usp=sharing"
          target="_blank"
          rel="noopener noreferrer"
          className="glass-surface rounded-xl p-6 flex flex-col items-center gap-4 hover:border-primary/50 transition-colors group"
        >
          <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-lg">
            📊
          </div>
          <h3 className="font-semibold text-foreground text-center">Planilha de Acompanhamento</h3>
          <span className="text-xs text-muted-foreground flex items-center gap-1 group-hover:text-primary transition-colors">
            Abrir no Google Sheets <ExternalLink className="w-3 h-3" />
          </span>
        </a>
      </div>
    </div>
  );
}
