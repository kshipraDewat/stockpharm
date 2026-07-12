import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { usePayableBill } from '../../../hooks/usePayableBills';
import { useRecordPayablePayment } from '../../../hooks/usePayablePayments';
import { useAuthStore } from '../../../stores/authStore';
import PageHeader from '../../common/PageHeader';
import Button from '../../common/Button';
import SlideOver from '../../common/SlideOver';
import { statusBadge } from '../../common/Badge';
import { formatCurrency, formatDate } from '../../../lib/formatters';
import InitiateStockistReturnModal from '../returns/InitiateStockistReturnModal';

const PayableBillDetailPage = () => {
  const { id = '' } = useParams();
  const { data: bill, isLoading } = usePayableBill(id);
  const recordPayment = useRecordPayablePayment();
  const canReturnRole = useAuthStore((s) => ['admin', 'pharmacist'].includes(s.user?.role ?? ''));

  const [showPay, setShowPay] = useState(false);
  const [showReturn, setShowReturn] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'cash' | 'upi' | 'bank' | 'cheque'>('upi');
  const [referenceNo, setReferenceNo] = useState('');

  if (isLoading) return <div className="p-8 text-center text-slate-400">Loading…</div>;
  if (!bill) return <div className="p-8 text-center text-slate-500">Bill not found.</div>;

  const outstanding = Number(bill.outstanding ?? (Number(bill.total) - Number(bill.paidAmount ?? 0)));
  const returnLines = (bill.items ?? []).map((item: any) => ({
    id: item.id,
    productName: item.productName,
    localProductId: item.productId,
    qty: Number(item.qty ?? 0),
    rate: Number(item.rate ?? 0),
    gstRate: Number(item.gstRate ?? 0),
    batchNumber: item.batchNumber,
  }));

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    const payAmount = Number(amount);
    if (!payAmount || payAmount <= 0) { toast.error('Enter a valid amount'); return; }
    if (payAmount > outstanding) { toast.error(`Amount cannot exceed outstanding ${formatCurrency(outstanding)}`); return; }
    if (method !== 'cash' && !referenceNo.trim()) {
      toast.error('Reference number is required for non-cash payments');
      return;
    }
    try {
      await recordPayment.mutateAsync({
        stockistConnectionId: bill.stockistConnectionId,
        paymentDate: new Date().toISOString().split('T')[0],
        method,
        referenceNo: referenceNo || undefined,
        amount: payAmount,
        allocations: [{ billId: bill.id, amount: payAmount }],
      });
      toast.success('Payment recorded');
      setShowPay(false);
      setAmount('');
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Payment failed');
    }
  };

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <PageHeader
        breadcrumbs={[
          { label: 'Payable Bills', link: '/pharmacy/payable-bills' },
          { label: bill.billNumber ?? id.slice(0, 8) },
        ]}
        actions={
          <div className="flex gap-2">
            {canReturnRole && returnLines.length > 0 && (
              <Button variant="secondary" onClick={() => setShowReturn(true)}>Initiate Return</Button>
            )}
            {outstanding > 0 && (
              <Button variant="primary" onClick={() => { setAmount(String(outstanding)); setShowPay(true); }} className="!bg-teal-600 hover:!bg-teal-700">
                Record Payment
              </Button>
            )}
          </div>
        }
      />

      <div className="bg-white rounded-xl border border-slate-100 p-5 grid grid-cols-2 gap-4 text-sm">
        <div><span className="text-slate-400">Stockist</span><p className="mt-1 font-medium">{bill.stockistName}</p></div>
        <div><span className="text-slate-400">Status</span><div className="mt-1">{statusBadge(bill.status)}</div></div>
        <div><span className="text-slate-400">Bill Date</span><p className="mt-1">{formatDate(bill.billDate)}</p></div>
        <div><span className="text-slate-400">Due Date</span><p className="mt-1">{formatDate(bill.dueDate)}</p></div>
        <div><span className="text-slate-400">Total</span><p className="mt-1 font-semibold">{formatCurrency(bill.total)}</p></div>
        <div><span className="text-slate-400">Outstanding</span><p className="mt-1 font-semibold text-red-600">{formatCurrency(outstanding)}</p></div>
        {bill.purchaseOrderId && (
          <div className="col-span-2">
            <span className="text-slate-400">Linked PO</span>
            <p className="mt-1">
              <Link to={`/pharmacy/purchase-orders/${bill.purchaseOrderId}`} className="text-teal-600 hover:underline font-medium">
                View Purchase Order
              </Link>
            </p>
          </div>
        )}
      </div>

      {(bill.payments ?? []).length > 0 && (
        <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 text-sm font-semibold text-slate-800">Payment History</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-4 py-2 text-left text-xs text-slate-400 uppercase">Payment #</th>
                <th className="px-4 py-2 text-left text-xs text-slate-400 uppercase">Date</th>
                <th className="px-4 py-2 text-left text-xs text-slate-400 uppercase">Method</th>
                <th className="px-4 py-2 text-left text-xs text-slate-400 uppercase">Status</th>
                <th className="px-4 py-2 text-right text-xs text-slate-400 uppercase">Allocated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {bill.payments.map((p: any) => (
                <tr key={p.id} className={p.status === 'voided' ? 'opacity-60 bg-red-50/40' : undefined}>
                  <td className="px-4 py-3">{p.paymentNumber ?? p.id?.slice(0, 8)}</td>
                  <td className="px-4 py-3">{formatDate(p.paymentDate)}</td>
                  <td className="px-4 py-3 capitalize">{p.method}</td>
                  <td className="px-4 py-3">{statusBadge(p.status ?? 'processed')}</td>
                  <td className={`px-4 py-3 text-right font-medium ${p.status === 'voided' ? 'line-through text-slate-400' : ''}`}>
                    {formatCurrency(p.allocatedAmount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-100 overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="px-4 py-3 text-left text-xs text-slate-400 uppercase">Product</th>
              <th className="px-4 py-3 text-right text-xs text-slate-400 uppercase">Qty</th>
              <th className="px-4 py-3 text-right text-xs text-slate-400 uppercase">Rate</th>
              <th className="px-4 py-3 text-right text-xs text-slate-400 uppercase">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {(bill.items ?? []).map((item: any) => (
              <tr key={item.id}>
                <td className="px-4 py-3">{item.productName}</td>
                <td className="px-4 py-3 text-right">{item.qty}</td>
                <td className="px-4 py-3 text-right">{formatCurrency(item.rate)}</td>
                <td className="px-4 py-3 text-right font-medium">{formatCurrency(item.lineTotal ?? item.qty * item.rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SlideOver isOpen={showPay} onClose={() => setShowPay(false)} title="Record Payment">
        <form onSubmit={handlePay} className="space-y-4">
          <div>
            <label className="text-sm text-slate-600">Amount</label>
            <input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} className="w-full h-10 px-3 text-sm border border-slate-200 rounded-lg mt-1" required />
          </div>
          <div>
            <label className="text-sm text-slate-600">Method</label>
            <select value={method} onChange={e => setMethod(e.target.value as typeof method)} className="w-full h-10 px-3 text-sm border border-slate-200 rounded-lg mt-1">
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
            <Button variant="secondary" type="button" onClick={() => setShowPay(false)}>Cancel</Button>
            <Button variant="primary" type="submit" isLoading={recordPayment.isPending} className="!bg-teal-600 hover:!bg-teal-700">Save Payment</Button>
          </div>
        </form>
      </SlideOver>

      {showReturn && (
        <InitiateStockistReturnModal
          isOpen={showReturn}
          onClose={() => setShowReturn(false)}
          stockistConnectionId={bill.stockistConnectionId}
          payableBillId={bill.id}
          purchaseOrderId={bill.purchaseOrderId}
          lines={returnLines}
        />
      )}
    </div>
  );
};

export default PayableBillDetailPage;
