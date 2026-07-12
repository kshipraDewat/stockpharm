import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Download } from 'lucide-react';
import { usePurchases } from '../../hooks/usePurchases';
import { useSuppliers } from '../../hooks/useSuppliers';
import { useDebounce } from '../../hooks/useDebounce';
import PageHeader from '../common/PageHeader';
import Button from '../common/Button';
import { statusBadge } from '../common/Badge';
import Pagination from '../common/Pagination';
import UploadBillModal from './UploadBillModal';
import { downloadCSV } from '../../lib/exportUtils';
import { api } from '../../api/client';
import { formatCurrency, formatDate } from '../../lib/formatters';
import { getTotal } from '../../lib/fields';
import { purchaseDetailPath, purchaseListPath, usePanelBasePath } from '../../hooks/usePanelBasePath';

const PurchaseListPage = () => {
  const navigate = useNavigate();
  const base = usePanelBasePath();
  const [searchParams, setSearchParams] = useSearchParams();
  const procureProductId = searchParams.get('procureProductId') ?? undefined;
  const procureQty = searchParams.get('procureQty') ? Number(searchParams.get('procureQty')) : undefined;
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [supplierId, setSupplierId] = useState('');
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [last30, setLast30] = useState(false);
  const [page, setPage] = useState(1);
  const [isUploadOpen, setIsUploadOpen] = useState(!!procureProductId);
  const pageSize = 20;

  useEffect(() => {
    if (procureProductId) setIsUploadOpen(true);
  }, [procureProductId]);

  const effectiveFrom = last30
    ? new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]
    : dateFrom;
  const effectiveTo = last30 ? new Date().toISOString().split('T')[0] : dateTo;

  const { data, isLoading } = usePurchases({
    page, pageSize, search: debouncedSearch || undefined,
    supplierId: supplierId || undefined, status: status || undefined,
    dateFrom: effectiveFrom || undefined, dateTo: effectiveTo || undefined,
  });
  const purchases = data?.data ?? data ?? [];
  const total = data?.total ?? purchases.length;
  const { data: suppliersData } = useSuppliers({});
  const suppliers = suppliersData?.data ?? suppliersData ?? [];

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <PageHeader
        breadcrumbs={[{ label: 'Purchases' }]}
        showBack={false}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <input type="text" placeholder="Search bill / supplier..." value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="px-3 h-9 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 w-48" />
            <Button variant="secondary" leftIcon={<Download />} size="sm" onClick={async () => {
              try {
                const res = await api.get('/purchases', { params: { pageSize: 50000, search: debouncedSearch || undefined, supplierId: supplierId || undefined, status: status || undefined, dateFrom: effectiveFrom || undefined, dateTo: effectiveTo || undefined } });
                const rows = res.data?.data ?? [];
                downloadCSV(rows, 'purchases');
              } catch { /* ignore */ }
            }}>
              Export
            </Button>
            <Button variant="primary" leftIcon={<Plus />} onClick={() => setIsUploadOpen(true)}>
              Add Purchase
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2 px-1">
        <select value={supplierId} onChange={e => { setSupplierId(e.target.value); setPage(1); }}
          className="h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white">
          <option value="">All suppliers</option>
          {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}
          className="h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white">
          <option value="">All status</option>
          <option value="pending">Pending</option>
          <option value="received">Received</option>
        </select>
        <input type="date" value={dateFrom} disabled={last30}
          onChange={e => { setDateFrom(e.target.value); setLast30(false); setPage(1); }}
          className="h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white" />
        <input type="date" value={dateTo} disabled={last30}
          onChange={e => { setDateTo(e.target.value); setLast30(false); setPage(1); }}
          className="h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white" />
        <button type="button" onClick={() => { setLast30(v => !v); setPage(1); }}
          className={`h-9 px-3 text-sm rounded-lg border ${last30 ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600'}`}>
          Last 30 Days
        </button>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="sticky top-0 bg-white z-10">
            <tr className="border-b border-slate-100">
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">GRN / Invoice</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">Supplier</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">Status</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wide">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {isLoading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: 5 }).map((__, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-200 rounded" /></td>
                    ))}
                  </tr>
                ))
              : purchases.length === 0
              ? <tr><td colSpan={5} className="px-4 py-14 text-center text-sm text-slate-400">No purchases found.</td></tr>
              : purchases.map((p: any) => (
                  <tr key={p.id} onClick={() => navigate(purchaseDetailPath(base, p.id))} className="hover:bg-slate-50 cursor-pointer transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{p.grnNumber ?? p.id?.slice(0, 8)}</p>
                      <p className="text-xs text-slate-400">Inv: {p.supplierInvoiceNo ?? '—'}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{p.supplierName ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(p.invoiceDate ?? p.date)}</td>
                    <td className="px-4 py-3">{statusBadge(p.status)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatCurrency(getTotal(p))}</td>
                  </tr>
                ))
            }
          </tbody>
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
          : purchases.length === 0
          ? <p className="text-center text-sm text-slate-400 py-10">No purchases found.</p>
          : purchases.map((p: any) => (
              <button
                key={p.id}
                type="button"
                onClick={() => navigate(purchaseDetailPath(base, p.id))}
                className="w-full text-left bg-white rounded-xl border border-slate-100 shadow-sm p-4 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">{p.grnNumber ?? p.id?.slice(0, 8)}</p>
                    <p className="text-xs text-slate-400">Inv: {p.supplierInvoiceNo ?? '—'}</p>
                  </div>
                  {statusBadge(p.status)}
                </div>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-slate-600">{p.supplierName ?? '—'}</span>
                  <span className="text-slate-400">{formatDate(p.invoiceDate ?? p.date)}</span>
                  <span className="font-semibold text-slate-900">{formatCurrency(getTotal(p))}</span>
                </div>
              </button>
            ))
        }
        <Pagination page={page} total={total} pageSize={pageSize} onPageChange={setPage} />
      </div>

      <UploadBillModal
        isOpen={isUploadOpen}
        onClose={() => {
          setIsUploadOpen(false);
          if (procureProductId) setSearchParams({});
        }}
        initialProductId={procureProductId}
        initialQty={procureQty}
      />
    </div>
  );
};

export default PurchaseListPage;
