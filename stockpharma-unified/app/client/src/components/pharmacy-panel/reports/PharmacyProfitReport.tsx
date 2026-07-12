import { useState } from 'react';
import { ArrowLeft, Download } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useProfitReport } from '../../../hooks/useReports';
import Button from '../../common/Button';
import Card from '../../common/Card';
import { formatCurrency } from '../../../lib/formatters';
import { downloadCSV } from '../../../lib/exportUtils';

const PharmacyProfitReport = () => {
  const today = new Date().toISOString().split('T')[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000).toISOString().split('T')[0];
  const [from, setFrom] = useState(thirtyDaysAgo);
  const [to, setTo] = useState(today);
  const { data, isLoading } = useProfitReport(from, to);

  const summary = data?.summary ?? {};
  const items: Record<string, unknown>[] = data?.items ?? [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center space-x-4">
          <Link to="/pharmacy/reports" className="p-2 hover:bg-gray-100 rounded-full"><ArrowLeft className="w-5 h-5 text-gray-600" /></Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Profit Margin</h1>
            <p className="text-sm text-gray-500">Retail margin by product</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-md text-sm" />
          <span className="text-gray-400 text-sm">to</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-md text-sm" />
          <Button variant="secondary" leftIcon={<Download size={16} />} onClick={() => downloadCSV(items, `profit_${from}_${to}`)}>Export CSV</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card padding="sm"><p className="text-xs font-bold text-gray-400 uppercase">Revenue</p><p className="text-2xl font-bold mt-1">{isLoading ? '—' : formatCurrency(summary.revenue ?? 0)}</p></Card>
        <Card padding="sm"><p className="text-xs font-bold text-gray-400 uppercase">Cost</p><p className="text-2xl font-bold mt-1">{isLoading ? '—' : formatCurrency(summary.cost ?? 0)}</p></Card>
        <Card padding="sm"><p className="text-xs font-bold text-gray-400 uppercase">Profit</p><p className="text-2xl font-bold text-green-600 mt-1">{isLoading ? '—' : formatCurrency(summary.profit ?? 0)}</p></Card>
        <Card padding="sm"><p className="text-xs font-bold text-gray-400 uppercase">Margin %</p><p className="text-2xl font-bold mt-1">{isLoading ? '—' : `${summary.margin ?? 0}%`}</p></Card>
      </div>

      <Card title="Product Margins">
        <table className="w-full text-sm">
          <thead><tr className="border-b"><th className="text-left py-2 text-gray-400">Product</th><th className="text-right py-2 text-gray-400">Qty</th><th className="text-right py-2 text-gray-400">Revenue</th><th className="text-right py-2 text-gray-400">Cost</th><th className="text-right py-2 text-gray-400">Profit</th><th className="text-right py-2 text-gray-400">Margin</th></tr></thead>
          <tbody>
            {items.map((p: any) => (
              <tr key={p.productId} className="border-b border-gray-50">
                <td className="py-2">{p.name}</td>
                <td className="py-2 text-right">{p.qty}</td>
                <td className="py-2 text-right">{formatCurrency(Number(p.revenue ?? 0))}</td>
                <td className="py-2 text-right">{formatCurrency(Number(p.cost ?? 0))}</td>
                <td className="py-2 text-right text-green-600">{formatCurrency(Number(p.profit ?? 0))}</td>
                <td className="py-2 text-right">{p.margin}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
};

export default PharmacyProfitReport;
