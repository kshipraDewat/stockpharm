import React, { useState } from 'react';
import { Package, Truck, CheckCircle2, Clock, Printer, AlertCircle, RotateCcw, XCircle, Box, Copy } from 'lucide-react';
import { useParams, useNavigate } from 'react-router-dom';
import { useOrder, useCancelOrder, useFinalizeOrder, useCancelApprovedOrder } from '../../hooks/useOrders';
import { useAuthStore } from '../../stores/authStore';
import Button from '../common/Button';
import ConfirmDialog from '../common/ConfirmDialog';
import Modal from '../common/Modal';
import RecordDeliveryModal from './RecordDeliveryModal';
import GenerateBillModal from './GenerateBillModal';
import InitiateReturnModal from './InitiateReturnModal';
import ShipOrderModal from './ShipOrderModal';
import ApprovePharmacyOrderModal from './ApprovePharmacyOrderModal';
import RejectPharmacyOrderModal from './RejectPharmacyOrderModal';
import PageHeader from '../common/PageHeader';
import QueryError from '../common/QueryError';
import { formatCurrency, formatDate } from '../../lib/formatters';
import { sourceBadge } from '../common/Badge';
import toast from 'react-hot-toast';

const OrderDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = React.useState<'items' | 'actions'>('items');
  const [isDeliveryModalOpen, setIsDeliveryModalOpen] = React.useState(false);
  const [isBillModalOpen, setIsBillModalOpen] = React.useState(false);
  const [isReturnModalOpen, setIsReturnModalOpen] = React.useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancelApprovedOpen, setCancelApprovedOpen] = useState(false);
  const [cancelApprovedReason, setCancelApprovedReason] = useState('');

  const [isShipModalOpen, setIsShipModalOpen] = useState(false);
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);

  const { data: order, isLoading, isError, refetch } = useOrder(id!);
  const cancelOrder = useCancelOrder();
  const cancelApprovedOrder = useCancelApprovedOrder();
  const finalizeOrder = useFinalizeOrder();
  const role = useAuthStore((s) => s.user?.role);
  const isAdmin = role === 'admin';
  const isBiller = role === 'biller';

  if (isLoading) return <div className="p-6 text-slate-500">Loading order...</div>;
  if (isError) return <QueryError onRetry={() => refetch()} />;
  if (!order) return (
    <div className="flex flex-col items-center justify-center h-64">
      <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
      <h2 className="text-xl font-bold text-gray-900">Order Not Found</h2>
      <Button variant="primary" onClick={() => navigate('/orders')} className="mt-4">Back to Orders</Button>
    </div>
  );

  const statusLower = (order.status ?? '').toLowerCase();
  const isCancelled = statusLower === 'cancelled';
  const isPortal = order.source === 'pharmacy_submitted';
  const isCredit = order.paymentMode === 'credit';
  const canGenerateBill = !order.hasBill && ['packed', 'shipped'].includes(statusLower);
  const requiresBillBeforeDelivery = (isPortal || isCredit) && !order.hasBill;
  const stepOrder = ['pending', 'packed', 'shipped', 'delivered'];
  const currentIdx = stepOrder.indexOf(statusLower);
  const steps = isCancelled
    ? [
        { label: 'Pending', icon: Clock, completed: true },
        { label: 'Cancelled', icon: XCircle, completed: true },
      ]
    : [
        { label: 'Pending', icon: Clock, completed: currentIdx >= 0 || statusLower === 'delivered' },
        { label: 'Packed', icon: Box, completed: currentIdx >= 1 || statusLower === 'delivered' },
        { label: 'Shipped', icon: Truck, completed: currentIdx >= 2 || statusLower === 'delivered' },
        { label: 'Delivered', icon: CheckCircle2, completed: statusLower === 'delivered' },
      ];
  const statusColor = statusLower === 'delivered' ? 'bg-green-100 text-green-800' : statusLower === 'cancelled' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800';

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="hide-on-print space-y-6">
        <PageHeader
          title={order.orderNumber}
          breadcrumbs={[{ label: 'Orders', link: '/orders' }, { label: order.orderNumber }]}
          actions={
            <div className="flex space-x-2 items-center">
              <span className="text-sm text-gray-500 mr-2 md:inline hidden">Pharmacy: {order.pharmacyName}</span>
              <Button variant="secondary" leftIcon={<Printer size={16} />} size="sm" onClick={() => window.print()}>Print</Button>
              {isAdmin && (
                <Button variant="secondary" leftIcon={<Copy size={16} />} size="sm" onClick={() => navigate(`/orders/create?duplicateFrom=${order.id}`)}>
                  Copy Order
                </Button>
              )}
              {isAdmin && (
                <>
                  {['pending', 'packed'].includes(statusLower) && !order.hasBill && (
                    <Button variant="danger" leftIcon={<XCircle size={16} />} size="sm" onClick={() => setCancelConfirmOpen(true)} isLoading={cancelOrder.isPending}>Cancel</Button>
                  )}
                  {isPortal && statusLower === 'pending' && !order.approvedAt && (
                    <>
                      <Button variant="primary" size="sm" onClick={() => setIsApproveModalOpen(true)}>Approve</Button>
                      <Button variant="danger" size="sm" onClick={() => setIsRejectModalOpen(true)}>Reject</Button>
                    </>
                  )}
                  {!isPortal && statusLower === 'pending' && (
                    <Button variant="secondary" size="sm" isLoading={finalizeOrder.isPending}
                      onClick={() => finalizeOrder.mutate(id!, { onSuccess: () => toast.success('Order packed'), onError: (e: any) => toast.error(e?.response?.data?.error) })}>
                      Pack Order
                    </Button>
                  )}
                  {isPortal && statusLower === 'pending' && order.approvedAt && (
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => setCancelApprovedOpen(true)}
                      isLoading={cancelApprovedOrder.isPending}
                    >
                      Cancel Approved Order
                    </Button>
                  )}
                  {isPortal && statusLower === 'pending' && order.approvedAt && (
                    <Button variant="secondary" size="sm" isLoading={finalizeOrder.isPending}
                      onClick={() => finalizeOrder.mutate(id!, { onSuccess: () => toast.success('Order packed'), onError: (e: any) => toast.error(e?.response?.data?.error) })}>
                      Pack Order
                    </Button>
                  )}
                  {statusLower === 'packed' && (
                    <Button variant="primary" size="sm" leftIcon={<Truck size={16} />} onClick={() => setIsShipModalOpen(true)}>Ship</Button>
                  )}
                  {['packed', 'shipped'].includes(statusLower) && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        if (requiresBillBeforeDelivery) {
                          toast.error('Generate a bill before recording delivery');
                          return;
                        }
                        setIsDeliveryModalOpen(true);
                      }}
                    >
                      Record Delivery
                    </Button>
                  )}
                </>
              )}
              {(isAdmin || isBiller) && canGenerateBill && (
                <Button variant="secondary" size="sm" leftIcon={<Printer size={16} />} onClick={() => setIsBillModalOpen(true)}>
                  Generate Bill
                </Button>
              )}
              {!isAdmin && isPortal && statusLower === 'pending' && !order.approvedAt && (
                <span className="text-xs text-slate-500">Admin approval required</span>
              )}
            </div>
          }
        />

        {isPortal && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800 flex items-center justify-between">
            <span>Submitted via Pharmacy Portal{order.submittedAt ? ` on ${formatDate(order.submittedAt)}` : ''}</span>
            {sourceBadge(order.source)}
          </div>
        )}
        {order.hasBill && (
          <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{isPortal ? 'Bill generated — pharmacy payable will sync automatically.' : 'Bill generated for this order.'}</span>
          </div>
        )}
        {requiresBillBeforeDelivery && ['packed', 'shipped'].includes(statusLower) && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>Bill required before delivery — auto-generated on pack for credit orders, or use Generate Bill above.</span>
          </div>
        )}
        {order.rejectionReason && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800">
            Rejected: {order.rejectionReason}
          </div>
        )}

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-8 overflow-x-auto">
            {steps.map((step, index) => (
              <React.Fragment key={step.label}>
                <div className="flex flex-col items-center min-w-25">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 ${step.completed ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                    <step.icon size={20} />
                  </div>
                  <span className={`text-xs font-semibold ${step.completed ? 'text-green-600' : 'text-gray-400'}`}>{step.label}</span>
                </div>
                {index < steps.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-4 mt-5 min-w-5 ${steps[index + 1].completed ? 'bg-green-500' : 'bg-gray-200'}`} />
                )}
              </React.Fragment>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 border-t border-gray-100">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase mb-1">Status</p>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColor}`}>{order.status}</span>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase mb-1">Total Amount</p>
              <p className="text-lg font-bold text-gray-900">{formatCurrency(order.totalAmount)}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase mb-1">Date</p>
              <p className="text-sm font-medium text-gray-700">{formatDate(order.orderDate)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-200 overflow-x-auto">
            <nav className="flex flex-nowrap -mb-px px-4 sm:px-6 min-w-max">
              {[
                { id: 'items', label: 'Items & Stock', icon: Package },
                { id: 'actions', label: 'Manage Actions', icon: AlertCircle },
              ].map((tab) => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center py-4 px-2 sm:px-4 border-b-2 font-medium text-sm transition-colors mr-4 sm:mr-8 whitespace-nowrap ${activeTab === tab.id ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
                  <tab.icon className="w-4 h-4 mr-2" /> {tab.label}
                </button>
              ))}
            </nav>
          </div>
          <div className="p-6">
            {activeTab === 'items' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500">Product</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500 text-right">Qty</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500 text-right">Rate</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500 text-right">GST%</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(order.items ?? []).map((item: any) => (
                      <tr key={item.id}>
                        <td className="px-4 py-4">
                          <p className="text-sm font-semibold text-gray-900">{item.productName}</p>
                          <p className="text-xs text-gray-500">Batch: {item.batchNumber || '-'} | Exp: {item.expiryDate ? formatDate(item.expiryDate) : '-'}</p>
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-900 text-right">{item.qty ?? item.quantity}</td>
                        <td className="px-4 py-4 text-sm text-gray-900 text-right">{formatCurrency(item.rate)}</td>
                        <td className="px-4 py-4 text-sm text-gray-500 text-right">{item.gstRate}%</td>
                        <td className="px-4 py-4 text-sm font-semibold text-gray-900 text-right">{formatCurrency(item.lineTotal)}</td>
                      </tr>
                    ))}
                    {(order.items ?? []).length === 0 && (
                      <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No items found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
            {activeTab === 'actions' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {(isAdmin || isBiller) && canGenerateBill && (
                  <div onClick={() => setIsBillModalOpen(true)} className="p-4 border border-gray-200 rounded-lg hover:border-blue-500 cursor-pointer transition-colors group">
                    <h4 className="font-semibold text-gray-900 mb-1 flex items-center group-hover:text-blue-600">
                      <Printer className="w-4 h-4 mr-2" /> Generate Final Bill
                    </h4>
                    <p className="text-xs text-gray-500">Create immutable GST bill snapshot for this order.</p>
                  </div>
                )}
                {statusLower === 'delivered' && isAdmin && (
                  <div onClick={() => setIsReturnModalOpen(true)} className="p-4 border border-gray-200 rounded-lg hover:border-red-500 cursor-pointer transition-colors group">
                    <h4 className="font-semibold text-gray-900 mb-1 flex items-center group-hover:text-red-600">
                      <RotateCcw className="w-4 h-4 mr-2" /> Initiate Return
                    </h4>
                    <p className="text-xs text-gray-500">Return delivered items for credit note.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <RecordDeliveryModal isOpen={isDeliveryModalOpen} onClose={() => setIsDeliveryModalOpen(false)} orderId={id!} />
        <ShipOrderModal isOpen={isShipModalOpen} onClose={() => setIsShipModalOpen(false)} orderId={id!} orderNumber={order.orderNumber} />
        <ApprovePharmacyOrderModal isOpen={isApproveModalOpen} onClose={() => setIsApproveModalOpen(false)} orderId={id!}
          orderNumber={order.orderNumber} pharmacyName={order.pharmacyName} total={order.total ?? order.totalAmount}
          creditInfo={order.creditInfo} items={order.items} />
        <RejectPharmacyOrderModal isOpen={isRejectModalOpen} onClose={() => setIsRejectModalOpen(false)} orderId={id!} orderNumber={order.orderNumber} />
        <GenerateBillModal isOpen={isBillModalOpen} onClose={() => setIsBillModalOpen(false)} orderId={id!} />
        <InitiateReturnModal isOpen={isReturnModalOpen} onClose={() => setIsReturnModalOpen(false)} orderId={id!} />
        <ConfirmDialog
          isOpen={cancelConfirmOpen}
          onClose={() => setCancelConfirmOpen(false)}
          onConfirm={() => {
            cancelOrder.mutate(id!, {
              onSuccess: () => { toast.success('Order cancelled.'); setCancelConfirmOpen(false); },
              onError: (err: any) => {
                const code = err?.response?.data?.code;
                if (code === 'ORDER_HAS_BILL') {
                  toast.error('This order already has a bill. Void or adjust the bill first, then cancel the order.');
                } else {
                  toast.error(err?.response?.data?.error ?? 'Failed to cancel');
                }
                setCancelConfirmOpen(false);
              },
            });
          }}
          title="Cancel Order"
          description={`Are you sure you want to cancel order ${order.orderNumber}? This action cannot be undone.`}
          confirmLabel="Cancel Order"
          confirmVariant="danger"
          isLoading={cancelOrder.isPending}
        />

        <Modal
          isOpen={cancelApprovedOpen}
          onClose={() => setCancelApprovedOpen(false)}
          title="Cancel Approved Order"
          subtitle="Provide a reason. This notifies the pharmacy and reverts the approved portal order."
          size="md"
          footer={
            <>
              <Button variant="secondary" onClick={() => setCancelApprovedOpen(false)} disabled={cancelApprovedOrder.isPending}>
                Back
              </Button>
              <Button
                variant="danger"
                isLoading={cancelApprovedOrder.isPending}
                onClick={async () => {
                  const reason = cancelApprovedReason.trim();
                  if (reason.length < 3) {
                    toast.error('Enter a valid cancellation reason');
                    return;
                  }
                  try {
                    await cancelApprovedOrder.mutateAsync({ id: id!, reason });
                    toast.success('Approved order cancelled');
                    setCancelApprovedOpen(false);
                    setCancelApprovedReason('');
                  } catch (err: any) {
                    toast.error(err?.response?.data?.error ?? 'Failed to cancel approved order');
                  }
                }}
              >
                Confirm Cancel
              </Button>
            </>
          }
        >
          <textarea
            value={cancelApprovedReason}
            onChange={(e) => setCancelApprovedReason(e.target.value)}
            rows={4}
            placeholder="Reason for cancellation..."
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
          />
        </Modal>
      </div>
    </div>
  );
};

export default OrderDetailPage;
