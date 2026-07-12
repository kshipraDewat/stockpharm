import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

export function usePayments(params?: { pharmacyId?: string; search?: string; page?: number; pageSize?: number }) {
  return useQuery({
    queryKey: ['payments', params],
    queryFn: () => api.get('/payments', { params }).then(r => r.data),
  });
}

export function usePayment(id: string) {
  return useQuery({
    queryKey: ['payments', id],
    queryFn: () => api.get(`/payments/${id}`).then(r => r.data),
    enabled: !!id,
  });
}

export function useRecordPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: any) => api.post('/payments', body).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['payments'] }); qc.invalidateQueries({ queryKey: ['bills'] }); qc.invalidateQueries({ queryKey: ['pharmacies'] }); },
  });
}

export function useVoidPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/payments/${id}/void`).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['payments'] }); qc.invalidateQueries({ queryKey: ['bills'] }); qc.invalidateQueries({ queryKey: ['pharmacies'] }); },
  });
}
