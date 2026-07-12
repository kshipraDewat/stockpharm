import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Store, Package, ShoppingCart,
  FileText, CreditCard, MoreHorizontal, RotateCcw,
  Truck, Users, AlertTriangle, BarChart3, Settings, History, X
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { isNavActive } from '../../lib/nav';
import { useIncomingOrderCount } from '../../hooks/useOrders';

const PRIMARY_NAV = [
  { icon: LayoutDashboard, label: 'Home',       path: '/dashboard' },
  { icon: ShoppingCart,    label: 'Orders',     path: '/orders' },
  { icon: Store,           label: 'Pharmacies', path: '/pharmacies' },
  { icon: FileText,        label: 'Bills',      path: '/bills' },
];

const ALL_MODULES = [
  { icon: LayoutDashboard, label: 'Dashboard',      path: '/dashboard',       adminOnly: false },
  { icon: Store,           label: 'Pharmacies',     path: '/pharmacies',      adminOnly: false },
  { icon: Package,         label: 'Products',       path: '/products',        adminOnly: false },
  { icon: ShoppingCart,    label: 'Orders',     path: '/orders',          adminOnly: false },
  { icon: ShoppingCart,    label: 'Incoming',   path: '/orders?source=pharmacy&status=pending', adminOnly: false },
  { icon: FileText,        label: 'Bills',          path: '/bills',           adminOnly: false },
  { icon: CreditCard,      label: 'Payments',       path: '/payments',        adminOnly: false },
  { icon: RotateCcw,       label: 'Returns',        path: '/returns',         adminOnly: false },
  { icon: Truck,           label: 'Purchases',      path: '/purchase-bills',  adminOnly: false },
  { icon: Users,           label: 'Suppliers',      path: '/suppliers',       adminOnly: false },
  { icon: AlertTriangle,   label: 'Required Stock', path: '/required-stock',  adminOnly: false },
  { icon: BarChart3,       label: 'Reports',        path: '/reports',         adminOnly: false },
  { icon: History,         label: 'Audit Logs',     path: '/audit-logs',      adminOnly: true },
  { icon: Settings,        label: 'Settings',       path: '/settings',        adminOnly: true },
];

const BottomNav = () => {
  const location = useLocation();
  const [showMore, setShowMore] = useState(false);
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'admin';
  const { data: incomingCount } = useIncomingOrderCount();
  const incomingPath = '/orders?source=pharmacy&status=pending';
  const navSearch = location.search;

  const primaryNav = Number(incomingCount) > 0
    ? [
        ...PRIMARY_NAV.slice(0, 1),
        { icon: ShoppingCart, label: 'Incoming', path: incomingPath },
        ...PRIMARY_NAV.slice(1),
      ]
    : PRIMARY_NAV;

  return (
    <>
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 z-40 shadow-lg">
        <div className="flex items-stretch h-14">
          {primaryNav.map((item) => {
            const active = isNavActive(location.pathname, item.path, navSearch);
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setShowMore(false)}
                className={`flex flex-col items-center justify-center flex-1 gap-1 transition-colors ${
                  active ? 'text-blue-600' : 'text-slate-400 hover:text-slate-700'
                }`}
              >
                <span className={`nav-icon-wrap ${active ? 'bg-blue-50' : ''}`}>
                  <item.icon className="w-5 h-5" />
                </span>
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
          <button
            onClick={() => setShowMore(!showMore)}
            className={`flex flex-col items-center justify-center flex-1 gap-1 transition-colors ${
              showMore ? 'text-blue-600' : 'text-slate-400 hover:text-slate-700'
            }`}
            aria-label="More options"
            aria-expanded={showMore}
          >
            <span className={`nav-icon-wrap ${showMore ? 'bg-blue-50' : ''}`}>
              <MoreHorizontal className="w-5 h-5" />
            </span>
            <span className="text-[10px] font-medium">More</span>
          </button>
        </div>
      </nav>

      {/* Premium Bottom Sheet Overlay */}
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
                if (mod.adminOnly && !isAdmin) return null;
                const active = isNavActive(location.pathname, mod.path, navSearch);
                return (
                  <Link
                    key={mod.path}
                    to={mod.path}
                    onClick={() => setShowMore(false)}
                    className={`flex flex-col items-center p-3 rounded-xl border border-slate-100 text-center transition-all ${
                      active 
                        ? 'bg-blue-50/80 border-blue-100 text-blue-700 shadow-sm' 
                        : 'bg-slate-50/50 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <span className={`nav-icon-wrap mb-1 ${active ? 'bg-blue-100/80' : 'bg-white'}`}>
                      <mod.icon className={`w-5 h-5 ${active ? 'text-blue-600' : 'text-slate-500'}`} />
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

export default BottomNav;
