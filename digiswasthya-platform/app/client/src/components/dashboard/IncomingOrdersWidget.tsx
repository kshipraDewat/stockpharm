import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useOrders, useIncomingOrderCount } from '../../hooks/useOrders';
import { orderStatusBadge } from '../common/Badge';
import Button from '../common/Button';
import { formatCurrency, formatDate } from '../../lib/formatters';
import { getTotal } from '../../lib/fields';

const IncomingOrdersWidget: React.FC = () => {
  const navigate = useNavigate();
  const { data, isLoading } = useOrders({
    source: 'pharmacy_submitted',
    status: 'pending',
    pageSize: 5,
  });
  const orders = data?.data ?? [];

  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-50">
        <span className="text-sm font-semibold text-slate-800">Incoming Portal Orders</span>
        <Link to="/orders?source=pharmacy&status=pending" className="text-xs text-blue-600 hover:text-blue-700">View all</Link>
      </div>
      <div className="divide-y divide-slate-50">
        {isLoading ? (
          <p className="px-4 py-6 text-sm text-slate-400 text-center">Loading…</p>
        ) : orders.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-400 text-center">No pending pharmacy orders</p>
        ) : orders.map((o: any) => (
          <div key={o.id} className="px-4 py-3 flex items-center justify-between hover:bg-slate-50 cursor-pointer" onClick={() => navigate(`/orders/${o.id}`)}>
            <div>
              <p className="text-sm font-medium text-slate-800">{o.pharmacyName}</p>
              <p className="text-xs text-slate-400">{o.orderNumber} · {formatDate(o.orderDate)}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">{formatCurrency(getTotal(o))}</span>
              {orderStatusBadge(o)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export { useIncomingOrderCount };
export default IncomingOrdersWidget;
