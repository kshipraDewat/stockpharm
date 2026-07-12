import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from '../components/layout/MainLayout';
import PharmacyMainLayout from '../components/pharmacy-panel/layout/PharmacyMainLayout';
import ProtectedRoute from '../components/auth/ProtectedRoute';
import LoadingSpinner from '../components/common/LoadingSpinner';

import LoginPage from '../components/auth/LoginPage';
import RegisterPage from '../components/auth/RegisterPage';
import ForgotPasswordPage from '../components/auth/ForgotPasswordPage';
import ResetPasswordPage from '../components/auth/ResetPasswordPage';
import AccountProtectedRoute from '../components/auth/AccountProtectedRoute';
import HomePage from '../components/home/HomePage';
import BillVerifyPage from '../components/public/BillVerifyPage';

// Platform panel
const PlatformLoginPage = React.lazy(() => import('../components/platform/PlatformLoginPage'));
const PlatformLayout = React.lazy(() => import('../components/platform/PlatformLayout'));
const PlatformDashboardPage = React.lazy(() => import('../components/platform/PlatformDashboardPage'));
const TenantApprovalsPage = React.lazy(() => import('../components/platform/TenantApprovalsPage'));

// Consumer / shop panel
const ConsumerLoginPage = React.lazy(() => import('../components/consumer/ConsumerLoginPage'));
const ConsumerRegisterPage = React.lazy(() => import('../components/consumer/ConsumerRegisterPage'));
const ConsumerLayout = React.lazy(() => import('../components/consumer/ConsumerLayout'));
const ConsumerDashboardPage = React.lazy(() => import('../components/consumer/ConsumerDashboardPage'));
const ConsumerPharmaciesPage = React.lazy(() => import('../components/consumer/ConsumerPharmaciesPage'));
const ConsumerPharmacyShopPage = React.lazy(() => import('../components/consumer/ConsumerPharmacyShopPage'));
const ConsumerOrdersPage = React.lazy(() => import('../components/consumer/ConsumerOrdersPage'));
const ConsumerDoctorsPage = React.lazy(() => import('../components/consumer/ConsumerDoctorsPage'));

// Doctor panel
const DoctorLoginPage = React.lazy(() => import('../components/doctor/DoctorLoginPage'));
const DoctorRegisterPage = React.lazy(() => import('../components/doctor/DoctorRegisterPage'));
const DoctorLayout = React.lazy(() => import('../components/doctor/DoctorLayout'));
const DoctorDashboardPage = React.lazy(() => import('../components/doctor/DoctorDashboardPage'));
const DoctorConsultationsPage = React.lazy(() => import('../components/doctor/DoctorConsultationsPage'));

// MR panel
const MrLoginPage = React.lazy(() => import('../components/mr/MrLoginPage'));
const MrRegisterPage = React.lazy(() => import('../components/mr/MrRegisterPage'));
const MrLayout = React.lazy(() => import('../components/mr/MrLayout'));
const MrDashboardPage = React.lazy(() => import('../components/mr/MrDashboardPage'));
const MrVisitsPage = React.lazy(() => import('../components/mr/MrVisitsPage'));

// Pharmacy smart order
const SmartOrderPage = React.lazy(() => import('../components/pharmacy-panel/smart-order/SmartOrderPage'));

// Stockist lazy pages
const DashboardPage = React.lazy(() => import('../components/dashboard/DashboardPage'));
const PharmacyListPage = React.lazy(() => import('../components/pharmacy/PharmacyListPage'));
const PharmacyDetailPage = React.lazy(() => import('../components/pharmacy/PharmacyDetailPage'));
const ProductListPage = React.lazy(() => import('../components/product/ProductListPage'));
const ProductDetailPage = React.lazy(() => import('../components/product/ProductDetailPage'));
const OrderListPage = React.lazy(() => import('../components/order/OrderListPage'));
const CreateOrderPage = React.lazy(() => import('../components/order/CreateOrderPage'));
const OrderDetailPage = React.lazy(() => import('../components/order/OrderDetailPage'));
const BillListPage = React.lazy(() => import('../components/bill/BillListPage'));
const BillDetailPage = React.lazy(() => import('../components/bill/BillDetailPage'));
const PaymentListPage = React.lazy(() => import('../components/payment/PaymentListPage'));
const PaymentDetailPage = React.lazy(() => import('../components/payment/PaymentDetailPage'));
const PurchaseListPage = React.lazy(() => import('../components/purchase/PurchaseListPage'));
const PurchaseDetailPage = React.lazy(() => import('../components/purchase/PurchaseDetailPage'));
const SupplierListPage = React.lazy(() => import('../components/supplier/SupplierListPage'));
const SupplierDetailPage = React.lazy(() => import('../components/supplier/SupplierDetailPage'));
const RequiredStockPage = React.lazy(() => import('../components/requiredstock/RequiredStockPage'));
const ReturnsListPage = React.lazy(() => import('../components/return/ReturnListPage'));
const ReturnDetailPage = React.lazy(() => import('../components/return/ReturnDetailPage'));
const ReportsHub = React.lazy(() => import('../components/reports/ReportsHub'));
const SalesReport = React.lazy(() => import('../components/reports/SalesReport'));
const OutstandingReport = React.lazy(() => import('../components/reports/OutstandingReport'));
const GSTReport = React.lazy(() => import('../components/reports/GSTReport'));
const StockAgingReport = React.lazy(() => import('../components/reports/StockAgingReport'));
const ProfitReport = React.lazy(() => import('../components/reports/ProfitReport'));
const ComplianceReport = React.lazy(() => import('../components/reports/ComplianceReport'));
const PortalOrdersReport = React.lazy(() => import('../components/reports/PortalOrdersReport'));
const PurchaseAnalysisReport = React.lazy(() => import('../components/reports/PurchaseAnalysisReport'));
const AuditLogsPage = React.lazy(() => import('../components/auditlogs/AuditLogsPage'));
const SettingsPage = React.lazy(() => import('../components/settings/SettingsPage'));

// Pharmacy panel lazy pages
const PharmacyDashboardPage = React.lazy(() => import('../components/pharmacy-panel/dashboard/PharmacyDashboardPage'));
const DiscoverStockistsPage = React.lazy(() => import('../components/pharmacy-panel/discover/DiscoverStockistsPage'));
const StockistPublicProfilePage = React.lazy(() => import('../components/pharmacy-panel/discover/StockistPublicProfilePage'));
const StockistListPage = React.lazy(() => import('../components/pharmacy-panel/stockists/StockistListPage'));
const StockistDetailPage = React.lazy(() => import('../components/pharmacy-panel/stockists/StockistDetailPage'));
const PurchaseOrderListPage = React.lazy(() => import('../components/pharmacy-panel/purchase-orders/PurchaseOrderListPage'));
const CreatePurchaseOrderPage = React.lazy(() => import('../components/pharmacy-panel/purchase-orders/CreatePurchaseOrderPage'));
const PurchaseOrderDetailPage = React.lazy(() => import('../components/pharmacy-panel/purchase-orders/PurchaseOrderDetailPage'));
const GrnListPage = React.lazy(() => import('../components/pharmacy-panel/grn/GrnListPage'));
const GrnDetailPage = React.lazy(() => import('../components/pharmacy-panel/grn/GrnDetailPage'));
const PharmacyProductListPage = React.lazy(() => import('../components/pharmacy-panel/products/PharmacyProductListPage'));
const PharmacyProductDetailPage = React.lazy(() => import('../components/pharmacy-panel/products/PharmacyProductDetailPage'));
const PosPage = React.lazy(() => import('../components/pharmacy-panel/pos/PosPage'));
const SalesHistoryPage = React.lazy(() => import('../components/pharmacy-panel/sales/SalesHistoryPage'));
const SaleDetailPage = React.lazy(() => import('../components/pharmacy-panel/sales/SaleDetailPage'));
const PayableBillListPage = React.lazy(() => import('../components/pharmacy-panel/payables/PayableBillListPage'));
const PayableBillDetailPage = React.lazy(() => import('../components/pharmacy-panel/payables/PayableBillDetailPage'));
const PayablePaymentsPage = React.lazy(() => import('../components/pharmacy-panel/payables/PayablePaymentsPage'));
const PharmacySettingsPage = React.lazy(() => import('../components/pharmacy-panel/settings/PharmacySettingsPage'));
const StockistReturnListPage = React.lazy(() => import('../components/pharmacy-panel/returns/StockistReturnListPage'));
const StockistReturnDetailPage = React.lazy(() => import('../components/pharmacy-panel/returns/StockistReturnDetailPage'));
const PharmacyReportsHub = React.lazy(() => import('../components/pharmacy-panel/reports/PharmacyReportsHub'));
const PharmacySalesReport = React.lazy(() => import('../components/pharmacy-panel/reports/PharmacySalesReport'));
const PharmacyPayablesReport = React.lazy(() => import('../components/pharmacy-panel/reports/PharmacyPayablesReport'));
const PharmacyGstReport = React.lazy(() => import('../components/pharmacy-panel/reports/PharmacyGstReport'));
const PharmacyStockAgingReport = React.lazy(() => import('../components/pharmacy-panel/reports/PharmacyStockAgingReport'));
const PharmacyProfitReport = React.lazy(() => import('../components/pharmacy-panel/reports/PharmacyProfitReport'));
const PharmacyComplianceReport = React.lazy(() => import('../components/pharmacy-panel/reports/PharmacyComplianceReport'));
const PharmacyExpiryAlertsPage = React.lazy(() => import('../components/pharmacy-panel/inventory/PharmacyExpiryAlertsPage'));
const PharmacyCustomersPage = React.lazy(() => import('../components/pharmacy-panel/customers/PharmacyCustomersPage'));
const PharmacyAuditLogsPage = React.lazy(() => import('../components/auditlogs/AuditLogsPage'));

const SuspenseWrap = ({ children }: { children: React.ReactNode }) => (
  <React.Suspense fallback={<div className="flex items-center justify-center h-full min-h-[400px]"><LoadingSpinner /></div>}>
    {children}
  </React.Suspense>
);

const AppRoutes = () => {
  const admin = (element: React.ReactNode, deniedRedirect?: string) => (
    <ProtectedRoute requiredRole="admin" deniedRedirect={deniedRedirect}>{element}</ProtectedRoute>
  );
  const billerReports = (element: React.ReactNode) => (
    <ProtectedRoute allowedRoles={['admin', 'biller']}>{element}</ProtectedRoute>
  );
  const pharmPlus = (element: React.ReactNode) => (
    <ProtectedRoute allowedRoles={['admin', 'pharmacist']}>{element}</ProtectedRoute>
  );
  const cashierPlus = (element: React.ReactNode) => (
    <ProtectedRoute allowedRoles={['admin', 'pharmacist', 'cashier']}>{element}</ProtectedRoute>
  );

  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/verify-bill/:billId" element={<BillVerifyPage />} />

      {/* Public auth — stockist/pharmacy */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {/* Legacy pharmacy auth URLs → unified auth */}
      <Route path="/pharmacy/login" element={<Navigate to="/login" replace />} />
      <Route path="/pharmacy/register" element={<Navigate to="/register" replace />} />
      <Route path="/pharmacy/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/pharmacy/reset-password" element={<ResetPasswordPage />} />

      {/* Platform auth */}
      <Route path="/platform/login" element={<SuspenseWrap><PlatformLoginPage /></SuspenseWrap>} />

      {/* Consumer auth */}
      <Route path="/shop/login" element={<SuspenseWrap><ConsumerLoginPage /></SuspenseWrap>} />
      <Route path="/shop/register" element={<SuspenseWrap><ConsumerRegisterPage /></SuspenseWrap>} />

      {/* Doctor auth */}
      <Route path="/doctor/login" element={<SuspenseWrap><DoctorLoginPage /></SuspenseWrap>} />
      <Route path="/doctor/register" element={<SuspenseWrap><DoctorRegisterPage /></SuspenseWrap>} />

      {/* MR auth */}
      <Route path="/mr/login" element={<SuspenseWrap><MrLoginPage /></SuspenseWrap>} />
      <Route path="/mr/register" element={<SuspenseWrap><MrRegisterPage /></SuspenseWrap>} />

      {/* Platform panel */}
      <Route path="/platform/*" element={
        <AccountProtectedRoute accountKind="platform">
          <SuspenseWrap><PlatformLayout>
            <Routes>
              <Route path="dashboard" element={<PlatformDashboardPage />} />
              <Route path="tenants" element={<TenantApprovalsPage />} />
              <Route path="approvals" element={<TenantApprovalsPage />} />
              <Route index element={<Navigate to="/platform/dashboard" replace />} />
            </Routes>
          </PlatformLayout></SuspenseWrap>
        </AccountProtectedRoute>
      } />

      {/* Consumer / shop panel */}
      <Route path="/shop/*" element={
        <AccountProtectedRoute accountKind="consumer">
          <SuspenseWrap><ConsumerLayout>
            <Routes>
              <Route path="dashboard" element={<ConsumerDashboardPage />} />
              <Route path="pharmacies" element={<ConsumerPharmaciesPage />} />
              <Route path="pharmacies/:pharmacyId" element={<ConsumerPharmacyShopPage />} />
              <Route path="orders" element={<ConsumerOrdersPage />} />
              <Route path="doctors" element={<ConsumerDoctorsPage />} />
              <Route index element={<Navigate to="/shop/dashboard" replace />} />
            </Routes>
          </ConsumerLayout></SuspenseWrap>
        </AccountProtectedRoute>
      } />

      {/* Doctor panel */}
      <Route path="/doctor/*" element={
        <AccountProtectedRoute accountKind="doctor">
          <SuspenseWrap><DoctorLayout>
            <Routes>
              <Route path="dashboard" element={<DoctorDashboardPage />} />
              <Route path="consultations" element={<DoctorConsultationsPage />} />
              <Route index element={<Navigate to="/doctor/dashboard" replace />} />
            </Routes>
          </DoctorLayout></SuspenseWrap>
        </AccountProtectedRoute>
      } />

      {/* MR panel */}
      <Route path="/mr/*" element={
        <AccountProtectedRoute accountKind="mr">
          <SuspenseWrap><MrLayout>
            <Routes>
              <Route path="dashboard" element={<MrDashboardPage />} />
              <Route path="visits" element={<MrVisitsPage />} />
              <Route index element={<Navigate to="/mr/dashboard" replace />} />
            </Routes>
          </MrLayout></SuspenseWrap>
        </AccountProtectedRoute>
      } />

      {/* Pharmacy protected routes */}
      <Route
        path="/pharmacy/*"
        element={
          <ProtectedRoute requiredTenantType="pharmacy">
            <PharmacyMainLayout>
              <SuspenseWrap>
                <Routes>
                  <Route path="dashboard" element={cashierPlus(<PharmacyDashboardPage />)} />
                  <Route path="discover" element={pharmPlus(<DiscoverStockistsPage />)} />
                  <Route path="discover/:slug" element={pharmPlus(<StockistPublicProfilePage />)} />
                  <Route path="stockists" element={pharmPlus(<StockistListPage />)} />
                  <Route path="stockists/:connectionId" element={pharmPlus(<StockistDetailPage />)} />
                  <Route path="purchase-orders" element={pharmPlus(<PurchaseOrderListPage />)} />
                  <Route path="purchase-orders/create" element={pharmPlus(<CreatePurchaseOrderPage />)} />
                  <Route path="purchase-orders/:id" element={pharmPlus(<PurchaseOrderDetailPage />)} />
                  <Route path="smart-order" element={pharmPlus(<SmartOrderPage />)} />
                  <Route path="grn" element={pharmPlus(<GrnListPage />)} />
                  <Route path="grn/:id" element={pharmPlus(<GrnDetailPage />)} />
                  <Route path="products" element={cashierPlus(<PharmacyProductListPage />)} />
                  <Route path="products/:id" element={cashierPlus(<PharmacyProductDetailPage />)} />
                  <Route path="pos" element={cashierPlus(<PosPage />)} />
                  <Route path="sales" element={cashierPlus(<SalesHistoryPage />)} />
                  <Route path="sales/:id" element={cashierPlus(<SaleDetailPage />)} />
                  <Route path="customers" element={cashierPlus(<PharmacyCustomersPage />)} />
                  <Route path="payable-bills" element={pharmPlus(<PayableBillListPage />)} />
                  <Route path="payable-bills/:id" element={pharmPlus(<PayableBillDetailPage />)} />
                  <Route path="payments" element={pharmPlus(<PayablePaymentsPage />)} />
                  <Route path="returns" element={pharmPlus(<StockistReturnListPage />)} />
                  <Route path="returns/:id" element={pharmPlus(<StockistReturnDetailPage />)} />
                  <Route path="reports" element={pharmPlus(<PharmacyReportsHub />)} />
                  <Route path="reports/sales" element={pharmPlus(<PharmacySalesReport />)} />
                  <Route path="reports/stock-aging" element={pharmPlus(<PharmacyStockAgingReport />)} />
                  <Route path="reports/gst" element={admin(<PharmacyGstReport />)} />
                  <Route path="reports/payables-aging" element={admin(<PharmacyPayablesReport />)} />
                  <Route path="reports/payables" element={admin(<PharmacyPayablesReport />)} />
                  <Route path="reports/profit" element={admin(<PharmacyProfitReport />)} />
                  <Route path="reports/compliance" element={admin(<PharmacyComplianceReport />)} />
                  <Route path="expiry-alerts" element={pharmPlus(<PharmacyExpiryAlertsPage />)} />
                  <Route path="audit-logs" element={admin(<PharmacyAuditLogsPage />)} />
                  <Route path="settings" element={admin(<PharmacySettingsPage />)} />
                  <Route index element={<Navigate to="/pharmacy/dashboard" replace />} />
                  <Route path="*" element={<div className="flex flex-col items-center justify-center h-full text-center p-8"><h2 className="text-2xl font-bold text-slate-900 mb-2">404</h2><p className="text-slate-500">Page Not Found</p></div>} />
                </Routes>
              </SuspenseWrap>
            </PharmacyMainLayout>
          </ProtectedRoute>
        }
      />

      {/* Stockist protected routes */}
      <Route
        path="/*"
        element={
          <ProtectedRoute requiredTenantType="stockist">
            <MainLayout>
              <SuspenseWrap>
                <Routes>
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="/pharmacies" element={<PharmacyListPage />} />
                  <Route path="/pharmacies/:id" element={<PharmacyDetailPage />} />
                  <Route path="/products" element={<ProductListPage />} />
                  <Route path="/products/:id" element={<ProductDetailPage />} />
                  <Route path="/orders" element={<OrderListPage />} />
                  <Route path="/orders/create" element={admin(<CreateOrderPage />)} />
                  <Route path="/orders/:id" element={<OrderDetailPage />} />
                  <Route path="/bills" element={<BillListPage />} />
                  <Route path="/bills/:id" element={<BillDetailPage />} />
                  <Route path="/payments" element={<PaymentListPage />} />
                  <Route path="/payments/:id" element={<PaymentDetailPage />} />
                  <Route path="/purchase-bills" element={<PurchaseListPage />} />
                  <Route path="/purchase-bills/:id" element={<PurchaseDetailPage />} />
                  <Route path="/suppliers" element={<SupplierListPage />} />
                  <Route path="/suppliers/:id" element={<SupplierDetailPage />} />
                  <Route path="/required-stock" element={<RequiredStockPage />} />
                  <Route path="/returns" element={<ReturnsListPage />} />
                  <Route path="/returns/:id" element={<ReturnDetailPage />} />
                  <Route path="/reports" element={billerReports(<ReportsHub />)} />
                  <Route path="/reports/sales" element={billerReports(<SalesReport />)} />
                  <Route path="/reports/outstanding" element={admin(<OutstandingReport />, '/reports')} />
                  <Route path="/reports/gst" element={admin(<GSTReport />, '/reports')} />
                  <Route path="/reports/stock-aging" element={billerReports(<StockAgingReport />)} />
                  <Route path="/reports/profit" element={admin(<ProfitReport />, '/reports')} />
                  <Route path="/reports/compliance" element={admin(<ComplianceReport />, '/reports')} />
                  <Route path="/reports/portal-orders" element={admin(<PortalOrdersReport />, '/reports')} />
                  <Route path="/reports/purchase-analysis" element={admin(<PurchaseAnalysisReport />, '/reports')} />
                  <Route path="/audit-logs" element={admin(<AuditLogsPage />)} />
                  <Route path="/settings" element={admin(<SettingsPage />)} />
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  <Route path="*" element={<div className="flex flex-col items-center justify-center h-full text-center p-8"><h2 className="text-2xl font-bold text-slate-900 mb-2">404</h2><p className="text-slate-500">Page Not Found</p></div>} />
                </Routes>
              </SuspenseWrap>
            </MainLayout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
};

export default AppRoutes;
