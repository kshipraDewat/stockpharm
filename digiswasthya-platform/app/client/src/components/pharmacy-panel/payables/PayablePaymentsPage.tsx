import React, { useMemo, useState } from 'react';
import { usePayablePayments, useRecordPayablePayment, useVoidPayablePayment } from '../../../hooks/usePayablePayments';
import { usePayableBills } from '../../../hooks/usePayableBills';
import { useAuthStore } from '../../../stores/authStore';
import PageHeader from '../../common/PageHeader';
import Button from '../../common/Button';
import ConfirmDialog from '../../common/ConfirmDialog';
import SlideOver from '../../common/SlideOver';
import { statusBadge } from '../../common/Badge';
import Pagination from '../../common/Pagination';
import { formatCurrency, formatDate } from '../../../lib/formatters';
import toast from 'react-hot-toast';

const PayablePaymentsPage = () => {
  const [page, setPage] = useState(1);
  const [voidId, setVoidId] = useState<string | null>(null);
  const [showRecord, setShowRecord] = useState(false);
  const [selectedBillId, setSelectedBillId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'cash' | 'upi' | 'bank' | 'cheque'>('upi');
  const [referenceNo, setReferenceNo] = useState('');
  const pageSize = 20;
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin');
  const { data, isLoading } = usePayablePayments({ page, pageSize });
  const { data: billsData } = usePayableBills({ pageSize: 100 });
  const recordPayment = useRecordPayablePayment();
  const voidPayment = useVoidPayablePayment();
  const payments = data?.data ?? [];
  const total = data?.total ?? 0;

  const unpaidBills = useMemo(() => {
    return (billsData?.data ?? []).filter((b: any) => {
      const outstanding = Number(b.outstanding ?? (Number(b.total) - Number(b.paidAmount ?? 0)));
      return outstanding > 0;
    });
  }, [billsData]);

  const selectedBill = unpaidBills.find((b: any) => b.id === selectedBillId);

  const resetRecordForm = () => {
    setSelectedBillId('');
    setAmount('');
    setMethod('upi');
    setReferenceNo('');
  };

  const openRecordModal = () => {
    resetRecordForm();
    setShowRecord(true);
  };

  const handleBillChange = (billId: string) => {
    setSelectedBillId(billId);
    const bill = unpaidBills.find((b: any) => b.id === billId);
    if (bill) {
      const outstanding = Number(bill.outstanding ?? (Number(bill.total) - Number(bill.paidAmount ?? 0)));
      setAmount(String(outstanding));
    } else {
      setAmount('');
    }
  };

  const handleRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBill) {
      toast.error('Select a bill');
      return;
    }
    const payAmount = Number(amount);
    const outstanding = Number(selectedBill.outstanding ?? (Number(selectedBill.total) - Number(selectedBill.paidAmount ?? 0)));
    if (!payAmount || payAmount <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    if (payAmount > outstanding) {
      toast.error(`Amount cannot exceed outstanding ${formatCurrency(outstanding)}`);
      return;
    }
    if (method !== 'cash' && !referenceNo.trim()) {
      toast.error('Reference number is required for non-cash payments');
      return;
    }
    try {
      await recordPayment.mutateAsync({
        stockistConnectionId: selectedBill.stockistConnectionId,
        paymentDate: new Date().toISOString().split('T')[0],
        method,
        referenceNo: referenceNo || undefined,
        amount: payAmount,
        allocations: [{ billId: selectedBill.id, amount: payAmount }],
      });
      toast.success('Payment recorded');
      setShowRecord(false);
      resetRecordForm();
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Payment failed');
    }
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <PageHeader
        breadcrumbs={[{ label: 'Payments Made' }]}
        showBack={false}
        actions={
          <Button variant="primary" size="sm" onClick={openRecordModal}>
            Record Payment
          </Button>
        }
      />

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="px-4 py-3 text-left text-xs text-slate-400 uppercase">Payment #</th>
              <th className="px-4 py-3 text-left text-xs text-slate-400 uppercase">Date</th>
              <th className="px-4 py-3 text-left text-xs text-slate-400 uppercase">Method</th>
              <th className="px-4 py-3 text-left text-xs text-slate-400 uppercase">Status</th>
              <th className="px-4 py-3 text-right text-xs text-slate-400 uppercase">Amount</th>
              {isAdmin && <th className="px-4 py-3 text-right text-xs text-slate-400 uppercase">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {isLoading ? (
              <tr><td colSpan={isAdmin ? 6 : 5} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>
            ) : payments.length === 0 ? (
              <tr><td colSpan={isAdmin ? 6 : 5} className="px-4 py-14 text-center text-slate-400">No payments recorded.</td></tr>
            ) : payments.map((p: any) => (
              <tr key={p.id}>
                <td className="px-4 py-3 font-medium">{p.paymentNumber ?? p.id?.slice(0, 8)}</td>
                <td className="px-4 py-3">{formatDate(p.paymentDate)}</td>
                <td className="px-4 py-3 capitalize">{p.method}</td>
                <td className="px-4 py-3">{statusBadge(p.status ?? 'processed')}</td>
                <td className="px-4 py-3 text-right font-semibold">{formatCurrency(p.amount)}</td>
                {isAdmin && (
                  <td className="px-4 py-3 text-right">
                    {p.status !== 'voided' && (
                      <button onClick={() => setVoidId(p.id)} className="text-xs text-red-600 hover:underline">Void</button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination page={page} total={total} pageSize={pageSize} onPageChange={setPage} />
      </div>

      <SlideOver isOpen={showRecord} onClose={() => setShowRecord(false)} title="Record Payment">
        <form onSubmit={handleRecord} className="space-y-4">
          <div>
            <label className="text-sm text-slate-600">Bill</label>
            <select
              value={selectedBillId}
              onChange={e => handleBillChange(e.target.value)}
              className="w-full h-10 px-3 text-sm border border-slate-200 rounded-lg mt-1"
              required
            >
              <option value="">Select bill with outstanding balance</option>
              {unpaidBills.map((b: any) => {
                const outstanding = Number(b.outstanding ?? (Number(b.total) - Number(b.paidAmount ?? 0)));
                return (
                  <option key={b.id} value={b.id}>
                    {b.billNumber} — {b.stockistName ?? 'Stockist'} ({formatCurrency(outstanding)} outstanding)
                  </option>
                );
              })}
            </select>
          </div>
          <div>
            <label className="text-sm text-slate-600">Amount</label>
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="w-full h-10 px-3 text-sm border border-slate-200 rounded-lg mt-1"
              required
            />
          </div>
          <div>
            <label className="text-sm text-slate-600">Method</label>
            <select
              value={method}
              onChange={e => setMethod(e.target.value as typeof method)}
              className="w-full h-10 px-3 text-sm border border-slate-200 rounded-lg mt-1"
            >
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="bank">Bank</option>
              <option value="cheque">Cheque</option>
            </select>
          </div>
          <div>
            <label className="text-sm text-slate-600">
              Reference #{method !== 'cash' && <span className="text-red-500">*</span>}
            </label>
            <input
              value={referenceNo}
              onChange={e => setReferenceNo(e.target.value)}
              className="w-full h-10 px-3 text-sm border border-slate-200 rounded-lg mt-1"
              required={method !== 'cash'}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setShowRecord(false)}>Cancel</Button>
            <Button
              variant="primary"
              type="submit"
              isLoading={recordPayment.isPending}
              className="!bg-teal-600 hover:!bg-teal-700"
            >
              Save Payment
            </Button>
          </div>
        </form>
      </SlideOver>

      <ConfirmDialog
        isOpen={voidId !== null}
        onClose={() => setVoidId(null)}
        onConfirm={() => {
          if (!voidId) return;
          voidPayment.mutate(voidId, {
            onSuccess: () => { toast.success('Payment voided'); setVoidId(null); },
            onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Failed to void'),
          });
        }}
        title="Void Payment"
        description="This will reverse bill allocations and mark the payment as voided."
        confirmLabel="Void Payment"
        confirmVariant="danger"
        isLoading={voidPayment.isPending}
      />
    </div>
  );
};

export default PayablePaymentsPage;
