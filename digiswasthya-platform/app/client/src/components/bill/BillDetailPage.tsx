import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FileText, AlertCircle, Send, IndianRupee, RotateCcw } from 'lucide-react';
import { useBill, useSendBillWhatsApp, useUpdateBillStatus } from '../../hooks/useBills';
import { useTenant, useFeatures } from '../../hooks/useSettings';
import { useAuthStore } from '../../stores/authStore';
import Button from '../common/Button';
import RecordPaymentModal from '../payment/RecordPaymentModal';
import InitiateReturnModal from '../order/InitiateReturnModal';
import Skeleton from '../common/Skeleton';
import toast from 'react-hot-toast';
import PageHeader from '../common/PageHeader';
import { statusBadge } from '../common/Badge';
import { formatCurrency, formatDate, toNum } from '../../lib/formatters';
import { getBalanceDue, getBillCgst, getBillIgst, getBillSgst, getBillSubtotal, getLineSubtotal, getQty, getTotal } from '../../lib/fields';
import { renderElementToPdfBase64 } from '../../lib/invoicePdf';

const BillDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: bill, isLoading } = useBill(id!);
  const { data: tenant, isLoading: isTenantLoading } = useTenant();
  const { data: features } = useFeatures();
  const sendWA = useSendBillWhatsApp();
  const updateStatus = useUpdateBillStatus();
  const role = useAuthStore((s) => s.user?.role);
  const canOverrideBillStatus = role === 'admin' || role === 'biller';
  const waEnabled = features?.whatsapp ?? false;
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [statusOverride, setStatusOverride] = useState('');
  const [overrideNotes, setOverrideNotes] = useState('');
  const [overrideMethod, setOverrideMethod] = useState<'cash' | 'upi' | 'bank' | 'cheque'>('cash');
  const [overrideReference, setOverrideReference] = useState('');
  const [generatingPdf, setGeneratingPdf] = useState(false);

  if (isLoading) return <div className="p-6 text-gray-500">Loading invoice…</div>;
  if (!bill) return (
    <div className="flex flex-col items-center justify-center h-64">
      <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
      <h2 className="text-xl font-bold text-gray-900">Invoice Not Found</h2>
      <Button variant="primary" onClick={() => navigate('/bills')} className="mt-4">Back to Bills</Button>
    </div>
  );

  const handleSendWA = async () => {
    if (!waEnabled) { toast.error('WhatsApp sharing is not enabled on this server'); return; }
    if (!features?.whatsappConfigured) { toast.error('Configure WHATSAPP_TOKEN and WHATSAPP_PHONE_ID in .env'); return; }

    const el = document.getElementById('invoice-content');
    if (!el) { toast.error('Invoice content not found'); return; }

    setGeneratingPdf(true);
    try {
      const billPdfBase64 = await renderElementToPdfBase64(el);
      sendWA.mutate({ billId: bill.id, billPdfBase64 }, {
        onSuccess: () => toast.success(`Invoice ${bill.billNumber} sent via WhatsApp`),
        onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Failed to send'),
      });
    } catch {
      toast.error('Failed to generate invoice PDF');
    } finally {
      setGeneratingPdf(false);
    }
  };

  const isInterstate = bill.isInterstate ?? (tenant && bill.pharmacyStateCode ? bill.pharmacyStateCode !== tenant.stateCode : false);
  const billTotal = getTotal(bill);
  const outstanding = getBalanceDue(bill);
  const paidAmount = toNum(bill.paidAmount);
  const canMarkUnpaid = paidAmount === 0 && bill.status !== 'unpaid';
  const canMarkPaid = bill.status !== 'paid' && outstanding > 0;
  const showStatusOverride = canOverrideBillStatus && (canMarkUnpaid || canMarkPaid);
  const overrideOptions = [
    ...(canMarkUnpaid ? ['unpaid' as const] : []),
    ...(canMarkPaid ? ['paid' as const] : []),
  ];
  const canReturn = bill.orderId
    && bill.orderStatus === 'delivered'
    && ['partial', 'paid', 'unpaid'].includes(bill.status);
  const billPayments = bill.payments ?? [];

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <PageHeader
        title={bill.billNumber}
        breadcrumbs={[{ label: 'Bills', link: '/bills' }, { label: bill.billNumber }]}
        actions={
          <div className="flex items-center gap-2">
            {statusBadge(bill.status)}
            {canReturn && (
              <Button variant="secondary" leftIcon={<RotateCcw size={16} />} size="sm" onClick={() => setReturnOpen(true)}>
                Initiate Return
              </Button>
            )}
            {bill.status !== 'paid' && (
              <Button variant="primary" leftIcon={<IndianRupee size={16} />} size="sm" onClick={() => setPaymentOpen(true)}>
                Record Payment
              </Button>
            )}
            <Button variant="secondary" leftIcon={<Send size={16} />} size="sm" onClick={handleSendWA} isLoading={generatingPdf || sendWA.isPending}>
              {waEnabled ? 'Send WhatsApp' : 'WhatsApp'}
            </Button>
            <Button variant="secondary" leftIcon={<FileText size={16} />} size="sm" onClick={() => window.print()}>Print</Button>
            {showStatusOverride && (
              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-1">
                  <select
                    value={statusOverride || overrideOptions[0]}
                    onChange={e => setStatusOverride(e.target.value)}
                    className="h-8 text-xs border border-gray-200 rounded-lg px-2"
                  >
                    {overrideOptions.map(s => (
                      <option key={s} value={s}>{s === 'paid' ? 'Mark paid' : 'Mark unpaid'}</option>
                    ))}
                  </select>
                  <Button variant="secondary" size="sm" isLoading={updateStatus.isPending}
                    onClick={() => {
                      const next = statusOverride || overrideOptions[0];
                      if (next === 'paid' && !overrideNotes.trim()) {
                        toast.error('Notes are required when marking a bill as paid');
                        return;
                      }
                      if (next === 'paid' && overrideMethod !== 'cash' && !overrideReference.trim()) {
                        toast.error('Reference number is required for non-cash payments');
                        return;
                      }
                      updateStatus.mutate({
                        id: bill.id,
                        status: next,
                        notes: next === 'paid' ? overrideNotes.trim() : undefined,
                        method: next === 'paid' ? overrideMethod : undefined,
                        referenceNo: next === 'paid' && overrideMethod !== 'cash' ? overrideReference.trim() : undefined,
                      }, {
                        onSuccess: () => {
                          toast.success(next === 'paid' ? 'Bill marked paid' : 'Bill marked unpaid');
                          setStatusOverride('');
                          setOverrideNotes('');
                          setOverrideReference('');
                        },
                        onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Failed'),
                      });
                    }}>
                    Override Status
                  </Button>
                </div>
                {(statusOverride || overrideOptions[0]) === 'paid' && (
                  <div className="flex flex-col gap-1 w-full max-w-xs">
                    <input
                      type="text"
                      placeholder="Notes (required)"
                      value={overrideNotes}
                      onChange={e => setOverrideNotes(e.target.value)}
                      className="h-8 text-xs border border-gray-200 rounded-lg px-2 w-full"
                    />
                    <div className="flex gap-1">
                      <select
                        value={overrideMethod}
                        onChange={e => setOverrideMethod(e.target.value as typeof overrideMethod)}
                        className="h-8 text-xs border border-gray-200 rounded-lg px-2 flex-1"
                      >
                        <option value="cash">Cash</option>
                        <option value="upi">UPI</option>
                        <option value="bank">Bank</option>
                        <option value="cheque">Cheque</option>
                      </select>
                      {overrideMethod !== 'cash' && (
                        <input
                          type="text"
                          placeholder="Reference"
                          value={overrideReference}
                          onChange={e => setOverrideReference(e.target.value)}
                          className="h-8 text-xs border border-gray-200 rounded-lg px-2 flex-1"
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        }
      />

      <div id="invoice-content" className="bg-white p-8 rounded-lg shadow-sm border border-gray-200 print:shadow-none print:border-none print:p-0">
        <div className="flex justify-between border-b border-gray-200 pb-8 mb-8">
          <div>
            <h2 className="text-xl font-bold text-gray-900 flex items-center">
              <FileText className="w-6 h-6 mr-2 text-blue-600" />
              {isTenantLoading ? (
                <Skeleton className="w-32 h-5" />
              ) : (
                tenant?.businessName ?? '—'
              )}
            </h2>
            {isTenantLoading ? (
              <div className="space-y-2 mt-2">
                <Skeleton className="w-48 h-4" />
                <Skeleton className="w-40 h-4" />
              </div>
            ) : (
              <>
                {tenant?.addressJson && <p className="text-sm text-gray-500 mt-2">{tenant.addressJson}</p>}
                {tenant?.gstin && <p className="text-sm text-gray-500 mt-1">GSTIN: {tenant.gstin}</p>}
                {tenant?.dlNumber && <p className="text-sm text-gray-500">DL: {tenant.dlNumber}</p>}
                {tenant?.stateCode && <p className="text-sm text-gray-500">State Code: {tenant.stateCode}</p>}
              </>
            )}
          </div>
          <div className="text-right">
            <h3 className="text-lg font-semibold text-gray-900 uppercase">{isInterstate ? 'IGST' : 'GST'} INVOICE</h3>
            <p className="text-sm text-gray-500 mt-2">Invoice No: {bill.billNumber}</p>
            <p className="text-sm text-gray-500">Date: {formatDate(bill.billDate)}</p>
            <p className="text-sm text-gray-500 mt-1">Due: {formatDate(bill.dueDate)}</p>
          </div>
        </div>

        <div className="mb-8 p-4 bg-gray-50 rounded-lg">
          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Billed To</h4>
          <p className="font-semibold text-gray-900">{bill.pharmacyName}</p>
          <p className="text-sm text-gray-600 mt-1">
            Status: <span className={`font-medium ${bill.status === 'paid' ? 'text-green-600' : bill.status === 'overdue' ? 'text-red-600' : 'text-blue-600'}`}>{bill.status}</span>
          </p>
        </div>

        <div className="mb-8 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-100 text-gray-600">
              <tr>
                <th className="px-4 py-2 text-xs font-semibold uppercase">Product</th>
                <th className="px-4 py-2 text-xs font-semibold uppercase text-center">HSN</th>
                <th className="px-4 py-2 text-xs font-semibold uppercase text-center">Qty</th>
                <th className="px-4 py-2 text-xs font-semibold uppercase text-right">Rate</th>
                <th className="px-4 py-2 text-xs font-semibold uppercase text-right">Taxable</th>
                <th className="px-4 py-2 text-xs font-semibold uppercase text-right">GST%</th>
                <th className="px-4 py-2 text-xs font-semibold uppercase text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {(bill.items ?? []).map((item: any, idx: number) => (
                <tr key={idx}>
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-900">{item.productName}</p>
                    <p className="text-xs text-gray-500">Batch: {item.batchNumber || '-'} | Exp: {item.expiryDate ? formatDate(item.expiryDate) : '-'}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 text-center">{item.hsnCode || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 text-center">{getQty(item)}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatCurrency(item.rate)}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatCurrency(getLineSubtotal(item))}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 text-right">{item.gstRate}%</td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">{formatCurrency(item.lineTotal)}</td>
                </tr>
              ))}
              {(bill.items ?? []).length === 0 && (
                <tr><td colSpan={7} className="px-4 py-3 text-center text-gray-400">No items</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {billPayments.length > 0 && (
          <div className="mb-8">
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Payments Allocated</h4>
            <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase">Payment #</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase">Date</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase">Method</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase">Status</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold uppercase">Allocated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {billPayments.map((p: any) => (
                  <tr key={p.id} className={p.status === 'voided' ? 'opacity-60 bg-red-50/40' : undefined}>
                    <td className="px-4 py-2 font-mono text-blue-600">{p.paymentNumber}</td>
                    <td className="px-4 py-2 text-gray-600">{formatDate(p.paymentDate)}</td>
                    <td className="px-4 py-2 capitalize">{p.method}</td>
                    <td className="px-4 py-2">{statusBadge(p.status ?? 'processed')}</td>
                    <td className={`px-4 py-2 text-right font-medium ${p.status === 'voided' ? 'line-through text-gray-400' : ''}`}>
                      {formatCurrency(p.allocatedAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex justify-end">
          <div className="w-72 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Taxable Value</span>
              <span className="font-medium text-gray-900">{formatCurrency(getBillSubtotal(bill))}</span>
            </div>
            {isInterstate ? (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">IGST</span>
                <span className="font-medium text-gray-900">{formatCurrency(getBillIgst(bill))}</span>
              </div>
            ) : (<>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">CGST</span>
                <span className="font-medium text-gray-900">{formatCurrency(getBillCgst(bill))}</span>
              </div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-600">SGST</span>
                <span className="font-medium text-gray-900">{formatCurrency(getBillSgst(bill))}</span>
              </div>
            </>)}
            <div className="flex justify-between py-3 border-t-2 border-gray-900">
              <span className="font-bold text-gray-900">Invoice Total</span>
              <span className="font-bold text-gray-900">{formatCurrency(billTotal)}</span>
            </div>
            {toNum(bill.paidAmount) > 0 && (
              <div className="flex justify-between text-sm text-green-700">
                <span>Paid</span>
                <span className="font-medium">{formatCurrency(bill.paidAmount)}</span>
              </div>
            )}
            {bill.status !== 'paid' && outstanding > 0 && (
              <div className="flex justify-between text-sm text-red-700 font-semibold">
                <span>Outstanding</span>
                <span>{formatCurrency(outstanding)}</span>
              </div>
            )}
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-gray-200 text-xs text-gray-500 text-center space-y-3">
          <p>This is a computer generated invoice and does not require a physical signature.</p>
          <div className="flex flex-col items-center gap-2 pt-2">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(`${window.location.origin}/verify-bill/${bill.id}`)}`}
              alt="Verify bill QR"
              width={100}
              height={100}
              className="mx-auto"
            />
            <p className="max-w-sm">
              This bill was generated using Digital Swasthya and can be verified on the application.
              Scan this QR code to verify your invoice now.
            </p>
          </div>
        </div>
      </div>
      <RecordPaymentModal isOpen={paymentOpen} onClose={() => setPaymentOpen(false)} initialPharmacyId={bill.pharmacyId} />
      <InitiateReturnModal isOpen={returnOpen} onClose={() => setReturnOpen(false)} orderId={bill.orderId} />
    </div>
  );
};

export default BillDetailPage;
