import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Download, AlertTriangle, FileEdit } from 'lucide-react';
import { useProducts, useProductCategories } from '../../hooks/useProducts';
import { useAuthStore } from '../../stores/authStore';
import PageHeader from '../common/PageHeader';
import Button from '../common/Button';
import QueryError from '../common/QueryError';
import Pagination from '../common/Pagination';
import AddProductModal from './AddProductModal';
import BulkPriceEditModal from './BulkPriceEditModal';
import UploadBillModal from '../purchase/UploadBillModal';
import { api } from '../../api/client';
import { downloadCSV } from '../../lib/exportUtils';
import toast from 'react-hot-toast';
import { formatCurrency } from '../../lib/formatters';
import { panelPath, usePanelBasePath } from '../../hooks/usePanelBasePath';

const ProductListPage = () => {
  const navigate = useNavigate();
  const base = usePanelBasePath();
  const role = useAuthStore((s) => s.user?.role ?? '');
  const hideRatesForCashier = base === '/pharmacy' && role === 'cashier';
  const [searchParams] = useSearchParams();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [isPurchaseOpen, setIsPurchaseOpen] = useState(false);
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  useEffect(() => {
    const q = searchParams.get('search');
    if (q != null) setSearch(q);
  }, [searchParams]);

  const { data, isLoading, isError, refetch } = useProducts({ search, category, page, pageSize });
  const { data: catData } = useProductCategories();
  const categories = catData && catData.length > 0 ? catData : [];
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin');
  const tenantType = useAuthStore((s) => s.user?.tenantType);
  const canWriteProducts = tenantType === 'pharmacy'
    ? ['admin', 'pharmacist'].includes(role)
    : isAdmin;
  const canAddPurchase = tenantType !== 'pharmacy' && ['admin', 'biller'].includes(role);

  const products = data?.data ?? data ?? [];
  const total = data?.total ?? products.length;

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <PageHeader
        breadcrumbs={[{ label: 'Products' }]}
        showBack={false}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="px-3 h-9 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 w-44"
            />
            <select
              value={category}
              onChange={e => { setCategory(e.target.value); setPage(1); }}
              className="h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-600"
            >
              <option value="">All Categories</option>
              {categories.map((c: string) => <option key={c} value={c}>{c}</option>)}
            </select>
            {canAddPurchase && (
              <Button variant="primary" leftIcon={<Plus />} onClick={() => setIsPurchaseOpen(true)}>
                Add Purchase
              </Button>
            )}
            {canWriteProducts && (
              <>
                <Button variant="secondary" leftIcon={<FileEdit />} size="sm" onClick={() => setIsBulkOpen(true)}>
                  Bulk Update
                </Button>
                <Button variant="secondary" leftIcon={<Plus />} onClick={() => setIsModalOpen(true)}>
                  Add Product
                </Button>
              </>
            )}
            {isAdmin && (
            <Button variant="secondary" leftIcon={<Download />} size="sm" onClick={async () => {
              try {
                const res = await api.get('/products/export');
                const items = res.data?.data ?? [];
                downloadCSV(items, 'products');
              } catch { toast.error('Export failed — admin access required'); }
            }}>
              Export
            </Button>
            )}
          </div>
        }
      />

      {isError ? (
        <QueryError onRetry={() => refetch()} />
      ) : (
      <>
      {/* Desktop table */}
      <div className="hidden md:block bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden overflow-x-auto">
        <table className="w-full text-sm min-w-[520px]">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/50">
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">Product</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">Category</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wide">Stock</th>
              {!hideRatesForCashier && <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wide">MRP</th>}
              {!hideRatesForCashier && <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wide">GST</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {isLoading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-4 py-3"><div className="h-4 bg-slate-200 rounded w-40 mb-1.5" /><div className="h-3 bg-slate-100 rounded w-24" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-slate-100 rounded w-20" /></td>
                    <td className="px-4 py-3 text-right"><div className="h-4 bg-slate-200 rounded w-16 ml-auto" /></td>
                    <td className="px-4 py-3 text-right"><div className="h-4 bg-slate-100 rounded w-16 ml-auto" /></td>
                    <td className="px-4 py-3 text-right"><div className="h-4 bg-slate-100 rounded w-10 ml-auto" /></td>
                  </tr>
                ))
              : products.length === 0
              ? <tr><td colSpan={hideRatesForCashier ? 3 : 5} className="px-4 py-14 text-center text-sm text-slate-400">No products found.</td></tr>
              : products.map((p: any) => {
                  const currentStock = Number(p.stock ?? p.currentStock ?? 0);
                  const isLow = currentStock <= (p.minStockLevel ?? 0) && (p.minStockLevel ?? 0) > 0;
                  return (
                    <tr key={p.id} onClick={() => navigate(panelPath(base, `/products/${p.id}`))} className="hover:bg-slate-50 cursor-pointer transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {isLow && <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                          <div>
                            <p className="font-medium text-slate-900">{p.name}</p>
                            <p className="text-xs text-slate-400">{p.hsnCode || p.manufacturer || ''}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{p.category || '—'}</td>
                      <td className={`px-4 py-3 text-right font-semibold ${isLow ? 'text-red-600' : 'text-slate-900'}`}>
                        {currentStock}
                        {isLow && <span className="text-xs text-slate-400 font-normal ml-1">/ min {p.minStockLevel}</span>}
                      </td>
                      {!hideRatesForCashier && <td className="px-4 py-3 text-right text-slate-700">{p.mrp ? formatCurrency(p.mrp) : '—'}</td>}
                      {!hideRatesForCashier && <td className="px-4 py-3 text-right text-slate-500">{p.gstRate ?? 0}%</td>}
                    </tr>
                  );
                })
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
          : products.length === 0
          ? <p className="text-center text-sm text-slate-400 py-10">No products found.</p>
          : products.map((p: any) => {
              const currentStock = Number(p.stock ?? p.currentStock ?? 0);
              const isLow = currentStock <= (p.minStockLevel ?? 0) && (p.minStockLevel ?? 0) > 0;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => navigate(panelPath(base, `/products/${p.id}`))}
                  className="w-full text-left bg-white rounded-xl border border-slate-100 shadow-sm p-4 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                      {isLow && <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />}
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 truncate">{p.name}</p>
                        <p className="text-xs text-slate-400 truncate">{p.hsnCode || p.manufacturer || '—'}</p>
                      </div>
                    </div>
                    <span className="text-xs text-slate-500 shrink-0">{p.category || '—'}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className={`font-semibold ${isLow ? 'text-red-600' : 'text-slate-700'}`}>
                      Stock {currentStock}{isLow ? ` (min ${p.minStockLevel})` : ''}
                    </span>
                    {/* me8: hide MRP + GST for pharmacy cashiers on the mobile card. */}
                    {!hideRatesForCashier && (
                      <>
                        <span className="text-slate-600">{p.mrp ? formatCurrency(p.mrp) : '—'}</span>
                        <span className="text-slate-400">{p.gstRate ?? 0}% GST</span>
                      </>
                    )}
                  </div>
                </button>
              );
            })
        }
        <Pagination page={page} total={total} pageSize={pageSize} onPageChange={setPage} />
      </div>
      </>
      )}

      <AddProductModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
      <BulkPriceEditModal isOpen={isBulkOpen} onClose={() => setIsBulkOpen(false)} />
      {canAddPurchase && (
        <UploadBillModal isOpen={isPurchaseOpen} onClose={() => setIsPurchaseOpen(false)} />
      )}
    </div>
  );
};

export default ProductListPage;
