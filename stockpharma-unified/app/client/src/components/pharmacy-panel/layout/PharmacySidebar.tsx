import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Store, Package, ShoppingCart, FileText,
  CreditCard, Truck, Settings, X, LogOut, ClipboardList, ScanLine, History,
  RotateCcw, Users, BarChart3, Compass, Sparkles,
} from 'lucide-react';
import { useUIStore } from '../../../store/uiStore';
import { isNavActive } from '../../../lib/nav';
import { useAuthStore } from '../../../stores/authStore';
import { pharmacyPath, loginPath } from '../../../lib/panel';
import { useTenant } from '../../../hooks/useSettings';

type NavItem = {
  icon: React.ElementType;
  label: string;
  path: string;
  adminOnly: boolean;
  roles?: string[];
};

type NavGroup = {
  label?: string;
  items: NavItem[];
};

const NAV: NavGroup[] = [
  {
    items: [
      { icon: LayoutDashboard, label: 'Dashboard', path: pharmacyPath('/dashboard'), adminOnly: false },
      { icon: Compass, label: 'Discover Stockists', path: pharmacyPath('/discover'), adminOnly: false, roles: ['admin', 'pharmacist'] },
    ],
  },
  {
    label: 'Sales',
    items: [
      { icon: ScanLine, label: 'POS / New Sale', path: pharmacyPath('/pos'), adminOnly: false },
      { icon: History, label: 'Sales History', path: pharmacyPath('/sales'), adminOnly: false },
      { icon: Users, label: 'Customers', path: pharmacyPath('/customers'), adminOnly: false, roles: ['admin', 'pharmacist', 'cashier'] },
    ],
  },
  {
    label: 'Procurement',
    items: [
      { icon: Store, label: 'Connected Stockists', path: pharmacyPath('/stockists'), adminOnly: false, roles: ['admin', 'pharmacist'] },
      { icon: ShoppingCart, label: 'Purchase Orders', path: pharmacyPath('/purchase-orders'), adminOnly: false, roles: ['admin', 'pharmacist'] },
      { icon: Sparkles, label: 'Smart Order', path: pharmacyPath('/smart-order'), adminOnly: false, roles: ['admin', 'pharmacist'] },
      { icon: Truck, label: 'Inbound GRN', path: pharmacyPath('/grn'), adminOnly: false, roles: ['admin', 'pharmacist'] },
    ],
  },
  {
    label: 'Inventory',
    items: [
      { icon: Package, label: 'Products', path: pharmacyPath('/products'), adminOnly: false },
      { icon: ClipboardList, label: 'Expiry Alerts', path: pharmacyPath('/expiry-alerts'), adminOnly: false, roles: ['admin', 'pharmacist'] },
    ],
  },
  {
    label: 'Finance',
    items: [
      { icon: FileText, label: 'Payable Bills', path: pharmacyPath('/payable-bills'), adminOnly: false, roles: ['admin', 'pharmacist'] },
      { icon: CreditCard, label: 'Payments Made', path: pharmacyPath('/payments'), adminOnly: false, roles: ['admin', 'pharmacist'] },
      { icon: RotateCcw, label: 'Returns', path: pharmacyPath('/returns'), adminOnly: false, roles: ['admin', 'pharmacist'] },
    ],
  },
  {
    label: 'More',
    items: [
      { icon: BarChart3, label: 'Reports', path: pharmacyPath('/reports'), adminOnly: false, roles: ['admin', 'pharmacist'] },
    ],
  },
  {
    label: 'Admin',
    items: [
      { icon: Settings, label: 'Settings', path: pharmacyPath('/settings'), adminOnly: true },
      { icon: ClipboardList, label: 'Audit Logs', path: pharmacyPath('/audit-logs'), adminOnly: true },
    ],
  },
];

const PharmacySidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const isSidebarOpen = useUIStore((s) => s.isSidebarOpen);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { data: tenant } = useTenant();
  const isAdmin = user?.role === 'admin';
  const brandLetter = (tenant?.businessName?.trim().charAt(0) || 'P').toUpperCase();

  const canSee = (item: NavItem) => {
    if (item.adminOnly && !isAdmin) return false;
    if (item.roles && user?.role && !item.roles.includes(user.role)) return false;
    if (user?.role === 'cashier' && item.path.includes('stockists')) return false;
    return true;
  };

  const handleLogout = async () => { await logout(); navigate(loginPath('pharmacy')); };
  const handleNav = () => { if (window.innerWidth < 1024) toggleSidebar(); };

  return (
    <>
      <aside
        className={`
          fixed inset-y-0 left-0 z-60 w-60 bg-white border-r border-slate-100
          flex flex-col h-screen transition-transform duration-300
          lg:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="flex items-center justify-between h-14 px-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="nav-icon-wrap w-7 h-7 rounded-lg bg-teal-600">
              <span className="text-white text-xs font-bold">{brandLetter}</span>
            </div>
            <span className="text-section-title text-slate-800">Pharmacy</span>
          </div>
          <button
            onClick={toggleSidebar}
            className="icon-btn icon-btn-sm lg:hidden"
            aria-label="Close menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-5">
          {NAV.map((group, gi) => {
            const visible = group.items.filter(canSee);
            if (visible.length === 0) return null;
            return (
              <div key={gi} className="space-y-1">
                {group.label && (
                  <p className="text-overline px-3 pb-1">{group.label}</p>
                )}
                {visible.map((item) => {
                  const active = isNavActive(location.pathname, item.path);
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={handleNav}
                      className={`
                        flex items-center gap-2.5 px-3 py-2 rounded-lg text-body font-medium transition-colors w-full
                        ${active
                          ? 'bg-teal-50 text-teal-700 [&_svg]:text-teal-600'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 [&_svg]:text-slate-400'}
                      `}
                    >
                      <span className={`nav-icon-wrap ${active ? 'bg-teal-100/80' : ''}`}>
                        <item.icon className="w-4 h-4 shrink-0" />
                      </span>
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="px-3 py-3 border-t border-slate-100 shrink-0">
          <div className="flex items-center gap-2.5 px-2 py-2">
            <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center shrink-0">
              <span className="text-teal-700 text-xs font-semibold">
                {(user?.name ?? 'U').charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-body font-medium text-slate-800 truncate">{user?.name ?? 'User'}</p>
              <p className="text-caption capitalize">{user?.role ?? 'user'}</p>
            </div>
            <button
              onClick={handleLogout}
              className="icon-btn icon-btn-sm hover:!text-red-500 hover:!bg-red-50"
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 lg:hidden" onClick={toggleSidebar} />
      )}
    </>
  );
};

export default PharmacySidebar;
