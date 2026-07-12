import { useState } from 'react';
import { ArrowLeft, Download } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useProfitReport } from '../../hooks/useReports';
import { useReportsHubLink } from '../../hooks/useReportsHubLink';
import Button from '../common/Button';
import Card from '../common/Card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatCurrency } from '../../lib/formatters';
import { downloadCSV } from '../../lib/exportUtils';

const ProfitReport = () => {
  const reportsLink = useReportsHubLink();
  const today = new Date().toISOString().split('T')[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000).toISOString().split('T')[0];
  const [from, setFrom] = useState(thirtyDaysAgo);
  const [to, setTo] = useState(today);

  const { data, isLoading } = useProfitReport(from, to);

  const totalRevenue = data?.totalRevenue ?? data?.summary?.revenue ?? data?.summary?.total ?? 0;
  const totalProfit = data?.totalProfit ?? data?.summary?.profit ?? data?.grossProfit ?? 0;
  const totalMargin = data?.profitMargin ?? data?.summary?.margin ?? (totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0);
  const categories: Record<string, unknown>[] = data?.categoryBreakdown ?? data?.byCategory ?? data?.items ?? [];
  const chartData = (data?.dailySales ?? []).map((d: { date?: string; profit?: number }) => ({
    name: d.date?.slice(5) ?? '',
    profit: d.profit ?? 0,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center space-x-4">
          <Link to={reportsLink} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Profit Analysis</h1>
            <p className="text-sm text-gray-500">Gross profit and margin tracking</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500" />
          <span className="text-gray-400 text-sm">to</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500" />
          <Button variant="secondary" leftIcon={<Download size={16} />} onClick={() => downloadCSV(categories.length > 0 ? categories : (data ? [data] : []), `profit_report_${from}_${to}`)}>Export CSV</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card padding="sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Total Revenue</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{isLoading ? '—' : formatCurrency(totalRevenue)}</p>
        </Card>
        <Card padding="sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Gross Profit</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{isLoading ? '—' : formatCurrency(totalProfit)}</p>
        </Card>
        <Card padding="sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Avg Margin %</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{isLoading ? '—' : `${Number(totalMargin).toFixed(1)}%`}</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Profit Trend">
          {isLoading ? (
            <p className="text-center text-gray-400 py-12">Loading…</p>
          ) : chartData.length > 0 ? (
            <div className="h-[300px] w-full pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9ca3af' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9ca3af' }}
                    tickFormatter={v => `₹${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
                  <Tooltip cursor={{ fill: '#f3f4f6' }}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    formatter={(v: number) => [formatCurrency(v), 'Profit']} />
                  <Line type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-center text-gray-400 py-12">No data for selected period.</p>
          )}
        </Card>

        <Card title="Profit by Category">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 font-semibold text-gray-500 uppercase">Category</th>
                  <th className="px-4 py-3 font-semibold text-gray-500 uppercase text-right">Revenue</th>
                  <th className="px-4 py-3 font-semibold text-gray-500 uppercase text-right">Profit</th>
                  <th className="px-4 py-3 font-semibold text-gray-500 uppercase text-right">Margin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
                ) : categories.length > 0 ? categories.map((item, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{String(item.category ?? item.cat ?? '')}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(Number(item.revenue ?? item.rev ?? 0))}</td>
                    <td className="px-4 py-3 text-right text-green-600 font-semibold">{formatCurrency(Number(item.profit ?? 0))}</td>
                    <td className="px-4 py-3 text-right text-gray-900 font-bold">{Number(item.margin ?? 0).toFixed(1)}%</td>
                  </tr>
                )) : (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No category data available.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default ProfitReport;
