import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Search, Store, Package } from 'lucide-react';
import { usePublicStockists } from '../../../hooks/usePublicStockists';
import { useAuthStore } from '../../../stores/authStore';
import { useDebounce } from '../../../hooks/useDebounce';
import PageHeader from '../../common/PageHeader';
import Button from '../../common/Button';
import Pagination from '../../common/Pagination';
import EmptyState from '../../common/EmptyState';

const DiscoverStockistsPage = () => {
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const [search, setSearch] = useState('');
  const [state, setState] = useState(user?.stateCode ?? '');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(search, 300);

  const { data, isLoading } = usePublicStockists({
    q: debouncedSearch || undefined,
    state: state || undefined,
    page,
    pageSize: 12,
  });

  const stockists = data?.data ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <PageHeader
        breadcrumbs={[
          { label: 'Stockists', link: '/pharmacy/stockists' },
          { label: 'Discover' },
        ]}
        title="Discover Stockists"
        subtitle="Browse publicly listed distributors and their catalogues before connecting"
        actions={
          <Link to="/pharmacy/stockists">
            <Button variant="secondary">My Connections</Button>
          </Link>
        }
      />

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, GSTIN..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-9 h-9 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        </div>
        <select
          value={state}
          onChange={e => { setState(e.target.value); setPage(1); }}
          className="h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white"
        >
          <option value="">All states</option>
          <option value="08">Rajasthan (08)</option>
          <option value="09">Uttar Pradesh (09)</option>
          <option value="07">Delhi (07)</option>
          <option value="27">Maharashtra (27)</option>
        </select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-40 bg-slate-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : stockists.length === 0 ? (
        <EmptyState
          title="No stockists found"
          description="Try adjusting your search or state filter"
        />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {stockists.filter((s: any) => s.publicSlug).map((s: any) => (
              <button
                key={s.publicSlug}
                type="button"
                onClick={() => navigate(`/pharmacy/discover/${s.publicSlug}`)}
                className="text-left bg-white rounded-xl border border-slate-100 shadow-sm p-4 hover:border-teal-200 hover:shadow-md transition-all"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center shrink-0">
                    <Store className="w-5 h-5 text-teal-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-slate-800 truncate">{s.businessName}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">{s.gstin ?? 'GSTIN not listed'}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Package className="w-3 h-3" />
                        {s.productCount ?? 0} products
                      </span>
                      {!s.acceptingNewConnections && (
                        <span className="text-amber-600">Not accepting requests</span>
                      )}
                    </div>
                    {Array.isArray(s.categories) && s.categories.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {s.categories.slice(0, 3).map((c: string) => (
                          <span key={c} className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">{c}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
          {total > 12 && (
            <Pagination page={page} total={total} pageSize={12} onPageChange={setPage} />
          )}
        </>
      )}
    </div>
  );
};

export default DiscoverStockistsPage;
