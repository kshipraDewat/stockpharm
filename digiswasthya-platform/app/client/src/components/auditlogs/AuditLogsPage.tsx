import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, Download } from 'lucide-react';
import { useAuditLogs, useUsers } from '../../hooks/useUsers';
import { api } from '../../api/client';
import PageHeader from '../common/PageHeader';
import Button from '../common/Button';
import Pagination from '../common/Pagination';
import AuditDetailModal from './AuditDetailModal';
import { downloadCSV } from '../../lib/exportUtils';
import { formatDateTimeWithTz, getTimezoneLabel } from '../../lib/formatters';
import toast from 'react-hot-toast';
import { panelPath, purchaseListPath, type PanelPrefix, usePanelBasePath } from '../../hooks/usePanelBasePath';

function entityRoutes(base: PanelPrefix): Record<string, string> {
  if (base === '/pharmacy') {
    return {
      pharmacy_purchase_order: panelPath(base, '/purchase-orders'),
      pharmacy_grn: panelPath(base, '/grn'),
      bill: panelPath(base, '/payable-bills'),
      payable_payment: panelPath(base, '/payments'),
      retail_sale: panelPath(base, '/sales'),
      stockist_connection: panelPath(base, '/stockists'),
      stockist_return: panelPath(base, '/returns'),
      customer: panelPath(base, '/customers'),
      product: panelPath(base, '/products'),
    };
  }
  return {
    order: panelPath(base, '/orders'),
    payment: panelPath(base, '/payments'),
    bill: panelPath(base, '/bills'),
    return: panelPath(base, '/returns'),
    purchase: purchaseListPath(base),
    pharmacy: panelPath(base, '/pharmacies'),
    product: panelPath(base, '/products'),
    supplier: panelPath(base, '/suppliers'),
  };
}

const STOCKIST_ENTITY_FILTERS = [
  { value: 'order', label: 'Orders' },
  { value: 'payment', label: 'Payments' },
  { value: 'bill', label: 'Bills' },
  { value: 'return', label: 'Returns' },
  { value: 'purchase', label: 'Purchases' },
  { value: 'user', label: 'Users' },
] as const;

const PHARMACY_ENTITY_FILTERS = [
  { value: 'pharmacy_purchase_order', label: 'Purchase Orders' },
  { value: 'pharmacy_grn', label: 'GRN' },
  { value: 'bill', label: 'Payable Bills' },
  { value: 'payable_payment', label: 'Payable Payments' },
  { value: 'retail_sale', label: 'Retail Sales' },
  { value: 'stockist_connection', label: 'Stockist Connections' },
  { value: 'stockist_return', label: 'Returns' },
  { value: 'customer', label: 'Customers' },
  { value: 'product', label: 'Products' },
  { value: 'user', label: 'Users' },
] as const;

function entityRoute(base: PanelPrefix, entityType: string, entityId: string): string | null {
  const routeBase = entityRoutes(base)[entityType];
  return routeBase && entityId ? `${routeBase}/${entityId}` : null;
}

const AuditLogsPage = () => {
  const base = usePanelBasePath();
  const isPharmacy = base === '/pharmacy';
  const entityFilters = isPharmacy ? PHARMACY_ENTITY_FILTERS : STOCKIST_ENTITY_FILTERS;
  const [selectedLog, setSelectedLog] = useState<any | null>(null);
  const [entityType, setEntityType] = useState('');
  const [userId, setUserId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const filters = {
    entityType: entityType || undefined,
    userId: userId || undefined,
    from: from || undefined,
    to: to ? `${to}T23:59:59.999Z` : undefined,
    page,
    pageSize,
  };

  const { data, isLoading } = useAuditLogs(filters);
  const { data: usersData } = useUsers();
  const users = usersData?.data ?? usersData ?? [];
  const logs = data?.data ?? data ?? [];
  const total = data?.total ?? logs.length;
  const tzLabel = getTimezoneLabel();

  const handleExport = async () => {
    try {
      const allRows: any[] = [];
      let pg = 1;
      let pages = 1;
      do {
        const res = await api.get('/audit-logs', { params: { ...filters, page: pg, pageSize: 100 } });
        const batch = res.data?.data ?? [];
        allRows.push(...batch);
        pages = res.data?.pages ?? 1;
        pg++;
      } while (pg <= pages);
      if (allRows.length === 0) {
        toast.error('No logs to export');
        return;
      }
      downloadCSV(allRows, 'audit_logs');
      toast.success(`Exported ${allRows.length} audit entries`);
    } catch {
      toast.error('Export failed');
    }
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <PageHeader
        breadcrumbs={[{ label: 'Audit Logs' }]}
        showBack={false}
        actions={
          <Button variant="secondary" leftIcon={<Download />} size="sm" onClick={handleExport}>
            Export
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2 px-1">
        <select
          value={entityType}
          onChange={e => { setEntityType(e.target.value); setPage(1); }}
          className="h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-600"
        >
          <option value="">All entities</option>
          {entityFilters.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <select
          value={userId}
          onChange={e => { setUserId(e.target.value); setPage(1); }}
          className="h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-600"
        >
          <option value="">All users</option>
          {users.map((u: any) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
        <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }}
          className="h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white" aria-label="From date" />
        <input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1); }}
          className="h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white" aria-label="To date" />
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden overflow-x-auto">
        <p className="px-4 pt-3 text-[11px] text-slate-400">
          Timestamps shown in {tzLabel}
        </p>
        <table className="w-full text-sm min-w-[720px]">
          <thead className="sticky top-0 bg-white z-10">
            <tr className="border-b border-slate-100">
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">Timestamp ({tzLabel})</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">User</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">Action</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">Entity</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">Details</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {isLoading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: 6 }).map((__, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-200 rounded" /></td>
                    ))}
                  </tr>
                ))
              : logs.length === 0
              ? <tr><td colSpan={6} className="px-4 py-14 text-center text-sm text-slate-400">No logs found.</td></tr>
              : logs.map((log: any) => {
                  const route = entityRoute(base, log.entityType, log.entityId);
                  return (
                    <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-xs font-mono text-slate-500 whitespace-nowrap">
                        {formatDateTimeWithTz(log.createdAt ?? log.timestamp)}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800">{log.userName ?? log.user ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 uppercase tracking-wide">
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {log.entityType}
                        {' · '}
                        {route ? (
                          <Link
                            to={route}
                            className="font-mono text-blue-600 hover:underline"
                            onClick={e => e.stopPropagation()}
                          >
                            {(log.entityId ?? '—').slice(0, 8)}…
                          </Link>
                        ) : (
                          <span className="font-mono">{(log.entityId ?? '—').slice(0, 8)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600 max-w-xs truncate">{log.details ?? log.description ?? '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          className="p-1.5 hover:bg-blue-50 text-slate-400 hover:text-blue-600 rounded-lg transition-colors"
                          onClick={() => setSelectedLog(log)}
                          aria-label="View details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
            }
          </tbody>
        </table>
        <Pagination page={page} total={total} pageSize={pageSize} onPageChange={setPage} />
      </div>

      <AuditDetailModal isOpen={selectedLog !== null} onClose={() => setSelectedLog(null)} log={selectedLog} />
    </div>
  );
};

export default AuditLogsPage;
