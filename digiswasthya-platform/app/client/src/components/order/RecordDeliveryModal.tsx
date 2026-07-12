import React from 'react';
import { Truck, CheckCircle2 } from 'lucide-react';
import Button from '../common/Button';
import SlideOver from '../common/SlideOver';
import { useOrder, useDeliverOrder } from '../../hooks/useOrders';
import toast from 'react-hot-toast';
import { getQty } from '../../lib/fields';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
}

const RecordDeliveryModal: React.FC<Props> = ({ isOpen, onClose, orderId }) => {
  const { data: order } = useOrder(orderId);
  const deliverOrder = useDeliverOrder();

  const handleConfirm = () => {
    deliverOrder.mutate(orderId, {
      onSuccess: () => { toast.success('Delivery recorded!'); onClose(); },
      onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Failed to record delivery'),
    });
  };

  return (
    <SlideOver
      isOpen={isOpen}
      onClose={onClose}
      title={`Record Delivery — ${order?.orderNumber ?? orderId}`}
      width="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" leftIcon={<CheckCircle2 className="w-4 h-4" />} onClick={handleConfirm} isLoading={deliverOrder.isPending}>
            Confirm Delivery
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded-md p-4 flex items-start text-sm text-blue-700">
          <Truck className="w-5 h-5 mr-2 shrink-0 mt-0.5" />
          <p>Confirm delivery of all items. Stock will be released from FIFO batches.</p>
        </div>
        <div className="bg-slate-50 rounded-lg border border-slate-200 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-white border-b border-slate-200">
              <tr>
                <th className="px-3 py-2 text-slate-500 font-medium">Product</th>
                <th className="px-3 py-2 text-slate-500 font-medium text-center">Qty</th>
                <th className="px-3 py-2 text-slate-500 font-medium">Batch</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {(order?.items ?? []).map((item: any) => (
                <tr key={item.id}>
                  <td className="px-3 py-3 font-medium text-slate-900">{item.productName}</td>
                  <td className="px-3 py-3 text-center">{getQty(item)}</td>
                  <td className="px-3 py-3 text-xs text-slate-400">{item.batchNumber || '-'}</td>
                </tr>
              ))}
              {(order?.items ?? []).length === 0 && (
                <tr><td colSpan={3} className="px-3 py-4 text-center text-slate-400">Loading items…</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </SlideOver>
  );
};

export default RecordDeliveryModal;
