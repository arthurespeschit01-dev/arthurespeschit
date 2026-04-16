import { ExternalLink } from 'lucide-react';

const modelos = [
  {
    id: 1,
    title: 'Modelo de Contrato 1',
    url: 'https://www.canva.com/design/DAGKGOtZZTw/587r9CqeMz3SKK43jlgRqg/view?utm_content=DAGKGOtZZTw&utm_campaign=designshare&utm_medium=link&utm_source=publishsharelink&mode=preview',
  },
  {
    id: 2,
    title: 'Modelo de Contrato 2',
    url: 'https://www.canva.com/design/DAGKG82qmU4/FqH-UTlBpbe-s0ezQn-slQ/view?utm_content=DAGKG82qmU4&utm_campaign=designshare&utm_medium=link&utm_source=publishsharelink&mode=preview',
  },
  {
    id: 3,
    title: 'Modelo de Contrato 3',
    url: 'https://www.canva.com/design/DAGKG82rA6w/OpSGsIzQSeSN2fRZf2CMGA/view?utm_content=DAGKG82rA6w&utm_campaign=designshare&utm_medium=link&utm_source=publishsharelink&mode=preview',
  },
];

export default function Contratos() {
  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Modelos de Contratos</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Templates prontos para usar com seus clientes
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modelos.map((m) => (
          <a
            key={m.id}
            href={m.url}
            target="_blank"
            rel="noopener noreferrer"
            className="glass-surface rounded-xl p-6 flex flex-col items-center gap-4 hover:border-primary/50 transition-colors group"
          >
            <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-lg">
              {m.id}
            </div>
            <h3 className="font-semibold text-foreground text-center">{m.title}</h3>
            <span className="text-xs text-muted-foreground flex items-center gap-1 group-hover:text-primary transition-colors">
              Abrir no Canva <ExternalLink className="w-3 h-3" />
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
