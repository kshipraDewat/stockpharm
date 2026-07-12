import React, { useState, useEffect } from 'react';
import SlideOver from '../common/SlideOver';
import Button from '../common/Button';
import Input from '../common/Input';
import { useUpdateProduct, useProductCategories, useProducts } from '../../hooks/useProducts';
import toast from 'react-hot-toast';
import { validateHsn, validateProductPrices } from '../../lib/validation';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  product: any;
}

const SCHEDULES = ['NONE', 'H', 'H1', 'X', 'NDPS'];

const EditProductModal: React.FC<Props> = ({ isOpen, onClose, product }) => {
  const update = useUpdateProduct();
  const { data: catData } = useProductCategories();
  const { data: productsData } = useProducts({ pageSize: 500 });
  const categoriesList = (catData && catData.length > 0 ? catData : []) as string[];
  const manufacturers = [...new Set(((productsData?.data ?? productsData ?? []) as { manufacturer?: string }[]).map(p => p.manufacturer).filter(Boolean))] as string[];

  const [form, setForm] = useState({
    name: '', genericName: '', manufacturer: '', category: '',
    hsnCode: '', scheduleType: 'NONE', packSize: '10',
    gstRate: '12', mrp: '', purchaseRate: '', saleRate: '',
    minStockLevel: '10',
  });

  useEffect(() => {
    if (product && isOpen) {
      setForm({
        name: product.name ?? '',
        genericName: product.genericName ?? '',
        manufacturer: product.manufacturer ?? '',
        category: product.category ?? '',
        hsnCode: product.hsnCode ?? '',
        scheduleType: product.scheduleType ?? 'NONE',
        packSize: String(product.packSize ?? '10'),
        gstRate: String(product.gstRate ?? '12'),
        mrp: String(product.mrp ?? ''),
        purchaseRate: String(product.purchaseRate ?? ''),
        saleRate: String(product.saleRate ?? ''),
        minStockLevel: String(product.minStockLevel ?? '10'),
      });
    }
  }, [product, isOpen]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.mrp || !form.purchaseRate || !form.saleRate) {
      toast.error('Name, MRP, purchase rate and sale rate are required.');
      return;
    }
    const hsnErr = validateHsn(form.hsnCode);
    if (hsnErr) { toast.error(hsnErr); return; }
    const priceErr = validateProductPrices(Number(form.mrp), Number(form.purchaseRate), Number(form.saleRate));
    if (priceErr) { toast.error(priceErr); return; }
    update.mutate(
      {
        id: product.id,
        ...form,
        gstRate: Number(form.gstRate),
        mrp: Number(form.mrp),
        purchaseRate: Number(form.purchaseRate),
        saleRate: Number(form.saleRate),
        minStockLevel: Number(form.minStockLevel) || 10,
      },
      {
        onSuccess: () => { toast.success('Product updated.'); onClose(); },
        onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Failed to update product'),
      }
    );
  };

  const selectCls = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-500';

  return (
    <SlideOver
      isOpen={isOpen}
      onClose={onClose}
      title="Edit Product"
      subtitle={product?.name}
      width="lg"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={handleSubmit} isLoading={update.isPending}>Save Changes</Button>
        </div>
      }
    >
      <form className="p-5 space-y-5" onSubmit={handleSubmit}>
        <section className="space-y-3">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Product Info</p>
          <Input label="Medicine / Product Name" required value={form.name} onChange={set('name')} />
          <Input label="Generic Name" value={form.genericName} onChange={set('genericName')} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Input label="Manufacturer" list="edit-manufacturer-list" value={form.manufacturer} onChange={set('manufacturer')} />
              <datalist id="edit-manufacturer-list">
                {manufacturers.map(m => <option key={m} value={m} />)}
              </datalist>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1.5">Category</label>
              {categoriesList.length > 0 ? (
                <select className={selectCls} value={form.category} onChange={set('category')} required>
                  <option value="">Select category</option>
                  {categoriesList.map((c: string) => <option key={c} value={c}>{c}</option>)}
                </select>
              ) : (
                <Input placeholder="Category" required value={form.category} onChange={set('category')} />
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="HSN Code" value={form.hsnCode} onChange={set('hsnCode')} />
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1.5">Schedule</label>
              <select className={selectCls} value={form.scheduleType} onChange={set('scheduleType')}>
                {SCHEDULES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Pack Size" value={form.packSize} onChange={set('packSize')} />
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1.5">GST Rate (%)</label>
              <select className={selectCls} value={form.gstRate} onChange={set('gstRate')}>
                {['0', '5', '12', '18', '28'].map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Pricing</p>
          <div className="grid grid-cols-3 gap-3">
            <Input label="MRP (₹)" type="number" required value={form.mrp} onChange={set('mrp')} />
            <Input label="Purchase Rate (₹)" type="number" required value={form.purchaseRate} onChange={set('purchaseRate')} />
            <Input label="Sale Rate (₹)" type="number" required value={form.saleRate} onChange={set('saleRate')} />
          </div>
        </section>

        <section className="space-y-3">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Inventory</p>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Min Stock Level" type="number" value={form.minStockLevel} onChange={set('minStockLevel')} />
          </div>
        </section>
      </form>
    </SlideOver>
  );
};

export default EditProductModal;
