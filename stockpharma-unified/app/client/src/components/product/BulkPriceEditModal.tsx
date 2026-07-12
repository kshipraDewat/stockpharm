import React, { useState } from 'react';
import { FileUp, AlertCircle } from 'lucide-react';
import Button from '../common/Button';
import SlideOver from '../common/SlideOver';
import { api } from '../../api/client';
import { downloadCSV } from '../../lib/exportUtils';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { parseCsvLine } from '../../lib/csvParse';

interface BulkPriceEditModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const BulkPriceEditModal: React.FC<BulkPriceEditModalProps> = ({ isOpen, onClose }) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [rowErrors, setRowErrors] = useState<{ id: string; error: string }[]>([]);
  const qc = useQueryClient();

  const handleDownload = async () => {
    try {
      setIsDownloading(true);
      // Fetch all products without pagination limit to get full catalog pricing
      const res = await api.get('/products/export');
      const items = res.data?.data ?? res.data ?? [];
      const total = res.data?.total ?? items.length;
      if (items.length === 0) {
        toast.error('No products available to download.');
        return;
      }

      const exportData = items.map((p: any) => ({
        id: p.id,
        name: p.name,
        mrp: p.mrp ?? 0,
        purchaseRate: p.purchaseRate ?? 0,
        saleRate: p.saleRate ?? p.salePrice ?? p.ptg ?? 0,
      }));

      downloadCSV(exportData, 'product_prices_template');
      toast.success(`Prices CSV downloaded (${total} products).`);
    } catch (err) {
      toast.error('Failed to download prices CSV.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setRowErrors([]);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) {
        toast.error('CSV file seems empty or invalid.');
        setFile(null);
        setParsedRows([]);
        return;
      }

      const headers = parseCsvLine(lines[0]).map(h => h.replace(/^"|"$/g, ''));
      const idIdx = headers.indexOf('id');
      const mrpIdx = headers.indexOf('mrp');
      const purIdx = headers.indexOf('purchaseRate');
      const saleIdx = headers.indexOf('saleRate');

      if (idIdx === -1) {
        toast.error('CSV must contain an "id" column.');
        setFile(null);
        setParsedRows([]);
        return;
      }

      const rows: any[] = [];
      for (let i = 1; i < lines.length; i++) {
        // Simple CSV line split handling basic values
        const values = parseCsvLine(lines[i]).map(v => v.replace(/^"|"$/g, ''));
        const id = values[idIdx];
        if (!id) continue;

        const updatePayload: any = {};
        if (mrpIdx !== -1 && values[mrpIdx] !== undefined && values[mrpIdx] !== '') {
          const m = Number(values[mrpIdx]);
          if (!isNaN(m)) updatePayload.mrp = m;
        }
        if (purIdx !== -1 && values[purIdx] !== undefined && values[purIdx] !== '') {
          const p = Number(values[purIdx]);
          if (!isNaN(p)) updatePayload.purchaseRate = p;
        }
        if (saleIdx !== -1 && values[saleIdx] !== undefined && values[saleIdx] !== '') {
          const s = Number(values[saleIdx]);
          if (!isNaN(s)) updatePayload.saleRate = s;
        }

        if (Object.keys(updatePayload).length > 0) {
          rows.push({ id, ...updatePayload });
        }
      }

      setParsedRows(rows);
      toast.success(`Successfully parsed ${rows.length} product updates.`);
    };
    reader.readAsText(selectedFile);
  };

  const handleProcessUpdates = async () => {
    if (parsedRows.length === 0) {
      toast.error('No valid rows found to update.');
      return;
    }

    try {
      setIsProcessing(true);
      let successCount = 0;
      const errors: { id: string; error: string }[] = [];

      for (const row of parsedRows) {
        try {
          const { id, ...updates } = row;
          await api.patch(`/products/${id}`, updates);
          successCount++;
        } catch (e: any) {
          errors.push({
            id: row.id,
            error: e?.response?.data?.error ?? e?.message ?? 'Update failed',
          });
        }
      }

      setRowErrors(errors);
      qc.invalidateQueries({ queryKey: ['products'] });
      if (errors.length > 0) {
        toast.error(`Updated ${successCount}; ${errors.length} row(s) failed — see list below`);
      } else {
        toast.success(`Successfully updated all ${successCount} products!`);
        setFile(null);
        setParsedRows([]);
        onClose();
      }
    } catch (err) {
      toast.error('An error occurred during bulk processing.');
    } finally {
      setIsProcessing(false);
    }
  };

  const resetState = () => {
    setFile(null);
    setParsedRows([]);
    setRowErrors([]);
    onClose();
  };

  return (
    <SlideOver
      isOpen={isOpen}
      onClose={resetState}
      title="Bulk Price Update"
      subtitle="Update pricing for multiple products via CSV"
      width="md"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={resetState}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleProcessUpdates}
            isLoading={isProcessing}
            disabled={parsedRows.length === 0}
          >
            Process Updates ({parsedRows.length})
          </Button>
        </div>
      }
    >
      <div className="p-5 space-y-5">
        <div className="bg-blue-50 border border-blue-200/80 rounded-xl p-3.5 text-xs text-blue-800 space-y-1">
          <div className="flex items-center gap-1.5 font-semibold">
            <AlertCircle className="w-4 h-4 shrink-0 text-blue-600" />
            <span>Instructions</span>
          </div>
          <p className="pl-5 mb-0">Download the current product prices as a CSV, update the rate values, and upload it back. Ensure product IDs remain completely unchanged.</p>
        </div>

        <div className="space-y-2.5">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Step 1: Download Template</h4>
          <Button
            variant="secondary"
            size="sm"
            className="w-full justify-center font-medium"
            onClick={handleDownload}
            isLoading={isDownloading}
          >
            Download Prices CSV
          </Button>
        </div>

        <div className="space-y-2.5">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Step 2: Upload Updated File</h4>
          <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-slate-200 border-dashed rounded-xl bg-slate-50/50 hover:border-blue-500 transition-colors">
            <div className="space-y-2 text-center">
              <FileUp className="mx-auto h-8 w-8 text-slate-400" />
              <div className="flex text-xs text-slate-600 justify-center">
                <label
                  htmlFor="file-upload"
                  className="relative cursor-pointer rounded-md font-semibold text-blue-600 hover:text-blue-800 focus-within:outline-none"
                >
                  <span>{file ? file.name : 'Choose file to upload'}</span>
                  <input
                    id="file-upload"
                    name="file-upload"
                    type="file"
                    className="sr-only"
                    accept=".csv"
                    onChange={handleFileChange}
                  />
                </label>
              </div>
              <p className="text-[10px] text-slate-400">CSV file format only</p>
            </div>
          </div>
          {parsedRows.length > 0 && (
            <p className="text-xs font-semibold text-emerald-600 text-center">
              Ready to update {parsedRows.length} product entries.
            </p>
          )}
          {rowErrors.length > 0 && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-left">
              <p className="text-xs font-semibold text-red-700 mb-2">Failed rows:</p>
              <ul className="space-y-1 max-h-32 overflow-y-auto">
                {rowErrors.map(err => (
                  <li key={err.id} className="text-[11px] text-red-600 font-mono">
                    {err.id.slice(0, 8)}… — {err.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </SlideOver>
  );
};

export default BulkPriceEditModal;
