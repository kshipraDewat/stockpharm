import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  usePurchaseOrder,
  useSubmitPurchaseOrder,
  useCancelPurchaseOrder,
  useConfirmPurchaseOrderReceipt,
  useDeletePurchaseOrder,
} from '../../../hooks/usePurchaseOrders';
import { useProducts } from '../../../hooks/useProducts';
import { useAuthStore } from '../../../stores/authStore';
import PageHeader from '../../common/PageHeader';
import Button from '../../common/Button';
import ConfirmDialog from '../../common/ConfirmDialog';
import { statusBadge } from '../../common/Badge';
import { formatCurrency, formatDate } from '../../../lib/formatters';
import { useProcessEvents } from '../../../hooks/useEvents';
import ReceiveGrnModal from '../grn/ReceiveGrnModal';
import InitiateStockistReturnModal from '../returns/InitiateStockistReturnModal';

const STEPS = ['draft', 'submitted', 'accepted', 'packed', 'shipped', 'delivered', 'received'] as const;

function getStepperState(status: string) {
  if (status === 'rejected') {
    return { activeIdx: STEPS.indexOf('submitted'), terminal: 'rejected' as const, partialReceived: false };
  }
  if (status === 'cancelled') {
    return { activeIdx: STEPS.indexOf('draft'), terminal: 'cancelled' as const, partialReceived: false };
  }
  if (status === 'cancel_requested') {
    return { activeIdx: STEPS.indexOf('accepted'), terminal: 'cancel_requested' as const, partialReceived: false };
  }
  if (status === 'partially_received') {
    return { activeIdx: STEPS.indexOf('delivered'), terminal: null, partialReceived: true };
  }
  const idx = STEPS.indexOf(status as typeof STEPS[number]);
  return { activeIdx: idx >= 0 ? idx : 0, terminal: null, partialReceived: false };
}

const PurchaseOrderDetailPage = () => {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data: po, isLoading } = usePurchaseOrder(id);
  const submitPo = useSubmitPurchaseOrder();
  const cancelPo = useCancelPurchaseOrder();
  const confirmReceipt = useConfirmPurchaseOrderReceipt();
  const deletePo = useDeletePurchaseOrder();
  const canReturnRole = useAuthStore((s) => ['admin', 'pharmacist'].includes(s.user?.role ?? ''));
  const { data: productsData } = useProducts({ pageSize: 500 });
  const localProducts = productsData?.data ?? productsData ?? [];

  const [showCancel, setShowCancel] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showConfirmReceipt, setShowConfirmReceipt] = useState(false);
  const [showGrn, setShowGrn] = useState(false);
  const [showReturn, setShowReturn] = useState(false);
  const [grnPrompt, setGrnPrompt] = useState(false);
  const processEvents = useProcessEvents();

  const returnLines = useMemo(() => {
    if (!po) return [];
    return (po.items ?? []).map((item: any) => ({
      id: item.id,
      productName: item.productName,
      catalogItemId: item.catalogItemId,
      localProductId: item.productId ?? item.localProductId,
      qty: Number(item.receivedQty ?? 0),
      rate: Number(item.rate ?? 0),
      gstRate: Number(item.gstRate ?? 0),
    })).filter((l: { qty: number }) => l.qty > 0);
  }, [po]);

  if (isLoading) return <div className="p-8 text-center text-slate-400">Loading…</div>;
  if (!po) return <div className="p-8 text-center text-slate-500">Purchase order not found.</div>;

  const canCancel = !['delivered', 'received', 'partially_received', 'rejected', 'cancel_requested', 'cancelled'].includes(po.status);
  const canEditDraft = po.status === 'draft';
  const canDelete = po.status === 'draft';
  const canSubmit = po.status === 'draft';
  const canConfirmReceipt = po.status === 'shipped';
  const canReceiveGrn = ['delivered', 'partially_received'].includes(po.status);
  const canInitiateReturn = canReturnRole && ['received', 'partially_received'].includes(po.status) && returnLines.length > 0;
  const { activeIdx, terminal, partialReceived } = getStepperState(po.status);

  const handleDuplicate = () => navigate(`/pharmacy/purchase-orders/create?duplicateFrom=${id}`);

  const handleSubmit = async () => {
    try {
      await submitPo.mutateAsync(id);
      toast.success('Order submitted to stockist');
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Submit failed');
    }
  };

  const handleCancel = async () => {
    try {
      await cancelPo.mutateAsync(id);
      toast.success('Order cancelled');
      setShowCancel(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Cancel failed');
    }
  };

  const handleDelete = async () => {
    try {
      await deletePo.mutateAsync(id);
      toast.success('Draft deleted');
      navigate('/pharmacy/purchase-orders');
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Delete failed');
    }
  };

  const handleConfirmReceipt = async () => {
    try {
      await confirmReceipt.mutateAsync(id);
      toast.success('Receipt confirmed — next step: receive GRN to update stock');
      setShowConfirmReceipt(false);
      setGrnPrompt(true);
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Failed to confirm receipt');
    }
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <PageHeader
        breadcrumbs={[
          { label: 'Purchase Orders', link: '/pharmacy/purchase-orders' },
          { label: po.poNumber ?? id.slice(0, 8) },
        ]}
        actions={
          <div className="flex gap-2 flex-wrap">
            {po.status === 'rejected' && <Button variant="secondary" onClick={handleDuplicate}>Duplicate to Draft</Button>}
            {canEditDraft && (
              <Button variant="secondary" onClick={() => navigate(`/pharmacy/purchase-orders/create?editFrom=${id}`)}>
                Edit Draft
              </Button>
            )}
            {canSubmit && <Button variant="primary" onClick={handleSubmit} isLoading={submitPo.isPending} className="!bg-teal-600 hover:!bg-teal-700">Submit</Button>}
            {canConfirmReceipt && <Button variant="primary" onClick={() => setShowConfirmReceipt(true)} isLoading={confirmReceipt.isPending} className="!bg-teal-600 hover:!bg-teal-700">Confirm Receipt</Button>}
            {canReceiveGrn && <Button variant="primary" onClick={() => setShowGrn(true)} className="!bg-teal-600 hover:!bg-teal-700">Receive GRN</Button>}
            {canInitiateReturn && <Button variant="secondary" onClick={() => setShowReturn(true)}>Initiate Return</Button>}
            {canCancel && <Button variant="secondary" onClick={() => setShowCancel(true)}>Cancel</Button>}
            {canDelete && <Button variant="danger" onClick={() => setShowDelete(true)}>Delete</Button>}
            <Button variant="secondary" size="sm" onClick={() => processEvents.mutate()} isLoading={processEvents.isPending}>Sync now</Button>
          </div>
        }
      />

      {po.status === 'shipped' && (
        <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 text-sm text-blue-800">
          Shipment in transit. Step 1: <strong>Confirm Receipt</strong> when goods arrive. Step 2: <strong>Receive GRN</strong> to add stock.
        </div>
      )}

      {(grnPrompt || (po.status === 'delivered' && canReceiveGrn)) && (
        <div className="bg-teal-50 border border-teal-100 rounded-lg px-4 py-3 text-sm text-teal-800 flex items-center justify-between gap-3">
          <span>Delivery confirmed — receive GRN to update pharmacy inventory.</span>
          <Button variant="primary" size="sm" onClick={() => { setShowGrn(true); setGrnPrompt(false); }} className="!bg-teal-600 hover:!bg-teal-700 shrink-0">
            Receive GRN
          </Button>
        </div>
      )}

      {po.status === 'rejected' && po.rejectionReason && (
        <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-3 text-sm text-red-700">
          Rejected by stockist: {po.rejectionReason}
        </div>
      )}

      {po.status === 'cancel_requested' && (
        <div className="bg-amber-50 border border-amber-100 rounded-lg px-4 py-3 text-sm text-amber-800">
          Cancel pending stockist approval. You cannot submit another cancel request.
        </div>
      )}

      {po.status === 'cancelled' && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm text-slate-600">
          This order was cancelled.
        </div>
      )}

      <div className="flex gap-1 overflow-x-auto">
        {STEPS.map((s, i) => {
          const isPartialStep = partialReceived && s === 'received';
          const isActive = terminal ? i <= activeIdx : isPartialStep ? false : i <= activeIdx;
          const isPartialActive = isPartialStep && partialReceived;
          return (
            <div
              key={s}
              className={`flex-1 min-w-[70px] text-center py-2 rounded-lg text-[11px] font-medium capitalize ${
                isPartialActive
                  ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                  : isActive
                    ? 'bg-teal-50 text-teal-700'
                    : 'bg-slate-50 text-slate-400'
              }`}
            >
              {isPartialActive ? 'Partial' : s}
            </div>
          );
        })}
        {terminal === 'rejected' && (
          <div className="flex-1 min-w-[70px] text-center py-2 rounded-lg text-[11px] font-medium bg-red-50 text-red-700">
            Rejected
          </div>
        )}
        {terminal === 'cancel_requested' && (
          <div className="flex-1 min-w-[70px] text-center py-2 rounded-lg text-[11px] font-medium bg-amber-50 text-amber-700">
            Cancel Pending
          </div>
        )}
        {terminal === 'cancelled' && (
          <div className="flex-1 min-w-[70px] text-center py-2 rounded-lg text-[11px] font-medium bg-red-50 text-red-700">
            Cancelled
          </div>
        )}
      </div>

      {po.externalOrderId && (
        <p className="text-xs text-slate-500">Linked stockist order: <span className="font-mono">{po.externalOrderId.slice(0, 8)}…</span></p>
      )}
      {po.linkedPayableBill?.id && (
        <button onClick={() => navigate(`/pharmacy/payable-bills/${po.linkedPayableBill.id}`)} className="text-xs text-teal-600 hover:underline">
          View linked payable bill ({po.linkedPayableBill.billNumber}) →
        </button>
      )}

      <div className="bg-white rounded-xl border border-slate-100 p-5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        <div><span className="text-slate-400">Status</span><div className="mt-1">{statusBadge(po.status)}</div></div>
        <div><span className="text-slate-400">Stockist</span><p className="mt-1 font-medium">{po.stockist?.stockistName ?? '—'}</p></div>
        <div><span className="text-slate-400">Order Date</span><p className="mt-1 font-medium">{formatDate(po.orderDate)}</p></div>
        <div><span className="text-slate-400">Total</span><p className="mt-1 font-semibold">{formatCurrency(po.total)}</p></div>
      </div>

      <div className="bg-white rounded-xl border border-slate-100 overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="px-4 py-3 text-left text-xs text-slate-400 uppercase">Product</th>
              <th className="px-4 py-3 text-right text-xs text-slate-400 uppercase">Qty</th>
              <th className="px-4 py-3 text-right text-xs text-slate-400 uppercase">Received</th>
              <th className="px-4 py-3 text-right text-xs text-slate-400 uppercase">Rate</th>
              <th className="px-4 py-3 text-right text-xs text-slate-400 uppercase">GST</th>
              <th className="px-4 py-3 text-right text-xs text-slate-400 uppercase">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {(po.items ?? []).map((item: any) => (
              <tr key={item.id}>
                <td className="px-4 py-3">{item.productName}</td>
                <td className="px-4 py-3 text-right">{item.qty}{item.freeQty ? ` + ${item.freeQty}` : ''}</td>
                <td className="px-4 py-3 text-right">{item.receivedQty ?? 0}</td>
                <td className="px-4 py-3 text-right">{formatCurrency(item.rate)}</td>
                <td className="px-4 py-3 text-right">{item.gstRate}%</td>
                <td className="px-4 py-3 text-right font-medium">{formatCurrency(item.lineTotal ?? item.qty * item.rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog isOpen={showCancel} onClose={() => setShowCancel(false)} onConfirm={handleCancel} title="Cancel order?" description={`Cancel order ${po.poNumber}? Stockist will be notified.`} confirmLabel="Cancel Order" isLoading={cancelPo.isPending} />
      <ConfirmDialog isOpen={showConfirmReceipt} onClose={() => setShowConfirmReceipt(false)} onConfirm={handleConfirmReceipt} title="Confirm receipt?" description={`Mark ${po.poNumber} as delivered so GRN can be recorded.`} confirmLabel="Confirm Receipt" confirmVariant="primary" isLoading={confirmReceipt.isPending} />
      <ConfirmDialog isOpen={showDelete} onClose={() => setShowDelete(false)} onConfirm={handleDelete} title="Delete draft?" description="This draft will be permanently deleted." confirmLabel="Delete" isLoading={deletePo.isPending} />

      {showGrn && (
        <ReceiveGrnModal isOpen={showGrn} onClose={() => setShowGrn(false)} purchaseOrder={po} onSuccess={() => { setShowGrn(false); navigate('/pharmacy/grn'); }} />
      )}

      {showReturn && (
        <InitiateStockistReturnModal
          isOpen={showReturn}
          onClose={() => setShowReturn(false)}
          stockistConnectionId={po.stockistConnectionId}
          purchaseOrderId={po.id}
          payableBillId={po.linkedPayableBill?.id}
          lines={returnLines}
        />
      )}
    </div>
  );
};

export default PurchaseOrderDetailPage;
