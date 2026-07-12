import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api } from '../api/client';

export function usePayableBills(params?: {
  search?: string;
  status?: string;
  stockistConnectionId?: string;
  page?: number;
  pageSize?: number;
}) {
  return useQuery({
    queryKey: ['payable-bills', params],
    queryFn: () => api.get('/payable-bills', { params }).then(r => r.data),
    placeholderData: keepPreviousData,
  });
}

export function usePayableBill(id: string) {
  return useQuery({
    queryKey: ['payable-bills', id],
    queryFn: () => api.get(`/payable-bills/${id}`).then(r => r.data),
    enabled: !!id,
  });
}
