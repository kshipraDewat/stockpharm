import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';

export default function ConsumerLayout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-violet-50">
      <header className="bg-violet-700 text-white px-6 py-4 flex items-center justify-between">
        <span className="font-bold text-lg">Digital Swasthya — Shop</span>
        <nav className="flex gap-4 text-sm">
          <Link to="/shop/dashboard">Home</Link>
          <Link to="/shop/pharmacies">Pharmacies</Link>
          <Link to="/shop/orders">My Orders</Link>
          <Link to="/shop/doctors">Doctors</Link>
        </nav>
        <button type="button" onClick={async () => { await logout(); navigate('/shop/login'); }} className="text-violet-200 text-sm">
          {user?.name} · Logout
        </button>
      </header>
      <main className="p-6 max-w-5xl mx-auto"><Outlet /></main>
    </div>
  );
}
