import { Link } from 'react-router-dom';

export default function DoctorDashboardPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Doctor Dashboard</h1>
      <p className="text-slate-600">Manage consultations, write prescriptions, and track earnings — consolidated from HUB/DSW doctor modules.</p>
      <Link to="/doctor/consultations" className="inline-block px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm">View Consultations</Link>
    </div>
  );
}
