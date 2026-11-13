import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCallback } from 'react';
import {taskDay} from '@/lib/taskViews';

const STALE = 5 * 60_000; // 5 min — dados raramente mudam por segundo
const GC = 15 * 60_000;   // 15 min em memória

export function useClientsQuery() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['clients', user?.id],
    enabled: !!user,
    staleTime: STALE,
    gcTime: GC,
    queryFn: async () => {
      const { data } = await supabase
        .from('clients')
        .select('id, name, status, monthly_fee, payment_day, entry_date, first_payment_date, phone, niche, services, verba_mensal, contract_duration, account_ids, created_at, updated_at, user_id')
        .eq('user_id', user!.id);
      return data || [];
    },
  });
}

export function useTasksQuery() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['operational_tasks', user?.id,taskDay(new Date().toISOString())],
    enabled: !!user,
    staleTime: 30_000,
    refetchInterval:30_000,
    gcTime: GC,
    queryFn: async () => {
      const { data } = await supabase
        .rpc('agency_tasks_list',{p_scope:'active'})
        .limit(500);
      return data || [];
    },
  });
}

export function useContractsQuery() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['signed_contracts', user?.id],
    enabled: !!user,
    staleTime: STALE,
    gcTime: GC,
    queryFn: async () => {
      const { data } = await supabase
        .from('signed_contracts')
        .select('id, title, client_name, expiry_date, status, signed_date, file_url, file_name, notes, created_at, updated_at, user_id')
        .eq('user_id', user!.id)
        .limit(500);
      return data || [];
    },
  });
}

export function useNotificationStatesQuery() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['notification_states', user?.id],
    enabled: !!user,
    staleTime: STALE,
    gcTime: GC,
    queryFn: async () => {
      const { data } = await supabase
        .from('notification_states')
        .select('notification_id, status')
        .eq('user_id', user!.id)
        .limit(1000);
      return data || [];
    },
  });
}

export function useInvalidateShared() {
  const qc = useQueryClient();
  return useCallback((keys: string[]) => {
    keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  }, [qc]);
}
