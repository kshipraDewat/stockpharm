import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

export function usePharmacies(params?: { search?: string; status?: string; portalConnected?: string; page?: number; pageSize?: number }) {
  return useQuery({
    queryKey: ['pharmacies', params],
    queryFn: () => api.get('/pharmacies', { params }).then(r => r.data),
  });
}

export function usePharmacy(id: string) {
  return useQuery({
    queryKey: ['pharmacies', id],
    queryFn: () => api.get(`/pharmacies/${id}`).then(r => r.data),
    enabled: !!id,
  });
}

export function usePharmacyOrders(id: string) {
  return useQuery({
    queryKey: ['pharmacies', id, 'orders'],
    queryFn: () => api.get(`/pharmacies/${id}/orders`).then(r => r.data),
    enabled: !!id,
  });
}

export function usePharmacyBills(id: string, unpaidOnly = false) {
  return useQuery({
    queryKey: ['pharmacies', id, 'bills', unpaidOnly],
    queryFn: () => api.get(`/pharmacies/${id}/bills`, { params: unpaidOnly ? { unpaidOnly: '1' } : {} }).then(r => r.data),
    enabled: !!id,
  });
}

export function useOutstandingBills(pharmacyId: string) {
  return useQuery({
    queryKey: ['pharmacies', pharmacyId, 'outstanding-bills'],
    queryFn: () => api.get(`/pharmacies/${pharmacyId}/outstanding-bills`).then(r => r.data),
    enabled: !!pharmacyId,
  });
}

export function usePharmacyCreditInfo(id: string) {
  return useQuery({
    queryKey: ['pharmacies', id, 'credit-info'],
    queryFn: () => api.get(`/pharmacies/${id}/credit-info`).then(r => r.data),
    enabled: !!id,
  });
}

export function useCreatePharmacy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: any) => api.post('/pharmacies', body).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pharmacies'] }),
  });
}

export function useUpdatePharmacy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: any) => api.patch(`/pharmacies/${id}`, body).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pharmacies'] }),
  });
}

export function usePharmacyLedger(id: string) {
  return useQuery({
    queryKey: ['pharmacies', id, 'ledger'],
    queryFn: () => api.get(`/pharmacies/${id}/ledger`).then(r => r.data),
    enabled: !!id,
  });
}

export function usePharmacyReturns(id: string) {
  return useQuery({
    queryKey: ['pharmacies', id, 'returns'],
    queryFn: () => api.get(`/pharmacies/${id}/returns`).then(r => r.data),
    enabled: !!id,
  });
}

export function useReconcilePharmacyOutstanding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/pharmacies/${id}/reconcile-outstanding`).then(r => r.data),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['pharmacies'] });
      qc.invalidateQueries({ queryKey: ['pharmacies', id] });
      qc.invalidateQueries({ queryKey: ['pharmacies', id, 'ledger'] });
      qc.invalidateQueries({ queryKey: ['reports'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
