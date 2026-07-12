/** Typed accessors for tenant.notificationsJson blob (prototype-friendly). */

export interface TenantSettings {
  defaultCreditLimit?: number;
  catalogSyncFrequency?: string;
  orderDefaults?: Record<string, unknown>;
  notifications?: Record<string, boolean>;
  [key: string]: unknown;
}

export function parseTenantSettings(notificationsJson?: string | null): TenantSettings {
  if (!notificationsJson) return {};
  try {
    return JSON.parse(notificationsJson) as TenantSettings;
  } catch {
    return {};
  }
}

export function serializeTenantSettings(settings: TenantSettings): string {
  return JSON.stringify(settings);
}

export function mergeTenantSettings(
  notificationsJson: string | null | undefined,
  patch: Partial<TenantSettings>,
): string {
  return serializeTenantSettings({ ...parseTenantSettings(notificationsJson), ...patch });
}
