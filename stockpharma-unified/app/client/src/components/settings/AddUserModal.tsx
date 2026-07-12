import React, { useState } from 'react';
import { UserPlus } from 'lucide-react';
import Button from '../common/Button';
import Input from '../common/Input';
import Modal from '../common/Modal';
import { useCreateUser } from '../../hooks/useUsers';
import toast from 'react-hot-toast';
import { validateEmail, validatePassword } from '../../lib/validation';

interface AddUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantType?: 'stockist' | 'pharmacy';
}

const AddUserModal: React.FC<AddUserModalProps> = ({ isOpen, onClose, tenantType = 'stockist' }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<string>(tenantType === 'pharmacy' ? 'pharmacist' : 'biller');

  const createUser = useCreateUser();

  const handleSave = () => {
    if (!name || !email || !password) {
      toast.error('Please fill in all fields');
      return;
    }
    const emailErr = validateEmail(email);
    if (emailErr) { toast.error(emailErr); return; }
    const pwErr = validatePassword(password);
    if (pwErr) { toast.error(pwErr); return; }
    createUser.mutate({ name, email, password, role }, {
      onSuccess: () => {
        toast.success('User added successfully');
        setName(''); setEmail(''); setPassword(''); setRole(tenantType === 'pharmacy' ? 'pharmacist' : 'biller');
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
      subtitle="Create a new user account."
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" leftIcon={<UserPlus className="w-4 h-4" />} onClick={handleSave} isLoading={createUser.isPending}>
            Add User
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input label="Full Name" placeholder="e.g. John Doe" value={name} onChange={e => setName(e.target.value)} required />
        <Input label="Email Address" type="email" placeholder="e.g. john@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
        <Input label="Password" type="password" placeholder="Minimum 8 characters" value={password} onChange={e => setPassword(e.target.value)} required />
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
          <select className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
            value={role} onChange={e => setRole(e.target.value)}>
            {tenantType === 'pharmacy' ? (
              <>
                <option value="admin">Admin / Owner</option>
                <option value="pharmacist">Pharmacist</option>
                <option value="cashier">Cashier</option>
              </>
            ) : (
              <>
                <option value="admin">Admin</option>
                <option value="biller">Biller / Staff</option>
              </>
            )}
          </select>
        </div>
      </div>
    </Modal>
  );
};

export default AddUserModal;
