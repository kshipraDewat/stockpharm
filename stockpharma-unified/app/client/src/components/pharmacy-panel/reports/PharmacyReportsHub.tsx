import React from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Package, FileText, CreditCard, ShieldCheck, TrendingUp } from 'lucide-react';
import { useAuthStore } from '../../../stores/authStore';

const cards = [
  { title: 'Retail Sales', link: '/pharmacy/reports/sales', icon: BarChart3, roles: ['admin', 'pharmacist'] },
  { title: 'Stock Aging', link: '/pharmacy/reports/stock-aging', icon: Package, roles: ['admin', 'pharmacist'] },
  { title: 'Expiry Report', link: '/pharmacy/expiry-alerts', icon: Package, roles: ['admin', 'pharmacist'] },
  { title: 'GST Summary', link: '/pharmacy/reports/gst', icon: FileText, roles: ['admin'] },
  { title: 'Payables Aging', link: '/pharmacy/reports/payables-aging', icon: CreditCard, roles: ['admin'] },
  { title: 'Profit Margin', link: '/pharmacy/reports/profit', icon: TrendingUp, roles: ['admin'] },
  { title: 'Compliance', link: '/pharmacy/reports/compliance', icon: ShieldCheck, roles: ['admin'] },
];

const PharmacyReportsHub = () => {
  const role = useAuthStore((s) => s.user?.role ?? 'cashier');
  const visible = cards.filter(c => c.roles.includes(role));

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
        <p className="text-sm text-slate-500">Pharmacy insights and compliance</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {visible.map(c => (
          <Link key={c.title} to={c.link} className="bg-white p-5 rounded-xl border border-slate-100 hover:shadow-md transition-shadow">
            <c.icon className="w-8 h-8 text-teal-600 mb-3" />
            <h3 className="font-semibold text-slate-900">{c.title}</h3>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default PharmacyReportsHub;
