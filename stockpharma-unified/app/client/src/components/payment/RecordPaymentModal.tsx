import React, { useState, useEffect, useMemo } from 'react';
import { DollarSign, Info, FileText, AlertTriangle } from 'lucide-react';
import Button from '../common/Button';
import SlideOver from '../common/SlideOver';
import Input from '../common/Input';
import { usePharmacies, useOutstandingBills } from '../../hooks/usePharmacies';
import { useRecordPayment } from '../../hooks/usePayments';
import { api } from '../../api/client';
import toast from 'react-hot-toast';
import { formatCurrency, formatDate } from '../../lib/formatters';
import { getBalanceDue } from '../../lib/fields';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialPharmacyId?: string;
}

interface BillAlloc {
  billId: string;
  selected: boolean;
  amount: string;
}

const REF_LABELS: Record<string, string> = {
  cash: '',
  upi: 'UTR Number',
  bank: 'Reference / UTR',
  cheque: 'Cheque Number',
};

const RecordPaymentModal: React.FC<Props> = ({ isOpen, onClose, initialPharmacyId }) => {
  const [selectedPharmacy, setSelectedPharmacy] = useState(initialPharmacyId || '');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'cash' | 'upi' | 'bank' | 'cheque'>('upi');
  const [referenceNo, setReferenceNo] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [manualMode, setManualMode] = useState(false);
  const [allocs, setAllocs] = useState<BillAlloc[]>([]);
  const [refWarning, setRefWarning] = useState<string | null>(null);

  const { data: pharmaciesData } = usePharmacies();
  const pharmacies = pharmaciesData?.data ?? pharmaciesData ?? [];
  const selectedPharmacyRow = pharmacies.find((p: any) => p.id === selectedPharmacy) as any;
  const pharmacyOutstanding = Number(selectedPharmacyRow?.outstanding ?? 0);
  const { data: outstandingBills } = useOutstandingBills(selectedPharmacy);
  const bills = outstandingBills ?? [];
  const recordPayment = useRecordPayment();

  useEffect(() => {
    if (isOpen && initialPharmacyId) setSelectedPharmacy(initialPharmacyId);
  }, [isOpen, initialPharmacyId]);

  useEffect(() => {
    setAllocs(bills.map((b: any) => ({ billId: b.id, selected: false, amount: '' })));
    setManualMode(false);
  }, [bills, selectedPharmacy]);

  useEffect(() => {
    if (method === 'cash') setReferenceNo('');
  }, [method]);

  const numAmount = Number(amount) || 0;
  const selectedAllocSum = useMemo(() =>
    allocs.filter(a => a.selected).reduce((s, a) => s + (Number(a.amount) || 0), 0),
  [allocs]);

  const handleRefBlur = async () => {
    if (method === 'cash' || !referenceNo.trim()) { setRefWarning(null); return; }
    try {
      const { data } = await api.get('/payments/check-reference', { params: { ref: referenceNo.trim() } });
      if (data.exists) setRefWarning(`Already used on payment ${data.paymentNumber}`);
      else setRefWarning(null);
    } catch { setRefWarning(null); }
  };

  const autoFifo = () => {
    let remaining = numAmount;
    setAllocs(bills.map((b: any) => {
      if (remaining <= 0) return { billId: b.id, selected: false, amount: '' };
      const pending = getBalanceDue(b);
      const alloc = Math.min(remaining, pending);
      remaining -= alloc;
      return { billId: b.id, selected: alloc > 0, amount: alloc > 0 ? String(alloc) : '' };
    }));
    setManualMode(true);
  };

  const handleSave = () => {
    if (!selectedPharmacy) { toast.error('Select a pharmacy'); return; }
    if (!numAmount || numAmount <= 0) { toast.error('Enter a valid amount'); return; }
    if (refWarning) { toast.error(refWarning); return; }
    if (method !== 'cash' && !referenceNo.trim()) {
      toast.error(`Enter ${REF_LABELS[method] || 'reference'}`);
      return;
    }

    const payload: any = {
      pharmacyId: selectedPharmacy,
      amount: numAmount,
      method,
      referenceNo: method === 'cash' ? undefined : referenceNo.trim(),
      paymentDate: date,
    };

    if (manualMode) {
      const allocations = allocs
        .filter(a => a.selected && Number(a.amount) > 0)
        .map(a => ({ billId: a.billId, amount: Number(a.amount) }));
      if (allocations.length > 0) {
        if (selectedAllocSum > numAmount) {
          toast.error('Allocated amounts exceed payment total');
          return;
        }
        payload.allocations = allocations;
      }
    }

    recordPayment.mutate(payload, {
      onSuccess: () => {
        toast.success('Payment recorded!');
        onClose();
        setAmount(''); setReferenceNo(''); setAllocs([]); setManualMode(false);
      },
      onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Failed to record payment'),
    });
  };

  return (
    <SlideOver
      isOpen={isOpen}
      onClose={onClose}
      title="Record Payment"
      width="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" leftIcon={<DollarSign className="w-4 h-4" />} onClick={handleSave} isLoading={recordPayment.isPending}>
            Save Payment
          </Button>
        </>
      }
    >
      <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="col-span-full">
                <label className="block text-sm font-medium text-gray-700 mb-1">Pharmacy account</label>
                <select className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-md outline-none focus:ring-2 focus:ring-blue-500"
                  value={selectedPharmacy} onChange={e => setSelectedPharmacy(e.target.value)}>
                  <option value="">Select Pharmacy…</option>
                  {pharmacies.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              {selectedPharmacy && (
                <div className="col-span-full flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-100 rounded-lg text-sm">
                  <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                  <span className="text-red-800">
                    Outstanding balance: <span className="font-bold">{formatCurrency(pharmacyOutstanding)}</span>
                  </span>
                </div>
              )}

              <div>
                <Input label="Amount Received (₹)" type="number" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Mode</label>
                <select className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-md outline-none focus:ring-2 focus:ring-blue-500"
                  value={method} onChange={e => setMethod(e.target.value as any)}>
                  <option value="upi">UPI</option>
                  <option value="cash">Cash</option>
                  <option value="bank">Bank Transfer / NEFT</option>
                  <option value="cheque">Cheque</option>
                </select>
              </div>
              {method !== 'cash' && (
                <div className="col-span-full">
                  <Input
                    label={REF_LABELS[method] || 'Reference'}
                    placeholder={method === 'cheque' ? 'Cheque #' : 'e.g. UTR123456789'}
                    value={referenceNo}
                    onChange={e => { setReferenceNo(e.target.value); setRefWarning(null); }}
                    onBlur={handleRefBlur}
                  />
                  {refWarning && <p className="text-xs text-red-600 mt-1">{refWarning}</p>}
                </div>
              )}
              <div className="col-span-full">
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input type="date" className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-md outline-none"
                  value={date} onChange={e => setDate(e.target.value)} />
              </div>
            </div>

            <div className="border-t border-gray-200 pt-6">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h4 className="text-sm font-semibold text-gray-900 flex items-center">
                  <FileText className="w-4 h-4 mr-2" /> Bill Allocation
                </h4>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={autoFifo} disabled={!numAmount || bills.length === 0}>
                    Auto FIFO
                  </Button>
                  <div className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                    Amount: <span className="font-bold text-gray-900">{formatCurrency(numAmount)}</span>
                    {manualMode && selectedAllocSum > 0 && (
                      <span className="ml-2">Allocated: {formatCurrency(selectedAllocSum)}</span>
                    )}
                  </div>
                </div>
              </div>
              {selectedPharmacy ? (
                <div className="bg-slate-50 rounded-lg border border-slate-200 overflow-x-auto">
                  <table className="w-full text-left text-sm min-w-[480px]">
                    <thead className="bg-white border-b border-gray-200">
                      <tr>
                        <th className="px-3 py-2 w-8"></th>
                        <th className="px-3 py-2 text-gray-500 font-medium">Bill #</th>
                        <th className="px-3 py-2 text-gray-500 font-medium text-right">Pending</th>
                        <th className="px-3 py-2 text-gray-500 font-medium text-right w-24">Allocate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {bills.map((b: any) => {
                        const alloc = allocs.find(a => a.billId === b.id);
                        const pending = getBalanceDue(b);
                        return (
                          <tr key={b.id}>
                            <td className="px-3 py-2">
                              <input type="checkbox" checked={alloc?.selected ?? false}
                                onChange={e => {
                                  setManualMode(true);
                                  setAllocs(prev => prev.map(a => a.billId === b.id
                                    ? { ...a, selected: e.target.checked, amount: e.target.checked ? String(pending) : '' }
                                    : a));
                                }} />
                            </td>
                            <td className="px-3 py-3">{b.billNumber}<br/><span className="text-xs text-gray-400">{formatDate(b.billDate)} · Due {formatDate(b.dueDate)}</span></td>
                            <td className="px-3 py-3 text-right font-medium text-red-600">{formatCurrency(pending)}</td>
                            <td className="px-3 py-2">
                              <input type="number" className="w-full text-right text-xs border border-gray-200 rounded px-1 py-1"
                                disabled={!alloc?.selected}
                                value={alloc?.amount ?? ''}
                                onChange={e => {
                                  setManualMode(true);
                                  setAllocs(prev => prev.map(a => a.billId === b.id ? { ...a, amount: e.target.value } : a));
                                }} />
                            </td>
                          </tr>
                        );
                      })}
                      {bills.length === 0 && (
                        <tr><td colSpan={4} className="px-3 py-4 text-center text-gray-400">No outstanding bills</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-4 border border-dashed border-gray-300 rounded-lg text-center text-gray-500 text-sm">
                  Select a pharmacy to view outstanding bills.
                </div>
              )}
              <div className="flex items-start mt-3 gap-2 text-xs text-gray-500">
                <Info className="w-4 h-4 shrink-0 text-blue-500 mt-0.5" />
                <p>Leave unchecked for automatic FIFO allocation, or select bills and amounts manually.</p>
              </div>
            </div>
      </div>
    </SlideOver>
  );
};

export default RecordPaymentModal;
