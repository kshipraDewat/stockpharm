import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useBills } from '../../hooks/useBills';
import { useDebounce } from '../../hooks/useDebounce';
import PageHeader from '../common/PageHeader';
import { statusBadge } from '../common/Badge';
import QueryError from '../common/QueryError';
import Pagination from '../common/Pagination';
import { formatCurrency, formatDate } from '../../lib/formatters';
import { getTotal, getBalanceDue } from '../../lib/fields';
import { toMoney } from '../../lib/money';

function dueDateClass(dueDate: string | undefined, status: string): string {
  if (!dueDate || status === 'paid') return 'text-slate-500';
  const due = new Date(dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((due.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0 || status === 'overdue') return 'text-red-600 font-medium';
  if (diffDays <= 7) return 'text-amber-600 font-medium';
  return 'text-slate-500';
}

const BillListPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [status, setStatus] = useState(searchParams.get('status') ?? '');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data, isLoading, isError, refetch } = useBills({ search: debouncedSearch, status, page, pageSize });
  const bills = data?.data ?? data ?? [];
  const total = data?.total ?? bills.length;
  const pageTotal = bills.reduce((sum: number, b: any) => sum + toMoney(getTotal(b)), 0);

  const updateStatus = (v: string) => {
    setStatus(v);
    setPage(1);
    const p = new URLSearchParams(searchParams);
    if (v) p.set('status', v); else p.delete('status');
    setSearchParams(p);
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <PageHeader
        breadcrumbs={[{ label: 'Bills' }]}
        showBack={false}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="px-3 h-9 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 w-40"
            />
            <select
              value={status}
              onChange={e => updateStatus(e.target.value)}
              className="h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-600"
            >
              <option value="">All</option>
              <option value="paid">Paid</option>
              <option value="partial">Partial</option>
              <option value="unpaid">Unpaid</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>
        }
      />

      {isError ? (
        <QueryError onRetry={() => refetch()} />
      ) : (
      <>
      {/* Desktop table */}
      <div className="hidden md:block bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden overflow-x-auto">
        <table className="w-full text-sm min-w-[880px]">
          <thead className="sticky top-0 bg-white z-10">
            <tr className="border-b border-slate-100">
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">Invoice #</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">Pharmacy</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">Due</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">Status</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wide">Total</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wide">Paid</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wide">Outstanding</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {isLoading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: 8 }).map((__, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-200 rounded" /></td>
                    ))}
                  </tr>
                ))
              : bills.length === 0
              ? <tr><td colSpan={8} className="px-4 py-14 text-center text-sm text-slate-400">No bills found.</td></tr>
              : bills.map((b: any) => {
                  const outstanding = getBalanceDue(b);
                  const billStatus = b.displayStatus ?? b.status;
                  return (
                  <tr key={b.id} onClick={() => navigate(`/bills/${b.id}`)} className="hover:bg-slate-50 cursor-pointer transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-900">{b.billNumber}</td>
                    <td className="px-4 py-3 text-slate-700">{b.pharmacyName}</td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(b.billDate)}</td>
                    <td className={`px-4 py-3 ${dueDateClass(b.dueDate, billStatus)}`}>{formatDate(b.dueDate)}</td>
                    <td className="px-4 py-3">{statusBadge(billStatus)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatCurrency(getTotal(b))}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{formatCurrency(b.paidAmount ?? 0)}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${outstanding > 0 ? 'text-red-600' : 'text-slate-500'}`}>
                      {formatCurrency(outstanding)}
                    </td>
                  </tr>
                );})
            }
          </tbody>
          {!isLoading && bills.length > 0 && (
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50">
                <td colSpan={5} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Page total</td>
                <td className="px-4 py-3 text-right font-bold text-slate-900">{formatCurrency(pageTotal)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
        <Pagination page={page} total={total} pageSize={pageSize} onPageChange={setPage} />
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-slate-100 p-4 animate-pulse">
                <div className="h-4 bg-slate-200 rounded w-2/3 mb-2" />
                <div className="h-3 bg-slate-100 rounded w-1/2" />
              </div>
            ))
          : bills.length === 0
          ? <p className="text-center text-sm text-slate-400 py-10">No bills found.</p>
          : bills.map((b: any) => {
              const outstanding = getBalanceDue(b);
              const billStatus = b.displayStatus ?? b.status;
              return (
              <button
                key={b.id}
                type="button"
                onClick={() => navigate(`/bills/${b.id}`)}
                className="w-full text-left bg-white rounded-xl border border-slate-100 shadow-sm p-4 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">{b.billNumber}</p>
                    <p className="text-sm text-slate-600">{b.pharmacyName}</p>
                  </div>
                  {statusBadge(billStatus)}
                </div>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-slate-400">{formatDate(b.billDate)}</span>
                  <span className={dueDateClass(b.dueDate, billStatus)}>Due {formatDate(b.dueDate)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-slate-500">Paid {formatCurrency(b.paidAmount ?? 0)}</span>
                  <span className={`font-semibold ${outstanding > 0 ? 'text-red-600' : 'text-slate-500'}`}>
                    Due {formatCurrency(outstanding)}
                  </span>
                  <span className="font-semibold text-slate-900">{formatCurrency(getTotal(b))}</span>
                </div>
              </button>
            );})
        }
        <Pagination page={page} total={total} pageSize={pageSize} onPageChange={setPage} />
      </div>
      </>
      )}
    </div>
  );
};

export default BillListPage;
