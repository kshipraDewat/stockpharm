import { useState } from 'react';
import { ArrowLeft, Download } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useOutstandingReport } from '../../../hooks/useReports';
import Button from '../../common/Button';
import Card from '../../common/Card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatCurrency, formatDate } from '../../../lib/formatters';
import { downloadCSV } from '../../../lib/exportUtils';

const PharmacyPayablesReport = () => {
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split('T')[0]);
  const { data, isLoading } = useOutstandingReport(asOfDate);

  const buckets = data?.buckets ?? {};
  const chartData = [
    { name: 'Current', amount: buckets.current ?? 0 },
    { name: '1-30d', amount: buckets.days30 ?? 0 },
    { name: '31-60d', amount: buckets.days60 ?? 0 },
    { name: '61-90d', amount: buckets.days90 ?? 0 },
    { name: '> 90d', amount: buckets.over90 ?? 0 },
  ];
  const byStockist: Record<string, unknown>[] = data?.byStockist ?? [];
  const bills: Record<string, unknown>[] = data?.bills ?? [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center space-x-4">
          <Link to="/pharmacy/reports" className="p-2 hover:bg-gray-100 rounded-full"><ArrowLeft className="w-5 h-5 text-gray-600" /></Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Payables Aging</h1>
            <p className="text-sm text-gray-500">Outstanding bills to stockists</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={asOfDate} onChange={e => setAsOfDate(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-md text-sm" />
          <Button variant="secondary" leftIcon={<Download size={16} />} onClick={() => downloadCSV(bills, `payables_aging_${asOfDate}`)}>Export CSV</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card padding="sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Total Outstanding</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{isLoading ? '—' : formatCurrency(data?.totalOutstanding ?? 0)}</p>
        </Card>
        <Card padding="sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Stockists with Balance</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{isLoading ? '—' : byStockist.length}</p>
        </Card>
      </div>

      <Card title="Aging Buckets">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip formatter={(v: number) => formatCurrency(v)} />
              <Bar dataKey="amount" fill="#dc2626" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card title="By Stockist">
        <table className="w-full text-sm">
          <thead><tr className="border-b"><th className="text-left py-2 text-gray-400">Stockist</th><th className="text-right py-2 text-gray-400">Bills</th><th className="text-right py-2 text-gray-400">Outstanding</th></tr></thead>
          <tbody>
            {byStockist.map((s: any, i) => (
              <tr key={i} className="border-b border-gray-50">
                <td className="py-2">{s.stockistName}</td>
                <td className="py-2 text-right">{s.billCount}</td>
                <td className="py-2 text-right font-medium">{formatCurrency(Number(s.outstanding ?? 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Open Bills">
        <table className="w-full text-sm">
          <thead><tr className="border-b"><th className="text-left py-2 text-gray-400">Bill #</th><th className="text-left py-2 text-gray-400">Stockist</th><th className="text-left py-2 text-gray-400">Due</th><th className="text-right py-2 text-gray-400">Outstanding</th></tr></thead>
          <tbody>
            {bills.slice(0, 50).map((b: any) => (
              <tr key={b.id} className="border-b border-gray-50">
                <td className="py-2">{b.billNumber}</td>
                <td className="py-2">{b.stockistName}</td>
                <td className="py-2">{formatDate(b.dueDate)}</td>
                <td className="py-2 text-right font-medium">{formatCurrency(Number(b.outstanding ?? 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
};

export default PharmacyPayablesReport;
