import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { useRetailSale, useVoidRetailSale } from '../../../hooks/useRetailSales';
import { useAuthStore } from '../../../stores/authStore';
import PageHeader from '../../common/PageHeader';
import Button from '../../common/Button';
import Modal from '../../common/Modal';
import { statusBadge } from '../../common/Badge';
import { formatCurrency, formatDate } from '../../../lib/formatters';
import toast from 'react-hot-toast';

const SaleDetailPage = () => {
  const { id = '' } = useParams();
  const [searchParams] = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const { data: sale, isLoading } = useRetailSale(id);
  const voidSale = useVoidRetailSale();
  const [showVoidConfirm, setShowVoidConfirm] = useState(false);
  const [voidReason, setVoidReason] = useState('');

  // M27: auto-print when the POS redirects with ?print=1
  useEffect(() => {
    if (sale && searchParams.get('print') === '1' && sale.status === 'completed') {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [sale, searchParams]);

  if (isLoading) return <div className="p-8 text-center text-slate-400">Loading…</div>;
  if (!sale) return <div className="p-8 text-center text-slate-500">Sale not found.</div>;

  const today = new Date().toISOString().slice(0, 10);
  const canVoid = user?.role === 'admin'
    && sale.status === 'completed'
    && sale.saleDate === today;

  const handleVoid = async () => {
    if (sale.saleDate !== today) {
      toast.error('Only same-day sales can be voided');
      return;
    }
    if (voidReason.trim().length < 3) {
      toast.error('A reason is required to void this sale');
      return;
    }
    try {
      await voidSale.mutateAsync({ id, reason: voidReason.trim() });
      toast.success('Sale voided');
      setShowVoidConfirm(false);
      setVoidReason('');
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Void failed');
    }
  };

  const items: any[] = sale.items ?? [];
  const hasRx = !!(sale.rxNumber || sale.doctorName || sale.patientName);
  const paymentBreakdown: { method: string; amount: number }[] = sale.paymentBreakdown ?? [];
  const isSplitPayment = paymentBreakdown.length > 1;

  return (
    <div className="space-y-4 max-w-3xl mx-auto print:max-w-none">
      <PageHeader
        breadcrumbs={[
          { label: 'Sales', link: '/pharmacy/sales' },
          { label: sale.saleNumber ?? id.slice(0, 8) },
        ]}
        actions={
          <div className="flex items-center gap-2 print:hidden">
            <Button variant="secondary" leftIcon={<Printer size={16} />} onClick={() => window.print()}>
              Print Receipt
            </Button>
            {canVoid && (
              <Button variant="danger" onClick={() => setShowVoidConfirm(true)} isLoading={voidSale.isPending}>Void Sale</Button>
            )}
          </div>
        }
      />

      {sale.status === 'voided' && (
        <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-lg px-4 py-3 print:hidden">
          This sale has been voided{sale.voidReason ? ` — ${sale.voidReason}` : '.'}. Stock was restored.
        </div>
      )}

      {user?.role === 'admin' && sale.status === 'completed' && sale.saleDate !== today && (
        <div className="bg-amber-50 border border-amber-100 text-amber-800 text-sm rounded-lg px-4 py-3 print:hidden">
          Voiding is only allowed on the same day as the sale ({formatDate(sale.saleDate)}).
        </div>
      )}

      {/* M70: surface batch/expiry/customer/cashier/GST breakdown in detail view. */}
      <div className="bg-white rounded-xl border border-slate-100 p-5 grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
        <div><span className="text-slate-400">Sale #</span><p className="mt-1 font-semibold">{sale.saleNumber}</p></div>
        <div><span className="text-slate-400">Date</span><p className="mt-1 font-medium">{formatDate(sale.saleDate)}</p></div>
        <div><span className="text-slate-400">Status</span><div className="mt-1">{statusBadge(sale.status)}</div></div>
        <div>
          <span className="text-slate-400">Payment</span>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {isSplitPayment ? (
              paymentBreakdown.map((leg, i) => (
                <span key={i} className="inline-flex items-center gap-1">
                  {statusBadge(leg.method)}
                  <span className="text-slate-600 font-medium">{formatCurrency(leg.amount)}</span>
                </span>
              ))
            ) : (
              statusBadge(sale.paymentMethod)
            )}
          </div>
        </div>
        <div><span className="text-slate-400">Cashier</span><p className="mt-1">{sale.cashierName ?? '—'}</p></div>
        <div><span className="text-slate-400">Customer</span><p className="mt-1">{sale.customerName ?? 'Walk-in'}</p></div>
      </div>

      {hasRx && (
        <div className="bg-rose-50 border border-rose-100 rounded-xl p-4 text-sm">
          <p className="font-semibold text-rose-800 mb-2">Prescription</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-rose-900">
            <div><span className="text-rose-500 text-xs">Rx #</span><p>{sale.rxNumber ?? '—'}</p></div>
            <div><span className="text-rose-500 text-xs">Doctor</span><p>{sale.doctorName ?? '—'}</p></div>
            <div><span className="text-rose-500 text-xs">Reg #</span><p>{sale.doctorRegNo ?? '—'}</p></div>
            <div><span className="text-rose-500 text-xs">Patient</span><p>{sale.patientName ?? '—'}{sale.patientAge ? ` · ${sale.patientAge}y` : ''}</p></div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-100 overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="px-4 py-3 text-left text-xs text-slate-400 uppercase">Product</th>
              <th className="px-4 py-3 text-left text-xs text-slate-400 uppercase">Batch · Expiry</th>
              <th className="px-4 py-3 text-right text-xs text-slate-400 uppercase">Qty</th>
              <th className="px-4 py-3 text-right text-xs text-slate-400 uppercase">Rate</th>
              <th className="px-4 py-3 text-right text-xs text-slate-400 uppercase">GST%</th>
              <th className="px-4 py-3 text-right text-xs text-slate-400 uppercase">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {items.map((item: any) => (
              <tr key={item.id}>
                <td className="px-4 py-3">{item.productName ?? item.name}</td>
                <td className="px-4 py-3 text-slate-500 text-xs">
                  {item.batchNumber ?? '—'}{item.expiryDate ? ` · ${item.expiryDate}` : ''}
                </td>
                <td className="px-4 py-3 text-right">{item.qty}</td>
                <td className="px-4 py-3 text-right">{formatCurrency(item.rate)}</td>
                <td className="px-4 py-3 text-right">{item.gstRate ?? 0}%</td>
                <td className="px-4 py-3 text-right font-medium">{formatCurrency(item.lineTotal ?? item.qty * item.rate)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-slate-100 text-sm">
            <tr><td colSpan={5} className="px-4 py-2 text-right text-slate-500">Subtotal</td><td className="px-4 py-2 text-right">{formatCurrency(sale.subtotal)}</td></tr>
            <tr><td colSpan={5} className="px-4 py-2 text-right text-slate-500">GST</td><td className="px-4 py-2 text-right">{formatCurrency(sale.taxAmount)}</td></tr>
            {Number(sale.discountAmount ?? 0) > 0 && (
              <tr><td colSpan={5} className="px-4 py-2 text-right text-slate-500">Discount</td><td className="px-4 py-2 text-right">−{formatCurrency(sale.discountAmount)}</td></tr>
            )}
            <tr className="font-semibold"><td colSpan={5} className="px-4 py-2 text-right">Total</td><td className="px-4 py-2 text-right">{formatCurrency(sale.total)}</td></tr>
            {sale.paymentMethod === 'cash' && Number(sale.amountReceived ?? 0) > 0 && (
              <tr><td colSpan={5} className="px-4 py-2 text-right text-slate-500">Amount Received</td><td className="px-4 py-2 text-right">{formatCurrency(sale.amountReceived)}</td></tr>
            )}
            {sale.paymentMethod === 'cash' && Number(sale.changeAmount ?? 0) > 0 && (
              <tr><td colSpan={5} className="px-4 py-2 text-right text-slate-500">Change</td><td className="px-4 py-2 text-right">{formatCurrency(sale.changeAmount)}</td></tr>
            )}
          </tfoot>
        </table>
      </div>

      <div className="print:hidden">
        <Modal
          isOpen={showVoidConfirm}
          onClose={() => { setShowVoidConfirm(false); setVoidReason(''); }}
          title="Void this sale?"
          subtitle="Stock will be restored and the sale will be marked voided. Please record why."
          size="sm"
          zIndex="z-[100]"
          footer={
            <>
              <Button variant="secondary" onClick={() => { setShowVoidConfirm(false); setVoidReason(''); }}>Cancel</Button>
              <Button variant="danger" onClick={handleVoid} isLoading={voidSale.isPending}>Void Sale</Button>
            </>
          }
        >
          <textarea
            value={voidReason}
            onChange={e => setVoidReason(e.target.value)}
            placeholder="Reason (e.g., entered wrong amount, customer changed mind)"
            rows={3}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
          />
        </Modal>
      </div>
    </div>
  );
};

export default SaleDetailPage;
