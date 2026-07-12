import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { RefreshCcw, AlertCircle, Printer } from 'lucide-react';
import { useReturn, useProcessReturn, useRejectReturn } from '../../hooks/useReturns';
import { useTenant } from '../../hooks/useSettings';
import { useAuthStore } from '../../stores/authStore';
import PageHeader from '../common/PageHeader';
import { statusBadge } from '../common/Badge';
import Button from '../common/Button';
import ConfirmDialog from '../common/ConfirmDialog';
import Modal from '../common/Modal';
import { formatCurrency, formatDate } from '../../lib/formatters';
import { getLineTotal, getQty, getTotal } from '../../lib/fields';
import toast from 'react-hot-toast';

const ReturnDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [processConfirmOpen, setProcessConfirmOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const { data: returnData, isLoading, isError, refetch } = useReturn(id!);
  const { data: tenant } = useTenant();
  const processReturn = useProcessReturn();
  const rejectReturn = useRejectReturn();
  const isAdmin = useAuthStore((s) => s.user?.role) === 'admin';

  if (isLoading) return <div className="p-6 text-slate-500">Loading return…</div>;
  if (isError) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <AlertCircle className="w-12 h-12 text-red-500" />
      <p className="text-slate-600">Failed to load return.</p>
      <Button variant="secondary" onClick={() => refetch()}>Retry</Button>
    </div>
  );
  if (!returnData) return (
    <div className="flex flex-col items-center justify-center h-64">
      <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
      <h2 className="text-xl font-bold text-slate-900">Return Not Found</h2>
      <Button variant="primary" onClick={() => navigate('/returns')} className="mt-4">Back to Returns</Button>
    </div>
  );

  const label = returnData.returnNumber ?? returnData.id;
  const items = returnData.items ?? [];
  const isPending = returnData.status === 'requested';

  return (
    <div className="space-y-4 max-w-7xl mx-auto no-print">
      <PageHeader
        breadcrumbs={[{ label: 'Returns', link: '/returns' }, { label: label }]}
        showBack={true}
        actions={
          <div className="flex gap-2 items-center">
            {statusBadge(returnData.status)}
            <Button variant="secondary" leftIcon={<Printer size={16} />} size="sm" onClick={() => window.print()}>Print Credit Note</Button>
            {isPending && isAdmin && (
              <>
                <Button variant="danger" size="sm" onClick={() => setRejectOpen(true)} isLoading={rejectReturn.isPending}>
                  Reject
                </Button>
                <Button variant="primary" leftIcon={<RefreshCcw size={16} />} size="sm" onClick={() => setProcessConfirmOpen(true)} isLoading={processReturn.isPending}>
                  Process Return
                </Button>
              </>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4">Return Summary</p>
          <div className="space-y-3">
            {[
              ['Total Value', formatCurrency(getTotal(returnData))],
              ['Reason', returnData.reason ?? 'Not specified'],
              ['Date', formatDate(returnData.createdAt ?? returnData.date)],
              ['Bill #', returnData.billNumber ?? '—'],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between py-2 border-b border-slate-50 last:border-0">
                <span className="text-sm text-slate-500">{label}</span>
                <span className="text-sm font-medium text-slate-800 text-right max-w-xs">{value}</span>
              </div>
            ))}
            <div className="flex justify-between py-2">
              <span className="text-sm text-slate-500">Order</span>
              <span className="text-sm font-mono text-blue-600 cursor-pointer" onClick={() => returnData.orderId && navigate(`/orders/${returnData.orderId}`)}>
                {returnData.orderNumber ?? (returnData.orderId ? `${returnData.orderId.slice(0, 8)}…` : '—')}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4">Pharmacy</p>
          <div className="space-y-3">
            <div className="flex justify-between py-2 border-b border-slate-50">
              <span className="text-sm text-slate-500">Name</span>
              <span className="text-sm font-medium text-blue-600">{returnData.pharmacyName ?? '—'}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-sm text-slate-500">Type</span>
              <span className="text-sm text-slate-700">Distributor Return</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Returned Items</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">Product</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">Batch</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wide">Qty</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wide">Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {items.length > 0 ? items.map((item: any, idx: number) => (
              <tr key={item.id ?? idx}>
                <td className="px-4 py-3 font-medium text-slate-900">{item.productName ?? item.name}</td>
                <td className="px-4 py-3 text-slate-500 font-mono text-xs">{item.batchNumber ?? item.batch ?? '—'}</td>
                <td className="px-4 py-3 text-slate-700 text-right">{getQty(item)}</td>
                <td className="px-4 py-3 text-slate-900 text-right font-medium">
                  {formatCurrency(getLineTotal(item))}
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-sm text-slate-400">No item details available.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div id="credit-note-content" className="credit-note-section bg-white p-8 rounded-lg border border-gray-200">
        <div className="flex justify-between border-b border-gray-200 pb-6 mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{tenant?.businessName ?? 'Credit Note'}</h2>
            {tenant?.gstin && <p className="text-sm text-gray-500 mt-1">GSTIN: {tenant.gstin}</p>}
            {tenant?.addressJson && <p className="text-sm text-gray-500">{tenant.addressJson}</p>}
          </div>
          <div className="text-right">
            <h3 className="text-lg font-semibold uppercase">Credit Note</h3>
            <p className="text-sm text-gray-500 mt-2">CN No: {label}</p>
            <p className="text-sm text-gray-500">Date: {formatDate(returnData.returnDate ?? returnData.createdAt)}</p>
            {returnData.billNumber && <p className="text-sm text-gray-500">Against Invoice: {returnData.billNumber}</p>}
            {returnData.orderNumber && <p className="text-sm text-gray-500">Order: {returnData.orderNumber}</p>}
          </div>
        </div>
        <p className="text-sm mb-4"><strong>Customer:</strong> {returnData.pharmacyName ?? '—'}</p>
        <table className="w-full text-sm mb-6">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-3 py-2 text-left">Product</th>
              <th className="px-3 py-2 text-right">Qty</th>
              <th className="px-3 py-2 text-right">Value</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item: any, idx: number) => (
              <tr key={item.id ?? idx} className="border-b">
                <td className="px-3 py-2">{item.productName ?? item.name}</td>
                <td className="px-3 py-2 text-right">{getQty(item)}</td>
                <td className="px-3 py-2 text-right">{formatCurrency(getLineTotal(item))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex justify-end">
          <div className="w-64 space-y-2">
            <div className="flex justify-between font-bold text-lg border-t pt-2">
              <span>Credit Total</span>
              <span>{formatCurrency(getTotal(returnData))}</span>
            </div>
          </div>
        </div>
        <p className="text-xs text-gray-500 text-center mt-8">This is a computer-generated credit note.</p>
      </div>

      <Modal
        isOpen={rejectOpen}
        onClose={() => { setRejectOpen(false); setRejectReason(''); }}
        title="Reject Return"
        size="sm"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => { setRejectOpen(false); setRejectReason(''); }}>Cancel</Button>
            <Button variant="danger" size="sm" isLoading={rejectReturn.isPending} onClick={() => {
              if (!rejectReason.trim()) { toast.error('Rejection reason is required'); return; }
              rejectReturn.mutate({ id: id!, reason: rejectReason.trim() }, {
                onSuccess: () => { toast.success('Return rejected'); setRejectOpen(false); setRejectReason(''); },
                onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Failed to reject return'),
              });
            }}>
              Reject Return
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600 mb-3">The pharmacy will be notified with your reason.</p>
        <textarea
          value={rejectReason}
          onChange={e => setRejectReason(e.target.value)}
          placeholder="Reason for rejection…"
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
          rows={3}
        />
      </Modal>

      <ConfirmDialog
        isOpen={processConfirmOpen}
        onClose={() => setProcessConfirmOpen(false)}
        onConfirm={() => {
          processReturn.mutate(id!, {
            onSuccess: () => { toast.success('Return processed!'); setProcessConfirmOpen(false); },
            onError: (err: any) => { toast.error(err?.response?.data?.error ?? 'Failed to process return'); setProcessConfirmOpen(false); },
          });
        }}
        title="Process Return"
        description="This will restock the returned items and post a credit note to the pharmacy ledger. This cannot be undone."
        confirmLabel="Process Return"
        confirmVariant="primary"
        isLoading={processReturn.isPending}
      />
    </div>
  );
};

export default ReturnDetailPage;
