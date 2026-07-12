import React from 'react';
import ProductListPage from '../../product/ProductListPage';

const PharmacyProductListPage = () => (
  <div className="space-y-3">
    <div className="max-w-7xl mx-auto bg-teal-50 border border-teal-100 rounded-lg px-4 py-2.5 text-xs text-teal-800">
      Pharmacy catalog is used for POS billing, GRN receiving, and expiry tracking.
    </div>
    <ProductListPage />
  </div>
);

export default PharmacyProductListPage;
