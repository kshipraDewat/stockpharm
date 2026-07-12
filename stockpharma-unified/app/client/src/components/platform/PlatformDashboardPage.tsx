import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import StatCard from '../common/StatCard';

export default function PlatformDashboardPage() {
  const { data: stats } = useQuery({
    queryKey: ['platform-stats'],
    queryFn: async () => (await api.get('/platform/stats')).data,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Platform Overview</h1>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Tenants" value={String(stats?.totalTenants ?? '—')} />
        <StatCard label="Stockists" value={String(stats?.stockists ?? '—')} />
        <StatCard label="Pharmacies" value={String(stats?.pharmacies ?? '—')} />
        <StatCard label="Pending Approvals" value={String(stats?.pendingApprovals ?? '—')} />
      </div>
      <p className="text-sm text-slate-500">
        Consolidated from HUB/ERP admin governance — approve registrations, monitor tenants, and oversee the network.
      </p>
    </div>
  );
}
