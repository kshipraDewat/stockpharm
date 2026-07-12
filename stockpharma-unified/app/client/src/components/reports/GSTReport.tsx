import { useState } from 'react';
import { ArrowLeft, Download } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useReportsHubLink } from '../../hooks/useReportsHubLink';
import { useGstReport } from '../../hooks/useReports';
import Button from '../common/Button';
import Card from '../common/Card';
import { formatCurrency } from '../../lib/formatters';
import { downloadCSV } from '../../lib/exportUtils';

const GSTReport = () => {
  const reportsLink = useReportsHubLink();
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [month, setMonth] = useState(currentMonth);

  const { data, isLoading } = useGstReport(month);

  const sales = data?.sales ?? {};
  const purchases = data?.purchases ?? {};
  const isPharmacyGst = !!(data?.outputGst || data?.inputGst);

  const outputCgst = isPharmacyGst ? 0 : (sales.cgst ?? 0);
  const outputSgst = isPharmacyGst ? 0 : (sales.sgst ?? 0);
  const outputIgst = isPharmacyGst ? 0 : (sales.igst ?? 0);
  const inputCgst = isPharmacyGst ? 0 : (purchases.cgstInput ?? 0);
  const inputSgst = isPharmacyGst ? 0 : (purchases.sgstInput ?? 0);
  const inputIgst = isPharmacyGst ? 0 : (purchases.igstInput ?? 0);
  const totalOutput = isPharmacyGst ? Number(data?.outputGst?.tax ?? 0) : outputCgst + outputSgst + outputIgst;
  const totalInput = isPharmacyGst ? Number(data?.inputGst?.tax ?? 0) : inputCgst + inputSgst + inputIgst;
  const netLiability = isPharmacyGst ? Number(data?.netPayable ?? 0) : totalOutput - totalInput;
  const taxableOutput = isPharmacyGst ? Number(data?.outputGst?.taxable ?? 0) : (sales.taxableValue ?? 0);
  const taxableInput = isPharmacyGst ? Number(data?.inputGst?.taxable ?? 0) : (purchases.taxableValue ?? 0);

  const handleExport = () => {
    downloadCSV([
      { category: 'Output (Sales)', taxableValue: taxableOutput, cgst: outputCgst, sgst: outputSgst, igst: outputIgst, totalTax: totalOutput },
      { category: 'Input (Purchases / ITC)', taxableValue: taxableInput, cgst: inputCgst, sgst: inputSgst, igst: inputIgst, totalTax: totalInput },
      { category: 'Net Payable', taxableValue: '', cgst: outputCgst - inputCgst, sgst: outputSgst - inputSgst, igst: outputIgst - inputIgst, totalTax: netLiability },
    ], `gst_report_${month}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center space-x-4">
          <Link to={reportsLink} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">GST Breakdown</h1>
            <p className="text-sm text-gray-500">Monthly CGST, SGST and IGST reports for compliance</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input type="month" value={month} onChange={e => setMonth(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500" />
          <Button variant="secondary" leftIcon={<Download size={16} />} onClick={handleExport}>Export CSV</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card padding="sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Input Tax (ITC)</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{isLoading ? '—' : formatCurrency(totalInput)}</p>
        </Card>
        <Card padding="sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Output Tax</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{isLoading ? '—' : formatCurrency(totalOutput)}</p>
        </Card>
        <Card padding="sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Net Liability</p>
          <p className={`text-2xl font-bold mt-1 ${netLiability >= 0 ? 'text-blue-600' : 'text-green-600'}`}>
            {isLoading ? '—' : formatCurrency(Math.abs(netLiability))}
            {!isLoading && netLiability < 0 && <span className="text-sm font-normal text-green-500 ml-1">(credit)</span>}
          </p>
        </Card>
        <Card padding="sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Taxable Sales</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{isLoading ? '—' : formatCurrency(taxableOutput)}</p>
        </Card>
      </div>

      <Card title={`GST Summary — ${month}`}>
        {isLoading ? (
          <p className="text-center text-gray-400 py-12">Loading…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 font-semibold text-gray-500 uppercase">Category</th>
                  <th className="px-4 py-3 font-semibold text-gray-500 uppercase text-right">Taxable Value</th>
                  <th className="px-4 py-3 font-semibold text-gray-500 uppercase text-right">CGST</th>
                  <th className="px-4 py-3 font-semibold text-gray-500 uppercase text-right">SGST</th>
                  <th className="px-4 py-3 font-semibold text-gray-500 uppercase text-right">IGST</th>
                  <th className="px-4 py-3 font-semibold text-gray-500 uppercase text-right">Total Tax</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                <tr className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-semibold text-gray-900">Output (Sales)</td>
                  <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(taxableOutput)}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(outputCgst)}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(outputSgst)}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(outputIgst)}</td>
                  <td className="px-4 py-3 text-right font-bold text-blue-600">{formatCurrency(totalOutput)}</td>
                </tr>
                <tr className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-semibold text-gray-900">Input (Purchases / ITC)</td>
                  <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(taxableInput)}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(inputCgst)}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(inputSgst)}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(inputIgst)}</td>
                  <td className="px-4 py-3 text-right font-bold text-green-600">{formatCurrency(totalInput)}</td>
                </tr>
                <tr className="bg-gray-50 font-bold">
                  <td className="px-4 py-3 text-gray-900">Net Payable</td>
                  <td className="px-4 py-3 text-right text-gray-500">—</td>
                  <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(outputCgst - inputCgst)}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(outputSgst - inputSgst)}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(outputIgst - inputIgst)}</td>
                  <td className="px-4 py-3 text-right text-blue-700 text-lg">{formatCurrency(netLiability)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

export default GSTReport;
