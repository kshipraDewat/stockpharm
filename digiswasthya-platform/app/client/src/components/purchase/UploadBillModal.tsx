import React, { useState, useRef } from 'react';
import { UploadCloud, AlertCircle, Sparkles, Loader2, Plus, Trash2 } from 'lucide-react';
import Button from '../common/Button';
import SlideOver from '../common/SlideOver';
import { useSuppliers } from '../../hooks/useSuppliers';
import { useProducts } from '../../hooks/useProducts';
import { useCreatePurchase, useParseInvoiceAi } from '../../hooks/usePurchases';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { parseExpiryToIso } from '../../lib/validation';
import SetSaleRatesModal, { type SaleRateProduct } from './SetSaleRatesModal';
import { useFeatures } from '../../hooks/useSettings';

interface LineItem {
  productId: string;
  productName: string;   // display only
  batchNumber: string;
  expiryDate: string;
  qty: string;
  freeQty: string;
  mrp: string;
  purchaseRate: string;
  gstRate: string;
}

const EMPTY_LINE: LineItem = {
  productId: '', productName: '', batchNumber: '', expiryDate: '',
  qty: '', freeQty: '0', mrp: '', purchaseRate: '', gstRate: '12',
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialProductId?: string;
  initialQty?: number;
}

const UploadBillModal: React.FC<Props> = ({ isOpen, onClose, initialProductId, initialQty }) => {
  const navigate = useNavigate();
  const [entryMode, setEntryMode] = useState<'upload' | 'manual'>('upload');
  const [supplierId, setSupplierId] = useState('');
  const [supplierSearch, setSupplierSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState('');  // fixed: was invoiceNumber
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [items, setItems] = useState<LineItem[]>([{ ...EMPTY_LINE }]);
  const [saleRateProducts, setSaleRateProducts] = useState<SaleRateProduct[]>([]);
  const [pendingPurchaseId, setPendingPurchaseId] = useState<string | null>(null);
  const [showSaleRates, setShowSaleRates] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: suppliersData } = useSuppliers({});
  const suppliers = suppliersData?.data ?? suppliersData ?? [];

  const { data: productsData } = useProducts({ pageSize: 500 });
  const products = productsData?.data ?? productsData ?? [];

  const filteredSuppliers = (suppliers as any[]).filter((s: any) =>
    !supplierSearch || s.name?.toLowerCase().includes(supplierSearch.toLowerCase()));
  const filteredProducts = (products as any[]).filter((p: any) =>
    !productSearch || p.name?.toLowerCase().includes(productSearch.toLowerCase())
      || p.genericName?.toLowerCase().includes(productSearch.toLowerCase()));
  const createPurchase = useCreatePurchase();
  const parseAi = useParseInvoiceAi();
  const { data: features } = useFeatures();
  const aiEnabled = features?.aiParse ?? false;

  // The Upload PDF tab only produces items via AI. When AI parsing is disabled it's a
  // dead-end, so start users in Manual Entry (unless we were opened for a specific product).
  React.useEffect(() => {
    if (isOpen && features && !aiEnabled && !initialProductId) setEntryMode('manual');
  }, [isOpen, features, aiEnabled, initialProductId]);

  React.useEffect(() => {
    if (isOpen && initialProductId) {
      const p = (products as any[]).find((x: any) => x.id === initialProductId);
      setEntryMode('manual');
      setItems([{
        ...EMPTY_LINE,
        productId: initialProductId,
        productName: p?.name ?? '',
        qty: initialQty ? String(initialQty) : '',
        gstRate: String(p?.gstRate ?? 12),
        mrp: p?.mrp ? String(p.mrp) : '',
        purchaseRate: p?.purchaseRate ? String(p.purchaseRate) : '',
      }]);
    }
  }, [isOpen, initialProductId, initialQty, products]);

  const addItem = () => setItems(prev => [...prev, { ...EMPTY_LINE }]);
  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));

  const updateItem = (idx: number, field: keyof LineItem, val: string) => {
    setItems(prev => {
      const n = [...prev];
      n[idx] = { ...n[idx], [field]: val };
      // When product selected, auto-fill name
      if (field === 'productId') {
        const p = (products as any[]).find((x: any) => x.id === val);
        if (p) {
          n[idx].productName = p.name;
          if (!n[idx].gstRate) n[idx].gstRate = String(p.gstRate ?? 12);
          if (!n[idx].mrp) n[idx].mrp = String(p.mrp ?? '');
          if (!n[idx].purchaseRate) n[idx].purchaseRate = String(p.purchaseRate ?? p.ptr ?? '');
        }
      }
      return n;
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) setSelectedFile(file);
  };

  const handleAiParse = async () => {
    if (!selectedFile) { toast.error('Upload a file first'); return; }
    try {
      const result = await parseAi.mutateAsync(selectedFile);
      if (result.items) {
        setItems(result.items.map((i: any) => ({
          productId: i.productId ?? '',
          productName: i.productName ?? '',
          batchNumber: i.batchNumber ?? '',
          expiryDate: parseExpiryToIso(i.expiryDate ?? ''),
          qty: String(i.qty ?? i.quantity ?? ''),
          freeQty: String(i.freeQty ?? '0'),
          mrp: String(i.mrp ?? i.rate ?? ''),
          purchaseRate: String(i.purchaseRate ?? i.rate ?? ''),
          gstRate: String(i.gstRate ?? '12'),
        })));
        if (result.supplierInvoiceNo ?? result.invoiceNumber) {
          setSupplierInvoiceNo(result.supplierInvoiceNo ?? result.invoiceNumber);
        }
        if (result.invoiceDate) setInvoiceDate(result.invoiceDate);
        toast.success('Bill parsed by AI!');
        setEntryMode('manual');
      }
    } catch {
      toast.error('AI parse failed — enter details manually');
    }
  };

  const handleSave = () => {
    if (!supplierId) { toast.error('Select a supplier from the dropdown'); return; }

    // Pinpoint the first partially-filled line and say exactly what's missing,
    // so submit is never blocked by a mystery.
    for (let idx = 0; idx < items.length; idx++) {
      const i = items[idx];
      const hasAny = i.productId || i.productName.trim() || i.batchNumber || i.qty || i.mrp || i.purchaseRate;
      if (!hasAny) continue;
      const missing: string[] = [];
      if (!(i.productId || i.productName.trim())) missing.push('product');
      if (!i.batchNumber) missing.push('batch #');
      if (!i.expiryDate) missing.push('expiry');
      if (!i.qty) missing.push('quantity');
      if (!i.mrp) missing.push('MRP');
      if (!i.purchaseRate) missing.push('purchase rate');
      if (missing.length > 0) {
        toast.error(`Line ${idx + 1}: fill ${missing.join(', ')}`);
        return;
      }
    }

    // Validate all items have required fields
    const validItems = items.filter(i =>
      i.batchNumber && i.expiryDate && i.qty && i.mrp && i.purchaseRate
      && (i.productId || i.productName.trim()),
    );
    if (validItems.length === 0) {
      toast.error('Add at least one line item (product, batch, expiry, qty, MRP, purchase rate)');
      return;
    }

    const savePurchase = (invoiceFileUrl?: string) => {
      const body = {
        supplierId,
        supplierInvoiceNo: supplierInvoiceNo || undefined,
        invoiceDate,
        invoiceFileUrl,
        items: validItems.map(i => ({
        ...(i.productId ? { productId: i.productId } : { productName: i.productName.trim() }),
        batchNumber: i.batchNumber,
        expiryDate: i.expiryDate,
        qty: Number(i.qty) || 1,
        freeQty: Number(i.freeQty) || 0,
        mrp: Number(i.mrp) || 0,
        purchaseRate: Number(i.purchaseRate) || 0,
        gstRate: Number(i.gstRate) || 12,
      })),
      };

      createPurchase.mutate(body, {
        onSuccess: (data: any) => {
          toast.success('Purchase bill saved!');
          resetForm();
          onClose();
          const needsRates = data?.productsNeedingSaleRate ?? [];
          if (needsRates.length > 0) {
            setSaleRateProducts(needsRates);
            setPendingPurchaseId(data?.id ?? null);
            setShowSaleRates(true);
          } else if (data?.id) {
            navigate(`/purchase-bills/${data.id}`);
          }
        },
        onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Failed to save purchase'),
      });
    };

    if (selectedFile && selectedFile.size > 10 * 1024 * 1024) {
      toast.error('File must be under 10MB');
      return;
    }

    if (selectedFile) {
      const reader = new FileReader();
      reader.onload = () => savePurchase(reader.result as string);
      reader.readAsDataURL(selectedFile);
    } else {
      savePurchase(undefined);
    }
  };

  const resetForm = () => {
    setSupplierId(''); setSupplierInvoiceNo('');
    setInvoiceDate(new Date().toISOString().split('T')[0]);
    setSelectedFile(null); setItems([{ ...EMPTY_LINE }]);
    setEntryMode('upload');
  };

  const inputCls = 'w-full px-2 py-1.5 text-sm border border-slate-200 rounded outline-none focus:ring-1 focus:ring-blue-500';

  return (
    <>
    <SlideOver
      isOpen={isOpen}
      onClose={onClose}
      title="Upload / Enter Purchase Bill"
      width="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={handleSave}
            isLoading={createPurchase.isPending}
            disabled={entryMode === 'upload'}
            title={entryMode === 'upload' ? 'Add items in Manual Entry before saving' : undefined}
          >
            Save Purchase
          </Button>
        </>
      }
    >
      <div className="space-y-5">
          {/* Mode toggle */}
          <div className="flex rounded-md shadow-sm">
            <button type="button" onClick={() => aiEnabled && setEntryMode('upload')} disabled={!aiEnabled}
              title={!aiEnabled ? 'AI parsing is disabled — use Manual Entry' : undefined}
              className={`flex-1 px-4 py-2 text-sm font-medium border rounded-l-md transition-colors ${entryMode === 'upload' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'} ${!aiEnabled ? 'opacity-50 cursor-not-allowed hover:bg-white' : ''}`}>
              Upload PDF{!aiEnabled ? ' (AI off)' : ''}
            </button>
            <button type="button" onClick={() => setEntryMode('manual')}
              className={`flex-1 px-4 py-2 text-sm font-medium border-t border-b border-r rounded-r-md ${entryMode === 'manual' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
              Manual Entry
            </button>
          </div>

          {/* Supplier + Invoice header */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Supplier *</label>
            <input type="text" placeholder="Search suppliers…" className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md mb-2 outline-none focus:ring-2 focus:ring-blue-500"
              value={supplierSearch} onChange={e => setSupplierSearch(e.target.value)} />
            <select className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-md outline-none focus:ring-2 focus:ring-blue-500"
              value={supplierId} onChange={e => setSupplierId(e.target.value)}>
              <option value="">Select supplier…</option>
              {filteredSuppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Invoice # (Supplier)</label>
              <input type="text" placeholder="e.g. INV-1234" className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md outline-none focus:ring-2 focus:ring-blue-500"
                value={supplierInvoiceNo} onChange={e => setSupplierInvoiceNo(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Date</label>
              <input type="date" className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md outline-none focus:ring-2 focus:ring-blue-500"
                value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} />
            </div>
          </div>

          {entryMode === 'upload' ? (
            aiEnabled ? (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-md p-3 flex items-start text-sm text-blue-700">
                <AlertCircle className="w-4 h-4 mr-2 shrink-0 mt-0.5" />
                <p>Upload supplier invoices (PDF/Image). {aiEnabled ? 'Click "Parse with AI" to auto-extract data.' : 'Then switch to Manual Entry to fill in items.'}</p>
              </div>
              <div
                className={`flex justify-center px-6 pt-5 pb-6 border-2 border-dashed rounded-md transition-colors ${dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400'}`}
                onDragOver={e => { e.preventDefault(); setDragActive(true); }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
              >
                <div className="space-y-2 text-center">
                  <UploadCloud className="mx-auto h-10 w-10 text-gray-400" />
                  {selectedFile ? (
                    <p className="text-sm text-green-700 font-medium">{selectedFile.name}</p>
                  ) : (
                    <div className="flex text-sm text-gray-600 justify-center">
                      <label htmlFor="file-upload" className="cursor-pointer font-medium text-blue-600 hover:text-blue-500">
                        <span>Upload a file</span>
                        <input ref={fileRef} id="file-upload" type="file" className="sr-only" accept=".pdf,.png,.jpg,.jpeg"
                          onChange={e => setSelectedFile(e.target.files?.[0] ?? null)} />
                      </label>
                      <p className="pl-1">or drag and drop</p>
                    </div>
                  )}
                  <p className="text-xs text-gray-500">PDF, PNG, JPG up to 10MB</p>
                </div>
              </div>
              {aiEnabled && (
                <Button variant="secondary" className="w-full" onClick={handleAiParse}
                  isLoading={parseAi.isPending}
                  leftIcon={parseAi.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}>
                  Parse with AI (Gemini)
                </Button>
              )}
            </div>
            ) : (
              <div className="bg-amber-50 border border-amber-200 rounded-md p-4 text-sm text-amber-800">
                AI parsing is disabled. Switch to <button type="button" className="font-semibold underline" onClick={() => setEntryMode('manual')}>Manual Entry</button> to enter purchase details.
              </div>
            )
          ) : (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <h4 className="text-sm font-bold text-gray-700">Line Items</h4>
                <button onClick={addItem} className="flex items-center gap-1 text-blue-600 text-sm hover:underline">
                  <Plus className="w-4 h-4" /> Add Item
                </button>
              </div>

              {items.map((item, idx) => (
                <div key={idx} className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50">
                  {/* Row 1: Product — pick existing or type new name */}
                  <div className="flex gap-2 flex-col">
                    <input type="text" placeholder="Search existing products…" className={inputCls}
                      value={productSearch} onChange={e => setProductSearch(e.target.value)} />
                    <select
                      className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                      value={item.productId}
                      onChange={e => updateItem(idx, 'productId', e.target.value)}
                    >
                      <option value="">— Or type new product below —</option>
                      {filteredProducts.map((p: any) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    {!item.productId && (
                      <input type="text" placeholder="New product name *" className={inputCls}
                        value={item.productName} onChange={e => updateItem(idx, 'productName', e.target.value)} />
                    )}
                    <button onClick={() => removeItem(idx)} className="text-gray-400 hover:text-red-500 p-1">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  {/* Row 2: Batch + Expiry */}
                  <div className="grid grid-cols-2 gap-2">
                    <input type="text" placeholder="Batch # *" className={inputCls}
                      value={item.batchNumber} onChange={e => updateItem(idx, 'batchNumber', e.target.value)} />
                    <input type="date" className={inputCls} title="Expiry Date"
                      value={item.expiryDate} onChange={e => updateItem(idx, 'expiryDate', e.target.value)} />
                  </div>
                  {/* Row 3: Qty + Free + MRP + Rate + GST */}
                  <div className="grid grid-cols-5 gap-2">
                    <input type="number" placeholder="Qty *" className={inputCls} min="1"
                      value={item.qty} onChange={e => updateItem(idx, 'qty', e.target.value)} />
                    <input type="number" placeholder="Free" className={inputCls} min="0"
                      value={item.freeQty} onChange={e => updateItem(idx, 'freeQty', e.target.value)} />
                    <input type="number" placeholder="MRP *" className={inputCls} min="0" step="0.01"
                      value={item.mrp} onChange={e => updateItem(idx, 'mrp', e.target.value)} />
                    <input type="number" placeholder="Rate *" className={inputCls} min="0" step="0.01"
                      value={item.purchaseRate} onChange={e => updateItem(idx, 'purchaseRate', e.target.value)} />
                    <select className={`${inputCls} bg-white`}
                      value={item.gstRate} onChange={e => updateItem(idx, 'gstRate', e.target.value)}>
                      <option value="0">GST 0%</option>
                      <option value="5">5%</option>
                      <option value="12">12%</option>
                      <option value="18">18%</option>
                      <option value="28">28%</option>
                    </select>
                  </div>
                </div>
              ))}

              {items.length === 0 && (
                <div className="text-center py-6 text-gray-400 text-sm">No items. Click "Add Item" above.</div>
              )}
            </div>
          )}
      </div>
    </SlideOver>
    <SetSaleRatesModal
      isOpen={showSaleRates}
      onClose={() => setShowSaleRates(false)}
      products={saleRateProducts}
      purchaseId={pendingPurchaseId ?? undefined}
      onComplete={() => {
        if (pendingPurchaseId) navigate(`/purchase-bills/${pendingPurchaseId}`);
      }}
    />
  </>
  );
};

export default UploadBillModal;
