import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api } from '../api/client';

export function useRetailSales(params?: {
  search?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}) {
  return useQuery({
    queryKey: ['retail-sales', params],
    queryFn: () => api.get('/retail-sales', { params }).then(r => r.data),
    placeholderData: keepPreviousData,
  });
}

export function useRetailSale(id: string) {
  return useQuery({
    queryKey: ['retail-sales', id],
    queryFn: () => api.get(`/retail-sales/${id}`).then(r => r.data),
    enabled: !!id,
  });
}

export function useCreateRetailSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => api.post('/retail-sales', body).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['retail-sales'] });
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

export function useVoidRetailSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post(`/retail-sales/${id}/void`, { reason }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['retail-sales'] });
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });
}
