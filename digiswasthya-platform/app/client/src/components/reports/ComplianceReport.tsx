import { useState } from 'react';
import { ArrowLeft, Download, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useComplianceReport } from '../../hooks/useReports';
import { useReportsHubLink } from '../../hooks/useReportsHubLink';
import Button from '../common/Button';
import { formatDate } from '../../lib/formatters';
import { downloadCSV } from '../../lib/exportUtils';

const ComplianceReport = () => {
  const reportsLink = useReportsHubLink();
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [type, setType] = useState('H1');
  const [month, setMonth] = useState(currentMonth);

  const { data, isLoading } = useComplianceReport(type, month);
  const entries: Record<string, unknown>[] = Array.isArray(data) ? data : (data?.entries ?? []);

  const handleExport = () => {
    downloadCSV(entries.map(e => ({
      date: e.orderDate ?? e.date,
      pharmacy: e.pharmacyName ?? e.customerName,
      dlNumber: e.pharmacyDl ?? e.dlNumber,
      product: e.productName ?? e.drugName,
      batch: e.batchNumber,
      qty: e.qty ?? e.quantity,
      unit: e.unit ?? 'units',
      billNumber: e.billNumber ?? e.invoiceNumber,
    })), `compliance_${type}_${month}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link to={reportsLink} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Compliance Logs</h1>
            <p className="text-sm text-gray-500">Schedule H, H1, and NDPS distribution tracking.</p>
          </div>
        </div>
        <Button variant="secondary" leftIcon={<Download size={16} />} onClick={handleExport}>Export Log</Button>
      </div>

      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
          <div className="flex items-center text-sm font-medium text-indigo-700 bg-indigo-50 px-4 py-2 rounded-lg border border-indigo-100">
            <ShieldCheck className="w-5 h-5 mr-2 text-indigo-600" />
            Log Book Register Format matches Govt. Guidelines
          </div>
          <div className="flex gap-2">
            <select value={type} onChange={e => setType(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500">
              <option value="H1">Schedule H1</option>
              <option value="H">Schedule H</option>
              <option value="X">Schedule X</option>
              <option value="NDPS">NDPS</option>
            </select>
            <input type="month" value={month} onChange={e => setMonth(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead className="bg-gray-100 text-gray-700">
              <tr>
                <th className="px-4 py-3 font-semibold uppercase text-xs">Date</th>
                <th className="px-4 py-3 font-semibold uppercase text-xs">Pharmacy / Customer</th>
                <th className="px-4 py-3 font-semibold uppercase text-xs">Drug Name & Batch</th>
                <th className="px-4 py-3 font-semibold uppercase text-xs text-right">Qty Sold</th>
                <th className="px-4 py-3 font-semibold uppercase text-xs">Bill No.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {isLoading ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
              ) : entries.length > 0 ? entries.map((entry, i) => (
                <tr key={String(entry.orderId ?? entry.id ?? i)} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900 border-x border-gray-100">
                    {formatDate(String(entry.orderDate ?? entry.date ?? ''))}
                  </td>
                  <td className="px-4 py-3 border-r border-gray-100">
                    {String(entry.pharmacyName ?? entry.customerName ?? '—')}
                    {(entry.pharmacyDl ?? entry.dlNumber) && (
                      <><br /><span className="text-xs text-gray-500">DL: {String(entry.pharmacyDl ?? entry.dlNumber)}</span></>
                    )}
                  </td>
                  <td className="px-4 py-3 border-r border-gray-100">
                    {String(entry.productName ?? entry.drugName ?? '')}
                    {entry.batchNumber && <><br /><span className="text-xs font-mono text-gray-500">{String(entry.batchNumber)}</span></>}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold border-r border-gray-100">
                    {Number(entry.qty ?? entry.quantity ?? 0)} {String(entry.unit ?? 'units')}
                  </td>
                  <td className="px-4 py-3 font-medium text-blue-600 border-r border-gray-100">
                    {String(entry.billNumber ?? entry.invoiceNumber ?? '—')}
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    No Schedule {type} transactions found for {month}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ComplianceReport;
