import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

export function useStockistReturns(params?: { stockistConnectionId?: string; page?: number; pageSize?: number }) {
  return useQuery({
    queryKey: ['stockist-returns', params],
    queryFn: () => api.get('/stockist-returns', { params }).then(r => r.data),
  });
}

export function useStockistReturn(id: string) {
  return useQuery({
    queryKey: ['stockist-returns', id],
    queryFn: () => api.get(`/stockist-returns/${id}`).then(r => r.data),
    enabled: !!id,
  });
}

export function useCreateStockistReturn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: any) => api.post('/stockist-returns', body).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stockist-returns'] }),
  });
}
