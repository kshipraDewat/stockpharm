import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { useTenant, useUpdateTenant } from '../../hooks/useSettings';
import { parseTenantSettings, mergeTenantSettings } from '../../lib/tenantSettings';
import { DEFAULT_CREDIT_LIMIT } from '../../lib/constants';
import Button from '../common/Button';
import Input from '../common/Input';

const OrderDefaultsTab = () => {
  const { data: tenant, isLoading } = useTenant();
  const updateTenant = useUpdateTenant();

  const [autoApprove, setAutoApprove] = useState(false);
  const [defaultCreditLimit, setDefaultCreditLimit] = useState(String(DEFAULT_CREDIT_LIMIT));

  useEffect(() => {
    const parsed = parseTenantSettings(tenant?.notificationsJson);
    setAutoApprove(!!parsed.autoApprovePortalOrders);
    setDefaultCreditLimit(String(parsed.defaultCreditLimit ?? DEFAULT_CREDIT_LIMIT));
  }, [tenant?.notificationsJson]);

  const handleSave = () => {
    const limit = Number(defaultCreditLimit);
    if (!limit || limit <= 0) { toast.error('Enter a valid credit limit'); return; }
    updateTenant.mutate({
      notificationsJson: mergeTenantSettings(tenant?.notificationsJson, {
        autoApprovePortalOrders: autoApprove,
        defaultCreditLimit: limit,
      }),
    }, {
      onSuccess: () => toast.success('Order defaults saved'),
      onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Save failed'),
    });
  };

  if (isLoading) return <div className="text-slate-400 text-sm">Loading…</div>;

  return (
    <div className="max-w-lg space-y-5">
      <label className="flex items-center justify-between p-4 border border-slate-100 rounded-xl cursor-pointer hover:bg-slate-50">
        <div>
          <p className="text-sm font-medium text-slate-900">Auto-approve portal orders</p>
          <p className="text-xs text-slate-400 mt-0.5">Automatically accept pharmacy-submitted orders without manual review.</p>
        </div>
        <input type="checkbox" checked={autoApprove} onChange={e => setAutoApprove(e.target.checked)} className="w-4 h-4 accent-blue-600" />
      </label>

      <Input
        label="Default credit limit (₹)"
        type="number"
        value={defaultCreditLimit}
        onChange={e => setDefaultCreditLimit(e.target.value)}
        placeholder={String(DEFAULT_CREDIT_LIMIT)}
      />
      <p className="text-xs text-slate-400">Applied when approving new pharmacy connections unless overridden.</p>

      <Button variant="primary" size="sm" onClick={handleSave} isLoading={updateTenant.isPending}>Save Defaults</Button>
    </div>
  );
};

export default OrderDefaultsTab;
