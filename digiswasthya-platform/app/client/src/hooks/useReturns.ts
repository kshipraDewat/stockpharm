import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api } from '../api/client';

export function useReturns(params?: { pharmacyId?: string; search?: string; source?: string; page?: number; pageSize?: number }) {
  return useQuery({
    queryKey: ['returns', params],
    queryFn: () => api.get('/returns', { params }).then(r => r.data),
    placeholderData: keepPreviousData,
  });
}

export function useReturn(id: string) {
  return useQuery({
    queryKey: ['returns', id],
    queryFn: () => api.get(`/returns/${id}`).then(r => r.data),
    enabled: !!id,
  });
}

export function useProcessReturn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/returns/${id}/process`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['returns'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['pharmacies'] });
    },
  });
}

export function useRejectReturn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post(`/returns/${id}/reject`, { reason }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['returns'] });
    },
  });
}
