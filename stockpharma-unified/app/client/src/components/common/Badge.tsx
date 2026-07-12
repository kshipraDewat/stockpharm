import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'purple';
  size?: 'sm' | 'md';
  dot?: boolean;
  className?: string;
}

const variants = {
  success: 'bg-emerald-50 text-success ring-1 ring-emerald-200',
  warning: 'bg-amber-50 text-warning ring-1 ring-amber-200',
  danger:  'bg-red-50 text-danger ring-1 ring-red-200',
  info:    'bg-brand-50 text-brand-700 ring-1 ring-brand-100',
  neutral: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
  purple:  'bg-purple-50 text-purple-700 ring-1 ring-purple-200',
};

const dotColors = {
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger:  'bg-red-500',
  info:    'bg-blue-500',
  neutral: 'bg-slate-400',
  purple:  'bg-purple-500',
};

const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'neutral',
  size = 'md',
  dot = false,
  className = '',
}) => {
  return (
    <span
      className={`
        inline-flex items-center gap-1.5 font-medium rounded-full
        ${size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-0.5 text-caption'}
        ${variants[variant]}
        ${className}
      `}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant]}`} />}
      {children}
    </span>
  );
};

export default Badge;

export function sourceBadge(source?: string): React.ReactElement {
  if (source === 'pharmacy_submitted') return <Badge variant="info">Portal</Badge>;
  return <Badge variant="neutral">Manual</Badge>;
}

export function statusBadge(status: string): React.ReactElement {
  const map: Record<string, { variant: BadgeProps['variant']; label: string }> = {
    active:    { variant: 'success', label: 'Active' },
    inactive:  { variant: 'neutral', label: 'Inactive' },
    blocked:   { variant: 'danger',  label: 'Blocked' },
    pending:   { variant: 'warning', label: 'Pending' },
    packed:    { variant: 'info',    label: 'Packed' },
    shipped:   { variant: 'info',    label: 'Shipped' },
    delivered: { variant: 'success', label: 'Delivered' },
    cancelled: { variant: 'danger',  label: 'Cancelled' },
    paid:      { variant: 'success', label: 'Paid' },
    partial:   { variant: 'warning', label: 'Partial' },
    unpaid:    { variant: 'neutral', label: 'Unpaid' },
    overdue:   { variant: 'danger',  label: 'Overdue' },
    voided:    { variant: 'danger',  label: 'Voided' },
    requested: { variant: 'warning', label: 'Requested' },
    processed: { variant: 'success', label: 'Processed' },
    received:  { variant: 'success', label: 'Received' },
    approved:  { variant: 'success', label: 'Approved' },
    draft:     { variant: 'neutral', label: 'Draft' },
    submitted: { variant: 'info',    label: 'Submitted' },
    accepted:  { variant: 'info',    label: 'Accepted' },
    partially_received: { variant: 'warning', label: 'Partially Received' },
    cancel_requested: { variant: 'warning', label: 'Cancel Pending' },
    rejected:  { variant: 'danger',  label: 'Rejected' },
    withdrawn: { variant: 'neutral', label: 'Withdrawn' },
    disconnected: { variant: 'neutral', label: 'Disconnected' },
    in_stock: { variant: 'success', label: 'In Stock' },
    low: { variant: 'warning', label: 'Low Stock' },
    out_of_stock: { variant: 'danger', label: 'Out of Stock' },
    pending_stockist_approval: { variant: 'warning', label: 'Pending Approval' },
    completed: { variant: 'success', label: 'Completed' },
    card:      { variant: 'info',    label: 'Card' },
    bank:      { variant: 'info',    label: 'Bank' },
    pharmacist: { variant: 'purple', label: 'Pharmacist' },
    cashier:   { variant: 'info',    label: 'Cashier' },
    admin:     { variant: 'purple',  label: 'Admin' },
    biller:    { variant: 'info',    label: 'Biller' },
    cash:      { variant: 'success', label: 'Cash' },
    upi:       { variant: 'purple',  label: 'UPI' },
    cheque:    { variant: 'warning', label: 'Cheque' },
    'bank transfer': { variant: 'info', label: 'Bank Transfer' },
  };
  const entry = map[status?.toLowerCase()] ?? { variant: 'neutral' as const, label: status ?? '—' };
  return <Badge variant={entry.variant}>{entry.label}</Badge>;
}

export function orderStatusBadge(order: { status?: string; approvedAt?: string | null }): React.ReactElement {
  if (order.approvedAt && order.status?.toLowerCase() === 'pending') {
    return statusBadge('approved');
  }
  return statusBadge(order.status ?? '');
}
