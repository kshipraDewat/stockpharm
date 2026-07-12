import { useState } from 'react';
import { ArrowLeft, Download, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSalesReport } from '../../../hooks/useReports';
import Button from '../../common/Button';
import Card from '../../common/Card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatCurrency, formatDate } from '../../../lib/formatters';
import { downloadCSV } from '../../../lib/exportUtils';

const PAGE_SIZE = 20;

const PharmacySalesReport = () => {
  const today = new Date().toISOString().split('T')[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000).toISOString().split('T')[0];
  const [from, setFrom] = useState(thirtyDaysAgo);
  const [to, setTo] = useState(today);
  const [page, setPage] = useState(1);

  const { data, isLoading } = useSalesReport(from, to, page, PAGE_SIZE);

  const totalRevenue = data?.summary?.total ?? 0;
  const totalOrders = data?.summary?.orders ?? 0;
  const avgOrder = data?.summary?.avgOrderValue ?? 0;
  const chartData = (data?.dailySales ?? []).map((d: { date?: string; total?: number }) => ({
    date: d.date,
    amount: Number(d.total ?? 0),
  }));
  const topProducts: Record<string, unknown>[] = data?.topProducts ?? [];
  const orders: Record<string, unknown>[] = data?.orders ?? [];
  const paymentMix: Record<string, unknown>[] = data?.paymentMix ?? [];
  const totalPages = Math.ceil((data?.ordersPagination?.total ?? totalOrders) / PAGE_SIZE);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center space-x-4">
          <Link to="/pharmacy/reports" className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Retail Sales Report</h1>
            <p className="text-sm text-gray-500">POS sales analysis for selected period</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }} className="px-3 py-2 border border-gray-300 rounded-md text-sm" />
          <span className="text-gray-400 text-sm">to</span>
          <input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1); }} className="px-3 py-2 border border-gray-300 rounded-md text-sm" />
          <Button variant="secondary" leftIcon={<Download size={16} />} onClick={() => downloadCSV(orders.length > 0 ? orders : chartData, `retail_sales_${from}_${to}`)}>Export CSV</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card padding="sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Total Sales</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{isLoading ? '—' : formatCurrency(totalRevenue)}</p>
          <p className="text-xs text-teal-600 mt-2 flex items-center font-medium"><TrendingUp size={12} className="mr-1" /> Selected period</p>
        </Card>
        <Card padding="sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Transactions</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{isLoading ? '—' : totalOrders}</p>
        </Card>
        <Card padding="sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Avg Ticket</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{isLoading ? '—' : formatCurrency(avgOrder)}</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Daily Sales">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Bar dataKey="amount" fill="#0d9488" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Payment Mix">
          <div className="space-y-2">
            {paymentMix.length === 0 ? <p className="text-sm text-gray-400">No data</p> : paymentMix.map((p: any) => (
              <div key={p.method} className="flex justify-between text-sm">
                <span className="capitalize text-gray-600">{p.method}</span>
                <span className="font-medium">{formatCurrency(Number(p.total ?? 0))} ({p.count})</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card title="Top Products">
        <table className="w-full text-sm">
          <thead><tr className="border-b"><th className="text-left py-2 text-gray-400">Product</th><th className="text-right py-2 text-gray-400">Qty</th><th className="text-right py-2 text-gray-400">Revenue</th></tr></thead>
          <tbody>
            {topProducts.map((p: any) => (
              <tr key={p.productId} className="border-b border-gray-50">
                <td className="py-2">{p.name}</td>
                <td className="py-2 text-right">{p.qty}</td>
                <td className="py-2 text-right font-medium">{formatCurrency(Number(p.revenue ?? 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Sales Transactions">
        <table className="w-full text-sm">
          <thead><tr className="border-b"><th className="text-left py-2 text-gray-400">Sale #</th><th className="text-left py-2 text-gray-400">Date</th><th className="text-left py-2 text-gray-400">Payment</th><th className="text-right py-2 text-gray-400">Total</th></tr></thead>
          <tbody>
            {orders.map((o: any) => (
              <tr key={o.id} className="border-b border-gray-50">
                <td className="py-2">{o.saleNumber ?? o.id?.slice(0, 8)}</td>
                <td className="py-2">{formatDate(o.saleDate)}</td>
                <td className="py-2 capitalize">{o.paymentMethod}</td>
                <td className="py-2 text-right font-medium">{formatCurrency(Number(o.total ?? 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {totalPages > 1 && (
          <div className="flex justify-center gap-2 mt-4">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
            <span className="text-sm text-gray-500 self-center">Page {page} of {totalPages}</span>
            <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        )}
      </Card>
    </div>
  );
};

export default PharmacySalesReport;
