import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePurchaseOrder, usePurchaseOrders } from '../../../hooks/usePurchaseOrders';
import { useGrns } from '../../../hooks/useGrn';
import { useDebounce } from '../../../hooks/useDebounce';
import PageHeader from '../../common/PageHeader';
import Button from '../../common/Button';
import Pagination from '../../common/Pagination';
import QueryError from '../../common/QueryError';
import { formatDate } from '../../../lib/formatters';
import ReceiveGrnModal from './ReceiveGrnModal';

const GrnListPage = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [page, setPage] = useState(1);
  const [showReceive, setShowReceive] = useState(false);
  const [selectedPoId, setSelectedPoId] = useState<string | null>(null);
  const [selectedReceivePo, setSelectedReceivePo] = useState('');
  const pageSize = 20;

  const { data, isLoading, isError, refetch } = useGrns({ search: debouncedSearch, page, pageSize });
  const { data: deliveredData } = usePurchaseOrders({ status: 'delivered', pageSize: 500 });
  const { data: partialData } = usePurchaseOrders({ status: 'partially_received', pageSize: 500 });
  const { data: selectedPo } = usePurchaseOrder(selectedPoId ?? '');

  const grns = data?.data ?? [];
  const total = data?.total ?? 0;
  const receivablePos = [...(deliveredData?.data ?? []), ...(partialData?.data ?? [])];

  const openReceive = (poId: string) => {
    setSelectedPoId(poId);
    setShowReceive(true);
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <PageHeader
        breadcrumbs={[{ label: 'Inbound GRN' }]}
        showBack={false}
        actions={
          receivablePos.length > 0 ? (
            <select
              className="h-9 px-3 text-sm border border-slate-200 rounded-lg"
              value={selectedReceivePo}
              onChange={e => {
                const poId = e.target.value;
                setSelectedReceivePo(poId);
                if (poId) openReceive(poId);
              }}
            >
              <option value="">Receive GRN for PO…</option>
              {receivablePos.map((po: any) => (
                <option key={po.id} value={po.id}>{po.poNumber} — {po.stockistName}</option>
              ))}
            </select>
          ) : undefined
        }
      />

      {receivablePos.length > 0 && (
        <div className="bg-amber-50 border border-amber-100 rounded-lg px-4 py-3 text-sm text-amber-800">
          {receivablePos.length} order(s) awaiting GRN receipt.
        </div>
      )}

      {isError ? (
        <QueryError onRetry={() => refetch()} />
      ) : (
      <>
      <div className="hidden md:block bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-50">
          <input
            type="text"
            placeholder="Search GRN#..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="h-9 px-3 text-sm border border-slate-200 rounded-lg w-48"
          />
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="px-4 py-3 text-left text-xs text-slate-400 uppercase">GRN #</th>
              <th className="px-4 py-3 text-left text-xs text-slate-400 uppercase">PO #</th>
              <th className="px-4 py-3 text-left text-xs text-slate-400 uppercase">Date</th>
              <th className="px-4 py-3 text-left text-xs text-slate-400 uppercase">Stockist</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {isLoading ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>
            ) : grns.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-14 text-center text-slate-400">No GRN records yet.</td></tr>
            ) : grns.map((g: any) => (
              <tr key={g.id} onClick={() => navigate(`/pharmacy/grn/${g.id}`)} className="hover:bg-slate-50 cursor-pointer">
                <td className="px-4 py-3 font-medium text-teal-600">{g.grnNumber ?? g.id?.slice(0, 8)}</td>
                <td className="px-4 py-3">{g.poNumber ?? '—'}</td>
                <td className="px-4 py-3">{formatDate(g.receivedDate ?? g.createdAt)}</td>
                <td className="px-4 py-3">{g.stockistName ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination page={page} total={total} pageSize={pageSize} onPageChange={setPage} />
      </div>

      <div className="md:hidden space-y-2">
        <input
          type="text"
          placeholder="Search GRN#..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="h-9 px-3 text-sm border border-slate-200 rounded-lg w-full bg-white"
        />
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-100 p-4 animate-pulse">
              <div className="h-4 bg-slate-200 rounded w-2/3 mb-2" />
              <div className="h-3 bg-slate-100 rounded w-1/2" />
            </div>
          ))
        ) : grns.length === 0 ? (
          <p className="text-center text-sm text-slate-400 py-10">No GRN records yet.</p>
        ) : grns.map((g: any) => (
          <button
            key={g.id}
            type="button"
            onClick={() => navigate(`/pharmacy/grn/${g.id}`)}
            className="w-full text-left bg-white rounded-xl border border-slate-100 shadow-sm p-4 hover:bg-slate-50"
          >
            <p className="font-semibold text-teal-600">{g.grnNumber}</p>
            <p className="text-sm text-slate-600">{g.stockistName ?? '—'} · {g.poNumber ?? '—'}</p>
            <p className="text-xs text-slate-400 mt-1">{formatDate(g.receivedDate ?? g.createdAt)}</p>
          </button>
        ))}
        <Pagination page={page} total={total} pageSize={pageSize} onPageChange={setPage} />
      </div>
      </>
      )}

      {selectedPo && showReceive && (
        <ReceiveGrnModal
          isOpen={showReceive}
          onClose={() => { setShowReceive(false); setSelectedPoId(null); setSelectedReceivePo(''); }}
          purchaseOrder={selectedPo}
          onSuccess={() => navigate('/pharmacy/grn')}
        />
      )}
    </div>
  );
};

export default GrnListPage;
