import React, { useState, useEffect } from 'react';
import SlideOver from '../common/SlideOver';
import Button from '../common/Button';
import Input from '../common/Input';
import { useUpdatePurchase } from '../../hooks/usePurchases';
import { useSuppliers } from '../../hooks/useSuppliers';
import toast from 'react-hot-toast';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  purchase: {
    id: string;
    supplierId?: string;
    supplierInvoiceNo?: string;
    invoiceDate?: string;
    notes?: string;
  };
}

const EditPurchaseModal: React.FC<Props> = ({ isOpen, onClose, purchase }) => {
  const update = useUpdatePurchase();
  const { data: suppliersData } = useSuppliers({});
  const suppliers = suppliersData?.data ?? suppliersData ?? [];

  const [supplierId, setSupplierId] = useState(purchase.supplierId ?? '');
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState(purchase.supplierInvoiceNo ?? '');
  const [invoiceDate, setInvoiceDate] = useState(purchase.invoiceDate ?? '');
  const [notes, setNotes] = useState(purchase.notes ?? '');

  useEffect(() => {
    if (isOpen) {
      setSupplierId(purchase.supplierId ?? '');
      setSupplierInvoiceNo(purchase.supplierInvoiceNo ?? '');
      setInvoiceDate(purchase.invoiceDate ?? '');
      setNotes(purchase.notes ?? '');
    }
  }, [isOpen, purchase]);

  const handleSave = () => {
    update.mutate({
      id: purchase.id,
      supplierId: supplierId || undefined,
      supplierInvoiceNo: supplierInvoiceNo || undefined,
      invoiceDate: invoiceDate || undefined,
      notes: notes || undefined,
    }, {
      onSuccess: () => { toast.success('Purchase updated'); onClose(); },
      onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Update failed'),
    });
  };

  const selectCls = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-500';

  return (
    <SlideOver
      isOpen={isOpen}
      onClose={onClose}
      title="Edit Purchase"
      subtitle="Update supplier invoice details"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={handleSave} isLoading={update.isPending}>Save</Button>
        </div>
      }
    >
      <div className="p-5 space-y-4">
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1.5">Supplier</label>
          <select className={selectCls} value={supplierId} onChange={e => setSupplierId(e.target.value)}>
            <option value="">Select supplier</option>
            {(suppliers as any[]).map((s: any) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <Input label="Supplier Invoice No." value={supplierInvoiceNo} onChange={e => setSupplierInvoiceNo(e.target.value)} />
        <Input label="Invoice Date" type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} />
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1.5">Notes</label>
          <textarea className={selectCls} rows={3} value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
      </div>
    </SlideOver>
  );
};

export default EditPurchaseModal;
