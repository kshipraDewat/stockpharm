import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import toast from 'react-hot-toast';
import Button from '../common/Button';

export default function TenantApprovalsPage() {
  const qc = useQueryClient();
  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ['platform-tenants'],
    queryFn: async () => (await api.get('/platform/tenants')).data,
  });

  const approve = useMutation({
    mutationFn: (id: string) => api.patch(`/platform/tenants/${id}/approval`, { status: 'approved' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['platform-tenants'] }); toast.success('Approved'); },
  });

  const reject = useMutation({
    mutationFn: (id: string) => api.patch(`/platform/tenants/${id}/approval`, { status: 'rejected' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['platform-tenants'] }); toast.success('Rejected'); },
  });

  if (isLoading) return <p className="text-slate-500">Loading tenants…</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Tenant Management</h1>
      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="text-left p-3">Business</th>
              <th className="text-left p-3">Type</th>
              <th className="text-left p-3">Email</th>
              <th className="text-left p-3">Status</th>
              <th className="text-right p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((t: any) => (
              <tr key={t.id} className="border-b last:border-0">
                <td className="p-3 font-medium">{t.businessName}</td>
                <td className="p-3 capitalize">{t.tenantType}</td>
                <td className="p-3">{t.email}</td>
                <td className="p-3">{(t as any).approvalStatus ?? 'approved'}</td>
                <td className="p-3 text-right space-x-2">
                  <Button size="sm" variant="primary" onClick={() => approve.mutate(t.id)}>Approve</Button>
                  <Button size="sm" variant="secondary" onClick={() => reject.mutate(t.id)}>Reject</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
