import React from 'react';
import { 
  BarChart3, 
  CreditCard, 
  FileText, 
  TrendingUp, 
  Package, 
  ShieldCheck, 
  Download,
  ShoppingCart,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '../../api/client';
import { downloadCSV } from '../../lib/exportUtils';
import { useAuthStore } from '../../stores/authStore';

const reportCards = [
  { title: 'Sales Report', description: 'Analyze revenue by pharmacy, product, and category.', icon: BarChart3, color: 'text-blue-600', bg: 'bg-blue-50', link: '/reports/sales', roles: ['admin', 'biller'] },
  { title: 'Outstanding Payments', description: 'Track unpaid bills and aging credit balances.', icon: CreditCard, color: 'text-red-600', bg: 'bg-red-50', link: '/reports/outstanding', roles: ['admin'] },
  { title: 'GST Breakdown', description: 'Monthly CGST and SGST reports for compliance.', icon: FileText, color: 'text-purple-600', bg: 'bg-purple-50', link: '/reports/gst', roles: ['admin'] },
  { title: 'Profit Analysis', description: 'Real-time profit tracking per unit and order.', icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-50', link: '/reports/profit', roles: ['admin'] },
  { title: 'Stock Ageing', description: 'Monitor inventory hold periods and expiry risks.', icon: Package, color: 'text-orange-600', bg: 'bg-orange-50', link: '/reports/stock-aging', roles: ['admin', 'biller'] },
  { title: 'Compliance Logs', description: 'Schedule H, H1, and NDPS distribution tracking.', icon: ShieldCheck, color: 'text-indigo-600', bg: 'bg-indigo-50', link: '/reports/compliance', roles: ['admin'] },
  { title: 'Portal Orders', description: 'Pharmacy portal order volume and approval metrics.', icon: BarChart3, color: 'text-teal-600', bg: 'bg-teal-50', link: '/reports/portal-orders', roles: ['admin'] },
  { title: 'Purchase Analysis', description: 'Supplier spend, purchase volume, and top vendors.', icon: ShoppingCart, color: 'text-cyan-600', bg: 'bg-cyan-50', link: '/reports/purchase-analysis', roles: ['admin'] },
];

const ReportsHub = () => {
  const userRole = useAuthStore((s) => s.user?.role ?? 'biller');
  const visibleCards = reportCards.filter((r) => r.roles.includes(userRole));
  const handleExport = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const monthStart = today.slice(0, 7) + '-01';
      const [dash, sales] = await Promise.all([
        api.get('/reports/dashboard').then(r => r.data),
        api.get('/reports/sales', { params: { from: monthStart, to: today } }).then(r => r.data),
      ]);

      const rows = [
        { section: 'Dashboard KPIs', metric: "Today's Sales", value: dash.todaySales },
        { section: 'Dashboard KPIs', metric: 'Month Sales', value: dash.monthSales },
        ...(userRole === 'admin' ? [{ section: 'Dashboard KPIs', metric: 'Total Outstanding', value: dash.outstandingTotal }] : []),
        { section: 'Dashboard KPIs', metric: 'Pending Orders', value: dash.pendingOrders },
        { section: 'Dashboard KPIs', metric: 'Low Stock Items', value: dash.lowStockCount },
        { section: 'Dashboard KPIs', metric: 'Overdue Bills', value: dash.overdueCount },
        ...(sales.byDay ?? []).map((d: any) => ({
          section: 'Daily Sales', metric: d.date, value: d.total, orders: d.orders,
        })),
        ...(sales.topProducts ?? []).slice(0, 10).map((p: any) => ({
          section: 'Top Products', metric: p.name, value: p.revenue, qty: p.qty,
        })),
      ];

      downloadCSV(rows, `master-report-${today}`);
      toast.success('Master digest exported with live KPI and sales data');
    } catch {
      toast.error('Failed to export report');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Reports Hub</h1>
          <p className="text-sm text-slate-500">Business intelligence and compliance tools</p>
        </div>
        <div className="flex items-center space-x-3 bg-white p-2 border border-slate-200 rounded-lg">
          <span className="text-xs font-bold text-slate-400 uppercase ml-2 hidden sm:block">Quick Export</span>
          {userRole === 'admin' && (
          <button onClick={handleExport} className="p-1.5 hover:bg-slate-100 rounded text-slate-600" title="Download CSV digest">
             <Download size={18} />
          </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {visibleCards.map((report) => (
          <Link 
            key={report.title} 
            to={report.link}
            className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-all group"
          >
            <div className={`w-12 h-12 rounded-lg ${report.bg} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
              <report.icon className={`w-6 h-6 ${report.color}`} />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">{report.title}</h3>
            <p className="text-sm text-gray-500">{report.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default ReportsHub;
