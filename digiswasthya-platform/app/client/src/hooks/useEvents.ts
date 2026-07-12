import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { api } from '../api/client';
import { useEventSyncStore } from '../stores/eventSyncStore';

const SYNC_TOAST_ID = 'event-sync-error';

export function syncErrorMessage(err: unknown): string {
  const e = err as { response?: { data?: { error?: string } }; message?: string };
  return e?.response?.data?.error ?? e?.message ?? 'Cross-tenant sync failed';
}

function reportSyncFailure(err: unknown) {
  const msg = syncErrorMessage(err);
  useEventSyncStore.getState().setLastError(msg);
  toast.error(msg, { id: SYNC_TOAST_ID });
}

function reportSyncSuccess() {
  useEventSyncStore.getState().setLastError(null);
  toast.dismiss(SYNC_TOAST_ID);
}

function invalidateEventQueries(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['events'] });
  qc.invalidateQueries({ queryKey: ['events-history'] });
  qc.invalidateQueries({ queryKey: ['purchase-orders'] });
  qc.invalidateQueries({ queryKey: ['payable-bills'] });
  qc.invalidateQueries({ queryKey: ['stockist-connections'] });
  qc.invalidateQueries({ queryKey: ['pharmacy-connections'] });
  qc.invalidateQueries({ queryKey: ['returns'] });
  qc.invalidateQueries({ queryKey: ['stockist-returns'] });
  qc.invalidateQueries({ queryKey: ['orders'] });
  qc.invalidateQueries({ queryKey: ['bills'] });
  qc.invalidateQueries({ queryKey: ['payments'] });
  qc.invalidateQueries({ queryKey: ['incoming-orders'] });
}

async function processPendingEvents(qc: QueryClient) {
  try {
    await api.post('/events/process');
    reportSyncSuccess();
    invalidateEventQueries(qc);
  } catch (err) {
    reportSyncFailure(err);
    throw err;
  }
}

export function useEvents(limit = 50, options?: { poll?: boolean }) {
  const poll = options?.poll !== false;
  const qc = useQueryClient();
  const processed = useRef(false);

  const query = useQuery({
    queryKey: ['events', limit],
    queryFn: async () => {
      const events = await api.get('/events', { params: { limit } }).then(r => r.data?.data ?? r.data ?? []);
      if (poll && events.length > 0) {
        try {
          await processPendingEvents(qc);
        } catch {
          // Error already reported; still return pending events for the UI.
        }
      }
      return events;
    },
    refetchInterval: poll ? 10_000 : false,
  });

  useEffect(() => {
    if (poll && !processed.current) {
      processed.current = true;
      processPendingEvents(qc).catch(() => {});
    }
  }, [poll, qc]);

  return query;
}

export function useProcessEvents() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/events/process').then(r => r.data),
    onSuccess: () => {
      reportSyncSuccess();
      invalidateEventQueries(qc);
    },
    onError: (err) => reportSyncFailure(err),
  });
}

export function useEventHistory(limit = 20) {
  return useQuery({
    queryKey: ['events-history', limit],
    queryFn: async () => {
      try {
        const history = await api.get('/events/history', { params: { limit } }).then(r => r.data?.data ?? r.data ?? []);
        return Array.isArray(history) ? history : [];
      } catch {
        const fallback = await api.get('/events', { params: { limit } }).then(r => r.data?.data ?? r.data ?? []);
        return Array.isArray(fallback) ? fallback : [];
      }
    },
    refetchInterval: 10_000,
  });
}
