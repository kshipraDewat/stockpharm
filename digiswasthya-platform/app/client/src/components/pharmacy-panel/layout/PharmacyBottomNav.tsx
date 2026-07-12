import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, ScanLine, ShoppingCart, MoreHorizontal, X,
  Store, Package, FileText, CreditCard, Truck, Settings, History, ClipboardList,
  RotateCcw, AlertTriangle, BarChart3, Users, Compass, ShieldCheck, Building2,
} from 'lucide-react';
import { useAuthStore } from '../../../stores/authStore';
import { isNavActive } from '../../../lib/nav';

const CASHIER_PRIMARY_NAV = [
  { icon: LayoutDashboard, label: 'Home', path: '/pharmacy/dashboard', roles: ['cashier'] },
  { icon: ScanLine, label: 'POS', path: '/pharmacy/pos', roles: ['cashier'] },
  { icon: History, label: 'Sales', path: '/pharmacy/sales', roles: ['cashier'] },
  { icon: Users, label: 'Customers', path: '/pharmacy/customers', roles: ['cashier'] },
];

const PHARMACY_PRIMARY_NAV = [
  { icon: LayoutDashboard, label: 'Home', path: '/pharmacy/dashboard', roles: ['admin', 'pharmacist'] },
  { icon: ScanLine, label: 'POS', path: '/pharmacy/pos', roles: ['admin', 'pharmacist'] },
  // me65: rename to "POs" to disambiguate from local "Other Purchases"
  { icon: ShoppingCart, label: 'POs', path: '/pharmacy/purchase-orders', roles: ['admin', 'pharmacist'] },
  { icon: Truck, label: 'GRN', path: '/pharmacy/grn', roles: ['admin', 'pharmacist'] },
];

const ALL_MODULES = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/pharmacy/dashboard', roles: ['admin', 'pharmacist', 'cashier'] },
  { icon: ScanLine, label: 'POS', path: '/pharmacy/pos', roles: ['admin', 'pharmacist', 'cashier'] },
  { icon: History, label: 'Sales', path: '/pharmacy/sales', roles: ['admin', 'pharmacist', 'cashier'] },
  // M53: Customers reachable from More on mobile for every role
  { icon: Users, label: 'Customers', path: '/pharmacy/customers', roles: ['admin', 'pharmacist', 'cashier'] },
  { icon: Store, label: 'Stockists', path: '/pharmacy/stockists', roles: ['admin', 'pharmacist'] },
  { icon: ShoppingCart, label: 'Purchase Orders', path: '/pharmacy/purchase-orders', roles: ['admin', 'pharmacist'] },
  { icon: Truck, label: 'GRN', path: '/pharmacy/grn', roles: ['admin', 'pharmacist'] },
  { icon: Package, label: 'Products', path: '/pharmacy/products', roles: ['admin', 'pharmacist', 'cashier'] },
  { icon: FileText, label: 'Payable Bills', path: '/pharmacy/payable-bills', roles: ['admin', 'pharmacist'] },
  { icon: CreditCard, label: 'Payments', path: '/pharmacy/payments', roles: ['admin', 'pharmacist'] },
  { icon: RotateCcw, label: 'Returns', path: '/pharmacy/returns', roles: ['admin', 'pharmacist'] },
  { icon: AlertTriangle, label: 'Expiry Alerts', path: '/pharmacy/expiry-alerts', roles: ['admin', 'pharmacist'] },
  { icon: Compass, label: 'Discover', path: '/pharmacy/discover', roles: ['admin', 'pharmacist'] },
  { icon: BarChart3, label: 'Reports', path: '/pharmacy/reports', roles: ['admin', 'pharmacist'] },
  { icon: ShieldCheck, label: 'Audit Logs', path: '/pharmacy/audit-logs', roles: ['admin'] },
  { icon: Settings, label: 'Settings', path: '/pharmacy/settings', roles: ['admin'] },
];

const PharmacyBottomNav = () => {
  const location = useLocation();
  const [showMore, setShowMore] = useState(false);
  const user = useAuthStore((s) => s.user);
  const role = user?.role ?? '';

  const canSee = (roles: string[]) => user?.role && roles.includes(user.role);
  const primaryNav = role === 'cashier' ? CASHIER_PRIMARY_NAV : PHARMACY_PRIMARY_NAV;

  return (
    <>
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 z-40 shadow-lg">
        <div className="flex items-stretch h-14">
          {primaryNav.map((item) => {
            if (!canSee(item.roles)) return null;
            const active = isNavActive(location.pathname, item.path, location.search);
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setShowMore(false)}
                className={`flex flex-col items-center justify-center flex-1 gap-1 transition-colors ${
                  active ? 'text-teal-600' : 'text-slate-400 hover:text-slate-700'
                }`}
              >
                <span className={`nav-icon-wrap ${active ? 'bg-teal-50' : ''}`}>
                  <item.icon className="w-5 h-5" />
                </span>
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
          <button
            onClick={() => setShowMore(!showMore)}
            className={`flex flex-col items-center justify-center flex-1 gap-1 transition-colors ${
              showMore ? 'text-teal-600' : 'text-slate-400 hover:text-slate-700'
            }`}
            aria-label="More options"
            aria-expanded={showMore}
          >
            <span className={`nav-icon-wrap ${showMore ? 'bg-teal-50' : ''}`}>
              <MoreHorizontal className="w-5 h-5" />
            </span>
            <span className="text-[10px] font-medium">More</span>
          </button>
        </div>
      </nav>

      {showMore && (
        <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden transition-opacity flex flex-col justify-end">
          <div className="absolute inset-0" onClick={() => setShowMore(false)} />
          <div className="relative bg-white rounded-t-2xl shadow-xl max-h-[80vh] flex flex-col animate-slide-up pb-14">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 shrink-0">
              <span className="text-overline">Navigation Menu</span>
              <button onClick={() => setShowMore(false)} className="icon-btn icon-btn-sm" aria-label="Close menu">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto grid grid-cols-3 gap-3">
              {ALL_MODULES.map((mod) => {
                if (!canSee(mod.roles)) return null;
                const active = isNavActive(location.pathname, mod.path, location.search);
                return (
                  <Link
                    key={mod.path}
                    to={mod.path}
                    onClick={() => setShowMore(false)}
                    className={`flex flex-col items-center p-3 rounded-xl border border-slate-100 text-center transition-all ${
                      active
                        ? 'bg-teal-50/80 border-teal-100 text-teal-700 shadow-sm'
                        : 'bg-slate-50/50 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <span className={`nav-icon-wrap mb-1 ${active ? 'bg-teal-100/80' : 'bg-white'}`}>
                      <mod.icon className={`w-5 h-5 ${active ? 'text-teal-600' : 'text-slate-500'}`} />
                    </span>
                    <span className="text-[11px] font-medium leading-tight line-clamp-1">{mod.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default PharmacyBottomNav;
