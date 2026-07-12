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

export function usePharmacyConnections(params?: ConnectionListParams | string) {
  const normalized: ConnectionListParams = typeof params === 'string'
    ? { status: params }
    : (params ?? {});
  return useQuery({
    queryKey: ['pharmacy-connections', normalized],
    queryFn: async () => {
      const r = await api.get('/stockist-connections', {
        params: {
          ...(normalized.status ? { status: normalized.status } : {}),
          ...(normalized.page ? { page: normalized.page } : {}),
          ...(normalized.pageSize ? { pageSize: normalized.pageSize } : {}),
        },
      });
      return normalizeConnectionListResponse(r.data, normalized.page, normalized.pageSize);
    },
  });
}

/**
 * M62: fetch a single connection directly so Detail/Public-Profile pages don't
 * depend on the paginated list (which caps at 20 by default).
 */
export function usePharmacyConnection(connectionId: string | undefined) {
  return useQuery({
    queryKey: ['pharmacy-connections', connectionId],
    queryFn: () => api.get(`/stockist-connections/${connectionId}`).then(r => r.data),
    enabled: !!connectionId,
  });
}

export function usePharmacyConnectionByStockist(stockistTenantId?: string) {
  return useQuery({
    queryKey: ['pharmacy-connections', 'by-stockist', stockistTenantId],
    queryFn: async () => {
      try {
        return await api.get(`/stockist-connections/by-stockist/${stockistTenantId}`).then(r => r.data);
      } catch (err: any) {
        if (err?.response?.status === 404) return null;
        throw err;
      }
    },
    enabled: !!stockistTenantId,
  });
}

export function usePharmacyConnectionCatalog(
  connectionId: string,
  options?: { enabled?: boolean },
) {
  const enabled = options?.enabled !== false && !!connectionId;
  return useQuery({
    queryKey: ['pharmacy-connections', connectionId, 'catalog'],
    queryFn: () => api.get(`/stockist-connections/${connectionId}/catalog`).then(r => r.data?.data ?? r.data ?? []),
    enabled,
  });
}

export function useRequestStockistConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      inviteCode?: string;
      stockistTenantId?: string;
      gstin?: string;
      note?: string;
      expectedMonthlyVolume?: number;
      requestSource?: 'discovery' | 'invite_code' | 'gstin_search';
    }) =>
      api.post('/stockist-connections/request', body).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pharmacy-connections'] }),
  });
}

/**
 * Pharmacy-side: trigger a catalog refresh for this connection.
 * Calls the pharmacy-scoped `/pull-catalog` endpoint (admin/pharmacist).
 */
export function useSyncStockistCatalog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/stockist-connections/${id}/pull-catalog`).then(r => r.data),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['pharmacy-connections'] });
      qc.invalidateQueries({ queryKey: ['pharmacy-connections', id, 'catalog'] });
    },
  });
}

export function useMapCatalogLocalProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ connectionId, catalogItemId, localProductId }: { connectionId: string; catalogItemId: string; localProductId: string }) =>
      api.patch(`/stockist-connections/${connectionId}/catalog/${catalogItemId}/map`, { localProductId }).then(r => r.data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['pharmacy-connections', vars.connectionId, 'catalog'] });
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

export function useDisconnectStockistConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/stockist-connections/${id}/disconnect`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pharmacy-connections'] }),
  });
}
