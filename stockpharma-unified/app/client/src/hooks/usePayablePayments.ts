import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

export function usePayablePayments(params?: {
  stockistConnectionId?: string;
  page?: number;
  pageSize?: number;
}) {
  return useQuery({
    queryKey: ['payable-payments', params],
    queryFn: () => api.get('/payable-payments', { params }).then(r => r.data),
  });
}

export function useRecordPayablePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => api.post('/payable-payments', body).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payable-payments'] });
      qc.invalidateQueries({ queryKey: ['payable-bills'] });
    },
  });
}

export function useVoidPayablePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/payable-payments/${id}/void`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payable-payments'] });
      qc.invalidateQueries({ queryKey: ['payable-bills'] });
    },
  });
}
