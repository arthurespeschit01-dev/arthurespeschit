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
import { ArrowLeft, Plus, Edit2, Trash2, Send, Upload, FileText, X, Paperclip } from 'lucide-react';
import { toast } from 'sonner';

interface Client {
  id: string; name: string; services: string; monthly_fee: number; contract_duration: string; status: string;
}
interface Campaign {
  id: string; name: string; platform: string; objective: string; status: string; start_date: string;
}
interface Note {
  id: string; text: string; created_at: string;
}
interface ClientAttachment {
  id: string; file_name: string; file_url: string; created_at: string;
}

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
  const [clientForm, setClientForm] = useState({ name: '', services: '', monthly_fee: 0, contract_duration: '', status: 'Ativo' });
  const [attachments, setAttachments] = useState<ClientAttachment[]>([]);
  const [uploading, setUploading] = useState(false);

  const loadClient = async () => {
    const { data } = await supabase.from('clients').select('*').eq('id', id).single();
    setClient(data);
    if (data) setClientForm({ name: data.name, services: data.services, monthly_fee: data.monthly_fee, contract_duration: data.contract_duration, status: data.status });
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
    setAttachments(data || []);
  };

  useEffect(() => { loadClient(); loadCampaigns(); loadAttachments(); }, [id]);

  const saveClient = async () => {
    await supabase.from('clients').update(clientForm).eq('id', id);
    toast.success('Cliente atualizado!');
    setEditClient(false);
    loadClient();
  };

  // Campaign create or edit
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
      // Update selectedCampaign if it was the one being edited
      if (selectedCampaign?.id === editingCampaign.id) {
        setSelectedCampaign({ ...selectedCampaign, ...campForm });
      }
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

  // File upload
  const handleFileUpload = async (file: File) => {
    if (!user || !id) return;
    setUploading(true);
    try {
      const filePath = `${user.id}/${id}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage.from('client-attachments').upload(filePath, file);
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('client-attachments').getPublicUrl(filePath);
      await supabase.from('client_attachments').insert({
        client_id: id, user_id: user.id, file_name: file.name, file_url: urlData.publicUrl,
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

  const statusColor = (s: string) => {
    if (s === 'Ativo' || s === 'Ativa') return 'bg-emerald-500/20 text-emerald-400';
    if (s === 'Pausado' || s === 'Pausada') return 'bg-amber-500/20 text-amber-400';
    return 'bg-red-500/20 text-red-400';
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
              </div>
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
          <div className="glass-surface rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground flex items-center gap-2"><Paperclip className="w-4 h-4 text-primary" /> Arquivos Anexados</h3>
              <label className="cursor-pointer">
                <input type="file" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0]); e.target.value = ''; }} disabled={uploading} />
                <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity cursor-pointer">
                  <Upload className="w-4 h-4" />
                  {uploading ? 'Enviando...' : 'Enviar Arquivo'}
                </div>
              </label>
            </div>

            {attachments.length > 0 ? (
              <div className="space-y-2">
                {attachments.map(att => (
                  <div key={att.id} className="flex items-center justify-between bg-secondary/30 rounded-lg p-3 group">
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText className="w-5 h-5 text-primary shrink-0" />
                      <div className="min-w-0">
                        <a href={att.file_url} target="_blank" rel="noopener noreferrer" className="text-sm text-foreground hover:text-primary truncate block">{att.file_name}</a>
                        <p className="text-xs text-muted-foreground">{new Date(att.created_at).toLocaleDateString('pt-BR')}</p>
                      </div>
                    </div>
                    <button onClick={() => removeAttachment(att)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"><X className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Nenhum arquivo anexado.</p>
                <p className="text-xs text-muted-foreground mt-1">Clique em "Enviar Arquivo" para adicionar contratos, briefings, etc.</p>
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
