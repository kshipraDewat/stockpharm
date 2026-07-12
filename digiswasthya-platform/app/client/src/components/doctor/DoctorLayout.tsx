import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';

export default function DoctorLayout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-emerald-50">
      <header className="bg-emerald-700 text-white px-6 py-4 flex justify-between items-center">
        <span className="font-bold">Doctor Portal</span>
        <nav className="flex gap-4 text-sm">
          <Link to="/doctor/dashboard">Dashboard</Link>
          <Link to="/doctor/consultations">Consultations</Link>
        </nav>
        <button type="button" onClick={async () => { await logout(); navigate('/doctor/login'); }} className="text-emerald-200 text-sm">{user?.name} · Logout</button>
      </header>
      <main className="p-6 max-w-4xl mx-auto"><Outlet /></main>
    </div>
  );
}
