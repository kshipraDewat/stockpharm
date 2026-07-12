import { useState } from 'react';
import { ArrowLeft, Download } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useComplianceReport } from '../../../hooks/useReports';
import Button from '../../common/Button';
import Card from '../../common/Card';
import { formatDate } from '../../../lib/formatters';
import { downloadCSV } from '../../../lib/exportUtils';

const SCHEDULE_TYPES = ['H', 'H1', 'X', 'NDPS'];

const PharmacyComplianceReport = () => {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [month, setMonth] = useState(currentMonth);
  const [scheduleType, setScheduleType] = useState('H1');
  const { data, isLoading } = useComplianceReport(scheduleType, month);
  const entries: Record<string, unknown>[] = data?.entries ?? [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center space-x-4">
          <Link to="/pharmacy/reports" className="p-2 hover:bg-gray-100 rounded-full"><ArrowLeft className="w-5 h-5 text-gray-600" /></Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Compliance Report</h1>
            <p className="text-sm text-gray-500">Schedule H/H1/X/NDPS retail sales log</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={scheduleType} onChange={e => setScheduleType(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-md text-sm">
            {SCHEDULE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-md text-sm" />
          <Button variant="secondary" leftIcon={<Download size={16} />} onClick={() => downloadCSV(entries, `compliance_${scheduleType}_${month}`)}>Export CSV</Button>
        </div>
      </div>

      <Card padding="sm">
        <p className="text-xs font-bold text-gray-400 uppercase">Regulated Sales Entries</p>
        <p className="text-2xl font-bold text-gray-900 mt-1">{isLoading ? '—' : (data?.total ?? entries.length)}</p>
      </Card>

      <Card title="Sales Log">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[960px]">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 text-gray-400">Sale #</th>
                <th className="text-left py-2 text-gray-400">Date</th>
                <th className="text-left py-2 text-gray-400">Rx #</th>
                <th className="text-left py-2 text-gray-400">Doctor</th>
                <th className="text-left py-2 text-gray-400">Patient</th>
                <th className="text-left py-2 text-gray-400">Product</th>
                <th className="text-left py-2 text-gray-400">Schedule</th>
                <th className="text-left py-2 text-gray-400">Batch</th>
                <th className="text-right py-2 text-gray-400">Qty</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr><td colSpan={9} className="py-8 text-center text-gray-400">No regulated sales this period</td></tr>
              ) : entries.map((e: any, i) => (
                <tr key={i} className="border-b border-gray-50">
                  <td className="py-2">{e.saleNumber}</td>
                  <td className="py-2">{formatDate(e.saleDate)}</td>
                  <td className="py-2 font-mono text-xs">{e.rxNumber ?? '—'}</td>
                  <td className="py-2">
                    <div>{e.doctorName ?? '—'}</div>
                    {e.doctorRegNo && <div className="text-xs text-gray-400">{e.doctorRegNo}</div>}
                  </td>
                  <td className="py-2">
                    <div>{e.patientName ?? '—'}</div>
                    {e.patientAge != null && e.patientAge !== '' && (
                      <div className="text-xs text-gray-400">Age {e.patientAge}</div>
                    )}
                  </td>
                  <td className="py-2">{e.productName}</td>
                  <td className="py-2">{e.scheduleType}</td>
                  <td className="py-2">{e.batchNumber ?? '—'}</td>
                  <td className="py-2 text-right">{e.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default PharmacyComplianceReport;
