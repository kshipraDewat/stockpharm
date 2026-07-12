import React, { useState } from 'react';
import SlideOver from '../common/SlideOver';
import Button from '../common/Button';
import Input from '../common/Input';
import { useCreateSupplier } from '../../hooks/useSuppliers';
import toast from 'react-hot-toast';

interface Props { isOpen: boolean; onClose: () => void; }

const EMPTY = {
  name: '', contactPerson: '', phone: '', email: '',
  address: '', stateCode: '', gstin: '', dlNumber: '',
  paymentTermsDays: '30',
};

const AddSupplierModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const create = useCreateSupplier();
  const [form, setForm] = useState(EMPTY);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.phone || !form.stateCode || !form.contactPerson || !form.address) {
      toast.error('Name, contact person, phone, address and state code are required.');
      return;
    }
    const payload: Record<string, unknown> = {
      name: form.name,
      contactPerson: form.contactPerson,
      phone: form.phone,
      address: form.address,
      stateCode: form.stateCode,
      gstin: form.gstin || undefined,
      dlNumber: form.dlNumber || undefined,
      paymentTermsDays: Number(form.paymentTermsDays) || 30,
    };
    if (form.email.trim()) payload.email = form.email.trim();
    create.mutate(
      payload,
      {
        onSuccess: () => { toast.success('Supplier added.'); onClose(); setForm(EMPTY); },
        onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Failed to add supplier'),
      }
    );
  };

  const inputCls = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 placeholder:text-slate-400';
  const labelCls = 'text-xs font-medium text-slate-600 block mb-1.5';

  return (
    <SlideOver
      isOpen={isOpen}
      onClose={onClose}
      title="Add Supplier"
      subtitle="Add a new pharmaceutical supplier"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={handleSubmit} isLoading={create.isPending}>Save Supplier</Button>
        </div>
      }
    >
      <form className="p-5 space-y-5" onSubmit={handleSubmit}>
        <section className="space-y-3">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Business Details</p>
          <Input label="Company Name" placeholder="Supplier name" required value={form.name} onChange={set('name')} />
          <Input label="Contact Person" placeholder="Full name" required value={form.contactPerson} onChange={set('contactPerson')} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="GST Number" placeholder="15-character GSTIN" value={form.gstin} onChange={set('gstin')} />
            <Input label="Drug License (DL)" placeholder="DL-12345/RJ/2024" value={form.dlNumber} onChange={set('dlNumber')} />
          </div>
        </section>

        <section className="space-y-3">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Contact</p>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Phone" required value={form.phone} onChange={set('phone')} />
            <Input label="Email" type="email" value={form.email} onChange={set('email')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="State Code" placeholder="08" required value={form.stateCode} onChange={set('stateCode')} maxLength={2} />
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
            <textarea className={`${inputCls} h-20 resize-none`} placeholder="Full address..." required value={form.address} onChange={set('address')} />
          </div>
        </section>
      </form>
    </SlideOver>
  );
};

export default AddSupplierModal;
