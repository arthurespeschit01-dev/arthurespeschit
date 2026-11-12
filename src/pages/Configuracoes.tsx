import {Link} from 'react-router-dom';
import {settingsResources} from '@/lib/navigation';
import AgencyWhatsApp from '@/components/AgencyWhatsApp';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Bell, Mail, Loader2 } from 'lucide-react';

interface NotifConfig {
  saldo_baixo: boolean;
  saldo_baixo_limite: number;
  contrato_vencimento: boolean;
  pagamento_vencimento: boolean;
  inadimplencia: boolean;
  inadimplencia_dias: number;
  meta_verba: boolean;
  meta_alerta_pct: number;
  task_vencendo: boolean;
}

const defaultConfig: NotifConfig = {
  saldo_baixo: false,
  saldo_baixo_limite: 500,
  contrato_vencimento: false,
  pagamento_vencimento: false,
  inadimplencia: false,
  inadimplencia_dias: 3,
  meta_verba: false,
  meta_alerta_pct: 20,
  task_vencendo: false,
};

export default function Configuracoes() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [emailAtivo, setEmailAtivo] = useState(false);
  const [emailDestino, setEmailDestino] = useState('');
  const [cfg, setCfg] = useState<NotifConfig>(defaultConfig);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from('profiles')
        .select('notif_email, notif_email_destino, notif_config')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data) {
        setEmailAtivo(!!data.notif_email);
        setEmailDestino(data.notif_email_destino || user.email || '');
        setCfg({ ...defaultConfig, ...(data.notif_config as any) });
      } else {
        setEmailDestino(user.email || '');
      }
      setLoading(false);
    })();
  }, [user]);

  const setField = <K extends keyof NotifConfig>(k: K, v: NotifConfig[K]) =>
    setCfg(prev => ({ ...prev, [k]: v }));

  const salvar = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from('profiles').upsert({
      user_id: user.id,
      notif_email: emailAtivo,
      notif_email_destino: emailDestino || null,
      notif_config: cfg as any,
    }, { onConflict: 'user_id' });
    setSaving(false);
    if (error) toast.error('Erro ao salvar: ' + error.message);
    else toast.success('Configurações salvas');
  };

  const enviarTeste = async () => {
    if (!emailDestino) { toast.error('Informe um email de destino'); return; }
    setTesting(true);
    const { data, error } = await supabase.functions.invoke('enviar-email', {
      body: {
        destinatario: emailDestino,
        assunto: '✅ Notificações ativadas — Central do Gestor',
        icone: '✅',
        titulo: 'Tudo funcionando!',
        mensagem: 'Suas notificações estão configuradas. Você receberá alertas conforme as preferências definidas.',
      },
    });
    setTesting(false);
    if (error || (data as any)?.error) toast.error('Falha ao enviar: ' + (error?.message || JSON.stringify((data as any)?.error)));
    else toast.success('Email de teste enviado!');
  };

  if (loading) {
    return <div className="p-8 flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Carregando...</div>;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Bell className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
      </div>

      <section className="rounded-xl border bg-card p-4 sm:p-6 space-y-4" aria-labelledby="settings-resources"><h2 id="settings-resources" className="text-lg font-semibold">Processos e materiais</h2><p className="text-sm text-muted-foreground">Organize os processos e consulte os materiais de apoio da agência.</p><div className="grid sm:grid-cols-2 gap-3">{settingsResources.map(item=><Link key={item.to} to={item.to} className="rounded-lg border p-4 hover:bg-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><h3 className="font-medium">{item.label}</h3><p className="text-xs text-muted-foreground mt-1">{item.description}</p></Link>)}</div></section>
      <AgencyWhatsApp />

      <div className="bg-card border border-border rounded-xl p-6 space-y-5">
        <div className="flex items-center gap-2 mb-2">
          <Mail className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">Notificações por email</h2>
        </div>

        <div className="space-y-2">
          <Label>Email de destino</Label>
          <Input
            type="email"
            value={emailDestino}
            onChange={(e) => setEmailDestino(e.target.value)}
            placeholder="seu@email.com"
          />
        </div>

        <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border/50">
          <div>
            <p className="font-medium">Ativar notificações por email</p>
            <p className="text-xs text-muted-foreground">Receba alertas no seu email para os gatilhos selecionados abaixo.</p>
          </div>
          <Switch checked={emailAtivo} onCheckedChange={setEmailAtivo} />
        </div>

        {emailAtivo && (
          <div className="space-y-3 pt-2">
            <TriggerRow label="Saldo baixo" desc="Alerta quando alguma conta de anúncios estiver abaixo do limite."
              checked={cfg.saldo_baixo} onCheck={(v) => setField('saldo_baixo', v)}>
              <div className="flex items-center gap-2">
                <Label className="text-xs">Alertar abaixo de R$</Label>
                <Input type="number" className="w-28 h-8" value={cfg.saldo_baixo_limite}
                  onChange={(e) => setField('saldo_baixo_limite', Number(e.target.value))} />
              </div>
            </TriggerRow>

            <TriggerRow label="Vencimento de contrato" desc="Alerta 7 dias e 1 dia antes do vencimento."
              checked={cfg.contrato_vencimento} onCheck={(v) => setField('contrato_vencimento', v)} />

            <TriggerRow label="Vencimento de pagamento" desc="Alerta 3 dias antes e no dia do vencimento."
              checked={cfg.pagamento_vencimento} onCheck={(v) => setField('pagamento_vencimento', v)} />

            <TriggerRow label="Inadimplência" desc="Alerta quando cliente passar X dias em atraso."
              checked={cfg.inadimplencia} onCheck={(v) => setField('inadimplencia', v)}>
              <div className="flex items-center gap-2">
                <Label className="text-xs">Após</Label>
                <Input type="number" className="w-20 h-8" value={cfg.inadimplencia_dias}
                  onChange={(e) => setField('inadimplencia_dias', Number(e.target.value))} />
                <span className="text-xs text-muted-foreground">dias</span>
              </div>
            </TriggerRow>

            <TriggerRow label="Meta Ads — verba acabando" desc="Alerta quando a campanha consumir uma % do orçamento."
              checked={cfg.meta_verba} onCheck={(v) => setField('meta_verba', v)}>
              <div className="flex items-center gap-2">
                <Label className="text-xs">Alertar a partir de</Label>
                <Input type="number" className="w-20 h-8" value={cfg.meta_alerta_pct}
                  onChange={(e) => setField('meta_alerta_pct', Number(e.target.value))} />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
            </TriggerRow>

            <TriggerRow label="Tasks vencendo" desc="Alerta no dia anterior ao prazo da task."
              checked={cfg.task_vencendo} onCheck={(v) => setField('task_vencendo', v)} />
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <Button onClick={salvar} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Salvar
          </Button>
          <Button variant="outline" onClick={enviarTeste} disabled={testing || !emailDestino}>
            {testing && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Enviar email de teste
          </Button>
        </div>
      </div>
    </div>
  );
}

function TriggerRow({ label, desc, checked, onCheck, children }: {
  label: string; desc: string; checked: boolean; onCheck: (v: boolean) => void; children?: React.ReactNode;
}) {
  return (
    <div className="p-4 rounded-lg border border-border/50 bg-background/50 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <p className="font-medium text-sm">{label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
        </div>
        <Switch checked={checked} onCheckedChange={onCheck} />
      </div>
      {checked && children && <div className="pt-2 border-t border-border/30">{children}</div>}
    </div>
  );
}
