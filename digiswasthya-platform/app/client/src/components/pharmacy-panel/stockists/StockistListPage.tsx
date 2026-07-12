import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Plus, Compass } from 'lucide-react';
import toast from 'react-hot-toast';
import { usePharmacyConnections } from '../../../hooks/usePharmacyConnections';
import { useWithdrawStockistConnection } from '../../../hooks/usePublicStockists';
import { useDebounce } from '../../../hooks/useDebounce';
import { useAuthStore } from '../../../stores/authStore';
import PageHeader from '../../common/PageHeader';
import Button from '../../common/Button';
import { statusBadge } from '../../common/Badge';
import QueryError from '../../common/QueryError';
import EmptyState from '../../common/EmptyState';
import ConnectStockistModal from './ConnectStockistModal';
import { getConnectionStockistName, getConnectionStockistGstin } from '../../../lib/fields';

const StockistListPage = () => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const canConnect = ['admin', 'pharmacist'].includes(user?.role ?? '');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [showConnect, setShowConnect] = useState(false);
  const debouncedSearch = useDebounce(search, 300);

  const { data: connectionsData, isLoading, isError, refetch } = usePharmacyConnections(status || undefined);
  const connections = connectionsData?.data ?? [];
  const withdraw = useWithdrawStockistConnection();

  const filtered = connections.filter((c: { stockistName?: string; stockistGstin?: string; businessName?: string; gstin?: string }) => {
    if (!debouncedSearch) return true;
    const q = debouncedSearch.toLowerCase();
    const name = getConnectionStockistName(c);
    const gstin = getConnectionStockistGstin(c);
    return name.toLowerCase().includes(q) || gstin.toLowerCase().includes(q);
  });

  const handleWithdraw = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await withdraw.mutateAsync(id);
      toast.success('Request withdrawn');
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Failed to withdraw');
    }
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <PageHeader
        breadcrumbs={[{ label: 'Stockists' }]}
        showBack={false}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Link to="/pharmacy/discover">
              <Button variant="secondary" leftIcon={<Compass className="w-4 h-4" />}>Discover</Button>
            </Link>
            <input
              type="text"
              placeholder="Search name, GSTIN..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-3 h-9 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-teal-500 w-44"
            />
            <select
              value={status}
              onChange={e => setStatus(e.target.value)}
              className="h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white"
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="rejected">Rejected</option>
              <option value="withdrawn">Withdrawn</option>
              <option value="disconnected">Disconnected</option>
            </select>
            {canConnect && (
              <Button variant="primary" leftIcon={<Plus />} onClick={() => setShowConnect(true)} className="!bg-teal-600 hover:!bg-teal-700">
                Connect Stockist
              </Button>
            )}
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
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">GSTIN</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Credit Limit</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {Array.from({ length: 5 }).map((__, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-200 rounded" /></td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <EmptyState
                    title="No stockist connections"
                    description={canConnect
                      ? 'Browse Discover to find distributors or connect with an invite code'
                      : 'Ask your admin to connect a stockist so you can place purchase orders'}
                    actionLabel={canConnect ? 'Discover Stockists' : undefined}
                    onAction={canConnect ? () => navigate('/pharmacy/discover') : undefined}
                  />
                </td>
              </tr>
            ) : filtered.map((c: any) => (
              <tr key={c.id} onClick={() => navigate(`/pharmacy/stockists/${c.id}`)} className="hover:bg-slate-50 cursor-pointer">
                <td className="px-4 py-3 font-medium text-teal-600">{getConnectionStockistName(c)}</td>
                <td className="px-4 py-3 text-slate-600">{getConnectionStockistGstin(c)}</td>
                <td className="px-4 py-3">{statusBadge(c.status)}</td>
                <td className="px-4 py-3 text-slate-600">{c.creditLimit != null ? `₹${Number(c.creditLimit).toLocaleString('en-IN')}` : '—'}</td>
                <td className="px-4 py-3 text-right">
                  {canConnect && c.status === 'pending' && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={(e) => handleWithdraw(e, c.id)}
                      isLoading={withdraw.isPending}
                    >
                      Withdraw
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="md:hidden space-y-2">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-slate-100 p-4 animate-pulse">
                <div className="h-4 bg-slate-200 rounded w-2/3 mb-2" />
              </div>
            ))
          : filtered.length === 0
          ? <EmptyState
              title="No stockist connections"
              description={canConnect ? 'Browse Discover to find distributors' : 'Ask your admin to connect a stockist'}
              actionLabel={canConnect ? 'Discover Stockists' : undefined}
              onAction={canConnect ? () => navigate('/pharmacy/discover') : undefined}
            />
          : filtered.map((c: any) => (
              <button
                key={c.id}
                type="button"
                onClick={() => navigate(`/pharmacy/stockists/${c.id}`)}
                className="w-full text-left bg-white rounded-xl border border-slate-100 shadow-sm p-4 hover:bg-slate-50"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-teal-600">{getConnectionStockistName(c)}</p>
                  {statusBadge(c.status)}
                </div>
                <p className="text-xs text-slate-400 mt-1">{getConnectionStockistGstin(c)}</p>
              </button>
            ))
        }
      </div>
      </>
      )}

      <ConnectStockistModal isOpen={showConnect} onClose={() => setShowConnect(false)} />
    </div>
  );
};

export default StockistListPage;
