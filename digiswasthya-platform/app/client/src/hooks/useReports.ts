import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

function useDashboardByTenant(tenantType: 'stockist' | 'pharmacy', from?: string, to?: string) {
  return useQuery({
    queryKey: ['reports', 'dashboard', tenantType, from, to],
    queryFn: () => api.get('/reports/dashboard', { params: { from, to } }).then(r => r.data),
    staleTime: 60_000,
  });
}

export function useStockistDashboard(from?: string, to?: string) {
  return useDashboardByTenant('stockist', from, to);
}

export function usePharmacyDashboard(from?: string, to?: string) {
  return useDashboardByTenant('pharmacy', from, to);
}

// Backward compatibility for existing stockist consumers.
export function useDashboard(from?: string, to?: string) {
  return useStockistDashboard(from, to);
}

export function useSalesReport(from: string, to: string, page = 1, pageSize = 50) {
  return useQuery({
    queryKey: ['reports', 'sales', from, to, page, pageSize],
    queryFn: () => api.get('/reports/sales', { params: { from, to, page, pageSize } }).then(r => r.data),
  });
}

export function useProfitReport(from: string, to: string) {
  return useQuery({
    queryKey: ['reports', 'profit', from, to],
    queryFn: () => api.get('/reports/profit', { params: { from, to } }).then(r => r.data),
  });
}

export function useOutstandingReport(asOfDate?: string) {
  return useQuery({
    queryKey: ['reports', 'outstanding', asOfDate],
    queryFn: () => api.get('/reports/outstanding', { params: asOfDate ? { asOfDate } : {} }).then(r => r.data),
  });
}

export function useGstReport(month: string) {
  return useQuery({
    queryKey: ['reports', 'gst', month],
    queryFn: () => api.get('/reports/gst', { params: { month } }).then(r => r.data),
  });
}

export function useStockAgingReport(asOfDate?: string, options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;
  return useQuery({
    queryKey: ['reports', 'stock-aging', asOfDate],
    queryFn: () => api.get('/reports/stock-aging', { params: asOfDate ? { asOfDate } : {} }).then(r => r.data),
    enabled,
  });
}

export function useRequiredStockReport() {
  return useQuery({
    queryKey: ['reports', 'required-stock'],
    queryFn: () => api.get('/reports/required-stock').then(r => r.data),
  });
}

export function useComplianceReport(type: string, month?: string) {
  return useQuery({
    queryKey: ['reports', 'compliance', type, month],
    queryFn: () => api.get('/reports/compliance', { params: { type, month } }).then(r => r.data),
  });
}
