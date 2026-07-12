import { ArrowLeft, Download } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useStockAgingReport } from '../../hooks/useReports';
import { useReportsHubLink } from '../../hooks/useReportsHubLink';
import Button from '../common/Button';
import Card from '../common/Card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatCurrency, formatDate } from '../../lib/formatters';
import { downloadCSV } from '../../lib/exportUtils';

const StockAgingReport = () => {
  const reportsLink = useReportsHubLink();
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split('T')[0]);
  const { data, isLoading } = useStockAgingReport(asOfDate);

  const buckets: { name: string; quantity: number }[] = data?.buckets ?? [];
  const agedItems: Record<string, unknown>[] = data?.items ?? (Array.isArray(data) ? data : []);

  const chartData = buckets.length > 0
    ? buckets.map(b => ({ name: b.name, stock: b.quantity }))
    : [
        { name: '0-30 Days', stock: 0 },
        { name: '31-60 Days', stock: 0 },
        { name: '61-90 Days', stock: 0 },
        { name: '> 90 Days', stock: 0 },
      ];

  const slowMovers = agedItems.filter(i => Number(i.ageDays ?? i.daysHeld ?? 0) > 90);
  const displayItems = slowMovers.length > 0 ? slowMovers : agedItems;

  const handleExport = () => {
    downloadCSV(agedItems.map(i => ({
      product: i.productName ?? i.name,
      batch: i.batchNumber ?? i.batch,
      expiryDate: i.expiryDate,
      qty: i.qtyOnHand ?? i.quantity ?? i.stock,
      ageDays: i.ageDays ?? i.daysHeld,
      value: i.value ?? (Number(i.qtyOnHand ?? 0) * Number(i.purchaseRate ?? 0)),
    })), 'stock_aging_report');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link to={reportsLink} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Stock Ageing Report</h1>
            <p className="text-sm text-gray-500">Monitor inventory hold periods and non-moving items</p>
          </div>
        </div>
        <Button variant="secondary" leftIcon={<Download size={16} />} onClick={handleExport}>Export CSV</Button>
        <input type="date" value={asOfDate} onChange={e => setAsOfDate(e.target.value)}
          className="h-9 px-3 text-sm border border-gray-200 rounded-lg" title="As-of date" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Inventory Age Distribution">
          {isLoading ? (
            <p className="text-center text-gray-400 py-12">Loading…</p>
          ) : (
            <div className="h-[300px] w-full pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9ca3af' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9ca3af' }} />
                  <Tooltip cursor={{ fill: '#f3f4f6' }}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Bar dataKey="stock" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card title="Aged / Slow-Moving Batches (> 90 Days)">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 font-semibold text-gray-500 uppercase">Product</th>
                  <th className="px-4 py-3 font-semibold text-gray-500 uppercase">Batch</th>
                  <th className="px-4 py-3 font-semibold text-gray-500 uppercase">Expiry</th>
                  <th className="px-4 py-3 font-semibold text-gray-500 uppercase text-right">Qty</th>
                  <th className="px-4 py-3 font-semibold text-gray-500 uppercase text-right">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
                ) : displayItems.slice(0, 10).map((item, i) => (
                  <tr key={String(item.batchId ?? item.id ?? i)} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{String(item.productName ?? item.name ?? '')}</td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{String(item.batchNumber ?? item.batch ?? '—')}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{formatDate(String(item.expiryDate ?? ''))}</td>
                    <td className="px-4 py-3 text-right font-semibold">{Number(item.qtyOnHand ?? item.quantity ?? item.stock ?? 0)} units</td>
                    <td className="px-4 py-3 text-right text-gray-900 font-bold">{formatCurrency(Number(item.value ?? (Number(item.qtyOnHand ?? 0) * Number(item.purchaseRate ?? 0))))}</td>
                  </tr>
                ))}
                {!isLoading && displayItems.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">No aged inventory found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default StockAgingReport;
