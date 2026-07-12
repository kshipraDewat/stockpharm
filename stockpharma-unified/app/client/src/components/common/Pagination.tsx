import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  // legacy compat
  currentPage?: number;
  totalPages?: number;
  totalItems?: number;
  itemsPerPage?: number;
}

const Pagination: React.FC<PaginationProps> = ({
  page: _page,
  total: _total,
  pageSize: _pageSize,
  onPageChange,
  currentPage,
  totalPages: _totalPagesLegacy,
  totalItems,
  itemsPerPage,
}) => {
  const page = _page ?? currentPage ?? 1;
  const total = _total ?? totalItems ?? 0;
  const pageSize = _pageSize ?? itemsPerPage ?? 20;
  const totalPages = _totalPagesLegacy ?? Math.max(1, Math.ceil(total / pageSize));

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  if (totalPages <= 1 && total <= pageSize) return null;

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-caption">
      <span>
        {total > 0 ? `${from}–${to} of ${total}` : '0 results'}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          className="icon-btn disabled:opacity-40 disabled:pointer-events-none"
          aria-label="Previous page"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="px-2 text-body font-medium text-slate-700">
          {page} / {totalPages}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="icon-btn disabled:opacity-40 disabled:pointer-events-none"
          aria-label="Next page"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default Pagination;
