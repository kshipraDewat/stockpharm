import React from 'react';

interface SkeletonProps {
  className?: string;
  rounded?: boolean;
}

const Skeleton: React.FC<SkeletonProps> = ({ className = '', rounded = false }) => (
  <div
    className={`animate-pulse bg-slate-200 ${rounded ? 'rounded-full' : 'rounded'} ${className}`}
  />
);

export const SkeletonCard: React.FC<{ lines?: number }> = ({ lines = 3 }) => (
  <div className="bg-white rounded-xl border border-slate-100 p-5 space-y-3">
    <Skeleton className="h-4 w-24" />
    <Skeleton className="h-7 w-32" />
    {lines > 2 && <Skeleton className="h-3 w-40" />}
  </div>
);

export const SkeletonRow: React.FC<{ cols?: number }> = ({ cols = 4 }) => (
  <tr className="border-b border-slate-50">
    {Array.from({ length: cols }).map((_, i) => (
      <td key={i} className="px-4 py-3">
        <Skeleton className="h-4" />
      </td>
    ))}
  </tr>
);

export default Skeleton;
