import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Store, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  usePublicStockistProfile,
  usePublicStockistCatalog,
} from '../../../hooks/usePublicStockists';
import { usePharmacyConnectionByStockist, useRequestStockistConnection } from '../../../hooks/usePharmacyConnections';
import { useAuthStore } from '../../../stores/authStore';
import PageHeader from '../../common/PageHeader';
import Button from '../../common/Button';
import { statusBadge } from '../../common/Badge';
import Pagination from '../../common/Pagination';
import SlideOver from '../../common/SlideOver';
import { DEFAULT_CREDIT_LIMIT } from '../../../lib/constants';

const StockistPublicProfilePage = () => {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const canRequest = useAuthStore(s => ['admin', 'pharmacist'].includes(s.user?.role ?? ''));
  const [catalogPage, setCatalogPage] = useState(1);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [showRequest, setShowRequest] = useState(false);
  const [note, setNote] = useState('');
  const [volume, setVolume] = useState('');

  const { data: profile, isLoading } = usePublicStockistProfile(slug);
  const { data: catalogData } = usePublicStockistCatalog(slug, {
    q: catalogSearch || undefined,
    page: catalogPage,
    pageSize: 20,
  });
  const { data: connection } = usePharmacyConnectionByStockist(profile?.id);
  const request = useRequestStockistConnection();

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.id) return;
    try {
      await request.mutateAsync({
        stockistTenantId: profile.id,
        note: note.trim() || undefined,
        expectedMonthlyVolume: volume ? Number(volume) : undefined,
        requestSource: 'discovery',
      });
      toast.success('Connection request sent');
      setShowRequest(false);
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? 'Failed to send request';
      if (msg.includes('pharmacy tenants')) {
        toast.error('Sign in to the Pharmacy panel — stockist sessions cannot request connections.');
      } else {
        toast.error(msg);
      }
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-[400px]"><div className="animate-pulse text-slate-400">Loading...</div></div>;
  }

  if (!profile) {
    return (
      <div className="text-center py-16">
        <p className="text-slate-500">Stockist not found</p>
        <Button variant="secondary" className="mt-4" onClick={() => navigate('/pharmacy/discover')}>Back to Discover</Button>
      </div>
    );
  }

  const catalog = catalogData?.data ?? [];
  const catalogTotal = catalogData?.total ?? 0;

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <PageHeader
        breadcrumbs={[
          { label: 'Discover', link: '/pharmacy/discover' },
          { label: profile.businessName },
        ]}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {connection ? statusBadge(connection.status) : null}
            {canRequest && !connection && profile.acceptingNewConnections && (
              <Button variant="primary" onClick={() => setShowRequest(true)} className="!bg-teal-600 hover:!bg-teal-700">
                Request Connection
              </Button>
            )}
            {canRequest && connection?.status === 'active' && (
              <Button variant="primary" onClick={() => navigate(`/pharmacy/purchase-orders/create?connectionId=${connection.id}`)} className="!bg-teal-600 hover:!bg-teal-700">
                Place Order
              </Button>
            )}
          </div>
        }
      />

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-xl bg-teal-50 flex items-center justify-center shrink-0">
            <Store className="w-7 h-7 text-teal-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{profile.businessName}</h1>
            <p className="text-sm text-slate-500 mt-1">{profile.gstin ?? 'GSTIN not listed'} · State {profile.stateCode}</p>
            {profile.aboutText && <p className="text-sm text-slate-600 mt-3">{profile.aboutText}</p>}
            <div className="flex flex-wrap gap-4 mt-3 text-sm text-slate-500">
              <span>{profile.partnerCount ?? 0} partner pharmacies</span>
              <span>{profile.productCount ?? 0}+ products listed</span>
            </div>
            {Array.isArray(profile.categories) && profile.categories.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {profile.categories.map((c: string) => (
                  <span key={c} className="text-xs px-2 py-0.5 bg-teal-50 text-teal-700 rounded-full">{c}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2 flex-wrap">
          <h2 className="font-semibold text-slate-800">Public Catalogue</h2>
          <input
            type="text"
            placeholder="Search products..."
            value={catalogSearch}
            onChange={e => { setCatalogSearch(e.target.value); setCatalogPage(1); }}
            className="h-8 px-3 text-sm border border-slate-200 rounded-lg w-48"
          />
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase">Product</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase">Category</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase">MRP</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase">Availability</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {catalog.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">No products listed</td></tr>
            ) : catalog.map((item: any) => (
              <tr key={item.id}>
                <td className="px-4 py-2 font-medium text-slate-800">{item.name}</td>
                <td className="px-4 py-2 text-slate-600">{item.category}</td>
                <td className="px-4 py-2 text-slate-600">₹{Number(item.mrp).toLocaleString('en-IN')}</td>
                <td className="px-4 py-2">{statusBadge(item.availabilityHint ?? 'in_stock')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {catalogTotal > 20 && (
          <div className="px-4 py-3 border-t border-slate-100">
            <Pagination page={catalogPage} total={catalogTotal} pageSize={20} onPageChange={setCatalogPage} />
          </div>
        )}
      </div>

      <SlideOver isOpen={showRequest} onClose={() => setShowRequest(false)} title="Request Connection" subtitle={`Connect with ${profile.businessName}`}>
        <form onSubmit={handleRequest} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Note (optional)</label>
            <textarea
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg min-h-[80px]"
              placeholder="Tell the stockist about your pharmacy..."
              value={note}
              onChange={e => setNote(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Expected monthly volume (₹)</label>
            <input
              type="number"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              placeholder={String(DEFAULT_CREDIT_LIMIT)}
              value={volume}
              onChange={e => setVolume(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowRequest(false)}>Cancel</Button>
            <Button variant="primary" type="submit" isLoading={request.isPending} className="!bg-teal-600 hover:!bg-teal-700">Send Request</Button>
          </div>
        </form>
      </SlideOver>
    </div>
  );
};

export default StockistPublicProfilePage;
