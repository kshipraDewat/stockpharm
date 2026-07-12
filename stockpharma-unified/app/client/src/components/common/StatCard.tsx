import React from 'react';
import Skeleton from './Skeleton';

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  color?: 'blue' | 'green' | 'red' | 'amber' | 'purple' | 'teal' | 'slate';
  sub?: string;
  isLoading?: boolean;
  onClick?: () => void;
}

const colorMap = {
  blue:   { bg: 'bg-blue-50',   icon: 'text-blue-600' },
  green:  { bg: 'bg-emerald-50',icon: 'text-emerald-600' },
  red:    { bg: 'bg-red-50',    icon: 'text-red-600' },
  amber:  { bg: 'bg-amber-50',  icon: 'text-amber-600' },
  purple: { bg: 'bg-purple-50', icon: 'text-purple-600' },
  teal:   { bg: 'bg-teal-50',   icon: 'text-teal-600' },
  slate:  { bg: 'bg-slate-100', icon: 'text-slate-600' },
};

const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  icon,
  color = 'blue',
  sub,
  isLoading = false,
  onClick,
}) => {
  const c = colorMap[color] ?? colorMap.blue;
  return (
    <div
      className={`bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex items-center gap-4 ${onClick ? 'cursor-pointer hover:border-slate-200 transition-colors' : ''}`}
      onClick={onClick}
    >
      {icon && (
        <div className={`nav-icon-wrap w-11 h-11 rounded-xl ${c.bg} ${c.icon} [&_svg]:w-5 [&_svg]:h-5`}>
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-overline truncate">{label}</p>
        {isLoading ? (
          <Skeleton className="h-7 w-24 mt-1.5" />
        ) : (
          <p className="text-xl font-semibold text-slate-900 tracking-tight mt-1">{value}</p>
        )}
        {sub && <p className="text-caption mt-1 truncate">{sub}</p>}
      </div>
    </div>
  );
};

export default StatCard;
