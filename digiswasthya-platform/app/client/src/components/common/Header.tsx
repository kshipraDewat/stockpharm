import React, { useState, useRef, useEffect } from 'react';
import { Menu, Settings, LogOut, Search, Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useUIStore } from '../../store/uiStore';
import { useAuthStore } from '../../stores/authStore';
import { useTenant } from '../../hooks/useSettings';
import { useStockistDashboard } from '../../hooks/useReports';
import { useIncomingOrderCount } from '../../hooks/useOrders';
import { useStockistConnections } from '../../hooks/useStockistConnections';
import { useEventHistory, useProcessEvents } from '../../hooks/useEvents';
import { useEventSyncStore } from '../../stores/eventSyncStore';
import { getStockistEventPath, parseEventPayload } from '../../lib/eventNavigation';

function parsePayload(payloadJson: unknown): Record<string, any> {
  return parseEventPayload(payloadJson);
}

function formatStockistEventMessage(event: any) {
  const payload = parsePayload(event?.payloadJson ?? event?.payload);
  const type = String(event?.eventType ?? '').toLowerCase();
  switch (type) {
    case 'payment.recorded':
      return `Payment received${payload.amount ? ` · Rs ${Number(payload.amount).toLocaleString('en-IN')}` : ''}`;
    case 'order.cancel_requested':
      return `Pharmacy requested order cancellation${payload.purchaseOrderId ? ` (PO ${payload.purchaseOrderId.slice(0, 8)})` : ''}`;
    case 'order.received':
      return `Pharmacy received goods${payload.poNumber ? ` (${payload.poNumber})` : ''}`;
    case 'order.partially_received':
      return `Pharmacy partially received goods${payload.poNumber ? ` (${payload.poNumber})` : ''}`;
    case 'return.requested':
      return `Return requested${payload.returnNumber ? ` (${payload.returnNumber})` : ''}`;
    case 'connection.withdrawn':
      return `Connection withdrawn by pharmacy`;
    default:
      return event?.eventType ? String(event.eventType).replace(/_/g, ' ') : 'Event update';
  }
}

const Header = () => {
  const navigate = useNavigate();
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'admin';
  const logout = useAuthStore((s) => s.logout);
  const [open, setOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const { data: tenant } = useTenant();
  const { data: kpis } = useStockistDashboard();
  const { data: incomingCount } = useIncomingOrderCount();
  const { data: pendingConnections } = useStockistConnections('pending');
  const { data: eventHistory = [] } = useEventHistory(20);
  const processEvents = useProcessEvents();
  const lastSyncError = useEventSyncStore((s) => s.lastError);
  const history = Array.isArray(eventHistory) ? eventHistory : [];
  const pendingEvents = history.filter((ev: any) => !ev.deliveredAt);
  const showSyncAction = pendingEvents.length > 0 || Boolean(lastSyncError);

  let notifPrefs = { lowStockAlerts: true, overduePayments: true };
  if (tenant?.notificationsJson) {
    try { notifPrefs = { ...notifPrefs, ...JSON.parse(tenant.notificationsJson) }; } catch { /* defaults */ }
  }

  const alerts: { label: string; path: string }[] = [];
  if (Number(incomingCount) > 0) {
    alerts.push({ label: `${incomingCount} pending pharmacy orders`, path: '/orders?source=pharmacy&status=pending' });
  }
  const pendingConnCount = pendingConnections?.total ?? pendingConnections?.data?.length ?? 0;
  if (pendingConnCount > 0) {
    alerts.push({ label: `${pendingConnCount} connection requests`, path: '/settings?tab=connections' });
  }
  if (notifPrefs.lowStockAlerts && (kpis?.lowStockCount ?? 0) > 0) {
    alerts.push({ label: `${kpis!.lowStockCount} items below minimum stock`, path: '/required-stock' });
  }
  if (notifPrefs.overduePayments && (kpis?.overdueCount ?? 0) > 0) {
    alerts.push({ label: `${kpis!.overdueCount} overdue bills`, path: '/bills?status=overdue' });
  }
  const alertCount = alerts.length;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setNotifOpen(false);
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', keyHandler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, []);

  const handleLogout = async () => { await logout(); navigate('/login'); };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    navigate(`/products?search=${encodeURIComponent(q)}`);
    setSearchQuery('');
  };

  return (
    <header className="h-14 bg-white border-b border-slate-100 flex items-center justify-between px-4 shrink-0 sticky top-0 z-40">
      <button
        className="icon-btn lg:hidden"
        onClick={toggleSidebar}
        aria-label="Toggle Menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      <form onSubmit={handleSearch} className="flex-1 max-w-md mx-4 hidden sm:block">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search products… (Enter)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-caption focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white transition-all"
          />
        </div>
      </form>

      <div className="ml-auto flex items-center gap-1 sm:gap-2" ref={ref}>
        <div className="relative">
          <button
            onClick={() => { setNotifOpen(!notifOpen); setOpen(false); }}
            className="icon-btn relative"
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
            {(alertCount > 0 || pendingEvents.length > 0) && (
              <span className="absolute top-1 right-1 min-w-[14px] h-3.5 px-0.5 bg-blue-600 rounded-full text-[9px] font-bold text-white flex items-center justify-center">
                {alertCount + pendingEvents.length}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="notification-popover absolute right-0 mt-2 w-[calc(100vw-1rem)] max-w-sm sm:w-80 bg-white rounded-xl shadow-lg border border-slate-100 py-2 z-50 max-h-[70vh] overflow-y-auto">
              <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
                <span className="text-section-title text-slate-700">Notifications</span>
                {showSyncAction && (
                  <button
                    type="button"
                    onClick={() => processEvents.mutate()}
                    disabled={processEvents.isPending}
                    className="text-[10px] text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50"
                  >
                    {processEvents.isPending ? 'Syncing…' : 'Sync now'}
                  </button>
                )}
              </div>
              {lastSyncError && (
                <div className="px-4 py-2.5 bg-red-50 border-b border-red-100 text-xs text-red-700">
                  <p>{lastSyncError}</p>
                  <button
                    type="button"
                    onClick={() => processEvents.mutate()}
                    disabled={processEvents.isPending}
                    className="mt-1 text-[10px] font-medium text-red-800 underline disabled:opacity-50"
                  >
                    Retry sync
                  </button>
                </div>
              )}
              {alerts.length > 0 && (
                <ul className="divide-y divide-slate-50 border-b border-slate-100">
                  {alerts.map(a => (
                    <li key={a.path}>
                      <button
                        type="button"
                        className="w-full text-left px-4 py-2.5 text-body hover:bg-slate-50"
                        onClick={() => { navigate(a.path); setNotifOpen(false); }}
                      >
                        {a.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {history.length === 0 && alerts.length === 0 ? (
                <div className="p-4 text-center text-caption">No active alerts</div>
              ) : history.length > 0 ? (
                <ul className="divide-y divide-slate-50">
                  {history.slice(0, 10).map((ev: any) => {
                    const path = getStockistEventPath(ev);
                    const content = (
                      <>
                        <p className={`font-medium ${ev.deliveredAt ? 'text-slate-700' : 'text-blue-700'}`}>
                          {formatStockistEventMessage(ev)}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {ev.deliveredAt ? 'Applied' : 'Pending sync'}
                        </p>
                      </>
                    );
                    return (
                      <li key={ev.id}>
                        {path ? (
                          <button
                            type="button"
                            className="w-full text-left px-4 py-2.5 text-xs hover:bg-slate-50"
                            onClick={() => { navigate(path); setNotifOpen(false); }}
                          >
                            {content}
                          </button>
                        ) : (
                          <div className="px-4 py-2.5 text-xs">{content}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          )}
        </div>

        <div className="relative">
          <button
            onClick={() => { setOpen(!open); setNotifOpen(false); }}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
            aria-haspopup="true"
            aria-expanded={open}
          >
            <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center">
              <span className="text-blue-700 text-xs font-semibold">
                {(user?.name ?? 'U').charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-body font-medium text-slate-800 leading-none">{user?.name ?? 'User'}</p>
              <p className="text-caption capitalize leading-none mt-0.5">{user?.role ?? 'user'}</p>
            </div>
          </button>

          {open && (
            <div
              className="absolute right-0 mt-2 w-44 bg-white rounded-xl shadow-lg border border-slate-100 py-1 z-50"
              role="menu"
            >
              {isAdmin && (
                <button
                  onClick={() => { setOpen(false); navigate('/settings'); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-body text-slate-700 hover:bg-slate-50 transition-colors"
                  role="menuitem"
                >
                  <Settings className="w-4 h-4 text-slate-400" /> Settings
                </button>
              )}
              {isAdmin && <div className="h-px bg-slate-100 my-1" />}
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-body text-red-600 hover:bg-red-50 transition-colors"
                role="menuitem"
              >
                <LogOut className="w-4 h-4" /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
