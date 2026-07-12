import { Link } from 'react-router-dom';

export default function MrDashboardPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">MR Dashboard</h1>
      <p className="text-slate-600">Field sales, pharmacy visits, and collections — from PharmaMR / Chameleon.</p>
      <Link to="/mr/visits" className="inline-block px-4 py-2 bg-amber-600 text-white rounded-lg text-sm">Record Pharmacy Visit</Link>
    </div>
  );
}
