import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api } from '../api/client';

export function useSuppliers(params?: { search?: string; status?: string; page?: number; pageSize?: number }) {
  return useQuery({
    queryKey: ['suppliers', params],
    queryFn: () => api.get('/suppliers', { params }).then(r => r.data),
    placeholderData: keepPreviousData,
  });
}

export function useSupplier(id: string) {
  return useQuery({
    queryKey: ['suppliers', id],
    queryFn: () => api.get(`/suppliers/${id}`).then(r => r.data),
    enabled: !!id,
  });
}

export function useSupplierPurchases(id: string) {
  return useQuery({
    queryKey: ['suppliers', id, 'purchases'],
    queryFn: () => api.get(`/suppliers/${id}/purchases`).then(r => r.data),
    enabled: !!id,
  });
}

export function useCreateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: any) => api.post('/suppliers', body).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }),
  });
}

export function useUpdateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: any) => api.patch(`/suppliers/${id}`, body).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }),
  });
}

export function useSupplierLedger(id: string) {
  return useQuery({
    queryKey: ['suppliers', id, 'ledger'],
    queryFn: () => api.get(`/suppliers/${id}/ledger`).then(r => r.data),
    enabled: !!id,
  });
}

export function useRecordSupplierPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: any) => api.post('/supplier-payments', body).then(r => r.data),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      qc.invalidateQueries({ queryKey: ['suppliers', variables.supplierId] });
      qc.invalidateQueries({ queryKey: ['suppliers', variables.supplierId, 'ledger'] });
    },
  });
}
