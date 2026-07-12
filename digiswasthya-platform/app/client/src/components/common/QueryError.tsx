import React from 'react';
import Button from './Button';

type QueryErrorProps = {
  message?: string;
  onRetry?: () => void;
};

/** Shared fetch-error state for list/detail pages (MAJ-U01). */
const QueryError = ({ message = 'Failed to load data.', onRetry }: QueryErrorProps) => (
  <div className="p-6 text-center space-y-3 bg-white rounded-xl border border-slate-100">
    <p className="text-sm text-slate-600">{message}</p>
    {onRetry && (
      <Button variant="secondary" size="sm" onClick={() => onRetry()}>
        Retry
      </Button>
    )}
  </div>
);

export default QueryError;
