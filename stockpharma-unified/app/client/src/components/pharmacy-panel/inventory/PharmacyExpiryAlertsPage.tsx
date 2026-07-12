import React from 'react';
import { useStockAgingReport } from '../../../hooks/useReports';
import PageHeader from '../../common/PageHeader';
import { formatDate } from '../../../lib/formatters';
import { daysUntilExpiry, expiryTierClass } from '../../../lib/expiry';

const PharmacyExpiryAlertsPage = () => {
  const { data, isLoading } = useStockAgingReport();
  const agedItems: Record<string, unknown>[] = data?.items ?? [];

  const expiringBatches = agedItems
    .map((item: any) => ({
      productName: item.productName,
      batchNumber: item.batchNumber,
      expiryDate: item.expiryDate,
      qty: item.qtyOnHand,
      days: daysUntilExpiry(item.expiryDate),
    }))
    .filter((b: any) => b.days !== null && b.days <= 90)
    .sort((a: any, b: any) => (a.days ?? 0) - (b.days ?? 0));

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <PageHeader breadcrumbs={[{ label: 'Expiry Alerts' }]} showBack={false} />
      <div className="bg-white rounded-xl border border-slate-100 overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="px-4 py-3 text-left text-xs text-slate-400 uppercase">Product</th>
              <th className="px-4 py-3 text-left text-xs text-slate-400 uppercase">Batch</th>
              <th className="px-4 py-3 text-left text-xs text-slate-400 uppercase">Expiry</th>
              <th className="px-4 py-3 text-right text-xs text-slate-400 uppercase">Days Left</th>
              <th className="px-4 py-3 text-right text-xs text-slate-400 uppercase">Qty</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {isLoading ? (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-400">Loading…</td></tr>
            ) : expiringBatches.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-emerald-600">No expiring stock in next 90 days</td></tr>
            ) : expiringBatches.map((b: any, i: number) => (
              <tr key={i}>
                <td className="px-4 py-3 font-medium">{b.productName}</td>
                <td className="px-4 py-3">{b.batchNumber}</td>
                <td className="px-4 py-3">{formatDate(b.expiryDate)}</td>
                <td className={`px-4 py-3 text-right font-medium ${expiryTierClass(b.days <= 0 ? 'expired' : b.days <= 30 ? 'critical' : 'warning')}`}>{b.days}d</td>
                <td className="px-4 py-3 text-right">{b.qty}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PharmacyExpiryAlertsPage;
