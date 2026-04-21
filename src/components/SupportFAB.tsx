import { MessageCircle } from 'lucide-react';

const SUPPORT_URL = 'https://wa.link/spfu4j';

export default function SupportFAB() {
  return (
    <a
      href={SUPPORT_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Falar com o suporte no WhatsApp"
      title="Suporte via WhatsApp"
      className="fixed bottom-6 right-6 z-50 group flex items-center gap-2 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/30 px-4 py-3 transition-all hover:scale-105 hover:shadow-emerald-500/50"
    >
      <MessageCircle className="w-5 h-5" />
      <span className="text-sm font-medium hidden sm:inline-block max-w-0 overflow-hidden group-hover:max-w-[120px] transition-all duration-300 whitespace-nowrap">
        Suporte
      </span>
      <span className="sr-only sm:hidden">Suporte</span>
      <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-300 animate-ping" />
      <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400" />
    </a>
  );
}
