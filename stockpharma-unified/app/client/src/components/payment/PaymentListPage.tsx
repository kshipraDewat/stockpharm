import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { usePayments } from '../../hooks/usePayments';
import PageHeader from '../common/PageHeader';
import Button from '../common/Button';
import { statusBadge } from '../common/Badge';
import QueryError from '../common/QueryError';
import Pagination from '../common/Pagination';
import RecordPaymentModal from './RecordPaymentModal';
import { formatCurrency, formatDate } from '../../lib/formatters';
import { getPaymentDate } from '../../lib/fields';

const PaymentListPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // me3: dashboard CTAs use `?record=1` to open the modal directly.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (location.state?.openModal) {
      setIsModalOpen(true);
      window.history.replaceState({}, document.title);
    } else if (searchParams.get('record') === '1') {
      setIsModalOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete('record');
      setSearchParams(next, { replace: true });
    }
  }, [location, searchParams, setSearchParams]);

  const { data, isLoading, isError, refetch } = usePayments({ page, pageSize, search: search || undefined });
  const payments = data?.data ?? data ?? [];
  const total = data?.total ?? payments.length;

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <PageHeader
        breadcrumbs={[{ label: 'Payments' }]}
        showBack={false}
        actions={
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Search pharmacy..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="px-3 h-9 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 w-44"
            />
            <Button variant="primary" leftIcon={<Plus />} onClick={() => setIsModalOpen(true)}>
              Record Payment
            </Button>
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
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">Pharmacy</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">Mode</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">Reference</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">Status</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wide">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {isLoading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: 6 }).map((__, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-200 rounded" /></td>
                    ))}
                  </tr>
                ))
              : payments.length === 0
              ? <tr><td colSpan={6} className="px-4 py-14 text-center text-sm text-slate-400">No payments found.</td></tr>
              : payments.map((p: any) => (
                  <tr key={p.id} onClick={() => navigate(`/payments/${p.id}`)} className="hover:bg-slate-50 cursor-pointer transition-colors">
                    <td className="px-4 py-3 text-slate-500">{formatDate(getPaymentDate(p))}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{p.pharmacyName}</td>
                    <td className="px-4 py-3">{statusBadge(p.method)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{p.referenceNo || '—'}</td>
                    <td className="px-4 py-3">{statusBadge(p.status)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatCurrency(p.amount)}</td>
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
          : payments.length === 0
          ? <p className="text-center text-sm text-slate-400 py-10">No payments found.</p>
          : payments.map((p: any) => (
              <button
                key={p.id}
                type="button"
                onClick={() => navigate(`/payments/${p.id}`)}
                className="w-full text-left bg-white rounded-xl border border-slate-100 shadow-sm p-4 hover:bg-slate-50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">{p.pharmacyName}</p>
                    <p className="text-xs text-slate-400">{formatDate(getPaymentDate(p))}</p>
                  </div>
                  {statusBadge(p.status)}
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-slate-500 capitalize">{p.method}</span>
                  <span className="font-semibold">{formatCurrency(p.amount)}</span>
                </div>
              </button>
            ))
        }
        <Pagination page={page} total={total} pageSize={pageSize} onPageChange={setPage} />
      </div>
      </>
      )}

      <RecordPaymentModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  );
};

export default PaymentListPage;
