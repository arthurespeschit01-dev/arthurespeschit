import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowLeft, Plus, Edit2, Trash2, Send, Upload, FileText, X, Paperclip, Image, BookOpen, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';

interface AccountIds {
  bm?: string;
  google_ads?: string;
  tiktok_ads?: string;
  linkedin_ads?: string;
  [key: string]: string | undefined;
}

interface Client {
  id: string; name: string; services: string; monthly_fee: number; contract_duration: string; status: string;
  payment_day: number | null; account_ids: AccountIds;
}
interface Campaign {
  id: string; name: string; platform: string; objective: string; status: string; start_date: string;
}
interface Note {
  id: string; text: string; created_at: string;
}
interface ClientAttachment {
  id: string; file_name: string; file_url: string; created_at: string; category: string;
}

const ATTACHMENT_CATEGORIES = [
  { value: 'criativos', label: 'Criativos', icon: Image, description: 'Peças, artes, vídeos' },
  { value: 'briefings', label: 'Briefings', icon: BookOpen, description: 'Briefings e estratégias' },
  { value: 'relatorios', label: 'Relatórios', icon: BarChart3, description: 'Relatórios enviados' },
  { value: 'outros', label: 'Outros', icon: FileText, description: 'Outros documentos' },
] as const;

export default function ClientDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [client, setClient] = useState<Client | null>(null);
  const [tab, setTab] = useState<'dados' | 'campanhas' | 'anexos'>('dados');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [filter, setFilter] = useState('Todas');
  const [campOpen, setCampOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [campForm, setCampForm] = useState({ name: '', platform: 'Facebook Ads', objective: '', status: 'Ativa', start_date: '' });
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteText, setNoteText] = useState('');
  const [editClient, setEditClient] = useState(false);
  const [clientForm, setClientForm] = useState({ name: '', services: '', monthly_fee: 0, contract_duration: '', status: 'Ativo', payment_day: '' as string, account_ids: {} as AccountIds });
  const [attachments, setAttachments] = useState<ClientAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [attachCategory, setAttachCategory] = useState('criativos');
  const [attachFilter, setAttachFilter] = useState('todos');

  const loadClient = async () => {
    const { data } = await supabase.from('clients').select('*').eq('id', id).single();
    if (data) {
      const c = { ...data, account_ids: (data.account_ids as AccountIds) || {} };
      setClient(c);
      setClientForm({
        name: c.name, services: c.services, monthly_fee: c.monthly_fee, contract_duration: c.contract_duration, status: c.status,
        payment_day: c.payment_day ? String(c.payment_day) : '',
        account_ids: { bm: '', google_ads: '', tiktok_ads: '', linkedin_ads: '', ...c.account_ids },
      });
    }
  };

  const loadCampaigns = async () => {
    const { data } = await supabase.from('campaigns').select('*').eq('client_id', id).order('created_at', { ascending: false });
    setCampaigns(data || []);
  };

  const loadNotes = async (campId: string) => {
    const { data } = await supabase.from('campaign_notes').select('*').eq('campaign_id', campId).order('created_at', { ascending: true });
    setNotes(data || []);
  };

  const loadAttachments = async () => {
    if (!user) return;
    const { data } = await supabase.from('client_attachments').select('*').eq('client_id', id).eq('user_id', user.id).order('created_at', { ascending: false });
    setAttachments((data || []) as ClientAttachment[]);
  };

  useEffect(() => { loadClient(); loadCampaigns(); loadAttachments(); }, [id]);

  const saveClient = async () => {
    await supabase.from('clients').update({
      name: clientForm.name, services: clientForm.services, monthly_fee: clientForm.monthly_fee,
      contract_duration: clientForm.contract_duration, status: clientForm.status,
      payment_day: clientForm.payment_day ? Number(clientForm.payment_day) : null,
      account_ids: clientForm.account_ids,
    }).eq('id', id);
    toast.success('Cliente atualizado!');
    setEditClient(false);
    loadClient();
  };

  const openNewCampaign = () => {
    setEditingCampaign(null);
    setCampForm({ name: '', platform: 'Facebook Ads', objective: '', status: 'Ativa', start_date: '' });
    setCampOpen(true);
  };

  const openEditCampaign = (c: Campaign, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingCampaign(c);
    setCampForm({ name: c.name, platform: c.platform, objective: c.objective, status: c.status, start_date: c.start_date });
    setCampOpen(true);
  };

  const saveCampaign = async () => {
    if (!user) return;
    if (editingCampaign) {
      await supabase.from('campaigns').update(campForm).eq('id', editingCampaign.id);
      toast.success('Campanha atualizada!');
      if (selectedCampaign?.id === editingCampaign.id) setSelectedCampaign({ ...selectedCampaign, ...campForm });
    } else {
      await supabase.from('campaigns').insert({ ...campForm, client_id: id, user_id: user.id });
      toast.success('Campanha criada!');
    }
    setCampOpen(false);
    loadCampaigns();
  };

  const deleteCampaign = async (campId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    await supabase.from('campaigns').delete().eq('id', campId);
    toast.success('Campanha removida!');
    if (selectedCampaign?.id === campId) setSelectedCampaign(null);
    loadCampaigns();
  };

  const sendNote = async () => {
    if (!selectedCampaign || !noteText.trim() || !user) return;
    await supabase.from('campaign_notes').insert({ campaign_id: selectedCampaign.id, user_id: user.id, text: noteText });
    setNoteText('');
    loadNotes(selectedCampaign.id);
  };

  const deleteNote = async (noteId: string) => {
    await supabase.from('campaign_notes').delete().eq('id', noteId);
    if (selectedCampaign) loadNotes(selectedCampaign.id);
  };

  const handleFileUpload = async (file: File) => {
    if (!user || !id) return;
    setUploading(true);
    try {
      const filePath = `${user.id}/${id}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage.from('client-attachments').upload(filePath, file);
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('client-attachments').getPublicUrl(filePath);
      await supabase.from('client_attachments').insert({
        client_id: id, user_id: user.id, file_name: file.name, file_url: urlData.publicUrl, category: attachCategory,
      });
      toast.success('Arquivo anexado!');
      loadAttachments();
    } catch {
      toast.error('Erro ao enviar arquivo');
    } finally {
      setUploading(false);
    }
  };

  const removeAttachment = async (att: ClientAttachment) => {
    await supabase.from('client_attachments').delete().eq('id', att.id);
    toast.success('Anexo removido!');
    loadAttachments();
  };

  const filtered = filter === 'Todas' ? campaigns : campaigns.filter(c => c.status === filter);
  const filteredAttachments = attachFilter === 'todos' ? attachments : attachments.filter(a => a.category === attachFilter);

  const statusColor = (s: string) => {
    if (s === 'Ativo' || s === 'Ativa') return 'bg-emerald-500/20 text-emerald-400';
    if (s === 'Pausado' || s === 'Pausada') return 'bg-amber-500/20 text-amber-400';
    return 'bg-red-500/20 text-red-400';
  };

  const updateAccountId = (key: string, value: string) => {
    setClientForm(prev => ({ ...prev, account_ids: { ...prev.account_ids, [key]: value } }));
  };

  const getCategoryIcon = (cat: string) => {
    const found = ATTACHMENT_CATEGORIES.find(c => c.value === cat);
    if (!found) return FileText;
    return found.icon;
  };

  if (!client) return <div className="text-muted-foreground">Carregando...</div>;

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/clientes')}><ArrowLeft className="w-4 h-4" /></Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{client.name}</h1>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(client.status)}`}>{client.status}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-secondary/50 rounded-lg w-fit">
        <button onClick={() => setTab('dados')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === 'dados' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Dados do Cliente</button>
        <button onClick={() => { setTab('campanhas'); setSelectedCampaign(null); }} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === 'campanhas' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Campanhas</button>
        <button onClick={() => setTab('anexos')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === 'anexos' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
          Anexos {attachments.length > 0 && <span className="ml-1 text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">{attachments.length}</span>}
        </button>
      </div>

      {/* Dados Tab */}
      {tab === 'dados' && (
        <div className="glass-surface rounded-xl p-6 space-y-4">
          {!editClient ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">Serviços:</span><p className="text-foreground mt-1">{client.services}</p></div>
                <div><span className="text-muted-foreground">Valor mensal:</span><p className="text-foreground mt-1">R$ {client.monthly_fee?.toLocaleString('pt-BR')}</p></div>
                <div><span className="text-muted-foreground">Duração:</span><p className="text-foreground mt-1">{client.contract_duration}</p></div>
                <div><span className="text-muted-foreground">Dia de pagamento:</span><p className="text-foreground mt-1">{client.payment_day ? `Dia ${client.payment_day}` : '—'}</p></div>
              </div>

              {/* Account IDs display */}
              {Object.entries(client.account_ids || {}).some(([, v]) => v) && (
                <div className="pt-3 border-t border-border">
                  <h4 className="text-sm font-semibold text-foreground mb-2">IDs das Contas</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {client.account_ids.bm && <div className="bg-secondary/30 rounded-lg px-3 py-2 text-sm"><span className="text-muted-foreground text-xs">BM:</span><p className="text-foreground font-mono text-xs mt-0.5">{client.account_ids.bm}</p></div>}
                    {client.account_ids.google_ads && <div className="bg-secondary/30 rounded-lg px-3 py-2 text-sm"><span className="text-muted-foreground text-xs">Google Ads:</span><p className="text-foreground font-mono text-xs mt-0.5">{client.account_ids.google_ads}</p></div>}
                    {client.account_ids.tiktok_ads && <div className="bg-secondary/30 rounded-lg px-3 py-2 text-sm"><span className="text-muted-foreground text-xs">TikTok Ads:</span><p className="text-foreground font-mono text-xs mt-0.5">{client.account_ids.tiktok_ads}</p></div>}
                    {client.account_ids.linkedin_ads && <div className="bg-secondary/30 rounded-lg px-3 py-2 text-sm"><span className="text-muted-foreground text-xs">LinkedIn Ads:</span><p className="text-foreground font-mono text-xs mt-0.5">{client.account_ids.linkedin_ads}</p></div>}
                  </div>
                </div>
              )}

              <Button variant="outline" onClick={() => setEditClient(true)} className="gap-2"><Edit2 className="w-3 h-3" /> Editar</Button>
            </>
          ) : (
            <div className="space-y-3">
              <div><Label className="text-muted-foreground text-sm">Nome</Label><Input value={clientForm.name} onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" /></div>
              <div><Label className="text-muted-foreground text-sm">Serviços</Label><Textarea value={clientForm.services} onChange={(e) => setClientForm({ ...clientForm, services: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-muted-foreground text-sm">Valor (R$)</Label><Input type="number" value={clientForm.monthly_fee} onChange={(e) => setClientForm({ ...clientForm, monthly_fee: Number(e.target.value) })} className="bg-secondary/50 border-border/50 mt-1" /></div>
                <div><Label className="text-muted-foreground text-sm">Duração</Label><Input value={clientForm.contract_duration} onChange={(e) => setClientForm({ ...clientForm, contract_duration: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-muted-foreground text-sm">Dia de pagamento</Label><Input type="number" min={1} max={31} value={clientForm.payment_day} onChange={(e) => setClientForm({ ...clientForm, payment_day: e.target.value })} placeholder="Ex: 10" className="bg-secondary/50 border-border/50 mt-1" /></div>
                <div>
                  <Label className="text-muted-foreground text-sm">Status</Label>
                  <Select value={clientForm.status} onValueChange={(v) => setClientForm({ ...clientForm, status: v })}>
                    <SelectTrigger className="bg-secondary/50 border-border/50 mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      <SelectItem value="Ativo">Ativo</SelectItem>
                      <SelectItem value="Pausado">Pausado</SelectItem>
                      <SelectItem value="Encerrado">Encerrado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-3 pt-2 border-t border-border">
                <Label className="text-foreground text-sm font-semibold">IDs das Contas</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-muted-foreground text-xs">BM</Label><Input value={clientForm.account_ids.bm || ''} onChange={(e) => updateAccountId('bm', e.target.value)} placeholder="ID da BM" className="bg-secondary/50 border-border/50 mt-1 text-sm" /></div>
                  <div><Label className="text-muted-foreground text-xs">Google Ads</Label><Input value={clientForm.account_ids.google_ads || ''} onChange={(e) => updateAccountId('google_ads', e.target.value)} placeholder="ID Google Ads" className="bg-secondary/50 border-border/50 mt-1 text-sm" /></div>
                  <div><Label className="text-muted-foreground text-xs">TikTok Ads</Label><Input value={clientForm.account_ids.tiktok_ads || ''} onChange={(e) => updateAccountId('tiktok_ads', e.target.value)} placeholder="ID TikTok Ads" className="bg-secondary/50 border-border/50 mt-1 text-sm" /></div>
                  <div><Label className="text-muted-foreground text-xs">LinkedIn Ads</Label><Input value={clientForm.account_ids.linkedin_ads || ''} onChange={(e) => updateAccountId('linkedin_ads', e.target.value)} placeholder="ID LinkedIn Ads" className="bg-secondary/50 border-border/50 mt-1 text-sm" /></div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={saveClient} className="neon-glow">Salvar</Button>
                <Button variant="ghost" onClick={() => setEditClient(false)}>Cancelar</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Campanhas Tab - List */}
      {tab === 'campanhas' && !selectedCampaign && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex gap-1 p-1 bg-secondary/50 rounded-lg">
              {['Todas', 'Ativa', 'Pausada', 'Encerrada'].map(f => (
                <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${filter === f ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>{f}</button>
              ))}
            </div>
            <Button onClick={openNewCampaign} className="neon-glow gap-2" size="sm"><Plus className="w-3 h-3" /> Nova Campanha</Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map(c => (
              <div key={c.id} onClick={() => { setSelectedCampaign(c); loadNotes(c.id); }} className="glass-surface rounded-xl p-4 cursor-pointer hover:border-primary/30 transition-all group">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-semibold text-foreground text-sm">{c.name}</h3>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(c.status)}`}>{c.status}</span>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={(e) => openEditCampaign(c, e)}><Edit2 className="w-3 h-3" /></Button>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:text-destructive" onClick={(e) => deleteCampaign(c.id, e)}><Trash2 className="w-3 h-3" /></Button>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{c.platform} • {c.objective}</p>
                <p className="text-xs text-muted-foreground mt-1">{c.start_date}</p>
              </div>
            ))}
            {filtered.length === 0 && <p className="text-muted-foreground text-sm col-span-full text-center py-8">Nenhuma campanha encontrada.</p>}
          </div>
        </div>
      )}

      {/* Campanhas Tab - Detail */}
      {tab === 'campanhas' && selectedCampaign && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelectedCampaign(null)}><ArrowLeft className="w-4 h-4 mr-1" /> Voltar</Button>
            <Button variant="outline" size="sm" onClick={() => openEditCampaign(selectedCampaign)} className="gap-1"><Edit2 className="w-3 h-3" /> Editar Campanha</Button>
          </div>
          <div className="glass-surface rounded-xl p-5">
            <h3 className="font-semibold text-foreground mb-2">{selectedCampaign.name}</h3>
            <div className="flex gap-4 text-sm text-muted-foreground">
              <span>{selectedCampaign.platform}</span>
              <span>{selectedCampaign.objective}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(selectedCampaign.status)}`}>{selectedCampaign.status}</span>
            </div>
          </div>
          <div className="glass-surface rounded-xl p-5">
            <h4 className="font-medium text-foreground mb-3 text-sm">Anotações</h4>
            <div className="space-y-2 max-h-64 overflow-y-auto mb-3">
              {notes.map(n => (
                <div key={n.id} className="flex items-start justify-between bg-secondary/30 rounded-lg p-3">
                  <div>
                    <p className="text-sm text-foreground">{n.text}</p>
                    <p className="text-xs text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString('pt-BR')}</p>
                  </div>
                  <button onClick={() => deleteNote(n.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
                </div>
              ))}
              {notes.length === 0 && <p className="text-muted-foreground text-xs">Nenhuma anotação.</p>}
            </div>
            <div className="flex gap-2">
              <Input value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Escrever anotação..." className="bg-secondary/50 border-border/50" onKeyDown={(e) => e.key === 'Enter' && sendNote()} />
              <Button onClick={sendNote} size="sm" className="neon-glow"><Send className="w-4 h-4" /></Button>
            </div>
          </div>
        </div>
      )}

      {/* Anexos Tab */}
      {tab === 'anexos' && (
        <div className="space-y-4">
          {/* Upload section */}
          <div className="glass-surface rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground flex items-center gap-2"><Paperclip className="w-4 h-4 text-primary" /> Anexos do Cliente</h3>
            </div>

            {/* Upload with category */}
            <div className="flex flex-wrap items-end gap-3 mb-6 p-4 bg-secondary/30 rounded-lg border border-border/50">
              <div className="flex-1 min-w-[200px]">
                <Label className="text-muted-foreground text-xs mb-1 block">Categoria do arquivo</Label>
                <Select value={attachCategory} onValueChange={setAttachCategory}>
                  <SelectTrigger className="bg-secondary/50 border-border/50"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {ATTACHMENT_CATEGORIES.map(cat => (
                      <SelectItem key={cat.value} value={cat.value}>
                        <span className="flex items-center gap-2"><cat.icon className="w-3 h-3" /> {cat.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <label className="cursor-pointer">
                <input type="file" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0]); e.target.value = ''; }} disabled={uploading} />
                <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity cursor-pointer">
                  <Upload className="w-4 h-4" />
                  {uploading ? 'Enviando...' : 'Enviar Arquivo'}
                </div>
              </label>
            </div>

            {/* Category filter tabs */}
            <div className="flex gap-1 p-1 bg-secondary/50 rounded-lg mb-4 flex-wrap">
              <button onClick={() => setAttachFilter('todos')} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${attachFilter === 'todos' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                Todos ({attachments.length})
              </button>
              {ATTACHMENT_CATEGORIES.map(cat => {
                const count = attachments.filter(a => a.category === cat.value).length;
                return (
                  <button key={cat.value} onClick={() => setAttachFilter(cat.value)} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${attachFilter === cat.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                    <cat.icon className="w-3 h-3" /> {cat.label} {count > 0 && `(${count})`}
                  </button>
                );
              })}
            </div>

            {/* Attachment list */}
            {filteredAttachments.length > 0 ? (
              <div className="space-y-2">
                {filteredAttachments.map(att => {
                  const CatIcon = getCategoryIcon(att.category);
                  return (
                    <div key={att.id} className="flex items-center justify-between bg-secondary/30 rounded-lg p-3 group">
                      <div className="flex items-center gap-3 min-w-0">
                        <CatIcon className="w-5 h-5 text-primary shrink-0" />
                        <div className="min-w-0">
                          <a href={att.file_url} target="_blank" rel="noopener noreferrer" className="text-sm text-foreground hover:text-primary truncate block">{att.file_name}</a>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">
                              {ATTACHMENT_CATEGORIES.find(c => c.value === att.category)?.label || 'Outros'}
                            </span>
                            <span className="text-xs text-muted-foreground">{new Date(att.created_at).toLocaleDateString('pt-BR')}</span>
                          </div>
                        </div>
                      </div>
                      <button onClick={() => removeAttachment(att)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"><X className="w-4 h-4" /></button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8">
                <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  {attachFilter === 'todos' ? 'Nenhum arquivo anexado.' : `Nenhum arquivo em "${ATTACHMENT_CATEGORIES.find(c => c.value === attachFilter)?.label}".`}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Campaign Create/Edit Dialog */}
      <Dialog open={campOpen} onOpenChange={setCampOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>{editingCampaign ? 'Editar Campanha' : 'Nova Campanha'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-muted-foreground text-sm">Nome</Label><Input value={campForm.name} onChange={(e) => setCampForm({ ...campForm, name: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" /></div>
            <div>
              <Label className="text-muted-foreground text-sm">Plataforma</Label>
              <Select value={campForm.platform} onValueChange={(v) => setCampForm({ ...campForm, platform: v })}>
                <SelectTrigger className="bg-secondary/50 border-border/50 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {['Facebook Ads', 'Google Ads', 'TikTok Ads', 'LinkedIn Ads'].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-muted-foreground text-sm">Objetivo</Label><Input value={campForm.objective} onChange={(e) => setCampForm({ ...campForm, objective: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" /></div>
            <div>
              <Label className="text-muted-foreground text-sm">Status</Label>
              <Select value={campForm.status} onValueChange={(v) => setCampForm({ ...campForm, status: v })}>
                <SelectTrigger className="bg-secondary/50 border-border/50 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="Ativa">Ativa</SelectItem>
                  <SelectItem value="Pausada">Pausada</SelectItem>
                  <SelectItem value="Encerrada">Encerrada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-muted-foreground text-sm">Data de início</Label><Input type="date" value={campForm.start_date} onChange={(e) => setCampForm({ ...campForm, start_date: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" /></div>
            <Button onClick={saveCampaign} className="w-full neon-glow">{editingCampaign ? 'Salvar Alterações' : 'Criar Campanha'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
