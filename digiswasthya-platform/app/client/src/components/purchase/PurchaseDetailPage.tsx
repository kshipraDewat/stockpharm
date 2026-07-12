import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AlertCircle, FileText, IndianRupee, Users, Printer, CheckCircle, Edit, File } from 'lucide-react';
import { usePurchase, useReceivePurchase, usePurchaseLedger } from '../../hooks/usePurchases';
import { useTenant } from '../../hooks/useSettings';
import Button from '../common/Button';
import ConfirmDialog from '../common/ConfirmDialog';
import PageHeader from '../common/PageHeader';
import { statusBadge } from '../common/Badge';
import { formatCurrency, formatDate } from '../../lib/formatters';
import { getQty, getTotal } from '../../lib/fields';
import EditPurchaseModal from './EditPurchaseModal';
import toast from 'react-hot-toast';
import { purchaseListPath, usePanelBasePath } from '../../hooks/usePanelBasePath';

const PurchaseDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const base = usePanelBasePath();
  const [activeTab, setActiveTab] = React.useState('items');

  const { data: purchase, isLoading } = usePurchase(id!);
  const { data: tenant } = useTenant();
  const { data: ledgerLines, isLoading: ledgerLoading } = usePurchaseLedger(activeTab === 'ledger' ? id! : '');
  const receivePurchase = useReceivePurchase();
  const [receiveConfirmOpen, setReceiveConfirmOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  if (isLoading) return <div className="p-6 text-gray-500">Loading purchase…</div>;
  if (!purchase) return (
    <div className="flex flex-col items-center justify-center h-64">
      <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
      <h2 className="text-xl font-bold text-gray-900">Purchase Not Found</h2>
      <Button variant="primary" onClick={() => navigate(purchaseListPath(base))} className="mt-4">Back to Purchases</Button>
    </div>
  );

  const grnLabel = purchase.grnNumber ?? purchase.id;
  const items = purchase.items ?? [];
  const isInterstate = purchase.supplierStateCode && tenant?.stateCode
    ? purchase.supplierStateCode !== tenant.stateCode : false;
  const subtotal = Number(purchase.subtotal ?? 0);
  const taxAmount = Number(purchase.taxAmount ?? 0);
  const halfTax = taxAmount / 2;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <PageHeader
        title={`Purchase ${grnLabel}`}
        breadcrumbs={[{ label: 'Purchases', link: purchaseListPath(base) }, { label: grnLabel }]}
        actions={
          <div className="flex items-center gap-2">
            {statusBadge(purchase.status ?? 'pending')}
            {purchase.status === 'pending' && (
              <Button variant="secondary" leftIcon={<Edit className="w-4 h-4" />} size="sm" onClick={() => setEditOpen(true)}>
                Edit
              </Button>
            )}
            {purchase.invoiceFileUrl && (
              <Button 
                variant="secondary" 
                leftIcon={<File className="w-4 h-4" />} 
                size="sm" 
                onClick={() => window.open(purchase.invoiceFileUrl, '_blank')}
              >
                View Invoice
              </Button>
            )}
            <Button variant="secondary" leftIcon={<Printer className="w-4 h-4" />} size="sm" onClick={() => window.print()}>Print GRN</Button>
            {purchase.status !== 'received' && (
              <Button variant="primary" leftIcon={<CheckCircle className="w-4 h-4" />} size="sm" onClick={() => setReceiveConfirmOpen(true)} isLoading={receivePurchase.isPending}>
                Receive Stock
              </Button>
            )}
          </div>
        }
      />

      <div id="grn-content" className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex items-center space-x-4">
            <div className="p-3 bg-red-50 rounded-lg text-red-600"><IndianRupee className="w-6 h-6" /></div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Total Amount</p>
              <h3 className="text-xl font-bold text-slate-900">{formatCurrency(getTotal(purchase))}</h3>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex items-center space-x-4">
            <div className="p-3 bg-blue-50 rounded-lg text-blue-600"><Users className="w-6 h-6" /></div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Supplier</p>
              <h3 className="text-lg font-bold text-slate-900">{purchase.supplierName ?? purchase.supplier ?? '—'}</h3>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex items-center space-x-4">
            <div className="p-3 bg-green-50 rounded-lg text-green-600"><FileText className="w-6 h-6" /></div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Invoice Date</p>
              <h3 className="text-lg font-bold text-slate-900">{formatDate(purchase.invoiceDate ?? purchase.date)}</h3>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="border-b border-slate-100 overflow-x-auto">
            <nav className="flex flex-nowrap -mb-px px-4 sm:px-6 min-w-max">
              {['items', 'ledger'].map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm transition-colors ${activeTab === tab ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </nav>
          </div>

          <div className="p-6">
            {activeTab === 'items' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Product</th>
                      <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Batch / Expiry</th>
                      <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase text-right">Qty</th>
                      <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase text-right">Free</th>
                      <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase text-right">MRP</th>
                      <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase text-right">Rate</th>
                      <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase text-right">GST %</th>
                      <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase text-right">Line Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {items.map((item: any) => (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <p className="text-sm font-semibold text-gray-900">{item.productName ?? item.product}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-gray-900 font-mono">{item.batchNumber ?? item.batch ?? '—'}</p>
                          <p className="text-xs text-gray-500">{formatDate(item.expiryDate ?? item.expiry)}</p>
                        </td>
                        <td className="px-6 py-4 text-right text-sm text-gray-900">{getQty(item)}</td>
                        <td className="px-6 py-4 text-right text-sm text-green-600 font-medium">
                          {(item.freeQty ?? 0) > 0 ? `+${item.freeQty}` : '—'}
                        </td>
                        <td className="px-6 py-4 text-right text-sm text-gray-900">{formatCurrency(item.mrp ?? 0)}</td>
                        <td className="px-6 py-4 text-right text-sm font-semibold text-blue-600">{formatCurrency(item.purchaseRate ?? item.rate ?? item.ptg ?? 0)}</td>
                        <td className="px-6 py-4 text-right text-sm text-gray-500">{item.gstRate ?? item.gst ?? 0}%</td>
                        <td className="px-6 py-4 text-right text-sm font-semibold text-gray-900">{formatCurrency(item.lineTotal ?? 0)}</td>
                      </tr>
                    ))}
                    {items.length === 0 && (
                      <tr><td colSpan={8} className="px-6 py-8 text-center text-gray-400">No items found.</td></tr>
                    )}
                  </tbody>
                </table>
                {items.length > 0 && (
                  <div className="mt-6 flex justify-end">
                    <div className="w-72 space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
                      {isInterstate ? (
                        <div className="flex justify-between"><span className="text-gray-500">IGST Input</span><span>{formatCurrency(taxAmount)}</span></div>
                      ) : (
                        <>
                          <div className="flex justify-between"><span className="text-gray-500">CGST Input</span><span>{formatCurrency(halfTax)}</span></div>
                          <div className="flex justify-between"><span className="text-gray-500">SGST Input</span><span>{formatCurrency(halfTax)}</span></div>
                        </>
                      )}
                      <div className="flex justify-between font-bold border-t pt-2"><span>Grand Total</span><span>{formatCurrency(getTotal(purchase))}</span></div>
                    </div>
                  </div>
                )}
              </div>
            )}
            {activeTab === 'ledger' && (
              <div className="overflow-x-auto">
                {ledgerLoading ? (
                  <p className="text-center py-8 text-gray-400">Loading ledger…</p>
                ) : (ledgerLines ?? []).length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <FileText className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                    <p>No ledger entries yet. Receive stock to post entries.</p>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left">Date</th>
                        <th className="px-4 py-2 text-left">Account</th>
                        <th className="px-4 py-2 text-left">Narration</th>
                        <th className="px-4 py-2 text-right">Debit</th>
                        <th className="px-4 py-2 text-right">Credit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {(ledgerLines ?? []).map((line: any) => (
                        <tr key={line.id + line.accountCode}>
                          <td className="px-4 py-2">{formatDate(line.txnDate)}</td>
                          <td className="px-4 py-2 font-mono text-xs">{line.accountCode}</td>
                          <td className="px-4 py-2 text-gray-600">{line.narration}</td>
                          <td className="px-4 py-2 text-right">{formatCurrency(line.debit)}</td>
                          <td className="px-4 py-2 text-right">{formatCurrency(line.credit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      <ConfirmDialog
        isOpen={receiveConfirmOpen}
        onClose={() => setReceiveConfirmOpen(false)}
        onConfirm={() => {
          receivePurchase.mutate(id!, {
            onSuccess: () => { toast.success('Stock received and inventory updated!'); setReceiveConfirmOpen(false); },
            onError: (err: any) => { toast.error(err?.response?.data?.error ?? 'Failed to receive stock'); setReceiveConfirmOpen(false); },
          });
        }}
        title="Receive Stock"
        description="This will update inventory with all items in this purchase. This action cannot be undone."
        confirmLabel="Receive Stock"
        confirmVariant="primary"
        isLoading={receivePurchase.isPending}
      />

      <EditPurchaseModal
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        purchase={purchase}
      />
    </div>
  );
};

export default PurchaseDetailPage;
