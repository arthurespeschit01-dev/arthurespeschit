import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { MessageCircle, Copy } from 'lucide-react';
import { toast } from 'sonner';

export type Tom = 'amigavel' | 'formal' | 'firme';

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function buildCobrancaIndividual(tom: Tom, clienteName: string, valor: number, vencimento: string) {
  const venc = new Date(vencimento + 'T00:00:00').toLocaleDateString('pt-BR');
  const primeiroNome = (clienteName || '').split(' ')[0] || clienteName;
  if (tom === 'amigavel') {
    return `Olá, ${primeiroNome}! Tudo bem? 👋\n\nPassando para lembrar que a sua mensalidade no valor de ${fmt(valor)}, com vencimento em ${venc}, está em aberto por aqui.\n\nQuando puder, poderia confirmar o pagamento? Se já realizou, é só me enviar o comprovante que dou baixa imediatamente. 😉\n\nQualquer dúvida sobre boleto, PIX ou nota fiscal, é só me chamar que resolvo rapidinho.\n\nObrigado pela parceria! 🙏`;
  }
  if (tom === 'formal') {
    return `Prezado(a) ${clienteName},\n\nEspero que esteja bem. Entro em contato para informar que identificamos em nosso sistema a mensalidade no valor de ${fmt(valor)}, com vencimento em ${venc}, ainda em aberto.\n\nSolicito a gentileza de regularizar o pagamento ou, caso já tenha sido efetuado, encaminhar o respectivo comprovante para baixa em nosso controle.\n\nPermaneço à disposição para esclarecimentos sobre boleto, PIX ou emissão de nota fiscal.\n\nAtenciosamente.`;
  }
  return `${primeiroNome}, tudo bem?\n\nEstou retomando o contato sobre a mensalidade de ${fmt(valor)}, com vencimento em ${venc}, que segue em aberto até o momento.\n\nPreciso da regularização nos próximos dias para mantermos as entregas e os serviços ativos sem qualquer interrupção. Se o pagamento já foi feito, por favor, encaminhe o comprovante hoje para que eu possa dar baixa.\n\nFico no aguardo da sua confirmação. Obrigado.`;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clienteName: string;
  valor: number;
  vencimento: string;
}

export default function CobrancaDialog({ open, onOpenChange, clienteName, valor, vencimento }: Props) {
  const [tom, setTom] = useState<Tom>('amigavel');
  const [texto, setTexto] = useState('');

  useEffect(() => {
    if (open) {
      setTom('amigavel');
      setTexto(buildCobrancaIndividual('amigavel', clienteName, valor, vencimento));
    }
  }, [open, clienteName, valor, vencimento]);

  const trocarTom = (t: Tom) => {
    setTom(t);
    setTexto(buildCobrancaIndividual(t, clienteName, valor, vencimento));
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success('Mensagem copiada! Cole no WhatsApp do cliente.');
    } catch {
      toast.error('Não foi possível copiar. Selecione e copie manualmente.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-emerald-400" />
            Cobrança — {clienteName}
          </DialogTitle>
          <DialogDescription>
            Mensagem pronta para você copiar e enviar no WhatsApp do cliente. Ajuste o texto se quiser antes de copiar.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Tom da mensagem</Label>
          <div className="flex gap-2 flex-wrap">
            {([
              { id: 'amigavel', label: '😊 Amigável' },
              { id: 'formal', label: '🎩 Formal' },
              { id: 'firme', label: '🔥 Firme' },
            ] as { id: Tom; label: string }[]).map(t => (
              <Button
                key={t.id}
                size="sm"
                variant={tom === t.id ? 'default' : 'outline'}
                onClick={() => trocarTom(t.id)}
                className={tom === t.id ? 'bg-primary text-primary-foreground' : ''}
              >
                {t.label}
              </Button>
            ))}
          </div>
        </div>
        <Textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={12}
          className="font-mono text-sm leading-relaxed whitespace-pre-wrap"
        />
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button onClick={copiar} className="bg-emerald-500 hover:bg-emerald-600 text-white gap-2">
            <Copy className="w-4 h-4" /> Copiar mensagem
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
