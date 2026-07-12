import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md';
}

const Card: React.FC<CardProps> = ({ children, className = '', padding = 'none' }) => {
  const pad = { none: '', sm: 'p-4', md: 'p-5' }[padding];
  return (
    <div className={`bg-white rounded-xl border border-slate-100 shadow-sm ${pad} ${className}`}>
      {children}
    </div>
  );
};

interface CardHeaderProps {
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
}

export const CardHeader: React.FC<CardHeaderProps> = ({ children, className = '', actions }) => (
  <div
    className={`flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100 ${className}`}
  >
    <div className="min-w-0">{children}</div>
    {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
  </div>
);

export const CardTitle: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => <h3 className={`text-section-title ${className}`}>{children}</h3>;

export const CardDescription: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => <p className={`text-caption mt-0.5 ${className}`}>{children}</p>;

export const CardBody: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => <div className={`p-5 ${className}`}>{children}</div>;

export default Card;
