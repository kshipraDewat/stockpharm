import { ArrowLeft, Download, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useOutstandingReport } from '../../hooks/useReports';
import { useReportsHubLink } from '../../hooks/useReportsHubLink';
import Button from '../common/Button';
import Card from '../common/Card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatCurrency, formatDate } from '../../lib/formatters';
import { downloadCSV } from '../../lib/exportUtils';

const agingToChart = (aging: Record<string, number> | undefined) => {
  if (!aging || typeof aging !== 'object' || Array.isArray(aging)) return [];
  return [
    { name: 'Current', amount: aging.current ?? 0 },
    { name: '1-30d', amount: aging.overdue30 ?? 0 },
    { name: '31-60d', amount: aging.overdue60 ?? 0 },
    { name: '61-90d', amount: aging.overdue90 ?? 0 },
    { name: '> 90d', amount: aging.overdue90plus ?? 0 },
  ];
};

const OutstandingReport = () => {
  const reportsLink = useReportsHubLink();
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split('T')[0]);
  const { data, isLoading } = useOutstandingReport(asOfDate);

  const isPharmacyPayables = !!(data?.byStockist || data?.buckets?.days30 !== undefined);
  const totalOutstanding = data?.totalOutstanding ?? 0;
  const overdueAmount = isPharmacyPayables
    ? (data?.buckets?.days30 ?? 0) + (data?.buckets?.days60 ?? 0) + (data?.buckets?.days90 ?? 0) + (data?.buckets?.over90 ?? 0)
    : (data?.overdueAmount ?? 0);
  const avgDays = data?.avgCollectionDays ?? 0;
  const topDefaulters: Record<string, unknown>[] = isPharmacyPayables
    ? (data?.byStockist ?? []).map((s: { stockistName: string; outstanding: number }) => ({ name: s.stockistName, outstanding: s.outstanding }))
    : (data?.topDefaulters ?? []);
  const bills: Record<string, unknown>[] = data?.bills ?? [];

  const chartData = isPharmacyPayables && data?.buckets ? [
    { name: 'Current', amount: data.buckets.current ?? 0 },
    { name: '1-30d', amount: data.buckets.days30 ?? 0 },
    { name: '31-60d', amount: data.buckets.days60 ?? 0 },
    { name: '61-90d', amount: data.buckets.days90 ?? 0 },
    { name: '> 90d', amount: data.buckets.over90 ?? 0 },
  ] : agingToChart(data?.aging);

  const handleExport = () => {
    const exportRows = topDefaulters.length > 0
      ? topDefaulters.map(p => ({
          pharmacy: p.name,
          outstanding: p.outstanding,
          oldestDueDays: p.oldestDueDays,
        }))
      : bills.map(b => ({
          billNumber: b.billNumber,
          pharmacy: b.pharmacyName,
          outstanding: b.outstanding,
          dueDate: b.dueDate,
          ageDays: b.ageDays,
        }));
    downloadCSV(exportRows, 'outstanding_report');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link to={reportsLink} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{isPharmacyPayables ? 'Payables Aging' : 'Outstanding Payments'}</h1>
            <p className="text-sm text-gray-500">{isPharmacyPayables ? 'Accounts payable aging by stockist' : 'Track unpaid bills and aging credit balances'}</p>
          </div>
        </div>
        <Button variant="secondary" leftIcon={<Download size={16} />} onClick={handleExport}>Export CSV</Button>
        <input type="date" value={asOfDate} onChange={e => setAsOfDate(e.target.value)}
          className="h-9 px-3 text-sm border border-gray-200 rounded-lg" title="As-of date" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card padding="sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Total Outstanding</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{isLoading ? '—' : formatCurrency(totalOutstanding)}</p>
        </Card>
        <Card padding="sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Overdue (&gt;60 Days)</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{isLoading ? '—' : formatCurrency(overdueAmount)}</p>
        </Card>
        <Card padding="sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Avg Collection Period</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{isLoading ? '—' : `${Math.round(avgDays)} Days`}</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Aging Distribution">
          <div className="h-[300px] w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9ca3af' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9ca3af' }}
                  tickFormatter={v => `₹${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
                <Tooltip cursor={{ fill: '#f3f4f6' }}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  formatter={(v: number) => [formatCurrency(v), 'Outstanding']} />
                <Bar dataKey="amount" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Top Defaulters">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 font-semibold text-gray-500 uppercase">Pharmacy</th>
                  <th className="px-4 py-3 font-semibold text-gray-500 uppercase text-right">Amount</th>
                  <th className="px-4 py-3 font-semibold text-gray-500 uppercase text-right">Oldest Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading ? (
                  <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
                ) : topDefaulters.map((p) => (
                  <tr key={String(p.pharmacyId ?? p.name)} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{String(p.name ?? '')}</td>
                    <td className="px-4 py-3 text-right font-bold text-red-600">{formatCurrency(Number(p.outstanding ?? 0))}</td>
                    <td className="px-4 py-3 text-right text-gray-500 text-xs">{Number(p.oldestDueDays ?? 0) > 0 ? `${p.oldestDueDays}d overdue` : 'Current'}</td>
                  </tr>
                ))}
                {!isLoading && topDefaulters.length === 0 && (
                  <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-500">
                    <AlertCircle className="w-8 h-8 mx-auto text-gray-300 mb-2" />
                    No outstanding amounts.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {bills.length > 0 && (
        <Card title="Outstanding Bills">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 font-semibold text-gray-500 uppercase">Bill #</th>
                  <th className="px-4 py-3 font-semibold text-gray-500 uppercase">Pharmacy</th>
                  <th className="px-4 py-3 font-semibold text-gray-500 uppercase text-right">Outstanding</th>
                  <th className="px-4 py-3 font-semibold text-gray-500 uppercase text-right">Due Date</th>
                  <th className="px-4 py-3 font-semibold text-gray-500 uppercase text-right">Age (days)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {bills.map((b) => (
                  <tr key={String(b.billId ?? b.billNumber)} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-blue-600">{String(b.billNumber ?? '')}</td>
                    <td className="px-4 py-3 text-gray-900">{String(b.pharmacyName ?? '')}</td>
                    <td className="px-4 py-3 text-right font-bold text-red-600">{formatCurrency(Number(b.outstanding ?? 0))}</td>
                    <td className="px-4 py-3 text-right text-gray-500 text-xs">{formatDate(String(b.dueDate ?? ''))}</td>
                    <td className="px-4 py-3 text-right text-gray-500 text-xs">{String(b.ageDays ?? '—')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};

export default OutstandingReport;
