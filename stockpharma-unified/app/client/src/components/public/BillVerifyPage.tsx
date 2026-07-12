import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { formatCurrency, formatDate } from '../../lib/formatters';
import { CheckCircle2, XCircle } from 'lucide-react';

export default function BillVerifyPage() {
  const { billId } = useParams<{ billId: string }>();
  const isDemo = billId === 'demo';

  const { data, isLoading, isError } = useQuery({
    queryKey: ['verify-bill', billId],
    queryFn: async () => (await api.get(`/public/verify-bill/${billId}`)).data,
    enabled: !!billId && !isDemo,
  });

  if (isDemo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md w-full bg-white rounded-2xl p-8 border text-center">
          <h1 className="text-xl font-bold">Bill Verification</h1>
          <p className="text-sm text-slate-500 mt-2">Scan the QR code on a Digital Swasthya invoice to verify it here. Replace <code className="bg-slate-100 px-1 rounded">demo</code> in the URL with a real bill UUID.</p>
          <Link to="/" className="text-blue-600 text-sm mt-4 inline-block">← Home</Link>
        </div>
      </div>
    );
  }

  if (isLoading) return <div className="min-h-screen flex items-center justify-center text-slate-500">Verifying…</div>;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="max-w-md w-full bg-white rounded-2xl p-8 border shadow-sm">
        {isError || !data ? (
          <div className="text-center">
            <XCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
            <h1 className="text-xl font-bold">Bill Not Found</h1>
            <p className="text-sm text-slate-500 mt-2">This bill could not be verified.</p>
          </div>
        ) : (
          <div className="text-center">
            <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto mb-3" />
            <h1 className="text-xl font-bold text-green-800">Verified Invoice</h1>
            <p className="text-xs text-slate-500 mt-4 uppercase tracking-wide">Bill details</p>
            <dl className="mt-4 text-left space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">Bill #</dt><dd className="font-medium">{data.billNumber}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Date</dt><dd>{formatDate(data.billDate)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Total</dt><dd className="font-bold">{formatCurrency(data.total)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Stockist</dt><dd>{data.stockistName}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Pharmacy</dt><dd>{data.pharmacyName}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Status</dt><dd className="capitalize">{data.status}</dd></div>
            </dl>
            <p className="text-[11px] text-slate-400 mt-6 border-t pt-4">
              This bill was generated using Digital Swasthya and can be verified on the application.
            </p>
          </div>
        )}
        <Link to="/" className="block text-center text-blue-600 text-sm mt-6">← Digital Swasthya Home</Link>
      </div>
    </div>
  );
}
