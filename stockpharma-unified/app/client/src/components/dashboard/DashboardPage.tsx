import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  TrendingUp, IndianRupee, ShoppingCart, Package,
  AlertTriangle, ChevronRight, Plus, FileText, Truck, Store,
} from 'lucide-react';
import { useStockistDashboard } from '../../hooks/useReports';
import StatCard from '../common/StatCard';
import OnboardingFlow from './OnboardingFlow';
import IncomingOrdersWidget from './IncomingOrdersWidget';
import { orderStatusBadge } from '../common/Badge';
import { formatCurrency, formatDate } from '../../lib/formatters';
import { useAuthStore } from '../../stores/authStore';

const DashboardPage = () => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const today = new Date().toISOString().split('T')[0];
  const monthStart = today.slice(0, 7) + '-01';
  const [dateFrom, setDateFrom] = useState(monthStart);
  const [dateTo, setDateTo] = useState(today);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (user && !user.onboardingCompleted && user.role === 'admin') {
      setShowOnboarding(true);
    }
  }, [user?.onboardingCompleted, user?.id, user?.role]);

  const isAdmin = user?.role === 'admin';

  const { data: kpis, isLoading } = useStockistDashboard(dateFrom, dateTo);

  const dismissOnboarding = () => {
    setShowOnboarding(false);
  };

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-500">KPI period:</span>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          className="h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white" />
        <span className="text-slate-400 text-sm">to</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          className="h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white" />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatCard label="Today's Sales"    value={formatCurrency(kpis?.todaySales ?? 0)}     icon={<TrendingUp />}     color="green"  isLoading={isLoading} />
        <StatCard label="Period Sales"     value={formatCurrency(kpis?.monthSales ?? 0)}      icon={<IndianRupee />}    color="blue"   isLoading={isLoading} />
        {isAdmin && (
          <StatCard label="Total Outstanding" value={formatCurrency(kpis?.outstandingTotal ?? 0)} icon={<IndianRupee />}  color="red"    isLoading={isLoading} />
        )}
        <StatCard label="Awaiting Pack"    value={String(kpis?.packBacklogOrders ?? 0)}       icon={<ShoppingCart />}   color="amber"  isLoading={isLoading} onClick={() => navigate('/orders?status=pending')} />
        <StatCard label="Incoming Portal"  value={String(kpis?.incomingPortalOrders ?? 0)}    icon={<Truck />}           color="purple" isLoading={isLoading} onClick={() => navigate('/orders?source=pharmacy&status=pending')} />
        <StatCard label="Active Connections" value={String(kpis?.activeConnections ?? 0)} icon={<Store />} color="teal" isLoading={isLoading} onClick={() => navigate('/settings?tab=connections')} />
        <StatCard label="Low Stock Items"  value={String(kpis?.lowStockCount ?? 0)}            icon={<Package />}        color="amber"  isLoading={isLoading} onClick={() => navigate('/required-stock')} />
        <StatCard label="Overdue Bills"    value={String(kpis?.overdueCount ?? 0)}             icon={<AlertTriangle />}  color="red"    isLoading={isLoading} onClick={() => navigate('/bills?status=overdue')} />
      </div>

      {/* Widgets row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <IncomingOrdersWidget />
        {/* Recent Orders */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-50">
            <span className="text-sm font-semibold text-slate-800">Recent Orders</span>
            <Link to="/orders" className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700">
              View all <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y divide-slate-50">
            {isLoading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="px-4 py-3 flex items-center justify-between animate-pulse">
                    <div className="space-y-1.5">
                      <div className="h-3 bg-slate-200 rounded w-28" />
                      <div className="h-2.5 bg-slate-100 rounded w-20" />
                    </div>
                    <div className="h-3 bg-slate-200 rounded w-16" />
                  </div>
                ))
              : (kpis?.recentOrders ?? []).length === 0
              ? <p className="px-4 py-6 text-sm text-slate-400 text-center">No orders yet</p>
              : (kpis?.recentOrders ?? []).map((o: any) => (
                  <div
                    key={o.id}
                    className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors"
                    onClick={() => navigate(`/orders/${o.id}`)}
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-800">{o.pharmacyName}</p>
                      <p className="text-xs text-slate-400">{o.orderNumber} · {formatDate(o.orderDate ?? o.createdAt)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">{formatCurrency(o.total ?? o.totalAmount)}</span>
                      {orderStatusBadge(o)}
                    </div>
                  </div>
                ))
            }
          </div>
        </div>

        {/* Low Stock */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-50">
            <span className="text-sm font-semibold text-slate-800">Low Stock</span>
            <Link to="/required-stock" className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700">
              View all <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y divide-slate-50">
            {isLoading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="px-4 py-3 flex items-center justify-between animate-pulse">
                    <div className="h-3 bg-slate-200 rounded w-32" />
                    <div className="h-3 bg-slate-100 rounded w-16" />
                  </div>
                ))
              : (kpis?.lowStockProducts ?? []).length === 0
              ? <p className="px-4 py-6 text-sm text-slate-400 text-center">All stocks healthy</p>
              : (kpis?.lowStockProducts ?? []).map((p: any) => (
                  <div
                    key={p.id}
                    className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors"
                    onClick={() => {
                      const targetId = p.productId || p.id;
                      if (targetId) navigate(`/products/${targetId}`);
                    }}
                  >
                    <p className="text-sm text-slate-700 font-medium">{p.name ?? p.productName}</p>
                    <div className="text-right">
                      <p className="text-sm text-red-600 font-semibold">{p.stock ?? p.currentStock} units</p>
                      <p className="text-xs text-slate-400">Min: {p.minStockLevel}</p>
                    </div>
                  </div>
                ))
            }
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2">
        {[
          ...(isAdmin ? [{ label: 'New Order', icon: ShoppingCart, path: '/orders/create', color: 'text-blue-600 bg-blue-50 hover:bg-blue-100' }] : []),
          { label: 'Review Incoming', icon: Truck,        path: '/orders?source=pharmacy&status=pending', color: 'text-purple-600 bg-purple-50 hover:bg-purple-100' },
          { label: 'Record Payment',  icon: IndianRupee,  path: '/payments?record=1', color: 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100' },
          { label: 'Add Purchase', icon: Truck, path: '/purchase-bills', color: 'text-amber-600 bg-amber-50 hover:bg-amber-100' },
          { label: 'View Reports',    icon: FileText,     path: '/reports',          color: 'text-purple-600 bg-purple-50 hover:bg-purple-100' },
        ].map(({ label, icon: Icon, path, color }) => (
          <button
            key={label}
            onClick={() => navigate(path)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${color}`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      <OnboardingFlow isOpen={showOnboarding} onClose={dismissOnboarding} />
    </div>
  );
};

export default DashboardPage;
