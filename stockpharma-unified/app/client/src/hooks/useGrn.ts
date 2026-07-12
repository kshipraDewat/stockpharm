import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api } from '../api/client';

export function useGrns(params?: {
  search?: string;
  stockistConnectionId?: string;
  page?: number;
  pageSize?: number;
}) {
  return useQuery({
    queryKey: ['grn', params],
    queryFn: () => api.get('/grn', { params }).then(r => r.data),
    placeholderData: keepPreviousData,
  });
}

export function useGrn(id: string) {
  return useQuery({
    queryKey: ['grn', id],
    queryFn: () => api.get(`/grn/${id}`).then(r => r.data),
    enabled: !!id,
  });
}

export function useCreateGrn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ body, idempotencyKey }: { body: unknown; idempotencyKey: string }) =>
      api.post('/grn', body, { headers: { 'Idempotency-Key': idempotencyKey } }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['grn'] });
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });
}
