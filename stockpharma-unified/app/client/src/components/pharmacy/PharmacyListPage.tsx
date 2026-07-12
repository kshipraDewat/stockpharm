import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus } from 'lucide-react';
import { usePharmacies } from '../../hooks/usePharmacies';
import PageHeader from '../common/PageHeader';
import Button from '../common/Button';
import { statusBadge } from '../common/Badge';
import Pagination from '../common/Pagination';
import AddPharmacyModal from './AddPharmacyModal';
import { formatCurrency } from '../../lib/formatters';
import { getOutstanding } from '../../lib/fields';

const portalBadge = (connected?: boolean) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
    connected ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
  }`}>
    {connected ? 'Connected' : 'Manual'}
  </span>
);

const PharmacyListPage = () => {
  const navigate = useNavigate();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [portalConnected, setPortalConnected] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data, isLoading } = usePharmacies({ search, status, portalConnected: portalConnected || undefined, page, pageSize });
  const pharmacies = data?.data ?? data ?? [];
  const total = data?.total ?? pharmacies.length;

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <PageHeader
        breadcrumbs={[{ label: 'Pharmacies' }]}
        showBack={false}
        actions={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                className="pl-8 pr-3 h-9 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 w-48"
              />
            </div>
            <select
              value={portalConnected}
              onChange={e => { setPortalConnected(e.target.value); setPage(1); }}
              className="h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-600"
            >
              <option value="">All Portal</option>
              <option value="true">Connected</option>
              <option value="false">Manual</option>
            </select>
            <select
              value={status}
              onChange={e => { setStatus(e.target.value); setPage(1); }}
              className="h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-600"
            >
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="blocked">Blocked</option>
            </select>
            <Button variant="primary" leftIcon={<Plus />} onClick={() => setIsModalOpen(true)}>
              Add Pharmacy
            </Button>
          </div>
        }
      />

      {/* Desktop table */}
      <div className="hidden md:block bg-white rounded-xl border border-slate-100 shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">Pharmacy</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">Contact</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wide">Outstanding</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">Portal</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {isLoading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-4 py-3"><div className="h-4 bg-slate-200 rounded w-36 mb-1.5" /><div className="h-3 bg-slate-100 rounded w-48" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-slate-200 rounded w-24 mb-1.5" /><div className="h-3 bg-slate-100 rounded w-20" /></td>
                    <td className="px-4 py-3 text-right"><div className="h-4 bg-slate-200 rounded w-20 ml-auto" /></td>
                    <td className="px-4 py-3"><div className="h-5 bg-slate-100 rounded-full w-14" /></td>
                  </tr>
                ))
              : pharmacies.length === 0
              ? (
                  <tr><td colSpan={5} className="px-4 py-14 text-center text-sm text-slate-400">
                    {search ? 'No pharmacies match your search.' : 'No pharmacies added yet.'}
                  </td></tr>
                )
              : pharmacies.map((p: any) => (
                  <tr
                    key={p.id}
                    onClick={() => navigate(`/pharmacies/${p.id}`)}
                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{p.name}</p>
                      <p className="text-xs text-slate-400 mt-0.5 truncate max-w-60">{p.address ?? '—'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-slate-700">{p.contactPerson ?? '—'}</p>
                      <p className="text-xs text-slate-400">{p.phone ?? ''}</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-semibold ${getOutstanding(p) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {getOutstanding(p) > 0 ? formatCurrency(getOutstanding(p)) : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {portalBadge(p.portalConnected)}
                    </td>
                    <td className="px-4 py-3">
                      {statusBadge(p.status ?? 'active')}
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
                <div className="h-3 bg-slate-100 rounded w-1/2" />
              </div>
            ))
          : pharmacies.length === 0
          ? <p className="text-center text-sm text-slate-400 py-10">{search ? 'No pharmacies match your search.' : 'No pharmacies added yet.'}</p>
          : pharmacies.map((p: any) => (
              <button
                key={p.id}
                type="button"
                onClick={() => navigate(`/pharmacies/${p.id}`)}
                className="w-full text-left bg-white rounded-xl border border-slate-100 shadow-sm p-4 hover:bg-slate-50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">{p.name}</p>
                    <p className="text-xs text-slate-400">{p.phone ?? p.contactPerson}</p>
                  </div>
                  {statusBadge(p.status ?? 'active')}
                </div>
                <div className="mt-2 flex items-center justify-between text-xs">
                  {portalBadge(p.portalConnected)}
                  <span className={`font-semibold ${getOutstanding(p) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {formatCurrency(getOutstanding(p))}
                  </span>
                </div>
              </button>
            ))
        }
        <Pagination page={page} total={total} pageSize={pageSize} onPageChange={setPage} />
      </div>

      <AddPharmacyModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  );
};

export default PharmacyListPage;
