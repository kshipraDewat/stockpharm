import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Edit, Mail, Phone, FileText, IndianRupee, MapPin, AlertCircle } from 'lucide-react';
import { useSupplier, useSupplierPurchases, useSupplierLedger } from '../../hooks/useSuppliers';
import Button from '../common/Button';
import Card from '../common/Card';
import Badge from '../common/Badge';
import PageHeader from '../common/PageHeader';
import EditSupplierModal from './EditSupplierModal';
import RecordSupplierPaymentModal from './RecordSupplierPaymentModal';
import { formatCurrency, formatDate } from '../../lib/formatters';
import { useAuthStore } from '../../stores/authStore';
import { panelPath, purchaseDetailPath, usePanelBasePath } from '../../hooks/usePanelBasePath';

const SupplierDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const base = usePanelBasePath();
  const [activeTab, setActiveTab] = React.useState('info');
  const [editOpen, setEditOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin');

  const { data: supplier, isLoading } = useSupplier(id!);
  const { data: purchasesData } = useSupplierPurchases(id!);
  const { data: ledgerData, isLoading: isLedgerLoading } = useSupplierLedger(id!);
  const purchases = purchasesData?.data ?? purchasesData ?? [];
  const ledger = ledgerData ?? [];

  if (isLoading) return <div className="p-6 text-slate-500">Loading supplier…</div>;
  if (!supplier) return (
    <div className="flex flex-col items-center justify-center h-64">
      <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
      <h2 className="text-xl font-bold text-slate-900">Supplier Not Found</h2>
      <Button variant="primary" onClick={() => navigate(panelPath(base, '/suppliers'))} className="mt-4">Back to Suppliers</Button>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={supplier.name}
        breadcrumbs={[{ label: 'Suppliers', link: panelPath(base, '/suppliers') }, { label: supplier.name }]}
        actions={
          <div className="flex space-x-3 items-center">
            <Badge variant={supplier.status === 'active' ? 'success' : 'neutral'}>{supplier.status === 'active' ? 'Active' : 'Inactive'}</Badge>
            <Button variant="secondary" leftIcon={<Edit className="w-4 h-4" />} onClick={() => setEditOpen(true)}>Edit Supplier</Button>
            {isAdmin && (
              <Button variant="primary" leftIcon={<IndianRupee className="w-4 h-4" />} size="sm" onClick={() => setPaymentOpen(true)}>
                Record Payment
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="p-4 flex items-center space-x-4">
          <div className="p-3 bg-red-50 rounded-lg text-red-600"><IndianRupee className="w-6 h-6" /></div>
          <div>
            <p className="text-sm text-slate-500 font-medium">To Pay (Outstanding)</p>
            <h3 className="text-xl font-bold text-slate-900">{formatCurrency(supplier.outstandingBalance)}</h3>
          </div>
        </Card>
        <Card className="p-4 flex items-center space-x-4">
          <div className="p-3 bg-blue-50 rounded-lg text-blue-600"><FileText className="w-6 h-6" /></div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Total YTD Purchases</p>
            <h3 className="text-xl font-bold text-slate-900">{formatCurrency(supplier.totalPurchasesValue)}</h3>
          </div>
        </Card>
      </div>

      <Card>
        <div className="border-b border-slate-200 overflow-x-auto">
          <nav className="flex flex-nowrap -mb-px px-4 sm:px-6 min-w-max">
            {['info', 'purchases', 'ledger'].map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm transition-colors ${activeTab === tab ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </nav>
        </div>
        <div className="p-6">
          {activeTab === 'info' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div>
                  <h4 className="text-md font-semibold text-slate-900 mb-4 flex items-center"><Mail className="w-5 h-5 mr-2 text-slate-400" /> Contact Details</h4>
                  <div className="bg-slate-50 rounded-lg p-4 space-y-3">
                    {[['Contact Person', supplier.contactPerson], ['Phone', supplier.phone], ['Email', supplier.email]].map(([k, v]) => (
                      <div key={k} className="flex justify-between">
                        <span className="text-sm text-slate-500">{k}</span>
                        <span className="text-sm font-medium text-slate-900 flex items-center">{k === 'Phone' && <Phone className="w-3 h-3 mr-1 text-slate-400" />}{v || '—'}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="text-md font-semibold text-slate-900 mb-4 flex items-center"><FileText className="w-5 h-5 mr-2 text-slate-400" /> Compliance & Tax</h4>
                  <div className="bg-slate-50 rounded-lg p-4 space-y-3">
                    {[['Drug License', supplier.dlNumber], ['GST Number', supplier.gstin], ['State Code', supplier.stateCode]].map(([k, v]) => (
                      <div key={k} className="flex justify-between">
                        <span className="text-sm text-slate-500">{k}</span>
                        <span className="text-sm font-medium text-slate-900">{v || '—'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <h4 className="text-md font-semibold text-slate-900 mb-4 flex items-center"><MapPin className="w-5 h-5 mr-2 text-slate-400" /> Address</h4>
                <div className="bg-slate-50 rounded-lg p-4">
                  <p className="text-sm text-slate-800 leading-relaxed">{supplier.address || '—'}</p>
                </div>
              </div>
            </div>
          )}
          {activeTab === 'purchases' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-slate-500 uppercase">Invoice #</th>
                    <th className="px-4 py-3 font-semibold text-slate-500 uppercase">Date</th>
                    <th className="px-4 py-3 font-semibold text-slate-500 uppercase text-right">Amount</th>
                    <th className="px-4 py-3 font-semibold text-slate-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {purchases.map((p: any) => (
                    <tr key={p.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => navigate(purchaseDetailPath(base, p.id))}>
                      <td className="px-4 py-3 font-medium text-blue-600">{p.invoiceNumber ?? p.grnNumber ?? p.id}</td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(p.invoiceDate)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatCurrency(p.totalAmount)}</td>
                      <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">{p.status}</span></td>
                    </tr>
                  ))}
                  {purchases.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">No purchases found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          {activeTab === 'ledger' && (
            isLedgerLoading ? (
              <div className="p-8 text-center text-sm text-slate-400 animate-pulse">Loading ledger…</div>
            ) : ledger.length === 0 ? (
              <div className="text-center py-12 text-slate-500"><FileText className="w-12 h-12 mx-auto text-slate-300 mb-3" /><p>No ledger entries yet.</p></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Reference</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500">Debit</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500">Credit</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {ledger.map((entry: any, i: number) => (
                      <tr key={entry.id ?? i} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{formatDate(entry.date)}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-900">{entry.reference}</p>
                          <p className="text-xs text-slate-400 uppercase">{entry.type}{entry.notes ? ` · ${entry.notes}` : ''}</p>
                        </td>
                        <td className="px-4 py-3 text-right text-red-600">{entry.debit > 0 ? formatCurrency(entry.debit) : '—'}</td>
                        <td className="px-4 py-3 text-right text-emerald-600">{entry.credit > 0 ? formatCurrency(entry.credit) : '—'}</td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatCurrency(entry.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
      </Card>
      <EditSupplierModal isOpen={editOpen} onClose={() => setEditOpen(false)} supplier={supplier} />
      <RecordSupplierPaymentModal isOpen={paymentOpen} onClose={() => setPaymentOpen(false)} supplierId={id!} supplierName={supplier.name} />
    </div>
  );
};

export default SupplierDetailPage;
