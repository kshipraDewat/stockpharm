import React, { useState, useEffect } from 'react';
import SlideOver from '../common/SlideOver';
import Button from '../common/Button';
import Input from '../common/Input';
import { useUpdateSupplier } from '../../hooks/useSuppliers';
import toast from 'react-hot-toast';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  supplier: any;
}

const EditSupplierModal: React.FC<Props> = ({ isOpen, onClose, supplier }) => {
  const update = useUpdateSupplier();
  const [form, setForm] = useState({
    name: '', contactPerson: '', phone: '', email: '',
    address: '', stateCode: '', gstin: '', dlNumber: '',
    paymentTermsDays: '30', status: 'active',
  });

  useEffect(() => {
    if (supplier && isOpen) {
      setForm({
        name: supplier.name ?? '',
        contactPerson: supplier.contactPerson ?? '',
        phone: supplier.phone ?? '',
        email: supplier.email ?? '',
        address: supplier.address ?? '',
        stateCode: supplier.stateCode ?? '',
        gstin: supplier.gstin ?? supplier.gstNumber ?? '',
        dlNumber: supplier.dlNumber ?? '',
        paymentTermsDays: String(supplier.paymentTermsDays ?? '30'),
        status: supplier.status ?? (supplier.isActive ? 'active' : 'inactive'),
      });
    }
  }, [supplier, isOpen]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.phone) {
      toast.error('Name and phone are required.');
      return;
    }
    update.mutate(
      { id: supplier.id, ...form, paymentTermsDays: Number(form.paymentTermsDays) || 30 },
      {
        onSuccess: () => { toast.success('Supplier updated.'); onClose(); },
        onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Failed to update supplier'),
      }
    );
  };

  const inputCls = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 placeholder:text-slate-400';
  const labelCls = 'text-xs font-medium text-slate-600 block mb-1.5';

  return (
    <SlideOver
      isOpen={isOpen}
      onClose={onClose}
      title="Edit Supplier"
      subtitle={supplier?.name}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={handleSubmit} isLoading={update.isPending}>Save Changes</Button>
        </div>
      }
    >
      <form className="p-5 space-y-5" onSubmit={handleSubmit}>
        <section className="space-y-3">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Business Details</p>
          <Input label="Company Name" required value={form.name} onChange={set('name')} />
          <Input label="Contact Person" value={form.contactPerson} onChange={set('contactPerson')} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="GST Number" value={form.gstin} onChange={set('gstin')} />
            <Input label="Drug License (DL)" value={form.dlNumber} onChange={set('dlNumber')} />
          </div>
          <div>
            <label className={labelCls}>Status</label>
            <select className={inputCls} value={form.status} onChange={set('status')}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="blocked">Blocked</option>
            </select>
          </div>
        </section>

        <section className="space-y-3">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Contact</p>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Phone" required value={form.phone} onChange={set('phone')} />
            <Input label="Email" type="email" value={form.email} onChange={set('email')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="State Code" value={form.stateCode} onChange={set('stateCode')} maxLength={2} />
            <div>
              <label className={labelCls}>Payment Terms (days)</label>
              <select className={inputCls} value={form.paymentTermsDays} onChange={set('paymentTermsDays')}>
                <option value="0">Cash on Delivery</option>
                <option value="7">7 Days</option>
                <option value="15">15 Days</option>
                <option value="30">30 Days</option>
                <option value="45">45 Days</option>
                <option value="60">60 Days</option>
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls}>Address</label>
            <textarea className={`${inputCls} h-20 resize-none`} value={form.address} onChange={set('address')} />
          </div>
        </section>
      </form>
    </SlideOver>
  );
};

export default EditSupplierModal;
