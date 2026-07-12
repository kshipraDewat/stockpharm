import React, { useState } from 'react';
import { Copy, Check, Link2 } from 'lucide-react';
import Button from '../common/Button';
import ConfirmDialog from '../common/ConfirmDialog';
import { useTenant } from '../../hooks/useSettings';
import { useAuthStore } from '../../stores/authStore';
import { useStockistConnections, useSyncCatalog, useDisconnectConnection } from '../../hooks/useStockistConnections';
import { statusBadge } from '../common/Badge';
import ApproveConnectionModal from './ApproveConnectionModal';
import RejectConnectionModal from './RejectConnectionModal';
import toast from 'react-hot-toast';

const InviteCodeCard = () => {
  const { data: tenant } = useTenant();
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin');
  const [copied, setCopied] = useState(false);
  const code = tenant?.inviteCode ?? '—';

  if (!isAdmin) return null;

  const copy = () => {
    if (!tenant?.inviteCode) return;
    navigator.clipboard.writeText(tenant.inviteCode);
    setCopied(true);
    toast.success('Invite code copied');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-blue-50 border border-blue-100 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-2">
        <Link2 className="w-5 h-5 text-blue-600" />
        <h3 className="font-semibold text-gray-900">Pharmacy Invite Code</h3>
      </div>
      <p className="text-sm text-gray-600 mb-3">Share this code with pharmacies to connect their panel to your stockist account.</p>
      <div className="flex items-center gap-3">
        <code className="text-2xl font-bold tracking-widest text-blue-700 bg-white px-4 py-2 rounded-lg border border-blue-200">{code}</code>
        <Button variant="secondary" size="sm" leftIcon={copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} onClick={copy} disabled={!tenant?.inviteCode}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </div>
  );
};

const ConnectionsTab = () => {
  const { data, isLoading } = useStockistConnections();
  const connections = data?.data ?? [];
  const pending = connections.filter((c: any) => c.status === 'pending');
  const active = connections.filter((c: any) => c.status === 'active');
  const syncCatalog = useSyncCatalog();
  const disconnect = useDisconnectConnection();
  const [approveId, setApproveId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [disconnectId, setDisconnectId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <InviteCodeCard />

      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Pending Requests ({pending.length})</h3>
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs text-gray-500">Pharmacy</th>
                <th className="px-4 py-2 text-left text-xs text-gray-500">GSTIN</th>
                <th className="px-4 py-2 text-left text-xs text-gray-500">Phone</th>
                <th className="px-4 py-2 text-right text-xs text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">Loading…</td></tr>
              ) : pending.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">No pending connection requests</td></tr>
              ) : pending.map((c: any) => (
                <tr key={c.id}>
                  <td className="px-4 py-3 font-medium">{c.pharmacyName}</td>
                  <td className="px-4 py-3 text-gray-500">{c.pharmacyGstin ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{c.pharmacyPhone}</td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <Button size="sm" variant="primary" onClick={() => setApproveId(c.id)}>Approve</Button>
                    <Button size="sm" variant="danger" onClick={() => setRejectId(c.id)}>Reject</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Active Connections ({active.length})</h3>
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs text-gray-500">Pharmacy</th>
                <th className="px-4 py-2 text-left text-xs text-gray-500">Credit Limit</th>
                <th className="px-4 py-2 text-left text-xs text-gray-500">Status</th>
                <th className="px-4 py-2 text-right text-xs text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {active.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">No active pharmacy connections</td></tr>
              ) : active.map((c: any) => (
                <tr key={c.id}>
                  <td className="px-4 py-3 font-medium">{c.pharmacyName}</td>
                  <td className="px-4 py-3">₹{Number(c.creditLimit ?? 0).toLocaleString('en-IN')}</td>
                  <td className="px-4 py-3">{statusBadge(c.status)}</td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <Button size="sm" variant="secondary" isLoading={syncCatalog.isPending}
                      onClick={() => syncCatalog.mutate(c.id, { onSuccess: () => toast.success('Catalog synced') })}>
                      Sync Catalog
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDisconnectId(c.id)}>
                      Disconnect
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {approveId && <ApproveConnectionModal isOpen onClose={() => setApproveId(null)} connectionId={approveId} />}
      {rejectId && <RejectConnectionModal isOpen onClose={() => setRejectId(null)} connectionId={rejectId} />}
      <ConfirmDialog
        isOpen={disconnectId !== null}
        onClose={() => setDisconnectId(null)}
        onConfirm={() => {
          if (!disconnectId) return;
          disconnect.mutate(disconnectId, {
            onSuccess: () => { toast.success('Disconnected'); setDisconnectId(null); },
            onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Failed to disconnect'),
          });
        }}
        title="Disconnect Pharmacy"
        description="This will remove portal access for this pharmacy. They will no longer be able to place orders through the portal."
        confirmLabel="Disconnect"
        confirmVariant="danger"
        isLoading={disconnect.isPending}
      />
    </div>
  );
};

export default ConnectionsTab;
