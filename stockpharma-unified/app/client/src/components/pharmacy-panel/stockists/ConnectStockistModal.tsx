import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { useRequestStockistConnection } from '../../../hooks/usePharmacyConnections';
import { api } from '../../../api/client';
import SlideOver from '../../common/SlideOver';
import Button from '../../common/Button';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const ConnectStockistModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [mode, setMode] = useState<'invite' | 'search'>('invite');
  const [inviteCode, setInviteCode] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const request = useRequestStockistConnection();

  const handleSearch = async () => {
    if (searchQuery.trim().length < 2) return;
    setSearching(true);
    try {
      const r = await api.get('/stockist-connections/search', { params: { q: searchQuery.trim() } });
      setSearchResults(r.data?.data ?? []);
    } catch {
      toast.error('Search failed');
    } finally {
      setSearching(false);
    }
  };

  const handleSubmitInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim()) { toast.error('Enter an invite code'); return; }
    try {
      await request.mutateAsync({ inviteCode: inviteCode.trim() });
      toast.success('Connection request sent');
      setInviteCode('');
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Failed to send request');
    }
  };

  const handleConnectStockist = async (stockist: { id: string; businessName?: string; gstin?: string }) => {
    try {
      await request.mutateAsync({ stockistTenantId: stockist.id, gstin: stockist.gstin });
      toast.success(`Request sent to ${stockist.businessName ?? 'stockist'}`);
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Failed to send request');
    }
  };

  return (
    <SlideOver isOpen={isOpen} onClose={onClose} title="Connect Stockist" subtitle="Enter invite code or search by GSTIN / name">
      <div className="flex gap-2 mb-4">
        <button type="button" onClick={() => setMode('invite')} className={`flex-1 py-2 text-sm font-medium rounded-lg ${mode === 'invite' ? 'bg-teal-50 text-teal-700' : 'bg-slate-50 text-slate-500'}`}>Invite Code</button>
        <button type="button" onClick={() => setMode('search')} className={`flex-1 py-2 text-sm font-medium rounded-lg ${mode === 'search' ? 'bg-teal-50 text-teal-700' : 'bg-slate-50 text-slate-500'}`}>GSTIN / Name</button>
      </div>

      {mode === 'invite' ? (
        <form onSubmit={handleSubmitInvite} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Invite Code</label>
            <input type="text" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" placeholder="A1B2C3D4" value={inviteCode} onChange={e => setInviteCode(e.target.value)} autoFocus />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
            <Button variant="primary" type="submit" isLoading={request.isPending} className="!bg-teal-600 hover:!bg-teal-700">Send Request</Button>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          <div className="flex gap-2">
            <input type="text" className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg" placeholder="GSTIN or business name" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            <Button variant="secondary" onClick={handleSearch} isLoading={searching}>Search</Button>
          </div>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {searchResults.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">Search for a stockist by GSTIN or name</p>
            ) : searchResults.map((s) => (
              <button key={s.id} type="button" onClick={() => handleConnectStockist(s)} className="w-full text-left p-3 border border-slate-100 rounded-lg hover:bg-slate-50">
                <p className="text-sm font-medium text-slate-800">{s.businessName}</p>
                <p className="text-xs text-slate-400">{s.gstin ?? 'No GSTIN'}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </SlideOver>
  );
};

export default ConnectStockistModal;
