import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { api } from '../../api/client';
import { formatCurrency } from '../../lib/formatters';

const PortalOrdersReport = () => {
  const today = new Date().toISOString().split('T')[0];
  const monthStart = today.slice(0, 7) + '-01';
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get('/reports/portal-orders', { params: { from, to } });
      setData(r.data);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => { load(); }, []);

  const orders = data?.orders ?? [];
  const topPharmacies = data?.topPharmacies ?? [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <Link to="/reports" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700">
        <ChevronLeft className="w-4 h-4" /> Back to Reports
      </Link>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Portal Orders Report</h1>
          <p className="text-sm text-slate-500">Pharmacy-submitted order analytics</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-9 px-3 text-sm border rounded-lg" />
          <span className="text-slate-400">to</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-9 px-3 text-sm border rounded-lg" />
          <button onClick={load} className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg" disabled={loading}>Apply</button>
        </div>
      </div>

      {loading ? <p className="text-slate-400">Loading…</p> : data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-lg border"><p className="text-xs text-slate-400">Total Portal Orders</p><p className="text-2xl font-bold">{data.summary?.totalPortalOrders ?? 0}</p></div>
            <div className="bg-white p-4 rounded-lg border"><p className="text-xs text-slate-400">Approval Rate</p><p className="text-2xl font-bold">{data.summary?.approvalRate ?? 0}%</p></div>
            <div className="bg-white p-4 rounded-lg border"><p className="text-xs text-slate-400">Rejections</p><p className="text-2xl font-bold">{data.summary?.rejectionCount ?? 0}</p></div>
          </div>

          {topPharmacies.length > 0 && (
            <div className="bg-white rounded-lg border overflow-hidden">
              <div className="px-4 py-3 border-b bg-slate-50 text-sm font-semibold text-slate-800">Top Pharmacies</div>
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-slate-50"><th className="px-4 py-2 text-left">Pharmacy</th><th className="px-4 py-2 text-right">Orders</th><th className="px-4 py-2 text-right">Volume</th></tr></thead>
                <tbody>
                  {topPharmacies.map((p: any, i: number) => (
                    <tr key={i} className="border-b">
                      <td className="px-4 py-2">{p.pharmacyName ?? 'Unknown'}</td>
                      <td className="px-4 py-2 text-right">{p.orders ?? 0}</td>
                      <td className="px-4 py-2 text-right">{formatCurrency(p.volume ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="bg-white rounded-lg border overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead><tr className="border-b bg-slate-50"><th className="px-4 py-2 text-left">Order #</th><th className="px-4 py-2 text-left">Pharmacy</th><th className="px-4 py-2 text-left">Date</th><th className="px-4 py-2 text-left">Status</th><th className="px-4 py-2 text-right">Total</th></tr></thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-400">No portal orders in this period</td></tr>
                ) : orders.map((o: any) => (
                  <tr key={o.id} className="border-b">
                    <td className="px-4 py-2">
                      <Link to={`/orders/${o.id}`} className="text-blue-600 hover:text-blue-700 font-medium">
                        {o.orderNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-2">{o.pharmacyName}</td>
                    <td className="px-4 py-2">{o.orderDate}</td>
                    <td className="px-4 py-2 capitalize">{o.status}</td>
                    <td className="px-4 py-2 text-right">{formatCurrency(o.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default PortalOrdersReport;
