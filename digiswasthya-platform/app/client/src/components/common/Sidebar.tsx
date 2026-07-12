import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Store, Package, ShoppingCart, FileText,
  CreditCard, RotateCcw, Truck, Users, AlertTriangle,
  BarChart3, History, Settings, X, LogOut, Inbox,
} from 'lucide-react';
import { useIncomingOrderCount } from '../../hooks/useOrders';
import { useUIStore } from '../../store/uiStore';
import { isNavActive } from '../../lib/nav';
import { useAuthStore } from '../../stores/authStore';
import { useTenant } from '../../hooks/useSettings';

type NavItem = {
  icon: React.ElementType;
  label: string;
  path: string;
  adminOnly: boolean;
  badgeKey?: 'incoming';
};

type NavGroup = {
  label?: string;
  items: NavItem[];
};

const NAV: NavGroup[] = [
  {
    items: [
      { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard', adminOnly: false },
    ],
  },
  {
    label: 'Operations',
    items: [
      { icon: Store, label: 'Pharmacies', path: '/pharmacies', adminOnly: false },
      { icon: Inbox, label: 'Incoming Orders', path: '/orders?source=pharmacy&status=pending', adminOnly: false, badgeKey: 'incoming' as const },
      { icon: ShoppingCart, label: 'Orders', path: '/orders', adminOnly: false },
      { icon: FileText, label: 'Bills', path: '/bills', adminOnly: false },
      { icon: CreditCard, label: 'Payments', path: '/payments', adminOnly: false },
      { icon: RotateCcw, label: 'Returns', path: '/returns', adminOnly: false },
    ],
  },
  {
    label: 'Inventory',
    items: [
      { icon: Package, label: 'Products', path: '/products', adminOnly: false },
      { icon: Truck, label: 'Purchases', path: '/purchase-bills', adminOnly: false },
      { icon: Users, label: 'Suppliers', path: '/suppliers', adminOnly: false },
      { icon: AlertTriangle, label: 'Required Stock', path: '/required-stock', adminOnly: false },
      { icon: BarChart3, label: 'Reports', path: '/reports', adminOnly: false },
    ],
  },
  {
    label: 'Admin',
    items: [
      { icon: History, label: 'Audit Logs', path: '/audit-logs', adminOnly: true },
      { icon: Settings, label: 'Settings', path: '/settings', adminOnly: true },
    ],
  },
];

const Sidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const isSidebarOpen = useUIStore((s) => s.isSidebarOpen);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { data: tenant } = useTenant();
  const isAdmin = user?.role === 'admin';
  const { data: incomingCount } = useIncomingOrderCount();
  const brandLetter = (tenant?.businessName?.trim().charAt(0) || 'S').toUpperCase();

  const isActive = (path: string) => isNavActive(location.pathname, path, location.search);

  const handleLogout = async () => { await logout(); navigate('/login'); };
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
            <div className="nav-icon-wrap w-7 h-7 rounded-lg bg-blue-600">
              <span className="text-white text-xs font-bold">{brandLetter}</span>
            </div>
            <span className="text-section-title text-slate-800">Stockist</span>
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
            const visible = group.items.filter((item) => !item.adminOnly || isAdmin);
            if (visible.length === 0) return null;
            return (
              <div key={gi} className="space-y-1">
                {group.label && (
                  <p className="text-overline px-3 pb-1">{group.label}</p>
                )}
                {visible.map((item) => {
                  const active = isActive(item.path);
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={handleNav}
                      className={`
                        flex items-center gap-2.5 px-3 py-2 rounded-lg text-body font-medium transition-colors w-full
                        ${active
                          ? 'bg-blue-50 text-blue-700 [&_svg]:text-blue-600'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 [&_svg]:text-slate-400'}
                      `}
                    >
                      <span className={`nav-icon-wrap ${active ? 'bg-blue-100/80' : ''}`}>
                        <item.icon className="w-4 h-4 shrink-0" />
                      </span>
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.badgeKey === 'incoming' && Number(incomingCount) > 0 && (
                        <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{incomingCount}</span>
                      )}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="px-3 py-3 border-t border-slate-100 shrink-0">
          <div className="flex items-center gap-2.5 px-2 py-2">
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
              <span className="text-blue-700 text-xs font-semibold">
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
        <div
          className="fixed inset-0 bg-black/40 z-50 lg:hidden"
          onClick={toggleSidebar}
        />
      )}
    </>
  );
};

export default Sidebar;
