import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { readAllRows } from '@/lib/readAllRows';
import { type Pipeline, type Stage, stageOutcome } from '@/lib/pipelines';
import { type OperationSelection } from '@/lib/clientProgress';
import { Label } from '@/components/ui/label';
import { agencySelectClass } from '@/lib/agency';

export default function ClientOperationFields({ value, onChange }: { value: OperationSelection; onChange: (value: OperationSelection) => void }) {
  const { user } = useAuth();
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (!user) return;
    Promise.all([
      readAllRows<Pipeline>((from,to) => supabase.from('agency_pipelines').select('*').eq('user_id',user.id).eq('area','operacao').order('created_at').range(from,to)),
      readAllRows<Stage>((from,to) => supabase.from('agency_pipeline_stages').select('*').eq('user_id',user.id).order('position').order('id').range(from,to)),
    ]).then(([p,s]) => { if (!cancelled) { setError(!!(p.error || s.error)); setPipelines(p.data); setStages(s.data); } });
    return () => { cancelled=true; };
  },[user]);
  return <fieldset className="rounded-xl border p-4 space-y-3">
    <legend className="px-1 text-sm font-semibold">Onboarding e execução</legend>
    <Label htmlFor="client-operation-phase">Fase de trabalho</Label>
    <select id="client-operation-phase" className={agencySelectClass} value={value.phase} onChange={e => onChange({ phase:e.target.value as OperationSelection['phase'], pipeline_id:'', stage_id:'' })}>
      <option value="">Manter acompanhamento atual</option>
      <option value="onboarding">Onboarding</option><option value="execution">Em execução</option>
    </select>
    {value.phase && <>
      <Label htmlFor="client-operation-pipeline">Pipeline de onboarding</Label>
      <select id="client-operation-pipeline" className={agencySelectClass} value={value.pipeline_id} onChange={e => onChange({ ...value,pipeline_id:e.target.value,stage_id:'' })}>
        <option value="">{value.phase==='execution' ? 'Em execução, sem vincular pipeline' : pipelines.length ? 'Usar a primeira pipeline de onboarding' : 'Criar fluxo padrão de onboarding'}</option>
        {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      {value.pipeline_id && <>
        <Label htmlFor="client-operation-stage">Etapa do onboarding</Label>
        <select id="client-operation-stage" className={agencySelectClass} value={value.stage_id} onChange={e => onChange({...value,stage_id:e.target.value})}>
          <option value="">{value.phase==='execution' ? 'Usar etapa de conclusão' : 'Usar primeira etapa'}</option>
          {stages.filter(s=>s.pipeline_id===value.pipeline_id && (value.phase==='onboarding' || stageOutcome(s)==='completed')).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </>}
      <p className="text-xs text-muted-foreground">Ao mover o card, a fase e a etapa aparecem atualizadas em Clientes. Marque a etapa final como “Conclui onboarding” no editor da pipeline.</p>
    </>}
    {error && <p role="alert" className="text-sm text-destructive">Não foi possível carregar as pipelines. Reabra o cadastro para tentar novamente.</p>}
    <Link to="/operacao" className="inline-block text-xs text-primary">Configurar pipelines de onboarding</Link>
  </fieldset>;
}
