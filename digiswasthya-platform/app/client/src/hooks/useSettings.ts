import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuthStore } from '../stores/authStore';

export interface Tenant {
  id: string;
  name: string;
  businessName: string;
  stateCode: string;
  gstin: string | null;
  dlNumber: string | null;
  addressJson: string | null;
  notificationsJson?: string | null;
  inviteCode?: string | null;
  phone: string;
  email: string;
}

export function useTenant() {
  return useQuery<Tenant>({
    queryKey: ['settings', 'tenant'],
    queryFn: () => api.get('/settings/tenant').then(r => r.data),
    staleTime: 30_000,
  });
}

export interface ServerFeatures {
  whatsapp: boolean;
  aiParse: boolean;
  whatsappConfigured: boolean;
}

export function useFeatures() {
  return useQuery<ServerFeatures>({
    queryKey: ['settings', 'features'],
    queryFn: () => api.get('/settings/features').then(r => r.data),
    staleTime: 60_000,
  });
}

export function useUpdateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Omit<Tenant, 'id' | 'name'>>) =>
      api.patch('/settings/tenant', body).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'tenant'] }),
  });
}

export function useUpdateOnboarding() {
  const qc = useQueryClient();
  const setUser = useAuthStore.getState().setUser;
  return useMutation({
    mutationFn: (body: {
      onboardingStep?: number;
      onboardingCompleted?: boolean;
      dlNumber?: string;
      gstin?: string | null;
      addressJson?: string | null;
      businessName?: string;
      phone?: string;
    }) =>
      api.patch('/settings/onboarding', body).then(r => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['settings', 'tenant'] });
      const user = useAuthStore.getState().user;
      if (user) {
        setUser({
          ...user,
          onboardingCompleted: data.onboardingCompleted ?? user.onboardingCompleted,
          onboardingStep: data.onboardingStep ?? user.onboardingStep,
        });
      }
    },
  });
}
