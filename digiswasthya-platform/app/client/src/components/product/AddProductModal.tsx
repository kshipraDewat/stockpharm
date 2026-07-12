import React, { useState } from 'react';
import SlideOver from '../common/SlideOver';
import Button from '../common/Button';
import Input from '../common/Input';
import { useCreateProduct, useProductCategories, useProducts } from '../../hooks/useProducts';
import toast from 'react-hot-toast';
import { validateHsn, validateProductPrices } from '../../lib/validation';

interface Props { isOpen: boolean; onClose: () => void; }

const SCHEDULES = ['NONE', 'H', 'H1', 'X', 'NDPS'];

const EMPTY = {
  name: '', genericName: '', manufacturer: '', category: '',
  hsnCode: '', scheduleType: 'NONE', packSize: '10',
  baseUnit: 'Tab', saleUnit: 'Strip', convFactor: '10',
  schemeBase: '', schemeBonus: '',
  gstRate: '12', mrp: '', purchaseRate: '', saleRate: '',
  minStockLevel: '10', isActive: 'true',
};

const AddProductModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const create = useCreateProduct();
  const { data: catData } = useProductCategories();
  const { data: productsData } = useProducts({ pageSize: 500 });
  const categoriesList = (catData && catData.length > 0 ? catData : []) as string[];
  const manufacturers = [...new Set(((productsData?.data ?? productsData ?? []) as { manufacturer?: string }[]).map(p => p.manufacturer).filter(Boolean))] as string[];

  const [form, setForm] = useState(EMPTY);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.category || !form.mrp || !form.purchaseRate || !form.saleRate) {
      toast.error('Name, category, MRP, purchase rate and sale rate are required.');
      return;
    }
    const hsnErr = validateHsn(form.hsnCode);
    if (hsnErr) { toast.error(hsnErr); return; }
    const priceErr = validateProductPrices(Number(form.mrp), Number(form.purchaseRate), Number(form.saleRate));
    if (priceErr) { toast.error(priceErr); return; }
    create.mutate(
      {
        ...form,
        gstRate: Number(form.gstRate),
        mrp: Number(form.mrp),
        purchaseRate: Number(form.purchaseRate),
        saleRate: Number(form.saleRate),
        minStockLevel: Number(form.minStockLevel) || 10,
        packSize: String(form.packSize),
        convFactor: Number(form.convFactor) || 10,
        schemeBase: form.schemeBase ? Number(form.schemeBase) : undefined,
        schemeBonus: form.schemeBonus ? Number(form.schemeBonus) : undefined,
        isActive: form.isActive === 'true',
      },
      {
        onSuccess: () => { toast.success('Product added.'); onClose(); setForm(EMPTY); },
        onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Failed to add product'),
      }
    );
  };

  const selectCls = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-500';

  return (
    <SlideOver
      isOpen={isOpen}
      onClose={onClose}
      title="Add Product"
      subtitle="Catalogue a new medicine or product"
      width="lg"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={handleSubmit} isLoading={create.isPending}>Add to Catalogue</Button>
        </div>
      }
    >
      <form className="p-5 space-y-5" onSubmit={handleSubmit}>
        <section className="space-y-3">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Product Info</p>
          <Input label="Medicine / Product Name" placeholder="Product name" required value={form.name} onChange={set('name')} />
          <Input label="Generic Name" placeholder="Generic / salt name" value={form.genericName} onChange={set('genericName')} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Input label="Manufacturer" placeholder="Manufacturer" list="manufacturer-list" value={form.manufacturer} onChange={set('manufacturer')} />
              <datalist id="manufacturer-list">
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
            <Input label="HSN Code" placeholder="3004" value={form.hsnCode} onChange={set('hsnCode')} />
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1.5">Schedule</label>
              <select className={selectCls} value={form.scheduleType} onChange={set('scheduleType')}>
                {SCHEDULES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Pack Size" type="number" placeholder="e.g. 10" value={form.packSize} onChange={set('packSize')} />
            <Input label="Conv. Factor" type="number" placeholder="10" value={form.convFactor} onChange={set('convFactor')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Base Unit" placeholder="Tab" value={form.baseUnit} onChange={set('baseUnit')} />
            <Input label="Sale Unit" placeholder="Strip" value={form.saleUnit} onChange={set('saleUnit')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Scheme Base" type="number" placeholder="e.g. 10" value={form.schemeBase} onChange={set('schemeBase')} />
            <Input label="Scheme Bonus" type="number" placeholder="e.g. 1" value={form.schemeBonus} onChange={set('schemeBonus')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1.5">GST Rate (%)</label>
              <select className={selectCls} value={form.gstRate} onChange={set('gstRate')}>
                {['0', '5', '12', '18', '28'].map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1.5">Status</label>
              <select className={selectCls} value={form.isActive} onChange={set('isActive')}>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Pricing</p>
          <div className="grid grid-cols-3 gap-3">
            <Input label="MRP (₹)" type="number" placeholder="0.00" required value={form.mrp} onChange={set('mrp')} />
            <Input label="Purchase Rate (₹)" type="number" placeholder="0.00" required value={form.purchaseRate} onChange={set('purchaseRate')} />
            <Input label="Sale Rate (₹)" type="number" placeholder="0.00" required value={form.saleRate} onChange={set('saleRate')} />
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

export default AddProductModal;
