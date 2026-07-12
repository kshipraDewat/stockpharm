import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useGrn } from '../../../hooks/useGrn';
import { usePurchaseOrder } from '../../../hooks/usePurchaseOrders';
import PageHeader from '../../common/PageHeader';
import Button from '../../common/Button';
import { statusBadge } from '../../common/Badge';
import { formatDate } from '../../../lib/formatters';
import QueryError from '../../common/QueryError';
import ReceiveGrnModal from './ReceiveGrnModal';

const GrnDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError, refetch } = useGrn(id ?? '');
  const poId = data?.purchaseOrderId ?? data?.purchaseOrder?.id ?? '';
  const { data: po } = usePurchaseOrder(poId);
  const [showGrn, setShowGrn] = useState(false);

  if (isError) return <QueryError onRetry={() => refetch()} />;

  if (isLoading || !data) {
    return (
      <div className="max-w-4xl mx-auto p-8 text-center text-slate-400">Loading GRN…</div>
    );
  }

  const canReceiveGrn = po && ['delivered', 'partially_received'].includes(po.status);

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <PageHeader
        breadcrumbs={[
          { label: 'Inbound GRN', link: '/pharmacy/grn' },
          { label: data.grnNumber ?? 'GRN' },
        ]}
        showBack
        actions={
          canReceiveGrn ? (
            <Button variant="primary" onClick={() => setShowGrn(true)} className="!bg-teal-600 hover:!bg-teal-700">
              Receive GRN
            </Button>
          ) : undefined
        }
      />

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-bold text-slate-900">{data.grnNumber}</h1>
          {statusBadge(data.status)}
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><span className="text-slate-400">Received</span><p className="font-medium">{formatDate(data.receivedDate)}</p></div>
          <div>
            <span className="text-slate-400">PO #</span>
            <p className="font-medium">
              {poId ? (
                <Link to={`/pharmacy/purchase-orders/${poId}`} className="text-teal-600 hover:underline">
                  {data.purchaseOrder?.poNumber ?? po?.poNumber ?? poId.slice(0, 8)}
                </Link>
              ) : '—'}
            </p>
          </div>
        </div>
        {data.notes && <p className="text-sm text-slate-600">{data.notes}</p>}
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="px-4 py-3 text-left text-xs text-slate-400 uppercase">Product</th>
              <th className="px-4 py-3 text-left text-xs text-slate-400 uppercase">Batch</th>
              <th className="px-4 py-3 text-right text-xs text-slate-400 uppercase">Qty</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {(data.items ?? []).map((item: any) => (
              <tr key={item.id}>
                <td className="px-4 py-3">{item.productName ?? '—'}</td>
                <td className="px-4 py-3 text-slate-500">{item.batchNumber} · exp {formatDate(item.expiryDate)}</td>
                <td className="px-4 py-3 text-right font-medium">{item.qty}{item.freeQty ? ` +${item.freeQty} free` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {po && (
        <ReceiveGrnModal
          isOpen={showGrn}
          onClose={() => setShowGrn(false)}
          purchaseOrder={po}
          onSuccess={() => refetch()}
        />
      )}
    </div>
  );
};

export default GrnDetailPage;
