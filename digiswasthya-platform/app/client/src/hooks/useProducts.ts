import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api } from '../api/client';

export function useProducts(params?: { search?: string; category?: string; page?: number; pageSize?: number }) {
  return useQuery({
    queryKey: ['products', params],
    queryFn: () => api.get('/products', { params }).then(r => r.data),
    placeholderData: keepPreviousData,
  });
}

export function useProduct(id: string) {
  return useQuery({
    queryKey: ['products', id],
    queryFn: () => api.get(`/products/${id}`).then(r => r.data),
    enabled: !!id,
  });
}

export function useProductBatches(id: string) {
  return useQuery({
    queryKey: ['products', id, 'batches'],
    queryFn: () => api.get(`/products/${id}/batches`).then(r => r.data),
    enabled: !!id,
  });
}

export function useCreateProductFromCatalog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (catalogItemId: string) => api.post(`/products/from-catalog/${catalogItemId}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: any) => api.post('/products', body).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });
}

export function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: any) => api.patch(`/products/${id}`, body).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });
}

export function useProductCategories() {
  return useQuery({
    queryKey: ['products', 'categories'],
    queryFn: () => api.get('/products/categories').then(r => r.data),
  });
}

export function useAdjustStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; batchId: string; deltaQty: number; reason: string; notes?: string }) =>
      api.post(`/products/${id}/adjust-stock`, body).then(r => r.data),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['products', variables.id] });
      qc.invalidateQueries({ queryKey: ['products', variables.id, 'batches'] });
    },
  });
}
