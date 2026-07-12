import React, { useState, useEffect } from 'react';
import Button from '../common/Button';
import Input from '../common/Input';
import Modal from '../common/Modal';
import { useApproveConnection } from '../../hooks/useStockistConnections';
import { useTenant } from '../../hooks/useSettings';
import { DEFAULT_CREDIT_LIMIT } from '../../lib/constants';
import toast from 'react-hot-toast';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  connectionId: string;
}

const ApproveConnectionModal: React.FC<Props> = ({ isOpen, onClose, connectionId }) => {
  const { data: tenant } = useTenant();
  const [creditLimit, setCreditLimit] = useState(String(DEFAULT_CREDIT_LIMIT));
  const [paymentTermsDays, setPaymentTermsDays] = useState('30');
  const approve = useApproveConnection();

  useEffect(() => {
    try {
      const settings = JSON.parse(tenant?.notificationsJson ?? '{}');
      setCreditLimit(String(settings.defaultCreditLimit ?? DEFAULT_CREDIT_LIMIT));
    } catch { /* keep default */ }
  }, [tenant?.notificationsJson]);

  const handleSubmit = () => {
    approve.mutate(
      { id: connectionId, creditLimit: parseFloat(creditLimit), paymentTermsDays: parseInt(paymentTermsDays) },
      {
        onSuccess: () => { toast.success('Pharmacy connected'); onClose(); },
        onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Failed to approve'),
      },
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Approve Pharmacy Connection"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} isLoading={approve.isPending}>Approve</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input label="Credit Limit (₹)" type="number" value={creditLimit} onChange={e => setCreditLimit(e.target.value)} />
        <Input label="Payment Terms (days)" type="number" value={paymentTermsDays} onChange={e => setPaymentTermsDays(e.target.value)} />
      </div>
    </Modal>
  );
};

export default ApproveConnectionModal;
