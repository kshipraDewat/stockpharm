import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api } from '../api/client';

export function usePurchases(params?: {
  supplierId?: string; status?: string; search?: string;
  dateFrom?: string; dateTo?: string; page?: number; pageSize?: number;
}) {
  return useQuery({
    queryKey: ['purchases', params],
    queryFn: () => api.get('/purchases', { params }).then(r => r.data),
    placeholderData: keepPreviousData,
  });
}

export function usePurchase(id: string) {
  return useQuery({
    queryKey: ['purchases', id],
    queryFn: () => api.get(`/purchases/${id}`).then(r => r.data),
    enabled: !!id,
  });
}

export function useCreatePurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: any) => api.post('/purchases', body).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

export function useSetProductSaleRates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { rates: { productId: string; saleRate: number }[] }) =>
      api.post('/purchases/sale-rates', body).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });
}

export function useReceivePurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/purchases/${id}/receive`).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchases'] }); qc.invalidateQueries({ queryKey: ['products'] }); },
  });
}

export function useUpdatePurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; supplierId?: string; supplierInvoiceNo?: string; invoiceDate?: string; notes?: string }) =>
      api.patch(`/purchases/${id}`, body).then(r => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: ['purchases', vars.id] });
    },
  });
}

export function usePurchaseLedger(id: string) {
  return useQuery({
    queryKey: ['purchases', id, 'ledger'],
    queryFn: () => api.get(`/purchases/${id}/ledger`).then(r => r.data),
    enabled: !!id,
  });
}
export function useParseInvoiceAi() {
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api.post('/purchases/parse', form, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data);
    },
  });
}
