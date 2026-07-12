import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { usePurchaseOrders } from '../../../hooks/usePurchaseOrders';
import { useDebounce } from '../../../hooks/useDebounce';
import PageHeader from '../../common/PageHeader';
import Button from '../../common/Button';
import { statusBadge } from '../../common/Badge';
import QueryError from '../../common/QueryError';
import { pharmacyQueryErrorMessage } from '../../../lib/pharmacyQuery';
import Pagination from '../../common/Pagination';
import { formatCurrency, formatDate } from '../../../lib/formatters';

const STATUSES = ['draft', 'submitted', 'accepted', 'rejected', 'packed', 'shipped', 'delivered', 'received', 'partially_received', 'cancel_requested', 'cancelled'];

const PurchaseOrderListPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [status, setStatus] = useState(searchParams.get('status') ?? '');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  useEffect(() => {
    const s = searchParams.get('status');
    if (s) setStatus(s);
  }, [searchParams]);

  const { data, isLoading, isError, error, refetch } = usePurchaseOrders({ search: debouncedSearch, status: status || undefined, page, pageSize });
  const orders = Array.isArray(data?.data) ? data.data : [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <PageHeader
        breadcrumbs={[{ label: 'Purchase Orders' }]}
        showBack={false}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="text"
              placeholder="Search PO#..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="pl-3 h-9 text-sm border border-slate-200 rounded-lg w-40"
            />
            <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className="h-9 px-3 text-sm border border-slate-200 rounded-lg">
              <option value="">All statuses</option>
              {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
            <Button variant="primary" leftIcon={<Plus />} onClick={() => navigate('/pharmacy/purchase-orders/create')} className="!bg-teal-600 hover:!bg-teal-700">
              New PO
            </Button>
          </div>
        }
      />

      {isError ? (
        <QueryError message={pharmacyQueryErrorMessage(error)} onRetry={() => refetch()} />
      ) : (
      <>
      <div className="hidden md:block bg-white rounded-xl border border-slate-100 shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="px-4 py-3 text-left text-xs text-slate-400 uppercase">PO #</th>
              <th className="px-4 py-3 text-left text-xs text-slate-400 uppercase">Date</th>
              <th className="px-4 py-3 text-left text-xs text-slate-400 uppercase">Stockist</th>
              <th className="px-4 py-3 text-left text-xs text-slate-400 uppercase">Status</th>
              <th className="px-4 py-3 text-right text-xs text-slate-400 uppercase">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {Array.from({ length: 5 }).map((__, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-200 rounded" /></td>
                  ))}
                </tr>
              ))
            ) : orders.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-14 text-center text-slate-400">No purchase orders found.</td></tr>
            ) : orders.map((po: any) => (
              <tr key={po.id} onClick={() => navigate(`/pharmacy/purchase-orders/${po.id}`)} className="hover:bg-slate-50 cursor-pointer">
                <td className="px-4 py-3 font-semibold text-teal-600">{po.poNumber}</td>
                <td className="px-4 py-3 text-slate-500">{formatDate(po.orderDate)}</td>
                <td className="px-4 py-3">{po.stockistName ?? '—'}</td>
                <td className="px-4 py-3">{statusBadge(po.status)}</td>
                <td className="px-4 py-3 text-right font-semibold">{formatCurrency(po.total)}</td>
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
          ? <p className="text-center text-sm text-slate-400 py-10">No purchase orders found.</p>
          : orders.map((po: any) => (
              <button
                key={po.id}
                type="button"
                onClick={() => navigate(`/pharmacy/purchase-orders/${po.id}`)}
                className="w-full text-left bg-white rounded-xl border border-slate-100 shadow-sm p-4 hover:bg-slate-50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-teal-600">{po.poNumber}</p>
                    <p className="text-sm text-slate-600">{po.stockistName ?? '—'}</p>
                  </div>
                  {statusBadge(po.status)}
                </div>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-slate-400">{formatDate(po.orderDate)}</span>
                  <span className="font-semibold text-slate-900">{formatCurrency(po.total)}</span>
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

export default PurchaseOrderListPage;
