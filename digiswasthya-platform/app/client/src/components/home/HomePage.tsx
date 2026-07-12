import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Store, Shield, User, Stethoscope, Briefcase, KeyRound } from 'lucide-react';
import { PANEL_LABELS } from '../../lib/panel';
import { api } from '../../api/client';

const panels = [
  { id: 'stockist', path: '/login', icon: Building2, color: 'bg-blue-600', role: 'stockist' },
  { id: 'pharmacy', path: '/login?panel=pharmacy', icon: Store, color: 'bg-teal-600', role: 'pharmacy' },
  { id: 'consumer', path: '/shop/login', icon: User, color: 'bg-violet-600', role: 'consumer' },
  { id: 'doctor', path: '/doctor/login', icon: Stethoscope, color: 'bg-emerald-600', role: 'doctor' },
  { id: 'mr', path: '/mr/login', icon: Briefcase, color: 'bg-amber-600', role: 'mr' },
  { id: 'platform', path: '/platform/login', icon: Shield, color: 'bg-slate-800', role: 'platform' },
] as const;

type DemoCred = { role: string; email: string; password: string; loginPath: string };

export default function HomePage() {
  const [demoCreds, setDemoCreds] = useState<DemoCred[]>([]);

  useEffect(() => {
    api.get('/public/demo-credentials')
      .then((r) => setDemoCreds(r.data.panels ?? []))
      .catch(() => {});
  }, []);

  const credFor = (role: string) => demoCreds.find((c) => c.role === role);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-teal-50 flex flex-col items-center justify-center p-6">
      <div className="text-center mb-10 max-w-2xl">
        <h1 className="text-4xl font-bold text-slate-900 tracking-tight">Digital Swasthya</h1>
        <p className="text-slate-600 mt-3 text-lg">
          Unified platform — all 8 sibling apps merged into <strong>one localhost</strong>.
          Stockist, Pharmacy, Customer, Doctor, MR, and Platform Admin on a single server.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full max-w-5xl">
        {panels.map(({ id, path, icon: Icon, color, role }) => {
          const cred = credFor(role);
          return (
            <Link
              key={id}
              to={path}
              className="group flex flex-col gap-3 p-5 bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300 transition-all"
            >
              <div className="flex items-start gap-4">
                <div className={`${color} text-white p-3 rounded-xl shrink-0`}>
                  <Icon size={24} />
                </div>
                <div>
                  <h2 className="font-semibold text-slate-900 group-hover:text-blue-700">{PANEL_LABELS[id]}</h2>
                  <p className="text-sm text-slate-500 mt-1">Merged from {role === 'stockist' || role === 'pharmacy' ? 'ERP · HUB · MED · SP' : role === 'consumer' ? 'HUB · DSW · ERP patient' : role === 'doctor' ? 'HUB · DSW' : role === 'mr' ? 'MR · ERP' : 'HUB · ERP admin'}</p>
                </div>
              </div>
              {cred && (
                <div className="text-xs bg-slate-50 rounded-lg p-2.5 border border-slate-100 font-mono text-slate-600">
                  <span className="flex items-center gap-1 text-slate-500 mb-1"><KeyRound size={12} /> Demo login</span>
                  {cred.email} / {cred.password}
                </div>
              )}
            </Link>
          );
        })}
      </div>

      <p className="mt-10 text-sm text-slate-400 text-center max-w-lg">
        New business? <Link to="/register" className="text-blue-600 hover:underline">Register as Stockist or Pharmacy</Link>
        {' · '}
        <Link to="/verify-bill/demo" className="text-blue-600 hover:underline">Verify a bill</Link>
        {' · '}
        Full spec: <code className="text-slate-500">docs/UNIFIED_FEATURES.md</code>
      </p>
    </div>
  );
}
