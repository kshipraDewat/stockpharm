import { create } from 'zustand';
import { api } from '../api/client';
import type { TenantType } from '../lib/panel';

export type UserRole = 'admin' | 'biller' | 'pharmacist' | 'cashier';

export interface AuthUser {
  id: string;
  tenantId?: string;
  email: string;
  name: string;
  role: UserRole | string;
  tenantType?: TenantType | string;
  accountKind?: 'tenant' | 'platform' | 'consumer' | 'doctor' | 'mr';
  onboardingCompleted?: boolean;
  onboardingStep?: number;
  approvalStatus?: string;
}

interface AuthState {
  user: AuthUser | null;
  initialized: boolean;
  pendingAuthRedirect: string | null;
  setUser: (user: AuthUser | null) => void;
  setInitialized: (v: boolean) => void;
  triggerAuthRedirect: (path: string) => void;
  clearAuthRedirect: () => void;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  initialized: false,
  pendingAuthRedirect: null,
  setUser: (user) => set({ user }),
  setInitialized: (initialized) => set({ initialized }),
  triggerAuthRedirect: (path) => set((s) => (
    s.pendingAuthRedirect ? s : { user: null, initialized: true, pendingAuthRedirect: path }
  )),
  clearAuthRedirect: () => set({ pendingAuthRedirect: null }),
  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Best-effort remote logout; always clear local session.
    }
    set({ user: null, initialized: true });
  },
}));

export function isPharmacyUser(user: AuthUser | null | undefined): boolean {
  return user?.tenantType === 'pharmacy';
}
