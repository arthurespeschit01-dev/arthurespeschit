import ClientBillingFields from '@/components/ClientBillingFields';
import {billingError,firstBillingDate,localDate} from '@/lib/billingSchedule';
import ClientOperationFields from '@/components/ClientOperationFields';
import { useClientProgress, progressLabel, operationFromProgress, emptyOperation, type OperationSelection } from '@/lib/clientProgress';
import ClientStatusFilter from '@/components/ClientStatusFilter';
import { matchesClientStatus, type ClientStatusFilter as StatusFilter } from '@/lib/clientStatus';
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
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { Plus, Edit2, Trash2, AlertTriangle, Link2, ArrowRight, SkipForward } from 'lucide-react';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import AccountBalancesPanel, { getBalanceStatus, type AccountBalance, useAccountBalancesCount } from '@/components/AccountBalancesPanel';

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
  payment_day: number | null; entry_date: string | null; first_payment_date: string | null;
  account_ids: AccountIds;
  verba_mensal: number;
  niche: string;
  phone: string;
}

export default function Clientes() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const progress = useClientProgress();
  const [operation, setOperation] = useState<OperationSelection>({ ...emptyOperation });
  const [saving, setSaving] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('Ativo');
  const visibleClients = clients.filter(c => matchesClientStatus(c, statusFilter));
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'meta' | 'select-account' | 'form'>('meta');
  const [balanceAccounts, setBalanceAccounts] = useState<AccountBalance[]>([]);
  const [editing, setEditing] = useState<Client | null>(null);
  const [metaPending, setMetaPending] = useState(false);
  const [adAccounts, setAdAccounts] = useState<{ id: string; name: string; account_status?: number; currency?: string }[]>([]);
  const [loadingAdAccounts, setLoadingAdAccounts] = useState(false);
  const [selectedAdAccountId, setSelectedAdAccountId] = useState<string>('');
  const [confirmingAccount, setConfirmingAccount] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Client | null>(null);
  const { accounts: preloadedBalanceAccounts, refresh: refreshBalances } = useAccountBalancesCount();

  useEffect(() => {
    setBalanceAccounts(preloadedBalanceAccounts);
  }, [preloadedBalanceAccounts]);

  const problemAccounts = balanceAccounts.filter(a => {
    const s = getBalanceStatus(a);
    return s === 'low' || s === 'empty' || s === 'error';
  });
  const problemCount = problemAccounts.length;
  const fmtMoney = (v: number | undefined | null, currency = 'BRL') => {
    if (v === undefined || v === null) return '—';
    try { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(v); }
    catch { return `R$ ${(v as number).toFixed(2)}`; }
  };
  const reasonOf = (a: AccountBalance) => {
    const s = getBalanceStatus(a);
    if (a.error) return a.error;
    if (a.account_status_label) return a.account_status_label;
    if (s === 'empty') return 'Sem saldo';
    if (s === 'low') return `Saldo baixo (${fmtMoney(a.available_balance ?? a.balance ?? 0, a.currency)})`;
    return 'Problema';
  };
  const [form, setForm] = useState({
    name: '', services: '', monthly_fee: 0, contract_duration: '', status: 'Ativo',
    entry_date: localDate(), first_payment_date: firstBillingDate(localDate(),5), payment_day: '' as string, verba_mensal: 0, niche: '', phone: '',
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

  // Listener para popup do Meta (legado / fallback) e detecção de retorno via redirect top-level
  useEffect(() => {
    const handler = (ev: MessageEvent) => {
      if (ev.data?.type === 'meta-oauth') {
        if (ev.data.ok) {
          setMetaPending(true);
          toast.success('Meta conectada! Será vinculada ao cliente após salvar.');
        } else {
          toast.error('Falha ao conectar Meta');
        }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // Detecta retorno do OAuth Meta (top-level redirect) durante o onboarding
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const metaParam = params.get('meta');
    if (!metaParam) return;
    const savedRaw = localStorage.getItem('meta-onboarding-form');
    // Limpa os params da URL imediatamente
    const cleanUrl = window.location.pathname;
    window.history.replaceState({}, '', cleanUrl);
    if (metaParam === 'ok') {
      if (savedRaw) {
        try {
          const saved = JSON.parse(savedRaw);
          setForm(current=>({...current,...saved.form,entry_date:saved.form.entry_date??current.entry_date,first_payment_date:saved.form.first_payment_date??current.first_payment_date}));
        } catch { /* ignore */ }
      }
      setMetaPending(true);
      setStep('select-account');
      setOpen(true);
      loadAdAccounts();
      toast.success('Meta conectada! Selecione a conta de anúncio.');
    } else {
      toast.error('Falha ao conectar Meta: ' + (params.get('msg') || 'erro desconhecido'));
    }
    localStorage.removeItem('meta-onboarding-form');
  }, []);

  const loadAdAccounts = async () => {
    setLoadingAdAccounts(true);
    try {
      const { data, error } = await supabase.functions.invoke('meta-pending-ad-accounts', { body: {} });
      if (error) throw error;
      setAdAccounts(data?.accounts || []);
      if (data?.selected_ad_account_id) setSelectedAdAccountId(data.selected_ad_account_id);
    } catch (e: any) {
      toast.error('Falha ao listar contas: ' + (e?.message || 'erro'));
      setAdAccounts([]);
    } finally {
      setLoadingAdAccounts(false);
    }
  };

  const confirmAdAccount = async () => {
    if (!selectedAdAccountId) { toast.error('Selecione uma conta'); return; }
    setConfirmingAccount(true);
    try {
      const { data, error } = await supabase.functions.invoke('meta-pending-ad-accounts', {
        body: { select_account_id: selectedAdAccountId },
      });
      if (error || data?.error) throw new Error(error?.message || data?.error);
      toast.success('Conta selecionada!');
      setStep('form');
    } catch (e: any) {
      toast.error('Falha ao confirmar conta: ' + (e?.message || 'erro'));
    } finally {
      setConfirmingAccount(false);
    }
  };

  const openNew = async () => {
    setMetaPending(false);
    setEditing(null);
    setOperation({ phase: "execution", pipeline_id: "", stage_id: "" });
    setAdAccounts([]);
    setSelectedAdAccountId('');
    setForm({ name: '', services: '', monthly_fee: 0, contract_duration: '', status: 'Ativo', entry_date: localDate(), first_payment_date: firstBillingDate(localDate(),5), payment_day: '', verba_mensal: 0, niche: '', phone: '', account_ids: { bm: '', google_ads: '', tiktok_ads: '', linkedin_ads: '' } });
    setStep('meta');
    setOpen(true);
    // Reusa o token Meta já autorizado anteriormente (de outro cliente), se válido.
    try {
      const { data, error } = await supabase.functions.invoke('meta-reuse-token', { body: {} });
      if (!error && data?.reused) {
        setMetaPending(true);
        setStep('select-account');
        loadAdAccounts();
      }
    } catch { /* segue fluxo normal */ }
  };

  const startMetaConnection = async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) { toast.error('Sessão expirada. Faça login novamente.'); return; }
      // Persistir o estado do formulário antes de redirecionar
      localStorage.setItem('meta-onboarding-form', JSON.stringify({ form, ts: Date.now() }));
      const origin = `${window.location.origin}/clientes`;
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/meta-auth?onboarding=1&origin=${encodeURIComponent(origin)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const json = await res.json();
      if (json?.auth_url) {
        const target = window.top || window;
        target.location.href = json.auth_url;
      } else {
        localStorage.removeItem('meta-onboarding-form');
        toast.error('Não foi possível iniciar a conexão.');
      }
    } catch {
      localStorage.removeItem('meta-onboarding-form');
      toast.error('Erro ao conectar com Meta Ads');
    }
  };

  const openEdit = (c: Client, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditing(c);
    setOperation(operationFromProgress(progress.data?.[c.id]));
    setForm({
      name: c.name, services: c.services, monthly_fee: c.monthly_fee, contract_duration: c.contract_duration, status: c.status,
      entry_date:c.entry_date||'',first_payment_date:c.first_payment_date||'',payment_day: c.payment_day ? String(c.payment_day) : '',
      verba_mensal: c.verba_mensal || 0, niche: c.niche || '', phone: c.phone || '',
      account_ids: { bm: '', google_ads: '', tiktok_ads: '', linkedin_ads: '', ...c.account_ids },
    });
    setStep('form');
    setOpen(true);
  };

  const save = async () => {
    if (!user || saving) return;
    const scheduleError=billingError(form);if(scheduleError){toast.error(scheduleError);return;}
    if (!form.name.trim()) { toast.error('Informe o nome do cliente'); return; }
    if (!form.niche.trim()) { toast.error('Informe o nicho do cliente'); return; }
    if (!form.verba_mensal || form.verba_mensal <= 0) { toast.error('Informe a verba mensal'); return; }
    const payload = {
      name: form.name, services: form.services, monthly_fee: form.monthly_fee,
      contract_duration: form.contract_duration, status: form.status,
      entry_date:form.entry_date||null,first_payment_date:form.first_payment_date||null,payment_day: form.payment_day ? Number(form.payment_day) : null,
      account_ids: form.account_ids,
      verba_mensal: form.verba_mensal,
      niche: form.niche,
      phone: form.phone,
    };
    setSaving(true);
    const { data: savedId, error } = await supabase.rpc('save_agency_client', {
      p_id: editing?.id || null, p_client: payload,
      p_operation: operation.phase ? { ...operation } : null,
    });
    setSaving(false);
    if (error || !savedId) { toast.error('Não foi possível confirmar o salvamento. Atualize a lista antes de tentar novamente.'); return; }
    void progress.refetch();
    if (editing) {
      toast.success('Cliente atualizado!');
    } else {
      const inserted = { id: savedId };
      toast.success('Cliente criado!');
      if (metaPending) {
        const { data: attachData, error: attachErr } = await supabase.functions.invoke('meta-attach-pending', {
          body: { client_id: inserted.id },
        });
        if (!attachErr && attachData?.attached) {
          toast.success('Conta Meta vinculada ao cliente!');
          setMetaPending(false);
          setOpen(false);
          navigate(`/clientes/${inserted.id}`);
          return;
        }
      }
    }
    setOpen(false);
    void refreshBalances();
    load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from('clients').delete().eq('id', id);
    if (error) { toast.error('Não foi possível excluir. Clientes com histórico devem ser encerrados pelo status.'); return; }
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
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Gerencie seus clientes</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={openNew} className="neon-glow gap-2"><Plus className="w-4 h-4" /> Novo Cliente</Button>
        </div>
      </div>

      <ClientStatusFilter value={statusFilter} onChange={setStatusFilter} />

      {/* MOBILE: cards empilhados */}
      <div className="lg:hidden space-y-3">
        {visibleClients.map((c) => (
          <div
            key={c.id}
            onClick={() => navigate(`/clientes/${c.id}`)}
            className="glass-surface rounded-xl p-4 cursor-pointer active:bg-primary/5 transition-colors"
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-foreground truncate">{c.name}</h3>
                {c.payment_day && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">📅 Pagamento dia {c.payment_day}</p>
                )}
                {c.niche && (
                  <span className="inline-block mt-2 text-[11px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">{c.niche}</span>
                )}
              </div>
              <span className={`text-[11px] px-2 py-1 rounded-full font-medium shrink-0 ${statusColor(c.status)}`}>{c.status}</span><p className="text-xs text-muted-foreground mt-1">{progressLabel(progress.data?.[c.id])}</p>
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <div className="text-muted-foreground text-[10px] uppercase tracking-wide">Fee</div>
                <div className="text-foreground font-medium mt-0.5">R$ {c.monthly_fee?.toLocaleString('pt-BR') || 0}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-[10px] uppercase tracking-wide">Verba</div>
                <div className="text-primary font-semibold mt-0.5">R$ {(c.verba_mensal || 0).toLocaleString('pt-BR')}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-[10px] uppercase tracking-wide">Duração</div>
                <div className="text-foreground mt-0.5">{c.contract_duration ? `${c.contract_duration} ${Number(c.contract_duration) === 1 ? 'mês' : 'meses'}` : '—'}</div>
              </div>
            </div>

            <div className="flex justify-end gap-1 mt-3 pt-3 border-t border-border/30">
              <Button variant="ghost" size="sm" onClick={(e) => openEdit(c, e)} className="h-8 gap-1 text-xs"><Edit2 className="w-3.5 h-3.5" /> Editar</Button>
              <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setConfirmDelete(c); }} className="h-8 gap-1 text-xs hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /> Excluir</Button>
            </div>
          </div>
        ))}
        {visibleClients.length === 0 && (
          <div className="glass-surface rounded-xl text-center py-12 text-muted-foreground text-sm px-4">
            Nenhum cliente cadastrado. Toque em "Novo Cliente" para começar.
          </div>
        )}
      </div>

      {/* DESKTOP: tabela em grid */}
      <div className="hidden lg:block glass-surface rounded-xl overflow-hidden">
        <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_0.8fr_0.8fr_auto] gap-4 px-5 py-3 border-b border-border/50 text-xs font-medium text-muted-foreground uppercase tracking-wide">
          <div>Cliente</div>
          <div>Nicho</div>
          <div className="text-right">Fee mensal</div>
          <div className="text-right">Verba mensal</div>
          <div className="text-center">Duração</div>
          <div>Status</div>
          <div className="w-16"></div>
        </div>
        {visibleClients.map((c) => (
          <div
            key={c.id}
            onClick={() => navigate(`/clientes/${c.id}`)}
            className="grid grid-cols-[1.5fr_1fr_1fr_1fr_0.8fr_0.8fr_auto] gap-4 px-5 py-3 items-center border-b border-border/30 last:border-0 cursor-pointer hover:bg-primary/5 transition-colors group"
          >
            <div className="min-w-0">
              <h3 className="font-semibold text-foreground truncate">{c.name}</h3>
              {c.payment_day && (
                <p className="text-[11px] text-muted-foreground">📅 Dia {c.payment_day}</p>
              )}
            </div>
            <div className="min-w-0">
              {c.niche ? (
                <span className="inline-block text-[11px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium truncate max-w-full">{c.niche}</span>
              ) : <span className="text-muted-foreground text-xs">—</span>}
            </div>
            <div className="text-right text-sm text-foreground font-medium">R$ {c.monthly_fee?.toLocaleString('pt-BR')}</div>
            <div className="text-right text-sm text-primary font-semibold">R$ {(c.verba_mensal || 0).toLocaleString('pt-BR')}</div>
            <div className="text-sm text-foreground text-center">{c.contract_duration ? `${c.contract_duration}/${Number(c.contract_duration) === 1 ? 'Mês' : 'Meses'}` : '—'}</div>
            <div>
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColor(c.status)}`}>{c.status}</span><p className="text-xs text-muted-foreground mt-1">{progressLabel(progress.data?.[c.id])}</p>
            </div>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button variant="ghost" size="sm" onClick={(e) => openEdit(c, e)}><Edit2 className="w-3 h-3" /></Button>
              <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setConfirmDelete(c); }} className="hover:text-destructive"><Trash2 className="w-3 h-3" /></Button>
            </div>
          </div>
        ))}
        {visibleClients.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            Nenhum cliente cadastrado. Clique em "Novo Cliente" para começar.
          </div>
        )}
      </div>

      {/* Painel de Saldos das Contas de Anúncio */}
      <div id="account-balances-panel" className="scroll-mt-24">
        <AccountBalancesPanel initialAccounts={balanceAccounts} onAccountsChange={setBalanceAccounts} defaultOpen={problemCount > 0} />
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border w-[calc(100%_-_2rem)] sm:w-full max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Editar Cliente' : step === 'meta' ? 'Conectar Meta Ads' : 'Novo Cliente — dados'}
            </DialogTitle>
          </DialogHeader>

          {!editing && step === 'meta' ? (
            <div className="space-y-5 py-2">
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 text-center space-y-3">
                <div className="mx-auto w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center">
                  <Link2 className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-foreground font-semibold">Conecte sua conta do Meta Ads</h3>
                <p className="text-sm text-muted-foreground">
                  Antes de cadastrar os dados do cliente, conecte uma conta do Meta para puxar métricas e relatórios automaticamente. Você pode pular essa etapa e conectar depois.
                </p>
                <Button onClick={startMetaConnection} className="neon-glow gap-2 w-full sm:w-auto">
                  <Link2 className="w-4 h-4" /> Conectar Meta Ads
                </Button>
              </div>
              <div className="flex items-center justify-between gap-2">
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button variant="outline" onClick={() => setStep('form')} className="gap-2">
                  Pular e continuar <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ) : !editing && step === 'select-account' ? (
            <div className="space-y-4 py-2">
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
                <h3 className="text-foreground font-semibold text-sm">Selecione a conta de anúncio</h3>
                <p className="text-xs text-muted-foreground">
                  Escolha qual conta de anúncio do Meta será vinculada a este cliente. As campanhas dessa conta aparecerão automaticamente após salvar.
                </p>
                {loadingAdAccounts ? (
                  <div className="text-center py-6 text-sm text-muted-foreground">Carregando contas...</div>
                ) : adAccounts.length === 0 ? (
                  <div className="text-center py-4 text-sm text-muted-foreground">
                    Nenhuma conta de anúncio encontrada.
                    <Button variant="link" size="sm" onClick={loadAdAccounts}>Tentar novamente</Button>
                  </div>
                ) : (
                  <div className="max-h-72 overflow-y-auto rounded-md border border-border/50 divide-y divide-border/30">
                    {adAccounts.map((acc) => (
                      <label key={acc.id} className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-primary/5 ${selectedAdAccountId === acc.id ? 'bg-primary/10' : ''}`}>
                        <input
                          type="radio"
                          name="ad-account"
                          checked={selectedAdAccountId === acc.id}
                          onChange={() => setSelectedAdAccountId(acc.id)}
                          className="accent-primary"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-foreground truncate">{acc.name}</div>
                          <div className="text-[11px] text-muted-foreground">{acc.id}{acc.currency ? ` · ${acc.currency}` : ''}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <Button variant="ghost" onClick={() => { setStep('form'); }}>Pular</Button>
                <Button onClick={confirmAdAccount} disabled={!selectedAdAccountId || confirmingAccount} className="neon-glow gap-2">
                  {confirmingAccount ? 'Confirmando...' : <>Confirmar <ArrowRight className="w-4 h-4" /></>}
                </Button>
              </div>
            </div>
          ) : (
          <div className="space-y-4">
            <div><Label htmlFor="client-name" className="text-muted-foreground text-sm">Nome do cliente *</Label><Input id="client-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label htmlFor="client-niche" className="text-muted-foreground text-sm">Nicho *</Label><Input id="client-niche" value={form.niche} onChange={(e) => setForm({ ...form, niche: e.target.value })} placeholder="Ex: Estética, E-commerce, SaaS" className="bg-secondary/50 border-border/50 mt-1" /></div>
              <div><Label htmlFor="client-budget" className="text-muted-foreground text-sm">Verba mensal (R$) *</Label><Input id="client-budget" type="number" value={form.verba_mensal} onChange={(e) => setForm({ ...form, verba_mensal: Number(e.target.value) })} placeholder="Ex: 5000" className="bg-secondary/50 border-border/50 mt-1" /></div>
            </div>
            <ClientOperationFields value={operation} onChange={setOperation} />
            <div><Label className="text-muted-foreground text-sm">Serviços</Label><Textarea value={form.services} onChange={(e) => setForm({ ...form, services: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-muted-foreground text-sm">Fee mensal (R$)</Label><Input type="number" value={form.monthly_fee} onChange={(e) => setForm({ ...form, monthly_fee: Number(e.target.value) })} className="bg-secondary/50 border-border/50 mt-1" /></div>
              <div><Label className="text-muted-foreground text-sm">Duração</Label><Input value={form.contract_duration} onChange={(e) => setForm({ ...form, contract_duration: e.target.value })} placeholder="6 meses" className="bg-secondary/50 border-border/50 mt-1" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <ClientBillingFields value={form} onChange={fields=>setForm(current=>({...current,...fields}))}/>
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

            <Button disabled={saving} onClick={save} className="w-full neon-glow">Salvar</Button>
          </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{confirmDelete?.name}</strong>? Esta ação não pode ser desfeita e todos os dados vinculados a esse cliente serão removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (confirmDelete) { remove(confirmDelete.id); setConfirmDelete(null); } }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
