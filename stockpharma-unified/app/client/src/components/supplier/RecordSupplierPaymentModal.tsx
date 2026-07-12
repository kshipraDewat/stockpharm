import React, { useState, useEffect } from 'react';
import Button from '../common/Button';
import Input from '../common/Input';
import SlideOver from '../common/SlideOver';
import { useRecordSupplierPayment } from '../../hooks/useSuppliers';
import toast from 'react-hot-toast';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  supplierId: string;
  supplierName?: string;
}

const RecordSupplierPaymentModal: React.FC<Props> = ({ isOpen, onClose, supplierId, supplierName }) => {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'cash' | 'upi' | 'bank' | 'cheque'>('bank');
  const [referenceNo, setReferenceNo] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  const recordPayment = useRecordSupplierPayment();

  useEffect(() => {
    if (!isOpen) {
      setAmount('');
      setReferenceNo('');
      setNotes('');
      setDate(new Date().toISOString().split('T')[0]);
    }
  }, [isOpen]);

  const handleSave = () => {
    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) { toast.error('Enter a valid amount'); return; }
    recordPayment.mutate({
      supplierId,
      amount: numAmount,
      method,
      referenceNo: referenceNo || undefined,
      paymentDate: date,
      notes: notes || undefined,
    }, {
      onSuccess: () => {
        toast.success('Supplier payment recorded!');
        onClose();
      },
      onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Failed to record payment'),
    });
  };

  return (
    <SlideOver
      isOpen={isOpen}
      onClose={onClose}
      title="Record Supplier Payment"
      width="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSave} isLoading={recordPayment.isPending}>Record Payment</Button>
        </>
      }
    >
      <div className="space-y-4">
          <p className="text-sm text-gray-600">Paying: <strong>{supplierName ?? 'Supplier'}</strong></p>
          <Input label="Amount Paid (₹)" type="number" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} required />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Payment Mode</label>
            <select className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-md outline-none focus:ring-2 focus:ring-blue-500"
              value={method} onChange={e => setMethod(e.target.value as any)}>
              <option value="bank">Bank Transfer / NEFT</option>
              <option value="upi">UPI</option>
              <option value="cash">Cash</option>
              <option value="cheque">Cheque</option>
            </select>
          </div>
          <Input label="Payment Date" type="date" value={date} onChange={e => setDate(e.target.value)} required />
          <Input label="Reference No." placeholder="UTR / Cheque no." value={referenceNo} onChange={e => setReferenceNo(e.target.value)} />
          <Input label="Notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} />
      </div>
    </SlideOver>
  );
};

export default RecordSupplierPaymentModal;
