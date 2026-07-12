import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, CheckCircle } from 'lucide-react';
import { useOrders, useOrder } from '../../hooks/useOrders';
import { usePharmacies } from '../../hooks/usePharmacies';
import { useDebounce } from '../../hooks/useDebounce';
import { useAuthStore } from '../../stores/authStore';
import PageHeader from '../common/PageHeader';
import Button from '../common/Button';
import { orderStatusBadge, sourceBadge } from '../common/Badge';
import QueryError from '../common/QueryError';
import Pagination from '../common/Pagination';
import ApprovePharmacyOrderModal from './ApprovePharmacyOrderModal';
import { formatCurrency, formatDate } from '../../lib/formatters';
import { getTotal } from '../../lib/fields';

// me1: include the "approved" pseudo-status so users can surface portal orders
// that the stockist approved but hasn't packed yet.
const STATUSES = ['pending', 'approved', 'packed', 'shipped', 'delivered', 'cancelled'];
const SOURCES = [
  { value: '', label: 'All Sources' },
  { value: 'pharmacy_submitted', label: 'Pharmacy Portal' },
  { value: 'stockist_created', label: 'Manual' },
];

const OrderListPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isAdmin = useAuthStore((s) => s.user?.role) === 'admin';
  const initialPharmacyId = searchParams.get('pharmacyId') ?? '';
  const initialSource = searchParams.get('source') === 'pharmacy' ? 'pharmacy_submitted' : (searchParams.get('source') ?? '');
  const initialStatus = searchParams.get('status') ?? '';
  const initialDateFrom = searchParams.get('dateFrom') ?? '';
  const initialDateTo = searchParams.get('dateTo') ?? '';
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [status, setStatus] = useState(initialStatus);
  const [source, setSource] = useState(initialSource);
  const [pharmacyId, setPharmacyId] = useState(initialPharmacyId);
  const [dateFrom, setDateFrom] = useState(initialDateFrom);
  const [dateTo, setDateTo] = useState(initialDateTo);
  const [page, setPage] = useState(1);
  const [approveTarget, setApproveTarget] = useState<any | null>(null);
  const pageSize = 20;

  const { data: pharmaciesData } = usePharmacies({ pageSize: 500 });
  const pharmacies = pharmaciesData?.data ?? pharmaciesData ?? [];

  useEffect(() => {
    if (initialPharmacyId) setPharmacyId(initialPharmacyId);
    if (initialSource) setSource(initialSource);
    if (initialStatus) setStatus(initialStatus);
    if (initialDateFrom) setDateFrom(initialDateFrom);
    if (initialDateTo) setDateTo(initialDateTo);
  }, [initialPharmacyId, initialSource, initialStatus, initialDateFrom, initialDateTo]);

  const { data, isLoading, isError, refetch } = useOrders({
    search: debouncedSearch,
    status,
    source: source || undefined,
    pharmacyId: pharmacyId || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    page,
    pageSize,
  });
  const { data: approveOrderDetail, isLoading: approveDetailLoading, isError: approveDetailError } = useOrder(approveTarget?.id ?? '');
  const orders = data?.data ?? data ?? [];
  const total = data?.total ?? orders.length;

  const updateFilter = (key: string, value: string) => {
    if (key === 'source') setSource(value);
    else if (key === 'status') setStatus(value);
    else if (key === 'pharmacyId') setPharmacyId(value);
    else if (key === 'dateFrom') setDateFrom(value);
    else if (key === 'dateTo') setDateTo(value);
    setPage(1);
    const p = new URLSearchParams(searchParams);
    if (value) {
      if (key === 'source') p.set('source', value === 'pharmacy_submitted' ? 'pharmacy' : value);
      else p.set(key, value);
    } else {
      p.delete(key);
    }
    setSearchParams(p);
  };

  const handleOpenApprove = (e: React.MouseEvent, order: any) => {
    e.stopPropagation();
    setApproveTarget(order);
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <PageHeader
        breadcrumbs={[{ label: 'Orders' }]}
        showBack={false}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <input type="text" placeholder="Search..." value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="pl-3 pr-3 h-9 text-sm border border-slate-200 rounded-lg bg-white w-40" />
            <select value={pharmacyId} onChange={e => updateFilter('pharmacyId', e.target.value)}
              className="h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white text-slate-600 max-w-[160px]">
              <option value="">All Pharmacies</option>
              {pharmacies.map((ph: any) => <option key={ph.id} value={ph.id}>{ph.name}</option>)}
            </select>
            <input type="date" value={dateFrom} onChange={e => updateFilter('dateFrom', e.target.value)}
              className="h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-600" title="From date" />
            <input type="date" value={dateTo} onChange={e => updateFilter('dateTo', e.target.value)}
              className="h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-600" title="To date" />
            <select value={source} onChange={e => updateFilter('source', e.target.value)}
              className="h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white text-slate-600">
              {SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <select value={status} onChange={e => updateFilter('status', e.target.value)}
              className="h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white text-slate-600">
              <option value="">All Status</option>
              {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
            {isAdmin && (
            <Button variant="primary" leftIcon={<Plus />} onClick={() => navigate('/orders/create')}>New Order</Button>
            )}
          </div>
        }
      />

      {isError ? (
        <QueryError onRetry={() => refetch()} />
      ) : (
      <>
      <div className="hidden md:block bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden overflow-x-auto">
        <table className="w-full text-sm min-w-[800px]">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Order #</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Pharmacy</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Source</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Status</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">Total</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase w-28">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {Array.from({ length: 7 }).map((__, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-200 rounded" /></td>
                  ))}
                </tr>
              ))
            ) : orders.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-14 text-center text-sm text-slate-400">
                {source === 'pharmacy_submitted' && status === 'pending'
                  ? 'No pending pharmacy orders — share invite code in Settings → Connections and ask pharmacies to use Discover'
                  : 'No orders found.'}
              </td></tr>
            ) : orders.map((o: any) => (
              <tr key={o.id} onClick={() => navigate(`/orders/${o.id}`)} className="hover:bg-slate-50 cursor-pointer">
                <td className="px-4 py-3 font-semibold text-blue-600">{o.orderNumber}</td>
                <td className="px-4 py-3 text-slate-700">{o.pharmacyName ?? '—'}</td>
                <td className="px-4 py-3">{sourceBadge(o.source)}</td>
                <td className="px-4 py-3 text-slate-500">{formatDate(o.orderDate)}</td>
                <td className="px-4 py-3">{orderStatusBadge(o)}</td>
                <td className="px-4 py-3 text-right font-semibold">{formatCurrency(getTotal(o))}</td>
                <td className="px-4 py-3 text-right">
                  {/* M58: server-side approval is admin-only; hide the inline button for non-admins to avoid 403 dead-ends. */}
                  {isAdmin && o.source === 'pharmacy_submitted' && o.status === 'pending' && !o.approvedAt && (
                    <button
                      onClick={(e) => handleOpenApprove(e, o)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-md"
                    >
                      <CheckCircle className="w-3.5 h-3.5" /> Approve
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination page={page} total={total} pageSize={pageSize} onPageChange={setPage} />
      </div>

      <div className="md:hidden space-y-2">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-slate-100 p-4 animate-pulse">
                <div className="h-4 bg-slate-200 rounded w-2/3 mb-2" />
                <div className="h-3 bg-slate-100 rounded w-1/2" />
              </div>
            ))
          : orders.length === 0
          ? <p className="text-center text-sm text-slate-400 py-10">No orders found.</p>
          : orders.map((o: any) => (
              <div
                key={o.id}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/orders/${o.id}`)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate(`/orders/${o.id}`); }}
                className="w-full text-left bg-white rounded-xl border border-slate-100 shadow-sm p-4 hover:bg-slate-50 cursor-pointer"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-blue-600">{o.orderNumber}</p>
                    <p className="text-sm text-slate-600">{o.pharmacyName ?? '—'}</p>
                  </div>
                  {orderStatusBadge(o)}
                </div>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-slate-400">{formatDate(o.orderDate)}</span>
                  <span className="font-semibold text-slate-900">{formatCurrency(getTotal(o))}</span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  {sourceBadge(o.source)}
                  {isAdmin && o.source === 'pharmacy_submitted' && o.status === 'pending' && !o.approvedAt && (
                    <button
                      type="button"
                      onClick={(e) => handleOpenApprove(e, o)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-md"
                    >
                      <CheckCircle className="w-3.5 h-3.5" /> Approve
                    </button>
                  )}
                </div>
              </div>
            ))
        }
        <Pagination page={page} total={total} pageSize={pageSize} onPageChange={setPage} />
      </div>
      </>
      )}

      {approveTarget && (
        <ApprovePharmacyOrderModal
          isOpen={!!approveTarget}
          onClose={() => setApproveTarget(null)}
          orderId={approveTarget.id}
          orderNumber={approveTarget.orderNumber}
          pharmacyName={approveTarget.pharmacyName}
          total={approveOrderDetail?.totalAmount ?? approveOrderDetail?.total ?? getTotal(approveTarget)}
          creditInfo={approveOrderDetail?.creditInfo}
          items={approveOrderDetail?.items}
          isLoadingDetail={approveDetailLoading}
          detailError={approveDetailError}
        />
      )}
    </div>
  );
};

export default OrderListPage;
