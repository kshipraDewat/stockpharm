import React from 'react';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface BreadcrumbItem {
  label: string;
  link?: string;
}

interface PageHeaderProps {
  title?: string; // kept for API compat but not rendered
  breadcrumbs: BreadcrumbItem[];
  actions?: React.ReactNode;
  showBack?: boolean;
}

const PageHeader: React.FC<PageHeaderProps> = ({ breadcrumbs, actions, showBack = true }) => {
  const navigate = useNavigate();

  return (
    <div className="page-header flex flex-wrap items-start justify-between gap-4 mb-6">
      <div className="flex items-start gap-2 min-w-0 flex-1">
        {showBack && (
          <button
            onClick={() => navigate(-1)}
            className="icon-btn shrink-0 -ml-1 mt-0.5"
            aria-label="Go back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}
        <nav aria-label="Breadcrumb" className="min-w-0 pt-0.5">
          {breadcrumbs.length === 1 ? (
            <h1 className="text-page-title">{breadcrumbs[0].label}</h1>
          ) : (
            <ol className="flex flex-wrap items-center gap-x-1 gap-y-1">
              {breadcrumbs.map((crumb, i) => {
                const isLast = i === breadcrumbs.length - 1;
                return (
                  <React.Fragment key={i}>
                    {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />}
                    <li className="min-w-0">
                      {isLast ? (
                        <h1 className="text-page-title truncate">{crumb.label}</h1>
                      ) : crumb.link ? (
                        <button
                          onClick={() => navigate(crumb.link!)}
                          className="text-caption hover:text-slate-700 transition-colors"
                        >
                          {crumb.label}
                        </button>
                      ) : (
                        <span className="text-caption">{crumb.label}</span>
                      )}
                    </li>
                  </React.Fragment>
                );
              })}
            </ol>
          )}
        </nav>
      </div>
      {actions && (
        <div className="flex items-center gap-2 min-w-0 flex-wrap justify-end shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
};

export default PageHeader;
