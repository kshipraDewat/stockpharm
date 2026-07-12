import React from 'react';
import Sidebar from '../common/Sidebar';
import Header from '../common/Header';
import BottomNav from '../common/BottomNav';
import ErrorBoundary from '../common/ErrorBoundary';
import { useEvents } from '../../hooks/useEvents';

const MainLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  useEvents(50, { poll: true });
  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <Sidebar />
      <div className="lg:pl-60 flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 p-4 md:p-6 pb-24 lg:pb-6 overflow-y-auto">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
        <BottomNav />
      </div>
    </div>
  );
};

export default MainLayout;
