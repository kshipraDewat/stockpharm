import React, { useState, useRef, useEffect } from 'react';
import { Menu, Settings, LogOut, Search, Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useUIStore } from '../../../store/uiStore';
import { useAuthStore } from '../../../stores/authStore';
import { useEventHistory, useProcessEvents } from '../../../hooks/useEvents';
import { useEventSyncStore } from '../../../stores/eventSyncStore';
import { loginPath } from '../../../lib/panel';
import { getPharmacyEventPath, parseEventPayload } from '../../../lib/eventNavigation';

function parsePayload(payloadJson: unknown): Record<string, any> {
  return parseEventPayload(payloadJson);
}

function formatEventMessage(event: any) {
  const payload = parsePayload(event?.payloadJson ?? event?.payload);
  const type = String(event?.eventType ?? '').toLowerCase();
  switch (type) {
    case 'catalog.changed':
      return `Catalog updated by ${payload.stockistName ?? 'stockist'}`;
    case 'connection.approved':
      return `Connection approved by ${payload.stockistName ?? 'stockist'}`;
    case 'connection.rejected':
      return `Connection rejected${payload.reason ? `: ${payload.reason}` : ''}`;
    case 'connection.disconnected':
      return `Connection disconnected by ${payload.stockistName ?? 'stockist'}`;
    // M9: server emits `order.*` for PO lifecycle, not `purchase_order.*`.
    case 'order.accepted':
      return `PO accepted${payload.poNumber ? ` (${payload.poNumber})` : ''}`;
    case 'order.rejected':
      return `PO rejected${payload.reason ? `: ${payload.reason}` : ''}`;
    case 'order.packed':
      return `PO packed${payload.poNumber ? ` (${payload.poNumber})` : ''}`;
    case 'order.shipped':
      return `PO shipped${payload.awb ? ` · AWB ${payload.awb}` : ''}`;
    case 'order.delivered':
      return `PO delivered${payload.poNumber ? ` (${payload.poNumber})` : ''}`;
    case 'order.cancelled':
      return `PO cancelled by stockist${payload.poNumber ? ` (${payload.poNumber})` : ''}`;
    case 'bill.generated':
      return `Payable bill generated${payload.billNumber ? ` (${payload.billNumber})` : ''}`;
    case 'payment.recorded':
      return `Payment recorded${payload.amount ? ` · Rs ${Number(payload.amount).toLocaleString('en-IN')}` : ''}`;
    case 'payment.voided':
      return `Payment voided${payload.paymentNumber ? ` (${payload.paymentNumber})` : ''}`;
    case 'return.accepted':
      return `Return accepted${payload.returnNumber ? ` (${payload.returnNumber})` : ''}`;
    case 'return.rejected':
      return `Return rejected${payload.reason ? `: ${payload.reason}` : ''}`;
    case 'return.processed':
      return `Return credited${payload.creditAmount ? ` · Rs ${Number(payload.creditAmount).toLocaleString('en-IN')}` : ''}`;
    default:
      return event?.eventType ? String(event.eventType).replace(/_/g, ' ') : 'Event update';
  }
}

const PharmacyHeader = () => {
  const navigate = useNavigate();
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [open, setOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const { data: eventHistory = [] } = useEventHistory(20);
  const processEvents = useProcessEvents();
  const lastSyncError = useEventSyncStore((s) => s.lastError);
  const history = Array.isArray(eventHistory) ? eventHistory : [];
  const pendingEvents = history.filter((ev: any) => !ev.deliveredAt);
  const showSyncAction = pendingEvents.length > 0 || Boolean(lastSyncError);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = async () => { await logout(); navigate(loginPath('pharmacy')); };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    navigate(`/pharmacy/products?search=${encodeURIComponent(q)}`);
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
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-caption focus:outline-none focus:ring-1 focus:ring-teal-500 focus:bg-white transition-all"
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
            {pendingEvents.length > 0 && (
              <span className="absolute top-1 right-1 min-w-[14px] h-3.5 px-0.5 bg-teal-600 rounded-full text-[9px] font-bold text-white flex items-center justify-center">
                {pendingEvents.length}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="notification-popover absolute right-0 mt-2 w-[calc(100vw-1rem)] max-w-sm sm:w-72 bg-white rounded-xl shadow-lg border border-slate-100 py-2 z-50">
              <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
                <span className="text-section-title text-slate-700">Notifications</span>
                {showSyncAction && (
                  <button
                    type="button"
                    onClick={() => processEvents.mutate()}
                    disabled={processEvents.isPending}
                    className="text-[10px] text-teal-600 hover:text-teal-700 font-medium disabled:opacity-50"
                  >
                    {processEvents.isPending ? 'Syncing…' : 'Process all'}
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
              {history.length === 0 ? (
                <div className="p-4 text-center text-slate-400 text-xs">No recent events</div>
              ) : (
                <ul className="divide-y divide-slate-50 max-h-60 overflow-y-auto">
                  {history.slice(0, 20).map((ev: any) => {
                    const path = getPharmacyEventPath(ev);
                    const content = (
                      <>
                        <p className={`font-medium ${ev.deliveredAt ? 'text-slate-700' : 'text-teal-700'}`}>
                          {formatEventMessage(ev)}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {ev.deliveredAt ? 'Applied' : 'Pending'}
                        </p>
                      </>
                    );
                    return (
                      <li key={ev.id}>
                        {path ? (
                          <button
                            type="button"
                            className="w-full text-left px-3 py-2.5 text-xs hover:bg-slate-50"
                            onClick={() => { navigate(path); setNotifOpen(false); }}
                          >
                            {content}
                          </button>
                        ) : (
                          <div className="px-3 py-2.5 text-xs">{content}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="relative">
          <button
            onClick={() => { setOpen(!open); setNotifOpen(false); }}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-teal-100 flex items-center justify-center">
              <span className="text-teal-700 text-xs font-semibold">
                {(user?.name ?? 'U').charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-body font-medium text-slate-800 leading-none">{user?.name ?? 'User'}</p>
              <p className="text-caption capitalize leading-none mt-0.5">{user?.role ?? 'user'}</p>
            </div>
          </button>

          {open && (
            <div className="absolute right-0 mt-2 w-44 bg-white rounded-xl shadow-lg border border-slate-100 py-1 z-50">
              {/* M54: Settings is admin-only on the route; hide for non-admins so they don't hit Access Denied */}
              {user?.role === 'admin' && (
                <>
                  <button
                    onClick={() => { setOpen(false); navigate('/pharmacy/settings'); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-body text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <Settings className="w-4 h-4 text-slate-400" /> Settings
                  </button>
                  <div className="h-px bg-slate-100 my-1" />
                </>
              )}
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-body text-red-600 hover:bg-red-50 transition-colors"
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

export default PharmacyHeader;
