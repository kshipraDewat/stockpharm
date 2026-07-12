import React from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import Button from '../common/Button';
import Modal from '../common/Modal';
import { useApprovePharmacyOrder } from '../../hooks/useOrders';
import { formatCurrency } from '../../lib/formatters';
import toast from 'react-hot-toast';

interface OrderItem {
  productName?: string;
  qty?: number;
  stockOnHand?: number;
}

interface CreditInfo {
  creditLimit?: number;
  creditUsed?: number;
  creditAvailable?: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  orderNumber?: string;
  pharmacyName?: string;
  total?: number;
  creditInfo?: CreditInfo | null;
  items?: OrderItem[];
  isLoadingDetail?: boolean;
  detailError?: boolean;
}

const ApprovePharmacyOrderModal: React.FC<Props> = ({
  isOpen, onClose, orderId, orderNumber, pharmacyName, total, creditInfo, items = [],
  isLoadingDetail = false, detailError = false,
}) => {
  const approve = useApprovePharmacyOrder();
  const orderTotal = Number(total ?? 0);
  const creditLimit = Number(creditInfo?.creditLimit ?? 0);
  const creditUsed = Number(creditInfo?.creditUsed ?? 0);
  const creditAvailable = Number(creditInfo?.creditAvailable ?? Math.max(0, creditLimit - creditUsed));
  const afterOrder = creditAvailable - orderTotal;
  const creditPct = creditLimit > 0 ? Math.min(100, (creditUsed / creditLimit) * 100) : 0;
  const afterPct = creditLimit > 0 ? Math.min(100, ((creditUsed + orderTotal) / creditLimit) * 100) : 0;
  const stockIssues = items.filter(i => Number(i.stockOnHand ?? 0) < Number(i.qty ?? 0));
  const blockApprove = isLoadingDetail || detailError || afterOrder < 0 || stockIssues.length > 0;

  const handleApprove = (finalizeNow: boolean) => {
    approve.mutate(
      { id: orderId, finalizeNow },
      {
        onSuccess: () => {
          toast.success(finalizeNow ? 'Order approved and packed' : 'Order approved');
          onClose();
        },
        onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Failed to approve'),
      },
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Approve Portal Order"
      size="lg"
      footer={
        <div className="flex flex-col gap-2 w-full sm:flex-row sm:justify-end">
          <Button variant="primary" leftIcon={<CheckCircle2 className="w-4 h-4" />} onClick={() => handleApprove(false)} isLoading={approve.isPending} disabled={blockApprove}>
            Approve
          </Button>
          <Button variant="secondary" onClick={() => handleApprove(true)} isLoading={approve.isPending} disabled={blockApprove}>
            Approve & Pack
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {isLoadingDetail && (
          <p className="text-sm text-slate-500">Loading order details…</p>
        )}
        {detailError && (
          <p className="text-sm text-red-600 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> Failed to load order details. Close and try again.
          </p>
        )}
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm space-y-1">
          <p><span className="font-medium">Order:</span> {orderNumber}</p>
          <p><span className="font-medium">Pharmacy:</span> {pharmacyName}</p>
          {total != null && <p><span className="font-medium">Total:</span> {formatCurrency(orderTotal)}</p>}
        </div>

        {creditLimit > 0 && (
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-slate-600">
              <span>Credit used: {formatCurrency(creditUsed)} / {formatCurrency(creditLimit)}</span>
              <span className={afterOrder < 0 ? 'text-red-600 font-medium' : 'text-slate-600'}>
                After order: {formatCurrency(Math.max(0, afterOrder))}
              </span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${creditPct}%` }} />
            </div>
            <div className="h-1.5 bg-slate-50 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${afterOrder < 0 ? 'bg-red-500' : 'bg-amber-400'}`}
                style={{ width: `${afterPct}%` }}
              />
            </div>
            {afterOrder < 0 && (
              <p className="text-xs text-red-600 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> Order exceeds available credit
              </p>
            )}
          </div>
        )}

        {items.length > 0 && (
          <div className="border border-slate-200 rounded-lg overflow-x-auto">
            <table className="w-full text-xs min-w-[420px]">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left">Product</th>
                  <th className="px-3 py-2 text-right">Ordered</th>
                  <th className="px-3 py-2 text-right">In Stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item, idx) => {
                  const short = Number(item.stockOnHand ?? 0) < Number(item.qty ?? 0);
                  return (
                    <tr key={idx} className={short ? 'bg-red-50' : ''}>
                      <td className="px-3 py-2">{item.productName}</td>
                      <td className="px-3 py-2 text-right">{item.qty}</td>
                      <td className={`px-3 py-2 text-right font-medium ${short ? 'text-red-600' : 'text-green-700'}`}>
                        {item.stockOnHand ?? 0}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {stockIssues.length > 0 && (
          <p className="text-xs text-amber-700 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            {stockIssues.length} line(s) have insufficient stock
          </p>
        )}
      </div>
    </Modal>
  );
};

export default ApprovePharmacyOrderModal;
