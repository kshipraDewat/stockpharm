export function parseEventPayload(payloadJson: unknown): Record<string, any> {
  if (!payloadJson) return {};
  if (typeof payloadJson === 'string') {
    try {
      return JSON.parse(payloadJson);
    } catch {
      return {};
    }
  }
  if (typeof payloadJson === 'object') return payloadJson as Record<string, any>;
  return {};
}

/** Deep-link path for stockist-panel cross-tenant event notifications. */
export function getStockistEventPath(event: {
  eventType?: string;
  payloadJson?: unknown;
  payload?: unknown;
}): string | null {
  const payload = parseEventPayload(event.payloadJson ?? event.payload);
  const type = String(event.eventType ?? '').toLowerCase();

  switch (type) {
    case 'payment.recorded': {
      const allocations = payload.allocations as { externalBillId?: string }[] | undefined;
      const billId = allocations?.[0]?.externalBillId;
      if (billId) return `/bills/${billId}`;
      return '/payments';
    }
    case 'payment.voided':
      return '/payments';
    case 'order.cancel_requested':
    case 'order.submitted':
    case 'order.received':
    case 'order.partially_received': {
      const orderId = (payload.externalOrderId ?? payload.stockistOrderId ?? payload.orderId) as string | undefined;
      return orderId ? `/orders/${orderId}` : '/orders';
    }
    case 'return.requested': {
      const orderId = payload.orderId as string | undefined;
      return orderId ? `/orders/${orderId}` : '/returns';
    }
    case 'connection.withdrawn':
      return '/pharmacies';
    default:
      return null;
  }
}

/** Deep-link path for pharmacy-panel cross-tenant event notifications. */
export function getPharmacyEventPath(event: {
  eventType?: string;
  payloadJson?: unknown;
  payload?: unknown;
}): string | null {
  const payload = parseEventPayload(event.payloadJson ?? event.payload);
  const type = String(event.eventType ?? '').toLowerCase();
  const poId = (payload.externalPharmacyOrderId ?? payload.purchaseOrderId ?? payload.poId) as
    | string
    | undefined;

  switch (type) {
    case 'order.accepted':
    case 'order.rejected':
    case 'order.packed':
    case 'order.shipped':
    case 'order.delivered':
    case 'order.cancelled':
      return poId ? `/pharmacy/purchase-orders/${poId}` : '/pharmacy/purchase-orders';
    case 'bill.generated':
      if (poId) return `/pharmacy/purchase-orders/${poId}`;
      if (payload.billNumber) {
        return `/pharmacy/payable-bills?search=${encodeURIComponent(String(payload.billNumber))}`;
      }
      return '/pharmacy/payable-bills';
    case 'payment.recorded':
    case 'payment.voided':
      return '/pharmacy/payments';
    case 'return.accepted':
    case 'return.rejected':
    case 'return.processed': {
      const returnId = payload.returnId as string | undefined;
      return returnId ? `/pharmacy/returns/${returnId}` : '/pharmacy/returns';
    }
    case 'connection.approved':
    case 'connection.rejected':
    case 'connection.disconnected':
    case 'catalog.changed': {
      const connectionId = payload.connectionId as string | undefined;
      return connectionId ? `/pharmacy/stockists/${connectionId}` : '/pharmacy/stockists';
    }
    default:
      return null;
  }
}
