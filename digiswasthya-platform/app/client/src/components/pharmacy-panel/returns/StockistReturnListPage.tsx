import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStockistReturns } from '../../../hooks/useStockistReturns';
import PageHeader from '../../common/PageHeader';
import { statusBadge } from '../../common/Badge';
import Pagination from '../../common/Pagination';
import QueryError from '../../common/QueryError';
import { pharmacyQueryErrorMessage } from '../../../lib/pharmacyQuery';
import { formatCurrency, formatDate } from '../../../lib/formatters';

const StockistReturnListPage = () => {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, error, refetch } = useStockistReturns({ page, pageSize: 20 });
  const returns = Array.isArray(data?.data) ? data.data : [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <PageHeader breadcrumbs={[{ label: 'Returns to Stockist' }]} showBack={false} />
      {isError ? (
        <QueryError message={pharmacyQueryErrorMessage(error)} onRetry={() => refetch()} />
      ) : (
      <>
      <div className="hidden md:block bg-white rounded-xl border border-slate-100 shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="px-4 py-3 text-left text-xs text-slate-400 uppercase">Return #</th>
              <th className="px-4 py-3 text-left text-xs text-slate-400 uppercase">Date</th>
              <th className="px-4 py-3 text-left text-xs text-slate-400 uppercase">Reason</th>
              <th className="px-4 py-3 text-left text-xs text-slate-400 uppercase">Status</th>
              <th className="px-4 py-3 text-right text-xs text-slate-400 uppercase">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {isLoading ? (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-400">Loading…</td></tr>
            ) : returns.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-400">No returns yet.</td></tr>
            ) : returns.map((r: any) => (
              <tr key={r.id} onClick={() => navigate(`/pharmacy/returns/${r.id}`)} className="hover:bg-slate-50 cursor-pointer">
                <td className="px-4 py-3 font-medium text-teal-600">{r.returnNumber}</td>
                <td className="px-4 py-3 text-slate-600">{formatDate(r.returnDate)}</td>
                <td className="px-4 py-3 capitalize text-slate-600">{r.reason}</td>
                <td className="px-4 py-3">{statusBadge(r.status)}</td>
                <td className="px-4 py-3 text-right font-semibold">{formatCurrency(r.totalAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination page={page} total={total} pageSize={20} onPageChange={setPage} />
      </div>

      <div className="md:hidden space-y-2">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-100 p-4 animate-pulse">
              <div className="h-4 bg-slate-200 rounded w-2/3 mb-2" />
            </div>
          ))
        ) : returns.length === 0 ? (
          <p className="text-center text-sm text-slate-400 py-10">No returns yet.</p>
        ) : returns.map((r: any) => (
          <button
            key={r.id}
            type="button"
            onClick={() => navigate(`/pharmacy/returns/${r.id}`)}
            className="w-full text-left bg-white rounded-xl border border-slate-100 shadow-sm p-4 hover:bg-slate-50"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-teal-600">{r.returnNumber}</p>
              {statusBadge(r.status)}
            </div>
            <p className="text-sm text-slate-600 capitalize mt-1">{r.reason}</p>
            <div className="mt-2 flex items-center justify-between text-xs">
              <span className="text-slate-400">{formatDate(r.returnDate)}</span>
              <span className="font-semibold">{formatCurrency(r.totalAmount)}</span>
            </div>
          </button>
        ))}
        <Pagination page={page} total={total} pageSize={20} onPageChange={setPage} />
      </div>
      </>
      )}
    </div>
  );
};

export default StockistReturnListPage;
