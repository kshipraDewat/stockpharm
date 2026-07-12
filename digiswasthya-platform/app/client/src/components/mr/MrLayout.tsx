import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';

export default function MrLayout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-amber-50">
      <header className="bg-amber-700 text-white px-6 py-4 flex justify-between items-center">
        <span className="font-bold">PharmaMR</span>
        <nav className="flex gap-4 text-sm">
          <Link to="/mr/dashboard">Dashboard</Link>
          <Link to="/mr/visits">Pharmacy Visits</Link>
        </nav>
        <button type="button" onClick={async () => { await logout(); navigate('/mr/login'); }} className="text-amber-200 text-sm">{user?.name} · Logout</button>
      </header>
      <main className="p-6 max-w-4xl mx-auto"><Outlet /></main>
    </div>
  );
}
