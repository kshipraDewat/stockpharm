import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { panelPath, usePanelBasePath } from '../../hooks/usePanelBasePath';
import { Plus, Pencil } from 'lucide-react';
import { useSuppliers } from '../../hooks/useSuppliers';
import { useDebounce } from '../../hooks/useDebounce';
import PageHeader from '../common/PageHeader';
import Button from '../common/Button';
import Pagination from '../common/Pagination';
import { statusBadge } from '../common/Badge';
import AddSupplierModal from './AddSupplierModal';
import EditSupplierModal from './EditSupplierModal';
import { formatCurrency } from '../../lib/formatters';

const SupplierListPage = () => {
  const navigate = useNavigate();
  const base = usePanelBasePath();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [editSupplier, setEditSupplier] = useState<any | null>(null);
  const pageSize = 20;

  const { data, isLoading } = useSuppliers({ search: debouncedSearch, status, page, pageSize });
  const suppliers = data?.data ?? data ?? [];
  const total = data?.total ?? suppliers.length;

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <PageHeader
        breadcrumbs={[{ label: 'Suppliers' }]}
        showBack={false}
        actions={
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="px-3 h-9 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 w-40"
            />
            <select
              value={status}
              onChange={e => setStatus(e.target.value)}
              className="h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-600"
            >
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <Button variant="primary" leftIcon={<Plus />} onClick={() => setAddOpen(true)}>Add Supplier</Button>
          </div>
        }
      />

      <div className="hidden md:block bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">Supplier</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">Contact</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">State</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">Status</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wide">Balance Due</th>
              <th className="px-4 py-3 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: 5 }).map((__, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-200 rounded" /></td>
                    ))}
                  </tr>
                ))
              : suppliers.length === 0
              ? <tr><td colSpan={6} className="px-4 py-14 text-center text-sm text-slate-400">No suppliers found.</td></tr>
              : suppliers.map((s: any) => (
                  <tr key={s.id} onClick={() => navigate(panelPath(base, `/suppliers/${s.id}`))} className="hover:bg-slate-50 cursor-pointer transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{s.name}</p>
                      <p className="text-xs text-slate-400">{s.gstin || '—'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-slate-700">{s.contactPerson || '—'}</p>
                      <p className="text-xs text-slate-400">{s.phone || ''}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{s.stateCode || '—'}</td>
                    <td className="px-4 py-3">{statusBadge(s.status ?? 'inactive')}</td>
                    <td className="px-4 py-3 text-right font-semibold">
                      <span className={(s.outstandingBalance ?? 0) > 0 ? 'text-red-600' : 'text-slate-400'}>
                        {(s.outstandingBalance ?? 0) > 0 ? formatCurrency(s.outstandingBalance) : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-blue-600"
                        onClick={e => { e.stopPropagation(); setEditSupplier(s); }}
                        aria-label="Edit supplier"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    </td>
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
              </div>
            ))
          : suppliers.length === 0
          ? <p className="text-center text-sm text-slate-400 py-10">No suppliers found.</p>
          : suppliers.map((s: any) => (
              <button
                key={s.id}
                type="button"
                onClick={() => navigate(panelPath(base, `/suppliers/${s.id}`))}
                className="w-full text-left bg-white rounded-xl border border-slate-100 shadow-sm p-4 hover:bg-slate-50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">{s.name}</p>
                    <p className="text-xs text-slate-400">{s.phone ?? s.contactPerson}</p>
                  </div>
                  {statusBadge(s.status ?? 'inactive')}
                </div>
                {(s.outstandingBalance ?? 0) > 0 && (
                  <p className="mt-2 text-xs font-semibold text-red-600 text-right">{formatCurrency(s.outstandingBalance)}</p>
                )}
              </button>
            ))
        }
        <Pagination page={page} total={total} pageSize={pageSize} onPageChange={setPage} />
      </div>

      <AddSupplierModal isOpen={addOpen} onClose={() => setAddOpen(false)} />
      <EditSupplierModal
        isOpen={editSupplier !== null}
        onClose={() => setEditSupplier(null)}
        supplier={editSupplier}
      />
    </div>
  );
};

export default SupplierListPage;
