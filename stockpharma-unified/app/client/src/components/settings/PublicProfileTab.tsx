import React, { useState, useEffect } from 'react';
import { Globe, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTenant, useUpdateTenant } from '../../hooks/useSettings';
import { useSyncPublicCatalog, usePublicCatalogSettings, useSetProductPublicVisibility } from '../../hooks/usePublicStockists';
import Button from '../common/Button';
import Input from '../common/Input';

const PublicProfileTab = () => {
  const { data: tenant } = useTenant();
  const updateTenant = useUpdateTenant();
  const syncCatalog = useSyncPublicCatalog();
  const { data: catalogItems = [] } = usePublicCatalogSettings();
  const setVisibility = useSetProductPublicVisibility();

  const [isPubliclyListed, setIsPubliclyListed] = useState(true);
  const [acceptingNewConnections, setAcceptingNewConnections] = useState(true);
  const [aboutText, setAboutText] = useState('');
  const [publicSlug, setPublicSlug] = useState('');
  const [categories, setCategories] = useState('');
  const [coverageStates, setCoverageStates] = useState('');

  useEffect(() => {
    if (tenant) {
      setIsPubliclyListed(tenant.isPubliclyListed ?? true);
      setAcceptingNewConnections(tenant.acceptingNewConnections ?? true);
      setAboutText(tenant.aboutText ?? '');
      setPublicSlug(tenant.publicSlug ?? '');
      try {
        setCategories(tenant.categories ? JSON.parse(tenant.categories).join(', ') : '');
      } catch { setCategories(''); }
      try {
        setCoverageStates(tenant.coverageStateCodes ? JSON.parse(tenant.coverageStateCodes).join(', ') : tenant.stateCode ?? '');
      } catch { setCoverageStates(tenant.stateCode ?? ''); }
    }
  }, [tenant]);

  const handleSave = async () => {
    try {
      const catArr = categories.split(',').map(s => s.trim()).filter(Boolean);
      const stateArr = coverageStates.split(',').map(s => s.trim()).filter(Boolean);
      await updateTenant.mutateAsync({
        isPubliclyListed,
        acceptingNewConnections,
        aboutText: aboutText || null,
        publicSlug: publicSlug || null,
        categories: catArr.length ? JSON.stringify(catArr) : null,
        coverageStateCodes: stateArr.length ? JSON.stringify(stateArr) : null,
      });
      toast.success('Public profile saved');
    } catch {
      toast.error('Failed to save');
    }
  };

  const handleSync = async () => {
    try {
      const r = await syncCatalog.mutateAsync();
      toast.success(`Synced ${r.synced} products to public catalogue`);
    } catch {
      toast.error('Sync failed');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-slate-700">
        <Globe className="w-5 h-5" />
        <h3 className="text-lg font-semibold">Public Discovery Profile</h3>
      </div>
      <p className="text-sm text-slate-500">
        Control how pharmacies discover your business. Listed stockists appear on the pharmacy Discover page.
      </p>

      <div className="space-y-4 max-w-xl">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isPubliclyListed} onChange={e => setIsPubliclyListed(e.target.checked)} />
          List my business publicly
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={acceptingNewConnections} onChange={e => setAcceptingNewConnections(e.target.checked)} />
          Accept new connection requests
        </label>
        <Input label="Public URL slug" value={publicSlug} onChange={e => setPublicSlug(e.target.value)} placeholder="your-business-name" />
        {publicSlug && (
          <p className="text-xs text-teal-600">Preview: /pharmacy/discover/{publicSlug}</p>
        )}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700">About</label>
          <textarea className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg min-h-[80px]" value={aboutText} onChange={e => setAboutText(e.target.value)} />
        </div>
        <Input label="Categories (comma-separated)" value={categories} onChange={e => setCategories(e.target.value)} placeholder="e.g. Generics, Surgical" />
        <Input label="Coverage state codes (comma-separated)" value={coverageStates} onChange={e => setCoverageStates(e.target.value)} placeholder="08, 09" />
        <div className="flex gap-2">
          <Button variant="primary" onClick={handleSave} isLoading={updateTenant.isPending}>Save Profile</Button>
          <Button variant="secondary" leftIcon={<RefreshCw className="w-4 h-4" />} onClick={handleSync} isLoading={syncCatalog.isPending}>
            Sync Public Catalogue
          </Button>
        </div>
      </div>

      {catalogItems.length > 0 && (
        <div className="mt-8">
          <h4 className="text-sm font-semibold text-slate-700 mb-2">Product visibility ({catalogItems.length} items)</h4>
          <div className="border border-slate-100 rounded-lg max-h-60 overflow-y-auto">
            {catalogItems.map((item: any) => (
              <label key={item.productId} className="flex items-center gap-2 px-3 py-2 border-b border-slate-50 text-sm hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={item.isPublic}
                  onChange={e => setVisibility.mutate({ productId: item.productId, isPublic: e.target.checked })}
                />
                <span className="flex-1 truncate">{item.name}</span>
                <span className="text-xs text-slate-400">{item.category}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default PublicProfileTab;
