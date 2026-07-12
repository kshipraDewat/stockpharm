import React from 'react';
import { Server } from 'lucide-react';
import SlideOver from '../common/SlideOver';
import { formatDate } from '../../lib/formatters';

interface AuditDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  log?: any;
}

const AuditDetailModal: React.FC<AuditDetailModalProps> = ({ isOpen, onClose, log }) => {
  if (!log) return null;

  return (
    <SlideOver
      isOpen={isOpen}
      onClose={onClose}
      title={`Audit Detail [${log.id}]`}
      width="lg"
    >
      <div className="space-y-6 -mx-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm bg-white p-4 rounded-lg border border-slate-200">
          <div>
            <p className="text-slate-500 font-medium">User</p>
            <p className="font-semibold text-slate-900">{log.userName ?? log.user ?? '—'}</p>
          </div>
          <div>
            <p className="text-slate-500 font-medium">Timestamp</p>
            <p className="font-semibold text-slate-900">{formatDate(log.createdAt ?? log.timestamp)}</p>
          </div>
          <div>
            <p className="text-slate-500 font-medium">Action</p>
            <span className="font-semibold text-slate-900 bg-slate-100 rounded px-2 py-0.5 text-xs uppercase">{log.action}</span>
          </div>
          <div>
            <p className="text-slate-500 font-medium">Resource</p>
            <p className="font-semibold text-blue-600">{log.entityType ?? '—'} / {log.entityId ?? '—'}</p>
          </div>
        </div>

        {log.details && (
          <div className="bg-white rounded-lg border border-slate-200">
            <div className="bg-slate-100 px-4 py-2 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-widest">
              Details
            </div>
            <p className="p-4 text-sm text-slate-700">{log.details}</p>
          </div>
        )}

        {log.payload && (
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <div className="bg-slate-100 px-4 py-2 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <Server className="w-4 h-4" /> Mutation Payload (JSON)
            </div>
            <pre className="p-4 text-xs text-slate-800 font-mono overflow-x-auto whitespace-pre-wrap break-all leading-normal">
              {typeof log.payload === 'string' ? log.payload : JSON.stringify(log.payload, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </SlideOver>
  );
};

export default AuditDetailModal;
