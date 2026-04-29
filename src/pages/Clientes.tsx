import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Edit2, Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import AccountBalancesPanel, { getBalanceStatus, type AccountBalance } from '@/components/AccountBalancesPanel';

interface AccountIds {
  bm?: string;
  google_ads?: string;
  tiktok_ads?: string;
  linkedin_ads?: string;
  [key: string]: string | undefined;
}

interface Client {
  id: string;
  name: string;
  services: string;
  monthly_fee: number;
  contract_duration: string;
  status: string;
  payment_day: number | null;
  account_ids: AccountIds;
  verba_mensal: number;
  niche: string;
  phone: string;
}

export default function Clientes() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [clients, setClients] = useState<Client[]>([]);
  const [open, setOpen] = useState(false);
  const [balanceAccounts, setBalanceAccounts] = useState<AccountBalance[]>([]);
  const [editing, setEditing] = useState<Client | null>(null);

  const problemCount = balanceAccounts.filter(a => {
    const s = getBalanceStatus(a);
    return s === 'low' || s === 'empty' || s === 'error';
  }).length;
  const [form, setForm] = useState({
    name: '', services: '', monthly_fee: 0, contract_duration: '', status: 'Ativo',
    payment_day: '' as string, verba_mensal: 0, niche: '', phone: '',
    account_ids: { bm: '', google_ads: '', tiktok_ads: '', linkedin_ads: '' } as AccountIds,
  });

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from('clients').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    setClients((data || []).map(d => ({
      ...d,
      account_ids: (d.account_ids as AccountIds) || {},
      verba_mensal: (d as any).verba_mensal ?? 0,
      niche: (d as any).niche ?? '',
      phone: (d as any).phone ?? '',
    })));
  };

  useEffect(() => { load(); }, [user]);

  const openNew = () => {
    setEditing(null);
    setForm({ name: '', services: '', monthly_fee: 0, contract_duration: '', status: 'Ativo', payment_day: '', verba_mensal: 0, niche: '', phone: '', account_ids: { bm: '', google_ads: '', tiktok_ads: '', linkedin_ads: '' } });
    setOpen(true);
  };

  const openEdit = (c: Client, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditing(c);
    setForm({
      name: c.name, services: c.services, monthly_fee: c.monthly_fee, contract_duration: c.contract_duration, status: c.status,
      payment_day: c.payment_day ? String(c.payment_day) : '',
      verba_mensal: c.verba_mensal || 0, niche: c.niche || '', phone: c.phone || '',
      account_ids: { bm: '', google_ads: '', tiktok_ads: '', linkedin_ads: '', ...c.account_ids },
    });
    setOpen(true);
  };

  const save = async () => {
    if (!user) return;
    if (!form.name.trim()) { toast.error('Informe o nome do cliente'); return; }
    if (!form.niche.trim()) { toast.error('Informe o nicho do cliente'); return; }
    if (!form.verba_mensal || form.verba_mensal <= 0) { toast.error('Informe a verba mensal'); return; }
    const payload = {
      name: form.name, services: form.services, monthly_fee: form.monthly_fee,
      contract_duration: form.contract_duration, status: form.status,
      payment_day: form.payment_day ? Number(form.payment_day) : null,
      account_ids: form.account_ids,
      verba_mensal: form.verba_mensal,
      niche: form.niche,
      phone: form.phone,
    };
    if (editing) {
      await supabase.from('clients').update(payload).eq('id', editing.id);
      toast.success('Cliente atualizado!');
    } else {
      await supabase.from('clients').insert({ ...payload, user_id: user.id });
      toast.success('Cliente criado!');
    }
    setOpen(false);
    load();
  };

  const remove = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await supabase.from('clients').delete().eq('id', id);
    toast.success('Cliente removido!');
    load();
  };

  const statusColor = (s: string) => {
    if (s === 'Ativo') return 'bg-emerald-500/20 text-emerald-400';
    if (s === 'Pausado') return 'bg-amber-500/20 text-amber-400';
    return 'bg-red-500/20 text-red-400';
  };

  const updateAccountId = (key: string, value: string) => {
    setForm(prev => ({ ...prev, account_ids: { ...prev.account_ids, [key]: value } }));
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            Clientes
            {problemCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full bg-red-500/15 text-red-400 border border-red-500/30">
                <AlertTriangle className="w-3 h-3" />
                {problemCount} {problemCount === 1 ? 'conta sem saldo' : 'contas sem saldo'}
              </span>
            )}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Gerencie seus clientes</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={openNew} className="neon-glow gap-2"><Plus className="w-4 h-4" /> Novo Cliente</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {clients.map((c) => (
          <div key={c.id} onClick={() => navigate(`/clientes/${c.id}`)} className="glass-surface rounded-xl p-5 cursor-pointer hover:border-primary/30 transition-all group">
            <div className="flex items-start justify-between mb-2">
              <h3 className="font-semibold text-foreground">{c.name}</h3>
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColor(c.status)}`}>{c.status}</span>
            </div>
            {c.niche && (
              <span className="inline-block text-[11px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium mb-2">{c.niche}</span>
            )}
            <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{c.services}</p>
            <div className="space-y-1.5 text-sm border-t border-border/50 pt-3">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-xs">Fee mensal</span>
                <span className="text-foreground font-medium">R$ {c.monthly_fee?.toLocaleString('pt-BR')}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-xs">Verba mensal</span>
                <span className="text-primary font-semibold">R$ {(c.verba_mensal || 0).toLocaleString('pt-BR')}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-xs">Duração</span>
                <span className="text-foreground">{c.contract_duration || '—'}</span>
              </div>
            </div>
            {c.payment_day && (
              <p className="text-xs text-muted-foreground mt-2">📅 Pagamento dia {c.payment_day}</p>
            )}
            <div className="flex gap-2 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button variant="ghost" size="sm" onClick={(e) => openEdit(c, e)}><Edit2 className="w-3 h-3" /></Button>
              <Button variant="ghost" size="sm" onClick={(e) => remove(c.id, e)} className="hover:text-destructive"><Trash2 className="w-3 h-3" /></Button>
            </div>
          </div>
        ))}
        {clients.length === 0 && (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            Nenhum cliente cadastrado. Clique em "Novo Cliente" para começar.
          </div>
        )}
      </div>

      {/* Painel de Saldos das Contas de Anúncio */}
      <AccountBalancesPanel onAccountsChange={setBalanceAccounts} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Cliente' : 'Novo Cliente'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label className="text-muted-foreground text-sm">Nome do cliente *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-muted-foreground text-sm">Nicho *</Label><Input value={form.niche} onChange={(e) => setForm({ ...form, niche: e.target.value })} placeholder="Ex: Estética, E-commerce, SaaS" className="bg-secondary/50 border-border/50 mt-1" /></div>
              <div><Label className="text-muted-foreground text-sm">Verba mensal (R$) *</Label><Input type="number" value={form.verba_mensal} onChange={(e) => setForm({ ...form, verba_mensal: Number(e.target.value) })} placeholder="Ex: 5000" className="bg-secondary/50 border-border/50 mt-1" /></div>
            </div>
            <div><Label className="text-muted-foreground text-sm">Serviços</Label><Textarea value={form.services} onChange={(e) => setForm({ ...form, services: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-muted-foreground text-sm">Fee mensal (R$)</Label><Input type="number" value={form.monthly_fee} onChange={(e) => setForm({ ...form, monthly_fee: Number(e.target.value) })} className="bg-secondary/50 border-border/50 mt-1" /></div>
              <div><Label className="text-muted-foreground text-sm">Duração</Label><Input value={form.contract_duration} onChange={(e) => setForm({ ...form, contract_duration: e.target.value })} placeholder="6 meses" className="bg-secondary/50 border-border/50 mt-1" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-muted-foreground text-sm">Dia de pagamento</Label><Input type="number" min={1} max={31} value={form.payment_day} onChange={(e) => setForm({ ...form, payment_day: e.target.value })} placeholder="Ex: 10" className="bg-secondary/50 border-border/50 mt-1" /></div>
              <div><Label className="text-muted-foreground text-sm">WhatsApp / Telefone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Ex: 11999998888 (com DDD)" className="bg-secondary/50 border-border/50 mt-1" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div></div>
              <div>
                <Label className="text-muted-foreground text-sm">Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger className="bg-secondary/50 border-border/50 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="Ativo">Ativo</SelectItem>
                    <SelectItem value="Pausado">Pausado</SelectItem>
                    <SelectItem value="Encerrado">Encerrado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Account IDs */}
            <div className="space-y-3 pt-2 border-t border-border">
              <Label className="text-foreground text-sm font-semibold">IDs das Contas</Label>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-muted-foreground text-xs">BM (Business Manager)</Label><Input value={form.account_ids.bm || ''} onChange={(e) => updateAccountId('bm', e.target.value)} placeholder="ID da BM" className="bg-secondary/50 border-border/50 mt-1 text-sm" /></div>
                <div><Label className="text-muted-foreground text-xs">Google Ads</Label><Input value={form.account_ids.google_ads || ''} onChange={(e) => updateAccountId('google_ads', e.target.value)} placeholder="ID Google Ads" className="bg-secondary/50 border-border/50 mt-1 text-sm" /></div>
                <div><Label className="text-muted-foreground text-xs">TikTok Ads</Label><Input value={form.account_ids.tiktok_ads || ''} onChange={(e) => updateAccountId('tiktok_ads', e.target.value)} placeholder="ID TikTok Ads" className="bg-secondary/50 border-border/50 mt-1 text-sm" /></div>
                <div><Label className="text-muted-foreground text-xs">LinkedIn Ads</Label><Input value={form.account_ids.linkedin_ads || ''} onChange={(e) => updateAccountId('linkedin_ads', e.target.value)} placeholder="ID LinkedIn Ads" className="bg-secondary/50 border-border/50 mt-1 text-sm" /></div>
              </div>
            </div>

            <Button onClick={save} className="w-full neon-glow">Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
