import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Edit, AlertCircle, IndianRupee, Ban, CheckCircle, FileText, ShoppingCart, RotateCcw, BookOpen, Link2 } from 'lucide-react';
import { 
  usePharmacy, usePharmacyOrders, usePharmacyBills, 
  usePharmacyLedger, usePharmacyReturns, useUpdatePharmacy, useReconcilePharmacyOutstanding 
} from '../../hooks/usePharmacies';
import { useAuthStore } from '../../stores/authStore';
import PageHeader from '../common/PageHeader';
import Button from '../common/Button';
import StatCard from '../common/StatCard';
import { statusBadge } from '../common/Badge';
import RecordPaymentModal from '../payment/RecordPaymentModal';
import EditPharmacyModal from './EditPharmacyModal';
import ConfirmDialog from '../common/ConfirmDialog';
import { formatCurrency, formatDate } from '../../lib/formatters';
import toast from 'react-hot-toast';

const Row = ({ label, value }: { label: string; value?: string | null }) => (
  <div className="flex items-start justify-between py-2.5 border-b border-slate-50 last:border-0">
    <span className="text-xs text-slate-400 shrink-0 w-32">{label}</span>
    <span className="text-sm text-slate-800 text-right font-medium">{value || '—'}</span>
  </div>
);

const PharmacyDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin');
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [activeTab, setActiveTab] = useState<'orders' | 'bills' | 'ledger' | 'returns' | 'connection'>('orders');

  const { data: pharmacy, isLoading: isPharmLoading } = usePharmacy(id!);
  const { data: ordersData, isLoading: isOrdersLoading } = usePharmacyOrders(id!);
  const { data: billsData, isLoading: isBillsLoading } = usePharmacyBills(id!, true);
  const { data: ledgerData, isLoading: isLedgerLoading } = usePharmacyLedger(id!);
  const { data: returnsData, isLoading: isReturnsLoading } = usePharmacyReturns(id!);
  const updatePharmacyMutation = useUpdatePharmacy();
  const reconcileOutstanding = useReconcilePharmacyOutstanding();

  const orders = (ordersData?.data ?? ordersData ?? []);
  const ordersTotal = ordersData?.total ?? orders.length;
  const bills = (billsData?.data ?? billsData ?? []);
  const ledger = (ledgerData?.entries ?? ledgerData ?? []);
  const ledgerDiscrepancy = Number(ledgerData?.discrepancy ?? 0);
  const returnsList = (returnsData?.data ?? returnsData ?? []);

  const handleToggleStatus = async () => {
    if (!pharmacy) return;
    const nextStatus = pharmacy.status === 'active' ? 'inactive' : 'active';
    if (nextStatus === 'inactive') {
      setConfirmDeactivate(true);
      return;
    }
    try {
      await updatePharmacyMutation.mutateAsync({ id: pharmacy.id, status: nextStatus });
      toast.success(`Pharmacy marked as ${nextStatus}`);
    } catch {
      toast.error('Failed to update status');
    }
  };

  const confirmDeactivatePharmacy = async () => {
    if (!pharmacy) return;
    try {
      await updatePharmacyMutation.mutateAsync({ id: pharmacy.id, status: 'inactive' });
      toast.success('Pharmacy deactivated');
      setConfirmDeactivate(false);
    } catch {
      toast.error('Failed to update status');
    }
  };

  const handleReconcileOutstanding = async () => {
    if (!id) return;
    try {
      await reconcileOutstanding.mutateAsync(id);
      toast.success('Outstanding reconciled from ledger');
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Failed to reconcile outstanding');
    }
  };

  if (isPharmLoading) {
    return (
      <div className="space-y-4 max-w-7xl mx-auto animate-pulse">
        <div className="h-6 bg-slate-200 rounded w-48" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 bg-white rounded-xl border border-slate-100" />)}
        </div>
      </div>
    );
  }

  if (!pharmacy) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <AlertCircle className="w-10 h-10 text-red-400" />
      <p className="text-sm font-medium text-slate-700">Pharmacy not found</p>
      <Button size="sm" onClick={() => navigate('/pharmacies')}>Back to list</Button>
    </div>
  );

  const isActive = pharmacy.status !== 'inactive' && pharmacy.status !== 'blocked';
  const showConnectionTab = pharmacy.portalConnected;

  const tabs = [
    { id: 'orders' as const, label: 'Orders', count: ordersTotal, icon: ShoppingCart },
    { id: 'bills' as const, label: 'Bills', count: bills.length, icon: FileText },
    { id: 'ledger' as const, label: 'Ledger', count: ledger.length, icon: BookOpen },
    { id: 'returns' as const, label: 'Returns', count: returnsList.length, icon: RotateCcw },
    ...(showConnectionTab ? [{ id: 'connection' as const, label: 'Connection', count: 0, icon: Link2 }] : []),
  ];
  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <PageHeader
        breadcrumbs={[{ label: 'Pharmacies', link: '/pharmacies' }, { label: pharmacy.name }]}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {statusBadge(pharmacy.status ?? 'active')}
            
            <Button 
              variant="secondary" 
              leftIcon={<Edit className="w-3.5 h-3.5" />} 
              size="sm" 
              onClick={() => setEditOpen(true)}
            >
              Edit
            </Button>

            <Button 
              variant="secondary" 
              leftIcon={isActive ? <Ban className="w-3.5 h-3.5 text-red-500" /> : <CheckCircle className="w-3.5 h-3.5 text-green-500" />} 
              size="sm" 
              onClick={handleToggleStatus}
              disabled={updatePharmacyMutation.isPending}
            >
              {isActive ? 'Deactivate' : 'Activate'}
            </Button>

            <Button 
              variant="primary" 
              leftIcon={<IndianRupee className="w-3.5 h-3.5" />} 
              size="sm" 
              onClick={() => setPaymentOpen(true)}
            >
              Record Payment
            </Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Outstanding Balance" value={formatCurrency(pharmacy.outstandingBalance ?? pharmacy.outstanding ?? 0)} icon={<IndianRupee />} color="red" />
        <StatCard label="Total Orders"        value={String(ordersTotal)} icon={<ShoppingCart />} color="blue" />
        <StatCard label="Credit Limit"        value={formatCurrency(pharmacy.creditLimit ?? 0)} icon={<IndianRupee />} color="green" />
        <StatCard label="Payment Terms"       value={`${pharmacy.paymentTermsDays ?? pharmacy.creditDays ?? 30} days`} icon={<FileText />} color="slate" />
      </div>

      {/* Body Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Info Sidebar */}
        <div className="space-y-4">
          {/* Business Info */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Business Profile</p>
            <Row label="Contact Person" value={pharmacy.contactPerson} />
            <Row label="Phone Number"   value={pharmacy.phone} />
            <Row label="Email Address"  value={pharmacy.email} />
            <Row label="Address"        value={pharmacy.address} />
          </div>

          {/* Legal / Compliance */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Compliance & Billing</p>
            <Row label="Drug License (DL)" value={pharmacy.dlNumber} />
            <Row label="GSTIN"             value={pharmacy.gstNumber ?? pharmacy.gstin} />
            <Row label="State Code"        value={pharmacy.stateCode} />
            <Row label="Opening Balance"   value={formatCurrency(pharmacy.openingBalance ?? 0)} />
          </div>
        </div>

        {/* Tabbed Main View */}
        <div className="lg:col-span-2 space-y-4">
          {/* Tabs Navigation */}
          <div className="flex items-center gap-2 border-b border-slate-200 pb-px overflow-x-auto">
            {tabs.map(({ id, label, count, icon: Icon }) => {
              const active = activeTab === id;
              return (
                <button
                  key={id}
                  onClick={() => setActiveTab(id as any)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
                    active
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {label}
                  <span className={`text-xs px-1.5 py-0.2 rounded-full ${active ? 'bg-blue-50 text-blue-600 font-semibold' : 'bg-slate-100 text-slate-500'}`}>
                    {count}
                  </span>
                </button>
              );
            })}

            {/* D5: Explicit "All orders" link with filter parameter */}
            {activeTab === 'orders' && (
              <button
                onClick={() => navigate(`/orders?pharmacyId=${pharmacy.id}`)}
                className="ml-auto text-xs text-blue-600 hover:underline font-medium shrink-0 flex items-center gap-0.5 pl-2"
              >
                Filtered list →
              </button>
            )}
          </div>

          {/* Tab Content Panels */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            {/* Orders Tab */}
            {activeTab === 'orders' && (
              <div>
                {isOrdersLoading ? (
                  <div className="p-8 text-center text-sm text-slate-400 animate-pulse">Loading orders…</div>
                ) : orders.length === 0 ? (
                  <p className="px-4 py-12 text-sm text-slate-400 text-center">No orders associated with this pharmacy.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-50 bg-slate-50/50">
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Order #</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Date</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Status</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {orders.map((o: any) => (
                          <tr
                            key={o.id}
                            onClick={() => navigate(`/orders/${o.id}`)}
                            className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                          >
                            <td className="px-4 py-3.5 font-medium text-blue-600">{o.orderNumber}</td>
                            <td className="px-4 py-3.5 text-slate-600">{formatDate(o.orderDate ?? o.createdAt)}</td>
                            <td className="px-4 py-3.5">{statusBadge(o.status)}</td>
                            <td className="px-4 py-3.5 text-right font-semibold text-slate-900">{formatCurrency(o.totalAmount ?? o.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Bills Tab */}
            {activeTab === 'bills' && (
              <div>
                {isBillsLoading ? (
                  <div className="p-8 text-center text-sm text-slate-400 animate-pulse">Loading bills…</div>
                ) : bills.length === 0 ? (
                  <p className="px-4 py-12 text-sm text-slate-400 text-center">No invoice bills generated yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-50 bg-slate-50/50">
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Bill #</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Date</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Due Date</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Status</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {bills.map((b: any) => (
                          <tr
                            key={b.id}
                            onClick={() => navigate(`/bills/${b.id}`)}
                            className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                          >
                            <td className="px-4 py-3.5 font-medium text-blue-600">{b.billNumber}</td>
                            <td className="px-4 py-3.5 text-slate-600">{formatDate(b.billDate)}</td>
                            <td className="px-4 py-3.5 text-slate-500">{formatDate(b.dueDate)}</td>
                            <td className="px-4 py-3.5">{statusBadge(b.status)}</td>
                            <td className="px-4 py-3.5 text-right font-semibold text-slate-900">{formatCurrency(b.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Ledger Tab */}
            {activeTab === 'ledger' && (
              <div>
                {Math.abs(ledgerDiscrepancy) > 0 && (
                  <div className="mx-4 mt-4 mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 flex items-center justify-between gap-3">
                    <span>
                      Ledger mismatch detected: {formatCurrency(ledgerDiscrepancy)} between computed and stored outstanding.
                    </span>
                    {isAdmin && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={handleReconcileOutstanding}
                        isLoading={reconcileOutstanding.isPending}
                      >
                        Reconcile Outstanding
                      </Button>
                    )}
                  </div>
                )}
                {isLedgerLoading ? (
                  <div className="p-8 text-center text-sm text-slate-400 animate-pulse">Loading transaction ledger…</div>
                ) : ledger.length === 0 ? (
                  <p className="px-4 py-12 text-sm text-slate-400 text-center">No ledger entries recorded.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs sm:text-sm">
                      <thead>
                        <tr className="border-b border-slate-50 bg-slate-50/50">
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Date</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Ref / Type</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500">Debit (+)</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500">Credit (-)</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500">Balance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {ledger.map((entry: any, i: number) => (
                          <tr key={entry.id ?? i} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{formatDate(entry.date)}</td>
                            <td className="px-4 py-3">
                              <p className="font-medium text-slate-900 leading-tight">{entry.reference}</p>
                              <p className="text-[11px] text-slate-400 uppercase tracking-wider mt-0.5">{entry.type} {entry.notes && `· ${entry.notes}`}</p>
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-red-600">
                              {entry.debit > 0 ? formatCurrency(entry.debit) : '—'}
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-emerald-600">
                              {entry.credit > 0 ? formatCurrency(entry.credit) : '—'}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-slate-900">
                              {formatCurrency(entry.balance)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Returns Tab */}
            {activeTab === 'returns' && (
              <div>
                {isReturnsLoading ? (
                  <div className="p-8 text-center text-sm text-slate-400 animate-pulse">Loading returns…</div>
                ) : returnsList.length === 0 ? (
                  <p className="px-4 py-12 text-sm text-slate-400 text-center">No returns or credit notes generated.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-50 bg-slate-50/50">
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Return #</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Date</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Reason</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Status</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {returnsList.map((r: any) => (
                          <tr
                            key={r.id}
                            onClick={() => navigate(`/returns/${r.id}`)}
                            className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                          >
                            <td className="px-4 py-3.5 font-medium text-blue-600">{r.returnNumber}</td>
                            <td className="px-4 py-3.5 text-slate-600">{formatDate(r.returnDate)}</td>
                            <td className="px-4 py-3.5 text-slate-500 capitalize">{r.reason?.replace('_', ' ')}</td>
                            <td className="px-4 py-3.5">{statusBadge(r.status)}</td>
                            <td className="px-4 py-3.5 text-right font-semibold text-slate-900">{formatCurrency(r.totalAmount ?? r.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'connection' && showConnectionTab && (
              <div className="p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">Portal Connected</span>
                </div>
                <Row label="Pharmacy Tenant ID" value={pharmacy.pharmacyTenantId} />
                <p className="text-xs text-slate-400 pt-2">This pharmacy places orders via the Pharmacy Portal. Manage connection in Settings → Connections.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <RecordPaymentModal isOpen={paymentOpen} onClose={() => setPaymentOpen(false)} initialPharmacyId={pharmacy.id} />
      <EditPharmacyModal isOpen={editOpen} onClose={() => setEditOpen(false)} pharmacy={pharmacy} />
      <ConfirmDialog
        isOpen={confirmDeactivate}
        title="Deactivate Pharmacy?"
        description={`${pharmacy.name} will be marked inactive and cannot receive new orders.`}
        confirmLabel="Deactivate"
        confirmVariant="danger"
        onConfirm={confirmDeactivatePharmacy}
        onClose={() => setConfirmDeactivate(false)}
        isLoading={updatePharmacyMutation.isPending}
      />
    </div>
  );
};

export default PharmacyDetailPage;
