import React, { useState, useEffect } from 'react';
import SlideOver from '../common/SlideOver';
import Button from '../common/Button';
import Input from '../common/Input';
import { useUpdatePharmacy } from '../../hooks/usePharmacies';
import toast from 'react-hot-toast';
import { validatePhone, validateStateCode, validateGstin, validateEmail, normalizePhone } from '../../lib/validation';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  pharmacy: any;
}

const TERMS = [
  { label: 'Cash on Delivery', value: '0' },
  { label: '7 Days (Net 7)',   value: '7' },
  { label: '15 Days (Net 15)', value: '15' },
  { label: '30 Days (Net 30)', value: '30' },
];

const EditPharmacyModal: React.FC<Props> = ({ isOpen, onClose, pharmacy }) => {
  const update = useUpdatePharmacy();

  const [form, setForm] = useState({
    name: '', contactPerson: '', gstNumber: '', dlNumber: '',
    creditLimit: '', creditDays: '30', phone: '', email: '', address: '',
    status: 'active', stateCode: '08', openingBalance: '',
  });

  useEffect(() => {
    if (pharmacy && isOpen) {
      setForm({
        name: pharmacy.name ?? '',
        contactPerson: pharmacy.contactPerson ?? '',
        gstNumber: pharmacy.gstNumber ?? pharmacy.gstin ?? '',
        dlNumber: pharmacy.dlNumber ?? '',
        creditLimit: String(pharmacy.creditLimit ?? ''),
        creditDays: String(pharmacy.creditDays ?? pharmacy.paymentTermsDays ?? '30'),
        phone: pharmacy.phone ?? '',
        email: pharmacy.email ?? '',
        address: pharmacy.address ?? '',
        status: pharmacy.status ?? 'active',
        stateCode: pharmacy.stateCode ?? '08',
        openingBalance: String(pharmacy.openingBalance ?? ''),
      });
    }
  }, [pharmacy, isOpen]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.phone) {
      toast.error('Name and phone are required.');
      return;
    }
    const phoneErr = validatePhone(form.phone);
    if (phoneErr) { toast.error(phoneErr); return; }
    const stateErr = validateStateCode(form.stateCode);
    if (stateErr) { toast.error(stateErr); return; }
    const gstErr = validateGstin(form.gstNumber);
    if (gstErr) { toast.error(gstErr); return; }
    if (form.email) {
      const emailErr = validateEmail(form.email);
      if (emailErr) { toast.error(emailErr); return; }
    }
    if (form.status === 'inactive' && pharmacy.status === 'active') {
      if (!window.confirm(`Deactivate ${pharmacy.name}? They will no longer receive new orders.`)) return;
    }
    update.mutate(
      { 
        id: pharmacy.id, 
        ...form,
        phone: normalizePhone(form.phone),
        creditLimit: Number(form.creditLimit) || 0, 
        creditDays: Number(form.creditDays) || 30,
        paymentTermsDays: Number(form.creditDays) || 30,
        gstin: form.gstNumber || undefined,
        stateCode: form.stateCode || '08',
        openingBalance: Number(form.openingBalance) || 0,
      },
      {
        onSuccess: () => { toast.success('Pharmacy updated.'); onClose(); },
        onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Failed to update pharmacy'),
      }
    );
  };

  const inputCls = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 placeholder:text-slate-400';
  const labelCls = 'text-xs font-medium text-slate-600 block mb-1.5';

  return (
    <SlideOver
      isOpen={isOpen}
      onClose={onClose}
      title="Edit Pharmacy"
      subtitle={pharmacy?.name}
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
          <Input label="Pharmacy Name" required value={form.name} onChange={set('name')} />
          <Input label="Owner / Contact Person" value={form.contactPerson} onChange={set('contactPerson')} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="GSTIN" placeholder="15-character GSTIN" value={form.gstNumber} onChange={set('gstNumber')} />
            <Input label="State Code" placeholder="08" value={form.stateCode} onChange={set('stateCode')} />
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
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Compliance & Credit</p>
          <Input label="Drug License (DL)" placeholder="DL-12345/RJ/2024" value={form.dlNumber} onChange={set('dlNumber')} />
          <div className="grid grid-cols-3 gap-3">
            <Input label="Credit Limit (₹)" type="number" placeholder="0" value={form.creditLimit} onChange={set('creditLimit')} />
            <Input label="Opening Bal (₹)" type="number" placeholder="0" value={form.openingBalance} onChange={set('openingBalance')} />
            <div>
              <label className={labelCls}>Payment Terms</label>
              <select className={inputCls} value={form.creditDays} onChange={set('creditDays')}>
                {TERMS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Contact</p>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Phone" required value={form.phone} onChange={set('phone')} />
            <Input label="Email" type="email" value={form.email} onChange={set('email')} />
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

export default EditPharmacyModal;
