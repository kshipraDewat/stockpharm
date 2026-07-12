import React, { useState } from 'react';
import { Truck } from 'lucide-react';
import Button from '../common/Button';
import Input from '../common/Input';
import Modal from '../common/Modal';
import { useShipOrder } from '../../hooks/useOrders';
import toast from 'react-hot-toast';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  orderNumber?: string;
}

const ShipOrderModal: React.FC<Props> = ({ isOpen, onClose, orderId, orderNumber }) => {
  const [carrier, setCarrier] = useState('');
  const [awb, setAwb] = useState('');
  const shipOrder = useShipOrder();

  const handleSubmit = () => {
    shipOrder.mutate(
      { id: orderId, carrier: carrier || undefined, awb: awb || undefined },
      {
        onSuccess: () => { toast.success('Order marked as shipped'); onClose(); },
        onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Failed to ship order'),
      },
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Ship Order"
      subtitle={`Order ${orderNumber ?? orderId}`}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" leftIcon={<Truck className="w-4 h-4" />} onClick={handleSubmit} isLoading={shipOrder.isPending}>
            Mark Shipped
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input label="Carrier (optional)" value={carrier} onChange={e => setCarrier(e.target.value)} placeholder="e.g. BlueDart" />
        <Input label="AWB / Tracking # (optional)" value={awb} onChange={e => setAwb(e.target.value)} placeholder="Tracking number" />
      </div>
    </Modal>
  );
};

export default ShipOrderModal;
