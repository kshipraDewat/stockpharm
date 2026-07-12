import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api } from '../api/client';

export function usePublicStockists(params?: {
  state?: string;
  category?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}) {
  return useQuery({
    queryKey: ['public-stockists', params],
    queryFn: () => api.get('/public/stockists', { params }).then(r => r.data),
    placeholderData: keepPreviousData,
  });
}

export function usePublicStockistProfile(slug: string) {
  return useQuery({
    queryKey: ['public-stockist', slug],
    queryFn: () => api.get(`/public/stockists/${slug}`).then(r => r.data),
    enabled: !!slug,
  });
}

export function usePublicStockistCatalog(slug: string, params?: {
  q?: string;
  category?: string;
  page?: number;
  pageSize?: number;
}) {
  return useQuery({
    queryKey: ['public-stockist-catalog', slug, params],
    queryFn: () => api.get(`/public/stockists/${slug}/catalog`, { params }).then(r => r.data),
    enabled: !!slug,
  });
}

export function useWithdrawStockistConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/stockist-connections/${id}/withdraw`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pharmacy-connections'] }),
  });
}

export function useSyncPublicCatalog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/settings/public-catalog/sync').then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['public-catalog-settings'] });
      qc.invalidateQueries({ queryKey: ['tenant'] });
    },
  });
}

export function usePublicCatalogSettings() {
  return useQuery({
    queryKey: ['public-catalog-settings'],
    queryFn: () => api.get('/settings/public-catalog').then(r => r.data?.data ?? []),
  });
}

export function useSetProductPublicVisibility() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, isPublic }: { productId: string; isPublic: boolean }) =>
      api.patch(`/settings/public-catalog/${productId}`, { isPublic }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['public-catalog-settings'] }),
  });
}
