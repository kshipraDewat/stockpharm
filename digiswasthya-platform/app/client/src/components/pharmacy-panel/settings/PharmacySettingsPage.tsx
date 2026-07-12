import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Building2, Shield, Lock, Trash2, Bell, ScanLine } from 'lucide-react';
import { useTenant, useUpdateTenant } from '../../../hooks/useSettings';
import { useUsers, useChangePassword, useUpdateUser } from '../../../hooks/useUsers';
import { useAuthStore } from '../../../stores/authStore';
import PageHeader from '../../common/PageHeader';
import Button from '../../common/Button';
import Input from '../../common/Input';
import ConfirmDialog from '../../common/ConfirmDialog';
import PharmacyAddUserModal from './PharmacyAddUserModal';
import { validatePassword } from '../../../lib/validation';

const PharmacySettingsPage = () => {
  const [activeTab, setActiveTab] = useState('business');
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<string | null>(null);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');

  const { data: tenant, isLoading } = useTenant();
  const updateTenant = useUpdateTenant();
  const { data: usersData, isLoading: usersLoading } = useUsers();
  const users = usersData?.data ?? usersData ?? [];
  const changePassword = useChangePassword();
  const updateUser = useUpdateUser();
  const me = useAuthStore((s) => s.user);

  const [businessName, setBusinessName] = useState('');
  const [gstin, setGstin] = useState('');
  const [dlNumber, setDlNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [notifications, setNotifications] = useState({
    lowStockAlerts: true,
    dailyLedger: false,
    overduePayments: true,
  });
  const [posConfig, setPosConfig] = useState({ defaultPaymentMethod: 'cash', printReceipt: true });

  useEffect(() => {
    if (tenant) {
      setBusinessName(tenant.businessName ?? tenant.name ?? '');
      setGstin(tenant.gstin ?? '');
      setDlNumber(tenant.dlNumber ?? '');
      setPhone(tenant.phone ?? '');
      if (tenant.notificationsJson) {
        try {
          const parsed = JSON.parse(tenant.notificationsJson);
          setNotifications(prev => ({ ...prev, ...parsed }));
          if (parsed.posConfig) setPosConfig(prev => ({ ...prev, ...parsed.posConfig }));
        } catch { /* defaults */ }
      }
    }
  }, [tenant]);

  const tabs = [
    { id: 'business', label: 'Business', icon: Building2 },
    { id: 'staff', label: 'Staff', icon: Shield },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'pos', label: 'POS Config', icon: ScanLine },
    { id: 'security', label: 'Security', icon: Lock },
  ];

  const saveNotificationsJson = (patch: Record<string, unknown>) => {
    let current: Record<string, unknown> = {};
    try { current = JSON.parse(tenant?.notificationsJson ?? '{}'); } catch { /* empty */ }
    const updated = { ...current, ...patch };
    updateTenant.mutate({ notificationsJson: JSON.stringify(updated) }, {
      onSuccess: () => toast.success('Settings saved'),
      onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Save failed'),
    });
  };

  const handleNotificationChange = (key: string) => {
    // me61: snapshot the prior state and roll it back on persistence failure
    // so the toggle never lies about server state.
    const prev = notifications;
    const updated = { ...notifications, [key]: !notifications[key as keyof typeof notifications] };
    setNotifications(updated);
    let current: Record<string, unknown> = {};
    try { current = JSON.parse(tenant?.notificationsJson ?? '{}'); } catch { /* empty */ }
    const payload = { ...current, ...updated };
    updateTenant.mutate({ notificationsJson: JSON.stringify(payload) }, {
      onSuccess: () => toast.success('Settings saved'),
      onError: (err: any) => {
        setNotifications(prev);
        toast.error(err?.response?.data?.error ?? 'Save failed — reverted');
      },
    });
  };

  const handlePosConfigSave = () => {
    saveNotificationsJson({ posConfig });
  };

  const handleSaveBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateTenant.mutateAsync({ businessName, gstin: gstin || null, dlNumber, phone });
      toast.success('Settings saved');
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Save failed');
    }
  };

  const handlePasswordChange = () => {
    if (!currentPw || !newPw) { toast.error('Enter current and new password'); return; }
    const pwErr = validatePassword(newPw);
    if (pwErr) { toast.error(pwErr); return; }
    if (newPw !== confirmPw) { toast.error('Passwords do not match'); return; }
    changePassword.mutate({ currentPassword: currentPw, newPassword: newPw }, {
      onSuccess: () => { toast.success('Password updated'); setCurrentPw(''); setNewPw(''); setConfirmPw(''); },
      onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Failed'),
    });
  };

  if (isLoading) return <div className="p-8 text-center text-slate-400">Loading…</div>;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <PageHeader breadcrumbs={[{ label: 'Settings' }]} showBack={false} />

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="w-full lg:w-48 space-y-0.5">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium rounded-lg ${activeTab === tab.id ? 'bg-teal-50 text-teal-700' : 'text-slate-600 hover:bg-slate-50'}`}>
              <tab.icon className="w-4 h-4" />{tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 bg-white rounded-xl border border-slate-100 shadow-sm">
          <div className="px-6 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-900">{tabs.find(t => t.id === activeTab)?.label}</h3>
          </div>
          <div className="p-6">
            {activeTab === 'business' && (
              <form onSubmit={handleSaveBusiness} className="space-y-4 max-w-lg">
                <div>
                  <label className="text-sm font-medium text-slate-700">Pharmacy Name</label>
                  <input value={businessName} onChange={e => setBusinessName(e.target.value)} className="w-full h-10 px-3 text-sm border border-slate-200 rounded-lg mt-1" />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">GSTIN</label>
                  <input value={gstin} onChange={e => setGstin(e.target.value)} className="w-full h-10 px-3 text-sm border border-slate-200 rounded-lg mt-1" />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Drug License (DL)</label>
                  <input value={dlNumber} onChange={e => setDlNumber(e.target.value)} className="w-full h-10 px-3 text-sm border border-slate-200 rounded-lg mt-1" />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Phone</label>
                  <input value={phone} onChange={e => setPhone(e.target.value)} className="w-full h-10 px-3 text-sm border border-slate-200 rounded-lg mt-1" />
                </div>
                <Button variant="primary" type="submit" isLoading={updateTenant.isPending} className="!bg-teal-600 hover:!bg-teal-700">Save Changes</Button>
              </form>
            )}

            {activeTab === 'staff' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <p className="text-sm text-slate-500">{users.length} team member{users.length !== 1 ? 's' : ''}</p>
                  <Button variant="primary" size="sm" className="!bg-teal-600 hover:!bg-teal-700" onClick={() => setIsAddUserOpen(true)}>Add User</Button>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="pb-3 text-left text-xs text-slate-400 uppercase">Name</th>
                      <th className="pb-3 text-left text-xs text-slate-400 uppercase">Email</th>
                      <th className="pb-3 text-left text-xs text-slate-400 uppercase">Role</th>
                      <th className="pb-3 text-left text-xs text-slate-400 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {usersLoading ? (
                      <tr><td colSpan={4} className="py-8 text-center text-slate-400">Loading…</td></tr>
                    ) : users.map((user: any) => (
                      <tr key={user.id}>
                        <td className="py-3 font-medium">{user.name}</td>
                        <td className="py-3 text-slate-500">{user.email}</td>
                        <td className="py-3"><span className="text-xs px-2 py-0.5 rounded bg-teal-50 text-teal-700 capitalize">{user.role}</span>
                          {user.isActive === false && <span className="ml-1 text-xs px-2 py-0.5 rounded bg-red-50 text-red-600">Inactive</span>}
                        </td>
                        <td className="py-3 flex gap-1">
                          {/* C16: never offer self-deactivation */}
                          {user.id === me?.id ? (
                            <span className="text-xs text-slate-400">You</span>
                          ) : user.isActive !== false ? (
                            <button onClick={() => setUserToDelete(user.id)} className="p-1 text-red-600 hover:bg-red-50 rounded" title="Deactivate"><Trash2 className="w-4 h-4" /></button>
                          ) : (
                            <button onClick={() => updateUser.mutate({ id: user.id, isActive: true }, {
                              onSuccess: () => toast.success('User reactivated'),
                              onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Failed'),
                            })} className="text-xs text-emerald-600 hover:underline">Reactivate</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === 'notifications' && (
              <div className="max-w-lg space-y-3">
                {[
                  { key: 'lowStockAlerts', label: 'Low Stock Alerts', desc: 'Notify when stock drops below minimum level.' },
                  { key: 'overduePayments', label: 'Overdue Payables', desc: 'Alert when stockist bills are overdue.' },
                ].map(item => (
                  <label key={item.key} className="flex items-center justify-between p-4 border border-slate-100 rounded-xl hover:bg-slate-50 cursor-pointer">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{item.label}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{item.desc}</p>
                    </div>
                    <input type="checkbox" checked={notifications[item.key as keyof typeof notifications]} onChange={() => handleNotificationChange(item.key)} className="w-4 h-4 text-teal-600 rounded accent-teal-600" />
                  </label>
                ))}
              </div>
            )}

            {activeTab === 'pos' && (
              <div className="max-w-md space-y-4">
                <div>
                  <label className="text-sm font-medium text-slate-700">Default Payment Method</label>
                  <select value={posConfig.defaultPaymentMethod} onChange={e => setPosConfig(p => ({ ...p, defaultPaymentMethod: e.target.value }))}
                    className="w-full h-10 px-3 text-sm border border-slate-200 rounded-lg mt-1">
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                    <option value="card">Card</option>
                  </select>
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={posConfig.printReceipt} onChange={e => setPosConfig(p => ({ ...p, printReceipt: e.target.checked }))} className="accent-teal-600" />
                  Prompt to print receipt after sale
                </label>
                <Button variant="primary" size="sm" className="!bg-teal-600 hover:!bg-teal-700" onClick={handlePosConfigSave} isLoading={updateTenant.isPending}>Save POS Settings</Button>
              </div>
            )}

            {activeTab === 'security' && (
              <div className="max-w-md space-y-4">
                <Input label="Current Password" type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} />
                <Input label="New Password" type="password" value={newPw} onChange={e => setNewPw(e.target.value)} />
                <Input label="Confirm Password" type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} />
                <Button variant="primary" size="sm" className="!bg-teal-600 hover:!bg-teal-700" onClick={handlePasswordChange} isLoading={changePassword.isPending}>Update Password</Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <PharmacyAddUserModal isOpen={isAddUserOpen} onClose={() => setIsAddUserOpen(false)} />
      <ConfirmDialog
        isOpen={userToDelete !== null}
        onClose={() => setUserToDelete(null)}
        onConfirm={() => {
          if (!userToDelete) return;
          updateUser.mutate({ id: userToDelete, isActive: false }, {
            onSuccess: () => { toast.success('User removed'); setUserToDelete(null); },
            onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Failed'),
          });
        }}
        title="Remove User"
        description="This user will no longer be able to access the pharmacy panel."
        confirmLabel="Remove"
        confirmVariant="danger"
      />
    </div>
  );
};

export default PharmacySettingsPage;
