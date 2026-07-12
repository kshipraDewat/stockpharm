import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

type ConnectionListParams = {
  status?: string;
  page?: number;
  pageSize?: number;
};

function normalizeConnectionListResponse(raw: any, fallbackPage?: number, fallbackPageSize?: number) {
  const rows = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
  return {
    data: rows,
    total: Number(raw?.total ?? rows.length),
    page: Number(raw?.page ?? fallbackPage ?? 1),
    pageSize: Number(raw?.pageSize ?? fallbackPageSize ?? (rows.length || 20)),
  };
}

export function useStockistConnections(params?: ConnectionListParams | string) {
  const normalized: ConnectionListParams = typeof params === 'string'
    ? { status: params }
    : (params ?? {});
  return useQuery({
    queryKey: ['stockist-connections', normalized],
    queryFn: () => api.get('/stockist-connections', {
      params: {
        ...(normalized.status ? { status: normalized.status } : {}),
        ...(normalized.page ? { page: normalized.page } : {}),
        ...(normalized.pageSize ? { pageSize: normalized.pageSize } : {}),
      },
    }).then(r => normalizeConnectionListResponse(r.data, normalized.page, normalized.pageSize)),
  });
}

export function useApproveConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; creditLimit?: number; paymentTermsDays?: number }) =>
      api.post(`/stockist-connections/${id}/approve`, body).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stockist-connections'] });
      qc.invalidateQueries({ queryKey: ['pharmacies'] });
    },
  });
}

export function useRejectConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post(`/stockist-connections/${id}/reject`, { reason }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stockist-connections'] }),
  });
}

export function useDisconnectConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/stockist-connections/${id}/disconnect`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stockist-connections'] }),
  });
}

export function useSyncCatalog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/stockist-connections/${id}/sync-catalog`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stockist-connections'] }),
  });
}
