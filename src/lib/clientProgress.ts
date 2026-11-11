import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { readAllRows } from '@/lib/readAllRows';

export interface ClientProgress {
  client_id: string; user_id: string; card_id: string | null;
  phase: 'onboarding' | 'execution'; pipeline_id: string | null;
  stage_id: string | null; stage_name: string | null; pipeline_name: string | null;
}
export interface OperationSelection { phase: '' | 'onboarding' | 'execution'; pipeline_id: string; stage_id: string }
export const emptyOperation: OperationSelection = { phase: '', pipeline_id: '', stage_id: '' };
export function operationFromProgress(progress?: ClientProgress): OperationSelection {
  return progress ? { phase: progress.phase, pipeline_id: progress.pipeline_id || '', stage_id: progress.stage_id || '' } : { ...emptyOperation };
}
export function progressLabel(progress?: ClientProgress) {
  if (!progress) return 'Sem acompanhamento';
  return `${progress.phase === 'onboarding' ? 'Onboarding' : 'Em execução'}${progress.stage_name ? ` · ${progress.stage_name}` : ''}`;
}
export function useClientProgress() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['agency-client-progress', user?.id], enabled: !!user,
    staleTime: 0, refetchOnMount: true, refetchOnWindowFocus: true,
    queryFn: async () => {
      const result = await readAllRows<ClientProgress>((from, to) => supabase.from('agency_client_progress_view').select('*').eq('user_id', user!.id).order('client_id').range(from, to));
      if (result.error) throw new Error(result.error.message);
      return Object.fromEntries(result.data.map(row => [row.client_id, row]));
    },
  });
}
