import { useLocation } from 'react-router-dom';

export function useReportsHubLink() {
  const location = useLocation();
  return location.pathname.startsWith('/pharmacy') ? '/pharmacy/reports' : '/reports';
}
