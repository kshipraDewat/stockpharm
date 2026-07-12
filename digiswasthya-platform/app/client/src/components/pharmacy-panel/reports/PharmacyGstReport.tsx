import { useState } from 'react';
import { ArrowLeft, Download } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useGstReport } from '../../../hooks/useReports';
import Button from '../../common/Button';
import Card from '../../common/Card';
import { formatCurrency } from '../../../lib/formatters';
import { downloadCSV } from '../../../lib/exportUtils';

const PharmacyGstReport = () => {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [month, setMonth] = useState(currentMonth);
  const { data, isLoading } = useGstReport(month);

  const outputTax = Number(data?.outputGst?.tax ?? 0);
  const inputTax = Number(data?.inputGst?.tax ?? 0);
  const netPayable = Number(data?.netPayable ?? outputTax - inputTax);

  const handleExport = () => {
    downloadCSV([
      { category: 'Output GST (Retail)', taxable: data?.outputGst?.taxable ?? 0, tax: outputTax },
      { category: 'Input GST (Purchases)', taxable: data?.inputGst?.taxable ?? 0, tax: inputTax },
      { category: 'Net Payable', taxable: '', tax: netPayable },
    ], `pharmacy_gst_${month}`);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center space-x-4">
          <Link to="/pharmacy/reports" className="p-2 hover:bg-gray-100 rounded-full"><ArrowLeft className="w-5 h-5 text-gray-600" /></Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">GST Summary</h1>
            <p className="text-sm text-gray-500">Output vs input GST for retail and purchases</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-md text-sm" />
          <Button variant="secondary" leftIcon={<Download size={16} />} onClick={handleExport}>Export CSV</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card padding="sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Output GST (Sales)</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{isLoading ? '—' : formatCurrency(outputTax)}</p>
          <p className="text-xs text-gray-500 mt-1">Taxable: {formatCurrency(Number(data?.outputGst?.taxable ?? 0))}</p>
        </Card>
        <Card padding="sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Input GST (ITC)</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{isLoading ? '—' : formatCurrency(inputTax)}</p>
          <p className="text-xs text-gray-500 mt-1">Taxable: {formatCurrency(Number(data?.inputGst?.taxable ?? 0))}</p>
        </Card>
        <Card padding="sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Net Payable</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{isLoading ? '—' : formatCurrency(netPayable)}</p>
        </Card>
      </div>
    </div>
  );
};

export default PharmacyGstReport;
