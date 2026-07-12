import { Link } from 'react-router-dom';

export default function ConsumerDashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Welcome to Digital Swasthya</h1>
      <div className="grid sm:grid-cols-3 gap-4">
        <Link to="/shop/pharmacies" className="p-6 bg-white rounded-xl border hover:border-violet-300 shadow-sm">
          <h2 className="font-semibold">Browse Pharmacies</h2>
          <p className="text-sm text-slate-500 mt-1">Order medicines online (B2C)</p>
        </Link>
        <Link to="/shop/orders" className="p-6 bg-white rounded-xl border hover:border-violet-300 shadow-sm">
          <h2 className="font-semibold">My Orders</h2>
          <p className="text-sm text-slate-500 mt-1">Track deliveries &amp; returns</p>
        </Link>
        <Link to="/shop/doctors" className="p-6 bg-white rounded-xl border hover:border-violet-300 shadow-sm">
          <h2 className="font-semibold">Consult a Doctor</h2>
          <p className="text-sm text-slate-500 mt-1">Book audio/video/clinic consults</p>
        </Link>
      </div>
    </div>
  );
}
