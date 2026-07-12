import React, { useMemo, useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  TrendingUp, IndianRupee, ShoppingCart, Package, AlertTriangle,
  ChevronRight, ScanLine, Truck, FileText,
} from 'lucide-react';
import { useAuthStore } from '../../../stores/authStore';
import { usePharmacyDashboard, useStockAgingReport } from '../../../hooks/useReports';
import { usePharmacyConnections } from '../../../hooks/usePharmacyConnections';
import { useProducts } from '../../../hooks/useProducts';
import StatCard from '../../common/StatCard';
import { statusBadge } from '../../common/Badge';
import { formatCurrency, formatDate } from '../../../lib/formatters';
import { daysUntilExpiry, expiryTierClass } from '../../../lib/expiry';
import PharmacyOnboardingFlow from './PharmacyOnboardingFlow';

const PharmacyDashboardPage = () => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const role = user?.role ?? '';
  const isAdmin = role === 'admin';
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    setShowOnboarding(Boolean(user && !user.onboardingCompleted && isAdmin));
  }, [isAdmin, user?.id, user?.onboardingCompleted]);

  const canViewExpiry = role !== 'cashier';
  const { data: kpis, isLoading } = usePharmacyDashboard();
  const { data: stockAging } = useStockAgingReport(undefined, { enabled: canViewExpiry });
  const { data: connectionsData } = usePharmacyConnections();
  const { data: productsData } = useProducts({ pageSize: 1 });
  const hasConnection = (connectionsData?.data ?? []).some((c: { status?: string }) => c.status === 'active');
  const hasProducts = (productsData?.total ?? productsData?.data?.length ?? 0) > 0;

  const expiringBatches = useMemo(() => {
    const items = stockAging?.items ?? [];
    return items
      .map((b: any) => ({
        productName: b.productName,
        batchNumber: b.batchNumber,
        expiryDate: b.expiryDate,
        qty: b.qtyOnHand,
        days: daysUntilExpiry(b.expiryDate),
      }))
      .filter((b: any) => b.days !== null && b.days <= 90)
      .sort((a: any, b: any) => (a.days ?? 0) - (b.days ?? 0))
      .slice(0, 5);
  }, [stockAging]);

  const recentPos = kpis?.recentPos ?? [];
  const canOrder = ['admin', 'pharmacist'].includes(role);
  const canGrn = ['admin', 'pharmacist'].includes(role);
  const canPay = ['admin', 'pharmacist'].includes(role);

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {!user?.onboardingCompleted && (
        <div className="bg-teal-50 border border-teal-100 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-teal-900">Complete your pharmacy setup</p>
            <p className="text-xs text-teal-700 mt-0.5">
              {isAdmin
                ? 'Connect a stockist and add products to start ordering.'
                : 'Setup progress: ' + [
                    hasConnection ? 'Stockist connected' : 'Stockist not connected',
                    hasProducts ? 'Products added' : 'No products yet',
                  ].join(' · ') + '. Ask your admin to complete remaining steps.'}
            </p>
            {!isAdmin && (
              <Link to="/pharmacy/stockists" className="text-xs text-teal-600 hover:underline mt-1 inline-block">View stockists →</Link>
            )}
          </div>
          {isAdmin && (
            <button onClick={() => setShowOnboarding(true)} className="text-xs font-medium text-teal-700 hover:text-teal-800 bg-white px-3 py-1.5 rounded-lg border border-teal-200">
              Continue Setup
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Today's Retail Sales" value={formatCurrency(kpis?.todaySales ?? 0)} icon={<TrendingUp />} color="green" isLoading={isLoading} onClick={() => navigate('/pharmacy/sales')} />
        <StatCard label="Month Retail Sales" value={formatCurrency(kpis?.monthSales ?? 0)} icon={<IndianRupee />} color="blue" isLoading={isLoading} onClick={() => navigate('/pharmacy/sales')} />
        <StatCard label="Pending POs" value={String(kpis?.pendingPos ?? 0)} icon={<ShoppingCart />} color="amber" isLoading={isLoading} onClick={() => navigate('/pharmacy/purchase-orders?status=submitted')} />
        <StatCard label="Payables Outstanding" value={formatCurrency(kpis?.payablesOutstanding ?? 0)} icon={<IndianRupee />} color="red" isLoading={isLoading} onClick={() => navigate('/pharmacy/payable-bills?status=unpaid')} />
        <StatCard label="Low Stock Items" value={String(kpis?.lowStockCount ?? 0)} icon={<Package />} color="amber" isLoading={isLoading} onClick={() => navigate('/pharmacy/products')} />
        <StatCard label="Awaiting GRN" value={String(kpis?.awaitingGrn ?? 0)} icon={<Truck />} color="amber" isLoading={isLoading} onClick={() => navigate('/pharmacy/purchase-orders?status=delivered')} />
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => navigate('/pharmacy/pos')} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700">
          <ScanLine className="w-4 h-4" /> New Sale
        </button>
        {canOrder && (
          <button onClick={() => navigate('/pharmacy/purchase-orders/create')} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50">
            <ShoppingCart className="w-4 h-4" /> Place Order
          </button>
        )}
        {canGrn && (
          <button onClick={() => navigate('/pharmacy/grn')} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50">
            <Truck className="w-4 h-4" /> Receive GRN
          </button>
        )}
        {canPay && (
          <button onClick={() => navigate('/pharmacy/payable-bills?status=unpaid')} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50">
            <FileText className="w-4 h-4" /> Record Payment
          </button>
        )}
      </div>

      <div className={`grid grid-cols-1 ${canViewExpiry ? 'lg:grid-cols-2' : ''} gap-4`}>
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-50">
            <span className="text-sm font-semibold text-slate-800">Recent Purchase Orders</span>
            <Link to="/pharmacy/purchase-orders" className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700">
              View all <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y divide-slate-50">
            {isLoading ? (
              <div className="px-4 py-8 text-center text-slate-400 text-sm">Loading…</div>
            ) : recentPos.length === 0 ? (
              <div className="px-4 py-8 text-center text-slate-400 text-sm">No purchase orders yet</div>
            ) : recentPos.map((po: any) => (
              <Link key={po.id} to={`/pharmacy/purchase-orders/${po.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50">
                <div>
                  <p className="text-sm font-medium text-slate-800">{po.poNumber}</p>
                  <p className="text-xs text-slate-400">{formatDate(po.orderDate)}</p>
                </div>
                <div className="text-right">
                  {statusBadge(po.status)}
                  <p className="text-sm font-medium text-slate-700 mt-0.5">{formatCurrency(po.total)}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {canViewExpiry && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-50">
            <span className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-500" /> Expiring Soon
            </span>
            <Link to="/pharmacy/expiry-alerts" className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700">
              View all <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y divide-slate-50">
            {expiringBatches.length === 0 ? (
              <div className="px-4 py-8 text-center text-slate-400 text-sm">No batches expiring within 90 days</div>
            ) : expiringBatches.map((b: any, i: number) => (
              <div key={i} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-800">{b.productName}</p>
                  <p className="text-xs text-slate-400">Batch {b.batchNumber} · Qty {b.qty}</p>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${expiryTierClass(b.days <= 0 ? 'expired' : b.days <= 30 ? 'critical' : 'warning')}`}>
                  {b.days <= 0 ? 'Expired' : `${b.days}d left`}
                </span>
              </div>
            ))}
          </div>
        </div>
        )}
      </div>

      <PharmacyOnboardingFlow isOpen={showOnboarding} onClose={() => setShowOnboarding(false)} />
    </div>
  );
};

export default PharmacyDashboardPage;
