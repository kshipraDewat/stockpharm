import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Edit, AlertTriangle, Package, Beaker, Tag, IndianRupee, AlertCircle, ExternalLink, Calendar } from 'lucide-react';
import { useProduct, useProductBatches } from '../../hooks/useProducts';
import Button from '../common/Button';
import Card from '../common/Card';
import Badge from '../common/Badge';
import PageHeader from '../common/PageHeader';
import EditProductModal from './EditProductModal';
import AdjustStockModal from './AdjustStockModal';
import { formatCurrency, formatDate } from '../../lib/formatters';
import { daysUntilExpiry, expiryTier, expiryTierClass } from '../../lib/expiry';
import { useAuthStore } from '../../stores/authStore';
import { panelPath, purchaseDetailPath, usePanelBasePath } from '../../hooks/usePanelBasePath';

const ProductDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const base = usePanelBasePath();
  const [activeTab, setActiveTab] = useState('info');
  const [editOpen, setEditOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);

  const role = useAuthStore((s) => s.user?.role ?? '');
  const isAdmin = role === 'admin';
  const isPharmacist = role === 'pharmacist';
  const canWriteProducts = base === '/pharmacy' ? ['admin', 'pharmacist'].includes(role) : isAdmin;
  const canAdjustStock = isAdmin || (isPharmacist && base === '/pharmacy');
  const hideRatesForCashier = base === '/pharmacy' && role === 'cashier';
  const { data: product, isLoading } = useProduct(id!);
  const { data: batches } = useProductBatches(id!);
  const batchList = batches ?? [];

  if (isLoading) return <div className="p-8 text-slate-400 animate-pulse text-center">Loading product details…</div>;
  if (!product) return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
      <AlertCircle className="w-12 h-12 text-red-500" />
      <h2 className="text-lg font-bold text-slate-800">Product Not Found</h2>
      <Button variant="primary" size="sm" onClick={() => navigate(panelPath(base, '/products'))}>Back to Products</Button>
    </div>
  );

  const currentStock = Number(product.stock ?? product.currentStock ?? 0);
  const minLevel = Number(product.minStockLevel ?? 0);
  const isLow = currentStock < minLevel && minLevel > 0;

  const checkExpiryStatus = (expiryStr?: string) => {
    if (!expiryStr) return null;
    const days = daysUntilExpiry(expiryStr);
    if (days === null) return null;
    const tier = expiryTier(expiryStr);
    if (tier === 'expired') return { expired: true, text: 'Expired', className: expiryTierClass(tier) };
    if (tier === 'critical') return { soon: true, text: `Expiring in ${days}d`, className: expiryTierClass(tier) };
    if (tier === 'warning') return { soon: true, text: `Expiring in ${days}d`, className: expiryTierClass(tier) };
    return { ok: true, text: `${days}d left`, className: expiryTierClass(tier) };
  };

  const schemeLabel = product.schemeBase && product.schemeBonus
    ? `${product.schemeBase}+${product.schemeBonus}`
    : product.schemeBase ? `${product.schemeBase}` : '—';

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <PageHeader
        title={product.name}
        breadcrumbs={[{ label: 'Products', link: panelPath(base, '/products') }, { label: product.name }]}
        actions={
          <div className="flex space-x-3 items-center flex-wrap">
            <Badge variant={isLow ? 'warning' : 'success'}>{isLow ? 'Low Stock' : 'Stock Healthy'}</Badge>
            {canAdjustStock && (
              <>
                <Button variant="secondary" size="sm" leftIcon={<Package className="w-3.5 h-3.5" />} onClick={() => setAdjustOpen(true)}>
                  Adjust Stock
                </Button>
                {canWriteProducts && (
                  <Button variant="secondary" size="sm" leftIcon={<Edit className="w-3.5 h-3.5" />} onClick={() => setEditOpen(true)}>
                    Edit Product
                  </Button>
                )}
              </>
            )}
          </div>
        }
      />

      {/* KPI metrics row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 flex items-center space-x-4">
          <div className="p-3 bg-blue-50 rounded-xl text-blue-600"><Package className="w-5 h-5" /></div>
          <div>
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Current Stock</p>
            <h3 className="text-lg font-bold text-slate-900">{currentStock.toLocaleString()} {product.baseUnit || 'units'}</h3>
          </div>
        </Card>

        <Card className={`p-4 flex items-center space-x-4 ${isLow ? 'border-l-4 border-amber-500' : ''}`}>
          <div className={`p-3 rounded-xl ${isLow ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-400'}`}>
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Min Level</p>
            <h3 className="text-lg font-bold text-slate-900">{minLevel.toLocaleString()}</h3>
          </div>
        </Card>

        {!hideRatesForCashier && (
        <Card className="p-4 flex items-center space-x-4">
          <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600"><IndianRupee className="w-5 h-5" /></div>
          <div>
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">MRP</p>
            <h3 className="text-lg font-bold text-slate-900">{formatCurrency(product.mrp ?? 0)}</h3>
          </div>
        </Card>
        )}

        <Card className="p-4 flex items-center space-x-4">
          <div className="p-3 bg-purple-50 rounded-xl text-purple-600"><Tag className="w-5 h-5" /></div>
          <div>
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">HSN Code</p>
            <h3 className="text-lg font-bold text-slate-900">{product.hsnCode || '—'}</h3>
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50/50">
          <nav className="flex px-4 sm:px-6 gap-2">
            {[
              { id: 'info', label: 'Product Info' },
              { id: 'batches', label: `Batches (${batchList.length})` },
            ].map(tab => (
              <button 
                key={tab.id} 
                onClick={() => setActiveTab(tab.id)}
                className={`py-3.5 px-4 border-b-2 font-medium text-sm transition-all whitespace-nowrap ${
                  activeTab === tab.id 
                    ? 'border-blue-600 text-blue-600 font-semibold' 
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'info' && (
            <div className={`grid grid-cols-1 ${hideRatesForCashier ? '' : 'md:grid-cols-2'} gap-6`}>
              {/* Core Information */}
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Beaker className="w-4 h-4 text-slate-400" /> Details & Categorisation
                </h4>
                <div className="bg-slate-50/50 rounded-xl border border-slate-100 p-4 space-y-3">
                  {[
                    ['Generic Name', product.genericName],
                    ['Category', product.category],
                    ['Manufacturer', product.manufacturer],
                    ['Schedule Type', product.scheduleType],
                    ['Pack Size', product.packSize],
                    ['Scheme', schemeLabel],
                    ['Sale / Base Unit', `${product.saleUnit || 'Strip'} (${product.convFactor || 10} ${product.baseUnit || 'Tab'})`],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between items-center py-1 border-b border-slate-100/60 last:border-0">
                      <span className="text-xs text-slate-500">{k}</span>
                      <span className="text-sm font-medium text-slate-800">{v || '—'}</span>
                    </div>
                  ))}
                </div>
              </div>

              {!hideRatesForCashier && (
                <div>
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <Package className="w-4 h-4 text-slate-400" /> Rates & Taxes
                  </h4>
                  <div className="bg-slate-50/50 rounded-xl border border-slate-100 p-4 space-y-3">
                    {[
                      ['MRP', formatCurrency(product.mrp ?? 0)],
                      ['Sale Rate (PTR)', formatCurrency(product.saleRate ?? product.salePrice ?? product.ptg ?? 0)],
                      ['Purchase Rate', formatCurrency(product.purchaseRate ?? 0)],
                      ['GST Rate', `${product.gstRate ?? 0}%`],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between items-center py-1 border-b border-slate-100/60 last:border-0">
                        <span className="text-xs text-slate-500">{k}</span>
                        <span className="text-sm font-medium text-slate-900">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'batches' && (
            batchList.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/50">
                      <th className="px-4 py-3 font-semibold text-xs text-slate-500 uppercase">Batch Number</th>
                      <th className="px-4 py-3 font-semibold text-xs text-slate-500 uppercase">Expiry Date</th>
                      <th className="px-4 py-3 font-semibold text-xs text-slate-500 uppercase text-right">Qty On Hand</th>
                      {!hideRatesForCashier && <th className="px-4 py-3 font-semibold text-xs text-slate-500 uppercase text-right">MRP</th>}
                      {!hideRatesForCashier && <th className="px-4 py-3 font-semibold text-xs text-slate-500 uppercase text-right">Purchase Source</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {batchList.map((b: any) => {
                      const expStatus = checkExpiryStatus(b.expiryDate);
                      return (
                        <tr key={b.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="px-4 py-3.5 font-medium text-slate-900">
                            {b.batchNumber ?? b.batchNo}
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2 font-medium text-slate-600 whitespace-nowrap">
                              <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              {b.expiryDate}
                              {expStatus && (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold leading-none ${expStatus.className ?? (expStatus.expired ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800')}`}>
                                  {expStatus.text}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-right font-bold text-slate-900">
                            {b.qtyOnHand ?? b.quantity ?? 0}
                          </td>
                          {!hideRatesForCashier && (
                            <td className="px-4 py-3.5 text-right font-medium text-slate-700">
                              {formatCurrency(b.mrp)}
                            </td>
                          )}
                          {!hideRatesForCashier && (
                          <td className="px-4 py-3.5 text-right">
                            {b.sourcePurchaseId ? (
                              <Link 
                                to={purchaseDetailPath(base, b.sourcePurchaseId)}
                                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-semibold"
                              >
                                View Bill <ExternalLink className="w-3 h-3" />
                              </Link>
                            ) : (
                              <span className="text-xs text-slate-400">Direct Entry</span>
                            )}
                          </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12 text-slate-400">
                <Package className="w-10 h-10 mx-auto text-slate-200 mb-2" />
                <p className="text-sm">No batches mapped to this product.</p>
              </div>
            )
          )}
        </div>
      </Card>
      <EditProductModal isOpen={editOpen} onClose={() => setEditOpen(false)} product={product} />
      <AdjustStockModal isOpen={adjustOpen} onClose={() => setAdjustOpen(false)} productId={product.id} productName={product.name} />
    </div>
  );
};

export default ProductDetailPage;
