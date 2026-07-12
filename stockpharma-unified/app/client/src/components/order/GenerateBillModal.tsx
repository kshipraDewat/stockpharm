import React from 'react';
import { FileText, Check } from 'lucide-react';
import Button from '../common/Button';
import SlideOver from '../common/SlideOver';
import { useGenerateBill, useOrder } from '../../hooks/useOrders';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { formatCurrency } from '../../lib/formatters';
import { getTotal } from '../../lib/fields';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
}

const GenerateBillModal: React.FC<Props> = ({ isOpen, onClose, orderId }) => {
  const navigate = useNavigate();
  const { data: order } = useOrder(orderId);
  const generateBill = useGenerateBill();

  const handleGenerate = () => {
    generateBill.mutate(orderId, {
      onSuccess: (data: any) => {
        toast.success(`Bill ${data.billNumber} generated!`);
        onClose();
        navigate(`/bills/${data.id}`);
      },
      onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Failed to generate bill'),
    });
  };

  return (
    <SlideOver
      isOpen={isOpen}
      onClose={onClose}
      title="Generate Final Bill"
      width="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" leftIcon={<Check className="w-4 h-4" />} onClick={handleGenerate} isLoading={generateBill.isPending}>
            Generate Bill
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <div className="bg-amber-50 border border-amber-200 rounded-md p-4 flex items-start text-sm text-amber-800">
          <FileText className="w-5 h-5 mr-2 shrink-0 mt-0.5" />
          <p>
            This creates a GST invoice snapshot for this order and records it in Bills for payment allocation.
            The order can still move through ship and delivery; cancelling may be restricted once a bill exists.
          </p>
        </div>
        <div className="space-y-3">
          <div className="flex justify-between py-2 border-b border-slate-100">
            <span className="text-slate-500 text-sm">Order</span>
            <span className="font-medium text-slate-900 text-sm">{order?.orderNumber ?? orderId}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-100">
            <span className="text-slate-500 text-sm">Pharmacy</span>
            <span className="font-medium text-slate-900 text-sm">{order?.pharmacyName ?? '—'}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-100">
            <span className="text-slate-500 text-sm">Items</span>
            <span className="font-medium text-slate-900 text-sm">{order?.items?.length ?? '—'}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-100">
            <span className="text-slate-500 text-sm">Bill Amount</span>
            <span className="font-bold text-lg text-slate-900">{formatCurrency(getTotal(order))}</span>
          </div>
        </div>
      </div>
    </SlideOver>
  );
};

export default GenerateBillModal;
