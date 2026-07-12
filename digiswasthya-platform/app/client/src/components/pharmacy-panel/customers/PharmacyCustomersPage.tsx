import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Trash2 } from 'lucide-react';
import { useCustomers, useCreateCustomer, useDeleteCustomer } from '../../../hooks/useCustomers';
import { useAuthStore } from '../../../stores/authStore';
import PageHeader from '../../common/PageHeader';
import Button from '../../common/Button';
import Pagination from '../../common/Pagination';
import ConfirmDialog from '../../common/ConfirmDialog';
import Modal from '../../common/Modal';

const PharmacyCustomersPage = () => {
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const pageSize = 20;

  const { data, isLoading } = useCustomers({ search, page, pageSize });
  const createCustomer = useCreateCustomer();
  const deleteCustomer = useDeleteCustomer();

  const customers = data?.data ?? [];
  const total = data?.total ?? 0;

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error('Name is required'); return; }
    try {
      await createCustomer.mutateAsync({ name: name.trim(), phone: phone.trim() || undefined });
      toast.success('Customer added');
      setName(''); setPhone(''); setShowAdd(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Failed to add customer');
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteCustomer.mutateAsync(deleteId);
      toast.success('Customer deleted');
      setDeleteId(null);
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Delete failed');
    }
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <PageHeader
        breadcrumbs={[{ label: 'Customers' }]}
        showBack={false}
        actions={
          <Button variant="primary" leftIcon={<Plus />} onClick={() => setShowAdd(true)} className="!bg-teal-600 hover:!bg-teal-700">
            Add Customer
          </Button>
        }
      />

      <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-50">
          <input
            type="text"
            placeholder="Search name or phone…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="w-full max-w-xs h-9 px-3 text-sm border border-slate-200 rounded-lg"
          />
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="px-4 py-3 text-left text-xs text-slate-400 uppercase">Name</th>
              <th className="px-4 py-3 text-left text-xs text-slate-400 uppercase">Phone</th>
              <th className="px-4 py-3 text-right text-xs text-slate-400 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {isLoading ? (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>
            ) : customers.length === 0 ? (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-400">No customers yet</td></tr>
            ) : customers.map((c: { id: string; name: string; phone?: string }) => (
              <tr key={c.id}>
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3 text-slate-500">{c.phone ?? '—'}</td>
                <td className="px-4 py-3 text-right">
                  {isAdmin && (
                    <button onClick={() => setDeleteId(c.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {total > pageSize && <Pagination page={page} total={total} pageSize={pageSize} onPageChange={setPage} />}
      </div>

      <Modal
        isOpen={showAdd}
        onClose={() => setShowAdd(false)}
        title="Add Customer"
        size="md"
        footer={
          <>
            <Button variant="secondary" type="button" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button variant="primary" type="submit" form="add-customer-form" isLoading={createCustomer.isPending} accent="teal">Save</Button>
          </>
        }
      >
        <form id="add-customer-form" onSubmit={handleAdd} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700">Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} className="w-full h-10 px-3 text-sm border border-slate-200 rounded-lg mt-1" required />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Phone</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} className="w-full h-10 px-3 text-sm border border-slate-200 rounded-lg mt-1" />
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete customer?"
        description="This customer record will be permanently removed."
        confirmLabel="Delete"
        isLoading={deleteCustomer.isPending}
      />
    </div>
  );
};

export default PharmacyCustomersPage;
