import { useState } from 'react';
import { ArrowLeft, Download, TrendingUp, User } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useReportsHubLink } from '../../hooks/useReportsHubLink';
import { useSalesReport } from '../../hooks/useReports';
import Button from '../common/Button';
import Card from '../common/Card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatCurrency, formatDate } from '../../lib/formatters';
import { getTotal } from '../../lib/fields';
import { downloadCSV } from '../../lib/exportUtils';

const PAGE_SIZE = 20;

const SalesReport = () => {
  const reportsLink = useReportsHubLink();
  const today = new Date().toISOString().split('T')[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000).toISOString().split('T')[0];
  const [from, setFrom] = useState(thirtyDaysAgo);
  const [to, setTo] = useState(today);
  const [page, setPage] = useState(1);

  const { data, isLoading } = useSalesReport(from, to, page, PAGE_SIZE);

  const totalRevenue = data?.summary?.total ?? data?.totalRevenue ?? 0;
  const totalOrders = data?.summary?.orders ?? data?.totalOrders ?? 0;
  const avgOrder = data?.summary?.avgOrderValue ?? (totalOrders > 0 ? totalRevenue / totalOrders : 0);
  const chartData = (data?.dailySales ?? data?.monthlySales ?? []).map((d: { date?: string; total?: number; amount?: number }) => ({
    date: d.date,
    amount: d.total ?? d.amount ?? 0,
  }));
  const topPharmacies: Record<string, unknown>[] = data?.topPharmacies ?? [];
  const orders: Record<string, unknown>[] = data?.orders ?? [];
  const totalPages = Math.ceil((data?.ordersPagination?.total ?? totalOrders) / PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center space-x-4">
          <Link to={reportsLink} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Sales Report</h1>
            <p className="text-sm text-gray-500">Revenue analysis for selected period</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500" />
          <span className="text-gray-400 text-sm">to</span>
          <input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500" />
          <Button variant="secondary" leftIcon={<Download size={16} />} onClick={() => downloadCSV(orders.length > 0 ? orders : chartData, `sales_report_${from}_${to}`)}>Export CSV</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card padding="sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Total Sales</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{isLoading ? '—' : formatCurrency(totalRevenue)}</p>
          <p className="text-xs text-green-600 mt-2 flex items-center font-medium">
            <TrendingUp size={12} className="mr-1" /> Selected period
          </p>
        </Card>
        <Card padding="sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Avg Order Value</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{isLoading ? '—' : formatCurrency(avgOrder)}</p>
        </Card>
        <Card padding="sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Total Orders</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{isLoading ? '—' : totalOrders}</p>
        </Card>
        <Card padding="sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Top Pharmacy</p>
          <p className="text-lg font-bold text-gray-900 mt-1 truncate">{String(topPharmacies[0]?.name ?? '—')}</p>
          <p className="text-xs text-gray-500 mt-1">{topPharmacies[0] ? formatCurrency(Number(topPharmacies[0].revenue ?? 0)) : ''}</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card title="Sales Trend" className="lg:col-span-2">
          {isLoading ? (
            <p className="text-center text-gray-400 py-12">Loading…</p>
          ) : chartData.length > 0 ? (
            <div className="h-[300px] w-full pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#9ca3af' }}
                    tickFormatter={v => v?.slice(5) ?? v} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9ca3af' }}
                    tickFormatter={v => `₹${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
                  <Tooltip cursor={{ fill: '#f3f4f6' }}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    formatter={(v: number) => [formatCurrency(v), 'Sales']} />
                  <Bar dataKey="amount" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={24} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-center text-gray-400 py-12">No data for selected period.</p>
          )}
        </Card>

        <Card title="Top Pharmacies">
          {isLoading ? (
            <p className="text-center text-gray-400 py-8">Loading…</p>
          ) : (
            <div className="space-y-4">
              {topPharmacies.slice(0, 5).map((p, i) => (
                <div key={i} className="flex items-center justify-between border-b border-gray-50 pb-3 last:border-0 last:pb-0">
                  <div className="flex items-center">
                    <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center text-gray-600 mr-3">
                      <User size={16} />
                    </div>
                    <span className="text-sm font-medium text-gray-900 truncate max-w-[120px]">{String(p.name ?? '')}</span>
                  </div>
                  <span className="text-sm font-bold text-gray-900">{formatCurrency(Number(p.revenue ?? 0))}</span>
                </div>
              ))}
              {topPharmacies.length === 0 && <p className="text-center text-gray-400 py-4 text-sm">No data.</p>}
            </div>
          )}
        </Card>
      </div>

      {(orders.length > 0 || totalOrders > 0) && (
        <Card title="Detailed Sales Data">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 font-semibold text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-3 font-semibold text-gray-500 uppercase">Order #</th>
                  <th className="px-4 py-3 font-semibold text-gray-500 uppercase">Pharmacy</th>
                  <th className="px-4 py-3 font-semibold text-gray-500 uppercase text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orders.map((order) => (
                  <tr key={String(order.id)} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 text-gray-600">{formatDate(String(order.orderDate ?? order.date ?? ''))}</td>
                    <td className="px-4 py-3 font-medium text-blue-600">{String(order.orderNumber ?? order.id)}</td>
                    <td className="px-4 py-3 text-gray-900">{String(order.pharmacyName ?? '')}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatCurrency(getTotal(order as Parameters<typeof getTotal>[0]))}</td>
                  </tr>
                ))}
                {!isLoading && orders.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No orders in this period.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
              <p className="text-sm text-gray-500">Page {page} of {totalPages} ({totalOrders} orders)</p>
              <div className="flex gap-2">
                <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                <Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
};

export default SalesReport;
