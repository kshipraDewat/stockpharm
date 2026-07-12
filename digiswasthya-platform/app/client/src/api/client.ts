import axios from 'axios';
import { useAuthStore } from '../stores/authStore';

export const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

api.interceptors.response.use(
  (r) => r,
  (error) => {
    if (error.response?.status === 401 && !error.config?.url?.includes('/auth/login')) {
      const path = window.location.pathname;
      const onPharmacy = path.startsWith('/pharmacy');
      const loginTarget = onPharmacy ? '/login?panel=pharmacy' : '/login';
      if (!path.startsWith('/login')) {
        useAuthStore.getState().triggerAuthRedirect(loginTarget);
      } else {
        useAuthStore.getState().setUser(null);
        useAuthStore.getState().setInitialized(true);
      }
    }
    return Promise.reject(error);
  },
);
