import { useLocation } from 'react-router-dom';

export type PanelPrefix = '' | '/pharmacy';

export function panelPrefixFromPath(pathname: string): PanelPrefix {
  return pathname.startsWith('/pharmacy') ? '/pharmacy' : '';
}

/** Base path prefix for the active panel (`''` stockist, `'/pharmacy'` pharmacy). */
export function usePanelBasePath(): PanelPrefix {
  const { pathname } = useLocation();
  return panelPrefixFromPath(pathname);
}

export function panelPath(prefix: PanelPrefix, segment: string): string {
  return `${prefix}${segment}`;
}

/** Stockist uses `/purchase-bills`; pharmacy panel uses `/pharmacy/purchases`. */
export function purchaseListPath(prefix: PanelPrefix): string {
  return prefix ? `${prefix}/purchases` : '/purchase-bills';
}

export function purchaseDetailPath(prefix: PanelPrefix, id: string): string {
  return `${purchaseListPath(prefix)}/${id}`;
}
