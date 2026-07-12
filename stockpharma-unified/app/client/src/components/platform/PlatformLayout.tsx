import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';

export default function PlatformLayout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/platform/login');
  };

  return (
    <div className="min-h-screen bg-slate-100 flex">
      <aside className="w-56 bg-slate-900 text-white p-4 flex flex-col">
        <div className="font-bold text-lg mb-6">Platform Admin</div>
        <nav className="space-y-1 flex-1 text-sm">
          <Link to="/platform/dashboard" className="block px-3 py-2 rounded hover:bg-slate-800">Dashboard</Link>
          <Link to="/platform/tenants" className="block px-3 py-2 rounded hover:bg-slate-800">Tenants</Link>
          <Link to="/platform/approvals" className="block px-3 py-2 rounded hover:bg-slate-800">Approvals</Link>
        </nav>
        <div className="text-xs text-slate-400 pt-4 border-t border-slate-700">
          <p>{user?.name}</p>
          <button type="button" onClick={handleLogout} className="text-red-300 hover:text-red-200 mt-2">Logout</button>
        </div>
      </aside>
      <main className="flex-1 p-6 overflow-auto"><Outlet /></main>
    </div>
  );
}
