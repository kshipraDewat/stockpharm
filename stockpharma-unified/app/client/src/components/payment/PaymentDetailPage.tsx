import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { User, Calendar, IndianRupee, Printer, Ban, AlertCircle } from 'lucide-react';
import { usePayment, useVoidPayment } from '../../hooks/usePayments';
import { useAuthStore } from '../../stores/authStore';
import PageHeader from '../common/PageHeader';
import Badge from '../common/Badge';
import Button from '../common/Button';
import ConfirmDialog from '../common/ConfirmDialog';
import toast from 'react-hot-toast';
import { formatCurrency, formatDate } from '../../lib/formatters';
import { getPaymentDate, getPaymentNumber } from '../../lib/fields';

const PaymentDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: payment, isLoading } = usePayment(id!);
  const voidPayment = useVoidPayment();
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.role === 'admin';
  // me2: all hooks must run before any early return.
  const [voidConfirmOpen, setVoidConfirmOpen] = useState(false);

  if (isLoading) return <div className="p-6 text-gray-500">Loading payment…</div>;
  if (!payment) return (
    <div className="flex flex-col items-center justify-center h-64">
      <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
      <h2 className="text-xl font-bold text-gray-900">Payment Not Found</h2>
      <Button variant="primary" onClick={() => navigate('/payments')} className="mt-4">Back to Payments</Button>
    </div>
  );

  const paymentLabel = getPaymentNumber(payment);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <PageHeader
        title={`Payment ${paymentLabel}`}
        breadcrumbs={[{ label: 'Payments', link: '/payments' }, { label: paymentLabel }]}
        showBack={true}
        actions={
          <div className="flex space-x-2">
            {payment.status !== 'voided' && isAdmin && (
              <Button variant="danger" leftIcon={<Ban size={16} />} size="sm" onClick={() => setVoidConfirmOpen(true)} isLoading={voidPayment.isPending}>Void Payment</Button>
            )}
            <Button variant="primary" leftIcon={<Printer size={16} />} onClick={() => window.print()}>Print Receipt</Button>
          </div>
        }
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <IndianRupee className="w-4 h-4 text-slate-400" /> Payment Info
          </h3>
          <div className="space-y-4">
            <div className="flex justify-between border-b border-gray-100 pb-3">
              <span className="text-gray-500">Amount</span>
              <span className="font-semibold text-lg text-gray-900">{formatCurrency(payment.amount)}</span>
            </div>
            <div className="flex justify-between border-b border-gray-100 pb-3">
              <span className="text-gray-500">Mode</span>
              <Badge variant="neutral">{payment.method}</Badge>
            </div>
            <div className="flex justify-between border-b border-gray-100 pb-3">
              <span className="text-gray-500">Reference No</span>
              <span className="font-mono text-gray-700">{payment.referenceNo || '—'}</span>
            </div>
            <div className="flex justify-between border-b border-gray-100 pb-3">
              <span className="text-gray-500">Status</span>
              <Badge variant={payment.status === 'voided' ? 'danger' : 'success'}>{payment.status}</Badge>
            </div>
            <div className="flex justify-between pb-3">
              <span className="text-gray-500">Date</span>
              <span className="flex items-center text-gray-700">
                <Calendar className="w-4 h-4 mr-1 text-gray-400" /> {formatDate(getPaymentDate(payment))}
              </span>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <User className="w-4 h-4 text-slate-400" /> Pharmacy Details
          </h3>
          <div className="space-y-4">
            <div className="flex justify-between border-b border-gray-100 pb-3">
              <span className="text-gray-500">Pharmacy</span>
              <span className="font-medium text-blue-600 cursor-pointer" onClick={() => navigate(`/pharmacies/${payment.pharmacyId}`)}>
                {payment.pharmacyName}
              </span>
            </div>
          </div>
          {(payment.allocations ?? []).length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Bill Allocations</h4>
              <div className="space-y-2">
                {payment.allocations.map((a: any) => (
                  <div key={a.billId} className="flex justify-between text-sm">
                    <span className="text-gray-500">{a.billNumber}</span>
                    <span className="font-medium text-gray-900">{formatCurrency(a.allocatedAmount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={voidConfirmOpen}
        onClose={() => setVoidConfirmOpen(false)}
        onConfirm={() => {
          voidPayment.mutate(payment.id, {
            onSuccess: () => { toast.success('Payment voided.'); navigate('/payments'); },
            onError: (err: any) => { toast.error(err?.response?.data?.error ?? 'Failed to void payment'); setVoidConfirmOpen(false); },
          });
        }}
        title="Void Payment"
        description="This will reverse all ledger entries and update the bill statuses. This action cannot be undone."
        confirmLabel="Void Payment"
        confirmVariant="danger"
        isLoading={voidPayment.isPending}
      />
    </div>
  );
};

export default PaymentDetailPage;
