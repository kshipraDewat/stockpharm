import React, { useState } from 'react';
import Button from '../common/Button';
import Modal from '../common/Modal';
import { useRejectConnection } from '../../hooks/useStockistConnections';
import toast from 'react-hot-toast';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  connectionId: string;
}

const CANNED_REASONS = [
  'GSTIN verification failed',
  'Pharmacy details are incomplete',
  'Service area not supported',
  'Existing active agreement prevents connection',
  'Credit policy requirements not met',
];

const RejectConnectionModal: React.FC<Props> = ({ isOpen, onClose, connectionId }) => {
  const [selectedReason, setSelectedReason] = useState(CANNED_REASONS[0]);
  const [otherReason, setOtherReason] = useState('');
  const reject = useRejectConnection();

  const handleSubmit = () => {
    const reason = selectedReason === 'Other' ? otherReason.trim() : selectedReason;
    if (reason.length < 3) { toast.error('Reason required'); return; }
    reject.mutate(
      { id: connectionId, reason },
      {
        onSuccess: () => {
          toast.success('Connection rejected');
          setSelectedReason(CANNED_REASONS[0]);
          setOtherReason('');
          onClose();
        },
        onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Failed'),
      },
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Reject Connection"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="danger" onClick={handleSubmit} isLoading={reject.isPending}>Reject</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">Reason</label>
          <select
            className="w-full border border-slate-200 rounded-lg p-2.5 text-sm"
            value={selectedReason}
            onChange={(e) => setSelectedReason(e.target.value)}
          >
            {CANNED_REASONS.map((reason) => (
              <option key={reason} value={reason}>{reason}</option>
            ))}
            <option value="Other">Other</option>
          </select>
        </div>
        {selectedReason === 'Other' && (
          <textarea
            className="w-full border border-slate-200 rounded-lg p-3 text-sm min-h-24"
            placeholder="Enter custom rejection reason"
            value={otherReason}
            onChange={e => setOtherReason(e.target.value)}
          />
        )}
      </div>
    </Modal>
  );
};

export default RejectConnectionModal;
