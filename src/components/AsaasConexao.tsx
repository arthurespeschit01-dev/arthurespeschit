// Configurações → Cobrança automática (Asaas): cada agência conecta a própria conta
import { useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, CreditCard, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { conectarAsaas, desconectarAsaas, useAsaasDisponivel } from '@/lib/asaasSync';

const LINK_CHAVE = { sandbox: 'https://sandbox.asaas.com/customerApiAccessToken/index', production: 'https://www.asaas.com/customerApiAccessToken/index' };

export default function AsaasConexao() {
  const estado = useAsaasDisponivel();
  const [editando, setEditando] = useState(false);
  const [ambiente, setAmbiente] = useState<'sandbox' | 'production'>('production');
  const [chave, setChave] = useState('');
  const [salvando, setSalvando] = useState(false);

  const conectar = async () => {
    setSalvando(true);
    try {
      const r = await conectarAsaas(chave, ambiente);
      toast.success(`Asaas conectado${r.conta_nome ? ` (${r.conta_nome})` : ''}.`);
      setChave(''); setEditando(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setSalvando(false); }
  };

  const desconectar = async () => {
    if (!window.confirm('Desconectar o Asaas? As cobranças já criadas continuam no Asaas, mas a Central para de criar e de receber atualizações.')) return;
    setSalvando(true);
    try { await desconectarAsaas(); toast.success('Asaas desconectado.'); }
    catch (e) { toast.error((e as Error).message); }
    finally { setSalvando(false); }
  };

  const conectado = estado.habilitado && !estado.legado;
  const mostrarFormulario = estado.pode_configurar && (editando || !estado.habilitado || estado.legado);

  return (
    <section className="rounded-xl border bg-card p-5 space-y-4" aria-labelledby="asaas-titulo">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-primary" />
          <div>
            <h2 id="asaas-titulo" className="text-lg font-semibold">Cobrança automática (Asaas)</h2>
            <p className="text-sm text-muted-foreground">Crie as cobranças dos clientes no seu Asaas e receba a baixa de pagamento aqui na Central.</p>
          </div>
        </div>
        {estado.carregando ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : estado.habilitado && (
          <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center gap-1 shrink-0">
            <CheckCircle2 className="w-3.5 h-3.5" /> Conectado{estado.ambiente === 'sandbox' ? ' · teste' : ''}
          </span>
        )}
      </div>

      {estado.habilitado && !editando && (
        <div className="rounded-lg border border-border/50 p-3 text-sm space-y-1">
          {estado.conta_nome && <p><span className="text-muted-foreground">Conta:</span> {estado.conta_nome}</p>}
          <p><span className="text-muted-foreground">Ambiente:</span> {estado.ambiente === 'production' ? 'Produção (cobranças reais)' : 'Sandbox (teste)'}</p>
          <p><span className="text-muted-foreground">Avisos de pagamento:</span> {estado.webhook ? 'ativos' : 'pendentes — reabra esta tela em instantes'}</p>
          {estado.legado && <p className="text-xs text-amber-400 pt-1">Conexão antiga. Conecte de novo abaixo para guardar a chave com segurança nesta tela.</p>}
        </div>
      )}

      {!estado.carregando && !estado.pode_configurar && !estado.habilitado && (
        <p className="text-sm text-muted-foreground">Peça ao dono da agência para conectar o Asaas.</p>
      )}

      {mostrarFormulario && !estado.carregando && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-muted-foreground text-sm">Ambiente</Label>
              <Select value={ambiente} onValueChange={(v) => setAmbiente(v as 'sandbox' | 'production')}>
                <SelectTrigger className="bg-secondary/50 border-border/50 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="production">Produção (cobranças reais)</SelectItem>
                  <SelectItem value="sandbox">Sandbox (teste)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label className="text-muted-foreground text-sm">Chave de API do Asaas</Label>
              <Input type="password" autoComplete="off" value={chave} onChange={(e) => setChave(e.target.value)} placeholder="$aact_..." className="bg-secondary/50 border-border/50 mt-1" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            No Asaas: Integrações → Chaves de API → Gerar chave.{' '}
            <a href={LINK_CHAVE[ambiente]} target="_blank" rel="noopener noreferrer" className="text-primary inline-flex items-center gap-1 hover:underline">Abrir <ExternalLink className="w-3 h-3" /></a>
            {' '}A chave fica guardada criptografada e não aparece de novo.
          </p>
          <div className="flex gap-2">
            <Button onClick={conectar} disabled={salvando || chave.trim().length < 20}>
              {salvando && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Conectar
            </Button>
            {editando && <Button variant="ghost" onClick={() => setEditando(false)}>Cancelar</Button>}
          </div>
        </div>
      )}

      {conectado && !editando && estado.pode_configurar && (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditando(true)}>Trocar chave ou ambiente</Button>
          <Button variant="ghost" size="sm" onClick={desconectar} disabled={salvando}>Desconectar</Button>
        </div>
      )}
    </section>
  );
}
