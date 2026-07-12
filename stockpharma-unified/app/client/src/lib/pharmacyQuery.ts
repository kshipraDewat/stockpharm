import type { AxiosError } from 'axios';

/** User-facing message when a pharmacy-panel API call fails. */
export function pharmacyQueryErrorMessage(error: unknown): string | undefined {
  const status = (error as AxiosError)?.response?.status;
  const apiMsg = (error as AxiosError<{ error?: string }>)?.response?.data?.error;
  if (status === 403 && apiMsg?.includes('pharmacy')) {
    return 'You are signed in as a stockist. Sign out and sign in with a pharmacy account to use this page.';
  }
  if (status === 401) return 'Session expired — please sign in again.';
  if (apiMsg) return apiMsg;
  return undefined;
}
