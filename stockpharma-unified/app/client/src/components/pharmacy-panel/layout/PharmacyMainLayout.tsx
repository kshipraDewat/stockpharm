import React from 'react';
import PharmacySidebar from './PharmacySidebar';
import PharmacyHeader from './PharmacyHeader';
import PharmacyBottomNav from './PharmacyBottomNav';
import ErrorBoundary from '../../common/ErrorBoundary';
import { useEvents } from '../../../hooks/useEvents';

const PharmacyMainLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  useEvents(50, { poll: true });
  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <PharmacySidebar />
      <div className="lg:pl-60 flex flex-col min-h-screen">
        <PharmacyHeader />
        <main className="flex-1 p-4 md:p-6 pb-24 lg:pb-6 overflow-y-auto">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
        <PharmacyBottomNav />
      </div>
    </div>
  );
};

export default PharmacyMainLayout;
