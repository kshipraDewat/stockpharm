import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RotateCcw } from 'lucide-react';
import { useReturns } from '../../hooks/useReturns';
import { useOrders } from '../../hooks/useOrders';
import { useDebounce } from '../../hooks/useDebounce';
import { useAuthStore } from '../../stores/authStore';
import PageHeader from '../common/PageHeader';
import Button from '../common/Button';
import Modal from '../common/Modal';
import { statusBadge } from '../common/Badge';
import QueryError from '../common/QueryError';
import Pagination from '../common/Pagination';
import InitiateReturnModal from '../order/InitiateReturnModal';
import { formatCurrency, formatDate } from '../../lib/formatters';
import { getTotal } from '../../lib/fields';

const ReturnListPage = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [source, setSource] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [pickOrderOpen, setPickOrderOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const isAdmin = useAuthStore((s) => s.user?.role) === 'admin';
  const { data, isLoading, isError, refetch } = useReturns({
    search: debouncedSearch || undefined,
    source: source || undefined,
    page,
    pageSize,
  });
  const { data: deliveredOrdersData, isLoading: deliveredOrdersLoading } = useOrders({
    status: 'delivered',
    pageSize: 50,
    enabled: pickOrderOpen,
  });
  const returns = data?.data ?? data ?? [];
  const total = data?.total ?? returns.length;
  const deliveredOrders = deliveredOrdersData?.data ?? deliveredOrdersData ?? [];

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <PageHeader
        breadcrumbs={[{ label: 'Returns' }]}
        showBack={false}
        actions={
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Search return # or pharmacy..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="px-3 h-9 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 w-48"
            />
            <select
              value={source}
              onChange={e => { setSource(e.target.value); setPage(1); }}
              className="px-3 h-9 text-sm border border-slate-200 rounded-lg bg-white"
            >
              <option value="">All sources</option>
              <option value="manual">Manual</option>
              <option value="portal">Pharmacy portal</option>
            </select>
            {isAdmin && (
            <Button variant="primary" leftIcon={<RotateCcw />} onClick={() => setPickOrderOpen(true)}>
              Initiate Return
            </Button>
            )}
          </div>
        }
      />

      <Modal
        isOpen={pickOrderOpen}
        onClose={() => setPickOrderOpen(false)}
        title="Select Delivered Order"
        size="md"
      >
        {deliveredOrdersLoading ? (
          <div className="py-8 text-center text-sm text-slate-400">Loading orders...</div>
        ) : deliveredOrders.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-400">No delivered orders available for return</div>
        ) : (
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-50 -mx-1">
            {deliveredOrders.map((order: any) => {
              const orderTotal = getTotal(order);
              return (
              <button
                key={order.id}
                type="button"
                onClick={() => {
                  setSelectedOrderId(order.id);
                  setPickOrderOpen(false);
                }}
                className="w-full text-left px-3 py-3 hover:bg-slate-50 rounded-lg transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">{order.orderNumber ?? order.id?.slice(0, 8)}</p>
                    <p className="text-sm text-slate-600">{order.pharmacyName ?? '—'}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{formatDate(order.createdAt ?? order.date)}</p>
                  </div>
                  {orderTotal > 0 && (
                    <p className="text-sm font-semibold text-slate-900 shrink-0">{formatCurrency(orderTotal)}</p>
                  )}
                </div>
              </button>
              );
            })}
          </div>
        )}
      </Modal>

      <InitiateReturnModal
        isOpen={!!selectedOrderId}
        onClose={() => setSelectedOrderId(null)}
        orderId={selectedOrderId ?? undefined}
      />

      {isError ? (
        <QueryError onRetry={() => refetch()} />
      ) : (
      <>
      <div className="hidden md:block bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead className="sticky top-0 bg-white z-10">
            <tr className="border-b border-slate-100">
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">Return #</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">Pharmacy</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">Source</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">Status</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wide">Refund</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: 6 }).map((__, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-200 rounded" /></td>
                    ))}
                  </tr>
                ))
              : returns.length === 0
              ? <tr><td colSpan={6} className="px-4 py-14 text-center text-sm text-slate-400">No returns found.</td></tr>
              : returns.map((r: any) => (
                  <tr key={r.id} onClick={() => navigate(`/returns/${r.id}`)} className="hover:bg-slate-50 cursor-pointer transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-900">{r.returnNumber ?? r.id?.slice(0, 8)}</td>
                    <td className="px-4 py-3 text-slate-700">{r.pharmacyName ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${r.source === 'portal' ? 'bg-purple-50 text-purple-700' : 'bg-slate-100 text-slate-600'}`}>
                        {r.source === 'portal' ? 'Portal' : 'Manual'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(r.createdAt ?? r.date)}</td>
                    <td className="px-4 py-3">{statusBadge(r.status)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatCurrency(r.totalAmount ?? r.amount ?? 0)}</td>
                  </tr>
                ))
            }
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
          : returns.length === 0
          ? <p className="text-center text-sm text-slate-400 py-10">No returns found.</p>
          : returns.map((r: any) => (
              <button
                key={r.id}
                type="button"
                onClick={() => navigate(`/returns/${r.id}`)}
                className="w-full text-left bg-white rounded-xl border border-slate-100 shadow-sm p-4 hover:bg-slate-50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">{r.returnNumber ?? r.id?.slice(0, 8)}</p>
                    <p className="text-sm text-slate-600">{r.pharmacyName ?? '—'}</p>
                  </div>
                  {statusBadge(r.status)}
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                  <span>{formatDate(r.createdAt ?? r.date)}</span>
                  <span className="font-semibold text-slate-900">{formatCurrency(r.totalAmount ?? r.amount ?? 0)}</span>
                </div>
              </button>
            ))
        }
        <Pagination page={page} total={total} pageSize={pageSize} onPageChange={setPage} />
      </div>
      </>
      )}
    </div>
  );
};

export default ReturnListPage;
