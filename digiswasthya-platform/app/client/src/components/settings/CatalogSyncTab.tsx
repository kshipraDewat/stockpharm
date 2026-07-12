import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { RefreshCw } from 'lucide-react';
import { useTenant, useUpdateTenant } from '../../hooks/useSettings';
import { useStockistConnections, useSyncCatalog } from '../../hooks/useStockistConnections';
import { parseTenantSettings, mergeTenantSettings } from '../../lib/tenantSettings';
import Button from '../common/Button';

const CatalogSyncTab = () => {
  const { data: tenant } = useTenant();
  const updateTenant = useUpdateTenant();
  const { data } = useStockistConnections();
  const connections = data?.data ?? [];
  const active = connections.filter((c: any) => c.status === 'active');
  const syncCatalog = useSyncCatalog();

  const settings = parseTenantSettings(tenant?.notificationsJson);
  const [frequency, setFrequency] = useState(String(settings.catalogSyncFrequency ?? 'manual'));

  const saveFrequency = () => {
    updateTenant.mutate({
      notificationsJson: mergeTenantSettings(tenant?.notificationsJson, { catalogSyncFrequency: frequency }),
    }, {
      onSuccess: () => toast.success('Catalog sync preference saved'),
      onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Save failed'),
    });
  };

  const syncAll = async () => {
    if (active.length === 0) { toast.error('No active pharmacy connections'); return; }
    try {
      for (const c of active) {
        await syncCatalog.mutateAsync(c.id);
      }
      toast.success(`Synced catalog for ${active.length} connection(s)`);
    } catch {
      toast.error('Some catalog syncs failed');
    }
  };

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h4 className="text-sm font-medium text-slate-700 mb-2">Sync Frequency</h4>
        <select
          value={frequency}
          onChange={e => setFrequency(e.target.value)}
          className="w-full h-10 px-3 text-sm border border-slate-200 rounded-lg"
        >
          <option value="manual">Manual only</option>
        </select>
        <p className="mt-2 text-xs text-slate-400">Automated daily/weekly sync options will be enabled in a later phase.</p>
        <Button variant="secondary" size="sm" className="mt-2" onClick={saveFrequency} isLoading={updateTenant.isPending}>Save Preference</Button>
      </div>

      <div className="pt-4 border-t border-slate-100">
        <h4 className="text-sm font-medium text-slate-700 mb-2">Sync All Active Connections</h4>
        <p className="text-xs text-slate-400 mb-3">Push your latest product catalog to all connected pharmacies.</p>
        <Button variant="primary" leftIcon={<RefreshCw className="w-4 h-4" />} onClick={syncAll} isLoading={syncCatalog.isPending}>
          Sync All Catalogs ({active.length})
        </Button>
      </div>
    </div>
  );
};

export default CatalogSyncTab;
