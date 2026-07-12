import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { RefreshCw, ShoppingCart } from 'lucide-react';
import {
  usePharmacyConnection,
  usePharmacyConnectionCatalog,
  useSyncStockistCatalog,
  useMapCatalogLocalProduct,
} from '../../../hooks/usePharmacyConnections';
import { usePurchaseOrders } from '../../../hooks/usePurchaseOrders';
import { usePayableBills } from '../../../hooks/usePayableBills';
import { useProducts, useCreateProductFromCatalog } from '../../../hooks/useProducts';
import { useAuthStore } from '../../../stores/authStore';
import PageHeader from '../../common/PageHeader';
import Button from '../../common/Button';
import { statusBadge } from '../../common/Badge';
import { formatCurrency, formatDate } from '../../../lib/formatters';
import { getConnectionStockistName, getConnectionStockistGstin } from '../../../lib/fields';
import toast from 'react-hot-toast';

const TABS = ['Overview', 'Catalog', 'Orders', 'Bills', 'Ledger'] as const;

const StockistDetailPage = () => {
  const { connectionId = '' } = useParams();
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role ?? '');
  const isAdmin = role === 'admin';
  const canMapCatalog = ['admin', 'pharmacist'].includes(role);
  const [tab, setTab] = useState<(typeof TABS)[number]>('Overview');

  const { data: conn, isLoading: connLoading, isError: connError, refetch: refetchConn } = usePharmacyConnection(connectionId);
  const catalogEnabled = conn?.status === 'active';
  const { data: catalog = [], isLoading: loadingCatalog } = usePharmacyConnectionCatalog(connectionId, {
    enabled: catalogEnabled,
  });
  const syncCatalog = useSyncStockistCatalog();
  const mapCatalog = useMapCatalogLocalProduct();
  const createFromCatalog = useCreateProductFromCatalog();
  const { data: productsData } = useProducts({ pageSize: 500 });
  const localProducts = productsData?.data ?? productsData ?? [];
  const { data: ordersData } = usePurchaseOrders({ stockistConnectionId: connectionId, pageSize: 10 });
  const { data: billsData } = usePayableBills({ stockistConnectionId: connectionId, pageSize: 10 });

  const handleSync = async () => {
    try {
      await syncCatalog.mutateAsync(connectionId);
      toast.success('Catalog synced');
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Sync failed');
    }
  };

  const handleMapLocalProduct = async (catalogItemId: string, localProductId: string) => {
    if (!localProductId) return;
    try {
      await mapCatalog.mutateAsync({ connectionId, catalogItemId, localProductId });
      toast.success('Catalog item mapped');
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Failed to map product');
    }
  };

  if (connLoading) return <div className="p-8 text-center text-slate-500">Loading stockist…</div>;
  if (connError) return (
    <div className="p-8 text-center space-y-3">
      <p className="text-slate-600">Failed to load stockist connection.</p>
      <Button variant="secondary" size="sm" onClick={() => refetchConn()}>Retry</Button>
    </div>
  );
  if (!conn) {
    return <div className="p-8 text-center text-slate-500">Stockist connection not found.</div>;
  }

  const latestSyncAt = catalogEnabled
    ? (catalog as any[]).reduce<string | null>((latest, item: any) => {
        if (!item?.syncedAt) return latest;
        if (!latest) return item.syncedAt;
        return new Date(item.syncedAt) > new Date(latest) ? item.syncedAt : latest;
      }, null)
    : null;

  const catalogEmptyMessage = (() => {
    if (conn.status === 'rejected') return 'Connection was rejected — catalog unavailable.';
    if (conn.status === 'pending' || conn.status === 'pending_stockist_approval') {
      return 'Catalog available after connection is approved.';
    }
    return 'Catalog not synced — click Refresh Catalog';
  })();

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <PageHeader
        breadcrumbs={[
          { label: 'Stockists', link: '/pharmacy/stockists' },
          { label: getConnectionStockistName(conn) },
        ]}
        actions={
          <div className="flex gap-2">
            {conn.status === 'active' && (
              <>
                {isAdmin && (
                  <Button variant="secondary" leftIcon={<RefreshCw />} isLoading={syncCatalog.isPending} onClick={handleSync}>
                    Resync Catalog
                  </Button>
                )}
                <Button variant="primary" leftIcon={<ShoppingCart />} onClick={() => navigate(`/pharmacy/purchase-orders/create?connectionId=${connectionId}`)} className="!bg-teal-600 hover:!bg-teal-700">
                  Place Order
                </Button>
              </>
            )}
          </div>
        }
      />

      <div className="flex gap-1 border-b border-slate-100 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors shrink-0 whitespace-nowrap ${
              tab === t ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Overview' && (
        <div className="bg-white rounded-xl border border-slate-100 p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div><span className="text-slate-400">Status</span><div className="mt-1">{statusBadge(conn.status)}</div></div>
          <div><span className="text-slate-400">GSTIN</span><p className="mt-1 font-medium">{getConnectionStockistGstin(conn)}</p></div>
          <div><span className="text-slate-400">Phone</span><p className="mt-1 font-medium">{conn.stockistPhone ?? '—'}</p></div>
          <div><span className="text-slate-400">Credit Limit</span><p className="mt-1 font-medium">{conn.creditLimit != null ? formatCurrency(conn.creditLimit) : '—'}</p></div>
          <div><span className="text-slate-400">Payment Terms</span><p className="mt-1 font-medium">{conn.paymentTermsDays ? `${conn.paymentTermsDays} days` : '—'}</p></div>
          <div><span className="text-slate-400">Connected</span><p className="mt-1 font-medium">{formatDate(conn.connectedAt ?? conn.createdAt)}</p></div>
        </div>
      )}

      {tab === 'Catalog' && (
        <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
            <p className="text-xs text-slate-500">
              Last synced: <span className="font-medium text-slate-700">{latestSyncAt ? formatDate(latestSyncAt) : 'Never'}</span>
            </p>
            {canMapCatalog && catalogEnabled && (
              <Button variant="secondary" size="sm" leftIcon={<RefreshCw className="w-4 h-4" />} isLoading={syncCatalog.isPending} onClick={handleSync}>
                Resync
              </Button>
            )}
          </div>
          {!catalogEnabled ? (
            <p className="p-8 text-center text-slate-400">{catalogEmptyMessage}</p>
          ) : loadingCatalog ? (
            <p className="p-8 text-center text-slate-400">Loading catalog…</p>
          ) : catalog.length === 0 ? (
            <p className="p-8 text-center text-slate-400">{catalogEmptyMessage}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="px-4 py-3 text-left text-xs text-slate-400 uppercase">Product</th>
                  <th className="px-4 py-3 text-right text-xs text-slate-400 uppercase">MRP</th>
                  <th className="px-4 py-3 text-right text-xs text-slate-400 uppercase">Rate</th>
                  <th className="px-4 py-3 text-right text-xs text-slate-400 uppercase">GST</th>
                  <th className="px-4 py-3 text-left text-xs text-slate-400 uppercase">Synced</th>
                  {canMapCatalog && <th className="px-4 py-3 text-left text-xs text-slate-400 uppercase">Map Local Product</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {catalog.map((item: any) => (
                  <tr key={item.id ?? item.stockistProductId}>
                    <td className="px-4 py-3 font-medium">{item.productName ?? item.name}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(item.mrp)}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(item.saleRate ?? item.rate)}</td>
                    <td className="px-4 py-3 text-right">{item.gstRate ?? '—'}%</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{item.syncedAt ? formatDate(item.syncedAt) : '—'}</td>
                    {canMapCatalog && (
                      <td className="px-4 py-3">
                        <select
                          value={item.localProductId ?? ''}
                          onChange={(e) => handleMapLocalProduct(item.id, e.target.value)}
                          className="w-full h-8 px-2 text-xs border border-slate-200 rounded"
                          disabled={mapCatalog.isPending}
                        >
                          <option value="">Select product</option>
                          {localProducts.map((p: any) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                        {!item.localProductId && (
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                const product = await createFromCatalog.mutateAsync(item.id);
                                toast.success(`Created ${product.name}`);
                              } catch (err: any) {
                                toast.error(err?.response?.data?.error ?? 'Failed to create product');
                              }
                            }}
                            className="mt-1 text-[10px] text-teal-600 hover:text-teal-700 font-medium"
                            disabled={createFromCatalog.isPending}
                          >
                            Create from catalog
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'Orders' && (
        <div className="bg-white rounded-xl border border-slate-100 overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-4 py-3 text-left text-xs text-slate-400 uppercase">PO #</th>
                <th className="px-4 py-3 text-left text-xs text-slate-400 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs text-slate-400 uppercase">Status</th>
                <th className="px-4 py-3 text-right text-xs text-slate-400 uppercase">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {(ordersData?.data ?? []).length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">No orders to this stockist</td></tr>
              ) : (ordersData?.data ?? []).map((po: any) => (
                <tr key={po.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => navigate(`/pharmacy/purchase-orders/${po.id}`)}>
                  <td className="px-4 py-3 text-teal-600 font-medium">{po.poNumber}</td>
                  <td className="px-4 py-3">{formatDate(po.orderDate)}</td>
                  <td className="px-4 py-3">{statusBadge(po.status)}</td>
                  <td className="px-4 py-3 text-right font-semibold">{formatCurrency(po.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'Bills' && (
        <div className="bg-white rounded-xl border border-slate-100 overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-4 py-3 text-left text-xs text-slate-400 uppercase">Bill #</th>
                <th className="px-4 py-3 text-left text-xs text-slate-400 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs text-slate-400 uppercase">Status</th>
                <th className="px-4 py-3 text-right text-xs text-slate-400 uppercase">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {(billsData?.data ?? []).length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">No bills from this stockist</td></tr>
              ) : (billsData?.data ?? []).map((b: any) => (
                <tr key={b.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => navigate(`/pharmacy/payable-bills/${b.id}`)}>
                  <td className="px-4 py-3 text-teal-600 font-medium">{b.billNumber}</td>
                  <td className="px-4 py-3">{formatDate(b.billDate)}</td>
                  <td className="px-4 py-3">{statusBadge(b.status)}</td>
                  <td className="px-4 py-3 text-right font-semibold">{formatCurrency(b.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'Ledger' && (
        <div className="bg-white rounded-xl border border-slate-100 p-5 text-sm space-y-2">
          <p className="text-slate-500">Account statement with this stockist (from payable bills).</p>
          {(billsData?.data ?? []).map((b: any) => (
            <div key={b.id} className="flex justify-between py-2 border-b border-slate-50">
              <span>{b.billNumber} · {formatDate(b.billDate)}</span>
              <span className="font-medium text-red-600">{formatCurrency(b.outstanding ?? b.total)}</span>
            </div>
          ))}
          {(billsData?.data ?? []).length === 0 && <p className="text-slate-400 text-center py-4">No ledger entries yet</p>}
        </div>
      )}
    </div>
  );
};

export default StockistDetailPage;
