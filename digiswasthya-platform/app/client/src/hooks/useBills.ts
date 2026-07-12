import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api } from '../api/client';

export function useBills(params?: { search?: string; status?: string; page?: number; pageSize?: number }) {
  return useQuery({
    queryKey: ['bills', params],
    queryFn: () => api.get('/bills', { params }).then(r => r.data),
    placeholderData: keepPreviousData,
  });
}

export function useBill(id: string) {
  return useQuery({
    queryKey: ['bills', id],
    queryFn: () => api.get(`/bills/${id}`).then(r => r.data),
    enabled: !!id,
  });
}

export function useSendBillWhatsApp() {
  return useMutation({
    mutationFn: ({ billId, billPdfBase64 }: { billId: string; billPdfBase64: string }) =>
      api.post('/communication/send-bill', { billId, billPdfBase64 }).then(r => r.data),
  });
}

export function useUpdateBillStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      status,
      notes,
      method,
      referenceNo,
    }: {
      id: string;
      status: string;
      notes?: string;
      method?: string;
      referenceNo?: string;
    }) =>
      api.patch(`/bills/${id}/status`, { status, notes, method, referenceNo }).then(r => r.data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['bills'] });
      qc.invalidateQueries({ queryKey: ['bills', id] });
      qc.invalidateQueries({ queryKey: ['payments'] });
    },
  });
}
