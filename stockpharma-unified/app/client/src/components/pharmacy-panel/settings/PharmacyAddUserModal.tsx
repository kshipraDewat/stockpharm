import React, { useState } from 'react';
import Button from '../../common/Button';
import Input from '../../common/Input';
import Modal from '../../common/Modal';
import { useCreateUser } from '../../../hooks/useUsers';
import toast from 'react-hot-toast';
import { validateEmail, validatePassword } from '../../../lib/validation';

interface PharmacyAddUserModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PharmacyAddUserModal: React.FC<PharmacyAddUserModalProps> = ({ isOpen, onClose }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'pharmacist' | 'cashier'>('pharmacist');
  const createUser = useCreateUser();

  const handleSave = () => {
    if (!name || !email || !password) { toast.error('Please fill in all fields'); return; }
    const emailErr = validateEmail(email);
    if (emailErr) { toast.error(emailErr); return; }
    const pwErr = validatePassword(password);
    if (pwErr) { toast.error(pwErr); return; }
    createUser.mutate({ name, email, password, role }, {
      onSuccess: () => {
        toast.success('User added');
        setName('');
        setEmail('');
        setPassword('');
        setRole('pharmacist');
        onClose();
      },
      onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Failed to add user'),
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add Staff User"
      subtitle="Pharmacist or cashier account"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" className="!bg-teal-600 hover:!bg-teal-700" onClick={handleSave} isLoading={createUser.isPending}>
            Add User
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input label="Full Name" value={name} onChange={e => setName(e.target.value)} required />
        <Input label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
        <Input label="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
          <select className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" value={role} onChange={e => setRole(e.target.value as typeof role)}>
            <option value="admin">Admin</option>
            <option value="pharmacist">Pharmacist</option>
            <option value="cashier">Cashier</option>
          </select>
        </div>
      </div>
    </Modal>
  );
};

export default PharmacyAddUserModal;
