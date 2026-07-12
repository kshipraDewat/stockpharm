import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Copy, AlertTriangle, ShoppingCart } from 'lucide-react';
import { useRequiredStockReport } from '../../hooks/useReports';
import PageHeader from '../common/PageHeader';
import Button from '../common/Button';
import Pagination from '../common/Pagination';
import { downloadCSV } from '../../lib/exportUtils';
import { getDeficit } from '../../lib/fields';
import toast from 'react-hot-toast';

const PAGE_SIZE = 25;

const RequiredStockPage = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const { data, isLoading } = useRequiredStockReport();
  const shortages: any[] = data ?? [];

  const filtered = search
    ? shortages.filter(s => (s.productName ?? s.name ?? '').toLowerCase().includes(search.toLowerCase()))
    : shortages;

  const totalShortage = filtered.reduce((acc, s) => acc + getDeficit(s), 0);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleCopy = () => {
    const list = filtered.map(s => {
      const name = s.productName ?? s.name;
      const hsn = s.hsnCode ?? s.hsn ?? '';
      const gap = getDeficit(s);
      return `${name}${hsn ? ` (HSN: ${hsn})` : ''} — Required: ${gap} units`;
    }).join('\n');
    navigator.clipboard.writeText(`Procurement List:\n\n${list}`);
    toast.success('Copied to clipboard');
  };

  const handleProcure = (item: any, e: React.MouseEvent) => {
    e.stopPropagation();
    const productId = item.productId ?? item.id;
    const qty = getDeficit(item);
    navigate(`/purchase-bills?procureProductId=${productId}&procureQty=${qty}`);
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <PageHeader
        breadcrumbs={[{ label: 'Required Stock' }]}
        showBack={false}
        actions={
          <div className="flex items-center gap-2">
            <input type="text" placeholder="Search..." value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="px-3 h-9 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 w-40" />
            <Button variant="secondary" leftIcon={<Download />} size="sm" onClick={() => downloadCSV(filtered, 'required_stock')}>
              Export
            </Button>
            <Button variant="primary" leftIcon={<Copy />} size="sm" onClick={handleCopy}>
              Copy List
            </Button>
          </div>
        }
      />

      {filtered.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800">
            <span className="font-semibold">{filtered.length} items</span> below minimum — total shortage:{' '}
            <span className="font-semibold">{totalShortage} units</span>
          </p>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">Product</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wide">In Stock</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wide">Min Level</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wide">Shortage</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wide">Action</th>
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
              : paged.length === 0
              ? (
                  <tr><td colSpan={5} className="px-4 py-14 text-center text-sm text-emerald-600 font-medium">
                    All items above minimum levels
                  </td></tr>
                )
              : paged.map((item: any) => {
                  const gap = getDeficit(item);
                  return (
                    <tr
                      key={item.productId ?? item.id}
                      onClick={() => navigate(`/products/${item.productId ?? item.id}`)}
                      className="hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{item.productName ?? item.name}</p>
                        {item.manufacturer && <p className="text-xs text-slate-400">{item.manufacturer}</p>}
                      </td>
                      <td className="px-4 py-3 text-right text-red-600 font-semibold">{item.currentStock ?? 0}</td>
                      <td className="px-4 py-3 text-right text-slate-500">{item.minStockLevel ?? 0}</td>
                      <td className="px-4 py-3 text-right font-bold text-red-700">{gap}</td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="sm" leftIcon={<ShoppingCart size={14} />}
                          onClick={e => handleProcure(item, e)}>
                          Procure
                        </Button>
                      </td>
                    </tr>
                  );
                })
            }
          </tbody>
        </table>
        <Pagination page={page} total={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
      </div>
    </div>
  );
};

export default RequiredStockPage;
