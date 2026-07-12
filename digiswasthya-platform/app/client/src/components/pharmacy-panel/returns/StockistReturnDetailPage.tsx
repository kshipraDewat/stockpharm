import React from 'react';
import { useParams } from 'react-router-dom';
import { useStockistReturn } from '../../../hooks/useStockistReturns';
import PageHeader from '../../common/PageHeader';
import { statusBadge } from '../../common/Badge';
import { formatCurrency, formatDate } from '../../../lib/formatters';

const STEPS = ['requested', 'processed'] as const;

function getStepperState(status: string) {
  if (status === 'rejected') {
    return { activeIdx: STEPS.indexOf('requested'), terminal: 'rejected' as const };
  }
  const idx = STEPS.indexOf(status as typeof STEPS[number]);
  return { activeIdx: idx >= 0 ? idx : 0, terminal: null };
}

const StockistReturnDetailPage = () => {
  const { id = '' } = useParams();
  const { data: ret, isLoading } = useStockistReturn(id);

  if (isLoading) return <div className="p-8 text-center text-slate-400">Loading…</div>;
  if (!ret) return <div className="p-8 text-center text-slate-500">Return not found.</div>;

  const { activeIdx, terminal } = getStepperState(ret.status);

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <PageHeader breadcrumbs={[{ label: 'Returns', link: '/pharmacy/returns' }, { label: ret.returnNumber }]} />

      {ret.status === 'rejected' && ret.rejectionReason && (
        <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-3 text-sm text-red-700">
          Rejected by stockist: {ret.rejectionReason}
        </div>
      )}

      <div className="flex gap-1 overflow-x-auto">
        {STEPS.map((s, i) => {
          const isActive = terminal ? i <= activeIdx : i <= activeIdx;
          return (
            <div
              key={s}
              className={`flex-1 min-w-[70px] text-center py-2 rounded-lg text-[11px] font-medium capitalize ${
                isActive ? 'bg-teal-50 text-teal-700' : 'bg-slate-50 text-slate-400'
              }`}
            >
              {s}
            </div>
          );
        })}
        {terminal === 'rejected' && (
          <div className="flex-1 min-w-[70px] text-center py-2 rounded-lg text-[11px] font-medium bg-red-50 text-red-700">
            Rejected
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-100 p-5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        <div><span className="text-slate-400">Status</span><div className="mt-1">{statusBadge(ret.status)}</div></div>
        <div><span className="text-slate-400">Date</span><p className="mt-1 font-medium">{formatDate(ret.returnDate)}</p></div>
        <div><span className="text-slate-400">Reason</span><p className="mt-1 font-medium capitalize">{ret.reason}</p></div>
        <div><span className="text-slate-400">Total</span><p className="mt-1 font-semibold">{formatCurrency(ret.totalAmount)}</p></div>
      </div>
      <div className="bg-white rounded-xl border border-slate-100 overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="px-4 py-3 text-left text-xs text-slate-400 uppercase">Product</th>
              <th className="px-4 py-3 text-right text-xs text-slate-400 uppercase">Qty</th>
              <th className="px-4 py-3 text-right text-xs text-slate-400 uppercase">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {(ret.items ?? []).map((item: any) => (
              <tr key={item.id}>
                <td className="px-4 py-3">{item.productName ?? item.productId}</td>
                <td className="px-4 py-3 text-right">{item.qty}</td>
                <td className="px-4 py-3 text-right font-medium">{formatCurrency(item.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default StockistReturnDetailPage;
