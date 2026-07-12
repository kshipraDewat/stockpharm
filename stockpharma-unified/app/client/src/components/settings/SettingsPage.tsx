import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Building2, Shield, Bell, Database, Save, Lock, Mail, Smartphone, Trash2, Ban, Link2, ShoppingCart, Globe } from 'lucide-react';
import { useUsers, useChangePassword, useUpdateUser } from '../../hooks/useUsers';
import { useTenant, useUpdateTenant } from '../../hooks/useSettings';
import { useAuthStore } from '../../stores/authStore';
import Button from '../common/Button';
import Input from '../common/Input';
import PageHeader from '../common/PageHeader';
import ConfirmDialog from '../common/ConfirmDialog';
import { downloadCSV } from '../../lib/exportUtils';
import AddUserModal from './AddUserModal';
import ConnectionsTab from './ConnectionsTab';
import OrderDefaultsTab from './OrderDefaultsTab';
import CatalogSyncTab from './CatalogSyncTab';
import PublicProfileTab from './PublicProfileTab';
import { validatePassword } from '../../lib/validation';
import toast from 'react-hot-toast';

const SettingsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') ?? 'business');
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [userToDelete, setUserToDelete] = useState<string | null>(null);
  const [userToDeactivate, setUserToDeactivate] = useState<string | null>(null);
  const me = useAuthStore((s) => s.user);
  const [notifications, setNotifications] = useState({
    lowStockAlerts: true,
    dailyLedger: false,
    overduePayments: true,
  });

  const { data: usersData, isLoading: usersLoading } = useUsers();
  const users = usersData?.data ?? usersData ?? [];
  const changePassword = useChangePassword();
  const updateUser = useUpdateUser();

  const { data: tenant, isLoading: tenantLoading } = useTenant();
  const updateTenant = useUpdateTenant();

  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dlNumber, setDlNumber] = useState('');
  const [gstin, setGstin] = useState('');
  const [address, setAddress] = useState('');
  const [stateCode, setStateCode] = useState('');

  useEffect(() => {
    if (tenant) {
      setBusinessName(tenant.businessName ?? '');
      setEmail(tenant.email ?? '');
      setPhone(tenant.phone ?? '');
      setDlNumber(tenant.dlNumber ?? '');
      setGstin(tenant.gstin ?? '');
      setAddress(() => {
        try {
          const parsed = JSON.parse(tenant.addressJson);
          return typeof parsed === 'string' ? parsed : (parsed.line1 ?? parsed.address ?? '');
        } catch {
          return tenant.addressJson ?? '';
        }
      });
      setStateCode(tenant.stateCode ?? '');
      if (tenant.notificationsJson) {
        try {
          setNotifications(JSON.parse(tenant.notificationsJson));
        } catch { /* keep defaults */ }
      }
    }
  }, [tenant]);

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && tab !== activeTab) setActiveTab(tab);
  }, [searchParams]);

  const selectTab = (tabId: string) => {
    setActiveTab(tabId);
    setSearchParams({ tab: tabId }, { replace: true });
  };

  const tabs = [
    { id: 'business', label: 'Business info', icon: Building2 },
    { id: 'connections', label: 'Connections', icon: Link2 },
    { id: 'public-profile', label: 'Public Profile', icon: Globe },
    { id: 'staff', label: 'Staff / Users', icon: Shield },
    { id: 'order-defaults', label: 'Order Defaults', icon: ShoppingCart },
    { id: 'catalog', label: 'Catalog Sync', icon: Database },
    { id: 'security', label: 'Security', icon: Lock },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'system', label: 'System', icon: Database },
  ];

  const handleSaveBusiness = () => {
    updateTenant.mutate(
      { businessName, email, phone, dlNumber: dlNumber || null, gstin: gstin || null, addressJson: JSON.stringify({ line1: address }), stateCode },
      {
        onSuccess: () => toast.success('Business info saved'),
        onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Failed to save'),
      }
    );
  };

  const handlePasswordChange = () => {
    if (!currentPw || !newPw) { toast.error('Enter current and new password'); return; }
    const pwErr = validatePassword(newPw);
    if (pwErr) { toast.error(pwErr); return; }
    if (newPw !== confirmPw) { toast.error('New passwords do not match'); return; }
    changePassword.mutate({ currentPassword: currentPw, newPassword: newPw }, {
      onSuccess: () => { toast.success('Password updated!'); setCurrentPw(''); setNewPw(''); setConfirmPw(''); },
      onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Failed to change password'),
    });
  };

  const handleNotificationChange = (key: string) => {
    const updated = { ...notifications, [key]: !notifications[key as keyof typeof notifications] };
    setNotifications(updated);
    // Save to API
    updateTenant.mutate(
      { notificationsJson: JSON.stringify(updated) },
      {
        onSuccess: () => toast.success('Notification preferences saved'),
        onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Failed to save preferences'),
      }
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: 'Settings' }]}
        showBack={false}
      />

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="w-full lg:w-56 space-y-0.5 shrink-0">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => selectTab(tab.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                activeTab === tab.id
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}>
              <tab.icon className={`w-4 h-4 shrink-0 ${activeTab === tab.id ? 'text-blue-600' : 'text-slate-400'}`} />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1">
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">
                {tabs.find(t => t.id === activeTab)?.label}
              </h3>
              {activeTab === 'business' && (
                <Button variant="primary" size="sm" leftIcon={<Save size={14} />} onClick={handleSaveBusiness} isLoading={updateTenant.isPending}>
                  Save
                </Button>
              )}
            </div>

            <div className="p-6">
              {activeTab === 'business' && (
                <div className="max-w-2xl space-y-4">
                  {tenantLoading ? (
                    <div className="space-y-3">
                      {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-9 bg-slate-100 rounded-lg animate-pulse" />)}
                    </div>
                  ) : (
                    <>
                      <Input label="Business Name" value={businessName} onChange={e => setBusinessName(e.target.value)} required />
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input label="Email Address" value={email} onChange={e => setEmail(e.target.value)} type="email" leftIcon={<Mail size={16} />} required />
                        <Input label="Phone Number" value={phone} onChange={e => setPhone(e.target.value)} leftIcon={<Smartphone size={16} />} required />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input label="Drug License (DL)" value={dlNumber} onChange={e => setDlNumber(e.target.value)} />
                        <Input label="GST Number (GSTIN)" value={gstin} onChange={e => setGstin(e.target.value)} />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Input label="State Code" value={stateCode} onChange={e => setStateCode(e.target.value)} />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-slate-700 block mb-1.5">Business Address</label>
                        <textarea
                          className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 h-24 resize-none"
                          value={address}
                          onChange={e => setAddress(e.target.value)}
                        />
                      </div>
                    </>
                  )}
                </div>
              )}

              {activeTab === 'connections' && <ConnectionsTab />}
              {activeTab === 'public-profile' && <PublicProfileTab />}
              {activeTab === 'order-defaults' && <OrderDefaultsTab />}
              {activeTab === 'catalog' && <CatalogSyncTab />}
              {activeTab === 'staff' && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <p className="text-sm text-slate-500">{users.length} team member{users.length !== 1 ? 's' : ''}</p>
                    <Button variant="primary" size="sm" onClick={() => setIsAddUserModalOpen(true)}>Add User</Button>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="pb-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">Name</th>
                        <th className="pb-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">Email</th>
                        <th className="pb-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">Role</th>
                        <th className="pb-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {usersLoading ? (
                        <tr><td colSpan={4} className="py-8 text-center text-slate-400">Loading…</td></tr>
                      ) : users.length === 0 ? (
                        <tr><td colSpan={4} className="py-8 text-center text-slate-400">No users found.</td></tr>
                      ) : users.map((user: any) => (
                        <tr key={user.id}>
                          <td className="py-3 font-medium text-slate-900">{user.name}</td>
                          <td className="py-3 text-slate-500">{user.email}</td>
                          <td className="py-3">
                            <span className={`text-xs px-2 py-0.5 rounded font-medium ${user.role === 'admin' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                              {user.role}
                            </span>
                            {user.isActive === false && (
                              <span className="ml-1 text-xs px-2 py-0.5 rounded bg-red-50 text-red-600">Inactive</span>
                            )}
                          </td>
                          <td className="py-3 flex gap-1">
                            {/* C16: own-row gets no destructive controls */}
                            {user.id === me?.id ? (
                              <span className="text-xs text-slate-400">You</span>
                            ) : (
                              <>
                                {user.isActive !== false ? (
                                  <button
                                    onClick={() => setUserToDeactivate(user.id)}
                                    className="p-1 text-orange-600 hover:bg-orange-50 rounded transition-colors"
                                    title="Deactivate user"
                                  >
                                    <Ban className="w-4 h-4" />
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => updateUser.mutate({ id: user.id, isActive: true }, {
                                      onSuccess: () => toast.success('User reactivated'),
                                      onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Failed'),
                                    })}
                                    className="p-1 text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                                    title="Reactivate user"
                                  >
                                    Reactivate
                                  </button>
                                )}
                                <button
                                  onClick={() => setUserToDelete(user.id)}
                                  className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                                  title="Remove user"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {activeTab === 'security' && (
                <div className="max-w-md space-y-4">
                  <Input label="Current Password" type="password" leftIcon={<Lock size={16} />}
                    value={currentPw} onChange={e => setCurrentPw(e.target.value)} />
                  <Input label="New Password" type="password" leftIcon={<Lock size={16} />}
                    value={newPw} onChange={e => setNewPw(e.target.value)} />
                  <Input label="Confirm New Password" type="password" leftIcon={<Lock size={16} />}
                    value={confirmPw} onChange={e => setConfirmPw(e.target.value)} />
                  <Button variant="primary" size="sm" onClick={handlePasswordChange} isLoading={changePassword.isPending}>
                    Update Password
                  </Button>
                </div>
              )}

              {activeTab === 'notifications' && (
                <div className="max-w-lg space-y-3">
                  {[
                    { key: 'lowStockAlerts', label: 'Low Stock Alerts', desc: 'Notify when physical stock drops below reorder point.' },
                    { key: 'overduePayments', label: 'Overdue Payment Reminders', desc: 'Alert when pharmacy outstanding exceeds credit days.' },
                  ].map(item => (
                    <label key={item.key} className="flex items-center justify-between p-4 border border-slate-100 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{item.label}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{item.desc}</p>
                      </div>
                      <input type="checkbox" checked={notifications[item.key as keyof typeof notifications]} onChange={() => handleNotificationChange(item.key)} className="w-4 h-4 text-blue-600 rounded accent-blue-600" />
                    </label>
                  ))}
                </div>
              )}

              {activeTab === 'system' && (
                <div className="space-y-8">
                  <div>
                    <h4 className="text-sm font-medium text-slate-700 mb-3">Data Export</h4>
                    <Button variant="secondary" size="sm" onClick={() => downloadCSV(users, 'users')}>Download Users CSV</Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <AddUserModal isOpen={isAddUserModalOpen} onClose={() => setIsAddUserModalOpen(false)} />

      <ConfirmDialog
        isOpen={userToDelete !== null}
        onClose={() => setUserToDelete(null)}
        onConfirm={() => {
          if (!userToDelete) return;
          updateUser.mutate({ id: userToDelete, isActive: false }, {
            onSuccess: () => { toast.success('User removed'); setUserToDelete(null); },
            onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Failed to remove user'),
          });
        }}
        title="Remove User"
        description="This will permanently remove this user from your team. They will no longer be able to access the system."
        confirmLabel="Remove User"
        confirmVariant="danger"
      />

      <ConfirmDialog
        isOpen={userToDeactivate !== null}
        onClose={() => setUserToDeactivate(null)}
        onConfirm={() => {
          if (!userToDeactivate) return;
          updateUser.mutate({ id: userToDeactivate, isActive: false }, {
            onSuccess: () => { toast.success('User deactivated'); setUserToDeactivate(null); },
            onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Failed to deactivate user'),
          });
        }}
        title="Deactivate User"
        description="This will deactivate the user account. They will be unable to log in, but their data will be preserved."
        confirmLabel="Deactivate"
        confirmVariant="warning"
      />

    </div>
  );
};

export default SettingsPage;
