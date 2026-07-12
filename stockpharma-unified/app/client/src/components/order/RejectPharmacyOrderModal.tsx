import React, { useState } from 'react';
import Button from '../common/Button';
import Modal from '../common/Modal';
import { useRejectPharmacyOrder } from '../../hooks/useOrders';
import toast from 'react-hot-toast';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  orderNumber?: string;
}

const RejectPharmacyOrderModal: React.FC<Props> = ({ isOpen, onClose, orderId, orderNumber }) => {
  const [reason, setReason] = useState('');
  const reject = useRejectPharmacyOrder();

  const handleReject = () => {
    if (reason.trim().length < 3) { toast.error('Please provide a rejection reason'); return; }
    reject.mutate(
      { id: orderId, reason },
      {
        onSuccess: () => { toast.success('Order rejected'); setReason(''); onClose(); },
        onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Failed to reject'),
      },
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Reject Portal Order"
      subtitle={orderNumber ? `Order ${orderNumber}` : undefined}
      size="md"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="danger" onClick={handleReject} isLoading={reject.isPending}>Reject Order</Button>
        </>
      )}
    >
      <textarea
        className="w-full border border-slate-200 rounded-lg p-3 text-sm min-h-24 focus:outline-none focus:ring-2 focus:ring-blue-500"
        placeholder="Rejection reason (required, min 3 characters)"
        value={reason}
        onChange={e => setReason(e.target.value)}
      />
    </Modal>
  );
};

export default RejectPharmacyOrderModal;
