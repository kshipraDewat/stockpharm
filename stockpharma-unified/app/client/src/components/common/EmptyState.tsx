import React from 'react';
import Button from './Button';

interface EmptyStateProps {
  icon?: React.ElementType;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
}

const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  compact = false,
}) => (
  <div className={`flex flex-col items-center justify-center text-center ${compact ? 'py-10 px-4' : 'py-16 px-6'}`}>
    {Icon && (
      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-4">
        <Icon className="w-5 h-5" strokeWidth={1.75} />
      </div>
    )}
    <p className="text-section-title text-slate-700">{title}</p>
    {description && <p className="text-caption mt-1.5 max-w-sm">{description}</p>}
    {actionLabel && onAction && (
      <Button variant="primary" size="sm" className="mt-5" onClick={onAction}>
        {actionLabel}
      </Button>
    )}
  </div>
);

export default EmptyState;
