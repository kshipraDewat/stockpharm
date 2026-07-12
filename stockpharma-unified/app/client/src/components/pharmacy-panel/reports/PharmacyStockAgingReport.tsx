import { ArrowLeft, Download } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useStockAgingReport } from '../../../hooks/useReports';
import Button from '../../common/Button';
import Card from '../../common/Card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatCurrency, formatDate } from '../../../lib/formatters';
import { downloadCSV } from '../../../lib/exportUtils';

const PharmacyStockAgingReport = () => {
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split('T')[0]);
  const { data, isLoading } = useStockAgingReport(asOfDate);
  const buckets: { name: string; quantity: number }[] = data?.buckets ?? [];
  const agedItems: Record<string, unknown>[] = data?.items ?? [];

  const chartData = buckets.length > 0 ? buckets.map(b => ({ name: b.name, stock: b.quantity })) : [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center space-x-4">
          <Link to="/pharmacy/reports" className="p-2 hover:bg-gray-100 rounded-full"><ArrowLeft className="w-5 h-5 text-gray-600" /></Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Stock Aging</h1>
            <p className="text-sm text-gray-500">Inventory hold periods and expiry risk</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={asOfDate} onChange={e => setAsOfDate(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-md text-sm" />
          <Button variant="secondary" leftIcon={<Download size={16} />} onClick={() => downloadCSV(agedItems, 'stock_aging')}>Export CSV</Button>
        </div>
      </div>

      <Card title="Age Distribution">
        <div className="h-64">
          {isLoading ? <p className="text-gray-400">Loading…</p> : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="stock" fill="#0d9488" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      <Card title="Batch Details">
        <table className="w-full text-sm">
          <thead><tr className="border-b"><th className="text-left py-2 text-gray-400">Product</th><th className="text-left py-2 text-gray-400">Batch</th><th className="text-left py-2 text-gray-400">Expiry</th><th className="text-right py-2 text-gray-400">Qty</th><th className="text-right py-2 text-gray-400">Age (d)</th><th className="text-right py-2 text-gray-400">Value</th></tr></thead>
          <tbody>
            {agedItems.slice(0, 100).map((i: any) => (
              <tr key={i.batchId} className="border-b border-gray-50">
                <td className="py-2">{i.productName}</td>
                <td className="py-2">{i.batchNumber}</td>
                <td className="py-2">{formatDate(i.expiryDate)}</td>
                <td className="py-2 text-right">{i.qtyOnHand}</td>
                <td className="py-2 text-right">{i.ageDays}</td>
                <td className="py-2 text-right">{formatCurrency(Number(i.value ?? 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
};

export default PharmacyStockAgingReport;
