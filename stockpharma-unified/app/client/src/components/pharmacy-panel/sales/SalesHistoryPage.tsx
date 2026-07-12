import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRetailSales } from '../../../hooks/useRetailSales';
import { useDebounce } from '../../../hooks/useDebounce';
import PageHeader from '../../common/PageHeader';
import { statusBadge } from '../../common/Badge';
import QueryError from '../../common/QueryError';
import Pagination from '../../common/Pagination';
import { formatCurrency, formatDate } from '../../../lib/formatters';

const SalesHistoryPage = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data, isLoading, isError, refetch } = useRetailSales({
    search: debouncedSearch,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    page,
    pageSize,
  });

  const sales = data?.data ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <PageHeader
        breadcrumbs={[{ label: 'Sales History' }]}
        showBack={false}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <input type="text" placeholder="Search sale#..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="h-9 px-3 text-sm border border-slate-200 rounded-lg w-36" />
            <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} className="h-9 px-2 text-sm border border-slate-200 rounded-lg" />
            <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} className="h-9 px-2 text-sm border border-slate-200 rounded-lg" />
          </div>
        }
      />

      {isError ? (
        <QueryError onRetry={() => refetch()} />
      ) : (
      <>
      <div className="hidden md:block bg-white rounded-xl border border-slate-100 shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="px-4 py-3 text-left text-xs text-slate-400 uppercase">Sale #</th>
              <th className="px-4 py-3 text-left text-xs text-slate-400 uppercase">Date</th>
              <th className="px-4 py-3 text-left text-xs text-slate-400 uppercase">Payment</th>
              <th className="px-4 py-3 text-left text-xs text-slate-400 uppercase">Status</th>
              <th className="px-4 py-3 text-right text-xs text-slate-400 uppercase">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {isLoading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>
            ) : sales.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-14 text-center text-slate-400">No sales found.</td></tr>
            ) : sales.map((s: any) => (
              <tr key={s.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => navigate(`/pharmacy/sales/${s.id}`)}>
                <td className="px-4 py-3 font-semibold text-teal-600">{s.saleNumber}</td>
                <td className="px-4 py-3">{formatDate(s.saleDate)}</td>
                <td className="px-4 py-3">{statusBadge(s.paymentMethod)}</td>
                <td className="px-4 py-3">{statusBadge(s.status)}</td>
                <td className="px-4 py-3 text-right font-semibold">{formatCurrency(s.total)}</td>
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
              </div>
            ))
          : sales.length === 0
          ? <p className="text-center text-sm text-slate-400 py-10">No sales found.</p>
          : sales.map((s: any) => (
              <button
                key={s.id}
                type="button"
                onClick={() => navigate(`/pharmacy/sales/${s.id}`)}
                className="w-full text-left bg-white rounded-xl border border-slate-100 shadow-sm p-4 hover:bg-slate-50"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-teal-600">{s.saleNumber}</p>
                  {statusBadge(s.status)}
                </div>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-slate-400">{formatDate(s.saleDate)} · {s.paymentMethod}</span>
                  <span className="font-semibold">{formatCurrency(s.total)}</span>
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

export default SalesHistoryPage;
