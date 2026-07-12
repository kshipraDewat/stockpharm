import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { usePayableBills } from '../../../hooks/usePayableBills';
import { useDebounce } from '../../../hooks/useDebounce';
import PageHeader from '../../common/PageHeader';
import { statusBadge } from '../../common/Badge';
import QueryError from '../../common/QueryError';
import { pharmacyQueryErrorMessage } from '../../../lib/pharmacyQuery';
import Pagination from '../../common/Pagination';
import { formatCurrency, formatDate } from '../../../lib/formatters';

const PayableBillListPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const debouncedSearch = useDebounce(search, 300);
  const [status, setStatus] = useState(searchParams.get('status') ?? '');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  useEffect(() => {
    const s = searchParams.get('status');
    if (s) setStatus(s);
    const q = searchParams.get('search');
    if (q) setSearch(q);
  }, [searchParams]);

  const { data, isLoading, isError, error, refetch } = usePayableBills({ search: debouncedSearch, status: status || undefined, page, pageSize });
  const bills = Array.isArray(data?.data) ? data.data : [];
  const total = data?.total ?? 0;

  const outstanding = (b: any) => b.outstanding ?? (Number(b.total) - Number(b.paidAmount ?? 0));

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <PageHeader
        breadcrumbs={[{ label: 'Payable Bills' }]}
        showBack={false}
        actions={
          <div className="flex gap-2 flex-wrap">
            <input type="text" placeholder="Search bill#..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="h-9 px-3 text-sm border border-slate-200 rounded-lg w-40" />
            <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className="h-9 px-3 text-sm border border-slate-200 rounded-lg">
              <option value="">All</option>
              <option value="unpaid">Unpaid</option>
              <option value="partial">Partial</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
            </select>
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
              <th className="px-4 py-3 text-left text-xs text-slate-400 uppercase">Bill #</th>
              <th className="px-4 py-3 text-left text-xs text-slate-400 uppercase">Stockist</th>
              <th className="px-4 py-3 text-left text-xs text-slate-400 uppercase">Date</th>
              <th className="px-4 py-3 text-left text-xs text-slate-400 uppercase">Due</th>
              <th className="px-4 py-3 text-left text-xs text-slate-400 uppercase">Status</th>
              <th className="px-4 py-3 text-right text-xs text-slate-400 uppercase">Outstanding</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {Array.from({ length: 6 }).map((__, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-200 rounded" /></td>
                  ))}
                </tr>
              ))
            ) : bills.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-14 text-center text-slate-400">No payable bills.</td></tr>
            ) : bills.map((b: any) => (
              <tr key={b.id} onClick={() => navigate(`/pharmacy/payable-bills/${b.id}`)} className="hover:bg-slate-50 cursor-pointer">
                <td className="px-4 py-3 font-semibold text-teal-600">{b.billNumber}</td>
                <td className="px-4 py-3">{b.stockistName ?? '—'}</td>
                <td className="px-4 py-3">{formatDate(b.billDate)}</td>
                <td className="px-4 py-3">{formatDate(b.dueDate)}</td>
                <td className="px-4 py-3">{statusBadge(b.status)}</td>
                <td className="px-4 py-3 text-right font-semibold">
                  {formatCurrency(outstanding(b))}
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
          : bills.length === 0
          ? <p className="text-center text-sm text-slate-400 py-10">No payable bills.</p>
          : bills.map((b: any) => (
              <button
                key={b.id}
                type="button"
                onClick={() => navigate(`/pharmacy/payable-bills/${b.id}`)}
                className="w-full text-left bg-white rounded-xl border border-slate-100 shadow-sm p-4 hover:bg-slate-50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-teal-600">{b.billNumber}</p>
                    <p className="text-sm text-slate-600">{b.stockistName ?? '—'}</p>
                  </div>
                  {statusBadge(b.status)}
                </div>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-slate-400">{formatDate(b.billDate)}</span>
                  <span className="text-slate-500">Due {formatDate(b.dueDate)}</span>
                </div>
                <div className="mt-2 text-right text-sm font-semibold text-slate-900">
                  {formatCurrency(outstanding(b))}
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

export default PayableBillListPage;
