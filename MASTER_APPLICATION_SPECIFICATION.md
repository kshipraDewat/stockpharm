# MASTER APPLICATION SPECIFICATION (Admin / Stockist / Pharmacy)
> This document is a merged specification focusing ONLY on Admin, Stockist, and Pharmacy roles.
> It includes the base features and all deep-trace expansions from the 8 repository reviews.
---


# Source: STOCKIST-PHARMACY

## 5. Money Logic

- **GST (`lib/gst.ts` + client `gstClient`):** `isInterstate = sellerState !== buyerState`. Per line `tax=round2(sub*rate/100)`. Intra: `cgst=round2(tax/2)`, `sgst=round2(tax−cgst)` (symmetric, no paisa drift). Inter: all to igst. Rates 0/5/12/18/28. Order/bill lines GST-**exclusive**; retail POS GST-**inclusive**.
- **FEFO (`lib/inventory.ts`):** `reserveStock` selects non-expired batches (`qtyOnHand>0`, `expiryDate>asOfDate`) ordered by expiry asc then receivedAt asc, atomic conditional decrement per batch, **recurses** on concurrent consumption, throws `InsufficientStockError` (→409). `receiveStock` upserts batch on (tenant,product,batch,expiry). `releaseStock` restocks (fails loudly if batch missing). `getProductStock` sums non-expired only. Every mutation writes `stock_movements` (C24).
- **Double-entry ledger (`lib/ledger.ts`):** `postEntry` throws on imbalance (>0.01) and threads the caller's tx. 16 seeded accounts incl. **GRN_CLEARING** suspense bucket reconciling GRN (Inventory Dr / GRN_CLEARING Cr) vs later payable bill (GRN_CLEARING+GST-input Dr / Creditors Cr).
- **Credit exposure (`getPharmacyExposure`):** unpaid bill balances + approved-unbilled in-flight orders; enforced at create/finalize/approve; connection creditLimit precedence; `pharmacies.outstanding` denormalized + reconcilable.
- **Numbering (`lib/ids.ts`):** `ORD-YYYY-####`, `INV-YYYY-####`, `PAY-#####`, `RET-####`, `GRN-YYYY-####`, `SPAY-#####`, `PO-YYYY-####`, `PGRN-YYYY-####`, `SALE-YYYY-####`, `PPAY-#####`, `SRET-####`. Order/PO use count/max-scan with collision retry.
- **Dates:** business dates as `YYYY-MM-DD` text; `todayIST()` (Asia/Kolkata) governs same-day void; `validateExpiryDate` accepts YYYY-MM-DD / YYYY-MM / MM/YY → last day of month.

---

## 10. SMART ORDER (pharmacy) — `/pharmacy/smart-order`, `/api/smart-order`, `smart_order_sessions`

- **Access:** pharmacy panel, `pharmPlus` route wrapper (admin+pharmacist); server `requireTenantType('pharmacy')`. Sidebar entry "Smart Order" (Sparkles icon) in the Procurement group.
- **Page (`SmartOrderPage.tsx`):** textarea ("Dolo 650 x 10…"), **Analyse** → `POST /smart-order/parse {rawText}`; shows parsed items with catalogue-match counts. **Get Recommendations** → `POST /smart-order/recommend {sessionId}`; renders up to 3 strategy cards, each with label/description, "Covers X/Y items · N stockist(s) · ₹total", green "Saves ₹… vs best single" when applicable, and a **Create PO** button.
- **`parseSmartOrder`:** loads ALL active connections + their `stockist_catalog_items` for the pharmacy. Line parsing: if `GEMINI_API_KEY` set and ≥1 connection, delegates to `parseOrderText` (Gemini) against the **first** connection's stockist catalogue; else (or on any AI error) `parseLinesLocally` — regex `^(.*?)[sep](x?)(\d+)(unit)?$` per line, qty default 1. Each parsed name is fuzzy-matched (exact → contains-either-way → token>2 overlap) against the merged catalogue, dropping `out_of_stock` items; matches carry connectionId/stockistName/catalogItemId/stockistProductId/saleRate/mrp/availability. Persists a `smart_order_sessions` row (`rawText`, `parsedJson`) and returns `{sessionId, items}`.
- **`recommendSmartOrder`:** rebuilds from the stored session. Three strategies: **best_single** (stockist covering most items, tie-break lowest cost), **cheapest_split** (per-item minimum saleRate across stockists; computes `savingsVsSingle`), **fastest_delivery** (per-item rank in_stock<low<out, tie-break price — "same as best single for now (no delivery calendar)"). Stores `recommendationsJson` on the session, returns `{sessionId, recommendations}` (each with items[], totalCost, stockistCount, itemsCovered, totalItems).
- **Create PO handoff:** if the recommendation uses exactly one connection, the page writes `sessionStorage['smart-order-draft'] = {connectionId, lines:[{catalogItemId, productName, qty, unitPrice}]}` and navigates to `/pharmacy/purchase-orders/create?fromSmartOrder=1`. **As currently wired, `CreatePurchaseOrderPage` does not read `fromSmartOrder` or the `smart-order-draft` key** — the create page opens blank; the handoff is a stub. Multi-stockist recommendations show an info toast ("create separate POs per stockist") instead.

---

## EXPANSION — Code-Derived Additions (Audit Pass)

*Audit date: 2026-07-04. Content derived exclusively from source under `STOCKIST-PHARMACY/`. Documents implemented behavior only.*

### E.1 Complete Route Table

**Frontend routes extracted:** 92 | **Server API routes:** 165

| # | Path | Component | Role/Gate | Source |
|---|------|-----------|-----------|--------|
| 1 | `/` | HomePage | — | `client/src/routes/index.tsx` |
| 2 | `/verify-bill/:billId` | BillVerifyPage | — | `client/src/routes/index.tsx` |
| 3 | `/login` | LoginPage | — | `client/src/routes/index.tsx` |
| 4 | `/register` | RegisterPage | — | `client/src/routes/index.tsx` |
| 5 | `/forgot-password` | ForgotPasswordPage | — | `client/src/routes/index.tsx` |
| 6 | `/reset-password` | ResetPasswordPage | — | `client/src/routes/index.tsx` |
| 7 | `/pharmacy/forgot-password` | ForgotPasswordPage | — | `client/src/routes/index.tsx` |
| 8 | `/pharmacy/reset-password` | ResetPasswordPage | — | `client/src/routes/index.tsx` |
| 9 | `/platform/login` | PlatformLoginPage | — | `client/src/routes/index.tsx` |
| 10 | `/shop/login` | ConsumerLoginPage | — | `client/src/routes/index.tsx` |
| 11 | `/shop/register` | ConsumerRegisterPage | — | `client/src/routes/index.tsx` |
| 12 | `/doctor/login` | DoctorLoginPage | — | `client/src/routes/index.tsx` |
| 13 | `/doctor/register` | DoctorRegisterPage | — | `client/src/routes/index.tsx` |
| 14 | `/mr/login` | MrLoginPage | — | `client/src/routes/index.tsx` |
| 15 | `/mr/register` | MrRegisterPage | — | `client/src/routes/index.tsx` |
| 16 | `/platform/dashboard` | PlatformDashboardPage | — | `client/src/routes/index.tsx` |
| 17 | `/platform/tenants` | TenantApprovalsPage | — | `client/src/routes/index.tsx` |
| 18 | `/platform/approvals` | TenantApprovalsPage | — | `client/src/routes/index.tsx` |
| 19 | `/shop/dashboard` | ConsumerDashboardPage | — | `client/src/routes/index.tsx` |
| 20 | `/shop/pharmacies` | ConsumerPharmaciesPage | — | `client/src/routes/index.tsx` |
| 21 | `/shop/pharmacies/:pharmacyId` | ConsumerPharmacyShopPage | — | `client/src/routes/index.tsx` |
| 22 | `/shop/orders` | ConsumerOrdersPage | — | `client/src/routes/index.tsx` |
| 23 | `/shop/doctors` | ConsumerDoctorsPage | — | `client/src/routes/index.tsx` |
| 24 | `/doctor/dashboard` | DoctorDashboardPage | — | `client/src/routes/index.tsx` |
| 25 | `/doctor/consultations` | DoctorConsultationsPage | — | `client/src/routes/index.tsx` |
| 26 | `/mr/dashboard` | MrDashboardPage | — | `client/src/routes/index.tsx` |
| 27 | `/mr/visits` | MrVisitsPage | — | `client/src/routes/index.tsx` |
| 28 | `/pharmacy/dashboard` | PharmacyDashboardPage | cashierPlus | `client/src/routes/index.tsx` |
| 29 | `/pharmacy/discover` | DiscoverStockistsPage | pharmPlus | `client/src/routes/index.tsx` |
| 30 | `/pharmacy/discover/:slug` | StockistPublicProfilePage | pharmPlus | `client/src/routes/index.tsx` |
| 31 | `/pharmacy/stockists` | StockistListPage | pharmPlus | `client/src/routes/index.tsx` |
| 32 | `/pharmacy/stockists/:connectionId` | StockistDetailPage | pharmPlus | `client/src/routes/index.tsx` |
| 33 | `/pharmacy/purchase-orders` | PurchaseOrderListPage | pharmPlus | `client/src/routes/index.tsx` |
| 34 | `/pharmacy/purchase-orders/create` | CreatePurchaseOrderPage | pharmPlus | `client/src/routes/index.tsx` |
| 35 | `/pharmacy/purchase-orders/:id` | PurchaseOrderDetailPage | pharmPlus | `client/src/routes/index.tsx` |
| 36 | `/pharmacy/smart-order` | SmartOrderPage | pharmPlus | `client/src/routes/index.tsx` |
| 37 | `/pharmacy/grn` | GrnListPage | pharmPlus | `client/src/routes/index.tsx` |
| 38 | `/pharmacy/grn/:id` | GrnDetailPage | pharmPlus | `client/src/routes/index.tsx` |
| 39 | `/pharmacy/products` | PharmacyProductListPage | cashierPlus | `client/src/routes/index.tsx` |
| 40 | `/pharmacy/products/:id` | PharmacyProductDetailPage | cashierPlus | `client/src/routes/index.tsx` |
| 41 | `/pharmacy/pos` | PosPage | cashierPlus | `client/src/routes/index.tsx` |
| 42 | `/pharmacy/sales` | SalesHistoryPage | cashierPlus | `client/src/routes/index.tsx` |
| 43 | `/pharmacy/sales/:id` | SaleDetailPage | cashierPlus | `client/src/routes/index.tsx` |
| 44 | `/pharmacy/customers` | PharmacyCustomersPage | cashierPlus | `client/src/routes/index.tsx` |
| 45 | `/pharmacy/payable-bills` | PayableBillListPage | pharmPlus | `client/src/routes/index.tsx` |
| 46 | `/pharmacy/payable-bills/:id` | PayableBillDetailPage | pharmPlus | `client/src/routes/index.tsx` |
| 47 | `/pharmacy/payments` | PayablePaymentsPage | pharmPlus | `client/src/routes/index.tsx` |
| 48 | `/pharmacy/returns` | StockistReturnListPage | pharmPlus | `client/src/routes/index.tsx` |
| 49 | `/pharmacy/returns/:id` | StockistReturnDetailPage | pharmPlus | `client/src/routes/index.tsx` |
| 50 | `/pharmacy/reports` | PharmacyReportsHub | pharmPlus | `client/src/routes/index.tsx` |
| 51 | `/pharmacy/reports/sales` | PharmacySalesReport | pharmPlus | `client/src/routes/index.tsx` |
| 52 | `/pharmacy/reports/stock-aging` | PharmacyStockAgingReport | pharmPlus | `client/src/routes/index.tsx` |
| 53 | `/pharmacy/reports/gst` | PharmacyGstReport | admin | `client/src/routes/index.tsx` |
| 54 | `/pharmacy/reports/payables-aging` | PharmacyPayablesReport | admin | `client/src/routes/index.tsx` |
| 55 | `/pharmacy/reports/payables` | PharmacyPayablesReport | admin | `client/src/routes/index.tsx` |
| 56 | `/pharmacy/reports/profit` | PharmacyProfitReport | admin | `client/src/routes/index.tsx` |
| 57 | `/pharmacy/reports/compliance` | PharmacyComplianceReport | admin | `client/src/routes/index.tsx` |
| 58 | `/pharmacy/expiry-alerts` | PharmacyExpiryAlertsPage | pharmPlus | `client/src/routes/index.tsx` |
| 59 | `/pharmacy/audit-logs` | PharmacyAuditLogsPage | admin | `client/src/routes/index.tsx` |
| 60 | `/pharmacy/settings` | PharmacySettingsPage | admin | `client/src/routes/index.tsx` |
| 61 | `/pharmacy/*` | p | — | `client/src/routes/index.tsx` |
| 62 | `/dashboard` | DashboardPage | — | `client/src/routes/index.tsx` |
| 63 | `/pharmacies` | PharmacyListPage | — | `client/src/routes/index.tsx` |
| 64 | `/pharmacies/:id` | PharmacyDetailPage | — | `client/src/routes/index.tsx` |
| 65 | `/products` | ProductListPage | — | `client/src/routes/index.tsx` |
| 66 | `/products/:id` | ProductDetailPage | — | `client/src/routes/index.tsx` |
| 67 | `/orders` | OrderListPage | — | `client/src/routes/index.tsx` |
| 68 | `/orders/create` | CreateOrderPage | admin | `client/src/routes/index.tsx` |
| 69 | `/orders/:id` | OrderDetailPage | — | `client/src/routes/index.tsx` |
| 70 | `/bills` | BillListPage | — | `client/src/routes/index.tsx` |
| 71 | `/bills/:id` | BillDetailPage | — | `client/src/routes/index.tsx` |
| 72 | `/payments` | PaymentListPage | — | `client/src/routes/index.tsx` |
| 73 | `/payments/:id` | PaymentDetailPage | — | `client/src/routes/index.tsx` |
| 74 | `/purchase-bills` | PurchaseListPage | — | `client/src/routes/index.tsx` |
| 75 | `/purchase-bills/:id` | PurchaseDetailPage | — | `client/src/routes/index.tsx` |
| 76 | `/suppliers` | SupplierListPage | — | `client/src/routes/index.tsx` |
| 77 | `/suppliers/:id` | SupplierDetailPage | — | `client/src/routes/index.tsx` |
| 78 | `/required-stock` | RequiredStockPage | — | `client/src/routes/index.tsx` |
| 79 | `/returns` | ReturnsListPage | — | `client/src/routes/index.tsx` |
| 80 | `/returns/:id` | ReturnDetailPage | — | `client/src/routes/index.tsx` |
| 81 | `/reports` | ReportsHub | billerReports | `client/src/routes/index.tsx` |
| 82 | `/reports/sales` | SalesReport | billerReports | `client/src/routes/index.tsx` |
| 83 | `/reports/outstanding` | OutstandingReport | admin | `client/src/routes/index.tsx` |
| 84 | `/reports/gst` | GSTReport | admin | `client/src/routes/index.tsx` |
| 85 | `/reports/stock-aging` | StockAgingReport | billerReports | `client/src/routes/index.tsx` |
| 86 | `/reports/profit` | ProfitReport | admin | `client/src/routes/index.tsx` |
| 87 | `/reports/compliance` | ComplianceReport | admin | `client/src/routes/index.tsx` |
| 88 | `/reports/portal-orders` | PortalOrdersReport | admin | `client/src/routes/index.tsx` |
| 89 | `/reports/purchase-analysis` | PurchaseAnalysisReport | admin | `client/src/routes/index.tsx` |
| 90 | `/audit-logs` | AuditLogsPage | admin | `client/src/routes/index.tsx` |
| 91 | `/settings` | SettingsPage | admin | `client/src/routes/index.tsx` |
| 92 | `/*` | p | — | `client/src/routes/index.tsx` |

#### Server / API Routes

| # | Method | Path | File |
|---|--------|------|------|
| 1 | GET | `/` | `server/src/routes/customers.ts` |
| 2 | GET | `/:id` | `server/src/routes/customers.ts` |
| 3 | POST | `/` | `server/src/routes/customers.ts` |
| 4 | PATCH | `/:id` | `server/src/routes/customers.ts` |
| 5 | DELETE | `/:id` | `server/src/routes/customers.ts` |
| 6 | GET | `/` | `server/src/routes/pharmacies.ts` |
| 7 | GET | `/:id` | `server/src/routes/pharmacies.ts` |
| 8 | GET | `/:id/orders` | `server/src/routes/pharmacies.ts` |
| 9 | GET | `/:id/bills` | `server/src/routes/pharmacies.ts` |
| 10 | GET | `/:id/outstanding-bills` | `server/src/routes/pharmacies.ts` |
| 11 | GET | `/:id/credit-info` | `server/src/routes/pharmacies.ts` |
| 12 | POST | `/` | `server/src/routes/pharmacies.ts` |
| 13 | PATCH | `/:id` | `server/src/routes/pharmacies.ts` |
| 14 | GET | `/:id/returns` | `server/src/routes/pharmacies.ts` |
| 15 | GET | `/:id/ledger` | `server/src/routes/pharmacies.ts` |
| 16 | POST | `/:id/reconcile-outstanding` | `server/src/routes/pharmacies.ts` |
| 17 | GET | `/` | `server/src/routes/stockistReturns.ts` |
| 18 | GET | `/:id` | `server/src/routes/stockistReturns.ts` |
| 19 | POST | `/` | `server/src/routes/stockistReturns.ts` |
| 20 | GET | `/` | `server/src/routes/suppliers.ts` |
| 21 | GET | `/:id` | `server/src/routes/suppliers.ts` |
| 22 | GET | `/:id/purchases` | `server/src/routes/suppliers.ts` |
| 23 | POST | `/` | `server/src/routes/suppliers.ts` |
| 24 | PATCH | `/:id` | `server/src/routes/suppliers.ts` |
| 25 | GET | `/:id/ledger` | `server/src/routes/suppliers.ts` |
| 26 | GET | `/` | `server/src/routes/bills.ts` |
| 27 | GET | `/:id` | `server/src/routes/bills.ts` |
| 28 | PATCH | `/:id/status` | `server/src/routes/bills.ts` |
| 29 | GET | `/dashboard` | `server/src/routes/reports.ts` |
| 30 | GET | `/sales` | `server/src/routes/reports.ts` |
| 31 | GET | `/outstanding` | `server/src/routes/reports.ts` |
| 32 | GET | `/gst` | `server/src/routes/reports.ts` |
| 33 | GET | `/stock-aging` | `server/src/routes/reports.ts` |
| 34 | GET | `/required-stock` | `server/src/routes/reports.ts` |
| 35 | GET | `/compliance` | `server/src/routes/reports.ts` |
| 36 | GET | `/profit` | `server/src/routes/reports.ts` |
| 37 | GET | `/portal-orders` | `server/src/routes/reports.ts` |
| 38 | GET | `/purchase-analysis` | `server/src/routes/reports.ts` |
| 39 | POST | `/consumer/register` | `server/src/routes/extendedAccounts.ts` |
| 40 | POST | `/consumer/login` | `server/src/routes/extendedAccounts.ts` |
| 41 | GET | `/consumer/pharmacies` | `server/src/routes/extendedAccounts.ts` |
| 42 | GET | `/consumer/pharmacies/:id/products` | `server/src/routes/extendedAccounts.ts` |
| 43 | GET | `/consumer/orders` | `server/src/routes/extendedAccounts.ts` |
| 44 | POST | `/consumer/orders` | `server/src/routes/extendedAccounts.ts` |
| 45 | GET | `/consumer/doctors` | `server/src/routes/extendedAccounts.ts` |
| 46 | POST | `/consumer/consultations` | `server/src/routes/extendedAccounts.ts` |
| 47 | POST | `/doctor/register` | `server/src/routes/extendedAccounts.ts` |
| 48 | POST | `/doctor/login` | `server/src/routes/extendedAccounts.ts` |
| 49 | GET | `/doctor/consultations` | `server/src/routes/extendedAccounts.ts` |
| 50 | POST | `/mr/register` | `server/src/routes/extendedAccounts.ts` |
| 51 | POST | `/mr/login` | `server/src/routes/extendedAccounts.ts` |
| 52 | GET | `/mr/visits` | `server/src/routes/extendedAccounts.ts` |
| 53 | POST | `/mr/visits` | `server/src/routes/extendedAccounts.ts` |
| 54 | GET | `/features` | `server/src/routes/settings.ts` |
| 55 | GET | `/tenant` | `server/src/routes/settings.ts` |
| 56 | PATCH | `/tenant` | `server/src/routes/settings.ts` |
| 57 | PATCH | `/onboarding` | `server/src/routes/settings.ts` |
| 58 | GET | `/public-catalog` | `server/src/routes/settings.ts` |
| 59 | POST | `/public-catalog/sync` | `server/src/routes/settings.ts` |
| 60 | PATCH | `/public-catalog/:productId` | `server/src/routes/settings.ts` |
| 61 | POST | `/send-bill` | `server/src/routes/communication.ts` |
| 62 | POST | `/parse` | `server/src/routes/smartOrder.ts` |
| 63 | POST | `/recommend` | `server/src/routes/smartOrder.ts` |
| 64 | POST | `/login` | `server/src/routes/platform.ts` |
| 65 | GET | `/me` | `server/src/routes/platform.ts` |
| 66 | GET | `/stats` | `server/src/routes/platform.ts` |
| 67 | GET | `/tenants` | `server/src/routes/platform.ts` |
| 68 | GET | `/tenants/:id` | `server/src/routes/platform.ts` |
| 69 | PATCH | `/tenants/:id/approval` | `server/src/routes/platform.ts` |
| 70 | GET | `/` | `server/src/routes/stockistConnections.ts` |
| 71 | GET | `/search` | `server/src/routes/stockistConnections.ts` |
| 72 | GET | `/by-stockist/:stockistTenantId` | `server/src/routes/stockistConnections.ts` |
| 73 | GET | `/:id` | `server/src/routes/stockistConnections.ts` |
| 74 | POST | `/request` | `server/src/routes/stockistConnections.ts` |
| 75 | POST | `/:id/withdraw` | `server/src/routes/stockistConnections.ts` |
| 76 | POST | `/:id/approve` | `server/src/routes/stockistConnections.ts` |
| 77 | POST | `/:id/reject` | `server/src/routes/stockistConnections.ts` |
| 78 | POST | `/:id/disconnect` | `server/src/routes/stockistConnections.ts` |
| 79 | POST | `/:id/sync-catalog` | `server/src/routes/stockistConnections.ts` |
| 80 | POST | `/:id/pull-catalog` | `server/src/routes/stockistConnections.ts` |
| 81 | GET | `/:id/catalog` | `server/src/routes/stockistConnections.ts` |
| 82 | PATCH | `/:id/catalog/:catalogItemId/map` | `server/src/routes/stockistConnections.ts` |
| 83 | GET | `/` | `server/src/routes/retailSales.ts` |
| 84 | GET | `/:id` | `server/src/routes/retailSales.ts` |
| 85 | POST | `/` | `server/src/routes/retailSales.ts` |
| 86 | POST | `/:id/void` | `server/src/routes/retailSales.ts` |
| 87 | GET | `/` | `server/src/routes/returns.ts` |
| 88 | GET | `/:id` | `server/src/routes/returns.ts` |
| 89 | POST | `/:id/process` | `server/src/routes/returns.ts` |
| 90 | POST | `/:id/reject` | `server/src/routes/returns.ts` |
| 91 | POST | `/autofill` | `server/src/routes/products.ts` |
| 92 | GET | `/` | `server/src/routes/products.ts` |
| 93 | GET | `/export` | `server/src/routes/products.ts` |
| 94 | GET | `/categories` | `server/src/routes/products.ts` |
| 95 | GET | `/:id` | `server/src/routes/products.ts` |
| 96 | GET | `/:id/batches` | `server/src/routes/products.ts` |
| 97 | POST | `/from-catalog/:catalogItemId` | `server/src/routes/products.ts` |
| 98 | POST | `/` | `server/src/routes/products.ts` |
| 99 | PATCH | `/:id` | `server/src/routes/products.ts` |
| 100 | POST | `/:id/adjust-stock` | `server/src/routes/products.ts` |
| 101 | POST | `/parse-text` | `server/src/routes/orders.ts` |
| 102 | GET | `/` | `server/src/routes/orders.ts` |
| 103 | GET | `/:id` | `server/src/routes/orders.ts` |
| 104 | POST | `/` | `server/src/routes/orders.ts` |
| 105 | POST | `/:id/finalize` | `server/src/routes/orders.ts` |
| 106 | POST | `/:id/deliver` | `server/src/routes/orders.ts` |
| 107 | POST | `/:id/ship` | `server/src/routes/orders.ts` |
| 108 | POST | `/:id/approve` | `server/src/routes/orders.ts` |
| 109 | POST | `/:id/reject` | `server/src/routes/orders.ts` |
| 110 | POST | `/:id/cancel-approved` | `server/src/routes/orders.ts` |
| 111 | POST | `/:id/cancel` | `server/src/routes/orders.ts` |
| 112 | POST | `/:id/bill` | `server/src/routes/orders.ts` |
| 113 | POST | `/:id/return` | `server/src/routes/orders.ts` |
| 114 | GET | `/` | `server/src/routes/purchases.ts` |
| 115 | GET | `/:id` | `server/src/routes/purchases.ts` |
| 116 | GET | `/:id/ledger` | `server/src/routes/purchases.ts` |
| 117 | POST | `/` | `server/src/routes/purchases.ts` |
| 118 | POST | `/sale-rates` | `server/src/routes/purchases.ts` |
| 119 | POST | `/parse` | `server/src/routes/purchases.ts` |
| 120 | POST | `/:id/receive` | `server/src/routes/purchases.ts` |
| 121 | PATCH | `/:id` | `server/src/routes/purchases.ts` |
| 122 | GET | `/` | `server/src/routes/events.ts` |
| 123 | GET | `/history` | `server/src/routes/events.ts` |
| 124 | POST | `/process` | `server/src/routes/events.ts` |
| 125 | POST | `/:id/apply` | `server/src/routes/events.ts` |
| 126 | GET | `/` | `server/src/routes/payablePayments.ts` |
| 127 | POST | `/` | `server/src/routes/payablePayments.ts` |
| 128 | POST | `/:id/void` | `server/src/routes/payablePayments.ts` |
| 129 | GET | `/` | `server/src/routes/users.ts` |
| 130 | POST | `/` | `server/src/routes/users.ts` |
| 131 | PATCH | `/:id` | `server/src/routes/users.ts` |
| 132 | POST | `/change-password` | `server/src/routes/users.ts` |
| 133 | GET | `/` | `server/src/routes/grn.ts` |
| 134 | GET | `/:id` | `server/src/routes/grn.ts` |
| 135 | POST | `/` | `server/src/routes/grn.ts` |
| 136 | GET | `/` | `server/src/routes/purchaseOrders.ts` |
| 137 | GET | `/:id` | `server/src/routes/purchaseOrders.ts` |
| 138 | POST | `/` | `server/src/routes/purchaseOrders.ts` |
| 139 | PATCH | `/:id` | `server/src/routes/purchaseOrders.ts` |
| 140 | POST | `/:id/submit` | `server/src/routes/purchaseOrders.ts` |
| 141 | POST | `/:id/cancel` | `server/src/routes/purchaseOrders.ts` |
| 142 | POST | `/:id/confirm-receipt` | `server/src/routes/purchaseOrders.ts` |
| 143 | DELETE | `/:id` | `server/src/routes/purchaseOrders.ts` |
| 144 | GET | `/` | `server/src/routes/audit.ts` |
| 145 | GET | `/:id` | `server/src/routes/audit.ts` |
| 146 | GET | `/check-reference` | `server/src/routes/payments.ts` |
| 147 | GET | `/` | `server/src/routes/payments.ts` |
| 148 | GET | `/:id` | `server/src/routes/payments.ts` |
| 149 | POST | `/` | `server/src/routes/payments.ts` |
| 150 | POST | `/:id/void` | `server/src/routes/payments.ts` |
| 151 | GET | `/health` | `server/src/routes/system.ts` |
| 152 | GET | `/verify-bill/:id` | `server/src/routes/public.ts` |
| 153 | GET | `/stockists` | `server/src/routes/public.ts` |
| 154 | GET | `/stockists/:slug` | `server/src/routes/public.ts` |
| 155 | GET | `/stockists/:slug/catalog` | `server/src/routes/public.ts` |
| 156 | GET | `/` | `server/src/routes/supplierPayments.ts` |
| 157 | POST | `/` | `server/src/routes/supplierPayments.ts` |
| 158 | POST | `/register` | `server/src/routes/auth.ts` |
| 159 | POST | `/login` | `server/src/routes/auth.ts` |
| 160 | POST | `/logout` | `server/src/routes/auth.ts` |
| 161 | GET | `/me` | `server/src/routes/auth.ts` |
| 162 | POST | `/forgot-password` | `server/src/routes/auth.ts` |
| 163 | POST | `/reset-password` | `server/src/routes/auth.ts` |
| 164 | GET | `/` | `server/src/routes/payableBills.ts` |
| 165 | GET | `/:id` | `server/src/routes/payableBills.ts` |

### E.2 Entity / Table Catalog

**Tables/schemas found:** 52

#### `audit_logs`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `action` | `column` |
| `addressLine` | `column` |
| `afterJson` | `column` |
| `approvalStatus` | `column` |
| `beforeJson` | `column` |
| `city` | `column` |
| `consultationFeeAudio` | `column` |
| `consultationFeeClinic` | `column` |
| `consultationFeeVideo` | `column` |
| `consumerId` | `column` |
| `createdAt` | `column` |
| `deliveryAddressJson` | `column` |
| `doctorId` | `column` |
| `email` | `column` |
| `entityId` | `column` |
| `entityType` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `ip` | `column` |
| `isActive` | `column` |
| `isDefault` | `column` |
| `label` | `column` |
| `lineTotal` | `column` |
| `mode` | `column` |
| `name` | `column` |
| `notes` | `column` |
| `orderId` | `column` |
| `orderNumber` | `column` |
| `passwordHash` | `column` |
| `paymentMode` | `column` |
| `pharmacyTenantId` | `column` |
| `phone` | `column` |
| `pinCode` | `column` |
| `prescriptionUrl` | `column` |
| `productId` | `column` |
| `productName` | `column` |
| `qty` | `column` |
| `registrationNo` | `column` |
| `role` | `column` |
| `specialization` | `column` |
| `stateCode` | `column` |
| `status` | `column` |
| `subtotal` | `column` |
| `taxTotal` | `column` |
| `tenantId` | `column` |
| `total` | `column` |
| `unitPrice` | `column` |
| `userAgent` | `column` |
| `userId` | `column` |

#### `bill_items`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `allocatedAmount` | `column` |
| `amount` | `column` |
| `batchId` | `column` |
| `billId` | `column` |
| `cgst` | `column` |
| `createdAt` | `column` |
| `createdBy` | `column` |
| `freeQty` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `igst` | `column` |
| `lineSubtotal` | `column` |
| `lineTotal` | `column` |
| `method` | `column` |
| `notes` | `column` |
| `orderId` | `column` |
| `orderItemId` | `column` |
| `paymentDate` | `column` |
| `paymentId` | `column` |
| `paymentNumber` | `column` |
| `pharmacyId` | `column` |
| `productId` | `column` |
| `qty` | `column` |
| `rate` | `column` |
| `reason` | `column` |
| `referenceNo` | `column` |
| `returnDate` | `column` |
| `returnId` | `column` |
| `returnNumber` | `column` |
| `sgst` | `column` |
| `status` | `column` |
| `supplierId` | `column` |
| `tenantId` | `column` |
| `totalAmount` | `column` |
| `unallocatedAmount` | `column` |

#### `bills`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `amount` | `column` |
| `batchId` | `column` |
| `billDate` | `column` |
| `billId` | `column` |
| `billNumber` | `column` |
| `cgst` | `column` |
| `createdAt` | `column` |
| `createdBy` | `column` |
| `delta` | `column` |
| `dueDate` | `column` |
| `freeQty` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `igst` | `column` |
| `isInterstate` | `column` |
| `lineSubtotal` | `column` |
| `lineTotal` | `column` |
| `method` | `column` |
| `notes` | `column` |
| `orderId` | `column` |
| `paidAmount` | `column` |
| `paymentDate` | `column` |
| `paymentNumber` | `column` |
| `performedBy` | `column` |
| `pharmacyId` | `column` |
| `placeOfSupply` | `column` |
| `productId` | `column` |
| `qty` | `column` |
| `rate` | `column` |
| `reason` | `column` |
| `refId` | `column` |
| `refNumber` | `column` |
| `refType` | `column` |
| `referenceNo` | `column` |
| `sgst` | `column` |
| `status` | `column` |
| `subtotal` | `column` |
| `tenantId` | `column` |
| `total` | `column` |
| `unallocatedAmount` | `column` |

#### `consultations`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `address` | `column` |
| `brand` | `column` |
| `consumerId` | `column` |
| `doctorId` | `column` |
| `email` | `column` |
| `fee` | `column` |
| `id` | `column` |
| `isActive` | `column` |
| `mode` | `column` |
| `mrId` | `column` |
| `name` | `column` |
| `notes` | `column` |
| `parsedJson` | `column` |
| `passwordHash` | `column` |
| `pharmacyName` | `column` |
| `pharmacyTenantId` | `column` |
| `phone` | `column` |
| `prescriptionJson` | `column` |
| `rawText` | `column` |
| `recommendationsJson` | `column` |
| `scheduledAt` | `column` |
| `status` | `column` |
| `territory` | `column` |
| `visitedAt` | `column` |

#### `consumer_accounts`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `address` | `column` |
| `addressLine` | `column` |
| `approvalStatus` | `column` |
| `brand` | `column` |
| `city` | `column` |
| `consultationFeeAudio` | `column` |
| `consultationFeeClinic` | `column` |
| `consultationFeeVideo` | `column` |
| `consumerId` | `column` |
| `deliveryAddressJson` | `column` |
| `doctorId` | `column` |
| `email` | `column` |
| `fee` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `isActive` | `column` |
| `isDefault` | `column` |
| `label` | `column` |
| `lineTotal` | `column` |
| `mode` | `column` |
| `mrId` | `column` |
| `name` | `column` |
| `notes` | `column` |
| `orderId` | `column` |
| `orderNumber` | `column` |
| `passwordHash` | `column` |
| `paymentMode` | `column` |
| `pharmacyName` | `column` |
| `pharmacyTenantId` | `column` |
| `phone` | `column` |
| `pinCode` | `column` |
| `prescriptionJson` | `column` |
| `prescriptionUrl` | `column` |
| `productId` | `column` |
| `productName` | `column` |
| `qty` | `column` |
| `registrationNo` | `column` |
| `scheduledAt` | `column` |
| `specialization` | `column` |
| `stateCode` | `column` |
| `status` | `column` |
| `subtotal` | `column` |
| `taxTotal` | `column` |
| `territory` | `column` |
| `total` | `column` |
| `unitPrice` | `column` |
| `visitedAt` | `column` |

#### `consumer_addresses`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `address` | `column` |
| `addressLine` | `column` |
| `approvalStatus` | `column` |
| `brand` | `column` |
| `city` | `column` |
| `consultationFeeAudio` | `column` |
| `consultationFeeClinic` | `column` |
| `consultationFeeVideo` | `column` |
| `consumerId` | `column` |
| `deliveryAddressJson` | `column` |
| `doctorId` | `column` |
| `email` | `column` |
| `fee` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `isActive` | `column` |
| `isDefault` | `column` |
| `label` | `column` |
| `lineTotal` | `column` |
| `mode` | `column` |
| `mrId` | `column` |
| `name` | `column` |
| `notes` | `column` |
| `orderId` | `column` |
| `orderNumber` | `column` |
| `passwordHash` | `column` |
| `paymentMode` | `column` |
| `pharmacyName` | `column` |
| `pharmacyTenantId` | `column` |
| `phone` | `column` |
| `pinCode` | `column` |
| `prescriptionJson` | `column` |
| `prescriptionUrl` | `column` |
| `productId` | `column` |
| `productName` | `column` |
| `qty` | `column` |
| `registrationNo` | `column` |
| `scheduledAt` | `column` |
| `specialization` | `column` |
| `stateCode` | `column` |
| `status` | `column` |
| `subtotal` | `column` |
| `taxTotal` | `column` |
| `territory` | `column` |
| `total` | `column` |
| `unitPrice` | `column` |
| `visitedAt` | `column` |

#### `cross_tenant_events`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `action` | `column` |
| `addressLine` | `column` |
| `afterJson` | `column` |
| `approvalStatus` | `column` |
| `beforeJson` | `column` |
| `city` | `column` |
| `consultationFeeAudio` | `column` |
| `consultationFeeClinic` | `column` |
| `consultationFeeVideo` | `column` |
| `consumerId` | `column` |
| `createdAt` | `column` |
| `deliveredAt` | `column` |
| `deliveryAddressJson` | `column` |
| `email` | `column` |
| `entityId` | `column` |
| `entityType` | `column` |
| `eventType` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `ip` | `column` |
| `isActive` | `column` |
| `isDefault` | `column` |
| `label` | `column` |
| `lineTotal` | `column` |
| `name` | `column` |
| `notes` | `column` |
| `orderId` | `column` |
| `orderNumber` | `column` |
| `passwordHash` | `column` |
| `payloadJson` | `column` |
| `paymentMode` | `column` |
| `pharmacyTenantId` | `column` |
| `phone` | `column` |
| `pinCode` | `column` |
| `prescriptionUrl` | `column` |
| `productId` | `column` |
| `productName` | `column` |
| `qty` | `column` |
| `registrationNo` | `column` |
| `role` | `column` |
| `sourceTenantId` | `column` |
| `specialization` | `column` |
| `stateCode` | `column` |
| `status` | `column` |
| `subtotal` | `column` |
| `targetTenantId` | `column` |
| `taxTotal` | `column` |
| `tenantId` | `column` |
| `total` | `column` |
| `unitPrice` | `column` |
| `userAgent` | `column` |
| `userId` | `column` |

#### `customers`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `age` | `column` |
| `allergies` | `column` |
| `amountReceived` | `column` |
| `batchId` | `column` |
| `batchNumber` | `column` |
| `billDate` | `column` |
| `billId` | `column` |
| `billNumber` | `column` |
| `cashierId` | `column` |
| `cgst` | `column` |
| `changeAmount` | `column` |
| `customerId` | `column` |
| `discountAmount` | `column` |
| `discountPercent` | `column` |
| `doctorName` | `column` |
| `doctorRegNo` | `column` |
| `dueDate` | `column` |
| `email` | `column` |
| `expiryDate` | `column` |
| `externalBillId` | `column` |
| `externalOrderId` | `column` |
| `gender` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `igst` | `column` |
| `isInterstate` | `column` |
| `lineSubtotal` | `column` |
| `lineTax` | `column` |
| `lineTotal` | `column` |
| `name` | `column` |
| `notes` | `column` |
| `paidAmount` | `column` |
| `patientAge` | `column` |
| `patientName` | `column` |
| `paymentBreakdownJson` | `column` |
| `paymentMethod` | `column` |
| `phone` | `column` |
| `placeOfSupply` | `column` |
| `productId` | `column` |
| `purchaseOrderId` | `column` |
| `qty` | `column` |
| `rate` | `column` |
| `rxNumber` | `column` |
| `saleDate` | `column` |
| `saleId` | `column` |
| `saleNumber` | `column` |
| `sgst` | `column` |
| `status` | `column` |
| `stockistConnectionId` | `column` |
| `stockistName` | `column` |
| `subtotal` | `column` |
| `taxAmount` | `column` |
| `tenantId` | `column` |
| `total` | `column` |
| `voidReason` | `column` |
| `voidedAt` | `column` |
| `voidedBy` | `column` |

#### `doctor_accounts`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `address` | `column` |
| `approvalStatus` | `column` |
| `brand` | `column` |
| `consultationFeeAudio` | `column` |
| `consultationFeeClinic` | `column` |
| `consultationFeeVideo` | `column` |
| `consumerId` | `column` |
| `doctorId` | `column` |
| `email` | `column` |
| `fee` | `column` |
| `id` | `column` |
| `isActive` | `column` |
| `mode` | `column` |
| `mrId` | `column` |
| `name` | `column` |
| `notes` | `column` |
| `parsedJson` | `column` |
| `passwordHash` | `column` |
| `pharmacyName` | `column` |
| `pharmacyTenantId` | `column` |
| `phone` | `column` |
| `prescriptionJson` | `column` |
| `rawText` | `column` |
| `recommendationsJson` | `column` |
| `registrationNo` | `column` |
| `scheduledAt` | `column` |
| `specialization` | `column` |
| `status` | `column` |
| `territory` | `column` |
| `visitedAt` | `column` |

#### `ledger_accounts`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `accountId` | `column` |
| `approvedAt` | `column` |
| `catalogItemId` | `column` |
| `code` | `column` |
| `createdAt` | `column` |
| `createdBy` | `column` |
| `credit` | `column` |
| `debit` | `column` |
| `entryId` | `column` |
| `externalOrderId` | `column` |
| `freeQty` | `column` |
| `grnNumber` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `lineSubtotal` | `column` |
| `lineTax` | `column` |
| `lineTotal` | `column` |
| `name` | `column` |
| `narration` | `column` |
| `notes` | `column` |
| `orderDate` | `column` |
| `parentId` | `column` |
| `partnerId` | `column` |
| `partnerType` | `column` |
| `paymentMode` | `column` |
| `poNumber` | `column` |
| `productName` | `column` |
| `purchaseOrderId` | `column` |
| `qty` | `column` |
| `rate` | `column` |
| `receivedDate` | `column` |
| `receivedQty` | `column` |
| `refId` | `column` |
| `refType` | `column` |
| `rejectionReason` | `column` |
| `shippedAt` | `column` |
| `status` | `column` |
| `stockistConnectionId` | `column` |
| `stockistProductId` | `column` |
| `submittedAt` | `column` |
| `subtotal` | `column` |
| `taxAmount` | `column` |
| `tenantId` | `column` |
| `total` | `column` |
| `trackingAwb` | `column` |
| `trackingCarrier` | `column` |
| `txnDate` | `column` |
| `type` | `column` |

#### `ledger_entries`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `accountId` | `column` |
| `approvedAt` | `column` |
| `catalogItemId` | `column` |
| `createdAt` | `column` |
| `createdBy` | `column` |
| `credit` | `column` |
| `debit` | `column` |
| `entryId` | `column` |
| `externalOrderId` | `column` |
| `freeQty` | `column` |
| `grnId` | `column` |
| `grnNumber` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `lineSubtotal` | `column` |
| `lineTax` | `column` |
| `lineTotal` | `column` |
| `narration` | `column` |
| `notes` | `column` |
| `orderDate` | `column` |
| `partnerId` | `column` |
| `partnerType` | `column` |
| `paymentMode` | `column` |
| `poNumber` | `column` |
| `productName` | `column` |
| `purchaseOrderId` | `column` |
| `purchaseOrderItemId` | `column` |
| `qty` | `column` |
| `rate` | `column` |
| `receivedDate` | `column` |
| `receivedQty` | `column` |
| `refId` | `column` |
| `refType` | `column` |
| `rejectionReason` | `column` |
| `shippedAt` | `column` |
| `status` | `column` |
| `stockistConnectionId` | `column` |
| `stockistProductId` | `column` |
| `submittedAt` | `column` |
| `subtotal` | `column` |
| `taxAmount` | `column` |
| `tenantId` | `column` |
| `total` | `column` |
| `trackingAwb` | `column` |
| `trackingCarrier` | `column` |
| `txnDate` | `column` |

#### `ledger_lines`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `accountId` | `column` |
| `approvedAt` | `column` |
| `batchId` | `column` |
| `batchNumber` | `column` |
| `catalogItemId` | `column` |
| `createdAt` | `column` |
| `createdBy` | `column` |
| `credit` | `column` |
| `debit` | `column` |
| `entryId` | `column` |
| `expiryDate` | `column` |
| `externalOrderId` | `column` |
| `freeQty` | `column` |
| `grnId` | `column` |
| `grnNumber` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `lineSubtotal` | `column` |
| `lineTax` | `column` |
| `lineTotal` | `column` |
| `mrp` | `column` |
| `notes` | `column` |
| `orderDate` | `column` |
| `partnerId` | `column` |
| `partnerType` | `column` |
| `paymentMode` | `column` |
| `poNumber` | `column` |
| `productId` | `column` |
| `productName` | `column` |
| `purchaseOrderId` | `column` |
| `purchaseOrderItemId` | `column` |
| `purchaseRate` | `column` |
| `qty` | `column` |
| `rate` | `column` |
| `receivedDate` | `column` |
| `receivedQty` | `column` |
| `rejectionReason` | `column` |
| `saleRate` | `column` |
| `shippedAt` | `column` |
| `status` | `column` |
| `stockistConnectionId` | `column` |
| `stockistProductId` | `column` |
| `submittedAt` | `column` |
| `subtotal` | `column` |
| `taxAmount` | `column` |
| `tenantId` | `column` |
| `total` | `column` |
| `trackingAwb` | `column` |
| `trackingCarrier` | `column` |

#### `mr_accounts`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `address` | `column` |
| `brand` | `column` |
| `email` | `column` |
| `id` | `column` |
| `isActive` | `column` |
| `mrId` | `column` |
| `name` | `column` |
| `notes` | `column` |
| `parsedJson` | `column` |
| `passwordHash` | `column` |
| `pharmacyName` | `column` |
| `pharmacyTenantId` | `column` |
| `phone` | `column` |
| `rawText` | `column` |
| `recommendationsJson` | `column` |
| `territory` | `column` |
| `visitedAt` | `column` |

#### `mr_pharmacy_visits`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `address` | `column` |
| `id` | `column` |
| `mrId` | `column` |
| `notes` | `column` |
| `parsedJson` | `column` |
| `pharmacyName` | `column` |
| `pharmacyTenantId` | `column` |
| `phone` | `column` |
| `rawText` | `column` |
| `recommendationsJson` | `column` |
| `visitedAt` | `column` |

#### `online_order_items`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `address` | `column` |
| `approvalStatus` | `column` |
| `brand` | `column` |
| `consultationFeeAudio` | `column` |
| `consultationFeeClinic` | `column` |
| `consultationFeeVideo` | `column` |
| `consumerId` | `column` |
| `doctorId` | `column` |
| `email` | `column` |
| `fee` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `isActive` | `column` |
| `lineTotal` | `column` |
| `mode` | `column` |
| `mrId` | `column` |
| `name` | `column` |
| `notes` | `column` |
| `orderId` | `column` |
| `parsedJson` | `column` |
| `passwordHash` | `column` |
| `pharmacyName` | `column` |
| `pharmacyTenantId` | `column` |
| `phone` | `column` |
| `prescriptionJson` | `column` |
| `productId` | `column` |
| `productName` | `column` |
| `qty` | `column` |
| `rawText` | `column` |
| `recommendationsJson` | `column` |
| `registrationNo` | `column` |
| `scheduledAt` | `column` |
| `specialization` | `column` |
| `status` | `column` |
| `territory` | `column` |
| `unitPrice` | `column` |
| `visitedAt` | `column` |

#### `online_orders`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `address` | `column` |
| `approvalStatus` | `column` |
| `brand` | `column` |
| `consultationFeeAudio` | `column` |
| `consultationFeeClinic` | `column` |
| `consultationFeeVideo` | `column` |
| `consumerId` | `column` |
| `deliveryAddressJson` | `column` |
| `doctorId` | `column` |
| `email` | `column` |
| `fee` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `isActive` | `column` |
| `lineTotal` | `column` |
| `mode` | `column` |
| `mrId` | `column` |
| `name` | `column` |
| `notes` | `column` |
| `orderId` | `column` |
| `orderNumber` | `column` |
| `parsedJson` | `column` |
| `passwordHash` | `column` |
| `paymentMode` | `column` |
| `pharmacyName` | `column` |
| `pharmacyTenantId` | `column` |
| `phone` | `column` |
| `prescriptionJson` | `column` |
| `prescriptionUrl` | `column` |
| `productId` | `column` |
| `productName` | `column` |
| `qty` | `column` |
| `rawText` | `column` |
| `recommendationsJson` | `column` |
| `registrationNo` | `column` |
| `scheduledAt` | `column` |
| `specialization` | `column` |
| `status` | `column` |
| `subtotal` | `column` |
| `taxTotal` | `column` |
| `territory` | `column` |
| `total` | `column` |
| `unitPrice` | `column` |
| `visitedAt` | `column` |

#### `order_items`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `batchId` | `column` |
| `billDate` | `column` |
| `billId` | `column` |
| `billNumber` | `column` |
| `cgst` | `column` |
| `createdAt` | `column` |
| `createdBy` | `column` |
| `delta` | `column` |
| `dueDate` | `column` |
| `freeQty` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `igst` | `column` |
| `isInterstate` | `column` |
| `lineSubtotal` | `column` |
| `lineTax` | `column` |
| `lineTotal` | `column` |
| `notes` | `column` |
| `orderId` | `column` |
| `paidAmount` | `column` |
| `performedBy` | `column` |
| `pharmacyId` | `column` |
| `placeOfSupply` | `column` |
| `productId` | `column` |
| `qty` | `column` |
| `rate` | `column` |
| `reason` | `column` |
| `refId` | `column` |
| `refNumber` | `column` |
| `refType` | `column` |
| `sgst` | `column` |
| `status` | `column` |
| `subtotal` | `column` |
| `tenantId` | `column` |
| `total` | `column` |

#### `orders`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `approvedAt` | `column` |
| `approvedBy` | `column` |
| `batchId` | `column` |
| `billDate` | `column` |
| `billNumber` | `column` |
| `cgst` | `column` |
| `createdBy` | `column` |
| `dueDate` | `column` |
| `externalPharmacyOrderId` | `column` |
| `freeQty` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `igst` | `column` |
| `isInterstate` | `column` |
| `lineSubtotal` | `column` |
| `lineTax` | `column` |
| `lineTotal` | `column` |
| `notes` | `column` |
| `orderDate` | `column` |
| `orderId` | `column` |
| `orderNumber` | `column` |
| `paidAmount` | `column` |
| `paymentMode` | `column` |
| `pharmacyId` | `column` |
| `placeOfSupply` | `column` |
| `productId` | `column` |
| `qty` | `column` |
| `rate` | `column` |
| `rejectionReason` | `column` |
| `sgst` | `column` |
| `shippedAt` | `column` |
| `source` | `column` |
| `status` | `column` |
| `stockistConnectionId` | `column` |
| `submittedAt` | `column` |
| `subtotal` | `column` |
| `taxAmount` | `column` |
| `tenantId` | `column` |
| `total` | `column` |
| `trackingAwb` | `column` |
| `trackingCarrier` | `column` |

#### `password_reset_tokens`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `address` | `column` |
| `baseUnit` | `column` |
| `batchNumber` | `column` |
| `category` | `column` |
| `contactPerson` | `column` |
| `convFactor` | `column` |
| `createdAt` | `column` |
| `creditLimit` | `column` |
| `dlNumber` | `column` |
| `email` | `column` |
| `expiresAt` | `column` |
| `expiryDate` | `column` |
| `genericName` | `column` |
| `gstRate` | `column` |
| `gstin` | `column` |
| `hsnCode` | `column` |
| `id` | `column` |
| `isActive` | `column` |
| `jti` | `column` |
| `manufacturer` | `column` |
| `minStockLevel` | `column` |
| `mrp` | `column` |
| `name` | `column` |
| `openingBalance` | `column` |
| `outstanding` | `column` |
| `packSize` | `column` |
| `paymentTermsDays` | `column` |
| `pharmacyTenantId` | `column` |
| `phone` | `column` |
| `portalConnected` | `column` |
| `productId` | `column` |
| `purchaseRate` | `column` |
| `qtyOnHand` | `column` |
| `qtyReceived` | `column` |
| `receivedAt` | `column` |
| `saleRate` | `column` |
| `saleUnit` | `column` |
| `scheduleType` | `column` |
| `schemeBase` | `column` |
| `schemeBonus` | `column` |
| `sourcePurchaseId` | `column` |
| `stateCode` | `column` |
| `status` | `column` |
| `supplierId` | `column` |
| `tenantId` | `column` |
| `usedAt` | `column` |
| `userId` | `column` |

#### `payable_bill_items`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `allocatedAmount` | `column` |
| `amount` | `column` |
| `batchId` | `column` |
| `batchNumber` | `column` |
| `billId` | `column` |
| `cgst` | `column` |
| `createdAt` | `column` |
| `createdBy` | `column` |
| `expiryDate` | `column` |
| `externalProductId` | `column` |
| `externalReturnId` | `column` |
| `freeQty` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `igst` | `column` |
| `lineSubtotal` | `column` |
| `lineTotal` | `column` |
| `linkedPharmacyId` | `column` |
| `method` | `column` |
| `notes` | `column` |
| `payableBillId` | `column` |
| `paymentDate` | `column` |
| `paymentId` | `column` |
| `paymentNumber` | `column` |
| `pharmacyTenantId` | `column` |
| `productId` | `column` |
| `productName` | `column` |
| `purchaseOrderId` | `column` |
| `qty` | `column` |
| `rate` | `column` |
| `reason` | `column` |
| `referenceNo` | `column` |
| `rejectionReason` | `column` |
| `requestSource` | `column` |
| `returnDate` | `column` |
| `returnId` | `column` |
| `returnNumber` | `column` |
| `sgst` | `column` |
| `status` | `column` |
| `stockistConnectionId` | `column` |
| `stockistTenantId` | `column` |
| `tenantId` | `column` |
| `totalAmount` | `column` |
| `unallocatedAmount` | `column` |

#### `payable_bills`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `allocatedAmount` | `column` |
| `amount` | `column` |
| `batchNumber` | `column` |
| `billDate` | `column` |
| `billId` | `column` |
| `billNumber` | `column` |
| `cgst` | `column` |
| `createdAt` | `column` |
| `createdBy` | `column` |
| `dueDate` | `column` |
| `expiryDate` | `column` |
| `externalBillId` | `column` |
| `externalOrderId` | `column` |
| `externalProductId` | `column` |
| `externalReturnId` | `column` |
| `freeQty` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `igst` | `column` |
| `isInterstate` | `column` |
| `lineSubtotal` | `column` |
| `lineTotal` | `column` |
| `method` | `column` |
| `notes` | `column` |
| `paidAmount` | `column` |
| `payableBillId` | `column` |
| `paymentDate` | `column` |
| `paymentId` | `column` |
| `paymentNumber` | `column` |
| `placeOfSupply` | `column` |
| `productId` | `column` |
| `productName` | `column` |
| `purchaseOrderId` | `column` |
| `qty` | `column` |
| `rate` | `column` |
| `reason` | `column` |
| `referenceNo` | `column` |
| `returnDate` | `column` |
| `returnNumber` | `column` |
| `sgst` | `column` |
| `status` | `column` |
| `stockistConnectionId` | `column` |
| `stockistName` | `column` |
| `subtotal` | `column` |
| `tenantId` | `column` |
| `total` | `column` |
| `totalAmount` | `column` |
| `unallocatedAmount` | `column` |

#### `payable_payment_allocations`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `allocatedAmount` | `column` |
| `availabilityHint` | `column` |
| `batchId` | `column` |
| `billId` | `column` |
| `category` | `column` |
| `connectedAt` | `column` |
| `connectionId` | `column` |
| `createdAt` | `column` |
| `createdBy` | `column` |
| `creditLimit` | `column` |
| `disconnectedAt` | `column` |
| `expectedMonthlyVolume` | `column` |
| `externalReturnId` | `column` |
| `genericName` | `column` |
| `gstRate` | `column` |
| `hsnCode` | `column` |
| `id` | `column` |
| `isPublic` | `column` |
| `lineTotal` | `column` |
| `linkedPharmacyId` | `column` |
| `manufacturer` | `column` |
| `mrp` | `column` |
| `name` | `column` |
| `notes` | `column` |
| `packSize` | `column` |
| `payableBillId` | `column` |
| `paymentId` | `column` |
| `paymentTermsDays` | `column` |
| `pharmacyTenantId` | `column` |
| `productId` | `column` |
| `purchaseOrderId` | `column` |
| `qty` | `column` |
| `rate` | `column` |
| `reason` | `column` |
| `rejectionReason` | `column` |
| `requestNote` | `column` |
| `requestSource` | `column` |
| `returnDate` | `column` |
| `returnId` | `column` |
| `returnNumber` | `column` |
| `saleRate` | `column` |
| `scheduleType` | `column` |
| `status` | `column` |
| `stockistConnectionId` | `column` |
| `stockistTenantId` | `column` |
| `syncedAt` | `column` |
| `tenantId` | `column` |
| `totalAmount` | `column` |

#### `payable_payments`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `allocatedAmount` | `column` |
| `amount` | `column` |
| `batchId` | `column` |
| `billId` | `column` |
| `category` | `column` |
| `connectedAt` | `column` |
| `createdAt` | `column` |
| `createdBy` | `column` |
| `creditLimit` | `column` |
| `disconnectedAt` | `column` |
| `expectedMonthlyVolume` | `column` |
| `externalReturnId` | `column` |
| `genericName` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `lineTotal` | `column` |
| `linkedPharmacyId` | `column` |
| `manufacturer` | `column` |
| `method` | `column` |
| `name` | `column` |
| `notes` | `column` |
| `payableBillId` | `column` |
| `paymentDate` | `column` |
| `paymentId` | `column` |
| `paymentNumber` | `column` |
| `paymentTermsDays` | `column` |
| `pharmacyTenantId` | `column` |
| `productId` | `column` |
| `purchaseOrderId` | `column` |
| `qty` | `column` |
| `rate` | `column` |
| `reason` | `column` |
| `referenceNo` | `column` |
| `rejectionReason` | `column` |
| `requestNote` | `column` |
| `requestSource` | `column` |
| `returnDate` | `column` |
| `returnId` | `column` |
| `returnNumber` | `column` |
| `status` | `column` |
| `stockistConnectionId` | `column` |
| `stockistTenantId` | `column` |
| `tenantId` | `column` |
| `totalAmount` | `column` |
| `unallocatedAmount` | `column` |

#### `payment_allocations`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `accountId` | `column` |
| `allocatedAmount` | `column` |
| `amount` | `column` |
| `batchId` | `column` |
| `billId` | `column` |
| `code` | `column` |
| `createdAt` | `column` |
| `createdBy` | `column` |
| `credit` | `column` |
| `debit` | `column` |
| `entryId` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `lineTotal` | `column` |
| `method` | `column` |
| `name` | `column` |
| `narration` | `column` |
| `notes` | `column` |
| `orderId` | `column` |
| `orderItemId` | `column` |
| `parentId` | `column` |
| `partnerId` | `column` |
| `partnerType` | `column` |
| `paymentDate` | `column` |
| `paymentId` | `column` |
| `paymentNumber` | `column` |
| `pharmacyId` | `column` |
| `productId` | `column` |
| `qty` | `column` |
| `rate` | `column` |
| `reason` | `column` |
| `refId` | `column` |
| `refType` | `column` |
| `referenceNo` | `column` |
| `returnDate` | `column` |
| `returnId` | `column` |
| `returnNumber` | `column` |
| `status` | `column` |
| `supplierId` | `column` |
| `tenantId` | `column` |
| `totalAmount` | `column` |
| `txnDate` | `column` |
| `type` | `column` |

#### `payments`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `allocatedAmount` | `column` |
| `amount` | `column` |
| `batchId` | `column` |
| `billId` | `column` |
| `code` | `column` |
| `createdAt` | `column` |
| `createdBy` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `lineTotal` | `column` |
| `method` | `column` |
| `name` | `column` |
| `narration` | `column` |
| `notes` | `column` |
| `orderId` | `column` |
| `orderItemId` | `column` |
| `parentId` | `column` |
| `paymentDate` | `column` |
| `paymentId` | `column` |
| `paymentNumber` | `column` |
| `pharmacyId` | `column` |
| `productId` | `column` |
| `qty` | `column` |
| `rate` | `column` |
| `reason` | `column` |
| `refId` | `column` |
| `refType` | `column` |
| `referenceNo` | `column` |
| `returnDate` | `column` |
| `returnId` | `column` |
| `returnNumber` | `column` |
| `status` | `column` |
| `supplierId` | `column` |
| `tenantId` | `column` |
| `totalAmount` | `column` |
| `txnDate` | `column` |
| `type` | `column` |
| `unallocatedAmount` | `column` |

#### `pharmacies`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `address` | `column` |
| `baseUnit` | `column` |
| `batchNumber` | `column` |
| `category` | `column` |
| `contactPerson` | `column` |
| `convFactor` | `column` |
| `createdAt` | `column` |
| `createdBy` | `column` |
| `creditLimit` | `column` |
| `dlNumber` | `column` |
| `email` | `column` |
| `expiryDate` | `column` |
| `genericName` | `column` |
| `grnNumber` | `column` |
| `gstRate` | `column` |
| `gstin` | `column` |
| `hsnCode` | `column` |
| `id` | `column` |
| `invoiceDate` | `column` |
| `invoiceFileUrl` | `column` |
| `isActive` | `column` |
| `manufacturer` | `column` |
| `minStockLevel` | `column` |
| `mrp` | `column` |
| `name` | `column` |
| `notes` | `column` |
| `openingBalance` | `column` |
| `outstanding` | `column` |
| `packSize` | `column` |
| `paymentTermsDays` | `column` |
| `pharmacyTenantId` | `column` |
| `phone` | `column` |
| `portalConnected` | `column` |
| `productId` | `column` |
| `purchaseRate` | `column` |
| `qtyOnHand` | `column` |
| `qtyReceived` | `column` |
| `receivedAt` | `column` |
| `receivedDate` | `column` |
| `saleRate` | `column` |
| `saleUnit` | `column` |
| `scheduleType` | `column` |
| `schemeBase` | `column` |
| `schemeBonus` | `column` |
| `sourcePurchaseId` | `column` |
| `stateCode` | `column` |
| `status` | `column` |
| `subtotal` | `column` |
| `supplierId` | `column` |
| `supplierInvoiceNo` | `column` |
| `taxAmount` | `column` |
| `tenantId` | `column` |
| `total` | `column` |

#### `pharmacy_grn_items`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `age` | `column` |
| `allergies` | `column` |
| `amountReceived` | `column` |
| `batchId` | `column` |
| `batchNumber` | `column` |
| `billDate` | `column` |
| `billNumber` | `column` |
| `cashierId` | `column` |
| `changeAmount` | `column` |
| `createdAt` | `column` |
| `customerId` | `column` |
| `discountAmount` | `column` |
| `discountPercent` | `column` |
| `doctorName` | `column` |
| `doctorRegNo` | `column` |
| `dueDate` | `column` |
| `email` | `column` |
| `expiryDate` | `column` |
| `externalBillId` | `column` |
| `externalOrderId` | `column` |
| `freeQty` | `column` |
| `gender` | `column` |
| `grnId` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `isInterstate` | `column` |
| `lineSubtotal` | `column` |
| `lineTax` | `column` |
| `lineTotal` | `column` |
| `mrp` | `column` |
| `name` | `column` |
| `notes` | `column` |
| `patientAge` | `column` |
| `patientName` | `column` |
| `paymentBreakdownJson` | `column` |
| `paymentMethod` | `column` |
| `phone` | `column` |
| `placeOfSupply` | `column` |
| `productId` | `column` |
| `purchaseOrderId` | `column` |
| `purchaseOrderItemId` | `column` |
| `purchaseRate` | `column` |
| `qty` | `column` |
| `rate` | `column` |
| `rxNumber` | `column` |
| `saleDate` | `column` |
| `saleId` | `column` |
| `saleNumber` | `column` |
| `saleRate` | `column` |
| `status` | `column` |
| `stockistConnectionId` | `column` |
| `stockistName` | `column` |
| `subtotal` | `column` |
| `taxAmount` | `column` |
| `tenantId` | `column` |
| `total` | `column` |
| `voidReason` | `column` |
| `voidedAt` | `column` |
| `voidedBy` | `column` |

#### `pharmacy_grns`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `age` | `column` |
| `allergies` | `column` |
| `amountReceived` | `column` |
| `batchId` | `column` |
| `batchNumber` | `column` |
| `cashierId` | `column` |
| `changeAmount` | `column` |
| `createdAt` | `column` |
| `createdBy` | `column` |
| `customerId` | `column` |
| `discountAmount` | `column` |
| `discountPercent` | `column` |
| `doctorName` | `column` |
| `doctorRegNo` | `column` |
| `email` | `column` |
| `expiryDate` | `column` |
| `freeQty` | `column` |
| `gender` | `column` |
| `grnId` | `column` |
| `grnNumber` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `lineSubtotal` | `column` |
| `lineTax` | `column` |
| `lineTotal` | `column` |
| `mrp` | `column` |
| `name` | `column` |
| `notes` | `column` |
| `patientAge` | `column` |
| `patientName` | `column` |
| `paymentBreakdownJson` | `column` |
| `paymentMethod` | `column` |
| `phone` | `column` |
| `productId` | `column` |
| `purchaseOrderId` | `column` |
| `purchaseOrderItemId` | `column` |
| `purchaseRate` | `column` |
| `qty` | `column` |
| `rate` | `column` |
| `receivedDate` | `column` |
| `rxNumber` | `column` |
| `saleDate` | `column` |
| `saleId` | `column` |
| `saleNumber` | `column` |
| `saleRate` | `column` |
| `status` | `column` |
| `stockistConnectionId` | `column` |
| `subtotal` | `column` |
| `taxAmount` | `column` |
| `tenantId` | `column` |
| `total` | `column` |
| `voidReason` | `column` |
| `voidedAt` | `column` |
| `voidedBy` | `column` |

#### `pharmacy_purchase_order_items`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `age` | `column` |
| `allergies` | `column` |
| `amountReceived` | `column` |
| `batchId` | `column` |
| `batchNumber` | `column` |
| `cashierId` | `column` |
| `catalogItemId` | `column` |
| `changeAmount` | `column` |
| `createdAt` | `column` |
| `createdBy` | `column` |
| `customerId` | `column` |
| `discountAmount` | `column` |
| `doctorName` | `column` |
| `doctorRegNo` | `column` |
| `email` | `column` |
| `expiryDate` | `column` |
| `freeQty` | `column` |
| `gender` | `column` |
| `grnId` | `column` |
| `grnNumber` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `lineSubtotal` | `column` |
| `lineTax` | `column` |
| `lineTotal` | `column` |
| `mrp` | `column` |
| `name` | `column` |
| `notes` | `column` |
| `patientAge` | `column` |
| `patientName` | `column` |
| `paymentBreakdownJson` | `column` |
| `paymentMethod` | `column` |
| `phone` | `column` |
| `productId` | `column` |
| `productName` | `column` |
| `purchaseOrderId` | `column` |
| `purchaseOrderItemId` | `column` |
| `purchaseRate` | `column` |
| `qty` | `column` |
| `rate` | `column` |
| `receivedDate` | `column` |
| `receivedQty` | `column` |
| `rxNumber` | `column` |
| `saleDate` | `column` |
| `saleNumber` | `column` |
| `saleRate` | `column` |
| `status` | `column` |
| `stockistConnectionId` | `column` |
| `stockistProductId` | `column` |
| `subtotal` | `column` |
| `taxAmount` | `column` |
| `tenantId` | `column` |
| `total` | `column` |
| `voidReason` | `column` |
| `voidedAt` | `column` |
| `voidedBy` | `column` |

#### `pharmacy_purchase_orders`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `age` | `column` |
| `allergies` | `column` |
| `approvedAt` | `column` |
| `batchId` | `column` |
| `batchNumber` | `column` |
| `catalogItemId` | `column` |
| `createdAt` | `column` |
| `createdBy` | `column` |
| `email` | `column` |
| `expiryDate` | `column` |
| `externalOrderId` | `column` |
| `freeQty` | `column` |
| `gender` | `column` |
| `grnId` | `column` |
| `grnNumber` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `lineSubtotal` | `column` |
| `lineTax` | `column` |
| `lineTotal` | `column` |
| `mrp` | `column` |
| `name` | `column` |
| `notes` | `column` |
| `orderDate` | `column` |
| `paymentMode` | `column` |
| `phone` | `column` |
| `poNumber` | `column` |
| `productId` | `column` |
| `productName` | `column` |
| `purchaseOrderId` | `column` |
| `purchaseOrderItemId` | `column` |
| `purchaseRate` | `column` |
| `qty` | `column` |
| `rate` | `column` |
| `receivedDate` | `column` |
| `receivedQty` | `column` |
| `rejectionReason` | `column` |
| `saleDate` | `column` |
| `saleNumber` | `column` |
| `saleRate` | `column` |
| `shippedAt` | `column` |
| `status` | `column` |
| `stockistConnectionId` | `column` |
| `stockistProductId` | `column` |
| `submittedAt` | `column` |
| `subtotal` | `column` |
| `taxAmount` | `column` |
| `tenantId` | `column` |
| `total` | `column` |
| `trackingAwb` | `column` |
| `trackingCarrier` | `column` |

#### `platform_users`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `addressLine` | `column` |
| `approvalStatus` | `column` |
| `brand` | `column` |
| `city` | `column` |
| `consultationFeeAudio` | `column` |
| `consultationFeeClinic` | `column` |
| `consultationFeeVideo` | `column` |
| `consumerId` | `column` |
| `deliveryAddressJson` | `column` |
| `doctorId` | `column` |
| `email` | `column` |
| `fee` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `isActive` | `column` |
| `isDefault` | `column` |
| `label` | `column` |
| `lineTotal` | `column` |
| `mode` | `column` |
| `name` | `column` |
| `notes` | `column` |
| `orderId` | `column` |
| `orderNumber` | `column` |
| `passwordHash` | `column` |
| `paymentMode` | `column` |
| `pharmacyTenantId` | `column` |
| `phone` | `column` |
| `pinCode` | `column` |
| `prescriptionJson` | `column` |
| `prescriptionUrl` | `column` |
| `productId` | `column` |
| `productName` | `column` |
| `qty` | `column` |
| `registrationNo` | `column` |
| `role` | `column` |
| `scheduledAt` | `column` |
| `specialization` | `column` |
| `stateCode` | `column` |
| `status` | `column` |
| `subtotal` | `column` |
| `taxTotal` | `column` |
| `territory` | `column` |
| `total` | `column` |
| `unitPrice` | `column` |

#### `processed_cross_tenant_events`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `action` | `column` |
| `addressLine` | `column` |
| `afterJson` | `column` |
| `beforeJson` | `column` |
| `city` | `column` |
| `consultationFeeAudio` | `column` |
| `consumerId` | `column` |
| `createdAt` | `column` |
| `deliveredAt` | `column` |
| `deliveryAddressJson` | `column` |
| `email` | `column` |
| `entityId` | `column` |
| `entityType` | `column` |
| `eventId` | `column` |
| `eventType` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `ip` | `column` |
| `isActive` | `column` |
| `isDefault` | `column` |
| `label` | `column` |
| `lineTotal` | `column` |
| `name` | `column` |
| `notes` | `column` |
| `orderId` | `column` |
| `orderNumber` | `column` |
| `passwordHash` | `column` |
| `payloadJson` | `column` |
| `paymentMode` | `column` |
| `pharmacyTenantId` | `column` |
| `phone` | `column` |
| `pinCode` | `column` |
| `prescriptionUrl` | `column` |
| `productId` | `column` |
| `productName` | `column` |
| `qty` | `column` |
| `registrationNo` | `column` |
| `role` | `column` |
| `sourceTenantId` | `column` |
| `specialization` | `column` |
| `stateCode` | `column` |
| `status` | `column` |
| `subtotal` | `column` |
| `targetTenantId` | `column` |
| `taxTotal` | `column` |
| `tenantId` | `column` |
| `total` | `column` |
| `unitPrice` | `column` |
| `userAgent` | `column` |
| `userId` | `column` |

#### `product_batches`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `approvedAt` | `column` |
| `approvedBy` | `column` |
| `batchNumber` | `column` |
| `createdAt` | `column` |
| `createdBy` | `column` |
| `expiryDate` | `column` |
| `externalPharmacyOrderId` | `column` |
| `freeQty` | `column` |
| `grnNumber` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `invoiceDate` | `column` |
| `invoiceFileUrl` | `column` |
| `isInterstate` | `column` |
| `lineSubtotal` | `column` |
| `lineTax` | `column` |
| `lineTotal` | `column` |
| `mrp` | `column` |
| `notes` | `column` |
| `orderDate` | `column` |
| `orderNumber` | `column` |
| `paymentMode` | `column` |
| `pharmacyId` | `column` |
| `placeOfSupply` | `column` |
| `productId` | `column` |
| `purchaseId` | `column` |
| `purchaseRate` | `column` |
| `qty` | `column` |
| `qtyOnHand` | `column` |
| `qtyReceived` | `column` |
| `receivedAt` | `column` |
| `receivedDate` | `column` |
| `rejectionReason` | `column` |
| `saleRate` | `column` |
| `shippedAt` | `column` |
| `source` | `column` |
| `sourcePurchaseId` | `column` |
| `status` | `column` |
| `stockistConnectionId` | `column` |
| `submittedAt` | `column` |
| `subtotal` | `column` |
| `supplierId` | `column` |
| `supplierInvoiceNo` | `column` |
| `taxAmount` | `column` |
| `tenantId` | `column` |
| `total` | `column` |
| `trackingAwb` | `column` |
| `trackingCarrier` | `column` |

#### `products`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `baseUnit` | `column` |
| `batchNumber` | `column` |
| `category` | `column` |
| `convFactor` | `column` |
| `createdAt` | `column` |
| `createdBy` | `column` |
| `expiryDate` | `column` |
| `freeQty` | `column` |
| `genericName` | `column` |
| `grnNumber` | `column` |
| `gstRate` | `column` |
| `hsnCode` | `column` |
| `id` | `column` |
| `invoiceDate` | `column` |
| `invoiceFileUrl` | `column` |
| `isActive` | `column` |
| `lineSubtotal` | `column` |
| `lineTax` | `column` |
| `lineTotal` | `column` |
| `manufacturer` | `column` |
| `minStockLevel` | `column` |
| `mrp` | `column` |
| `name` | `column` |
| `notes` | `column` |
| `orderDate` | `column` |
| `orderNumber` | `column` |
| `packSize` | `column` |
| `pharmacyId` | `column` |
| `productId` | `column` |
| `purchaseId` | `column` |
| `purchaseRate` | `column` |
| `qty` | `column` |
| `qtyOnHand` | `column` |
| `qtyReceived` | `column` |
| `receivedAt` | `column` |
| `receivedDate` | `column` |
| `saleRate` | `column` |
| `saleUnit` | `column` |
| `scheduleType` | `column` |
| `schemeBase` | `column` |
| `schemeBonus` | `column` |
| `sourcePurchaseId` | `column` |
| `status` | `column` |
| `subtotal` | `column` |
| `supplierId` | `column` |
| `supplierInvoiceNo` | `column` |
| `taxAmount` | `column` |
| `tenantId` | `column` |
| `total` | `column` |

#### `purchase_items`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `approvedAt` | `column` |
| `approvedBy` | `column` |
| `batchId` | `column` |
| `batchNumber` | `column` |
| `billDate` | `column` |
| `billNumber` | `column` |
| `cgst` | `column` |
| `createdBy` | `column` |
| `dueDate` | `column` |
| `expiryDate` | `column` |
| `externalPharmacyOrderId` | `column` |
| `freeQty` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `igst` | `column` |
| `isInterstate` | `column` |
| `lineSubtotal` | `column` |
| `lineTax` | `column` |
| `lineTotal` | `column` |
| `mrp` | `column` |
| `notes` | `column` |
| `orderDate` | `column` |
| `orderId` | `column` |
| `orderNumber` | `column` |
| `paidAmount` | `column` |
| `paymentMode` | `column` |
| `pharmacyId` | `column` |
| `placeOfSupply` | `column` |
| `productId` | `column` |
| `purchaseId` | `column` |
| `purchaseRate` | `column` |
| `qty` | `column` |
| `rate` | `column` |
| `rejectionReason` | `column` |
| `sgst` | `column` |
| `shippedAt` | `column` |
| `source` | `column` |
| `status` | `column` |
| `stockistConnectionId` | `column` |
| `submittedAt` | `column` |
| `subtotal` | `column` |
| `taxAmount` | `column` |
| `tenantId` | `column` |
| `total` | `column` |
| `trackingAwb` | `column` |
| `trackingCarrier` | `column` |

#### `purchases`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `approvedAt` | `column` |
| `approvedBy` | `column` |
| `batchId` | `column` |
| `batchNumber` | `column` |
| `createdBy` | `column` |
| `expiryDate` | `column` |
| `externalPharmacyOrderId` | `column` |
| `freeQty` | `column` |
| `grnNumber` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `invoiceDate` | `column` |
| `invoiceFileUrl` | `column` |
| `isInterstate` | `column` |
| `lineSubtotal` | `column` |
| `lineTax` | `column` |
| `lineTotal` | `column` |
| `mrp` | `column` |
| `notes` | `column` |
| `orderDate` | `column` |
| `orderId` | `column` |
| `orderNumber` | `column` |
| `paymentMode` | `column` |
| `pharmacyId` | `column` |
| `placeOfSupply` | `column` |
| `productId` | `column` |
| `purchaseId` | `column` |
| `purchaseRate` | `column` |
| `qty` | `column` |
| `rate` | `column` |
| `receivedDate` | `column` |
| `rejectionReason` | `column` |
| `shippedAt` | `column` |
| `source` | `column` |
| `status` | `column` |
| `stockistConnectionId` | `column` |
| `submittedAt` | `column` |
| `subtotal` | `column` |
| `supplierId` | `column` |
| `supplierInvoiceNo` | `column` |
| `taxAmount` | `column` |
| `tenantId` | `column` |
| `total` | `column` |
| `trackingAwb` | `column` |
| `trackingCarrier` | `column` |

#### `refresh_tokens`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `address` | `column` |
| `baseUnit` | `column` |
| `batchNumber` | `column` |
| `category` | `column` |
| `contactPerson` | `column` |
| `convFactor` | `column` |
| `creditLimit` | `column` |
| `dlNumber` | `column` |
| `email` | `column` |
| `expiresAt` | `column` |
| `expiryDate` | `column` |
| `genericName` | `column` |
| `gstRate` | `column` |
| `gstin` | `column` |
| `hsnCode` | `column` |
| `id` | `column` |
| `isActive` | `column` |
| `jti` | `column` |
| `manufacturer` | `column` |
| `minStockLevel` | `column` |
| `mrp` | `column` |
| `name` | `column` |
| `openingBalance` | `column` |
| `outstanding` | `column` |
| `packSize` | `column` |
| `paymentTermsDays` | `column` |
| `pharmacyTenantId` | `column` |
| `phone` | `column` |
| `portalConnected` | `column` |
| `productId` | `column` |
| `purchaseRate` | `column` |
| `qtyOnHand` | `column` |
| `qtyReceived` | `column` |
| `revokedAt` | `column` |
| `saleRate` | `column` |
| `saleUnit` | `column` |
| `scheduleType` | `column` |
| `schemeBase` | `column` |
| `schemeBonus` | `column` |
| `sourcePurchaseId` | `column` |
| `stateCode` | `column` |
| `status` | `column` |
| `supplierId` | `column` |
| `tenantId` | `column` |
| `tokenHash` | `column` |
| `usedAt` | `column` |
| `userId` | `column` |

#### `retail_sale_items`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `allocatedAmount` | `column` |
| `amount` | `column` |
| `batchId` | `column` |
| `batchNumber` | `column` |
| `billDate` | `column` |
| `billId` | `column` |
| `billNumber` | `column` |
| `cgst` | `column` |
| `createdAt` | `column` |
| `createdBy` | `column` |
| `discountPercent` | `column` |
| `dueDate` | `column` |
| `expiryDate` | `column` |
| `externalBillId` | `column` |
| `externalOrderId` | `column` |
| `externalProductId` | `column` |
| `freeQty` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `igst` | `column` |
| `isInterstate` | `column` |
| `lineSubtotal` | `column` |
| `lineTax` | `column` |
| `lineTotal` | `column` |
| `method` | `column` |
| `notes` | `column` |
| `paidAmount` | `column` |
| `paymentDate` | `column` |
| `paymentId` | `column` |
| `paymentNumber` | `column` |
| `placeOfSupply` | `column` |
| `productId` | `column` |
| `productName` | `column` |
| `purchaseOrderId` | `column` |
| `qty` | `column` |
| `rate` | `column` |
| `referenceNo` | `column` |
| `saleId` | `column` |
| `sgst` | `column` |
| `status` | `column` |
| `stockistConnectionId` | `column` |
| `stockistName` | `column` |
| `subtotal` | `column` |
| `tenantId` | `column` |
| `total` | `column` |
| `unallocatedAmount` | `column` |

#### `retail_sales`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `amountReceived` | `column` |
| `batchId` | `column` |
| `batchNumber` | `column` |
| `billDate` | `column` |
| `billId` | `column` |
| `billNumber` | `column` |
| `cashierId` | `column` |
| `cgst` | `column` |
| `changeAmount` | `column` |
| `customerId` | `column` |
| `discountAmount` | `column` |
| `discountPercent` | `column` |
| `doctorName` | `column` |
| `doctorRegNo` | `column` |
| `dueDate` | `column` |
| `expiryDate` | `column` |
| `externalBillId` | `column` |
| `externalOrderId` | `column` |
| `externalProductId` | `column` |
| `freeQty` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `igst` | `column` |
| `isInterstate` | `column` |
| `lineSubtotal` | `column` |
| `lineTax` | `column` |
| `lineTotal` | `column` |
| `notes` | `column` |
| `paidAmount` | `column` |
| `patientAge` | `column` |
| `patientName` | `column` |
| `paymentBreakdownJson` | `column` |
| `paymentMethod` | `column` |
| `placeOfSupply` | `column` |
| `productId` | `column` |
| `productName` | `column` |
| `purchaseOrderId` | `column` |
| `qty` | `column` |
| `rate` | `column` |
| `rxNumber` | `column` |
| `saleDate` | `column` |
| `saleId` | `column` |
| `saleNumber` | `column` |
| `sgst` | `column` |
| `status` | `column` |
| `stockistConnectionId` | `column` |
| `stockistName` | `column` |
| `subtotal` | `column` |
| `taxAmount` | `column` |
| `tenantId` | `column` |
| `total` | `column` |
| `voidReason` | `column` |
| `voidedAt` | `column` |
| `voidedBy` | `column` |

#### `return_items`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `accountId` | `column` |
| `approvedAt` | `column` |
| `batchId` | `column` |
| `catalogItemId` | `column` |
| `code` | `column` |
| `createdAt` | `column` |
| `createdBy` | `column` |
| `credit` | `column` |
| `debit` | `column` |
| `entryId` | `column` |
| `externalOrderId` | `column` |
| `freeQty` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `lineSubtotal` | `column` |
| `lineTotal` | `column` |
| `name` | `column` |
| `narration` | `column` |
| `notes` | `column` |
| `orderDate` | `column` |
| `orderItemId` | `column` |
| `parentId` | `column` |
| `partnerId` | `column` |
| `partnerType` | `column` |
| `paymentMode` | `column` |
| `poNumber` | `column` |
| `productId` | `column` |
| `productName` | `column` |
| `purchaseOrderId` | `column` |
| `qty` | `column` |
| `rate` | `column` |
| `receivedQty` | `column` |
| `refId` | `column` |
| `refType` | `column` |
| `rejectionReason` | `column` |
| `returnId` | `column` |
| `shippedAt` | `column` |
| `status` | `column` |
| `stockistConnectionId` | `column` |
| `stockistProductId` | `column` |
| `submittedAt` | `column` |
| `subtotal` | `column` |
| `taxAmount` | `column` |
| `tenantId` | `column` |
| `total` | `column` |
| `trackingAwb` | `column` |
| `trackingCarrier` | `column` |
| `txnDate` | `column` |
| `type` | `column` |

#### `returns`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `accountId` | `column` |
| `approvedAt` | `column` |
| `batchId` | `column` |
| `code` | `column` |
| `createdAt` | `column` |
| `createdBy` | `column` |
| `credit` | `column` |
| `debit` | `column` |
| `entryId` | `column` |
| `externalOrderId` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `lineTotal` | `column` |
| `name` | `column` |
| `narration` | `column` |
| `notes` | `column` |
| `orderDate` | `column` |
| `orderId` | `column` |
| `orderItemId` | `column` |
| `parentId` | `column` |
| `partnerId` | `column` |
| `partnerType` | `column` |
| `paymentMode` | `column` |
| `pharmacyId` | `column` |
| `poNumber` | `column` |
| `productId` | `column` |
| `qty` | `column` |
| `rate` | `column` |
| `reason` | `column` |
| `refId` | `column` |
| `refType` | `column` |
| `rejectionReason` | `column` |
| `returnDate` | `column` |
| `returnId` | `column` |
| `returnNumber` | `column` |
| `shippedAt` | `column` |
| `status` | `column` |
| `stockistConnectionId` | `column` |
| `submittedAt` | `column` |
| `subtotal` | `column` |
| `taxAmount` | `column` |
| `tenantId` | `column` |
| `total` | `column` |
| `totalAmount` | `column` |
| `trackingAwb` | `column` |
| `trackingCarrier` | `column` |
| `txnDate` | `column` |
| `type` | `column` |

#### `smart_order_sessions`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `id` | `column` |
| `parsedJson` | `column` |
| `pharmacyTenantId` | `column` |
| `rawText` | `column` |
| `recommendationsJson` | `column` |

#### `stock_movements`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `allocatedAmount` | `column` |
| `amount` | `column` |
| `batchId` | `column` |
| `billId` | `column` |
| `cgst` | `column` |
| `createdAt` | `column` |
| `createdBy` | `column` |
| `delta` | `column` |
| `freeQty` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `igst` | `column` |
| `lineSubtotal` | `column` |
| `lineTotal` | `column` |
| `method` | `column` |
| `notes` | `column` |
| `orderId` | `column` |
| `paymentDate` | `column` |
| `paymentId` | `column` |
| `paymentNumber` | `column` |
| `performedBy` | `column` |
| `pharmacyId` | `column` |
| `productId` | `column` |
| `qty` | `column` |
| `rate` | `column` |
| `reason` | `column` |
| `refId` | `column` |
| `refNumber` | `column` |
| `refType` | `column` |
| `referenceNo` | `column` |
| `returnDate` | `column` |
| `returnNumber` | `column` |
| `sgst` | `column` |
| `status` | `column` |
| `supplierId` | `column` |
| `tenantId` | `column` |
| `totalAmount` | `column` |
| `unallocatedAmount` | `column` |

#### `stockist_catalog_items`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `action` | `column` |
| `addressLine` | `column` |
| `afterJson` | `column` |
| `availabilityHint` | `column` |
| `beforeJson` | `column` |
| `category` | `column` |
| `city` | `column` |
| `connectionId` | `column` |
| `consumerId` | `column` |
| `createdAt` | `column` |
| `deliveredAt` | `column` |
| `email` | `column` |
| `entityId` | `column` |
| `entityType` | `column` |
| `eventId` | `column` |
| `eventType` | `column` |
| `genericName` | `column` |
| `gstRate` | `column` |
| `hsnCode` | `column` |
| `id` | `column` |
| `ip` | `column` |
| `isActive` | `column` |
| `isDefault` | `column` |
| `label` | `column` |
| `localProductId` | `column` |
| `manufacturer` | `column` |
| `mrp` | `column` |
| `name` | `column` |
| `orderNumber` | `column` |
| `packSize` | `column` |
| `passwordHash` | `column` |
| `payloadJson` | `column` |
| `paymentMode` | `column` |
| `pharmacyTenantId` | `column` |
| `phone` | `column` |
| `pinCode` | `column` |
| `role` | `column` |
| `saleRate` | `column` |
| `scheduleType` | `column` |
| `schemeBase` | `column` |
| `schemeBonus` | `column` |
| `sourceTenantId` | `column` |
| `stateCode` | `column` |
| `status` | `column` |
| `stockistProductId` | `column` |
| `subtotal` | `column` |
| `syncedAt` | `column` |
| `targetTenantId` | `column` |
| `taxTotal` | `column` |
| `tenantId` | `column` |
| `userAgent` | `column` |
| `userId` | `column` |

#### `stockist_connections`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `action` | `column` |
| `availabilityHint` | `column` |
| `category` | `column` |
| `connectedAt` | `column` |
| `connectionId` | `column` |
| `createdAt` | `column` |
| `creditLimit` | `column` |
| `deliveredAt` | `column` |
| `disconnectedAt` | `column` |
| `eventId` | `column` |
| `eventType` | `column` |
| `expectedMonthlyVolume` | `column` |
| `genericName` | `column` |
| `gstRate` | `column` |
| `hsnCode` | `column` |
| `id` | `column` |
| `isPublic` | `column` |
| `linkedPharmacyId` | `column` |
| `localProductId` | `column` |
| `manufacturer` | `column` |
| `mrp` | `column` |
| `name` | `column` |
| `packSize` | `column` |
| `payloadJson` | `column` |
| `paymentTermsDays` | `column` |
| `pharmacyTenantId` | `column` |
| `productId` | `column` |
| `rejectionReason` | `column` |
| `requestNote` | `column` |
| `requestSource` | `column` |
| `saleRate` | `column` |
| `scheduleType` | `column` |
| `schemeBase` | `column` |
| `schemeBonus` | `column` |
| `sourceTenantId` | `column` |
| `status` | `column` |
| `stockistProductId` | `column` |
| `stockistTenantId` | `column` |
| `syncedAt` | `column` |
| `targetTenantId` | `column` |
| `tenantId` | `column` |
| `userId` | `column` |

#### `stockist_public_catalog_items`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `action` | `column` |
| `afterJson` | `column` |
| `availabilityHint` | `column` |
| `beforeJson` | `column` |
| `category` | `column` |
| `connectionId` | `column` |
| `createdAt` | `column` |
| `deliveredAt` | `column` |
| `email` | `column` |
| `entityId` | `column` |
| `entityType` | `column` |
| `eventId` | `column` |
| `eventType` | `column` |
| `genericName` | `column` |
| `gstRate` | `column` |
| `hsnCode` | `column` |
| `id` | `column` |
| `ip` | `column` |
| `isActive` | `column` |
| `isPublic` | `column` |
| `localProductId` | `column` |
| `manufacturer` | `column` |
| `mrp` | `column` |
| `name` | `column` |
| `packSize` | `column` |
| `passwordHash` | `column` |
| `payloadJson` | `column` |
| `pharmacyTenantId` | `column` |
| `phone` | `column` |
| `productId` | `column` |
| `role` | `column` |
| `saleRate` | `column` |
| `scheduleType` | `column` |
| `schemeBase` | `column` |
| `schemeBonus` | `column` |
| `sourceTenantId` | `column` |
| `stockistProductId` | `column` |
| `stockistTenantId` | `column` |
| `syncedAt` | `column` |
| `targetTenantId` | `column` |
| `tenantId` | `column` |
| `userAgent` | `column` |
| `userId` | `column` |

#### `stockist_return_items`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `availabilityHint` | `column` |
| `batchId` | `column` |
| `category` | `column` |
| `connectedAt` | `column` |
| `connectionId` | `column` |
| `creditLimit` | `column` |
| `disconnectedAt` | `column` |
| `eventId` | `column` |
| `expectedMonthlyVolume` | `column` |
| `genericName` | `column` |
| `gstRate` | `column` |
| `hsnCode` | `column` |
| `id` | `column` |
| `isPublic` | `column` |
| `lineTotal` | `column` |
| `linkedPharmacyId` | `column` |
| `localProductId` | `column` |
| `manufacturer` | `column` |
| `mrp` | `column` |
| `name` | `column` |
| `packSize` | `column` |
| `paymentTermsDays` | `column` |
| `pharmacyTenantId` | `column` |
| `productId` | `column` |
| `qty` | `column` |
| `rate` | `column` |
| `rejectionReason` | `column` |
| `requestNote` | `column` |
| `requestSource` | `column` |
| `returnId` | `column` |
| `saleRate` | `column` |
| `scheduleType` | `column` |
| `schemeBase` | `column` |
| `schemeBonus` | `column` |
| `status` | `column` |
| `stockistProductId` | `column` |
| `stockistTenantId` | `column` |
| `syncedAt` | `column` |
| `tenantId` | `column` |

#### `stockist_returns`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `availabilityHint` | `column` |
| `batchId` | `column` |
| `category` | `column` |
| `connectedAt` | `column` |
| `connectionId` | `column` |
| `createdBy` | `column` |
| `creditLimit` | `column` |
| `disconnectedAt` | `column` |
| `expectedMonthlyVolume` | `column` |
| `externalReturnId` | `column` |
| `genericName` | `column` |
| `gstRate` | `column` |
| `hsnCode` | `column` |
| `id` | `column` |
| `isPublic` | `column` |
| `lineTotal` | `column` |
| `linkedPharmacyId` | `column` |
| `manufacturer` | `column` |
| `mrp` | `column` |
| `name` | `column` |
| `notes` | `column` |
| `packSize` | `column` |
| `payableBillId` | `column` |
| `paymentTermsDays` | `column` |
| `pharmacyTenantId` | `column` |
| `productId` | `column` |
| `purchaseOrderId` | `column` |
| `qty` | `column` |
| `rate` | `column` |
| `reason` | `column` |
| `rejectionReason` | `column` |
| `requestNote` | `column` |
| `requestSource` | `column` |
| `returnDate` | `column` |
| `returnId` | `column` |
| `returnNumber` | `column` |
| `saleRate` | `column` |
| `scheduleType` | `column` |
| `status` | `column` |
| `stockistConnectionId` | `column` |
| `stockistProductId` | `column` |
| `stockistTenantId` | `column` |
| `syncedAt` | `column` |
| `tenantId` | `column` |
| `totalAmount` | `column` |

#### `supplier_payments`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `accountId` | `column` |
| `amount` | `column` |
| `batchId` | `column` |
| `code` | `column` |
| `createdAt` | `column` |
| `createdBy` | `column` |
| `credit` | `column` |
| `debit` | `column` |
| `entryId` | `column` |
| `gstRate` | `column` |
| `id` | `column` |
| `lineTotal` | `column` |
| `method` | `column` |
| `name` | `column` |
| `narration` | `column` |
| `notes` | `column` |
| `orderDate` | `column` |
| `orderId` | `column` |
| `orderItemId` | `column` |
| `parentId` | `column` |
| `partnerId` | `column` |
| `partnerType` | `column` |
| `paymentDate` | `column` |
| `paymentNumber` | `column` |
| `pharmacyId` | `column` |
| `poNumber` | `column` |
| `productId` | `column` |
| `qty` | `column` |
| `rate` | `column` |
| `reason` | `column` |
| `refId` | `column` |
| `refType` | `column` |
| `referenceNo` | `column` |
| `returnDate` | `column` |
| `returnId` | `column` |
| `returnNumber` | `column` |
| `status` | `column` |
| `stockistConnectionId` | `column` |
| `supplierId` | `column` |
| `tenantId` | `column` |
| `totalAmount` | `column` |
| `txnDate` | `column` |
| `type` | `column` |

#### `suppliers`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `address` | `column` |
| `baseUnit` | `column` |
| `batchNumber` | `column` |
| `category` | `column` |
| `contactPerson` | `column` |
| `convFactor` | `column` |
| `createdAt` | `column` |
| `creditLimit` | `column` |
| `dlNumber` | `column` |
| `email` | `column` |
| `expiryDate` | `column` |
| `genericName` | `column` |
| `grnNumber` | `column` |
| `gstRate` | `column` |
| `gstin` | `column` |
| `hsnCode` | `column` |
| `id` | `column` |
| `invoiceDate` | `column` |
| `isActive` | `column` |
| `manufacturer` | `column` |
| `minStockLevel` | `column` |
| `mrp` | `column` |
| `name` | `column` |
| `openingBalance` | `column` |
| `outstanding` | `column` |
| `packSize` | `column` |
| `paymentTermsDays` | `column` |
| `pharmacyTenantId` | `column` |
| `phone` | `column` |
| `portalConnected` | `column` |
| `productId` | `column` |
| `purchaseRate` | `column` |
| `qtyOnHand` | `column` |
| `qtyReceived` | `column` |
| `receivedAt` | `column` |
| `saleRate` | `column` |
| `saleUnit` | `column` |
| `scheduleType` | `column` |
| `schemeBase` | `column` |
| `schemeBonus` | `column` |
| `sourcePurchaseId` | `column` |
| `stateCode` | `column` |
| `status` | `column` |
| `supplierId` | `column` |
| `supplierInvoiceNo` | `column` |
| `tenantId` | `column` |

#### `tenants`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `aboutText` | `column` |
| `acceptingNewConnections` | `column` |
| `address` | `column` |
| `addressJson` | `column` |
| `approvalStatus` | `column` |
| `bankAccountJson` | `column` |
| `businessName` | `column` |
| `businessType` | `column` |
| `categories` | `column` |
| `city` | `column` |
| `contactPerson` | `column` |
| `coverageStateCodes` | `column` |
| `creditLimit` | `column` |
| `dlNumber` | `column` |
| `documentsJson` | `column` |
| `email` | `column` |
| `expiresAt` | `column` |
| `gstin` | `column` |
| `id` | `column` |
| `inviteCode` | `column` |
| `isActive` | `column` |
| `isPubliclyListed` | `column` |
| `jti` | `column` |
| `lastLoginAt` | `column` |
| `logoUrl` | `column` |
| `name` | `column` |
| `notificationsJson` | `column` |
| `onboardingCompleted` | `column` |
| `onboardingStep` | `column` |
| `openingBalance` | `column` |
| `outstanding` | `column` |
| `panNumber` | `column` |
| `passwordHash` | `column` |
| `paymentTermsDays` | `column` |
| `pharmacyTenantId` | `column` |
| `phone` | `column` |
| `pinCode` | `column` |
| `portalConnected` | `column` |
| `publicSlug` | `column` |
| `revokedAt` | `column` |
| `role` | `column` |
| `stateCode` | `column` |
| `status` | `column` |
| `tenantId` | `column` |
| `tenantType` | `column` |
| `tokenHash` | `column` |
| `usedAt` | `column` |
| `userId` | `column` |
| `whatsapp` | `column` |

#### `users`
*Source: `server/src/db/schema.ts`*

| Field | Type |
|-------|------|
| `address` | `column` |
| `baseUnit` | `column` |
| `category` | `column` |
| `contactPerson` | `column` |
| `convFactor` | `column` |
| `creditLimit` | `column` |
| `dlNumber` | `column` |
| `email` | `column` |
| `expiresAt` | `column` |
| `genericName` | `column` |
| `gstRate` | `column` |
| `gstin` | `column` |
| `hsnCode` | `column` |
| `id` | `column` |
| `isActive` | `column` |
| `jti` | `column` |
| `lastLoginAt` | `column` |
| `manufacturer` | `column` |
| `minStockLevel` | `column` |
| `mrp` | `column` |
| `name` | `column` |
| `openingBalance` | `column` |
| `outstanding` | `column` |
| `packSize` | `column` |
| `passwordHash` | `column` |
| `paymentTermsDays` | `column` |
| `pharmacyTenantId` | `column` |
| `phone` | `column` |
| `portalConnected` | `column` |
| `purchaseRate` | `column` |
| `revokedAt` | `column` |
| `role` | `column` |
| `saleRate` | `column` |
| `saleUnit` | `column` |
| `scheduleType` | `column` |
| `schemeBase` | `column` |
| `schemeBonus` | `column` |
| `stateCode` | `column` |
| `status` | `column` |
| `tenantId` | `column` |
| `tokenHash` | `column` |
| `usedAt` | `column` |
| `userId` | `column` |

### E.3 API / Backend Surface

#### Express/Node REST Endpoints

**`server/src/index.ts`**

- `GET /api/health`

**`server/src/routes/audit.ts`**

- `GET /`
- `GET /:id`

**`server/src/routes/auth.ts`**

- `POST /register`
- `POST /login`
- `POST /logout`
- `GET /me`
- `POST /forgot-password`
- `POST /reset-password`

**`server/src/routes/bills.ts`**

- `GET /`
- `GET /:id`
- `PATCH /:id/status`

**`server/src/routes/communication.ts`**

- `POST /send-bill`

**`server/src/routes/customers.ts`**

- `GET /`
- `GET /:id`
- `POST /`
- `PATCH /:id`
- `DELETE /:id`

**`server/src/routes/events.ts`**

- `GET /`
- `GET /history`
- `POST /process`
- `POST /:id/apply`

**`server/src/routes/extendedAccounts.ts`**

- `POST /consumer/register`
- `POST /consumer/login`
- `GET /consumer/pharmacies`
- `GET /consumer/pharmacies/:id/products`
- `GET /consumer/orders`
- `POST /consumer/orders`
- `GET /consumer/doctors`
- `POST /consumer/consultations`
- `POST /doctor/register`
- `POST /doctor/login`
- `GET /doctor/consultations`
- `POST /mr/register`
- `POST /mr/login`
- `GET /mr/visits`
- `POST /mr/visits`

**`server/src/routes/grn.ts`**

- `GET /`
- `GET /:id`
- `POST /`

**`server/src/routes/orders.ts`**

- `POST /parse-text`
- `GET /`
- `GET /:id`
- `POST /`
- `POST /:id/finalize`
- `POST /:id/deliver`
- `POST /:id/ship`
- `POST /:id/approve`
- `POST /:id/reject`
- `POST /:id/cancel-approved`
- `POST /:id/cancel`
- `POST /:id/bill`
- `POST /:id/return`

**`server/src/routes/payableBills.ts`**

- `GET /`
- `GET /:id`

**`server/src/routes/payablePayments.ts`**

- `GET /`
- `POST /`
- `POST /:id/void`

**`server/src/routes/payments.ts`**

- `GET /check-reference`
- `GET /`
- `GET /:id`
- `POST /`
- `POST /:id/void`

**`server/src/routes/pharmacies.ts`**

- `GET /`
- `GET /:id`
- `GET /:id/orders`
- `GET /:id/bills`
- `GET /:id/outstanding-bills`
- `GET /:id/credit-info`
- `POST /`
- `PATCH /:id`
- `GET /:id/returns`
- `GET /:id/ledger`
- `POST /:id/reconcile-outstanding`

**`server/src/routes/platform.ts`**

- `POST /login`
- `GET /me`
- `GET /stats`
- `GET /tenants`
- `GET /tenants/:id`
- `PATCH /tenants/:id/approval`

**`server/src/routes/products.ts`**

- `POST /autofill`
- `GET /`
- `GET /export`
- `GET /categories`
- `GET /:id`
- `GET /:id/batches`
- `POST /from-catalog/:catalogItemId`
- `POST /`
- `PATCH /:id`
- `POST /:id/adjust-stock`

**`server/src/routes/public.ts`**

- `GET /verify-bill/:id`
- `GET /stockists`
- `GET /stockists/:slug`
- `GET /stockists/:slug/catalog`

**`server/src/routes/purchaseOrders.ts`**

- `GET /`
- `GET /:id`
- `POST /`
- `PATCH /:id`
- `POST /:id/submit`
- `POST /:id/cancel`
- `POST /:id/confirm-receipt`
- `DELETE /:id`

**`server/src/routes/purchases.ts`**

- `GET /`
- `GET /:id`
- `GET /:id/ledger`
- `POST /`
- `POST /sale-rates`
- `POST /parse`
- `POST /:id/receive`
- `PATCH /:id`

**`server/src/routes/reports.ts`**

- `GET /dashboard`
- `GET /sales`
- `GET /outstanding`
- `GET /gst`
- `GET /stock-aging`
- `GET /required-stock`
- `GET /compliance`
- `GET /profit`
- `GET /portal-orders`
- `GET /purchase-analysis`

**`server/src/routes/retailSales.ts`**

- `GET /`
- `GET /:id`
- `POST /`
- `POST /:id/void`

**`server/src/routes/returns.ts`**

- `GET /`
- `GET /:id`
- `POST /:id/process`
- `POST /:id/reject`

**`server/src/routes/settings.ts`**

- `GET /features`
- `GET /tenant`
- `PATCH /tenant`
- `PATCH /onboarding`
- `GET /public-catalog`
- `POST /public-catalog/sync`
- `PATCH /public-catalog/:productId`

**`server/src/routes/smartOrder.ts`**

- `POST /parse`
- `POST /recommend`

**`server/src/routes/stockistConnections.ts`**

- `GET /`
- `GET /search`
- `GET /by-stockist/:stockistTenantId`
- `GET /:id`
- `POST /request`
- `POST /:id/withdraw`
- `POST /:id/approve`
- `POST /:id/reject`
- `POST /:id/disconnect`
- `POST /:id/sync-catalog`
- `POST /:id/pull-catalog`
- `GET /:id/catalog`
- `PATCH /:id/catalog/:catalogItemId/map`

**`server/src/routes/stockistReturns.ts`**

- `GET /`
- `GET /:id`
- `POST /`

**`server/src/routes/supplierPayments.ts`**

- `GET /`
- `POST /`

**`server/src/routes/suppliers.ts`**

- `GET /`
- `GET /:id`
- `GET /:id/purchases`
- `POST /`
- `PATCH /:id`
- `GET /:id/ledger`

**`server/src/routes/system.ts`**

- `GET /health`

**`server/src/routes/users.ts`**

- `GET /`
- `POST /`
- `PATCH /:id`
- `POST /change-password`

### E.4 Auth, Roles, and Permissions

#### Roles referenced in code

- `admin`
- `button`
- `consumer`
- `dialog`
- `doctor`
- `menu`
- `menuitem`
- `mr`
- `super_admin`
- `user`

#### RLS policies (migrations)


### E.5 Workflows and State Machines

#### `status_values`

`active` → `approved` → `cancelled` → `confirmed` → `delivered` → `draft` → `inactive` → `paid` → `partial` → `pending` → `rejected` → `unpaid`

#### Edge-function status mutations


### E.6 Dashboards, Reports, and Formulas

**Extracted calculation lines:** 179

#### `client/src/components/dashboard/DashboardPage.tsx`

- L54: `<StatCard label="Total Outstanding" value={formatCurrency(kpis?.outstandingTotal ?? 0)} icon={<IndianRupee />}  color="red"    isLoading={isLoading} />`
- L59: `<StatCard label="Low Stock Items"  value={String(kpis?.lowStockCount ?? 0)}            icon={<Package />}        color="amber"  isLoading={isLoading} onClick={(`
- L60: `<StatCard label="Overdue Bills"    value={String(kpis?.overdueCount ?? 0)}             icon={<AlertTriangle />}  color="red"    isLoading={isLoading} onClick={(`
- L98: `<span className="text-sm font-semibold text-slate-900">{formatCurrency(o.total ?? o.totalAmount)}</span>`

#### `client/src/components/dashboard/IncomingOrdersWidget.tsx`

- L36: `<span className="text-sm font-semibold">{formatCurrency(getTotal(o))}</span>`

#### `client/src/components/dashboard/OnboardingFlow.tsx`

- L30: `const [currentStep, setCurrentStep] = useState(user?.onboardingStep ?? 0);`
- L32: `const [gstin, setGstin] = useState('');`
- L39: `const hasPharmacy = (pharmaciesData?.total ?? pharmaciesData?.data?.length ?? 0) > 0;`
- L40: `const hasProducts = (productsData?.total ?? productsData?.data?.length ?? 0) > 0;`
- L44: `if (user?.onboardingStep != null) setCurrentStep(user.onboardingStep);`
- L57: `const gstErr = validateGstin(gstin, false); // GST is optional, but if entered it must be a valid 15-char GSTIN`
- L58: `if (gstErr) { toast.error(gstErr); return; }`
- L96: `if (currentStep === 0 && dlNumber.trim() && !validateGstin(gstin, false)) {`
- L145: `<Input label="GST Number" value={gstin} onChange={e => setGstin(e.target.value)} placeholder="Optional" />`

#### `client/src/components/payment/PaymentListPage.tsx`

- L38: `const total = data?.total ?? payments.length;`
- L101: `<Pagination page={page} total={total} pageSize={pageSize} onPageChange={setPage} />`
- L135: `<Pagination page={page} total={total} pageSize={pageSize} onPageChange={setPage} />`

#### `client/src/components/payment/RecordPaymentModal.tsx`

- L45: `const pharmacyOutstanding = Number(selectedPharmacyRow?.outstanding ?? 0);`
- L46: `const { data: outstandingBills } = useOutstandingBills(selectedPharmacy);`
- L47: `const bills = outstandingBills ?? [];`
- L64: `const selectedAllocSum = useMemo(() =>`
- L65: `allocs.filter(a => a.selected).reduce((s, a) => s + (Number(a.amount) || 0), 0),`
- L147: `<label className="block text-sm font-medium text-gray-700 mb-1">Pharmacy account</label>`
- L159: `Outstanding balance: <span className="font-bold">{formatCurrency(pharmacyOutstanding)}</span>`
- L208: `<span className="ml-2">Allocated: {formatCurrency(selectedAllocSum)}</span>`
- L254: `<tr><td colSpan={4} className="px-3 py-4 text-center text-gray-400">No outstanding bills</td></tr>`

#### `client/src/components/pharmacy-panel/dashboard/PharmacyDashboardPage.tsx`

- L34: `const hasProducts = (productsData?.total ?? productsData?.data?.length ?? 0) > 0;`
- L86: `<StatCard label="Payables Outstanding" value={formatCurrency(kpis?.payablesOutstanding ?? 0)} icon={<IndianRupee />} color="red" isLoading={isLoading} onClick={`
- L87: `<StatCard label="Low Stock Items" value={String(kpis?.lowStockCount ?? 0)} icon={<Package />} color="amber" isLoading={isLoading} onClick={() => navigate('/phar`
- L133: `<p className="text-sm font-medium text-slate-700 mt-0.5">{formatCurrency(po.total)}</p>`

#### `client/src/components/pharmacy-panel/dashboard/PharmacyOnboardingFlow.tsx`

- L31: `const [currentStep, setCurrentStep] = useState(user?.onboardingStep ?? 0);`
- L33: `const [gstin, setGstin] = useState('');`
- L43: `const hasProducts = (productsData?.total ?? productsData?.data?.length ?? 0) > 0;`
- L46: `if (user?.onboardingStep != null) setCurrentStep(user.onboardingStep);`
- L59: `const gstErr = validateGstin(gstin, false); // GST optional; if entered must be a valid 15-char GSTIN`
- L60: `if (gstErr) { toast.error(gstErr); return; }`
- L98: `if (currentStep === 0 && dlNumber.trim() && !validateGstin(gstin, false)) {`
- L147: `<Input label="GST Number" value={gstin} onChange={e => setGstin(e.target.value)} placeholder="Optional" />`
- L171: `<p className="text-[11px] text-slate-500 mt-1 line-clamp-1">{stockist.gstin ?? 'GSTIN hidden'}</p>`

#### `client/src/components/pharmacy-panel/payables/PayablePaymentsPage.tsx`

- L29: `const total = data?.total ?? 0;`
- L33: `const outstanding = Number(b.outstanding ?? (Number(b.total) - Number(b.paidAmount ?? 0)));`
- L34: `return outstanding > 0;`
- L56: `const outstanding = Number(bill.outstanding ?? (Number(bill.total) - Number(bill.paidAmount ?? 0)));`
- L70: `const outstanding = Number(selectedBill.outstanding ?? (Number(selectedBill.total) - Number(selectedBill.paidAmount ?? 0)));`
- L147: `<Pagination page={page} total={total} pageSize={pageSize} onPageChange={setPage} />`
- L160: `<option value="">Select bill with outstanding balance</option>`
- L162: `const outstanding = Number(b.outstanding ?? (Number(b.total) - Number(b.paidAmount ?? 0)));`

#### `client/src/components/pharmacy-panel/reports/PharmacyComplianceReport.tsx`

- L40: `<p className="text-2xl font-bold text-gray-900 mt-1">{isLoading ? '—' : (data?.total ?? entries.length)}</p>`

#### `client/src/components/pharmacy-panel/reports/PharmacyGstReport.tsx`

- L10: `const PharmacyGstReport = () => {`
- L13: `const { data, isLoading } = useGstReport(month);`
- L15: `const outputTax = Number(data?.outputGst?.tax ?? 0);`
- L16: `const inputTax = Number(data?.inputGst?.tax ?? 0);`
- L17: `const netPayable = Number(data?.netPayable ?? outputTax - inputTax);`
- L33: `<h1 className="text-2xl font-bold text-gray-900">GST Summary</h1>`
- L34: `<p className="text-sm text-gray-500">Output vs input GST for retail and purchases</p>`
- L45: `<p className="text-xs font-bold text-gray-400 uppercase">Output GST (Sales)</p>`
- L46: `<p className="text-2xl font-bold text-gray-900 mt-1">{isLoading ? '—' : formatCurrency(outputTax)}</p>`
- L47: `<p className="text-xs text-gray-500 mt-1">Taxable: {formatCurrency(Number(data?.outputGst?.taxable ?? 0))}</p>`
- L50: `<p className="text-xs font-bold text-gray-400 uppercase">Input GST (ITC)</p>`
- L51: `<p className="text-2xl font-bold text-green-600 mt-1">{isLoading ? '—' : formatCurrency(inputTax)}</p>`
- L52: `<p className="text-xs text-gray-500 mt-1">Taxable: {formatCurrency(Number(data?.inputGst?.taxable ?? 0))}</p>`

#### `client/src/components/pharmacy-panel/reports/PharmacyPayablesReport.tsx`

- L13: `const { data, isLoading } = useOutstandingReport(asOfDate);`
- L33: `<p className="text-sm text-gray-500">Outstanding bills to stockists</p>`
- L44: `<p className="text-xs font-bold text-gray-400 uppercase">Total Outstanding</p>`
- L45: `<p className="text-2xl font-bold text-red-600 mt-1">{isLoading ? '—' : formatCurrency(data?.totalOutstanding ?? 0)}</p>`
- L69: `<thead><tr className="border-b"><th className="text-left py-2 text-gray-400">Stockist</th><th className="text-right py-2 text-gray-400">Bills</th><th className=`
- L74: `<td className="py-2 text-right">{s.billCount}</td>`
- L75: `<td className="py-2 text-right font-medium">{formatCurrency(Number(s.outstanding ?? 0))}</td>`
- L84: `<thead><tr className="border-b"><th className="text-left py-2 text-gray-400">Bill #</th><th className="text-left py-2 text-gray-400">Stockist</th><th className=`
- L91: `<td className="py-2 text-right font-medium">{formatCurrency(Number(b.outstanding ?? 0))}</td>`

#### `client/src/components/pharmacy-panel/reports/PharmacyProfitReport.tsx`

- L17: `const summary = data?.summary ?? {};`
- L39: `<Card padding="sm"><p className="text-xs font-bold text-gray-400 uppercase">Revenue</p><p className="text-2xl font-bold mt-1">{isLoading ? '—' : formatCurrency(`
- L40: `<Card padding="sm"><p className="text-xs font-bold text-gray-400 uppercase">Cost</p><p className="text-2xl font-bold mt-1">{isLoading ? '—' : formatCurrency(sum`
- L41: `<Card padding="sm"><p className="text-xs font-bold text-gray-400 uppercase">Profit</p><p className="text-2xl font-bold text-green-600 mt-1">{isLoading ? '—' : f`
- L42: `<Card padding="sm"><p className="text-xs font-bold text-gray-400 uppercase">Margin %</p><p className="text-2xl font-bold mt-1">{isLoading ? '—' : `${summary.mar`

#### `client/src/components/pharmacy-panel/reports/PharmacySalesReport.tsx`

- L22: `const totalRevenue = data?.summary?.total ?? 0;`
- L23: `const totalOrders = data?.summary?.orders ?? 0;`
- L24: `const avgOrder = data?.summary?.avgOrderValue ?? 0;`
- L25: `const chartData = (data?.dailySales ?? []).map((d: { date?: string; total?: number }) => ({`
- L32: `const totalPages = Math.ceil((data?.ordersPagination?.total ?? totalOrders) / PAGE_SIZE);`
- L56: `<p className="text-xs font-bold text-gray-400 uppercase">Total Sales</p>`
- L57: `<p className="text-2xl font-bold text-gray-900 mt-1">{isLoading ? '—' : formatCurrency(totalRevenue)}</p>`
- L62: `<p className="text-2xl font-bold text-gray-900 mt-1">{isLoading ? '—' : totalOrders}</p>`
- L89: `<span className="font-medium">{formatCurrency(Number(p.total ?? 0))} ({p.count})</span>`
- L113: `<thead><tr className="border-b"><th className="text-left py-2 text-gray-400">Sale #</th><th className="text-left py-2 text-gray-400">Date</th><th className="tex`
- L120: `<td className="py-2 text-right font-medium">{formatCurrency(Number(o.total ?? 0))}</td>`
- L128: `<span className="text-sm text-gray-500 self-center">Page {page} of {totalPages}</span>`
- L129: `<Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>`

#### `client/src/components/platform/PlatformDashboardPage.tsx`

- L6: `const { data: stats } = useQuery({`
- L8: `queryFn: async () => (await api.get('/platform/stats')).data,`
- L15: `<StatCard label="Total Tenants" value={String(stats?.totalTenants ?? '—')} />`
- L16: `<StatCard label="Stockists" value={String(stats?.stockists ?? '—')} />`
- L17: `<StatCard label="Pharmacies" value={String(stats?.pharmacies ?? '—')} />`
- L18: `<StatCard label="Pending Approvals" value={String(stats?.pendingApprovals ?? '—')} />`

#### `client/src/components/reports/GSTReport.tsx`

- L11: `const GSTReport = () => {`
- L16: `const { data, isLoading } = useGstReport(month);`
- L20: `const isPharmacyGst = !!(data?.outputGst || data?.inputGst);`
- L22: `const outputCgst = isPharmacyGst ? 0 : (sales.cgst ?? 0);`
- L23: `const outputSgst = isPharmacyGst ? 0 : (sales.sgst ?? 0);`
- L24: `const outputIgst = isPharmacyGst ? 0 : (sales.igst ?? 0);`
- L25: `const inputCgst = isPharmacyGst ? 0 : (purchases.cgstInput ?? 0);`
- L26: `const inputSgst = isPharmacyGst ? 0 : (purchases.sgstInput ?? 0);`
- L27: `const inputIgst = isPharmacyGst ? 0 : (purchases.igstInput ?? 0);`
- L28: `const totalOutput = isPharmacyGst ? Number(data?.outputGst?.tax ?? 0) : outputCgst + outputSgst + outputIgst;`
- L29: `const totalInput = isPharmacyGst ? Number(data?.inputGst?.tax ?? 0) : inputCgst + inputSgst + inputIgst;`
- L30: `const netLiability = isPharmacyGst ? Number(data?.netPayable ?? 0) : totalOutput - totalInput;`
- L31: `const taxableOutput = isPharmacyGst ? Number(data?.outputGst?.taxable ?? 0) : (sales.taxableValue ?? 0);`
- L32: `const taxableInput = isPharmacyGst ? Number(data?.inputGst?.taxable ?? 0) : (purchases.taxableValue ?? 0);`
- L50: `<h1 className="text-2xl font-bold text-gray-900">GST Breakdown</h1>`
- L51: `<p className="text-sm text-gray-500">Monthly CGST, SGST and IGST reports for compliance</p>`
- L63: `<p className="text-xs font-bold text-gray-400 uppercase">Input Tax (ITC)</p>`
- L64: `<p className="text-2xl font-bold text-gray-900 mt-1">{isLoading ? '—' : formatCurrency(totalInput)}</p>`
- L67: `<p className="text-xs font-bold text-gray-400 uppercase">Output Tax</p>`
- L68: `<p className="text-2xl font-bold text-gray-900 mt-1">{isLoading ? '—' : formatCurrency(totalOutput)}</p>`
- L74: `{!isLoading && netLiability < 0 && <span className="text-sm font-normal text-green-500 ml-1">(credit)</span>}`
- L78: `<p className="text-xs font-bold text-gray-400 uppercase">Taxable Sales</p>`
- L79: `<p className="text-2xl font-bold text-gray-900 mt-1">{isLoading ? '—' : formatCurrency(taxableOutput)}</p>`
- L83: `<Card title={`GST Summary — ${month}`}>`
- L92: `<th className="px-4 py-3 font-semibold text-gray-500 uppercase text-right">Taxable Value</th>`
- L93: `<th className="px-4 py-3 font-semibold text-gray-500 uppercase text-right">CGST</th>`
- L94: `<th className="px-4 py-3 font-semibold text-gray-500 uppercase text-right">SGST</th>`
- L95: `<th className="px-4 py-3 font-semibold text-gray-500 uppercase text-right">IGST</th>`
- L96: `<th className="px-4 py-3 font-semibold text-gray-500 uppercase text-right">Total Tax</th>`
- L102: `<td className="px-4 py-3 text-right text-gray-700">{formatCurrency(taxableOutput)}</td>`
- *+12 more*

#### `client/src/components/reports/OutstandingReport.tsx`

- L23: `const OutstandingReport = () => {`
- L26: `const { data, isLoading } = useOutstandingReport(asOfDate);`
- L29: `const totalOutstanding = data?.totalOutstanding ?? 0;`
- L35: `? (data?.byStockist ?? []).map((s: { stockistName: string; outstanding: number }) => ({ name: s.stockistName, outstanding: s.outstanding }))`
- L72: `<h1 className="text-2xl font-bold text-gray-900">{isPharmacyPayables ? 'Payables Aging' : 'Outstanding Payments'}</h1>`
- L73: `<p className="text-sm text-gray-500">{isPharmacyPayables ? 'Accounts payable aging by stockist' : 'Track unpaid bills and aging credit balances'}</p>`
- L83: `<p className="text-xs font-bold text-gray-400 uppercase">Total Outstanding</p>`
- L84: `<p className="text-2xl font-bold text-red-600 mt-1">{isLoading ? '—' : formatCurrency(totalOutstanding)}</p>`
- L107: `formatter={(v: number) => [formatCurrency(v), 'Outstanding']} />`
- L130: `<td className="px-4 py-3 text-right font-bold text-red-600">{formatCurrency(Number(p.outstanding ?? 0))}</td>`
- L147: `<Card title="Outstanding Bills">`
- L154: `<th className="px-4 py-3 font-semibold text-gray-500 uppercase text-right">Outstanding</th>`
- L164: `<td className="px-4 py-3 text-right font-bold text-red-600">{formatCurrency(Number(b.outstanding ?? 0))}</td>`

#### `client/src/components/reports/PortalOrdersReport.tsx`

- L52: `<div className="bg-white p-4 rounded-lg border"><p className="text-xs text-slate-400">Total Portal Orders</p><p className="text-2xl font-bold">{data.summary?.to`
- L53: `<div className="bg-white p-4 rounded-lg border"><p className="text-xs text-slate-400">Approval Rate</p><p className="text-2xl font-bold">{data.summary?.approval`
- L54: `<div className="bg-white p-4 rounded-lg border"><p className="text-xs text-slate-400">Rejections</p><p className="text-2xl font-bold">{data.summary?.rejectionCo`
- L77: `<thead><tr className="border-b bg-slate-50"><th className="px-4 py-2 text-left">Order #</th><th className="px-4 py-2 text-left">Pharmacy</th><th className="px-4`
- L91: `<td className="px-4 py-2 text-right">{formatCurrency(o.total)}</td>`

#### `client/src/components/reports/ProfitReport.tsx`

- L21: `const totalRevenue = data?.totalRevenue ?? data?.summary?.revenue ?? data?.summary?.total ?? 0;`
- L22: `const totalProfit = data?.totalProfit ?? data?.summary?.profit ?? data?.grossProfit ?? 0;`
- L23: `const totalMargin = data?.profitMargin ?? data?.summary?.margin ?? (totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0);`
- L54: `<p className="text-xs font-bold text-gray-400 uppercase">Total Revenue</p>`
- L55: `<p className="text-2xl font-bold text-gray-900 mt-1">{isLoading ? '—' : formatCurrency(totalRevenue)}</p>`
- L59: `<p className="text-2xl font-bold text-green-600 mt-1">{isLoading ? '—' : formatCurrency(totalProfit)}</p>`
- L63: `<p className="text-2xl font-bold text-gray-900 mt-1">{isLoading ? '—' : `${Number(totalMargin).toFixed(1)}%`}</p>`

#### `client/src/components/reports/PurchaseAnalysisReport.tsx`

- L52: `<div className="bg-white p-4 rounded-lg border"><p className="text-xs text-slate-400">Total Purchases</p><p className="text-2xl font-bold">{data.summary?.totalP`
- L53: `<div className="bg-white p-4 rounded-lg border"><p className="text-xs text-slate-400">Total Spend</p><p className="text-2xl font-bold">{formatCurrency(data.summ`
- L54: `<div className="bg-white p-4 rounded-lg border"><p className="text-xs text-slate-400">Suppliers</p><p className="text-2xl font-bold">{data.summary?.supplierCoun`
- L77: `<thead><tr className="border-b bg-slate-50"><th className="px-4 py-2 text-left">GRN</th><th className="px-4 py-2 text-left">Supplier</th><th className="px-4 py-`
- L87: `<td className="px-4 py-2 text-right">{formatCurrency(p.total)}</td>`

#### `client/src/components/reports/ReportsHub.tsx`

- L44: `...(userRole === 'admin' ? [{ section: 'Dashboard KPIs', metric: 'Total Outstanding', value: dash.outstandingTotal }] : []),`

#### `client/src/components/reports/SalesReport.tsx`

- L25: `const totalRevenue = data?.summary?.total ?? data?.totalRevenue ?? 0;`
- L26: `const totalOrders = data?.summary?.orders ?? data?.totalOrders ?? 0;`
- L27: `const avgOrder = data?.summary?.avgOrderValue ?? (totalOrders > 0 ? totalRevenue / totalOrders : 0);`
- L28: `const chartData = (data?.dailySales ?? data?.monthlySales ?? []).map((d: { date?: string; total?: number; amount?: number }) => ({`
- L34: `const totalPages = Math.ceil((data?.ordersPagination?.total ?? totalOrders) / PAGE_SIZE);`
- L60: `<p className="text-xs font-bold text-gray-400 uppercase">Total Sales</p>`
- L61: `<p className="text-2xl font-bold text-gray-900 mt-1">{isLoading ? '—' : formatCurrency(totalRevenue)}</p>`
- L71: `<p className="text-xs font-bold text-gray-400 uppercase">Total Orders</p>`
- L72: `<p className="text-2xl font-bold text-gray-900 mt-1">{isLoading ? '—' : totalOrders}</p>`
- L146: `<td className="px-4 py-3 text-right font-semibold text-gray-900">{formatCurrency(getTotal(order as Parameters<typeof getTotal>[0]))}</td>`
- L157: `<p className="text-sm text-gray-500">Page {page} of {totalPages} ({totalOrders} orders)</p>`
- L160: `<Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>`

### E.7 Modals / Dialogs / Sheets Inventory

**Files:** 14

| File | Count | Components |
|------|-------|------------|
| `client/src/components/order/OrderDetailPage.tsx` | 0 | (inline) |
| `client/src/components/settings/ConnectionsTab.tsx` | 0 | (inline) |
| `client/src/components/settings/SettingsPage.tsx` | 0 | (inline) |
| `client/src/components/pharmacy/PharmacyDetailPage.tsx` | 0 | (inline) |
| `client/src/components/payment/PaymentDetailPage.tsx` | 0 | (inline) |
| `client/src/components/return/ReturnDetailPage.tsx` | 0 | (inline) |
| `client/src/components/common/ConfirmDialog.tsx` | 0 | ConfirmDialog |
| `client/src/components/common/BottomNav.tsx` | 0 | (inline) |
| `client/src/components/purchase/PurchaseDetailPage.tsx` | 0 | (inline) |
| `client/src/components/pharmacy-panel/customers/PharmacyCustomersPage.tsx` | 0 | (inline) |
| `client/src/components/pharmacy-panel/settings/PharmacySettingsPage.tsx` | 0 | (inline) |
| `client/src/components/pharmacy-panel/purchase-orders/PurchaseOrderDetailPage.tsx` | 0 | (inline) |
| `client/src/components/pharmacy-panel/pos/PosPage.tsx` | 0 | (inline) |
| `client/src/components/pharmacy-panel/payables/PayablePaymentsPage.tsx` | 0 | openRecordModal |

### E.8 Mock, Stub, and Incomplete Behavior

**Files flagged:** 80

| File | Tags | Sample |
|------|------|--------|
| `server/src/index.ts` | debug | L86: console.log('Database connected.'); |
| `server/src/db/migrateInline.ts` | debug | L1009: console.log('Schema ready.'); |
| `server/src/routes/users.ts` | demo | L58: // C16: own-account guards apply for both deactivation and role demotion. |
| `server/src/services/userService.ts` | debug | L199: console.log(`[DEV] Password reset token for ${email}: ${resetToken}`); |
| `client/src/components/order/OrderDetailPage.tsx` | placeholder | L352: placeholder="Reason for cancellation..." |
| `client/src/components/order/RejectPharmacyOrderModal.tsx` | placeholder | L45: placeholder="Rejection reason (required, min 3 characters)" |
| `client/src/components/order/CreateOrderPage.tsx` | placeholder | L290: placeholder={"Paracetamol -10\nAzithral 500 x 5\nPan 40 20"} |
| `client/src/components/order/ShipOrderModal.tsx` | placeholder | L48: <Input label="Carrier (optional)" value={carrier} onChange={e => setCarrier(e.target.value |
| `client/src/components/order/OrderListPage.tsx` | placeholder | L100: <input type="text" placeholder="Search..." value={search} |
| `client/src/components/order/InitiateReturnModal.tsx` | placeholder | L186: placeholder="0" |
| `client/src/components/settings/RejectConnectionModal.tsx` | placeholder | L73: placeholder="Enter custom rejection reason" |
| `client/src/components/settings/OrderDefaultsTab.tsx` | placeholder | L53: placeholder={String(DEFAULT_CREDIT_LIMIT)} |
| `client/src/components/settings/PublicProfileTab.tsx` | placeholder | L84: <Input label="Public URL slug" value={publicSlug} onChange={e => setPublicSlug(e.target.va |
| `client/src/components/settings/AddUserModal.tsx` | placeholder | L60: <Input label="Full Name" placeholder="e.g. John Doe" value={name} onChange={e => setName(e |
| `client/src/components/home/HomePage.tsx` | demo | L43: <Link to="/verify-bill/demo" className="text-blue-600 hover:underline">Verify a bill</Link |
| `client/src/components/pharmacy/AddPharmacyModal.tsx` | placeholder | L71: const inputCls = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white foc |
| `client/src/components/pharmacy/EditPharmacyModal.tsx` | placeholder | L91: const inputCls = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white foc |
| `client/src/components/pharmacy/PharmacyListPage.tsx` | placeholder | L45: placeholder="Search..." |
| `client/src/components/bill/BillListPage.tsx` | placeholder | L56: placeholder="Search..." |
| `client/src/components/bill/BillDetailPage.tsx` | placeholder | L151: placeholder="Notes (required)" |
| `client/src/components/mr/MrRegisterPage.tsx` | placeholder | L32: className="w-full border rounded-lg px-3 py-2" placeholder={f} value={form[f]} onChange={( |
| `client/src/components/mr/MrVisitsPage.tsx` | placeholder | L28: <input required placeholder="Pharmacy name" className="w-full border rounded px-3 py-2" va |
| `client/src/components/auth/RegisterPage.tsx` | placeholder | L84: const inputBase = `w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white  |
| `client/src/components/auth/LoginPage.tsx` | placeholder | L62: const inputBase = 'w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white  |
| `client/src/components/auth/ForgotPasswordPage.tsx` | placeholder | L44: const inputBase = 'w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white  |
| `client/src/components/auth/ResetPasswordPage.tsx` | placeholder | L50: const inputBase = 'w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white  |
| `client/src/components/payment/PaymentListPage.tsx` | placeholder | L49: placeholder="Search pharmacy..." |
| `client/src/components/payment/RecordPaymentModal.tsx` | placeholder | L165: <Input label="Amount Received (₹)" type="number" placeholder="0.00" value={amount} onChan |
| `client/src/components/platform/PlatformLoginPage.tsx` | placeholder | L36: <input type="email" required placeholder="Email" className="w-full px-3 py-2 border rounde |
| `client/src/components/doctor/DoctorRegisterPage.tsx` | placeholder | L33: className="w-full border rounded-lg px-3 py-2" placeholder={f} value={form[f]} onChange={( |
| `client/src/components/doctor/DoctorLoginPage.tsx` | placeholder | L31: <input type="email" required className="w-full border rounded-lg px-3 py-2" value={email}  |
| `client/src/components/return/ReturnDetailPage.tsx` | placeholder | L212: placeholder="Reason for rejection…" |
| `client/src/components/return/ReturnListPage.tsx` | placeholder | L53: placeholder="Search return # or pharmacy..." |
| `client/src/components/product/EditProductModal.tsx` | placeholder | L116: <Input placeholder="Category" required value={form.category} onChange={set('category')} / |
| `client/src/components/product/ProductListPage.tsx` | placeholder | L60: placeholder="Search..." |
| `client/src/components/product/AdjustStockModal.tsx` | placeholder | L140: placeholder="e.g. -5 or +3" |
| `client/src/components/product/AddProductModal.tsx` | placeholder | L84: <Input label="Medicine / Product Name" placeholder="Product name" required value={form.nam |
| `client/src/components/dashboard/OnboardingFlow.tsx` | placeholder | L145: <Input label="GST Number" value={gstin} onChange={e => setGstin(e.target.value)} placehol |
| `client/src/components/common/SearchBar.tsx` | placeholder | L7: placeholder?: string; |
| `client/src/components/common/Header.tsx` | placeholder | L128: placeholder="Search products… (Enter)" |
| `client/src/components/common/Input.tsx` | placeholder | L38: placeholder:text-slate-400 |
| `client/src/components/public/BillVerifyPage.tsx` | demo | L9: const isDemo = billId === 'demo'; |
| `client/src/components/supplier/AddSupplierModal.tsx` | placeholder | L49: const inputCls = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white foc |
| `client/src/components/supplier/SupplierListPage.tsx` | placeholder | L39: placeholder="Search..." |
| `client/src/components/supplier/EditSupplierModal.tsx` | placeholder | L57: const inputCls = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white foc |
| `client/src/components/supplier/RecordSupplierPaymentModal.tsx` | placeholder | L67: <Input label="Amount Paid (₹)" type="number" placeholder="0.00" value={amount} onChange={e |
| `client/src/components/purchase/SetSaleRatesModal.tsx` | placeholder | L100: placeholder="PTR" |
| `client/src/components/purchase/PurchaseListPage.tsx` | placeholder | L61: <input type="text" placeholder="Search bill / supplier..." value={search} |
| `client/src/components/purchase/UploadBillModal.tsx` | placeholder | L278: <input type="text" placeholder="Search suppliers…" className="w-full px-3 py-2 text-sm bo |
| `client/src/components/pharmacy-panel/customers/PharmacyCustomersPage.tsx` | placeholder | L68: placeholder="Search name or phone…" |
| `client/src/components/pharmacy-panel/discover/StockistPublicProfilePage.tsx` | placeholder | L128: placeholder="Search products..." |
| `client/src/components/pharmacy-panel/discover/DiscoverStockistsPage.tsx` | placeholder | L51: placeholder="Search by name, GSTIN..." |
| `client/src/components/pharmacy-panel/purchase-orders/PurchaseOrderListPage.tsx` | placeholder | L43: placeholder="Search PO#..." |
| `client/src/components/pharmacy-panel/purchase-orders/CreatePurchaseOrderPage.tsx` | placeholder | L231: placeholder="Instructions for stockist..." |
| `client/src/components/pharmacy-panel/sales/SaleDetailPage.tsx` | placeholder | L190: placeholder="Reason (e.g., entered wrong amount, customer changed mind)" |
| `client/src/components/pharmacy-panel/sales/SalesHistoryPage.tsx` | placeholder | L38: <input type="text" placeholder="Search sale#..." value={search} onChange={e => { setSearch |
| `client/src/components/pharmacy-panel/layout/PharmacyHeader.tsx` | placeholder | L110: placeholder="Search products… (Enter)" |
| `client/src/components/pharmacy-panel/stockists/ConnectStockistModal.tsx` | placeholder | L68: <input type="text" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" |
| `client/src/components/pharmacy-panel/stockists/StockistListPage.tsx` | placeholder | L60: placeholder="Search name, GSTIN..." |
| `client/src/components/pharmacy-panel/dashboard/PharmacyOnboardingFlow.tsx` | placeholder | L147: <Input label="GST Number" value={gstin} onChange={e => setGstin(e.target.value)} placehol |
| `client/src/components/pharmacy-panel/pos/PosPage.tsx` | placeholder | L215: placeholder="Search products (Enter to add exact match)..." |
| `client/src/components/pharmacy-panel/payables/PayableBillListPage.tsx` | placeholder | L41: <input type="text" placeholder="Search bill#..." value={search} onChange={e => { setSearch |
| `client/src/components/pharmacy-panel/grn/GrnListPage.tsx` | placeholder | L76: placeholder="Search GRN#..." |
| `client/src/components/pharmacy-panel/returns/InitiateStockistReturnModal.tsx` | placeholder | L267: placeholder="0" |
| `client/src/components/pharmacy-panel/smart-order/SmartOrderPage.tsx` | placeholder | L63: <textarea rows={6} className="w-full border rounded-xl p-3 font-mono text-sm" placeholder= |
| `client/src/components/consumer/ConsumerRegisterPage.tsx` | placeholder | L35: className="w-full border rounded-lg px-3 py-2" placeholder={f.charAt(0).toUpperCase() + f. |
| `client/src/components/consumer/ConsumerLoginPage.tsx` | placeholder | L35: <input type="email" required className="w-full border rounded-lg px-3 py-2" value={email}  |
| `client/src/components/requiredstock/RequiredStockPage.tsx` | placeholder | L53: <input type="text" placeholder="Search..." value={search} |
| `client/src/hooks/useProducts.ts` | placeholder | L8: placeholderData: keepPreviousData, |
| `client/src/hooks/useGrn.ts` | placeholder | L13: placeholderData: keepPreviousData, |
| `client/src/hooks/useBills.ts` | placeholder | L8: placeholderData: keepPreviousData, |
| `client/src/hooks/usePurchaseOrders.ts` | placeholder | L14: placeholderData: keepPreviousData, |
| `client/src/hooks/useRetailSales.ts` | placeholder | L15: placeholderData: keepPreviousData, |
| `client/src/hooks/usePayableBills.ts` | placeholder | L14: placeholderData: keepPreviousData, |
| `client/src/hooks/usePurchases.ts` | placeholder | L11: placeholderData: keepPreviousData, |
| `client/src/hooks/useOrders.ts` | placeholder | L9: placeholderData: keepPreviousData, |
| `client/src/hooks/usePublicStockists.ts` | placeholder | L14: placeholderData: keepPreviousData, |
| `client/src/hooks/useReturns.ts` | placeholder | L8: placeholderData: keepPreviousData, |
| `client/src/hooks/useCustomers.ts` | placeholder | L8: placeholderData: keepPreviousData, |
| `client/src/hooks/useSuppliers.ts` | placeholder | L8: placeholderData: keepPreviousData, |

### E.9 Dead Code, Orphan Routes, and Broken Links

#### Duplicate filenames


# Source: digi-swasthya-hub

## 0. GLOBAL ARCHITECTURE & CROSS-CUTTING

### 0.1 Routing & guards (`src/App.tsx`)
- `queryClient` default options: `staleTime 60000`, `gcTime 300000`, `refetchOnWindowFocus:false`.
- `initTheme()` runs at module load: reads `localStorage["theme"]` — `"dark"` adds `.dark`; `"system"` uses `matchMedia("(prefers-color-scheme: dark)")`; else removes `.dark`.
- **`UpdateBanner`** (mounted OUTSIDE router): registers `/sw.js`, listens `updatefound`/`statechange`, shows fixed top banner "A new version is available!" with "Update Now" → `postMessage({type:'SKIP_WAITING'})`; `controllerchange` → `window.location.reload()`. This is a SECOND update mechanism alongside `useVersionCheck` in `AppLayout` (duplicated logic).
- **`ProtectedRoute`**: `if loading → Spinner`; `if !user → /login`; `if role && !roles.includes(role) → /login`. No approval/onboarding redirect here (approval gating happens only in `Login`).
- **`RootRedirect`** priority: admin → stockist → pharmacy → customer → doctor → `/login`.
- **`SuspenseWrap`** = `ErrorBoundary` + `Suspense` (Spinner fallback). All non-auth pages are `lazy()`.
- Public routes: `/login`, `/register`, `/forgot-password`, `/reset-password`, `/pending-approval`, `/onboarding/stockist`, `/onboarding/pharmacy`, `/staff/login`, `/staff`, `/verify-bill/:billId`, `*` (NotFound).
- Five role layouts each render `<AppLayout>` with a per-role `navItems` + `basePath`. Only `PharmacyLayout` passes `showModeToggle purchaseNav saleNav`.

### 0.2 `AppLayout` (`components/layout/AppLayout.tsx`)
Mounts `useRealtimeNotifications()`, `useSessionTimeout()`, `useVersionCheck()`, `usePharmacyMode()`. Renders `OfflineBanner`, `ToSDialog`, update banner (from `useVersionCheck.updateAvailable` → `applyUpdate`), `TopNav`, `<Outlet context={{ pharmacyMode: mode }}>`, `BottomNav`. `activeNav` swaps purchase/sale nav for pharmacy by `mode`.

### 0.3 `TopNav` (`components/layout/TopNav.tsx`)
- Left: platform logo from `platform_settings.key='logo_url'` (`staleTime 600000`), else Pill icon; business name + user name.
- Right icons: **Chat** (`MessageSquareText`) → admin `/admin/messages`, others `${base}/chats`; unread badge = `messages(receiver_id, read=false)` + `peer_messages(receiver_id, read=false)` counts (`refetchInterval 30000`). **Bell** → `notifications` (relative "notifications") with unread count (`notifications.user_id, read=false`, `refetchInterval 30000`). **Avatar**: for pharmacy (showModeToggle) → Popover with user info + "Purchase View"/"Sale View" toggle + "View Profile"; others → click navigates to `profile`.
- `avatarUrl` from `profiles.avatar_url` by `user.id`.

### 0.4 `BottomNav`
5 fixed items per role; active match = exact path or `startsWith(fullPath + "/")`; index path matches exact base.

### 0.5 Hooks
- **`useAuth`**: `getSession()` then `onAuthStateChange`; `fetchUserData` deduped by `fetchedForUser` ref; `Promise.all([user_roles, profiles(full_name,avatar_url)])`. `SIGNED_OUT` clears state. Exposes `{user, roles, loading, profile, signOut}`.
- **`useStockistProfile/usePharmacyProfile/useCustomerProfile/useDoctorProfile`**: `select("*")` from `*_profiles` by `user_id`, `.single()`, `staleTime 300000`, `enabled:!!user`. The **profile.id** keys nearly all child queries (NOT `user.id`).
- **`useCart`** (`localStorage["digi_swasthya_cart"]` `{items, pharmacyId}`): single-pharmacy enforced — adding from a different pharmacy fires `toast.error` with "Clear Cart" action (clears + adds). `addItem` merges quantity for same `product_id`. `removeItem` clears `pharmacyId` when empty. `updateQuantity ≤0` removes. Derived: `total = Σ price×qty`, `itemCount = Σ qty`, `hasPrescriptionItems = some(requires_prescription)`. CartItem fields: `product_id, product_name, quantity, price, pharmacy_id, requires_prescription`.
- **`usePharmacyMode`** (`localStorage["pharmacy_mode"]`, default `"purchase"`): `{mode, setMode, toggleMode}`.
- **`useSessionTimeout(30min)`**: resets on `mousedown/keydown/touchstart/scroll`; on timeout `toast.warning("Session expired due to inactivity")` + `signOut()`. 5-min heartbeat updates `profiles.updated_at`.
- **`useAutoFillProduct`**: validates ≥3 chars, invokes `autofill-product-details`; toasts `"${fields_filled} fields suggested"` / "No details found".
- **`usePaginatedQuery`**: page size default 20, `range(from,to)`, `count:"exact"`, `staleTime 15000`. Exposes page/totalPages/hasMore/next/prev/goToPage. (Note: filter application — many callers pass filters but tab counts computed client-side per page.)
- **`useRealtimeNotifications`**: channel `notifications-${user.id}`, INSERT filter `user_id=eq`, invalidates `["notifications", user.id]` + toast.
- **`useVersionCheck`**: `APP_VERSION="1.0.0"` (⚠ diverges from `constants.APP_VERSION="2.0.0"`); polls `reg.update()` every 5 min; `applyUpdate` posts SKIP_WAITING + reload.
- **`useToSAcceptance`**: `localStorage["tos_accepted"]`, sets `tos_accepted_at` on accept.
- **`useOfflineDetector`**: `navigator.onLine` + online/offline events.

### 0.6 Shared components
- **`SharedProductCard`**: computes `stockQty = stock_quantity ?? quantity ?? 0`, `salePrice = sale_price ?? price ?? 0`, `isExpiringSoon = expiry < now+90d`, `isExpired = expiry < now`, `margin = round((salePrice-purchase_rate)/salePrice*100)`. Badges: Out of Stock (`stockQty≤0`), Rx (`requires_prescription`), Hidden (pharmacy + `is_visible_to_customers===false`), Narcotic (`is_narcotic`). Shows up to 3 active batches (`stock_quantity>0`) + "+N more". Customer role shows Add-to-Cart / qty steppers. Purchase rate + margin only for stockist/pharmacy/admin.
- **`SharedProductDetail`** (used by stockist & pharmacy detail; pharmacy=`pharmacy_inventory`, stockist=`products`): gallery (`product_media`/`pharmacy_inventory_media`), batches (stockist only, `product_batches` asc), **6-month sales chart** built from `order_items⋈orders` (stockist) or `customer_order_items⋈customer_orders` matched by `product_name` (pharmacy), excluding cancelled. Stock value = `Σ activeBatch.stock_quantity × purchase_rate`. Actions: Clone (stockist, name+" (Copy)"), Edit, Delete (`confirm`), Add-to-Cart (customer), visibility toggle (pharmacy → `is_visible_to_customers`). Expiry display logic: 0 batches→product.expiry; 1 batch→that batch; >1→"N/A (see Batch History)". Embeds `BatchManager` (stockist).
- **`BatchManager`**: inserts `product_batches` (batch_number/mrp/sale_price/purchase_rate/stock_quantity/expiry_date), then re-aggregates product `stock_quantity=Σ batch stocks`, `in_stock=total>0`, but sets headline `sale_price/price/mrp/batch_number/expiry_date` from the **latest** batch (`created_at desc`) → LIFO headline price, not FIFO. "Quick Add" prefills from most-recent batch (qty blank). Validation: needs batch_number OR stock_quantity.
- **`StockAlerts`** (stockist/pharmacy): lists items with `min_stock_level>0 && qty≤min`. "Send Alert Notification" inserts a `notifications` row to the CURRENT user (self-notify).
- **`ReorderSuggestions`** (pharmacy): low-stock list; "Quick Reorder" → `/pharmacy/orders/quick`; "Auto-Reorder" copies `${name} x ${deficit}` (deficit = `max(1, min−qty)`, min defaults 10) to clipboard then navigates.
- **`QuickActions`/`KpiCard`/`MenuPage`/`EmptyState`/`PaginationControls`/`BackButton`/`OfflineBanner`/`ToSDialog`/`ProductGalleryUploader`/`ProductImageGallery`/`DoctorReviews`** — presentational; `MenuPage` footer hardcodes "Digi Swasthya v1.0.0".

### 0.7 Constants (`lib/constants.ts`, `lib/pharma-brands.ts`)
- `ORDER_STATUS_COLORS`, `PAYMENT_STATUS_COLORS`, `ORDER_STATUS_LABELS` maps.
- `getGreeting()`: <12 morning / <17 afternoon / else evening.
- `APP_VERSION="2.0.0"`.
- `PHARMA_BRANDS` (~100 Indian brands). `PRODUCT_CATEGORIES` (16). `GST_RATES` `["0%","5%","12%","18%","28%"]`. `DRUG_SCHEDULES` `["None","H","H1","X","G","J"]`. `DRUG_TYPES` `["Allopathy","Ayurvedic","Homeopathy","Unani"]`. `PACK_TYPES` (13). `INDIAN_STATES_CITIES` full map + `getCitiesForState`.
- `format-date.ts`: `formatDate` "dd MMM yyyy", `formatDateTime` "dd MMM yyyy, hh:mm a", `formatRelative`.
- `generate-receipt-pdf.ts`: A5 jsPDF "PAYMENT RECEIPT" (stockist→pharmacy, amount, method, ref, notes) → `receipt-<8>.pdf`.

---

## 7. ADMIN MODULE (~57 pages, `ProtectedRoute role="admin"`)

Nav: Dashboard/Pharmacies/Stockists/Orders/More.

### 7.1 Dashboard (`AdminDashboard.tsx`)
One `["adminStats"]` (~16 parallel; only last 6mo for revenue/growth). **13 clickable KPIs** (Pharmacies, Stockists, B2B Orders, B2C Orders, Pending Approvals, Total/B2B/B2C Revenue, Customers, Doctors, Active Consults, Active Alerts, Active Today[DAU]). New Registrations Today + Revenue Today vs Yesterday. Pending breakdown (stockists/pharmacies/doctors). Real recharts: 6-mo revenue BarChart, B2C order-status PieChart, Top Revenue Pharmacies, Platform Growth. **System Health card hardcoded "Operational"** (pulsing dot). Recent Admin Actions from `admin_audit_log` (limit5). Note: `totalRevenue = b2bRevenue + b2cRevenue` where b2bRevenue is just last-6mo orders sum (labeled "B2B Revenue" though it's all orders).

### 7.2 Approvals & users
- **AdminStockists/AdminPharmacies/AdminDoctors**: set `approval_status` **directly** (approved/rejected). **Bulk approve/reject** = client-side loop over selected ids (no batch RPC). Select-all-pending. Pending badge.
- **AdminUsers** (`users`): aggregates 4 profile tables into rows; tabs all/stockist/pharmacy/doctor/customer. **Suspend/Restore** toggles `approval_status` between suspended/approved (customers exempt — "Customers cannot be suspended") + notification. No true ban/delete.
- **AdminImpersonate** (`impersonate`): **view-only** ("View as User"). Search `profiles`; fetch roles + all role profiles; display read-only card; logs `admin_audit_log` action `impersonate_view`.
- **AdminForceReset** (`force-reset`): just `resetPasswordForEmail` (by typed email or searched user) + logs `force_password_reset`.
- **AdminMergeAccounts** (`merge-accounts`): looks up 2 users by email; merge **re-points only `notifications` + `login_activity`** from secondary→primary; logs `merge_accounts`. Does NOT migrate orders; secondary not deleted.

### 7.3 Communications, safety, oversight
- **AdminNotifications** (`notifications`): **Broadcast** (target all/stockist/pharmacy/customer/doctor → collect user_ids from role tables, dedupe, insert `notifications type:"broadcast"` in batches of 100); **Targeted** — look up `profiles` by email → `rpc("admin_send_targeted_notification",{p_user_id,p_title,p_message})`. Mark-all-read.
- **AdminCounterfeit** (`counterfeit`): CRUD `counterfeit_alerts` (types counterfeit/banned/spurious/nsq/recalled); add → fuzzy `ilike` match products (by name) + pharmacy_inventory → notify affected stockists/pharmacies (`type:"alert"`, dedup by user); toggle active.
- **AdminOrderDetail** (`orders/:id`): admin status override via `rpc("admin_override_order_status",{p_order_id,p_new_status})` (only when not delivered/cancelled).
- **AdminCustomerOrderDetail** (`customer-orders/:id`): override via `rpc("admin_override_customer_order_status")` + logs `admin_audit_log` (from→to).
- **AdminRefunds** (`refunds`): lists cancelled `customer_orders`; state machine on `refund_status` pending→approved→processed / rejected (approve only when payment_status="paid"). Summary Pending/Approved/Total Refundable(=Σ paid cancelled totals).
- **AdminReturns**/**AdminCommissions**: read-only.
- **AdminMaintenanceMode** (`maintenance`): writes `platform_settings` keys `maintenance_mode`/`maintenance_message` (upsert). **Flag stored but not observed to gate the app.**
- **AdminToSManagement** (`tos-management`): `platform_settings` ToS content.

### 7.4 Config CRUD & analytics
- `AdminDrugSchedules`, `AdminProductCategories`, `AdminSpecializations`, `AdminPharmacyCategories`, `AdminServiceableAreas` (+ `is_active`), `AdminSubscriptions` (`subscription_plans`), `AdminBanners` (`platform_banners` — **image is a URL field, no upload**).
- `AdminAnalytics`, `AdminGeoDistribution`, `AdminApiMonitoring` (health string hardcoded), `AdminRevenueDetail`, `AdminPlatformInvoice`, `AdminSystemReport`, `AdminActiveUsers`, `AdminLoginHistory`, `AdminActivityLog`, `AdminAuditTrail`, `AdminLicenseExpiry`, `AdminReviewsManagement`, `AdminPayments`, `AdminBills`, `AdminConsultations`/Detail, `AdminDeliveryStaff`, `AdminMessages`(+`/:userId`→ChatPage), `AdminProfileSettings`, `AdminSettings`, `AdminHelpCenter`, `AdminExportData`, `AdminCustomers`/Detail, `AdminStockistDetail`/`AdminPharmacyDetail`/`AdminDoctorDetail`.

### 7.5 Flowboard — AdminSystemArchitecture (`system-architecture`)
16 tabs: overview, roles, modules, journeys, content, flow, screens, database, routes, logic, infra, dependencies, graph, validator, **ai**, export. Data from **`flowboard-data`** edge fn via 7 typed queries (sections/nodes/screens/database/routes/business-logic/infrastructure). Header: search (`/` focus), bookmarks (`localStorage["flowboard-bookmarks"]`, `b` toggle). Stats bar counts. Cross-navigation between content↔flow↔screens with temporary highlight. **ArchitectureAIView**: `buildFullArchitectureContext` serializes EVERYTHING (modules+nodes+tables+columns+FKs+RLS, RPCs, state machines, workflows, edge fns, storage, routes, screens, triggers, realtime) into markdown, then `architecture-ai` fn; renders replies via `react-markdown`; 12 suggested questions. **ExportView** exports the model.

---

## 10. AI & EDGE FUNCTIONS (`supabase/functions/*`, all `verify_jwt=false` in config.toml)

| Function | Model | Auth check in code | Contract |
|---|---|---|---|
| **parse-order-text** | `google/gemini-3-flash-preview` | Requires `Bearer` (401 else) | Body `{text, products:[{id,name}]}`. Tool `extract_order_items` → `{items:[{name,quantity,productId}]}`. 429/402 handled. |
| **parse-purchase-bill** | `google/gemini-3-flash-preview` (vision) | **No header check** | Body `{file_base64,file_type,file_name}`. Image → image_url; else base64 substring(0,50000) into prompt. Returns `{products:[…]}` (name/brand/category(enum)/mrp/sale_price/quantity/batch_number/expiry_date/composition/pack_size). Parse error → HTTP 200 `{error, raw}`. |
| **autofill-product-details** | `google/gemini-3-flash-preview` | Requires `Bearer` | Body `{product_name}` (min 3, 400 else). Tool `return_product_details` → brand/manufacturer/composition/drug_type(enum)/pack_type(enum)/category(enum)/drug_schedule(enum)/requires_prescription/pack_size/hsn_code/confidence/fields_filled. |
| **chat-bot** | `google/gemini-3-flash-preview` | Requires `Bearer`; **service-role** client | Body `{message, conversation_id}`. Fuzzy-match `quick_questions` (≥2 word overlap >3 chars OR prefix slice25) → canned answer; else general prompt (<100 words). Flags `is_forwarded` if reply mentions "forward"/"admin team". 429 → busy message. |
| **architecture-ai** | `google/gemini-2.5-flash` | None | Body `{messages, architectureContext}`. System prompt embeds context; `max_tokens 4096`. 429 → busy. |
| **flowboard-data** | — (static) | None | `?type=` returns sections/nodes/screens/database/routes/business-logic/infrastructure (v5.0.0 static dataset: 8 sections, per-node inputs/outputs/preconditions/postconditions/internalLogic/validations/failureCases/dev-designer-qa notes/tables/edgeFunctions/priority/complexity/status/children). |
| **seed-admin** | — | Service role | Idempotently creates admin auth user + `user_roles` admin. |
| **seed-production-data** | — | Service role | 17-phase Jaipur/Rajasthan demo seeder (pw `12345678`). |

All AI via `https://ai.gateway.lovable.dev/v1/chat/completions` with `LOVABLE_API_KEY`.

---

## 12. DATA MODEL (from `integrations/supabase/types.ts`, project `ggliujfrabwtodwtjnul`)
~70 tables + 15 RPCs. Groups: identity/roles (profiles, user_roles, *_profiles, login_activity, login_attempts); catalog/inventory (products, product_batches, product_media, product_categories, pharmacy_inventory, pharmacy_inventory_media, pharmacy_categories, drug_schedules); B2B (orders, order_items, order_returns, order_status_history, delivery_staff, delivery_settings, delivery_route_templates, stockist_holidays, serviceable_areas, admin_serviceable_areas); B2C (customer_orders, customer_order_items, customer_returns, customer_return_items, customer_reviews, customer_wishlist, customer_addresses); finance (payments, payment_reminders, bills, bill_orders, credit_notes, subscription_plans); connections (stockist_pharmacy_circle, pharmacy_serviceable_areas, pharmacy_delivery_staff, pharmacy_consultation_settings); healthcare (consultations, prescriptions, prescription_items, prescription_templates, doctor_availability, doctor_specializations, doctor_pharmacy_partnerships, doctor_commission_rules, doctor_commission_earnings); compliance (counterfeit_alerts, reviews); governance/comms (admin_audit_log, notifications, messages, peer_messages, conversations, chat_messages, quick_questions, platform_settings, platform_banners).
- **RPCs**: has_role, check_login_rate_limit, record_login_attempt, verify_staff_credentials, hash_password, decrement_stock, deduct_product_stock, restore_product_stock, deduct_pharmacy_inventory, restore_pharmacy_inventory, update_circle_outstanding, admin_override_order_status, admin_override_customer_order_status, admin_send_targeted_notification, get_flowboard_schema.
- **Enums**: `app_role` admin/stockist/pharmacy/customer/doctor; `approval_status` pending/approved/rejected.
- Tables referenced via `as any` NOT in generated types: `pharmacy_stock_audits`, `recurring_orders`, `manufacturer_returns`, `price_history` (dead — no writer).

---

## 16. ADMIN MODULE — PER-PAGE DETAIL (previously only name-listed; now source-verified)

### 16.1 Entity detail pages (approval workbenches)
- **AdminStockistDetail** (`stockists/:id`, 245 lines): loads profile + last orders (`orders ⋈ pharmacy_profiles`) + circle rows (`stockist_pharmacy_circle ⋈ pharmacy_profiles`) + last 100 products. **Approve/Reject buttons** update `stockist_profiles.approval_status` directly; reject requires a typed `rejection_reason`; either action notifies the stockist. **Per-document status setter**: updates arbitrary `[field]: status` on the profile (doc-level approve/reject). Documents render in an **inline `<iframe>` viewer** (h-80). Tabs/sections: profile info, documents, connected pharmacies (circle with outstanding), products list, orders (click → `/admin/orders/:id`). Footer "Message" button → `/admin/messages/{user_id}`.
- **AdminPharmacyDetail** (`pharmacies/:id`, 265 lines): identical pattern — profile, iframe documents with per-doc status, circle (stockists side), last-100 `pharmacy_inventory`, orders, approve/reject + reason + notify, message button.
- **AdminDoctorDetail** (`doctors/:id`, 175 lines): doctor profile + consultation fees card + Account Status card (approve/reject w/ reason + notify) + Documents (medical certificate, ID proof; iframe) + consultations list.
- **AdminCustomerDetail** (`customers/:id`, 172 lines): customer profile + Orders (click→customer-order detail) + Consultations + Prescriptions lists + Message button. **AdminCustomers**: card list of all `customer_profiles`, newest first.
- **AdminConsultationDetail** (`consultations/:id`, 142 lines): patient + doctor cards, prescription list, and an **"Admin Override Status"** card that updates `consultations.status` directly (plain `.update()`, not an RPC).

### 16.2 Oversight & finance pages
- **AdminOrders** (`orders`): two tabs — B2B (`orders` all) and B2C (`customer_orders` all), cards navigate to respective detail pages.
- **AdminCustomerOrders**: flat list of all `customer_orders` → detail.
- **AdminPayments** (167 lines): B2B `payments` list + a second query of `customer_orders` treated as B2C payment records (click → customer-order detail).
- **AdminBills**: all `bills` read-only list.
- **AdminDeliveryStaff**: merges `delivery_staff` (⋈ stockist business name) + `pharmacy_delivery_staff` (⋈ pharmacy name) into one read-only roster with active badges.
- **AdminReviewsManagement**: reads `customer_reviews` with 5-star renderer; **read-only** (no delete/moderation action).
- **AdminLicenseExpiry**: stockist + pharmacy profiles with non-null `drug_license_expiry`; per-row "Send Notification" inserts a `notifications` row to the licensee (toast "Notification sent to {name}"). NOTE: selects `drug_license_number` which is not in generated types.
- **AdminConsultations**: flat list. **AdminReturns/AdminCommissions**: read-only (as previously noted).

### 16.3 Analytics & reporting pages
- **AdminAnalytics** (216 lines): one `["adminAnalytics"]` query across 7 tables (orders, payments, all 4 profile tables, customer_orders); KPI grid with a **drill-down panel** (clicking a stat opens a card listing the underlying rows for that `drilldown.type`).
- **AdminRevenueDetail**: period selector; delivered B2B revenue (⋈ pharmacy+stockist names), delivered B2C revenue (⋈ pharmacy+customer names), commission totals; "Revenue Trend (B2B + B2C)" chart + "Top Pharmacies by B2C Revenue".
- **AdminPlatformInvoice**: month picker (12 back); pulls delivered B2B + B2C totals, confirmed payments, and `platform_settings.platform_commission_pct` + `gst_rate_medicines` → computes a hypothetical platform commission invoice for that month. **Display-only; nothing is billed or persisted.**
- **AdminSystemReport**: whole-platform counts (4 profile tables head-counts, orders/customer_orders/payments/bills/consultations sums, product count, return count) + "Download" (client file, toast "Report downloaded").
- **AdminActiveUsers**: recent `login_activity` → dedup user_ids → join `profiles` + `user_roles` → active-user list (uses zero-UUID sentinel to avoid empty `.in()`).
- **AdminLoginHistory**: raw `login_attempts` (email/success/time). **AdminActivityLog**: raw `login_activity`. **AdminAuditTrail**: raw `admin_audit_log` list.
- **AdminApiMonitoring**: 7-day counts of orders/customer_orders/notifications/login_activity + total profiles/consultations shown as "Operations (Last 7 Days)"; health indicator hardcoded (no real probes).
- **AdminGeoDistribution**: state/city tallies across the 4 profile tables → "Top Cities" + "Users by State" lists.
- **AdminExportData**: per-table export buttons; `select("*").limit(5000)` → XLSX; toasts success/`No data to export`.

### 16.4 Configuration CRUD (exact behavior)
All follow the same pattern: list query, inline create form, toggle `is_active` where applicable, hard delete, `qc.invalidateQueries`.
- **AdminSubscriptions**: create needs name + monthly price (yearly optional, features text); toggle/delete. No consumer.
- **AdminBanners**: title required; message, banner_type, `target_roles[]`; toggle/delete. No renderer in any layout. (Earlier note about an image URL field applies to the prior iteration; the current table has no image column.)
- **AdminServiceableAreas**: `admin_serviceable_areas` pin/city/state; unique-PIN violation surfaces as toast error; toggling `is_active` immediately affects stockist-registration PIN gate.
- **AdminSpecializations / AdminDrugSchedules / AdminProductCategories / AdminPharmacyCategories**: name(+description/restrictions) create + delete; **not consumed by product/registration forms** (those use hardcoded constants), so these are admin-side reference data only.
- **AdminSettings** (192 lines) — the platform config hub: platform **logo upload** to `platform` bucket (upsert, public URL, key `logo_url` → consumed by TopNav); generic `saveSetting(key,value)` upsert into `platform_settings`; **platform commission %** (`platform_commission_pct`, numeric-validated); **GST rate per category** (`gst_rate_{category}`; note Checkout still hardcodes 5% — these settings are only read by AdminPlatformInvoice); **payment-method toggles** ("Payment methods saved"); **quick_questions CRUD** (question+answer+category; feeds chat-bot and ChatPage chips).

### 16.5 Admin misc
- **AdminMessages**: conversation list from `conversations` ⋈ `profiles` + last `chat_messages`; click → `/admin/messages/:userId` (ChatPage in admin mode — admin replies write `sender_type:"admin"`).
- **AdminProfileSettings / AdminMore / AdminHelpCenter**: standard profile form, MenuPage grid of all admin routes, static help.

---

## EXPANSION — Code-Derived Additions (Audit Pass)

*Audit date: 2026-07-04. Content derived exclusively from source under `digi-swasthya-hub/`. Documents implemented behavior only.*

### E.1 Complete Route Table

**Frontend routes extracted:** 217 | **Server API routes:** 0

| # | Path | Component | Role/Gate | Source |
|---|------|-----------|-----------|--------|
| 1 | `/` | RootRedirect | — | `src/App.tsx` |
| 2 | `/login` | Login | — | `src/App.tsx` |
| 3 | `/register` | Register | — | `src/App.tsx` |
| 4 | `/forgot-password` | ForgotPassword | — | `src/App.tsx` |
| 5 | `/reset-password` | ResetPassword | — | `src/App.tsx` |
| 6 | `/pending-approval` | PendingApproval | — | `src/App.tsx` |
| 7 | `/onboarding/stockist` | StockistOnboarding | — | `src/App.tsx` |
| 8 | `/onboarding/pharmacy` | PharmacyOnboarding | — | `src/App.tsx` |
| 9 | `/staff/login` | StaffLogin | — | `src/App.tsx` |
| 10 | `/staff` | StaffDashboard | — | `src/App.tsx` |
| 11 | `/stockist` | ProtectedRoute | stockist | `src/App.tsx` |
| 12 | `/products` | StockistProducts | — | `src/App.tsx` |
| 13 | `/products/add` | StockistAddProduct | — | `src/App.tsx` |
| 14 | `/products/:id` | StockistProductDetail | — | `src/App.tsx` |
| 15 | `/products/:id/edit` | StockistEditProduct | — | `src/App.tsx` |
| 16 | `/orders` | StockistOrders | — | `src/App.tsx` |
| 17 | `/orders/create` | StockistCreateOrder | — | `src/App.tsx` |
| 18 | `/orders/:id` | StockistOrderDetail | — | `src/App.tsx` |
| 19 | `/pharmacies` | StockistPharmacies | — | `src/App.tsx` |
| 20 | `/pharmacies/find` | StockistFindPharmacy | — | `src/App.tsx` |
| 21 | `/pharmacies/:id` | StockistPharmacyDetail | — | `src/App.tsx` |
| 22 | `/more` | StockistMore | — | `src/App.tsx` |
| 23 | `/payments` | StockistPayments | — | `src/App.tsx` |
| 24 | `/analytics` | StockistAnalytics | — | `src/App.tsx` |
| 25 | `/profile` | StockistProfileSettings | — | `src/App.tsx` |
| 26 | `/business` | StockistBusinessDetails | — | `src/App.tsx` |
| 27 | `/export` | StockistExportData | — | `src/App.tsx` |
| 28 | `/reports` | StockistReports | — | `src/App.tsx` |
| 29 | `/settings` | StockistSettings | — | `src/App.tsx` |
| 30 | `/help` | StockistHelpCenter | — | `src/App.tsx` |
| 31 | `/notifications` | StockistNotifications | — | `src/App.tsx` |
| 32 | `/privacy-security` | StockistPrivacySecurity | — | `src/App.tsx` |
| 33 | `/returns` | StockistReturns | — | `src/App.tsx` |
| 34 | `/expiry-management` | StockistExpiryManagement | — | `src/App.tsx` |
| 35 | `/serviceable-areas` | StockistServiceableAreas | — | `src/App.tsx` |
| 36 | `/staff/add` | StockistStaffForm | — | `src/App.tsx` |
| 37 | `/staff/:id/edit` | StockistStaffForm | — | `src/App.tsx` |
| 38 | `/delivery-routes` | StockistDeliveryRoutes | — | `src/App.tsx` |
| 39 | `/holidays` | StockistHolidays | — | `src/App.tsx` |
| 40 | `/chats` | ChatListPage | — | `src/App.tsx` |
| 41 | `/chat/:peerId` | PeerChatPage | — | `src/App.tsx` |
| 42 | `/messages` | ChatPage | — | `src/App.tsx` |
| 43 | `/credit-notes` | StockistCreditNotes | — | `src/App.tsx` |
| 44 | `/export-catalogue` | StockistExportCatalogue | — | `src/App.tsx` |
| 45 | `/pharmacies/:id/ledger` | StockistPharmacyLedger | — | `src/App.tsx` |
| 46 | `/bill-history` | StockistPurchaseBillHistory | — | `src/App.tsx` |
| 47 | `/batch-management` | StockistBatchManagement | — | `src/App.tsx` |
| 48 | `/record-payment` | StockistRecordPayment | — | `src/App.tsx` |
| 49 | `/products/:id/price-history` | StockistPriceHistory | — | `src/App.tsx` |
| 50 | `/manufacturer-returns` | StockistManufacturerReturns | — | `src/App.tsx` |
| 51 | `/bulk-bill` | StockistBulkBill | — | `src/App.tsx` |
| 52 | `/expiry-calendar` | StockistBatchExpiryCalendar | — | `src/App.tsx` |
| 53 | `/stock-transfer` | StockistStockTransfer | — | `src/App.tsx` |
| 54 | `/pharmacy` | ProtectedRoute | pharmacy | `src/App.tsx` |
| 55 | `/orders/quick` | PharmacyQuickOrder | — | `src/App.tsx` |
| 56 | `/stockists` | PharmacyStockists | — | `src/App.tsx` |
| 57 | `/stockists/find` | PharmacyFindStockist | — | `src/App.tsx` |
| 58 | `/stockists/:id` | PharmacyStockistDetail | — | `src/App.tsx` |
| 59 | `/browse` | PharmacyBrowse | — | `src/App.tsx` |
| 60 | `/inventory` | PharmacyInventory | — | `src/App.tsx` |
| 61 | `/inventory/add` | PharmacyInventoryForm | — | `src/App.tsx` |
| 62 | `/inventory/:id` | PharmacyInventoryDetail | — | `src/App.tsx` |
| 63 | `/inventory/:id/edit` | PharmacyInventoryForm | — | `src/App.tsx` |
| 64 | `/customer-orders` | PharmacyCustomerOrders | — | `src/App.tsx` |
| 65 | `/customer-orders/:id` | PharmacyCustomerOrderDetail | — | `src/App.tsx` |
| 66 | `/staff-management` | PharmacyStaffManagement | — | `src/App.tsx` |
| 67 | `/staff-management/add` | PharmacyStaffForm | — | `src/App.tsx` |
| 68 | `/staff-management/:id/edit` | PharmacyStaffForm | — | `src/App.tsx` |
| 69 | `/consultations` | PharmacyConsultations | — | `src/App.tsx` |
| 70 | `/doctors` | PharmacyDoctors | — | `src/App.tsx` |
| 71 | `/doctors/:id` | PharmacyDoctorPartnershipDetail | — | `src/App.tsx` |
| 72 | `/commissions` | PharmacyCommissions | — | `src/App.tsx` |
| 73 | `/customer-list` | PharmacyCustomerList | — | `src/App.tsx` |
| 74 | `/customer-list/:id` | PharmacyCustomerDetail | — | `src/App.tsx` |
| 75 | `/b2c-bills` | PharmacyB2CBillHistory | — | `src/App.tsx` |
| 76 | `/quick-order-history` | PharmacyQuickOrderHistory | — | `src/App.tsx` |
| 77 | `/reorder-history` | PharmacyReorderHistory | — | `src/App.tsx` |
| 78 | `/inventory-audit` | PharmacyInventoryAuditLog | — | `src/App.tsx` |
| 79 | `/stock-audit` | PharmacyStockAudit | — | `src/App.tsx` |
| 80 | `/bulk-import` | PharmacyBulkImport | — | `src/App.tsx` |
| 81 | `/recurring-orders` | PharmacyRecurringOrders | — | `src/App.tsx` |
| 82 | `/ledger/:stockistId` | PharmacyLedger | — | `src/App.tsx` |
| 83 | `/customer-returns` | PharmacyCustomerReturns | — | `src/App.tsx` |
| 84 | `/customer` | ProtectedRoute | customer | `src/App.tsx` |
| 85 | `/orders/:orderId/return` | CustomerReturnRequest | — | `src/App.tsx` |
| 86 | `/orders/:id/track` | CustomerOrderTracking | — | `src/App.tsx` |
| 87 | `/orders/:id/review` | CustomerReviewOrder | — | `src/App.tsx` |
| 88 | `/cart` | CustomerCart | — | `src/App.tsx` |
| 89 | `/checkout` | CustomerCheckout | — | `src/App.tsx` |
| 90 | `/prescriptions` | CustomerPrescriptions | — | `src/App.tsx` |
| 91 | `/prescriptions/:id` | CustomerPrescriptionDetail | — | `src/App.tsx` |
| 92 | `/consultations/book` | CustomerBookConsultation | — | `src/App.tsx` |
| 93 | `/consultations/:id` | CustomerConsultationDetail | — | `src/App.tsx` |
| 94 | `/addresses` | CustomerAddresses | — | `src/App.tsx` |
| 95 | `/reminders` | CustomerMedicineReminders | — | `src/App.tsx` |
| 96 | `/search` | CustomerMedicineSearch | — | `src/App.tsx` |
| 97 | `/upload-prescription` | CustomerPrescriptionUpload | — | `src/App.tsx` |
| 98 | `/health-profile` | CustomerHealthProfile | — | `src/App.tsx` |
| 99 | `/past-doctors` | CustomerPastDoctors | — | `src/App.tsx` |
| 100 | `/wishlist` | CustomerWishlist | — | `src/App.tsx` |
| 101 | `/doctor` | ProtectedRoute | doctor | `src/App.tsx` |
| 102 | `/patients` | DoctorPatients | — | `src/App.tsx` |
| 103 | `/patients/:id` | DoctorPatientDetail | — | `src/App.tsx` |
| 104 | `/prescriptions/write` | DoctorPrescriptionWriter | — | `src/App.tsx` |
| 105 | `/availability` | DoctorAvailability | — | `src/App.tsx` |
| 106 | `/earnings` | DoctorEarnings | — | `src/App.tsx` |
| 107 | `/prescription-templates` | DoctorPrescriptionTemplates | — | `src/App.tsx` |
| 108 | `/admin` | ProtectedRoute | admin | `src/App.tsx` |
| 109 | `/counterfeit` | AdminCounterfeit | — | `src/App.tsx` |
| 110 | `/messages/:userId` | ChatPage | — | `src/App.tsx` |
| 111 | `/customers` | AdminCustomers | — | `src/App.tsx` |
| 112 | `/customers/:id` | AdminCustomerDetail | — | `src/App.tsx` |
| 113 | `/login-history` | AdminLoginHistory | — | `src/App.tsx` |
| 114 | `/activity-log` | AdminActivityLog | — | `src/App.tsx` |
| 115 | `/delivery-staff` | AdminDeliveryStaff | — | `src/App.tsx` |
| 116 | `/bills` | AdminBills | — | `src/App.tsx` |
| 117 | `/users` | AdminUsers | — | `src/App.tsx` |
| 118 | `/system-architecture` | AdminSystemArchitecture | — | `src/App.tsx` |
| 119 | `/audit-trail` | AdminAuditTrail | — | `src/App.tsx` |
| 120 | `/reviews` | AdminReviewsManagement | — | `src/App.tsx` |
| 121 | `/refunds` | AdminRefunds | — | `src/App.tsx` |
| 122 | `/revenue-detail` | AdminRevenueDetail | — | `src/App.tsx` |
| 123 | `/platform-invoice` | AdminPlatformInvoice | — | `src/App.tsx` |
| 124 | `/banners` | AdminBanners | — | `src/App.tsx` |
| 125 | `/drug-schedules` | AdminDrugSchedules | — | `src/App.tsx` |
| 126 | `/product-categories` | AdminProductCategories | — | `src/App.tsx` |
| 127 | `/specializations` | AdminSpecializations | — | `src/App.tsx` |
| 128 | `/pharmacy-categories` | AdminPharmacyCategories | — | `src/App.tsx` |
| 129 | `/subscriptions` | AdminSubscriptions | — | `src/App.tsx` |
| 130 | `/impersonate` | AdminImpersonate | — | `src/App.tsx` |
| 131 | `/force-reset` | AdminForceReset | — | `src/App.tsx` |
| 132 | `/system-report` | AdminSystemReport | — | `src/App.tsx` |
| 133 | `/active-users` | AdminActiveUsers | — | `src/App.tsx` |
| 134 | `/maintenance` | AdminMaintenanceMode | — | `src/App.tsx` |
| 135 | `/tos-management` | AdminToSManagement | — | `src/App.tsx` |
| 136 | `/license-expiry` | AdminLicenseExpiry | — | `src/App.tsx` |
| 137 | `/merge-accounts` | AdminMergeAccounts | — | `src/App.tsx` |
| 138 | `/api-monitoring` | AdminApiMonitoring | — | `src/App.tsx` |
| 139 | `/geo-distribution` | AdminGeoDistribution | — | `src/App.tsx` |
| 140 | `/verify-bill/:billId` | VerifyBill | — | `src/App.tsx` |
| 141 | `/*` | NotFound | — | `src/App.tsx` |

### E.2 Entity / Table Catalog

**Tables/schemas found:** 63

#### `admin_audit_log`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `action` | `string` |
| `admin_user_id` | `string` |
| `created_at` | `string` |
| `details` | `Json | null` |
| `id` | `string` |
| `target_id` | `string | null` |
| `target_type` | `string | null` |

#### `admin_serviceable_areas`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `city` | `string | null` |
| `created_at` | `string` |
| `id` | `string` |
| `is_active` | `boolean` |
| `pin_code` | `string` |
| `state` | `string | null` |

#### `bill_orders`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `bill_id` | `string` |
| `id` | `string` |
| `order_id` | `string` |

#### `bills`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `bill_number` | `string` |
| `created_at` | `string` |
| `discount_type` | `string | null` |
| `discount_value` | `number | null` |
| `due_date` | `string | null` |
| `gst_amount` | `number | null` |
| `id` | `string` |
| `pharmacy_id` | `string` |
| `status` | `string` |
| `stockist_id` | `string` |
| `subtotal` | `number` |
| `total_amount` | `number` |

#### `chat_messages`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `content` | `string` |
| `conversation_id` | `string` |
| `created_at` | `string` |
| `id` | `string` |
| `read` | `boolean | null` |
| `sender_id` | `string | null` |
| `sender_type` | `string` |

#### `consultations`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `consultation_type` | `string` |
| `created_at` | `string` |
| `doctor_id` | `string` |
| `duration_minutes` | `number | null` |
| `fee` | `number` |
| `follow_up_date` | `string | null` |
| `follow_up_notes` | `string | null` |
| `id` | `string` |
| `meeting_link` | `string | null` |
| `notes` | `string | null` |
| `patient_id` | `string` |
| `payment_status` | `string | null` |
| `pharmacy_id` | `string | null` |
| `scheduled_at` | `string` |
| `status` | `string | null` |
| `updated_at` | `string` |

#### `conversations`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `id` | `string` |
| `updated_at` | `string` |
| `user_id` | `string` |
| `user_role` | `string` |

#### `counterfeit_alerts`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `alert_type` | `string` |
| `batch_number` | `string | null` |
| `created_at` | `string` |
| `created_by` | `string` |
| `description` | `string | null` |
| `id` | `string` |
| `is_active` | `boolean` |
| `manufacturer` | `string | null` |
| `product_name` | `string` |

#### `credit_notes`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `amount` | `number` |
| `created_at` | `string` |
| `credit_note_number` | `string` |
| `id` | `string` |
| `order_id` | `string` |
| `pharmacy_id` | `string` |
| `return_id` | `string` |
| `status` | `string` |
| `stockist_id` | `string` |

#### `customer_addresses`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `address` | `string` |
| `city` | `string | null` |
| `created_at` | `string` |
| `customer_id` | `string` |
| `id` | `string` |
| `is_default` | `boolean` |
| `label` | `string` |
| `pin_code` | `string | null` |
| `state` | `string | null` |

#### `customer_order_items`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `id` | `string` |
| `is_substitute` | `boolean | null` |
| `order_id` | `string` |
| `original_product_name` | `string | null` |
| `price` | `number | null` |
| `product_id` | `string | null` |
| `product_name` | `string` |
| `quantity` | `number | null` |
| `requires_prescription` | `boolean | null` |

#### `customer_orders`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `assigned_staff_id` | `string | null` |
| `created_at` | `string` |
| `customer_id` | `string` |
| `delivered_at` | `string | null` |
| `delivery_address` | `string | null` |
| `delivery_fee` | `number | null` |
| `delivery_pin_code` | `string | null` |
| `discount_amount` | `number | null` |
| `gst_amount` | `number | null` |
| `id` | `string` |
| `notes` | `string | null` |
| `order_number` | `string` |
| `order_type` | `string | null` |
| `partial_items` | `Json | null` |
| `payment_method` | `string | null` |
| `payment_status` | `string | null` |
| `pharmacy_id` | `string` |
| `prescription_id` | `string | null` |
| `prescription_url` | `string | null` |
| `prescription_verified` | `boolean | null` |
| `refund_status` | `string | null` |
| `status` | `string | null` |
| `total_amount` | `number | null` |
| `updated_at` | `string` |
| `upi_proof_url` | `string | null` |

#### `customer_profiles`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `address` | `string | null` |
| `allergies` | `string | null` |
| `avatar_url` | `string | null` |
| `blood_group` | `string | null` |
| `chronic_conditions` | `string | null` |
| `city` | `string | null` |
| `created_at` | `string` |
| `date_of_birth` | `string | null` |
| `email` | `string | null` |
| `emergency_contact` | `string | null` |
| `full_name` | `string` |
| `gender` | `string | null` |
| `id` | `string` |
| `phone` | `string | null` |
| `pin_code` | `string | null` |
| `state` | `string | null` |
| `updated_at` | `string` |
| `user_id` | `string` |

#### `customer_return_items`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `id` | `string` |
| `price` | `number | null` |
| `product_name` | `string` |
| `quantity` | `number` |
| `return_id` | `string` |

#### `customer_returns`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `customer_id` | `string` |
| `customer_order_id` | `string` |
| `id` | `string` |
| `pharmacy_id` | `string` |
| `reason` | `string | null` |
| `refund_amount` | `number | null` |
| `status` | `string` |

#### `customer_reviews`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `comment` | `string | null` |
| `created_at` | `string` |
| `customer_id` | `string` |
| `doctor_id` | `string | null` |
| `id` | `string` |
| `order_id` | `string | null` |
| `pharmacy_id` | `string | null` |
| `rating` | `number` |
| `reply` | `string | null` |
| `reply_at` | `string | null` |

#### `customer_wishlist`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `customer_id` | `string` |
| `id` | `string` |
| `image_url` | `string | null` |
| `inventory_id` | `string | null` |
| `pharmacy_id` | `string | null` |
| `pharmacy_name` | `string | null` |
| `price` | `number | null` |
| `product_name` | `string` |

#### `delivery_route_templates`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `id` | `string` |
| `name` | `string` |
| `notes` | `string | null` |
| `pharmacy_ids` | `string[]` |
| `stockist_id` | `string` |

#### `delivery_settings`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `delivery_charge` | `number` |
| `delivery_days` | `string[]` |
| `estimated_hours` | `number` |
| `free_delivery_above` | `number` |
| `id` | `string` |
| `pin_code` | `string` |
| `stockist_id` | `string` |

#### `delivery_staff`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `aadhar_number` | `string | null` |
| `age` | `number | null` |
| `created_at` | `string` |
| `id` | `string` |
| `is_active` | `boolean` |
| `name` | `string` |
| `password_hash` | `string` |
| `phone` | `string` |
| `photo_url` | `string | null` |
| `police_verification_id` | `string | null` |
| `stockist_id` | `string` |
| `username` | `string` |

#### `doctor_availability`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `day_of_week` | `string` |
| `doctor_id` | `string` |
| `end_time` | `string` |
| `id` | `string` |
| `is_active` | `boolean | null` |
| `start_time` | `string` |

#### `doctor_commission_earnings`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `commission_amount` | `number` |
| `created_at` | `string` |
| `customer_order_id` | `string` |
| `doctor_id` | `string` |
| `id` | `string` |
| `item_amount` | `number` |
| `item_name` | `string` |
| `partnership_id` | `string` |
| `pharmacy_id` | `string` |
| `status` | `string` |

#### `doctor_commission_rules`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `commission_pct` | `number | null` |
| `created_at` | `string` |
| `flat_amount` | `number | null` |
| `id` | `string` |
| `partnership_id` | `string` |
| `rule_type` | `string` |
| `rule_value` | `string` |

#### `doctor_pharmacy_partnerships`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `default_commission_pct` | `number` |
| `doctor_id` | `string` |
| `id` | `string` |
| `pharmacy_id` | `string` |
| `status` | `string` |

#### `doctor_profiles`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `address` | `string | null` |
| `approval_status` | `Database["public"]["Enums"]["approval_status"] | null` |
| `avatar_url` | `string | null` |
| `bio` | `string | null` |
| `city` | `string | null` |
| `consultation_fee_audio` | `number | null` |
| `consultation_fee_clinic` | `number | null` |
| `consultation_fee_video` | `number | null` |
| `created_at` | `string` |
| `email` | `string | null` |
| `experience_years` | `number | null` |
| `full_name` | `string` |
| `id` | `string` |
| `id_proof_status` | `Database["public"]["Enums"]["approval_status"] | null` |
| `id_proof_url` | `string | null` |
| `is_available` | `boolean | null` |
| `medical_certificate_status` | `| Database["public"]["Enums"]["approval_status"]` |
| `medical_certificate_url` | `string | null` |
| `phone` | `string | null` |
| `pin_code` | `string | null` |
| `qualification` | `string | null` |
| `registration_number` | `string | null` |
| `rejection_reason` | `string | null` |
| `specialization` | `string` |
| `state` | `string | null` |
| `updated_at` | `string` |
| `user_id` | `string` |

#### `doctor_specializations`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `id` | `string` |
| `name` | `string` |

#### `drug_schedules`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `description` | `string | null` |
| `id` | `string` |
| `restrictions` | `string | null` |
| `schedule_name` | `string` |

#### `login_activity`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `device_info` | `string | null` |
| `id` | `string` |
| `ip_address` | `string | null` |
| `location` | `string | null` |
| `status` | `string` |
| `user_id` | `string` |

#### `login_attempts`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `attempted_at` | `string` |
| `email` | `string` |
| `id` | `string` |
| `success` | `boolean` |

#### `messages`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `content` | `string` |
| `created_at` | `string` |
| `id` | `string` |
| `read` | `boolean | null` |
| `receiver_id` | `string` |
| `sender_id` | `string` |

#### `notifications`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `id` | `string` |
| `message` | `string | null` |
| `read` | `boolean | null` |
| `title` | `string` |
| `type` | `string | null` |
| `user_id` | `string` |

#### `order_items`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `id` | `string` |
| `order_id` | `string` |
| `price` | `number | null` |
| `product_id` | `string` |
| `quantity` | `number` |
| `requested_batch` | `string | null` |

#### `order_returns`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `id` | `string` |
| `order_id` | `string` |
| `pharmacy_id` | `string` |
| `product_id` | `string` |
| `quantity` | `number` |
| `reason` | `string | null` |
| `refund_amount` | `number | null` |
| `status` | `string` |
| `stockist_id` | `string` |

#### `order_status_history`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `changed_by` | `string | null` |
| `created_at` | `string` |
| `id` | `string` |
| `new_status` | `string` |
| `notes` | `string | null` |
| `old_status` | `string | null` |
| `order_id` | `string` |
| `order_type` | `string` |

#### `orders`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `applied_credit_note_id` | `string | null` |
| `assigned_staff_id` | `string | null` |
| `created_at` | `string` |
| `credit_discount` | `number | null` |
| `delivered_at` | `string | null` |
| `delivery_collected_amount` | `number | null` |
| `delivery_payment_method` | `string | null` |
| `delivery_payment_status` | `string | null` |
| `delivery_proof_url` | `string | null` |
| `id` | `string` |
| `items_count` | `number` |
| `notes` | `string | null` |
| `order_number` | `string` |
| `order_source` | `string` |
| `parent_order_id` | `string | null` |
| `partial_delivery_items` | `Json | null` |
| `payment_status` | `string` |
| `pharmacy_id` | `string` |
| `status` | `string | null` |
| `stockist_id` | `string` |
| `total_amount` | `number | null` |
| `updated_at` | `string` |

#### `payment_reminders`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `id` | `string` |
| `order_ids` | `string[] | null` |
| `pharmacy_id` | `string` |
| `sent_via` | `string` |
| `stockist_id` | `string` |
| `total_amount` | `number` |

#### `payments`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `amount` | `number` |
| `collected_by` | `string | null` |
| `created_at` | `string` |
| `id` | `string` |
| `notes` | `string | null` |
| `payment_method` | `string` |
| `payment_proof_url` | `string | null` |
| `pharmacy_id` | `string` |
| `reference_id` | `string | null` |
| `staff_id` | `string | null` |
| `status` | `string` |
| `stockist_id` | `string` |

#### `peer_messages`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `content` | `string` |
| `created_at` | `string` |
| `id` | `string` |
| `read` | `boolean` |
| `receiver_id` | `string` |
| `sender_id` | `string` |

#### `pharmacy_categories`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `id` | `string` |
| `name` | `string` |

#### `pharmacy_consultation_settings`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `doctor_id` | `string` |
| `id` | `string` |
| `is_active` | `boolean | null` |
| `pharmacy_id` | `string` |

#### `pharmacy_delivery_staff`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `aadhar_number` | `string | null` |
| `age` | `number | null` |
| `created_at` | `string` |
| `id` | `string` |
| `is_active` | `boolean | null` |
| `name` | `string` |
| `password_hash` | `string` |
| `pharmacy_id` | `string` |
| `phone` | `string` |
| `photo_url` | `string | null` |
| `police_verification_id` | `string | null` |
| `username` | `string` |

#### `pharmacy_inventory`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `batch_number` | `string | null` |
| `brand` | `string | null` |
| `category` | `string | null` |
| `composition` | `string | null` |
| `created_at` | `string` |
| `description` | `string | null` |
| `drug_schedule` | `string | null` |
| `drug_type` | `string | null` |
| `expiry_date` | `string | null` |
| `fssai_license` | `string | null` |
| `gst_rate` | `string | null` |
| `hsn_code` | `string | null` |
| `id` | `string` |
| `image_url` | `string | null` |
| `is_narcotic` | `boolean | null` |
| `is_visible_to_customers` | `boolean | null` |
| `manufacturer` | `string | null` |
| `min_stock_level` | `number | null` |
| `mrp` | `number | null` |
| `pack_size` | `string | null` |
| `pack_type` | `string | null` |
| `pharmacy_id` | `string` |
| `price` | `number | null` |
| `product_name` | `string` |
| `purchase_rate` | `number | null` |
| `quantity` | `number | null` |
| `requires_prescription` | `boolean | null` |
| `sale_price` | `number | null` |
| `source_product_id` | `string | null` |
| `source_stockist_id` | `string | null` |
| `unit` | `string | null` |
| `updated_at` | `string` |

#### `pharmacy_inventory_media`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `id` | `string` |
| `image_url` | `string` |
| `inventory_id` | `string` |
| `is_primary` | `boolean` |
| `sort_order` | `number` |

#### `pharmacy_profiles`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `account_holder_name` | `string | null` |
| `account_number` | `string | null` |
| `address` | `string | null` |
| `approval_status` | `Database["public"]["Enums"]["approval_status"] | null` |
| `bank_name` | `string | null` |
| `city` | `string | null` |
| `created_at` | `string` |
| `delivery_fee` | `number | null` |
| `drug_license_expiry` | `string | null` |
| `drug_license_status` | `| Database["public"]["Enums"]["approval_status"]` |
| `drug_license_url` | `string | null` |
| `email` | `string | null` |
| `free_delivery_above` | `number | null` |
| `gst_certificate_status` | `| Database["public"]["Enums"]["approval_status"]` |
| `gst_certificate_url` | `string | null` |
| `id` | `string` |
| `ifsc_code` | `string | null` |
| `license_number` | `string | null` |
| `min_order_amount` | `number | null` |
| `minimum_order_amount` | `number | null` |
| `operating_hours` | `Json | null` |
| `owner_contact` | `string | null` |
| `owner_designation` | `string | null` |
| `owner_name` | `string | null` |
| `pharmacy_certificate_status` | `| Database["public"]["Enums"]["approval_status"]` |
| `pharmacy_certificate_url` | `string | null` |
| `pharmacy_name` | `string` |
| `pharmacy_type` | `string | null` |
| `phone` | `string | null` |
| `pin_code` | `string | null` |
| `rejection_reason` | `string | null` |
| `state` | `string | null` |
| `updated_at` | `string` |
| `upi_id` | `string | null` |
| `user_id` | `string` |
| `whatsapp_number` | `string | null` |

#### `pharmacy_serviceable_areas`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `delivery_charge` | `number | null` |
| `estimated_hours` | `number | null` |
| `free_delivery_above` | `number | null` |
| `id` | `string` |
| `pharmacy_id` | `string` |
| `pin_code` | `string` |

#### `platform_banners`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `banner_type` | `string` |
| `created_at` | `string` |
| `created_by` | `string` |
| `id` | `string` |
| `is_active` | `boolean` |
| `message` | `string | null` |
| `target_roles` | `string[]` |
| `title` | `string` |

#### `platform_settings`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `id` | `string` |
| `key` | `string` |
| `updated_at` | `string` |
| `value` | `string | null` |

#### `prescription_items`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `dosage` | `string | null` |
| `duration` | `string | null` |
| `id` | `string` |
| `notes` | `string | null` |
| `prescription_id` | `string` |
| `product_id` | `string | null` |
| `product_name` | `string` |
| `quantity` | `number | null` |

#### `prescription_templates`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `doctor_id` | `string` |
| `id` | `string` |
| `items` | `Json` |
| `template_name` | `string` |

#### `prescriptions`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `consultation_id` | `string | null` |
| `created_at` | `string` |
| `doctor_id` | `string` |
| `id` | `string` |
| `notes` | `string | null` |
| `patient_id` | `string` |
| `pharmacy_id` | `string | null` |
| `status` | `string | null` |

#### `product_batches`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `batch_number` | `string | null` |
| `created_at` | `string` |
| `expiry_date` | `string | null` |
| `id` | `string` |
| `mrp` | `number | null` |
| `product_id` | `string` |
| `purchase_rate` | `number | null` |
| `sale_price` | `number | null` |
| `stock_quantity` | `number | null` |

#### `product_categories`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `description` | `string | null` |
| `id` | `string` |
| `name` | `string` |

#### `product_media`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `id` | `string` |
| `image_url` | `string` |
| `is_primary` | `boolean` |
| `product_id` | `string` |
| `sort_order` | `number` |

#### `products`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `batch_number` | `string | null` |
| `brand` | `string | null` |
| `category` | `string | null` |
| `composition` | `string | null` |
| `created_at` | `string` |
| `description` | `string | null` |
| `drug_schedule` | `string | null` |
| `drug_type` | `string | null` |
| `expiry_date` | `string | null` |
| `fssai_license` | `string | null` |
| `gst_rate` | `string | null` |
| `hsn_code` | `string | null` |
| `id` | `string` |
| `image_url` | `string | null` |
| `in_stock` | `boolean | null` |
| `is_narcotic` | `boolean | null` |
| `manufacturer` | `string | null` |
| `min_order_quantity` | `number | null` |
| `min_stock_level` | `number | null` |
| `moq` | `number | null` |
| `mrp` | `number | null` |
| `name` | `string` |
| `pack_size` | `string | null` |
| `pack_type` | `string | null` |
| `price` | `number | null` |
| `purchase_rate` | `number | null` |
| `requires_prescription` | `boolean | null` |
| `reserved_quantity` | `number | null` |
| `sale_price` | `number | null` |
| `stock_quantity` | `number | null` |
| `stockist_id` | `string` |
| `unit` | `string | null` |
| `updated_at` | `string` |

#### `profiles`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `avatar_url` | `string | null` |
| `created_at` | `string` |
| `data_download_requested_at` | `string | null` |
| `email` | `string | null` |
| `full_name` | `string | null` |
| `id` | `string` |
| `last_active_at` | `string | null` |
| `phone` | `string | null` |
| `tos_accepted_at` | `string | null` |
| `updated_at` | `string` |
| `user_id` | `string` |

#### `quick_questions`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `answer` | `string` |
| `category` | `string | null` |
| `created_at` | `string` |
| `id` | `string` |
| `question` | `string` |

#### `reviews`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `comment` | `string | null` |
| `created_at` | `string` |
| `customer_id` | `string` |
| `id` | `string` |
| `rating` | `number` |
| `target_id` | `string` |
| `target_type` | `string` |

#### `serviceable_areas`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `id` | `string` |
| `pin_code` | `string` |
| `stockist_id` | `string` |

#### `stockist_holidays`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `allow_preorder` | `boolean` |
| `created_at` | `string` |
| `end_date` | `string` |
| `id` | `string` |
| `reason` | `string | null` |
| `start_date` | `string` |
| `stockist_id` | `string` |

#### `stockist_pharmacy_circle`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `credit_balance` | `number` |
| `credit_limit` | `number` |
| `id` | `string` |
| `is_blocked` | `boolean | null` |
| `last_payment_date` | `string | null` |
| `notes` | `string | null` |
| `outstanding` | `number` |
| `payment_terms_days` | `number | null` |
| `pharmacy_id` | `string` |
| `stockist_id` | `string` |

#### `stockist_profiles`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `account_holder_name` | `string | null` |
| `account_number` | `string | null` |
| `address` | `string | null` |
| `approval_status` | `Database["public"]["Enums"]["approval_status"] | null` |
| `bank_name` | `string | null` |
| `business_name` | `string` |
| `business_type` | `string | null` |
| `city` | `string | null` |
| `created_at` | `string` |
| `drug_license_expiry` | `string | null` |
| `drug_license_status` | `| Database["public"]["Enums"]["approval_status"]` |
| `drug_license_url` | `string | null` |
| `email` | `string | null` |
| `fssai_license_status` | `| Database["public"]["Enums"]["approval_status"]` |
| `fssai_license_url` | `string | null` |
| `gst_certificate_status` | `| Database["public"]["Enums"]["approval_status"]` |
| `gst_certificate_url` | `string | null` |
| `id` | `string` |
| `ifsc_code` | `string | null` |
| `pan_number` | `string | null` |
| `phone` | `string | null` |
| `pin_code` | `string | null` |
| `rejection_reason` | `string | null` |
| `state` | `string | null` |
| `updated_at` | `string` |
| `upi_id` | `string | null` |
| `user_id` | `string` |
| `whatsapp_number` | `string | null` |
| `wholesale_license_status` | `| Database["public"]["Enums"]["approval_status"]` |
| `wholesale_license_url` | `string | null` |

#### `subscription_plans`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `description` | `string | null` |
| `features` | `Json | null` |
| `id` | `string` |
| `is_active` | `boolean` |
| `name` | `string` |
| `price_monthly` | `number` |
| `price_yearly` | `number` |
| `target_role` | `string` |

#### `user_roles`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `id` | `string` |
| `role` | `Database["public"]["Enums"]["app_role"]` |
| `user_id` | `string` |

### E.3 API / Backend Surface

#### Supabase Edge Functions

| Function | Lines | CORS | Auth Pattern | Notes |
|----------|-------|------|--------------|-------|
| `architecture-ai` | 82 | yes | service-role/user | — |
| `autofill-product-details` | 112 | yes | service-role/user | — |
| `chat-bot` | 114 | yes | service-role/user | — |
| `flowboard-data` | 875 | yes | public | — |
| `parse-order-text` | 118 | yes | service-role/user | — |
| `parse-purchase-bill` | 95 | yes | service-role/user | — |
| `seed-admin` | 73 | yes | public | — |
| `seed-production-data` | 690 | yes | public | — |

### E.4 Auth, Roles, and Permissions

#### Roles referenced in code

- `Admin`
- `Customer`
- `Doctor`
- `Pharmacy`
- `Stockist`
- `admin`
- `alert`
- `assistant`
- `auth`
- `customer`
- `doctor`
- `group`
- `link`
- `navigation`
- `pharmacy`
- `presentation`
- `region`
- `separator`
- `shared`
- `staff`
- `stockist`
- `system`
- `user`

#### RLS / Policy snippets (from migrations)

- Policy `Users can view own profile` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Users can update own profile` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Admins can view all profiles` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `System can insert profiles` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Users can view own roles` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Admins can view all roles` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Admins can manage roles` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `System can insert roles` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Stockists can view own profile` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Stockists can update own profile` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Stockists can insert own profile` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Admins can manage stockist profiles` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Approved stockists visible to pharmacies` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Stockists can manage own areas` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Admins can view areas` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Anyone authenticated can view areas` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Pharmacies can view own profile` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Pharmacies can update own profile` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Pharmacies can insert own profile` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Admins can manage pharmacy profiles` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Approved pharmacies visible to stockists` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Stockists can manage own products` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Authenticated users can view products` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Pharmacies can view own orders` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Stockists can view own orders` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Pharmacies can create orders` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Stockists can update order status` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Admins can view all orders` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Users can view own order items` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Pharmacies can insert order items` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Admins can view all order items` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Pharmacies can manage own inventory` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Admins can view inventory` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Users can view own notifications` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Users can update own notifications` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `System can insert notifications` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Users can view own messages` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Users can send messages` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Admins can view all messages` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Anyone can read platform settings` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Admins can manage platform settings` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Users can upload own documents` on `storage` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Users can view own documents` on `storage` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Admins can view all documents` on `storage` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Users can upload own avatar` on `storage` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Users can update own avatar` on `storage` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Avatars publicly accessible` on `storage` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Admins can manage platform assets` on `storage` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Platform assets publicly accessible` on `storage` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Users can insert own profile` on `public` *(migration `20260223132642_a17c8b1a-f24a-40e3-92f2-068b6d4e2fe9.sql`)*
- Policy `Admins can insert notifications` on `public` *(migration `20260223132642_a17c8b1a-f24a-40e3-92f2-068b6d4e2fe9.sql`)*
- Policy `Stockists can manage own product batches` on `public` *(migration `20260223164931_9c7eaf13-0ac7-43ca-b771-0893f39b3b41.sql`)*
- Policy `Authenticated users can view product batches` on `public` *(migration `20260223164931_9c7eaf13-0ac7-43ca-b771-0893f39b3b41.sql`)*
- Policy `Authenticated users can upload product images` on `storage` *(migration `20260223164931_9c7eaf13-0ac7-43ca-b771-0893f39b3b41.sql`)*
- Policy `Authenticated users can update product images` on `storage` *(migration `20260223164931_9c7eaf13-0ac7-43ca-b771-0893f39b3b41.sql`)*
- Policy `Product images publicly accessible` on `storage` *(migration `20260223164931_9c7eaf13-0ac7-43ca-b771-0893f39b3b41.sql`)*
- Policy `Authenticated users can delete product images` on `storage` *(migration `20260223164931_9c7eaf13-0ac7-43ca-b771-0893f39b3b41.sql`)*
- Policy `Users can view own conversations` on `public` *(migration `20260224034455_c2918a9e-332a-49fe-a510-f537bbb0503c.sql`)*
- Policy `Users can create own conversations` on `public` *(migration `20260224034455_c2918a9e-332a-49fe-a510-f537bbb0503c.sql`)*
- Policy `Users can update own conversations` on `public` *(migration `20260224034455_c2918a9e-332a-49fe-a510-f537bbb0503c.sql`)*
- *… plus 152 additional policies*

### E.5 Workflows and State Machines

#### `payment_status` values observed in code

`approved` → `claimed` → `paid` → `partial` → `pending_approval` → `rejected` → `unpaid`

#### `sender_type` values observed in code

`admin` → `bot` → `user`

#### `status` values observed in code

`active` → `approved` → `cancelled` → `completed` → `confirmed` → `delivered` → `final` → `full` → `implemented` → `none` → `paid` → `partial` → `pending` → `rejected` → `success` → `used`

#### `target_type` values observed in code

`doctor` → `pharmacy` → `product`

#### Documented transition handlers (edge functions / server)

- **`flowboard-data`**: touches statuses `implemented`, `pending`
- **`seed-production-data`**: touches statuses `active`, `approved`, `confirmed`, `final`, `success`

### E.6 Dashboards, Reports, and Formulas

**Formula/calculation lines extracted:** 114

#### `src/pages/admin/AdminAnalytics.tsx`

- L17: `const { data: stats, isLoading } = useQuery({`
- L31: `const revenue = orders.filter(o => o.status === "delivered" || o.status === "completed").reduce((s, o) => s + (o.total_amount || 0), 0);`
- L32: `const b2cRevenue = custOrders.filter((o: any) => o.status === "delivered").reduce((s: number, o: any) => s + (o.total_amount || 0), 0);`
- L33: `const totalPaid = (paymentsRes.data || []).reduce((s, p) => s + (p.amount || 0), 0);`
- L41: `monthly[m].revenue += o.total_amount || 0;`
- L46: `monthly[m].b2c += o.total_amount || 0;`
- L109: `if ((s as any).drill === "pharmacies") setDrilldown({ type: "Pharmacies", data: stats?.pharmacyList || [] });`
- L110: `else if ((s as any).drill === "stockists") setDrilldown({ type: "Stockists", data: stats?.stockistList || [] });`
- L111: `else if ((s as any).drill === "customers") setDrilldown({ type: "Customers", data: stats?.customerList || [] });`
- L112: `else if ((s as any).drill === "doctors") setDrilldown({ type: "Doctors", data: stats?.doctorList || [] });`
- L149: `<BarChart data={stats.chartData}>`
- L162: `<LineChart data={stats.chartData}><XAxis dataKey="month" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} /><Tooltip /><Line type="monotone" d`
- L174: `<Pie data={stats?.orderStatusPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label onClick={(data: any) => handlePieClick("orde`
- L175: `{(stats?.orderStatusPie || []).map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} className="cursor-pointer" />)}`
- L189: `<Pie data={stats?.paymentMethodPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label onClick={(data: any) => handlePieClick("pa`
- L190: `{(stats?.paymentMethodPie || []).map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} className="cursor-pointer" />)}`
- L203: `<BarChart data={stats?.stateData} layout="vertical">`

#### `src/pages/admin/AdminDashboard.tsx`

- L14: `const { data: stats, isLoading } = useQuery({`
- L47: `if (months[m] !== undefined) months[m] += o.total_amount || 0;`
- L54: `const revenueToday = orderData.filter((o: any) => o.created_at.startsWith(today)).reduce((s: number, o: any) => s + (o.total_amount || 0), 0);`
- L55: `const revenueYesterday = orderData.filter((o: any) => o.created_at.startsWith(yesterday)).reduce((s: number, o: any) => s + (o.total_amount || 0), 0);`
- L71: `phMap[pid].revenue += o.total_amount || 0;`
- L91: `const b2cRevenue = (topPhRes.data || []).reduce((s: number, o: any) => s + (o.total_amount || 0), 0);`
- L102: `b2bRevenue: orderData.reduce((s: number, o: any) => s + (o.total_amount || 0), 0),`
- L104: `totalRevenue: orderData.reduce((s: number, o: any) => s + (o.total_amount || 0), 0) + b2cRevenue,`
- L152: `<p className="text-2xl font-bold">{stats?.newToday ?? 0}</p>`
- L157: `<p className="text-lg font-bold">₹{(stats?.revenueToday ?? 0).toLocaleString()}</p>`
- L167: `<p className="text-lg font-bold text-warning">{stats?.pendingStockists ?? 0}</p>`
- L171: `<p className="text-lg font-bold text-warning">{stats?.pendingPharmacies ?? 0}</p>`
- L175: `<p className="text-lg font-bold text-warning">{stats?.pendingDoctors ?? 0}</p>`
- L185: `<BarChart data={stats?.chartData || []}>`
- L202: `<Pie data={stats?.orderStatusPie || []} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, value }: any) => `${name}: $`
- L203: `{(stats?.orderStatusPie || []).map((_: any, i: number) => (`
- L220: `{stats!.topRevenuePharmacies.map((ph: any, i: number) => (`
- L239: `<BarChart data={stats?.growthData || []}>`

#### `src/pages/customer/CustomerDashboard.tsx`

- L222: `<p className="text-xs font-medium mt-1">₹{o.total_amount}</p>`

#### `src/pages/doctor/DoctorAnalytics.tsx`

- L26: `const totalEarnings = paid.reduce((s, c) => s + (c.fee || 0), 0);`
- L49: `return { totalEarnings, totalConsultations: all.length, uniquePatients, completionRate: all.length ? Math.round((all.filter(c => c.status === "complet`

#### `src/pages/doctor/DoctorDashboard.tsx`

- L19: `const { data: stats, isLoading } = useQuery({`
- L31: `const consultationEarnings = consultations.filter(c => c.payment_status === "paid").reduce((s, c) => s + (c.fee || 0), 0);`
- L33: `const commissionEarnings = (commRes.data || []).reduce((s, e: any) => s + (e.commission_amount || 0), 0);`
- L34: `const pendingCommissions = (commRes.data || []).filter((e: any) => e.status === "pending").reduce((s, e: any) => s + (e.commission_amount || 0), 0);`
- L35: `const totalEarnings = consultationEarnings + commissionEarnings;`
- L40: `const avgRating = reviews.length ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : null;`
- L64: `<KpiCard label="Today's Sessions" value={stats?.todayCount ?? 0} icon={Calendar} color="text-primary" navigateTo="/doctor/consultations" />`
- L65: `<KpiCard label="Total Patients" value={stats?.totalPatients ?? 0} icon={Users} color="text-accent" navigateTo="/doctor/patients" />`
- L66: `<KpiCard label="Total Earnings" value={`₹${(stats?.totalEarnings ?? 0).toLocaleString()}`} icon={IndianRupee} color="text-accent" navigateTo="/doctor/`
- L67: `<KpiCard label="Pending Sessions" value={stats?.pending ?? 0} icon={Clock} color="text-warning" navigateTo="/doctor/consultations" />`
- L77: `<span className="font-semibold">₹{(stats?.consultationEarnings ?? 0).toLocaleString()}</span>`
- L81: `<span className="font-semibold">₹{(stats?.commissionEarnings ?? 0).toLocaleString()}</span>`
- L84: `<p className="text-xs text-warning mt-1">₹{stats?.pendingCommissions?.toLocaleString()} pending</p>`
- L97: `<p className="text-sm font-bold">{stats.avgRating}★</p>`
- L98: `<p className="text-xs text-muted-foreground">{stats.reviewCount} patient reviews</p>`
- L103: `<p className="text-sm font-bold text-accent">{stats.partnerships}</p>`
- L129: `{(stats?.todayConsults || []).length === 0 ? (`
- L136: `(stats?.todayConsults || []).map((c: any) => (`
- L159: `{stats!.upcomingFollowups.map((c: any) => (`

#### `src/pages/pharmacy/PharmacyAnalytics.tsx`

- L15: `const { data: stats, isLoading } = useQuery({`
- L25: `const totalSpent = orders.reduce((s, o) => s + (o.total_amount || 0), 0);`
- L26: `const totalPaid = (paymentsRes.data || []).reduce((s, p) => s + (p.amount || 0), 0);`
- L31: `monthly[m] = (monthly[m] || 0) + (o.total_amount || 0);`
- L34: `return { totalSpent, totalPaid, stockists: circleRes.data?.length || 0, orders: orders.length, inventory: inventoryRes.count || 0, chartData };`
- L63: `<BarChart data={stats.chartData}><XAxis dataKey="month" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} /><Tooltip /><Bar dataKey="amount" fi`

#### `src/pages/pharmacy/PharmacyDashboard.tsx`

- L26: `const { data: stats, isLoading } = useQuery({`
- L30: `const [ordersRes, circleRes, inventoryRes, alertsRes, custOrdersRes, lowStockRes, expiryRes, totalCustRes] = await Promise.all([`
- L43: `const totalPurchase = orders.reduce((s, o) => s + (o.total_amount || 0), 0);`
- L47: `const custRevenue = custOrders.filter(o => o.status === "delivered").reduce((s, o) => s + (o.total_amount || 0), 0);`
- L52: `const uniqueCustomers = new Set((totalCustRes.data || []).map((o: any) => o.customer_id));`
- L102: `if (mode === "purchase") return <PurchaseDashboard stats={stats} recentOrders={recentOrders} pp={pp} navigate={navigate} />;`
- L103: `return <SaleDashboard stats={stats} recentCustOrders={recentCustOrders} pp={pp} navigate={navigate} />;`
- L107: `const PurchaseDashboard = ({ stats, recentOrders, pp, navigate }: any) => (`
- L121: `<p className="text-xs"><span className="font-semibold text-destructive">{stats?.lowStockCount}</span> low stock</p>`
- L129: `<p className="text-xs"><span className="font-semibold text-warning">{stats?.expiringCount}</span> expiring soon</p>`
- L138: `<KpiCard label="Active B2B Orders" value={stats?.activeB2BOrders ?? 0} icon={ShoppingCart} color="text-primary" navigateTo="/pharmacy/orders" />`
- L139: `<KpiCard label="Total Purchase" value={`₹${(stats?.totalPurchase ?? 0).toLocaleString()}`} icon={TrendingUp} color="text-accent" navigateTo="/pharmacy`
- L140: `<KpiCard label="Pending Payments" value={stats?.pendingPayments ?? 0} icon={Clock} color="text-warning" navigateTo="/pharmacy/payments" />`
- L141: `<KpiCard label="Connected Stockists" value={stats?.connectedStockists ?? 0} icon={Store} color="text-accent" navigateTo="/pharmacy/stockists" />`
- L142: `<KpiCard label="Inventory Items" value={stats?.inventoryItems ?? 0} icon={Package} color="text-primary" navigateTo="/pharmacy/inventory" />`
- L183: `<p className="text-xs text-muted-foreground mt-0.5">₹{o.total_amount}</p>`
- L195: `const SaleDashboard = ({ stats, recentCustOrders, pp, navigate }: any) => (`
- L199: `<p className="text-sm text-muted-foreground">Customer Sales & Delivery</p>`
- L204: `<KpiCard label="Active Orders" value={stats?.activeCustOrders ?? 0} icon={ShoppingCart} color="text-primary" navigateTo="/pharmacy/customer-orders" />`
- L205: `<KpiCard label="Today's Orders" value={stats?.todayCustOrders ?? 0} icon={ShoppingCart} color="text-accent" navigateTo="/pharmacy/customer-orders" />`
- L206: `<KpiCard label="Customer Revenue" value={`₹${(stats?.custRevenue ?? 0).toLocaleString()}`} icon={IndianRupee} color="text-accent" navigateTo="/pharmac`
- L207: `<KpiCard label="Avg Order Value" value={`₹${stats?.avgOrderValue ?? 0}`} icon={TrendingUp} color="text-primary" />`
- L208: `<KpiCard label="Pending Payments" value={stats?.pendingCustPayments ?? 0} icon={Clock} color="text-warning" navigateTo="/pharmacy/customer-orders" />`
- L209: `<KpiCard label="Customers" value={stats?.totalCustomers ?? 0} icon={Users} color="text-accent" navigateTo="/pharmacy/customer-list" />`
- L210: `<KpiCard label="Inventory Items" value={stats?.inventoryItems ?? 0} icon={Package} color="text-primary" navigateTo="/pharmacy/inventory" />`
- *… 1 more lines*

#### `src/pages/staff/StaffDashboard.tsx`

- L53: `const table = staffType === "stockist" ? "delivery_staff" : "pharmacy_delivery_staff";`
- L74: `const { data: stockistOrders = [], isLoading: loadingStockist } = useQuery({`
- L120: `const isLoading = isPharmacyStaff ? loadingPharmacy : loadingStockist;`
- L137: `const confirmDelivery = async () => {`
- L145: `const path = `delivery-proofs/${selectedOrder.id}-${Date.now()}.${ext}`;`
- L158: `updateData.delivery_collected_amount = parseFloat(payAmount);`
- L159: `updateData.delivery_payment_status = "pending_approval";`
- L160: `updateData.delivery_payment_method = payMethod;`
- L162: `if (proofUrl) updateData.delivery_proof_url = proofUrl;`
- L225: `<Card><CardContent className="p-3 text-center"><p className="text-lg font-bold">{deliveredOrders.length}</p><p className="text-[10px] text-muted-foreg`
- L251: `<p className="text-xs text-muted-foreground">₹{o.total_amount} {!isPharmacyStaff && `• ${o.items_count} items`}</p>`
- L280: `<Label className="text-sm flex items-center gap-1"><Camera className="h-3.5 w-3.5" /> Delivery Proof Photo (optional)</Label>`
- L297: `<div className="space-y-1"><Label className="text-xs">Amount (₹)</Label><Input type="number" value={payAmount} onChange={e => setPayAmount(e.target.va`
- L306: `<Button className="w-full rounded-xl" onClick={confirmDelivery} disabled={processing}>`

#### `src/pages/stockist/StockistAnalytics.tsx`

- L46: `const { data } = await supabase.from("stockist_pharmacy_circle").select("outstanding").eq("stockist_id", stockistId!);`
- L103: `if (months[key]) { months[key].revenue += o.total_amount || 0; months[key].orders += 1; }`
- L109: `const map: Record<string, { name: string; total: number; count: number }> = {};`
- L112: `if (!map[o.pharmacy_id]) map[o.pharmacy_id] = { name, total: 0, count: 0 };`
- L113: `map[o.pharmacy_id].total += o.total_amount || 0;`
- L116: `return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 5);`
- L152: `const totalOutstanding = circleData.reduce((s, c) => s + (c.outstanding || 0), 0);`
- L156: `const collected = thisMonthPayments.reduce((s, p) => s + ((p as any).amount || 0), 0);`
- L157: `const collectionRate = totalOutstanding + collected > 0 ? Math.round((collected / (totalOutstanding + collected)) * 100) : 0;`
- L180: `<Card><CardContent className="p-3 text-center"><p className="text-[10px] text-muted-foreground uppercase">Revenue</p><p className="text-lg font-bold t`
- L194: `<div key={i} className="flex justify-between items-center text-sm"><div><p className="font-medium">{p.name}</p><p className="text-xs text-muted-foregr`

### E.7 Modals / Dialogs / Sheets Inventory

**Files with dialog-like UI:** 45

| File | Dialog Count | Named Components |
|------|--------------|------------------|
| `src/pages/stockist/StockistOrderDetail.tsx` | 14 | (inline) |
| `src/pages/doctor/DoctorConsultationDetail.tsx` | 10 | (inline) |
| `src/pages/customer/CustomerConsultationDetail.tsx` | 10 | (inline) |
| `src/pages/pharmacy/PharmacyOrderDetail.tsx` | 8 | (inline) |
| `src/pages/stockist/StockistDeliveryRoutes.tsx` | 8 | (inline) |
| `src/pages/admin/AdminNotifications.tsx` | 8 | (inline) |
| `src/pages/customer/CustomerMedicineReminders.tsx` | 8 | (inline) |
| `src/components/stockist/ProductForm.tsx` | 6 | (inline) |
| `src/components/shared/ToSDialog.tsx` | 5 | ToSDialog |
| `src/pages/pharmacy/PharmacyCustomerOrderDetail.tsx` | 5 | (inline) |
| `src/pages/stockist/StockistHolidays.tsx` | 5 | (inline) |
| `src/pages/stockist/StockistCreateOrder.tsx` | 5 | (inline) |
| `src/pages/doctor/DoctorPharmacyPartnershipDetail.tsx` | 5 | (inline) |
| `src/pages/doctor/DoctorPrescriptionTemplates.tsx` | 5 | (inline) |
| `src/pages/customer/CustomerAddresses.tsx` | 5 | (inline) |
| `src/components/pharmacy/B2CBillGenerator.tsx` | 4 | (inline) |
| `src/components/stockist/EditPharmacyDialog.tsx` | 4 | EditPharmacyDialog |
| `src/components/stockist/BulkUploadPurchaseBill.tsx` | 4 | (inline) |
| `src/components/stockist/BatchManager.tsx` | 4 | (inline) |
| `src/components/stockist/QuickBillDialog.tsx` | 4 | QuickBillDialog |
| `src/components/stockist/CollectPaymentDialog.tsx` | 4 | CollectPaymentDialog |
| `src/components/stockist/BillPreviewDialog.tsx` | 4 | BillPreviewDialog |
| `src/components/stockist/BulkUploadCatalogue.tsx` | 4 | (inline) |
| `src/pages/pharmacy/PharmacyInventory.tsx` | 4 | (inline) |
| `src/pages/pharmacy/PharmacyRecurringOrders.tsx` | 4 | (inline) |
| `src/pages/pharmacy/PharmacyDoctors.tsx` | 4 | (inline) |
| `src/pages/pharmacy/PharmacyPayments.tsx` | 4 | (inline) |
| `src/pages/pharmacy/PharmacyServiceableAreas.tsx` | 4 | (inline) |
| `src/pages/stockist/StockistManufacturerReturns.tsx` | 4 | (inline) |
| `src/pages/stockist/StockistPharmacyDetail.tsx` | 4 | (inline) |
| `src/pages/stockist/StockistReturns.tsx` | 4 | openReturnDialog |
| `src/pages/stockist/StockistPayments.tsx` | 4 | (inline) |
| `src/pages/stockist/StockistPrivacySecurity.tsx` | 4 | (inline) |
| `src/pages/stockist/StockistStaffManagement.tsx` | 4 | (inline) |
| `src/pages/stockist/StockistServiceableAreas.tsx` | 4 | (inline) |
| `src/pages/stockist/StockistProducts.tsx` | 4 | (inline) |
| `src/pages/doctor/DoctorPrivacySecurity.tsx` | 4 | (inline) |
| `src/pages/doctor/DoctorPharmacies.tsx` | 4 | (inline) |
| `src/pages/admin/AdminCounterfeit.tsx` | 4 | (inline) |
| `src/pages/staff/StaffDashboard.tsx` | 4 | (inline) |
| `src/components/layout/AppLayout.tsx` | 0 | (inline) |
| `src/components/admin/flowboard/ScreensView.tsx` | 0 | (inline) |
| `src/pages/stockist/StockistPharmacies.tsx` | 0 | (inline) |
| `src/pages/stockist/StockistExportData.tsx` | 0 | (inline) |
| `src/pages/doctor/DoctorPrescriptionDetail.tsx` | 0 | (inline) |

### E.8 Mock, Stub, and Incomplete Behavior

**Files flagged:** 125

| File | Tags | Sample |
|------|------|--------|
| `supabase/functions/flowboard-data/index.ts` | demo | L174: { id: "doc-analytics", title: "Analytics", type: "ui", description: "Consultation tr |
| `src/components/ui/command.tsx` | placeholder | L47: "flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:tex |
| `src/components/ui/sidebar.tsx` | random | L536: return `${Math.floor(Math.random() * 40) + 50}%`; |
| `src/components/ui/select.tsx` | placeholder | L20: "flex h-10 w-full items-center justify-between rounded-md border border-input bg-back |
| `src/components/ui/textarea.tsx` | placeholder | L11: "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text |
| `src/components/ui/input.tsx` | placeholder | L11: "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ri |
| `src/components/registration/DoctorRegistration.tsx` | placeholder | L188: <div className="space-y-2"><Label>Full Name *</Label><Input value={form.fullName} on |
| `src/components/registration/StockistRegistration.tsx` | placeholder | L184: placeholder={`Enter ${label.toLowerCase()} number`} |
| `src/components/registration/CustomerRegistration.tsx` | placeholder | L129: <div className="space-y-2"><Label>Full Name *</Label><Input value={form.fullName} on |
| `src/components/registration/PharmacyRegistration.tsx` | placeholder | L144: <Input placeholder={`Enter ${label.toLowerCase()} number`} value={numberValue} onCha |
| `src/components/stockist/EditPharmacyDialog.tsx` | placeholder | L80: <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Internal n |
| `src/components/stockist/QuickBillDialog.tsx` | placeholder | L125: <Input type="number" className="h-8 text-xs" value={discountValue} onChange={e => se |
| `src/components/stockist/CollectPaymentDialog.tsx` | placeholder | L175: <Input type="number" value={amount} onChange={e => { setAmount(e.target.value); setM |
| `src/components/stockist/ProductForm.tsx` | placeholder | L165: placeholder="Search or add brand..." |
| `src/components/stockist/ProductFilters.tsx` | placeholder | L47: <SelectTrigger className="w-[130px] h-8 text-xs text-left justify-start"><SelectValue |
| `src/components/admin/flowboard/ArchitectureAIView.tsx` | placeholder | L281: placeholder="Ask about the architecture..." |
| `src/components/admin/flowboard/SystemGraphView.tsx` | placeholder | L385: placeholder="Search nodes..." className="h-7 pl-7 w-36 text-[10px]" /> |
| `src/components/admin/flowboard/DependencyGraphView.tsx` | placeholder | L182: placeholder="Search entities..." className="h-8 pl-8 text-xs" /> |
| `src/components/shared/MenuPage.tsx` | placeholder | L63: placeholder="Search menu..." |
| `src/pages/Login.tsx` | demo, placeholder | L20: // Dev-only seeded demo credentials (from seed-production-data) |
| `src/pages/ResetPassword.tsx` | placeholder | L71: <Input id="password" type={showPassword ? "text" : "password"} placeholder="Enter new |
| `src/pages/ForgotPassword.tsx` | placeholder | L67: placeholder="Enter your email" |
| `src/pages/pharmacy/PharmacySettings.tsx` | incomplete | L12: { code: "hi", label: "Hindi", available: false, comingSoon: "Coming Soon — April 1" } |
| `src/pages/pharmacy/PharmacyInventory.tsx` | placeholder | L118: <Input placeholder="Search inventory..." className="pl-9 h-9 rounded-xl" value={sear |
| `src/pages/pharmacy/PharmacyCustomerOrders.tsx` | placeholder | L57: <Input placeholder="Search orders..." value={searchQuery} onChange={e => setSearchQue |
| `src/pages/pharmacy/PharmacyStockAudit.tsx` | placeholder | L119: placeholder={String(item.quantity || 0)} |
| `src/pages/pharmacy/PharmacyRecurringOrders.tsx` | placeholder | L143: <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select Stockist" />< |
| `src/pages/pharmacy/PharmacyDoctors.tsx` | placeholder | L91: <Input className="pl-9" placeholder="Search by name or specialization" value={search} |
| `src/pages/pharmacy/PharmacyPayments.tsx` | placeholder | L222: <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select stockist" />< |
| `src/pages/pharmacy/PharmacyOrderDetail.tsx` | placeholder | L315: <Input type="number" min={0} max={item.quantity} placeholder="0" className="w-16 h-8 |
| `src/pages/pharmacy/PharmacyInventoryForm.tsx` | placeholder | L209: <Input value={form.brand || brandSearch} onChange={e => { setBrandSearch(e.target.va |
| `src/pages/pharmacy/PharmacyPrivacySecurity.tsx` | placeholder | L62: <Input type="password" placeholder="New password (min 6 characters)" value={newPasswo |
| `src/pages/pharmacy/PharmacyOrders.tsx` | placeholder | L95: <Input placeholder="Search orders..." value={searchQuery} onChange={e => setSearchQue |
| `src/pages/pharmacy/PharmacyBrowse.tsx` | placeholder | L93: <Input placeholder="Search products or stockists..." value={search} onChange={(e) =>  |
| `src/pages/pharmacy/PharmacyCustomerOrderDetail.tsx` | placeholder | L356: <Input type="number" value={manualTotal} onChange={e => setManualTotal(e.target.valu |
| `src/pages/pharmacy/PharmacyBulkImport.tsx` | placeholder | L100: <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select Stockist" />< |
| `src/pages/pharmacy/PharmacyQuickOrder.tsx` | placeholder | L142: <Textarea value={text} onChange={e => setText(e.target.value)} placeholder="e.g. Dol |
| `src/pages/pharmacy/PharmacyProfileSettings.tsx` | placeholder | L92: <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger> |
| `src/pages/pharmacy/PharmacyBusinessDetails.tsx` | placeholder | L138: <SelectTrigger className="text-left justify-start"><SelectValue placeholder="State"  |
| `src/pages/pharmacy/PharmacyServiceableAreas.tsx` | placeholder | L74: <Input placeholder="Enter 6-digit PIN" value={newPin} onChange={e => setNewPin(e.targ |
| `src/pages/stockist/StockistAddProduct.tsx` | placeholder | L171: <Input value={form.brand || brandSearch} onChange={e => { setBrandSearch(e.target.va |
| `src/pages/stockist/StockistSettings.tsx` | incomplete | L12: { code: "hi", label: "Hindi", available: false, comingSoon: "Coming Soon — April 1" } |
| `src/pages/stockist/StockistManufacturerReturns.tsx` | placeholder | L140: <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select product" /></ |
| `src/pages/stockist/StockistPharmacies.tsx` | placeholder | L94: <Input placeholder="Search circle..." value={search} onChange={e => setSearch(e.targe |
| `src/pages/stockist/StockistOrders.tsx` | placeholder | L84: <Input placeholder="Search orders..." value={search} onChange={e => setSearch(e.targe |
| `src/pages/stockist/StockistHolidays.tsx` | placeholder | L153: <Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. |
| `src/pages/stockist/StockistOrderDetail.tsx` | placeholder | L495: <SelectTrigger className="h-9 text-xs rounded-xl"><SelectValue placeholder="Select d |
| `src/pages/stockist/StockistStockTransfer.tsx` | placeholder | L100: <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select product" /></ |
| `src/pages/stockist/StockistCreateOrder.tsx` | placeholder | L229: <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select pharmacy..."  |
| `src/pages/stockist/StockistReturns.tsx` | placeholder | L413: placeholder="0" |
| `src/pages/stockist/StockistPayments.tsx` | placeholder | L340: <SelectTrigger className="rounded-xl"><SelectValue placeholder="Choose pharmacy" />< |
| `src/pages/stockist/StockistRecordPayment.tsx` | placeholder | L111: <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select pharmacy" />< |
| `src/pages/stockist/StockistFindPharmacy.tsx` | placeholder | L101: <Input placeholder="Search by name, owner, PIN code..." value={search} onChange={e = |
| `src/pages/stockist/StockistEditProduct.tsx` | placeholder | L214: <Input value={form.brand || brandSearch} onChange={e => { setBrandSearch(e.target.va |
| `src/pages/stockist/StockistPrivacySecurity.tsx` | placeholder | L95: <Input type="password" placeholder="New password (min 6 characters)" value={newPasswo |
| `src/pages/stockist/StockistServiceableAreas.tsx` | placeholder | L118: <Input placeholder="Enter 6-digit PIN code" value={newPin} onChange={e => setNewPin( |
| `src/pages/stockist/StockistDeliveryRoutes.tsx` | placeholder | L215: <Input value={templateName} onChange={e => setTemplateName(e.target.value)} placehol |
| `src/pages/stockist/StockistBusinessDetails.tsx` | placeholder | L127: <SelectTrigger><SelectValue placeholder="Select business type" /></SelectTrigger> |
| `src/pages/stockist/StockistAnalytics.tsx` | placeholder | L203: <SelectTrigger className="w-28 h-8 text-xs"><SelectValue placeholder="Category" /></ |
| `src/pages/stockist/StockistHelpCenter.tsx` | placeholder | L250: <Textarea value={feedbackForm.feedback} onChange={e => setFeedbackForm(f => ({ ...f, |
| `src/pages/stockist/StockistProducts.tsx` | placeholder | L121: <Input placeholder="Search products..." className="pl-9 h-9 rounded-xl" value={searc |
| `src/pages/stockist/StockistProfileSettings.tsx` | placeholder, incomplete | L92: <Input type={showPw[showKey] ? "text" : "password"} value={value} onChange={e => onCh |
| `src/pages/doctor/DoctorPharmacyPartnershipDetail.tsx` | placeholder | L275: <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger> |
| `src/pages/doctor/DoctorPrivacySecurity.tsx` | placeholder | L85: <Input type="password" placeholder="New password (min 6 characters)" value={newPasswo |
| `src/pages/doctor/DoctorPharmacies.tsx` | placeholder | L165: <Input className="pl-9" placeholder="Search pharmacy..." value={search} onChange={(e |
| `src/pages/doctor/DoctorProfileSettings.tsx` | placeholder | L126: <div className="space-y-1"><Label>Address</Label><Input value={form.address || ""} o |
| `src/pages/doctor/DoctorPrescriptionWriter.tsx` | placeholder | L179: placeholder="Search by name or phone..." |
| `src/pages/doctor/DoctorPrescriptionDetail.tsx` | placeholder | L156: <Input value={editedNotes} onChange={e => setEditedNotes(e.target.value)} placeholde |
| `src/pages/doctor/DoctorPrescriptionTemplates.tsx` | placeholder | L89: <div className="space-y-2"><Label>Template Name *</Label><Input value={templateName}  |
| `src/pages/doctor/DoctorConsultationDetail.tsx` | placeholder | L163: <Input value={meetingLink} onChange={e => setMeetingLink(e.target.value)} placeholde |
| `src/pages/admin/AdminBills.tsx` | placeholder | L67: <Input placeholder="Search bills..." className="pl-9 h-9 text-sm rounded-xl" value={s |
| `src/pages/admin/AdminLoginHistory.tsx` | placeholder | L60: <Input className="pl-9 rounded-xl" placeholder="Filter by email..." value={search} on |
| `src/pages/admin/AdminDoctorDetail.tsx` | placeholder | L115: <Input placeholder="Rejection reason (required for rejection)" value={rejectionReaso |
| `src/pages/admin/AdminConsultationDetail.tsx` | placeholder | L114: <SelectTrigger className="rounded-xl"><SelectValue placeholder="Change status..." /> |
| `src/pages/admin/AdminDoctors.tsx` | placeholder | L76: <Input className="pl-9 rounded-xl" placeholder="Search doctors..." value={search} onC |
| `src/pages/admin/AdminRefunds.tsx` | placeholder | L81: <Input placeholder="Search..." className="pl-9 h-9 text-sm rounded-xl" value={search} |
| `src/pages/admin/AdminCounterfeit.tsx` | placeholder | L113: <Input placeholder="Product Name *" value={form.product_name} onChange={e => setForm |
| `src/pages/admin/AdminImpersonate.tsx` | placeholder | L66: <Input placeholder="Name or email" value={search} onChange={e => setSearch(e.target.v |
| `src/pages/admin/AdminCustomers.tsx` | placeholder | L36: <Input className="pl-9 rounded-xl" placeholder="Search by name or phone..." value={se |
| `src/pages/admin/AdminHelpCenter.tsx` | demo | L11: { q: "How do I view platform analytics?", a: "Go to More > Platform Analytics for rev |
| `src/pages/admin/AdminPayments.tsx` | placeholder | L95: <Input placeholder="Search payments..." className="pl-9 h-9 text-sm rounded-xl" value |
| `src/pages/admin/AdminPharmacyCategories.tsx` | placeholder | L50: <Input placeholder="e.g. Retail, Hospital, Clinic" value={name} onChange={e => setNam |
| `src/pages/admin/AdminProductCategories.tsx` | placeholder | L50: <Input placeholder="Category name" value={name} onChange={e => setName(e.target.value |
| `src/pages/admin/AdminMergeAccounts.tsx` | placeholder | L70: <Input value={email1} onChange={e => setEmail1(e.target.value)} placeholder="primary@ |
| `src/pages/admin/AdminForceReset.tsx` | placeholder | L59: <Input type="email" placeholder="user@example.com" value={email} onChange={e => setEm |
| `src/pages/admin/AdminNotifications.tsx` | placeholder | L154: <Input value={broadcastTitle} onChange={e => setBroadcastTitle(e.target.value)} plac |
| `src/pages/admin/AdminDrugSchedules.tsx` | placeholder | L52: <Input placeholder="e.g. Schedule H" value={name} onChange={e => setName(e.target.val |
| `src/pages/admin/AdminStockistDetail.tsx` | placeholder | L139: <Input placeholder="Rejection reason (required for rejection)" value={rejectionReaso |
| `src/pages/admin/AdminCustomerOrderDetail.tsx` | placeholder | L108: <SelectTrigger className="flex-1"><SelectValue placeholder="Override status..." /></ |
| `src/pages/admin/AdminMessages.tsx` | placeholder | L80: <Input placeholder="Search users..." value={search} onChange={(e) => setSearch(e.targ |
| `src/pages/admin/AdminSystemArchitecture.tsx` | placeholder | L171: placeholder="Search... ( / )" className="h-8 pl-8 w-48 text-xs" /> |
| `src/pages/admin/AdminProfileSettings.tsx` | placeholder | L45: <Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Admi |
| `src/pages/admin/AdminOrderDetail.tsx` | placeholder | L85: <SelectTrigger className="flex-1 rounded-xl text-xs"><SelectValue placeholder="Change |
| `src/pages/admin/AdminToSManagement.tsx` | placeholder | L51: <Input value={tosUrl} onChange={e => setTosUrl(e.target.value)} placeholder="https:// |
| `src/pages/admin/AdminPharmacies.tsx` | placeholder | L79: <Input placeholder="Search pharmacies..." value={search} onChange={(e) => setSearch(e |
| `src/pages/admin/AdminMaintenanceMode.tsx` | placeholder | L51: <Textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Mai |
| `src/pages/admin/AdminAuditTrail.tsx` | placeholder | L36: <Input placeholder="Search actions..." value={search} onChange={e => setSearch(e.targ |
| `src/pages/admin/AdminPharmacyDetail.tsx` | placeholder | L139: <Input placeholder="Rejection reason (required for rejection)" value={rejectionReaso |
| `src/pages/admin/AdminUsers.tsx` | placeholder | L113: <Input className="pl-9 rounded-xl" placeholder="Search by name or email..." value={s |
| `src/pages/admin/AdminStockists.tsx` | placeholder | L80: <Input placeholder="Search stockists..." value={search} onChange={(e) => setSearch(e. |
| *…* | | *25 more* |

### E.9 Dead Code, Orphan Routes, and Broken Links

#### Duplicate / parallel component files



---

## EXPANSION PASS 2 — Deep Trace Additions (2026-07-08)

*Second reverse-engineering pass. Content below is strictly additive and covers material not present in the original review or the first Expansion pass — chiefly: exact SQL bodies of every database function/trigger (previously only known via the Flowboard model), exact RLS policy expressions (previously only policy names), verbatim AI prompts and edge-function contracts, the complete seeded-data specification, and a verbatim validation/error-message catalog. Domain scope: Admin / Stockist / Pharmacy only. All paths relative to `digi-swasthya-hub/`.*

### E2.1 Newly documented routes/pages/screens

No new routes exist beyond the 217 already tabulated in §14 and E.1 (verified against `src/App.tsx`). Additions below are route-level details not previously captured:

- **`/staff/login` header allowlist** — the staff RPC path requires no special headers, but all edge-function CORS allowlists (`supabase/functions/parse-order-text/index.ts` line 5) explicitly include `x-supabase-client-platform`, `x-supabase-client-platform-version`, `x-supabase-client-runtime`, `x-supabase-client-runtime-version` in `Access-Control-Allow-Headers` — a wider allowlist than the other functions, which only allow `authorization, x-client-info, apikey, content-type`.
- **DB-enforced route behavior**: any screen that updates `orders.status` or `customer_orders.status` (StockistOrderDetail, PharmacyCustomerOrderDetail, StaffDashboard, admin detail pages) is subject to the BEFORE UPDATE transition triggers documented in E2.3/E2.4 below. A UI action that attempts an illegal jump receives a Postgres exception surfaced through the Supabase client error object; the pages show the generic failure toast (e.g. `toast.error("Failed")`), not the SQL message. This means the effective screen-level state machine is the *intersection* of the buttons rendered and the SQL `valid_next` arrays.
- **`ready_for_pickup` / `out_for_delivery` cannot be cancelled at DB level for B2C** — `validate_customer_order_status_transition` allows `cancelled` only from `pending`, `confirmed`, `preparing` (`supabase/migrations/20260302091945_09b0963b-2afd-4d57-b216-1b549341615b.sql` lines 32–56). The pharmacy customer-order screen's cancel affordances are therefore hard-gated server-side even if the UI ever offered them later.
- Otherwise: **No new findings beyond existing review.**

### E2.2 Component behavior catalog

**`QuickBillDialog`** (`src/components/stockist/QuickBillDialog.tsx`, 153 lines) — previously only name-listed; full behavior:
- Props: `{ open, onOpenChange, stockistId, pharmacyId?, onDone }`. Triggered from StockistPharmacies dropdown "Generate Bill" and StockistPharmacyDetail.
- On open (and only when `pharmacyId` set): fetches **all** `orders` for that stockist+pharmacy pair, newest first (line 36–40) — despite the subtitle "Generate a bill for unpaid orders", there is **no payment/billed filter**; already-billed and paid orders are listed too.
- UI: header icon `FileText`, title "Quick Bill", subtitle "Generate a bill for unpaid orders"; "Select All"/"Deselect All" toggle text-button; scrollable checkbox list (`max-h-48`) with `#order_number`, `dd MMM yyyy` date, `₹total_amount`; discount block; Subtotal/Discount/Total summary; "Preview Bill" button; plain-text "Cancel" button.
- Discount math (lines 60–63): `discount = discountType==="percentage" ? selectedTotal * (parseFloat(discountValue)||0)/100 : parseFloat(discountValue)||0`; `total = Math.max(0, selectedTotal − discount)`. Discount type select offers `%` and `₹ Flat`; value input is a bare number field with placeholder "0" (no max validation — a flat discount larger than subtotal simply clamps total to 0).
- Validation: only `toast.error("Select at least one order")` (line 66). Preview passes `{orders, subtotal, discountType, discountValue, discount, total, stockistId, pharmacyId}` into `BillPreviewDialog`; on bill confirm the parent's `onDone` runs and this dialog closes.
- States: `loading` → "Loading orders..."; empty → "No orders found"; no error state (fetch error silently yields empty list).

**`ToSDialog`** (`src/components/shared/ToSDialog.tsx`) — exact behavior: renders only when `useToSAcceptance().accepted` is false; the Radix `Dialog` is forced open with a no-op `onOpenChange` and `onPointerDownOutside={e => e.preventDefault()}` — the dialog is **undismissable** except via the single full-width button "I Accept the Terms of Service". Content is 6 hardcoded numbered clauses (Account Usage, Data Privacy, Medical Disclaimer, Order & Payment, Returns & Refunds, Termination) inside a `max-h-60` ScrollArea. Acceptance (`src/hooks/useToSAcceptance.ts`) writes two localStorage keys: `tos_accepted="true"` and `tos_accepted_at=<ISO timestamp>` — note the hook is **purely client-side**; nothing writes `profiles.tos_accepted_at` from this path (the column exists per `supabase/migrations/20260309195019_881e1259-47f2-4ae2-9a2a-290025d4bc3c.sql` but this hook never touches Supabase). Clearing localStorage re-triggers ToS on next app load. Mounted once in `AppLayout`, so it applies to every authenticated role including Admin.

**`ProductGalleryUploader`** (`src/components/shared/ProductGalleryUploader.tsx`) — shared by stockist ProductForm and PharmacyInventoryForm:
- Props: `{ images: GalleryImage[], onChange, storagePath }` where `GalleryImage = {id?, image_url, sort_order, is_primary}`.
- Multi-file `<input type="file" accept="image/*" multiple>`; each file uploads to bucket **`product-images`** at `${storagePath}/${Date.now()}_${i}.${ext}` and stores the **public URL**. Per-file failure → `toast.error(\`Failed to upload ${file.name}\`)` and continues with remaining files (partial success possible). Input value reset after batch.
- First image ever added is auto-`is_primary`. Remove: filters, re-promotes `updated[0].is_primary=true` if primary was removed, re-indexes `sort_order` 0..n. Set-primary: exclusive flag mapping. Reorder: `←`/`→` swap buttons re-index `sort_order`. 80×80 thumbnails with "MAIN" corner badge on the primary and hover overlays (star = set primary, X = remove). All changes are in-memory via `onChange`; persistence (delete-all-then-insert into `product_media`/`pharmacy_inventory_media`) happens in the parent forms.

**Toast system duality** — the codebase carries two toast stacks: `sonner` (`toast.error/success/warning` used by virtually all pages; mounted via `src/components/ui/sonner.tsx`) and the shadcn `useToast`/`Toaster` pair (`src/components/ui/use-toast.ts`, `src/hooks/use-toast.ts`, `toast.tsx`, `toaster.tsx`) which has `TOAST_LIMIT = 1` and `TOAST_REMOVE_DELAY = 1000000` (~16.7 min) — effectively unused legacy plumbing alongside sonner.

### E2.3 Entity & schema deep detail (migration-derived)

**Storage buckets as created in SQL** (`supabase/migrations/20260223132615_…` lines 321–323 and `20260223164931_…` line 49):
- `documents` — **private** (`public=false`); `avatars` — public; `platform` — public; `product-images` — public. NOTE: the `avatars` bucket exists in SQL with full folder-scoped policies but **no client code uploads to it** (doctor avatar uses `public-assets`, which has **no bucket-creation migration at all** — it exists only project-side).
- Exact storage policies (same file, lines 326–333): `documents` INSERT/SELECT require `auth.uid()::text = (storage.foldername(name))[1]` — i.e. the **first folder segment must be the uploader's user id**; admins get SELECT on all documents via `has_role(auth.uid(),'admin')`. `product-images`: any authenticated user may INSERT/UPDATE/DELETE **any** object in the bucket (`bucket_id='product-images'` only — no ownership check; `20260223164931_…` lines 52–55). `platform`: admin-managed, publicly readable.
- Consequence traced against client code: uploads that do **not** start with the user id (`bills/{stockistId}/…` in BulkUploadPurchaseBill, `delivery-proofs/…` from the unauthenticated staff dashboard, `prescriptions/{customerId}/…` where customerId is the profile id not user id) depend on later, more permissive policies or fail—this is the schema-level reason several flows use signed URLs/raw paths inconsistently (§11).

**Exact RLS expressions** (previously names only; representative verbatim policies):
- `customer_profiles`: `"Authenticated can view customer profiles" FOR SELECT TO authenticated USING (true)` — **every authenticated user can read every customer profile** (`20260225122300_…`). Self-management via `auth.uid() = user_id`; admin via `has_role(auth.uid(),'admin'::app_role)`.
- `doctor_profiles`: visible when `approval_status = 'approved' OR auth.uid() = user_id`.
- `notifications`: `"Authenticated users can insert notifications" … WITH CHECK (true)` (`20260302091945_…` line ~68, re-affirmed in `20260302092602_…`) — **any authenticated user may insert a notification for any other user**; this is what allows all client-side cross-role notification fan-outs (order events, price change, feedback) without RPCs. The migration comment in `20260302092602` says "restrict to self-insert only" but the actual policy body is `WITH CHECK (true)`.
- `login_attempts`: INSERT allowed `TO anon, authenticated WITH CHECK (true)`; SELECT policy is `USING (false)` for authenticated (`20260302092602_…`) — reads happen only via SECURITY DEFINER RPCs; a later policy adds admin SELECT (`20260302114852_…`: `"Admins can view login attempts" USING (has_role(auth.uid(),'admin'))`) which is what AdminLoginHistory relies on.
- `delivery_staff`: `"Anyone can select staff for login"` (`20260225062823_…`) — a permissive SELECT that predates the RPC-based login; combined with `verify_staff_credentials` this means staff rows (including `password_hash`) are readable.
- `order_status_history`: both SELECT and INSERT are `TO authenticated USING/WITH CHECK (true)` (`20260315102854_…`) — fully open to any logged-in user.
- `doctor_commission_rules`: managed by either side of the partnership via nested `partnership_id IN (SELECT … WHERE doctor_id IN (…) OR pharmacy_id IN (…))` (`20260301080531_…`).
- `stockist_pharmacy_circle` / `payments` / `bills` / `credit_notes` / `payment_reminders`: pattern "Stockists can manage own X" (stockist_id resolved through `stockist_profiles.user_id = auth.uid()`), "Pharmacies can view own X", "Admins can manage all X" (`20260224065131_…`, `20260225062823_…`).
- `orders` both-sided: `"Pharmacies can create orders"` (original migration) **plus** `"Stockists can create orders"` and `"Stockists can insert order items"` added later (`20260224072821_…`) — this second pair is what makes stockist-initiated `StockistCreateOrder` possible at all.
- `platform_banners`: `"Authenticated can view active banners" USING (is_active = true)` — the read path exists even though no client renders banners (confirms E.9 orphan).

**Schema-only / seed-only columns not in generated `types.ts`** (hence invisible to the client): `pharmacy_profiles.drug_license_status`, `gst_certificate_status`, `pharmacy_certificate_status`; `stockist_profiles.drug_license_status`, `gst_certificate_status`, `fssai_license_status`, `wholesale_license_status` — all set to `'approved'` by both the demo migration `20260224185923_…` and `seed-production-data`. These are the per-document status fields the Admin detail pages write via their generic `[field]: status` setter (§16.1), reconciling how per-doc approve/reject persists despite the fields being absent from `types.ts`.

**Uniqueness & indexes** (performance contract, `20260226084125_…` and `20260302111856_…`): unique constraints on `orders.order_number` and `customer_orders.order_number` (added twice under different names — `*_unique` and `*_key` — both guarded by `IF NOT EXISTS`); 16 named b-tree indexes: `idx_orders_pharmacy_status(pharmacy_id,status)`, `idx_orders_stockist_status`, `idx_customer_orders_pharmacy_status`, `idx_customer_orders_customer`, `idx_notifications_user_read(user_id,read)`, `idx_consultations_doctor_status`, `idx_consultations_patient`, `idx_products_stockist_instock`, `idx_order_items_order`, `idx_customer_order_items_order`, `idx_prescriptions_doctor/patient`, `idx_prescription_items_prescription`, `idx_peer_messages_participants(sender_id,receiver_id)`, `idx_payments_pharmacy/stockist`; plus `idx_login_attempts_email(email,attempted_at)`, `idx_reviews_target(target_type,target_id)`, `idx_customer_returns_customer/pharmacy`, `idx_admin_audit_log_admin`, `idx_product_media_product_id(product_id,sort_order)`, `idx_pharmacy_inventory_media_inv_id`.

**Feature-number ↔ column archaeology** — the migrations carry the product backlog numbering inline, mapping features to columns: `#30 partial_delivery_items jsonb`, `#31 parent_order_id` (self-FK on orders), `#37 min_order_quantity default 1`, `#39 stockist_pharmacy_circle.is_blocked default false`, `#48 products.reserved_quantity default 0` (never used by UI), `#49 restore_product_stock`, `#57 auto_hide_oos_products` trigger, `#67 orders.delivered_at`, `#85 customer_orders.partial_items`, `#86 customer_order_items.is_substitute/original_product_name`, `#89 order_items.requested_batch`, `#94/#99 auto_hide_expired_pharmacy_inventory` trigger, `#103–105 pharmacy_profiles.operating_hours jsonb default '{}' / min_order_amount 0 / delivery_fee 0 / free_delivery_above 0`, `#167 admin login_attempts read`, `#169/#188 admin_override_customer_order_status`, `#175 admin_send_targeted_notification`, `#216 ToS` (`profiles.tos_accepted_at`) — sources: `20260302114852_…`, `20260311120502_…`, `20260302120218_…`, `20260309174247_…`, `20260309195019_…`.

**Trigger inventory as actually created** (deduplicated across the many re-creations): `on_auth_user_created` AFTER INSERT ON `auth.users` → `handle_new_user()` (inserts `profiles(user_id,email,full_name)` with `full_name = COALESCE(raw_user_meta_data->>'full_name','')`; SECURITY DEFINER); `update_updated_at_column()` BEFORE UPDATE on profiles/stockist_profiles/pharmacy_profiles/products/orders/pharmacy_inventory/customer_orders/customer_profiles/doctor_profiles/consultations/conversations (re-created under names `update_*_updated_at`, `set_updated_at`, `set_updated_at_*`, `trg_updated_at_*` in at least 6 migrations); `validate_order_status` BEFORE UPDATE [OF status] ON orders; `validate_customer_order_status` BEFORE UPDATE ON customer_orders; `trg_auto_hide_expired_inventory` BEFORE UPDATE ON pharmacy_inventory; `trg_auto_hide_oos_products` BEFORE UPDATE ON products.

### E2.4 Workflow traces (DB-enforced state machines, verbatim)

**B2B order transition guard** — `validate_order_status_transition()` final version (`supabase/migrations/20260301035303_…` lines 23–56):
- Short-circuits when `OLD.status = NEW.status`.
- **Admin bypass**: reads transaction-local GUC `current_setting('app.admin_override', true) = 'true'` (wrapped in an EXCEPTION handler defaulting to false); if true, any transition passes.
- Allowed map: `pending → {packed, processing, cancelled}`; `processing → {packed, cancelled}`; `packed → {dispatched, cancelled}`; `dispatched → {out_for_delivery, cancelled}`; `out_for_delivery → {delivered, cancelled}`; `delivered / cancelled / completed → {}` (terminal). Unknown old statuses pass through (`ELSE RETURN NEW`).
- Violation raises `'Invalid order status transition: % to %'`.
- So at the database level: **`processing` is a legal state** (UI never sets it but the seeded/legacy rows can move through it), skipping `packed` is impossible, and `delivered` orders cannot become `completed` — meaning the `completed` status counted in stockist revenue KPIs can only originate from seeds/legacy data, never from the current UI.

**Admin B2B override RPC** — `admin_override_order_status(p_order_id, p_new_status)` (`20260301035303_…` lines 60–75): SECURITY DEFINER; raises `'Only admins can override order status'` unless `has_role(auth.uid(),'admin')`; then `set_config('app.admin_override','true',true)` (transaction-local) → UPDATE → resets to `'false'`. This GUC handshake is the only sanctioned bypass of the B2B trigger.

**B2C order transition guard** — `validate_customer_order_status_transition()` (`20260302091945_…`): `pending → {confirmed, cancelled}`; `confirmed → {preparing, cancelled}`; `preparing → {ready_for_pickup, out_for_delivery, cancelled}`; `ready_for_pickup → {delivered}`; `out_for_delivery → {delivered}`; `delivered/cancelled` terminal. Violation raises `'Invalid customer order status transition: % to %'`. **Divergence from UI**: PharmacyCustomerOrderDetail renders a linear stepper implying confirmed→preparing→…, and its status buttons match this map; but the customer cancel flow (pending/confirmed only) is *stricter* than the DB (which also allows cancelling `preparing`).
- **Admin B2C override** — `admin_override_customer_order_status` (`20260302111856_…` lines 96–110) has **no GUC bypass**: it just UPDATEs after the admin check, so admin B2C overrides are still constrained by `validate_customer_order_status_transition` (an admin cannot force `delivered → confirmed`), unlike B2B where the GUC makes overrides unconstrained.

**Login rate-limit workflow** (`20260302092602_…` lines 86–110): `check_login_rate_limit(p_email)` returns `count(failures in last 15 min) < 5`; `record_login_attempt(p_email, p_success)` inserts the attempt **and deletes all rows older than 1 hour** (self-cleaning table). Combined with `Login.tsx` this yields: 5th consecutive failure within 15 minutes blocks further attempts until entries age out; successful logins do not reset the failure count (only time does).

**Staff credential verification** — `verify_staff_credentials` final version (`20260227043402_…` lines 98–145): branches on `p_staff_type` (`'stockist'` → `delivery_staff ⋈ stockist_profiles`, else `pharmacy_delivery_staff ⋈ pharmacy_profiles`); match condition is `username = p_username AND is_active = true AND ((password_hash LIKE '$2%' AND extensions.crypt(p_password, password_hash) = password_hash) OR (password_hash NOT LIKE '$2%' AND password_hash = p_password))` — i.e. **bcrypt when the stored hash looks like bcrypt, verbatim plaintext comparison otherwise** (server-side counterpart of the client's plaintext fallback in StaffForm). Returns `jsonb {id,name,phone,stockist_id|pharmacy_id,store_name,staff_type:'stockist_staff'|'pharmacy_staff',valid:true}` or `{valid:false}`. `store_name` falls back to `'Store'`/`'Pharmacy'`. `hash_password(p_password)` = `extensions.crypt(p_password, extensions.gen_salt('bf'))` (bcrypt, SQL-language, SECURITY DEFINER).

**Inventory auto-hide workflows** (server-side, invisible to UI code):
- `auto_hide_expired_pharmacy_inventory` (`20260302120218_…`): on ANY pharmacy_inventory UPDATE — if `quantity` transitions to 0 (from >0 or NULL) set `is_visible_to_customers := false`; independently, if `expiry_date < CURRENT_DATE` force `is_visible_to_customers := false`. Consequence: a pharmacy toggling visibility ON for an expired item is silently reverted by the trigger on the same write; B2C stock deductions that reach 0 auto-delist the item.
- `auto_hide_oos_products` (`20260309174247_…`): on products UPDATE — `stock_quantity` reaching 0 sets `in_stock := false`; leaving 0 sets `in_stock := true`. This runs in addition to the explicit `in_stock` writes inside `deduct_product_stock`/`restore_product_stock`, making the flag self-healing for direct quantity edits.

**Per-role trace deltas** (vs §19): Stockist "Mark Packed" → UI `deduct_product_stock` RPC → SQL FIFO loop (E2.5) → `validate_order_status` allows pending→packed → notification insert allowed by the permissive notifications policy. Pharmacy B2C "Confirm" → trigger allows pending→confirmed → `deduct_pharmacy_inventory` clamps at 0 → if an item hits 0 the auto-hide trigger delists it from the customer shopfront in the same transaction. Admin override B2B is total; admin override B2C is transition-constrained.

### E2.5 Business rules & calculations (SQL-exact)

- **`deduct_product_stock` FIFO algorithm** (`20260226084125_…` lines 45–73), now code-confirmed (previously only Flowboard-modeled): iterate `product_batches WHERE product_id=? AND stock_quantity>0 ORDER BY expiry_date ASC NULLS LAST, created_at ASC`; consume each batch fully or partially until `remaining=0`; then `products.stock_quantity = GREATEST(0, stock_quantity − p_quantity)` and `in_stock = (stock_quantity > 0)` as a second UPDATE. Notes: batches with NULL expiry are consumed **last**; if total batch stock < requested quantity the loop exhausts batches silently and the product headline still decrements by the full amount (floored at 0) — no error is raised for overselling.
- **`decrement_stock`** (`20260311120502_…`): single-statement `stock_quantity = GREATEST(0, stock_quantity − p_quantity)`; does **not** touch batches or `in_stock` (batch-blind — which is why create-time decrement + packed-time FIFO produce the double-deduction noted in §13, but only the packed step consumes batches).
- **`restore_product_stock`**: `stock_quantity += p_quantity` then `in_stock = (stock_quantity > 0)`; batch-blind (returns restore headline stock; the FIFO-batch restock is done separately in `StockistReturns` client code).
- **`deduct_pharmacy_inventory` / `restore_pharmacy_inventory`**: single UPDATEs, `GREATEST(0, quantity − p)` / `quantity + p`; visibility side-effects come from the auto-hide trigger, not the RPC.
- **`update_circle_outstanding`**: `outstanding = GREATEST(0, outstanding + p_delta)` — the floor-at-zero means over-payments are silently truncated at the circle level (excess is expected to be tracked via `credit_balance`, which this RPC never touches).
- **QuickBill discount** (E2.2): percentage on selected-orders subtotal or flat; `Math.max(0, subtotal − discount)`; discount displayed to 2dp via `toFixed(2)` but stored on the bill through `BillPreviewDialog`'s insert.
- **Seed-data financial identities** (`supabase/functions/seed-production-data/index.ts`): circle rows satisfy `credit_balance = credit_limit − outstanding` exactly (`credit_limit = 50000 + s*25000`, `outstanding = s*1000 + p*500`); seeded bills use `subtotal = round(total × 0.85)` and `gst_amount = round(total × 0.15)` — the **only** rows in the system where `bills.gst_amount` is non-zero (making the stockist GST report show values only on seeded data); B2B order totals `2000 + i*150`; commission earnings `round(total × default_pct / 100)` with the first 5 marked `paid`.
- **Stockist product price variance in seed**: per-stockist multiplier `v = 1 + (s % 3) × 0.05` (0%, 5% or 10% uplift on the 50-product master list), `stock_quantity = 100 + s*20 + p*10`, `min_stock_level = 20`, `gst_rate = '12'`, `hsn_code = '30049099'`, `is_narcotic = (schedule === 'X')` — exactly one Schedule X product (Alprazolam 0.25mg) and one H1 (Tramadol 50mg) exist in the master list, which is what the stockist regulatory reports (§3.7) key on.

### E2.6 API/edge-function reference deep detail

`supabase/config.toml`: project `ggliujfrabwtodwtjnul`; `verify_jwt = false` for all 7 deployed functions (parse-purchase-bill, chat-bot, parse-order-text, autofill-product-details, seed-admin, seed-production-data, architecture-ai). `flowboard-data` is notably **absent from config.toml** despite existing in the repo.

**`parse-order-text`** (118 lines) — verbatim contract:
- Rejects without `Authorization: Bearer …` → 401 `{error:"Unauthorized"}` (header presence check only; token is never verified).
- System prompt (verbatim): *"You are a pharmaceutical order parser. Given free-text order messages (like WhatsApp messages), extract product names and quantities. Match them against the product catalog if possible."* followed by the catalog as `id: name` lines and *"Return results using the extract_order_items tool."*
- Forced tool call `extract_order_items` with schema `{items:[{name:string(required), quantity:number(required), productId:string("Matched product ID from catalog, or empty if no match")}]}`, `additionalProperties:false`.
- Errors: 429 → `{error:"Rate limit exceeded, please try again later."}`; 402 → `{error:"Credits exhausted. Please add credits."}`; other gateway errors → throw → 500 `{error:...}`. Unparseable tool arguments → returns `{items: []}` with 200 (silent degradation).

**`parse-purchase-bill`** (95 lines): no auth check at all. User prompt (verbatim category enum): *"…return: name, brand, category (one of: Analgesics, Antibiotics, Gastrointestinal, Antihistamines, Antidiabetic, Cardiovascular, Vitamins, Dermatological, Respiratory, Antipyretics, Others), mrp, sale_price (or purchase rate), quantity, batch_number, expiry_date (YYYY-MM-DD format), composition (salt/ingredients), pack_size. Return ONLY valid JSON array. If a field is not found, use empty string."* — NOTE this category enum **does not match** the client's `PRODUCT_CATEGORIES` constant (16 values), so AI-extracted categories can be values the product form select can't display. Images go as `data:` URL; non-images embed `file_base64.substring(0, 50000)` in the text prompt (i.e., PDFs are parsed from raw base64 text — effectively lossy). Response parsing: regex `/\[[\s\S]*\]/` over the completion; JSON parse failure returns **HTTP 200** `{error:"Could not parse bill data", raw:<completion>}`. 402 message here differs: `"AI credits exhausted. Please add funds."`.

**`chat-bot`** (114 lines): requires Bearer header; builds a **service-role** client. Step 1 fuzzy quick-question match: words >3 chars from both question and message; overlap counts when either word contains the other; matched if `overlap ≥ 2 OR message.includes(question.slice(0,25))` → returns the canned `answer` with `is_forwarded:false` without calling AI. Step 2 AI: system prompt describes "Digi Swasthya, a B2B pharmaceutical distribution platform" with 5 feature bullets and 5 rules including *"Keep answers under 100 words"* and forwarding language for account-specific issues. `is_forwarded = reply contains "forward" or "admin team"` (lowercased). Every failure path (429, missing reply, thrown error) returns 200 with `{reply:"Your question has been forwarded to our support team. They'll respond shortly.", is_forwarded:true}` except 429 which returns the "busy" reply with `is_forwarded:false`.

**`seed-admin`** (73 lines): POST body **must** supply `{email, password}` (400 `{error:"email and password are required in request body"}` otherwise — credentials are not hardcoded). Idempotent: `listUsers()` scan by email; creates confirmed user (`email_confirm:true`, `full_name:"Admin"`) if absent; ensures a `user_roles` admin row. Returns `{success:true, userId}`. Publicly invocable (`verify_jwt=false`, no other guard) — anyone who knows the URL can mint an admin account.

**`seed-production-data`** (690 lines) — actually **25 phases**, not 17 as summarized earlier: (1) cleanup — deletes 36 data tables row-wise, deletes all non-admin profiles/roles/auth users while preserving the first admin; (2) creates 90 auth users in batches of 10 — 20 stockists, 50 pharmacies, 10 doctors, 10 patients, all `@gmail.com` with password `12345678`, `email_confirm:true`; (3) roles + profiles with deterministic phone scheme `9829{0|1|2|3}{10000+idx}` (digit encodes role); (4) role profiles — all `approval_status:'approved'` plus the per-document `*_status:'approved'` columns; Jaipur/Rajasthan addresses over 25 named areas and 5 PINs `['303328','302021','302012','302025','302044']`; PAN `ABCDE{1000+i}F`, licenses `RJ-PH-2024-{1000+i}`, UPI `stockist{n}@upi`/`pharmacy{n}@upi`, 10 banks/IFSC rotated; (5) 10–15 products per stockist from a 50-product master list + one `product_batches` row each (`BN2025SSPPP` numbering, expiries spread over 2027); (6) 200 pharmacy_inventory rows (first 20 pharmacies × 10 items, all visible); (7) circle (8–15 pharmacies per stockist), serviceable_areas, pharmacy_serviceable_areas (delivery_charge 30–50, free above 500, 24–48h), delivery_settings (charge 50+s*5, free above 5000, Mon–Sat); (8) 20 customer addresses; (9) 3–5 partnerships per doctor (`default_commission_pct = 5+(d%6)`) + 2 rules each (category 'Antibiotic' at pct+2; brand 'Cipla Ltd' at pct+3 **with flat_amount 5** — exercising the flat-beats-pct precedence); (10) 120 B2B orders `ORD-2026-0001…` cycling `['pending','packed','dispatched','delivered','delivered','delivered','cancelled']`, delivered⇒paid, source manual every 5th else platform, ~3 items each; (11) 40 B2C orders `CORD-2026-0001…` cycling 6 statuses, pending orders have `total_amount:0`, `prescription_verified` true for delivered/confirmed; (12) commission earnings for delivered B2C orders via first matching partnership; (13) 60 confirmed payments cycling 4 methods; (14) 25 bills `BILL-2026-####` status `final` + bill_orders; (15) 15 returns (5 rotating reasons, 8 approved / 7 pending) + 8 active credit notes `CN-2026-####`; (16) 25 consultations cycling `['booked','accepted','in_progress','completed','completed','cancelled']` — **`accepted` is seeded but is not a UI-reachable status** — plus prescriptions (3 items each, dosages 1-0-1/0-0-1/1-1-1); (17) delivery staff: 2–3 per stockist (`staff_s{n}_{j}`) + 25 pharmacy staff (`staff_p{n}`), password `12345678` hashed via `hash_password` RPC **with plaintext fallback** `const hash = staffHash || '12345678'`; (18) doctor availability Mon–Sat 09:00–12:00 & 16:00–19:00; (19) consultation settings 5 pharmacies per doctor; (20) notifications — includes types **`system`** and **`stock`** which no client flow ever inserts; (21) 50 peer messages from 5 canned strings; (22) 15 conversations + user/bot chat pairs; (23) 5 counterfeit alerts including alert_type **`substandard`** (not one of the admin UI's 5 types counterfeit/banned/spurious/nsq/recalled); (24) 15 payment reminders alternating `sent_via: 'whatsapp' | 'sms'` (**`sms` is seed-only**; the UI only writes whatsapp); (25) login_activity rows `Chrome on Android`, IPs `103.25.231.100+idx`, `Jaipur, Rajasthan`. Returns `{success, log[], totalUsers}`; errors → 500 with `stack`.

**`get_flowboard_schema()`** (`20260317035555_…`, full SQL now on record): SECURITY DEFINER plpgsql over `information_schema.tables/columns`, FK triple-join through `table_constraints/key_column_usage/constraint_column_usage`, and `pg_policies` (name/cmd/roles/using/withCheck) — returns `jsonb_agg` of `{name, columns[{name,type,nullable,defaultValue}], foreignKeys[{column,foreignTable,foreignColumn}], policies[...]}` for every base table in `public`, `'[]'` fallback. This is live introspection; the client never calls it directly (only `flowboard-data ?type=database` does, service-role).

**Hardcoded demo migration** `20260224185923_…`: pins fixed UUIDs (`stockist 5ff57da6-…`, `pharmacy d4cad4b8-…`, user `030d0e8a-…`), rebrands pharmacy1 as "Shree Ganesh Medical Store", Jitesh Sharma, **Indore, Madhya Pradesh 452001** (contradicting the Jaipur seeder), seeds circle 50000/12500/37500 "Regular customer", orders ORD-001/002/003 (5200 delivered-paid / 7300 dispatched / 5200 pending) and one confirmed UPI payment `UPI-REF-98765`.

**Seeded reference content** (migrations, not the edge fn): `20260224034455_…` seeds 8 stockist-oriented `quick_questions` (products/orders/general/support/registration categories — answers reference exact UI copy like "Bulk Upload Catalogue"/"Bulk Upload Purchase Bill"); `20260225054614_…` seeds 8 pharmacy-oriented quick questions plus 3 counterfeit alerts (Paracetamol 500mg `BN-2025-FAKE1` counterfeit; "Cough Syrup XYZ" banned "Banned by CDSCO due to substandard quality."; Amoxicillin 250mg `AMX-RECALL-01` recalled), attributed to the first admin user.

### E2.7 Role journeys step-by-step (deltas over §19, DB-guard-aware)

**Admin**: (1) Account exists only via `seed-admin` POST (any caller supplying email+password) or manual role insert — there is no admin registration UI. (2) 5-tap login reveal → dashboard. (3) B2B order intervention: pick order → "Change status..." select → `admin_override_order_status` sets the GUC and can force **any** transition, including reviving cancelled/delivered orders. (4) B2C intervention: `admin_override_customer_order_status` performs the update **without** the GUC, so the B2C trigger still rejects illegal jumps — the admin sees a failed mutation for e.g. delivered→pending. (5) Targeted notification path is the only admin action inserting `type:'admin'` notifications (via the RPC that re-checks `has_role`).

**Stockist**: (1) Registration hard-gated by `admin_serviceable_areas` PIN whitelist (admin must seed the PIN first — chicken-and-egg on fresh installs solved only by the seeder). (2) After approval, every status advance walks the SQL map: pending→packed (FIFO batch burn), packed→dispatched, dispatched→out_for_delivery, out_for_delivery→delivered (auto-populate pharmacy inventory) — attempting to skip (e.g. pending→delivered via any future UI) raises `Invalid order status transition`. (3) Cancel is legal from every non-terminal state at DB level. (4) Staff onboarding: create staff (bcrypt via `hash_password`), staff logs in at `/staff/login` through the dual-branch `verify_staff_credentials` (bcrypt or plaintext legacy). (5) Collections: staff-collected cash enters `pending_approval` and only the stockist's Approvals tab can convert it into a confirmed `payments` row + outstanding reduction.

**Pharmacy**: (1) Registration → pending → approval; editing business details later flips `approval_status` back to `pending` (re-verification loop, §4.6) which — because `Login.tsx` gates stockist/pharmacy/doctor on `approval_status` — will **lock the pharmacy out at next login** until re-approved. (2) Purchase side: circle join → order (credit gate) → the pharmacy never deducts stockist stock; goods "arrive" as `pharmacy_inventory` upserts done by the stockist's delivered transition. (3) Sale side: confirm order (DB allows pending→confirmed only) → stock deducts and zero-quantity items are auto-hidden by trigger → preparing → ready_for_pickup/out_for_delivery → delivered (commission calc). (4) Returns from customers end at approve/reject with refund_amount set; stock never returns to inventory (client omission; no trigger compensates).

### E2.8 Hidden/internal functionality

- **`avatars` bucket** — created public with per-user folder policies (`20260223132615_…`), never referenced by any client upload path; dormant infrastructure.
- **`processing` order status** — legal in the DB transition map and in the "Active" tab grouping, but no UI button sets it; reachable only via seeds or direct SQL.
- **`accepted` consultation status, `substandard` alert type, `sms` reminder channel, `system`/`stock`/`admin` notification types** — all writable only by the seeder or RPCs, invisible to the UI's own enumerations (see E2.6 seed phases 16, 23, 24, 20 and `admin_send_targeted_notification`).
- **`products.reserved_quantity`** — column added for feature #48 with default 0; no code path reads or writes it (the actual #48 implementation became `decrement_stock` at order creation).
- **localStorage key `tos_accepted_at`** — written alongside `tos_accepted` (`src/hooks/useToSAcceptance.ts`) but never read anywhere; the matching DB column `profiles.tos_accepted_at` is likewise never written by this hook.
- **Duplicate unique constraints** on order numbers (`orders_order_number_unique` and `orders_order_number_key`) — both live, created by different hardening migrations.
- **Trigger churn** — the same `updated_at` triggers were re-created under 4 different naming schemes across ≥6 migrations (`update_*`, `set_updated_at`, `set_updated_at_*`, `trg_updated_at_*`), evidence of repeated idempotency fixes; final state has overlapping-but-harmless duplicates guarded by `DROP TRIGGER IF EXISTS`.
- **Backlog numbering in SQL comments** (`#30…#216`) forms a hidden feature registry recoverable from migrations alone (catalogued in E2.3).
- **Deterministic demo phone numbers** — `9829{role-digit}{10000+idx}` lets any tester derive a user's phone from their email; staff phones use `70140`/`70141` prefixes.
- **`flowboard-data` missing from config.toml** — deployed function without a `verify_jwt` declaration (platform default applies), unlike its 7 siblings.
- **Seeder is destructive and unauthenticated** — `seed-production-data` deletes *all* non-admin auth users and data with no confirmation token; combined with `verify_jwt=false` this is a live reset endpoint.

### E2.9 Validation & error-handling catalog (verbatim)

**Database-raised exceptions** (surface as Supabase error objects): `Invalid order status transition: % to %`; `Invalid customer order status transition: % to %`; `Only admins can override order status`; `Only admins can override customer order status`; `Only admins can send targeted notifications`.

**Edge-function error strings**: `Unauthorized` (parse-order-text/autofill/chat-bot 401); `Rate limit exceeded, please try again later.` (429); `Credits exhausted. Please add credits.` (parse-order-text 402) vs `AI credits exhausted. Please add funds.` (parse-purchase-bill 402); `AI processing failed` (parse-purchase-bill gateway 500); `Could not parse bill data` (200-with-error); `email and password are required in request body` (seed-admin 400); chat-bot fallbacks `Our support system is busy right now. Please try again in a moment.` / `Your question has been forwarded to our support team. They'll respond shortly.`; `LOVABLE_API_KEY is not configured` / `LOVABLE_API_KEY not configured` (inconsistent phrasing between functions).

**Client toast validation messages** (Admin/Stockist/Pharmacy surfaces, grep-verified across `src/pages/{admin,stockist,pharmacy}` and `src/components/{stockist,pharmacy,shared}`): "Add items" · "Already in your circle" · "Cannot remove all items. Cancel instead." · "Could not parse items" · "Customers cannot be suspended via approval status" · "Email and title required" · "Email required" · "End date must be after start date" · "Enter a valid amount" · "Enter a valid quantity" · "Enter order items" · "Enter substitute name" · "Enter valid %" · "Enter valid 6-digit PIN" · "Enter valid rate" · "Export failed" · "Failed to generate PDF" · "Failed to logout all sessions" · "Failed to parse file" · "Failed to process bill" · "Failed to upload file" · "Failed" · "Fill all fields" · "Fill question & answer" · "Fill required fields" · "Invalid amount" · "Invalid quantities" · "Item name required" · "Match at least one product" · "Min 8 characters" · "Name and monthly price required" · "Name required" · "Name, phone, username and password are required" · "No bill data for selected period" · "No data to export" · "No items available in stock" · "No matching data for this report" · "No pharmacies selected" · "No product data available" · "No products could be extracted" · "No products to export" · "No users found" · "No valid products found in file" · "PDF generation failed" · "PIN already added" · "PIN already exists" · "PIN code required" · "Password must be at least 6 characters" · "Passwords don't match" · "Paste order text first" · "Please enter a rejection reason" · "Please fill batch number or stock quantity" · "Please fill required fields" · "Please fill start and end dates" · "Product name is required" · "Product name required" · "Required fields missing" · "Same user" · "Select a pharmacy" · "Select a product" · "Select at least one order" · "Select items for split order" · "Select items to deliver" · "Select items to return" · "Select stockist and enter amount" · "Source and destination batch must differ" · "Title is required" · "Title required" · "Upload failed" · "User not found with this email" · "User not found".

**Template-literal toasts**: `` `${errors.length} validation error(s)` `` (BulkUploadCatalogue) · `` `Failed to upload ${file.name}` `` (ProductGalleryUploader) · `` `Only ${maxQty} units available in source batch` `` (StockistStockTransfer) · `` `Order exceeds credit limit. Outstanding: ₹${outstanding}, Cart: ₹${cartTotal.toFixed(2)}, Limit: ₹${creditLimit}` `` (PharmacyStockistDetail) · `` `${mismatches.length} discrepancies reported to stockist` `` (PharmacyOrderDetail verify-received flow).

**Notable phrasing inconsistencies** (potential UX/consistency findings recorded as fact): password minimum appears as both "Min 8 characters" and "Password must be at least 6 characters" in different screens; "Product name is required" vs "Product name required"; "Title required" vs "Title is required"; "Fill required fields" vs "Please fill required fields" vs "Required fields missing" — all distinct strings in code.

*End of Expansion Pass 2. Sources for this pass: all 44 files under `supabase/migrations/`, `supabase/config.toml`, all 7 edge functions read line-by-line (`parse-order-text`, `parse-purchase-bill`, `chat-bot`, `seed-admin`, `seed-production-data` in full; `autofill-product-details`, `architecture-ai` prompt sections), `src/components/stockist/QuickBillDialog.tsx`, `src/components/shared/ToSDialog.tsx`, `src/components/shared/ProductGalleryUploader.tsx`, `src/hooks/useToSAcceptance.ts`, plus exhaustive greps for toast messages, SQL exceptions, and policy expressions.*


# Source: digimvplaunch

## 0. GLOBAL ARCHITECTURE & CROSS-CUTTING FACTS

### 0.1 Routing (`src/App.tsx`)
Provider tree: `QueryClientProvider > TooltipProvider > Toaster + Sonner > AuthProvider > AppStateProvider > BrowserRouter > Routes`.

**Public routes (no `AppLayout`, no auth guard):**
- `/` → `<Navigate to="/auth">`
- `/auth` → `AuthPage` (default entry)
- `/login` → `<Navigate to="/auth">`
- `/signup` → `<Navigate to="/auth">`
- `/admin-login` → `AdminLogin`
- `/register/pharmacist` → `PharmacyRegistration`
- `/register/stockist` → `StockistRegistration`
- `/forgot-password` → `ForgotPassword`
- `/reset-password` → `ResetPassword`
- `/onboarding` → `Onboarding`

**Protected routes (children of `<AppLayout>`, only guard = `isAuthenticated`):**
- Shared: `/dashboard`, `/notifications`, `/orders/:id`, `/orders/:id/return`, `/support`
- Admin: `/admin/approvals`, `/admin/users` (both → `ApprovalCenter`), `/admin/stockists`, `/admin/pharmacies`, `/admin/pharmacies/:id`, `/admin/orders` (`OrderList roleFilter="admin"`), `/admin/transactions`, `/admin/ledger`, `/admin/notifications` (→ `Notifications`), `/admin/commission`, `/admin/counterfeit`, `/admin/banners`, `/admin/suspensions`, `/admin/user-flow`, `/admin/stockists/:id`, `/admin/profile`, `/admin/settings`, `/admin/payments`, `/admin/analytics`
- Stockist: `/stockist/inventory`, `/stockist/inventory/add`, `/stockist/inventory/upload`, `/stockist/inventory/bills`, `/stockist/inventory/bulk-price`, `/stockist/quick-bill`, `/stockist/inventory/:id`, `/stockist/inventory/:id/edit`, `/stockist/batches`, `/stockist/circle`, `/stockist/circle/find`, `/stockist/circle/:id`, `/stockist/orders` (`roleFilter="stockist"`), `/stockist/orders/create`, `/stockist/payments`, `/stockist/credit` (both → `StockistPayments`), `/stockist/reports`, `/stockist/analytics`, `/stockist/delivery`, `/stockist/holidays`, `/stockist/subscription`, `/stockist/profile`, `/stockist/settings` (route declared **twice**, duplicate)
- Pharmacist: `/pharmacist/browse`, `/pharmacist/stockists`, `/pharmacist/stockists/find`, `/pharmacist/stockists/:id`, `/pharmacist/cart`, `/pharmacist/checkout`, `/pharmacist/orders` (`roleFilter="pharmacist"`), `/pharmacist/orders/quick`, `/pharmacist/payments`, `/pharmacist/addresses`, `/pharmacist/delivery-preferences`, `/pharmacist/inventory`, `/pharmacist/profile`, `/pharmacist/settings`
- `*` → `NotFound`

**No route is role-guarded.** `AppLayout` only checks `isAuthenticated` (else `<Navigate to="/login">`, which redirects to `/auth`). Any authenticated user of any role can hit any route; `Dashboard.tsx` switches on `role` to pick the home screen, and navigation menus differ, but the routes themselves are open. `PaymentsPage.tsx` exists and is fully built but is **NOT routed** (dead component — replaced by `StockistPayments`/`PharmacistPayments`).

### 0.2 Roles (`src/core/roles.ts`, `types.ts`)
- `UserRole = 'admin' | 'stockist' | 'pharmacist'`.
- `rolePermissions` capability matrix exists (e.g. stockist `canManageInventory/canManageCircle/canManageSubscription`; pharmacist `canBrowseMedicines/canPlaceOrders`; admin `canManageUsers/canFlagCounterfeit/canManageBanners`) — **used for labels/menus only; no route enforces any flag.** `roleLabels` and `roleDescriptions` provide display strings.

### 0.3 AuthContext (`src/contexts/AuthContext.tsx`)
- Persists `{ user, role }` to `digi-swasthya-auth`.
- `login(email, password, role)` → `setIsLoading(true)` → `await setTimeout(1200ms)` → `getUserByCredentials()`. That function returns the matching seed user for exact dummy creds, **but has a `switch` fallback that returns the role's first seed user regardless of email/password** — so login **always succeeds** for any input. "Invalid credentials" branches in AuthPage/Login/AdminLogin are dead code.
- Dummy credentials: admin `admin@digiswasthya.in / Admin@123`, stockist `suresh@medcorp.in / Stock@123`, pharmacist `ramesh@citycare.in / Pharma@123`.
- `logout()` clears state + storage. `setRole(role)` swaps to that role's first seed user (a demo role-switch — not surfaced in any UI I found).
- `isAuthenticated = !!user`.

### 0.4 AppStateContext (`src/contexts/AppStateContext.tsx`) — "the database" (~1050 lines)
Single provider persisting ~29 slices to `digi-swasthya-state` via a `useEffect` on every change. Merges seed data with dynamic overrides. Exhaustive engine detail is in §11.

**Persisted slices:** `cartItems, dynamicOrders, dynamicPayments, dynamicLedger, invoices, reminders, connectedStockists, orderStatusOverrides, dynamicStockists, dynamicPharmacists, userStatusOverrides, dynamicMedicines, dynamicBatches, batchQtyOverrides, counterfeitOverrides, dynamicBanners, bannerOverrides, deletedBannerIds, circleEntries, addresses, orderCounter (init 10), invoiceCounter (init 5), deliveryAreas, deliverySlots, holidays, returnRequests, creditNotes, pharmacyInventory, supportMessages`.

**Default seeded-in-provider data (NOT from `/data`):** 9 `defaultCircleEntries` (`circle-001..009`), 7 `addresses` (`addr-001..007`), 3 `deliveryAreas` (`sa-001..003`; sa-003 inactive), 3 `deliverySlots` (Morning/Afternoon/Evening).

### 0.5 Layout & navigation (`AppLayout`, `Navigation`)
- **AppLayout:** desktop `TopNav` + mobile sticky header + `<Outlet>` + mobile `BottomNav` + `GlobalSearchOverlay`. Mobile header shows "Digi Swasthya" / "{role} Panel", search button, notifications bell (**static red dot always shown**), and an avatar button that **logs out** on click.
- **BottomNav (mobile, 5 items/role):**
  - admin: Home `/dashboard`, Pharmacies `/admin/pharmacies`, Stockists `/admin/stockists`, Orders `/admin/orders`, More `/admin/settings`
  - stockist: Home, Products `/stockist/inventory`, Pharmacies `/stockist/circle`, Orders `/stockist/orders`, More `/stockist/settings`
  - pharmacist: Home, Orders `/pharmacist/orders`, Stockists `/pharmacist/stockists`, Payments `/pharmacist/payments`, More `/pharmacist/settings`
- **TopNav (desktop):** logo → `/dashboard`, horizontal nav (role-specific, wider set), search button, bell → `/admin/notifications` (admin) or `/notifications` (others) with static red dot, avatar initial, "Logout" text button.
  - admin desktop: Dashboard, Verifications, Stockists, Pharmacies, Orders, Payments, Analytics, Transactions, Ledger, Commission
  - stockist desktop: Dashboard, Inventory, Circle, Orders, Payments, Holidays, Reports, Analytics, Delivery
  - pharmacist desktop: Dashboard, Stockists, Browse, Inventory, Orders, Payments, Cart
- `NavLink.tsx` is an unused compat wrapper for RouterNavLink.

### 0.6 GlobalSearch (`GlobalSearchOverlay`)
- Full-screen overlay; Esc closes; auto-focuses input after 100ms; placeholder adapts to path (products/pharmacies/orders/anything).
- Searches: `allInventory` by name/genericName/category (max 4), approved `allPharmacists` by pharmacyName/name (max 3), `allOrders` by orderNumber/placedBy.name (max 3). Empty query → "Start typing to search…"; no matches → "No results for …".
- **BUG/quirk:** product click → `/stockist/inventory/{id}`, pharmacy click → `/stockist/circle/{id}` regardless of current role (pharmacist/admin land on stockist routes). Order click → `/orders/{id}` (fine).

### 0.7 Notifications (`/notifications`, `/admin/notifications`)
- Merges **dynamic** notifications from `allOrders.slice(0,5)` (title depends on status: placed→"New Order", confirmed→"Order Confirmed", delivered→"Order Delivered", else "Order {status}"; `read = status==='delivered'`) with **5 seed** notifications (`notif-001..005` from `banners.ts`).
- Filtered by relevance: `target==='all'` OR role-target match (`stockists`/`pharmacists`) OR `target===user.id`.
- Click a card → `markRead` (local state only, not persisted). Read cards show a check. Empty → "No notifications yet".

### 0.8 Settings hub (`/{role}/settings` → `Settings.tsx`)
- **Not a preferences screen** — a searchable navigation menu. User card (avatar initial, name, role label), search box (filters menu by label/desc), grouped menu sections, logout button, footer "Digi Swasthya v1.0.0".
- Menu items are hardcoded per role (admin/stockist/pharmacist). Two "Help Center" items use `path: '#'` → click is a **no-op** (guarded by `item.path !== '#'`). All other items navigate.
- Admin sections: Account (Profile), Users (Verifications, Stockists, Pharmacies, Suspensions), Finance (Payments, Transactions, Platform Ledger, Commission Setup), Analytics & Monitoring (Analytics, Counterfeit Management, User Flow), Content (Banner Management, Notifications), Preferences (Support, Help Center#).
- Stockist sections: Account (Profile), Inventory (Products, Batch Management, Bulk Upload, Bulk Price Update, Purchase Bills), Orders & Billing (Orders, Quick Bill, Create Order, Payments), Business (Circle Pharmacies, Holidays, Reports, Analytics, Delivery Setup, Subscription), Preferences (Notifications, Support, Help Center#).
- Pharmacist sections: Account (Profile), Orders & Billing (My Stockists, Quick Order, Browse Medicines, Cart, Orders, Payments), Management (My Inventory, Addresses, Delivery Preferences), Preferences (Notifications, Support, Help Center#).
- **No theme toggle, no notification-preference toggles** exist despite the "Preferences" label.

### 0.9 Support chat (`/support` → `SupportChat`)
- Persists messages via `addSupportMessage`. Shows messages where `userId===me` OR `isAgent` (**agent/bot messages are visible to ALL users** — cross-user leak). Auto-scrolls to bottom.
- Send → adds user message, then after **1500ms** appends a bot reply picked randomly from 3 canned lines (`autoReplies[Math.floor(Math.random()*…)]`). Bot posts as userRole `admin`, name "Support Bot". Empty state: "Send a message to start the conversation".

### 0.10 Shared UI patterns (`src/core/ui-patterns`)
- `StatCard` (label/value/optional change%+trend up/down/neutral icon), `StatusChip` (6 variants: success/warning/destructive/primary/accent/muted; capitalizes label), `EmptyState` (icon default PackageOpen, title, desc, optional action), `ErrorState` (unused in screens), `LoadingSkeleton` (types card/list/stat), `Banner` (dismissible, variants info/warning/success, optional CTA with ExternalLink icon), `ProfileSection` (admin/edit modes, doc grid + preview dialog whose body says "Document preview not available in prototype"), `EditProfileModal` (generic field list; `handleSave` awaits **800ms** then calls onSave — every consumer's onSave is toast-only).
- Toasts: shadcn `use-toast` with `TOAST_LIMIT = 1`, `TOAST_REMOVE_DELAY = 1_000_000` ms.

### 0.11 Cross-cutting conventions & constants
- **GST = flat 12%** everywhere an order/tax is computed: `Math.round(subtotal * 0.12)` (Cart, Checkout, CreateOrder, QuickBill, QuickOrder, OrderDetail edit, CirclePharmacyDetail preview). No SGST/CGST split, no per-item GST%, no delivery-fee in any total.
- **Discount = hardcoded 0** on every dynamically created order line. The `(mrp − selling)` gap is only shown visually (struck-through MRP), never in totals.
- **lowStockThreshold = 100** (hardcoded in `allInventory` derivation and seed `inventoryItems`).
- **Low-stock UI thresholds are inconsistent:** Browse uses batch qty `< 10`; PharmacistStockistDetail uses `< 100`; Inventory list uses `totalStock <= lowStockThreshold (100)`.
- **Rx badge** = hardcoded heuristic `medicine.category === 'Antibiotic'` (Inventory, BrowseMedicines, PharmacyDetail).
- **Expiry windows:** BatchManagement "Expiring Soon" ≤ 90 days; PharmacistInventory "Expiring Soon" ≤ 90 days; Inventory filter: soon ≤30d, 1-3 = 30–90d, 3-6 = 90–180d.
- **Artificial loading delays:** 600ms skeleton on Inventory, BatchManagement, OrderList, ApprovalCenter, Transactions, PlatformLedger, CommissionSetup, Suspensions, PaymentsPage; 700ms on BrowseMedicines; 500ms on AddItem/EditProduct submit; 1000ms on OrderDetail actions; 1200ms on login/forgot/reset; 800ms in EditProfileModal.
- **ID conventions:** `order-dyn-{n}`, `ORD-YYYYMMDD-####`, `INV-2024-###`, `inv-{n}`, `led-dyn-{ts}-{n}`, `led-pay-{ts}`, `pay-dyn-{ts}`, `rem-{ts}`, `circle-{ts}`, `addr-{ts}`, `ret-{ts}`, `cn-{ts}`, `msg-{ts}`, `hol-{ts}`, `sa-{ts}`, `slot-{ts}`, `med-dyn-{ts}`, `batch-dyn-{ts}`, `pharma-circle-{ts}`, `TXN-{ts}`, `PAY-{ts}`, `oi-*`, `pi-{orderId}-{idx}`.
- Currency: `₹` + `toLocaleString('en-IN')`; large figures abbreviated `₹{(x/1000).toFixed(...)}K`.
- **No real deep links:** no `wa.me`, no `upi://pay`. The only real device links are `tel:` and `navigator.clipboard` in CirclePharmacyDetail. WhatsApp "sends" are `sendReminder` records + toast + a "📱 Send via WhatsApp" button label.

---

## 7. ADMIN MODULE

Recurring quirk: `ApprovalStatus` defines `'suspended'`, but nearly every "Suspend" action writes `'rejected'`. The true `'suspended'` enum is written **nowhere** (only appears as documentation in UserFlowPage and `getStatusDisplayLabel`).

### 7.1 AdminDashboard (`/dashboard` role=admin)
- Banner (first active 'all'; **CTA `onCtaClick={() => {}}` — no-op**). 4 StatCards, 3 Quick Actions, Recent Orders (first 5).
- **KPIs:** Total GMV = `Σ grandTotal of all orders` (`₹{k}K`, **change hardcoded +12%**). Pending Approvals = pending stockists+pharmacists count. Active Users = approved stockists+pharmacists (**change hardcoded +8%**). Flagged Items = counterfeit inventory count.
- Quick Actions: Approvals, Notify (→ notifications), Commission.

### 7.2 ApprovalCenter (`/admin/approvals`, `/admin/users`)
- 600ms skeleton. Search (name/email). Filter chips: all/pending/approved(→"Verified")/rejected/update_required(→"Update Req.").
- Expandable rows (stockist vs pharmacist detail: email/phone; stockist → businessName/GST/DL/serviceAreas + document chips; pharmacist → pharmacyName/license/city,state).
- **Actions (real, persisted):** Verify → `approved`, Reject → `rejected`, Request Update → `update_required` (all via `updateUserStatus`), View Details → detail page.

### 7.3 StockistList (`/admin/stockists`) / PharmacyList (`/admin/pharmacies`)
- Searchable expandable lists. Expanded: GST/DL/areas/plan (stockist) or license/address (pharmacy). Suspend toggles `rejected ↔ approved` (button label Suspend/Reinstate). View Profile → detail. (PharmacyList row header also has an inner onClick to detail with stopPropagation.)

### 7.4 StockistDetail (`/admin/stockists/:id`)
- 4 action buttons: Verify→approved, Reject→rejected, Request Update→update_required, **Suspend→rejected** (writes 'rejected', toast "Suspended"). ProfileSection cards (adminMode, read-only): Business, Regulatory Documents (with preview), Contact & Address, Delivery Setup, Business Rules, Financial.

### 7.5 PharmacyDetail (`/admin/pharmacies/:id`)
- Same 4 actions (Suspend→rejected). Tabs: Details / Inventory / Orders.
  - Details: Business, Regulatory Documents, Contact & Address, Business Configuration.
  - **Inventory tab BUG:** shows **global `allInventory.slice(0,10)`**, not the pharmacy's inventory. Rx badge = Antibiotic.
  - Orders: pharma's first 10 orders → `/orders/{id}`.

### 7.6 Suspensions (`/admin/suspensions`)
- 600ms skeleton. Lists users whose status is **`rejected`** (treated as suspended). Reinstate → `approved`. Empty: "All users are active".

### 7.7 CounterfeitManagement (`/admin/counterfeit`)
- 600ms skeleton. 2 stat cards: Flagged Products (`allMedicines.filter(isCounterfeit)`), Flagged Batches (`allBatches.filter(isCounterfeit)`). Search. Med list with Flag/Unflag → `toggleCounterfeit(medId)` (**real; enforced in cart/order validation**; flagging a med also flags its batches via `allBatches` derivation). Flagged rows show "All sales restricted".

### 7.8 BannerManagement (`/admin/banners`) — real CRUD
- Create form: Title, CTA Text, Message, Target (all/stockists/pharmacists) → `addBanner` (requires title+message). List with active toggle (Eye/EyeOff → `updateBanner`) + delete (`deleteBanner`). Seed banners edited via `bannerOverrides`; deletions via `deletedBannerIds`.

### 7.9 CommissionSetup (`/admin/commission`) — **NOT PERSISTED**
- 600ms load seeds `commissionRules` into **local** state. Add rule form: Category, Rate (%), Applied To (all / specific stockist) → local add. Delete → local. **Never touches AppState; rates never applied to any order/payment.**

### 7.10 AdminPayments (`/admin/payments`)
- Payments view from all payments (from→to, amount, date, method, status verified/pending). Tabs all/verified/pending (with counts).
- **StatCards:** Total Volume, Verified, **Commission = `Math.round(totalVolume × 0.05)` (hardcoded 5%, unrelated to CommissionSetup)**, Active Parties (unique from+to). All trends "up".

### 7.11 Transactions (`/admin/transactions`)
- 600ms skeleton. Search (reference/orderNumber). Status chips all/paid/partial/pending/overdue. Rows: order#, reference·method, amount, StatusChip, due/paid dates. Data-driven from `allPayments`.

### 7.12 PlatformLedger (`/admin/ledger`)
- 600ms skeleton. 3 StatCards: Total Debit (`Σ debit`), Total Credit (`Σ credit`), **Balance = last ledger entry's `.balance` field** (NOT recomputed; ignores `getLedgerBalance`; so it just reflects the last seed/dynamic entry's stored running balance). Table Date/Description/Party/Debit/Credit/Balance.

### 7.13 AdminAnalytics (`/admin/analytics`) — **MOSTLY FAKE**
- Period select (inert). StatCards: GMV (real `Σ grandTotal`), Orders (real count), **Users "78" (hardcoded)**, **Growth "+24%" (hardcoded)**.
- Revenue Trend LineChart (**hardcoded** Jun–Nov). User Growth LineChart (**hardcoded** stockists/pharmacies). Order Distribution pie (**REAL** from statuses). Top Pharmacies (**REAL** by `Σ grandTotal`, top 5).

### 7.14 AdminProfile (`/admin/profile`)
- Fabricated inline `admin` object (name from user, email fallback `admin@digiswasthya.com`, phone `+91 99999 00000`, createdAt 2024-01-01). Account Details grid. Edit modal (name/email/phone) → **toast only, not persisted**.

### 7.15 UserFlowPage (`/admin/user-flow`) — **STATIC DOCUMENTATION**
- 6 tabs: Entity Relations, Lead → Order Flow, Order Lifecycle (+ Cancel Flow), Payment & Credit (Payment + Credit flows), Inventory & Batch (+ Warnings), Admin Control (+ Admin Operations). Searchable. Expandable entity/flow-step cards with Actions, "Data Operations" pseudo-DB pills (e.g. `orders.update(status)`, `ledger.insert(debit)`, `inventory.reserve`, `batches.sort(expiry)`), status chips, warnings.
- Describes an **idealized backend the MVP does not implement** (reservation vs deduction, automated reminders, FIFO-by-expiry engine, commission-on-order, suspension access-block, refunds). It's the only place `suspended`/`flagged`/`credit`/`settled`/`completed` appear as first-class statuses.

---

## EXPANSION — Code-Derived Additions (Audit Pass)

*Audit date: 2026-07-04. Content derived exclusively from source under `digimvplaunch/`. Documents implemented behavior only.*

### E.1 Complete Route Table

**Frontend routes extracted:** 73 | **Server API routes:** 0

| # | Path | Component | Role/Gate | Source |
|---|------|-----------|-----------|--------|
| 1 | `/` | Navigate | — | `src/App.tsx` |
| 2 | `/auth` | AuthPage | — | `src/App.tsx` |
| 3 | `/login` | Navigate | — | `src/App.tsx` |
| 4 | `/signup` | Navigate | — | `src/App.tsx` |
| 5 | `/admin-login` | AdminLogin | — | `src/App.tsx` |
| 6 | `/register/pharmacist` | PharmacyRegistration | — | `src/App.tsx` |
| 7 | `/register/stockist` | StockistRegistration | — | `src/App.tsx` |
| 8 | `/forgot-password` | ForgotPassword | — | `src/App.tsx` |
| 9 | `/reset-password` | ResetPassword | — | `src/App.tsx` |
| 10 | `/onboarding` | Onboarding | — | `src/App.tsx` |
| 11 | `/dashboard` | Dashboard | — | `src/App.tsx` |
| 12 | `/notifications` | Notifications | — | `src/App.tsx` |
| 13 | `/admin/approvals` | ApprovalCenter | — | `src/App.tsx` |
| 14 | `/admin/users` | ApprovalCenter | — | `src/App.tsx` |
| 15 | `/admin/stockists` | StockistList | — | `src/App.tsx` |
| 16 | `/admin/pharmacies` | PharmacyList | — | `src/App.tsx` |
| 17 | `/admin/pharmacies/:id` | PharmacyDetail | — | `src/App.tsx` |
| 18 | `/admin/orders` | OrderList | — | `src/App.tsx` |
| 19 | `/admin/transactions` | Transactions | — | `src/App.tsx` |
| 20 | `/admin/ledger` | PlatformLedger | — | `src/App.tsx` |
| 21 | `/admin/notifications` | Notifications | — | `src/App.tsx` |
| 22 | `/admin/commission` | CommissionSetup | — | `src/App.tsx` |
| 23 | `/admin/counterfeit` | CounterfeitManagement | — | `src/App.tsx` |
| 24 | `/admin/banners` | BannerManagement | — | `src/App.tsx` |
| 25 | `/admin/suspensions` | Suspensions | — | `src/App.tsx` |
| 26 | `/admin/user-flow` | UserFlowPage | — | `src/App.tsx` |
| 27 | `/admin/stockists/:id` | StockistDetail | — | `src/App.tsx` |
| 28 | `/admin/profile` | AdminProfile | — | `src/App.tsx` |
| 29 | `/admin/settings` | SettingsPage | — | `src/App.tsx` |
| 30 | `/admin/payments` | AdminPayments | — | `src/App.tsx` |
| 31 | `/admin/analytics` | AdminAnalytics | — | `src/App.tsx` |
| 32 | `/stockist/inventory` | Inventory | — | `src/App.tsx` |
| 33 | `/stockist/inventory/add` | AddItem | — | `src/App.tsx` |
| 34 | `/stockist/inventory/upload` | BulkUpload | — | `src/App.tsx` |
| 35 | `/stockist/inventory/bills` | PurchaseBills | — | `src/App.tsx` |
| 36 | `/stockist/inventory/bulk-price` | BulkPriceUpdate | — | `src/App.tsx` |
| 37 | `/stockist/quick-bill` | QuickBill | — | `src/App.tsx` |
| 38 | `/stockist/inventory/:id` | ProductDetail | — | `src/App.tsx` |
| 39 | `/stockist/inventory/:id/edit` | EditProduct | — | `src/App.tsx` |
| 40 | `/stockist/batches` | BatchManagement | — | `src/App.tsx` |
| 41 | `/stockist/circle` | CirclePharmacies | — | `src/App.tsx` |
| 42 | `/stockist/circle/find` | FindPharmacy | — | `src/App.tsx` |
| 43 | `/stockist/circle/:id` | CirclePharmacyDetail | — | `src/App.tsx` |
| 44 | `/stockist/orders` | OrderList | — | `src/App.tsx` |
| 45 | `/stockist/orders/create` | CreateOrder | — | `src/App.tsx` |
| 46 | `/stockist/payments` | StockistPayments | — | `src/App.tsx` |
| 47 | `/stockist/credit` | StockistPayments | — | `src/App.tsx` |
| 48 | `/stockist/reports` | Reports | — | `src/App.tsx` |
| 49 | `/stockist/analytics` | Analytics | — | `src/App.tsx` |
| 50 | `/stockist/delivery` | DeliverySetup | — | `src/App.tsx` |
| 51 | `/stockist/holidays` | HolidayManagement | — | `src/App.tsx` |
| 52 | `/stockist/subscription` | SubscriptionPage | — | `src/App.tsx` |
| 53 | `/stockist/profile` | StockistProfilePage | — | `src/App.tsx` |
| 54 | `/stockist/settings` | SettingsPage | — | `src/App.tsx` |
| 55 | `/pharmacist/browse` | BrowseMedicines | — | `src/App.tsx` |
| 56 | `/pharmacist/stockists` | PharmacistStockists | — | `src/App.tsx` |
| 57 | `/pharmacist/stockists/find` | FindStockist | — | `src/App.tsx` |
| 58 | `/pharmacist/stockists/:id` | PharmacistStockistDetail | — | `src/App.tsx` |
| 59 | `/pharmacist/cart` | Cart | — | `src/App.tsx` |
| 60 | `/pharmacist/checkout` | Checkout | — | `src/App.tsx` |
| 61 | `/pharmacist/orders` | OrderList | — | `src/App.tsx` |
| 62 | `/pharmacist/orders/quick` | QuickOrder | — | `src/App.tsx` |
| 63 | `/pharmacist/payments` | PharmacistPayments | — | `src/App.tsx` |
| 64 | `/pharmacist/addresses` | Addresses | — | `src/App.tsx` |
| 65 | `/pharmacist/delivery-preferences` | DeliveryPreferences | — | `src/App.tsx` |
| 66 | `/pharmacist/inventory` | PharmacistInventory | — | `src/App.tsx` |
| 67 | `/pharmacist/profile` | PharmacistProfile | — | `src/App.tsx` |
| 68 | `/pharmacist/settings` | SettingsPage | — | `src/App.tsx` |
| 69 | `/orders/:id` | OrderDetail | — | `src/App.tsx` |
| 70 | `/orders/:id/return` | ReturnRequestPage | — | `src/App.tsx` |
| 71 | `/support` | SupportChat | — | `src/App.tsx` |
| 72 | `/*` | NotFound | — | `src/App.tsx` |

### E.2 Entity / Table Catalog

**Tables/schemas found:** 0

### E.3 API / Backend Surface

### E.4 Auth, Roles, and Permissions

#### Roles referenced in code

- `admin`
- `alert`
- `group`
- `link`
- `navigation`
- `pharmacist`
- `presentation`
- `region`
- `separator`
- `stockist`

#### RLS policies (migrations)


### E.5 Workflows and State Machines

#### `status_values`

`active` → `approved` → `cancelled` → `confirmed` → `delivered` → `dispatched` → `draft` → `paid` → `partial` → `pending` → `rejected` → `unpaid`

#### Edge-function status mutations


### E.6 Dashboards, Reports, and Formulas

**Extracted calculation lines:** 88

#### `src/modules/admin/AdminAnalytics.tsx`

- L23: `const totalGMV = allOrders.reduce((s, o) => s + o.grandTotal, 0);`
- L24: `const totalOrders = allOrders.length;`
- L44: `pharmacyRevenue[pharmaId].revenue += o.grandTotal;`
- L61: `<StatCard label="GMV" value={`₹${(totalGMV / 1000).toFixed(1)}K`} icon={<DollarSign className="h-5 w-5" />} trend="up" />`
- L62: `<StatCard label="Orders" value={totalOrders} icon={<ShoppingCart className="h-5 w-5" />} trend="up" />`

#### `src/modules/admin/AdminDashboard.tsx`

- L11: `const totalGMV = allOrders.reduce((s, o) => s + o.grandTotal, 0);`
- L12: `const totalCollected = allPayments.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0);`
- L13: `const flaggedItems = allInventory.filter(i => i.medicine.isCounterfeit).length;`
- L25: `<StatCard label="Total GMV" value={`₹${(totalGMV / 1000).toFixed(1)}K`} icon={<DollarSign className="h-5 w-5" />} change={12} trend="up" />`
- L43: `<Button variant="outline" className="h-auto flex-col gap-2 py-4 rounded-xl" onClick={() => navigate('/admin/commission')}>`
- L45: `<span className="text-xs">Commission</span>`
- L63: `<p className="text-sm font-semibold">₹{order.grandTotal.toLocaleString()}</p>`

#### `src/modules/admin/AdminPayments.tsx`

- L26: `const totalVolume = paymentsList.reduce((s, p) => s + p.amount, 0);`
- L27: `const verified = paymentsList.filter(p => p.status === 'verified').reduce((s, p) => s + p.amount, 0);`
- L28: `const commission = Math.round(totalVolume * 0.05);`
- L39: `<StatCard label="Total Volume" value={`₹${(totalVolume / 1000).toFixed(1)}K`} icon={<IndianRupee className="h-5 w-5" />} trend="up" />`
- L41: `<StatCard label="Commission" value={`₹${commission.toLocaleString()}`} icon={<TrendingUp className="h-5 w-5" />} trend="up" />`

#### `src/modules/payments/PaymentsPage.tsx`

- L15: `const [tab, setTab] = useState<'payments' | 'ledger' | 'credit'>('payments');`
- L30: `const totalOutstanding = allOrders`
- L32: `.reduce((sum, o) => {`
- L33: `const paid = allPayments.filter(p => p.orderId === o.id).reduce((s, p) => s + p.amount, 0);`
- L34: `return sum + Math.max(0, o.grandTotal - paid);`
- L37: `const totalOverdue = allPayments`
- L39: `.reduce((s, p) => s + p.amount, 0);`
- L42: `const creditLimit = 500000;`
- L43: `const usedCredit = totalOutstanding;`
- L47: `const existingPaid = allPayments.filter(p => p.orderId === payment.orderId && p.status === 'paid').reduce((s, p) => s + p.amount, 0);`
- L48: `const remaining = order ? order.grandTotal - existingPaid : payment.amount;`
- L65: `<StatCard label="Outstanding" value={`₹${(totalOutstanding / 1000).toFixed(1)}K`} icon={<DollarSign className="h-5 w-5" />} trend="down" />`
- L66: `<StatCard label="Overdue" value={`₹${(totalOverdue / 1000).toFixed(1)}K`} icon={<AlertTriangle className="h-5 w-5" />} trend="down" />`
- L70: `{(['payments', 'ledger', 'credit'] as const).map(t => (`
- L118: `{e.credit > 0 && <span className="text-success">+₹{e.credit.toLocaleString()}</span>}`
- L125: `{tab === 'credit' && (`
- L129: `<span className="text-muted-foreground">Credit Limit</span>`
- L130: `<span className="font-semibold">₹{creditLimit.toLocaleString()}</span>`
- L133: `<div className="bg-primary rounded-full h-2" style={{ width: `${Math.min(100, (usedCredit / creditLimit) * 100)}%` }} />`
- L135: `<p className="text-xs text-muted-foreground">₹{usedCredit.toLocaleString()} used of ₹{creditLimit.toLocaleString()}</p>`
- L139: `const paid = allPayments.filter(p => p.orderId === o.id).reduce((s, p) => s + p.amount, 0);`
- L140: `const remaining = Math.max(0, o.grandTotal - paid);`

#### `src/modules/payments/PharmacistPayments.tsx`

- L19: `const [payingStockistId, setPayingStockistId] = useState('');`
- L20: `const [payingStockistName, setPayingStockistName] = useState('');`
- L26: `const paidAmounts = allPayments.reduce((acc, p) => {`
- L32: `const stockistMap: Record<string, { name: string; outstanding: number; paid: number; orders: number }> = {};`
- L35: `if (!stockistMap[sid]) stockistMap[sid] = { name: o.placedTo.name, outstanding: 0, paid: 0, orders: 0 };`
- L39: `stockistMap[sid].outstanding += Math.max(0, o.grandTotal - paidForOrder);`
- L43: `const totalDue = stockistDues.reduce((s, d) => s + d.outstanding, 0);`
- L44: `const totalPaid = stockistDues.reduce((s, d) => s + d.paid, 0);`
- L59: `.filter(o => o.placedTo.id === payingStockistId && o.status !== 'cancelled')`
- L62: `return paid < o.grandTotal;`
- L71: `const due = order.grandTotal - paid;`
- L88: `<StatCard label="Total Due" value={`₹${(totalDue / 1000).toFixed(1)}K`} icon={<DollarSign className="h-5 w-5" />} trend="down" />`
- L89: `<StatCard label="Paid" value={`₹${(totalPaid / 1000).toFixed(1)}K`} icon={<IndianRupee className="h-5 w-5" />} trend="up" />`
- L96: `{t === 'dues' ? 'Outstanding Dues' : 'Payment History'}`
- L103: `<EmptyState title="No outstanding dues" description="All payments are up to date" />`
- L114: `<p className="text-[10px] text-muted-foreground uppercase">Outstanding</p>`
- L115: `<p className="text-sm font-bold text-amber-600">₹{s.outstanding.toLocaleString()}</p>`
- L123: `<Button className="w-full h-9 rounded-xl text-sm" onClick={() => { setPayingStockistId(s.id); setPayingStockistName(s.name); setPayAmount(s.outstanding.toString`

#### `src/modules/payments/StockistPayments.tsx`

- L23: `const [reminderMsg, setReminderMsg] = useState('Hi, this is a friendly reminder regarding your outstanding payment. Please settle the dues at your earliest conv`
- L30: `const collected = myPayments.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0);`
- L31: `const totalDue = stockistOrders.reduce((s, o) => s + o.grandTotal, 0);`
- L32: `const outstanding = Math.max(0, totalDue - collected);`
- L88: `<StatCard label="Outstanding" value={`₹${(outstanding / 1000).toFixed(1)}K`} icon={<DollarSign className="h-5 w-5" />} trend="down" />`
- L98: `<div className="flex justify-between"><span className="text-muted-foreground">Account</span><span className="font-medium">{(user as StockistProfile)?.accountHol`
- L100: `<div className="flex justify-between"><span className="text-muted-foreground">A/C No</span><span className="font-mono text-xs">{(user as StockistProfile)?.accou`

#### `src/modules/pharmacist/PharmacistDashboard.tsx`

- L21: `const cartCount = cartItems.reduce((s, c) => s + c.quantity, 0);`
- L23: `const totalOrdered = myOrders.reduce((s, o) => s + o.grandTotal, 0);`
- L24: `const totalPaid = allPayments.filter(p => myOrders.some(o => o.id === p.orderId)).reduce((s, p) => s + p.amount, 0);`
- L25: `const outstanding = Math.max(0, totalOrdered - totalPaid);`
- L36: `<StatCard label="Due Payments" value={`₹${(outstanding / 1000).toFixed(1)}K`} icon={<DollarSign className="h-5 w-5" />} trend="down" />`
- L47: `{cartCount > 0 && <span className="absolute top-2 right-2 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center">`
- L51: `<Button variant="outline" className="h-auto flex-col gap-2 py-4 rounded-xl" onClick={() => navigate('/pharmacist/payments')}><CreditCard className="h-5 w-5 text`
- L65: `<p className="text-sm font-semibold">₹{order.grandTotal.toLocaleString()}</p>`

#### `src/modules/stockist/Reports.tsx`

- L8: `type ReportType = 'all' | 'h1' | 'hnx' | 'gst' | 'sales';`

#### `src/modules/stockist/StockistDashboard.tsx`

- L23: `const totalRevenue = stockistOrders.filter(o => o.status === 'delivered').reduce((s, o) => s + o.grandTotal, 0);`
- L24: `const totalProducts = myInventory.length;`
- L26: `const circleCount = myCircles.length;`
- L27: `const stockValue = myInventory.reduce((s, i) => s + i.batches.reduce((bs, b) => bs + b.sellingPrice * b.quantity, 0), 0);`
- L29: `const totalOrderValue = stockistOrders.reduce((s, o) => s + o.grandTotal, 0);`
- L30: `const totalPaid = allPayments.filter(p => stockistOrders.some(o => o.id === p.orderId) && p.status === 'paid').reduce((s, p) => s + p.amount, 0);`
- L31: `const outstanding = Math.max(0, totalOrderValue - totalPaid);`
- L42: `const count = stockistOrders.filter(o => {`
- L55: `pharmacyRevenue[pid].revenue += o.grandTotal;`
- L88: `<p className="text-sm"><span className="font-semibold text-primary">{circleCount}</span> pharmacies in your circle</p>`
- L94: `{ icon: <Package className="h-5 w-5 text-primary" />, value: totalProducts, label: 'Total Products' },`
- L95: `{ icon: <Users className="h-5 w-5 text-primary" />, value: circleCount, label: 'Pharmacies' },`
- L96: `{ icon: <TrendingUp className="h-5 w-5 text-primary" />, value: `₹${(totalRevenue / 1000).toFixed(0)}K`, label: 'Revenue' },`
- L97: `{ icon: <IndianRupee className="h-5 w-5 text-destructive" />, value: `₹${outstanding.toLocaleString()}`, label: 'Outstanding' },`
- L145: `<p className="text-sm font-semibold">₹{order.grandTotal.toLocaleString()}</p>`

### E.7 Modals / Dialogs / Sheets Inventory

**Files:** 16

| File | Count | Components |
|------|-------|------------|
| `src/modules/stockist/CirclePharmacyDetail.tsx` | 8 | (inline) |
| `src/modules/stockist/FindPharmacy.tsx` | 8 | pharmaForModal |
| `src/modules/stockist/CirclePharmacies.tsx` | 8 | openCollectModal |
| `src/modules/orders/OrderDetail.tsx` | 8 | (inline) |
| `src/pages/register/StockistRegistration.tsx` | 5 | (inline) |
| `src/pages/register/PharmacyRegistration.tsx` | 5 | (inline) |
| `src/core/ui-patterns/ProfileSection.tsx` | 4 | (inline) |
| `src/core/ui-patterns/EditProfileModal.tsx` | 4 | EditProfileModal |
| `src/modules/payments/PharmacistPayments.tsx` | 4 | (inline) |
| `src/modules/payments/StockistPayments.tsx` | 4 | (inline) |
| `src/modules/stockist/Inventory.tsx` | 4 | (inline) |
| `src/modules/stockist/StockistProfile.tsx` | 4 | (inline) |
| `src/modules/stockist/PurchaseBills.tsx` | 4 | (inline) |
| `src/modules/stockist/ProductDetail.tsx` | 4 | (inline) |
| `src/modules/pharmacist/Checkout.tsx` | 4 | (inline) |
| `src/modules/pharmacist/PharmacistProfile.tsx` | 4 | (inline) |

### E.8 Mock, Stub, and Incomplete Behavior

**Files flagged:** 52

| File | Tags | Sample |
|------|------|--------|
| `src/core/ui-patterns/EditProfileModal.tsx` | placeholder | L13: placeholder?: string; |
| `src/core/data/users.ts` | placeholder | L61: { id: 'doc-s1', label: 'Wholesale Drug License — Form 20B', number: 'WDL-MH-2022-00456', e |
| `src/components/GlobalSearch.tsx` | placeholder | L7: const getPlaceholder = (pathname: string) => { |
| `src/components/ui/command.tsx` | placeholder | L47: "flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-mut |
| `src/components/ui/sidebar.tsx` | random | L536: return `${Math.floor(Math.random() * 40) + 50}%`; |
| `src/components/ui/select.tsx` | placeholder | L20: "flex h-10 w-full items-center justify-between rounded-md border border-input bg-backgroun |
| `src/components/ui/textarea.tsx` | placeholder | L11: "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm r |
| `src/components/ui/input.tsx` | placeholder | L11: "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-of |
| `src/components/registration/FormField.tsx` | placeholder | L12: placeholder?: string; |
| `src/components/registration/SelectField.tsx` | placeholder | L18: placeholder?: string; |
| `src/modules/stockist/DeliverySetup.tsx` | placeholder | L57: <Input placeholder="Area name" value={newArea.name} onChange={e => setNewArea(p => ({ ...p |
| `src/modules/stockist/CirclePharmacyDetail.tsx` | placeholder | L240: <Input type="number" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value |
| `src/modules/stockist/CreateOrder.tsx` | placeholder | L175: <Input className="pl-9 h-10 rounded-xl text-sm" placeholder="Search pharmacy..." value={p |
| `src/modules/stockist/Inventory.tsx` | placeholder | L133: <Input className="pl-9 h-11 rounded-xl" placeholder="Search products..." value={search} o |
| `src/modules/stockist/StockistProfile.tsx` | placeholder | L233: key: d.id, label: d.label, value: d.number || '', placeholder: 'Document number', |
| `src/modules/stockist/EditProduct.tsx` | placeholder | L102: <div><Label className="text-xs">Category</Label><Input value={form.category} onChange={e  |
| `src/modules/stockist/AddItem.tsx` | placeholder | L97: {/* Product Images (placeholder) */} |
| `src/modules/stockist/HolidayManagement.tsx` | placeholder | L58: <Input className="mt-1" value={reason} onChange={e => setReason(e.target.value)} placehold |
| `src/modules/stockist/QuickBill.tsx` | placeholder | L168: <Textarea className="min-h-[200px] rounded-xl" placeholder={`Example:\nParacetamol 500mg  |
| `src/modules/stockist/BatchManagement.tsx` | placeholder | L53: <Input className="pl-9" placeholder="Search batches..." value={search} onChange={e => setS |
| `src/modules/stockist/FindPharmacy.tsx` | placeholder | L124: <Input className="pl-9 h-11 rounded-xl" placeholder="Search by name, owner, PIN code..."  |
| `src/modules/stockist/PurchaseBills.tsx` | mock, placeholder | L28: const mockBillItems: BillItem[] = [ |
| `src/modules/stockist/BulkPriceUpdate.tsx` | random | L52: newMrp: Math.round(c.currentMrp * (1 + (Math.random() * 0.1))), |
| `src/modules/stockist/BulkUpload.tsx` | mock | L19: const mockParsedData: ParsedRow[] = [ |
| `src/modules/stockist/CirclePharmacies.tsx` | placeholder | L193: <div><Label className="text-xs">Notes (optional)</Label><Input className="mt-1" placehold |
| `src/modules/admin/Transactions.tsx` | placeholder | L44: <Input className="pl-9" placeholder="Search by ref or order..." value={search} onChange={e |
| `src/modules/admin/PharmacyList.tsx` | placeholder | L33: <Input className="pl-9" placeholder="Search pharmacies..." value={search} onChange={e => s |
| `src/modules/admin/UserFlowPage.tsx` | placeholder | L374: placeholder="Search flows, steps, actions..." |
| `src/modules/admin/StockistList.tsx` | placeholder | L34: <Input className="pl-9" placeholder="Search stockists..." value={search} onChange={e => se |
| `src/modules/admin/ApprovalCenter.tsx` | placeholder | L61: <Input className="pl-9" placeholder="Search users..." value={search} onChange={e => setSea |
| `src/modules/admin/CommissionSetup.tsx` | placeholder | L57: <div><Label className="text-xs">Category</Label><Input placeholder="e.g. Analgesic" value= |
| `src/modules/admin/BannerManagement.tsx` | placeholder | L49: <div><Label className="text-xs">Title</Label><Input value={form.title} onChange={e => setF |
| `src/modules/admin/CounterfeitManagement.tsx` | placeholder | L58: <Input className="pl-9" placeholder="Search medicines..." value={search} onChange={e => se |
| `src/modules/shared/SupportChat.tsx` | placeholder, random | L82: placeholder="Type your message..." |
| `src/modules/pharmacist/BrowseMedicines.tsx` | placeholder | L105: <Input className="pl-9 h-11 rounded-xl" placeholder={view === 'medicines' ? 'Search medic |
| `src/modules/pharmacist/DeliveryPreferences.tsx` | placeholder | L57: <textarea className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm |
| `src/modules/pharmacist/QuickOrder.tsx` | placeholder | L168: <Textarea className="mt-1 min-h-[120px] font-mono text-sm" placeholder={sampleText} value |
| `src/modules/pharmacist/Checkout.tsx` | placeholder | L326: placeholder="Add any special instructions..." |
| `src/modules/pharmacist/PharmacistStockists.tsx` | placeholder | L41: <Input className="pl-9 h-10 rounded-xl" placeholder="Search stockists..." value={search} o |
| `src/modules/pharmacist/FindStockist.tsx` | placeholder | L44: <Input className="pl-9 h-10 rounded-xl" placeholder="Search by name or city..." value={sea |
| `src/modules/pharmacist/PharmacistInventory.tsx` | placeholder | L44: <Input className="pl-9 h-10 rounded-xl" placeholder="Search medicines..." value={search} o |
| `src/modules/pharmacist/Addresses.tsx` | placeholder | L47: <div className="space-y-1"><Label className="text-xs">Label</Label><Input value={form.labe |
| `src/modules/orders/OrderDetail.tsx` | placeholder | L384: <Textarea placeholder="Add a note..." className="min-h-[40px] text-sm" value={notes} onCh |
| `src/modules/orders/ReturnRequest.tsx` | placeholder | L121: <Textarea placeholder="Reason for return..." className="min-h-[60px] text-sm" value={sele |
| `src/pages/Settings.tsx` | placeholder | L136: <Input className="pl-9 h-10 rounded-xl" placeholder="Search menu..." value={menuSearch} o |
| `src/pages/AdminLogin.tsx` | placeholder | L55: <Input id="email" type="email" placeholder="admin@digiswasthya.com" value={email} onChange |
| `src/pages/Login.tsx` | placeholder | L143: <Input id="email" type="email" placeholder="you@example.com" value={email} onChange={e => |
| `src/pages/AuthPage.tsx` | demo, placeholder | L77: const prefillDemo = () => { |
| `src/pages/ResetPassword.tsx` | placeholder | L56: <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeh |
| `src/pages/ForgotPassword.tsx` | placeholder | L52: <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="yo |
| `src/pages/register/StockistRegistration.tsx` | demo, placeholder, incomplete | L211: await login(formData.email || 'stockist@demo.com', 'password', 'stockist'); |
| `src/pages/register/PharmacyRegistration.tsx` | demo, placeholder, incomplete | L251: await login(formData.email || 'pharmacy@demo.com', 'password', 'pharmacist'); |

### E.9 Dead Code, Orphan Routes, and Broken Links

#### Page files with weak import references

- `Index`
- `Login`
- `Signup`

#### Duplicate filenames

### E.10 Local-Storage State Model (`AppStateContext.tsx`)

**Storage key:** `digi-swasthya-state` (persisted to `localStorage` on every state mutation via `useEffect`)

#### Persisted state slices

| State Key | Type | Default / Seed | Purpose |
|-----------|------|----------------|---------|
| `cartItems` | CartItem[] | [] | Pharmacist shopping cart |
| `dynamicOrders` | Order[] | [] | Runtime-created orders merged with seedOrders |
| `dynamicPayments` | Payment[] | [] | Runtime payments merged with seedPayments |
| `dynamicLedger` | LedgerEntry[] | [] | Ledger entries merged with seedLedger |
| `invoices` | Invoice[] | [] | Generated invoice records |
| `reminders` | PaymentReminder[] | [] | Payment reminder queue |
| `connectedStockists` | Record<pharmacyId, stockistId[]> | buildDefaultConnections(circleEntries) | Pharmacy↔stockist links |
| `orderStatusOverrides` | Record<orderId, {status, timeline}> | {} | Manual order status transitions |
| `dynamicStockists` | StockistProfile[] | [] | Registered stockists merged with seed |
| `dynamicPharmacists` | PharmacistProfile[] | [] | Registered pharmacists merged with seed |
| `userStatusOverrides` | Record<userId, ApprovalStatus> | {} | Admin approval overrides |
| `dynamicMedicines` | Medicine[] | [] | Added medicines merged with seedMedicines |
| `dynamicBatches` | Batch[] | [] | Added batches merged with seedBatches |
| `batchQtyOverrides` | Record<batchId, number> | {} | Quantity adjustments |
| `counterfeitOverrides` | Record<medicineId, boolean> | {} | Admin counterfeit flags |
| `dynamicBanners` | Banner[] | [] | Custom banners |
| `bannerOverrides` | Record<bannerId, Partial<Banner>> | {} | Banner edits |
| `deletedBannerIds` | string[] | [] | Soft-deleted banner IDs |
| `circleEntries` | CircleEntry[] | defaultCircleEntries (3 pairs) | Circle pharmacy relationships |
| `addresses` | Address[] | 1 default address | Pharmacist delivery addresses |
| `orderCounter` | number | 10 | Order number sequence |
| `invoiceCounter` | number | 5 | Invoice number sequence |
| `deliveryAreas` | ServiceArea[] | 2 default pincodes | Stockist service areas |
| `deliverySlots` | DeliverySlot[] | 3 default slots | Delivery time windows |
| `holidays` | Holiday[] | [] | Stockist holiday calendar |
| `returnRequests` | ReturnRequest[] | [] | Return workflow records |
| `creditNotes` | CreditNote[] | [] | Credit notes from returns |
| `pharmacyInventory` | PharmacyInventoryItem[] | [] | Received stock at pharmacy |
| `supportMessages` | SupportMessage[] | [] | Support chat thread |

### E.11 Seed Data Catalog (`src/core/data/`)

#### `banners.ts`

| Export | Approx. record count |
|--------|---------------------|
| `banners` | 3 |
| `circlePharmacies` | 11 |
| `commissionRules` | 5 |
| `notifications` | 5 |

#### `inventory.ts`

| Export | Approx. record count |
|--------|---------------------|
| `batches` | 19 |
| `medicines` | 18 |

#### `orders.ts`

| Export | Approx. record count |
|--------|---------------------|
| `orders` | 67 |

#### `payments.ts`

| Export | Approx. record count |
|--------|---------------------|
| `ledgerEntries` | 15 |
| `payments` | 6 |

#### `users.ts`

| Export | Approx. record count |
|--------|---------------------|
| `pendingApprovals` | 0 |
| `pharmacistUsers` | 24 |
| `stockistUsers` | 20 |

### E.12 AppStateContext Public Methods

- **`addAddress`** — `const addAddress = useCallback((address: Omit<Address, 'id'>) => {`
- **`addBanner`** — `const addBanner = useCallback((banner: Banner) => {`
- **`addBatch`** — `const addBatch = useCallback((batch: Batch) => {`
- **`addCircleEntry`** — `const addCircleEntry = useCallback((entry: Omit<CircleEntry, 'id' | 'addedAt'>) => {`
- **`addDeliveryArea`** — `const addDeliveryArea = useCallback((area: ServiceArea) => {`
- **`addDeliverySlot`** — `const addDeliverySlot = useCallback((slot: DeliverySlot) => {`
- **`addHoliday`** — `const addHoliday = useCallback((holiday: Holiday) => {`
- **`addLedgerEntry`** — `const addLedgerEntry = useCallback((entry: Omit<LedgerEntry, 'id'>) => {`
- **`addMedicine`** — `const addMedicine = useCallback((med: Medicine) => {`
- **`addPayment`** — `const addPayment = useCallback((payment: { orderId: string; amount: number; method: 'bank_transfer' `
- **`addProduct`** — `const addProduct = useCallback((med: Medicine, batch: Batch) => {`
- **`addSupportMessage`** — `const addSupportMessage = useCallback((msg: Omit<SupportMessage, 'id' | 'createdAt'>) => {`
- **`addToCart`** — `const addToCart = useCallback((item: CartItem) => {`
- **`approveReturn`** — `const approveReturn = useCallback((returnId: string) => {`
- **`buildDefaultConnections`** — `const buildDefaultConnections = (circles: CircleEntry[]): Record<string, string[]> => {`
- **`canUseCredit`** — `const canUseCredit = useCallback((pharmacyId: string, stockistId: string, amount: number): boolean =`
- **`clearCart`** — `const clearCart = useCallback(() => setCartItems([]), []);`
- **`connectStockist`** — `const connectStockist = useCallback((pharmacyId: string, stockistId: string) => {`
- **`createOrder`** — `const createOrder = useCallback((orderData: Omit<Order, 'id' | 'orderNumber' | 'timeline' | 'created`
- **`createReturnRequest`** — `const createReturnRequest = useCallback((req: Omit<ReturnRequest, 'id' | 'createdAt' | 'status'>) =>`
- **`deductStock`** — `const deductStock = useCallback((items: OrderItem[]) => {`
- **`deleteAddress`** — `const deleteAddress = useCallback((id: string) => {`
- **`deleteBanner`** — `const deleteBanner = useCallback((id: string) => {`
- **`disconnectStockist`** — `const disconnectStockist = useCallback((pharmacyId: string, stockistId: string) => {`
- **`generateInvoice`** — `const generateInvoice = useCallback((orderId: string): Invoice | null => {`
- **`getAvailableCreditNotes`** — `const getAvailableCreditNotes = useCallback((pharmacyId: string, stockistId: string) => {`
- **`getBatchesByProduct`** — `const getBatchesByProduct = useCallback((productId: string) => {`
- **`getConnectedStockists`** — `const getConnectedStockists = useCallback((pharmacyId: string): string[] => {`
- **`getCreditLimit`** — `const getCreditLimit = useCallback((pharmacyId: string, stockistId: string): number => {`
- **`getCreditUsed`** — `const getCreditUsed = useCallback((pharmacyId: string, stockistId: string): number => {`
- **`getInventoryByStockist`** — `const getInventoryByStockist = useCallback((stockistId: string) => {`
- **`getLedgerBalance`** — `const getLedgerBalance = useCallback(() => {`
- **`getOrderPaidAmount`** — `const getOrderPaidAmount = useCallback((orderId: string) => {`
- **`getOrderPaymentStatus`** — `const getOrderPaymentStatus = useCallback((orderId: string): 'pending' | 'partial' | 'paid' => {`
- **`getOrderPayments`** — `const getOrderPayments = useCallback((orderId: string) => {`
- **`getOrderRemainingAmount`** — `const getOrderRemainingAmount = useCallback((orderId: string) => {`
- **`getOrderType`** — `const getOrderType = useCallback((pharmacyId: string, stockistId: string): OrderType => {`
- **`getOrdersByUser`** — `const getOrdersByUser = useCallback((userId: string) => {`
- **`getOutstandingBetween`** — `const getOutstandingBetween = useCallback((partyAId: string, partyBId: string) => {`
- **`getOutstandingForParty`** — `const getOutstandingForParty = useCallback((partyId: string) => {`
- **`getPharmacyInventory`** — `const getPharmacyInventory = useCallback((pharmacyId: string) => {`
- **`getStockistHolidayInfo`** — `const getStockistHolidayInfo = useCallback((stockistId: string) => {`
- **`getUserById`** — `const getUserById = useCallback((id: string) => {`
- **`involves`** — `const involves = (o.placedBy.id === partyAId && o.placedTo.id === partyBId) ||`
- **`isStockistOnHoliday`** — `const isStockistOnHoliday = useCallback((stockistId: string) => {`
- **`loadState`** — `const loadState = () => {`
- **`makeLedgerEntry`** — `const makeLedgerEntry = (params: {`
- **`registerPharmacist`** — `const registerPharmacist = useCallback((profile: PharmacistProfile) => {`
- **`registerStockist`** — `const registerStockist = useCallback((profile: StockistProfile) => {`
- **`rejectReturn`** — `const rejectReturn = useCallback((returnId: string) => {`
- **`removeCircleEntry`** — `const removeCircleEntry = useCallback((id: string) => {`
- **`removeDeliveryArea`** — `const removeDeliveryArea = useCallback((id: string) => {`
- **`removeDeliverySlot`** — `const removeDeliverySlot = useCallback((id: string) => {`
- **`removeFromCart`** — `const removeFromCart = useCallback((medicineId: string, stockistId: string) => {`
- **`removeHoliday`** — `const removeHoliday = useCallback((id: string) => {`
- **`restoreStock`** — `const restoreStock = useCallback((items: OrderItem[]) => {`
- **`sendReminder`** — `const sendReminder = useCallback((reminder: Omit<PaymentReminder, 'id' | 'sentAt'>) => {`
- **`setDefaultAddress`** — `const setDefaultAddress = useCallback((id: string) => {`
- **`toggleCounterfeit`** — `const toggleCounterfeit = useCallback((medicineId: string) => {`
- **`updateAddress`** — `const updateAddress = useCallback((address: Address) => {`
- **`updateBanner`** — `const updateBanner = useCallback((banner: Banner) => {`
- **`updateBatch`** — `const updateBatch = useCallback((batch: Batch) => {`
- **`updateCartQty`** — `const updateCartQty = useCallback((medicineId: string, stockistId: string, qty: number) => {`
- **`updateCircleEntry`** — `const updateCircleEntry = useCallback((id: string, updates: Partial<CircleEntry>) => {`
- **`updateDeliveryArea`** — `const updateDeliveryArea = useCallback((id: string, updates: Partial<ServiceArea>) => {`
- **`updateMedicine`** — `const updateMedicine = useCallback((med: Medicine) => {`
- **`updateOrderItems`** — `const updateOrderItems = useCallback((orderId: string, items: OrderItem[], totals: { subtotal: numbe`
- **`updateOrderStatus`** — `const updateOrderStatus = useCallback((orderId: string, newStatus: OrderStatus, note?: string) => {`
- **`updateUserStatus`** — `const updateUserStatus = useCallback((userId: string, status: ApprovalStatus) => {`
- **`useAppState`** — `const useAppState = () => useContext(AppStateContext);`
- **`validateStock`** — `const validateStock = useCallback((items: { batchId: string; quantity: number }[]): { valid: boolean`

### E.13 Credit & Payment Formulas (from `AppStateContext`)

```typescript
// getCreditUsed: sum (grandTotal - paid) for unpaid/partial orders between pharmacy+stockist pair
// paid = seedPayments + dynamicPayments filtered by orderId, reduce amount
// getCreditLimit: circleEntries.find(stockistId+pharmacyId)?.creditLimit || defaultCreditLimit parse
// canUseCredit: getCreditUsed + amount <= getCreditLimit
// getOrderType: circleEntries match → 'CIRCLE' else 'PLATFORM'
```

### E.14 Module/Page File Inventory

#### `modules/stockist`

- `AddItem.tsx` — 184 lines, AppState refs: 4, dialog refs: 0
- `Analytics.tsx` — 107 lines, AppState refs: 0, dialog refs: 0
- `BatchManagement.tsx` — 106 lines, AppState refs: 4, dialog refs: 0
- `BulkPriceUpdate.tsx` — 191 lines, AppState refs: 2, dialog refs: 0
- `BulkUpload.tsx` — 211 lines, AppState refs: 0, dialog refs: 0
- `CirclePharmacies.tsx` — 228 lines, AppState refs: 4, dialog refs: 20
- `CirclePharmacyDetail.tsx` — 295 lines, AppState refs: 4, dialog refs: 20
- `CreateOrder.tsx` — 266 lines, AppState refs: 4, dialog refs: 0
- `DeliverySetup.tsx` — 90 lines, AppState refs: 2, dialog refs: 0
- `EditProduct.tsx` — 168 lines, AppState refs: 2, dialog refs: 0
- `FindPharmacy.tsx` — 208 lines, AppState refs: 4, dialog refs: 20
- `HolidayManagement.tsx` — 122 lines, AppState refs: 4, dialog refs: 0
- `Inventory.tsx` — 407 lines, AppState refs: 4, dialog refs: 13
- `ProductDetail.tsx` — 254 lines, AppState refs: 2, dialog refs: 12
- `PurchaseBills.tsx` — 271 lines, AppState refs: 0, dialog refs: 13
- `QuickBill.tsx` — 292 lines, AppState refs: 4, dialog refs: 0
- `Reports.tsx` — 97 lines, AppState refs: 0, dialog refs: 0
- `StockistDashboard.tsx` — 159 lines, AppState refs: 4, dialog refs: 0
- `StockistProfile.tsx` — 239 lines, AppState refs: 4, dialog refs: 12
- `SubscriptionPage.tsx` — 96 lines, AppState refs: 4, dialog refs: 0

#### `modules/pharmacist`

- `Addresses.tsx` — 85 lines, AppState refs: 4, dialog refs: 0
- `BrowseMedicines.tsx` — 192 lines, AppState refs: 4, dialog refs: 0
- `Cart.tsx` — 65 lines, AppState refs: 2, dialog refs: 0
- `Checkout.tsx` — 417 lines, AppState refs: 4, dialog refs: 13
- `DeliveryPreferences.tsx` — 65 lines, AppState refs: 0, dialog refs: 0
- `FindStockist.tsx` — 70 lines, AppState refs: 4, dialog refs: 0
- `PharmacistDashboard.tsx` — 79 lines, AppState refs: 4, dialog refs: 0
- `PharmacistInventory.tsx` — 96 lines, AppState refs: 4, dialog refs: 0
- `PharmacistProfile.tsx` — 165 lines, AppState refs: 4, dialog refs: 12
- `PharmacistStockistDetail.tsx` — 177 lines, AppState refs: 2, dialog refs: 0
- `PharmacistStockists.tsx` — 74 lines, AppState refs: 4, dialog refs: 0
- `QuickOrder.tsx` — 219 lines, AppState refs: 4, dialog refs: 0

#### `modules/admin`

- `AdminAnalytics.tsx` — 137 lines, AppState refs: 2, dialog refs: 0
- `AdminDashboard.tsx` — 74 lines, AppState refs: 2, dialog refs: 0
- `AdminPayments.tsx` — 73 lines, AppState refs: 2, dialog refs: 0
- `AdminProfile.tsx` — 88 lines, AppState refs: 3, dialog refs: 0
- `ApprovalCenter.tsx` — 146 lines, AppState refs: 2, dialog refs: 0
- `BannerManagement.tsx` — 101 lines, AppState refs: 2, dialog refs: 0
- `CommissionSetup.tsx` — 96 lines, AppState refs: 2, dialog refs: 0
- `CounterfeitManagement.tsx` — 93 lines, AppState refs: 2, dialog refs: 0
- `PharmacyDetail.tsx` — 136 lines, AppState refs: 2, dialog refs: 0
- `PharmacyList.tsx` — 75 lines, AppState refs: 2, dialog refs: 0
- `PlatformLedger.tsx` — 68 lines, AppState refs: 2, dialog refs: 0
- `StockistDetail.tsx` — 94 lines, AppState refs: 2, dialog refs: 0
- `StockistList.tsx` — 78 lines, AppState refs: 2, dialog refs: 0
- `Suspensions.tsx` — 61 lines, AppState refs: 2, dialog refs: 0
- `Transactions.tsx` — 89 lines, AppState refs: 2, dialog refs: 0
- `UserFlowPage.tsx` — 451 lines, AppState refs: 0, dialog refs: 0

#### `modules/orders`

- `OrderDetail.tsx` — 456 lines, AppState refs: 4, dialog refs: 21
- `OrderList.tsx` — 101 lines, AppState refs: 4, dialog refs: 0
- `ReturnRequest.tsx` — 136 lines, AppState refs: 4, dialog refs: 0

#### `modules/payments`

- `PaymentsPage.tsx` — 165 lines, AppState refs: 2, dialog refs: 0
- `PharmacistPayments.tsx` — 180 lines, AppState refs: 4, dialog refs: 12
- `StockistPayments.tsx` — 213 lines, AppState refs: 4, dialog refs: 12

#### `modules/shared`

- `SupportChat.tsx` — 97 lines, AppState refs: 4, dialog refs: 0

### E.15 AuthContext Implementation

- `login`
- `logout`
- `login`
- `logout`
- `login`
- `logout`
- `login`

### E.16 Navigation Menu Items (role-gated in `Navigation.tsx`)

- **Home** → `/dashboard`
- **Pharmacies** → `/admin/pharmacies`
- **Stockists** → `/admin/stockists`
- **Orders** → `/admin/orders`
- **More** → `/admin/settings`
- **Home** → `/dashboard`
- **Products** → `/stockist/inventory`
- **Pharmacies** → `/stockist/circle`
- **Orders** → `/stockist/orders`
- **More** → `/stockist/settings`
- **Home** → `/dashboard`
- **Orders** → `/pharmacist/orders`
- **Stockists** → `/pharmacist/stockists`
- **Payments** → `/pharmacist/payments`
- **More** → `/pharmacist/settings`
- **Dashboard** → `/dashboard`
- **Verifications** → `/admin/approvals`
- **Stockists** → `/admin/stockists`
- **Pharmacies** → `/admin/pharmacies`
- **Orders** → `/admin/orders`
- **Payments** → `/admin/payments`
- **Analytics** → `/admin/analytics`
- **Transactions** → `/admin/transactions`
- **Ledger** → `/admin/ledger`
- **Commission** → `/admin/commission`
- **Dashboard** → `/dashboard`
- **Inventory** → `/stockist/inventory`
- **Circle** → `/stockist/circle`
- **Orders** → `/stockist/orders`
- **Payments** → `/stockist/payments`
- **Holidays** → `/stockist/holidays`
- **Reports** → `/stockist/reports`
- **Analytics** → `/stockist/analytics`
- **Delivery** → `/stockist/delivery`
- **Dashboard** → `/dashboard`
- **Stockists** → `/pharmacist/stockists`
- **Browse** → `/pharmacist/browse`
- **Inventory** → `/pharmacist/inventory`
- **Orders** → `/pharmacist/orders`
- **Payments** → `/pharmacist/payments`
- **Cart** → `/pharmacist/cart`

### E.17 Known Route Duplication in `App.tsx`

- `/stockist/settings` is registered **twice** (lines 142–143) with identical `SettingsPage` element.
- `/admin/users` and `/admin/approvals` both render `ApprovalCenter`.

### E.18 Dialog/Modal Components (non-ui/)

- `src/core/ui-patterns/EditProfileModal.tsx`: `EditProfileModal`
- `src/modules/stockist/CirclePharmacies.tsx`: `openCollectModal`
- `src/modules/stockist/FindPharmacy.tsx`: `pharmaForModal`


---

## EXPANSION PASS 2 — Deep Trace Additions (2026-07-08)

*Append-only deep-trace pass. Everything below is code-derived from `digimvplaunch/` and NEW relative to all prior sections (Parts I–II and the Audit-Pass expansion). Prior content is unchanged. Domain scope: Admin / Stockist / Pharmacy only. File paths cited per claim.*

### E2.1 Newly documented routes/pages/screens (UI-structure & copy detail not previously captured)

No entirely new routes exist beyond the 73 already tabled (`src/App.tsx`). This subsection adds the exact on-screen structure, copy, and state detail for routed screens that earlier sections described only functionally.

#### E2.1.1 `/onboarding` — exact slide content (`src/pages/Onboarding.tsx`)
- Screen set is chosen by `localStorage['onboarding_role']` (default `'stockist'`; `'pharmacist'` selects the pharmacist set). On finish or Skip it writes `localStorage['onboarding_seen'] = 'true'` and navigates `/login` (L256, L263, L269).
- **Stockist slides (verbatim, L12–144):**
  1. "Manage Your Entire Distribution" — "Track inventory, pharmacies, and orders — all in one place." (SVG animations: `truckMove` 3s, `boxBounce` 2s + 0.3s delay, `fadeIn` 2s alternate.)
  2. "Create Bills in Seconds" — "Paste WhatsApp orders and instantly convert them into bills." (`chatPop` 3s + 0.5s delay, `arrowPulse` 2s, `billSlide` 3s + 0.8s delay; WhatsApp bubble uses literal green `#25D366`.)
  3. "Stay on Top of Payments" — "Track dues, send reminders, and collect payments easily." (`coinDrop` 2.5s staggered 0.4/0.8s, `walletPulse` 3s, `barGrow` 2s staggered; animated "₹" coin glyphs.)
- **Pharmacist slides (verbatim, L146–251):**
  1. "Order Medicines Easily" — "Browse products and place orders with your stockist in seconds." (`pillFloat` 3s staggered, `cartRoll` 2.5s.)
  2. "Track Orders in Real-Time" — "Know exactly when your order is packed, shipped, and delivered." (three step nodes labelled "Placed" / "Shipped" / "Delivered"; `stepPulse1/2/3` 2s staggered; `dotTravel` 3s animates a dot cx 95→150→205.)
  3. "Manage Bills & Payments" — "View bills, track dues, and stay financially organized." (`receiptSlide` 2.5s, `checkMark` stroke animation; badges "Paid ✓" and "Due".)
- Progress dots: active dot `w-8 bg-primary`, inactive `w-2 bg-muted-foreground/30`, `transition-all duration-300` (L288–289). Buttons: "Next" → "Get Started" on last slide; "Skip" always visible (L296–300).

#### E2.1.2 `/auth`, `/login`, `/admin-login`, password screens — exact copy
- AuthPage (`src/pages/AuthPage.tsx`): role-selector heading is mode-dependent — "Login as" (login tab) vs "I am a" (signup tab) (L135). Login submit button label is role-dynamic: "Login as Stockist" / "Login as Pharmacy", loading state "Signing in..." (L196). Demo hint block: login tab shows "Demo Mode:" + "Click any role above to auto-fill credentials" (L237); signup tab shows "Demo data will be pre-filled in onboarding" (L239). Role sub-labels: Stockist "Distribute to pharmacies", Pharmacy "Buy & sell medicines" (L16–17). Prefill toast: `Demo credentials filled` / "{Stockist|Pharmacy} demo account" (L82).
- Login.tsx: animated van SVG includes a shop sign reading literally "PHARMACY" (L50); footer "Don't have an account?" + "Sign Up" (L172–173).
- AdminLogin.tsx heading pair: "Admin Access" / "Platform management console" (L47–48); submit "Sign In as Admin" (L71).
- Signup.tsx (dead-routed page) verbatim: heading "Create your account", subtitle "Choose how you'd like to use Digi Swasthya" (L58–59). Role card descriptions: Pharmacy "Order medicines from verified stockists near you"; Stockist "Distribute medicines & manage your pharmacy network". Pharmacy feature bullets: "Browse & order from multiple stockists", "Get credit-based purchasing", "Track orders & purchase history", "Manage invoices & delivery preferences". Stockist bullets: "Manage inventory, batches & deliveries", "Build your pharmacy circle", "Track sales, ledger & commissions", "Generate purchase bills & manage orders" (L16–37). CTA "Continue as {label}" (L125).
- ForgotPassword.tsx: page heading "Reset Password", card title "Forgot Password", helper "We'll send you a reset link" (L35); card description toggles "Enter your registered email address" → "Check your inbox for reset instructions"; sent state text "A password reset link has been sent to {email}" (L45); buttons "Send Reset Link"/"Sending..." (L57), "← Back to Login" (L61).
- ResetPassword.tsx: heading "Set New Password"; card title toggles "New Password" → "All Done!"; description "Create a strong password" → "Your password has been reset"; done body "Your password has been successfully updated." (L42–49); buttons "Update Password"/"Updating..." (L65), done-state "Sign In" (L50).
- NotFound.tsx copy: "404" / "Oops! Page not found" / link "Return to Home" (raw `<a href="/">`).

#### E2.1.3 `/admin/user-flow` — full transcript of the static documentation page (`src/modules/admin/UserFlowPage.tsx`, 451 lines)
Header: H1 "System User Flow", subtitle "Complete system journey across all roles"; search placeholder "Search flows, steps, actions..." (L367–374). Six tabs (keys L27–34): `entities` "Entity Relations", `lead_order` "Lead → Order Flow", `order_lifecycle` "Order Lifecycle", `payment_credit` "Payment & Credit", `inventory_batch` "Inventory & Batch", `admin_control` "Admin Control". Expanded flow-step cards show sections labelled "Actions" (L126) and "Data Operations" (L138, mono pills with a Database icon); entity cards show "Key Actions" (L180) and "Connections" (L188). `statusVariantMap` (L53–59) maps 19 statuses to chip variants, including statuses that exist nowhere else in the app: `active`, `completed`, `settled`, `credit`, `flagged`, `suspended`, `overdue`.

**Entity Relations tab — 9 cards (L206–261), verbatim descriptions:**
1. *Pharmacy / Customer* — "End user who browses and orders medicines from stockists". Actions: Register, Browse products, Place orders, Make payments, Manage addresses. Connections: creates → Order; makes → Payment; orders from → Stockist.
2. *Stockist* — "Distributor who manages inventory and fulfills pharmacy orders". Actions: Manage inventory, Add batches, Fulfill orders, Set pricing, Manage circle, Upload CSV. Connections: manages → Inventory; fulfills → Order; serves → Pharmacy; creates → Batch.
3. *Order* — "B2B purchase request from pharmacy to stockist with lifecycle tracking". Actions: Create, Confirm, Dispatch, Deliver, Cancel, Split. Connections: contains → Order Items; generates → Payment; updates → Ledger; deducts from → Inventory.
4. *Order Items* — "Individual line items in an order with batch, price, and quantity details". Actions: Add item, Update quantity, Apply discount, Calculate tax.
5. *Payments* — "Payment tracking for orders — full, partial, or credit-based". Actions: Record payment, Apply credit, Mark overdue, Send reminder.
6. *Ledger* — "Financial transaction log tracking debits, credits, and outstanding balances". Actions: Record debit, Record credit, Calculate balance, Generate statement.
7. *Inventory* — "Medicine stock management with batch-level tracking and alerts". Actions: Add item, Update stock, Set threshold, Flag counterfeit. Connections include: reserved by → Order.
8. *Batch* — "Batch-level data with MRP, expiry, manufacturing date, and stock quantity". Actions: Create batch, Track expiry, Flag counterfeit, Deduct stock.
9. *Admin* — "Platform administrator managing users, commissions, and system health". Actions: Approve users, Set commission, Flag counterfeit, Send notifications, Manage banners, Suspend users. Connections: manages → Stockist; manages → Pharmacy; oversees → Order.

**Lead → Order Flow tab** (section header "Lead → Order Flow (B2B)" / "Complete pharmacy registration to first order journey", L407) — 9 steps (L263–273) with actor, description, actions, data-op pills, status chips:
1. Pharmacy Registration (Pharmacist) — ops `users.insert`, `documents.insert`, `addresses.insert`; status `pending`.
2. Admin Approval (Admin) — "Admin reviews submitted documents, verifies license, and approves or rejects the registration." — ops `users.update(status)`, `notifications.insert`; statuses `pending, approved, rejected, update_required`.
3. Pharmacy Dashboard (Pharmacist) — ops `banners.select`, `orders.select`, `payments.select`; status `active`.
4. Browse Stockists (Pharmacist) — "…filtered by service area and ratings." — ops `stockists.select`, `service_areas.select`.
5. Browse Products (Pharmacist) — ops `inventory.select`, `batches.select`, `medicines.select`.
6. Add to Cart / Quick Order (Pharmacist) — ops `cart.insert`, `cart.update`, `pricing.calculate`.
7. Order Confirmation (Pharmacist) — ops `addresses.select`, `orders.validate`.
8. Order Created (System) — ops `orders.insert`, `order_items.insert`, `notifications.insert`, `inventory.reserve`; status `placed`.
9. Stockist Receives Order (Stockist) — actions include "Reject order", "Contact pharmacy" (neither exists in the live app) — ops `orders.select`, `orders.update(status)`, `notifications.insert`.

**Order Lifecycle tab** — headers "Order Lifecycle" / "From draft to completion" and "Cancel Flow" / "Order cancellation and reversal process" (L413–415). Six lifecycle steps (L275–282): Draft, Placed, Confirmed ("Partial confirmation supported — stockist can confirm available items."), Dispatched ("Stock is deducted. Delivery tracking begins." — note the LIVE engine deducts at *confirm*, not dispatch), Delivered, Completed (a status the live engine never uses; ops `orders.update(completed)`, `ledger.update`, `payments.reconcile`). Cancel Flow (L284–288): Cancel Request (warning verbatim: **"Cannot cancel after dispatch"** — contradicted by the live admin Force-Cancel on dispatched orders, §16.2), Stock Reversal (`inventory.release`, `batches.update`), Refund / Credit (`payments.refund`, `ledger.insert`, `notifications.insert` — no refund path exists in the live engine).

**Payment & Credit tab** — headers "Payment Flow" / "Order to settlement journey"; "Credit Flow" / "Credit-based ordering and overdue handling" (L422–424). Payment steps (L290–297): Order Created; Invoice Generated ("Invoice with line items, GST breakdown, discount, and total sent to pharmacy.", actions "Create invoice PDF", "Set due date"); Payment Mode Selection ("Bank Transfer, UPI, Cash, or Credit"); Payment Recorded; Ledger Updated ("debit on order placement, credit on payment receipt", ops `ledger.insert(debit)`, `ledger.insert(credit)`, `ledger.balance`); Outstanding / Settled (statuses `paid, partial, overdue`). Credit steps (L299–304): Credit Allowed (`credit_settings.insert`); Due Date Set ("e.g., 30 days"); Reminders Sent ("Automated reminders sent as due date approaches", ops `reminders.schedule`); Overdue Handling — warning verbatim: **"Orders may be blocked for overdue pharmacies"** (op `restrictions.insert`; no blocking exists live).

**Inventory & Batch tab** — headers "Inventory & Batch Flow" / "Purchase bill to stock deduction"; "Warnings & Alerts" / "Expiry tracking and counterfeit flagging" (L431–433). Six flow steps (L306–313): Purchase Bill Upload (actions "Upload CSV", "Manual entry", "Scan bill"); Item Created; Batch Created; Stock Available ("FIFO applied — earliest expiry batch served first.", ops `batches.sort(expiry)`); Order Reserved ("stock is reserved (not deducted) until confirmation", ops `inventory.reserve`, `batches.lock` — the live engine has no reservation, only deduct-on-confirm); Stock Deducted ("Upon dispatch…" — again differs from live confirm-time deduction). Warning steps (L315–318): Expiry Tracking — warning **"Expired batches are automatically hidden from pharmacy browse"** (true in live code via `getBestBatch`/`totalStock`); Counterfeit Flag — warning **"Flagged items show red alert badges across all screens"**.

**Admin Control tab** — headers "User Approval Flow" / "Registration to active user"; "Admin Operations" / "Commission, notifications, counterfeit, and suspensions" (L440–442). Approval steps 1–4 (L320–325): User Registration; Document Review ("drug license, GST certificate, pharmacy certificate"); Approve / Reject / Update (ops include `approval_log.insert` — no such log exists live); User Active (ops `permissions.grant`). Operations steps 5–8 (L327–332): Commission Setup (op `orders.apply_commission` — never happens live); Notification Management (op `push.send`); Counterfeit Flags — warning **"Red alert badges appear on all screens where flagged item appears"**; Suspension Flow — warning verbatim: **"Suspended users cannot log in or place orders"** (live code never blocks login of any status).

#### E2.1.4 Screen-level UI details not previously recorded
- **CirclePharmacyDetail** header action buttons "Record Order" and "Generate Bill" (`src/modules/stockist/CirclePharmacyDetail.tsx` L116–117) — these navigate to CreateOrder / QuickBill (previously only the dropdown equivalents on the list page were documented). Payments-tab row label format: "Payment — {method}" (L187). FIFO preview rows show "Due: {dueDate}" and per-row chip "Fully covered" (green) / "Partial" (amber) (L248–252); confirm button label "Confirm Payment — ₹{amount||'0'}" (L266); Edit-Credit modal title "Edit Credit Settings" with submit "Update Credit Settings" (L275–285).
- **Inventory filters dialog** exact copy (`src/modules/stockist/Inventory.tsx`): title "Filters" + "Reset all" (L288–290); sections "Category", "Brand / Manufacturer" (search placeholder "Search brands..."), "Expiry Date" (options "All", "Expiring Soon (< 30d)", "1–3 Months", "3–6 Months"), "Stock Availability" ("All", "In Stock", "Low Stock", "Out of Stock"), "Price Range (₹)" with Min/Max placeholders "0"/"∞"; apply button "Apply Filters" (L399). Active-filter chips render "< 30 days"/"1-3 months"/"3-6 months", "In Stock"/"Low Stock"/"Out of Stock", and "₹{min||'0'} — ₹{max||'∞'}" (L179–191). Toolbar buttons: "Add", "Filters", "Bulk Catalogue", "Purchase Bill", "Bulk Price" (L139–208).
- **BulkUpload** copy: card "Bulk Catalog Upload" / "Upload a CSV or Excel file to add multiple items at once" (L66); helper "Required columns: name, genericName, manufacturer, batchNumber, quantity, mrp" (L76); validating text "Validating file structure..." (L92) with sub "Checking columns and data format"; preview header "Preview — {n} rows" with chips "{n} valid" / "{n} errors"; confirming "Importing items..." + "Adding {validCount} valid items to inventory" (L162–163); done stats "Added"/"Failed"/"Skipped" (Skipped hardcoded 0, L188), "Errors" list rows "Row {n}: {error}", buttons "Re-upload", "Confirm Import ({n} items)", "Upload Another", "View Inventory".
- **PurchaseBills** copy: upload hint "PDF, JPG, PNG or Excel — max 10MB" (L114; the 10MB cap is display-only — no size check exists in code); supplier field placeholder "e.g., Cipla Ltd"; process button "Process Bill"/"Extracting items..."; review header "Review Extracted Items" / "From {supplier} — {n} items" (L183); confirm "Confirm & Update Inventory" with loader "Processing and updating inventory..." (L239); empty state "No bills uploaded" / "Upload your first purchase bill"; view dialog title = the bill's fileName.
- **BulkPriceUpdate** mode cards: "Inline Edit" / "Edit prices directly in a table view" and "Upload File" / "Upload CSV/Excel with updated prices" (L91–96); upload helper "CSV/Excel with columns: Product Name, New MRP, New Selling Price" (L106); table headers Product / MRP / Cur. Sale / New MRP / New Sale (L120–124); buttons "Review Changes ({n})", "Confirm {n} Changes"/"Updating...", done screen "Prices Updated" / "{n} products updated successfully" / "View Inventory".
- **QuickBill** step-copy: textarea placeholder verbatim "Example:\nParacetamol 500mg 10\nAmoxicillin 250mg 5\nOmeprazole 20mg 3" (L168); buttons "Parse Message", "Continue — {n} items", "Review Bill", "Create Bill"/"Creating..."; unmatched row shows the raw line quoted as `"{rawText}"` with select placeholder "Select product..." (L188–193); confirm table headers Item/Qty/Price/Total, footer "Grand Total" + "{n} items".
- **Checkout** verbatim structure (`src/modules/pharmacist/Checkout.tsx`): the 4 hardcoded `DELIVERY_SLOTS` (L15–20) are `{'9:00 AM — 12:00 PM','Morning'}`, `{'12:00 PM — 3:00 PM','Afternoon'}`, `{'3:00 PM — 6:00 PM','Evening'}`, `{'6:00 PM — 9:00 PM','Night'}` (default index 0). Payment card: "Pay Now (UPI)" with sub "Required for platform orders" when platform groups exist (L345); "Pay Later (Credit)" with sub "Available for circle stockists only" (L360); amber banner "Platform orders from non-circle stockists will still require upfront payment." (L364–368); red banner "Credit limit exceeded for {stockist} (Used: ₹X / Limit: ₹Y)" (L370–375). Place-button labels: "Pay & Place Order — ₹{total}" vs "Place Order (Pay Later) — ₹{total}" (L394). Interstitials: "Processing Payment" + "Simulating UPI payment of ₹{total}..." → "Payment Successful" + "Creating your order..." → "Order Placed!" + "{n} order(s) submitted." with buttons "View Orders" / "Continue Shopping" (L190–225). Empty-cart screen: "Your cart is empty" + "Browse Medicines" (L227–234). Address empty: "No addresses saved. Add one to continue." (L250); address row format "{label}{' (Default)'}" + "{line1}, {city} — {pincode}".
- **QuickOrder** verbatim: helper "Paste your WhatsApp order message or type medicine names with quantities. One item per line." (L155); sample text (L11–14) "Amoxicillin 500mg - 5 strips / Paracetamol 650mg - 10 strips / Cetirizine 10mg - 3 strips / Azithromycin 250mg - 2 strips"; "Order From" options render "{businessName} — {city}"; unmatched marker "(unmatched)" (amber, L188); stats card "Matched Items" ("{matched} / {total}") and "Estimated Total"; create button "Create Order — {n} items".
- **BrowseMedicines**: search placeholder switches "Search medicines..." / "Search stockists..." by view (L105); stockist-view holiday line "On Holiday — {reason}" + "(Pre-orders open)" (L125–126); delivery line "Delivery by {date}" formatted `en-IN {day numeric, month short}` from now+2d (L42–46, 170); add-button tri-state "Add to Cart" / "In Cart ({qty})" / "Unavailable" (L180).
- **PharmacistInventory**: subtitle "{n} items from received orders" (L38–39); tabs "All Items" / "Expiring Soon"; row grid labels "MRP:", "Expiry:", "Received:" (L82–85).
- **DeliveryPreferences**: its 3 local slots differ from Checkout's — Morning "9:00 AM — 12:00 PM", Afternoon "12:00 PM — 4:00 PM", Evening "4:00 PM — 8:00 PM" (L9–13; two conflicting slot vocabularies in the pharmacist UX). Defaults: `['morning','afternoon']` selected; instructions default "Leave at the pharmacy counter. Call before delivery." (L17–18). Sections "Preferred Time Slots" / "Delivery Instructions"; button "Save Preferences".
- **OrderDetail**: delivery-status grid label map (L30–36): placed→"Pending", confirmed→"Confirmed", dispatched→"Out for Delivery", delivered→"Delivered", cancelled→"Cancelled". Payment chip "Paid"/"Unpaid" (L241); admin panel heading "Payment Status" with row "Status: View Only" (L263–271); item sub-line "Batch: {batchNumber} · ₹{unitPrice}/unit" (L339); payment modal submit "Record Payment — ₹{amount||'0'}" (L411–413); invoice dialog title "Invoice {invoiceNumber}" with grid From/To/Order/Date and fallback body "Invoice will be generated when order is confirmed." (L448); return chip renders "Return {status}"; credit-note line "Credit Note: {creditNoteId}" (L203); edit-mode buttons "Cancel" / "Save Changes"; action-button exact labels: admin "Force Cancel"; pharmacist "Cancel Order"; stockist "Confirm Order" + "Cancel Order" (placed), "Mark as Dispatched" (confirmed), "Mark as Delivered" (dispatched) (L83–100).
- **ReturnRequest**: header card line "Delivered on {date}" (L97); prompt "Select items to return:" (L100); item sub "Batch: {batchNumber} · Qty ordered: {n} · ₹{unitPrice}" (L111); expanded controls "Return Qty:" + "/ {ordered}"; submit "Submit Return Request ({n} items)" (L129–131).
- **OrderList**: empty state "No orders found" / "No orders match the selected filter" (L79); "All ({count})" tab label format (L73).

### E2.2 Component behavior catalog (props/behavior detail not previously captured)

- **StatCard** (`src/core/ui-patterns/StatCard.tsx`): props `{label, value: string|number, change?: number, icon: ReactNode, trend?: 'up'|'down'|'neutral' = 'neutral', className?}`. The trend row renders only when `change` is defined; text is `{change>0?'+':''}{change}%` with TrendingUp (`text-success`) / TrendingDown (`text-destructive`) / Minus (`text-muted-foreground`). Icon chip is always `bg-primary/10 text-primary`. Consequence: the many StatCard usages that pass `trend` but no `change` (all payments pages, AdminPayments, PharmacistDashboard "Stockists") render **no visible trend at all** — the up/down props there are inert.
- **StatusChip** exact variant classes (`StatusChip.tsx`): success `bg-success/10 text-success border-success/20`; warning `bg-warning/10 …`; destructive `bg-destructive/10 …`; primary `bg-primary/10 …`; accent `bg-accent/10 …`; muted `bg-muted text-muted-foreground border-border`. Base classes include `capitalize`, so labels are auto-capitalized.
- **Banner** (`Banner.tsx`): props `{title, message, ctaText?, onCtaClick?, dismissible? = true, variant? = 'info', className?}`; variants info `bg-primary/5 border-primary/20 text-primary`, warning `bg-warning/5 …`, success `bg-success/5 …`. CTA renders only when **both** ctaText and onCtaClick are provided; dismiss is component-local state (banner reappears on remount).
- **EmptyState**: `{title, description, actionLabel?, onAction?, icon? = <PackageOpen/>}`; the action button renders only when both actionLabel and onAction are supplied.
- **ErrorState** (unused by screens): defaults title "Something went wrong", description "An unexpected error occurred. Please try again.", retry button "Try Again"; AlertTriangle in `bg-destructive/10`.
- **LoadingSkeleton**: `{rows? = 3, type? = 'card'}`. `stat` type ignores `rows` and always renders 4 tiles in `grid-cols-2` (each: 3 skeleton bars w-20/w-16/w-12). `list` renders `rows` items: 10×10 rounded avatar, two text bars (w-32, w-48), trailing pill (h-6 w-16). `card` renders `rows` items of 3 bars (w-40, w-full, w-3/4).
- **ProfileSection** (`ProfileSection.tsx`): props `{title, badge?, badgeColor?, items: [string, string|undefined|null][], documents?, onEdit?, editLabel? = 'Edit', className?, adminMode?}`. The Edit button renders only when `onEdit && !adminMode` — i.e. `adminMode` **suppresses** editing (this is how admin StockistDetail/PharmacyDetail become read-only). Empty item values render as "—". Document tile status colors: verified `text-green-600`, rejected `text-destructive`, else muted. Preview dialog rows: "Document Number", "Expiry Date", the fileName block containing "Document preview not available in prototype", and "Status:".
- **EditProfileModal** (`EditProfileModal.tsx`): `EditField = {key, label, value, type?: 'text'|'email'|'tel'|'url'|'textarea', placeholder?, disabled?}`; `textarea` renders a raw `<textarea min-h-[80px] resize-none>`, all other types an `<Input type=…>`. Footer buttons "Cancel" (X icon) and "Save Changes"/"Saving..." (Save/Loader2), 800ms fake save.
- **FileUploadField** (`components/registration/FileUploadField.tsx`): drop-zone copy "Click to upload or drag & drop" + "PDF, JPG, PNG (max 5MB)" (L51–52); the >5MB early-return (L22–26) really is silent — no toast/error component exists in the file.
- **GlobalSearchOverlay** (`components/GlobalSearch.tsx`): `getPlaceholder(pathname)` verbatim — path contains `/inventory` or `/products` → "Search products, categories…"; `/circle` or `/pharmacies` → "Search pharmacies…"; `/orders` → "Search orders…"; else "Search anything…" (L7–12). Result group headings "Products" / "Pharmacies" / "Orders" (L94/115/136); row icon palettes: product primary, pharmacy `bg-emerald-500/10 text-emerald-500` Store, order `bg-orange-500/10 text-orange-500` ShoppingCart; secondary lines "{manufacturer} · ₹{sellingPrice}" and "{placedBy.name} · ₹{grandTotal}". Focus is set 100ms after open; a document-level keydown listener closes on Escape (L26–39).
- **Navigation** (`components/Navigation.tsx`): active-route predicate (both navs, L49/L121): `pathname === item.path || (item.path !== '/dashboard' && pathname.startsWith(item.path))` — prefix matching keeps parent tabs lit on child routes, with `/dashboard` special-cased to exact match. BottomNav `md:hidden fixed bottom-0` with `h-5 w-5` icons; TopNav `hidden md:block sticky top-0` with `h-4 w-4` icons and brand "Pill icon + Digi Swasthya" → `/dashboard`.
- **Toast piping**: every screen toast uses shadcn `use-toast`; `variant: 'destructive'` is the only variant ever passed besides default (verified across all module files in this pass).

### E2.3 Entity & data-model deep detail (new findings)

- **Duplicate document IDs in seed data** (`src/core/data/users.ts`): `doc-s5` is used both for stockist-001's PAN Card and stockist-002's Wholesale Drug License (L66 vs L103); `doc-p5` is used both for pharma-001's PAN Card and pharma-002's Drug License (L247 vs L276). Document ids are therefore **not globally unique** — harmless because docs are only rendered per-owner, but any future keyed lookup by doc id would collide.
- **Complete seed document catalog** (users.ts): stockist-001 has 5 docs (`doc-s1` Wholesale Drug License — Form 20B `WDL-MH-2022-00456` exp 2027-02-15 verified; `doc-s2` GST Certificate `27AABCM1234F1Z5` verified; `doc-s3` Restricted Drug License — Form 21B `RDL-MH-2022-00789` verified; `doc-s4` FSSAI License `FSSAI-10022034000123` exp 2028-08-20 status **uploaded** — the only non-verified seed doc; `doc-s5` PAN Card `AABCM1234F` verified — all five with fileUrl `/placeholder.svg`). stockist-002: 2 docs (`WDL-MH-2023-00789`, GST `27XYZAB5678G2H3`, fileUrl `#`). stockist-003: `[]`. stockist-004: 2 (`WDL-DL-2023-00234`, GST `07VMDPL4567H1Z2`). stockist-005: 1 (`WDL-KA-2023-00567`). pharma-001: 5 (`DL-MH-2022-RET-00111` exp 2027-04-01; Form 21 `SCL-MH-2022-00111`; GST `27BMRPG4521K1Z8`; Pharmacist Reg `MH-PH-2019-04521` exp 2029-03-15; PAN `BMRPG4521K`; all `/placeholder.svg` verified). pharma-002: 3 (`PH-2024-MH-00222` exp 2026-05-15; `F21-MH-00222`; GST `27KLMNO1234P1Z3`). pharma-003: `[]`. pharma-004: 1 (`DL-MH-2023-RET-00444`). pharma-005: 2 (`DL-MH-2022-CHN-00555`; GST `27FGHIJ5678K1Z7`). pharma-006: 1 (`DL-MH-2021-RET-00666`). Only stockist-001 and pharma-001 have image-like fileUrls; all other docs use `'#'`, so their preview dialogs always fall back to the FileText icon.
- **Unused seed `circlePharmacies` full detail** (`src/core/data/banners.ts` L26–42): 11 rows with `customPricing`/`priceModifier` pairs — circle-001 (pharma[0]↔s-001, custom, +5), circle-002 (pharma[1]↔s-001, 0), circle-004 (pharma[3]↔s-001, +3), circle-005 (pharma[4]↔s-001, 0), circle-006 (pharma[5]↔s-001, +2), circle-003 (pharma[0]↔s-002, +3), circle-007 (pharma[1]↔s-002, 0), circle-008 (pharma[3]↔s-002, +4), circle-009 (pharma[0]↔s-004, 0), circle-010 (pharma[4]↔s-004, +5), circle-011 (pharma[1]↔s-005, 0). IDs are out of numeric order in source; pharma[2] (pending Wellness) has no row; membership differs from the LIVE `defaultCircleEntries` (e.g. seed array puts pharma-005 in stockist-004's circle; the live table does not). Confirms these are two disjoint circle models.
- **`PharmacistProfile` label vocabularies** (render-time maps, `src/modules/pharmacist/PharmacistProfile.tsx` L13–15): purchaseRangeLabels `lt_50k`→"Less than ₹50,000", `50k_2l`→"₹50,000 – ₹2,00,000", `2l_5l`→"₹2,00,000 – ₹5,00,000", `5l_plus`→"₹5,00,000+"; entityLabels proprietorship/partnership/private_limited/llp → "Proprietorship"/"Partnership"/"Private Limited"/"LLP". Admin PharmacyDetail uses a *shorter* variant of the same map: "<₹50K", "₹50K–₹2L", "₹2L–₹5L", "₹5L+" (`src/modules/admin/PharmacyDetail.tsx` L12).
- **`StockistProfile` label vocabularies** (`src/modules/stockist/StockistProfile.tsx` L17–20): yearsLabels `0_1`→"Less than 1 year" … `10_plus`→"10+ years"; timeSlotLabels morning→"8 AM – 12 PM", afternoon→"12 PM – 4 PM", evening→"4 PM – 8 PM", full_day→"Full Day"; deliveryChargeLabels free→"Free Delivery", flat→"Flat Rate", free_above→"Free Above Amount", distance→"Based on Distance". Admin StockistDetail duplicates these with slight wording differences ("<1 year", "Distance Based" — `src/modules/admin/StockistDetail.tsx` L10–21).
- **`rolePermissions.admin` negative space** (`src/core/roles.ts`): admin is explicitly `false` for canManageInventory, canPlaceOrders, canBrowseMedicines, canManageCircle, canManageSubscription — i.e. by the (unenforced) matrix the admin is *not* supposed to transact, only govern.
- **PaymentReminder full field trace**: written with `{pharmacyName, pharmacyId, amount, message, channel:'whatsapp'}`; StockistPayments' "All Pharmacies with Dues" path writes one reminder **per pharmacy with dues** in a loop, each carrying that pharmacy's outstanding as `amount` (`src/modules/payments/StockistPayments.tsx` handleSendReminder).
- **Invoice number counter quirk**: format is hardwired `INV-2024-{###}` (`AppStateContext.tsx` L709) regardless of the actual year — invoices created "today" (2026 clock) still mint 2024-prefixed numbers.

### E2.4 Workflow traces (newly traced branch/exception detail)

- **Admin approval action → toast semantics** (`src/modules/admin/ApprovalCenter.tsx` L42–43): the toast title is `User {label}` where label = "verified" if the action was `approved`, otherwise the raw enum value — so "Request Update" yields the grammatically odd toast **"User update_required" / "User has been update_required successfully."** Same pattern on StockistDetail ("Stockist {verified|rejected|update_required}", L34) and PharmacyDetail ("Pharmacy {…}", L28).
- **Suspend flows, verbatim**: StockistList/PharmacyList suspend toggles show only toast "Status updated" (`StockistList.tsx` L20–23); the detail pages show "Suspended" + (stockist only) "Stockist has been suspended."; Suspensions reinstate toasts "User reinstated". Nothing confirms — all are single-click, no confirmation dialog anywhere in the admin module.
- **Order status action trace with exact copy** (`OrderDetail.tsx` L63–81): click action → 1000ms wait → `updateOrderStatus(order.id, action.status)` → if action.status === 'confirmed' also `generateInvoice` → toast `{title: label, description: 'Order {orderNumber} has been {label.toLowerCase()}'}` — e.g. confirming yields "Confirm Order" / "Order ORD-… has been confirm order" (the label, not the status, is lower-cased into the sentence).
- **Return approval sequencing** (`OrderDetail.tsx` L199–200 + `AppStateContext.approveReturn`): stockist clicks "Approve" → toast "Return approved, credit note created" → CreditNote appears; "Reject" → toast "Return rejected". Both buttons render only for `role === 'stockist'` AND `ret.status === 'pending'`; admin and pharmacist see the request read-only.
- **StockistPayments approvals-tab pseudo-workflow**: tab lists payments with derived status `pending` (any non-`paid` payment); "Approve" button fires toast "Approved" / "₹{amount} payment approved" (L162) but mutates nothing — after reload the same payments are still pending. This is the only place in the app where a button visually implies a state change that has no state.
- **Reminder fan-out branch** (StockistPayments dialog): "Send To" = "All Pharmacies with Dues" loops every unique pharmacy with outstanding > 0, calling `sendReminder` once each; picking a specific pharmacy sends one. Success toast (both branches): "Reminders Sent" / "Payment reminders sent via WhatsApp" (L73). Reminder History card then lists the **last 3, reversed** (L176–186).
- **Pharmacist pay-dues FIFO trace with exact copy** (`PharmacistPayments.tsx`): "Pay Now — ₹{outstanding}" → modal "Pay {stockistName}" → amount prefilled → method select (UPI default, Bank Transfer, Cash) → "Pay ₹{amount}" → FIFO over that stockist's unpaid non-cancelled orders → toast "Payment Sent" / "₹{amt} paid to {stockistName}" (L77).
- **Checkout failure branches, order of evaluation** (`Checkout.tsx` handlePlace L96–115): (1) `validateStock` → toast "Stock Issue" + first error, abort; (2) if payment === pay_later AND creditWarnings → toast "Credit Limit Exceeded" / "Cannot use Pay Later for {stockist}", abort; (3) otherwise proceed. Note the place button is *also* disabled when creditWarnings exist, so branch (2) is normally unreachable except when warnings appear between render and click.
- **QuickOrder zero-match branch**: "Create Order" with no matched items → toast "No matched items" / "None of the items could be matched to products" (destructive, L82); success → "Orders Created!" / "{n} order(s) for {m} items" (L140).
- **Holiday add validation order** (`HolidayManagement.tsx` L23–24): empty date → "Date is required"; past date → "Date must be today or in the future"; success → "Holiday added"; delete → "Holiday removed".
- **FindPharmacy create-new branch trace**: missing name/phone → toast "Name and Phone are required" (L62); success path posts *two* mutations (registerPharmacist → addCircleEntry) then toast "Pharmacy created and added to circle" (L104); the plain add path toasts "Pharmacy added to circle" (L53). Circle-entry notes field for created pharmacies is hardcoded "Personal circle pharmacy" (L102).
- **Cart line-removal**: Trash on a cart row toasts "Removed" / "Item removed from cart" (`Cart.tsx` L38) — the only cart mutation with feedback (qty steppers are silent).

### E2.5 Business rules & calculations (new)

- **BrowseMedicines delivery-date rule**: `getDeliveryDate()` = `new Date(now + 2*864e5)` formatted `toLocaleDateString('en-IN', {day:'numeric', month:'short'})` (`BrowseMedicines.tsx` L42–46) — a pure display rule; no order field stores a promised date.
- **StatCard trend-suppression rule** (see E2.2): trend arrows require `change !== undefined`; screens passing only `trend` show no arrow. Screens that DO show live arrows are only AdminDashboard (hardcoded +12/+8) and stockist Analytics (hardcoded KPI list).
- **AdminPayments "verified" derivation**: a payment maps to display status `verified` iff `p.status === 'paid'`, else `pending` (`AdminPayments.tsx`) — "partial" payments therefore count as pending in the Verified stat: `verified = Σ amount of paid-status payments` (L27).
- **StockistPayments bills-tab status derivation** (L53): invoice display status = order fully paid → 'paid'; invoice.status === 'issued' → 'unpaid'; else 'draft'. Color rule (L59–63): verified/paid → emerald, pending/partial → amber, else red.
- **ApprovalCenter "Verified" wording rule**: filter chip and toast rename `approved` → "Verified"/"verified" but the underlying writes are still the `approved` enum — pure presentation mapping (L65–69, L42).
- **QuickBill quantity default**: any parsed line with no numeric token gets `quantity = 1`; lines whose cleaned product text length ≤ 1 are dropped entirely (parse fn, `QuickBill.tsx` L63–66 + filter).
- **QuickOrder estimate vs order price**: estimate uses FIFO `getBestBatch().sellingPrice`; the created order line uses `batches[0]` price/batch — when a medicine's first array batch differs from its earliest-expiry batch, **the charged unit price can differ from the estimate shown** (compounding the batch bug already noted in §4.8).
- **UserFlow status color rule** (documentation-only): `statusVariantMap` assigns `credit → accent`, `flagged → destructive`, `settled/completed/active → success` (`UserFlowPage.tsx` L53–59) — the only formal color assignments those pseudo-statuses ever get.
- **Registration credit-eval observation string**: the evaluation card renders "Based on {ratio}% credit-to-purchase ratio, we'll need to observe your platform usage for {months} months before activating your credit limit." with tier lines "✓ Low ratio — faster approval expected" / "● Standard evaluation period applies" / "⚠ Higher ratio — extended observation needed" / "⚠ High credit ratio — longer evaluation required" (`PharmacyRegistration.tsx` L451–457).
- **Pharmacy-reg GST regex is dead**: `gst: /^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]$/` is defined (L69–75) but `getFieldError` validates GST purely by `length === 15` — the structural regex is never applied.

### E2.6 Data-layer reference (new)

- **Ledger description strings, verbatim** (`AppStateContext.tsx`): order DEBIT → `Order {orderNumber} placed` (L567–580); payment CREDIT → `Payment received — pay-dyn-{ts}` (the payment's own id embedded in the description, L676–689); generic `addLedgerEntry` mints `led-dyn-{ts}` ids (L695).
- **Timeline note strings, verbatim**: creation note "Order placed" (L556); every `updateOrderStatus` default note "Status changed to {newStatus}" (L621/632) unless a caller passes a custom note (no caller does).
- **connectedStockists hydration guard**: on load, the stored value is accepted only if it is a non-array object (`typeof === 'object' && !Array.isArray`), otherwise defaults are rebuilt from `defaultCircleEntries` — the only slice with shape validation.
- **Banner id/date mint** (BannerManagement): new banners get id `ban-{Date.now()}` and `createdAt = new Date().toISOString().slice(0,10)` (date-only string, unlike other entities' full ISO).
- **localStorage write amplification**: the persistence `useEffect` serializes all 29 slices on ANY slice change; orders embed full Medicine+Batch objects per item, so localStorage growth is O(orders × items) with duplicated catalog data — no eviction or size guard exists.
- **Auth storage contents**: `digi-swasthya-auth` stores the FULL profile object (including documents array, bank fields) + role; `loadAuthState` requires both keys present else discards (AuthContext L5, loadAuthState). The stored user is a snapshot — admin status changes (`userStatusOverrides`) do NOT update the logged-in user's own `user.status`, so a "suspended" stockist's profile page still shows their pre-suspension status banner until re-login (and re-login just reloads the seed user anyway).
- **Mock-data behavior at runtime clock 2026**: seed batches batch-010 (2026-05-20) and batch-001 (2026-06-15) are expired relative to the current date (2026-07-08), joining batch-002/006 — so med-009 Ciprofloxacin and med-001 Paracetamol's first batch contribute 0 to `totalStock` today; batch-007 (2026-07-01) expired 7 days ago, zeroing med-006's stock as well. Effective sellable seed catalog shrinks month by month as the real clock advances (totalStock rule, `AppStateContext.tsx` L401).

### E2.7 Role journeys step-by-step (click-level additions)

**Admin — banner + notification governance micro-journey** (new detail): Dashboard → Quick Action "Notify" → `/admin/notifications` (read-only merged feed; clicking a card only toggles its local read state — `actionUrl` values on notif-001/002/003 such as `/orders/order-002`, `/payments` are never navigated). To actually publish content the admin must use `/admin/banners` → "Create" → Title/CTA Text/Message/Target Audience ("All Users"/"Stockists Only"/"Pharmacists Only") → "Save Banner" → toast "Banner created". Because the form has no CTA-URL field, admin-created banners can never render a working CTA on stockist/pharmacist dashboards (which require `banner.ctaUrl`).

**Admin — verification detail journey with exact clicks**: `/admin/approvals` → chip "Pending" → expand row (chevron) → inline facts (GST:/DL:/License:) → "View Details" → `/admin/stockists/:id` or `/admin/pharmacies/:id` → four header buttons Verify / Reject / Request Update / Suspend → each immediately writes `updateUserStatus` and toasts (no confirm step) → back-nav only via browser/back arrow (no post-action redirect).

**Stockist — reminder journey (list vs payments page)**: two disjoint reminder UIs exist. (a) `/stockist/circle` card menu → "Send Reminder" (disabled with inline "(No dues)" when outstanding = 0) → modal with Message Type toggle "Common for All"/"Individual", default message "Hi, this is a friendly reminder regarding your outstanding payment. Please settle the dues at your earliest convenience. Thank you!", priority select "Low — Gentle Reminder"/"Medium — Regular Reminder"/"High — Urgent Reminder" → "📱 Send via WhatsApp". (b) `/stockist/payments` header "Send Reminder" → dialog "Send Payment Reminder" → "Send To" = "All Pharmacies with Dues" or one pharmacy → same emerald WhatsApp button; default message here lacks the trailing "Thank you!" (`StockistPayments.tsx` L23 vs `CirclePharmacies.tsx` L27 — two near-duplicate default strings).
 
**Stockist — offline-sale journey**: `/stockist/orders/create` → toggle "Record Offline Transaction" ("Record an order that happened outside the platform") → pick circle pharmacy → add items → "Create Order" → order lands directly `confirmed` (stock deducted, invoice NOT auto-generated here — unlike QuickBill which calls generateInvoice; the invoice appears only when someone later opens OrderDetail and uses View Invoice) → toast "Offline Order Recorded!".

**Pharmacy — quick-order-from-WhatsApp journey (full click path)**: Dashboard Quick Action "Quick Order" → `/pharmacist/orders/quick` → optionally "Use Sample" → "Parse Items" → review rows (amber "(unmatched)" rows contribute nothing and cannot be remapped — unlike stockist QuickBill there is NO manual product select here) → "Create Order — {n} items" → one PLATFORM `placed` unpaid order per involved stockist → toast → `/pharmacist/orders`. The "Order From" dropdown filters nothing; grouping always follows each matched medicine's true owner.

**Pharmacy — post-delivery journey**: order delivered → `/pharmacist/inventory` rows appear automatically ("Your inventory will be auto-populated when orders are delivered" empty-state confirms the mechanism) → OrderDetail gains "Request Return" → `/orders/:id/return` → tick items, set "Return Qty:", reason textarea → "Submit Return Request ({n} items)" → toast "Return Request Submitted" / "The stockist will review your request." → stockist Approve mints credit note → pharmacist sees "Credit Note: cn-{ts}" chip; the note has no further UI anywhere.

### E2.8 Hidden/internal functionality (new)

- **`setRole()` demo switcher** (`AuthContext.tsx` L102–107) — exposed on the context, swaps the session to another role's first seed user, persisted; no UI invokes it (only reachable via devtools/tests).
- **Playwright/Lovable harness**: `playwright-fixture.ts` merely re-exports `test, expect` from `lovable-agent-playwright-config/fixture`; `playwright.config.ts` is `createLovableConfig({})` with all overrides commented out — CI-ready but zero E2E specs exist in the repo.
- **Branding internals**: `index.html` title/meta "Digi Swasthya — B2B Medicine Supply Management"; og/twitter images point at an external `r2.dev` Lovable preview PNG; the app loads Google Font **Lexend** (300–700) and Tailwind registers `fontFamily.lexend`; theme tokens in `src/index.css`: primary `hsl(224 73% 50%)` (blue), accent `213 94% 68%`, success `142 76% 36%`, warning `38 92% 50%`, destructive `0 84% 60%`, background `206 100% 97%`, radius `0.75rem`, plus a full dark-mode variable set and custom utilities `.shadow-card`/`.shadow-card-hover`; custom keyframes `fade-in` (opacity+8px rise, 0.3s) and `slide-up` (16px rise, 0.4s) alongside the shadcn accordion pair (`tailwind.config.ts`).
- **Dead 10MB claim**: PurchaseBills' "max 10MB" hint has no corresponding size check (contrast FileUploadField's real 5MB gate).
- **Seed notification targets as hidden fixtures** (`banners.ts` L10–16): notif-001 targets pharma-002 (actionUrl `/orders/order-002`), notif-002 pharma-001 ("Payment Overdue" for ORD-2024-004, actionUrl `/payments` — an unrouted path), notif-003 stockist-002, notif-004 all (push-type "Counterfeit Alert" naming batch ZYD-AZI-2024A), notif-005 stockist-001 ("Low Stock Warning… 80 units remaining" — referencing med-005's expired batch-006 quantity). Because the demo logins are admin-001/stockist-001/pharma-001, notif-001/003 are never visible to any reachable session.
- **UserFlowPage as spec artifact**: its data-op pills name 14 pseudo-tables that exist nowhere in code (`purchase_bills`, `credit_settings`, `restrictions`, `approval_log`, `suspension_log`, `reminders.schedule`, `push.send`, `permissions`, `alerts`, `timeline`, `cart`, `pricing`, `service_areas`, `commissions`) — a complete shadow schema for the intended backend.
- **AdminAnalytics hardcoded datasets, verbatim**: revenue Jun 45000 / Jul 52000 / Aug 48000 / Sep 61000 / Oct 58000 / Nov 72000; userGrowth Jun {8,25} → Nov {18,60} (stockists, pharmacies); period select options This Month/Last Month/This Quarter/This Year (values this_month/last_month/quarter/year) — all inert (`AdminAnalytics.tsx` L8–17). Stockist Analytics datasets: revenue Oct 125000 → Mar 178000; order-status pie Delivered 45 / Pending 12 / Processing 8 / Cancelled 3 with literal HSL colors (`Analytics.tsx` L7–21).

### E2.9 Validation & error-handling catalog (verbatim additions)

**Field-validation messages (previously undocumented exact strings):**
| Screen | Condition | Message (verbatim) |
|---|---|---|
| AuthPage login | empty fields | "Please enter email and password" |
| AuthPage login | login() false (dead) | "Invalid credentials." |
| AuthPage signup | empty | "Please fill in all fields" |
| AuthPage signup | mismatch | "Passwords do not match" |
| AuthPage signup | <6 chars | "Password must be at least 6 characters" |
| ResetPassword | <6 chars | "Minimum 6 characters" |
| ResetPassword | mismatch | "Passwords do not match" |
| Registration (both) | required empty | "This field is required" |
| Registration | PAN regex fail | "Invalid PAN format (e.g. ABCDE1234F)" |
| Registration | GST length ≠15 | "GST must be 15 characters" |
| Registration | phone/whatsapp | "Must be 10 digits" |
| Registration | email regex | "Invalid email address" |
| Registration | pincode | "Must be 6 digits" |
| Registration | password | "Minimum 6 characters" |
| Stockist reg | IFSC length ≠11 | "IFSC must be 11 characters" |
| AddItem | name/manufacturer/batch/expiry empty | "Required" |
| AddItem | past expiry | "Must be a future date" |
| AddItem | bad MRP | "Valid price required" |
| AddItem | sale > MRP | "Cannot exceed MRP" |
| AddItem | bad qty | "Valid quantity required" |
| EditProduct | name empty | "Product name is required" |
| EditProduct | manufacturer empty | "Manufacturer is required" |
| EditProduct | past expiry | "Expiry must be a future date" |
| EditProduct | sale > MRP | "Sale price cannot exceed MRP" |

**Destructive/error toasts (verbatim, with source):**
- "Please fix errors" / "Some required fields are missing or invalid" — both registration wizards on blocked Next.
- "Required" / "Please accept Terms & Privacy Policy" — registration submit without both checkboxes.
- "Missing Fields" / "Batch number, quantity, and expiry date are required"; "Invalid Expiry" / "Expiry date must be in the future"; "Invalid Price" / "Selling price cannot exceed MRP" — ProductDetail Add-Batch dialog (L63–74).
- "Stock Error" / first `validateStock` error — CreateOrder (L94). "Stock Issue" / first error — Checkout (L103) (two different titles for the same engine errors).
- "Credit Limit Exceeded" / "Cannot use Pay Later for {stockist}" — Checkout (L109).
- "Not Available" / "No valid batches available for this medicine" — BrowseMedicines add (L60).
- "No matched items" / "None of the items could be matched to products" — QuickOrder (L82).
- "Date is required"; "Date must be today or in the future" — HolidayManagement (L23–24).
- "Name and Phone are required" — FindPharmacy create (L62).
- "Select at least one item" — ReturnRequest submit with none (L66).
- "Pharmacy Removed" (destructive variant used for a *success* — CirclePharmacyDetail L223).

**Success/neutral toasts (new verbatim entries):** "Item Added" / "{name} has been added to inventory."; "Product Updated" / "{name} has been updated."; "Batch Added" / "Batch {batchNumber} added successfully"; "Bill Created!" / "{orderNumber} for {pharmacyName}"; "Order Created!" | "Offline Order Recorded!" / "{orderNumber} placed for {pharmacyName}"; "Upload Complete" / "{n} items imported, {m} errors found."; "Bill Processed" / "{n} items extracted and inventory updated"; "Bill deleted"; "Prices Updated" / "{n} products updated successfully"; "Downloading" / "{report} for {month} {year}"; "Plan upgraded!" / "You've been upgraded successfully"; "Payment Collected" / "₹{amt} collected via {mode}" (CirclePharmacies) vs "₹{amt} received via {method}" (CirclePharmacyDetail); "Credit Updated" / "Credit limit set to ₹{n}, {d} days"; "Phone copied"; "Holiday added"/"Holiday removed"; "Service area added"/"Area removed"/"Delivery slot added"/"Slot removed"; "Changes Saved" / "{section} updated successfully." (both profile pages); "Reminder Sent" / "Payment reminder sent to {pharmacy} via WhatsApp"; "Reminders Sent" / "Payment reminders sent via WhatsApp"; "Approved" / "₹{amount} payment approved" (no-op); "Payment Added" / "₹{amt} payment recorded"; "Note added"; "Return approved, credit note created"; "Return rejected"; "Order Updated" / "Items and totals recalculated"; "Return Request Submitted" / "The stockist will review your request."; "Payment Sent" / "₹{amt} paid to {stockist}"; "Order Placed!" / "{n} order(s) submitted successfully."; "Orders Created!" / "{n} order(s) for {m} items"; "Added to Cart" / "{name} added"; "Removed" / "Item removed from cart"; "Address Added"; "Default Address Updated"; "Address Removed"; "Preferences saved" / "Your delivery preferences have been updated"; "Connected!" / "You are now connected to {stockist}"; "Pharmacy added to circle"; "Pharmacy created and added to circle"; admin set: "User {verified|rejected|update_required}" / "User has been {…} successfully."; "Status updated"; "Suspended" (+ "Stockist has been suspended." on StockistDetail); "User reinstated"; "Commission rule added"; "Rule deleted"; "Banner created"; "Banner deleted"; "Flag updated" / "Counterfeit status has been toggled"; "Profile Updated" / "Admin profile saved."; "Email Sent" / "Check your email for reset instructions."; "Password Updated" / "You can now sign in with your new password."; "Welcome back!" / "Signed in successfully"; "Welcome back, Admin!"; "Welcome!" / "You can explore the app while your registration is being reviewed."; "Demo credentials filled"; "Payment Completed" / "₹{n} paid successfully" (dead PaymentsPage only).

**Empty-state catalog (verbatim additions):** "No users found"/"No users match your current filter" (ApprovalCenter); "No stockists found"/"No pharmacies found" + "Try a different search term" (admin lists); "No suspended users"/"All users are active"; "No commission rules"/"Add your first commission rule"; "No banners"/"Create your first banner"; "No transactions"/"No transactions match your filter"; "No entries"/"Ledger is empty"; "No payments found" (AdminPayments); "No products found" + adaptive desc/action (Inventory); "No batches found"/"No batches match your filter"; "No pharmacies"/"Add pharmacies to your circle" + "No matching pharmacies"/"Try a different filter" (CirclePharmacies); "No pharmacies in your circle" (QuickBill step 2 & CreateOrder); "No bills uploaded"/"Upload your first purchase bill"; "No upcoming holidays"; "Pharmacy not found"; "No orders yet"; "No payments recorded"; "No ledger entries"; "No outstanding orders"; "Product not found"/"This product doesn't exist"; "No sales data yet"; "No documents uploaded yet"; "No connected stockists"/"Connect with stockists to start ordering" (Browse stockist view); "No medicines found" + conditional desc "Connect with stockists first to browse their products" | "Try a different search term"; "No connected stockists yet" (PharmacistStockists); "Cart is empty"/"Browse medicines to add items"; "No addresses saved. Add one to continue." (Checkout) vs "No addresses saved. Add one to get started." (Addresses); "No inventory yet"/"Your inventory will be auto-populated when orders are delivered"; "No orders found"/"No orders match the selected filter" (OrderList); "Order not found" + "Go Back"; "Order not found or not eligible for return" + "Go Back"; "Stockist not found" + "Go Back"; "No orders with this stockist"; "No outstanding dues"/"All payments are up to date"; "No payment history"/"Payments you make will appear here"; "No payments yet"/"Payments from pharmacies will appear here"; "No bills yet"/"Invoices will appear here when orders are confirmed"; "No pending approvals"; "No notifications yet"; "Send a message to start the conversation"; "Start typing to search…" / "No results for \"{query}\"" (GlobalSearch); "Profile not found" (PharmacistProfile); "{n} pharmacies found" (FindPharmacy count line); "No payments yet"/"No ledger entries" (dead PaymentsPage).

**Silent-failure inventory (no message shown):** FileUploadField >5MB drop (registration components); `addToCart` guard failures (context returns silently; BrowseMedicines still toasts "Added to Cart" — pre-existing note, now with the added detail that the "existing in cart" lookup matches by batchId only); CirclePharmacies/CirclePharmacyDetail collect with amount ≤ 0; DeliverySetup add-area/add-slot with empty fields; FindPharmacy "Add to Circle" with blank credit fields (defaults substitute); BannerManagement save with missing title/message (button no-ops via guard); CommissionSetup save with missing category/rate (same pattern).

*End of Expansion Pass 2. Subsections with no genuinely new findings beyond the existing review: none — every subsection above contains only newly documented material.*

### E2.10 Continuation — additional new reference material (same pass, 2026-07-08)

#### E2.10.1 Settings hub — verbatim menu descriptions (`src/pages/Settings.tsx` L17–102)
§0.8 listed the menu items; the per-item `desc` strings were undocumented:
- **Admin:** Profile "Admin profile & contact info"; Verifications "Verify new registrations"; Stockists "Manage stockist registrations"; Pharmacies "View all pharmacies"; Suspensions "Suspended users list"; Payments "Platform payment overview"; Transactions "Platform-wide transaction log"; Platform Ledger "Financial overview"; Commission Setup "Set commission rates"; Analytics "Revenue, growth, user insights"; Counterfeit Management "Flag & manage products"; User Flow "System architecture diagram"; Banner Management "Manage promotional banners"; Notifications "System alerts & broadcasts"; Support "Chat with support team"; Help Center "FAQs & support".
- **Stockist:** Profile "Business profile & documents"; Products "Manage your inventory"; Batch Management "Track batches & expiry"; Bulk Upload "Upload product catalogue"; Bulk Price Update "Update prices in bulk"; Purchase Bills "Upload purchase bills"; Orders "View & manage all orders"; Quick Bill "Create bill from WhatsApp order"; Create Order "Create a new order"; Payments "Track payments & dues"; Circle Pharmacies "Manage your pharmacy network"; Holidays "Manage holiday schedule"; Reports "H1, HNX, GST & sales reports"; Analytics "Revenue trends & order insights"; Delivery Setup "Areas & time slots"; Subscription "Plan & billing usage"; Notifications "Alerts & reminders"; Support/Help Center as admin.
- **Pharmacist:** Profile "Pharmacy profile & license"; My Stockists "Manage stockist connections"; Quick Order "Order from WhatsApp text"; Browse Medicines "Search & order medicines"; Cart "View your cart"; Orders "View all orders"; Payments "Track payments & dues"; My Inventory "Inventory from received orders"; Addresses "Manage delivery addresses"; Delivery Preferences "Time slots & instructions"; Notifications "Alerts & reminders"; Support/Help Center as admin.
- The search box filters by label OR desc; component returns `null` for an unknown role (L108). Section title vocabulary across roles: Account, Users, Finance, Analytics & Monitoring, Content, Preferences, Inventory, Orders & Billing, Business, Management.

#### E2.10.2 Reports — the 7 hardcoded report objects verbatim (`src/modules/stockist/Reports.tsx` L10–18)
| id | Title | Badge (color family) | Description (verbatim) | lastGenerated |
|---|---|---|---|---|
| r1 | H1 Monthly Report | H1 (blue) | "Monthly H1 drug purchase & sales report as per Drug & Cosmetics Act" | 2026-03-01 |
| r2 | H1 Annual Report | H1 (blue) | "Annual consolidated H1 drug register for Schedule H & H1 drugs" | 2026-01-15 |
| r3 | HNX Drugs Report | HNX (purple) | "Report of narcotic & psychotropic substances as per NDPS Act" | 2026-03-01 |
| r4 | HNX Annual Report | HNX (purple) | "Annual consolidated HNX drug register for Schedule X drugs" | 2026-01-15 |
| r5 | GST Sales Report | GST (emerald) | "GST-compliant sales report with HSN codes and tax breakdowns" | 2026-03-01 |
| r6 | Monthly Sales Report | Sales (amber) | "Detailed monthly sales with product-wise and pharmacy-wise breakdowns" | 2026-03-01 |
| r7 | Stock Summary Report | Sales (amber) | "Current stock levels, expiring products, and batch-wise inventory" | 2026-03-15 |

Type-filter chips (L22–28): "All Reports", "H1 Reports", "HNX Reports", "GST Reports", "Sales Reports". Card footer "Last generated: {date}"; button "Download".

#### E2.10.3 Subscription plans — verbatim feature lists (`src/modules/stockist/SubscriptionPage.tsx` L10–14)
- **Basic 100** — ₹999/month, 100 bills: "100 bills/month", "Basic inventory", "Email support".
- **Standard 200** — ₹1999/month, 200 bills: "200 bills/month", "Batch management", "Priority support", "Circle pharmacies".
- **Premium 500** — ₹4999/month, 500 bills: "500 bills/month", "All features", "Dedicated support", "Custom pricing", "Analytics dashboard".
Fallback subscription when the user record has none (L21): `basic_100`, 0/100 used, validUntil `2026-12-31`. Plan card sub-line "{bills} bills per month"; price rendered "₹{price}" + "/month"; buttons "Current Plan" (disabled) / "Upgrade"; section heading "Plans"; usage line "{limit − used} bills remaining".

#### E2.10.4 Registration option sets & helper copy (verbatim, both wizards)
- **Stockist option labels** (`StockistRegistration.tsx`): businessTypes "Sub-Stockist" (+ "Super Stockist"/"Distributor" disabled with pill "Coming soon"); yearsOptions "Less than 1 year"/"1-3 years"/"3-5 years"/"5-10 years"/"10+ years"; timeSlots "8 AM – 12 PM"/"12 PM – 4 PM"/"4 PM – 8 PM"/"Full Day (8 AM – 8 PM)"; deliveryChargeTypes "Free Delivery"/"Flat Rate"/"Free Above Amount"/"Based on Distance"; weekDays Mon–Sun chips. Helper strings: business-type hint "Sub-Stockists serve limited areas within a city" (L216–218); document-card sublabels "Wholesale sale of drugs (general allopathic)" (L254) and "Required for Schedule X drugs" (Form 21B, L269); maps helper "Helps pharmacies locate your office" (L299); rules helpers "Max credit per pharmacy" (L391), "Orders below this won't be accepted" (L394), "Orders above this amount get free delivery" (L403), "Delivery charge for orders below the free threshold" (L404), "Fixed base charge + per km rate" (L410); pincode input placeholder "Enter 6-digit pincode" (L365).
- **Pharmacy option labels** (`PharmacyRegistration.tsx`): pharmacyTypes "Retail Pharmacy"/"Chain Pharmacy"/"Clinic Pharmacy" (+ "Hospital Pharmacy" disabled "Coming soon"); entityTypes "Proprietorship"/"Partnership"/"Private Limited"/"LLP"; purchaseRanges "Less than ₹50,000"/"₹50,000 – ₹2,00,000"/"₹2,00,000 – ₹5,00,000"/"₹5,00,000+"; gstTypes "Regular"/"Composition"; 11 category chips (Antibiotics, Analgesics, Cardiovascular, Diabetes, Dermatology, Gastro, Neurology, Respiratory, Vitamins, Ayurvedic, OTC). Both wizards share a 10-state `indianStates` list. Dynamic hints (L265–269): chain "You can add multiple store locations after approval"; clinic "Clinic pharmacies have simplified GST requirements"; chain contact-step banner "As a chain pharmacy, you can add more branches from your dashboard after verification." (L391); document sublabels "Retail sale of drugs (general allopathic)" (L320) and "Required only if selling sera, vaccines, or Schedule C1 drugs" (Form 21, L328); credit-switch caption "Buy now, pay later facility" (L427) and days helper "Standard: 15-45 days" (L435); eval placeholder "Fill in credit amount to see your estimated evaluation period." (L465); PAN helper "Company or individual PAN" (L290); GST helper "Optional for clinics" (L294); branches helper "Total pharmacy branches" (L298).
- **Review-step field labels**: Stockist ReviewCards (L431–519) — Business Details (Business Name/Type/GST/PAN/Drug License/Experience), Documents ("Drug License (20B)", "GST Cert", "Form 21B", "FSSAI" with "—" fallbacks), Contact & Address (Contact/Phone/Email/Office/Office Maps/Warehouse [fallback "Same as office"]/City/Pincode), Delivery Setup (Days/Slots/Pincodes/Radius), Business Rules (Credit Limit/Credit Days/Min Order/Delivery), Financial Details (Bank/Account/IFSC/UPI). Pharmacy ReviewCards (L476–545) — Business Details (+Branches if chain, GST hidden for clinic), Documents (+License Expiry, GST Cert/GST Type hidden for clinic), Contact & Address, Business Configuration (Monthly Purchase/Categories/Credit ["Yes — ₹{amt} ({days} days)" | "No"]/Eval Period "{months} months"). T&C block heading "Before submitting"; checkbox rows "I accept the Terms & Conditions" / "I accept the Privacy Policy". Success modal body strings: "Your {stockist|pharmacy} registration has been sent for verification.", "Verification usually takes 24-48 hours", "Our team will review your documents and verify your details.", "Start exploring now", "You can use the full application as an unverified user while your verification is pending.", "Go to Sign In instead". Footer nav buttons "Previous" / "Next" / "Submit for Verification".

#### E2.10.5 Seed banner copy verbatim (`src/core/data/banners.ts` L4–8)
- ban-001 "Year-End Sale!" — "Get up to 15% off on bulk orders. Place your order before Dec 31." CTA "Order Now" → `/orders` (404, per §14.11); target pharmacists; createdAt 2024-11-01.
- ban-002 "New Subscription Plans" — "Upgraded billing plans now available. Check out the new Premium 500 plan." CTA "View Plans" → `/subscription` (404); target stockists; 2024-11-10.
- ban-003 "Platform Maintenance" — "Scheduled maintenance on Dec 1, 2-4 AM IST. Services may be briefly unavailable." No CTA; target all; 2024-11-25.
Seed notification bodies verbatim (L10–16): "Your order ORD-2024-002 has been confirmed by MedCorp Distributors."; "Payment for order ORD-2024-004 is overdue. Please settle the amount."; "City Care Pharmacy has placed a new order ORD-2024-003."; "Azithromycin 500mg (Batch ZYD-AZI-2024A) has been flagged as counterfeit."; "Cetirizine 10mg stock is below threshold (80 units remaining)."

#### E2.10.6 Profile edit-modal field manifests (all toast-only saves)
- **StockistProfile** (`src/modules/stockist/StockistProfile.tsx` L210–234) renders exactly 4 EditProfileModal instances; the Delivery Setup / Business Rules / Financial sections have Edit buttons wired to sections **without a modal** (their edit clicks set a section key that matches no modal — those three sections are un-editable even at the toast level): (1) "Edit Contact Details" — contactPerson, phone (tel), whatsapp (tel), email (email); (2) "Edit Business Details" — businessName, drugLicense, gstNumber, panNumber; (3) "Edit Office & Warehouse" — officeAddress (textarea), warehouseAddress (textarea), city, state, pincode; (4) "Manage Documents" — one text field per existing document (key = doc.id, placeholder "Document number"). Save toast section names: 'Contact Details' / 'Business Details' / 'Office & Warehouse' / 'Documents' (L66). Status-banner subtexts: approved "Your business is verified and active."; pending "Registration under review."; else "Please update the requested information." (L89–93). Document tile status glyphs: "✓ Verified" / "✕ Rejected" / "◷ Uploaded" (L145). Member line "Member since {createdAt}" (L108). Business Rules delivery line composes suffixes "— ₹{rate}" / "— Free above ₹{n}" / "— ₹{n}/km" via getDeliveryChargeInfo.
- **PharmacistProfile** (`src/modules/pharmacist/PharmacistProfile.tsx` L146–160): 3 modals — "Edit Contact" (Owner, Phone tel, Email email), "Edit Business" (Pharmacy Name, PAN — only 2 fields, far fewer than displayed), "Edit Address" (Address textarea, City, State, Pincode). Status-banner subtexts: "Your pharmacy is verified." / "Under review." / "Please update info." (L67–68). Section cards: Contact Details (Owner/Phone/WhatsApp [falls back to phone]/Email), Business Details (Pharmacy Name/Type/Legal Entity/PAN/Pharmacist/Reg. No.), Documents (badge "{n} docs", empty "No documents"), Address, Configuration (Monthly Purchase/Categories/Credit "Yes — ₹{amt}"|"No"). InfoItem empty fallback "—" (L22).
- **AdminProfile** (`src/modules/admin/AdminProfile.tsx`): badge card "Platform Administrator" / "Full access to all platform features"; Account Details rows Full Name / Email / Phone / Role ("Platform Administrator") / Member Since; modal "Edit Admin Profile" (Full Name, Email email, Phone tel); save toast "Profile Updated" / "Admin profile saved." (L80).

#### E2.10.7 Miscellaneous new admin-screen facts
- ApprovalCenter H1 is "Verification Center" (not "Approval Center"), subtitle "Review and manage user registrations"; inline expanded-row field prefixes "GST:", "DL:", "License:" (`ApprovalCenter.tsx` L61–133).
- StockistList/PharmacyList subtitles are live counts: "{n} registered stockists" / "{n} registered pharmacies"; expanded stockist row shows "Plan: {plan} ({billsUsed}/{billLimit})".
- PharmacyDetail tab labels carry counts: "Details", "Inventory ({allInventory.length})" — the count itself confirms the global-inventory bug (it shows the platform-wide count), "Orders ({n})" (L33–36).
- CounterfeitManagement flagged-row banner verbatim: "Counterfeit — All sales restricted" (L82); toggle toast "Flag updated" / "Counterfeit status has been toggled" (L27); H1 subtitle "Flag and manage counterfeit products".
- Transactions rows use fallback "No ref" when a payment lacks a reference; date prefixes "Due:" / "Paid:".
- PlatformLedger subtitle "Financial overview across all users"; AdminPayments H1 "Platform Payments" with tab labels "{tab} ({count})"; AdminAnalytics order-distribution pie colors: Delivered `hsl(var(--primary))`, Processing `hsl(45,93%,47%)`, Pending `hsl(220,13%,69%)`, Cancelled `hsl(0,84%,60%)` — note "Processing"/"Pending" are display names not order statuses (the pie groups confirmed+dispatched as Processing? — no: it maps statuses directly; the names are cosmetic labels for confirmed/placed respectively per the dataset construction in `AdminAnalytics.tsx`).
- BannerManagement target-select labels: "All Users" / "Stockists Only" / "Pharmacists Only"; CommissionSetup applied-to select: "All Stockists" + individual stockist names; its getStockistName maps `all` → "All Stockists".

*End of E2.10 continuation.*


# Source: digiswasthya

## 0. GLOBAL ARCHITECTURE

### 0.1 Routing (`src/App.tsx`)
Providers wrap everything: `QueryClientProvider` (client created, never used) → `TooltipProvider` → `<Toaster/>` (shadcn) + `<Sonner/>` (both mounted) → `BrowserRouter`. No auth guards; **every route is publicly reachable by URL**; role is purely a nav choice.

Route tree:
- `/` → `Navigate to /auth`.
- `/auth` → `AuthPage`; `/install` → `Install`.
- `/stockist` (`StockistLayout`): index→home; `home, pharmacies, pharmacies/:id, products, products/:id, orders, orders/:id, orders/create, bills/create, payments, analytics, notifications, documents, help, messages, reports, routes, staff, expiry, credit-notes, purchases, settings/{profile,business,security,app}, more`. `/stockist/onboarding` (standalone, outside layout).
- `/pharmacy` (`PharmacyLayout`, purchase): index→home; `home, browse, browse/stockists, browse/stockists/:id, browse/products, browse/products/:id, cart, orders, orders/:id, orders/smart-create, checkout, payments, wishlist, notifications, messages, help, more, settings/{profile,business,security,app}`. `/pharmacy/onboarding` (standalone).
- `/pharmacy/sale` (`<PharmacyViewProvider><PharmacySaleLayout/></PharmacyViewProvider>`): index→dashboard; `dashboard, inventory, customers, customers/:id, consults, consults/:id, consults/start, reports, more, settings/live, doctors`.
- `/patient` (`PatientLayout`): index→dashboard; `dashboard, search, prescriptions, orders, orders/:id, wishlist, profile, more, consultations, consultations/:id, help, settings/{profile,medical,security}`. `/patient/onboarding` (standalone).
- `/doctor` (`DoctorLayout`): index→dashboard; `dashboard, appointments, appointments/:id, patients, patients/:id, prescriptions, earnings, more, settings/{profile,availability,bank}`. `/doctor/onboarding` (standalone).
- `/admin` (`AdminLayout`): index→dashboard; `dashboard, users, users/:id, stockists, pharmacies, doctors, patients, orders, payments, consultations, reports, settings`.
- `*` → `NotFound` (logs `console.error`, link "Return to Home" → `/`).

### 0.2 Dead / unrouted code (confirmed)
- **Unrouted pages:** `src/pages/Index.tsx` ("Welcome to Your Blank App" — never imported), `src/pages/pharmacy/PharmacyPortal.tsx`, `src/pages/pharmacy/PharmacyProfile.tsx` (both fully built but not in the router).
- **Orphaned dialogs (exported, imported by no page):** `pharmacy/dialogs/CheckoutDialog.tsx`, `pharmacy/dialogs/SmartOrderDialog.tsx` (a full 3-step duplicate of the `SmartOrder` page), `pharmacy/dialogs/ApplyCouponDialog.tsx`, `doctor/dialogs/WritePrescriptionDialog.tsx` (the doctor→patient prescription flow instead navigates to a non-existent route), and stockist `OCRScanDialog`, `MapRouteDialog`, `BillPreviewDialog`, `CreateReturnDialog` (all built, but no stockist page imports them — verify: not referenced in the pages read).
- **Dead data helpers:** `unified-data-helpers.getPlatformMetrics()` and `getPatientPrescriptionVault()` (computed cross-panel metrics/vault) — imported by nothing. Many `pharmacy-mock-data` helpers exported but unused (`getStockistProducts`, `getOrdersByStatus`, `getActiveOffers`, `getWishlistedProducts`, `getCartTotal`, `getCartByStockist`).
- **Regulatory validators never called:** `validateGST/validatePAN/validatePhone/validatePincode/validateAadhaar` and all `DocumentType.validationPattern` — defined in `regulatory-documents.ts`, invoked nowhere. No onboarding/settings form runs any validation beyond "required field present" checks in a few dialogs.

### 0.3 Broken navigation links (routes that don't exist → hit `NotFound`)
These are real dead links wired to `navigate()` in built pages:
- **Patient TopNav** (`PatientTopNav`): bell → `/patient/notifications` (unrouted), message → `/patient/messages` (unrouted).
- **Doctor TopNav** (`DoctorTopNav`): message → `/doctor/messages`, bell → `/doctor/notifications` (both unrouted).
- **PatientDashboard:** "Nearby Pharmacies" View All → `/patient/pharmacies`; pharmacy cards → `/patient/pharmacies/:id` (both unrouted).
- **PatientSearch:** product card → `/patient/medicines/:id` (unrouted).
- **PatientPrescriptions:** card → `/patient/prescriptions/:id` (unrouted; only the list route exists).
- **PatientProfile / PatientMore:** `/patient/settings/emergency`, `/patient/settings/notifications`, `/patient/settings/app`, `/patient/notifications`, `/patient/pharmacies` (all unrouted). Only `settings/profile`, `settings/medical`, `settings/security`, `help` resolve.
- **DoctorMore:** `/doctor/reports`, `/doctor/notifications`, `/doctor/settings/security`, `/doctor/settings/app`, `/doctor/help` (all unrouted). Only `settings/profile`, `settings/availability`, `earnings`, `appointments` resolve. (`/doctor/settings/bank` IS routed but nothing links to it → orphaned route.)
- **DoctorAppointmentDetail:** "Prescribe" → `/doctor/prescriptions/new?patient=…` and "View Prescription" → `/doctor/prescriptions/:id` (neither routed).
- **PharmacyMore** (purchase): all links resolve; **note** the `TopNav` shared component is only actually used by `StockistLayout` — pharmacy/patient/doctor have their own TopNavs, so `TopNav`'s pharmacy/doctor/patient branches are effectively dead.

### 0.4 Currency & date helpers
- Stockist `formatCurrency`: `Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',minimumFractionDigits:0,maximumFractionDigits:2})` → `₹9,497.6`.
- Pharmacy / patient / doctor / admin / unified `formatCurrency`: `` `₹${amount.toLocaleString('en-IN')}` `` (no decimals control).
- `getTimeAgo` duplicated in 3 modules (stockist/pharmacy vs patient/unified differ subtly in threshold logic).

### 0.5 PWA / infra
- `vite.config.ts`: dev port **8080**, SWC React, `lovable-tagger` (dev only). VitePWA `registerType:'autoUpdate'`; manifest name "Digi Swasthya"/short "DigiSwasthya", `theme_color #4a7c94`, background `#ffffff`, standalone/portrait, icons 192/512/512-maskable. Workbox precache `js,css,html,ico,png,svg,woff2`; one runtime rule: Google Fonts stylesheets → CacheFirst (365d, 10 entries).
- Tailwind `fontFamily.sans = ['Lexend', …]`.
- Tests: Vitest configured; `src/test/example.test.ts` placeholder.

---

## 1. AUTH & ONBOARDING

### 1.1 AuthPage (`/auth`, `src/pages/AuthPage.tsx`)
- Card title "Digi Swasthya Store" / "Your Complete Healthcare Platform". Body scroll locked while mounted. Footer "© 2024 Digi Swasthya Store."
- Tabs: **Login** (default) / **Sign Up**. Below tabs, a ghost **"Admin Login"** button with Shield icon.
- **Login tab:** 4-role selector grid (Building2 Stockist / Building Pharmacy / User Patient / Stethoscope Doctor); hint "Click to prefill demo". Fields: Email (prefilled from `demoCredentials[role].email`), Password (prefilled, show/hide toggle). "Remember me" checkbox + "Forgot Password?" link (both inert). Submit label "Login as {Role}". `handleLogin` ignores inputs → `navigate(homeRoutes[selectedLoginRole])`. Demo-mode hint box.
- **Sign Up tab:** 2-col role selector (icon + label + description). Fields: Email (prefill), Password + Confirm (both prefilled `Demo@123`, show/hide). Submit "Continue to Onboarding" → `navigate('/{role}/onboarding')`. No password-match validation.
- **Admin Login** → `navigate('/admin/dashboard')`.
- `useEffect` prefills login creds when `selectedLoginRole` changes, and signup email/passwords when `selectedRole` changes.
- Demo creds (`src/data/demo-credentials.ts`): stockist `demo.stockist@digiswasthya.com`/`Demo@123`, pharmacy/patient/doctor similar, admin `admin@digiswasthya.com`/`Admin@123`.

### 1.2 Onboarding wizards (shared behavior)
Standalone pages (no layout, body-scroll locked, prefilled from `demo-credentials.ts`). `progress = (currentStep/steps.length)*100`. Step-icon rail. **Skip** and **Complete** both toast + `navigate` to role home. **No validation runs** (fields are free text; `DocumentUpload` only makes a local `URL.createObjectURL` preview; doc URLs default to `/placeholder.svg`).

- **Stockist** (`StockistOnboarding`, 5 steps: Business·Documents·Contact·Bank·Complete). Fields: businessName, businessType, PAN (`.toUpperCase()`, maxLength 10, mono). Step2 `DocumentUpload`×4: Drug License, GST, Wholesale (3 `isRequired`, status "pending"), FSSAI (`onDocumentChange={()=>{}}` — upload discarded). Step3: phone(10), email, address(Textarea), city, state (plain Input despite `indianStates` import), pincode(6). Step4: bankName, accountNumber(mono), IFSC(upper/mono), UPI, accountHolderName. Header has Login (→/auth) + Skip. Complete → `/stockist/home`.
- **Pharmacy** (`PharmacyOnboarding`, 5: Store·Documents·Location·Hours·Complete). Step1: storeName, ownerName, PAN(upper,10). Step2 `DocumentUpload`×4: Drug License, GST, Retail (required), Shop (discarded). Step3: phone(10),email,address,city,state,pincode(6). Step4: openTime/closeTime (`type=time`), operatingDays chips via `toggleDay` (weekDays Mon–Sun). Complete → `/pharmacy/home`.
- **Patient** (`PatientOnboarding`, 3: Personal·Health·Address). Step1: name, phone(10), email, DOB(date), gender (Badge chips: Male/Female/Other/Prefer not to say). Step2: bloodGroup chips (from `bloodGroups`), allergies (Input), conditions (Input), emergency contact name/relation/phone. Step3: address(Textarea), city/state/pincode + live "Profile Summary" card. No documents. `handleNext` on final step calls `handleComplete` → `/patient/dashboard`. Step-2 button label is literally "Next (or Skip)".
- **Doctor** (`DoctorOnboarding`, 5: Personal·Credentials·Specialty·Consult·Complete). Step1: name,phone(10),email. Step2: qualification, registrationCouncil, `DocumentUpload`×3 (Medical Registration w/ number, Degree cert, PAN w/ number-upper) all required. Step3: specialization (Input + `medicalSpecializations.slice(0,8)` Badge chips), experience (number 0–60), languages (`commonLanguages` toggle chips). Step4: consultationFee (number, ₹ icon), bio (Textarea), acceptsVideo/acceptsVoice Switches. Complete → `/doctor/dashboard`. **Bug:** footer references `handlePrevious`/`ArrowRight` — `handlePrevious` exists; fine. Note step-4 button "Complete Setup" advances to step 5, then "Go to Dashboard".

---

## 8. ADMIN MODULE

Data: `src/data/admin-mock-data.ts` — `platformStats` (hardcoded: totalUsers 235, stockists 20, pharmacies 55, doctors 60, patients 100, activeUsers 180, totalOrders 2450, totalRevenue 4,850,000, todayOrders 45, todayRevenue 125,000, pendingVerifications 12, activeConsultations 8), `mockAdminUsers`(235: 20 stk + 55 pharm + 60 doc + 100 pat), `mockVerificationRequests`(15; first 3 explicit + 12 generated, all pending), `mockPlatformOrders`(100), `mockPlatformTransactions`(150), `mockConsultationLogs`(50). **`getPlatformMetrics()` (computed) unused.**

### 8.1 Dashboard (`/admin/dashboard` — `AdminDashboard`)
- User Stats KPI (from `platformStats`). Revenue AreaChart (local hardcoded `revenueData` 7-day), User Distribution PieChart (local hardcoded 100/55/60/20). Quick stats: Total Revenue (**+15% hardcoded**), Today's Orders + revenue, Active Consultations→consultations. Pending Verifications (`mockVerificationRequests.filter(pending)` — only computed value; slice 4; **"Review" buttons no-op**). Recent Orders (`getRecentOrders(5)`).

### 8.2 Users (`/admin/users` — `AdminUsers`)
- `mockAdminUsers`. Search (name/email). Tabs all/stockist/pharmacy/doctor/patient with live counts; list `slice(0,20)` ("Showing 20 of N"). Status badge (active/pending/suspended/rejected) + verificationStatus. Dropdown: View Details→`/admin/users/:id`, and status-gated Approve/Suspend/Reactivate = **`handleAction` toast only**.

### 8.3 User Detail (`/admin/users/:id` — `AdminUserDetail`)
- Reads **local `mockUsers` keyed only by `"stockist-1" | "pharmacy-1" | "doctor-1"`**. Since list pages pass ids like `stk-003`, `pharm-001`, `doc-002`, `PAT-001`, `STK-001` etc., **almost every navigation renders "User Not Found."** Where resolved: user overview + Documents tab (per-doc Approve/Reject/Approve-All mutate local state, reset on reload; Reject requires reason via dialog; doc preview dialog shows `/placeholder.svg`) + Details tab (role-specific business/professional fields).

### 8.4 Orders / Payments / Consultations (read-only)
- **Orders** (`/admin/orders`): `mockPlatformOrders`; search (orderNumber/buyerName); tabs all/pending/confirmed/delivered w/ counts; b2b/b2c type badge; `slice(0,20)`.
- **Payments** (`/admin/payments`): `mockPlatformTransactions`; search (fromName); tabs all/order_payment/consultation_fee/commission w/ counts; shows amount + platformFee; `slice(0,20)`.
- **Consultations** (`/admin/consultations`): `mockConsultationLogs`; stats Total / Completed / **Platform Revenue = `Σ platformFee`**; search (doctor/patient); `slice(0,20)`.

### 8.5 Per-role pages (each uses its OWN page-local 5-row array — NOT `mockAdminUsers`)
- **Stockists** (`/admin/stockists`): local `mockStockists`(5, STK-001…005). Search + tabs all/active/pending/suspended. Card: GST/Drug License check/clock icons, pharmacies/orders badges (active only). Dropdown View→`/admin/users/STK-00x` (→ not-found), Approve/Suspend toast.
- **Pharmacies** (`/admin/pharmacies`): local(5, PH-001…005) + LIVE badge; same pattern; View→`/admin/users/PH-00x` (not-found).
- **Doctors** (`/admin/doctors`): local(5, DOC-001…005) + rating/consults/fee; Registration verified icon; View→`/admin/users/DOC-00x` (not-found).
- **Patients** (`/admin/patients`): local(5, PAT-001…005); vocab **active/inactive** (no approve/suspend actions, only View→not-found); orders/consults badges, joinedDate.

### 8.6 Reports / Settings
- **Reports** (`/admin/reports`): summary (**Growth +15% hardcoded**, activeUsers, totalOrders, totalRevenue from `platformStats`); 4 export cards (Users/Orders/Revenue/Consultations) all toast (no file).
- **Settings** (`/admin/settings`): uncontrolled `defaultValue` inputs — Platform Name, Support Email, Support Phone; Order Commission % (2), Consultation Commission % (10); feature-flag Switches (Teleconsultations✓, Patient App✓, Maintenance Mode✗). Save = toast (values not even collected — uncontrolled).

---

## EXPANSION — Code-Derived Additions (Audit Pass)

*Audit date: 2026-07-04. Content derived exclusively from source under `digiswasthya/`. Documents implemented behavior only.*

### E.1 Complete Route Table

**Frontend routes extracted:** 104 | **Server API routes:** 0

| # | Path | Component | Role/Gate | Source |
|---|------|-----------|-----------|--------|
| 1 | `/` | Navigate | — | `src/App.tsx` |
| 2 | `/auth` | AuthPage | — | `src/App.tsx` |
| 3 | `/install` | Install | — | `src/App.tsx` |
| 4 | `/stockist/home` | StockistHome | — | `src/App.tsx` |
| 5 | `/stockist/pharmacies` | StockistPharmacies | — | `src/App.tsx` |
| 6 | `/stockist/pharmacies/:id` | PharmacyDetail | — | `src/App.tsx` |
| 7 | `/stockist/products` | StockistProducts | — | `src/App.tsx` |
| 8 | `/stockist/products/:id` | ProductDetail | — | `src/App.tsx` |
| 9 | `/stockist/orders` | StockistOrders | — | `src/App.tsx` |
| 10 | `/stockist/orders/:id` | OrderDetail | — | `src/App.tsx` |
| 11 | `/stockist/orders/create` | CreateOrder | — | `src/App.tsx` |
| 12 | `/stockist/bills/create` | CreateBill | — | `src/App.tsx` |
| 13 | `/stockist/payments` | StockistPayments | — | `src/App.tsx` |
| 14 | `/stockist/analytics` | StockistAnalytics | — | `src/App.tsx` |
| 15 | `/stockist/notifications` | StockistNotifications | — | `src/App.tsx` |
| 16 | `/stockist/documents` | StockistDocuments | — | `src/App.tsx` |
| 17 | `/stockist/help` | StockistHelp | — | `src/App.tsx` |
| 18 | `/stockist/messages` | StockistMessages | — | `src/App.tsx` |
| 19 | `/stockist/reports` | StockistReports | — | `src/App.tsx` |
| 20 | `/stockist/routes` | DeliveryRoutes | — | `src/App.tsx` |
| 21 | `/stockist/staff` | StaffManagement | — | `src/App.tsx` |
| 22 | `/stockist/expiry` | ExpiryManagement | — | `src/App.tsx` |
| 23 | `/stockist/credit-notes` | CreditNotes | — | `src/App.tsx` |
| 24 | `/stockist/purchases` | PurchaseOrders | — | `src/App.tsx` |
| 25 | `/stockist/settings/profile` | ProfileSettings | — | `src/App.tsx` |
| 26 | `/stockist/settings/business` | BusinessSettings | — | `src/App.tsx` |
| 27 | `/stockist/settings/security` | SecuritySettings | — | `src/App.tsx` |
| 28 | `/stockist/settings/app` | AppSettings | — | `src/App.tsx` |
| 29 | `/stockist/more` | StockistMore | — | `src/App.tsx` |
| 30 | `/stockist/onboarding` | StockistOnboarding | — | `src/App.tsx` |
| 31 | `/pharmacy/home` | PharmacyHome | — | `src/App.tsx` |
| 32 | `/pharmacy/browse` | PharmacyBrowse | — | `src/App.tsx` |
| 33 | `/pharmacy/browse/stockists` | PharmacyStockists | — | `src/App.tsx` |
| 34 | `/pharmacy/browse/stockists/:id` | PharmacyStockistDetail | — | `src/App.tsx` |
| 35 | `/pharmacy/browse/products` | PharmacyProducts | — | `src/App.tsx` |
| 36 | `/pharmacy/browse/products/:id` | PharmacyProductDetail | — | `src/App.tsx` |
| 37 | `/pharmacy/cart` | PharmacyCart | — | `src/App.tsx` |
| 38 | `/pharmacy/orders` | PharmacyOrders | — | `src/App.tsx` |
| 39 | `/pharmacy/orders/:id` | PharmacyOrderDetail | — | `src/App.tsx` |
| 40 | `/pharmacy/orders/smart-create` | SmartOrder | — | `src/App.tsx` |
| 41 | `/pharmacy/checkout` | Checkout | — | `src/App.tsx` |
| 42 | `/pharmacy/payments` | PharmacyPayments | — | `src/App.tsx` |
| 43 | `/pharmacy/wishlist` | PharmacyWishlist | — | `src/App.tsx` |
| 44 | `/pharmacy/notifications` | PharmacyNotifications | — | `src/App.tsx` |
| 45 | `/pharmacy/messages` | PharmacyMessages | — | `src/App.tsx` |
| 46 | `/pharmacy/help` | PharmacyHelp | — | `src/App.tsx` |
| 47 | `/pharmacy/more` | PharmacyMore | — | `src/App.tsx` |
| 48 | `/pharmacy/settings/profile` | PharmacyProfileSettings | — | `src/App.tsx` |
| 49 | `/pharmacy/settings/business` | PharmacyBusinessSettings | — | `src/App.tsx` |
| 50 | `/pharmacy/settings/security` | PharmacySecuritySettings | — | `src/App.tsx` |
| 51 | `/pharmacy/settings/app` | PharmacyAppSettings | — | `src/App.tsx` |
| 52 | `/pharmacy/sale` | PharmacyViewProvider | — | `src/App.tsx` |
| 53 | `/pharmacy/dashboard` | SaleDashboard | — | `src/App.tsx` |
| 54 | `/pharmacy/inventory` | SaleInventory | — | `src/App.tsx` |
| 55 | `/pharmacy/customers` | SaleCustomers | — | `src/App.tsx` |
| 56 | `/pharmacy/customers/:id` | CustomerDetail | — | `src/App.tsx` |
| 57 | `/pharmacy/consults` | SaleConsultations | — | `src/App.tsx` |
| 58 | `/pharmacy/consults/:id` | ConsultationDetail | — | `src/App.tsx` |
| 59 | `/pharmacy/consults/start` | StartConsultation | — | `src/App.tsx` |
| 60 | `/pharmacy/reports` | SaleReports | — | `src/App.tsx` |
| 61 | `/pharmacy/settings/live` | LiveSettings | — | `src/App.tsx` |
| 62 | `/pharmacy/doctors` | DoctorConnect | — | `src/App.tsx` |
| 63 | `/patient/dashboard` | PatientDashboard | — | `src/App.tsx` |
| 64 | `/patient/search` | PatientSearch | — | `src/App.tsx` |
| 65 | `/patient/prescriptions` | PatientPrescriptions | — | `src/App.tsx` |
| 66 | `/patient/orders` | PatientOrders | — | `src/App.tsx` |
| 67 | `/patient/orders/:id` | PatientOrderDetail | — | `src/App.tsx` |
| 68 | `/patient/wishlist` | PatientWishlist | — | `src/App.tsx` |
| 69 | `/patient/profile` | PatientProfile | — | `src/App.tsx` |
| 70 | `/patient/more` | PatientMore | — | `src/App.tsx` |
| 71 | `/patient/consultations` | PatientConsultations | — | `src/App.tsx` |
| 72 | `/patient/consultations/:id` | PatientConsultationDetail | — | `src/App.tsx` |
| 73 | `/patient/help` | PatientHelp | — | `src/App.tsx` |
| 74 | `/patient/settings/profile` | PatientProfileSettings | — | `src/App.tsx` |
| 75 | `/patient/settings/medical` | PatientMedicalSettings | — | `src/App.tsx` |
| 76 | `/patient/settings/security` | PatientSecuritySettings | — | `src/App.tsx` |
| 77 | `/patient/onboarding` | PatientOnboarding | — | `src/App.tsx` |
| 78 | `/doctor/dashboard` | DoctorDashboard | — | `src/App.tsx` |
| 79 | `/doctor/appointments` | DoctorAppointments | — | `src/App.tsx` |
| 80 | `/doctor/appointments/:id` | DoctorAppointmentDetail | — | `src/App.tsx` |
| 81 | `/doctor/patients` | DoctorPatients | — | `src/App.tsx` |
| 82 | `/doctor/patients/:id` | DoctorPatientDetail | — | `src/App.tsx` |
| 83 | `/doctor/prescriptions` | DoctorPrescriptions | — | `src/App.tsx` |
| 84 | `/doctor/earnings` | DoctorEarnings | — | `src/App.tsx` |
| 85 | `/doctor/more` | DoctorMore | — | `src/App.tsx` |
| 86 | `/doctor/settings/profile` | DoctorProfileSettings | — | `src/App.tsx` |
| 87 | `/doctor/settings/availability` | DoctorAvailabilitySettings | — | `src/App.tsx` |
| 88 | `/doctor/settings/bank` | DoctorBankSettings | — | `src/App.tsx` |
| 89 | `/doctor/onboarding` | DoctorOnboarding | — | `src/App.tsx` |
| 90 | `/admin/dashboard` | AdminDashboard | — | `src/App.tsx` |
| 91 | `/admin/users` | AdminUsers | — | `src/App.tsx` |
| 92 | `/admin/users/:id` | AdminUserDetail | — | `src/App.tsx` |
| 93 | `/admin/stockists` | AdminStockists | — | `src/App.tsx` |
| 94 | `/admin/pharmacies` | AdminPharmacies | — | `src/App.tsx` |
| 95 | `/admin/doctors` | AdminDoctors | — | `src/App.tsx` |
| 96 | `/admin/patients` | AdminPatients | — | `src/App.tsx` |
| 97 | `/admin/orders` | AdminOrders | — | `src/App.tsx` |
| 98 | `/admin/payments` | AdminPayments | — | `src/App.tsx` |
| 99 | `/admin/consultations` | AdminConsultations | — | `src/App.tsx` |
| 100 | `/admin/reports` | AdminReports | — | `src/App.tsx` |
| 101 | `/admin/settings` | AdminSettings | — | `src/App.tsx` |
| 102 | `/pharmacy/onboarding` | PharmacyOnboarding | — | `src/App.tsx` |
| 103 | `/admin/*` | NotFound | — | `src/App.tsx` |

### E.2 Entity / Table Catalog

**Tables/schemas found:** 0

### E.3 API / Backend Surface

### E.4 Auth, Roles, and Permissions

#### Roles referenced in code

- `alert`
- `doctor`
- `group`
- `link`
- `navigation`
- `patient`
- `pharmacy`
- `presentation`
- `region`
- `separator`
- `stockist`

#### RLS policies (migrations)


### E.5 Workflows and State Machines

#### `status_values`

`active` → `approved` → `cancelled` → `confirmed` → `delivered` → `draft` → `inactive` → `paid` → `partial` → `pending` → `rejected` → `unpaid`

#### Edge-function status mutations


### E.6 Dashboards, Reports, and Formulas

**Extracted calculation lines:** 95

#### `src/components/pharmacy/dialogs/ReportIssueDialog.tsx`

- L41: `<SelectItem value="late">Late Delivery</SelectItem>`

#### `src/components/stockist/dialogs/AddPaymentDialog.tsx`

- L44: `const amountDue = order.totalAmount - order.paidAmount;`
- L95: `<CreditCard className="h-5 w-5 text-primary" />`
- L107: `<span className="text-muted-foreground">Order Total</span>`

#### `src/components/stockist/dialogs/CollectPaymentDialog.tsx`

- L102: `<p className="text-xs text-muted-foreground">Outstanding</p>`

#### `src/components/stockist/dialogs/SharePaymentLinkDialog.tsx`

- L30: `const amountDue = order.totalAmount - order.paidAmount;`
- L86: `<span className="text-muted-foreground">Total Amount</span>`

#### `src/pages/admin/AdminDashboard.tsx`

- L56: `<h2 className="text-sm font-medium text-muted-foreground mb-3">User Stats</h2>`
- L64: `<p className="text-lg font-bold">{platformStats.totalStockists}</p>`
- L73: `<p className="text-lg font-bold">{platformStats.totalPharmacies}</p>`
- L82: `<p className="text-lg font-bold">{platformStats.totalDoctors}</p>`
- L91: `<p className="text-lg font-bold">{platformStats.totalPatients}</p>`
- L181: `<span className="text-xs text-muted-foreground">Total Revenue</span>`
- L183: `<p className="text-2xl font-bold">{formatCurrency(platformStats.totalRevenue)}</p>`
- L197: `<p className="text-2xl font-bold">{platformStats.todayOrders}</p>`
- L210: `<p className="text-2xl font-bold">{platformStats.activeConsultations}</p>`

#### `src/pages/admin/AdminPayments.tsx`

- L19: `const typeCounts = {`
- L23: `commission: mockPlatformTransactions.filter(t => t.type === 'commission').length,`
- L47: `<TabsTrigger value="all">All ({typeCounts.all})</TabsTrigger>`
- L48: `<TabsTrigger value="order_payment">Orders ({typeCounts.order_payment})</TabsTrigger>`
- L49: `<TabsTrigger value="consultation_fee">Consults ({typeCounts.consultation_fee})</TabsTrigger>`
- L50: `<TabsTrigger value="commission">Commission ({typeCounts.commission})</TabsTrigger>`
- L62: `<CreditCard className="h-4 w-4 text-success" />`

#### `src/pages/admin/AdminReports.tsx`

- L55: `<p className="text-2xl font-bold">{platformStats.activeUsers}</p>`
- L62: `<span className="text-xs text-muted-foreground">Total Orders</span>`
- L64: `<p className="text-2xl font-bold">{platformStats.totalOrders}</p>`
- L73: `<p className="text-2xl font-bold">{formatCurrency(platformStats.totalRevenue)}</p>`

#### `src/pages/doctor/DoctorDashboard.tsx`

- L30: `const totalEarnings = getTotalEarnings();`
- L59: `<h2 className="text-sm font-medium text-muted-foreground mb-3">Quick Stats</h2>`
- L85: `<p className="text-lg font-bold">{formatCurrency(totalEarnings)}</p>`
- L147: `<p className="text-xs text-muted-foreground">Total Earnings</p>`
- L148: `<p className="text-2xl font-bold text-success">{formatCurrency(totalEarnings)}</p>`

#### `src/pages/patient/PatientDashboard.tsx`

- L67: `case "out_for_delivery": return "bg-info";`
- L96: `<h2 className="text-sm font-medium text-muted-foreground mb-3">Quick Stats</h2>`
- L170: `<p className="font-semibold text-sm">{formatCurrency(order.total)}</p>`

#### `src/pages/pharmacy/PharmacyHome.tsx`

- L76: `case "out_for_delivery": return "bg-info";`
- L122: `<h2 className="text-sm font-medium text-muted-foreground mb-3">Quick Stats</h2>`
- L168: `<p className="font-semibold">{formatCurrency(order.total)}</p>`
- L211: `<Badge variant="outline" className="text-xs">{stockist.deliveryTime}</Badge>`
- L215: `<Badge className="bg-success">{stockist.maxDiscount} off</Badge>`

#### `src/pages/pharmacy/PharmacyPayments.tsx`

- L127: `<CreditCard className="h-12 w-12 mx-auto text-muted-foreground mb-3" />`

#### `src/pages/pharmacy/sale/SaleDashboard.tsx`

- L51: `const todaySales = getTodaySalesTotal();`
- L52: `const todayOrders = getTodayOrdersCount();`
- L53: `const liveProducts = getLiveInventoryCount();`
- L74: `case "out_for_delivery": return "bg-info";`
- L171: `<h2 className="text-sm font-medium text-muted-foreground mb-3">Today's Stats</h2>`
- L272: `<p className="font-semibold">{formatCurrency(order.total)}</p>`

#### `src/pages/pharmacy/sale/SaleReports.tsx`

- L26: `const totalSales = saleOrders.reduce((sum, o) => sum + o.total, 0);`
- L27: `const totalConsultFees = completedConsults.reduce((sum, c) => sum + c.fee, 0);`
- L57: `<p className="text-2xl font-bold">{formatCurrency(totalSales)}</p>`
- L58: `<p className="text-xs text-muted-foreground">Total Sales</p>`
- L64: `<p className="text-2xl font-bold">{formatCurrency(totalConsultFees)}</p>`
- L72: `<p className="text-xs text-muted-foreground">Total Orders</p>`

#### `src/pages/stockist/StockistAnalytics.tsx`

- L75: `const totalRevenue = mockOrders`
- L77: `.reduce((sum, o) => sum + o.totalAmount, 0);`
- L79: `const totalOrders = mockOrders.length;`
- L86: `orderCount: mockOrders.filter(o => o.pharmacyId === p.id).length,`
- L89: `.reduce((sum, o) => sum + o.totalAmount, 0),`
- L91: `.sort((a, b) => b.totalValue - a.totalValue)`
- L96: `.sort((a, b) => (b.salesCount || 0) - (a.salesCount || 0))`
- L99: `const collectionRate = ((totalRevenue / (totalRevenue * 1.2)) * 100).toFixed(1);`
- L130: `<p className="text-sm text-muted-foreground">Total Revenue</p>`
- L131: `<p className="text-2xl font-bold">{formatCurrency(totalRevenue)}</p>`
- L149: `<p className="text-sm text-muted-foreground">Total Orders</p>`
- L150: `<p className="text-2xl font-bold">{totalOrders}</p>`
- L357: `<p className="text-xs text-muted-foreground">{pharmacy.orderCount} orders</p>`
- L360: `<span className="font-semibold text-primary">{formatCurrency(pharmacy.totalValue)}</span>`
- L387: `<p className="font-semibold text-sm">{product.salesCount} units</p>`

#### `src/pages/stockist/StockistHome.tsx`

- L76: `const totalOutstanding = getTotalOutstanding();`
- L77: `const totalCredits = getTotalCredits();`
- L79: `const todaysDeliveries = activeOrders.filter(o => o.status === 'out-for-delivery').length;`
- L239: `<span className="text-xs text-muted-foreground">Outstanding</span>`
- L240: `<span className="font-semibold text-destructive">{formatCurrency(totalOutstanding)}</span>`
- L243: `<span className="text-xs text-muted-foreground">Credits</span>`
- L244: `<span className="font-semibold text-success">{formatCurrency(totalCredits)}</span>`
- L275: `<span className="text-xs text-muted-foreground">Out for Delivery</span>`
- L385: `{activeOrders.filter(o => o.status === 'out-for-delivery').slice(0, 3).map((order) => (`
- L397: `<p className="font-semibold text-sm">{formatCurrency(order.totalAmount)}</p>`

#### `src/pages/stockist/StockistPayments.tsx`

- L41: `type TabType = "outstanding" | "pending" | "all";`
- L46: `const [activeTab, setActiveTab] = useState<TabType>("outstanding");`
- L57: `const totalOutstanding = getTotalOutstanding();`
- L60: `.reduce((sum, p) => sum + p.amount, 0);`
- L75: `const outstandingInvoices = mockOrders.filter(order => {`
- L170: `<span className="text-xs text-muted-foreground">Outstanding</span>`
- L172: `<p className="text-lg font-bold text-destructive">{formatCurrency(totalOutstanding)}</p>`
- L183: `<CreditCard className="h-4 w-4 text-success" />`
- L229: `<TabsTrigger value="outstanding" className="flex-1">`
- L231: `<Badge variant="secondary" className="ml-1.5">{outstandingInvoices.length}</Badge>`
- L243: `<TabsContent value="outstanding" className="space-y-3 mt-4">`
- L245: `outstandingInvoices.map((order) => {`
- L246: `const pendingAmount = order.totalAmount - order.paidAmount;`
- L286: `title="No outstanding invoices"`
- L389: `icon={CreditCard}`

#### `src/pages/stockist/StockistReports.tsx`

- L126: `return <Badge className="bg-info">GST</Badge>;`
- L182: `<SelectItem value="gst">GST Reports</SelectItem>`

### E.7 Modals / Dialogs / Sheets Inventory

**Files:** 69

| File | Count | Components |
|------|-------|------------|
| `src/pages/stockist/settings/SecuritySettings.tsx` | 12 | (inline) |
| `src/components/stockist/dialogs/QuickBillDialog.tsx` | 10 | QuickBillDialog |
| `src/pages/admin/AdminUserDetail.tsx` | 9 | (inline) |
| `src/components/stockist/dialogs/ConfirmDeleteDialog.tsx` | 8 | ConfirmDeleteDialog |
| `src/components/stockist/dialogs/EditPharmacyDialog.tsx` | 6 | EditPharmacyDialog |
| `src/components/stockist/dialogs/SharePaymentLinkDialog.tsx` | 6 | SharePaymentLinkDialog |
| `src/components/stockist/dialogs/ExportDialog.tsx` | 6 | ExportDialog |
| `src/components/stockist/dialogs/EditOrderItemsDialog.tsx` | 6 | EditOrderItemsDialog |
| `src/components/stockist/dialogs/OCRScanDialog.tsx` | 6 | OCRScanDialog |
| `src/components/stockist/dialogs/CreateReturnDialog.tsx` | 6 | CreateReturnDialog |
| `src/components/stockist/dialogs/UpdateStatusDialog.tsx` | 6 | UpdateStatusDialog |
| `src/components/stockist/dialogs/MapRouteDialog.tsx` | 6 | MapRouteDialog |
| `src/components/stockist/dialogs/AddPaymentDialog.tsx` | 6 | AddPaymentDialog |
| `src/components/stockist/dialogs/EditProductDialog.tsx` | 6 | EditProductDialog |
| `src/components/stockist/dialogs/PaymentApprovalDialog.tsx` | 6 | PaymentApprovalDialog |
| `src/components/stockist/dialogs/BulkUploadDialog.tsx` | 6 | BulkUploadDialog |
| `src/components/stockist/dialogs/SendReminderDialog.tsx` | 6 | SendReminderDialog |
| `src/components/stockist/dialogs/ScanProductDialog.tsx` | 6 | ScanProductDialog |
| `src/components/stockist/dialogs/AcceptOrderDialog.tsx` | 5 | AcceptOrderDialog |
| `src/components/stockist/dialogs/UploadDocumentDialog.tsx` | 5 | UploadDocumentDialog |
| `src/components/stockist/dialogs/AddStockDialog.tsx` | 5 | AddStockDialog |
| `src/components/stockist/dialogs/CollectPaymentDialog.tsx` | 5 | CollectPaymentDialog |
| `src/components/stockist/dialogs/BillPreviewDialog.tsx` | 5 | BillPreviewDialog |
| `src/components/stockist/dialogs/DeclineOrderDialog.tsx` | 5 | DeclineOrderDialog |
| `src/components/stockist/dialogs/QuickOrderDialog.tsx` | 5 | QuickOrderDialog |
| `src/components/stockist/dialogs/ViewScreenshotDialog.tsx` | 5 | ViewScreenshotDialog |
| `src/components/stockist/dialogs/AddProductDialog.tsx` | 5 | AddProductDialog |
| `src/components/stockist/dialogs/AddToCircleDialog.tsx` | 5 | AddToCircleDialog |
| `src/components/doctor/dialogs/WritePrescriptionDialog.tsx` | 5 | WritePrescriptionDialog |
| `src/components/patient/dialogs/UploadPrescriptionDialog.tsx` | 5 | UploadPrescriptionDialog |
| `src/components/patient/dialogs/BookConsultationDialog.tsx` | 5 | BookConsultationDialog |
| `src/components/pharmacy/dialogs/ContactStockistDialog.tsx` | 4 | ContactStockistDialog |
| `src/components/pharmacy/dialogs/ReportIssueDialog.tsx` | 4 | ReportIssueDialog |
| `src/components/pharmacy/dialogs/AddToCartDialog.tsx` | 4 | AddToCartDialog |
| `src/components/pharmacy/dialogs/ViewOffersDialog.tsx` | 4 | ViewOffersDialog |
| `src/components/pharmacy/dialogs/ApplyCouponDialog.tsx` | 4 | ApplyCouponDialog |
| `src/components/pharmacy/dialogs/ReorderDialog.tsx` | 4 | ReorderDialog |
| `src/components/pharmacy/dialogs/RateStockistDialog.tsx` | 4 | RateStockistDialog |
| `src/components/pharmacy/dialogs/SmartOrderDialog.tsx` | 4 | SmartOrderDialog |
| `src/components/pharmacy/dialogs/ComparePricesDialog.tsx` | 4 | ComparePricesDialog |
| `src/components/pharmacy/dialogs/CheckoutDialog.tsx` | 4 | CheckoutDialog |
| `src/components/pharmacy/dialogs/TrackOrderDialog.tsx` | 4 | TrackOrderDialog |
| `src/components/pharmacy/dialogs/sale/SaleOrderDialog.tsx` | 4 | SaleOrderDialog |
| `src/components/pharmacy/dialogs/sale/GoLiveDialog.tsx` | 4 | GoLiveDialog |
| `src/components/pharmacy/dialogs/sale/StartConsultationDialog.tsx` | 4 | StartConsultationDialog |
| `src/components/pharmacy/dialogs/sale/RecordPatientDialog.tsx` | 4 | RecordPatientDialog |
| `src/components/stockist/dialogs/SearchPharmacyDialog.tsx` | 4 | SearchPharmacyDialog |
| `src/components/stockist/dialogs/DocumentPreviewDialog.tsx` | 4 | DocumentPreviewDialog |
| `src/pages/pharmacy/PharmacyStockistDetail.tsx` | 0 | (inline) |
| `src/pages/pharmacy/PharmacyHome.tsx` | 0 | (inline) |
| `src/pages/pharmacy/PharmacyWishlist.tsx` | 0 | (inline) |
| `src/pages/pharmacy/PharmacyProductDetail.tsx` | 0 | (inline) |
| `src/pages/pharmacy/PharmacyOrderDetail.tsx` | 0 | (inline) |
| `src/pages/pharmacy/PharmacyProducts.tsx` | 0 | (inline) |
| `src/pages/pharmacy/sale/SaleDashboard.tsx` | 0 | (inline) |
| `src/pages/pharmacy/sale/SaleConsultations.tsx` | 0 | (inline) |
| `src/pages/pharmacy/sale/SaleCustomers.tsx` | 0 | (inline) |
| `src/pages/stockist/OrderDetail.tsx` | 0 | (inline) |
| `src/pages/stockist/StockistPharmacies.tsx` | 0 | (inline) |
| `src/pages/stockist/StockistHome.tsx` | 0 | (inline) |
| `src/pages/stockist/StockistOrders.tsx` | 0 | (inline) |
| `src/pages/stockist/PharmacyDetail.tsx` | 0 | (inline) |
| `src/pages/stockist/StockistPayments.tsx` | 0 | (inline) |
| `src/pages/stockist/ProductDetail.tsx` | 0 | (inline) |
| `src/pages/stockist/StockistDocuments.tsx` | 0 | (inline) |
| `src/pages/stockist/StockistMore.tsx` | 0 | (inline) |
| `src/pages/stockist/StockistProducts.tsx` | 0 | (inline) |
| `src/pages/patient/PatientDashboard.tsx` | 0 | (inline) |
| `src/pages/patient/PatientPrescriptions.tsx` | 0 | (inline) |

### E.8 Mock, Stub, and Incomplete Behavior

**Files flagged:** 152

| File | Tags | Sample |
|------|------|--------|
| `src/components/ui/verification-input.tsx` | placeholder | L139: placeholder="••••••" |
| `src/components/ui/document-upload.tsx` | placeholder | L36: numberPlaceholder?: string; |
| `src/components/ui/command.tsx` | placeholder | L47: "flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-mut |
| `src/components/ui/sidebar.tsx` | random | L536: return `${Math.floor(Math.random() * 40) + 50}%`; |
| `src/components/ui/select.tsx` | placeholder | L20: "flex h-10 w-full items-center justify-between rounded-md border border-input bg-backgroun |
| `src/components/ui/textarea.tsx` | placeholder | L11: "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm r |
| `src/components/ui/input.tsx` | placeholder | L11: "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-of |
| `src/components/pharmacy/dialogs/ContactStockistDialog.tsx` | placeholder | L35: placeholder="Type your message..." |
| `src/components/pharmacy/dialogs/ReportIssueDialog.tsx` | placeholder | L36: <SelectTrigger><SelectValue placeholder="Select issue type" /></SelectTrigger> |
| `src/components/pharmacy/dialogs/ViewOffersDialog.tsx` | mock | L4: import { offers } from "@/data/pharmacy-mock-data"; |
| `src/components/pharmacy/dialogs/ApplyCouponDialog.tsx` | placeholder | L32: <Input placeholder="Enter coupon code" value={code} onChange={(e) => setCode(e.target.valu |
| `src/components/pharmacy/dialogs/ReorderDialog.tsx` | mock | L4: import { pharmacyOrders } from "@/data/pharmacy-mock-data"; |
| `src/components/pharmacy/dialogs/RateStockistDialog.tsx` | placeholder | L39: <Textarea placeholder="Share your experience (optional)" value={review} onChange={(e) => s |
| `src/components/pharmacy/dialogs/SmartOrderDialog.tsx` | mock, placeholder | L8: import { products, stockists, formatCurrency } from "@/data/pharmacy-mock-data"; |
| `src/components/pharmacy/dialogs/ComparePricesDialog.tsx` | placeholder | L28: placeholder="Search for a medicine..." |
| `src/components/pharmacy/dialogs/sale/SaleOrderDialog.tsx` | mock, placeholder | L8: import { inventoryItems } from "@/data/pharmacy-sale-mock-data"; |
| `src/components/pharmacy/dialogs/sale/GoLiveDialog.tsx` | mock | L9: import { liveSettings } from "@/data/pharmacy-sale-mock-data"; |
| `src/components/pharmacy/dialogs/sale/StartConsultationDialog.tsx` | mock, placeholder | L11: import { doctors, getAvailableDoctors } from "@/data/pharmacy-sale-mock-data"; |
| `src/components/pharmacy/dialogs/sale/RecordPatientDialog.tsx` | placeholder | L98: placeholder="Enter customer name" |
| `src/components/stockist/PharmacyCard.tsx` | mock, placeholder | L34: import { Pharmacy, formatCurrency, getOrdersByPharmacy } from "@/data/stockist-mock-data"; |
| `src/components/stockist/ProductCard.tsx` | mock, placeholder | L6: import { Product, formatCurrency } from "@/data/stockist-mock-data"; |
| `src/components/stockist/IncomingOrderCard.tsx` | mock | L14: import { formatCurrency, getTimeAgo, type IncomingOrder, type OrderSource } from "@/data/s |
| `src/components/stockist/StatusBadge.tsx` | mock | L3: import type { OrderStatus, PaymentStatus, PaymentApprovalStatus } from "@/data/stockist-moc |
| `src/components/stockist/PaymentApprovalCard.tsx` | mock, random | L5: import { Payment, formatCurrency } from "@/data/stockist-mock-data"; |
| `src/components/stockist/SearchInput.tsx` | placeholder | L9: placeholder?: string; |
| `src/components/stockist/OrderCard.tsx` | mock | L21: import { Order, formatCurrency, getTimeAgo } from "@/data/stockist-mock-data"; |
| `src/components/stockist/dialogs/EditPharmacyDialog.tsx` | mock, placeholder | L15: import { type Pharmacy } from "@/data/stockist-mock-data"; |
| `src/components/stockist/dialogs/AcceptOrderDialog.tsx` | mock | L16: import { formatCurrency, type IncomingOrder, type OrderItem } from "@/data/stockist-mock-d |
| `src/components/stockist/dialogs/SearchPharmacyDialog.tsx` | mock, placeholder | L13: import { mockAllPharmacies, isInCircle, formatCurrency, type Pharmacy } from "@/data/stock |
| `src/components/stockist/dialogs/SharePaymentLinkDialog.tsx` | mock, placeholder | L14: import { type Order, formatCurrency } from "@/data/stockist-mock-data"; |
| `src/components/stockist/dialogs/UploadDocumentDialog.tsx` | placeholder | L82: placeholder="e.g., GST Certificate 2026" |
| `src/components/stockist/dialogs/QuickBillDialog.tsx` | mock, placeholder | L23: import { mockPharmacies, mockOrders, formatCurrency, type Order } from "@/data/stockist-mo |
| `src/components/stockist/dialogs/AddStockDialog.tsx` | mock, placeholder | L14: import { type Product, formatCurrency } from "@/data/stockist-mock-data"; |
| `src/components/stockist/dialogs/EditOrderItemsDialog.tsx` | mock, placeholder | L22: import { type Order, mockProducts, formatCurrency } from "@/data/stockist-mock-data"; |
| `src/components/stockist/dialogs/CollectPaymentDialog.tsx` | mock, placeholder | L21: import { formatCurrency, type Pharmacy } from "@/data/stockist-mock-data"; |
| `src/components/stockist/dialogs/OCRScanDialog.tsx` | mock, demo, placeholder | L31: const mockScanResults: ScannedItem[] = [ |
| `src/components/stockist/dialogs/CreateReturnDialog.tsx` | mock, placeholder | L23: import { mockOrders, mockPharmacies, formatCurrency } from "@/data/stockist-mock-data"; |
| `src/components/stockist/dialogs/BillPreviewDialog.tsx` | mock, random | L22: import { type Pharmacy, type Order, formatCurrency } from "@/data/stockist-mock-data"; |
| `src/components/stockist/dialogs/UpdateStatusDialog.tsx` | mock, placeholder | L15: import { type Order } from "@/data/stockist-mock-data"; |
| `src/components/stockist/dialogs/DeclineOrderDialog.tsx` | mock, placeholder | L15: import { formatCurrency, type IncomingOrder } from "@/data/stockist-mock-data"; |
| `src/components/stockist/dialogs/QuickOrderDialog.tsx` | mock, placeholder | L30: import { mockPharmacies, mockProducts, formatCurrency, type Pharmacy, type Product } from  |
| `src/components/stockist/dialogs/ViewScreenshotDialog.tsx` | mock, placeholder, debug | L11: import { formatCurrency, type Payment } from "@/data/stockist-mock-data"; |
| `src/components/stockist/dialogs/MapRouteDialog.tsx` | mock, demo, placeholder | L13: import { mockOrders, mockPharmacies, formatCurrency } from "@/data/stockist-mock-data"; |
| `src/components/stockist/dialogs/AddPaymentDialog.tsx` | mock, placeholder | L16: import { type Order, formatCurrency } from "@/data/stockist-mock-data"; |
| `src/components/stockist/dialogs/AddProductDialog.tsx` | placeholder | L130: placeholder="https://example.com/image.jpg" |
| `src/components/stockist/dialogs/EditProductDialog.tsx` | mock, placeholder | L22: import { type Product } from "@/data/stockist-mock-data"; |
| `src/components/stockist/dialogs/PaymentApprovalDialog.tsx` | mock, placeholder | L14: import { formatCurrency, type Payment } from "@/data/stockist-mock-data"; |
| `src/components/stockist/dialogs/AddToCircleDialog.tsx` | mock, placeholder | L22: import { type Pharmacy } from "@/data/stockist-mock-data"; |
| `src/components/stockist/dialogs/BulkUploadDialog.tsx` | mock, placeholder | L42: const mockParsedData: ParsedRow[] = [ |
| `src/components/stockist/dialogs/SendReminderDialog.tsx` | mock, placeholder | L35: import { mockPharmacies, formatCurrency } from "@/data/stockist-mock-data"; |
| `src/components/stockist/dialogs/ScanProductDialog.tsx` | mock, placeholder, random | L14: import { mockProducts, formatCurrency, type Product } from "@/data/stockist-mock-data"; |
| `src/components/layout/PharmacyTopNav.tsx` | mock | L14: import { getUnreadNotificationCount, getUnreadMessageCount } from "@/data/pharmacy-mock-da |
| `src/components/layout/TopNav.tsx` | mock, demo | L59: // Mock data for notifications/messages - would come from real data in production |
| `src/components/doctor/dialogs/WritePrescriptionDialog.tsx` | placeholder | L114: placeholder="e.g., Viral fever, Upper respiratory infection" |
| `src/components/patient/dialogs/UploadPrescriptionDialog.tsx` | placeholder | L121: placeholder="Any specific instructions or notes for the pharmacist..." |
| `src/components/patient/dialogs/BookConsultationDialog.tsx` | mock, placeholder | L12: import { mockDoctors } from "@/data/doctor-mock-data"; |
| `src/data/stockist-mock-data.ts` | mock, placeholder | L1: // Stockist Panel Mock Data Store |
| `src/data/patient-mock-data.ts` | mock, random | L1: // Patient Panel Mock Data - 100 Patients with full details |
| `src/data/unified-data-helpers.ts` | mock, random | L4: import { mockProducts, mockPharmacies, mockOrders } from './stockist-mock-data'; |
| `src/data/pharmacy-mock-data.ts` | mock | L1: // Pharmacy Panel Mock Data |
| `src/data/doctor-mock-data.ts` | mock, random | L1: // Doctor Panel Mock Data |
| `src/data/regulatory-documents.ts` | placeholder | L10: placeholder?: string; |
| `src/data/pharmacy-sale-mock-data.ts` | mock | L106: // Mock Data for Sale View |
| `src/data/admin-mock-data.ts` | mock, random | L1: // Admin Panel Mock Data |
| `src/data/demo-credentials.ts` | mock, demo, placeholder | L67: // Documents (mock URLs) |
| `src/pages/AuthPage.tsx` | demo, placeholder | L11: import { demoCredentials, type UserRole } from "@/data/demo-credentials"; |
| `src/pages/pharmacy/PharmacyStockistDetail.tsx` | mock, incomplete | L21: import { stockists, products, offers } from "@/data/pharmacy-mock-data"; |
| `src/pages/pharmacy/PharmacyHome.tsx` | mock, placeholder | L28: } from "@/data/pharmacy-mock-data"; |
| `src/pages/pharmacy/PharmacyWishlist.tsx` | mock | L12: import { products, PharmacyProduct, formatCurrency } from "@/data/pharmacy-mock-data"; |
| `src/pages/pharmacy/PharmacyOnboarding.tsx` | demo, placeholder | L11: import { defaultPharmacyData } from "@/data/demo-credentials"; |
| `src/pages/pharmacy/PharmacyNotifications.tsx` | mock | L14: import { notifications, getTimeAgo } from "@/data/pharmacy-mock-data"; |
| `src/pages/pharmacy/Checkout.tsx` | mock, placeholder | L23: import { cartItems, formatCurrency } from "@/data/pharmacy-mock-data"; |
| `src/pages/pharmacy/PharmacyStockists.tsx` | placeholder | L58: <Input placeholder="Search stockists, brands..." className="pl-10" /> |
| `src/pages/pharmacy/PharmacyProductDetail.tsx` | mock | L16: import { products, stockists } from "@/data/pharmacy-mock-data"; |
| `src/pages/pharmacy/PharmacyPayments.tsx` | mock, placeholder | L15: import { paymentHistory, formatCurrency, getTimeAgo } from "@/data/pharmacy-mock-data"; |
| `src/pages/pharmacy/PharmacyOrderDetail.tsx` | mock | L21: import { pharmacyOrders } from "@/data/pharmacy-mock-data"; |
| `src/pages/pharmacy/PharmacyOrders.tsx` | placeholder | L44: <Input placeholder="Search orders..." className="pl-10" /> |
| `src/pages/pharmacy/PharmacyBrowse.tsx` | mock, placeholder | L20: import { categories, products, stockists } from "@/data/pharmacy-mock-data"; |
| `src/pages/pharmacy/PharmacyMessages.tsx` | mock, placeholder | L13: import { messages, getTimeAgo } from "@/data/pharmacy-mock-data"; |
| `src/pages/pharmacy/PharmacyPortal.tsx` | mock, placeholder | L18: // Mock data |
| `src/pages/pharmacy/PharmacyHelp.tsx` | placeholder | L72: placeholder="Search for help..." |
| `src/pages/pharmacy/PharmacyProducts.tsx` | mock, placeholder | L14: import { products, categories, PharmacyProduct } from "@/data/pharmacy-mock-data"; |
| `src/pages/pharmacy/SmartOrder.tsx` | mock, placeholder | L19: import { products, formatCurrency } from "@/data/pharmacy-mock-data"; |
| `src/pages/pharmacy/sale/DoctorConnect.tsx` | mock, placeholder | L17: import { doctors, getAvailableDoctors } from "@/data/pharmacy-sale-mock-data"; |
| `src/pages/pharmacy/sale/SaleInventory.tsx` | mock, placeholder, incomplete | L16: import { inventoryItems } from "@/data/pharmacy-sale-mock-data"; |
| `src/pages/pharmacy/sale/ConsultationDetail.tsx` | mock | L18: import { consultations } from "@/data/pharmacy-sale-mock-data"; |
| `src/pages/pharmacy/sale/LiveSettings.tsx` | mock | L18: import { liveSettings } from "@/data/pharmacy-sale-mock-data"; |
| `src/pages/pharmacy/sale/SaleDashboard.tsx` | mock | L29: } from "@/data/pharmacy-sale-mock-data"; |
| `src/pages/pharmacy/sale/CustomerDetail.tsx` | mock | L16: import { patients, saleOrders, consultations } from "@/data/pharmacy-sale-mock-data"; |
| `src/pages/pharmacy/sale/SaleReports.tsx` | mock | L16: import { consultations, saleOrders, patients } from "@/data/pharmacy-sale-mock-data"; |
| `src/pages/pharmacy/sale/SaleConsultations.tsx` | mock | L17: import { consultations, getCompletedConsultations, getPendingConsultations } from "@/data/ |
| `src/pages/pharmacy/sale/SaleCustomers.tsx` | mock, placeholder | L16: import { patients, saleOrders } from "@/data/pharmacy-sale-mock-data"; |
| `src/pages/pharmacy/sale/StartConsultation.tsx` | mock, placeholder | L22: import { doctors, getAvailableDoctors } from "@/data/pharmacy-sale-mock-data"; |
| `src/pages/pharmacy/settings/BusinessSettings.tsx` | demo, placeholder | L11: import { defaultPharmacyData } from "@/data/demo-credentials"; |
| `src/pages/stockist/CreateOrder.tsx` | mock, placeholder | L27: import { mockPharmacies, mockProducts, formatCurrency, type Product } from "@/data/stockis |
| `src/pages/stockist/OrderDetail.tsx` | mock | L27: mockProducts, |
| `src/pages/stockist/CreateBill.tsx` | mock, placeholder | L29: import { mockPharmacies, mockOrders, formatCurrency } from "@/data/stockist-mock-data"; |
| `src/pages/stockist/DeliveryRoutes.tsx` | mock, placeholder | L23: import { mockPharmacies, formatCurrency } from "@/data/stockist-mock-data"; |
| `src/pages/stockist/StockistPharmacies.tsx` | mock, placeholder | L13: mockAllPharmacies, |
| `src/pages/stockist/ExpiryManagement.tsx` | mock, placeholder | L19: import { mockProducts, formatCurrency, formatDate } from "@/data/stockist-mock-data"; |
| `src/pages/stockist/StockistHome.tsx` | mock | L32: mockOrders, |
| `src/pages/stockist/StockistOnboarding.tsx` | demo, placeholder | L10: import { defaultStockistData } from "@/data/demo-credentials"; |
| `src/pages/stockist/StockistOrders.tsx` | mock, placeholder | L22: mockOrders, |
| `src/pages/stockist/CreditNotes.tsx` | mock, placeholder | L21: import { formatCurrency, formatDate } from "@/data/stockist-mock-data"; |
| `src/pages/stockist/StaffManagement.tsx` | mock, placeholder | L42: const mockStaff: DeliveryStaff[] = [ |
| `src/pages/stockist/PharmacyDetail.tsx` | mock | L26: mockOrders, |
| `src/pages/stockist/StockistHelp.tsx` | placeholder | L134: placeholder="Search for help..." |
| `src/pages/stockist/StockistPayments.tsx` | mock, placeholder | L28: mockPayments, |
| `src/pages/stockist/ProductDetail.tsx` | mock | L26: } from "@/data/stockist-mock-data"; |
| `src/pages/stockist/StockistDocuments.tsx` | mock | L29: const mockDocuments: Document[] = [ |
| `src/pages/stockist/StockistMore.tsx` | demo | L29: import { defaultStockistData } from "@/data/demo-credentials"; |
| `src/pages/stockist/StockistMessages.tsx` | mock, placeholder, random | L34: const mockTickets: Ticket[] = [ |
| `src/pages/stockist/PurchaseOrders.tsx` | mock, placeholder | L21: import { formatCurrency, formatDate } from "@/data/stockist-mock-data"; |
| `src/pages/stockist/StockistAnalytics.tsx` | mock | L23: mockOrders, |
| `src/pages/stockist/StockistNotifications.tsx` | mock | L28: const mockNotifications: Notification[] = [ |
| `src/pages/stockist/StockistProducts.tsx` | mock, placeholder | L39: import { mockProducts, formatCurrency, getLowStockProducts, type Product } from "@/data/st |
| `src/pages/stockist/settings/BusinessSettings.tsx` | demo, placeholder | L11: import { defaultStockistData } from "@/data/demo-credentials"; |
| `src/pages/stockist/settings/AppSettings.tsx` | mock | L63: // Storage info (mock) |
| `src/pages/stockist/settings/ProfileSettings.tsx` | demo, placeholder, incomplete | L16: import { defaultStockistData } from "@/data/demo-credentials"; |
| `src/pages/stockist/settings/SecuritySettings.tsx` | mock, placeholder | L43: const mockSessions: Session[] = [ |

### E.9 Dead Code, Orphan Routes, and Broken Links

#### Page files with weak import references

- `Index`
- `PharmacyPortal`
- `PharmacyProfile`

#### Duplicate filenames

- `AppSettings.tsx`: `src/pages/pharmacy/settings/AppSettings.tsx`, `src/pages/stockist/settings/AppSettings.tsx`
- `BusinessSettings.tsx`: `src/pages/pharmacy/settings/BusinessSettings.tsx`, `src/pages/stockist/settings/BusinessSettings.tsx`
- `ProfileSettings.tsx`: `src/pages/pharmacy/settings/ProfileSettings.tsx`, `src/pages/stockist/settings/ProfileSettings.tsx`, `src/pages/doctor/settings/ProfileSettings.tsx`, `src/pages/patient/settings/ProfileSettings.tsx`
- `SecuritySettings.tsx`: `src/pages/pharmacy/settings/SecuritySettings.tsx`, `src/pages/stockist/settings/SecuritySettings.tsx`, `src/pages/patient/settings/SecuritySettings.tsx`

### E.10 Mock Data File Catalog (`src/data/`)

#### `admin-mock-data.ts`

- Exports: `PlatformStats`, `AdminUser`, `VerificationRequest`, `PlatformOrder`, `PlatformTransaction`, `ConsultationLog`, `platformStats`, `mockAdminUsers`, `mockVerificationRequests`, `mockPlatformOrders`, `mockPlatformTransactions`, `mockConsultationLogs`, `getUsersByRole`, `getPendingVerifications`, `getRecentOrders`, `getRecentTransactions`, `formatCurrency`

#### `demo-credentials.ts`

- Exports: `UserRole`, `DemoCredential`, `demoCredentials`, `defaultStockistData`, `defaultPharmacyData`, `defaultDoctorData`, `defaultPatientData`

#### `doctor-mock-data.ts`

- Exports: `DoctorProfile`, `WeeklySchedule`, `TimeSlot`, `Appointment`, `Prescription`, `PrescribedMedicine`, `DoctorEarning`, `DoctorPatient`, `mockDoctors`, `mockAppointments`, `mockPrescriptions`, `mockDoctorEarnings`, `mockDoctorPatients`, `getTodaysAppointments`, `getPendingAppointments`, `getCompletedAppointments`, `getTotalEarnings`, `getPendingEarnings`, `formatCurrency`

#### `patient-mock-data.ts`

- Exports: `PatientProfile`, `PatientOrder`, `PatientOrderItem`, `PatientPrescription`, `PrescriptionMedicine`, `PatientConsultation`, `NearbyPharmacy`, `mockPatients`, `mockPatientOrders`, `mockPatientPrescriptions`, `mockPatientConsultations`, `mockNearbyPharmacies`, `getPatientById`, `getPatientOrders`, `getActiveOrders`, `getPatientPrescriptions`, `getActivePrescriptions`, `getUpcomingConsultations`, `getNearbyPharmaciesForPatient`, `formatCurrency`, `getTimeAgo`

#### `pharmacy-mock-data.ts`

- `categories`: ~20 records

#### `pharmacy-sale-mock-data.ts`

- Exports: `Patient`, `PrescribedMedicine`, `Consultation`, `Doctor`, `LiveSettings`, `SaleOrder`, `SaleOrderItem`, `InventoryItem`, `patients`, `doctors`, `consultations`, `saleOrders`, `inventoryItems`, `liveSettings`, `getActiveSaleOrders`, `getPendingConsultations`, `getCompletedConsultations`, `getAvailableDoctors`, `getLiveInventoryCount`, `getTodaySalesTotal`, `getTodayOrdersCount`

#### `regulatory-documents.ts`

- `bloodGroups`: ~0 records
- `commonLanguages`: ~0 records
- `indianStates`: ~0 records
- `medicalSpecializations`: ~0 records

#### `stockist-mock-data.ts`

- Exports: `Pharmacy`, `PharmacyCircle`, `Product`, `OrderItem`, `OrderStatus`, `PaymentStatus`, `OrderSource`, `IncomingOrderStatus`, `Order`, `IncomingOrder`, `PaymentMethod`, `PaymentApprovalStatus`, `Payment`, `NoticeType`, `Notice`, `NotificationType`, `Notification`, `VerificationStatus`, `VerificationState`, `mockAllPharmacies`, `mockPharmacyCircle`, `getCirclePharmacies`, `isInCircle`, `getCircleInfo`, `mockPharmacies`, `mockProducts`, `mockIncomingOrders`, `mockNotifications`, `mockOrders`, `mockPayments`

#### `unified-data-helpers.ts`

- Exports: `UnifiedProduct`, `getUnifiedProductCatalog`, `PatientSearchResult`, `getLiveInventoryForPatients`, `PatientConsultationHistory`, `getPatientConsultationHistory`, `DoctorPatientRecord`, `getDoctorPatients`, `LinkedPrescription`, `getPatientPrescriptionVault`, `PlatformMetrics`, `getPlatformMetrics`, `formatCurrency`, `getTimeAgo`, `getOrderStatusColor`, `getPaymentStatusColor`

### E.11 Demo Credentials (`demo-credentials.ts`)

- **stockist**: `demo.stockist@digiswasthya.com`
- **pharmacy**: `demo.pharmacy@digiswasthya.com`
- **patient**: `demo.patient@digiswasthya.com`
- **doctor**: `demo.doctor@digiswasthya.com`
- **admin**: `admin@digiswasthya.com`

### E.12 Layout Route Nesting (full resolved paths)

- `/auth` → `AuthPage`
- `/install` → `Install`
- `/stockist/home` → `StockistHome`
- `/stockist/pharmacies` → `StockistPharmacies`
- `/stockist/pharmacies/:id` → `PharmacyDetail`
- `/stockist/products` → `StockistProducts`
- `/stockist/products/:id` → `ProductDetail`
- `/stockist/orders` → `StockistOrders`
- `/stockist/orders/:id` → `OrderDetail`
- `/stockist/orders/create` → `CreateOrder`
- `/stockist/bills/create` → `CreateBill`
- `/stockist/payments` → `StockistPayments`
- `/stockist/analytics` → `StockistAnalytics`
- `/stockist/notifications` → `StockistNotifications`
- `/stockist/documents` → `StockistDocuments`
- `/stockist/help` → `StockistHelp`
- `/stockist/messages` → `StockistMessages`
- `/stockist/reports` → `StockistReports`
- `/stockist/routes` → `DeliveryRoutes`
- `/stockist/staff` → `StaffManagement`
- `/stockist/expiry` → `ExpiryManagement`
- `/stockist/credit-notes` → `CreditNotes`
- `/stockist/purchases` → `PurchaseOrders`
- `/stockist/settings/profile` → `ProfileSettings`
- `/stockist/settings/business` → `BusinessSettings`
- `/stockist/settings/security` → `SecuritySettings`
- `/stockist/settings/app` → `AppSettings`
- `/stockist/more` → `StockistMore`
- `/stockist/onboarding` → `StockistOnboarding`
- `/pharmacy/home` → `PharmacyHome`
- `/pharmacy/browse` → `PharmacyBrowse`
- `/pharmacy/browse/stockists` → `PharmacyStockists`
- `/pharmacy/browse/stockists/:id` → `PharmacyStockistDetail`
- `/pharmacy/browse/products` → `PharmacyProducts`
- `/pharmacy/browse/products/:id` → `PharmacyProductDetail`
- `/pharmacy/cart` → `PharmacyCart`
- `/pharmacy/orders` → `PharmacyOrders`
- `/pharmacy/orders/:id` → `PharmacyOrderDetail`
- `/pharmacy/orders/smart-create` → `SmartOrder`
- `/pharmacy/checkout` → `Checkout`
- `/pharmacy/payments` → `PharmacyPayments`
- `/pharmacy/wishlist` → `PharmacyWishlist`
- `/pharmacy/notifications` → `PharmacyNotifications`
- `/pharmacy/messages` → `PharmacyMessages`
- `/pharmacy/help` → `PharmacyHelp`
- `/pharmacy/more` → `PharmacyMore`
- `/pharmacy/settings/profile` → `PharmacyProfileSettings`
- `/pharmacy/settings/business` → `PharmacyBusinessSettings`
- `/pharmacy/settings/security` → `PharmacySecuritySettings`
- `/pharmacy/settings/app` → `PharmacyAppSettings`
- `/pharmacy/sale/dashboard` → `SaleDashboard`
- `/pharmacy/sale/inventory` → `SaleInventory`
- `/pharmacy/sale/customers` → `SaleCustomers`
- `/pharmacy/sale/customers/:id` → `CustomerDetail`
- `/pharmacy/sale/consults` → `SaleConsultations`
- `/pharmacy/sale/consults/:id` → `ConsultationDetail`
- `/pharmacy/sale/consults/start` → `StartConsultation`
- `/pharmacy/sale/reports` → `SaleReports`
- `/pharmacy/sale/more` → `SaleMore`
- `/pharmacy/sale/settings/live` → `LiveSettings`
- `/pharmacy/sale/doctors` → `DoctorConnect`
- `/patient/dashboard` → `PatientDashboard`
- `/patient/search` → `PatientSearch`
- `/patient/prescriptions` → `PatientPrescriptions`
- `/patient/orders` → `PatientOrders`
- `/patient/orders/:id` → `PatientOrderDetail`
- `/patient/wishlist` → `PatientWishlist`
- `/patient/profile` → `PatientProfile`
- `/patient/more` → `PatientMore`
- `/patient/consultations` → `PatientConsultations`
- `/patient/consultations/:id` → `PatientConsultationDetail`
- `/patient/help` → `PatientHelp`
- `/patient/settings/profile` → `PatientProfileSettings`
- `/patient/settings/medical` → `PatientMedicalSettings`
- `/patient/settings/security` → `PatientSecuritySettings`
- `/patient/onboarding` → `PatientOnboarding`
- `/doctor/dashboard` → `DoctorDashboard`
- `/doctor/appointments` → `DoctorAppointments`
- `/doctor/appointments/:id` → `DoctorAppointmentDetail`
- `/doctor/patients` → `DoctorPatients`
- `/doctor/patients/:id` → `DoctorPatientDetail`
- `/doctor/prescriptions` → `DoctorPrescriptions`
- `/doctor/earnings` → `DoctorEarnings`
- `/doctor/more` → `DoctorMore`
- `/doctor/settings/profile` → `DoctorProfileSettings`
- `/doctor/settings/availability` → `DoctorAvailabilitySettings`
- `/doctor/settings/bank` → `DoctorBankSettings`
- `/doctor/onboarding` → `DoctorOnboarding`
- `/admin/dashboard` → `AdminDashboard`
- `/admin/users` → `AdminUsers`
- `/admin/users/:id` → `AdminUserDetail`
- `/admin/stockists` → `AdminStockists`
- `/admin/pharmacies` → `AdminPharmacies`
- `/admin/doctors` → `AdminDoctors`
- `/admin/patients` → `AdminPatients`
- `/admin/orders` → `AdminOrders`
- `/admin/payments` → `AdminPayments`
- `/admin/consultations` → `AdminConsultations`
- `/admin/reports` → `AdminReports`
- `/admin/settings` → `AdminSettings`
- `/pharmacy/onboarding` → `PharmacyOnboarding`
- `/admin/*` → `NotFound`

### E.13 PharmacyViewContext Toggle

```tsx
import React, { createContext, useContext, useState, ReactNode } from "react";
import { useNavigate } from "react-router-dom";

type ViewMode = 'purchase' | 'sale';

interface PharmacyViewContextType {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  switchToPurchase: () => void;
  switchToSale: () => void;
}

const PharmacyViewContext = createContext<PharmacyViewContextType | undefined>(undefined);

export function PharmacyViewProvider({ children }: { children: ReactNode }) {
  const [viewMode, setViewMode] = useState<ViewMode>('purchase');
  const navigate = useNavigate();

 
```


---
---

## EXPANSION PASS 2 — Deep Trace Additions (2026-07-08)

*Append-only deep-trace pass. Scope restricted per domain rule to **Admin / Stockist / Pharmacy** material only. Everything below is derived directly from source under `digiswasthya/` and contains only detail NOT already present in the review above. File paths cited per claim.*

### E2.1 Newly documented routes/pages/screens

No routes exist beyond the 100+ already tabulated (§Part 2 / §E.12 — re-verified against `src/App.tsx`). The additions below are page-level/document-level surfaces not previously described:

**HTML shell & SEO surface (`index.html`)**
- `<title>` = "Digi Swasthya - Healthcare & Pharmacy Platform"; meta description "Complete healthcare & pharmacy management platform connecting doctors, pharmacies, stockists, and patients"; author "Digi Swasthya".
- Viewport locks zoom: `maximum-scale=1.0, user-scalable=no` — pinch-zoom is disabled app-wide.
- PWA metas: `theme-color #4a7c94`, `apple-mobile-web-app-capable yes`, `apple-mobile-web-app-status-bar-style default`, `apple-mobile-web-app-title "DigiSwasthya"`, `application-name "Digi Swasthya"`, `msapplication-TileColor #4a7c94`. Icons: `/favicon.ico`, apple-touch `/pwa-192x192.png`, mask-icon `/pwa-512x512.png` (color `#4a7c94`).
- Open Graph block: og:title "Digi Swasthya - Healthcare Platform", og:description, og:type website, og:image `/pwa-512x512.png`.
- `public/robots.txt` explicitly allows Googlebot, Bingbot, Twitterbot, facebookexternalhit, and `*` — everything crawlable (`Allow: /` for each).

**Shared `TopNav` portal-identity derivation (`src/components/layout/TopNav.tsx`)** — the brand name/initials shown in the stockist header are *computed*, not hardcoded:
- Stockist branch: `name = defaultStockistData.businessName.split(" ").slice(0,2).join(" ")` → **"Rajesh Distributors"**; `initials` = first letters of first two words → **"RD"**; subtitle "Stockist Portal"; basePath `/stockist`.
- Pharmacy branch (dead in practice — PharmacyLayout uses `PharmacyTopNav`): name `defaultPharmacyData.storeName`, subtitle "Pharmacy Portal".
- Fallback branch for any unmatched prefix: `{ name: "DigiSwasthya", subtitle: "Portal", initials: "DS", basePath: "/" }` — wired but unreachable since `TopNav` is only mounted under `/stockist`.
- Local constants `notificationCount = 3` / `messageCount = 2` with source comment verbatim: `// Mock data for notifications/messages - would come from real data in production`. Message badge is `bg-primary`, notification badge `bg-destructive`; badges hidden when count is 0 (they never are). Avatar `AvatarImage` = fixed Unsplash portrait (`photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=face`) with initials fallback.

**AdminLayout sidebar item table (exact, `src/components/layout/AdminLayout.tsx` L34–44)**

| # | Icon | Label | Path | Hardcoded badge |
|---|---|---|---|---|
| 1 | LayoutDashboard | Dashboard | /admin/dashboard | — |
| 2 | Users | All Users | /admin/users | — |
| 3 | Building2 | Stockists | /admin/stockists | 3 |
| 4 | Building | Pharmacies | /admin/pharmacies | 5 |
| 5 | Stethoscope | Doctors | /admin/doctors | 4 |
| 6 | User | Patients | /admin/patients | — |
| 7 | ShoppingCart | Orders | /admin/orders | — |
| 8 | CreditCard | Payments | /admin/payments | — |
| 9 | Video | Consultations | /admin/consultations | — |
| 10 | BarChart3 | Reports | /admin/reports | — |
| 11 | Settings | Settings | /admin/settings | — |

Active-state test is exact-path equality (`location.pathname === path`, L52) — so detail routes like `/admin/users/:id` highlight **no** sidebar item.

**PharmacyTopNav mechanics (`src/components/layout/PharmacyTopNav.tsx`)** — additions beyond §2: brand text is always "DigiSwasthya" (view label rendered under it); logo tile switches gradient class `from-success to-success/80` in sale vs `from-primary to-primary/80` in purchase; `viewLabel = viewMode === 'purchase' ? 'Purchase View' : 'Sale View'` and `viewColor = viewMode === 'sale' ? 'text-success' : 'text-primary'` — note these read the *context* `viewMode` (which resets to `'purchase'` on provider mount, §1C), not the pathname. Message and bell buttons always navigate to the **purchase-view** routes `/pharmacy/messages` and `/pharmacy/notifications`, even when tapped from inside `/pharmacy/sale/*`.

### E2.2 Component behavior catalog (shared components — props & exact behavior)

All in `src/components/stockist/` unless noted. These were name-checked earlier but never documented at prop level.

- **`KPICard`** (`KPICard.tsx`): props `title, value (string|number), subtitle?, icon? (LucideIcon), trend? {value:number, isPositive:boolean}, onClick?, variant? ('default'|'success'|'warning'|'danger'|'info'), className?`. Variant maps to card bg (`bg-success/10 border-success/20` etc.) and icon chip (`bg-success/20 text-success` etc.). Trend renders `↑`/`↓ {Math.abs(value)}%` in success/destructive color + the literal suffix **"vs last month"** (baked into the component regardless of the actual period). Clickable variant adds `hover:scale-[1.02] active:scale-[0.98]`. Title is uppercased via CSS (`uppercase tracking-wide`).
- **`QuickActionButton`** (`QuickActionButton.tsx`): props `label, icon, onClick?, variant? ('default'|'primary'|'success'|'warning'|'danger'), disabled?, className?`. Fixed min size `min-w-[72px] min-h-[72px]`; disabled = `opacity-50 cursor-not-allowed`; enabled press feedback `active:scale-95`. Icon chip colors: primary→`bg-primary text-primary-foreground`, success/warning→`bg-success|bg-warning text-white`.
- **`EmptyState`** (`EmptyState.tsx`): props `icon? (default lucide Package), title (required), description?, actionLabel?, onAction?, className?`. Action `Button size="sm"` renders only when BOTH `actionLabel` and `onAction` are given. Layout: centered column, `py-12`, icon in `rounded-full bg-muted` chip.
- **`SearchInput`** (`SearchInput.tsx`): controlled — props `value, onChange(value:string), placeholder='Search...', onFilterClick?, showFilter=false, className?`. Left `Search` icon; a clear "X" button appears only when `value` is non-empty and calls `onChange("")`; optional trailing filter icon button (`SlidersHorizontal`) shown only with `showFilter`.
- **`StatusBadge`** (`StatusBadge.tsx`): props `status, variant ('order'|'payment'|'approval'|'stock', default 'order'), size ('sm'|'default'), className?`. Full label/color maps as coded:
  - order: pending→"Pending" warning; confirmed→"Confirmed" info; processing→"Processing" primary; out-for-delivery→"Out for Delivery" secondary; delivered→"Delivered" success; cancelled→"Cancelled" destructive (each `bg-X/15 text-X border-X/30`).
  - payment: unpaid destructive / partial warning / paid success.
  - approval: pending warning / approved success / rejected destructive / on-hold→"On Hold" muted.
  - stock: in-stock success / low-stock warning / out-of-stock destructive / **expiring-soon warning** (a fourth stock state supported by the badge; `ProductCard` produces it via its own expiry check, not via `getStockStatus`).
  - **Fallback:** any unknown status renders the raw status string in `bg-muted text-muted-foreground` — no crash. `size="sm"` = `text-[10px] px-1.5 py-0`.
- **`PharmacyCard`** (`PharmacyCard.tsx`, 257 ln) — previously documented only as a row with 5 callbacks; it additionally contains a **built-in inline quick-payment collapsible** (independent of `CollectPaymentDialog`): expanding it reveals an amount `Input` + 3 method chips (`cash` Banknote / `upi` Smartphone / `bank` CreditCard, default **upi**) + confirm. `handleQuickPayment` validates `parseFloat(amount) > 0` → destructive toast `"Error" / "Please enter a valid amount"`, else toast `"Payment Recorded" / "{₹amt} via {Cash|UPI|Bank Transfer} recorded for {pharmacy.name}"` and collapses/clears (local state only). The card also computes `pendingOrders = getOrdersByPharmacy(id).filter(status not delivered/cancelled)` and `netDue = pharmacy.outstanding - pharmacy.creditBalance` per row. Header click area (store icon + name + owner) triggers `onView`.
- **`OrderCard`** (`OrderCard.tsx`) — dropdown items are **status-conditional**: "View Details" always; "Mark Delivered" only when `status === 'out-for-delivery'`; "Out for Delivery" only when `status === 'confirmed'`; "Share Payment Link" only when `paymentStatus !== 'paid'` (so pending/processing orders get *no* status action in the menu). Source chip via `sourceLabels` map (platform/direct/whatsapp/phone/walk-in → Platform/Direct/WhatsApp/Phone/Walk-in). `itemCount = Σ item.quantity` (units, not lines). Dropdown trigger stops propagation so the card's `onClick` (navigate) doesn't fire.
- **`IncomingOrderCard`** (`IncomingOrderCard.tsx`): left border `border-l-4 border-l-primary`; "NEW" primary badge + `getTimeAgo(receivedAt)` with Clock icon; per-source icon map: platform→Globe, whatsapp→MessageSquare, phone→Phone, **direct & walk-in→Footprints**. Items summary box shows first 2 lines ("{name} ×{qty}") + "+{n} more"; order `notes` render as `📝 {notes}` in a warning-tinted strip. Buttons: Accept (primary), Decline (outline destructive), Eye view.
- **`PaymentApprovalCard`** (`PaymentApprovalCard.tsx`): pending cards get `border-warning/50 bg-warning/5`. Method label map: upi→UPI, cash→Cash, `bank-transfer`→Bank Transfer, cheque→Cheque, appended with ` • {transactionId}` when present. Shows a **dual-timestamp strip**: "Updated: {createdAt time}" and "Screenshot: {time}" where the screenshot time is *fabricated per render*: `getScreenshotTime` subtracts `Math.floor(Math.random()*5+10)` minutes (10–15 min) from `createdAt` — the displayed screenshot time changes on every re-render. Times formatted `en-IN` 12-hour. "View Payment Screenshot" button renders only if `screenshotUrl` is set; approve/reject/hold buttons only while `status === 'pending'`.
- **`ProductCard`** (`ProductCard.tsx`): its expiry logic differs from the Products page's — `getExpiryStatus` computes `daysLeft = Math.ceil((expiry - today)/86400000)`; `<= 0` → badge "Expired" (destructive), `<= 90` → "{n}d left" (warning), else no badge. Margin here is `Math.round(((mrp - salePrice)/mrp)*100)` + literal "% margin" (integer, vs `ProductDetail`'s `.toFixed(1)` — two different roundings of the same formula). Image falls back to a `Package` icon when `imageUrl` is absent.
- **`NavLink`** (`src/components/NavLink.tsx`): forwardRef wrapper over react-router `NavLink` that converts the function-className API into `className`/`activeClassName`/`pendingClassName` string props via `cn()` — a react-router-v5 compatibility shim.
- **`BreadcrumbNav`** (`src/components/ui/breadcrumb-nav.tsx`): custom (non-stock-shadcn) breadcrumb; props `items: {label, href?}[]`, `homeHref` **defaulting to `/stockist/home`**, `className?`. Home link shows a Home icon with label visually hidden on mobile (`sr-only md:not-sr-only`); intermediate items truncate at `max-w-[120px]`, last (href-less) item at 150px. Used by exactly 5 stockist operational pages: `ExpiryManagement`, `CreditNotes`, `DeliveryRoutes`, `StaffManagement`, `PurchaseOrders` (grep-verified) — no other panel uses it, consistent with its stockist default.
- **`VerificationInput`** (`src/components/ui/verification-input.tsx`): props `label, value, status ('unverified'|'pending'|'verified'), onVerify, onResend?, onSubmitOtp(otp), type ('phone'|'email'), className?`. `handleVerifyClick` starts a **30-second resend cooldown timer** (`setTimer(30)`, 1 s `setInterval` countdown); Resend disabled until timer hits 0, then restarts 30 s. OTP input (`placeholder "••••••"`) auto-focuses when status flips to `pending`; submit is gated on `otp.length === 6` (the value is otherwise never checked — any 6 chars pass, matching §3.14).
- **`DocumentUpload`** (`src/components/ui/document-upload.tsx`): props include `isRequired?` (renders red `*`), `verificationStatus? ('verified'|'pending'|'rejected'|'none', default 'none')`, `accept? (default "image/*,.pdf")`, optional document-number field (`numberPlaceholder`). On file choose it only does `URL.createObjectURL(file)` for a local preview (L89) — never uploads.
- **`use-toast`** (`src/hooks/use-toast.ts`): `TOAST_LIMIT = 1` — every new toast replaces the previous one (`[action.toast, ...toasts].slice(0, 1)`); `TOAST_REMOVE_DELAY = 1_000_000` ms (~16.7 min) — dismissed toasts effectively stay in memory until page unload. Module-level listener array + `memoryState` pattern (state survives component unmounts within a session).
- **shadcn `sidebar.tsx` detail** (`src/components/ui/sidebar.tsx` L536): the sidebar skeleton row generates a random width `${Math.floor(Math.random()*40)+50}%` (50–90%) per render — the only other render-path `Math.random()` in the component layer besides PaymentApprovalCard.

### E2.3 Entity & data-model deep detail

**Page-local entity interfaces (stockist operational pages)** — previously summarized only as "local mock arrays"; full shapes:

- **`DeliveryStaff`** (`src/pages/stockist/StaffManagement.tsx`): `id, name, phone, vehicle, vehicleNumber, assignedArea, status ('active'|'on-leave'|'inactive'), activeDeliveries, totalDeliveries, rating, joinedDate`. Seeds: staff-1 Raju Kumar / Bike MH-12-AB-1234 / "MG Road, Station Road" / active / 3 active / 450 total / 4.8★ / joined 2024-06-15; staff-2 Suresh Patel / Tempo MH-12-CD-5678 / 320 / 4.5; staff-3 Mohan Singh / Bike MH-12-EF-9012 / **on-leave** / 180 / 4.2; staff-4 Vikram Sharma / **Van** MH-12-GH-3456 / Industrial Area / 520 / 4.9. Search matches name OR phone OR **assignedArea**.
- **`DeliveryRoute`** (`src/pages/stockist/DeliveryRoutes.tsx`): `id, name, staffName, staffPhone, status ('planned'|'in-progress'|'completed'), pharmacies: string[] (pharmacy IDs joined against shared mockPharmacies), totalDistance (display string), estimatedTime (display string), completedCount, date`. Seeds: route-1 "MG Road Route" / Raju Kumar / in-progress / stops ph-001,ph-002,ph-004 / 12.5 km / 2h 30m / 1 completed / 2026-01-27; route-2 "Station Area Route" / planned / ph-003,ph-005 / 8.2 km / 1h 45m / 2026-01-27; route-3 "Ring Road Route" / completed / ph-006 / 5.0 km / 45m / **2026-01-26**. "Today" split is the literal comparison `r.date === "2026-01-27"`.
- **`CreditNote`** (`src/pages/stockist/CreditNotes.tsx`): `id, creditNoteNumber, orderId, orderNumber, pharmacyId, pharmacyName, items: {productName, quantity, reason, amount}[], totalAmount, status ('pending'|'approved'|'processed'|'rejected'), createdAt, processedAt?, notes?`. Seeds: CN-2026-001 Apollo Medicals ₹920 pending (Pantoprazole ×10 + Ibuprofen ×5, reason "Damaged packaging"); CN-2026-002 Lifeline Pharmacy ₹480 approved (Amoxicillin ×5 "Near expiry"); CN-2026-003 Shree Medical Store ₹560 processed (Paracetamol ×20 "Wrong product delivered", processedAt 2026-01-22). The seeds cross-reference real shared order IDs (ord-001/002/004) and pharmacy IDs.
- **`PurchaseOrder`** (`src/pages/stockist/PurchaseOrders.tsx`): `id, poNumber, supplier, supplierContact, items: {productName, quantity, rate, amount}[], totalAmount, status ('draft'|'ordered'|'partial'|'received'|'cancelled'), createdAt, expectedDate, receivedDate?, receivedQuantity?`. Seeds: PO-2026-001 Sun Pharma Distributors ₹22,000 ordered (Paracetamol 500×₹22 + Omeprazole 200×₹55); PO-2026-002 Cipla Limited ₹12,600 **partial** (Amlodipine 300×₹42, receivedQuantity 200); PO-2026-003 Ranbaxy Laboratories ₹14,000 received 2026-01-23; PO-2026-004 Dr. Reddy's Labs ₹14,000 draft. Real drug-company names are used as suppliers.
- **`Report`** (`src/pages/stockist/StockistReports.tsx`): `id, name, description, type ('h1'|'hnx'|'gst'|'sales'), lastGenerated?, status ('available'|'generating'|'pending')`. All 6 seeds are "available": h1-monthly "H1 Monthly Report" ("Monthly statement of Schedule H1 drugs sold", last 2026-01-25), h1-yearly "H1 Annual Report", hnx-monthly "HNX Drugs Report" ("Monthly statement of Schedule H, N, X drugs"), hnx-yearly "HNX Annual Report", gst-monthly "GST Sales Report" ("Monthly GST filing report with HSN summary"), sales-summary "Sales Summary Report" ("Complete sales summary with pharmacy-wise breakdown", last 2026-01-26). Month select = 12 English months; Year select = 2026/2025/2024.
- **`Document`** (`src/pages/stockist/StockistDocuments.tsx`): `id, name, type ('license'|'gst'|'invoice'|'other'), fileType ('pdf'|'image'|'excel'), size (display string), uploadedAt`. Seeds: d1 "Drug License Certificate" pdf 2.4 MB (2025-12-15); d2 "GST Registration" pdf 1.8 MB; d3 "Invoice Jan 2026" excel 450 KB; d4 "Store Photo" image 3.2 MB.
- **Support-chat models** (`src/pages/stockist/StockistMessages.tsx`): `Message {id, content, sender ('user'|'admin'), timestamp, status ('sent'|'delivered'|'read')}` and `Ticket {id, subject, status ('open'|'resolved'|'pending'), lastMessage, updatedAt, unreadCount}`. Seeds: ticket-001 "Order Delivery Issue" open (last: "We are looking into this issue. Please wait.", 1 unread); ticket-002 "Payment Not Reflecting" pending ("Can you share the transaction ID?"); ticket-003 "Product Return Request" resolved ("Your return has been processed successfully."). The 7 canned `adminResponses` verbatim: "Thank you for reaching out! Our team will review your query and get back to you shortly." / "I understand your concern. Let me check this for you." / "Could you please provide more details about the issue?" / "We apologize for the inconvenience. We're working on resolving this." / "Your request has been noted. We'll update you within 24 hours." / "Is there anything else I can help you with?" / "Thank you for your patience. We're processing your request."

**Shared stockist seed rows (exact values, `src/data/stockist-mock-data.ts`)**

- `mockPharmacyCircle` (L560–567): circle-001→ph-001 (₹1,00,000 / 15days / Monday), circle-002→ph-002 (₹1,50,000 / 30days / Wednesday), circle-003→ph-003 (₹80,000 / 7days / Friday), circle-004→ph-004 (₹1,20,000 / 15days / Tuesday), circle-005→ph-007 (₹75,000 / 7days / Thursday), circle-006→ph-011 (₹1,20,000 / 30days / Monday), circle-007→ph-016 (₹2,00,000 / 30days / Wednesday), circle-008→ph-018 (₹1,00,000 / 15days / Friday). All status `active`; `addedAt` spans 2024-06-15…2025-08-22.
- `mockIncomingOrders` (all status `new`): ORD-2026-0128-001 Shree Medical Store ₹9,497.60; ORD-2026-0128-002 Care Plus Chemist ₹7,526.40; ORD-2026-0128-003 Dhanvantari Pharmacy ₹17,931.20; ORD-2026-0127-001 Wellness Pharmacy ₹2,016; ORD-2026-0127-002 Arogya Aushadhi ₹3,024.
- `mockOrders`: ORD-2026-001 Shree Medical ₹3,852.80 processing; ORD-2026-002 Lifeline Pharmacy ₹6,770.40 out-for-delivery; ORD-2026-003 Care Plus Chemist ₹2,329.60 out-for-delivery; ORD-2026-004 Apollo Medicals ₹7,974.40 delivered; ORD-2026-005 Shree Medical ₹3,427.20 processing; ORD-2026-006 MedPlus Store ₹1,008 delivered.
- `mockPayments` statuses by order: ORD-2026-001 pending; ORD-2026-002 approved; ORD-2026-003 pending; ORD-2026-004 approved; ORD-2026-002 (second payment) **on-hold** — the seed data exercises pending/approved/on-hold but never `rejected`.

**Pharmacy purchase seeds (exact values, `src/data/pharmacy-mock-data.ts`)**

- The 8 `stockists`: STK001 ABC Distributors (4.8★, fee ₹50, min ₹5,000, max 18%), STK002 XYZ Pharma Wholesale (4.6★, fee ₹0, min ₹3,000, 15%), STK003 City Medical Suppliers (4.5★, ₹30, ₹2,000, 12%), STK004 HealthFirst Distributors (4.4★, ₹40, ₹4,000, 20%), STK005 MediQuick Supply (4.7★, ₹75, ₹1,500, 10%), STK006 Wellness Pharma Hub (4.3★, ₹25, ₹2,500, 14%), STK007 Prime Medical Agency (4.9★, ₹60, ₹7,500, 22%), STK008 Budget Meds Wholesale (4.1★, ₹0, ₹1,000, **25%**). The "Top Rated" home rail (`rating >= 4.5`) therefore matches STK001/002/005/007 plus STK003 at exactly 4.5.
- The 15 product names in catalog order (PROD001–015): Paracetamol 500mg, Amoxicillin 500mg, Metformin 500mg, Vitamin D3 60K IU, Atorvastatin 10mg, Omeprazole 20mg, Azithromycin 500mg, Cetirizine 10mg, Multivitamin Tablets, Pantoprazole 40mg, Amlodipine 5mg, Ibuprofen 400mg, Calcium + Vitamin D3, Montelukast 10mg, Dolo 650mg.
- The 7 `offers` with codes/terms: OFF001 STK001 "20% off on Antibiotics" (percentage 20, min ₹500, code **ANTI20**, valid 2025-01-31); OFF002 STK002 "Buy 10 Get 1 Free" (bogo, min ₹1,000, no code, valid 2025-02-15); OFF003 STK003 "Flat ₹200 Off" (flat 200, min ₹2,000, code **FLAT200**); OFF004 STK005 "Express Delivery Free" (flat 75, min ₹1,500, code **FREEEXP**); OFF005 STK007 "15% off on Cardiac Medicines" (code **HEART15**, categories ["Cardiac"]); OFF006 STK006 "Ayurveda Week Special" (25%, code **AYUR25**, categories ["Ayurvedic"]); OFF007 STK008 (Budget Meds Wholesale). All `validTill` dates are 2025-01/02 — **every offer is already expired relative to the real clock**, and no code path ever checks `validTill` or validates a code.

**Admin page-local rows (exact, previously only counted)**

- `AdminStockists` (`src/pages/admin/AdminStockists.tsx` L29–33): STK-001 "Digi Swasthya Store"/Amit Kumar/Mumbai/active/GST✓ DL✓/45 pharmacies/1,250 orders; STK-002 MediQuick Distributors/Suresh Patel/Delhi/pending/DL✗/0/0; STK-003 HealthFirst Pharma/Rajesh Sharma/Bangalore/active/32/890; STK-004 PharmaPlus Hub/Priya Mehta/Chennai/**suspended**/28/650; STK-005 MedSupply Central/Vikram Singh/Hyderabad/pending/GST✗ DL✗/0/0.
- `AdminPharmacies` (L29–33): PH-001 HealthPlus Pharmacy/Raj Kumar/Mumbai/active/**isLive true**/320 orders; PH-002 MediCare Store/Sneha Patel/Delhi/pending/DL✗/not live/0; PH-003 QuickMeds Pharmacy/Arun Sharma/Bangalore/active/live/250; PH-004 City Pharma/Priya Mehta/Chennai/active/**not live**/180; PH-005 WellCare Drugs/Vikram Singh/Hyderabad/suspended/95.
- `AdminUserDetail` synthetic records (`src/pages/admin/AdminUserDetail.tsx` L32–95): `"stockist-1"` = Rajesh Distributors Pvt. Ltd. (pending, registered 2024-01-15, address "Plot 45, MIDC Industrial Area, Andheri East, Mumbai") with 4 documents — Drug License (Form 20B) DL-MH-2024-123456, GST 27AABCR1234K1ZM, Wholesale License WL-MH-2024-7890, PAN AABCR1234K, **all pending**; businessDetails `{type: "Wholesale Pharmaceutical Distributor", pan}`. `"pharmacy-1"` = City Medical Store (owner Suresh Kumar Patel, "Shop No. 12, Patel Chambers, Linking Road, Mumbai") with mixed doc states: Drug License (Form 20/21) DL-MH-2024-654321 **verified**, GST 27ABCPS1234L1ZM pending, Retail License RL-MH-2024-9876 **rejected** — the only seeded rejected document in the app. All doc `url`s are `/placeholder.svg`.

### E2.4 Workflow traces (new traces only)

**W-A. Stockist support chat with simulated agent (`src/pages/stockist/StockistMessages.tsx`)**
1. Ticket list → `handleSelectTicket(id)`: synthesizes a fixed 2-message conversation — user msg `"Hello, I need help with: {ticket.subject}"` (timestamp hardcoded 2026-01-26T09:00) + admin msg = the ticket's `lastMessage`.
2. Alternate entry `handleStartNewChat`: sets `activeTicket = "new"` and seeds one admin message: **"Hello! Welcome to Digi Swasthya Support. How can we assist you today?"**
3. Send: appends the user message (status "sent"), sets `isTyping` → typing indicator, and after 1.5 s appends a random pick from the 7 `adminResponses`.
4. Auto-scroll via `messagesEndRef.scrollIntoView({behavior:"smooth"})` on every message change. Failure paths: none — nothing can fail; nothing persists past unmount.

**W-B. Inline quick payment on a pharmacy row (`src/components/stockist/PharmacyCard.tsx`)**
Trigger: expand the payment collapsible on any circle-pharmacy card (`/stockist/pharmacies`). Steps: enter amount → pick cash/upi/bank chip (default upi) → confirm. Branches: `!amount || amount <= 0` → destructive toast "Error / Please enter a valid amount", state kept; valid → success toast "Payment Recorded / {₹} via {method} recorded for {name}", input cleared, section collapsed. No ledger/outstanding value changes (data is const). This flow coexists with, and duplicates, `CollectPaymentDialog` on the pharmacy detail page.

**W-C. Admin document verification — the only interactive admin workflow (`src/pages/admin/AdminUserDetail.tsx` L120–150)**
Precondition: reach `/admin/users/stockist-1` or `/admin/users/pharmacy-1` by typed URL (list links use other id formats → "User Not Found" screen with `AlertCircle` icon, copy "The user you're looking for doesn't exist.", and a "Go Back" button calling `navigate(-1)`).
1. Documents tab lists each doc with status chip (pending/verified/rejected).
2. Approve → `handleApproveDoc` sets that doc's `status: 'verified'` in local state → toast "Document Approved / Document has been verified successfully".
3. Reject → opens a Dialog with `Textarea` reason; confirm → status 'rejected' → toast "Document Rejected / Rejection reason has been saved" (the typed reason is then discarded — not stored anywhere).
4. Approve All → all docs 'verified' → toast "All Documents Approved / User verification is complete". The user's own `status: 'pending'` never changes — document approval and account approval are not linked. Preview (Eye) opens a Dialog rendering the `/placeholder.svg` url. All state resets on reload (`useState(user?.documents)`).

**W-D. OCR order scan (orphaned but complete) (`src/components/stockist/dialogs/OCRScanDialog.tsx`)**
Two entries: `handleStartScan` (camera placeholder, L39) or `handleUploadImage` (L52); both run a `setTimeout` "scanning" phase then load the fixed `mockScanResults` item list (L31; mixed matched/unmatched rows). "Create Order" (`handleCreateOrder`, L65) → toast "Order Created / Order created with {matched} items"; `handleReset` (L75) returns to the capture step. No page imports this dialog (§8C) — reachable only if wired in future.

**W-E. Contact verification with cooldown (`src/components/ui/verification-input.tsx` + `src/pages/stockist/settings/ProfileSettings.tsx`)**
Edit email/phone → status flips to `unverified` → "Verify" click starts a 30 s timer and flips to `pending` → OTP field auto-focuses → any 6-character entry submits → parent marks `verified`. Resend allowed only when the countdown reaches 0 (restarts 30 s). Exception path: OTP shorter than 6 chars → submit button simply disabled (no error message is ever shown).

### E2.5 Business rules & calculations (new)

| Rule / formula | Exact code behavior | Source |
|---|---|---|
| Card margin (integer) | `Math.round(((mrp − salePrice)/mrp)×100)` + "% margin" | `src/components/stockist/ProductCard.tsx` |
| Detail margin (1-decimal) | same formula but `.toFixed(1)` — grid card and detail page can disagree by rounding | `src/pages/stockist/ProductDetail.tsx` |
| Expiry days | `Math.ceil((expiry − today)/86,400,000)`; ≤0 → "Expired", ≤90 → "{n}d left" | `ProductCard.tsx` `getExpiryStatus` |
| Order item count | `Σ item.quantity` (total units displayed as the item count) | `OrderCard.tsx` |
| Pending orders per pharmacy card | `getOrdersByPharmacy(id).filter(status ∉ {delivered,cancelled}).length` | `PharmacyCard.tsx` |
| Net due (card level) | `pharmacy.outstanding − pharmacy.creditBalance` — uses the `outstanding` alias; PharmacyDetail uses `outstandingBalance` (duplicated field, same value) | `PharmacyCard.tsx` vs `PharmacyDetail.tsx` |
| Screenshot timestamp | `createdAt − (10 + random 0–4) minutes`, recomputed every render — non-deterministic UI | `PaymentApprovalCard.tsx` |
| AddPayment cap | rejects `paymentAmount > amountDue` where `amountDue = totalAmount − paidAmount` — the only over-payment guard in the app (CollectPaymentDialog has no cap) | `src/components/stockist/dialogs/AddPaymentDialog.tsx` L44, L71 |
| Toast concurrency | max 1 visible toast (`TOAST_LIMIT = 1`); each new message replaces the last | `src/hooks/use-toast.ts` |
| Admin sidebar active test | strict pathname equality; child routes highlight nothing | `AdminLayout.tsx` L52 |
| Offer validity | `validTill` stored but never compared to any date — expired offers display everywhere and codes are never validated | `src/data/pharmacy-mock-data.ts` (offers); no consumer checks |

### E2.6 Data-layer reference (new)

**Design-token system (`src/index.css` + `tailwind.config.ts`)** — every status color used by the badges/KPIs above resolves to these HSL custom properties:
- Brand: `--primary: 210 40% 45%` (steel blue — same family as the PWA `#4a7c94`), `--destructive: 0 72% 51%`, `--radius: 0.5rem`.
- Extended semantic set (beyond stock shadcn): `--success: 142 76% 36%` (+`--success-light: 142 76% 95%`), `--warning: 45 93% 47%` (+light), `--orange: 25 95% 53%` (+light), `--info: 199 89% 48%` (+light). Tailwind maps `success.DEFAULT/light`, `warning.*`, `info.*` (`tailwind.config.ts` L20–30) — **`--orange` is defined in CSS but has no Tailwind mapping**, a reserved-but-unused token.
- Chart palette `--chart-1…5` (hues 12/173/197/43/27) and a full `--sidebar-*` token group (consumed by `ui/sidebar.tsx`).
- A dark-theme block redefines all base tokens (e.g. dark `--primary: 210 40% 98%`) — **the dark palette exists in CSS, but no code ever toggles the `dark` class**, consistent with the inert theme switches documented in §3.14/§4C.

**Persistence & runtime keys (re-verified, complete):** the only storage key in `src/` is `localStorage['stockist_tour_completed']` (`StockistHome.tsx` / `GuidedTour.tsx` / `StockistMore.tsx`). No sessionStorage, no IndexedDB, no cookies. Toast state lives in a module-scope `memoryState` (`use-toast.ts`) — survives route changes, not reloads.

**PWA behavior additions:** zoom-locked viewport (E2.1); `mask-icon` points at the 512px PNG (not an SVG) with color `#4a7c94`; OG image is the 512px PWA icon; `robots.txt` allows all bots explicitly by name. Standalone/installed detection exists only on `/install` (Part 1E) — no other page adapts to display-mode.

### E2.7 Role journeys step-by-step (deltas only — base journeys in Part 7)

- **Admin:** after login the sidebar shows the exact 11 items of E2.1's table; navigating to any `:id` detail de-highlights the sidebar entirely (strict-equality active test). The only completable multi-step admin task is W-C (document verification on `stockist-1`/`pharmacy-1` via typed URL): Documents tab → approve/reject each (reject demands a typed reason) → "Approve All" → toast "User verification is complete" — then a reload reverts every status to seed values.
- **Stockist:** two micro-journeys not previously traced: (1) collect a payment *without leaving the list* via the PharmacyCard collapsible (W-B); (2) raise and "resolve" a support ticket in Messages (W-A) — select "Payment Not Reflecting", reply, get a random canned agent response after the 1.5 s typing indicator. The header identity everywhere is the computed "Rajesh Distributors / RD" (E2.1).
- **Pharmacy (purchase):** the bell/message icons in the top nav work from Sale view too but always land on the purchase-view pages (`/pharmacy/messages`, `/pharmacy/notifications`) — a Sale-view user tapping the bell is silently context-switched into Purchase-view content (`PharmacyTopNav.tsx`). The offers rail shows codes (ANTI20/FLAT200/FREEEXP/HEART15/AYUR25) that are all past their `validTill` and are never redeemable anywhere (Checkout's coupon Apply is decorative, §4.8).
- **Pharmacy (sale):** no new findings beyond existing review (§5, §6H–6I) other than the cross-view top-nav navigation noted above.

### E2.8 Hidden / internal functionality

- **Unreachable TopNav identities:** `getPortalInfo` carries full pharmacy/doctor/patient/fallback branches that can never execute (TopNav only mounts in StockistLayout) — four dead identity configs including the generic "DigiSwasthya / Portal / DS" (`src/components/layout/TopNav.tsx`).
- **`expiring-soon` badge state:** supported by `StatusBadge`'s stock map but produced only by `ProductCard`'s own expiry computation — `StockistProducts.getStockStatus` never emits it.
- **Payment seed gap:** no `rejected` payment is ever seeded (pending/approved/on-hold only), so the approval-status red badge is dead-in-data (`src/data/stockist-mock-data.ts` L1053–1109).
- **Rejected-document seed:** exactly one in the app — pharmacy-1's Retail License RL-MH-2024-9876 (`AdminUserDetail.tsx` L66).
- **Non-deterministic render seeds:** PaymentApprovalCard's fabricated screenshot minute offset and `ui/sidebar.tsx`'s random skeleton width join the already-documented patient price jitter as the three `Math.random()` render-path uses in the app.
- **Cross-referenced page-local seeds:** CreditNotes' rows point at *real* shared orders/pharmacies (ord-001/002/004, ph-001/002/004) even though the page never joins them — hand-maintained consistency, not code-enforced (`CreditNotes.tsx`).
- **Real-world supplier names** hardcoded in PurchaseOrders seeds: Sun Pharma Distributors, Cipla Limited, Ranbaxy Laboratories, Dr. Reddy's Labs (`PurchaseOrders.tsx`).
- **`--orange` design token** defined with a light variant but never mapped into Tailwind (`index.css` vs `tailwind.config.ts`).
- **Reject reason discarded:** admin document rejection collects a reason in a dialog, saves only the status flip, yet the toast claims "Rejection reason has been saved" (`AdminUserDetail.tsx` L141).
- **Zoom lock:** `user-scalable=no` in the viewport meta disables pinch-zoom platform-wide (`index.html`).
- **Stub-dialog copy convention:** unbuilt features consistently toast "{Thing} ... opening..." — "Route planning dialog opening...", "Staff registration form opening...", "Opening support chat..." (`DeliveryRoutes.tsx` L106, `StaffManagement.tsx` L117, `PharmacyMore.tsx` L48) — an internal marker distinguishing "dialog not built" from "dialog built but write is a stub".

### E2.9 Validation & error-handling catalog (verbatim messages)

Every validation gate and its exact toast copy for Admin/Stockist/Pharmacy surfaces (grep-extracted; ⛔ = destructive variant):

**Stockist — validation failures (all ⛔):**
| Gate | Message (title / description) | Source |
|---|---|---|
| Quick payment amount ≤ 0 | "Error" / "Please enter a valid amount" | `PharmacyCard.tsx` L73 |
| CollectPayment amount invalid | "Invalid Amount" / "Please enter a valid payment amount" | `CollectPaymentDialog.tsx` L57 |
| AddPayment amount invalid | "Error" / "Please enter a valid amount" | `AddPaymentDialog.tsx` L62 |
| AddPayment > due | "Error" / "Payment amount cannot exceed amount due" | `AddPaymentDialog.tsx` L71 |
| AddStock qty invalid | "Error" / "Please enter a valid quantity" | `AddStockDialog.tsx` L39 |
| AddProduct required missing | "Error" / "Please fill in all required fields" | `AddProductDialog.tsx` L76 |
| EditProduct required missing | "Error" / "Please fill in all required fields" | `EditProductDialog.tsx` L98 |
| EditPharmacy required missing | "Error" / "Please fill in all required fields" | `EditPharmacyDialog.tsx` L61 |
| EditOrderItems no product picked | "Error" / "Please select a product" | `EditOrderItemsDialog.tsx` L76 |
| EditOrderItems empty order | "Error" / "Order must have at least one item" | `EditOrderItemsDialog.tsx` L103 |
| CreateOrder/QuickOrder empty paste | "Error" / "Please paste order text first" | `CreateOrder.tsx` L50, `QuickOrderDialog.tsx` L58 |
| CreateOrder/QuickOrder no pharmacy | "Error" / "Please select a pharmacy" | `CreateOrder.tsx` L119, `QuickOrderDialog.tsx` L130 |
| CreateOrder/QuickOrder no matches | "Error" / "No matched items to create order" | `CreateOrder.tsx` L125, `QuickOrderDialog.tsx` L136 |
| CreateBill/QuickBill no pharmacy | "Error" / "Please select a pharmacy" | `CreateBill.tsx` L79, `QuickBillDialog.tsx` L79 |
| CreateBill/QuickBill no orders | "Error" / "Please select at least one order" | `CreateBill.tsx` L83, `QuickBillDialog.tsx` L83 |
| CreateReturn no items | "Error" / "Please select at least one item to return" | `CreateReturnDialog.tsx` L121 |
| CreateReturn missing reasons | "Error" / "Please select a return reason for all items" | `CreateReturnDialog.tsx` L131 |
| SendReminder none selected | "Error" / "Please select at least one pharmacy" | `SendReminderDialog.tsx` L141 |
| ScanProduct empty barcode | "Error" / "Please enter a barcode" | `ScanProductDialog.tsx` L45 |

**Stockist — success / informational toasts (exact copy not previously quoted):** "Order Accepted / Order {n} has been accepted for delivery on {dd MMM}" (`AcceptOrderDialog.tsx` L60); "Order Declined / Order {n} has been declined" (`DeclineOrderDialog.tsx` L50); Home-page payment actions: "Payment Approved / ₹{amt} approved", "Payment Rejected / {reason}" ⛔, "Payment On Hold / {notes or 'Payment put on hold'}", plus title-only "Order Accepted" and "Order Declined" ⛔ (`StockistHome.tsx` L138–165); "Status Updated / Order {n} is now \"{label}\"" (`UpdateStatusDialog.tsx` L46) vs OrderDetail's "Status Updated / Order marked as {status hyphens→spaces}" (`OrderDetail.tsx` L122); "Pharmacy Added to Circle / {name} has been added with ₹{limit} credit limit" (`AddToCircleDialog.tsx` L46); "Removed / {name} removed from your circle" (`StockistPharmacies.tsx` L148) vs "Removed from Circle / {name} has been removed from your circle" (`PharmacyDetail.tsx` L124); "Copied / Phone number copied to clipboard" (`PharmacyDetail.tsx` L93); "Deleted / {ItemType} \"{name}\" has been deleted" (`ConfirmDeleteDialog.tsx` L42); "Credit Note Created / Credit note for {₹} has been submitted for approval" (`CreateReturnDialog.tsx` L143); "Credit Note Approved / {CN-no} has been approved" and bare "Rejected" ⛔ (`CreditNotes.tsx` L111, L247); "Export Started / Exporting {types} as {FORMAT}" → "Export Complete / Your file has been downloaded" (`ExportDialog.tsx` L51–59); "Template Downloaded / {type}_template.csv has been downloaded" and "Import Successful / {n} {type} imported successfully" (`BulkUploadDialog.tsx` L116, L169); "Generating Report / Preparing {name} for {Month} {Year}..." → "Report Ready" (`StockistReports.tsx` L105–113); "Return Initiated / Return request created for {product}", "Write-off Recorded / {product} marked for write-off" (`ExpiryManagement.tsx` L75–83); "Route Optimized / Your delivery route has been optimized for shortest distance", "Route Copied / Delivery route copied to clipboard", "Navigation Started / Starting navigation to {n} stops" (`MapRouteDialog.tsx` L70–95); "Stock Updated / {name} stock updated to {n}" (`ScanProductDialog.tsx` L63); "Stock Added / Added {qty} units to {product}" (`AddStockDialog.tsx` L47); "Product Added / {name} has been added successfully!" / "Product Updated / {name} has been updated successfully" (`AddProductDialog.tsx` L84, `EditProductDialog.tsx` L106); "Pharmacy Updated / {name} has been updated successfully" (`EditPharmacyDialog.tsx` L69); "Order Updated / Order items updated. New total: {₹}" (`EditOrderItemsDialog.tsx` L108); SharePaymentLink: "Link Copied / Payment link copied to clipboard", "Opening WhatsApp / Share the payment link via WhatsApp", "Opening Email / Share the payment link via email" (`SharePaymentLinkDialog.tsx` L36–61); bill flows: "WhatsApp Opened / Bill details ready to share", "Printing... / Bill sent to printer", "Link Copied / Bill link copied to clipboard", "Downloading... / Bill PDF downloading" (`CreateBill.tsx` L105–118 = `QuickBillDialog.tsx` L105–118); BillPreview: "Printing / Opening print dialog...", "Share / Share link copied to clipboard", "Downloading / Bill PDF is being generated..." (`BillPreviewDialog.tsx` L62–70); DocumentPreview: "Download Started / Downloading {name}", "Share Link Copied / Document link copied to clipboard", "Printing / Opening print dialog...", "Opening / Opening document in new tab..." (`DocumentPreviewDialog.tsx` L41–63); Documents page: "Document Uploaded / {name} has been uploaded successfully", "Document Deleted / {name} has been removed", "Download Started / Downloading {name}" (`StockistDocuments.tsx` L80–110); Orders tab actions: "Order Accepted / The order has been added to your active orders", "Order Declined / The pharmacy has been notified" (`StockistOrders.tsx` L93–101); OCR: "Order Created / Order created with {n} items" (`OCRScanDialog.tsx` L67); onboarding: "Onboarding Skipped / You can complete your profile later from Settings", "Welcome to Digi Swasthya! / Your account is ready. Start managing your business." (`StockistOnboarding.tsx` L91–100); tour: "Tour Complete! / You're all set to start using the app." (`StockistHome.tsx` L125); print: "Print / Print dialog opened" (`OrderDetail.tsx` L104); stubs: "Create Route / Route planning dialog opening...", "Add Staff / Staff registration form opening...", "Edit Staff / Editing {name}...", "Create Credit Note / Select an order to create a credit note..." (`DeliveryRoutes.tsx` L106, `StaffManagement.tsx` L117–125, `CreditNotes.tsx` L107).

**Pharmacy — validation & messages:**
| Gate / event | Message | Source |
|---|---|---|
| Sale order empty cart ⛔ | "Cart is empty" / "Add products to create an order" | `SaleOrderDialog.tsx` L74 |
| Record patient missing name/phone ⛔ | "Required fields missing" / "Please enter name and phone number" | `RecordPatientDialog.tsx` L38 |
| Password mismatch ⛔ | "Passwords don't match" (no description) | `pharmacy/settings/SecuritySettings.tsx` L20 |
| Add to cart | "Added to cart" / "{qty}x {product}" | `AddToCartDialog.tsx` L24 |
| Checkout placed | "Order Placed Successfully!" / "You'll receive updates on your order status" | `Checkout.tsx` L41 |
| Smart order done | "Added to Cart!" / "{n} items added with {cheapest|quickest|best_value} option" | `SmartOrder.tsx` L126, `SmartOrderDialog.tsx` L122 |
| Sale complete | "Order Created!" / "Order total: {₹}" | `SaleOrderDialog.tsx` L81 |
| Inventory toggle | "Product is now live|offline" / "{name} visible to|hidden from customers" | `SaleInventory.tsx` L41 |
| Go-live toggle | "You're now live!" / "Customers can now see your products" (off: "Inventory offline" / "Your products are hidden from customers") | `SaleDashboard.tsx` L143, `GoLiveDialog.tsx` L24 |
| Doctor unavailable ⛔ | "Doctor Unavailable" / "{name} is currently not available. Try again later." | `DoctorConnect.tsx` L36 |
| Voice sim | "Recording..." / "Speak the patient details" → "Recording complete" / "Details captured [successfully | - please verify]" | `StartConsultation.tsx` L40–45, `RecordPatientDialog.tsx` L25–31, `StartConsultationDialog.tsx` L33–39 |
| Consult connect / end | "Connecting..." / "Initiating {voice|video} call with {doctor}"; "Call Ended / Consultation completed" | `StartConsultation.tsx` L51, L302 |
| Reports | "Downloading Report" / "{type} report will be downloaded shortly"; "Downloading Prescription / Prescription PDF will be downloaded shortly" | `SaleReports.tsx` L31, `ConsultationDetail.tsx` L52 |
| Misc | "Message sent / To {stockist}", "Issue reported / We'll get back to you soon", "Thanks for your feedback!", "Items added to cart / Review and checkout when ready", "Removed from wishlist"/"Added to wishlist", "Removed from favorites"/"Added to favorites", "Patient Added / {name} has been added to your customers", "Settings Saved / Your live inventory settings have been updated", "Logged Out / You have been logged out successfully", "Add Product / Product adding dialog coming soon", "Support / Opening support chat...", "Settings updated", "Language updated", "Profile updated successfully", "Business details updated successfully", "Password changed successfully", "2FA Enabled|Disabled", onboarding "Welcome to Digi Swasthya! / Your pharmacy is ready. Start ordering from stockists." | `ContactStockistDialog.tsx` L19, `ReportIssueDialog.tsx` L21, `RateStockistDialog.tsx` L20, `ReorderDialog.tsx` L17, `PharmacyWishlist.tsx` L25, `PharmacyProducts.tsx` L46, `PharmacyStockistDetail.tsx` L95, `RecordPatientDialog.tsx` L45, `LiveSettings.tsx` L29, `PharmacyMore.tsx` L41–48, `SaleInventory.tsx` L148, `settings/*.tsx`, `PharmacyOnboarding.tsx` L112 |

**Admin — messages (complete set):** "Stockist Approved / {name} has been approved", "Stockist Suspended / {name} has been suspended" ⛔ (`AdminStockists.tsx` L64–68); identical Pharmacy/Doctor pairs (`AdminPharmacies.tsx` L64–68, `AdminDoctors.tsx` L65–69); generic Users action toast where the **action label itself is the title**: `title: action, description: "{action} action for {user.name}"` (`AdminUsers.tsx` L57–58); "Document Approved / Document has been verified successfully", "Document Rejected / Rejection reason has been saved", "All Documents Approved / User verification is complete" (`AdminUserDetail.tsx` L133–149); "Settings Saved / Platform settings have been updated" (`AdminSettings.tsx` L14); "Exporting Report / {type} report is being generated..." (`AdminReports.tsx` L19).

**Error-handling posture (global):** there is no error boundary, no try/catch around any handler, and no failing async path — the only "error" UI states in the three in-scope panels are (a) the not-found EmptyStates on detail pages ("Pharmacy not found", "Product not found", "Order not found", admin "User Not Found / The user you're looking for doesn't exist."), (b) the ⛔ destructive toasts cataloged above, and (c) the global `NotFound` 404 page. Because `TOAST_LIMIT = 1` (`src/hooks/use-toast.ts`), a validation error immediately followed by any other toast is silently replaced.

*End of Expansion Pass 2 (2026-07-08).*


# Source: digiswasthyamvp

## PART E — ADMIN MODULE (no guards; all writes are stubs)

### 5.1 Dashboard (`/admin`, `AdminDashboard`) — pure dummy
- KPIs: Pharmacies (5), Stockists (4), B2B Orders (8), Pending Approvals = pending stockists+pharmacies (sp-004 + pp-005 = 2), Total Revenue = Σ order.total_amount, **Active Today = 12** (hardcoded). Second row: **New Registrations Today = 3**, **Today ₹5,590 / Yesterday ₹4,200** (hardcoded). Pending Stockists/Pharmacies counts. Revenue chart (DEMO_MONTHLY_TREND.revenue) + Platform Growth chart (DEMO_ADMIN_GROWTH). **System Health: Operational** (static, pulsing dot). Builds KPI cards inline (does NOT use KpiCard).

### 5.2 Approval queues (`AdminPharmacies` / `AdminStockists`)
- All profiles desc, staleTime 15s. Search. Checkbox multi-select (pending only), "Select All Pending", **bulk Approve/Reject** + inline per-card Approve/Reject (only shown for pending). `updateStatus` sets approval_status (no reason required here; no notification here). Pending-count badge. Ring highlight on selected.

### 5.3 Detail (`AdminPharmacyDetail` / `AdminStockistDetail`)
- Full profile review. Approve/Reject buttons (shown for pending|rejected); **Reject requires a rejection reason** (input); on either → update status (+rejection_reason) + insert `approval` notification. `updateDocStatus(field,status)` per document (approved/rejected/pending) with inline image/iframe **Preview**, Open link.
- Docs — pharmacy: Drug License / GST / Pharmacy Certificate; stockist: Drug License / GST / Wholesale / FSSAI.
- Tabs: Details / (Products — stockist only, `SharedProductCard role="admin"` sourceLabel) / Orders (last 10). InfoRows for business/owner/contact/address/bank; Circle list. "View Chat History" → `/admin/messages/:userId`.

### 5.4 Users (`/admin/users`, `AdminUsers`)
- Merges stockist_profiles + pharmacy_profiles into one list with role tags. Tabs all/stockist/pharmacy/**doctor/customer** (latter two have **no data source → always 0**). Search name/email. `suspendUser` toggles approval_status suspended↔approved + `system` notification (guards `customer_profiles` table which never occurs). "View" → role detail (doctor/customer paths unrouted).

### 5.5 Orders (`AdminOrders` / `AdminOrderDetail`)
- List: all orders (join both profiles) desc, search order#/pharmacy/stockist, status tabs all/pending/packed/dispatched/delivered/cancelled (exact match). Card: "pharmacy → stockist", status color, total.
- Detail: order (+both joins) + items (+products). Status/payment badges, pharmacy/stockist card. **Admin Status Override** (hidden for delivered/cancelled): Select (excludes current) + Apply → RPC `admin_override_order_status` (no-op) + toast + invalidate. Items + Total.

### 5.6 Bills (`/admin/bills`) — read-only
- All bills (join both). Tiles: Total Billed = Σ total_amount, **Total GST = Σ gst_amount** (seed bills have gst_amount so this shows a real sum). Search + status filter (all/draft/finalized — seed statuses paid/sent/draft, so only draft matches). Cards show GST if >0; badge highlights `finalized` only.

### 5.7 Payments (`/admin/payments`) — read-only
- All payments (join both). Tile Total Collected = Σ amount. Search (stockist/pharmacy/reference), status filter all/confirmed/pending. Cards: method, reference, badge.

### 5.8 Notifications (`/admin/notifications`)
- a-user-001 notifications + **Broadcast** (target all/stockist/pharmacy → gather user_ids, dedupe, insert in chunks of 100, type `broadcast`) + **Targeted** (lookup profile by email → insert type `targeted`; note: `profiles` are synthesized so email match works for the 6 seed profiles). Mark-all-read, mark-read on click.

### 5.9 Login History (`/admin/login-history`)
- Reads **`login_attempts`** ordered by `attempted_at` limit 200 — but `TABLE_DATA.login_attempts` is **empty** (populated data is in the separate `login_activity` array) → page always shows **0 successful / 0 failed / "No login attempts found"**. Tiles + email filter present but moot.

### 5.10 Messages (`/admin/messages`, `AdminMessages`)
- Loads `conversations` (1 seed row for s-user-001) → per conv fetch profile + last chat_message → list. Click → `/admin/messages/:userId` (= ChatPage in admin view). Search name/email/role.

### 5.11 More / Help / Profile / Settings
- **More (`/admin/more`)** MenuPage: ACCOUNT / USERS / ORDERS & FINANCE / PLATFORM (Pharmacies, Stockists, Settings, Login History) / COMMUNICATION / PREFERENCES. All routed.
- **Help (`/admin/help`)**: 8 hardcoded FAQs — several reference features **not present** in this folder (Platform Analytics, Counterfeit Management, System Architecture, Export Data). "View Support Conversations" → /admin/messages.
- **Profile (`/admin/profile`)**: full_name (editable → update profiles), email disabled, Role disabled "Administrator", Change Password → `/forgot-password` (unrouted → 404).
- **Settings (`/admin/settings`)**: Logo upload (→ `platform` bucket → placeholder URL); **Commission** (%), **GST Rates** (category select medicines/equipment/consumables/otc + %), **Payment Methods** (checkboxes cash/upi/bank_transfer/cheque). ⚠️ `saveCommission`/`saveGstRate`/`savePaymentMethods` make **NO backend call** — toast + local state only.

---

## PART G — AI & EDGE FUNCTIONS (`supabase/functions/*`) — unreachable at runtime (invoke → null)

All AI functions POST to the Lovable AI Gateway `https://ai.gateway.lovable.dev/v1/chat/completions` with `LOVABLE_API_KEY`.

| Function | Model / logic | Auth |
|---|---|---|
| `parse-order-text` | `google/gemini-3-flash-preview` tool-calling `extract_order_items` → `{items:[{name,quantity,productId?}]}` against supplied catalog. Handles 429/402. | Requires `Bearer` header (presence). |
| `autofill-product-details` | Same model, tool `return_product_details` → brand/manufacturer/composition/drug_type(enum)/pack_type(enum)/category(enum)/drug_schedule(enum)/requires_prescription/pack_size/hsn_code + confidence + fields_filled. Rejects <3 chars. | Bearer presence. |
| `parse-purchase-bill` | Same model, vision (image_url) or base64 text; extract product array with a fixed category enum; regex-extracts JSON array; soft-fails HTTP 200 on parse error. | **None** (no auth check). |
| `chat-bot` | Same model; first fuzzy-matches a `quick_questions` table (≥2 keyword overlap or 25-char prefix) via service-role client; else model with platform system prompt (≤100 words); flags `is_forwarded` if reply mentions "forward"/"admin team"; graceful 429 + catch-all fallback. | Bearer; uses `SUPABASE_SERVICE_ROLE_KEY`. |
| `architecture-ai` | `google/gemini-2.5-flash`, max_tokens 4096; answers architecture questions about the **"Digi Swasthya Hub"** lineage app (5 roles incl. Customer/Doctor, B2B+B2C) via injected `architectureContext`. Docs helper, not a product feature. | **None.** |
| `seed-admin` | Service-role; creates/reuses auth user from body `{email,password}`, ensures `admin` user_roles row. No hardcoded creds. | Service-role; body-driven. |
| `seed-production-data` | Seeds a real project with Jaipur-area demo data (PINs 303328/302021/…, ~25 areas, 10 banks/IFSC, ~20 stockist names, ~50 pharmacy names, products/orders). Dev/ops utility. | Service-role. |
| `flowboard-data` | Read-only architecture/blueprint API (`?type=sections|nodes|screens|routes|business-logic|infrastructure|database`, META v5.0.0). Emits a large hand-authored map of the **lineage** app (auth/stockist/pharmacy/doctor/customer/b2b/b2c/admin sections, per-node inputs/outputs/validations/failureCases/status). `database` tries `get_flowboard_schema` RPC with a static `KNOWN_TABLES` fallback. Powers an architecture explorer. | **None.** |

---

## PART J — DATA MODEL (`types.ts`, PostgrestVersion 14.4)

- **22 tables:** bill_orders, bills, chat_messages, conversations, login_activity, login_attempts, messages, notifications, order_items, order_status_history, orders, payments, peer_messages, pharmacy_profiles, product_batches, product_media, products, profiles, serviceable_areas, stockist_pharmacy_circle, stockist_profiles, user_roles. (`order_returns` and `quick_questions` are **referenced in code but absent** from the types & mock.)
- **15 RPCs:** admin_override_customer_order_status, admin_override_order_status, admin_send_targeted_notification, check_login_rate_limit, decrement_stock, deduct_pharmacy_inventory, deduct_product_stock, get_flowboard_schema, has_role, hash_password, record_login_attempt, restore_pharmacy_inventory, restore_product_stock, update_circle_outstanding, verify_staff_credentials. (Mock stubs 3 → truthy; rest → null.)
- **Enums:** `app_role = admin|stockist|pharmacy|customer|doctor` (customer/doctor unused in this frontend); `approval_status = pending|approved|rejected` (`suspended` used as a string by AdminUsers though not in the enum).
- Constants: `PHARMA_BRANDS` (~100), `PRODUCT_CATEGORIES` (16), `GST_RATES` (0/5/12/18/28%), `DRUG_SCHEDULES` (None/H/H1/X/G/J), `DRUG_TYPES` (Allopathy/Ayurvedic/Homeopathy/Unani), `PACK_TYPES` (13). `INDIAN_STATES` (36) + `getCitiesForState`.
- Notification `type` values used across app: order, payment, stock, bill, approval, system, broadcast, targeted, payment_reminder, price_change, feedback, registration, circle_status, profile_update.
- 46 SQL migration files under `supabase/migrations/` (not applied by the mock; historical schema).

---

## EXPANSION — Code-Derived Additions (Audit Pass)

*Audit date: 2026-07-04. Content derived exclusively from source under `digiswasthyamvp/`. Documents implemented behavior only.*

### E.1 Complete Route Table

**Frontend routes extracted:** 68 | **Server API routes:** 0

| # | Path | Component | Role/Gate | Source |
|---|------|-----------|-----------|--------|
| 1 | `/` | DemoHome | — | `src/App.tsx` |
| 2 | `/stockist/products` | StockistProducts | — | `src/App.tsx` |
| 3 | `/stockist/products/add` | StockistAddProduct | — | `src/App.tsx` |
| 4 | `/stockist/products/:id` | StockistProductDetail | — | `src/App.tsx` |
| 5 | `/stockist/products/:id/edit` | StockistEditProduct | — | `src/App.tsx` |
| 6 | `/stockist/orders` | StockistOrders | — | `src/App.tsx` |
| 7 | `/stockist/orders/create` | StockistCreateOrder | — | `src/App.tsx` |
| 8 | `/stockist/orders/:id` | StockistOrderDetail | — | `src/App.tsx` |
| 9 | `/stockist/pharmacies` | StockistPharmacies | — | `src/App.tsx` |
| 10 | `/stockist/pharmacies/find` | StockistFindPharmacy | — | `src/App.tsx` |
| 11 | `/stockist/pharmacies/:id` | StockistPharmacyDetail | — | `src/App.tsx` |
| 12 | `/stockist/pharmacies/:id/ledger` | StockistPharmacyLedger | — | `src/App.tsx` |
| 13 | `/stockist/more` | StockistMore | — | `src/App.tsx` |
| 14 | `/stockist/payments` | StockistPayments | — | `src/App.tsx` |
| 15 | `/stockist/profile` | StockistProfileSettings | — | `src/App.tsx` |
| 16 | `/stockist/business` | StockistBusinessDetails | — | `src/App.tsx` |
| 17 | `/stockist/settings` | StockistSettings | — | `src/App.tsx` |
| 18 | `/stockist/help` | StockistHelpCenter | — | `src/App.tsx` |
| 19 | `/stockist/notifications` | StockistNotifications | — | `src/App.tsx` |
| 20 | `/stockist/privacy-security` | StockistPrivacySecurity | — | `src/App.tsx` |
| 21 | `/stockist/serviceable-areas` | StockistServiceableAreas | — | `src/App.tsx` |
| 22 | `/stockist/export-catalogue` | StockistExportCatalogue | — | `src/App.tsx` |
| 23 | `/stockist/bill-history` | StockistPurchaseBillHistory | — | `src/App.tsx` |
| 24 | `/stockist/bulk-bill` | StockistBulkBill | — | `src/App.tsx` |
| 25 | `/stockist/chats` | ChatListPage | — | `src/App.tsx` |
| 26 | `/stockist/chat/:peerId` | PeerChatPage | — | `src/App.tsx` |
| 27 | `/stockist/messages` | ChatPage | — | `src/App.tsx` |
| 28 | `/pharmacy/orders` | PharmacyOrders | — | `src/App.tsx` |
| 29 | `/pharmacy/orders/quick` | PharmacyQuickOrder | — | `src/App.tsx` |
| 30 | `/pharmacy/orders/:id` | PharmacyOrderDetail | — | `src/App.tsx` |
| 31 | `/pharmacy/stockists` | PharmacyStockists | — | `src/App.tsx` |
| 32 | `/pharmacy/stockists/find` | PharmacyFindStockist | — | `src/App.tsx` |
| 33 | `/pharmacy/stockists/:id` | PharmacyStockistDetail | — | `src/App.tsx` |
| 34 | `/pharmacy/browse` | PharmacyBrowse | — | `src/App.tsx` |
| 35 | `/pharmacy/more` | PharmacyMore | — | `src/App.tsx` |
| 36 | `/pharmacy/profile` | PharmacyProfileSettings | — | `src/App.tsx` |
| 37 | `/pharmacy/business` | PharmacyBusinessDetails | — | `src/App.tsx` |
| 38 | `/pharmacy/notifications` | PharmacyNotifications | — | `src/App.tsx` |
| 39 | `/pharmacy/payments` | PharmacyPayments | — | `src/App.tsx` |
| 40 | `/pharmacy/help` | PharmacyHelpCenter | — | `src/App.tsx` |
| 41 | `/pharmacy/privacy-security` | PharmacyPrivacySecurity | — | `src/App.tsx` |
| 42 | `/pharmacy/settings` | PharmacySettings | — | `src/App.tsx` |
| 43 | `/pharmacy/quick-order-history` | PharmacyQuickOrderHistory | — | `src/App.tsx` |
| 44 | `/pharmacy/ledger/:stockistId` | PharmacyLedger | — | `src/App.tsx` |
| 45 | `/pharmacy/chats` | ChatListPage | — | `src/App.tsx` |
| 46 | `/pharmacy/chat/:peerId` | PeerChatPage | — | `src/App.tsx` |
| 47 | `/pharmacy/messages` | ChatPage | — | `src/App.tsx` |
| 48 | `/admin/pharmacies` | AdminPharmacies | — | `src/App.tsx` |
| 49 | `/admin/pharmacies/:id` | AdminPharmacyDetail | — | `src/App.tsx` |
| 50 | `/admin/stockists` | AdminStockists | — | `src/App.tsx` |
| 51 | `/admin/stockists/:id` | AdminStockistDetail | — | `src/App.tsx` |
| 52 | `/admin/orders` | AdminOrders | — | `src/App.tsx` |
| 53 | `/admin/orders/:id` | AdminOrderDetail | — | `src/App.tsx` |
| 54 | `/admin/more` | AdminMore | — | `src/App.tsx` |
| 55 | `/admin/bills` | AdminBills | — | `src/App.tsx` |
| 56 | `/admin/payments` | AdminPayments | — | `src/App.tsx` |
| 57 | `/admin/users` | AdminUsers | — | `src/App.tsx` |
| 58 | `/admin/notifications` | AdminNotifications | — | `src/App.tsx` |
| 59 | `/admin/settings` | AdminSettings | — | `src/App.tsx` |
| 60 | `/admin/messages` | AdminMessages | — | `src/App.tsx` |
| 61 | `/admin/messages/:userId` | ChatPage | — | `src/App.tsx` |
| 62 | `/admin/profile` | AdminProfileSettings | — | `src/App.tsx` |
| 63 | `/admin/help` | AdminHelpCenter | — | `src/App.tsx` |
| 64 | `/admin/login-history` | AdminLoginHistory | — | `src/App.tsx` |
| 65 | `/verify-bill/:billId` | VerifyBill | — | `src/App.tsx` |
| 66 | `/login` | Navigate | — | `src/App.tsx` |
| 67 | `/register` | Navigate | — | `src/App.tsx` |
| 68 | `/admin/*` | NotFound | — | `src/App.tsx` |

### E.2 Entity / Table Catalog

**Tables/schemas found:** 22

#### `bill_orders`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `bill_id` | `string` |
| `id` | `string` |
| `order_id` | `string` |

#### `bills`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `bill_number` | `string` |
| `created_at` | `string` |
| `discount_type` | `string | null` |
| `discount_value` | `number | null` |
| `due_date` | `string | null` |
| `gst_amount` | `number | null` |
| `id` | `string` |
| `pharmacy_id` | `string` |
| `status` | `string` |
| `stockist_id` | `string` |
| `subtotal` | `number` |
| `total_amount` | `number` |

#### `chat_messages`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `content` | `string` |
| `conversation_id` | `string` |
| `created_at` | `string` |
| `id` | `string` |
| `read` | `boolean | null` |
| `sender_id` | `string | null` |
| `sender_type` | `string` |

#### `conversations`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `id` | `string` |
| `updated_at` | `string` |
| `user_id` | `string` |
| `user_role` | `string` |

#### `login_activity`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `device_info` | `string | null` |
| `id` | `string` |
| `ip_address` | `string | null` |
| `location` | `string | null` |
| `status` | `string` |
| `user_id` | `string` |

#### `login_attempts`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `attempted_at` | `string` |
| `email` | `string` |
| `id` | `string` |
| `success` | `boolean` |

#### `messages`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `content` | `string` |
| `created_at` | `string` |
| `id` | `string` |
| `read` | `boolean | null` |
| `receiver_id` | `string` |
| `sender_id` | `string` |

#### `notifications`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `id` | `string` |
| `message` | `string | null` |
| `read` | `boolean | null` |
| `title` | `string` |
| `type` | `string | null` |
| `user_id` | `string` |

#### `order_items`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `id` | `string` |
| `order_id` | `string` |
| `price` | `number | null` |
| `product_id` | `string` |
| `quantity` | `number` |
| `requested_batch` | `string | null` |

#### `order_status_history`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `changed_by` | `string | null` |
| `created_at` | `string` |
| `id` | `string` |
| `new_status` | `string` |
| `notes` | `string | null` |
| `old_status` | `string | null` |
| `order_id` | `string` |
| `order_type` | `string` |

#### `orders`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `applied_credit_note_id` | `string | null` |
| `assigned_staff_id` | `string | null` |
| `created_at` | `string` |
| `credit_discount` | `number | null` |
| `delivered_at` | `string | null` |
| `delivery_collected_amount` | `number | null` |
| `delivery_payment_method` | `string | null` |
| `delivery_payment_status` | `string | null` |
| `delivery_proof_url` | `string | null` |
| `id` | `string` |
| `items_count` | `number` |
| `notes` | `string | null` |
| `order_number` | `string` |
| `order_source` | `string` |
| `parent_order_id` | `string | null` |
| `partial_delivery_items` | `Json | null` |
| `payment_status` | `string` |
| `pharmacy_id` | `string` |
| `status` | `string | null` |
| `stockist_id` | `string` |
| `total_amount` | `number | null` |
| `updated_at` | `string` |

#### `payments`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `amount` | `number` |
| `collected_by` | `string | null` |
| `created_at` | `string` |
| `id` | `string` |
| `notes` | `string | null` |
| `payment_method` | `string` |
| `payment_proof_url` | `string | null` |
| `pharmacy_id` | `string` |
| `reference_id` | `string | null` |
| `staff_id` | `string | null` |
| `status` | `string` |
| `stockist_id` | `string` |

#### `peer_messages`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `content` | `string` |
| `created_at` | `string` |
| `id` | `string` |
| `read` | `boolean` |
| `receiver_id` | `string` |
| `sender_id` | `string` |

#### `pharmacy_profiles`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `account_holder_name` | `string | null` |
| `account_number` | `string | null` |
| `address` | `string | null` |
| `approval_status` | `Database["public"]["Enums"]["approval_status"] | null` |
| `bank_name` | `string | null` |
| `city` | `string | null` |
| `created_at` | `string` |
| `delivery_fee` | `number | null` |
| `drug_license_expiry` | `string | null` |
| `drug_license_url` | `string | null` |
| `email` | `string | null` |
| `free_delivery_above` | `number | null` |
| `gst_certificate_url` | `string | null` |
| `id` | `string` |
| `ifsc_code` | `string | null` |
| `license_number` | `string | null` |
| `min_order_amount` | `number | null` |
| `minimum_order_amount` | `number | null` |
| `operating_hours` | `Json | null` |
| `owner_contact` | `string | null` |
| `owner_designation` | `string | null` |
| `owner_name` | `string | null` |
| `pharmacy_certificate_url` | `string | null` |
| `pharmacy_name` | `string` |
| `pharmacy_type` | `string | null` |
| `phone` | `string | null` |
| `pin_code` | `string | null` |
| `rejection_reason` | `string | null` |
| `state` | `string | null` |
| `updated_at` | `string` |
| `upi_id` | `string | null` |
| `user_id` | `string` |
| `whatsapp_number` | `string | null` |

#### `product_batches`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `batch_number` | `string | null` |
| `created_at` | `string` |
| `expiry_date` | `string | null` |
| `id` | `string` |
| `mrp` | `number | null` |
| `product_id` | `string` |
| `purchase_rate` | `number | null` |
| `sale_price` | `number | null` |
| `stock_quantity` | `number | null` |

#### `product_media`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `id` | `string` |
| `image_url` | `string` |
| `is_primary` | `boolean` |
| `product_id` | `string` |
| `sort_order` | `number` |

#### `products`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `batch_number` | `string | null` |
| `brand` | `string | null` |
| `category` | `string | null` |
| `composition` | `string | null` |
| `created_at` | `string` |
| `description` | `string | null` |
| `drug_schedule` | `string | null` |
| `drug_type` | `string | null` |
| `expiry_date` | `string | null` |
| `fssai_license` | `string | null` |
| `gst_rate` | `string | null` |
| `hsn_code` | `string | null` |
| `id` | `string` |
| `image_url` | `string | null` |
| `in_stock` | `boolean | null` |
| `is_narcotic` | `boolean | null` |
| `manufacturer` | `string | null` |
| `min_order_quantity` | `number | null` |
| `min_stock_level` | `number | null` |
| `moq` | `number | null` |
| `mrp` | `number | null` |
| `name` | `string` |
| `pack_size` | `string | null` |
| `pack_type` | `string | null` |
| `price` | `number | null` |
| `purchase_rate` | `number | null` |
| `requires_prescription` | `boolean | null` |
| `reserved_quantity` | `number | null` |
| `sale_price` | `number | null` |
| `stock_quantity` | `number | null` |
| `stockist_id` | `string` |
| `unit` | `string | null` |
| `updated_at` | `string` |

#### `profiles`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `avatar_url` | `string | null` |
| `created_at` | `string` |
| `data_download_requested_at` | `string | null` |
| `email` | `string | null` |
| `full_name` | `string | null` |
| `id` | `string` |
| `last_active_at` | `string | null` |
| `phone` | `string | null` |
| `tos_accepted_at` | `string | null` |
| `updated_at` | `string` |
| `user_id` | `string` |

#### `serviceable_areas`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `id` | `string` |
| `pin_code` | `string` |
| `stockist_id` | `string` |

#### `stockist_pharmacy_circle`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `credit_balance` | `number` |
| `credit_limit` | `number` |
| `id` | `string` |
| `is_blocked` | `boolean | null` |
| `last_payment_date` | `string | null` |
| `notes` | `string | null` |
| `outstanding` | `number` |
| `payment_terms_days` | `number | null` |
| `pharmacy_id` | `string` |
| `stockist_id` | `string` |

#### `stockist_profiles`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `account_holder_name` | `string | null` |
| `account_number` | `string | null` |
| `address` | `string | null` |
| `approval_status` | `Database["public"]["Enums"]["approval_status"] | null` |
| `bank_name` | `string | null` |
| `business_name` | `string` |
| `business_type` | `string | null` |
| `city` | `string | null` |
| `created_at` | `string` |
| `drug_license_expiry` | `string | null` |
| `drug_license_url` | `string | null` |
| `email` | `string | null` |
| `fssai_license_url` | `string | null` |
| `gst_certificate_url` | `string | null` |
| `id` | `string` |
| `ifsc_code` | `string | null` |
| `pan_number` | `string | null` |
| `phone` | `string | null` |
| `pin_code` | `string | null` |
| `rejection_reason` | `string | null` |
| `state` | `string | null` |
| `updated_at` | `string` |
| `upi_id` | `string | null` |
| `user_id` | `string` |
| `whatsapp_number` | `string | null` |
| `wholesale_license_url` | `string | null` |

#### `user_roles`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `id` | `string` |
| `role` | `Database["public"]["Enums"]["app_role"]` |
| `user_id` | `string` |

### E.3 API / Backend Surface

#### Supabase Edge Functions

| Function | Lines | CORS | Auth | Notes |
|----------|-------|------|------|-------|
| `architecture-ai` | 82 | yes | public | — |
| `autofill-product-details` | 112 | yes | public | — |
| `chat-bot` | 114 | yes | public | — |
| `flowboard-data` | 875 | yes | public | — |
| `parse-order-text` | 118 | yes | public | — |
| `parse-purchase-bill` | 95 | yes | public | — |
| `seed-admin` | 73 | yes | public | — |
| `seed-production-data` | 690 | yes | public | — |

### E.4 Auth, Roles, and Permissions

#### Roles referenced in code

- `admin`
- `alert`
- `approved`
- `auth`
- `customer`
- `doctor`
- `group`
- `link`
- `navigation`
- `pending`
- `pharmacy`
- `presentation`
- `region`
- `rejected`
- `separator`
- `shared`
- `staff`
- `stockist`
- `system`
- `user`

#### RLS policies (migrations)

- `Users can view own profile` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Users can update own profile` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Admins can view all profiles` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `System can insert profiles` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Users can view own roles` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Admins can view all roles` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Admins can manage roles` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `System can insert roles` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Stockists can view own profile` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Stockists can update own profile` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Stockists can insert own profile` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Admins can manage stockist profiles` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Approved stockists visible to pharmacies` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Stockists can manage own areas` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Admins can view areas` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Anyone authenticated can view areas` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Pharmacies can view own profile` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Pharmacies can update own profile` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Pharmacies can insert own profile` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Admins can manage pharmacy profiles` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Approved pharmacies visible to stockists` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Stockists can manage own products` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Authenticated users can view products` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Pharmacies can view own orders` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Stockists can view own orders` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Pharmacies can create orders` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Stockists can update order status` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Admins can view all orders` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Users can view own order items` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Pharmacies can insert order items` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Admins can view all order items` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Pharmacies can manage own inventory` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Admins can view inventory` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Users can view own notifications` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Users can update own notifications` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `System can insert notifications` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Users can view own messages` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Users can send messages` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Admins can view all messages` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Anyone can read platform settings` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Admins can manage platform settings` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Users can upload own documents` → table `storage` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Users can view own documents` → table `storage` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Admins can view all documents` → table `storage` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Users can upload own avatar` → table `storage` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Users can update own avatar` → table `storage` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Avatars publicly accessible` → table `storage` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Admins can manage platform assets` → table `storage` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Platform assets publicly accessible` → table `storage` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Users can insert own profile` → table `public` (`20260223132642_a17c8b1a-f24a-40e3-92f2-068b6d4e2fe9.sql`)
- `Admins can insert notifications` → table `public` (`20260223132642_a17c8b1a-f24a-40e3-92f2-068b6d4e2fe9.sql`)
- `Stockists can manage own product batches` → table `public` (`20260223164931_9c7eaf13-0ac7-43ca-b771-0893f39b3b41.sql`)
- `Authenticated users can view product batches` → table `public` (`20260223164931_9c7eaf13-0ac7-43ca-b771-0893f39b3b41.sql`)
- `Authenticated users can upload product images` → table `storage` (`20260223164931_9c7eaf13-0ac7-43ca-b771-0893f39b3b41.sql`)
- `Authenticated users can update product images` → table `storage` (`20260223164931_9c7eaf13-0ac7-43ca-b771-0893f39b3b41.sql`)
- `Product images publicly accessible` → table `storage` (`20260223164931_9c7eaf13-0ac7-43ca-b771-0893f39b3b41.sql`)
- `Authenticated users can delete product images` → table `storage` (`20260223164931_9c7eaf13-0ac7-43ca-b771-0893f39b3b41.sql`)
- `Users can view own conversations` → table `public` (`20260224034455_c2918a9e-332a-49fe-a510-f537bbb0503c.sql`)
- `Users can create own conversations` → table `public` (`20260224034455_c2918a9e-332a-49fe-a510-f537bbb0503c.sql`)
- `Users can update own conversations` → table `public` (`20260224034455_c2918a9e-332a-49fe-a510-f537bbb0503c.sql`)
- `Admins can view all conversations` → table `public` (`20260224034455_c2918a9e-332a-49fe-a510-f537bbb0503c.sql`)
- `Users can view own chat messages` → table `public` (`20260224034455_c2918a9e-332a-49fe-a510-f537bbb0503c.sql`)
- `Users can insert own chat messages` → table `public` (`20260224034455_c2918a9e-332a-49fe-a510-f537bbb0503c.sql`)
- `Admins can manage all chat messages` → table `public` (`20260224034455_c2918a9e-332a-49fe-a510-f537bbb0503c.sql`)
- `Anyone authenticated can read quick questions` → table `public` (`20260224034455_c2918a9e-332a-49fe-a510-f537bbb0503c.sql`)
- `Admins can manage quick questions` → table `public` (`20260224034455_c2918a9e-332a-49fe-a510-f537bbb0503c.sql`)
- `Admins can manage all chat messages` → table `public` (`20260224050039_9420613a-95bd-4ea5-9cf3-45375e12eba4.sql`)
- `Users can view own chat messages` → table `public` (`20260224050039_9420613a-95bd-4ea5-9cf3-45375e12eba4.sql`)
- `Users can insert own chat messages` → table `public` (`20260224050039_9420613a-95bd-4ea5-9cf3-45375e12eba4.sql`)
- `Admins can manage all conversations` → table `public` (`20260224050039_9420613a-95bd-4ea5-9cf3-45375e12eba4.sql`)
- `Users can view own conversations` → table `public` (`20260224050039_9420613a-95bd-4ea5-9cf3-45375e12eba4.sql`)
- `Users can create own conversations` → table `public` (`20260224050039_9420613a-95bd-4ea5-9cf3-45375e12eba4.sql`)
- `Users can update own conversations` → table `public` (`20260224050039_9420613a-95bd-4ea5-9cf3-45375e12eba4.sql`)
- `Authenticated users can insert notifications` → table `public` (`20260224050039_9420613a-95bd-4ea5-9cf3-45375e12eba4.sql`)
- `Stockists can manage own circle` → table `public` (`20260224065131_56062398-81a9-4071-8236-6decbd0e648c.sql`)
- `Admins can manage all circles` → table `public` (`20260224065131_56062398-81a9-4071-8236-6decbd0e648c.sql`)
- `Pharmacies can view own circle entries` → table `public` (`20260224065131_56062398-81a9-4071-8236-6decbd0e648c.sql`)
- `Stockists can manage own payments` → table `public` (`20260224065131_56062398-81a9-4071-8236-6decbd0e648c.sql`)
- `Admins can manage all payments` → table `public` (`20260224065131_56062398-81a9-4071-8236-6decbd0e648c.sql`)
- `Pharmacies can view own payments` → table `public` (`20260224065131_56062398-81a9-4071-8236-6decbd0e648c.sql`)
- *+132 additional policies*

### E.5 Workflows and State Machines

#### `sender_type`

`admin` → `bot` → `user`

#### `status`

`approved` → `completed` → `pending` → `rejected`

#### `status_values`

`active` → `approved` → `cancelled` → `confirmed` → `delivered` → `dispatched` → `draft` → `inactive` → `paid` → `partial` → `pending` → `rejected` → `unpaid`

#### `target_type`

`doctor` → `pharmacy` → `product`

#### Edge-function status mutations

- `flowboard-data`: `approved`, `cancelled`, `confirmed`, `delivered`, `paid`, `partial`, `pending`, `rejected`, `unpaid`
- `seed-production-data`: `approved`, `cancelled`, `confirmed`, `delivered`, `paid`, `pending`, `unpaid`

### E.6 Dashboards, Reports, and Formulas

**Extracted calculation lines:** 50

#### `src/components/stockist/CollectPaymentDialog.tsx`

- L54: `const totalPendingAmount = useMemo(() =>`
- L55: `pendingOrders.reduce((s, o) => s + (o.total_amount || 0), 0),`
- L67: `const total = pendingOrders`
- L69: `.reduce((s, o) => s + (o.total_amount || 0), 0);`
- L82: `const orderAmt = order.total_amount || 0;`
- L84: `if (amt >= pendingOrders.filter(o => selectedOrders.has(o.id)).reduce((s, o) => s + (o.total_amount || 0), 0)) {`
- L93: `const orderAmt = order.total_amount || 0;`
- L137: `const newOutstanding = Math.max(0, outstanding - amt);`
- L166: `<p className="text-xs text-muted-foreground">Outstanding</p>`
- L167: `<p className="text-lg font-bold text-destructive">₹{outstanding}</p>`
- L206: `<span className="font-medium">₹{alloc.total_amount}</span>`

#### `src/pages/admin/AdminDashboard.tsx`

- L10: `const pendingStockists = DEMO_STOCKISTS.filter(s => s.approval_status === "pending").length;`
- L12: `const totalRevenue = DEMO_ORDERS.reduce((s, o) => s + (o.total_amount || 0), 0);`
- L48: `<p className="text-lg font-bold text-warning">{pendingStockists}</p>`

#### `src/pages/admin/AdminPayments.tsx`

- L42: `const totalB2B = payments.reduce((s: number, p: any) => s + (p.amount || 0), 0);`
- L54: `<p className="text-[10px] text-muted-foreground uppercase">Total Collected</p>`
- L55: `<p className="text-lg font-bold text-accent">₹{totalB2B.toLocaleString()}</p>`

#### `src/pages/pharmacy/PharmacyDashboard.tsx`

- L15: `const totalPurchase = pharmacyOrders.reduce((s, o) => s + (o.total_amount || 0), 0);`
- L27: `<KpiCard label="Total Purchase" value={`₹${totalPurchase.toLocaleString()}`} icon={TrendingUp} color="text-accent" navigateTo="/pharmacy/payments" />`
- L55: `<p className="text-xs text-muted-foreground">{getStockistName(o.stockist_id)} • {o.items_count} items</p>`
- L59: `<p className="text-xs text-muted-foreground mt-0.5">₹{o.total_amount}</p>`

#### `src/pages/pharmacy/PharmacyPayments.tsx`

- L60: `const totalOutstanding = circleStockists.reduce((s: number, c: any) => s + (c.outstanding || 0), 0);`
- L149: `<p className="text-[10px] text-muted-foreground uppercase">Total Outstanding</p>`
- L150: `<p className="text-lg font-bold text-destructive">₹{totalOutstanding.toLocaleString()}</p>`
- L173: `{p.collected_by === "delivery_staff" && <p className="text-[10px] text-primary">Via delivery staff</p>}`
- L203: `<p className="font-semibold">Outstanding: <span className="text-destructive">₹{(selectedCircle as any)?.outstanding || 0}</span></p>`

#### `src/pages/stockist/StockistHome.tsx`

- L16: `const revenue = stockistOrders.filter(o => ["delivered", "completed"].includes(o.status)).reduce((s, o) => s + (o.total_amount || 0), 0);`
- L17: `const outstanding = DEMO_CIRCLE.reduce((s, c) => s + c.outstanding, 0);`
- L19: `const stockValue = stockistProducts.reduce((s, p) => s + (p.stock_quantity * p.price), 0);`
- L154: `<p className="text-xs text-muted-foreground">{getPharmacyName(o.pharmacy_id)} • {o.items_count} items</p>`
- L158: `<p className="text-xs font-medium mt-0.5">₹{o.total_amount}</p>`

#### `src/pages/stockist/StockistPayments.tsx`

- L92: `const totalCollected = thisMonthPayments.reduce((s, p) => s + ((p as any).amount || 0), 0);`
- L93: `const totalOutstanding = circleData.reduce((s, c) => s + (c.outstanding || 0), 0);`
- L96: `const amount = order.delivery_collected_amount || 0;`
- L135: `const pharmaciesWithOutstanding = circleData.filter(c => c.outstanding > 0);`
- L146: `const msg = `Hello ${pharmName},\n\nThis is a payment reminder from ${stockistInfo?.business_name || "your stockist"}.\n\n💰 Outstanding: ₹${circle.outstanding}\`
- L191: `<p className="text-lg font-bold text-accent">₹{totalCollected}</p>`
- L194: `<p className="text-[10px] text-muted-foreground uppercase">Outstanding</p>`
- L195: `<p className="text-lg font-bold text-destructive">₹{totalOutstanding}</p>`
- L218: `<p><span className="text-muted-foreground">A/C:</span> {stockistInfo.account_number}</p>`
- L220: `{stockistInfo.account_holder_name && <p><span className="text-muted-foreground">Holder:</span> {stockistInfo.account_holder_name}</p>}`
- L247: `{p.collected_by === "delivery_staff" && <p className="text-[10px] text-primary">Collected by delivery staff</p>}`
- L281: `<p className="text-sm font-semibold">₹{b.total_amount}</p>`
- L299: `<p className="text-xs text-primary">Collected by: {(o as any).delivery_staff?.name || "Staff"}</p>`
- L302: `<p className="text-sm font-bold">₹{o.delivery_collected_amount}</p>`
- L303: `<p className="text-xs text-muted-foreground capitalize">{o.delivery_payment_method}</p>`
- L325: `{pharmaciesWithOutstanding.length === 0 ? (`
- L326: `<p className="text-sm text-muted-foreground text-center py-4">No pharmacies with outstanding balance</p>`
- L334: `{pharmaciesWithOutstanding.map((c: any) => (`
- L345: `<p>Outstanding: ₹{circleData.find(c => c.pharmacy_id === selectedPharmacy)?.outstanding}</p>`

### E.7 Modals / Dialogs / Sheets Inventory

**Files:** 17

| File | Count | Components |
|------|-------|------------|
| `src/pages/stockist/StockistOrderDetail.tsx` | 14 | (inline) |
| `src/pages/admin/AdminNotifications.tsx` | 8 | (inline) |
| `src/components/stockist/ProductForm.tsx` | 6 | (inline) |
| `src/pages/stockist/StockistCreateOrder.tsx` | 5 | (inline) |
| `src/components/stockist/EditPharmacyDialog.tsx` | 4 | EditPharmacyDialog |
| `src/components/stockist/BulkUploadPurchaseBill.tsx` | 4 | (inline) |
| `src/components/stockist/QuickBillDialog.tsx` | 4 | QuickBillDialog |
| `src/components/stockist/CollectPaymentDialog.tsx` | 4 | CollectPaymentDialog |
| `src/components/stockist/BillPreviewDialog.tsx` | 4 | BillPreviewDialog |
| `src/components/stockist/BulkUploadCatalogue.tsx` | 4 | (inline) |
| `src/pages/pharmacy/PharmacyPayments.tsx` | 4 | (inline) |
| `src/pages/stockist/StockistPharmacyDetail.tsx` | 4 | (inline) |
| `src/pages/stockist/StockistPayments.tsx` | 4 | (inline) |
| `src/pages/stockist/StockistPrivacySecurity.tsx` | 4 | (inline) |
| `src/pages/stockist/StockistProducts.tsx` | 4 | (inline) |
| `src/pages/pharmacy/PharmacyOrderDetail.tsx` | 0 | (inline) |
| `src/pages/stockist/StockistPharmacies.tsx` | 0 | (inline) |

### E.8 Mock, Stub, and Incomplete Behavior

**Files flagged:** 71

| File | Tags | Sample |
|------|------|--------|
| `supabase/functions/flowboard-data/index.ts` | demo | L174: { id: "doc-analytics", title: "Analytics", type: "ui", description: "Consultation trends, |
| `src/App.tsx` | demo | L6: import { DemoAuthProvider } from "@/hooks/useDemoAuth"; |
| `src/integrations/supabase/client.ts` | mock, demo, placeholder, random | L1: // Mock Supabase client that returns dummy data for demo mode |
| `src/components/ui/command.tsx` | placeholder | L47: "flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-mut |
| `src/components/ui/sidebar.tsx` | random | L536: return `${Math.floor(Math.random() * 40) + 50}%`; |
| `src/components/ui/select.tsx` | placeholder | L20: "flex h-10 w-full items-center justify-between rounded-md border border-input bg-backgroun |
| `src/components/ui/textarea.tsx` | placeholder | L11: "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm r |
| `src/components/ui/input.tsx` | placeholder | L11: "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-of |
| `src/components/registration/StockistRegistration.tsx` | placeholder | L175: placeholder={`Enter ${label.toLowerCase()} number`} |
| `src/components/registration/PharmacyRegistration.tsx` | placeholder | L144: <Input placeholder={`Enter ${label.toLowerCase()} number`} value={numberValue} onChange={ |
| `src/components/stockist/EditPharmacyDialog.tsx` | placeholder | L80: <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Internal notes. |
| `src/components/stockist/QuickBillDialog.tsx` | placeholder | L125: <Input type="number" className="h-8 text-xs" value={discountValue} onChange={e => setDisc |
| `src/components/stockist/CollectPaymentDialog.tsx` | placeholder | L175: <Input type="number" value={amount} onChange={e => { setAmount(e.target.value); setManual |
| `src/components/stockist/ProductForm.tsx` | placeholder | L165: placeholder="Search or add brand..." |
| `src/components/stockist/ProductFilters.tsx` | placeholder | L47: <SelectTrigger className="w-[130px] h-8 text-xs text-left justify-start"><SelectValue plac |
| `src/components/shared/MenuPage.tsx` | placeholder | L63: placeholder="Search menu..." |
| `src/hooks/useStockistProfile.ts` | demo | L1: import { DEMO_STOCKIST_PROFILE } from "@/lib/dummy-data"; |
| `src/hooks/useDemoAuth.tsx` | demo | L2: import { DEMO_USERS } from "@/lib/dummy-data"; |
| `src/hooks/useAuth.tsx` | demo | L6: const role = (localStorage.getItem("demo_role") || "pharmacy") as AppRole; |
| `src/hooks/useRealtimeNotifications.ts` | demo | L1: // No-op in demo mode — realtime not needed with static data |
| `src/hooks/usePharmacyProfile.ts` | demo | L1: import { DEMO_PHARMACY_PROFILE } from "@/lib/dummy-data"; |
| `src/lib/dummy-data.ts` | demo | L1: // ======================== DUMMY DATA FOR DEMO MODE ======================== |
| `src/pages/PendingApproval.tsx` | demo | L18: <p className="text-xs text-muted-foreground">(This is a demo screen)</p> |
| `src/pages/Login.tsx` | placeholder | L177: <Input id="email" type="email" placeholder="Enter your email" value={email} onChange={(e) |
| `src/pages/ResetPassword.tsx` | placeholder | L71: <Input id="password" type={showPassword ? "text" : "password"} placeholder="Enter new pass |
| `src/pages/ForgotPassword.tsx` | placeholder | L67: placeholder="Enter your email" |
| `src/pages/DemoHome.tsx` | demo | L3: import { useDemoAuth, DemoRole } from "@/hooks/useDemoAuth"; |
| `src/pages/pharmacy/PharmacySettings.tsx` | incomplete | L12: { code: "hi", label: "Hindi", available: false, comingSoon: "Coming Soon — April 1" }, |
| `src/pages/pharmacy/PharmacyDashboard.tsx` | demo | L8: import { DEMO_ORDERS, DEMO_STOCKISTS, getStockistName } from "@/lib/dummy-data"; |
| `src/pages/pharmacy/PharmacyPayments.tsx` | placeholder | L190: <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select stockist" /></Sele |
| `src/pages/pharmacy/PharmacyPrivacySecurity.tsx` | placeholder | L62: <Input type="password" placeholder="New password (min 6 characters)" value={newPassword} o |
| `src/pages/pharmacy/PharmacyOrders.tsx` | placeholder | L71: <Input placeholder="Search orders..." value={searchQuery} onChange={e => setSearchQuery(e. |
| `src/pages/pharmacy/PharmacyBrowse.tsx` | placeholder | L69: <Input placeholder="Search products or stockists..." value={search} onChange={(e) => setSe |
| `src/pages/pharmacy/PharmacyQuickOrder.tsx` | placeholder | L140: <Textarea value={text} onChange={e => setText(e.target.value)} placeholder="e.g. Dolo 650 |
| `src/pages/pharmacy/PharmacyProfileSettings.tsx` | placeholder | L92: <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger> |
| `src/pages/pharmacy/PharmacyBusinessDetails.tsx` | placeholder | L138: <SelectTrigger className="text-left justify-start"><SelectValue placeholder="State" /></S |
| `src/pages/stockist/StockistAddProduct.tsx` | placeholder | L155: <Input value={form.brand || brandSearch} onChange={e => { setBrandSearch(e.target.value); |
| `src/pages/stockist/StockistSettings.tsx` | incomplete | L12: { code: "hi", label: "Hindi", available: false, comingSoon: "Coming Soon — April 1" }, |
| `src/pages/stockist/StockistPharmacies.tsx` | placeholder | L94: <Input placeholder="Search circle..." value={search} onChange={e => setSearch(e.target.val |
| `src/pages/stockist/StockistHome.tsx` | demo | L8: import { DEMO_PRODUCTS, DEMO_ORDERS, DEMO_CIRCLE, DEMO_MONTHLY_TREND, getPharmacyName } fro |
| `src/pages/stockist/StockistOrders.tsx` | placeholder | L84: <Input placeholder="Search orders..." value={search} onChange={e => setSearch(e.target.val |
| `src/pages/stockist/StockistOrderDetail.tsx` | placeholder | L567: <Input type="number" min={0} max={item.quantity} placeholder="0" className="w-16 h-8 text |
| `src/pages/stockist/StockistCreateOrder.tsx` | placeholder | L207: <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select pharmacy..." /></S |
| `src/pages/stockist/StockistPayments.tsx` | placeholder | L332: <SelectTrigger className="rounded-xl"><SelectValue placeholder="Choose pharmacy" /></Sele |
| `src/pages/stockist/StockistFindPharmacy.tsx` | placeholder | L101: <Input placeholder="Search by name, owner, PIN code..." value={search} onChange={e => set |
| `src/pages/stockist/StockistEditProduct.tsx` | placeholder | L214: <Input value={form.brand || brandSearch} onChange={e => { setBrandSearch(e.target.value); |
| `src/pages/stockist/StockistPrivacySecurity.tsx` | placeholder | L95: <Input type="password" placeholder="New password (min 6 characters)" value={newPassword} o |
| `src/pages/stockist/StockistServiceableAreas.tsx` | placeholder | L56: <Input placeholder="Enter 6-digit PIN code" value={newPin} onChange={e => setNewPin(e.targ |
| `src/pages/stockist/StockistBusinessDetails.tsx` | placeholder | L127: <SelectTrigger><SelectValue placeholder="Select business type" /></SelectTrigger> |
| `src/pages/stockist/StockistHelpCenter.tsx` | placeholder | L250: <Textarea value={feedbackForm.feedback} onChange={e => setFeedbackForm(f => ({ ...f, feed |
| `src/pages/stockist/StockistProducts.tsx` | placeholder | L121: <Input placeholder="Search products..." className="pl-9 h-9 rounded-xl" value={searchQuer |
| `src/pages/stockist/StockistProfileSettings.tsx` | placeholder, incomplete | L92: <Input type={showPw[showKey] ? "text" : "password"} value={value} onChange={e => onChange( |
| `src/pages/admin/AdminBills.tsx` | placeholder | L67: <Input placeholder="Search bills..." className="pl-9 h-9 text-sm rounded-xl" value={search |
| `src/pages/admin/AdminLoginHistory.tsx` | placeholder | L60: <Input className="pl-9 rounded-xl" placeholder="Filter by email..." value={search} onChang |
| `src/pages/admin/AdminHelpCenter.tsx` | demo | L11: { q: "How do I view platform analytics?", a: "Go to More > Platform Analytics for revenue, |
| `src/pages/admin/AdminPayments.tsx` | placeholder | L60: <Input placeholder="Search payments..." className="pl-9 h-9 text-sm rounded-xl" value={sea |
| `src/pages/admin/AdminNotifications.tsx` | placeholder | L142: <Input value={broadcastTitle} onChange={e => setBroadcastTitle(e.target.value)} placehold |
| `src/pages/admin/AdminStockistDetail.tsx` | placeholder | L139: <Input placeholder="Rejection reason (required for rejection)" value={rejectionReason} on |
| `src/pages/admin/AdminMessages.tsx` | placeholder | L80: <Input placeholder="Search users..." value={search} onChange={(e) => setSearch(e.target.va |
| `src/pages/admin/AdminProfileSettings.tsx` | placeholder | L45: <Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Admin nam |
| `src/pages/admin/AdminOrderDetail.tsx` | placeholder | L85: <SelectTrigger className="flex-1 rounded-xl text-xs"><SelectValue placeholder="Change stat |
| `src/pages/admin/AdminPharmacies.tsx` | placeholder | L79: <Input placeholder="Search pharmacies..." value={search} onChange={(e) => setSearch(e.targ |
| `src/pages/admin/AdminPharmacyDetail.tsx` | placeholder | L128: <Input placeholder="Rejection reason (required for rejection)" value={rejectionReason} on |
| `src/pages/admin/AdminUsers.tsx` | placeholder | L103: <Input className="pl-9 rounded-xl" placeholder="Search by name or email..." value={search |
| `src/pages/admin/AdminStockists.tsx` | placeholder | L80: <Input placeholder="Search stockists..." value={search} onChange={(e) => setSearch(e.targe |
| `src/pages/admin/AdminSettings.tsx` | placeholder | L77: <Input type="number" value={platformCommission} onChange={e => setPlatformCommission(e.tar |
| `src/pages/admin/AdminOrders.tsx` | placeholder | L53: <Input placeholder="Search by order #, pharmacy, stockist..." value={search} onChange={(e) |
| `src/pages/admin/AdminDashboard.tsx` | demo | L5: import { DEMO_PHARMACIES, DEMO_STOCKISTS, DEMO_ORDERS, DEMO_MONTHLY_TREND, DEMO_ADMIN_GROWT |
| `src/pages/shared/PeerChatPage.tsx` | placeholder | L115: <Input value={input} onChange={e => setInput(e.target.value)} placeholder="Type a message |
| `src/pages/shared/ChatListPage.tsx` | placeholder | L138: <Input placeholder="Search chats..." value={search} onChange={e => setSearch(e.target.val |
| `src/pages/shared/ChatPage.tsx` | hardcoded, placeholder | L54: // Quick questions table removed in MVP - use hardcoded questions |

### E.9 Dead Code, Orphan Routes, and Broken Links

#### Page files with weak import references

- `ForgotPassword`
- `Index`
- `Login`
- `PendingApproval`
- `Register`
- `ResetPassword`

#### Duplicate filenames




---

## EXPANSION PASS 2 — Deep Trace Additions (2026-07-08)

*Second deep-trace pass over `digiswasthyamvp/` source. Everything below is additive material verified against the code on 2026-07-08; nothing above is modified. Domain scope: Admin / Stockist / Pharmacy only.*

### E2.1 Newly documented routes/pages/screens

Most routes are already documented in Parts C–F and E.1. New page-level UI-structure detail not previously captured:

**`/stockist/export-catalogue` — StockistExportCatalogue (`src/pages/stockist/StockistExportCatalogue.tsx`, 72 lines)**
- Nav source: StockistMore → REPORTS → "Export Catalogue". Back button = `navigate(-1)`.
- UI: header row (ArrowLeft button + "Export Product Catalogue"), single Card with centered FileText icon, caption *"Export your entire product catalogue for backup or sharing."*, a 2-col button grid: outline "CSV" and primary "Excel" (both with Download icon, disabled while `exporting`), and a `Spinner message="Exporting..."` shown during export.
- Exact exported column set (the `select(...)` string, L20): `name, brand, manufacturer, category, composition, price, mrp, sale_price, stock_quantity, batch_number, expiry_date, drug_schedule, drug_type, pack_type, pack_size, hsn_code, gst_rate, in_stock, requires_prescription, min_stock_level` — 20 columns, filtered `eq("stockist_id", profile.id)`. Note `id`, `moq`, `min_order_quantity`, `purchase_rate`, `is_narcotic`, `fssai_license` are deliberately excluded from the export.
- File naming: `catalogue_{YYYY-MM-DD}.csv` (Blob + object-URL anchor click, then `URL.revokeObjectURL`) or `catalogue_{YYYY-MM-DD}.xlsx` (`XLSX.writeFile`); sheet name `"Products"`. CSV is produced via `XLSX.utils.sheet_to_csv` from the same worksheet.
- States: guard `if (!profile?.id) return` (no-op click); error → `toast.error(error.message)`; empty → `toast.error("No products to export")`; success → `toast.success("Exported N products")`.

**`/stockist/bulk-bill` — StockistBulkBill (`src/pages/stockist/StockistBulkBill.tsx`, 138 lines; file comment `// #43: Bulk Bill Generation`)**
- Query key `["unbilledOrders", stockistId]`, `enabled: !!stockistId`. Two-step data fetch: (1) orders `eq status "delivered"` for the stockist (select includes `pharmacy_profiles(pharmacy_name)` join), desc by created_at; (2) **all** `bill_orders.order_id` rows (no stockist filter) → `Set` → client-side exclusion of already-billed orders.
- Empty state card: FileText icon + *"All delivered orders have been billed"* (this is what the demo shows for sp-001, since ord-001 and ord-005 are both linked in `DEMO_BILL_ORDERS`).
- Populated state: counter line "N unbilled delivered orders", ghost toggle button whose label flips between "Select All" and "Deselect All" (exact equality on selected count), order Cards (Checkbox, `#order_number`, "pharmacy • ₹total") with `border-primary/50 bg-primary/5` highlight when selected. Whole card is the click target (`onClick={() => toggle(o.id)}`).
- Generate button appears only when `selected.length > 0`; label `Generate Bills (N orders)`, Zap icon, "Generating..." while busy.
- Bill numbering here is `BILL-{Date.now()}-{billCount}` where `billCount` is the per-pharmacy group index (0,1,2,…), so two bills generated in the same click share the timestamp and differ only in suffix.
- Per bill: `subtotal = Σ order.total_amount`, `total_amount = subtotal` (no discount, no GST), `status:"final"`; then `bill_orders` link rows; then pharmacy `user_id` lookup → notification (see E2.9 catalog). Success path clears selection and invalidates `["unbilledOrders"]`.

**`/stockist/notifications` — StockistNotifications (`src/pages/stockist/StockistNotifications.tsx`, 118 lines) — full structure**
- Header: back button; "Notifications" + "{N} unread" subline (only when unreadCount>0); right-aligned ghost "Mark All Read" button with CheckCheck icon (only when unread exist).
- `typeIcons` map (L14–20): `order→ShoppingCart, payment→IndianRupee, offer→Megaphone, system→Settings, feedback→Bell`; anything else (including the seed `stock`, plus `bill`, `approval`, `price_change`, `broadcast`, `targeted`, `payment_reminder`, `circle_status`, `profile_update` types) falls back to Bell.
- Tabs (full-width TabsList): All / Orders (`type==="order"`) / Payments / System — exact-match filtering, so `stock`/`bill` notifications appear only under "All".
- Unread card styling: `border-primary/30 bg-primary/5`, bold title, primary-tinted icon tile, and a 2×2px primary dot on the right. Read cards: muted icon tile, medium-weight title.
- Row content: title, optional message (`line-clamp-2`), relative timestamp via `formatDistanceToNow(..., { addSuffix: true })`. Click anywhere on the card → `markAsRead(id)` (update `read:true` + invalidate `["notifications"]`).
- Empty state: Card with Bell icon + *"No notifications yet"*. Loading: `Spinner message="Loading notifications..."`.
- (PharmacyNotifications, `src/pages/pharmacy/PharmacyNotifications.tsx`, mirrors this structure; its `typeIcons` uses `order/payment/alert/feedback` as noted in §4.6.)

**`/admin/settings` — AdminSettings (`src/pages/admin/AdminSettings.tsx`, 118 lines) — exact card inventory**
1. **Platform Logo** card: 12×12 preview (uploaded image or muted Image-icon tile) + "Upload" button (label flips to "Uploading..."); accepts `image/*`; uploads to `platform` bucket at `logo-{Date.now()}.{ext}` with `{ upsert:true }`; sets local `logoUrl` from `getPublicUrl` (placeholder.com in demo → broken image); toast "Logo updated". State is component-local only — navigating away loses the logo.
2. **Platform Commission Rate** card (Percent icon): caption *"Commission percentage on transactions"*; number Input placeholder `"e.g. 5"` + Save button. Validation: `!platformCommission || isNaN(Number(...))` → `toast.error("Enter valid %")`; otherwise only `toast.success("Commission rate saved")` — no persistence call of any kind.
3. **GST Rates** card (IndianRupee icon): native `<select>` with exactly 4 options — `medicines` (default) / `equipment` / `consumables` / `otc` — plus a 20-wide number Input placeholder `"%"` and Save. Validation `toast.error("Enter valid rate")`; success `toast.success("GST rate for {category} saved")`.
4. **Payment Methods** card (CreditCard icon): 2-col grid of native checkboxes over local state `{cash:true, upi:true, bank_transfer:true, cheque:true}`, labels via `capitalize` + underscore→space; Save → `toast.success("Payment methods saved")`. No read or write anywhere else in the app consults these flags.

**Help Centers — full FAQ text catalog (new)**
- Stockist (`src/pages/stockist/StockistHelpCenter.tsx` L23–30), 6 FAQ questions verbatim: "How do I add products to my catalogue?", "How do I create an order for a pharmacy?", "How do I collect payments from pharmacies?", "How do I generate bills?", "What are H1 and HNX reports?", "How do I update my business documents?". The H1/HNX answer describes a "Reports section" that is an unrouted More link; the documents answer correctly describes the pending-reset behavior coded in StockistBusinessDetails.
- Stockist video tutorials (L16–21): 4 entries, all `duration:"0:10"`, alternating between `https://www.w3schools.com/html/mov_bbb.mp4` and `.../movie.mp4`; titles "Getting Started with Digi Swasthya", "Managing Your Product Catalogue", "Creating Orders & Bills", "Managing Pharmacy Circle". Tapping a row toggles inline `VideoPlayer` (row icon flips Play→X, tile tint primary→destructive).
- Stockist feedback form Category options (L257–261): Application / Issues / Bugs / Feature Requests / Other. Team options (L270–273): Marketing / Admin / Backend / All Teams. Name/Email/Phone inputs are `readOnly bg-muted/50` prefilled from `authProfile.full_name || sp.business_name`, `user.email`, `sp.phone`. Submit button label "Sending..." while submitting. The whole feedback card expands by clicking anywhere on it (`onClick={() => !showFeedback && setShowFeedback(true)}`), with `stopPropagation` inside the form.
- Pharmacy (`src/pages/pharmacy/PharmacyHelpCenter.tsx` L5–11), 5 FAQs: "How do I place an order?", "How do I find stockists?", "How do I track my order?", "How do I manage inventory?" (answer references an "Inventory tab" that does not exist in this app), "How do returns work?" (answer: "…the stockist can process returns which credit your account" — consistent with §H Returns).
- Admin (`src/pages/admin/AdminHelpCenter.tsx` L6–15), 8 FAQs; four reference features absent from this repo: "Platform Analytics", "Counterfeit Management", "Export Data" (More > Export Data), "System Architecture" (Content/Flow/Screens views — matching the `flowboard-data` edge function's lineage app, not this frontend).

**More menus — complete item inventories (new; §3.15 named the dead routes but not the full menu structure)**
- `StockistMore` (`src/pages/stockist/StockistMore.tsx`): header identity fetched live — `stockist_profiles.select("business_name, business_type, phone").eq("user_id", user.id).single()`; MenuPage subtitle falls back to "Pharmaceutical Stockist" and displayName to "Stockist". 6 sections / 25 items:
  - ACCOUNT (3): Profile Settings ("Personal & contact info") → `/stockist/profile`; Business Details ("Documents, address & bank") → `/stockist/business`; Privacy & Security ("2FA, sessions & account") → `/stockist/privacy-security`.
  - FINANCE (4): Payments & Billing ("View payments and invoices") → `/stockist/payments`; Record Payment ("Manually record a payment") → `/stockist/record-payment` (dead); Analytics ("Business insights & trends") → `/stockist/analytics` (dead); Credit Notes ("View credit notes") → `/stockist/credit-notes` (dead).
  - OPERATIONS (10): Returns & Credit ("Manage item returns") → `/stockist/returns` (dead); Manufacturer Returns → `/stockist/manufacturer-returns` (dead); Expiry Management ("Track expiring stock") → `/stockist/expiry-management` (dead); Expiry Calendar ("Visual batch expiry calendar") → `/stockist/expiry-calendar` (dead); Stock Transfer ("Transfer stock between batches") → `/stockist/stock-transfer` (dead); Batch Management ("View all product batches") → `/stockist/batch-management` (dead); Serviceable Areas ("Manage delivery zones & settings") → live; Staff Management ("Manage delivery persons") → `/stockist/staff` (dead); Delivery Routes ("Plan optimized delivery routes") → `/stockist/delivery-routes` (dead); Holidays ("Set holiday periods") → `/stockist/holidays` (dead).
  - REPORTS (6): Export Data ("Download your data") → `/stockist/export` (dead); Regulatory Reports ("H1, HNX, GST reports") → `/stockist/reports` (dead); Export Catalogue (live); Purchase Bill History ("View all generated bills") → live; Bulk Bill ("Generate bills in bulk") → live; Price History ("Track product price changes") → `/stockist/products` (redirects to the products list; no price history exists).
  - PREFERENCES (3): App Settings ("Theme, language & notifications"); Help Center ("FAQs & tutorials"); Replay Welcome Tour ("View the onboarding guide again") → `/onboarding/stockist` (dead — no onboarding exists in this repo).
  - COMMUNICATION (3): Notifications ("View your alerts & updates"); Peer Chat ("Chat with pharmacies & peers") → `/stockist/chats`; Support Chat ("Chat with our support team") → `/stockist/messages`.
- `PharmacyMore` (`src/pages/pharmacy/PharmacyMore.tsx`): 5 sections / 12 items — ACCOUNT (Profile Settings, Business Details, Privacy & Security), OPERATIONS (Quick Order "WhatsApp text-based ordering" → `/pharmacy/orders/quick`; Browse Catalogue "Browse & order from stockists" → `/pharmacy/browse`; Quick Order History "View past quick orders"), FINANCE (Payments "View payment history"), PREFERENCES (App Settings, Help Center), COMMUNICATION (Notifications, Peer Chat "Chat with stockists & peers", Support Chat). **All 12 pharmacy links are routed** — the pharmacy More menu is the only one with zero dead links. Identity header fetched from `pharmacy_profiles` (name/type/phone), fallbacks "Pharmacy"/"Retail Pharmacy".
- `AdminMore` (`src/pages/admin/AdminMore.tsx`): 6 sections / 11 items — ACCOUNT (Profile "Admin profile & contact info"), USERS (User Management "All users — ban, suspend, restore"), ORDERS & FINANCE (Orders "All B2B orders", Payments "B2B payments", Bills & Invoices "All generated bills"), PLATFORM (Pharmacies "Manage pharmacies", Stockists "Manage stockists", Settings "Platform settings", Login History "View login attempts"), COMMUNICATION (Notifications "System alerts & broadcasts", Messages "View all user conversations"), PREFERENCES (Help Center "FAQs & support"). No live profile fetch — displayName from `profile.full_name || "Admin"`, subtitle hardcoded "Admin Panel", avatarUrl always undefined. All admin links routed.

### E2.2 Component behavior catalog

**`MenuPage` (`src/components/shared/MenuPage.tsx`, 107 lines) — full spec (deeper than §A5)**
- Props: `avatarUrl?, displayName, subtitle?, subline?, sections, searchable = true` (all three More pages leave `searchable` at default true). `MenuItem` supports `customContent?: React.ReactNode` (rendered in place of the ChevronRight) and `logo?: string` (image replaces the icon in the 10×10 tile) — **neither is used by any caller** in this repo.
- Avatar fallback = first character of displayName uppercased on `bg-primary/10 text-primary`.
- Search filters case-insensitively over `item.title` and `item.description`; sections with zero surviving items are removed entirely (so section headings never render empty).
- Logout button: `await signOut()` then `navigate("/login")`; since `useAuth().signOut` performs the demo sign-out (localStorage clear + hard redirect to `/`), the `navigate("/login")` call is effectively racing a full page reload.
- Footer literal: `Digi Swasthya v1.0.0`.

**`ProductFilters` (`src/components/stockist/ProductFilters.tsx`, 144 lines) — exact control spec**
- Fully controlled props (11 value/setter pairs); the component holds only `expiryMode` locally, defaulting `"before"`.
- Brand Select: `"all"` → "All Brands" plus **only the first 30** of the 101 `PHARMA_BRANDS` (`PHARMA_BRANDS.slice(0, 30)`, L29) — 71 brands can never be filtered by.
- Category Select: `"all"` + all 16 `PRODUCT_CATEGORIES`.
- Expiry Popover: two mode buttons "Expiring Before" (clicking it clears `expiryFrom`) and "Date Range"; before-mode shows one date input (writes `expiryTo`, clears `expiryFrom` on change); range-mode shows From/To date inputs. Trigger button variant flips outline→default when a filter is active; label = `Before {to}` or `{from} — {to}`, truncated at 100px; inline X clears both (with `stopPropagation`), and a "Clear Filter" ghost button appears inside the popover when active.
- Sort Select options: `name` / `price` / `expiry` / `newest` (note: the consuming `filtered` memo in `StockistProducts.tsx` sorts only name/price/expiry — selecting "Newest" is a no-op that keeps query order).
- Grid toggle: two icon buttons (Grid2X2 / Grid3X3) setting `gridCols` 2 or 3; the active one uses the `default` variant.

**`ChatPage` (`src/pages/shared/ChatPage.tsx`, 197 lines) — precise mechanics (extends §F)**
- The 3 hardcoded quick questions (L55–59), verbatim: (1) Q "How do I place an order?" → A "Go to Browse, find a stockist, add products to cart, and checkout." (2) Q "How do I track my order?" → A "Go to Orders tab to see all your orders and their current status." (3) Q "How do I make a payment?" → A "Go to Payments tab to view outstanding amounts and record payments."
- Quick-question matching algorithm (L105): lowercase both sides; match if `userText.includes(question.slice(0,20))` OR `question.includes(userText.slice(0,20))` OR exact equality. So typing any 20-char prefix of a quick question (e.g. "how do i place an or") triggers the canned bot answer.
- Bot fallback message verbatim (L114): *"Your question has been forwarded to our support team. They'll respond shortly."*
- Empty-conversation greeting (non-admin only): "👋 Hi! How can we help you?" + "Choose a question or type your own" + up to 6 quick-question chips (`bg-primary/10 text-primary`). Once messages exist, a horizontal scroll strip of up to 4 quick-question pills sits above the input.
- Header text: admin viewing a user → title "Chat with User" / subtitle "Admin view"; otherwise "Support Chat" / "Ask questions or get help".
- Bubble labeling: bot bubbles get a tiny "Bot" caption; admin messages seen by a user get "Admin"; user messages seen by an admin get "User". Alignment: right for the sender's own messages (user-own, or admin-own when isAdmin); left otherwise. Colors: own = `bg-primary`, bot = `bg-secondary`, admin-as-seen-by-user = `bg-accent/10`. Timestamps `toLocaleTimeString` hh:mm.
- Conversation bootstrap: admin view (`adminViewUserId` param) never creates a conversation — if the target user has none, the admin sees an empty thread and `sendMessage` silently returns (`if (!convId) return`). A non-admin with no conversation gets one created on init AND lazily again in `sendMessage` if still missing. Role recorded on the conversation = first non-admin role from `user_roles`, defaulting `"stockist"`.
- Realtime effect (L40–51) subscribes to `postgres_changes INSERT on chat_messages filter conversation_id=eq.{id}` with an id-dedupe append — fully wired but inert under `MockChannel`.
- Layout: page height `h-[calc(100vh-3.5rem-4rem)]` (viewport minus TopNav minus BottomNav); header h-12 sticky; send button disabled when `!input.trim() || sending`; auto-scroll to bottom on every messages change via `bottomRef.scrollIntoView({behavior:"smooth"})`.

**`VideoPlayer` (inline in `StockistHelpCenter.tsx` L39–146) — control inventory**
- Custom overlay on `<video playsInline>`: gradient bottom bar with a 0.1-step progress Slider (seek), play/pause toggle (also fires on video click), mute toggle + 0–1 volume Slider (step 0.05; setting volume 0 flags muted), `m:ss / m:ss` tabular time readout via `formatTime` (guards `!isFinite` → "0:00"), a native `<select>` speed picker 0.5x/1x/1.5x/2x (`playbackRate`), fullscreen toggle (`requestFullscreen`/`exitFullscreen` on the container), and an X close button that collapses the player. Event listeners: `timeupdate`, `loadedmetadata`, `ended` (resets playing state).

**`EditPharmacyDialog` block/unblock notification (`src/components/stockist/EditPharmacyDialog.tsx` L38–47)** — sent only when the blocked flag actually changed (`isBlocked !== (circle?.is_blocked || false)`) and the pharmacy has a `user_id`. Verbatim messages: blocked → *"Your ordering privileges have been temporarily suspended by the stockist."*; unblocked → *"Your ordering privileges have been restored by the stockist."* Type `circle_status`; titles "Account Blocked" / "Account Unblocked". Save success toast is just "Updated".

**Print Packing Slip HTML (`src/pages/stockist/StockistOrderDetail.tsx` L530–541)** — `window.open` then `document.write` of a full standalone HTML doc: `<title>Packing Slip - {order_number}</title>`, inline CSS (sans-serif, 13px body, bordered table, `#f5f5f5` header row), `<h2>Packing Slip</h2>`, meta lines `Order #{n} • {dd MMM yyyy}` and `Pharmacy: {name} • {address}, {city}`, a 3-column table (#, Product, Qty — **no prices on the packing slip**), and footer `Generated {toLocaleString()}` in 11px `#999`. Then `document.close(); print()`. Product name falls back to "—".

### E2.3 Entity & data-model deep detail

- **`app_preferences` shape (localStorage, written by `StockistSettings`/`PharmacySettings`)** — exact default object (`src/pages/stockist/StockistSettings.tsx` L53–58): `{ pushNotifications:true, emailNotifications:false, smsNotifications:false, sound:true, vibration:true, language:"en", emailOrders:true, emailPayments:true, emailOffers:false, emailCompliance:true, smsOrders:true, smsPayments:true, smsOffers:false, smsCompliance:true }`. Per-category checkboxes are keyed `email{Category}`/`sms{Category}` over the 4 `notifCategories` (orders/payments/offers/compliance, L19–24). Same shape in PharmacySettings. No code path ever reads these prefs to gate an actual notification.
- **Language list (both Settings pages, L10–17)**: `en` English (available:true) plus 5 unavailable rows — `hi` Hindi ("Coming Soon — April 1"), `pa` Punjabi, `mr` Marathi, `ta` Tamil, `te` Telugu (all "Coming Soon").
- **Notification `type` → consumer matrix** (complements §J): only `order`, `payment`, `system`, and (pharmacy page) `alert`/`feedback` have icons/tabs anywhere; `bill`, `stock`, `approval`, `broadcast`, `targeted`, `payment_reminder`, `price_change`, `registration`, `circle_status`, `profile_update`, `offer` render with the Bell fallback and are reachable only via the "All" tab. `offer` has an icon in the stockist map but no seed row or writer ever produces it.
- **Bill status full write/read matrix** (consolidates §3.13 with the count made explicit): writers — `BillPreviewDialog` → `"confirmed"`; `StockistBulkBill` → `"final"`. Readers — `StockistPurchaseBillHistory` highlights `"finalized"`; `StockistPayments` Bills tab & `StockistPharmacyDetail` highlight `"confirmed"`; `AdminBills` filter enumerates `draft|finalized`; `VerifyBill` displays whatever string is stored. Seed values: `paid|draft|sent`. Eight distinct status literals exist for one column across the codebase.
- **Conversation lifecycle**: `conversations` rows are created (a) on `ChatPage` init for a non-admin user without one, (b) lazily in `sendMessage`. They are never updated (`updated_at` untouched by app code) and never deleted. Admin can only view/reply to conversations that already exist (`AdminMessages` lists them; ChatPage admin view reads by `user_id` with `maybeSingle`).
- **`chat_messages.sender_type` domain as actually written**: `"user"` (non-admin sender), `"admin"` (admin sender), `"bot"` (canned/AI replies, always `sender_id:null`).
- **Bills field-shape divergence by writer**: BillPreviewDialog persists `discount_type, discount_value, subtotal, total_amount` (no `gst_amount`, no `due_date`); StockistBulkBill persists only `bill_number/stockist_id/pharmacy_id/subtotal/total_amount/status` — bulk bills therefore have `discount_*` and `gst_amount` entirely absent (undefined), not 0.

### E2.4 Workflow traces

**W1. Stockist "Send Reminder" (`src/pages/stockist/StockistPayments.tsx`, `sendReminder` L137–168) — full branch trace**
1. Trigger: header "Remind" button → dialog with a Select over `pharmaciesWithOutstanding = circleData.filter(c => c.outstanding > 0)` (with seed data: HealthPlus ₹4,839, City Care ₹9,990, MedLife ₹3,250 — Apollo excluded at ₹0). Empty branch renders *"No pharmacies with outstanding balance"*.
2. Guard: no selection → `toast.error("Select a pharmacy")`. Missing circle row → silent return.
3. Resolve pharmacy name (fallback "Pharmacy"), phone = `whatsapp_number || phone`, and `user_id` from the joined profile.
4. Notification insert only if `user_id` resolved (see E2.9 table). Code comment: "Log reminder via notification only" — no reminder record table.
5. WhatsApp deep link only if a phone resolved: strip non-digits, prefix `91` unless the number already `startsWith("91")`, open `https://wa.me/{phone}?text={encodeURIComponent(msg)}` in a new tab. Message template verbatim (L146): `Hello {pharmName},\n\nThis is a payment reminder from {business_name || "your stockist"}.\n\n💰 Outstanding: ₹{outstanding}\n\nPayment Details:\n` + (`UPI: {upi_id}\n` if set) + (`Bank: {bank_name}\nA/C: {account_number}\nIFSC: {ifsc_code}\n` if bank set) + `\nPlease clear the dues at the earliest.\n\nThank you!\n— {business_name}`.
6. Completion: `toast.success("Reminder sent")`, dialog closes, selection reset — the toast fires even if neither a notification nor a WhatsApp link was possible.

**W2. Support-chat message lifecycle (non-admin), per `ChatPage.sendMessage` (L86–119)**
Trigger: submit form or tap a quick-question chip → ensure conversation (create if absent; failure → toast "Failed to start chat", abort) → insert user `chat_messages` row (failure → toast "Failed to send message", abort) → clear input → branch:
- quick-question match (20-char prefix rule) → insert bot row with the canned answer → done;
- else invoke `chat-bot`; if `botData.reply` → insert bot row with it → done;
- invoke error / throw → insert bot row with the forwarded-to-support fallback → done.
Under the mock: inserts are echo-only and there is no realtime, so **none of these rows ever appear in the UI** — the thread visually stays at its seed content (2 messages for s-user-001; empty for pharmacy/admin users). Admin branch (`isAdmin`) skips all bot logic — an admin reply is a single insert.

**W3. Admin platform-settings "save" flows (AdminSettings)** — trigger any Save → validation branch (E2.9) → `setSaving(true)` → success toast → `setSaving(false)`. No query, no mutation, no localStorage — the workflow is entirely client-side theater. Logo upload is the sole flow touching the (mock) backend (`storage.from("platform").upload`).

**W4. Bulk bill generation exception paths (`StockistBulkBill.handleBulkGenerate` L40–90)** — guard `!stockistId || selected.length===0` silently returns (button is hidden at 0 anyway). Any bill-insert error `throw`s out of the per-pharmacy loop → `toast.error(err.message)`; bills already created for earlier pharmacies in the same batch are NOT rolled back (no transaction). Selected ids not found in the current list are skipped silently (`if (!order) continue`). Notification insert is fire-and-forget per pharmacy.

**W5. Stockist feedback submission (`StockistHelpCenter.handleSubmitFeedback` L157–177)** — guard: missing feedback or category → `toast.error("Please fill required fields")` (Team optional, recorded as "All"). Fetch all admin `user_roles`; sequential per-admin notification inserts (no 100-chunking, unlike AdminNotifications broadcast); success clears form + collapses card; catch → `toast.error(err.message)`.

### E2.5 Business rules & calculations

- **Bulk-bill subtotal**: `subtotal = Σ (order.total_amount || 0)` per pharmacy group; `total_amount = subtotal` exactly — no rounding call, no discount, no GST (`StockistBulkBill.tsx` L55, L61–62). Displayed with `toLocaleString()` in the pharmacy notification.
- **WhatsApp phone normalization — two inconsistent regimes**: `StockistPayments` (L160–161) uses `replace(/[^0-9]/g,"")` + conditional `91` prefix via `startsWith("91")` (a 10-digit local number that happens to begin "91…" would be wrongly left unprefixed); `PharmacyStockistDetail` L172 (`replace(/\D/g,"")`) and `StockistPharmacyDetail` L198 (`replace(/[^0-9]/g,"")`) do **no** country-code prefixing at all — profile-card WhatsApp buttons open `wa.me/9876543210` while payment reminders open `wa.me/919876543210`.
- **BillPreviewDialog WhatsApp share text** (L171): `TAX INVOICE {billNumber}\nFrom: {business_name}\nTo: {pharmacy_name}\nTotal: ₹{total.toFixed(2)}\nDate: {dd/MM/yyyy}` via `wa.me/?text=` (no recipient number — user picks in WhatsApp).
- **Menu search rule** (MenuPage L35–39): case-insensitive substring over title OR description; empty search returns sections untouched; matching is per-item with empty sections pruned.
- **ChatPage 20-char prefix rule** (E2.2) is the only fuzzy-matching logic in the shipped frontend (the richer ≥2-keyword-overlap matcher lives only in the unreachable `chat-bot` edge function).
- **Video time formatting**: `formatTime = floor(s/60) + ":" + floor(s%60).padStart(2,"0")`, `"0:00"` for non-finite (pre-metadata duration).
- **Export filename date**: `new Date().toISOString().split("T")[0]` — UTC date, so an export at 03:00 IST is stamped with the previous calendar day.
- **StockistProducts sort gap**: ProductFilters offers `newest`, but the sort switch in `StockistProducts.tsx` handles only `name`/`price`/`expiry` — selecting "Newest" leaves the array in query order.

### E2.6 Mock-backend reference

Parts A1/L already cover the mock client exhaustively. Genuinely new operational notes from this pass:

- **`StockistBulkBill`'s two-step read works correctly under the mock** because both queries use only supported operators (`eq`, `order`, plain select + the mapped `orders → pharmacy_profiles` join) — one of the few multi-table client-side "joins" in the app that behaves identically to a real backend (modulo the un-scoped `bill_orders` read, which under real RLS would be row-restricted).
- **`StockistMore`/`PharmacyMore` header fetches** (`.eq("user_id", user.id).single()`) resolve for s-user-001/p-user-001 against seed profiles; given the mock's `.single()`-on-empty behavior (returns `data:null`, no error — §L2), the display-name fallbacks kick in silently for any other user.
- **`ChatPage` role detection** relies on the `user_roles` table read (not the `has_role` RPC); `DEMO_USER_ROLES` covers all three demo users, so `isAdmin` is true only for a-user-001 and non-admin role resolution returns `stockist`/`pharmacy` correctly.
- **AdminSettings logo upload** exercises `MockStorage.upload` with an options object `{ upsert:true }` — accepted and ignored; the mock returns path `demo/{ts}` regardless of the requested `logo-{ts}.{ext}`, but `getPublicUrl` is then called with the *requested* path, yielding `https://placeholder.com/logo-{ts}.{ext}`.

Otherwise: no new findings beyond existing review (§A1, Part L).

### E2.7 Role journeys step-by-step

Parts R1–R8 narrate the principal journeys. New code-verified micro-journeys:

**Stockist — month-end billing sweep (More → REPORTS path)**
1. More → type "bill" in the menu search — matches "Payments & Billing", "Purchase Bill History", "Bulk Bill" (title/description substring, E2.5).
2. Bulk Bill → in the demo, lands on *"All delivered orders have been billed"* (seed linkage §L5). With unbilled delivered orders present: tap cards or "Select All" → `Generate Bills (N orders)` → one bill per pharmacy at status `final`, each pharmacy notified ("New Bill Generated") → success toast → list refetches (and, since inserts don't persist, repopulates identically).
3. Purchase Bill History to review; Export Catalogue → Excel for an offline price list. All back navigation is header-arrow `navigate(-1)`.

**Stockist — chase outstanding dues**
1. Payments → Outstanding tile ₹18,079 → "Remind" → pick one of the 3 pharmacies with dues → Send: pharmacy receives an in-app `payment_reminder` notification AND a WhatsApp tab opens pre-filled with the UPI/bank template (W1).
2. Alternative: Pharmacies → chip "outstanding" → card "Collect Payment" → CollectPaymentDialog FIFO (§H). The two paths differ in artifact: reminder writes only a notification; collection writes a confirmed payment + order payment statuses + circle decrement.

**Pharmacy — get help**
1. More → Help Center → 5-FAQ accordion (single-open) → contact tiles: mailto `help@digiswasthya.in`, tel `9672123711`, Chat → `/pharmacy/messages`.
2. Support Chat: 👋 empty-state greeting + 3 quick-question chips; tapping "How do I place an order?" sends it — under the mock nothing renders back (W2), so the demo journey visibly stalls; the pinned support thread in `/pharmacy/chats` also shows no history (the single seed conversation belongs to the stockist user).

**Admin — platform configuration**
More → Settings → upload logo (broken placeholder preview) → commission 5 → Save ("Commission rate saved") → GST medicines 12 → Save → uncheck cheque → Save. Refresh: every value resets to defaults (W3) — the journey demonstrates UI affordances only.

**Admin — answer a support ticket**
More → Messages → list shows the one seeded conversation (Rajesh Kumar / stockist; last message "You can go to the Products page and click the 'Bulk Upload' button.") → tap → `/admin/messages/s-user-001` → ChatPage admin view (header "Chat with User" / "Admin view") → type reply → send (insert no-op; bubble never appears). No conversation exists for the pharmacy/admin users, so there is nothing else to open.

### E2.8 Hidden/internal functionality

- **Complete localStorage key census** (grep-verified outside `components/ui`): `demo_role` (read ×2 in the two auth hooks, set ×1 via `useDemoAuth.setRole`, removed ×2 on sign-out), `theme` (read ×3 — App bootstrap + both Settings pages; set ×2), `app_preferences` (read ×2 / set ×2 — the two Settings pages). No other app-level keys exist; there is no cart, draft, or session persistence of any kind.
- **Dormant MenuPage extension points**: `MenuItem.customContent` and `MenuItem.logo` have implemented render paths (`src/components/shared/MenuPage.tsx` L80, L86) with zero callers.
- **`ChatPage` admin dead-end**: `sendMessage` early-returns for an admin viewing a user who has no conversation — a silent, toast-less no-op path (L97).
- **Numbered feature-tag comments** (lineage tracker remnants): `// #43: Bulk Bill Generation` (StockistBulkBill L13), `// #42: Notify pharmacy about bill` (L69), `// #39 Notify pharmacy if blocked/unblocked` (EditPharmacyDialog), `// #30 Partial Delivery Dialog` (StockistOrderDetail L553), `#214 Offline Support` (useOfflineDetector).
- **AdminSettings defaults**: all four payment methods hardcoded `true` on mount; combined with the no-op save, the card always renders fully checked after any reload.
- **StockistSettings self-documenting comment** (L31): "Theme state managed manually since next-themes ThemeProvider isn't wrapped" — explicit acknowledgment that the installed `next-themes` dependency is bypassed.
- **Help-copy drift baked into UI strings**: PharmacyHelpCenter references an "Inventory tab"; AdminHelpCenter references Platform Analytics / Counterfeit Management / Export Data / System Architecture — all lineage-app features absent from this repo.

### E2.9 Validation & error-handling catalog

**Complete sonner toast catalog** (grep over `src/pages`, non-ui `src/components`, `src/hooks`; verbatim strings, dynamic parts in `{}`):

*Auth & account (mostly on dead pages — Login/Register/Forgot/Reset):* "Please enter email and password" · "Too many failed attempts. Please try again in 15 minutes." · "Invalid email or password. Please try again." · "Please verify your email before logging in. Check your inbox." · "Your account does not have {role} access. Please select the correct role." · "Your account is pending admin approval." · "Your registration was rejected by admin." · "Login successful!" · "Login failed. Please try again." · "Admin login enabled" (info) · "App installed!" · "Password reset email sent!" · "Failed to send reset email" · "Passwords do not match" · "Password must be at least 6 characters" · "Password updated successfully!" / "Password updated successfully" · "Failed to update password" · "Registration successful! Awaiting approval." (both wizards) · "Registration failed" · "Enter a valid 6-digit PIN code" (StockistRegistration serviceable-PIN list) · "Verification email sent! Check your inbox." (stockist profile "Verify Now" — would actually throw, §L6).

*Profile / password / privacy (live pages):* "Profile updated" · "Passwords don't match" · "Min 8 characters" · "Password changed" · "All sessions logged out" · "Failed to logout all sessions" · "Account deletion requested. Contact support." (PharmacyPrivacySecurity) · "Account deletion request submitted. An admin will process it shortly." (StockistPrivacySecurity, info) · "Business details updated. Pending re-verification." (both roles) · "Document uploaded" · "Failed to upload {file.name}" / "Upload failed".

*Products:* "Product name is required" (Add / Edit / dead ProductForm) · "Product added" · "Product updated" · "Product duplicated" · "Deleted" · "Enter at least 3 characters for product name" · "Auto-fetch failed. Try again." · "Auto-fetch failed" · "{N} fields suggested — review before saving" · "No details found for this product" (info) · "Updated {N} products" (bulk price) · Bulk catalogue: "No valid products found in file" · "Found {N} products" · "Failed to parse file" · "{N} validation error(s)" (with description = first 3 errors joined) · "{N} products uploaded" · Purchase bill: "Failed to upload file" · "Failed to extract products from bill" · "No products could be extracted" · "Extracted {N} products" · "Failed to process bill" · "{created} created, {updated} updated".

*Orders:* "Order placed!" (storefront & quick order) · "Order exceeds credit limit. Outstanding: ₹{out}, Cart: ₹{cart}, Limit: ₹{limit}" · "Paste order text first" · "No items could be parsed" (info, StockistCreateOrder) / "Could not parse items" (PharmacyQuickOrder) · "{N} items parsed" · "Failed to parse" / "Parse failed" · "Select a pharmacy" · "Add items" · "Match at least one product" · "Order {orderNumber} created" · "Order marked as {label}" · "Order cancelled" / "Order cancelled — stock restored" · "Invalid quantities" · "Cannot remove all items. Cancel instead." · "Order updated" · "Select items to return" · "Return processed. ₹{refund} added to credit balance." / "…reduced from outstanding." · "Select items to deliver" · "Partial delivery recorded: {N} items" · "Select items for split order" · "Split order {number} created" · "Order duplicated" · "Enter order items" · "{N} discrepancies reported to stockist" (warning) / "All quantities verified — no discrepancies" · "PDF generation failed".

*Circle & payments:* "Added to your circle" / "Stockist added to your circle" / "Added to circle" · "Already in your circle" (on error code 23505) · "Removed from circle" · "Phone copied" / "Copied" · "Enter a valid amount" (CollectPaymentDialog) · "Payment recorded" · "Select stockist and enter amount" (PharmacyPayments) · "Payment recorded & stockist notified" · "Payment approved" / "Payment rejected" · "Select a pharmacy" / "Reminder sent" · "Updated" (EditPharmacyDialog).

*Bills:* "Select at least one order" (QuickBillDialog) · "Bill generated" · "PDF downloaded" · "Failed to generate PDF" · "{N} bills generated for {M} orders".

*Serviceable areas:* "Enter valid 6-digit PIN" · "PIN already added" · "PIN added" · "Removed".

*Notifications & chat:* "All marked as read" · "Title is required" · "No users found" · "Broadcast sent to {N} users" · "Email and title required" · "User not found with this email" · "Notification sent" · "Failed" · "Failed to initialize chat" · "Failed to start chat" · "Failed to send message" · "Failed to send" (PeerChatPage).

*Admin:* "Please enter a rejection reason" (both detail pages) · "Pharmacy {approved|rejected}" · "Stockist {approved|rejected}" · "{N} stockist(s) {status}" / "{N} pharmacy(ies) {status}" (bulk queue actions) · "Document status updated" · "Status updated to {label}" (order override) · "Customers cannot be suspended via approval status" · "User {suspended|approved}" · "Logo updated" · "Enter valid %" · "Commission rate saved" · "Enter valid rate" · "GST rate for {category} saved" · "Payment methods saved".

*Misc:* "Feedback submitted! Thank you." · "Please fill required fields" · "Exported {N} products" · "No products to export" · "Stock alert notification created" (dead StockAlerts component).

**Native `confirm()` prompt catalog** (verbatim): "Logout from all devices?" and "This action is irreversible. Delete your account?" (`PharmacyPrivacySecurity` L40/L46) · "Remove this pharmacy from your circle?" (`StockistPharmacies` L72, `StockistPharmacyDetail` L107) · "Cancel this order? This cannot be undone." (`StockistOrderDetail` L131) · "Remove {pinCode}?" (`StockistServiceableAreas` L40) · "Update {bulkPriceField} for {N} products?" (`StockistProducts` L214) · "Delete this item?" (`SharedProductDetail` L93).

**Notification-insert catalog** (every app-written `notifications` row; title / message template / type / recipient):

| Writer (file:line) | Title | Message template | Type | Recipient |
|---|---|---|---|---|
| `PharmacyStockistDetail.tsx:118` | New Order from Pharmacy | `{pharmacy_name} placed order #{n} for ₹{total}` | order | stockist user |
| `PharmacyQuickOrder.tsx:121` | New Order from Pharmacy | same template | order | stockist user |
| `StockistCreateOrder.tsx:169` | New Order from Stockist | `Order #{n} with {N} item(s) for ₹{total}` | order | pharmacy user |
| `StockistOrderDetail.tsx:118` | `Order #{n} {StatusLabel}` | `Your order has been updated to: {StatusLabel}` | order | pharmacy user |
| `PharmacyOrderDetail.tsx:71` | `Quantity Discrepancy - #{n}` | `Pharmacy reported: {mismatch list joined "; "}` | order | stockist user |
| `PharmacyPayments.tsx:113` | Payment Received from Pharmacy | `₹{amt} payment recorded by {name} via {method}( (Ref: {id}))` | payment | stockist user |
| `StockistPayments.tsx:152` | Payment Reminder | `₹{out} outstanding from {business_name}` | payment_reminder | pharmacy user |
| `StockistBulkBill.tsx:74` | New Bill Generated | `Bill {n} for ₹{subtotal} has been generated for {N} orders` | bill | pharmacy user |
| `StockistEditProduct.tsx:157` | Product Price Updated | `"{name}" price changed from ₹{old} to ₹{new}` | price_change | circle pharmacy users (0 in practice, §3.4) |
| `StockistBusinessDetails.tsx:53` / `PharmacyBusinessDetails.tsx:59` | Profile Updated | `{name} has updated their {business|pharmacy} profile and needs re-verification.` | profile_update | all admins |
| `AdminPharmacyDetail.tsx:61` / `AdminStockistDetail.tsx:72` | Account Approved / Account Rejected | `Your {pharmacy|stockist} account has been approved.` / `…rejected. Reason: {reason}` | approval | that user |
| `AdminUsers.tsx:66` | Account Suspended / Account Restored | `Your account has been {suspended|restored} by admin.` | system | that user |
| `AdminNotifications.tsx` (broadcast) | user-entered | user-entered | broadcast | all users of target role(s), chunks of 100 |
| `AdminNotifications.tsx:83` (targeted) | user-entered | user-entered or null | targeted | profile matched by email |
| `StockistHelpCenter.tsx:166` | `Feedback: {category}` | `From {name} ({email})\nTeam: {team|All}\n\n{feedback}` | feedback | all admins |
| `EditPharmacyDialog.tsx:42` | Account Blocked / Account Unblocked | verbatim in E2.2 | circle_status | pharmacy user |
| Registration wizards (dead pages) | — | `{name} has registered as a {stockist|pharmacy} and awaits approval` | registration | all admins |
| `StockAlerts.tsx:36` (dead component) | Low Stock Alert | `{N} item(s) are below minimum stock level and need reordering.` | system | self |

**Field-level validation census (live pages)** — no form library is used on shipped pages (zod/react-hook-form exist only in the shadcn `form.tsx` primitive); every check is imperative: product name required (Add/Edit); PIN codes `/^\d{6}$/` + dedupe (ServiceableAreas; registration wizard serviceable list); password ≥8 on profile pages vs ≥6 on privacy pages and ResetPassword — two different minimums coexist; payment amount must be > 0; order-edit quantities: non-negative integers, not all zero; partial-delivery qty clamped `min=0 max=item.quantity` at the input level (`StockistOrderDetail.tsx:567`); split qty `max = quantity − 1`; bulk-price value numeric with `Math.max(0, round(×100)/100)` floor; admin rejection reason required only on the detail pages (queue-page bulk buttons skip it); broadcast title required; targeted email + title required; AdminSettings numeric guards (`isNaN(Number(...))`). Everything else — emails, phones, PAN format, IFSC format, account numbers, GST numbers, expiry dates — is accepted unvalidated on live pages.

---

*End of EXPANSION PASS 2 (2026-07-08). Files read for this pass: `src/pages/stockist/{StockistMore,StockistExportCatalogue,StockistBulkBill,StockistNotifications,StockistHelpCenter,StockistSettings,StockistPayments,StockistOrderDetail}.tsx`, `src/pages/pharmacy/{PharmacyMore,PharmacyHelpCenter}.tsx`, `src/pages/admin/{AdminMore,AdminSettings,AdminHelpCenter}.tsx`, `src/pages/shared/ChatPage.tsx`, `src/components/shared/MenuPage.tsx`, `src/components/stockist/{ProductFilters,EditPharmacyDialog,BillPreviewDialog}.tsx`, plus full-tree greps for toast / confirm / localStorage / notification-insert / wa.me strings.*


# Source: greetings-pal-git

## 5. Smart Order Engine (deep dive) — `/pharmacy/smart-order` (`SmartOrder.tsx`)

**UI flow:**
1. Textarea (8 rows, monospace, placeholder examples) + "Analyse & Get Recommendations".
2. `handleAnalyse`: guards non-empty text + logged-in; resolves pharmacy id; calls **`smart-order-parse {rawText, pharmacyId}`**; reads `parseData.success`, sets `parsedItems`+`sessionId`, toast "Parsed N items". Then calls **`smart-order-recommend {sessionId}`**; reads `recommendData.success`, sets `recommendations`, toast. `401` in either error message → "Session expired. Please login again."
3. **Parsed Items** table (Product Name / Quantity).
4. **Items Found summary:** "itemsFound / totalItemsRequested" + destructive "N not found" badge and a "Items not available" badge list.
5. Three recommendation cards (see below), each with **Add to Cart** that maps that strategy's items into `useCart` and navigates to `/pharmacy/cart`.

**`handleAddToCart(mode)`** maps:
- `single`: `bestSingle.items[]` under `bestSingle.stockistId/stockistName`.
- `split`: flatten `cheapestSplit.stockists[].items[]` (each item carries its own stockistId/Name).
- `fastest`: flatten `fastestDelivery.stockists[].items[]`.
Each mapped item = `{productId, productName, price, stockistId, stockistName, quantity}` → `addToCart(item)`.
**BUG:** these items **omit `stockQuantity`, `moq`, `deliveryDate`**, so `addToCart`'s MOQ/stock validation is **bypassed** on this path, and cart lines will have **no delivery date** (checkout writes `delivery_date=null`). **[matches FEATURES.md]**

### 5.1 `smart-order-parse` (edge fn — AI, tool-calling)
- Validates `{rawText: non-empty string, pharmacyId: string}` (else 500 with message).
- Gemini 2.5 Flash with a forced function tool `parse_medicine_list` → `{items:[{parsed_name, quantity}]}` (handles "x10", "20 tabs", "- 5", typos).
- Uses **service-role** client to insert `smart_order_sessions {pharmacy_id, raw_text, status:'processing'}` then `smart_order_items[]`.
- Returns `{success:true, sessionId, items}`. Errors → 500 `{error}`.
- No 429/402 special-casing here (only a generic "AI parsing failed: <status>").

### 5.2 `smart-order-recommend` (edge fn — pure matching, NO AI)
- Input `{sessionId}` (missing → throw). Service-role client.
- Loads `smart_order_items` for the session; loads **all** active `stockist_products` + `stockists!inner(id,name,city)`; loads active future `stockist_delivery_dates` (asc), building `deliveryMap` = earliest date per stockist.
- **`fuzzyMatch`**: exact → substring (either direction) → any word-overlap (either direction).
- Per requested item, matches products then **filters to `stock_quantity >= requested quantity`** (only available offers kept). Each match carries `price, totalPrice = price*qty, deliveryDate, batch/expiry`.
- Builds `stockistAvailability` map accumulating per-stockist `items`, `totalCost`, `itemsAvailable`, `itemsMissing`, `daysUntilDelivery` (`getDaysUntilDelivery`: null date → **999**, else ceil(days)).
- **Recommendation 1 — Best Single Stockist:** among stockists with `itemsAvailable>0`, sort by **most itemsAvailable, tie-break lowest totalCost**; take `[0]` (or null). UI shows border-highlighted "Recommended", delivery date, items available/missing, item list, missing-items badges, total, Add to Cart.
- **Recommendation 2 — Cheapest Split:** for each item pick the match with **lowest totalPrice** across stockists; group chosen items by stockist (`subtotal`); `savings = bestSingle.totalCost − cheapestSplitTotal` (0 if no bestSingle). UI badge: "Save ₹X" or "Best Price"; per-stockist item breakdown; total; Add to Cart.
- **Recommendation 3 — Fastest Delivery:** for each item pick the match with **fewest daysUntilDelivery**; group by stockist; `earliestDelivery = Math.min(...daysUntilDelivery)`. UI shows per-stockist delivery date + subtotal, "N days" badge, total, Add to Cart. Rendered only if `fastestDelivery.stockists.length > 0`.
- `notFoundItems` = requested items with zero matches. Persists `smart_order_recommendations {session_id, result_json}` (best-effort; logs on failure). Sets session `status='completed'`. Returns `{success:true, recommendations:{bestSingle, cheapestSplit, fastestDelivery, notFoundItems, totalItemsRequested, itemsFound}}`.
- **Edge cases:** if all matched items have null delivery dates, `earliestDelivery=999`; if `fastestDeliveryItems` empty, `Math.min()` = `Infinity` (guarded by UI length check). `itemsMissing` logic pushes an item to *every* stockist that lacks it, so a single-stockist plan lists other requested items as "missing" even if another stockist has them.

---

## 8. AI & Edge Functions (summary table)
All six are `verify_jwt = true` in `config.toml`; all set `Access-Control-Allow-Origin: *`. AI calls hit `https://ai.gateway.lovable.dev/v1/chat/completions` (OpenAI-compatible) with `google/gemini-2.5-flash`; **no fallback model**. `LOVABLE_API_KEY` required.

| Function | AI? | Input | Output | Auth / writes |
|---|---|---|---|---|
| `smart-order-parse` | Yes (tool-call, forced) | `{rawText, pharmacyId}` | `{success, sessionId, items:[{parsed_name, quantity}]}` | JWT (config); **service-role** inserts session+items; no 429/402 handling |
| `smart-order-recommend` | No | `{sessionId}` | `{success, recommendations{…}}` | JWT (config); service-role reads/writes recs, updates session |
| `extract-bill-items` | Yes (vision) | `{imageUrl, mode}` | `{pharmacy_name, items:[{name≤200, quantity≥1, price≥0}]}` | JWT (config); no user check; handles 429/402/400 |
| `fetch-product-info` | Yes | `{product_name}` | flat `{generic_name, brand, manufacturer, category, product_type, pack_size, strength}` (null unknown) | JWT (config); handles 429/402; regex-extracts JSON |
| `product-ai-fetch` | Yes | `{product_name}` (≤200) | **`{ product_info: {generic_name, manufacturer, product_type, category} }`** | JWT (config); **client callers read wrong shape → no-op** (see §3.3/3.4) |
| `bulk-upload-commit` | No | `{stockistId, mode, items}` | `{success, successCount, errorCount, errors[≤10]}` | JWT (config) **+ explicit in-code `getUser`**; service-role writes; **no stockist-ownership check** |

---

## 9. Data Model, RPCs, RLS, Storage

**Tables (from `types.ts` + migrations, project `kefbopoxcturwiqkfgdf`):**
- `user_roles(role app_role, user_id)` — one row/user.
- `stockists(name, drug_license, gst, address_line1/2, city, state, pincode, default_margin_percent[def 20], dispatch_latitude/longitude, dispatch_place_name, kyc_status, user_id)`.
- `pharmacies(name, drug_license, gst, address_line1/2, city, state, pincode, latitude, longitude, google_place_name, user_id)`.
- `stockist_products(product_name, generic_name, brand, manufacturer, category, product_type, pack_size, strength, mrp, purchase_price, sale_price[NOT NULL], stock_quantity, min_stock_alert, moq, gst_percent[def 18], batch_number, expiry_date, description, is_active, stockist_id)`. (No `hsn_code`.)
- `bulk_upload_drafts(mode, items JSON, margin_percent, file_name, stockist_id)` — **dropped then recreated** across migrations.
- `orders(pharmacy_id, stockist_id, total_amount[NOT NULL], delivery_date, delivery_fee, status[CHECK], payment_status[CHECK], payment_reference)`.
- `order_items(order_id, stockist_product_id, product_name_snapshot, price_snapshot, quantity, line_total, gst_percent[def 18], gst_amount)`.
- `payments(order_id, amount, status[CHECK paid|failed], mode[def mock], gateway_order_id, gateway_payment_id)`.
- `smart_order_sessions(pharmacy_id, raw_text, status)`, `smart_order_items(session_id, parsed_name, quantity)`, `smart_order_recommendations(session_id, mode, result_json JSON)`.
- `stockist_delivery_dates(delivery_date, is_active, stockist_id)`, `stockist_delivery_rules(rule_type, priority, min_order_amount, min_profit_amount, free_on_delivery_date, base_distance_km, per_km_charge, flat_fee, is_active, stockist_id)`, `stockist_serviceable_areas(pincode, area_name, is_active, stockist_id)`.

**RPCs / functions:** `has_role(_user_id uuid, _role app_role)` (SECURITY DEFINER, STABLE, `search_path=public`), `user_owns_stockist(_stockist_id text)` (SECURITY DEFINER, used by storage RLS), `deduct_stock(product_id, quantity_to_deduct)` (**declared/called but no migration defines it**), `update_updated_at_column()` trigger fn (on stockists/pharmacies/stockist_products/orders/delivery_rules/bulk_upload_drafts). Enum `app_role = [admin, stockist, pharmacy]`.

**RLS (highlights):** row visibility keyed on `has_role(...)` + ownership. Pharmacies read active products; stockists manage own products; orders visible to owning pharmacy/stockist/admin; `order_items`/`payments` insert allowed to pharmacies for their own orders; "Stockists can update own orders" + "Pharmacies can update own orders" (Mark as Received). Admin blanket "manage" policies exist for every table.

**Storage:** bucket **`bills`** is what the code uses (`${stockistId}/…` + 900s signed URLs). Migration `20251127145203` initially wrote an RLS policy requiring folder == `auth.uid()` (which is the *user id*, NOT the *stockist id* the code uploads under → would reject uploads), then `20251127145259` **corrected** it to `user_owns_stockist((storage.foldername(name))[1])`. A separate legacy **`ocr-bills`** bucket is created (public) then made private in earlier migrations but is **unused by the code**. There is **no explicit `CREATE bucket 'bills'`** in the migrations shown (created out-of-band). Buckets `product-images`/`prescriptions` are not used.

**PWA (`vite.config.ts`):** dev host `::` port **8080**; `registerType:'autoUpdate'`; manifest name "MedOrder - Medicine Marketplace"; Workbox runtime cache: Supabase → NetworkFirst, `supabase-cache`, 50 entries, 24h.

---

## EXPANSION — Code-Derived Additions (Audit Pass)

*Audit date: 2026-07-04. Content derived exclusively from source under `greetings-pal-git/`. Documents implemented behavior only.*

### E.1 Complete Route Table

**Frontend routes extracted:** 27 | **Server API routes:** 0

| # | Path | Component | Role/Gate | Source |
|---|------|-----------|-----------|--------|
| 1 | `/` | Register | — | `src/App.tsx` |
| 2 | `/install` | Install | — | `src/App.tsx` |
| 3 | `/auth/login` | Login | — | `src/App.tsx` |
| 4 | `/auth/register` | Register | — | `src/App.tsx` |
| 5 | `/stockist` | ProtectedRoute | stockist | `src/App.tsx` |
| 6 | `/stockist/products` | ProtectedRoute | stockist | `src/App.tsx` |
| 7 | `/stockist/products/add` | ProtectedRoute | stockist | `src/App.tsx` |
| 8 | `/stockist/products/edit/:id` | ProtectedRoute | stockist | `src/App.tsx` |
| 9 | `/stockist/products/bulk-upload` | ProtectedRoute | stockist | `src/App.tsx` |
| 10 | `/stockist/products/bulk-upload/custom-pricing` | ProtectedRoute | stockist | `src/App.tsx` |
| 11 | `/stockist/delivery-dates` | ProtectedRoute | stockist | `src/App.tsx` |
| 12 | `/stockist/orders` | ProtectedRoute | stockist | `src/App.tsx` |
| 13 | `/stockist/orders/:id` | ProtectedRoute | stockist | `src/App.tsx` |
| 14 | `/stockist/payments` | ProtectedRoute | stockist | `src/App.tsx` |
| 15 | `/stockist/payments/:id` | ProtectedRoute | stockist | `src/App.tsx` |
| 16 | `/stockist/profile` | ProtectedRoute | stockist | `src/App.tsx` |
| 17 | `/pharmacy` | ProtectedRoute | pharmacy | `src/App.tsx` |
| 18 | `/pharmacy/profile` | ProtectedRoute | pharmacy | `src/App.tsx` |
| 19 | `/pharmacy/catalogue` | ProtectedRoute | pharmacy | `src/App.tsx` |
| 20 | `/pharmacy/cart` | ProtectedRoute | pharmacy | `src/App.tsx` |
| 21 | `/pharmacy/checkout` | ProtectedRoute | pharmacy | `src/App.tsx` |
| 22 | `/pharmacy/orders` | ProtectedRoute | pharmacy | `src/App.tsx` |
| 23 | `/pharmacy/orders/:id` | ProtectedRoute | pharmacy | `src/App.tsx` |
| 24 | `/pharmacy/smart-order` | ProtectedRoute | pharmacy | `src/App.tsx` |
| 25 | `/pharmacy/stockists` | ProtectedRoute | pharmacy | `src/App.tsx` |
| 26 | `/pharmacy/stockists/:id` | ProtectedRoute | pharmacy | `src/App.tsx` |
| 27 | `/*` | NotFound | — | `src/App.tsx` |

### E.2 Entity / Table Catalog

**Tables/schemas found:** 14

#### `bulk_upload_drafts`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string | null` |
| `file_name` | `string | null` |
| `id` | `string` |
| `items` | `Json` |
| `margin_percent` | `number | null` |
| `mode` | `string` |
| `stockist_id` | `string` |
| `updated_at` | `string | null` |

#### `order_items`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `gst_amount` | `number | null` |
| `gst_percent` | `number | null` |
| `id` | `string` |
| `line_total` | `number` |
| `order_id` | `string` |
| `price_snapshot` | `number` |
| `product_name_snapshot` | `string` |
| `quantity` | `number` |
| `stockist_product_id` | `string | null` |

#### `orders`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `delivery_date` | `string | null` |
| `delivery_fee` | `number | null` |
| `id` | `string` |
| `payment_reference` | `string | null` |
| `payment_status` | `string | null` |
| `pharmacy_id` | `string` |
| `status` | `string | null` |
| `stockist_id` | `string` |
| `total_amount` | `number` |
| `updated_at` | `string` |

#### `payments`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `amount` | `number` |
| `created_at` | `string` |
| `gateway_order_id` | `string | null` |
| `gateway_payment_id` | `string | null` |
| `id` | `string` |
| `mode` | `string | null` |
| `order_id` | `string` |
| `status` | `string | null` |

#### `pharmacies`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `address_line1` | `string | null` |
| `address_line2` | `string | null` |
| `city` | `string | null` |
| `created_at` | `string` |
| `drug_license` | `string` |
| `google_place_name` | `string | null` |
| `gst` | `string | null` |
| `id` | `string` |
| `latitude` | `number | null` |
| `longitude` | `number | null` |
| `name` | `string` |
| `pincode` | `string | null` |
| `state` | `string | null` |
| `updated_at` | `string` |
| `user_id` | `string` |

#### `smart_order_items`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `id` | `string` |
| `parsed_name` | `string` |
| `quantity` | `number` |
| `session_id` | `string` |

#### `smart_order_recommendations`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `id` | `string` |
| `mode` | `string | null` |
| `result_json` | `Json` |
| `session_id` | `string` |

#### `smart_order_sessions`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `id` | `string` |
| `pharmacy_id` | `string` |
| `raw_text` | `string` |
| `status` | `string | null` |

#### `stockist_delivery_dates`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `delivery_date` | `string` |
| `id` | `string` |
| `is_active` | `boolean | null` |
| `stockist_id` | `string` |

#### `stockist_delivery_rules`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `base_distance_km` | `number | null` |
| `created_at` | `string | null` |
| `flat_fee` | `number | null` |
| `free_on_delivery_date` | `boolean | null` |
| `id` | `string` |
| `is_active` | `boolean | null` |
| `min_order_amount` | `number | null` |
| `min_profit_amount` | `number | null` |
| `per_km_charge` | `number | null` |
| `priority` | `number | null` |
| `rule_type` | `string` |
| `stockist_id` | `string` |
| `updated_at` | `string | null` |

#### `stockist_products`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `batch_number` | `string | null` |
| `brand` | `string | null` |
| `category` | `string | null` |
| `created_at` | `string` |
| `description` | `string | null` |
| `expiry_date` | `string | null` |
| `generic_name` | `string | null` |
| `gst_percent` | `number | null` |
| `id` | `string` |
| `is_active` | `boolean | null` |
| `manufacturer` | `string | null` |
| `min_stock_alert` | `number | null` |
| `moq` | `number | null` |
| `mrp` | `number | null` |
| `pack_size` | `string | null` |
| `product_name` | `string` |
| `product_type` | `string | null` |
| `purchase_price` | `number | null` |
| `sale_price` | `number` |
| `stock_quantity` | `number | null` |
| `stockist_id` | `string` |
| `strength` | `string | null` |
| `updated_at` | `string` |

#### `stockist_serviceable_areas`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `area_name` | `string | null` |
| `created_at` | `string | null` |
| `id` | `string` |
| `is_active` | `boolean | null` |
| `pincode` | `string` |
| `stockist_id` | `string` |

#### `stockists`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `address_line1` | `string | null` |
| `address_line2` | `string | null` |
| `city` | `string | null` |
| `created_at` | `string` |
| `default_margin_percent` | `number | null` |
| `dispatch_latitude` | `number | null` |
| `dispatch_longitude` | `number | null` |
| `dispatch_place_name` | `string | null` |
| `drug_license` | `string` |
| `gst` | `string | null` |
| `id` | `string` |
| `kyc_status` | `string | null` |
| `name` | `string` |
| `pincode` | `string | null` |
| `state` | `string | null` |
| `updated_at` | `string` |
| `user_id` | `string` |

#### `user_roles`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `id` | `string` |
| `role` | `Database["public"]["Enums"]["app_role"]` |
| `user_id` | `string` |

### E.3 API / Backend Surface

#### Supabase Edge Functions

| Function | Lines | CORS | Auth | Notes |
|----------|-------|------|------|-------|
| `bulk-upload-commit` | 206 | yes | auth | — |
| `extract-bill-items` | 155 | yes | public | — |
| `fetch-product-info` | 114 | yes | public | — |
| `product-ai-fetch` | 90 | yes | public | — |
| `smart-order-parse` | 169 | yes | public | — |
| `smart-order-recommend` | 345 | yes | public | — |

### E.4 Auth, Roles, and Permissions

#### Roles referenced in code

- `admin`
- `alert`
- `group`
- `link`
- `navigation`
- `pharmacy`
- `presentation`
- `region`
- `separator`
- `stockist`
- `system`
- `user`

#### RLS policies (migrations)

- `Users can view their own roles` → table `public` (`20251126042135_f41e7e0a-8ba1-4870-b7d1-432e8eaa0a06.sql`)
- `Stockists can view own data` → table `public` (`20251126042135_f41e7e0a-8ba1-4870-b7d1-432e8eaa0a06.sql`)
- `Stockists can update own data` → table `public` (`20251126042135_f41e7e0a-8ba1-4870-b7d1-432e8eaa0a06.sql`)
- `Pharmacies can view all stockists` → table `public` (`20251126042135_f41e7e0a-8ba1-4870-b7d1-432e8eaa0a06.sql`)
- `Admins can manage stockists` → table `public` (`20251126042135_f41e7e0a-8ba1-4870-b7d1-432e8eaa0a06.sql`)
- `Pharmacies can view own data` → table `public` (`20251126042135_f41e7e0a-8ba1-4870-b7d1-432e8eaa0a06.sql`)
- `Pharmacies can update own data` → table `public` (`20251126042135_f41e7e0a-8ba1-4870-b7d1-432e8eaa0a06.sql`)
- `Admins can manage pharmacies` → table `public` (`20251126042135_f41e7e0a-8ba1-4870-b7d1-432e8eaa0a06.sql`)
- `Stockists can manage own products` → table `public` (`20251126042135_f41e7e0a-8ba1-4870-b7d1-432e8eaa0a06.sql`)
- `Pharmacies can view active products` → table `public` (`20251126042135_f41e7e0a-8ba1-4870-b7d1-432e8eaa0a06.sql`)
- `Admins can manage products` → table `public` (`20251126042135_f41e7e0a-8ba1-4870-b7d1-432e8eaa0a06.sql`)
- `Stockists can manage own delivery dates` → table `public` (`20251126042135_f41e7e0a-8ba1-4870-b7d1-432e8eaa0a06.sql`)
- `Pharmacies can view active delivery dates` → table `public` (`20251126042135_f41e7e0a-8ba1-4870-b7d1-432e8eaa0a06.sql`)
- `Admins can manage delivery dates` → table `public` (`20251126042135_f41e7e0a-8ba1-4870-b7d1-432e8eaa0a06.sql`)
- `Pharmacies can view own orders` → table `public` (`20251126042135_f41e7e0a-8ba1-4870-b7d1-432e8eaa0a06.sql`)
- `Pharmacies can create orders` → table `public` (`20251126042135_f41e7e0a-8ba1-4870-b7d1-432e8eaa0a06.sql`)
- `Stockists can view own orders` → table `public` (`20251126042135_f41e7e0a-8ba1-4870-b7d1-432e8eaa0a06.sql`)
- `Stockists can update own orders` → table `public` (`20251126042135_f41e7e0a-8ba1-4870-b7d1-432e8eaa0a06.sql`)
- `Admins can manage orders` → table `public` (`20251126042135_f41e7e0a-8ba1-4870-b7d1-432e8eaa0a06.sql`)
- `Users can view order_items of their orders` → table `public` (`20251126042135_f41e7e0a-8ba1-4870-b7d1-432e8eaa0a06.sql`)
- `Pharmacies can create order_items` → table `public` (`20251126042135_f41e7e0a-8ba1-4870-b7d1-432e8eaa0a06.sql`)
- `Admins can manage order_items` → table `public` (`20251126042135_f41e7e0a-8ba1-4870-b7d1-432e8eaa0a06.sql`)
- `Users can view payments for their orders` → table `public` (`20251126042135_f41e7e0a-8ba1-4870-b7d1-432e8eaa0a06.sql`)
- `Pharmacies can create payments` → table `public` (`20251126042135_f41e7e0a-8ba1-4870-b7d1-432e8eaa0a06.sql`)
- `Admins can manage payments` → table `public` (`20251126042135_f41e7e0a-8ba1-4870-b7d1-432e8eaa0a06.sql`)
- `Pharmacies can manage own sessions` → table `public` (`20251126042135_f41e7e0a-8ba1-4870-b7d1-432e8eaa0a06.sql`)
- `Admins can manage sessions` → table `public` (`20251126042135_f41e7e0a-8ba1-4870-b7d1-432e8eaa0a06.sql`)
- `Users can view items for their sessions` → table `public` (`20251126042135_f41e7e0a-8ba1-4870-b7d1-432e8eaa0a06.sql`)
- `System can manage smart_order_items` → table `public` (`20251126042135_f41e7e0a-8ba1-4870-b7d1-432e8eaa0a06.sql`)
- `Users can view recommendations for their sessions` → table `public` (`20251126042135_f41e7e0a-8ba1-4870-b7d1-432e8eaa0a06.sql`)
- `System can manage recommendations` → table `public` (`20251126042135_f41e7e0a-8ba1-4870-b7d1-432e8eaa0a06.sql`)
- `Users can upload their own OCR bills` → table `storage` (`20251126043440_ab0b1a43-be66-429d-82e2-c93cef0718ff.sql`)
- `OCR bills are publicly accessible` → table `storage` (`20251126043440_ab0b1a43-be66-429d-82e2-c93cef0718ff.sql`)
- `Users can insert their own role` → table `public` (`20251126044809_becc5f08-f20d-4bff-bed7-5f866f5dd60c.sql`)
- `Users can create stockist profile` → table `public` (`20251126044809_becc5f08-f20d-4bff-bed7-5f866f5dd60c.sql`)
- `Users can create pharmacy profile` → table `public` (`20251126044809_becc5f08-f20d-4bff-bed7-5f866f5dd60c.sql`)
- `Pharmacies can update own orders` → table `public` (`20251126044809_becc5f08-f20d-4bff-bed7-5f866f5dd60c.sql`)
- `Stockists can delete own delivery dates` → table `public` (`20251126063046_47d2e307-e271-4129-8a09-5f89f9b68f60.sql`)
- `Stockists can view own OCR bills` → table `storage` (`20251126075848_5d8ffdd9-ae6f-463d-8969-9ec70fbe3ff8.sql`)
- `Stockists can upload own OCR bills` → table `storage` (`20251126075848_5d8ffdd9-ae6f-463d-8969-9ec70fbe3ff8.sql`)
- `Stockists can delete own OCR bills` → table `storage` (`20251126075848_5d8ffdd9-ae6f-463d-8969-9ec70fbe3ff8.sql`)
- `Stockists can upload own bills` → table `storage` (`20251127080902_1e611fa5-a186-4184-9b7f-0d64e9182ab9.sql`)
- `Stockists can view own bills` → table `storage` (`20251127080902_1e611fa5-a186-4184-9b7f-0d64e9182ab9.sql`)
- `Stockists can manage own drafts` → table `bulk_upload_drafts` (`20251127121003_1ee04629-f32a-4f33-a296-2dc3f10d22ba.sql`)
- `Stockists can manage own drafts` → table `public` (`20251127132348_c1f85b73-3ec8-4ced-87b0-6d582a0c6096.sql`)
- `Stockists can upload bills` → table `storage` (`20251127132348_c1f85b73-3ec8-4ced-87b0-6d582a0c6096.sql`)
- `Stockists can read own bills` → table `storage` (`20251127132348_c1f85b73-3ec8-4ced-87b0-6d582a0c6096.sql`)
- `Stockists can manage own serviceable areas` → table `stockist_serviceable_areas` (`20251127141023_17cd4f74-1bd7-4f0d-a669-0efef1df13e8.sql`)
- `Pharmacies can view serviceable areas` → table `stockist_serviceable_areas` (`20251127141023_17cd4f74-1bd7-4f0d-a669-0efef1df13e8.sql`)
- `Stockists can manage own delivery rules` → table `stockist_delivery_rules` (`20251127141023_17cd4f74-1bd7-4f0d-a669-0efef1df13e8.sql`)
- `Pharmacies can view delivery rules` → table `stockist_delivery_rules` (`20251127141023_17cd4f74-1bd7-4f0d-a669-0efef1df13e8.sql`)
- `Stockists can upload to their folder` → table `storage` (`20251127145203_f08e9e42-54d4-4471-9920-2e453b68fb0c.sql`)
- `Stockists can read their folder` → table `storage` (`20251127145203_f08e9e42-54d4-4471-9920-2e453b68fb0c.sql`)
- `Stockists can delete their files` → table `storage` (`20251127145203_f08e9e42-54d4-4471-9920-2e453b68fb0c.sql`)
- `Stockists can upload to their folder` → table `storage` (`20251127145259_dbec45d8-0ef2-4d0b-8a0c-0882d8e94f4f.sql`)
- `Stockists can read their folder` → table `storage` (`20251127145259_dbec45d8-0ef2-4d0b-8a0c-0882d8e94f4f.sql`)
- `Stockists can delete their files` → table `storage` (`20251127145259_dbec45d8-0ef2-4d0b-8a0c-0882d8e94f4f.sql`)

### E.5 Workflows and State Machines

#### `mode`

`catalogue` → `cheapest` → `purchase` → `sale` → `single_stockist`

#### `payment_status`

`failed` → `paid`

#### `rule_type`

`delivery_date` → `distance` → `flat_fee` → `order_amount` → `profit_amount`

#### `status`

`accepted` → `delivered` → `failed` → `out_for_delivery` → `packed` → `paid` → `processing` → `ready`

#### `status_values`

`delivered` → `draft` → `paid` → `pending`

#### Edge-function status mutations


### E.6 Dashboards, Reports, and Formulas

**Extracted calculation lines:** 33

#### `src/pages/pharmacy/PharmacyDashboard.tsx`

- L14: `const { getItemCount } = useCart();`
- L15: `const [stats, setStats] = useState({`
- L26: `const fetchStats = async () => {`
- L39: `const { count: totalOrders } = await supabase`
- L45: `const { count: pendingDeliveries } = await supabase`
- L62: `const monthSpent = orders?.reduce((sum, order) => sum + order.total_amount, 0) || 0;`
- L87: `<CardTitle className="text-sm font-medium">Total Orders</CardTitle>`
- L94: `<p className="text-2xl font-bold">{stats.totalOrders}</p>`
- L109: `<p className="text-2xl font-bold">{stats.pendingDeliveries}</p>`
- L111: `<p className="text-xs text-muted-foreground mt-1">Awaiting delivery</p>`
- L124: `<p className="text-2xl font-bold">₹{stats.monthSpent.toFixed(2)}</p>`
- L137: `<p className="text-2xl font-bold">{getItemCount()}</p>`
- L141: `<Badge className="absolute top-2 right-2">{getItemCount()}</Badge>`

#### `src/pages/stockist/PaymentDetail.tsx`

- L134: `<p className="font-medium">₹{payment.orders.total_amount.toFixed(2)}</p>`

#### `src/pages/stockist/Payments.tsx`

- L26: `const [totalCount, setTotalCount] = useState(0);`
- L55: `const { data, count } = await supabase`
- L171: `disabled={(page + 1) * itemsPerPage >= totalCount}`

#### `src/pages/stockist/StockistDashboard.tsx`

- L12: `const [stats, setStats] = useState({`
- L26: `const fetchStats = async () => {`
- L39: `const { count: totalProducts } = await supabase`
- L44: `const { count: activeProducts } = await supabase`
- L51: `const { count: totalOrders } = await supabase`
- L67: `const monthRevenue = orders?.reduce((sum, order) => sum + order.total_amount, 0) || 0;`
- L119: `<CardTitle className="text-sm font-medium">Total Products</CardTitle>`
- L126: `<p className="text-2xl font-bold">{stats.totalProducts}</p>`
- L128: `<p className="text-xs text-muted-foreground mt-1">{stats.activeProducts} active</p>`
- L134: `<CardTitle className="text-sm font-medium">Total Orders</CardTitle>`
- L141: `<p className="text-2xl font-bold">{stats.totalOrders}</p>`
- L156: `<p className="text-2xl font-bold">₹{stats.monthRevenue.toFixed(2)}</p>`
- L162: `<Link to="/stockist/delivery-dates">`
- L165: `<CardTitle className="text-sm font-medium">Delivery Dates</CardTitle>`
- L170: `<p className="text-xs text-muted-foreground mt-1">Set your delivery calendar</p>`
- L224: `<Link to="/stockist/delivery-dates" className="flex-1"><Button variant="outline" className="w-full">Set Delivery Dates</Button></Link>`

### E.7 Modals / Dialogs / Sheets Inventory

**Files:** 6

| File | Count | Components |
|------|-------|------------|
| `src/components/stockist/ProductTable.tsx` | 9 | (inline) |
| `src/pages/pharmacy/Cart.tsx` | 9 | (inline) |
| `src/pages/stockist/Products.tsx` | 8 | (inline) |
| `src/pages/auth/Login.tsx` | 8 | (inline) |
| `src/components/stockist/MarginSettingsModal.tsx` | 5 | MarginSettingsModal |
| `src/pages/stockist/BulkUpload.tsx` | 0 | (inline) |

### E.8 Mock, Stub, and Incomplete Behavior

**Files flagged:** 26

| File | Tags | Sample |
|------|------|--------|
| `supabase/functions/smart-order-parse/index.ts` | debug | L33: console.log('Parsing smart order text:', rawText.substring(0, 100)); |
| `supabase/functions/extract-bill-items/index.ts` | debug | L53: console.log('Calling Lovable AI for bill extraction...'); |
| `supabase/functions/smart-order-recommend/index.ts` | debug | L41: console.log('Computing recommendations for session:', sessionId); |
| `supabase/functions/bulk-upload-commit/index.ts` | debug | L47: console.log(`Processing ${mode} mode for ${items.length} items`); |
| `src/components/LocationInput.tsx` | mock, placeholder | L26: // For now, use mock coordinates based on major cities |
| `src/components/ui/command.tsx` | placeholder | L47: "flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-mut |
| `src/components/ui/sidebar.tsx` | random | L536: return `${Math.floor(Math.random() * 40) + 50}%`; |
| `src/components/ui/select.tsx` | placeholder | L20: "flex h-10 w-full items-center justify-between rounded-md border border-input bg-backgroun |
| `src/components/ui/textarea.tsx` | placeholder | L11: "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm r |
| `src/components/ui/input.tsx` | placeholder | L11: "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-of |
| `src/components/stockist/MarginSettingsModal.tsx` | placeholder | L65: placeholder="Enter margin %" |
| `src/components/stockist/DeliveryRulesConfig.tsx` | placeholder | L174: placeholder="e.g., 500" |
| `src/components/stockist/ServiceableAreasManager.tsx` | placeholder | L92: placeholder="e.g., 400001" |
| `src/pages/pharmacy/Checkout.tsx` | mock, random, debug | L124: payment_reference: `MOCK-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, |
| `src/pages/pharmacy/Stockists.tsx` | placeholder | L77: placeholder="Search stockists by name or city..." |
| `src/pages/pharmacy/Profile.tsx` | placeholder | L103: placeholder="Enter pharmacy name" |
| `src/pages/pharmacy/StockistCatalogue.tsx` | placeholder | L176: placeholder="Paste medicine names (one per line or comma-separated)" |
| `src/pages/pharmacy/Catalogue.tsx` | placeholder | L212: placeholder={tab === "products" ? "Search products..." : "Search stockists..."} |
| `src/pages/pharmacy/Orders.tsx` | placeholder | L132: placeholder="Search by order ID, stockist name, status, or amount..." |
| `src/pages/pharmacy/SmartOrder.tsx` | placeholder, debug | L194: placeholder="Example:&#10;Paracetamol 500mg x 10&#10;Crocin - 20 tablets&#10;Brufen 15" |
| `src/pages/stockist/EditProduct.tsx` | placeholder | L224: <SelectValue placeholder="Select type" /> |
| `src/pages/stockist/Profile.tsx` | placeholder | L103: placeholder="Enter business name" |
| `src/pages/stockist/AddProduct.tsx` | placeholder | L137: placeholder="Enter product name" |
| `src/pages/stockist/Orders.tsx` | placeholder | L128: placeholder="Search by order ID, pharmacy name, status, or amount..." |
| `src/pages/stockist/Products.tsx` | placeholder | L175: placeholder="Search products..." |
| `src/pages/auth/Login.tsx` | placeholder | L123: placeholder="you@example.com" |

### E.9 Dead Code, Orphan Routes, and Broken Links

#### Duplicate filenames

- `OrderDetail.tsx`: `src/pages/pharmacy/OrderDetail.tsx`, `src/pages/stockist/OrderDetail.tsx`
- `Orders.tsx`: `src/pages/pharmacy/Orders.tsx`, `src/pages/stockist/Orders.tsx`
- `ProductCard.tsx`: `src/components/pharmacy/ProductCard.tsx`, `src/components/stockist/ProductCard.tsx`
- `Profile.tsx`: `src/pages/pharmacy/Profile.tsx`, `src/pages/stockist/Profile.tsx`

### E.10 Page-by-Page Data Operations

#### `src/pages/auth/Login.tsx`

- **Supabase tables:** `user_roles`

#### `src/pages/auth/Register.tsx`

- **Supabase tables:** `pharmacies`, `stockists`, `user_roles`

#### `src/pages/pharmacy/Catalogue.tsx`

- **Supabase tables:** `stockist_delivery_dates`, `stockist_products`, `stockists`

#### `src/pages/pharmacy/Checkout.tsx`

- **Supabase tables:** `order_items`, `orders`, `payments`, `pharmacies`, `stockist_products`
- **Status values used:** `paid`

#### `src/pages/pharmacy/OrderDetail.tsx`

- **Supabase tables:** `order_items`, `orders`
- **Status values used:** `delivered`

#### `src/pages/pharmacy/Orders.tsx`

- **Supabase tables:** `orders`, `pharmacies`

#### `src/pages/pharmacy/PharmacyDashboard.tsx`

- **Supabase tables:** `orders`, `pharmacies`

#### `src/pages/pharmacy/Profile.tsx`

- **Supabase tables:** `pharmacies`

#### `src/pages/pharmacy/SmartOrder.tsx`

- **Supabase tables:** `pharmacies`

#### `src/pages/pharmacy/StockistCatalogue.tsx`

- **Supabase tables:** `pharmacies`, `stockist_delivery_dates`, `stockist_products`, `stockists`

#### `src/pages/pharmacy/Stockists.tsx`

- **Supabase tables:** `stockist_delivery_dates`, `stockist_products`, `stockists`

#### `src/pages/stockist/AddProduct.tsx`

- **Supabase tables:** `stockist_products`

#### `src/pages/stockist/BulkUpload.tsx`

- **Supabase tables:** `bills`, `bulk_upload_drafts`, `stockist_products`, `stockists`
- **Status values used:** `error`, `found`, `new`

#### `src/pages/stockist/DeliveryAndDates.tsx`

- **Supabase tables:** `stockist_delivery_dates`

#### `src/pages/stockist/EditProduct.tsx`

- **Supabase tables:** `stockist_products`

#### `src/pages/stockist/OrderDetail.tsx`

- **Supabase tables:** `order_items`, `orders`

#### `src/pages/stockist/Orders.tsx`

- **Supabase tables:** `orders`, `stockists`

#### `src/pages/stockist/PaymentDetail.tsx`

- **Supabase tables:** `payments`

#### `src/pages/stockist/Payments.tsx`

- **Supabase tables:** `payments`, `stockists`

#### `src/pages/stockist/Products.tsx`

- **Supabase tables:** `bulk_upload_drafts`, `stockist_products`

#### `src/pages/stockist/Profile.tsx`

- **Supabase tables:** `stockists`

#### `src/pages/stockist/StockistDashboard.tsx`

- **Supabase tables:** `orders`, `stockist_products`, `stockists`

### E.11 Edge Function Request/Response Surfaces

#### `bulk-upload-commit`

- File length: 206 lines

#### `extract-bill-items`

- File length: 155 lines

#### `fetch-product-info`

- File length: 114 lines

#### `product-ai-fetch`

- File length: 90 lines

#### `smart-order-parse`

- File length: 169 lines

#### `smart-order-recommend`

- File length: 345 lines

### E.12 Hooks and Context Providers

- **`use-mobile.tsx`**: exports `useIsMobile`
- **`useAuth.tsx`**: exports `useAuth`, `AuthProvider`
- **`useCart.tsx`**: exports `useCart`, `CartProvider`
- **`useDeliveryFee.tsx`**: exports `useDeliveryFee`
- **`usePharmacyId.tsx`**: exports `usePharmacyId`
- **`useStockistId.tsx`**: exports `useStockistId`
- **`use-toast.ts`**: exports `reducer`

### E.13 ProtectedRoute and Role Matrix

```tsx
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from './ui/button';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: ('admin' | 'stockist' | 'pharmacy')[];
}

export const ProtectedRoute = ({ children, allowedRoles }: ProtectedRouteProps) => {
  const { user, userRole, loading } = useAuth();
  const [timeoutError, setTimeoutError] = useState(false);

  useEffect(() => {
    // Set a timeout to show error if loading takes too long
    const timeout = setTimeout(() => {
      if (loading) {
        setTimeoutError(true);
      }
    }, 15000); // 15 seconds

    return () => clearTimeout(timeout);
  }, [loading]);

  if (
```

| Route prefix | `allowedRoles` |
|--------------|----------------|
| `/stockist` | 'stockist' |
| `/stockist/products` | 'stockist' |
| `/stockist/products/add` | 'stockist' |
| `/stockist/products/edit/:id` | 'stockist' |
| `/stockist/products/bulk-upload` | 'stockist' |
| `/stockist/products/bulk-upload/custom-pricing` | 'stockist' |
| `/stockist/delivery-dates` | 'stockist' |
| `/stockist/orders` | 'stockist' |
| `/stockist/orders/:id` | 'stockist' |
| `/stockist/payments` | 'stockist' |
| `/stockist/payments/:id` | 'stockist' |
| `/stockist/profile` | 'stockist' |
| `/pharmacy` | 'pharmacy' |
| `/pharmacy/profile` | 'pharmacy' |
| `/pharmacy/catalogue` | 'pharmacy' |
| `/pharmacy/cart` | 'pharmacy' |
| `/pharmacy/checkout` | 'pharmacy' |
| `/pharmacy/orders` | 'pharmacy' |
| `/pharmacy/orders/:id` | 'pharmacy' |
| `/pharmacy/smart-order` | 'pharmacy' |
| `/pharmacy/stockists` | 'pharmacy' |
| `/pharmacy/stockists/:id` | 'pharmacy' |

### E.14 Cart Hook (`useCart`) Behavior

- `useCart`
- `CartProvider`
- `addToCart`
- `removeFromCart`
- `clearCart`
- `getTotalAmount`
- `getItemCount`
- `getItemsByStockist`

### E.15 SQL Migration Policies (complete list)

**`20251126042135_f41e7e0a-8ba1-4870-b7d1-432e8eaa0a06.sql`**
- `Users can view their own roles` → `public`
- `Stockists can view own data` → `public`
- `Stockists can update own data` → `public`
- `Pharmacies can view all stockists` → `public`
- `Admins can manage stockists` → `public`
- `Pharmacies can view own data` → `public`
- `Pharmacies can update own data` → `public`
- `Admins can manage pharmacies` → `public`
- `Stockists can manage own products` → `public`
- `Pharmacies can view active products` → `public`
- `Admins can manage products` → `public`
- `Stockists can manage own delivery dates` → `public`
- `Pharmacies can view active delivery dates` → `public`
- `Admins can manage delivery dates` → `public`
- `Pharmacies can view own orders` → `public`
- `Pharmacies can create orders` → `public`
- `Stockists can view own orders` → `public`
- `Stockists can update own orders` → `public`
- `Admins can manage orders` → `public`
- `Users can view order_items of their orders` → `public`
- `Pharmacies can create order_items` → `public`
- `Admins can manage order_items` → `public`
- `Users can view payments for their orders` → `public`
- `Pharmacies can create payments` → `public`
- `Admins can manage payments` → `public`
- `Pharmacies can manage own sessions` → `public`
- `Admins can manage sessions` → `public`
- `Users can view items for their sessions` → `public`
- `System can manage smart_order_items` → `public`
- `Users can view recommendations for their sessions` → `public`
- `System can manage recommendations` → `public`

**`20251126043440_ab0b1a43-be66-429d-82e2-c93cef0718ff.sql`**
- `Users can upload their own OCR bills` → `storage`
- `OCR bills are publicly accessible` → `storage`

**`20251126044809_becc5f08-f20d-4bff-bed7-5f866f5dd60c.sql`**
- `Users can insert their own role` → `public`
- `Users can create stockist profile` → `public`
- `Users can create pharmacy profile` → `public`
- `Pharmacies can update own orders` → `public`

**`20251126063046_47d2e307-e271-4129-8a09-5f89f9b68f60.sql`**
- `Stockists can delete own delivery dates` → `public`

**`20251126075848_5d8ffdd9-ae6f-463d-8969-9ec70fbe3ff8.sql`**
- `Stockists can view own OCR bills` → `storage`
- `Stockists can upload own OCR bills` → `storage`
- `Stockists can delete own OCR bills` → `storage`

**`20251127080902_1e611fa5-a186-4184-9b7f-0d64e9182ab9.sql`**
- `Stockists can upload own bills` → `storage`
- `Stockists can view own bills` → `storage`

**`20251127121003_1ee04629-f32a-4f33-a296-2dc3f10d22ba.sql`**
- `Stockists can manage own drafts` → `bulk_upload_drafts`

**`20251127132348_c1f85b73-3ec8-4ced-87b0-6d582a0c6096.sql`**
- `Stockists can manage own drafts` → `public`
- `Stockists can upload bills` → `storage`
- `Stockists can read own bills` → `storage`

**`20251127141023_17cd4f74-1bd7-4f0d-a669-0efef1df13e8.sql`**
- `Stockists can manage own serviceable areas` → `stockist_serviceable_areas`
- `Pharmacies can view serviceable areas` → `stockist_serviceable_areas`
- `Stockists can manage own delivery rules` → `stockist_delivery_rules`
- `Pharmacies can view delivery rules` → `stockist_delivery_rules`

**`20251127145203_f08e9e42-54d4-4471-9920-2e453b68fb0c.sql`**
- `Stockists can upload to their folder` → `storage`
- `Stockists can read their folder` → `storage`
- `Stockists can delete their files` → `storage`

**`20251127145259_dbec45d8-0ef2-4d0b-8a0c-0882d8e94f4f.sql`**
- `Stockists can upload to their folder` → `storage`
- `Stockists can read their folder` → `storage`
- `Stockists can delete their files` → `storage`


---

## EXPANSION PASS 2 — Deep Trace Additions (2026-07-08)

*Deep reverse-engineering pass. All content below is newly derived from source under `/Users/kshipradewat/Desktop/stockpharma/greetings-pal-git/` and documents ONLY material not already present in the review above. Domain restricted to Admin / Stockist / Pharmacy. No evaluation — description of implemented behavior only.*

### E2.1 Newly documented routes/pages/screens (UI-structure and state detail not previously captured)

All 27 routes were already enumerated (§0.2, §E.1). This subsection adds the previously undocumented **screen-level UI composition, exact labels, icons, layout wrappers, and per-state rendering** for pages whose visual structure was only summarized before.

#### E2.1.1 `/pharmacy/smart-order` — full UI composition (`src/pages/pharmacy/SmartOrder.tsx`)
- Page wrapper: `div.min-h-screen.bg-background.p-4.md:p-8` → inner `max-w-6xl mx-auto space-y-6`. The page renders inside `AppLayout` (Header + BottomNav) since the user is logged in.
- **Back control:** ghost `Button` "Back to Home" with `ArrowLeft` icon, wrapped in `<Link to="/pharmacy">` (`SmartOrder.tsx` L174-179).
- **Input card:** `CardTitle` = "Smart Order - AI Powered" with a `Sparkles` icon (L183-186). Field label (plain `<label>`, not shadcn `Label`): "Paste your medicine list (one per line or comma-separated)" (L190-192). Textarea: `rows={8}`, class `font-mono`, placeholder (with `&#10;` newlines): `Example: / Paracetamol 500mg x 10 / Crocin - 20 tablets / Brufen 15` (L194).
- **Primary action button:** full-width, label "Analyse & Get Recommendations" preceded by a `Sparkles` icon; while loading a spinning `Loader2` is prepended; `disabled={loading || !rawText.trim()}` (L202-210) — i.e. the button is disabled both during the AI round-trip **and** whenever the textarea is empty/whitespace.
- **Parsed Items card:** title "Parsed Items (N)" (L217); shadcn `Table` with headers "Product Name" / right-aligned "Quantity"; one `TableRow` per `parsed_name`/`quantity` (L221-236); wrapped in `overflow-x-auto`.
- **Items Found summary card:** left block label "Items Found" over `{itemsFound} / {totalItemsRequested}` in `text-2xl font-bold`; right side a `destructive` Badge "N not found" only when `notFoundItems.length > 0`; below, a section headed "Items not available:" listing each missing name as an `outline` Badge (L245-271).
- **Best Single Stockist card:** `border-2 border-primary` highlight; title row "Best Single Stockist" + default Badge "Recommended"; sub-block shows stockist name, conditional "Delivers: {toLocaleDateString}" line, and "N items available • M missing" line (the "• M missing" fragment only when `itemsMissing.length > 0`) (L275-297). Item list is `max-h-64 overflow-y-auto`; each row: product name, "Qty: N" subtext, right-aligned `₹totalPrice`. If missing items exist, a bordered section "Missing items:" with `outline` badges. Footer "Total / ₹{totalCost}" then full-width Button with `ShoppingCart` icon "Add to Cart" → `handleAddToCart("single")` (L299-334).
- **Cheapest Split card:** title "Cheapest Split" + secondary Badge showing `Save ₹{savings}` when `savings > 0`, else literal "Best Price" (L344-349); subtitle "{n} stockists". Body: per-stockist block (name, items as "{productName} x {qty} — ₹{totalPrice}", then "Subtotal ₹{subtotal}"), `max-h-64` scroll; footer Total = `cheapestSplit.totalAmount`; secondary-variant "Add to Cart" → `handleAddToCart("split")` (L355-387).
- **Fastest Delivery card** (full-width below the 2-col grid; rendered only if `fastestDelivery.stockists.length > 0`): title "Fastest Delivery" + Badge "{earliestDelivery} days"; subtitle "Get items sooner from {n} stockist(s)"; per-stockist rows show "Delivers: {date}" + right `₹subtotal` in a `max-h-48` scroller; footer Total = `fastestDelivery.totalAmount`; outline-variant "Add to Cart" → `handleAddToCart("fastest")` (L393-437).
- **States:** initial (only input card); loading (spinner in button, button disabled); post-parse (Parsed Items card appears before recommendations return — the two edge calls are sequential in `handleAnalyse`, L60-106); success (all cards); error (sonner toast, previously entered results retained). There is no skeleton/empty-state component on this page.
- Success toast after add-to-cart embeds the strategy label: `Added {n} items to cart ({modeLabel})` where modeLabel ∈ "best single stockist" | "cheapest split" | "fastest delivery" (L161-163), then `navigate("/pharmacy/cart")` (L164).

#### E2.1.2 `/pharmacy/cart` — full UI composition (`src/pages/pharmacy/Cart.tsx`)
- **Empty state:** back-link "Back to Catalogue" (ArrowLeft ghost button → `/pharmacy/catalogue`), centered Card `py-12` with text "Your cart is empty" and a "Browse Products" Button linking to `/pharmacy/catalogue` (L28-47).
- **Filled state:** `grid lg:grid-cols-3 gap-6`; left 2 columns = one Card per stockist group; right column = sticky summary (`sticky top-8`).
- Group Card header: stockist name left, and — only when the first item of the group carries a `deliveryDate` — "Delivery: {MMM dd, yyyy}" right (L64-71). Line row: product name + "₹{price} each"; qty `<Input type="number" min="1" class="w-20">`; trash `Button variant=ghost size=icon`; right-aligned line total `₹{price*qty}` in a fixed `w-24` column (L74-110).
- **Order Summary card rows (verbatim):** "Items ({items.length})" ↔ `₹totalAmount`; "Orders will be created" ↔ `itemsByStockist.size`; divider; "Total" ↔ `₹totalAmount` in `text-lg font-bold`; conditional caption "Your order will be split into {n} separate orders" only when >1 group (L124-141).
- "Proceed to Checkout" = full-width `size=lg` Button inside `<Link to="/pharmacy/checkout">` (L143-147). "Clear Cart" = outline `size=sm` full-width button that opens the AlertDialog titled **"Clear Cart?"** with description **"Are you sure you want to remove all items from your cart? This action cannot be undone."**, actions "Cancel" / "Clear Cart" (L148-171).
- Controlled dialog state: `showClearDialog` `useState(false)`; confirm handler runs `clearCart()` then `setShowClearDialog(false)` (L163-166).

#### E2.1.3 `/pharmacy/checkout` — full UI composition (`src/pages/pharmacy/Checkout.tsx` L218-369)
- Empty-cart branch renders the identical "Your cart is empty" card as Cart (L218-231) — reachable by direct URL entry after checkout clears the cart.
- "Back to Cart" ghost button is `disabled={processing}` (L237) — the user cannot navigate back mid-payment via this control.
- **Order Summary card:** one bordered `div.rounded-lg.p-4` per stockist group; header row = stockist name (h4) + conditional "Delivery: {MMM dd, yyyy}"; item rows "{name} × {qty}" ↔ `₹line`; then bordered footer rows "Subtotal", muted "GST", and bold "Total" per group (L244-301). GST per group is computed inline at render time from `productGstMap` (`item.price * item.quantity * gstPercent / 100`, missing → 0) — the display recomputes on every render (L255-259).
- **Payment card:** top row "Total Amount" ↔ grand total recomputed inline over all groups (L309-318). Three mutually exclusive info panels keyed on `paymentSuccess: null | true | false`:
  - `null` → muted panel with `CreditCard` icon, "Mock Payment Mode" / "This is a simulated payment. No real transaction will occur." (L321-327).
  - `true` → green panel "✓ Payment Successful!" / "Your orders are being created. Redirecting to orders page..." (L329-336).
  - `false` → red panel "✗ Payment Failed" / "Please try again." (L338-343).
- Pay button label state machine: `processing` → spinner + "Processing Payment..."; `paymentSuccess === true` → "Payment Successful"; else → "Pay Now"; `disabled={processing || paymentSuccess !== null}` (L345-361) — after either success **or** failure the button stays disabled; retry after failure requires leaving and re-entering the page (state is component-local).
- Footer caption when >1 group: "{n} separate orders will be created after successful payment" (L363-367).

#### E2.1.4 `/install` — exact copy and detection logic (`src/pages/Install.tsx`)
- iOS detection regex: `/iphone|ipad|ipod/` on lowercased UA (L14); installed detection: `matchMedia('(display-mode: standalone)')` (L18); Chromium path: `beforeinstallprompt` handler stores the event, sets `isInstallable` (L23-27); Install button calls `deferredPrompt.prompt()` and reads `userChoice.outcome === 'accepted'` to flip `isInstalled` (L34-46).
- Card title "Install MedOrder App" (Smartphone icon), description "Add MedOrder to your home screen for a better experience".
- Installed panel: green, "✓ App Already Installed" / "MedOrder is installed on your device. You can access it from your home screen." (L62-68).
- iOS panel (blue): "Install on iOS:" steps — 1. "Tap the [Share icon] Share button at the bottom of your browser", 2. "Scroll down and tap [Plus icon] \"Add to Home Screen\"", 3. "Tap \"Add\" in the top right corner" (L80-101).
- Android fallback panel (muted, shown when `!isInstallable && !isIOS`): "Install on Android:" — 1. "Open the browser menu (three dots)", 2. "Tap \"Install app\" or \"Add to Home screen\"", 3. "Follow the prompts to install" (L104-121).
- "Benefits of Installing:" bullet copy: "Quick access from your home screen", "Works offline with cached data", "Faster loading and better performance", "Full-screen experience like a native app" (L124-143).

#### E2.1.5 `/stockist/products/bulk-upload/custom-pricing` — full UI composition (`src/pages/stockist/CustomPricing.tsx`)
- Header: icon back button (`navigate(-1)`), `h1` "Custom Pricing", subtitle "Set individual prices and margins for each product" (L95-102).
- Table (`overflow-x-auto`): columns Product Name | Purchase Rate | Quantity | Sale Rate (Input `step=0.01` `w-24`) | Margin % (Input `step=0.1` `w-20`) | Profit | GST | Net Profit (L110-117). Purchase Rate renders `₹{purchase_price?.toFixed(2) || '0.00'}`; Sale Rate input value is `sale_price?.toFixed(2) || ''` — meaning the input re-formats to 2dp on every keystroke.
- `tfoot` totals row: `colSpan={5}` "Total:" then Profit/GST/Net-Profit totals (L158-165).
- **Profit Summary panel** below the table: three tiles — "Total Gross Profit" (bold), "Total GST" (orange, `text-orange-500`), "Total Net Profit" (primary color) (L170-186).
- Actions right-aligned: outline "Back to Preview" (`navigate(-1)`) and "Save & Continue" → `navigate('/stockist/products/bulk-upload', { state: { items, mode } })` + toast "Custom pricing applied" (L82-87, L189-195).

#### E2.1.6 `/stockist/products/bulk-upload` — verbatim chrome (`src/pages/stockist/BulkUpload.tsx`)
- `h1` "Bulk Upload" (L463); TabsTriggers labelled exactly "Purchase Bill" / "Sale Bill" / "Full Catalogue" (L471-473); file button "Select File" (L497); catalogue-only "Download Template" (L503); parse button toggles "Parse & Preview" ↔ "Processing..." while uploading (L512); preview footer buttons "Save as Draft" and "Confirm Upload {N} Products" where N = items with `status !== 'error'` (L549-552).

#### E2.1.7 `/stockist/delivery-dates` — verbatim chrome (`src/pages/stockist/DeliveryAndDates.tsx`)
- `h1` "Delivery & Dates" (L85). Tab labels: "Delivery Dates" / "Serviceable Areas" / "Delivery Fees" (L94-96). Section headings inside tabs: "Select Delivery Dates" (L103) and "Delivery Fee Configuration" (L152).

#### E2.1.8 Order Detail pages — shared heading structure
Both `src/pages/pharmacy/OrderDetail.tsx` and `src/pages/stockist/OrderDetail.tsx` use `h1` "Order Details" (`text-3xl font-bold`, pharmacy L80 / stockist L89) with three cards titled exactly "Order Information", "Order Status", "Order Items" (pharmacy L88/126/165; stockist L95/127/183).

### E2.2 Component behavior catalog (props, triggers, exact behavior)

Previously the review described components functionally; this catalog adds their **exact prop contracts and interaction mechanics**.

#### `QuantitySelector` (`src/components/pharmacy/QuantitySelector.tsx`)
- Props: `{ moq: number; maxStock: number; onChange: (quantity: number) => void; className?: string }` (L7-12).
- Internal state seeds to `moq || 1` (L15). **The parent's stored quantity is only updated via `onChange`, which fires on +/-/typed change — never on mount.** Consequence: if the user never touches the selector, the parent map has no entry and add-to-cart falls back to its own default (e.g. `quantities[variant.id] || variant.moq` in pharmacy `ProductCard` L104).
- `handleIncrease` only fires when `quantity < maxStock`; `handleDecrease` only when `quantity > moq`; the corresponding buttons are also `disabled` at the bounds (`disabled={quantity <= moq}` L54, `disabled={quantity >= maxStock}` L72).
- Typed input: `parseInt(value) || moq` then double-clamped `Math.min(Math.max(num, moq), maxStock)` (L33-38). Non-numeric input therefore snaps to MOQ, and typing above stock snaps to stock — silently, no toast.
- MOQ Badge "MOQ: {moq}" rendered only when `moq > 1` (L42-45). The number input hides native spinners via `[appearance:textfield]` webkit classes (L62).
- Edge case: if `maxStock < moq` (stock fell below MOQ), initial quantity = moq but `handleInputChange`'s clamp order (`min(max(num, moq), maxStock)`) yields `maxStock` — the input can produce a value below MOQ in that scenario.

#### Pharmacy `ProductCard` (`src/components/pharmacy/ProductCard.tsx`)
- Props: `{ productName, genericName?, brand?, packSize?, strength?, category?, variants: ProductVariant[], onAddToCart(variant, quantity) }`; `ProductVariant = { id, stockistId, stockistName, price, mrp?, stock, moq, batchNumber?, expiryDate?, deliveryDate? }` (L8-30).
- Header: name (`h3`), generic name as muted subtext, then badge row — brand as `secondary` Badge, "Pack: {packSize}", strength, category all as `outline` Badges (L38-48).
- Variant list preceded by "Available from {n} stockist{s}:" with plural "s" appended when >1 (L52-54).
- Per-variant badge row: "Batch: {batchNumber}" (outline), "Exp: {expiryDate}" (outline, raw string — no date formatting), "Delivery: {MMM dd}" (default Badge, `date-fns format`), "Stock: {stock}" (secondary; hidden when stock = 0) (L63-84).
- Price block: `₹price` bold `text-xl`; `mrp` (when present) as strikethrough muted small text below (L86-93).
- Add button: label flips to "Out of Stock" and is `disabled` when `variant.stock === 0` (L103-109). Quantity passed = `quantities[variant.id] || variant.moq` (L104). Per-card `quantities` is a `Record<string, number>` keyed by variant id (L33) — quantities are not shared across cards.

#### Stockist `ProductCard` (`src/components/stockist/ProductCard.tsx`)
- Props: `{ product, onEdit(product), onDelete(id), onToggleActive(id, isActive), onStockUpdate() }` (L11-17).
- Inline stock editor mechanics: clicking the "{n} units" text (`cursor-pointer hover:text-primary`) enters edit mode (L105-110); edit mode renders `Input type=number h-8 w-20` + Save (`Save` icon) + Cancel (`X` icon) buttons, all disabled while `updating` (L74-103). Save runs its **own direct Supabase update** `UPDATE stockist_products SET stock_quantity = stockValue WHERE id = product.id` (L26-29) then toasts "Stock updated" / "Failed to update stock" and calls `onStockUpdate()` (parent refetch). Cancel resets `stockValue` to `product.stock_quantity || 0` (L95-98).
- Grid shows MRP as `₹{mrp?.toFixed(2) || "—"}` (em-dash placeholder, L65) and Sale Price bold in primary color (L69). MOQ tile shows `product.moq || 1` (L115).
- Detail block (Pack/Strength/Batch) renders only when any of `pack_size || strength || batch_number` exists — but `expiry_date` is only shown **inside** that block; a product with expiry but no pack/strength/batch never shows its expiry here (L119-133).
- Edit and Delete are equal-width `flex-1` buttons with `Edit`/`Trash2` icons (L136-155). Delete does **not** confirm inside the card — confirmation is owned by the parent page's AlertDialog (Products.tsx).

#### `StockistCard` (`src/components/pharmacy/StockistCard.tsx`)
- Props: `{ stockist: any; onClick: () => void }` — whole Card is clickable (`cursor-pointer`, `onClick` on the Card, L14). The inner "View Catalogue" outline button has **no own handler**; the click bubbles to the Card's onClick.
- Layout: 12×12 circular `bg-primary/10` avatar with `Building2` icon; name `h3`; conditional city row with `MapPin` icon; "Products" row (Package icon) with `secondary` Badge showing `stockist.productCount || 0`; conditional "Next Delivery" row (Calendar icon) formatted "MMM dd, yyyy" (L16-52). `productCount`/`nextDeliveryDate` are non-schema fields glued on by the fetching page.

#### `MarginSettingsModal` (`src/components/stockist/MarginSettingsModal.tsx`)
- Props: `{ open, onClose, defaultMargin, onApply(margin), stockistId: string | null }` (L10-16).
- Dialog title "Apply Global Margin". Margin input: `type=number step=0.1`, `parseFloat || 0` on change (L59-66). Preview panel "Preview Calculation" shows a fixed ₹100 example: "Purchase Price: ₹100.00", "+ Margin ({m}%): ₹{delta}", "Sale Price: ₹{100×(1+m/100)}" (L46-77).
- Checkbox id `save-default`, label "Save as my default margin" (L80-92). On Apply: if checked AND `stockistId` present → `UPDATE stockists SET default_margin_percent = margin` with toasts "Default margin saved" / "Failed to save default margin"; then always `onApply(margin)` + `onClose()` (L28-44) — i.e. the margin is applied to the preview items even if persisting the default failed. Footer buttons: "Cancel" (outline) / "Apply to All Items" (L95-101).
- Note: `margin` state initializes from `defaultMargin` **once** (`useState(defaultMargin)`, L25); reopening the modal after the default changed does not reseed it (component stays mounted with `open` prop).

#### `BulkUploadPreview` (`src/components/stockist/BulkUploadPreview.tsx`)
- Props: `{ items: PreviewItem[], mode: 'purchase' | 'sale' | 'catalogue' }`; `PreviewItem = { product_name, quantity, purchase_price?, sale_price?, profit?, gst_amount?, net_profit?, status: 'found'|'new'|'error', aiEnhanced?, errorMessage? }` (L3-19).
- Summary tiles (conditional rendering): "Ready to Upload" (always, green); "Errors" (only if `errorCount > 0`, red); "AI Enhanced" (only if `aiEnhancedCount > 0`, blue); "Total Net Profit ₹{Σ net_profit}" (only when `mode === 'purchase'` AND `totalProfit > 0`, primary tint) (L31-54).
- Table: sticky `thead` (`bg-muted sticky top-0`) in a `max-h-[500px]` scroll container (L57-59). In `sale` mode the Purchase Price / Sale Price / Profit columns are omitted entirely (L63-69, L88-100). Money cells render `₹{value?.toFixed(2) || '-'}` (Profit column falls back to `'0.00'`).
- Status badges (verbatim): "✓ Found" (green-tinted secondary), "+ New" (blue-tinted secondary), "✗ Error" (destructive) (L102-116). `errorMessage` renders as red `text-xs` under the product name (L83-85).

#### `DraftCard` (`src/components/stockist/DraftCard.tsx`)
- Props: `{ draft: { id, mode, items, file_name?, created_at }, onResume(id), onDelete(id) }` (L7-17).
- Title = `file_name || 'Untitled Draft'` with `FileText` icon (L27-28). Mode Badge mapping: `purchase`→"Purchase Bill", `sale`→"Sale Bill", anything else→"Full Catalogue" (L32-35). Item-count Badge "{n} items" where n = `Array.isArray(items) ? items.length : 0` (L20, L36). Timestamp "Saved {MMM d, yyyy h:mm a}" (L39-41). Buttons: "Resume" (default sm) and a ghost trash icon styled `text-destructive` (L44-56). No delete confirmation dialog at this level.

#### `DeliveryRulesConfig` (`src/components/stockist/DeliveryRulesConfig.tsx`) — exact copy & load/save mechanics
- Rule-card descriptions (verbatim): "Make delivery free if your profit on the order exceeds a certain amount"; "Make delivery free if order total exceeds a certain amount"; "Make delivery free when orders are placed for your scheduled delivery dates"; "Charge per kilometer after a base distance"; "Fixed delivery charge for all orders (fallback option)" (L166-280). Input placeholders: "e.g., 500" (min profit), "e.g., 5000" (min order), "e.g., 5" (base km), "e.g., 10" (per-km ₹), "e.g., 50" (flat fee); all inputs `type=number min=0`.
- Load: fetches active rules and hydrates toggles+values via a `switch(rule.rule_type)` (L36-69); the delivery_date case sets the checkbox from `rule.free_on_delivery_date || false`.
- Save preconditions per rule (a checked rule with an **empty value input is silently dropped**): profit needs `minProfit` non-empty; order-amount needs `minOrderAmount`; distance needs **both** `perKmCharge` and `baseDistance`; flat needs `flatFee`; delivery-date has no value so the checkbox alone persists it (L84-137). The delete-then-insert is unconditional — unchecking everything and saving clears all rules with toast "All delivery rules cleared" (L74-149).
- Save button: `size=lg`, `Save` icon, label "Save Delivery Rules", disabled while `loading` (L297-300). Footer explainer (verbatim): "**Priority:** Rules are applied in order: Profit → Order Amount → Delivery Date → Distance → Flat Fee. First matching rule wins." (L302-305).

#### `ServiceableAreasManager` (`src/components/stockist/ServiceableAreasManager.tsx`) — exact behavior
- Card heading "Add Serviceable Pincode"; labels "Pincode *" (input `maxLength={6}`, placeholder "e.g., 400001") and "Area Name (Optional)" (placeholder "e.g., Andheri West") (L86-106). "Add Area" button with `Plus` icon, disabled while `loading` (L108-111).
- Add validation: only `!newPincode.trim()` → toast "Please enter a pincode" (L41-44). No numeric or length-6 validation beyond the HTML maxLength; values are `.trim()`ed before insert (L49-50).
- List heading "Serviceable Areas ({count})"; empty-state copy "No serviceable areas added yet. Add pincodes to start accepting orders." (L115-119). Badge text = `pincode` + optional ` - {area_name}`; embedded `<button>` with `X` icon soft-deletes (`is_active=false`) with toasts "Area removed" / "Failed to remove area" (L122-133). List order: `created_at` desc (L31).
- Areas are refetched (not optimistically updated) after both add and remove (`fetchAreas()` L64, L79).

#### `LocationInput` (`src/components/LocationInput.tsx`) — full contract of the dormant component
- Props: `{ value, onChange(placeName, lat, lon), label, placeholder = 'Enter location name', required = false }` (L6-12). Renders a labelled input with an absolutely-positioned `MapPin` icon and, once coordinates resolve, a caption "Coordinates: {lat}, {lon}" to 4dp (L52-55).
- `getMockCoordinates` matches by **substring containment** of the lowercased input against 10 city keys (mumbai, delhi, bangalore, hyderabad, chennai, kolkata, pune, ahmedabad, jaipur, lucknow) and **always returns Delhi (28.7041, 77.1025) as fallback** — the function can never return null in practice despite its `| null` signature (L63-86). `onChange` fires on every keystroke that resolves coordinates, i.e. effectively every keystroke.

#### `Header` (`src/components/layout/Header.tsx`) — exact composition
- `header.border-b.bg-card.sticky.top-0.z-50`; container row: brand `Link` "MediConnect" (`text-xl font-bold`) → `/stockist` or `/pharmacy` by role ternary (L23); right side `DropdownMenu` triggered by a ghost icon Button with `User` icon (L28-31). Menu items: "My Profile" with `UserCircle` icon → `profilePath` (role ternary, L18), separator, "Logout" with `LogOut` icon styled `text-destructive` calling `signOut` directly (L34-44). `Settings` icon is imported but unused (L11) — dead import.

#### `BottomNav` (`src/components/layout/BottomNav.tsx`) — exact tab/icon mapping
- Visibility: returns `null` only when `!user`; explicitly **shows during auth loading** (comment L9, guard L10). Fixed bar `h-16`, `md:hidden`, `z-50`.
- Stockist tabs (icon → label → path): Home→`/stockist`, Package→"Products", FileText→"Orders", TrendingUp→"Payments", User→"Profile" (L12-18). Pharmacy tabs: Home, Building2→"Stockists", Package→"Products" (`/pharmacy/catalogue`), FileText→"Orders", ShoppingCart→"Cart", User→"Profile" (L20-27). Non-stockist roles (pharmacy, admin, or still-null role) all get the pharmacy tab set (`userRole === 'stockist' ? stockistNav : pharmacyNav`, L29).
- Active styling: exact-path equality → `text-primary`; otherwise `text-muted-foreground hover:text-foreground` (L35-44). Detail pages (e.g. `/pharmacy/orders/123`) therefore highlight **no** tab.
- **The pharmacy Cart tab shows no badge/count** — cart quantity is surfaced only on the Dashboard cart card and the Catalogue sub-header, not in bottom navigation.

#### Toast infrastructure duality (`src/hooks/use-toast.ts`, `src/components/ui/sonner.tsx`, `src/App.tsx`)
- The shadcn/Radix toast store (`use-toast.ts`) is mounted via `<Toaster/>` but **no app code calls its `toast()`** — every page imports `toast` from `sonner`. The Radix store's constants: `TOAST_LIMIT = 1` (only one toast retained) and `TOAST_REMOVE_DELAY = 1000000` ms ≈ 16.7 min before a dismissed toast is purged from state (L5-6). Its `genId` wraps a module-level counter modulo `Number.MAX_SAFE_INTEGER` (L22-27); state is a module-singleton `memoryState` with a listener array (L124-133) — not React context.
- Practical consequence: all user-visible notifications in the app are sonner toasts (bottom-right, themed via `next-themes` wrapper in `ui/sonner.tsx`); the Radix `Toaster` renders an empty viewport permanently.

#### `useIsMobile` (`src/hooks/use-mobile.tsx`)
- Breakpoint constant **768px**; uses `matchMedia('(max-width: 767px)')` change events plus an initial `window.innerWidth` read; returns `!!isMobile` (initially `false` because state starts `undefined`) (L3-19). Consumed only by shadcn `ui/sidebar.tsx` (which no page renders) — the app's responsive behavior is pure Tailwind `md:` classes, not this hook.

#### `usePharmacyId` / `useStockistId` (`src/hooks/usePharmacyId.tsx`, `useStockistId.tsx`)
- Identical shape: `{ pharmacyId|stockistId: string | null, loading: boolean }`. On `user` change: no user → id null, loading false; else `SELECT id FROM <table> WHERE user_id = user.id .single()`; error → `console.error('Error fetching pharmacy ID:'|'Error fetching stockist ID:', error)` and id null (L10-37 both files). No caching/dedup — every consuming page mounts its own copy and re-queries.

### E2.3 Entity & schema deep detail

Most schema detail is already exhaustive (§9, §14, §E.2). New findings:

- **`stockists.kyc_status` typed values:** only DB default `'pending'` ever exists (no writer, §14.2); the TS row type is plain `string | null` (`src/integrations/supabase/types.ts`) — there is no enum/CHECK constraining kyc_status in any migration, so the "lifecycle" is a single permanent state.
- **Cart pseudo-entity (client-only):** `CartItem` in `src/hooks/useCart.tsx` L5-13 is effectively an unpersisted entity with composite natural key `(productId, stockistId)` — `addToCart` merges on that pair (L53-55), `removeFromCart` filters on it (L96-99), `updateQuantity` maps on it (L127-133). Its only durable home is `localStorage['cart']` (write-through `useEffect` L42-44); it never touches Postgres.
- **`DeliveryFeeResult` type (dormant):** `{ fee: number; isFree: boolean; reason: string; distance?: number }` exported from `src/hooks/useDeliveryFee.tsx` L5-10 — the reason strings form a closed vocabulary listed in E2.5.4.
- **`PreviewItem` bulk-upload working type** (`src/components/stockist/BulkUploadPreview.tsx` L3-14) is the de-facto schema of `bulk_upload_drafts.items` JSONB: `{ product_name, quantity, purchase_price?, sale_price?, profit?, gst_amount?, net_profit?, status, aiEnhanced?, errorMessage? }` plus fields the BulkUpload page adds (`existingProductId`, `isNew`, `margin_percent`, brand/category/etc. from parsing). Drafts therefore persist transient UI status flags (`status: 'error'`, `errorMessage`) into the database verbatim.
- **`ProductVariant` catalogue projection** (`src/components/pharmacy/ProductCard.tsx` L8-19): the pharmacy catalogue's unit of sale is not the `stockist_products` row but this projection `{ id, stockistId, stockistName, price(=sale_price), mrp?, stock(=stock_quantity), moq, batchNumber?, expiryDate?, deliveryDate? }` — `gst_percent` is deliberately absent, which is why checkout must re-fetch GST (Checkout.tsx L255-258).
- **Relationship reality for `payments`:** the only FK is `order_id`; the stockist Payments list reaches pharmacy names through a 2-hop embedded join `payments → orders!inner → pharmacies` (`src/pages/stockist/Payments.tsx` L55 region), making `orders` the tenant filter (`orders.stockist_id = me`) since `payments` itself has no stockist column.
- **RLS/permissions nuance not previously stated:** the stockist inline stock editor performs `UPDATE stockist_products` from a shared component (`components/stockist/ProductCard.tsx` L26-29) rather than the page — permitted by "Stockists can manage own products" (ALL). Its update payload contains only `stock_quantity`, so the `updated_at` trigger is the only other column change.

### E2.4 Workflow traces

#### E2.4.1 Smart Order end-to-end (pharmacy role) — precise step/branch trace (`src/pages/pharmacy/SmartOrder.tsx`)
1. **Trigger:** click "Analyse & Get Recommendations" (button unavailable while textarea blank).
2. Guard branch A: empty `rawText.trim()` → toast "Please paste your medicine list", stop (L34-37). Guard branch B: no `user` → toast "Please login first", stop (L39-42). (Branch A is unreachable through the UI since the button is disabled, but reachable if state changes race.)
3. `setLoading(true)`; resolve pharmacy id inline (`pharmacies.select('id').eq('user_id', ...).single()`); null → toast "Pharmacy profile not found", stop — **note: this early return is inside `try` before `finally`, so `loading` is reset by `finally`** (L44-56).
4. Invoke `smart-order-parse`. Error branch: message contains "401" → toast "Session expired. Please login again.", return; otherwise re-throw to the catch (L67-74). `parseData.success` false → throw `"Failed to parse text"` (L76-78).
5. Success: `setParsedItems`, `setSessionId`, toast `Parsed {n} items` (L80-82). UI now shows the Parsed Items card even if the next step fails.
6. Invoke `smart-order-recommend` with the fresh `sessionId` (not the state variable). Same 401 branch; `!recommendData.success` → throw `"Failed to generate recommendations"` (L86-102).
7. Success: `setRecommendations`, toast "Recommendations ready!" (L105-106). Catch-all: toast `error.message || "Failed to analyse order"` (L109). `finally`: `setLoading(false)` (L111).
8. **Completion:** user clicks one of up to three "Add to Cart" buttons → items mapped per strategy (L119-156) → `addToCart` per item (no await of the boolean results, L159) → toast + `navigate("/pharmacy/cart")` (L163-164). Failure inside mapping → toast "Failed to add items to cart" (L167).
- **Status transitions (DB):** session row `processing` at parse; recommend attempts `completed` (blocked by CHECK, stays `processing` — §14.9). No UI ever reads session status.

#### E2.4.2 Inline stock edit workflow (stockist) — trigger → completion (`components/stockist/ProductCard.tsx`)
Click stock value → edit mode → change number → Save → `UPDATE stockist_products.stock_quantity` → success: toast "Stock updated", exit edit mode, parent `fetchProducts()` refetch; failure: toast "Failed to update stock", **remains in edit mode** with the typed value (only `setUpdating(false)` runs, L31-38). Cancel path restores the original value and exits without any network call.

#### E2.4.3 Serviceable-area lifecycle (stockist)
Add ("Add Area") → INSERT active row → duplicate-key branch (`23505`) → "This pincode is already added"; other error → "Failed to add area"; success → inputs cleared + list refetch (L46-66). Remove (Badge X) → UPDATE `is_active=false` → refetch (L69-81). Because removal is a soft-delete and the DB unique key is `(stockist_id, pincode)` regardless of `is_active`, the re-add of a removed pincode always takes the duplicate branch — the terminal state for any pincode ever added is "exists forever, possibly hidden".

#### E2.4.4 Delivery-rules save workflow (stockist) — non-atomic two-phase
Click "Save Delivery Rules" → phase 1: unconditional `DELETE FROM stockist_delivery_rules WHERE stockist_id = me` (result **not** checked — L74-78) → phase 2: build 0..5 rule rows in fixed priority order → if ≥1 row: INSERT with toasts "Delivery rules saved successfully" / "Failed to save delivery rules"; if 0 rows: toast "All delivery rules cleared" with no insert (L80-150). Failure window: if phase 2 insert fails after phase 1 succeeded, the stockist's rules are gone but the UI toggles still show the old configuration until reload.

#### E2.4.5 PWA install workflow (any role, `/install`)
Branches: (a) already standalone → terminal green panel; (b) Chromium + captured `beforeinstallprompt` → native prompt; accepted → flips to installed panel, declined → button disappears (`deferredPrompt` nulled, `isInstallable` false — L44-45) leaving the Android instructions as fallback on next visit; (c) iOS → manual 3-step instructions (no programmatic path); (d) other → Android menu instructions. No analytics/persistence of install outcome.

#### E2.4.6 Mock payment state machine (pharmacy checkout) — component-state transitions
`paymentSuccess: null → (2s delay + RNG) → true | false`; `processing: false → true → false`. Transition table: `null+idle` shows Mock notice + "Pay Now"; `processing` shows spinner "Processing Payment..."; `false` shows red panel, button disabled permanently for this mount; `true` shows green panel, button reads "Payment Successful", then a 2s `setTimeout` navigates to `/pharmacy/orders` (Checkout.tsx L203-207). There is no retry affordance after failure other than remounting the route.

### E2.5 Business rules & calculations (exact formulas newly pinned to code)

#### E2.5.1 Haversine implementation (`src/lib/distanceCalculator.ts`)
```
R = 6371 km
dLat = rad(lat2 − lat1); dLon = rad(lon2 − lon1)
a = sin²(dLat/2) + cos(rad(lat1))·cos(rad(lat2))·sin²(dLon/2)
c = 2·atan2(√a, √(1−a))
distance = round(R·c × 100) / 100   // 2-dp rounding, km
```
(L5-26; `toRadians = deg × π/180`, L28-30.)

#### E2.5.2 Distance-fee rounding order (`src/hooks/useDeliveryFee.tsx` L156-159)
`chargeableDistance = max(0, distance − base_distance_km)` (distance already 2-dp rounded), `fee = chargeableDistance × per_km_charge`, stored fee = `Math.round(fee × 100) / 100`. `isFree` for the distance rule is `fee === 0` (i.e. within base distance), while flat-fee results always set `isFree: false` even if `flat_fee` were 0 — though the `rule.flat_fee &&` truthiness guard (L169) means a 0 flat fee is skipped entirely.
- **Rule-matching truthiness edge cases:** every numeric parameter is guarded with `&&` truthiness (`rule.min_profit_amount &&`, `rule.min_order_amount &&`, `rule.per_km_charge && rule.base_distance_km &&`) — a rule stored with value 0 can never match; a distance rule with base 0 km is likewise inert (L104-155).
- Pincode is selected in the pharmacy fetch (`select('latitude, longitude, pincode')` L42) but never used — coordinates are the only matching signal in the fee engine.

#### E2.5.3 Margin preview math (`MarginSettingsModal.tsx` L46-47)
`exampleSalePrice = 100 × (1 + margin/100)`; the "+ Margin" line displays `exampleSalePrice − 100`. Margin input coerces `parseFloat(e.target.value) || 0` — clearing the field previews 0%.

#### E2.5.4 Delivery-fee reason strings (closed vocabulary, `useDeliveryFee.tsx`)
"Calculating..." (initial), "Location not available" (pharmacy coords missing), "Stockist location not available" (dispatch coords missing), "No delivery charges" (no rules / no rule matched), `` `Free delivery on profit ≥ ₹${min}` ``, `` `Free delivery on orders ≥ ₹${min}` ``, "Free delivery on scheduled delivery date", `` `₹${perKm}/km after ${base}km` ``, "Standard delivery charge" (flat fee), "Error calculating fee" (catch) — L22, L50, L67, L93, L111, L127, L143, L161, L173, L194. (All dormant — hook unmounted anywhere.)

#### E2.5.5 Cart aggregate definitions (exact, `useCart.tsx` L141-156)
`getTotalAmount = Σ price×quantity` (pre-GST); `getItemCount = Σ quantity` (unit count — used for the Dashboard/Catalogue badges); Cart page's "Items (N)" uses `items.length` (line count) — the two "counts" intentionally differ per surface (Cart.tsx L125 vs PharmacyDashboard cart card).

#### E2.5.6 updateQuantity stock guard truthiness (`useCart.tsx` L116-125)
The re-validation uses `if (product.stock_quantity && quantity > product.stock_quantity)` — a product whose live `stock_quantity` is **0** skips the stock check entirely (0 is falsy), so a cart-line quantity can be raised on an out-of-stock product via the Cart qty input; the block is the pre-payment re-check at checkout (Checkout.tsx L71-80). MOQ guard has the same truthiness form (`product.moq &&`), inert when moq is 0/null.

#### E2.5.7 Smart-order parse quantity contract (edge fn tool schema)
`parse_medicine_list` JSONSchema requires `items[].parsed_name: string` and `items[].quantity: integer`, both required (`supabase/functions/smart-order-parse/index.ts` L66-90); `tool_choice` pins the function (L91). Quantities are whatever the model emits — no server-side clamping to ≥1 on this path (unlike `extract-bill-items`' `max(1, parseInt||1)`).

### E2.6 API / edge-function reference deep detail (verbatim prompts & remaining I/O nuances)

#### `smart-order-parse` — system prompt (verbatim, `index.ts` L52-59)
> "You are a medicine list parser. Extract product names and quantities from the pasted text.\nHandle typos, variations, and informal formats. Return a JSON array of objects with:\n- parsed_name (standardized product name)\n- quantity (integer)\n\nExample input: \"paracetamol 500mg x10, brufen 20 tabs, crocin - 5\"\nExample output: [{\"parsed_name\":\"Paracetamol 500mg\",\"quantity\":10},{\"parsed_name\":\"Brufen\",\"quantity\":20},{\"parsed_name\":\"Crocin\",\"quantity\":5}]"

User message = the raw pasted text unmodified (L61-63). Non-OK AI response → `throw new Error('AI parsing failed: <status>')` (L96-99); missing tool call → `'No tool call returned from AI'` (L104-106). Debug logging: `console.log('Parsing smart order text:', rawText.substring(0, 100))` (L33) — first 100 chars of pharmacy input land in function logs.

#### `extract-bill-items` — prompt & user content (verbatim fragments, `index.ts` L40-72)
System prompt demands strict JSON `{"pharmacy_name": "string or null", "items": [{"name": "Product Name", "quantity": 10, "price": 25.50}]}` with rules: "Extract ALL products visible in the bill", "Preserve exact product names", "Ensure quantity and price are numbers", "If pharmacy name not visible, set to null". User message is a 2-part content array: text "Extract all product information from this bill." + `image_url` (the 900s signed URL). Error bodies (verbatim): 429 → `{"error":"Rate limit exceeded. Please try again in a few moments."}`; 402 → `{"error":"AI credits exhausted. Please add credits to your workspace."}`; other → `{"error":"AI extraction failed. Please try again."}` (L76-99).

#### `fetch-product-info` — message pair (`index.ts` L54-55)
System = the "pharmaceutical product database assistant" prompt; user = `` `Provide details for this medicine: ${product_name}` ``.

#### `product-ai-fetch` — message pair (`index.ts` L48-52)
System (verbatim): "You are a pharmaceutical product information assistant. Extract and provide details about medicine products in JSON format." User prompt begins `` `Given the medicine product name "${product_name}", provide the following information in JSON format:` `` followed by the 4-field spec (generic_name, manufacturer, product_type, category).

#### Client-side invocation error surface (SmartOrder.tsx L67-74, L91-98)
`supabase.functions.invoke` errors are matched with `parseError.message?.includes("401")` — a substring match on the message string, not a status-code check; any error message containing "401" (even coincidentally) triggers the "Session expired" toast.

### E2.7 Role journeys step-by-step (click-by-click, code-derived)

#### E2.7.1 Pharmacy journey — from first visit to received order
1. Land on `/` → Register card (Pill icon, "Create Account" / "Register as a Stockist or Pharmacy"); the **Pharmacy tab is pre-selected** (`useState('pharmacy')`, Register.tsx L32); tab triggers carry Store (Pharmacy) and Building2 (Stockist) icons (L50-57).
2. Fill "Pharmacy Name *", "Drug License *", optional City/State, Email, Password → submit → Zod pass → signUp → role insert → profile insert → toast "Registration successful! Redirecting..." → 1s later land on `/pharmacy` (L92-153).
3. Dashboard: read KPIs; tap the Cart card (badge if items) or "Browse Products" quick action → `/pharmacy/catalogue`.
4. Catalogue → Products tab: type in search ("Search products..."), optionally pick Category; on a grouped ProductCard pick a stockist variant, adjust `QuantitySelector` (bounded [moq, stock]), click "Add to Cart" → sonner "Added to cart" (or a rejection toast, E2.9).
5. Alternative paths: Stockists tab or bottom-nav "Stockists" → StockistCard → whole-card click → `/pharmacy/stockists/:id` → per-product "Add to Cart"; or bottom-nav absent Smart Order — Smart Order is reached only via the Dashboard promo card / quick action (`/pharmacy/smart-order` has **no bottom-nav tab**), paste list → "Analyse & Get Recommendations" → pick a strategy card → "Add to Cart" → auto-navigate to Cart.
6. Cart (`/pharmacy/cart`): adjust quantities (live revalidated against DB), remove lines (trash), or "Clear Cart" (confirm dialog) → "Proceed to Checkout".
7. Checkout: review per-stockist Subtotal/GST/Total → "Pay Now" → 2s spinner → 95% green "✓ Payment Successful!" → toast "Successfully created N order(s)!" → auto-redirect (2s) to `/pharmacy/orders`. 5% path: red "✗ Payment Failed" — user must navigate away and back to retry.
8. Orders list: search box "Search by order ID, stockist name, status, or amount..." (Orders.tsx L132); row "View Details" → `/pharmacy/orders/:id`.
9. Order Detail: watch the read-only 5-node stepper; when the stockist sets `out_for_delivery`, a "Mark as Received" button appears → click → status `delivered`, toast "Order marked as received".
10. Profile (header dropdown "My Profile" or bottom-nav "Profile"): edit the 8 profile fields → save → "Profile updated successfully".

#### E2.7.2 Stockist journey — from catalogue setup to payout visibility
1. Register via Stockist tab (same fields, "Stockist Name *") → land `/stockist`.
2. Dashboard: KPI cards; amber Low Stock / red Expiring Soon panels appear only when non-empty; "Manage Products" → `/stockist/products`.
3. Add inventory, three ways:
   a. **Single:** "Add Product" → 7-section form → optional "Fetch with AI" (Sparkles; currently no-op per §3.3) → "Save" (requires name + sale price) → toast "Product added successfully!" → back to list.
   b. **Bulk file:** "Bulk Upload" → pick tab (Purchase Bill / Sale Bill / Full Catalogue) → "Select File" (≤10MB; images/PDF only on bill tabs) → "Parse & Preview" (staged progress) → optionally "Apply Global Margin" (modal, "Apply to All Items") and/or "Custom Pricing" (per-row Sale Rate / Margin % editing; note round-trip state loss, §3.6) → "Confirm Upload N Products" → toast "Uploaded {successCount} products" → products list.
   c. **Draft resume:** Products page → Saved Drafts → DraftCard "Resume" → BulkUpload preloads `?draft=<id>` → toast "Draft loaded".
4. Maintain: card grid → toggle Switch (activate/deactivate toast), click stock number to inline-edit (Save icon → "Stock updated"), Edit → edit form, Delete → AlertDialog → "Product deleted".
5. Configure logistics: Dashboard "Delivery Dates" card or quick action → `/stockist/delivery-dates` → "Delivery Dates" tab multi-select calendar → Save ("Delivery dates saved successfully"); "Serviceable Areas" tab → add pincodes; "Delivery Fees" tab → check rules → "Save Delivery Rules".
6. Fulfil: bottom-nav "Orders" → search "Search by order ID, pharmacy name, status, or amount..." (stockist Orders.tsx L128) → "View Details" → Order Status card Select — options limited to the current status and later stages — advance `paid → accepted → packed → out_for_delivery → delivered`, each change toasting "Order status updated"; at `delivered` the Select disables and an "Order Complete" badge shows.
7. Money: bottom-nav "Payments" → row click → Payment Detail → "View Order Details" cross-link back into the order.
8. Profile: same edit-save loop as pharmacy against `stockists`.

#### E2.7.3 Admin journey — exhaustive (dormant)
Already fully documented in §12.4; the only click-level addition: an admin's bottom nav renders the **pharmacy** tab set including the Cart tab, and because `CartProvider` is global, an admin can technically accumulate localStorage cart items if any add-to-cart surface were reachable — none is (every such surface sits behind `allowedRoles={['pharmacy']}`), so the admin journey terminates at the Register form on every navigation.

### E2.8 Hidden / internal functionality

- **localStorage keys (complete inventory):** `cart` (CartProvider write-through, `useCart.tsx` L38-43, removed on `clearCart` L138) and the Supabase auth token key (`client.ts` config `storage: localStorage, persistSession: true`; default key format `sb-<project-ref>-auth-token` managed by supabase-js). No other app-set keys exist in `src/`.
- **Console/debug channels:** pharmacy input excerpts logged server-side by `smart-order-parse` (L33); "Computing recommendations for session:" (`smart-order-recommend` L41); "Calling Lovable AI for bill extraction..." (`extract-bill-items` L53); "Processing {mode} mode for {n} items" (`bulk-upload-commit` L47). Client-side: SmartOrder logs "Parsing medicine list...", "Getting recommendations...", full recommendations object (L58, L84, L104); NotFound logs the attempted path; the id-resolver hooks log fetch errors.
- **Dead imports/wiring:** `Header.tsx` imports `Settings` icon, never rendered (L11). `BottomNav` destructures `loading` from `useAuth` and never uses it (L7). `ui/sidebar.tsx` contains a `Math.random()`-driven skeleton width generator (L536) in a component no page mounts.
- **Feature flags:** none exist — no env-based conditionals in `src/` beyond the two Supabase env vars; `lovable-tagger` activates only in `mode === 'development'` inside `vite.config.ts`.
- **Background jobs / schedulers:** none. No cron config in `supabase/config.toml`; all six functions are request-driven. The only time-based behaviors are client `setTimeout`s (1s register redirect, 2s mock payment delay, 2s post-payment redirect, 5s role-fetch timeout, 15s auth-guard timeout) and the 16.7-min Radix toast purge timer (unused pathway).
- **Seeded data:** zero — no migration inserts business rows; the only data-bearing statements are storage bucket inserts (`ocr-bills`, later deleted; `bills` per §15.2) and policy DDL.
- **Wired-but-inert UI paths (consolidated additions):** the "View Catalogue" button inside `StockistCard` relies purely on event bubbling (no handler of its own); SmartOrder's empty-text toast guard is dead UI-wise (button already disabled); `Register`'s two form components (`PharmacyRegistrationForm`, `StockistRegistrationForm`) are separate near-identical function components with independent state — switching tabs mid-fill preserves each tab's own field values separately.

### E2.9 Validation & error-handling catalog (verbatim, exhaustive, by surface)

#### Zod messages (Register, `src/pages/auth/Register.tsx` L13-29 — both schemas identical)
- Email: "Invalid email address"; "Email too long" (max 255).
- Password: "Password must be at least 8 characters".
- Name: "Name must be at least 2 characters"; "Name too long" (max 100).
- Drug license: "Drug license is required".
- Zod failure surfaces only the **first** issue: `toast.error(error.errors[0].message)` (L146). Non-Zod: `error.message || 'Registration failed'`. Compensation errors: "Failed to assign user role. Please try again." (L121), "Failed to create pharmacy profile. Please try again." (L139) — the stockist form's mirror at L286-292.

#### Auth / session
- Login: "Account setup incomplete. Please register again." (Login.tsx L67); "Login successful!" (L74); `error.message || 'Failed to login'` (L78). Reset dialog: "Please enter your email address" (L86); "Password reset link sent to your email!" (L98); `error.message || "Failed to send reset link"` (L102).
- Sign-out failure: "Error signing out" (useAuth.tsx L117). ProtectedRoute screens: "Loading...", "Authentication is taking too long" + Retry, "Your account setup is incomplete…" (§12.2).

#### Cart validations (useCart.tsx)
- "Product is out of stock" (L49) — only when caller supplies `stockQuantity`.
- `Minimum order quantity is {moq}` (L61 add-path; L118 update-path).
- `Only {stockQuantity} units available in stock` (L67, add) vs `Only {stock_quantity} units available` (L122, update) — note the two messages differ by the trailing "in stock".
- Successes: "Added to cart" (L92), "Removed from cart" (L100).

#### Checkout (Checkout.tsx)
- "Pharmacy profile not found" (L53); "Failed to verify product availability" (L67, stock re-fetch error); `` `Insufficient stock for: ${firstProductName}` `` (L79 — only the first offending product is named); "Payment failed. Please try again." (L92, RNG failure); `` `Successfully created ${n} order(s)!` `` (L203); `error.message || "Failed to process order. Please try again."` (L211).

#### Smart Order (SmartOrder.tsx / StockistCatalogue.tsx)
- "Please paste your medicine list" (L35); "Please login first" (L40); "Pharmacy profile not found" (L54, and StockistCatalogue L82); "Session expired. Please login again." (L70, L94); thrown "Failed to parse text" / "Failed to generate recommendations" surface via `error.message` (L77, L101, L109); `Parsed {n} items` (L82); "Recommendations ready!" (L106); `Added {n} items to cart ({modeLabel})` (L163); "Failed to add items to cart" (L167). Embedded stockist-catalogue variant: `` `${missing.length} items not available from this stockist` `` (info toast, L120); `` `All ${n} items found!` `` (L122); "Failed to analyze order" (L126 — American spelling here vs "analyse" on the dedicated page).

#### Product management (stockist)
- AddProduct: "Please enter product name first" (L41, AI fetch guard); "Product details fetched!" (L59, unreachable success per §3.3); "Failed to fetch product details" (L63); "Product name and sale price are required" (L71); "Stockist ID not found" (L76); "Product added successfully!" (L96); "Failed to save product" (L100).
- EditProduct: "Failed to fetch product" (L56); "Please enter a product name first" (L83 — note the "a", differing from AddProduct's guard text); `data?.error || "Failed to fetch product details"` (L94); "Product details fetched with AI" (L105, unreachable per §3.4); "Failed to update product" (L139); "Product updated successfully" (L141).
- Products page: "Failed to fetch products" (L67); "Draft deleted" (L91); "Failed to delete product" (L107); "Product deleted" (L109); "Failed to update product" (L122); `` `Product ${activated|deactivated}` `` (L124). Inline card: "Stock updated" / "Failed to update stock" (ProductCard L32-34).

#### Bulk upload (BulkUpload.tsx)
- "Failed to load draft" (L91); "Draft loaded" (L100); `` `Invalid file type. Accepted: ${validExtensions.join(', ')}` `` (L113 — the joined list varies by tab); "File too large. Maximum size: 10MB" (L118); `error.message || 'Failed to process file'` (L144, surfaces thrown parse errors such as empty-file messages); `Parsed {n} products` (L257, spreadsheet path); `Extracted {n} items` (L365, OCR path); `Applied {m}% margin to all items` (L388); "Failed to save draft" (L405); "Draft saved" (L407); "Upload failed" (L430); `Uploaded {successCount} products` (L432).
- MarginSettingsModal: "Failed to save default margin" / "Default margin saved" (L36-38). CustomPricing: "Custom pricing applied" (L86).

#### Delivery configuration (stockist)
- DeliveryAndDates: "Delivery dates saved successfully" (L67); "Failed to save delivery dates" (L71 — also the surfaced symptom of the unique-constraint re-save collision, §14.5).
- ServiceableAreasManager: "Please enter a pincode" (L42); "This pincode is already added" (L56, code 23505 branch); "Failed to add area" (L58); "Serviceable area added" (L61); "Failed to remove area" (L76); "Area removed" (L78).
- DeliveryRulesConfig: "Failed to save delivery rules" (L143); "Delivery rules saved successfully" (L146); "All delivery rules cleared" (L149).

#### Orders / payments
- Stockist OrderDetail: "Failed to update status" (L61); "Order status updated" (L63). Pharmacy OrderDetail: "Failed to update order" (L51); "Order marked as received" (L53). PaymentDetail: "Failed to fetch payment details" (L41).
- Profiles (both roles, identical): "Failed to load profile" (L45); "Failed to update profile" (L71); "Profile updated successfully" (L73).

#### Edge-function error bodies (verbatim JSON, supplementing §16)
- `extract-bill-items`: `{"error":"Rate limit exceeded. Please try again in a few moments."}` (429); `{"error":"AI credits exhausted. Please add credits to your workspace."}` (402); `{"error":"AI extraction failed. Please try again."}` (500).
- `smart-order-parse` thrown strings: "AI parsing failed: {status}", "No tool call returned from AI" — both returned as 500 `{error}`.
- HTML-level validation inventory: Register inputs use `required` + `minLength={6}` on password (looser than Zod's 8); Login email/password `required`; ServiceableAreas pincode `maxLength={6}`; Cart qty input `min="1"`; QuantitySelector input `min={moq} max={maxStock}`; all rule-config inputs `min="0"`. No other native constraint attributes exist in the app's forms — everything else is imperative.

*End of Expansion Pass 2. Sources: files cited inline; line numbers refer to the repository state at `/Users/kshipradewat/Desktop/stockpharma/greetings-pal-git` as of 2026-07-08.*


# Source: stockistpayments

## 0. GLOBAL ARCHITECTURE

### 0.1 Routing (`src/App.tsx`)
All non-auth routes are wrapped in a single `ProtectedRoute` that checks **only** that a Supabase `user` exists (shows a spinner while `loading`, redirects unauthenticated users to `/auth`). It does **NOT** check role. Per-page role restriction is done by the `useRoleGuard` hook on *some* pages only.

Full route table (element → notes):

| Path | Element | Role guard on page? |
|------|---------|---------------------|
| `/auth` | `Auth` | public (redirects to `/dashboard` if already logged in) |
| `/onboarding` | `OnboardingSelectRole` | ProtectedRoute only |
| `/` and `/dashboard` | `DashboardRouter` | routes by role |
| `/pharmacies` | `Pharmacies` | none (MR-intended) |
| `/pharmacies/new` | `PharmacyForm` | none |
| `/pharmacy/:id` | `PharmacyDetail` | none |
| `/bills/new` | `BillForm` | none |
| `/payments` | `Payments` | none |
| `/profile` | `Profile` | none |
| `/catalogue` | `Catalogue` | none (browse-all-products page) |
| `/marketplace` | `Marketplace` | `useRoleGuard(["pharmacy"])` |
| `/marketplace-browse` | → redirect to `/marketplace` | — |
| `/marketplace/products` | `MarketplaceProducts` | `useRoleGuard(["pharmacy"])` |
| `/seller/:sellerId` | `SellerDetail` | `useRoleGuard(["pharmacy"])` |
| `/cart` | `Cart` | none (no `<Layout>`) |
| `/checkout` | `Checkout` | none |
| `/my-products` | `MyProducts` | `useRoleGuard(["mr","stockist","distributor"])` |
| `/marketplace/product/new` | `ProductForm` | none |
| `/marketplace/product/:id` | `ProductForm` | none (edit mode) |
| `/marketplace/order/new` | `OrderForm` | none |
| `/orders` | `Orders` | none |
| `/notifications` | `Notifications` | none |
| `/my-customers` | `MyCustomers` | none (Stockist/Distributor-intended) |
| `/my-suppliers` | `MySuppliers` | `useRoleGuard(["pharmacy"])` |
| `/analytics` | `Analytics` | none |
| `/support` | `Support` | none |
| `/otc-partnership` | `OTCPartnership` | none (pharmacy-intended) |
| `/otc` | → redirect to `/otc-partnership` | — |
| `/delivery-planner` | `DeliveryPlanner` | none (MR-intended) |
| `/settings` | `Settings` | none |
| `/reports` | `Reports` | none |
| `/admin/dashboard` | `AdminDashboard` | **ProtectedRoute only — NO admin guard** |
| `/admin/users` | `UserManagement` | ProtectedRoute only |
| `/admin/support` | `SupportManagement` | ProtectedRoute only |
| `/admin/role-audit` | `RoleAudit` | ProtectedRoute only |
| `*` | `NotFound` | — |

**Routed-but-orphaned / dead links (important):**
- **`Upgrade.tsx` (Upgrade to Premium) is NOT imported or routed anywhere** — the entire ₹999 self-serve subscription-proof page is unreachable via the router.
- **`admin/Subscriptions.tsx` is NOT routed.** `AdminDashboard` links to `/admin/subscriptions` and `/admin/subscriptions/:id` (Review buttons) — both 404. So the admin subscription approval queue is unreachable through navigation despite the dashboard advertising it.
- `SellerDashboard` "Quick Actions" navigate to `/customers`, `/products`, `/suppliers` — none exist (correct paths are `/my-customers`, `/my-products`, `/my-suppliers`). → all 404.
- `PharmacyDashboard` "My Suppliers" quick action navigates to `/suppliers` (dead; should be `/my-suppliers`).
- `MyProducts` Edit button → `/marketplace/product/edit/:id` — route is `/marketplace/product/:id` (single segment), so this 3-segment path **404s**. (Contrast: `ProductDetailModal` edit → `/marketplace/product/:id` which works.)
- `Orders` "Self-Added Pharmacies" cards navigate to `/pharmacies/:id` — route is `/pharmacy/:id` (singular); `/pharmacies/:id` is undefined → 404.
- `BillForm` "Back to Bills" and post-submit navigate to `/bills` — no such route → 404.
- `MySuppliers` "View Orders" → `/orders?seller=…`; `Orders` ignores the query param and only shows the *seller's* own orders (buyer orders never appear there).
- `nav` in `Layout` links `/delivery-planner` labelled "Routes" (MR) works; `MobileNav` (separate component) links `/otc` (pharmacy) — but **MobileNav is not actually mounted anywhere** (Layout renders its own bottom nav). MobileNav is dead code.

### 0.2 Auth context (`src/contexts/AuthContext.tsx`)
Minimal: subscribes to `onAuthStateChange` + `getSession()`, exposes `{ user, session, loading }`. No role, onboarding, or timeout state. Sessions persisted to `localStorage` with `autoRefreshToken`.

### 0.3 Role guard (`src/hooks/useRoleGuard.tsx`)
`useRoleGuard(allowedRoles)` → TanStack query `["userRole", user.id]` reads `user_roles.role` via `maybeSingle()`, `staleTime` 5 min, `retry:1`. On resolve: no role → navigate `/onboarding`; role not in `allowedRoles` → toast "You don't have access to this page" + navigate `/`. Returns `{ userRole, isLoading, hasAccess }`.

### 0.4 Navigation chrome (`src/components/Layout.tsx`)
Header: logo (`Package` icon in a primary square) + role-specific brand text (Chameleon *). Center search input (pharmacy only) that navigates to `/marketplace` on focus. Right side: Support (`?`) button → `/support`; if admin, a `Shield` button → `/admin/support`; Notifications bell → `/notifications`; user dropdown (Profile / Settings / [Role Audit if admin] / Support). Bottom fixed nav (mobile only, `grid-cols-5`) is role-based:
- pharmacy: Home, Browse(`/marketplace`), Cart, Orders, Suppliers(`/my-suppliers`)
- mr: Home, Pharmacies, Products, Routes(`/delivery-planner`), Orders
- stockist/distributor: Home, Products, Orders, Customers(`/my-customers`), Analytics
- admin: Home, Users, Support, Audit, Analytics
- fallback: Home only
`isActiveRoute` matches sub-routes (e.g. `/pharmacies` active for `/pharmacy/*`). `userRole` fetched via `["userRole", user.id]` with `.single()` (note: `.single()` will error for role-less users, unlike guards that use `maybeSingle()`).

### 0.5 Currency & tax convention
All money via `toLocaleString("en-IN")` with `₹`. **No GST/CGST/SGST/tax is computed anywhere.** `orders.tax_amount` and `orders.discount_amount` columns exist but are never written or used by any total. All order/cart totals = `Σ price×(1−discount%/100)×qty`.

---

## 4. ADMIN MODULE (all behind `ProtectedRoute` only — no client role gate)

### 4.1 Admin Dashboard — `dashboards/AdminDashboard.tsx` (`/admin/dashboard`, also role `admin` at `/`)
**KPIs:** Total Users (`user_roles` count), Pending Verifications (`profiles where is_verified=false AND verification_document_url NOT null`), Subscription Requests (`subscription_requests where status='pending'`), **Revenue (Est.) = pending count × ₹999** (hardcoded).
**Users by Role** grid (mr/stockist/distributor/pharmacy/admin).
**Recent Subscription Requests** (5): "User ID: {id8}…", requested date, `₹amount`, **Review** button → `/admin/subscriptions/:id` (**404 — route missing**). "View All" → `/admin/subscriptions` (**404**).
Header buttons: Manage Users (`/admin/users` ✓), Subscriptions (`/admin/subscriptions` **404**).
**Danger Zone — Wipe All Data:** text input must equal **`DELETE ALL USERS AND DATA`** (Wipe button disabled otherwise); "Include admins" checkbox; on confirm calls `admin-wipe` edge fn. On success toast; if includeAdmins → `signOut()` + `/auth`; else `window.location.reload()`.

### 4.2 User Management — `UserManagement.tsx` (`/admin/users`)
Table of `profiles` joined `user_roles!inner(role)`, search (name/email/business_name), role filter Select. Columns: User (name/email/phone), Business (name/type), Role badge, Status (Verified/Pending), Subscription (Premium/Free from `subscription_tier`), Actions: **Verify**/**Unverify** (mutates `profiles.is_verified`). A `deleteUserMutation` exists calling `supabase.auth.admin.deleteUser` **client-side** — ⚠️ requires service-role; will fail from the browser (and no button wired to it anyway).

### 4.3 Subscriptions — `admin/Subscriptions.tsx` (**not routed**)
Tabs Pending / Approved of `subscription_requests` joined `profiles`. RequestCard: user name/email/business, UTR, requested date, `₹amount`, status badge; pending actions: **View Proof** (image modal showing `payment_proof_url` with Approve/Reject), **Reject** (reason modal → `status='rejected', rejection_reason`), **Approve** (`approveMutation`: sets `status='approved', approved_at=now`; updates the user `profiles {subscription_tier:'premium', subscription_expires_at = now+30d, subscription_payment_status:'verified'}`). Flat ₹999. **Unreachable** because no route.

### 4.4 Support Management — `SupportManagement.tsx` (`/admin/support`)
`support_tickets` joined `profiles`, search (subject/description), status filter. Ticket cards: subject, user, email, created, status badge (open/in_progress/resolved/closed) + priority badge + category. Inline **status Select** (`updateStatusMutation`; setting resolved/closed also sets `resolved_at=now`).

### 4.5 Role Audit — `RoleAudit.tsx` (`/admin/role-audit`)
`profiles` joined `user_roles!inner(role)`. Role summary cards (count + % of total). Detailed table (User w/ @username, Role, Business, Status, Subscription, Joined). **Export All Data** and **Export Summary** to **.xlsx** via SheetJS (real, working exports).

---

## 7. AI & EDGE FUNCTIONS (`supabase/functions/*`, Deno)

Both AI functions use Lovable AI Gateway `https://ai.gateway.lovable.dev/v1/chat/completions`, model **`google/gemini-2.5-flash`**, secret `LOVABLE_API_KEY`. No fallback model. CORS `*`.

### 7.1 `ocr-product-label`
Auth: **user JWT verified** (`getUser(token)`), writes with **service role**. Input `{imageBase64, mrp, stock, purchaseRate, saleRate}`.
1. Gemini Vision extracts `{product_name, brand_name, salt_name, type, unit_info, category}` (JSON parsed via `\{[\s\S]*\}` match).
2. Searches caller's products: `stockist_id=user AND (name ilike %product_name% OR salt_name ilike %salt_name%)` limit 1.
3. **Match** → update `stock_quantity += stock`, overwrite purchase_rate/sale_rate/mrp, `updated_at`. Returns `action:"updated"`, message "Updated X. Stock: a → b".
4. **No match** → 2nd Gemini call enriches `{uses, description, typical_unit, category}` (fallback object on parse fail), then insert new product `{stockist_id:user, name, brand_name, salt_name, type, category, uses, description, mrp, purchase_rate, sale_rate, stock_quantity=stock, unit=typical_unit||"strip", is_active:true}`. Returns `action:"created"`. Errors → 500 `{error}`.

### 7.2 `autocomplete-product`
Auth: **NONE (public)**. Input `{productName}` (min 2 chars → else 400). System prompt asks Gemini for `{brand_name, salt_name, type, uses, description, storage, handling, consumption, image_url, category}`. Strips ```` ```json ```` fences then `JSON.parse`. Explicit handling of gateway **429** (rate limit) and **402** (unavailable). Returns `{success, data}`. ⚠️ `image_url` is model-guessed (may be broken/hallucinated). Unauthenticated → open abuse surface.

### 7.3 `assign-role`
Auth: user JWT verified; service-role writes. Input `{role, metadata}`. If role=admin, requires `metadata.admin_password === 'jit@ADMIN1'` (else 403). Upserts `profiles` (defaults `is_catalogue_live:true, is_verified:false`, username fallback `user_{id8}`). Inserts `user_roles` only if none exists (`.single()` check). Returns `{success, role}`.

### 7.4 `admin-wipe`
Auth: user JWT verified **AND** `user_roles.role==='admin'` (else 403). Requires body `confirm === 'DELETE ALL USERS AND DATA'` (else 400). Deletes rows from 14 tables in FK-safe order: cart_items, payment_reminders, payment_requests, bills, order_items, orders, seller_buyer_relationships, pharmacies, products, store_settings, subscription_requests, support_tickets, profiles, user_roles (via `.delete().neq('id', zero-uuid)`). Then iterates `auth.admin.listUsers()` and deletes each, **skipping admins unless `include_admins`** (per-user role lookup). Returns count + warning. ⚠️ OTC tables are **not** wiped.

### 7.5 `delete-my-account`
Auth: user JWT verified; service role. Cascades deletes for the caller (nested subqueries) across cart_items (buyer/seller), payment_reminders & payment_requests (via bills of the user's pharmacies), bills (user's pharmacies), order_items & orders (buyer/seller/stockist), products (stockist), pharmacies (mr_id), seller_buyer_relationships, store_settings, subscription_requests, support_tickets, user_roles, profiles → then `auth.admin.deleteUser`. ⚠️ OTC tables not covered.

### 7.6 `initialize-otc-inventory` (⚠️ never called by frontend)
Auth: user JWT verified; service role. Idempotent (returns early if inventory exists). Seeds `otc_inventory` (qty **40** each) from a **hardcoded catalog**: Derma Co (7 items), MamaEarth (8), Himalaya (9), keyed on active `otc_brands` by name. Also inserts historical `otc_shipments` per brand (`SHIP/0001…`, status 'delivered', random past delivered_at/expected dates, total_value=Σ mrp×40). Returns stats.

---

## 8. BILLS, PAYMENTS, CREDIT & MONEY LOGIC (DB RPCs / triggers)

### 8.1 Numbering (SECURITY DEFINER, search_path public)
- `get_next_bill_number(mr_user_id)` → `MR/` + LPAD(max trailing-int of bill_number over bills whose pharmacy.mr_id = mr_user_id +1, 3). Format `MR/001`.
- `get_next_order_number(stockist_user_id)` → `ORD/` + LPAD(max trailing-int over `orders where stockist_id=user` +1, 4). Format `ORD/0001`. (⚠️ Checkout bypasses this and computes its own count-based number scoped to buyer_id.)

### 8.2 Bill status machine — `update_bill_statuses()` (called on PharmacyDetail load)
Over bills with `due_amount − COALESCE(received_amount,0) > 0`:
| Status | Condition |
|--------|-----------|
| `critical` | `remaining_due_date < CURRENT_DATE − 7 days` |
| `overdue` | `CURRENT_DATE − 7d ≤ remaining_due_date < CURRENT_DATE` |
| `due_soon` | `CURRENT_DATE ≤ remaining_due_date ≤ CURRENT_DATE + 2 days` |
| `pending` | `remaining_due_date > CURRENT_DATE + 2 days` |
| `paid` | `due_amount − received_amount ≤ 0` (any prior status) |

`update_overdue_bills()` also exists (sets overdue where `due_date < CURRENT_DATE`) but references a `due_date` column not present in the current bills schema — effectively **dead/broken RPC**; not called by the app.

### 8.3 Credit
- `get_pharmacy_credit_utilization(pharmacy_uuid)` = `Σ(due_amount − received_amount)` over bills in status `pending/due_soon/overdue/critical`.
- `check_credit_limit(pharmacy_uuid, new_bill_amount)` returns JSON: `utilization_percent = (current_util + new_amount)/max_credit_limit ×100`; `>=100` → `{allowed:false, reason:"Credit limit exceeded"}`; `>=90` → `{allowed:true, warning:"High credit utilization"}`; else `{allowed:true}`. (PharmacyDetail shows it but does not block; BillForm enforces its own `dueAmount > max_credit_limit` block.)
- `pharmacies.payment_behavior_score` default 5.0, `avg_payment_days` default 0 (shown/held, never computed).

### 8.4 UPI/WhatsApp (`src/lib/upi.ts`)
- `generateUPILink(upiId, pharmacyName, amount, billNumber)` → `upi://pay?pa={upiId}&pn={sanitizedName}&am={amount}&cu=INR&tn=Bill {billNumber}`.
- `generateWhatsAppMessage(pharmacyName, amount, billNumber, upiLink, mrName)` → prefilled reminder text incl. UPI link.
- `calculateDueDate(billDate, terms=7)` → billDate + terms days.
No server-side messaging anywhere; "send" = open `wa.me` and/or insert `payment_reminders`.

### 8.5 `handle_new_user()` trigger
On new `auth.users`: role from `raw_user_meta_data.role` **default `pharmacy`**; if admin, requires `admin_password == 'jit@ADMIN1'` (else raises). Inserts `profiles` (upsert on id) + `user_roles` (on conflict do nothing). Wrapped in exception handler that logs a warning and still returns NEW (so signup never blocks on profile errors). Other triggers: `update_product_updated_at`, `update_otc_inventory_timestamp`. `has_role(_user_id,_role)` RPC used by RLS policies.

---

## 10. DATA MODEL (from `src/integrations/supabase/types.ts`)

**Enums:** `app_role = mr|stockist|distributor|pharmacy|admin`; `product_category = iv_antibiotics|oral_antibiotics|analgesics|antipyretics|cardiovascular|gastrointestinal|respiratory|diabetes|vitamins_supplements|other`.

**Tables (Row columns):**
- **bills**: bill_date, bill_number, created_at, due_amount, id, last_reminder_sent, next_payment_date, payment_terms_days, pharmacy_id→pharmacies, received_amount, remaining_due_date, reminder_count, status, total_amount, upfront_amount, upfront_percentage, upi_payment_link. (No `due_date` column — see broken RPC.)
- **cart_items**: buyer_id, seller_id, product_id, quantity, id, created_at (persistent seller-locked cart).
- **order_items**: order_id, product_id, quantity, price, subtotal, id.
- **orders**: buyer_id, created_at, delivered_at, delivery_address, delivery_status, delivery_tracking_id, discount_amount, id, notes, order_number, pharmacy_id(→pharmacies), seller_id, seller_type, status, stockist_id(→profiles), tax_amount, total_amount.
- **products**: batch_number, brand_name, category(enum), created_at, description, discount_percentage, expiry_date, id, image_url, is_active, is_available, max_order_quantity, min_order_quantity, mrp, name, price, purchase_rate, sale_rate, salt_name, seller_type, stock_quantity, stockist_id(→profiles), type, unit, updated_at, uses.
- **profiles**: bank_account_holder_name, bank_account_number, bank_ifsc_code, business_name, business_type, created_at, customer_count, email, id, is_catalogue_live, is_verified, max_customers_free_tier, name, payment_enabled, phone, stockist_license_url, subscription_expires_at, subscription_payment_proof_url, subscription_payment_status, subscription_tier, upi_id, username, verification_document_url.
- **pharmacies**: address, avg_payment_days, created_at, email, id, license_number, max_credit_limit, mr_id(→profiles), name, owner_name, payment_behavior_score, phone.
- **seller_buyer_relationships**: buyer_id, buyer_type, created_at, credit_limit, id, is_favorite, seller_id.
- **store_settings**: created_at, delivery_areas(text[]), id, is_accepting_orders, minimum_order_value, seller_id, store_description, store_name. (No UI writes it; wiped on admin-wipe.)
- **subscription_requests**: amount, approved_at, approved_by, id, payment_proof_url, payment_utr, rejection_reason, requested_at, status, user_id.
- **support_tickets**: assigned_to, category, created_at, description, id, priority, resolved_at, status, subject, updated_at, user_id.
- **user_roles**: user_id, role(app_role), id.
- **payment_reminders**, **payment_requests**: reminder/UPI request logs (bill_id, requested_amount, payment_link, status, reminder_history/sent_at, message_content, etc.).
- **otc_brands** (commission_rate), **otc_inventory** (pharmacy_id, brand_id, product_name, category, mrp, quantity_in_stock, quantity_sold), **otc_shipments**, **otc_shipment_items** — present in types.
- **NOT in generated types** (accessed via `as any`): **`pharmacy_otc_subscriptions`**, **`otc_subscription_plans`**.

**View:** `product_sales_summary` (id, name, stockist_id, total_sold, order_count, days_in_inventory, last_sold_date) — defined but not read by any page.

**Functions (RPC):** check_credit_limit, get_next_bill_number, get_next_order_number, get_pharmacy_credit_utilization, has_role, update_bill_statuses, update_overdue_bills.

---

## EXPANSION — Code-Derived Additions (Audit Pass)

*Audit date: 2026-07-04. Content derived exclusively from source under `stockistpayments/`. Documents implemented behavior only.*

### E.1 Complete Route Table

**Frontend routes extracted:** 37 | **Server API routes:** 6 (Supabase edge functions)

| # | Path | Component | Role/Gate | Source |
|---|------|-----------|-----------|--------|
| 1 | `/auth` | Auth | — | `src/App.tsx` |
| 2 | `/onboarding` | OnboardingSelectRole | ProtectedRoute (auth required) | `src/App.tsx` |
| 3 | `/` | DashboardRouter | ProtectedRoute (auth required) | `src/App.tsx` |
| 4 | `/dashboard` | DashboardRouter | ProtectedRoute (auth required) | `src/App.tsx` |
| 5 | `/pharmacies` | Pharmacies | ProtectedRoute (auth required) | `src/App.tsx` |
| 6 | `/pharmacies/new` | PharmacyForm | ProtectedRoute (auth required) | `src/App.tsx` |
| 7 | `/pharmacy/:id` | PharmacyDetail | ProtectedRoute (auth required) | `src/App.tsx` |
| 8 | `/bills/new` | BillForm | ProtectedRoute (auth required) | `src/App.tsx` |
| 9 | `/payments` | Payments | ProtectedRoute (auth required) | `src/App.tsx` |
| 10 | `/profile` | Profile | ProtectedRoute (auth required) | `src/App.tsx` |
| 11 | `/catalogue` | Catalogue | ProtectedRoute (auth required) | `src/App.tsx` |
| 12 | `/marketplace` | Marketplace | ProtectedRoute (auth required) | `src/App.tsx` |
| 13 | `/marketplace-browse` | Navigate | — | `src/App.tsx` |
| 14 | `/marketplace/products` | MarketplaceProducts | ProtectedRoute (auth required) | `src/App.tsx` |
| 15 | `/seller/:sellerId` | SellerDetail | ProtectedRoute (auth required) | `src/App.tsx` |
| 16 | `/cart` | Cart | ProtectedRoute (auth required) | `src/App.tsx` |
| 17 | `/checkout` | Checkout | ProtectedRoute (auth required) | `src/App.tsx` |
| 18 | `/my-products` | MyProducts | ProtectedRoute (auth required) | `src/App.tsx` |
| 19 | `/marketplace/product/new` | ProductForm | ProtectedRoute (auth required) | `src/App.tsx` |
| 20 | `/marketplace/product/:id` | ProductForm | ProtectedRoute (auth required) | `src/App.tsx` |
| 21 | `/marketplace/order/new` | OrderForm | ProtectedRoute (auth required) | `src/App.tsx` |
| 22 | `/orders` | Orders | ProtectedRoute (auth required) | `src/App.tsx` |
| 23 | `/notifications` | Notifications | ProtectedRoute (auth required) | `src/App.tsx` |
| 24 | `/my-customers` | MyCustomers | ProtectedRoute (auth required) | `src/App.tsx` |
| 25 | `/my-suppliers` | MySuppliers | ProtectedRoute (auth required) | `src/App.tsx` |
| 26 | `/analytics` | Analytics | ProtectedRoute (auth required) | `src/App.tsx` |
| 27 | `/support` | Support | ProtectedRoute (auth required) | `src/App.tsx` |
| 28 | `/otc-partnership` | OTCPartnership | ProtectedRoute (auth required) | `src/App.tsx` |
| 29 | `/otc` | Navigate | — | `src/App.tsx` |
| 30 | `/delivery-planner` | DeliveryPlanner | ProtectedRoute (auth required) | `src/App.tsx` |
| 31 | `/settings` | Settings | ProtectedRoute (auth required) | `src/App.tsx` |
| 32 | `/reports` | Reports | ProtectedRoute (auth required) | `src/App.tsx` |
| 33 | `/admin/dashboard` | AdminDashboard | ProtectedRoute (auth required) | `src/App.tsx` |
| 34 | `/admin/users` | UserManagement | ProtectedRoute (auth required) | `src/App.tsx` |
| 35 | `/admin/support` | SupportManagement | ProtectedRoute (auth required) | `src/App.tsx` |
| 36 | `/admin/role-audit` | RoleAudit | ProtectedRoute (auth required) | `src/App.tsx` |
| 37 | `*` | NotFound | — | `src/App.tsx` |

### E.2 Entity / Table Catalog

**Tables/schemas found:** 19

#### `bills`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `bill_date` | `string` |
| `bill_number` | `string` |
| `created_at` | `string | null` |
| `due_amount` | `number` |
| `id` | `string` |
| `last_reminder_sent` | `string | null` |
| `next_payment_date` | `string | null` |
| `payment_terms_days` | `number | null` |
| `pharmacy_id` | `string` |
| `received_amount` | `number | null` |
| `remaining_due_date` | `string | null` |
| `reminder_count` | `number | null` |
| `status` | `string | null` |
| `total_amount` | `number` |
| `upfront_amount` | `number | null` |
| `upfront_percentage` | `number | null` |
| `upi_payment_link` | `string | null` |

#### `cart_items`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `buyer_id` | `string` |
| `created_at` | `string | null` |
| `id` | `string` |
| `product_id` | `string` |
| `quantity` | `number` |
| `seller_id` | `string` |
| `updated_at` | `string | null` |

#### `order_items`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `id` | `string` |
| `order_id` | `string` |
| `price` | `number` |
| `product_id` | `string` |
| `quantity` | `number` |
| `subtotal` | `number` |

#### `orders`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `buyer_id` | `string | null` |
| `created_at` | `string | null` |
| `delivered_at` | `string | null` |
| `delivery_address` | `string | null` |
| `delivery_status` | `string | null` |
| `delivery_tracking_id` | `string | null` |
| `discount_amount` | `number | null` |
| `id` | `string` |
| `notes` | `string | null` |
| `order_number` | `string` |
| `pharmacy_id` | `string` |
| `seller_id` | `string | null` |
| `seller_type` | `string | null` |
| `status` | `string | null` |
| `stockist_id` | `string` |
| `tax_amount` | `number | null` |
| `total_amount` | `number` |

#### `otc_brands`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `commission_rate` | `number` |
| `created_at` | `string | null` |
| `description` | `string | null` |
| `id` | `string` |
| `is_active` | `boolean | null` |
| `logo_url` | `string | null` |
| `name` | `string` |

#### `otc_inventory`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `brand_id` | `string` |
| `category` | `string | null` |
| `created_at` | `string | null` |
| `id` | `string` |
| `mrp` | `number` |
| `pharmacy_id` | `string` |
| `product_name` | `string` |
| `quantity_in_stock` | `number` |
| `quantity_sold` | `number` |
| `updated_at` | `string | null` |

#### `otc_shipment_items`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `id` | `string` |
| `inventory_id` | `string` |
| `quantity` | `number` |
| `shipment_id` | `string` |
| `unit_price` | `number` |

#### `otc_shipments`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `brand_id` | `string` |
| `created_at` | `string | null` |
| `delivered_at` | `string | null` |
| `expected_delivery_date` | `string | null` |
| `id` | `string` |
| `pharmacy_id` | `string` |
| `shipment_number` | `string` |
| `status` | `string` |
| `total_items` | `number` |
| `total_value` | `number` |

#### `payment_reminders`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `bill_id` | `string` |
| `created_at` | `string` |
| `id` | `string` |
| `message_content` | `string` |
| `reminder_type` | `string` |
| `sent_at` | `string` |
| `sent_via` | `string` |
| `status` | `string` |

#### `payment_requests`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `bill_id` | `string` |
| `created_at` | `string | null` |
| `id` | `string` |
| `paid_at` | `string | null` |
| `payment_link` | `string` |
| `reminder_history` | `Json | null` |
| `reminder_sent_at` | `string | null` |
| `requested_amount` | `number` |
| `status` | `string | null` |

#### `pharmacies`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `address` | `string | null` |
| `avg_payment_days` | `number | null` |
| `created_at` | `string | null` |
| `email` | `string | null` |
| `id` | `string` |
| `license_number` | `string | null` |
| `max_credit_limit` | `number | null` |
| `mr_id` | `string` |
| `name` | `string` |
| `owner_name` | `string | null` |
| `payment_behavior_score` | `number | null` |
| `phone` | `string` |

#### `product_sales_summary`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `days_in_inventory` | `number | null` |
| `id` | `string | null` |
| `last_sold_date` | `string | null` |
| `name` | `string | null` |
| `order_count` | `number | null` |
| `stockist_id` | `string | null` |
| `total_sold` | `number | null` |

#### `products`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `batch_number` | `string | null` |
| `brand_name` | `string | null` |
| `category` | `Database["public"]["Enums"]["product_category"]` |
| `created_at` | `string | null` |
| `description` | `string | null` |
| `discount_percentage` | `number | null` |
| `expiry_date` | `string | null` |
| `id` | `string` |
| `image_url` | `string | null` |
| `is_active` | `boolean | null` |
| `is_available` | `boolean | null` |
| `max_order_quantity` | `number | null` |
| `min_order_quantity` | `number | null` |
| `mrp` | `number | null` |
| `name` | `string` |
| `price` | `number` |
| `purchase_rate` | `number | null` |
| `sale_rate` | `number | null` |
| `salt_name` | `string | null` |
| `seller_type` | `string | null` |
| `stock_quantity` | `number | null` |
| `stockist_id` | `string` |
| `type` | `string | null` |
| `unit` | `string` |
| `updated_at` | `string | null` |
| `uses` | `string | null` |

#### `profiles`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `bank_account_holder_name` | `string | null` |
| `bank_account_number` | `string | null` |
| `bank_ifsc_code` | `string | null` |
| `business_name` | `string | null` |
| `business_type` | `string | null` |
| `created_at` | `string | null` |
| `customer_count` | `number | null` |
| `email` | `string` |
| `id` | `string` |
| `is_catalogue_live` | `boolean | null` |
| `is_verified` | `boolean | null` |
| `max_customers_free_tier` | `number | null` |
| `name` | `string` |
| `payment_enabled` | `boolean | null` |
| `phone` | `string` |
| `stockist_license_url` | `string | null` |
| `subscription_expires_at` | `string | null` |
| `subscription_payment_proof_url` | `string | null` |
| `subscription_payment_status` | `string | null` |
| `subscription_tier` | `string | null` |
| `upi_id` | `string` |
| `username` | `string` |
| `verification_document_url` | `string | null` |

#### `seller_buyer_relationships`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `buyer_id` | `string` |
| `buyer_type` | `string` |
| `created_at` | `string | null` |
| `credit_limit` | `number | null` |
| `id` | `string` |
| `is_favorite` | `boolean | null` |
| `seller_id` | `string` |

#### `store_settings`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string | null` |
| `delivery_areas` | `string[] | null` |
| `id` | `string` |
| `is_accepting_orders` | `boolean | null` |
| `minimum_order_value` | `number | null` |
| `seller_id` | `string` |
| `store_description` | `string | null` |
| `store_name` | `string` |

#### `subscription_requests`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `amount` | `number | null` |
| `approved_at` | `string | null` |
| `approved_by` | `string | null` |
| `id` | `string` |
| `payment_proof_url` | `string | null` |
| `payment_utr` | `string | null` |
| `rejection_reason` | `string | null` |
| `requested_at` | `string | null` |
| `status` | `string | null` |
| `user_id` | `string` |

#### `support_tickets`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `assigned_to` | `string | null` |
| `category` | `string` |
| `created_at` | `string` |
| `description` | `string` |
| `id` | `string` |
| `priority` | `string` |
| `resolved_at` | `string | null` |
| `status` | `string` |
| `subject` | `string` |
| `updated_at` | `string` |
| `user_id` | `string` |

#### `user_roles`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string | null` |
| `id` | `string` |
| `role` | `Database["public"]["Enums"]["app_role"]` |
| `user_id` | `string` |

### E.3 API / Backend Surface

#### Supabase Edge Functions

| Function | Lines | CORS | Auth | Notes |
|----------|-------|------|------|-------|
| `admin-wipe` | 120 | yes | auth | — |
| `assign-role` | 107 | yes | auth | — |
| `autocomplete-product` | 103 | yes | public | — |
| `delete-my-account` | 82 | yes | auth | — |
| `initialize-otc-inventory` | 177 | yes | auth | — |
| `ocr-product-label` | 237 | yes | auth | — |

### E.4 Auth, Roles, and Permissions

#### Roles referenced in code

- `admin`
- `alert`
- `analgesics`
- `antipyretics`
- `cardiovascular`
- `diabetes`
- `distributor`
- `gastrointestinal`
- `group`
- `iv_antibiotics`
- `link`
- `mr`
- `navigation`
- `oral_antibiotics`
- `other`
- `pharmacy`
- `presentation`
- `region`
- `respiratory`
- `separator`
- `stockist`
- `system`
- `user`
- `vitamins_supplements`

#### RLS policies (migrations)

- `Users can view own profile` → table `public` (`20251010110040_39014fa7-ea8a-42c5-b4aa-73ed4fed4f9b.sql`)
- `Users can update own profile` → table `public` (`20251010110040_39014fa7-ea8a-42c5-b4aa-73ed4fed4f9b.sql`)
- `Users can insert own profile` → table `public` (`20251010110040_39014fa7-ea8a-42c5-b4aa-73ed4fed4f9b.sql`)
- `MRs can view own pharmacies` → table `public` (`20251010110040_39014fa7-ea8a-42c5-b4aa-73ed4fed4f9b.sql`)
- `MRs can create pharmacies` → table `public` (`20251010110040_39014fa7-ea8a-42c5-b4aa-73ed4fed4f9b.sql`)
- `MRs can update own pharmacies` → table `public` (`20251010110040_39014fa7-ea8a-42c5-b4aa-73ed4fed4f9b.sql`)
- `MRs can delete own pharmacies` → table `public` (`20251010110040_39014fa7-ea8a-42c5-b4aa-73ed4fed4f9b.sql`)
- `MRs can view bills for own pharmacies` → table `public` (`20251010110040_39014fa7-ea8a-42c5-b4aa-73ed4fed4f9b.sql`)
- `MRs can create bills for own pharmacies` → table `public` (`20251010110040_39014fa7-ea8a-42c5-b4aa-73ed4fed4f9b.sql`)
- `MRs can update bills for own pharmacies` → table `public` (`20251010110040_39014fa7-ea8a-42c5-b4aa-73ed4fed4f9b.sql`)
- `MRs can delete bills for own pharmacies` → table `public` (`20251010110040_39014fa7-ea8a-42c5-b4aa-73ed4fed4f9b.sql`)
- `MRs can view payment requests for own bills` → table `public` (`20251010110040_39014fa7-ea8a-42c5-b4aa-73ed4fed4f9b.sql`)
- `MRs can create payment requests for own bills` → table `public` (`20251010110040_39014fa7-ea8a-42c5-b4aa-73ed4fed4f9b.sql`)
- `MRs can update payment requests for own bills` → table `public` (`20251010110040_39014fa7-ea8a-42c5-b4aa-73ed4fed4f9b.sql`)
- `Users can upload own license` → table `storage` (`20251010110040_39014fa7-ea8a-42c5-b4aa-73ed4fed4f9b.sql`)
- `Users can view own license` → table `storage` (`20251010110040_39014fa7-ea8a-42c5-b4aa-73ed4fed4f9b.sql`)
- `Users can update own license` → table `storage` (`20251010110040_39014fa7-ea8a-42c5-b4aa-73ed4fed4f9b.sql`)
- `MRs can view reminders for own bills` → table `public` (`20251010133451_2fc99335-fd6a-4e70-8641-f258a2412fd1.sql`)
- `MRs can create reminders for own bills` → table `public` (`20251010133451_2fc99335-fd6a-4e70-8641-f258a2412fd1.sql`)
- `Stockists can view all products` → table `public` (`20251013140236_37dce949-a54c-4a3d-b349-3ccb59fd5565.sql`)
- `Stockists can create own products` → table `public` (`20251013140236_37dce949-a54c-4a3d-b349-3ccb59fd5565.sql`)
- `Stockists can update own products` → table `public` (`20251013140236_37dce949-a54c-4a3d-b349-3ccb59fd5565.sql`)
- `Stockists can delete own products` → table `public` (`20251013140236_37dce949-a54c-4a3d-b349-3ccb59fd5565.sql`)
- `Stockists can view own orders` → table `public` (`20251013140236_37dce949-a54c-4a3d-b349-3ccb59fd5565.sql`)
- `Stockists can create orders` → table `public` (`20251013140236_37dce949-a54c-4a3d-b349-3ccb59fd5565.sql`)
- `Stockists can update own orders` → table `public` (`20251013140236_37dce949-a54c-4a3d-b349-3ccb59fd5565.sql`)
- `Users can view order items for own orders` → table `public` (`20251013140236_37dce949-a54c-4a3d-b349-3ccb59fd5565.sql`)
- `Users can create order items for own orders` → table `public` (`20251013140236_37dce949-a54c-4a3d-b349-3ccb59fd5565.sql`)
- `Anyone can view product images` → table `storage` (`20251014014443_977ef39a-17f2-46db-9c26-85407323eead.sql`)
- `Authenticated users can upload product images` → table `storage` (`20251014014443_977ef39a-17f2-46db-9c26-85407323eead.sql`)
- `Users can update their own product images` → table `storage` (`20251014014443_977ef39a-17f2-46db-9c26-85407323eead.sql`)
- `Users can delete their own product images` → table `storage` (`20251014014443_977ef39a-17f2-46db-9c26-85407323eead.sql`)
- `Users can view own roles` → table `public` (`20251017155144_293d1676-7858-4667-9dee-889afd356a77.sql`)
- `Users can insert own roles during signup` → table `public` (`20251017155144_293d1676-7858-4667-9dee-889afd356a77.sql`)
- `Users can view own subscription requests` → table `public` (`20251017155144_293d1676-7858-4667-9dee-889afd356a77.sql`)
- `Users can create subscription requests` → table `public` (`20251017155144_293d1676-7858-4667-9dee-889afd356a77.sql`)
- `Admins can view all subscription requests` → table `public` (`20251017155144_293d1676-7858-4667-9dee-889afd356a77.sql`)
- `Admins can update subscription requests` → table `public` (`20251017155144_293d1676-7858-4667-9dee-889afd356a77.sql`)
- `Sellers can view orders where they are seller` → table `public` (`20251017155144_293d1676-7858-4667-9dee-889afd356a77.sql`)
- `Buyers can view orders where they are buyer` → table `public` (`20251017155144_293d1676-7858-4667-9dee-889afd356a77.sql`)
- `Buyers can create orders` → table `public` (`20251017155144_293d1676-7858-4667-9dee-889afd356a77.sql`)
- `Sellers can update their orders` → table `public` (`20251017155144_293d1676-7858-4667-9dee-889afd356a77.sql`)
- `Sellers can view own relationships` → table `public` (`20251017155144_293d1676-7858-4667-9dee-889afd356a77.sql`)
- `Buyers can view own relationships` → table `public` (`20251017155144_293d1676-7858-4667-9dee-889afd356a77.sql`)
- `Sellers can manage relationships` → table `public` (`20251017155144_293d1676-7858-4667-9dee-889afd356a77.sql`)
- `Sellers can view own store settings` → table `public` (`20251017155144_293d1676-7858-4667-9dee-889afd356a77.sql`)
- `Sellers can manage own store settings` → table `public` (`20251017155144_293d1676-7858-4667-9dee-889afd356a77.sql`)
- `Everyone can view live stores` → table `public` (`20251017155144_293d1676-7858-4667-9dee-889afd356a77.sql`)
- `Buyers can manage own cart` → table `public` (`20251017155144_293d1676-7858-4667-9dee-889afd356a77.sql`)
- `Authenticated users can upload licenses` → table `storage` (`20251017161317_ff5cf58c-5598-4a06-86fb-3b2361554480.sql`)
- `Users can view own licenses` → table `storage` (`20251017161317_ff5cf58c-5598-4a06-86fb-3b2361554480.sql`)
- `Users can update own licenses` → table `storage` (`20251017161317_ff5cf58c-5598-4a06-86fb-3b2361554480.sql`)
- `Users can delete own licenses` → table `storage` (`20251017161317_ff5cf58c-5598-4a06-86fb-3b2361554480.sql`)
- `Users can view own tickets` → table `public` (`20251017174150_e9d19ffa-f83c-4bc2-b86c-acf638e283fd.sql`)
- `Users can create tickets` → table `public` (`20251017174150_e9d19ffa-f83c-4bc2-b86c-acf638e283fd.sql`)
- `Users can update own open tickets` → table `public` (`20251017174150_e9d19ffa-f83c-4bc2-b86c-acf638e283fd.sql`)
- `Admins can view all tickets` → table `public` (`20251017174150_e9d19ffa-f83c-4bc2-b86c-acf638e283fd.sql`)
- `Admins can update all tickets` → table `public` (`20251017174150_e9d19ffa-f83c-4bc2-b86c-acf638e283fd.sql`)
- `Sellers can view own products` → table `public` (`20251017181035_ccfcc0fb-d0b3-4559-a789-8de1e2874145.sql`)
- `Sellers can create own products` → table `public` (`20251017181035_ccfcc0fb-d0b3-4559-a789-8de1e2874145.sql`)
- `Sellers can update own products` → table `public` (`20251017181035_ccfcc0fb-d0b3-4559-a789-8de1e2874145.sql`)
- `Sellers can delete own products` → table `public` (`20251017181035_ccfcc0fb-d0b3-4559-a789-8de1e2874145.sql`)
- `Pharmacy users can view marketplace products` → table `public` (`20251017181035_ccfcc0fb-d0b3-4559-a789-8de1e2874145.sql`)
- `Users can view own profile` → table `public` (`20251017181035_ccfcc0fb-d0b3-4559-a789-8de1e2874145.sql`)
- `Pharmacy users can view seller profiles` → table `public` (`20251017181035_ccfcc0fb-d0b3-4559-a789-8de1e2874145.sql`)
- `Buyers can manage own relationships` → table `public` (`20251017181035_ccfcc0fb-d0b3-4559-a789-8de1e2874145.sql`)
- `Buyers can view seller info` → table `public` (`20251017181035_ccfcc0fb-d0b3-4559-a789-8de1e2874145.sql`)
- `Pharmacy users can view seller profiles` → table `public` (`20251017184343_0498e535-b2ef-4d0f-84f0-52b41d92ba1d.sql`)
- `Pharmacy users can view marketplace products` → table `public` (`20251017184343_0498e535-b2ef-4d0f-84f0-52b41d92ba1d.sql`)
- `Pharmacy users can view all seller products` → table `products` (`20251018111619_ceb16f89-7679-427a-8f44-0073ccb83b2a.sql`)
- `Users can insert own roles during signup` → table `public` (`20251019105629_87fa3f4c-79c1-4e5b-a996-48c0a3eacea7.sql`)
- `Admins can view all products` → table `public` (`20251019105629_87fa3f4c-79c1-4e5b-a996-48c0a3eacea7.sql`)
- `Admins can view all profiles` → table `public` (`20251019105629_87fa3f4c-79c1-4e5b-a996-48c0a3eacea7.sql`)
- `Admins can view all pharmacies` → table `public` (`20251019105629_87fa3f4c-79c1-4e5b-a996-48c0a3eacea7.sql`)
- `Admins can view all orders` → table `public` (`20251019105629_87fa3f4c-79c1-4e5b-a996-48c0a3eacea7.sql`)
- `Admins can view all order items` → table `public` (`20251019105629_87fa3f4c-79c1-4e5b-a996-48c0a3eacea7.sql`)
- `Admins can view all bills` → table `public` (`20251019105629_87fa3f4c-79c1-4e5b-a996-48c0a3eacea7.sql`)
- `Admins can view all payment requests` → table `public` (`20251019105629_87fa3f4c-79c1-4e5b-a996-48c0a3eacea7.sql`)
- `Admins can view all payment reminders` → table `public` (`20251019105629_87fa3f4c-79c1-4e5b-a996-48c0a3eacea7.sql`)
- `Admins can view all relationships` → table `public` (`20251019105629_87fa3f4c-79c1-4e5b-a996-48c0a3eacea7.sql`)
- *+15 additional policies*

### E.5 Workflows and State Machines

#### `category`

`billing` → `bug` → `feature_request` → `general` → `technical`

#### `priority`

`high` → `low` → `medium` → `urgent`

#### `reminder_type`

`followup` → `initial` → `overdue`

#### `sent_via`

`sms` → `whatsapp`

#### `status`

`cancelled` → `closed` → `delivered` → `draft` → `failed` → `in_progress` → `in_transit` → `open` → `overdue` → `paid` → `pending` → `resolved` → `sent`

#### `status_values`

`active` → `approved` → `cancelled` → `confirmed` → `delivered` → `draft` → `paid` → `pending` → `rejected`

#### Edge-function status mutations

- `initialize-otc-inventory`: `delivered`

### E.6 Dashboards, Reports, and Formulas

**Extracted calculation lines:** 328

#### `src/App.tsx`

- L310: `path="/delivery-planner"`

#### `src/components/ActivityFeed.tsx`

- L126: `case 'payment': return CreditCard;`

#### `src/components/BulkUploadModal.tsx`

- L43: `const [uploadSummary, setUploadSummary] = useState<{`
- L114: `let successCount = 0;`
- L115: `let errorCount = 0;`
- L285: `<Label className="text-base">Upload Summary</Label>`
- L291: `<p className="text-2xl font-bold text-green-600">{uploadSummary.success}</p>`
- L298: `<p className="text-2xl font-bold text-destructive">{uploadSummary.failed}</p>`
- L306: `{uploadSummary.errors.slice(0, 10).map((error, idx) => (`

#### `src/components/Layout.tsx`

- L97: `if (navPath === "/delivery-planner") {`
- L98: `return path === "/delivery-planner";`

#### `src/components/PaymentProcessModal.tsx`

- L42: `const totalAmount = payments.reduce((sum, p) => sum + p.amount, 0);`
- L82: `<span className="text-primary">₹{totalAmount.toLocaleString("en-IN")}</span>`

#### `src/components/PharmacyCard.tsx`

- L18: `const creditUtilization = pharmacy.max_credit_limit`
- L25: `style={{ borderLeftColor: creditUtilization > 80 ? 'hsl(var(--destructive))' : creditUtilization > 50 ? 'hsl(var(--warning))' : 'hsl(var(--success))' }}`
- L42: `variant={creditUtilization > 80 ? "destructive" : creditUtilization > 50 ? "secondary" : "default"}`
- L111: `<span className="text-muted-foreground">Credit Limit</span>`

#### `src/components/QuickBillModal.tsx`

- L95: `const totalAmount = billItems.reduce((sum, item) => sum + (item.quantity * item.price), 0);`
- L282: `<span className="font-medium">Total Amount:</span>`
- L283: `<span className="text-xl font-bold">₹{totalAmount.toLocaleString("en-IN")}</span>`

#### `src/components/QuickOrderModal.tsx`

- L110: `let totalAmount = 0;`
- L122: `const itemTotal = product.sale_rate * item.quantity;`
- L123: `totalAmount += itemTotal;`
- L335: `<p>Amount: <span className="font-bold text-lg">₹{generatedBill.total_amount.toLocaleString("en-IN")}</span></p>`

#### `src/components/UpdateBillModal.tsx`

- L56: `<span className="text-muted-foreground">Total Due:</span>`

#### `src/pages/Analytics.tsx`

- L61: `const { data: stats, isLoading } = useQuery({`
- L73: `const totalRevenue = orders?.reduce((sum, order) => sum + Number(order.total_amount), 0) || 0;`
- L74: `const ordersCount = orders?.length || 0;`
- L77: `const ordersByStatus = orders?.reduce((acc: any, order) => {`
- L82: `const statusData = Object.entries(ordersByStatus || {}).map(([status, count]) => ({`
- L98: `const revenue = dayOrders.reduce((sum, order) => sum + Number(order.total_amount), 0);`
- L115: `const productStats = orderItems?.reduce((acc: any, item: any) => {`
- L121: `acc[productName].revenue += Number(item.subtotal);`
- L125: `const topProducts = Object.values(productStats || {})`
- L135: `const customersCount = relationships?.length || 0;`
- L198: `<div className="text-2xl font-bold">{stats?.ordersCount || 0}</div>`
- L210: `<div className="text-2xl font-bold">{stats?.customersCount || 0}</div>`
- L222: `<div className="text-2xl font-bold">{stats?.productsCount || 0}</div>`
- L245: `<LineChart data={stats?.revenueByDay || []}>`
- L273: `data={stats?.statusData || []}`
- L282: `{(stats?.statusData || []).map((entry: any, index: number) => (`
- L300: `<BarChart data={stats?.topProducts || []}>`

#### `src/pages/BillForm.tsx`

- L75: `const previousDue = bills?.reduce((sum, bill) => sum + Number(bill.due_amount) - Number(bill.received_amount || 0), 0) || 0;`
- L100: `const totalAmount = Number(formData.total_amount);`
- L102: `const upfrontAmount = (totalAmount * upfrontPercentage) / 100;`
- L103: `const dueAmount = formData.previous_due + totalAmount - upfrontAmount;`
- L156: `const upfrontAmount = (Number(formData.total_amount || 0) * Number(formData.upfront_percentage)) / 100;`
- L157: `const calculatedDue = formData.previous_due + Number(formData.total_amount || 0) - upfrontAmount;`
- L158: `const exceedsLimit = calculatedDue > formData.max_credit_limit;`
- L220: `<Label htmlFor="total_amount">`
- L221: `Total Amount <span className="text-destructive">*</span>`
- L224: `id="total_amount"`
- L227: `value={formData.total_amount}`
- L228: `onChange={(e) => setFormData({ ...formData, total_amount: e.target.value })}`
- L236: `<h3 className="font-semibold text-sm">Cash Discount (CD) & Payment Terms</h3>`
- L301: `<span className="text-muted-foreground">Credit Limit:</span>`
- L302: `<span className="font-medium">₹{formData.max_credit_limit.toLocaleString("en-IN")}</span>`

#### `src/pages/Cart.tsx`

- L56: `const groupedItems = cartItems?.reduce((acc, item) => {`
- L68: `const calculateTotal = () => {`
- L69: `return cartItems?.reduce((sum, item) => {`
- L70: `const discount = item.product.discount_percentage || 0;`
- L71: `const price = item.product.price * (1 - discount / 100);`
- L72: `return sum + price * item.quantity;`
- L123: `const discount = item.product.discount_percentage || 0;`
- L124: `const price = item.product.price * (1 - discount / 100);`
- L203: `<span className="font-semibold text-foreground">Subtotal</span>`
- L207: `.reduce((sum: number, item: any) => {`
- L208: `const discount = item.product.discount_percentage || 0;`
- L209: `const price = item.product.price * (1 - discount / 100);`
- L210: `return sum + price * item.quantity;`
- L223: `<span className="text-lg font-semibold text-foreground">Grand Total</span>`

#### `src/pages/Catalogue.tsx`

- L180: `const activeFiltersCount = selectedBrands.length + selectedTypes.length +`
- L225: `variant={activeFiltersCount > 0 ? "default" : "outline"}`

#### `src/pages/Checkout.tsx`

- L19: `const [deliveryAddress, setDeliveryAddress] = useState("");`
- L65: `const totalAmount = cartItems.reduce((sum, item) => {`
- L66: `const discount = item.product.discount_percentage || 0;`
- L67: `const price = item.product.price * (1 - discount / 100);`
- L68: `return sum + price * item.quantity;`
- L72: `const { count } = await supabase`
- L77: `const orderNumber = `ORD/${String((count || 0) + 1).padStart(4, "0")}`;`
- L101: `const discount = item.product.discount_percentage || 0;`
- L102: `const price = item.product.price * (1 - discount / 100);`
- L140: `const calculateGrandTotal = () => {`
- L141: `return cartItems?.reduce((sum, item) => {`
- L142: `const discount = item.product.discount_percentage || 0;`
- L143: `const price = item.product.price * (1 - discount / 100);`
- L144: `return sum + price * item.quantity;`
- L175: `const groupedItems = cartItems?.reduce((acc, item) => {`
- L207: `placeholder="Enter complete delivery address with landmarks"`
- L208: `value={deliveryAddress}`
- L209: `onChange={(e) => setDeliveryAddress(e.target.value)}`
- L242: `<h2 className="text-lg font-semibold">Order Summary</h2>`
- L245: `const subtotal = group.items.reduce((sum: number, item: any) => {`
- L246: `const discount = item.product.discount_percentage || 0;`
- L247: `const price = item.product.price * (1 - discount / 100);`
- L248: `return sum + price * item.quantity;`
- L261: `const discount = item.product.discount_percentage || 0;`
- L262: `const price = item.product.price * (1 - discount / 100);`
- L282: `<span className="font-semibold">Subtotal</span>`
- L317: `disabled={!deliveryAddress || placeOrderMutation.isPending}`

#### `src/pages/Dashboard.tsx`

- L24: `const { data: stats, isLoading } = useQuery({`
- L40: `const totalPending = bills`
- L42: `.reduce((sum: number, bill: any) =>`
- L47: `const totalReceived = bills.reduce(`
- L48: `(sum: number, bill: any) => sum + Number(bill.received_amount || 0),`
- L63: `const todayDueCount = dueTodayBills.length;`
- L64: `const todayDueAmount = dueTodayBills.reduce(`
- L65: `(sum: number, b: any) => sum + (Number(b.due_amount) - Number(b.received_amount || 0)),`
- L73: `const overdueCount = overdueBills.length;`
- L76: `const totalBilled = totalPending + totalReceived;`
- L77: `const collectionRate = totalBilled > 0`
- L88: `const totalProducts = productsData?.length || 0;`
- L89: `const totalStock = productsData?.reduce((sum, p) => sum + (p.stock_quantity || 0), 0) || 0;`
- L90: `const stockValue = productsData?.reduce((sum, p) => sum + ((p.stock_quantity || 0) * Number(p.price || 0)), 0) || 0;`
- L148: `let totalOutstanding = 0;`
- L154: `totalOutstanding += Number(bill.due_amount) - Number(bill.received_amount || 0);`
- L176: `}).filter((p: any) => p.totalOutstanding > 0)`
- L249: `<CardTitle className="text-xs font-medium text-muted-foreground">Total Pending</CardTitle>`
- L266: `<div className="text-xl font-bold">{stats?.paymentsDueToday || 0}</div>`
- L303: `{stats?.paymentsDueToday || 0} payment{(stats?.paymentsDueToday || 0) === 1 ? "" : "s"} to collect, total ₹{Number(stats?.todayDueAmount || 0).toLocaleString("e`
- L318: `<div className="text-xl font-bold">{stats.totalProducts}</div>`
- L325: `<CardTitle className="text-xs font-medium text-muted-foreground">Total Stock</CardTitle>`
- L328: `<div className="text-xl font-bold">{stats.totalStock.toLocaleString("en-IN")}</div>`
- L360: `<h2 className="text-base font-semibold mb-3">Pharmacies with Outstanding Payments</h2>`
- L381: `<p className="text-sm text-muted-foreground">Outstanding</p>`
- L422: `: `You're managing ${stats.totalPharmacies} ${stats.totalPharmacies === 1 ? 'pharmacy' : 'pharmacies'} with no outstanding payments.`}`

#### `src/pages/DeliveryPlanner.tsx`

- L53: `const totalDistance = Math.floor(Math.random() * 50) + 10;`
- L54: `const estimatedTime = Math.floor(totalDistance * 2.5);`
- L80: `<h1 className="text-2xl font-bold">Delivery Route Planner</h1>`
- L110: `<p className="text-xs text-muted-foreground">Total Stops</p>`
- L120: `<p className="text-lg font-bold">{optimizedRoute.totalDistance} km</p>`

#### `src/pages/Marketplace.tsx`

- L48: `const { data: productsCount } = useQuery({`
- L55: `const counts: Record<string, number> = {};`
- L57: `counts[p.stockist_id] = (counts[p.stockist_id] || 0) + 1;`

#### `src/pages/MarketplaceProducts.tsx`

- L173: `const cartItemCount = cartItems?.reduce((sum, item) => sum + item.quantity, 0) || 0;`

#### `src/pages/MyCustomers.tsx`

- L51: `const outstandingMap = new Map();`
- L53: `const outstanding = bill.due_amount - (bill.received_amount || 0);`
- L54: `const current = outstandingMap.get(bill.pharmacy_id) || 0;`
- L122: `message={`Hi ${buyer?.name}, this is regarding your account with us.`}`
- L137: `<p className="text-xs text-muted-foreground">Outstanding</p>`
- L144: `<p className="text-xs text-muted-foreground">Credit Limit</p>`
- L161: `style={{ width: `${Math.min((relationship.outstanding / relationship.credit_limit) * 100, 100)}%` }}`

#### `src/pages/MyProducts.tsx`

- L165: `const canGoLive = profile?.bank_account_number &&`

#### `src/pages/MySuppliers.tsx`

- L55: `const { data: orderStats } = useQuery({`
- L65: `const stats: Record<string, any> = {};`
- L68: `stats[order.seller_id] = {`
- L75: `stats[order.seller_id].totalSpent += order.total_amount;`
- L77: `stats[order.seller_id].pendingPayment += order.total_amount;`
- L132: `const stats = orderStats?.[item.seller_id] || {`
- L172: `<p className="text-muted-foreground">Total Orders</p>`
- L178: `<p className="text-muted-foreground">Total Spent</p>`

#### `src/pages/Notifications.tsx`

- L42: `return <CreditCard className="h-5 w-5 text-accent" />;`
- L65: `const unreadCount = notifications.filter(n => !n.read).length;`

#### `src/pages/OrderForm.tsx`

- L100: `const totalAmount = orderItems.reduce(`
- L101: `(sum, item) => sum + item.quantity * item.price,`
- L128: `const totalForOrder = cleanedItems.reduce(`
- L129: `(sum, item) => sum + item.quantity * item.price,`
- L312: `<span className="font-medium">Total Amount:</span>`

#### `src/pages/Orders.tsx`

- L114: `const updateDeliveryStatusMutation = useMutation({`
- L116: `const updates: any = { delivery_status: status };`
- L121: `updates.delivery_tracking_id = trackingId;`
- L215: `const message = `Hi! Payment link for order ${order.order_number} (₹${Number(order.total_amount).toLocaleString("en-IN")}): ${paymentLink}`;`
- L244: `return order.delivery_status === activeTab;`
- L328: `<span className="font-medium">Total:</span>`
- L436: `<h4 className="font-semibold mb-2">Delivery Address</h4>`
- L437: `<p className="text-sm p-3 bg-muted/50 rounded">{selectedOrder.delivery_address}</p>`
- L451: `<p className="text-sm font-mono p-3 bg-muted/50 rounded">{selectedOrder.delivery_tracking_id}</p>`
- L456: `<span className="text-lg font-semibold">Total Amount</span>`
- L465: `{selectedOrder.delivery_status === "pending" && (`
- L467: `onClick={() => updateDeliveryStatusMutation.mutate({`
- L472: `disabled={updateDeliveryStatusMutation.isPending}`
- L478: `{selectedOrder.delivery_status === "confirmed" && (`
- L480: `onClick={() => updateDeliveryStatusMutation.mutate({`
- L485: `disabled={updateDeliveryStatusMutation.isPending}`
- L491: `{(selectedOrder.delivery_status === "packed" ||`
- L492: `selectedOrder.delivery_status === "shipped" ||`
- L493: `selectedOrder.delivery_status === "delivered") && (`
- L503: `{selectedOrder.delivery_status === "packed" && (`
- L513: `onClick={() => updateDeliveryStatusMutation.mutate({`
- L518: `disabled={!trackingId || updateDeliveryStatusMutation.isPending}`
- L526: `{selectedOrder.delivery_status === "shipped" && (`
- L528: `onClick={() => updateDeliveryStatusMutation.mutate({`
- L533: `disabled={updateDeliveryStatusMutation.isPending}`
- L539: `{selectedOrder.delivery_status !== "delivered" && selectedOrder.delivery_status !== "cancelled" && (`
- L542: `onClick={() => updateDeliveryStatusMutation.mutate({`
- L547: `disabled={updateDeliveryStatusMutation.isPending}`
- L556: `{selectedOrder.delivery_status === "delivered" && userRole === "mr" && (`
- L561: `navigate(`/bills/new?orderId=${selectedOrder.id}&pharmacyId=${selectedOrder.pharmacy_id}&amount=${selectedOrder.total_amount}`);`

#### `src/pages/Payments.tsx`

- L114: `amount = Number(bill.total_amount);`
- L140: `amount = Number(bill?.total_amount || 0);`

#### `src/pages/Pharmacies.tsx`

- L56: `const totalDue = pharmacyBills`
- L58: `.reduce((sum, bill) => sum + Number(bill.due_amount) - Number(bill.received_amount || 0), 0);`

#### `src/pages/PharmacyDetail.tsx`

- L36: `const [creditCheckResult, setCreditCheckResult] = useState<any>(null);`
- L94: `const creditUtilization = bills`
- L96: `.reduce((sum, bill) => sum + Number(bill.due_amount) - Number(bill.received_amount || 0), 0) || 0;`
- L98: `const creditLimit = pharmacy?.max_credit_limit || 100000;`
- L99: `const utilizationPercent = Math.round((creditUtilization / creditLimit) * 100);`
- L143: `const totalPending = bills`
- L145: `.reduce((sum, bill) => sum + Number(bill.due_amount) - Number(bill.received_amount || 0), 0) || 0;`
- L149: `const checkCredit = async () => {`
- L155: `const { data, error } = await supabase.rpc("check_credit_limit", {`
- L165: `const timer = setTimeout(checkCredit, 500);`
- L172: `const totalAmount = Number(billFormData.total_amount);`
- L174: `const upfrontAmount = Math.round((totalAmount * upfrontPercent) / 100);`
- L175: `const remainingAmount = totalAmount - upfrontAmount;`
- L325: `const newCount = (bill.reminder_count || 0) + 1;`
- L396: `<div className="text-sm text-muted-foreground">Credit Limit</div>`
- L397: `<div className="font-semibold">₹{creditLimit.toLocaleString("en-IN")}</div>`
- L441: `<span className="text-base sm:text-lg font-medium">Total Outstanding</span>`
- L501: `<Label htmlFor="total_amount">`
- L502: `Total Amount <span className="text-destructive">*</span>`
- L505: `id="total_amount"`
- L508: `value={billFormData.total_amount}`
- L559: `<span className="text-2xl">{!creditCheckResult.allowed ? "🚫" : "⚠️"}</span>`
- L570: `<span className="font-medium">Credit Utilization: </span>`
- L573: `creditCheckResult.utilization_percent >= 100 && "text-red-600",`
- L574: `creditCheckResult.utilization_percent >= 90 && creditCheckResult.utilization_percent < 100 && "text-yellow-600"`
- L591: `<span className="text-muted-foreground">Total Bill Amount:</span>`
- L704: `<p className="font-medium">₹{Number(bill.total_amount).toLocaleString("en-IN")}</p>`
- L721: `<p className="font-medium">{bill.reminder_count} sent</p>`

#### `src/pages/Profile.tsx`

- L144: `const deleteAccountMutation = useMutation({`
- L149: `const response = await supabase.functions.invoke('delete-my-account', {`
- L167: `const handleDeleteAccount = () => {`
- L200: `<p className="text-muted-foreground">Manage your account information</p>`
- L255: `<CreditCard className="h-5 w-5 text-muted-foreground" />`
- L275: `<p className="text-sm text-muted-foreground">Account Holder</p>`
- L276: `<p className="font-medium">{profile.bank_account_holder_name}</p>`
- L282: `<p className="text-sm text-muted-foreground">Account Number</p>`
- L283: `<p className="font-medium font-mono">{'*'.repeat(profile.bank_account_number.length - 4)}{profile.bank_account_number.slice(-4)}</p>`
- L461: `onClick={handleDeleteAccount}`
- L462: `disabled={deleteAccountMutation.isPending}`
- L530: `<Label htmlFor="bank_account_holder_name">Account Holder Name</Label>`
- L532: `id="bank_account_holder_name"`
- L533: `value={formData.bank_account_holder_name}`
- L534: `onChange={(e) => setFormData({ ...formData, bank_account_holder_name: e.target.value })}`
- L540: `<Label htmlFor="bank_account_number">Account Number</Label>`
- L542: `id="bank_account_number"`
- L543: `value={formData.bank_account_number}`
- L544: `onChange={(e) => setFormData({ ...formData, bank_account_number: e.target.value })}`
- L545: `placeholder="Enter account number"`

#### `src/pages/Reports.tsx`

- L36: `const totalSales = orders?.reduce((sum, order) => sum + Number(order.total_amount), 0) || 0;`
- L37: `const totalOrders = orders?.length || 0;`
- L38: `const avgOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;`
- L40: `return { totalSales, totalOrders, avgOrderValue, orders };`
- L48: `const totalReceived = bills?.reduce((sum, bill) => sum + Number(bill.received_amount || 0), 0) || 0;`
- L49: `const totalPending = bills?.filter(b => b.status !== 'paid').reduce((sum, bill) => sum + (Number(bill.due_amount) - Number(bill.received_amount || 0)), 0) || 0;`
- L51: `return { totalReceived, totalPending, bills };`
- L58: `const totalProducts = products?.length || 0;`
- L59: `const totalStock = products?.reduce((sum, p) => sum + (p.stock_quantity || 0), 0) || 0;`
- L60: `const stockValue = products?.reduce((sum, p) => sum + ((p.stock_quantity || 0) * Number(p.price || 0)), 0) || 0;`
- L62: `return { totalProducts, totalStock, stockValue, products };`
- L75: `csvContent += "Order Number,Date,Total Amount,Status\n";`
- L77: `csvContent += `${order.order_number},${new Date(order.created_at).toLocaleDateString()},${order.total_amount},${order.status}\n`;`
- L80: `csvContent += "Bill Number,Date,Total,Received,Status\n";`
- L218: `<div className="text-2xl font-bold">{reportData.totalOrders || 0}</div>`
- L293: `<div className="text-2xl font-bold">{reportData.totalProducts || 0}</div>`
- L304: `<div className="text-2xl font-bold">{reportData.totalStock?.toLocaleString("en-IN") || 0}</div>`

#### `src/pages/SellerDetail.tsx`

- L193: `const discount = product.discount_percentage || 0;`
- L194: `const discountedPrice = product.price * (1 - discount / 100);`

#### `src/pages/Settings.tsx`

- L77: `<CreditCard className="h-4 w-4 mr-2" />`

#### `src/pages/admin/RoleAudit.tsx`

- L63: `const exportRoleSummary = () => {`
- L66: `const roleCounts: Record<string, number> = {};`
- L69: `roleCounts[role] = (roleCounts[role] || 0) + 1;`
- L72: `const summaryData = Object.entries(roleCounts).map(([role, count]) => ({`
- L78: `const ws = XLSX.utils.json_to_sheet(summaryData);`
- L96: `const roleCounts: Record<string, number> = {};`
- L99: `roleCounts[role] = (roleCounts[role] || 0) + 1;`
- L113: `<Button onClick={exportRoleSummary} variant="outline">`
- L126: `{Object.entries(roleCounts).map(([role, count]) => (`
- L135: `<div className="text-3xl font-bold">{count}</div>`

#### `src/pages/admin/Subscriptions.tsx`

- L235: `<CreditCard className="h-8 w-8 text-primary" />`

#### `src/pages/dashboards/AdminDashboard.tsx`

- L66: `const { data: stats, isLoading } = useQuery({`
- L76: `const roleCounts = {`
- L91: `const { count: pendingVerifications } = await supabase`
- L105: `const totalRevenue = subscriptionRequests?.length ? subscriptionRequests.length * 999 : 0;`
- L144: `<CreditCard className="h-4 w-4 mr-2" />`
- L160: `<div className="text-3xl font-bold">{stats?.totalUsers || 0}</div>`
- L172: `<div className="text-3xl font-bold text-warning">{stats?.pendingVerifications || 0}</div>`
- L179: `<CreditCard className="h-4 w-4" />`
- L184: `<div className="text-3xl font-bold text-primary">{stats?.pendingSubscriptions || 0}</div>`
- L212: `<div className="text-2xl font-bold">{stats?.roleCounts.mr || 0}</div>`
- L217: `<div className="text-2xl font-bold">{stats?.roleCounts.stockist || 0}</div>`
- L222: `<div className="text-2xl font-bold">{stats?.roleCounts.distributor || 0}</div>`
- L227: `<div className="text-2xl font-bold">{stats?.roleCounts.pharmacy || 0}</div>`
- L232: `<div className="text-2xl font-bold">{stats?.roleCounts.admin || 0}</div>`
- L252: `{stats.recentSubscriptionRequests.map((request: any) => (`

#### `src/pages/dashboards/PharmacyDashboard.tsx`

- L27: `const { data: stats, isLoading } = useQuery({`
- L33: `const { count: orderCount } = await supabase`
- L39: `const { count: pendingCount } = await supabase`
- L51: `const totalSpent = orders?.reduce((sum, o) => sum + Number(o.total_amount), 0) || 0;`
- L54: `const { count: supplierCount } = await supabase`
- L91: `const { data: otcStats } = useQuery({`
- L103: `const totalValue = inventory.reduce((sum, item) => sum + (item.mrp * item.quantity_in_stock), 0);`
- L104: `const totalItems = inventory.reduce((sum, item) => sum + item.quantity_in_stock, 0);`
- L105: `const potentialEarnings = inventory.reduce((sum, item) => sum + (item.mrp * item.quantity_in_stock * 0.05), 0);`
- L107: `return { totalValue, totalItems, potentialEarnings };`
- L161: `<div className="text-2xl font-bold">{stats?.pendingOrders || 0}</div>`
- L187: `<div className="text-2xl font-bold">{stats?.favoriteSuppliers || 0}</div>`
- L199: `<div className="text-2xl font-bold">{stats?.totalOrders || 0}</div>`
- L216: `<p className="text-sm text-muted-foreground mb-1">Total Inventory Value</p>`
- L224: `<p className="text-2xl font-bold">{otcStats.totalItems}</p>`

#### `src/pages/dashboards/SellerDashboard.tsx`

- L53: `const { data: stats, isLoading } = useQuery({`
- L76: `const { data: products, count: productCount } = await productQuery;`
- L79: `const totalStock = products?.reduce((sum, p) => sum + (p.stock_quantity || 0), 0) || 0;`
- L80: `const stockValue = products?.reduce((sum, p) =>`
- L86: `let pharmacyCount = 0;`
- L88: `const { count } = await supabase`
- L92: `pharmacyCount = count || 0;`
- L96: `let stockistCount = 0;`
- L97: `let buyerPharmacyCount = 0;`
- L99: `const { count: sCount } = await supabase`
- L104: `stockistCount = sCount || 0;`
- L106: `const { count: pCount } = await supabase`
- L111: `buyerPharmacyCount = pCount || 0;`
- L115: `let totalRevenue = 0;`
- L126: `totalRevenue = bills?.reduce((sum, b) => sum + Number(b.received_amount || 0), 0) || 0;`
- L129: `.reduce((sum, b) => sum + (Number(b.due_amount) - Number(b.received_amount || 0)), 0) || 0;`
- L137: `totalRevenue = orders`
- L139: `.reduce((sum, order) => sum + Number(order.total_amount), 0) || 0;`
- L155: `const { count: pendingOrders } = await supabase`
- L201: `case "mr": return `Brand: ${stats?.brandName} • ${stats?.companyName}`;`
- L298: `<div className="text-2xl font-bold">{stats?.activePharmacies || 0}</div>`
- L328: `<div className="text-2xl font-bold">{stats?.productsListed || 0}</div>`
- L330: `<p className="text-xs text-muted-foreground mt-1">{stats?.brandName} only</p>`
- L332: `<p className="text-xs text-muted-foreground mt-1">{stats?.brandsCount || 0} brands</p>`
- L386: `{stats.recentOrders.map((order: any) => (`
- L401: `<p className="font-semibold">₹{Number(order.total_amount).toLocaleString("en-IN")}</p>`
- L402: `<StatusBadge status={order.delivery_status || "pending"} />`

### E.7 Modals / Dialogs / Sheets Inventory

**Files:** 14

| File | Count | Components |
|------|-------|------------|
| `src/pages/Profile.tsx` | 12 | (inline) |
| `src/pages/admin/Subscriptions.tsx` | 9 | (inline) |
| `src/pages/Orders.tsx` | 8 | (inline) |
| `src/pages/MyProducts.tsx` | 8 | (inline) |
| `src/components/LocationSelector.tsx` | 6 | (inline) |
| `src/pages/Support.tsx` | 5 | (inline) |
| `src/components/QuickBillModal.tsx` | 4 | QuickBillModal |
| `src/components/BulkUploadModal.tsx` | 4 | BulkUploadModal |
| `src/components/ProductDetailModal.tsx` | 4 | ProductDetailModal |
| `src/components/OCRUploadModal.tsx` | 4 | OCRUploadModal |
| `src/components/UpdateBillModal.tsx` | 4 | UpdateBillModal |
| `src/components/QuickOrderModal.tsx` | 4 | QuickOrderModal |
| `src/components/MobileNav.tsx` | 3 | (inline) |
| `src/components/PaymentProcessModal.tsx` | 2 | PaymentProcessModal |

### E.8 Mock, Stub, and Incomplete Behavior

**Files flagged:** 43

| File | Tags | Sample |
|------|------|--------|
| `supabase/functions/ocr-product-label/index.ts` | debug | L43: console.log("Starting OCR analysis..."); |
| `supabase/functions/assign-role/index.ts` | debug | L34: console.log(`Assigning role ${role} to user ${user.id}`); |
| `supabase/functions/initialize-otc-inventory/index.ts` | random, debug | L140: delivered_at: new Date(Date.now() - Math.random() * 10 * 24 * 60 * 60 * 1000).toISOString |
| `supabase/functions/delete-my-account/index.ts` | debug | L32: console.log(`Deleting account for user ${userId}`); |
| `supabase/functions/admin-wipe/index.ts` | debug | L54: console.log('Admin wipe initiated by user:', user.id); |
| `src/components/QuickBillModal.tsx` | placeholder | L191: <SelectValue placeholder="Select pharmacy" /> |
| `src/components/LocationSelector.tsx` | placeholder | L81: placeholder="e.g., Main Branch" |
| `src/components/OCRUploadModal.tsx` | placeholder | L152: placeholder="₹" |
| `src/components/Layout.tsx` | placeholder | L129: placeholder="Search sellers, products..." |
| `src/components/UpdateBillModal.tsx` | placeholder | L78: placeholder="Enter amount received" |
| `src/components/QuickOrderModal.tsx` | placeholder | L274: <SelectValue placeholder="Select pharmacy" /> |
| `src/components/ui/command.tsx` | placeholder | L47: "flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-mut |
| `src/components/ui/sidebar.tsx` | random | L536: return `${Math.floor(Math.random() * 40) + 50}%`; |
| `src/components/ui/select.tsx` | placeholder | L20: "flex h-10 w-full items-center justify-between rounded-md border border-input bg-backgroun |
| `src/components/ui/textarea.tsx` | placeholder | L11: "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm r |
| `src/components/ui/input.tsx` | placeholder | L11: "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-of |
| `src/pages/Settings.tsx` | placeholder | L100: placeholder="Your Business Name" |
| `src/pages/Auth.tsx` | placeholder | L368: placeholder="your.email@example.com" |
| `src/pages/Reports.tsx` | incomplete | L101: toast.info("PDF export coming soon"); |
| `src/pages/DeliveryPlanner.tsx` | random | L53: const totalDistance = Math.floor(Math.random() * 50) + 10; |
| `src/pages/OrderForm.tsx` | placeholder | L208: <SelectValue placeholder="Choose a pharmacy" /> |
| `src/pages/Dashboard.tsx` | placeholder | L351: placeholder="Search pharmacies..." |
| `src/pages/Support.tsx` | placeholder | L165: placeholder="Brief description of your issue" |
| `src/pages/SellerDetail.tsx` | placeholder | L151: placeholder="Search products..." |
| `src/pages/Checkout.tsx` | placeholder | L207: placeholder="Enter complete delivery address with landmarks" |
| `src/pages/MarketplaceProducts.tsx` | placeholder | L189: placeholder="Search products, brands, salt names..." |
| `src/pages/Payments.tsx` | placeholder | L216: <SelectValue placeholder="Choose a pending bill" /> |
| `src/pages/Pharmacies.tsx` | placeholder | L110: placeholder="Search pharmacies by name, owner, or phone..." |
| `src/pages/PharmacyDetail.tsx` | placeholder | L479: placeholder="MR/001" |
| `src/pages/PharmacyForm.tsx` | placeholder | L83: placeholder="ABC Pharmacy" |
| `src/pages/Marketplace.tsx` | placeholder | L122: placeholder="Search sellers..." |
| `src/pages/Profile.tsx` | placeholder | L445: placeholder="DELETE" |
| `src/pages/ProductForm.tsx` | placeholder | L385: placeholder="e.g., Paracetamol 500mg" |
| `src/pages/Upgrade.tsx` | placeholder | L233: placeholder="Enter transaction reference number" |
| `src/pages/BillForm.tsx` | placeholder | L181: <SelectValue placeholder="Choose a pharmacy" /> |
| `src/pages/Catalogue.tsx` | placeholder | L218: placeholder="Search products..." |
| `src/pages/Orders.tsx` | placeholder | L510: placeholder="Enter tracking ID" |
| `src/pages/MyProducts.tsx` | placeholder | L280: placeholder="Search products by name, brand, or salt..." |
| `src/pages/admin/Subscriptions.tsx` | placeholder | L341: placeholder="Enter reason for rejection..." |
| `src/pages/admin/UserManagement.tsx` | placeholder | L121: placeholder="Search by name, email, or business..." |
| `src/pages/admin/SupportManagement.tsx` | placeholder | L119: placeholder="Search tickets..." |
| `src/pages/dashboards/PharmacyDashboard.tsx` | placeholder | L135: placeholder="Search products, brands, sellers..." |
| `src/pages/dashboards/AdminDashboard.tsx` | placeholder | L304: placeholder="DELETE ALL USERS AND DATA" |

### E.9 Dead Code, Orphan Routes, and Broken Links

#### Page files with weak import references

- `Dashboard`
- `PharmacyDashboard`
- `SellerDashboard`
- `Subscriptions`
- `Upgrade`

#### Duplicate filenames



---

## EXPANSION PASS 2 — Deep Trace Additions (2026-07-08)

*Second deep-trace pass over `stockistpayments/` source. Only material absent from all prior sections is added below; scope limited to Admin / Stockist / Pharmacy (MR flows noted only where they intersect those roles). All claims cite file paths.*

### E2.1 Newly documented routes/pages/screens

The route surface is fully enumerated in §0.1/E.1; no unrouted page remained undocumented after §22. Additions below are page-level details not previously captured:

**`/onboarding` — `src/pages/OnboardingSelectRole.tsx` (fine detail)**
- Full-screen (no `<Layout>`) gradient background `bg-gradient-to-br from-primary/5 via-background to-primary/10`; centered `max-w-md` card titled **"Welcome to Chameleon"**.
- The submit handler explicitly fetches the session token via `supabase.auth.getSession()` and passes `Authorization: Bearer {token}` as an explicit header to `functions.invoke('assign-role', …)` (it does not rely on the client default header).
- Generated metadata on this path is exactly `{username: "user_" + user.id.substring(0,8), name: user.email.split('@')[0] || 'New User'}` — no phone, business fields, or document.
- Success toast: `"Role assigned successfully!"`; error toast: `error.message || "Failed to assign role"`; navigation `navigate("/", { replace: true })` (replace-mode, so Back does not return to onboarding).
- Submit button disabled while `isSubmitting`; no other validation (a role radio always has a value, default `pharmacy`).

**`/` (Layout chrome) — `src/components/Layout.tsx` (fine detail)**
- Brand text strings verbatim (role-conditional): `"Chameleon MR"`, `"Chameleon Stockist"`, `"Chameleon Distributor"`, `"Chameleon Pharmacy"`, `"Chameleon Admin"` (`Layout.tsx` L115–119).
- The pharmacy-only header search input placeholder is `"Search sellers, products..."` and its **only** behavior is `onFocus={() => navigate("/marketplace")}` (L129–131) — no typed text is carried to the marketplace; it is a navigation trigger disguised as a search box.
- `isActiveRoute` special-cases `/delivery-planner`: exact-match only (`Layout.tsx` L97–98), unlike other nav paths which prefix-match.

**`/reports` — `src/pages/Reports.tsx` (export contract detail)**
- CSV export is built as a `data:text/csv;charset=utf-8,` URI, appended to `document.body` as a synthetic `<a download>` and clicked (L72–97). Download filename pattern: **`{reportType}_report_{format}.csv`** (literally includes the string `csv` twice, e.g. `sales_report_csv.csv`).
- Exact CSV headers per type:
  - Sales: `Order Number,Date,Total Amount,Status` — rows use `order.total_amount` and `order.status` (the frozen `status` column, not `delivery_status`).
  - Payments: `Bill Number,Date,Total,Received,Status` — ⚠️ the "Total" column actually exports **`bill.due_amount`**, not `total_amount` (L82) — the exported "Total" is the post-upfront due figure.
  - Inventory: `Product Name,Brand,Stock,Price,Value` — Value = `stock_quantity × Number(price)` computed inline; Brand falls back to `"N/A"`.
- No CSV field quoting/escaping anywhere — a product name or order number containing a comma corrupts the row.

**`/admin/role-audit` — `src/pages/admin/RoleAudit.tsx` (export contract detail)**
- "Export All Data" workbook: sheet name `"Users"`, filename **`user-roles-export-{YYYY-MM-DD}.xlsx`**; exact column set per row: `Name, Email, Phone, Username, Role, "Business Name", "Business Type", "Subscription", "Is Verified" ("Yes"/"No"), "Created At"` (localized `toLocaleString("en-IN")`), with `"-"` fallbacks for missing business fields (L42–53). Note this admin export includes every user's phone and email.
- Guard: exporting with no data → toast `"No data to export"` (L38).
- Summary export builds `roleCounts` by iterating `user.user_roles?.role` and exports `[{Role, Count}]` rows.

**`/admin/dashboard` Danger Zone — verbatim copy** (`src/pages/dashboards/AdminDashboard.tsx`)
- Warning paragraph: `"This action CANNOT be undone. It will permanently delete all application data and all user accounts."` (L295).
- Button label: `"Wipe All Data and Users"` (L332); confirm input placeholder is the literal phrase `"DELETE ALL USERS AND DATA"` (L304 area). On success the toast displays the edge function's `data.message` verbatim (see E2.6). The confirm input is cleared (`setWipeConfirm("")`, L52) after completion.

### E2.2 Component behavior catalog

**Dual toast systems are actually both live** *(refines §13.4, which called the Radix toaster "effectively unused")*: four feature pages import the **Radix/shadcn `useToast`** (`@/hooks/use-toast`) instead of Sonner — `src/pages/ProductForm.tsx`, `src/pages/OrderForm.tsx`, `src/pages/Upgrade.tsx`, `src/pages/admin/Subscriptions.tsx`. Every other feature file uses `toast` from `sonner`. Consequence: those four pages render notifications through the Radix `<Toaster/>` (different position/styling, `title` + `description` + `variant:"destructive"` shape) while the rest of the app uses Sonner toasts — two visually distinct notification styles ship in production.

**`StatusBadge` exact rendering contract** (`src/components/StatusBadge.tsx`) — labels/icons/classes verbatim:
| status | icon | label | className highlights |
|---|---|---|---|
| `paid` | `✓` | `Paid` | `bg-green-500/20 text-green-700 … border-green-500/50` |
| `due_soon` | `⏰` | `Due Today` when `daysTillDue === 0`, else `Due in {n}d` | blue tints |
| `critical` | `🚨` | `Critical ({n}d overdue)` | red tints + **`animate-pulse`** |
| `overdue` | `⚠️` | `Overdue ({n}d)` | orange tints |
| `pending` | `○` | `Pending` | yellow tints |
| anything else | `?` | `Unknown` | gray tints |
Day math: `daysOverdue = floor((today − due)/86400000)`, `daysTillDue = floor((due − today)/86400000)`; with no `dueDate` prop both are 0 (so an `overdue` badge without a date reads "Overdue (0d)"). All classes carry `dark:` variants even though dark mode is unreachable (§13.6).

**`ActivityFeed` exact aggregation contract** (`src/components/ActivityFeed.tsx` L30–120):
- Three parallel fetches, each `.limit(5)`: orders (`.or("seller_id.eq.{uid},buyer_id.eq.{uid}")` with `buyer:profiles!orders_buyer_id_fkey(name,business_name)` join), bills (`pharmacies!inner(name, mr_id)` filtered `pharmacies.mr_id = uid` — MR-only source), products (`stockist_id = uid`, ordered by `updated_at`).
- Action strings verbatim: `` `Order ${order_number} - ${status}` `` (uses the frozen `status` column, so this always reads "- pending"), `` `Bill ${bill_number} - ${status}` ``, `` `Product updated: ${name}` ``.
- Detail line renders amount (₹, en-IN), then `• {buyer}` or `• {pharmacy}` or `• Stock: {n}`. Bill amount shown is **`due_amount`** (not total). Merged list sorted desc by timestamp and `.slice(0, 15)`. Empty state: `"No recent activity"`.
- For a **pharmacy** user the feed effectively contains only their orders (bill fetch returns nothing — they own no `pharmacies` rows; product fetch returns nothing). For a **stockist/distributor** it contains orders + own product updates.

**`QuickOrderModal` share/download contracts** (`src/components/QuickOrderModal.tsx` L184–248) — the generated `.txt` bill body verbatim:
```
BILL: {bill_number}
Date: {dd/mm/yyyy en-IN}
Pharmacy: {pharmacy name}

Total Amount: ₹{amount en-IN}
Due Date: {dd/mm/yyyy en-IN}

Payment: {profile.upi_id || "Contact MR"}
```
Downloaded via `Blob`/`URL.createObjectURL` as **`Bill_{bill_number}.txt`** (note: bill numbers contain `/`, e.g. `MR/001`, so browsers sanitize the suggested filename). WhatsApp share uses the raw stored `pharmacy.phone` in `https://wa.me/{phone}?text=…` (no digit cleaning here, unlike `WhatsAppButton` which strips non-digits) — a phone stored as `+91 98765…` produces a malformed wa.me URL from this modal specifically.

**`WhatsAppButton`** error toast verbatim: `"Failed to open WhatsApp"` (`src/components/WhatsAppButton.tsx` L34). MyCustomers passes the message verbatim: `` `Hi ${buyer?.name}, this is regarding your account with us.` `` (`src/pages/MyCustomers.tsx` L122).

**`generateWhatsAppMessage` template verbatim** (`src/lib/upi.ts`) — the exact multi-line message stored in `payment_reminders.message_content` and used by all WhatsApp shares:
```
Hi {pharmacyName},

Payment request of ₹{amount en-IN} for Bill {billNumber}.

Pay via UPI: {upiLink}

Thank you!
- {mrName}
```
`generateUPILink` strips non-alphanumeric/space chars from the payee name (`replace(/[^a-zA-Z0-9\s]/g,"")`) before URL-encoding; amount is passed unformatted; `tn=Bill {billNumber}` is **not** URL-encoded (the space and `/` in `MR/001` go into the URI raw).

**`PharmacyDetail` create-bill promise copy verbatim** (`src/pages/PharmacyDetail.tsx` L619–621): `"✓ UPI payment link will be auto-generated"`, `"✓ WhatsApp reminder will be sent instantly"`, `"✓ Payment request will be tracked automatically"`; card description `"One-click bill creation with instant WhatsApp reminder"` (L457). Post-success the form resets to `{bill_number:"", bill_date: today, total_amount:"", upfront_percentage:0, payment_terms_days:7}`, `creditCheckResult` is nulled, the collapsible closes, and both `["pharmacy-bills", id]` and `["next-bill-number"]` are invalidated (L254–266) — so the next open re-fetches a fresh `MR/nnn` number.

**`ProductForm` update path detail** (`src/pages/ProductForm.tsx` L245–283): the edit mutation re-uploads a newly chosen image with `{upsert: true}` to `product-images/{uid}/{Date.now()}.{ext}` (a fresh timestamped path each time — old images are never deleted, orphaning prior files in the public bucket), numeric-coerces price/mrp/purchase_rate/sale_rate/stock, scopes the update with **both** `.eq("id", id)` and `.eq("stockist_id", user.id)` (client-side ownership double-check on top of RLS), then navigates to `/marketplace` like the create path.

### E2.3 Entity & schema deep detail

No new tables/columns beyond §10/§14/§15/E.2 (all 19 typed tables plus the 2 untyped OTC tables were already covered). New precision:

- **`payment_requests.payment_link` has two distinct formats** depending on writer: PharmacyDetail stores a full `generateUPILink` URI (`upi://pay?pa=…&pn=…&am=…&cu=INR&tn=Bill …`), whereas Payments stores the bare `` `upi://pay?pa=${profile?.upi_id}&am=${amount}` `` (`src/pages/Payments.tsx` L119) — no payee name, no currency, no note, and no guard when `upi_id` is empty (a pharmacy-registered seller with `upi_id=""` produces `upi://pay?pa=&am=…`).
- **`payment_reminders.message_content`** always contains the full E2.2 WhatsApp template text — i.e. the table stores customer PII (pharmacy name) plus the MR's UPI id inside a free-text column; admins can read all rows via the §14 #21 admin SELECT policy.
- **Reports "payments" scope**: `src/pages/Reports.tsx` L48–49 computes `totalReceived` over **all** bills returned (RLS-scoped) but `totalPending` only over `status !== 'paid'` — consistent with the dashboards, documented here because the CSV export (E2.1) exposes the raw per-bill rows using `due_amount` as "Total".
- **`profiles` exposure via RoleAudit export** (E2.1): the XLSX includes username/phone/email/subscription for every role — the only place all five roles' contact data is serialized to a file.

### E2.4 Workflow traces

**Payments-page reminder flow, exact sequence** (`src/pages/Payments.tsx` L105–166) — supplements §2.11 with the precise optimistic-UI choreography:
1. `onMutate` (before any network call): recomputes the amount client-side from local state, sets `currentPayments = [{pharmacyName, amount, dueDate: bill.remaining_due_date}]`, opens `PaymentProcessModal` with `isProcessing=true, isComplete=false`.
2. `mutationFn`: recomputes amount **again** (full = `due−received`; "last" = `total_amount`; custom = input as Number), builds the bare UPI link, inserts the `payment_requests` row (`status:'sent'`, `reminder_sent_at: now`). Throws `"Bill not found"` if the selected bill vanished from cache.
3. `onSuccess`: `setTimeout(2000)` before flipping the modal to complete (the 2-second "processing" is purely theatrical), invalidates `["payment-requests"]`, clears the bill selection and custom amount.
4. `onError`: toast `error.message || "Error sending reminder"` **and closes the modal** — so a failed insert never shows a fake success.
Branch note: unlike PharmacyDetail's reminder, this flow does **not** touch `bills.reminder_count`/`last_reminder_sent` and does not insert a `payment_reminders` row — the two reminder features write to different tables.

**Quick Order (paste-to-bill) full trace with failure branches** (`src/components/QuickOrderModal.tsx`):
- Guard 1: no pharmacy or empty textarea → `"Please select a pharmacy and enter order details"`.
- Guard 2: parser yields zero items → `"Could not parse any items from the text"`.
- Per-item: catalogue lookup `name ilike %{parsed}%` limit 1; matched items accumulate `sale_rate × qty` (L122–123) and immediately decrement stock; unmatched items are silently skipped.
- Guard 3: zero matches overall → `"No matching products found in your catalogue"` (no bill created, but **stock already decremented for any earlier matched items is not rolled back** — unreachable in practice since zero matches means zero decrements, but partial-match text always creates a bill for the matched subset only).
- Success toast: `` `Bill ${billNumber} generated with ${n} items!` `` then the share panel (Download / WhatsApp / Copy Link, E2.2).

**Admin subscription review trace** (unrouted `src/pages/admin/Subscriptions.tsx`, verbatim outcomes): Approve → two sequential writes (request `status='approved', approved_at`; then profile premium+30d) → Radix toast `{title:"Subscription approved", description:"User has been upgraded to premium"}`, both query keys invalidated, detail modal closed. Reject → single update (`status='rejected', rejection_reason`) → toast `{title:"Request rejected", description:"User has been notified"}` — ⚠️ the description is aspirational: no notification of any kind is sent (Notifications page is hardcoded empty, §5.4). Failure toasts: `"Approval failed"` / `"Rejection failed"` with `error.message`.

**Order fulfilment — stock decrement timing nuance** (`src/pages/Orders.tsx` L114–169): the mutation sets `delivery_status` first and only then loops the stock decrements when the target status is `packed`; the single success toast for that branch is `"Order status updated and stock adjusted"` (L164) vs the generic path's invalidations without the "stock adjusted" wording. Tracking-ID Ship button is disabled until `trackingId` is non-empty (L518).

### E2.5 Business rules & calculations

New precise items not in §20:

| Rule | Exact expression | Source |
|---|---|---|
| Payments CSV "Total" column | exports `bill.due_amount` (not `total_amount`) | `src/pages/Reports.tsx` L82 |
| Inventory CSV "Value" | `stock_quantity × Number(price)` per row (unrounded float) | `Reports.tsx` L87 |
| BillForm upfront (unrounded) | `(totalAmount × upfrontPercentage) / 100` — **no `Math.round`**, unlike PharmacyDetail which uses `Math.round((total × pct)/100)` | `BillForm.tsx` L102 vs `PharmacyDetail.tsx` L174 — the two bill creators round upfront differently (paise-fraction due_amounts possible only via BillForm) |
| StatusBadge day counts | `floor((today−due)/86 400 000)` — millisecond subtraction of raw `new Date(dueDate)` (a date-only string parses as UTC midnight; a bill due "today" can show `Due in 0d` or `Overdue (0d)` depending on local timezone offset) | `StatusBadge.tsx` L12–14 |
| MyCustomers credit bar | `min((outstanding / credit_limit) × 100, 100)%` width — division by the relationship's `credit_limit` which defaults 0 → `Infinity`, clamped to 100 (bar renders full) | `MyCustomers.tsx` L161 |
| MarketplaceProducts cart badge | `Σ item.quantity` (unit count, not line count) | `MarketplaceProducts.tsx` L173 |
| DeliveryPlanner sim | `totalDistance = floor(random()×50)+10` km; `estimatedTime = floor(distance×2.5)` min | `DeliveryPlanner.tsx` L53–54 |
| ProductForm sale-rate precision | `saleRate.toFixed(2)` written into both `sale_rate` and `price` state (string, 2dp) | `ProductForm.tsx` L184 |
| Notifications unread count | `notifications.filter(n => !n.read).length` over the hardcoded `[]` → always 0 | `Notifications.tsx` L65 |
| Admin revenue estimate | `subscriptionRequests.length × 999` where the query is **pending** requests only | `AdminDashboard.tsx` L105 |

### E2.6 API/edge-function reference deep detail

Verbatim error/message strings not previously catalogued:

**`assign-role`** (`supabase/functions/assign-role/index.ts`): throws `'Missing authorization header'` (no auth header) and `'Invalid token'` (getUser failure) — both surface as 500 `{error: message}`; the only non-500 error is 403 `{error: 'Invalid admin registration password'}`. Profile-upsert and role-insert failures are logged (`console.error('Profile upsert error:'…, 'Role insert error:'…)`) — the role insert error is logged but the function still returns `{success:true, role}` (role assignment can silently fail while reporting success).

**`ocr-product-label`** (`supabase/functions/ocr-product-label/index.ts`): gateway failure → `` `OCR failed: {response text}` ``; JSON-parse failure of the vision output → `"Failed to parse product details from image"` (after logging the raw text). Success messages verbatim: update path `` `Updated ${name}. Stock: ${old} → ${new}` `` (L136); create path `` `Added new product: ${name}` `` (L222). These strings are what `OCRUploadModal` surfaces directly via `toast.success(data.message)` (`OCRUploadModal.tsx` L89).

**`admin-wipe`** response bodies verbatim: `message: "Deleted {n} users and all application data"`; `warning:` `"All users including admins were deleted"` (include_admins) or `"Admin users were preserved"` (L108–109). The AdminDashboard success toast displays `data.message` verbatim (`AdminDashboard.tsx` L51).

**`autocomplete-product` client-side merge behavior** (`src/pages/ProductForm.tsx` L303–318): AI fields only fill **empty** slots for brand/salt/type/uses/category/image (`extra.x || prev.x`), but `description` is *appended* — existing description + AI description + `"Storage: …"`, `"Handling: …"`, `"Consumption: …"` lines joined with `\n`. Repeated Auto-fill clicks therefore grow the description cumulatively. Sub-2-char guard toast: `{title:"Info", description:"Enter at least 2 characters of product name"}`; success toast: `"Product details auto-filled! Review and adjust as needed."`.

### E2.7 Role journeys step-by-step (deltas only)

Full journeys exist in §18; genuinely new click-level facts:

**Admin**: after typing the wipe phrase and confirming, the toast shows the server's deletion count message (E2.6); if "Include admins" was checked the admin is signed out mid-flow and lands on `/auth` — their own account no longer exists, so re-login fails and the next visitor must sign up fresh (admin password gate still enforced by the DB trigger). RoleAudit's export buttons are the admin's only bulk-data egress; both work offline of any backend beyond the initial query (client-side SheetJS).

**Stockist/Distributor**: the only reminder-ish outbound communication they have is MyCustomers' `WhatsAppButton` with the fixed message `"Hi {name}, this is regarding your account with us."` (E2.2) — no amount, no link (contrast the MR reminder machinery). Their Orders payment-link path (packed+) is the sole place their `upi_id` is exercised; missing UPI → toast `"Please add your UPI ID in profile settings first"` (`Orders.tsx` L189), and a missing buyer phone → `"Buyer phone number not available"` (L211), else `"Opening WhatsApp..."` (L218).

**Pharmacy**: the OTC wizard's "Most Popular" ribbon is hard-assigned to array index 1 of the plans query (`OTCPartnership.tsx` L85, `isPopular={i === 1}`) — it marks whichever plan is second-cheapest (plans ordered by price asc), not a curated flag. Review step shows `₹{price}` with subtext `"(Dummy Payment)"` and the button label toggles `Complete Payment` → `Processing...` with spinner (L114–116); brand checkboxes silently refuse selection beyond `plan.max_brands` (the click is a no-op, no toast — L98–99). Success toast: `"OTC Subscription activated! 🎉"` (L52).

**MR (only where it touches the above)**: the "📱 Bill created & WhatsApp reminder sent successfully!" / "📱 WhatsApp reminder sent successfully!" toasts (`PharmacyDetail.tsx` L254/L335) overstate what happened — no WhatsApp is opened from PharmacyDetail; only DB rows are written (§17.4). Pharmacy users never see any of it (no bills RLS for pharmacy role, §15.3).

### E2.8 Hidden/internal functionality

- **`ui/sidebar.tsx` random skeleton widths**: the unused sidebar component generates `Math.floor(Math.random()*40)+50 + "%"` skeleton widths (L536) — the only other `Math.random()` in `src/` besides DeliveryPlanner.
- **localStorage keys**: only Supabase auth persistence (`sb-uuwwnggimhvtvnislptd-auth-token` per supabase-js convention via `storage: localStorage` in `src/integrations/supabase/client.ts`). No app-defined localStorage/sessionStorage usage exists anywhere in `src/` — cart, filters, wizard steps are all server rows or in-memory state lost on refresh (OTC wizard restarts at `select-plan`; DeliveryPlanner selection resets).
- **Console diagnostics in production**: every edge function logs operational details (`"Starting OCR analysis..."`, `` `Assigning role ${role} to user ${user.id}` ``, `` `Deleting account for user ${userId}` ``, `'Admin wipe initiated by user:' + id`) — see E.8 table for lines. Client side, `NotFound.tsx` logs every dead-link hit with the attempted pathname (§22.3), and `Upgrade.tsx`/`OnboardingSelectRole.tsx` `console.error` raw errors.
- **No feature flags** of any kind exist (no env-conditional UI beyond `import.meta.env` Supabase keys; `componentTagger` is the only mode-conditional code, dev-only, `vite.config.ts`).
- **Seeded data**: unchanged from §14 #23 (3 OTC brands) — replaying migrations seeds nothing else.

### E2.9 Validation & error-handling catalog (verbatim strings)

Complete client-side toast/message inventory by page (Sonner unless marked *(Radix)*; error handlers of the form `error.message || "fallback"` are listed by their fallback):

**Auth (`src/pages/Auth.tsx`)**: `"Logged in successfully!"`, `"Invalid email or password"` (login fallback), `"Password reset link sent to your email!"`, `"OTP sent to your email! Check your inbox."`, `"Username must be 6-16 characters"`, `"Username is already taken"`, `"Password must be at least 6 characters"`, `"Name and phone are required"`, `` `Please upload ${getDocumentLabel()}` `` (label = "Company Agreement" / "Stockist License" / "Distributor License" / "Pharmacy License (Required)"), `"Please enter your brand name"`, `"Owner name and address are required for pharmacy"`, `"Admin registration password is required"`, `"Invalid admin registration password"`, `"Please enter a valid email address"`, `"Please enter a valid phone number (10-15 digits)"`, `"Registration successful! Redirecting to dashboard..."`, `"Error signing up"` (fallback), `"File size must be less than 5MB"`. Field placeholders verbatim: `your.email@example.com`, `••••••••`, `e.g., JITESSH3710`, `John Doe`, `you@example.com`, `+91 9876543210`, `ABC Pharmaceuticals` / `Your Business Name` (business name, MR vs other), `yourname@paytm` (UPI), `Mumbai, Pune, Nashik` (service areas), `MediCare Pharmacy` (pharmacy name). Username inline states: `"Checking..."` / `"Available"` / `"Taken"`.
**useRoleGuard**: `"You don't have access to this page"`.
**PharmacyForm**: `"Pharmacy added successfully!"` / `"Error adding pharmacy"`.
**PharmacyDetail**: `"📱 Bill created & WhatsApp reminder sent successfully!"`, `"Error creating bill"`, `"Bill updated successfully!"`, `"Error updating bill"`, `"📱 WhatsApp reminder sent successfully!"`, `"Error sending reminder"`. Bill number placeholder `MR/001`.
**BillForm**: `` `Total due (₹{due}) exceeds credit limit (₹{limit})` `` (hard block), `"Bill created successfully!"`, `"Error creating bill"`.
**Payments**: `"Bill marked as paid!"`, `"Error marking bill as paid"`, `"Error sending reminder"`; bill Select placeholder `"Choose a pending bill"`; empty list `"No payment requests yet"`.
**QuickBillModal**: `"Item already added"`, `"Please select a pharmacy"`, `"Please add at least one item"`, `` `Bill {n} created successfully!` ``, `"Error creating bill"`.
**QuickOrderModal**: guards per E2.4 plus `` `Bill {n} generated with {k} items!` ``, `"Error generating bill"`, `"Bill downloaded"`, `"Payment link copied"`.
**OCRUploadModal**: `"Please select an image file"`, `"Please fill all fields and upload an image"`, server `data.message` on success, `"Error scanning product"`.
**BulkUploadModal**: `"Please upload CSV or Excel file"`, `"Error parsing CSV: {msg}"`, `"Error reading file: {msg}"`, `"No data to upload"`, `"You must be logged in to upload products"`, `` `Successfully added {n} product(s)` ``, `` `{n} error(s) occurred. See summary below.` ``, `"Error uploading products: {msg}"`. Row-validation error strings (from `validateRow`): missing name / invalid sale_rate / negative stock produce per-row entries capped at 10 in the summary panel ("Upload Summary" with green success count and destructive failed count, L285–306).
**ProductForm** *(Radix)*: `{MRP Required: "Please enter MRP first to calculate sale price"}`, `{Adjusted: "Sale price cannot be below purchase rate. Adjusted to purchase rate."}`, `{Invalid Margin: "Margin cannot exceed MRP"}`, `{Info: "Enter at least 2 characters of product name"}`, `{Success: "Product details auto-filled! Review and adjust as needed."}`, `{Error: "Failed to fetch product details"}` (fallback), `{Error: "Product name and valid price are required"}`, `{Success: "Product added successfully"}`, `{Updated: "Product updated successfully"}`.
**OrderForm** *(Radix)*: `{Order Created!: "Order {n} created successfully"}`, `{Error: error.message}`; empty items hint `"No items added yet. Click \"Add Item\" to start."`.
**Orders**: `"Order status updated and stock adjusted"`, `"Error updating order"`, `"Please add your UPI ID in profile settings first"`, `"Payment link copied to clipboard!"`, `"Buyer phone number not available"`, `"Opening WhatsApp..."`; WhatsApp message `` `Hi! Payment link for order {n} (₹{amt}): {link}` `` (L215); tracking placeholder `"Enter tracking ID"`; empty states `"No Orders in This Category"` / `"No Self-Added Pharmacies"`.
**MyProducts**: `"Catalogue is now live! Pharmacies can now see your products."` / `"Catalogue is now offline"`, `"Error updating catalogue status"`, `"Product availability updated"`, `"Product deleted successfully"`, `"Error deleting product"`, LocationSelector mock toasts `` `Added location: {name}` `` / `"Location removed"`; empty `"No Products Yet"` + `"Start by adding your first product"`.
**Marketplace / MarketplaceProducts / SellerDetail / Cart / Checkout**: `"Added to favorites!"` / `"Failed to add to favorites"`; `"Cart updated"`, `"Failed to update cart"`, `"Cart cleared"`, `` `Cart is locked to another seller. Clear cart to order from {name}` ``; SellerDetail `"Please login to add items to cart"`, `"Removed from cart"`, `"Added to cart"`, `"Failed to add to cart"`; Checkout `` `Order {n} placed successfully!` `` / `"Failed to place order"`, address placeholder `"Enter complete delivery address with landmarks"`, Place Order disabled until address non-empty.
**MyCustomers**: `"Favorite updated"`; empty `"No Customers Yet"`, `"No pharmacy customers yet"`, `"No stockist customers yet"`.
**MySuppliers**: empty `"No suppliers yet"`.
**DeliveryPlanner**: `"Select at least 2 pharmacies to optimize route"`, `"Route optimized successfully!"`; empty `"No Pharmacies Found"`.
**Reports / Analytics / AdvancedReports**: `"Report exported successfully"`, `"PDF export coming soon"` (info), `` `Generating {type} report for {period}...` ``, `"Generating report..."`, `` `Exporting as {PDF|EXCEL}...` ``.
**Notifications**: `"You're all caught up!"`, `"No unread notifications"`.
**Support**: `"Support ticket created successfully"`, `"Failed to create ticket"`, `"Please fill in all required fields"`, subject placeholder `"Brief description of your issue"`; empty `"No Support Tickets"`.
**Settings**: `"Settings updated successfully"`, `"Notification preferences saved"` (no persistence).
**Profile**: `"Profile updated successfully!"` / `"Error updating profile"`, `"Password updated successfully!"` / `"Error updating password"`, `"Account deleted successfully"` / `"Error deleting account"`, `'Please type "DELETE" to confirm'`, `"Error logging out"`, `"Logged out successfully"`; bank empty-state hint `"Add your bank details to enable payments and go live"`; delete confirm placeholder `"DELETE"`.
**OTCPartnership**: `"OTC Subscription activated! 🎉"`.
**Onboarding**: `"Role assigned successfully!"` / `"Failed to assign role"`.
**Admin — UserManagement**: `"User verification updated"` / `"Failed to update user"`, `"User deleted"` / `"Failed to delete user"` (unwired mutation, §4.2). **SupportManagement**: `"Ticket status updated"` / `"Failed to update ticket"`; empty `"No Tickets Found"` / `"No support tickets have been created yet"`. **RoleAudit**: `"No data to export"`, `"Data exported successfully"`, `"Summary exported successfully"`. **AdminDashboard**: server message on wipe success, `"Failed to wipe data"`. **Subscriptions** *(Radix, unrouted)*: `{Subscription approved / User has been upgraded to premium}`, `{Request rejected / User has been notified}`, `{Approval failed}`, `{Rejection failed}`; rejection textarea placeholder `"Enter reason for rejection..."`; empty `"No pending subscription requests"` / `"No approved subscriptions yet"`. **Upgrade** *(Radix, unrouted)*: `{File too large / Please upload an image under 5MB}`, `{File uploaded / Payment proof uploaded successfully}`, `{Upload failed}`, `{Missing payment proof / Please upload payment screenshot}`, `{Missing UTR / Please enter UTR/Reference number}`, `{Request submitted! / Your subscription will be activated within 30 minutes of verification}`, `{Submission failed}`.

*End of Expansion Pass 2. All prior sections preserved verbatim.*


# Source: stockpharmaerp

## 0. GLOBAL ARCHITECTURE

### 0.1 Router (`src/App.tsx`)
- **QueryClient**: `staleTime 60s`, `gcTime 600s`, `retry 2` with exp backoff (`min(500*2^n, 5000)`), `refetchOnWindowFocus false`, `refetchOnReconnect true`, `refetchOnMount false`. Mutations: `retry 1`; global `onError` auto-calls `supabase.auth.refreshSession()` on 401.
- Providers nested: `QueryClientProvider > TooltipProvider > BrowserRouter > AuthProvider > PharmacyProvider > CartProvider`. Global widgets: `Toaster` (shadcn), `Sonner`, `PWAInstallPrompt`, `PWAUpdateNotification`, `NetworkStatus`, `SessionTimeoutWarning`, all wrapped in `RouteErrorBoundary` + `Suspense` (fallback `PageLoadingSpinner`). All page components are `React.lazy`.
- **Route table** (path → guard → component):
  - Public: `/` & `/login` → Login; `/forgot-password`; `/reset-password`; `/role-selection` (ProtectedRoute, no role — deprecated, just redirects to /login).
  - Onboarding (ProtectedRoute `requiredRole=X requiresOnboarding=false`): `/onboarding/{stockist|pharmacy|patient|brand|mr}`.
  - Stockist (ProtectedRoute `requiredRole=stockist`): `/stockist/home`, `/stockist/pharmacies`, `/stockist/pharmacies/:pharmacyId`, `/stockist/products`, `/stockist/orders`, `/stockist/orders/:orderId`, `/stockist/order-creation`, `/stockist/payments`, `/stockist/payment-approvals`, `/stockist/analytics`, `/stockist/route-execution`, `/stockist/pharmacy-approvals`, `/stockist/batch-ordering`, `/stockist/delivery-settings`, `/stockist/profile`.
  - Pharmacy portal (requiredRole=pharmacy): `/pharmacy/portal`, `/pharmacy/inventory`, `/pharmacy/ordering`, `/pharmacy/financials`, `/pharmacy/analytics`, `/pharmacy/stockists`, `/pharmacy/stockists/:stockistId`, `/pharmacy/cart`, `/pharmacy/checkout`, `/pharmacy/orders`, `/pharmacy/profile`.
  - Patient (requiredRole=patient): `/patient/dashboard`, `/patient/search`, `/patient/checkout`, `/patient/prescriptions`, `/patient/compare`, `/patient/ai-assistant`, `/patient/wishlist`, `/patient/orders`, `/patient/profile`.
  - Brand (requiredRole=brand): `/brand/dashboard`, `/brand/products`, `/brand/campaigns`, `/brand/analytics`, `/brand/fulfilment`, `/brand/profile`.
  - MR (requiredRole=mr): `/mr/dashboard` (=MRPharmacies), `/mr/pharmacies`, `/mr/collections`, `/mr/analytics`, `/mr/profile`.
  - Shared (ProtectedRoute, any role): `/support`, `/settings`.
  - Admin (AdminRoute): `/admin`, `/admin/users`, `/admin/recalls`, `/admin/notices`, `/admin/disputes`, `/admin/analytics`, `/admin/enhanced-analytics` (NOT linked from dashboard grid), `/admin/audit-logs`, `/admin/fees`, `/admin/documents`, `/admin/templates`, `/admin/territories`, `/admin/campaigns`, `/admin/pharmacy-approvals`.
  - Public catalogue (no auth; `PharmacySessionProvider` on all except license page): `/catalogue/:stockist_slug` (LicenseVerification), `/catalogue/:stockist_slug/dashboard`, `/catalogue/:stockist_slug/products`, `/catalogue/:stockist_slug/orders`, `/catalogue/:stockist_slug/checkout`.
  - Public: `/pharmacy-registration`. Errors: `/not-authorized`, `/offline`, `*` → NotFound.
- **Orphaned components** (built but NOT wired into router): `PatientSignup.tsx`, `BrandSignup.tsx` (self-serve signup pages exist but no route; only the Login page signup tab is used). `Index.tsx` exists (role→dashboard redirect) but `/` is mapped to Login, so Index is effectively dead too.

### 0.2 Contexts
- **AuthContext**: state `user, session, isLoading, userRole, isRoleLoading, onboardingComplete{stockist,pharmacy,patient,brand,mr}` (all default **true**), `signOut, refreshSession, lastActivity, updateLastActivity`. On sign-in, one `Promise.all` (8s `ROLE_FETCH_TIMEOUT`) queries: `user_roles` (single role via maybeSingle), `stockist_details` by profile_id, `pharmacy_details` by BOTH `auth_profile_id` and `profile_id`, `patient_details`, `brand_details`, `mr_details`. `onboardingComplete[role]` = `queryError ? true : !!data` (error → assume complete to avoid redirect loops). Session timeout `SESSION_TIMEOUT=30min`, activity events `mousedown/keydown/scroll/touchstart` (1s debounce), checked every 60s → toast + signOut. `signOut` clears Zustand store (`usePharmacyStore.clearAll()`), calls `supabase.auth.signOut()`, `localStorage.clear()`, `sessionStorage.clear()`, navigates `/login`. Handles `SIGNED_IN/SIGNED_OUT/TOKEN_REFRESHED`.
- **useUserRole(userId)** hook: fetches ALL roles, picks most-privileged: **admin > stockist > pharmacy > mr > brand > patient**.
- **CartContext** (pharmacy portal): items `{productId, productName, stockistId, stockistName, quantity, unitPrice, mrp, maxStock}`. Persist key `${role}_cart_${userId}` (guest_cart fallback). `addItem` merges by productId (qty clamped to maxStock), `updateQuantity` clamps 1..maxStock. Helpers: getStockistItems/Subtotal, getTotalItems, getTotalAmount (`Σ unitPrice*qty`), getUniqueStockists, clearStockistItems, clearCart.
- **PharmacyContext** (public catalogue): `pharmacy{id,name,license_number,outstanding_balance,credit_balance}`, `stockist{id,name,company_name,upi_id,slug}`, `orders[]`, `cart[]`. Session persisted to `localStorage.pharmacy_session`; cart to `localStorage.pharmacy_cart`. Cart item carries `gst_percentage`. `clearSession` wipes both keys.
- **PharmacySessionContext**: 20-min inactivity timeout (`PHARMACY_SESSION_TIMEOUT`), checked every 60s → toast + `clearSession()` + navigate to `/catalogue/{slug}` (re-verify license).

### 0.3 Route guards
- **ProtectedRoute**: uses cached auth (no queries). Skeleton loader; `MAX_LOADING_TIME=10s` fallback forces render. Redirect logic: no user → `/login` (saves `from`); no role → `/login`; role mismatch → own dashboard (`roleDashboardPaths`); onboarding redirect ONLY when `onboardingComplete[role]===false` (explicit).
- **AdminRoute**: security-hardened — ignores cache, re-queries `user_roles` server-side every mount; non-admin → `/not-authorized`; unauth → `/login`.
- **DashboardLayout** (stockist wrapper) also independently checks: no user→/login, no role→/role-selection, stockist w/o `stockist_details`→/onboarding/stockist.

### 0.4 Layouts & Navigation (exact items)
- **Stockist** (`DashboardLayout`/`StockistLayout` = StockistTopNav + StockistBottomNav): TopNav has global search Popover (searches pharmacies by name/owner/phone/area limit5, products by name/brand/generic/category limit5, orders by order_number limit5 — all selecting a result just navigates to the list page), StockistChatAssistant, Support (headphones), Notifications bell, User dropdown (Profile / Logout). **BottomNav** (StockistBottomNav): Home, Pharmacies, Products, Orders, Payments, **Profile**. (Note a second `BottomNav.tsx` exists with Home/Pharmacies/Products/Orders/Payments/**Analytics** — unused variant.)
- **Pharmacy** (`PharmacyLayout` = PharmacyTopNav + PharmacyBottomNav): TopNav search (catalogue-enabled stockists by name/company limit5 → `/pharmacy/stockists/:id`), PharmacyChatAssistant, cart button with item-count badge, Support, User dropdown. BottomNav: Home, Stockists, Cart, Orders, Profile.
- **Patient** (`PatientLayout` = PatientTopNav + PatientBottomNav): TopNav = hamburger Sheet (Profile/Settings/Support/Logout) + "Digi Swasthya" title + NotificationBell + user icon. BottomNav: Home, Search, Prescriptions, Wishlist, Profile.
- **Brand** (`BrandLayout` = BrandTopNav + BrandBottomNav): TopNav = hamburger Sheet (Profile/Settings/Support/Logout) + "Brand Portal" + NotificationBell.
- **MR** (`MRLayout` = MRBottomNav): BottomNav Dashboard, Pharmacies, Collections, Analytics, Profile.
- **Admin** (`AdminLayout` = AdminSidebar collapsible + AdminTopNav): Sidebar items → Dashboard, Users, **Approvals** (`/admin/pharmacy-approvals`), Batch Recalls, Notices, Disputes, Analytics, Audit Logs, Fee Management, Documents, Templates, Territories, Campaigns, Settings. (Sidebar does NOT list Enhanced Analytics.)

### 0.5 Infra
- **storage.ts** `uploadToStorage(file, bucket)`: folder = `session.user.id`; path `${uid}/${timestamp}_${cleanName}`; `product-images`→public URL; `bills`/`prescriptions`→signed URL (1h). CSV: `parseCSVContent` (delimiter auto-detect `,`/`;`/tab, header normalize), `mapCSVToProduct` (alias map for product_name/brand/category/type/mrp/purchase_price(ptr)/sale_price(pts)/stock_quantity/gst/manufacturer/generic_name/batch_number).
- **offlineSync.ts**: singleton queue in `localStorage.offline_sync_queue`; replays on `window online`; `offlineAwareFetch` queues POST/PUT/DELETE/PATCH when offline and returns synthetic **HTTP 202** `{queued:true}`.
- **supabaseHelpers.ts**: `withTimeout`, `invokeWithTimeout(fn, body, 30000)` — default 30s edge invoke timeout.
- **PWA** (vite.config): dev port 8080, SWC, gzip+brotli, manual vendor chunks; `registerType:'prompt'`, `skipWaiting:false`, `navigateFallback:'/offline'`. Workbox: Supabase→NetworkFirst(10s,1d,100), images→CacheFirst(30d), fonts→CacheFirst(365d). Update poll 60s.
- **SessionTimeoutWarning**: AlertDialog appears in final 5 min with live `mm:ss` countdown; "Stay Logged In"→refreshSession, "Logout Now"→signOut.

---

## 1. AUTH & ONBOARDING

### 1.1 Login (`/login`, `/`) — `Login.tsx`
- Card titled **Digi Swasthya Store** / "Your Complete Healthcare Platform". Tabs: **Login** / **Sign Up**.
- **Login form**: Email (email, required), Password (password, required), "Remember me" checkbox (state only, not used), "Forgot password?" link. Submit → `supabase.auth.signInWithPassword`. On success toast; `useEffect` redirects by role via `redirectBasedOnRole`: admin→/admin; else `roleConfig[role].dashboard` unless `onboardingComplete[role]===false` → onboarding.
- **Sign Up form**: role grid (6 cards: **stockist/pharmacy/patient/brand/mr** — note admin NOT self-signup; the grid is `Object.keys(roleConfig)` = 5 roles) with icons (Building2/Store/User/Briefcase/Users); Email (required), Password (required, min 6), Confirm Password (required). Validations: role selected, passwords match, length≥6. Submit → `auth.signUp` (emailRedirectTo `${origin}/login`) → upsert `user_roles{user_id,role}` (onConflict user_id,role) → upsert `profiles{id,email}` → navigate to `roleConfig[role].onboarding`. Duplicate email → friendly error.
- Loading: skeleton card while `authLoading`.

### 1.2 ForgotPassword (`/forgot-password`)
- Email input → `auth.resetPasswordForEmail(email, {redirectTo:${origin}/reset-password})`; success state shows confirmation + Back to Login.

### 1.3 ResetPassword (`/reset-password`)
- Verifies session from reset link (else redirects to /forgot-password). New Password + Confirm (min 6, must match) → `auth.updateUser({password})` → /login.

### 1.4 RoleSelection (`/role-selection`) — deprecated
- Immediately toasts "Please use the signup form to select your role" and redirects to /login.

### 1.5 Onboarding flows
- **StockistOnboarding** (`/onboarding/stockist`): auth+role check; if `stockist_details` exists → /stockist/home. First run shows **OnboardingCarousel** (3 slides: Add Your Products / Share Your Catalogue / Track Everything) gated by `localStorage.onboarding_completed_stockist`. Form fields: Drug License Number*, Your Name* (stockist_name), Company Name*, Phone (tel), Business Address (textarea). Submit → slug `slugify(companyName)+'-'+Date.now()` → insert `stockist_details{profile_id, license_number, stockist_name, company_name, phone, address, catalogue_slug}` → /stockist/home.
- **PharmacyOnboarding** (`/onboarding/pharmacy`): keys on `auth_profile_id`; carousel (Browse Stockists / Compare & Order / Track Your Orders) gated by `onboarding_completed_pharmacy`. Fields: Pharmacy Name*, Owner Name*, Drug License Number*, GST Number*, Phone* (tel), Email, Address* (textarea), PIN Code*, Area. Insert `pharmacy_details{auth_profile_id, pharmacy_name, owner_name, license_number, gst_number, phone, email, address, pin_code, area}` → /pharmacy/portal.
- **PatientOnboarding** (`/onboarding/patient`): no carousel. Fields: Full Name* (patient_name), Phone* (tel), Date of Birth (date), Gender (Select male/female/other), Blood Group (Select A+…O-). Client validation requires name+phone. Insert `patient_details` → /patient/dashboard.
- **BrandOnboarding** (`/onboarding/brand`): waits for auth/role, redirects if role≠brand; if `brand_details` exists → /brand/dashboard. Fields: Brand Name*, Company Name*, Contact Person, Phone, Email, GSTIN, Manufacturing License, Address (textarea). Insert with `is_verified:false, is_active:true` → /brand/dashboard.
- **MROnboarding** (`/onboarding/mr`): if `mr_details` exists → /mr/dashboard. Fields: License Number*, Your Name* (mr_name), Company Name*, Phone, Address. Insert with slug `slugify(companyName)+'-'+Date.now()` (catalogue_slug) → /mr/dashboard.
- **OnboardingContent**: STORAGE_KEYS = `onboarding_completed_{stockist|pharmacy|catalogue}`. Illustrations in OnboardingIllustrations.tsx.

---

## 2. STOCKIST MODULE

### 2.1 Dashboard (`/stockist/home`) — `Dashboard.tsx`
- Uses `useStockistId` (React Query), `usePendingPayments(stockistId, 3)`, `useProcessPayment`, `useDashboardStats(stockistId)`. Realtime channel `dashboard-orders-updates` on `orders` filter stockist_id → refetch platform orders.
- **Header**: title "Dashboard" / "Welcome to your stockist control panel"; `DateRangeFilter` (calendar range popover, 2 months, Clear button — **display only, not applied to any query**); **Export** button → `ExportDataDialog`.
- **Quick Actions** card → `QuickActions` component: 8 tiles — **Quick Order** (paste→parse), **Quick Bill**, **Edit Order**, **OCR Scan** (ProductScanDialog), **Bulk Upload**, **Map Route**, **Upload Bill Photo** (BillUploadDialog), **Delivery Settings** (navigates). (Edit Order tile opens EditOrderDialog with `selectedOrderId=null` — effectively needs an order id, so it renders null until one is chosen — a soft stub.)
- **KPI Cards** (`KPICards`, clickable → `handleKPIClick` opens `KPIDetailDialog`): 5 cards, each shows hardcoded fake trend badges:
  - **Total Revenue** = `Σ orders.total_amount` (all orders for stockist). Sub "Today: ₹{todayRevenue}". trend "+12.5%".
  - **Pending Payments** = `Σ pharmacy.outstanding_balance` over pharmacies that have orders w/ this stockist. trend "-5.2%".
  - **Total Credits** = `Σ pharmacy.credit_balance` (same pharmacy set). trend "+3.1%".
  - **Active Pharmacies** = count of `is_active` pharmacies that have orders w/ stockist. trend "+2".
  - **Total Orders** = orders.length. Sub "Today: {todayOrders}". trend "+8.7%".
  - `useDashboardStats` formulas: parallel fetch orders (`total_amount,payment_status,created_at,pharmacy_id`) + active pharmacies (`outstanding_balance,credit_balance`). `todayOrders`=orders where `new Date(created_at).toDateString()===today`. Realtime channels `dashboard-stats-orders-{id}` (orders), `dashboard-stats-pharmacy-{id}` (pharmacy UPDATE).
  - **KPIDetailDialog** content by type: revenue/orders → order list (pharmacy name, order_number, relative time, ₹total, payment badge); pending → pharmacies with outstanding (name/area/₹outstanding); credits → pharmacies (+₹credit); pharmacies → cards (owner/area/total_orders). `handleKPIClick` queries: pending = unique pharmacy_ids from orders w/ payment_status in (unpaid,partial), then pharmacy_details `gt outstanding_balance 0`; credits = `gt credit_balance 0`; pharmacies = `is_active true`.
- **Payment Approvals card**: border turns `destructive/50` when pending>0; destructive Badge "{n} Pending". Shows up to 3 pending confirmations, each: pharmacy_name, ₹amount, payment_type badge, optional pharmacy_notes; inline buttons **Reject / Hold / Approve** (via `useProcessPayment.mutateAsync({confirmationId, action})`). "View All Payment Approvals" link. Empty state → "No payment approval requests yet" + View Payment History link.
- **Recent Platform Orders** card (only if platformOrders>0): fetches orders `order_source='platform'` limit5; each row (pharmacy name, order_number, "Platform Order" badge, ₹total, left-border primary) → `/stockist/orders/:id?source=platform`. "View All Platform Orders".
- **LowStockAlert** (orange card, only renders if any): products where `stock_quantity <= min_stock_threshold`, sorted asc, top 5 (name, brand, "{n} left" badge). "View All Products".
- **TopProducts** ("Top Selling Products"): aggregates `order_items` joined to confirmed orders of stockist; ranks by total_quantity desc top 5 (rank badge, name, units sold, ₹revenue).
- **NoticesPanel**: fetches `user_notice_recipients` for user (not dismissed) → `admin_notices` active & not expired. Each notice: icon by type (alert/warning/info), title, priority badge, content, created date, dismiss X (sets `dismissed_at`), click marks `read_at`. "N New" badge = unread count. Realtime on `user_notice_recipients` INSERT.
- **RecentOrders** (collapsible): last 5 orders (order_number, pharmacy_name, relative time, ₹total, status badge). Status colors map draft/confirmed/processing/delivered/cancelled.
- **ActivityFeed** (collapsible): `activity_log` last 50, filter Select (all / catalogue_update / price_change / order_modified / payment_reminder); shows 10 with icon+description+relative time; realtime INSERT.
- **ExportDataDialog**: RadioGroup Orders/Payment Confirmations/Activity Log → fetches all rows for stockist → naive CSV (headers = Object.keys(row[0]), values JSON.stringify for objects) → downloads `{type}_{yyyy-MM-dd}.csv`.

### 2.2 Pharmacies (`/stockist/pharmacies`) — `Pharmacies.tsx`
- Uses `useStockistId` + `useCachedPharmacies(stockistId)` (cache w/ invalidate). Realtime: `pharmacies-payments-updates` (payment_confirmations UPDATE→approved), `pharmacies-orders-updates` (orders *), `pharmacies-details-updates` (pharmacy_details UPDATE). Search filter over name/owner/phone/area.
- **fetchPendingOrders**: orders for stockist where `payment_status in (unpaid,partial) OR delivery_status≠delivered OR status=cancelled`, ordered created_at ASC (FIFO), grouped by pharmacy_id.
- **Per-pharmacy financials** (`calculateFinancials`, computed for ALL pharmacies):
  - `totalOutstanding = Σ max(0, total_amount - paid_amount)` over unpaid/partial orders.
  - `latestBillDue` = first (newest listed) unpaid order's due + its `payment_due_date||created_at`.
  - `pastDues = Σ max(0, due)` over unpaid orders whose `payment_due_date < now`.
  - `ordersPending` = count of all grouped orders.
- **Pharmacy card**: name (click→detail), owner, Active/Inactive badge + Lock icon when inactive (opacity-60). Contact: phone (tel link + copy-to-clipboard), address. Financial block: Credit Balance (green, if>0), Total Outstanding (destructive), **Net Due** = `max(0, outstanding_balance - credit_balance)` (only if credit>0), Latest Bill Due (amber), Past Dues (red, if>0), Orders Pending count.
- **Row menu** (MoreVertical): View Details, Edit (EditPharmacyDialog), Mark Active/Inactive (toggle is_active), Delete Permanently (`handleDelete`: hard delete, on FK failure falls back to soft delete `is_active=false`).
- **Payment actions per card**:
  - **Custom amount input + Submit** (`handleCustomPayment`): credit-first FIFO. Fetches pharmacy.credit_balance; if credit>0 uses `creditUsed=min(payment,credit)`, `totalFundsToDistribute=creditUsed+payment`, deducts creditUsed. Then FIFO over unpaid orders sorted oldest-first (excludes cancelled): applies `min(remaining, orderDue)`, marks 'paid' when `|total-newPaid|<0.01` (rounding tolerance) else 'partial'; leftover >0.01 → back to credit_balance. Inserts an **approved** `payment_confirmations{payment_type:'custom', payment_method:'custom_amount', processed_by}`. Recalculates `outstanding_balance`. Disabled if inactive/empty/≤0.
  - **Create Order** → navigates `/stockist/order-creation` with `state.preSelectedPharmacyId`.
  - **Quick Bill** → QuickBillDialog (preselected).
  - **WhatsApp Reminder** → `wa.me/{phone}?text=` "Payment reminder for outstanding amount: ₹{totalDue}…".
  - **Mark Fully Paid** (`handleMarkFullyPaid`): sets `paid_amount=total_amount, payment_status=paid` for all unpaid orders; recalcs balance; logs `activity_log{activity_type:'payment_received'}`. Disabled if outstanding≤0.
- **Expandable orders** ("View All Orders (N)"): each order shows order_number (link→OrderItemsDialog), amount, computed due `max(0,total-paid)`, status badge with 0.01 tolerance (paid/partial/CANCELLED), inline **delivery_status Select** (Pending/Dispatched/Delivered — optimistic update, revert on error).
- **Dialogs**: AddPharmacyDialog, EditPharmacyDialog, QuickBillDialog, OrderItemsDialog.
- **AddPharmacyDialog fields**: Pharmacy Name*, Full Name (Google Maps), Owner Name, Phone(tel), Pin Code (6), GST Number*, License Number* ("used as password for catalogue access"), Credit Limit (₹, default 0), Area, Full Address (textarea), Location Coordinates (lat,lng). On submit: inserts `pharmacy_details{profile_id: stockist.id, ...}` (profile_id set to stockist's id for RLS) + **creates placeholder order** `INIT-{ts}` (total 0, delivered, paid) to establish relationship so pharmacy appears immediately.

### 2.3 Pharmacy Detail (`/stockist/pharmacies/:pharmacyId`) — `PharmacyDetail.tsx`
- Recomputes on load from orders: total_orders count, total_revenue `Σ total_amount`, outstanding `Σ (total-paid)` over unpaid/partial.
- Header: Create Order, Send Reminder (WhatsApp w/ a hardcoded placeholder `upi://pay?pa=yourUPI@bank...` link — bug/stub).
- **Quick stats** (4 cards): Total Outstanding (red), Total Revenue, Total Orders, Credit Limit.
- **Tabs**: Orders (`PharmacyOrdersList`), Bills (`PharmacyBillsList` — only orders with bill_number+bill_image_url, View Bill), Reminders (`PharmacyRemindersList` — `payment_reminders`, Nudge re-sends WhatsApp + logs a new reminder), Details (`PharmacyDetailsTab` — basic/contact/financial incl. Available Credit = credit_limit − outstanding).

### 2.4 Products (`/stockist/products`) — `Products.tsx`
- 20 hardcoded `MEDICAL_CATEGORIES` (Analgesics… Others). Realtime `products-realtime` on products.
- Header: Add Product; quick actions **Scan** (ProductScanDialog), **Bulk** (BulkUploadDialog), **Enhance All** (`handleEnhanceAllProducts`: finds products missing generic/brand/manufacturer/category/type; confirm; loops `fetch-product-info` per product, updates fields; toast "Enhanced N products").
- Search (name/brand/category). Filters (4 Selects): Brand (distinct), Category (MEDICAL_CATEGORIES), **Expiry** (30/60/90/120 days — filters where earliest `product_batches.expiry_date` diff in [0,days]), **Sort** (default/name/price-low/price-high/stock-low).
- `fetchTopProducts`: 30-day order_items aggregation by product_name (top 5 names matched to product objects). `fetchExpiryMap`: earliest batch expiry per product.
- **Sections**: Top Products This Month (horizontal cards); Items to Watch Out For (products where `stock ≤ threshold && stock>0`, top 4).
- **Product card** (grid): image (fallback placeholder.svg), name, brand, sale_price bold + MRP strikethrough (if mrp>sale), "Stock: N | Sale: ₹", expiry badge (`getExpiryBadge`: Expired if diff<0, {diff}d destructive if≤30, {diff}d secondary if≤90, {months}mo outline), row menu (Edit/Delete w/ confirm), **Add Stock** (QuickUpdateStockDialog).
- **AddProductDialog fields**: Product Name* + **Auto Fetch** button (`fetch-product-info` fills generic/brand/manufacturer/type/category/pack_size/strength); Generic Name/Salt (hint "+ for multiple salts"); Brand; Manufacturer; Form/Type (Select: tablet/capsule/syrup/injection/drops/cream/powder/suspension/inhaler/lotion/gel/patch/spray/solution); Category (Select ~24 values); Pack Size; Strength (hint "+" for combos); MRP; Purchase Price; Sale Price; Stock Quantity (default 0); Min Stock Alert (default 10); MOQ (default 1); GST % (default 5); Product Image (upload to `product-images`); Description; batch_code (in state but not in insert). Insert to `products`; logs `activity_log{activity_type:'catalogue_update'}`.
- **EditProductDialog**: same fields pre-filled + **HSN Code** and **Batch Code** inputs + **Fetch with AI**. NOTE: update payload does **NOT persist `hsn_code` or `batch_code`** (they're in the form but omitted from the `.update(...)` object) — known gap. Type dropdown only has 6 options (fewer than Add).
- **QuickUpdateStockDialog**: mode toggle **Add Stock** vs **Set Stock**; quantity input; live "New stock will be: N" preview (add mode); updates `stock_quantity`.
- **ProductScanDialog (OCR)**: upload image→`uploadToStorage(product-images)`→`extract-product-label`; staged progress (10/30/70/85/100%). Prefills mrp/batch_number/expiry_date. Matches existing product (exact `.eq(name)` then `.ilike`). Shows "Product exists" (blue, current stock/MRP) or "New" (green). **"Correct — Enable Editing"** unlocks MRP*/Stock*/Purchase*/Sale*/Batch/Expiry (all disabled until confirmed). Existing → `stock += entered`, updates prices/brand/manufacturer/strength; new → insert. Logs activity.
- **BulkUploadDialog** (3 tabs): **Purchase Bill / Sale Bill / Full Catalogue**. Accepts images/PDF/CSV/XLSX (catalogue = CSV/XLSX only), 10MB max. Spreadsheets parsed locally (`parseSpreadsheet` w/ header alias map + `isValidProductName` filter that rejects phone/email/gstin/total/page/etc); images→`extract-bill-items` (AI). **Preview** table: matches against existing products (normalized name) → status found/new/error; margin input (default 20%). Purchase: existing → `stock += qty`, set purchase_price + `sale_price=price*(1+margin/100)`; new → insert w/ `mrp=price*1.3`. Sale: existing → `stock -= qty`; new → error "not found". Catalogue tab: upsert on conflict `stockist_id,name` (dupes counted skipped). Templates downloadable. AbortController cancel. Logs activity per operation.

### 2.5 Orders (`/stockist/orders`) — `Orders.tsx`
- Realtime `orders-realtime-updates` (UPDATE). Filters: Pharmacy (Select of active pharmacies), Payment Status (paid/unpaid/partial), Order Source (manual/platform/whatsapp), Clear button. **Status tabs** (buttons with counts): All / Pending (`status=confirmed && delivery_status=pending`) / Out for Delivery (`delivery_status=out_for_delivery`) / Delivered / Cancelled.
- Desktop **table** columns: Order # | Pharmacy | Status | Payment | Delivery | Amount (right) | Date (MMM dd, yyyy) | Actions (OrderActionsDropdown). Mobile: OrderCard grid. New Order → PharmacySelectDialog → `/stockist/order-creation?pharmacy=:id`.
- Badges: status(draft=secondary/confirmed=default/cancelled=destructive), payment(paid=default/unpaid=destructive/partial=secondary), delivery=outline.
- **OrderActionsDropdown** actions: **Mark as Paid** (paid_amount=total, status=paid; inserts approved payment_confirmation `manual_mark_paid`), **Partial Payment** (dialog; validates `amount ≤ due`; new status paid if `|total-newPaid|<0.01` else partial; inserts confirmation `manual_partial`), **Mark as Delivered** (delivery_status=delivered, status=confirmed), **Cancel Order** (confirm; if paid>0 message says "₹X added as credit"; sets status=cancelled).

### 2.6 Order Detail (`/stockist/orders/:orderId`) — `OrderDetail.tsx`
- Three status cards (Order/Payment/Delivery). **Order Information**: order_number, order date (PPp), delivery_date (if set), **Order Source** badge ("Platform Order" if platform else "Manual Order"), notes. **Payment Information**: Subtotal = `total_amount - tax_amount`, Tax, Total (bold), Net Amount, **Send Reminder** button → PaymentLinkDialog (requires phone). **Pharmacy Details** (name/owner/phone/address). **Order Items (N)** with **Edit Items** → OrderItemsDialog; each item: name, description, "Qty × ₹unit (GST %)", tax line, ₹total (uses Math.round).

### 2.7 Order Creation (`/stockist/order-creation`) — `OrderCreation.tsx`
- pharmacyId from `?pharmacy=` or `location.state.preSelectedPharmacyId`. Loads stockist + pharmacy + active products (`gst_percentage, batch_code`).
- **Quick Add — Paste Order**: textarea → **Parse & Add Items** (`parse-order-message`); adds matched items where `productId && matchConfidence≠'none'`, warns unmatched count.
- **Manual add**: product Select + quantity; allows over-stock (toast warning "Only N in stock. Item added but marked as insufficient."). Per-item GST = `product.gst_percentage||5`; `tax=subtotal*rate/100`.
- **Order Summary**: Subtotal `Σ qty*unit`, **SGST = tax/2**, **CGST = tax/2**, Total `subtotal+tax`.
- **Order Items table**: Product (insufficient→destructive bg + "Only N left" badge + inline **Update Stock** button→QuickUpdateStockDialog), Quantity, Unit Price, Tax (%+₹), Total, remove. Clear All.
- **Create Order** (`handleCreateOrder`): order `ORD-{Date.now()}`, `status=confirmed, payment_status=unpaid, delivery_status=pending, order_source=manual`, total/net=totalAmount, tax_amount; inserts items (incl gst_percentage, tax_amount, batch_code); decrements product stock per item; opens PaymentLinkDialog (on close → /stockist/orders); recalculates pharmacy `outstanding_balance`.

### 2.8 Payments (`/stockist/payments`) — `Payments.tsx`
- Realtime `orders-payments-updates`. Summary cards: **Total Outstanding** = Σ over dedup-by-pharmacy of `pharmacy.outstanding_balance` (uses `findIndex` dedup); **Pending Invoices** = `Σ total_amount` of unpaid/partial + count; **Received This Month** = `Σ total_amount` of paid orders whose `updated_at` month/year = now + count.
- Tabs: **Pending Invoices** (table: Pharmacy | Order # | Status | Invoice Amount | Outstanding | Order Date | Actions), each row **Send Reminder** (dialog: amount prefilled=outstanding||total, "Use Full Outstanding" button, message textarea; inserts `payment_reminders{status:sent}` + `communication_log{type:whatsapp}`, opens WhatsApp) and **Mark Paid** (`handleMarkPaid`: paid_amount=total, status=paid; inserts approved confirmation `manual_payments_page`; recalcs balance). **Received** tab (last 50 paid: Pharmacy|Order#|Amount|Payment Date).

### 2.9 Payment Approvals (`/stockist/payment-approvals`) — `PaymentApprovals.tsx`
- Realtime `payment-approvals-realtime`. Header: animated destructive "{n} Pending" badge (pending count) + Refresh. Lists all confirmations (pharmacy, ₹amount, payment_type + created datetime, pharmacy_notes, status badge approved/rejected/on_hold/pending). Review button for pending/on_hold → dialog with optional **Your Notes** textarea and **Reject / Put on Hold / Approve** → `approve-reject-payment` edge fn.

### 2.10 Analytics (`/stockist/analytics`) — `Analytics.tsx`
- KPI cards: Total Revenue (`Σ total_amount`), Total Orders, Active Pharmacies (**count of ALL pharmacy_details** via head count — not scoped to stockist, likely a bug), Products (stockist's count). Tabs (Recharts): **Revenue Trends** (LineChart revenueByMonth, last 6 months by `MMM yy`), **Order Analysis** (PieChart ordersByStatus), **Top Pharmacies** (BarChart top 5 by revenue). topProducts collected as `[]` (unused).

### 2.11 Route Execution (`/stockist/route-execution`) — `RouteExecution.tsx`
- Requires `location.state {selectedPharmacyIds, startingAddress, stockistId}` (from MapRouteDialog). Fetches pharmacies + their non-delivered orders. **Auto-optimizes on load** via `optimize-route`. Route Summary: total distance + per-leg "d1 + d2 + return" + **Re-optimize with AI**. **Drag-and-drop reorder** (@dnd-kit) — reorders list, toasts "Re-optimizing…" (does not actually recompute distances). Per-stop **SortablePharmacyCard**.
- **SortablePharmacyCard**: drag handle, stop number, name/address, badges Due/Credit/Net/Fully Paid, distance. Expanded: Orders to Deliver list; **Notify Dispatch via WhatsApp** (whatsapp_number||phone; message with all order numbers); **Send Payment Link** per unpaid order (requires stockist UPI configured → PaymentLinkDialog); **Enter Collection Amount** + payment mode Select (cash/online/cheque/other) → **Record Payment** (FIFO over orders, inserts approved `payment_confirmations{payment_type:'route_collection'}`); **Mark Delivered** (sets all pharmacy orders delivery_status=delivered). `totalDue=Σ(total-paid)`, `netDue=max(0,totalDue-credit)`, `isFullyPaid=|totalDue|<0.01`.
- MapRouteDialog (from Quick Actions): starting address input; lists pharmacies with non-delivered orders (grouped, expandable per-order w/ payment+delivery badges, click order# → OrderItemsDialog); Select All / checkbox select; **Open in Google Maps** (builds `maps/dir` URL origin+destination+waypoints from coords/google_maps_name/address); **Start Route with AI** → navigates to RouteExecution.

### 2.12 Pharmacy Approvals (`/stockist/pharmacy-approvals`) — `StockistApprovals.tsx`
- Realtime on `pharmacy_registration_requests`. Shows only requests whose `pin_code ∈ stockist_service_areas` (active). If no service areas → empty. Table: Pharmacy | Owner | License # | PIN | Status | Submitted | Review.
- Status badge logic: approved→"Approved & Added"; rejected; both approved→"Both Approved"; admin_approved→"Admin Approved"; stockist_approved→"You Approved"; else "Pending Review".
- Review dialog: all fields + document buttons (drug_license/gst_certificate/other) + approval indicators (Admin Approved / Your Approval). **Approve** (`handleApprove`): sets stockist_approved+by+at+stockist_id; if `admin_approved` already true → status='approved' + **inserts `pharmacy_details`** (profile_id=stockist.id, is_active). Dual-approval model.

### 2.13 Batch Ordering (`/stockist/batch-ordering`) — `BatchOrdering.tsx`
- Fetches current `order_batch_cycles` where status='collecting'. If none → **Start New Cycle** → `create-batch-cycle`. Summary cards: Cycle Period, Total Orders, Total Value, Delivery Date. List of batched orders (pharmacy, order_number, ₹total, status).

### 2.14 Delivery Settings (`/stockist/delivery-settings`) — `DeliverySettings.tsx`
- Tabs: **Delivery Dates** (multi-select Calendar → toggles/inserts `stockist_delivery_dates{is_active}`; upcoming list w/ Active/Disabled badges), **Service Areas** (add 6-digit PIN + optional area name → `stockist_service_areas`; dup PIN error 23505; Switch toggle active; delete; "only pharmacies in these areas can order"), **Delivery Fees** (rule type Select: **Flat Fee / Free Above Order Amount / Per KM Charge**; value; inserts `stockist_delivery_rules` w/ priority=count+1; table priority/type/description/status/delete).

### 2.15 Stockist Profile (`/stockist/profile`) — `StockistProfile.tsx`
- Edit toggle. Tabs: **Personal** (Stockist Name/Company/License/Phone/Email(readonly)/Address), **Bank** (UPI ID, Bank Name, Account Number, IFSC, Account Holder Name), **Business** (GSTIN, Default Credit Days default 30), **Catalogue** (status badge active/inactive; shareable `${origin}/catalogue/{catalogue_slug}` w/ copy), **Areas** (add PIN, toggle active, delete `stockist_service_areas`).

### 2.16 Stockist Quick dialogs (details)
- **QuickOrderDialog**: pharmacy Select (fetched by `profile_id=stockistId`), order textarea (Zod: pharmacy required, text≥10). **Analyze Order with AI** → `parse-order-message`; results table with matchConfidence badges (Exact/High/Medium/Select), inline product Select for low/none, editable qty, remove, add manual item, order summary (taxRate toggle 5/12, default 12). **Create Order**: blocks if any unmatched or none/low; order `ORD-{ts}`, `order_source='whatsapp'`, status=confirmed; net=total+tax; inserts items+tax; decrements stock; logs activity; recalcs balance.
- **QuickBillDialog**: pharmacy Select (all active), product Select+qty (validates stock), items table, total. **Create Bill**: `ORD-{ts}`, confirmed/unpaid/pending, `order_source='manual'`; inserts items; decrements stock; logs `order_created`; recalcs balance. (taxRate state exists but total is untaxed.)
- **BillUploadDialog**: upload image/PDF→`uploadToStorage(bills)`→`extract-bill-items` (preview). Pharmacy matching: exact/partial/not_found (create-new checkbox or select existing). **Confirm & Create Order** → `process-bill-image` (passes preview items to skip re-AI); shows created count / auto-created products / failed.

---

## 3. PHARMACY MODULE

### 3.1 Authenticated Portal (`/pharmacy/*`, CartContext)
- **Dashboard** (`/pharmacy/portal`): resolves pharmacy by `auth_profile_id`. Realtime on `pharmacy_inventory` + `orders`. KPIs: **Inventory Value** = `Σ quantity*(unit_price||0)`; **Low Stock Items** = count where `quantity ≤ low_stock_threshold`; **Expiring Soon** = count where `expiry_date ≤ now+30d`; **Orders This Month** = count since 1st of month. Quick Actions grid: Manage Inventory, Browse Stockists, My Orders, View Analytics.
- **Inventory** (`/pharmacy/inventory`): `pharmacy_inventory` table (Product | Batch | Quantity | MRP | Expiry Date | Status | Actions). Stock badge Out/Low/In (`getStockStatus`), expiry badge Expired/"Expires in Nd" (≤30). **Add Product** + **Edit** buttons are present but **unwired** (no handlers).
- **Ordering** (`/pharmacy/ordering`): per-stockist tabs (catalogue_enabled stockists) listing products (MRP, Your Price=sale_price, Stock). `comparePrice()` is a **`Math.random()` placeholder** ("Lowest price! Save ₹X"); **Add to Cart** button is unwired.
- **Browse Stockists** (`/pharmacy/stockists`): search name/company/address. Cards: product count (head count), next delivery date (earliest active future `stockist_delivery_dates`), phone, address. **Stockists serving the pharmacy's PIN sorted first** (via `stockist_service_areas`). View Catalogue → StockistCatalogue.
- **Stockist Catalogue** (`/pharmacy/stockists/:stockistId`): CATEGORIES = All/Tablets/Capsules/Syrups/Injections/Ointments/Drops/Other. Products where `is_active && stock_quantity>0`. Search (name/brand/category) + category filter. Card: name, brand, sale_price + MRP strikethrough, **discount% = round((mrp-sale)/mrp*100)**, stock, pack size, quantity stepper clamped **MOQ..stock**, Add/Update Cart (ring-2 highlight when in cart). Quantities initialized from cart + MOQ. Cart badge count in header.
- **Cart** (`/pharmacy/cart`): empty state (Browse Stockists). Items **grouped by stockist**, per-stockist subtotal + "Remove All", per-item qty stepper (1..maxStock) + remove, Clear Cart. Order Summary: per-stockist subtotals, Subtotal, "Delivery Fees: Calculated at checkout", **Total shown as `₹X+`** (fees pending). Proceed to Checkout / Continue Shopping.
- **Checkout** (`/pharmacy/checkout`): **separate order per stockist group**. Per group: Subtotal, **GST 5%** (`subtotal*0.05`), **Delivery Fee** via `calculate-delivery-fee` (fallback `subtotal≥5000?0:50`), Total = subtotal+gst+fee; free-delivery green alert if fee=0; per-order notes textarea. **Place Order** per group: order `ORD-{ts}`, `order_source='pharmacy_portal'`, confirmed/unpaid/pending, delivery_address=pharmacy.address; inserts items; RPC **`deduct_stock`** per item (warns on insufficient); clears that stockist's cart. **Place All N Orders** loops groups. Grand Total = Σ group totals. Success screen when all completed. Payment is COD/credit terms (alert). Delivery address card = pharmacy name/address/phone.
- **Orders** (`/pharmacy/orders`): search (order#/stockist) + status filter (all/confirmed/processing/shipped/delivered/cancelled). Collapsible cards: order_number + status badge + payment badge; stockist, date; ₹net_amount + "Due: ₹{net-paid}" (if>0). Expanded: items list, summary (Subtotal, GST, Total, Paid if>0). STATUS_COLORS/PAYMENT_COLORS maps.
- **Financials** (`/pharmacy/financials`): Outstanding (from pharmacy_details), Credit Balance (+₹), Total Purchases (`Σ total_amount`), Avg Order Value (`total/count`).
- **Analytics** (`/pharmacy/analytics`): inventory stat tiles only (no charts) — Total Products, Low Stock Items, Expiring Soon (≤30d), Inventory Value (`Σ qty*unit_price`).
- **Profile** (`/pharmacy/profile`): tabs Store Info (name/owner/phone/email readonly), License (drug license, GST), Location (address/PIN(6)/area). Keys by `auth_profile_id`.

### 3.2 Public Catalogue (`/catalogue/:stockist_slug/*`, PharmacyContext, no login)
- **License Verification** (`/catalogue/:slug`): first-visit OnboardingCarousel (Quick Verification / Browse Products / Easy Ordering) gated by `onboarding_completed_catalogue`. Form: Pharmacy Drug License Number* (mono, case/symbol-insensitive), Pharmacy PIN Code (optional, 6). Submit → `verify-pharmacy-license`. On `verified` → sets PharmacyContext pharmacy+stockist(+upi_id)+orders → `/catalogue/{slug}/dashboard`. Shows rate-limit message + "Attempts remaining: N" on failure. "First time user? Contact stockist" alert.
- **Catalogue Dashboard** (`/dashboard`): fetches latest balance, outstanding orders via `get-pharmacy-outstanding-orders`, last 5 `payment_confirmations`. Realtime on orders / pharmacy_details / payment_confirmations. Welcome card (name, license). Credit Balance panel (if>0), Outstanding Balance (destructive), Net Amount Due = `max(0, outstanding-credit)`. **Mark Payment** button (if outstanding>0) → MarkPaymentDialog. **UPI QR** (UpiQrCode for full outstanding) if stockist.upi_id. Quick actions Browse Products / My Orders. **Payment Requests** history (₹amount, datetime, status badge ✓Approved/✗Rejected/⏸On Hold/⏳Pending). **Outstanding Orders** breakdown (per order: number, date, Paid badge if partial, item lines, ₹outstanding). Recent Orders (last 5). Logout → clearSession.
- **Catalogue** (`/products`): products `is_active`. Search (name/brand/generic) + category + sort (name/price_asc/price_desc). Product card: image, name, brand, "Salts: {generic}", MRP strikethrough + sale_price, strength/pack badges, quantity stepper (min 1), Add to Cart. Cart carries `gst_percentage||5`. Cart button count in header.
- **Orders** (`/orders`): platform orders list (order_number, datetime, payment/delivery/status badges, Total/Paid/Pending, notes). Realtime.
- **Checkout** (`/checkout`): **per-item GST** — `calculateTotals`: per item `subtotal=qty*unit`, `tax=subtotal*gst%/100`, total; grandTotal=subtotal+Σtax; **no delivery fee**. Cart item rows w/ qty steppers/remove. **Place Order** → OrderConfirmationDialog (review + "requires stockist approval" warning) → `create-platform-order`. Success screen: bill summary (Subtotal, Total Tax, This Order Total, Outstanding Balance) + **integrated UPI payment**: RadioGroup (Pay This Order / Pay Total Outstanding / Custom Amount) → dynamic UpiQrCode + copyable `upi://pay?pa=...&am=...&tn=Order-...` deep link + "Payment requires stockist confirmation before updating your balance." Back to Dashboard / Continue Shopping.
- **MarkPaymentDialog**: RadioGroup Full Outstanding / Custom Amount / Specific Order (Select of unpaid orders). Notes. → `mark-payment-paid` (creates **pending** confirmation). "Pending Approval" notice.

### 3.3 Public Pharmacy Registration (`/pharmacy-registration`)
- Public form (no auth). Sections: **Basic** (Pharmacy Name*, Owner Name*, Drug License Number*, GST Number*), **Contact** (Phone*, WhatsApp Number, Email), **Location** (Address* textarea, PIN Code*, Area, Google Maps Name, Coordinates lat,lng), **Document Uploads** (Drug License required-labeled, GST Certificate, Other; image/PDF → uploaded to `bills` bucket via getPublicUrl). Insert `pharmacy_registration_requests{...urls, status:'pending'}`. Resets form on success.

---

## 7. ADMIN MODULE (all behind AdminRoute)

- **Dashboard** (`/admin`): 11-module navigation grid (Users, Batch Recalls, Notices, Disputes, Analytics, Audit Logs, Fee Management, Document Verification, Message Templates, Territories, Campaigns). `useAdminNotifications` → destructive "{n} new alerts" badge. Quick Stats: Total Users (`profiles` count), Active Stockists, Pharmacies, **Pending Tasks = open disputes count**.
- **User Management** (`/admin/users`): enriches `profiles` with role (maybeSingle) + stockist name/company. Search email/name/company + role filter (all/admin/stockist/pharmacy/patient/brand/mr). Table: Email|Name|Company|Role|Status|Joined|Actions. **`is_active` always hardcoded true**; Activate/Deactivate button only logs to `audit_logs` via `useAuditLog` — **status not persisted**.
- **Pharmacy Approvals** (`/admin/pharmacy-approvals`): realtime; table all requests. **Dual approval**: "Approve as Admin" sets admin_approved; if `stockist_approved` already true → status='approved' + inserts `pharmacy_details` (profile_id = current admin's stockist_details id — note: uses admin's own stockist record). **Reject requires reason** (rejection_reason). Status badge logic identical to stockist side.
- **Document Verification** (`/admin/documents`): `pharmacy_documents` joined to pharmacy name/gst. Queue table (Pharmacy|Document Type|Uploaded|Status|Review). Review dialog: single-step **Verify** / **Reject** (reason required on reject) sets verification_status+verified_at+verified_by; "View Document" link.
- **Batch Recalls** (`/admin/recalls`): Create Recall dialog (Batch Number*, Product Name*, Manufacturer, Severity Select critical/high/medium/low, Recall Reason*, Instructions) → `RCL-{ts}`, status='active', recall_date=today. **Search Users by Batch Code** → RPC `search_users_by_batch_code` → results (Type badge, Name, Contact, Product Count). Recalls table + **Mark Resolved** (active only).
- **Disputes** (`/admin/disputes`): `disputes` joined to reporter `profiles.email`. Table: Dispute #|Raised By|Type|Subject|Priority|Status|Date|View. Status colors open/in_progress/resolved/closed/escalated. View dialog: subject/description; status Select (in_progress/resolved/escalated/closed); Resolution textarea + **Mark as Resolved** (sets resolution + resolved_at).
- **Notices** (`/admin/notices`): Create dialog: Title*, Content*, Type (announcement/alert/update/warning/recall), Priority (low/medium/high/urgent), **granular targeting** — Role (All/Stockists/Pharmacies), Batch Codes / PIN Codes / States / Districts (comma-separated → arrays), Expiration (datetime-local). Insert `admin_notices` → RPC `distribute_notice_to_users` (reports "sent to N users"). Table w/ target badges + **Switch toggle active**. (View button stub.)
- **Message Templates** (`/admin/templates`): CRUD `message_templates`. Fields: Template Name*, Type (email/sms/whatsapp), Subject (email only), Message Body* (with `{variable}` placeholders), Variables (comma-separated → array). Table (name/type/variable badges/status/edit+delete).
- **Territory Management** (`/admin/territories`): CRUD `territories` (Territory Name*, State*, District, PIN Codes comma→array). Table w/ first-3 PIN badges + "+N". Second card: **read-only Stockist Service Areas** view (toggle show; joins `stockist_service_areas` + stockist name/company/phone; columns Stockist/Company/PIN/Area/District/State/Phone).
- **Campaign Management** (`/admin/campaigns`): CRUD `campaigns`. Fields: Campaign Name*, Type (promotional/informational/reminder), Target Audience (all/stockists/pharmacies/active), Message Content*, Schedule (datetime-local). status = scheduled if scheduled_at else draft. **Send Now** (drafts) sets status=sent+sent_at. Status badges draft/scheduled/sent/failed.
- **Fee Management** (`/admin/fees`): CRUD `platform_fees`. Fields: Fee Name*, Type (percentage/fixed), Value, Applies To (stockist/pharmacy/both), is_active. Table shows value as `{v}%` or `₹{v}`.
- **Analytics** (`/admin/analytics`): 8 StatCards (Total Users, Stockists, Pharmacies, Orders, Revenue, Pending Orders, Active Disputes, Active Recalls) — **trend %s hardcoded** ("+12% from last month" etc). Revenue/Order/User charts are **placeholder divs** ("chart would go here").
- **Enhanced Analytics** (`/admin/enhanced-analytics`, NOT linked): 4 KPIs (Users, Orders, Revenue, **Growth Rate hardcoded 32.5%**).
- **Audit Logs** (`/admin/audit-logs`): last 100 `audit_logs` joined to email; client-side search (action/entity/email); columns Timestamp|User|Action|Entity Type|Entity ID (first 8 chars)|IP Address.

---

## 9. AI & EDGE FUNCTIONS (`supabase/functions/*`)

All AI via Lovable Gateway `ai.gateway.lovable.dev/v1/chat/completions` (except symptom-checker & extract-prescription use `api.lovable.app/v1/ai/chat`). Gemini-primary + GPT fallback. CORS `*`.

### AI-powered
- **parse-order-message** — auth required; **ownership-verified** (stockist.id must match profile_id). Body length ≤100000, orderText ≤5000, stockistId UUID regex. Fetches active products; prompt matches order text to catalogue; models `google/gemini-2.5-flash` → `openai/gpt-5-mini`, temp 0.2. Returns `{items:[{originalText, productId|null, productName, quantity, matchConfidence: exact|high|medium|low|none, suggestions[]}]}`. Confidence guide exact=100%…none<40%; parses "50N"/"x100"/"100 boxes"; top-3 suggestions for low/none.
- **extract-bill-items** — public (no auth); **soft-fails HTTP 200** with `{ok:false, error, items:[]}`. Validates image URL host (supabase/lovable). `gemini-2.5-pro` → `gpt-5` vision. Cleans items (name≤200, qty≥1, price≥0). Handles 429/402.
- **process-bill-image** — auth required + ownership-verified. Skips AI if `previewItems` supplied (`useProvidedData`). Else `gemini-2.5-pro`→`gpt-5` vision. Resolves pharmacy (pre-selected / create_new / exact-name / license-normalized match / else create w/ gst_number:'PENDING'). Creates order `ORD-{ts}` (confirmed/unpaid/pending, bill_image_url). Inserts items. **Stock: exact-name match** → reduce (`max(0, stock-qty)`); else **auto-create product** w/ stock 0, `sale_price=price*1.2, mrp=price*1.3, gst 5`. Returns `{order_number, order_id, stock_update:{reduced,created,failed}}`.
- **extract-product-label** — auth. `gemini-2.5-pro`→`gpt-5` vision. Separates medicine name vs brand, **infers popular Indian brand** for generics (e.g. Paracetamol→Dolo), extracts strength/mrp/batch_number/expiry_date (YYYY-MM-DD).
- **fetch-product-info** — auth. `gemini-2.5-pro` temp 0.7. Enriches product name → name/generic_name/brand (forces popular Indian brand)/manufacturer/strength/pack_size/category/type; joins multiple salts with " + ".
- **ai-symptom-checker** — public (no auth). `api.lovable.app` + `gemini-2.5-pro`. Body `{symptoms, age, medicalHistory}`. Returns `possible_conditions, suggested_otc_medicines[{name,purpose}], when_to_see_doctor, disclaimer`. (Client sends only `symptoms` and reads different field names — mismatch noted.)
- **extract-prescription** — public. `api.lovable.app` + `gemini-2.5-flash`. Returns medicines[{name,dosage,frequency,duration}], doctor_name, clinic_name, prescription_date, diagnosis. **Not invoked anywhere in current UI** (prescription upload skips OCR).
- **chat-assistant** — no explicit auth check (uses service role). Body `{messages, stockist_id, pharmacy_id, role}`. `gemini-2.5-flash` with **function-calling tools**, `tool_choice:auto`, tool-loop. Six role system prompts (all "Digi Swasthya AI", enforce data isolation + ₹ formatting). Tool sets declared for stockist(6)/pharmacy(4)/admin(5)/patient(4)/brand(4)/mr(4), BUT executor selection is only `admin | pharmacy | else→stockist` — **patient/brand/mr tools declared but never executed** (fall through to stockist executor with wrong id). Stockist tools: get_pending_orders, get_todays_orders, get_outstanding_pharmacies, get_low_stock_products, get_payment_summary, get_dashboard_stats (real scoped Supabase queries). 429→credits/rate-limit messages. Only StockistChatAssistant + PharmacyChatAssistant are mounted in UI.
- **optimize-route** — no auth. Body `{startingPoint, pharmacies[]}`. Builds distance matrix via Google Distance Matrix API if `GOOGLE_MAPS_API_KEY` set, **else `estimateDistanceMatrix` = random 5-20 km** (demo). `gemini-2.5-flash` temp 0.3 solves TSP → `{optimizedOrder(ids), distances[], totalDistance, explanation}`. Fallback to sequential order on parse error.

### Transactional / business logic
- **create-platform-order** — **public** (intentionally; guarded by license verification + Zod). Zod: pharmacy_id/stockist_id UUID, items[1..100]{product_name≤200, qty int 1..10000, unit_price 0..1e6, total_price, gst_percentage?, tax_amount?}, total_amount 0..1e7. Rounds all to integers. Order `PLT-{ts}-{rand6}`, confirmed/unpaid/pending, order_source='platform'. Inserts items (gst default 12). **Stock reduction by `ilike '%name%'` first match** (`max(0, stock-qty)`). Recomputes pharmacy `outstanding_balance = Σ round(total-paid)` over unpaid/partial.
- **create-batch-cycle** — service role. Aggregates pending+confirmed orders in date range into `order_batch_cycles`; **`delivery_cost = orders*12`, `cost_savings = orders*(60-12)`** (modeled ₹60 vs ₹12/order). Links orders via `batch_cycle_id`.
- **reduce-stock-for-order** — service role, Zod-validated. Per item: `ilike` match → reduce; if not found → **auto-create** (stock=qty, then set to 0, min_stock 10, gst 5, category 'Unclassified'); logs `activity_log` (product_created/stock_reduced); low-stock warnings when `newStock ≤ threshold`.
- **calculate-delivery-fee** — service role. Haversine distance (stockist dispatch lat/lng ↔ pharmacy lat/lng). Applies active `stockist_delivery_rules` by priority: order_amount (free if `order_total ≥ min_order_amount`), flat_fee, distance (`per_km_charge * max(0, dist-base_distance_km)`). Default: **free if ≥₹5000 else ₹50**. Always returns 200 even on error (default ₹50).
- **mark-payment-paid** — **public** (pharmacy link). Zod: amount 1..1e7, payment_type enum. Inserts **pending** `payment_confirmations` (requires stockist approval).
- **approve-reject-payment** — auth required (user-verified) + **service-role writes**. Zod: confirmation_id UUID, action approve/reject/on_hold, notes≤500. Updates confirmation status (on_hold clears processed_at/by). **On approve** = credit-first + FIFO settlement: `creditUsed=min(amount, credit)`, `totalFundsToDistribute=creditUsed+amount`. If `order_id` set → apply to that order (excess → credit). Else FIFO over oldest unpaid/partial (excl cancelled). Leftover → credit_balance. **Self-healing cleanup pass**: any unpaid/partial order where `|total-paid|<0.01` → marked paid. Itemized credit note in stockist_notes. 0.01 tolerance throughout.
- **get-pharmacy-outstanding-orders** — **public** (service role). Zod pharmacy_id+stockist_id. Returns unpaid/partial orders w/ order_items, filtered to `round(paid) < round(total)`.
- **verify-pharmacy-license** — **public**, **rate-limited** via RPC `check_rate_limit` (5 attempts / 15 min per license, returns 429 + retry minutes). Normalizes license (lowercase, strip non-alphanumeric). Looks up stockist by `catalogue_slug` + `catalogue_enabled`. If `pharmacy_pin_code` provided, validates against active `stockist_service_areas` (else "does not deliver to PIN"). Matches active pharmacy by normalized license. Returns `{verified, pharmacy{id,name,license,outstanding,credit}, stockist{id,name,company_name,upi_id}, orders(last 10)}` or verified:false with attempts_remaining.

---

## 10. PAYMENTS, CREDIT & MONEY LOGIC (consolidated)

- **Status vocab**: order `status` draft/confirmed/cancelled; `payment_status` paid/unpaid/partial; `delivery_status` pending/dispatched/out_for_delivery/delivered. Confirmation `status` pending/approved/rejected/on_hold. Order sources: manual, platform, pharmacy_portal, whatsapp.
- **Order numbering**: manual/quick-bill/OCR = `ORD-{Date.now()}`; quick-order (WhatsApp parse) = `ORD-{ts}` w/ `order_source=whatsapp`; platform (public catalogue) = `PLT-{ts}-{rand6}`; process-bill-image = `ORD-{ts}`; AddPharmacy placeholder = `INIT-{ts}`; recall = `RCL-{ts}`.
- **Credit-first + FIFO settlement** appears in FIVE places with the same algorithm & 0.01 tolerance: (1) Pharmacies page custom payment, (2) approve-reject-payment edge fn, (3) SortablePharmacyCard route collection, (4) OrderActionsDropdown partial payment (single-order), (5) mark-fully-paid (bulk). Leftover funds → `credit_balance`.
- **Outstanding balance** always recomputed as `Σ max(0, total_amount - paid_amount)` over unpaid/partial orders (`recalculatePharmacyBalance` duplicated across many files).
- **GST differs by surface**: portal checkout = flat **5% + delivery fee**; public catalogue checkout = **per-item `gst_percentage`, no delivery fee**; stockist OrderCreation = **SGST/CGST split (tax/2 each)**, per-item gst default 5; QuickOrder/QuickBill dialogs use a 5/12 tax toggle (default 12); create-platform-order defaults item gst to 12 if absent.
- **UPI**: QR via `qrcode.react` (level H, size 200, downloadable PNG) + `upi://pay?pa={upi}&pn={name}&am={amount}&tn=Order-{num}&cu=INR` deep links. Payments always require stockist confirmation before balances update. PaymentLinkDialog also lets stockist edit their UPI ID inline (saved to stockist_details) and pick 100/50/25% or slider payment amount, then Send via WhatsApp.

---

## 12. DATA MODEL (from types.ts groupings; ~70 tables/RPCs)

- Identity: profiles, user_roles, stockist_details, pharmacy_details, patient_details, brand_details, mr_details.
- Catalog/inventory: products, product_batches, pharmacy_inventory, pharmacy_expiry_alerts, brand_products.
- Orders/delivery: orders, order_items, order_batch_cycles, patient_orders, patient_order_tracking, brand_orders, delivery_tracking, route_executions.
- Payments/finance: invoices, payment_confirmations, payment_reminders, platform_fees, commission_ledger, mr_order_commissions, subscription_plans, user_subscriptions.
- Connections/territory: pharmacy_stockist_connections, pharmacy_registration_requests, pharmacy_documents, territories, stockist_service_areas, stockist_delivery_dates, stockist_delivery_rules, batch_delivery_rules.
- Patient engagement: patient_prescriptions, patient_addresses, patient_refill_reminders, patient_wishlist, wishlist, loyalty_points, loyalty_transactions, ratings_reviews, referrals, search_history.
- Brand/compliance: brand_campaigns, campaigns, brand_batch_verification, batch_recalls, disputes.
- MR: mr_pharmacy_visits.
- Governance/comms: admin_notices, user_notice_recipients, message_templates, notification_queue, notification_preferences, communication_log, support_tickets, audit_logs, activity_log, analytics_events, platform_settings, catalogue_rate_limits.
- RPCs used in code: `has_role`, `is_admin`, `check_rate_limit`, `deduct_stock`, `distribute_notice_to_users`, `search_users_by_batch_code`.

---

## EXPANSION — Code-Derived Additions (Audit Pass)

*Audit date: 2026-07-04. Content derived exclusively from source under `stockpharmaerp/`. Documents implemented behavior only.*

### E.1 Complete Route Table

**Frontend routes extracted:** 81 | **Server API routes:** 0

| # | Path | Component | Role/Gate | Source |
|---|------|-----------|-----------|--------|
| 1 | `/` | Login | — | `src/App.tsx` |
| 2 | `/login` | Login | — | `src/App.tsx` |
| 3 | `/forgot-password` | ForgotPassword | — | `src/App.tsx` |
| 4 | `/reset-password` | ResetPassword | — | `src/App.tsx` |
| 5 | `/role-selection` | ProtectedRoute | — | `src/App.tsx` |
| 6 | `/onboarding/stockist` | ProtectedRoute | — | `src/App.tsx` |
| 7 | `/onboarding/pharmacy` | ProtectedRoute | — | `src/App.tsx` |
| 8 | `/onboarding/patient` | ProtectedRoute | — | `src/App.tsx` |
| 9 | `/onboarding/brand` | ProtectedRoute | — | `src/App.tsx` |
| 10 | `/onboarding/mr` | ProtectedRoute | — | `src/App.tsx` |
| 11 | `/stockist/home` | ProtectedRoute | — | `src/App.tsx` |
| 12 | `/stockist/pharmacies` | ProtectedRoute | — | `src/App.tsx` |
| 13 | `/stockist/pharmacies/:pharmacyId` | ProtectedRoute | — | `src/App.tsx` |
| 14 | `/stockist/products` | ProtectedRoute | — | `src/App.tsx` |
| 15 | `/stockist/orders` | ProtectedRoute | — | `src/App.tsx` |
| 16 | `/stockist/orders/:orderId` | ProtectedRoute | — | `src/App.tsx` |
| 17 | `/stockist/order-creation` | ProtectedRoute | — | `src/App.tsx` |
| 18 | `/stockist/payments` | ProtectedRoute | — | `src/App.tsx` |
| 19 | `/stockist/payment-approvals` | ProtectedRoute | — | `src/App.tsx` |
| 20 | `/stockist/analytics` | ProtectedRoute | — | `src/App.tsx` |
| 21 | `/stockist/route-execution` | ProtectedRoute | — | `src/App.tsx` |
| 22 | `/stockist/pharmacy-approvals` | ProtectedRoute | — | `src/App.tsx` |
| 23 | `/stockist/batch-ordering` | ProtectedRoute | — | `src/App.tsx` |
| 24 | `/stockist/delivery-settings` | ProtectedRoute | — | `src/App.tsx` |
| 25 | `/pharmacy/portal` | ProtectedRoute | — | `src/App.tsx` |
| 26 | `/pharmacy/inventory` | ProtectedRoute | — | `src/App.tsx` |
| 27 | `/pharmacy/ordering` | ProtectedRoute | — | `src/App.tsx` |
| 28 | `/pharmacy/financials` | ProtectedRoute | — | `src/App.tsx` |
| 29 | `/pharmacy/analytics` | ProtectedRoute | — | `src/App.tsx` |
| 30 | `/pharmacy/stockists` | ProtectedRoute | — | `src/App.tsx` |
| 31 | `/pharmacy/stockists/:stockistId` | ProtectedRoute | — | `src/App.tsx` |
| 32 | `/pharmacy/cart` | ProtectedRoute | — | `src/App.tsx` |
| 33 | `/pharmacy/checkout` | ProtectedRoute | — | `src/App.tsx` |
| 34 | `/pharmacy/orders` | ProtectedRoute | — | `src/App.tsx` |
| 35 | `/patient/dashboard` | ProtectedRoute | — | `src/App.tsx` |
| 36 | `/patient/search` | ProtectedRoute | — | `src/App.tsx` |
| 37 | `/patient/checkout` | ProtectedRoute | — | `src/App.tsx` |
| 38 | `/patient/prescriptions` | ProtectedRoute | — | `src/App.tsx` |
| 39 | `/patient/compare` | ProtectedRoute | — | `src/App.tsx` |
| 40 | `/patient/ai-assistant` | ProtectedRoute | — | `src/App.tsx` |
| 41 | `/patient/wishlist` | ProtectedRoute | — | `src/App.tsx` |
| 42 | `/patient/orders` | ProtectedRoute | — | `src/App.tsx` |
| 43 | `/brand/dashboard` | ProtectedRoute | — | `src/App.tsx` |
| 44 | `/brand/products` | ProtectedRoute | — | `src/App.tsx` |
| 45 | `/brand/campaigns` | ProtectedRoute | — | `src/App.tsx` |
| 46 | `/brand/analytics` | ProtectedRoute | — | `src/App.tsx` |
| 47 | `/brand/fulfilment` | ProtectedRoute | — | `src/App.tsx` |
| 48 | `/mr/dashboard` | ProtectedRoute | — | `src/App.tsx` |
| 49 | `/mr/pharmacies` | ProtectedRoute | — | `src/App.tsx` |
| 50 | `/mr/collections` | ProtectedRoute | — | `src/App.tsx` |
| 51 | `/mr/analytics` | ProtectedRoute | — | `src/App.tsx` |
| 52 | `/stockist/profile` | ProtectedRoute | — | `src/App.tsx` |
| 53 | `/pharmacy/profile` | ProtectedRoute | — | `src/App.tsx` |
| 54 | `/patient/profile` | ProtectedRoute | — | `src/App.tsx` |
| 55 | `/brand/profile` | ProtectedRoute | — | `src/App.tsx` |
| 56 | `/mr/profile` | ProtectedRoute | — | `src/App.tsx` |
| 57 | `/support` | ProtectedRoute | — | `src/App.tsx` |
| 58 | `/settings` | ProtectedRoute | — | `src/App.tsx` |
| 59 | `/admin` | AdminRoute | — | `src/App.tsx` |
| 60 | `/admin/users` | AdminRoute | — | `src/App.tsx` |
| 61 | `/admin/recalls` | AdminRoute | — | `src/App.tsx` |
| 62 | `/admin/notices` | AdminRoute | — | `src/App.tsx` |
| 63 | `/admin/disputes` | AdminRoute | — | `src/App.tsx` |
| 64 | `/admin/analytics` | AdminRoute | — | `src/App.tsx` |
| 65 | `/admin/enhanced-analytics` | AdminRoute | — | `src/App.tsx` |
| 66 | `/admin/audit-logs` | AdminRoute | — | `src/App.tsx` |
| 67 | `/admin/fees` | AdminRoute | — | `src/App.tsx` |
| 68 | `/admin/documents` | AdminRoute | — | `src/App.tsx` |
| 69 | `/admin/templates` | AdminRoute | — | `src/App.tsx` |
| 70 | `/admin/territories` | AdminRoute | — | `src/App.tsx` |
| 71 | `/admin/campaigns` | AdminRoute | — | `src/App.tsx` |
| 72 | `/admin/pharmacy-approvals` | AdminRoute | — | `src/App.tsx` |
| 73 | `/catalogue/:stockist_slug` | LicenseVerification | — | `src/App.tsx` |
| 74 | `/catalogue/:stockist_slug/dashboard` | PharmacySessionProvider | — | `src/App.tsx` |
| 75 | `/catalogue/:stockist_slug/products` | PharmacySessionProvider | — | `src/App.tsx` |
| 76 | `/catalogue/:stockist_slug/orders` | PharmacySessionProvider | — | `src/App.tsx` |
| 77 | `/catalogue/:stockist_slug/checkout` | PharmacySessionProvider | — | `src/App.tsx` |
| 78 | `/pharmacy-registration` | PharmacyRegistration | — | `src/App.tsx` |
| 79 | `/not-authorized` | NotAuthorized | — | `src/App.tsx` |
| 80 | `/offline` | Offline | — | `src/App.tsx` |
| 81 | `/*` | NotFound | — | `src/App.tsx` |

### E.2 Entity / Table Catalog

**Tables/schemas found:** 64

#### `activity_log`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `activity_type` | `string` |
| `created_at` | `string | null` |
| `description` | `string` |
| `id` | `string` |
| `metadata` | `Json | null` |
| `stockist_id` | `string` |

#### `admin_notices`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `content` | `string` |
| `created_at` | `string | null` |
| `created_by` | `string` |
| `expires_at` | `string | null` |
| `id` | `string` |
| `is_active` | `boolean | null` |
| `notice_type` | `string` |
| `priority` | `string` |
| `target_batch_codes` | `string[] | null` |
| `target_districts` | `string[] | null` |
| `target_pin_codes` | `string[] | null` |
| `target_role` | `string | null` |
| `target_states` | `string[] | null` |
| `title` | `string` |

#### `analytics_events`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string | null` |
| `event_data` | `Json | null` |
| `event_type` | `string` |
| `id` | `string` |
| `page_url` | `string | null` |
| `user_id` | `string | null` |

#### `audit_logs`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `action` | `string` |
| `created_at` | `string` |
| `details` | `Json | null` |
| `entity_id` | `string` |
| `entity_type` | `string` |
| `id` | `string` |
| `ip_address` | `string | null` |
| `user_agent` | `string | null` |
| `user_id` | `string` |

#### `batch_delivery_rules`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string | null` |
| `delivery_day` | `string | null` |
| `id` | `string` |
| `is_active` | `boolean | null` |
| `max_payment_overdue_days` | `number | null` |
| `min_order_value` | `number | null` |
| `require_payment_clearance` | `boolean | null` |
| `stockist_id` | `string` |

#### `batch_recalls`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `affected_users_count` | `number | null` |
| `batch_number` | `string` |
| `cdsco_reference` | `string | null` |
| `created_at` | `string` |
| `id` | `string` |
| `initiated_by` | `string` |
| `instructions` | `string | null` |
| `manufacturer` | `string | null` |
| `product_name` | `string` |
| `recall_date` | `string` |
| `recall_number` | `string` |
| `recall_reason` | `string` |
| `severity` | `string` |
| `status` | `string` |
| `updated_at` | `string` |

#### `brand_batch_verification`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `batch_number` | `string` |
| `brand_id` | `string` |
| `created_at` | `string | null` |
| `expiry_date` | `string` |
| `id` | `string` |
| `is_verified` | `boolean | null` |
| `manufacturing_date` | `string` |
| `product_id` | `string` |
| `qr_code_url` | `string | null` |
| `quantity` | `number` |
| `verification_code` | `string` |

#### `brand_campaigns`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `actual_spend` | `number | null` |
| `brand_id` | `string` |
| `budget` | `number | null` |
| `campaign_name` | `string` |
| `campaign_type` | `string` |
| `created_at` | `string | null` |
| `description` | `string | null` |
| `discount_percentage` | `number | null` |
| `end_date` | `string` |
| `id` | `string` |
| `start_date` | `string` |
| `status` | `string | null` |
| `target_region` | `string[] | null` |

#### `brand_details`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `address` | `string | null` |
| `brand_name` | `string` |
| `company_name` | `string` |
| `contact_person` | `string | null` |
| `created_at` | `string | null` |
| `email` | `string | null` |
| `gstin` | `string | null` |
| `id` | `string` |
| `is_active` | `boolean | null` |
| `is_verified` | `boolean | null` |
| `manufacturing_license` | `string | null` |
| `phone` | `string | null` |
| `profile_id` | `string` |
| `updated_at` | `string | null` |

#### `brand_orders`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `brand_id` | `string` |
| `created_at` | `string | null` |
| `delivered_at` | `string | null` |
| `delivery_address_id` | `string | null` |
| `delivery_fee` | `number | null` |
| `id` | `string` |
| `items` | `Json` |
| `order_number` | `string` |
| `order_status` | `string | null` |
| `patient_id` | `string` |
| `payment_method` | `string | null` |
| `payment_status` | `string | null` |
| `pharmacy_commission` | `number` |
| `pharmacy_id` | `string` |
| `platform_fee` | `number` |
| `subtotal` | `number` |
| `total_amount` | `number` |

#### `brand_products`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `batch_number` | `string` |
| `brand_id` | `string` |
| `category` | `string | null` |
| `created_at` | `string | null` |
| `description` | `string | null` |
| `generic_name` | `string | null` |
| `id` | `string` |
| `image_url` | `string | null` |
| `is_active` | `boolean | null` |
| `manufacturer` | `string | null` |
| `mrp` | `number` |
| `prescription_required` | `boolean | null` |
| `product_name` | `string` |
| `selling_price` | `number` |
| `sku` | `string` |
| `stock_quantity` | `number | null` |
| `updated_at` | `string | null` |

#### `campaigns`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `actual_spend` | `number | null` |
| `budget` | `number | null` |
| `campaign_name` | `string` |
| `campaign_type` | `string` |
| `conversion_count` | `number | null` |
| `created_at` | `string` |
| `created_by` | `string` |
| `description` | `string | null` |
| `discount_percentage` | `number | null` |
| `end_date` | `string | null` |
| `id` | `string` |
| `reach_count` | `number | null` |
| `start_date` | `string` |
| `status` | `string` |
| `target_audience` | `string` |
| `terms_conditions` | `string | null` |
| `updated_at` | `string` |

#### `catalogue_rate_limits`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `action_type` | `string` |
| `attempt_count` | `number` |
| `created_at` | `string` |
| `id` | `string` |
| `identifier` | `string` |
| `last_attempt_at` | `string` |

#### `commission_ledger`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `commission_amount` | `number` |
| `commission_rate` | `number` |
| `commission_type` | `string` |
| `created_at` | `string | null` |
| `id` | `string` |
| `order_id` | `string | null` |
| `paid_at` | `string | null` |
| `payment_reference` | `string | null` |
| `status` | `string | null` |
| `user_id` | `string` |

#### `communication_log`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `id` | `string` |
| `message` | `string` |
| `pharmacy_id` | `string` |
| `sent_at` | `string | null` |
| `status` | `string` |
| `type` | `string` |

#### `delivery_tracking`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `collection_amount` | `number | null` |
| `created_at` | `string | null` |
| `delivered_at` | `string | null` |
| `id` | `string` |
| `notes` | `string | null` |
| `order_id` | `string` |
| `payment_mode` | `string | null` |
| `pharmacy_id` | `string` |
| `route_execution_id` | `string | null` |

#### `disputes`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `assigned_to` | `string | null` |
| `created_at` | `string` |
| `description` | `string` |
| `dispute_number` | `string` |
| `dispute_type` | `string` |
| `filed_by` | `string` |
| `id` | `string` |
| `order_id` | `string | null` |
| `pharmacy_id` | `string` |
| `priority` | `string` |
| `resolution` | `string | null` |
| `resolved_at` | `string | null` |
| `status` | `string` |
| `stockist_id` | `string` |
| `subject` | `string` |
| `updated_at` | `string` |

#### `invoices`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `amount` | `number` |
| `created_at` | `string | null` |
| `due_date` | `string` |
| `id` | `string` |
| `invoice_number` | `string` |
| `invoice_type` | `string` |
| `invoice_url` | `string | null` |
| `paid_at` | `string | null` |
| `status` | `string | null` |
| `tax_amount` | `number | null` |
| `total_amount` | `number` |
| `user_id` | `string` |

#### `loyalty_points`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string | null` |
| `id` | `string` |
| `points_balance` | `number | null` |
| `points_earned` | `number | null` |
| `points_redeemed` | `number | null` |
| `tier` | `string | null` |
| `updated_at` | `string | null` |
| `user_id` | `string` |

#### `loyalty_transactions`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string | null` |
| `description` | `string | null` |
| `id` | `string` |
| `order_id` | `string | null` |
| `points` | `number` |
| `transaction_type` | `string` |
| `user_id` | `string` |

#### `message_templates`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `category` | `string` |
| `content` | `string` |
| `created_at` | `string` |
| `id` | `string` |
| `is_active` | `boolean` |
| `subject` | `string | null` |
| `template_name` | `string` |
| `template_type` | `string` |
| `updated_at` | `string` |
| `variables` | `Json | null` |

#### `mr_details`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `account_holder_name` | `string | null` |
| `account_number` | `string | null` |
| `address` | `string | null` |
| `bank_name` | `string | null` |
| `business_hours` | `Json | null` |
| `catalogue_created_at` | `string | null` |
| `catalogue_enabled` | `boolean | null` |
| `catalogue_slug` | `string | null` |
| `company_name` | `string` |
| `created_at` | `string | null` |
| `default_credit_days` | `number | null` |
| `delivery_radius` | `number | null` |
| `gstin` | `string | null` |
| `id` | `string` |
| `ifsc_code` | `string | null` |
| `license_number` | `string` |
| `mr_name` | `string` |
| `phone` | `string | null` |
| `profile_id` | `string` |
| `updated_at` | `string | null` |
| `upi_id` | `string | null` |

#### `mr_order_commissions`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `commission_amount` | `number` |
| `commission_rate` | `number | null` |
| `created_at` | `string | null` |
| `id` | `string` |
| `mr_id` | `string` |
| `order_id` | `string | null` |
| `paid_at` | `string | null` |
| `pharmacy_id` | `string | null` |
| `status` | `string | null` |

#### `mr_pharmacy_visits`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string | null` |
| `id` | `string` |
| `mr_id` | `string` |
| `notes` | `string | null` |
| `order_placed` | `boolean | null` |
| `pharmacy_id` | `string` |
| `visit_date` | `string` |

#### `notification_preferences`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string | null` |
| `email_enabled` | `boolean | null` |
| `id` | `string` |
| `marketing_enabled` | `boolean | null` |
| `push_enabled` | `boolean | null` |
| `sms_enabled` | `boolean | null` |
| `updated_at` | `string | null` |
| `user_id` | `string` |
| `whatsapp_enabled` | `boolean | null` |

#### `notification_queue`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `channel` | `string` |
| `created_at` | `string | null` |
| `delivered_at` | `string | null` |
| `error_message` | `string | null` |
| `id` | `string` |
| `notification_type` | `string` |
| `recipient_email` | `string | null` |
| `recipient_phone` | `string | null` |
| `scheduled_at` | `string | null` |
| `sent_at` | `string | null` |
| `status` | `string | null` |
| `template_id` | `string | null` |
| `user_id` | `string` |
| `variables` | `Json | null` |

#### `order_batch_cycles`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `cost_savings` | `number | null` |
| `created_at` | `string | null` |
| `cycle_end_date` | `string` |
| `cycle_start_date` | `string` |
| `delivery_cost` | `number | null` |
| `delivery_date` | `string` |
| `id` | `string` |
| `status` | `string | null` |
| `stockist_id` | `string` |
| `total_orders` | `number | null` |
| `total_pharmacies` | `number | null` |
| `total_value` | `number | null` |

#### `order_items`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `batch_code` | `string | null` |
| `created_at` | `string | null` |
| `gst_percentage` | `number | null` |
| `id` | `string` |
| `order_id` | `string` |
| `product_description` | `string | null` |
| `product_name` | `string` |
| `quantity` | `number` |
| `tax_amount` | `number | null` |
| `total_price` | `number` |
| `unit_price` | `number` |

#### `orders`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `batch_cycle_id` | `string | null` |
| `bill_image_url` | `string | null` |
| `bill_number` | `string | null` |
| `created_at` | `string | null` |
| `delivery_address` | `string | null` |
| `delivery_date` | `string | null` |
| `delivery_status` | `string` |
| `discount_amount` | `number | null` |
| `id` | `string` |
| `net_amount` | `number` |
| `notes` | `string | null` |
| `order_number` | `string` |
| `order_source` | `string` |
| `paid_amount` | `number | null` |
| `payment_due_date` | `string | null` |
| `payment_mode` | `string | null` |
| `payment_status` | `string` |
| `pharmacy_id` | `string` |
| `status` | `string` |
| `stockist_id` | `string` |
| `tax_amount` | `number | null` |
| `total_amount` | `number` |
| `updated_at` | `string | null` |

#### `patient_addresses`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `address_line` | `string` |
| `address_type` | `string | null` |
| `city` | `string` |
| `created_at` | `string | null` |
| `id` | `string` |
| `is_default` | `boolean | null` |
| `landmark` | `string | null` |
| `latitude` | `number | null` |
| `longitude` | `number | null` |
| `patient_id` | `string` |
| `pin_code` | `string` |
| `state` | `string` |

#### `patient_details`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `allergies` | `string[] | null` |
| `blood_group` | `string | null` |
| `created_at` | `string | null` |
| `date_of_birth` | `string | null` |
| `emergency_contact_name` | `string | null` |
| `emergency_contact_phone` | `string | null` |
| `gender` | `string | null` |
| `id` | `string` |
| `is_active` | `boolean | null` |
| `medical_conditions` | `string[] | null` |
| `patient_name` | `string` |
| `phone` | `string` |
| `profile_id` | `string` |
| `updated_at` | `string | null` |

#### `patient_order_tracking`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string | null` |
| `id` | `string` |
| `latitude` | `number | null` |
| `longitude` | `number | null` |
| `message` | `string | null` |
| `patient_order_id` | `string` |
| `status` | `string` |

#### `patient_orders`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string | null` |
| `delivered_at` | `string | null` |
| `delivery_address_id` | `string | null` |
| `delivery_fee` | `number | null` |
| `delivery_slot` | `string | null` |
| `discount_amount` | `number | null` |
| `id` | `string` |
| `items` | `Json` |
| `notes` | `string | null` |
| `order_number` | `string` |
| `order_status` | `string | null` |
| `patient_id` | `string` |
| `payment_method` | `string | null` |
| `payment_status` | `string | null` |
| `pharmacy_id` | `string` |
| `platform_fee` | `number | null` |
| `prescription_id` | `string | null` |
| `subtotal` | `number` |
| `total_amount` | `number` |
| `updated_at` | `string | null` |

#### `patient_prescriptions`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `clinic_name` | `string | null` |
| `created_at` | `string | null` |
| `diagnosis` | `string | null` |
| `doctor_name` | `string | null` |
| `id` | `string` |
| `is_active` | `boolean | null` |
| `medicines` | `Json | null` |
| `notes` | `string | null` |
| `patient_id` | `string` |
| `prescription_date` | `string | null` |
| `prescription_image_url` | `string` |
| `validity_days` | `number | null` |

#### `patient_refill_reminders`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string | null` |
| `frequency_days` | `number` |
| `id` | `string` |
| `is_active` | `boolean | null` |
| `last_refill_date` | `string` |
| `medicine_name` | `string` |
| `next_refill_date` | `string` |
| `patient_id` | `string` |

#### `patient_wishlist`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string | null` |
| `id` | `string` |
| `patient_id` | `string` |
| `product_id` | `string` |
| `product_name` | `string` |
| `product_price` | `number | null` |
| `stockist_id` | `string | null` |

#### `payment_confirmations`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `amount` | `number` |
| `created_at` | `string` |
| `id` | `string` |
| `order_id` | `string | null` |
| `payment_method` | `string | null` |
| `payment_proof_url` | `string | null` |
| `payment_type` | `string` |
| `pharmacy_id` | `string` |
| `pharmacy_notes` | `string | null` |
| `processed_at` | `string | null` |
| `processed_by` | `string | null` |
| `status` | `string` |
| `stockist_id` | `string` |
| `stockist_notes` | `string | null` |

#### `payment_reminders`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `amount` | `number` |
| `auto_reminder_enabled` | `boolean | null` |
| `created_at` | `string | null` |
| `id` | `string` |
| `message` | `string | null` |
| `order_id` | `string | null` |
| `pharmacy_id` | `string` |
| `reminder_date` | `string` |
| `scheduled_date` | `string | null` |
| `sent_at` | `string | null` |
| `status` | `string` |
| `stockist_id` | `string | null` |

#### `pharmacy_details`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `address` | `string | null` |
| `area` | `string | null` |
| `auth_profile_id` | `string | null` |
| `created_at` | `string` |
| `credit_balance` | `number | null` |
| `credit_limit` | `number | null` |
| `email` | `string | null` |
| `google_maps_name` | `string | null` |
| `gst_number` | `string` |
| `id` | `string` |
| `is_active` | `boolean | null` |
| `last_order_date` | `string | null` |
| `latitude` | `number | null` |
| `license_number` | `string | null` |
| `location_coordinates` | `string | null` |
| `longitude` | `number | null` |
| `outstanding_balance` | `number | null` |
| `owner_name` | `string | null` |
| `pharmacy_name` | `string` |
| `phone` | `string | null` |
| `pin_code` | `string | null` |
| `profile_id` | `string | null` |
| `total_orders` | `number | null` |
| `total_revenue` | `number | null` |
| `updated_at` | `string` |
| `whatsapp_number` | `string | null` |

#### `pharmacy_documents`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `document_number` | `string | null` |
| `document_type` | `string` |
| `document_url` | `string` |
| `expiry_date` | `string | null` |
| `id` | `string` |
| `issue_date` | `string | null` |
| `notes` | `string | null` |
| `pharmacy_id` | `string` |
| `rejection_reason` | `string | null` |
| `status` | `string` |
| `updated_at` | `string` |
| `verified_at` | `string | null` |
| `verified_by` | `string | null` |

#### `pharmacy_expiry_alerts`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `acknowledged_at` | `string | null` |
| `alert_days_before` | `number` |
| `batch_number` | `string | null` |
| `created_at` | `string | null` |
| `expiry_date` | `string` |
| `id` | `string` |
| `inventory_id` | `string` |
| `pharmacy_id` | `string` |
| `product_name` | `string` |
| `quantity` | `number` |
| `status` | `string | null` |

#### `pharmacy_inventory`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `batch_number` | `string | null` |
| `category` | `string | null` |
| `created_at` | `string | null` |
| `expiry_date` | `string | null` |
| `generic_name` | `string | null` |
| `gst_percentage` | `number | null` |
| `hsn_code` | `string | null` |
| `id` | `string` |
| `low_stock_threshold` | `number | null` |
| `manufacturer` | `string | null` |
| `mrp` | `number | null` |
| `pack_size` | `string | null` |
| `pharmacy_id` | `string` |
| `product_name` | `string` |
| `purchase_date` | `string | null` |
| `quantity` | `number` |
| `sale_price` | `number | null` |
| `stockist_id` | `string | null` |
| `unit_price` | `number | null` |
| `updated_at` | `string | null` |

#### `pharmacy_registration_requests`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `address` | `string` |
| `admin_approved` | `boolean | null` |
| `admin_approved_at` | `string | null` |
| `admin_approved_by` | `string | null` |
| `area` | `string | null` |
| `created_at` | `string | null` |
| `drug_license_url` | `string | null` |
| `email` | `string | null` |
| `google_maps_name` | `string | null` |
| `gst_certificate_url` | `string | null` |
| `gst_number` | `string` |
| `id` | `string` |
| `license_number` | `string` |
| `location_coordinates` | `string | null` |
| `other_documents_url` | `string | null` |
| `owner_name` | `string` |
| `pharmacy_name` | `string` |
| `phone` | `string` |
| `pin_code` | `string` |
| `rejection_reason` | `string | null` |
| `status` | `string` |
| `stockist_approved` | `boolean | null` |
| `stockist_approved_at` | `string | null` |
| `stockist_approved_by` | `string | null` |
| `stockist_id` | `string | null` |
| `updated_at` | `string | null` |
| `whatsapp_number` | `string | null` |

#### `pharmacy_stockist_connections`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string | null` |
| `credit_limit` | `number | null` |
| `id` | `string` |
| `is_active` | `boolean | null` |
| `last_order_date` | `string | null` |
| `outstanding_balance` | `number | null` |
| `pharmacy_id` | `string` |
| `stockist_id` | `string` |
| `updated_at` | `string | null` |

#### `platform_fees`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `applies_to` | `string` |
| `calculation_method` | `string` |
| `created_at` | `string` |
| `effective_from` | `string` |
| `effective_to` | `string | null` |
| `fee_name` | `string` |
| `fee_type` | `string` |
| `fee_value` | `number` |
| `id` | `string` |
| `is_active` | `boolean` |
| `max_amount` | `number | null` |
| `min_amount` | `number | null` |
| `updated_at` | `string` |

#### `platform_settings`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string | null` |
| `id` | `string` |
| `is_active` | `boolean | null` |
| `setting_key` | `string` |
| `setting_value` | `Json` |
| `target_role` | `string | null` |
| `updated_at` | `string | null` |

#### `product_batches`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `batch_number` | `string` |
| `created_at` | `string | null` |
| `expiry_date` | `string` |
| `id` | `string` |
| `manufacturing_date` | `string | null` |
| `product_id` | `string` |
| `quantity` | `number` |
| `updated_at` | `string | null` |

#### `products`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `batch_code` | `string | null` |
| `brand` | `string | null` |
| `category` | `string | null` |
| `created_at` | `string | null` |
| `description` | `string | null` |
| `generic_name` | `string | null` |
| `gst_percentage` | `number | null` |
| `hsn_code` | `string | null` |
| `id` | `string` |
| `image_url` | `string | null` |
| `is_active` | `boolean | null` |
| `manufacturer` | `string | null` |
| `min_stock_threshold` | `number | null` |
| `moq` | `number | null` |
| `mrp` | `number | null` |
| `name` | `string` |
| `pack_size` | `string | null` |
| `purchase_price` | `number | null` |
| `sale_price` | `number | null` |
| `stock_quantity` | `number | null` |
| `stockist_id` | `string` |
| `strength` | `string | null` |
| `type` | `string | null` |
| `updated_at` | `string | null` |

#### `profiles`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `email` | `string` |
| `id` | `string` |
| `updated_at` | `string` |

#### `ratings_reviews`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string | null` |
| `entity_id` | `string` |
| `entity_type` | `string` |
| `id` | `string` |
| `is_active` | `boolean | null` |
| `is_verified_purchase` | `boolean | null` |
| `rating` | `number` |
| `review_text` | `string | null` |
| `user_id` | `string` |

#### `referrals`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `completed_at` | `string | null` |
| `created_at` | `string | null` |
| `id` | `string` |
| `referee_id` | `string | null` |
| `referral_code` | `string` |
| `referrer_id` | `string` |
| `reward_amount` | `number | null` |
| `status` | `string | null` |

#### `route_executions`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `completed_at` | `string | null` |
| `created_at` | `string | null` |
| `id` | `string` |
| `optimized_order` | `string[]` |
| `pharmacy_ids` | `string[]` |
| `started_at` | `string | null` |
| `starting_address` | `string` |
| `status` | `string | null` |
| `stockist_id` | `string` |
| `total_distance` | `number | null` |

#### `search_history`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string | null` |
| `id` | `string` |
| `results_count` | `number | null` |
| `search_query` | `string` |
| `search_type` | `string | null` |
| `user_id` | `string | null` |

#### `stockist_delivery_dates`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string | null` |
| `delivery_date` | `string` |
| `id` | `string` |
| `is_active` | `boolean | null` |
| `notes` | `string | null` |
| `stockist_id` | `string` |

#### `stockist_delivery_rules`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `base_distance_km` | `number | null` |
| `created_at` | `string | null` |
| `flat_fee` | `number | null` |
| `free_on_delivery_date` | `boolean | null` |
| `id` | `string` |
| `is_active` | `boolean | null` |
| `min_order_amount` | `number | null` |
| `min_profit_amount` | `number | null` |
| `per_km_charge` | `number | null` |
| `priority` | `number | null` |
| `rule_name` | `string | null` |
| `rule_type` | `string` |
| `stockist_id` | `string` |

#### `stockist_details`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `account_holder_name` | `string | null` |
| `account_number` | `string | null` |
| `address` | `string | null` |
| `bank_name` | `string | null` |
| `business_hours` | `Json | null` |
| `catalogue_created_at` | `string | null` |
| `catalogue_enabled` | `boolean | null` |
| `catalogue_slug` | `string | null` |
| `company_name` | `string` |
| `created_at` | `string` |
| `default_credit_days` | `number | null` |
| `default_margin_percent` | `number | null` |
| `delivery_radius` | `number | null` |
| `dispatch_latitude` | `number | null` |
| `dispatch_longitude` | `number | null` |
| `dispatch_place_name` | `string | null` |
| `gstin` | `string | null` |
| `id` | `string` |
| `ifsc_code` | `string | null` |
| `license_number` | `string` |
| `phone` | `string | null` |
| `profile_id` | `string` |
| `stockist_name` | `string` |
| `updated_at` | `string` |
| `upi_id` | `string | null` |

#### `stockist_service_areas`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `area_name` | `string | null` |
| `created_at` | `string` |
| `district` | `string | null` |
| `id` | `string` |
| `is_active` | `boolean` |
| `pin_code` | `string` |
| `state` | `string | null` |
| `stockist_id` | `string` |
| `updated_at` | `string` |

#### `subscription_plans`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `billing_cycle` | `string | null` |
| `created_at` | `string | null` |
| `features` | `Json` |
| `id` | `string` |
| `is_active` | `boolean | null` |
| `max_orders_per_month` | `number | null` |
| `max_pharmacies` | `number | null` |
| `max_products` | `number | null` |
| `plan_name` | `string` |
| `price` | `number` |
| `user_type` | `string` |

#### `support_tickets`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `category` | `string` |
| `created_at` | `string` |
| `description` | `string` |
| `id` | `string` |
| `priority` | `string` |
| `status` | `string` |
| `subject` | `string` |
| `updated_at` | `string` |
| `user_id` | `string` |

#### `territories`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `districts` | `string[] | null` |
| `id` | `string` |
| `is_active` | `boolean` |
| `pin_codes` | `string[] | null` |
| `state` | `string` |
| `territory_manager` | `string | null` |
| `territory_name` | `string` |
| `updated_at` | `string` |

#### `user_notice_recipients`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string | null` |
| `dismissed_at` | `string | null` |
| `id` | `string` |
| `notice_id` | `string` |
| `read_at` | `string | null` |
| `user_id` | `string` |

#### `user_roles`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string | null` |
| `id` | `string` |
| `role` | `Database["public"]["Enums"]["app_role"]` |
| `user_id` | `string` |

#### `user_subscriptions`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `auto_renew` | `boolean | null` |
| `created_at` | `string | null` |
| `end_date` | `string` |
| `id` | `string` |
| `last_payment_date` | `string | null` |
| `next_payment_date` | `string | null` |
| `payment_method` | `string | null` |
| `plan_id` | `string` |
| `start_date` | `string` |
| `status` | `string | null` |
| `user_id` | `string` |

#### `wishlist`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string | null` |
| `id` | `string` |
| `product_id` | `string` |
| `product_type` | `string` |
| `user_id` | `string` |

### E.3 API / Backend Surface

#### Supabase Edge Functions

| Function | Lines | CORS | Auth Pattern | Notes |
|----------|-------|------|--------------|-------|
| `ai-symptom-checker` | 44 | yes | service-role/user | — |
| `approve-reject-payment` | 289 | yes | service-role/user | — |
| `calculate-delivery-fee` | 227 | yes | public | — |
| `chat-assistant` | 891 | yes | service-role/user | — |
| `create-batch-cycle` | 64 | yes | public | — |
| `create-platform-order` | 183 | yes | public | — |
| `extract-bill-items` | 197 | yes | service-role/user | — |
| `extract-prescription` | 45 | yes | service-role/user | — |
| `extract-product-label` | 168 | yes | service-role/user | — |
| `fetch-product-info` | 115 | yes | service-role/user | — |
| `get-pharmacy-outstanding-orders` | 91 | yes | public | — |
| `mark-payment-paid` | 87 | yes | public | — |
| `optimize-route` | 232 | yes | service-role/user | — |
| `parse-order-message` | 211 | yes | service-role/user | — |
| `process-bill-image` | 365 | yes | service-role/user | — |
| `reduce-stock-for-order` | 220 | yes | public | — |
| `verify-pharmacy-license` | 240 | yes | public | — |

### E.4 Auth, Roles, and Permissions

#### Roles referenced in code

- `admin`
- `alert`
- `assistant`
- `brand`
- `group`
- `link`
- `mr`
- `navigation`
- `patient`
- `pharmacy`
- `presentation`
- `region`
- `separator`
- `stockist`
- `system`
- `tool`
- `user`

#### RLS / Policy snippets (from migrations)

- Policy `Users can view their own profile` on `public` *(migration `20251108161608_c95bba3c-61d3-47e1-ba92-099499bfab90.sql`)*
- Policy `Users can update their own profile` on `public` *(migration `20251108161608_c95bba3c-61d3-47e1-ba92-099499bfab90.sql`)*
- Policy `Users can insert their own profile` on `public` *(migration `20251108161608_c95bba3c-61d3-47e1-ba92-099499bfab90.sql`)*
- Policy `Users can view their own stockist details` on `public` *(migration `20251108161608_c95bba3c-61d3-47e1-ba92-099499bfab90.sql`)*
- Policy `Users can insert their own stockist details` on `public` *(migration `20251108161608_c95bba3c-61d3-47e1-ba92-099499bfab90.sql`)*
- Policy `Users can update their own stockist details` on `public` *(migration `20251108161608_c95bba3c-61d3-47e1-ba92-099499bfab90.sql`)*
- Policy `Users can view their own pharmacy details` on `public` *(migration `20251108161608_c95bba3c-61d3-47e1-ba92-099499bfab90.sql`)*
- Policy `Users can insert their own pharmacy details` on `public` *(migration `20251108161608_c95bba3c-61d3-47e1-ba92-099499bfab90.sql`)*
- Policy `Users can update their own pharmacy details` on `public` *(migration `20251108161608_c95bba3c-61d3-47e1-ba92-099499bfab90.sql`)*
- Policy `Users can view their own roles` on `public` *(migration `20251108163342_b4f8d61e-fa1a-487c-ad3f-8a70ec7b90d3.sql`)*
- Policy `Users can insert their own roles during signup` on `public` *(migration `20251108163342_b4f8d61e-fa1a-487c-ad3f-8a70ec7b90d3.sql`)*
- Policy `Stockists can view their own orders` on `public` *(migration `20251108163342_b4f8d61e-fa1a-487c-ad3f-8a70ec7b90d3.sql`)*
- Policy `Stockists can insert their own orders` on `public` *(migration `20251108163342_b4f8d61e-fa1a-487c-ad3f-8a70ec7b90d3.sql`)*
- Policy `Stockists can update their own orders` on `public` *(migration `20251108163342_b4f8d61e-fa1a-487c-ad3f-8a70ec7b90d3.sql`)*
- Policy `Stockists can view their order items` on `public` *(migration `20251108163342_b4f8d61e-fa1a-487c-ad3f-8a70ec7b90d3.sql`)*
- Policy `Stockists can manage their order items` on `public` *(migration `20251108163342_b4f8d61e-fa1a-487c-ad3f-8a70ec7b90d3.sql`)*
- Policy `Stockists can view their own activity` on `public` *(migration `20251108163342_b4f8d61e-fa1a-487c-ad3f-8a70ec7b90d3.sql`)*
- Policy `Stockists can insert their own activity` on `public` *(migration `20251108163342_b4f8d61e-fa1a-487c-ad3f-8a70ec7b90d3.sql`)*
- Policy `Stockists can view their products` on `public` *(migration `20251108164548_5571c10a-e83d-4591-a8de-0c619e3054b5.sql`)*
- Policy `Stockists can manage their products` on `public` *(migration `20251108164548_5571c10a-e83d-4591-a8de-0c619e3054b5.sql`)*
- Policy `Stockists can manage their product batches` on `public` *(migration `20251108164548_5571c10a-e83d-4591-a8de-0c619e3054b5.sql`)*
- Policy `Stockists can manage payment reminders` on `public` *(migration `20251108164548_5571c10a-e83d-4591-a8de-0c619e3054b5.sql`)*
- Policy `Stockists can view communication logs` on `public` *(migration `20251108164548_5571c10a-e83d-4591-a8de-0c619e3054b5.sql`)*
- Policy `Stockists can create communication logs` on `public` *(migration `20251108164548_5571c10a-e83d-4591-a8de-0c619e3054b5.sql`)*
- Policy `Product images are publicly accessible` on `storage` *(migration `20251108171821_2b8e8640-7229-4494-8181-f38ae32d9678.sql`)*
- Policy `Stockists can upload product images` on `storage` *(migration `20251108171821_2b8e8640-7229-4494-8181-f38ae32d9678.sql`)*
- Policy `Stockists can update product images` on `storage` *(migration `20251108171821_2b8e8640-7229-4494-8181-f38ae32d9678.sql`)*
- Policy `Stockists can delete product images` on `storage` *(migration `20251108171821_2b8e8640-7229-4494-8181-f38ae32d9678.sql`)*
- Policy `Stockists can upload their own bills` on `storage` *(migration `20251109053255_75c3578e-696d-4156-ba63-083453f28993.sql`)*
- Policy `Stockists can view their own bills` on `storage` *(migration `20251109053255_75c3578e-696d-4156-ba63-083453f28993.sql`)*
- Policy `Stockists can delete their own bills` on `storage` *(migration `20251109053255_75c3578e-696d-4156-ba63-083453f28993.sql`)*
- Policy `Stockists manage own routes` on `route_executions` *(migration `20251109092307_e02709e3-5a86-4ab7-af41-b6fc14789210.sql`)*
- Policy `Stockists manage own tracking` on `delivery_tracking` *(migration `20251109092307_e02709e3-5a86-4ab7-af41-b6fc14789210.sql`)*
- Policy `Stockists can insert their details` on `stockist_details` *(migration `20251109113512_a2bbf8cc-e1a1-4127-ae43-987df11ebc4c.sql`)*
- Policy `Stockists can view their details` on `stockist_details` *(migration `20251109113512_a2bbf8cc-e1a1-4127-ae43-987df11ebc4c.sql`)*
- Policy `Stockists can update their details` on `stockist_details` *(migration `20251109113512_a2bbf8cc-e1a1-4127-ae43-987df11ebc4c.sql`)*
- Policy `Stockists can view their pharmacies` on `pharmacy_details` *(migration `20251109113512_a2bbf8cc-e1a1-4127-ae43-987df11ebc4c.sql`)*
- Policy `Stockists can manage their pharmacies` on `pharmacy_details` *(migration `20251109113512_a2bbf8cc-e1a1-4127-ae43-987df11ebc4c.sql`)*
- Policy `Stockists manage their pharmacy reminders` on `payment_reminders` *(migration `20251109113512_a2bbf8cc-e1a1-4127-ae43-987df11ebc4c.sql`)*
- Policy `Stockists can view their pharmacy payment confirmations` on `public` *(migration `20251109131754_fa091de6-b5fd-4a1a-b0cf-8c79e5d01eeb.sql`)*
- Policy `Stockists can update their pharmacy payment confirmations` on `public` *(migration `20251109131754_fa091de6-b5fd-4a1a-b0cf-8c79e5d01eeb.sql`)*
- Policy `Anonymous can create payment confirmations` on `public` *(migration `20251109131754_fa091de6-b5fd-4a1a-b0cf-8c79e5d01eeb.sql`)*
- Policy `Public can view catalogue products` on `public` *(migration `20251109131754_fa091de6-b5fd-4a1a-b0cf-8c79e5d01eeb.sql`)*
- Policy `Public can verify pharmacy by license` on `public` *(migration `20251109131754_fa091de6-b5fd-4a1a-b0cf-8c79e5d01eeb.sql`)*
- Policy `Public can view catalogue-enabled stockists` on `public` *(migration `20251109131754_fa091de6-b5fd-4a1a-b0cf-8c79e5d01eeb.sql`)*
- Policy `Public can view orders via license verification` on `public` *(migration `20251109131754_fa091de6-b5fd-4a1a-b0cf-8c79e5d01eeb.sql`)*
- Policy `Stockists can view their pharmacies` on `pharmacy_details` *(migration `20251110075744_e7c2c0c0-c040-4937-8d4f-911ab5c9f669.sql`)*
- Policy `Stockists can manage their pharmacies` on `pharmacy_details` *(migration `20251110075744_e7c2c0c0-c040-4937-8d4f-911ab5c9f669.sql`)*
- Policy `Public can verify pharmacy by license` on `pharmacy_details` *(migration `20251110075744_e7c2c0c0-c040-4937-8d4f-911ab5c9f669.sql`)*
- Policy `Authenticated users can create payment confirmations` on `public` *(migration `20251110102904_fe197fb2-2ed3-401d-8860-dfaf1bf4473b.sql`)*
- Policy `Service role can manage rate limits` on `public` *(migration `20251112123800_0415c841-5191-4731-a7d9-21717595cd84.sql`)*
- Policy `Admins manage disputes` on `public` *(migration `20251118101841_c8465b28-9a35-443a-98f6-8509541a5ef4.sql`)*
- Policy `Stockists view disputes` on `public` *(migration `20251118101841_c8465b28-9a35-443a-98f6-8509541a5ef4.sql`)*
- Policy `Admins manage documents` on `public` *(migration `20251118101841_c8465b28-9a35-443a-98f6-8509541a5ef4.sql`)*
- Policy `Admins manage recalls` on `public` *(migration `20251118101841_c8465b28-9a35-443a-98f6-8509541a5ef4.sql`)*
- Policy `All view active recalls` on `public` *(migration `20251118101841_c8465b28-9a35-443a-98f6-8509541a5ef4.sql`)*
- Policy `Admins view audit logs` on `public` *(migration `20251118101841_c8465b28-9a35-443a-98f6-8509541a5ef4.sql`)*
- Policy `Admins manage fees` on `public` *(migration `20251118101841_c8465b28-9a35-443a-98f6-8509541a5ef4.sql`)*
- Policy `All view active fees` on `public` *(migration `20251118101841_c8465b28-9a35-443a-98f6-8509541a5ef4.sql`)*
- Policy `Admins manage templates` on `public` *(migration `20251118101841_c8465b28-9a35-443a-98f6-8509541a5ef4.sql`)*
- *… plus 123 additional policies*

### E.5 Workflows and State Machines

#### `applies_to` values observed in code

`both` → `pharmacy` → `stockist`

#### `calculation_method` values observed in code

`fixed` → `percentage` → `tiered`

#### `campaign_type` values observed in code

`announcement` → `discount` → `promotion` → `referral`

#### `category` values observed in code

`general` → `marketing` → `order` → `payment` → `recall`

#### `delivery_status` values observed in code

`cancelled` → `confirmed` → `delivered` → `out_for_delivery` → `packed` → `pending`

#### `dispute_type` values observed in code

`delivery` → `order` → `other` → `payment` → `quality`

#### `document_type` values observed in code

`drug_license` → `fssai` → `gst` → `incorporation` → `license` → `other`

#### `fee_type` values observed in code

`commission` → `listing` → `subscription` → `transaction`

#### `payment_status` values observed in code

`paid` → `partial` → `unpaid`

#### `payment_type` values observed in code

`custom_amount` → `full_outstanding` → `specific_order`

#### `priority` values observed in code

`high` → `low` → `medium` → `urgent`

#### `rule_type` values observed in code

`delivery_date` → `distance` → `flat_fee` → `order_amount` → `profit_amount`

#### `severity` values observed in code

`critical` → `high` → `low` → `medium`

#### `status` values observed in code

`active` → `approved` → `cancelled` → `closed` → `completed` → `confirmed` → `draft` → `error` → `exact` → `expired` → `found` → `in_progress` → `new` → `not_found` → `open` → `paid` → `partial` → `paused` → `pending` → `rejected` → `resolved` → `scheduled` → `searching` → `sent` → `unpaid` → `verified`

#### `target_audience` values observed in code

`all` → `pharmacy` → `stockist`

#### `template_type` values observed in code

`email` → `notification` → `sms` → `whatsapp`

#### Documented transition handlers (edge functions / server)

- **`approve-reject-payment`**: touches statuses `paid`
- **`create-platform-order`**: touches statuses `confirmed`, `pending`, `unpaid`
- **`mark-payment-paid`**: touches statuses `pending`
- **`process-bill-image`**: touches statuses `confirmed`, `pending`, `unpaid`

### E.6 Dashboards, Reports, and Formulas

**Formula/calculation lines extracted:** 175

#### `src/components/dashboard/BillUploadDialog.tsx`

- L53: `const [processingStage, setProcessingStage] = useState("");`
- L179: `const total = data.items.reduce((sum: number, item: ScannedItem) =>`
- L349: `<span className="text-muted-foreground">{processingStage}</span>`
- L468: `<TableHead className="text-right">Total</TableHead>`
- L486: `<span className="text-sm font-medium">Total Amount:</span>`

#### `src/components/dashboard/BulkUploadDialog.tsx`

- L42: `const [processingStage, setProcessingStage] = useState("");`
- L621: `const csvContent = `product_name,brand,manufacturer,category,type,mrp,purchase_price,stock_quantity,pack_size,strength,gst_percentage,hsn_code,moq,gen`
- L744: `<span className="text-sm">{processingStage}</span>`

#### `src/components/dashboard/EditOrderDialog.tsx`

- L59: `const [deliveryFee, setDeliveryFee] = useState<number>(0);`
- L60: `const [instantDeliveryFee, setInstantDeliveryFee] = useState<number>(0);`
- L184: `const calculateSubtotal = () => {`
- L185: `return orderItems.reduce((sum, item) => sum + item.total_price, 0);`
- L188: `const calculateTotal = () => {`
- L189: `return calculateSubtotal() - discountAmount + deliveryFee + instantDeliveryFee;`
- L205: `const totalAmount = calculateTotal();`
- L349: `<TableCell colSpan={3} className="text-right font-medium">Subtotal:</TableCell>`
- L350: `<TableCell className="font-medium">₹{calculateSubtotal().toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>`
- L375: `onChange={(e) => setDeliveryFee(parseFloat(e.target.value) || 0)}`
- L384: `value={instantDeliveryFee}`
- L385: `onChange={(e) => setInstantDeliveryFee(parseFloat(e.target.value) || 0)}`
- L403: `<span className="text-lg font-bold">Total Amount:</span>`

#### `src/components/dashboard/KPICards.tsx`

- L15: `onKPIClick?: (type: "revenue" | "pending" | "credits" | "pharmacies" | "orders") => void;`
- L18: `const KPICards = ({ stats, loading = false, onKPIClick }: KPICardsProps) => {`
- L73: `onClick={() => onKPIClick?.(kpi.type)}`
- L76: `<CardTitle className="text-sm md:text-base font-medium">{kpi.title}</CardTitle>`
- L77: `<kpi.icon className={`h-5 w-5 md:h-6 md:w-6 ${kpi.color}`} />`
- L80: `<div className="text-2xl md:text-3xl font-bold">{kpi.value}</div>`
- L82: `<p className="text-xs md:text-sm text-muted-foreground">{kpi.description}</p>`

#### `src/components/dashboard/KPIDetailDialog.tsx`

- L14: `const KPIDetailDialog = ({ open, onOpenChange, title, data, type }: KPIDetailDialogProps) => {`
- L31: `<p className="text-lg font-bold">₹{Number(order.total_amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>`

#### `src/components/dashboard/MapRouteDialog.tsx`

- L253: `<DialogTitle className="text-lg md:text-xl">Plan Delivery Route</DialogTitle>`
- L356: `const totalRounded = Math.round(order.total_amount);`
- L372: `<span className="font-semibold text-sm md:text-xs">₹{totalRounded.toLocaleString()}</span>`

#### `src/components/dashboard/QuickActions.tsx`

- L83: `onClick: () => navigate("/stockist/delivery-settings"),`

#### `src/components/dashboard/QuickBillDialog.tsx`

- L54: `const [taxRate, setTaxRate] = useState<5 | 12>(12);`
- L65: `const balance = orders?.reduce((sum, o) =>`
- L140: `const calculateTotal = () => {`
- L141: `return billItems.reduce((sum, item) => sum + item.total_price, 0);`
- L161: `const totalAmount = calculateTotal();`
- L318: `<TableCell colSpan={3} className="font-bold text-right">Total:</TableCell>`
- L319: `<TableCell className="font-bold">₹{calculateTotal().toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>`

#### `src/components/dashboard/QuickOrderDialog.tsx`

- L59: `const [taxRate, setTaxRate] = useState<5 | 12>(12);`
- L72: `const balance = orders?.reduce((sum, o) =>`
- L186: `const itemTotal = unitPrice * item.quantity;`
- L187: `const itemTax = itemTotal * (taxRate / 100);`
- L188: `totalAmount += itemTotal;`
- L189: `taxAmount += itemTax;`
- L202: `const netAmount = totalAmount + taxAmount;`
- L322: `const calculateTotals = () => {`
- L327: `subtotal += product.sale_price * item.quantity;`
- L330: `const tax = subtotal * (taxRate / 100);`
- L331: `return { subtotal, tax, total: subtotal + tax };`
- L334: `const totals = calculateTotals();`
- L430: `const lineTotal = unitPrice * item.quantity;`
- L539: `<span className="text-primary">₹{totals.total.toLocaleString('en-IN')}</span>`

#### `src/components/dashboard/RecentOrders.tsx`

- L93: `<p className="font-bold">₹{Number(order.total_amount).toLocaleString()}</p>`

#### `src/components/dashboard/TopProducts.tsx`

- L38: `const aggregated: Record<string, { total_quantity: number; total_revenue: number }> = {};`
- L42: `aggregated[item.product_name] = { total_quantity: 0, total_revenue: 0 };`
- L44: `aggregated[item.product_name].total_quantity += item.quantity;`
- L45: `aggregated[item.product_name].total_revenue += parseFloat(item.total_price);`
- L49: `.map(([product_name, stats]) => ({`
- L53: `.sort((a, b) => b.total_quantity - a.total_quantity)`

#### `src/hooks/useDashboardStats.tsx`

- L4: `export const useDashboardStats = (stockistId: string | undefined) => {`
- L5: `const [stats, setStats] = useState({`
- L17: `const fetchStats = useCallback(async () => {`
- L41: `const totalRevenue = orders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);`
- L50: `const pendingPayments = pharmacies.reduce((sum, pharmacy) =>`
- L54: `const totalCredits = pharmacies.reduce((sum, pharmacy) =>`
- L59: `const todayRevenue = todayOrders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);`
- L142: `return { stats, loading, refetch: fetchStats };`

#### `src/pages/Analytics.tsx`

- L75: `const totalRevenue = orders?.reduce((sum, order) => sum + Number(order.total_amount), 0) || 0;`
- L76: `const totalOrders = orders?.length || 0;`
- L148: `<CardTitle className="text-sm font-medium">Total Revenue</CardTitle>`
- L152: `<div className="text-2xl font-bold">₹{analytics.totalRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>`
- L159: `<CardTitle className="text-sm font-medium">Total Orders</CardTitle>`
- L163: `<div className="text-2xl font-bold">{analytics.totalOrders}</div>`
- L174: `<div className="text-2xl font-bold">{analytics.totalPharmacies}</div>`
- L185: `<div className="text-2xl font-bold">{analytics.totalProducts}</div>`

#### `src/pages/Dashboard.tsx`

- L36: `const { stats, loading: statsLoading } = useDashboardStats(stockistId ?? undefined);`
- L40: `const [kpiDialogOpen, setKpiDialogOpen] = useState(false);`
- L41: `const [kpiDialogData, setKpiDialogData] = useState<any>({ title: "", data: [], type: "revenue" });`
- L98: `const handleKPIClick = async (type: "revenue" | "pending" | "credits" | "pharmacies" | "orders") => {`
- L135: `title = "Pharmacies with Outstanding Balance";`
- L140: `const { data: creditPharmacyIds } = await supabase`
- L146: `const uniqueCreditIds = [...new Set(creditPharmacyIds.map(p => p.pharmacy_id))];`
- L147: `const { data: creditsData } = await supabase`
- L153: `data = creditsData || [];`
- L155: `title = "Pharmacies with Credits";`
- L199: `{[...Array(5)].map((_, i) => <SkeletonKPI key={i} />)}`
- L249: `<KPICards stats={stats} onKPIClick={handleKPIClick} />`
- L257: `<CreditCard className="w-5 h-5" />`
- L370: `<p className="text-xl md:text-2xl font-bold">₹{Number(order.total_amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2`
- L406: `onOpenChange={setKpiDialogOpen}`
- L407: `title={kpiDialogData.title}`
- L408: `data={kpiDialogData.data}`
- L409: `type={kpiDialogData.type}`

#### `src/pages/admin/AdminDashboard.tsx`

- L14: `const [stats, setStats] = useState({`
- L22: `const fetchStats = async () => {`
- L99: `<p className="text-2xl font-bold">{stats.totalUsers}</p>`
- L100: `<p className="text-sm text-muted-foreground">Total Users</p>`
- L104: `<p className="text-2xl font-bold">{stats.activeStockists}</p>`
- L109: `<p className="text-2xl font-bold">{stats.pharmacies}</p>`
- L114: `<p className="text-2xl font-bold">{stats.pendingTasks}</p>`

#### `src/pages/admin/Analytics.tsx`

- L8: `const [stats, setStats] = useState({`
- L46: `const revenue = revenueResult.data?.reduce((sum, order) => sum + (order.total_amount || 0), 0) || 0;`
- L101: `value={stats.totalUsers}`
- L106: `title="Total Stockists"`
- L107: `value={stats.totalStockists}`
- L112: `title="Total Pharmacies"`
- L113: `value={stats.totalPharmacies}`
- L119: `value={stats.totalOrders}`
- L127: `title="Total Revenue"`
- L128: `value={`₹${stats.totalRevenue.toLocaleString()}`}`
- L134: `value={stats.pendingOrders}`
- L139: `value={stats.activeDisputes}`
- L144: `value={stats.activeRecalls}`

#### `src/pages/admin/EnhancedAnalytics.tsx`

- L29: `const totalRevenue = orders?.reduce((sum, o) => sum + Number(o.total_amount), 0) || 0;`
- L50: `<CardTitle className="text-sm font-medium">Total Users</CardTitle>`
- L54: `<div className="text-2xl font-bold">{analytics.totalUsers}</div>`
- L60: `<CardTitle className="text-sm font-medium">Total Orders</CardTitle>`
- L64: `<div className="text-2xl font-bold">{analytics.totalOrders}</div>`
- L70: `<CardTitle className="text-sm font-medium">Total Revenue</CardTitle>`
- L74: `<div className="text-2xl font-bold">₹{analytics.totalRevenue.toLocaleString()}</div>`

#### `src/pages/brand/BrandAnalytics.tsx`

- L44: `const totalRevenue = orders?.reduce((sum, o) => sum + Number(o.total_amount), 0) || 0;`
- L71: `<CardTitle className="text-sm font-medium">Total Revenue</CardTitle>`
- L75: `<div className="text-2xl font-bold">₹{analytics.totalRevenue.toLocaleString()}</div>`
- L81: `<CardTitle className="text-sm font-medium">Total Orders</CardTitle>`
- L85: `<div className="text-2xl font-bold">{analytics.totalOrders}</div>`

#### `src/pages/brand/BrandDashboard.tsx`

- L17: `const [stats, setStats] = useState({ totalOrders: 0, totalRevenue: 0, activeProducts: 0, activeCampaigns: 0 });`
- L28: `const { data: orders } = await supabase.from("brand_orders").select("total_amount").eq("brand_id", brand.id);`
- L34: `totalRevenue: orders?.reduce((sum, o) => sum + Number(o.total_amount || 0), 0) || 0,`
- L58: `<Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Total Orders</CardTitle><Shop`
- L59: `<Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Revenue</CardTitle><TrendingU`
- L60: `<Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Products</CardTitle><Package `
- L61: `<Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Campaigns</CardTitle><MapPin `

#### `src/pages/catalogue/PharmacyDashboard.tsx`

- L42: `const fetchOutstandingOrders = async () => {`
- L44: `const { data, error } = await supabase.functions.invoke('get-pharmacy-outstanding-orders', {`
- L192: `<p className="text-xs md:text-sm text-green-700 font-medium">Credit Balance</p>`
- L204: `<p className="text-xs md:text-sm text-muted-foreground">Outstanding Balance</p>`
- L222: `<CreditCard className="w-4 h-4 mr-2" />`
- L240: `amount={pharmacy.outstanding_balance}`
- L308: `<CardTitle className="text-base md:text-lg">Outstanding Orders</CardTitle>`
- L321: `const totalAmount = Number(order.total_amount);`
- L323: `const outstanding = totalAmount - paidAmount;`
- L326: `if (outstanding < 0.01) return null;`
- L360: `<p className="text-xs text-muted-foreground">Outstanding</p>`
- L384: `const totalAmount = Number(order.total_amount);`
- L386: `const outstanding = totalAmount - paidAmount;`
- L387: `const actualStatus = Math.abs(outstanding) < 0.01 ? 'paid' : order.payment_status;`
- L398: `<p className="font-bold text-sm md:text-base">₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>`
- L403: `<Badge variant="outline" className="text-[10px] md:text-xs">{order.delivery_status}</Badge>`

#### `src/pages/mr/MRAnalytics.tsx`

- L10: `const [analytics, setAnalytics] = useState({ totalVisits: 0, totalOrders: 0, totalCommission: 0, conversionRate: 0 });`
- L21: `const { data: commissions } = await supabase.from("mr_order_commissions").select("commission_amount").eq("mr_id", mrDetails.id);`
- L23: `const totalCommission = commissions?.reduce((sum, c) => sum + Number(c.commission_amount), 0) || 0;`
- L38: `<Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Total Visits</CardTitle><User`
- L39: `<Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Orders Placed</CardTitle><Bar`
- L40: `<Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Total Commission</CardTitle><`

#### `src/pages/patient/PatientDashboard.tsx`

- L15: `const [stats, setStats] = useState({`
- L140: `<div className="text-2xl font-bold">{stats.activeOrders}</div>`
- L151: `<div className="text-2xl font-bold">{stats.totalPrescriptions}</div>`
- L162: `<div className="text-2xl font-bold">{stats.wishlistItems}</div>`
- L173: `<div className="text-2xl font-bold">{stats.pendingRefills}</div>`
- L222: `<p className="font-bold">₹{order.total_amount?.toFixed(2) || "0.00"}</p>`

#### `src/pages/pharmacy/PharmacyAnalytics.tsx`

- L45: `const inventoryValue = inventory?.reduce((sum, i) => sum + (i.quantity * Number(i.unit_price || 0)), 0) || 0;`
- L66: `<CardTitle className="text-sm font-medium">Total Products</CardTitle>`
- L70: `<div className="text-2xl font-bold">{analytics.totalProducts}</div>`

#### `src/pages/pharmacy/PharmacyPortalDashboard.tsx`

- L12: `const [stats, setStats] = useState({`
- L61: `const fetchDashboardStats = async () => {`
- L87: `const inventoryValue = inventory?.reduce((sum, item) =>`
- L168: `[...Array(4)].map((_, i) => <SkeletonKPI key={i} />)`
- L171: `<Card key={kpi.title}>`
- L173: `<CardTitle className="text-sm font-medium">{kpi.title}</CardTitle>`
- L174: `<div className={`${kpi.bgColor} p-2 rounded-lg`}>`
- L175: `<kpi.icon className={`w-4 h-4 ${kpi.color}`} />`
- L179: `<div className="text-2xl font-bold">{kpi.value}</div>`

### E.7 Modals / Dialogs / Sheets Inventory

**Files with dialog-like UI:** 55

| File | Dialog Count | Named Components |
|------|--------------|------------------|
| `src/components/catalogue/OrderConfirmationDialog.tsx` | 8 | OrderConfirmationDialog |
| `src/components/auth/SessionTimeoutWarning.tsx` | 7 | (inline) |
| `src/pages/admin/FeeManagement.tsx` | 7 | openEditDialog |
| `src/pages/admin/MessageTemplates.tsx` | 7 | openEditDialog |
| `src/pages/admin/TerritoryManagement.tsx` | 7 | openEditDialog |
| `src/pages/admin/CampaignManagement.tsx` | 7 | openEditDialog |
| `src/pages/brand/BrandCampaigns.tsx` | 6 | (inline) |
| `src/pages/brand/BrandProducts.tsx` | 6 | (inline) |
| `src/pages/admin/DocumentVerification.tsx` | 6 | openViewDialog |
| `src/components/Layout/ChatAssistant.tsx` | 5 | (inline) |
| `src/components/Layout/StockistChatAssistant.tsx` | 5 | (inline) |
| `src/components/Layout/PharmacyChatAssistant.tsx` | 5 | (inline) |
| `src/components/Layout/AdminChatAssistant.tsx` | 5 | (inline) |
| `src/components/dashboard/QuickOrderDialog.tsx` | 5 | QuickOrderDialog |
| `src/components/dashboard/EditOrderDialog.tsx` | 5 | EditOrderDialog |
| `src/components/orders/OrderActionsDropdown.tsx` | 5 | (inline) |
| `src/pages/admin/Notices.tsx` | 5 | (inline) |
| `src/pages/admin/BatchRecalls.tsx` | 5 | (inline) |
| `src/components/products/ProductScanDialog.tsx` | 4 | ProductScanDialog |
| `src/components/products/AddProductDialog.tsx` | 4 | AddProductDialog |
| `src/components/products/EditProductDialog.tsx` | 4 | EditProductDialog |
| `src/components/products/QuickUpdateStockDialog.tsx` | 4 | QuickUpdateStockDialog |
| `src/components/dashboard/KPIDetailDialog.tsx` | 4 | KPIDetailDialog |
| `src/components/dashboard/QuickBillDialog.tsx` | 4 | QuickBillDialog |
| `src/components/dashboard/OCRScanDialog.tsx` | 4 | OCRScanDialog |
| `src/components/dashboard/ExportDataDialog.tsx` | 4 | ExportDataDialog |
| `src/components/dashboard/MapRouteDialog.tsx` | 4 | MapRouteDialog |
| `src/components/dashboard/BillUploadDialog.tsx` | 4 | BillUploadDialog |
| `src/components/dashboard/BulkUploadDialog.tsx` | 4 | BulkUploadDialog, firstSheet |
| `src/components/orders/PaymentLinkDialog.tsx` | 4 | PaymentLinkDialog |
| `src/components/orders/OrderItemsDialog.tsx` | 4 | OrderItemsDialog |
| `src/components/pharmacies/EditPharmacyDialog.tsx` | 4 | EditPharmacyDialog |
| `src/components/pharmacies/AddPharmacyDialog.tsx` | 4 | AddPharmacyDialog |
| `src/components/pharmacies/PharmacySelectDialog.tsx` | 4 | PharmacySelectDialog |
| `src/components/catalogue/MarkPaymentDialog.tsx` | 4 | MarkPaymentDialog |
| `src/pages/PaymentApprovals.tsx` | 4 | (inline) |
| `src/pages/StockistApprovals.tsx` | 4 | (inline) |
| `src/pages/Support.tsx` | 4 | (inline) |
| `src/pages/Payments.tsx` | 4 | openReminderDialog |
| `src/pages/admin/PharmacyApprovals.tsx` | 4 | (inline) |
| `src/pages/admin/Disputes.tsx` | 4 | (inline) |
| `src/components/Layout/PatientTopNav.tsx` | 3 | (inline) |
| `src/components/Layout/BrandTopNav.tsx` | 3 | (inline) |
| `src/components/Layout/MRTopNav.tsx` | 3 | (inline) |
| `src/components/route/SortablePharmacyCard.tsx` | 0 | (inline) |
| `src/components/dashboard/QuickActions.tsx` | 0 | (inline) |
| `src/components/orders/OrderCard.tsx` | 0 | (inline) |
| `src/pages/OrderDetail.tsx` | 0 | (inline) |
| `src/pages/Dashboard.tsx` | 0 | (inline) |
| `src/pages/OrderCreation.tsx` | 0 | (inline) |
| `src/pages/Pharmacies.tsx` | 0 | (inline) |
| `src/pages/Orders.tsx` | 0 | (inline) |
| `src/pages/Products.tsx` | 0 | (inline) |
| `src/pages/catalogue/PharmacyDashboard.tsx` | 0 | (inline) |
| `src/pages/catalogue/PharmacyCheckout.tsx` | 0 | (inline) |

### E.8 Mock, Stub, and Incomplete Behavior

**Files flagged:** 107

| File | Tags | Sample |
|------|------|--------|
| `supabase/functions/create-platform-order/index.ts` | random, debug-log | L59: const orderNumber = `PLT-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUp |
| `supabase/functions/chat-assistant/index.ts` | debug-log | L343: console.log(`Executing stockist tool: ${toolName} for stockist: ${stockistId}`); |
| `supabase/functions/get-pharmacy-outstanding-orders/index.ts` | debug-log | L32: console.log(`Fetching outstanding orders for pharmacy: ${pharmacy_id}, stockist: ${st |
| `supabase/functions/mark-payment-paid/index.ts` | debug-log | L39: console.log(`Marking payment for pharmacy: ${pharmacy_id}, amount: ₹${amount} (rounde |
| `supabase/functions/parse-order-message/index.ts` | debug-log | L167: console.log("Primary model failed, trying fallback..."); |
| `supabase/functions/extract-product-label/index.ts` | debug-log | L54: console.log('Extracting product label from image'); |
| `supabase/functions/reduce-stock-for-order/index.ts` | debug-log | L35: console.log(`Reducing stock for order ${order_id} with ${items.length} items`); |
| `supabase/functions/optimize-route/index.ts` | demo, random, debug-log | L221: // Random distance between 5-20 km for demo |
| `supabase/functions/calculate-delivery-fee/index.ts` | debug-log | L59: console.log(`Calculating delivery fee for stockist: ${stockist_id}, pharmacy: ${pharm |
| `supabase/functions/process-bill-image/index.ts` | debug-log | L79: console.log('Using provided data from preview'); |
| `supabase/functions/verify-pharmacy-license/index.ts` | debug-log | L46: console.log(`Rate limit exceeded for license: ${license_number}`); |
| `supabase/functions/extract-bill-items/index.ts` | debug-log | L75: console.log('Primary model (gemini-2.5-pro) failed, trying fallback (gpt-5)...'); |
| `supabase/functions/fetch-product-info/index.ts` | debug-log | L44: console.log('Fetching product info for:', productName); |
| `supabase/functions/approve-reject-payment/index.ts` | debug-log | L48: console.log(`Processing payment confirmation: ${confirmation_id}, action: ${action}`) |
| `src/contexts/AuthContext.tsx` | debug-log | L137: console.log("AuthContext: Role fetched:", role, "Onboarding status:", { |
| `src/components/ui/command.tsx` | placeholder | L47: "flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:tex |
| `src/components/ui/sidebar.tsx` | random | L536: return `${Math.floor(Math.random() * 40) + 50}%`; |
| `src/components/ui/select.tsx` | placeholder | L20: "flex h-10 w-full items-center justify-between rounded-md border border-input bg-back |
| `src/components/ui/textarea.tsx` | placeholder | L11: "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text |
| `src/components/ui/input.tsx` | placeholder | L11: "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ri |
| `src/components/pharmacy/PharmacyBillsList.tsx` | debug-log | L39: console.log("Bills fetched:", data); |
| `src/components/products/ProductScanDialog.tsx` | placeholder | L327: placeholder="Units" |
| `src/components/products/AddProductDialog.tsx` | placeholder, random | L220: placeholder="e.g., Paracetamol or Paracetamol + Ibuprofen" |
| `src/components/products/EditProductDialog.tsx` | placeholder | L204: <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger> |
| `src/components/products/QuickUpdateStockDialog.tsx` | placeholder | L104: placeholder={operation === "add" ? "Enter quantity to add" : "Enter new stock quanti |
| `src/components/route/SortablePharmacyCard.tsx` | placeholder, debug-log | L333: placeholder="Amount collected" |
| `src/components/auth/ProtectedRoute.tsx` | debug-log | L106: console.log("ProtectedRoute: Redirecting to onboarding for", requiredRole); |
| `src/components/Layout/ChatAssistant.tsx` | placeholder | L335: placeholder={stockistId ? "Ask about your business..." : "Loading..."} |
| `src/components/Layout/StockistTopNav.tsx` | placeholder | L104: placeholder="Search pharmacies, products, orders..." |
| `src/components/Layout/StockistChatAssistant.tsx` | placeholder | L248: placeholder={stockistId ? "Ask about your business..." : "Loading..."} |
| `src/components/Layout/PharmacyTopNav.tsx` | placeholder | L89: placeholder="Search stockists, products..." |
| `src/components/Layout/Notifications.tsx` | debug-log | L57: console.log('Payment confirmation updated'); |
| `src/components/Layout/PharmacyChatAssistant.tsx` | placeholder | L248: placeholder={pharmacyId ? "Ask about products, orders..." : "Loading..."} |
| `src/components/Layout/TopNav.tsx` | placeholder | L113: placeholder="Search pharmacies, products, orders..." |
| `src/components/Layout/AdminChatAssistant.tsx` | placeholder | L234: placeholder="Ask about platform stats, users..." |
| `src/components/dashboard/QuickBillDialog.tsx` | placeholder | L254: <SelectValue placeholder="Choose pharmacy" /> |
| `src/components/dashboard/QuickOrderDialog.tsx` | placeholder | L375: <SelectValue placeholder="Choose pharmacy" /> |
| `src/components/dashboard/MapRouteDialog.tsx` | placeholder, debug-log | L265: placeholder="Enter your starting address or location" |
| `src/components/dashboard/BillUploadDialog.tsx` | placeholder, debug-log | L430: <SelectValue placeholder="Search and select pharmacy" /> |
| `src/components/dashboard/EditOrderDialog.tsx` | placeholder | L290: <SelectValue placeholder="Select product..." /> |
| `src/components/dashboard/BulkUploadDialog.tsx` | debug-log | L132: console.log('CSV Headers detected:', headers); |
| `src/components/dashboard/ActivityFeed.tsx` | debug-log | L49: console.log('New activity:', payload); |
| `src/components/orders/OrderActionsDropdown.tsx` | placeholder | L265: placeholder="Enter amount" |
| `src/components/orders/PaymentLinkDialog.tsx` | placeholder | L164: placeholder="Enter UPI ID" |
| `src/components/orders/OrderItemsDialog.tsx` | placeholder | L305: <CommandInput placeholder="Search products..." /> |
| `src/components/pharmacies/EditPharmacyDialog.tsx` | placeholder | L125: placeholder="Enter exact name from Google Maps" |
| `src/components/pharmacies/AddPharmacyDialog.tsx` | placeholder | L70: // Create an initial placeholder order to establish stockist-pharmacy relationship |
| `src/components/pharmacies/PharmacySelectDialog.tsx` | placeholder | L82: placeholder="Search pharmacies..." |
| `src/components/catalogue/MarkPaymentDialog.tsx` | placeholder | L132: <SelectValue placeholder="Choose an order" /> |
| `src/components/onboarding/OnboardingIllustrations.tsx` | placeholder | L97: {/* Chart placeholder */} |
| `src/hooks/useCachedPharmacies.tsx` | debug-log | L77: console.log('Pharmacy data changed, invalidating cache'); |
| `src/hooks/useDashboardStats.tsx` | debug-log | L112: console.log('Orders updated, refetching stats'); |
| `src/lib/offlineSync.ts` | random, debug-log | L48: id: `${Date.now()}_${Math.random()}`, |
| `src/lib/storage.ts` | debug-log | L31: console.log(`Uploading to ${bucket}/${filePath}...`); |
| `src/pages/Index.tsx` | debug-log | L29: console.log("Index: Navigating to", destination, "role:", userRole); |
| `src/pages/PaymentApprovals.tsx` | placeholder, debug-log | L230: placeholder="Add verification notes..." |
| `src/pages/Login.tsx` | placeholder, debug-log | L252: placeholder="Enter your email" |
| `src/pages/Dashboard.tsx` | debug-log | L63: console.log('Orders updated'); |
| `src/pages/Support.tsx` | placeholder | L236: placeholder="Brief description of your issue" |
| `src/pages/OrderCreation.tsx` | placeholder | L360: placeholder="Paste order message here... e.g., Dolo 50N, Paracetamol 100 boxes" |
| `src/pages/ResetPassword.tsx` | placeholder | L91: placeholder="Enter new password (min 6 characters)" |
| `src/pages/Payments.tsx` | placeholder | L508: placeholder="Enter reminder message..." |
| `src/pages/Pharmacies.tsx` | placeholder, debug-log | L620: placeholder="Search pharmacies..." |
| `src/pages/RouteExecution.tsx` | debug-log | L58: console.log("Fetching updated pharmacy data..."); |
| `src/pages/Profile.tsx` | placeholder | L365: placeholder="e.g., HDFC Bank" |
| `src/pages/PharmacyRegistration.tsx` | placeholder, random | L241: placeholder="e.g., 28.6139,77.2090" |
| `src/pages/Orders.tsx` | placeholder, debug-log | L309: <SelectValue placeholder="All Pharmacies" /> |
| `src/pages/ForgotPassword.tsx` | placeholder | L77: placeholder="Enter your email" |
| `src/pages/Products.tsx` | placeholder, debug-log | L384: placeholder="Search products..." |
| `src/pages/pharmacy/PharmacyInventory.tsx` | placeholder | L119: placeholder="Search by product name or batch number..." |
| `src/pages/pharmacy/PharmacyPortalOrders.tsx` | placeholder | L172: placeholder="Search by order number or stockist..." |
| `src/pages/pharmacy/BrowseStockists.tsx` | placeholder | L174: placeholder="Search by name, company, or location..." |
| `src/pages/pharmacy/PharmacyPortalCheckout.tsx` | placeholder, debug-log | L351: placeholder="Add notes for this order (optional)" |
| `src/pages/pharmacy/PharmacyOrdering.tsx` | placeholder, random | L82: // For now, just showing placeholder |
| `src/pages/pharmacy/StockistCatalogue.tsx` | placeholder | L207: placeholder="Search products..." |
| `src/pages/pharmacy/PharmacyPortalDashboard.tsx` | debug-log | L37: console.log('Inventory updated, refreshing stats'); |
| `src/pages/stockist/StockistProfile.tsx` | placeholder | L321: placeholder="yourname@upi" |
| `src/pages/stockist/DeliverySettings.tsx` | placeholder | L371: placeholder="PIN Code (6 digits)" |
| `src/pages/mr/MRPharmacies.tsx` | placeholder | L66: <Input placeholder="Search pharmacies..." value={searchQuery} onChange={(e) => setSea |
| `src/pages/mr/MRCollections.tsx` | demo, placeholder | L34: toast.success("Collection recorded! (Demo)"); |
| `src/pages/brand/BrandSignup.tsx` | placeholder | L106: placeholder="Brand name" |
| `src/pages/brand/BrandCampaigns.tsx` | placeholder | L175: placeholder="e.g., Summer Sale" |
| `src/pages/brand/BrandProducts.tsx` | placeholder | L176: placeholder="e.g., Paracetamol 500mg" |
| `src/pages/admin/UserManagement.tsx` | placeholder | L105: placeholder="Search by email, name, or company..." |
| `src/pages/admin/PharmacyApprovals.tsx` | placeholder | L358: placeholder="Enter reason for rejection..." |
| `src/pages/admin/Notices.tsx` | placeholder | L231: <SelectValue placeholder="All Roles" /> |
| `src/pages/admin/BatchRecalls.tsx` | placeholder | L247: placeholder="Enter batch code (e.g., BATCH-2024-001)" |
| `src/pages/admin/Disputes.tsx` | placeholder | L183: placeholder="Enter resolution details..." |
| `src/pages/admin/MessageTemplates.tsx` | placeholder | L205: placeholder="e.g., pharmacy_name, amount, date" |
| `src/pages/admin/TerritoryManagement.tsx` | placeholder | L212: placeholder="e.g., 110001, 110002, 110003" |
| `src/pages/admin/DocumentVerification.tsx` | placeholder | L202: placeholder="Provide a reason for rejection..." |
| `src/pages/admin/AuditLogs.tsx` | placeholder | L63: placeholder="Search logs by action, entity, or user..." |
| `src/pages/patient/PriceComparison.tsx` | placeholder | L66: placeholder="Search for medicine..." |
| `src/pages/patient/AIAssistant.tsx` | placeholder | L62: placeholder="Describe your symptoms in detail (e.g., fever for 2 days, headache, body |
| `src/pages/patient/PatientSignup.tsx` | placeholder | L100: placeholder="Enter your full name" |
| `src/pages/patient/PatientProfile.tsx` | placeholder | L242: <SelectValue placeholder="Select gender" /> |
| `src/pages/patient/MedicineSearch.tsx` | placeholder | L86: placeholder="Search by medicine name, brand, or salt..." |
| `src/pages/patient/PatientCheckout.tsx` | demo, placeholder, todo | L75: toast.info("Cart integration required. This is a demo checkout flow."); |
| `src/pages/catalogue/PharmacyDashboard.tsx` | debug-log | L91: console.log('Order update:', payload); |
| `src/pages/catalogue/PharmacyCheckout.tsx` | placeholder | L280: placeholder="Enter amount" |
| *…* | | *7 more* |

### E.9 Dead Code, Orphan Routes, and Broken Links

#### Likely unreferenced page components

- `BrandSignup`
- `PatientSignup`

#### Duplicate / parallel component files

- `Analytics.tsx`: `src/pages/Analytics.tsx`, `src/pages/admin/Analytics.tsx`


---

## EXPANSION PASS 2 — Deep Trace Additions (2026-07-08)

Append-only deep-trace pass. Only material NOT already present above. Domain restricted to Admin / Stockist / Pharmacy. All paths relative to the repo root `stockpharmaerp/`.

### E2.1 Newly documented routes/pages/screens

No new routes exist beyond the complete route table in §E.1 — every `<Route>` in `src/App.tsx` is already enumerated. New page-level detail discovered on already-listed routes:

- **`/support` (`src/pages/Support.tsx`)** — ticket creation dialog inserts `support_tickets` with `category` default `'general'`, `priority` default `'medium'`, `status` default `'open'` (DB defaults, migration `20251108190232`). Verbatim toasts: "Please log in to create a ticket", "Ticket created successfully", "Failed to create ticket", "Ticket marked as resolved", "Failed to update ticket", "Failed to load support tickets". Resolve action is a status update on the user's own ticket (RLS: `auth.uid()=user_id` for SELECT/INSERT/UPDATE).
- **`/settings` Manage tab (`src/pages/Settings.tsx`)** — per-role announcement save toast is dynamically built: `` `${role.charAt(0).toUpperCase() + role.slice(1)} announcement updated!` ``; app-info save → "App info updated!" / "Failed to save app info". Announcements and app info persist to `platform_settings` rows keyed `app_info`, `stockist_announcement`, `pharmacy_announcement`, `admin_announcement` (seeded — see E2.8).
- **`/stockist/home` sub-components not previously itemized** — `src/components/dashboard/ActivityFeed.tsx`, `LowStockAlert.tsx`, `DateRangeFilter.tsx`, `NoticesPanel.tsx` (full behavior in E2.2).
- **Global search destinations (`src/components/Layout/StockistTopNav.tsx`)** — search fires only when `searchQuery.length > 1`; three parallel scoped queries (pharmacies by `pharmacy_name/owner_name/phone/area ilike %q%` limit 5, products by `name/brand/generic_name/category`, orders by `order_number`), and selecting ANY result navigates only to the list page (`/stockist/pharmacies`, `/stockist/products`, `/stockist/orders`) — never to the specific record.
- **`/pharmacy/*` top-nav search (`src/components/Layout/PharmacyTopNav.tsx`)** — searches only `stockist_details` where `catalogue_enabled=true` by `stockist_name/company_name ilike`, limit 5; selection navigates to `/pharmacy/stockists/{id}` (this one DOES deep-link).

### E2.2 Component behavior catalog

Fine-grained props/state/behavior beyond §2.16, §16 and the E.7 inventory table:

#### `src/components/dashboard/OCRScanDialog.tsx` (not previously documented at all)
- Props: `open`, `onOpenChange`, `stockistId: string`. State: `file`, `processing`, `scannedItems: {name, quantity, price}[]`.
- "Scan & Extract Items" reads the file as base64 and invokes edge fn **`parse-order-message`** with `{message: "Extract product information...JSON array...name, quantity, price", image: base64}` — i.e. it repurposes the order-parsing function for inventory OCR.
- "Save to Inventory": per item — `products` lookup `.eq("name", item.name).eq("stockist_id", stockistId).maybeSingle()`; if found `update {stock_quantity: existing+qty, sale_price: item.price}`; else `insert {name, stockist_id, stock_quantity: qty, sale_price: price, mrp: price, is_active: true}`. Then one `activity_log` insert `{activity_type:"inventory_updated", description:"OCR scan added N products"}`.
- Timing bug: `setProcessing(false)` runs in `finally` synchronously before the async `FileReader.onload` completes, so the spinner state is unreliable.

#### `src/components/dashboard/ExportDataDialog.tsx`
- Props: `open`, `onOpenChange`, `stockistId`. `exportType: "orders"|"payments"|"activity"` (default orders). Queries: orders `select("*, pharmacy_details(pharmacy_name)")`, payment_confirmations same join, activity_log `select("*")` — all `.eq(stockist scope).order("created_at", desc)`. CSV headers = `Object.keys(data[0])`; object values are `JSON.stringify`ed. Filenames `orders_<yyyy-MM-dd>.csv` / `payments_…` / `activity_…`. Empty result → error toast; success toast "Exported N records".

#### `src/components/dashboard/KPIDetailDialog.tsx`
- Pure presentational; props `title`, `data: any[]`, `type: "revenue"|"pending"|"credits"|"pharmacies"|"orders"`. revenue/orders render order rows (pharmacy name, order_number, `formatDistanceToNow`, ₹total en-IN 2dp, payment badge); pending renders pharmacy outstanding in destructive color; credits renders `+₹credit_balance` green; pharmacies renders name/active badge/owner/area/total_orders. Empty state text: "No data available".

#### `src/components/dashboard/EditOrderDialog.tsx` (fee-field detail new)
- State includes `discountAmount`, `deliveryFee`, `instantDeliveryFee` — the two fee fields factor into `calculateTotal = subtotal − discountAmount + deliveryFee + instantDeliveryFee` and are saved into `orders.total_amount`/`net_amount`, but are **not persisted as separate columns and always reset to 0 on open** (phantom inputs). Save flow: update orders `{total_amount, net_amount: total, discount_amount, notes}` → delete ALL `order_items` for the order → re-insert current items `{order_id, product_name, quantity, unit_price, total_price}` → `activity_log {activity_type:"order_modified", description:"Edited order <order_number>"}`. Item load maps `product_id` to `item.product_name` as a fallback. Warning alert rendered when `payment_status==='paid'`.

#### `src/components/dashboard/NoticesPanel.tsx`
- No props. On mount + realtime channel `user-notices` (INSERT on `user_notice_recipients`) → refetch. Fetch: own `user_notice_recipients`, keep those without `dismissed_at`, then `admin_notices .in("id", noticeIds).eq("is_active", true)` ordered desc, client-filtered to non-expired (`expires_at > now`). Click notice → `markAsRead` (`update {read_at: now}`); X button → `dismissNotice` (`update {dismissed_at: now}`, stopPropagation). Icons: alert→AlertCircle, warning→AlertTriangle, else Info. Priority badge variants: urgent→destructive, high→default, medium→secondary, else outline. Component returns `null` when there are no notices; header badge = unread count.

#### `src/components/dashboard/ActivityFeed.tsx`
- Props `{stockistId}`. Fetch `activity_log` scoped, desc, `limit(50)`; realtime channel `activity-feed-updates` INSERT filter `stockist_id=eq.<id>` prepends live rows. Filter select values: all, catalogue_update, price_change, order_modified, payment_reminder. Icon map: catalogue_update→Package, price_change→DollarSign, order_modified→FileText, payment_reminder→Bell. Renders first 10 filtered with `formatDistanceToNow`. Collapsible, default open.

#### `src/components/dashboard/LowStockAlert.tsx`
- Props `{stockistId}`. Query `products .select("id,name,stock_quantity,min_stock_threshold,brand").order("stock_quantity", asc)`, client-filter `stock_quantity <= min_stock_threshold`, `.slice(0,5)`. Returns null when none. "View All Products" → `/stockist/products`.

#### `src/components/dashboard/DateRangeFilter.tsx`
- Props `dateRange`, `onDateRangeChange`. Popover range Calendar `numberOfMonths={2}` + X clear → `onDateRangeChange(undefined)`. No queries (confirms §11: display-only on Dashboard).

#### `src/components/products/*` (persistence gaps + exact parsing)
- **AddProductDialog** (`AddProductDialog.tsx`): props include `initialData?: {name?, brand?, category?}`; prefill implemented via `useState(() => {...})` lazy initializer with side effects (not a `useEffect` — runs once, a code smell). Numeric parsing on insert: `parseFloat(mrp)||null`, `parseInt(stock_quantity)||0`, `min_stock_threshold||10`, `moq||1`, `gst_percentage||5`. Image upload path `${stockistId}/${Math.random()}.${ext}` in `product-images`. Type select = 14 options (tablet…solution); category select ≈24 options. Logs `activity_log {catalogue_update, "Added new product: <name>"}`.
- **EditProductDialog**: type select only 6 options (tablet, capsule, syrup, injection, drops, cream) vs Add's 14; category is a free-text Input here (select in Add). No activity_log on save (Add logs one).
- **ProductScanDialog**: progress staged 10→30→70→85→100; upload via `uploadToStorage(file,"product-images")` then edge fn `extract-product-label {image: url}`. Existing-product match: exact `.eq("name", data.name.trim())` then fallback `.ilike`. Form inputs disabled until "Correct - Enable Editing" (`isConfirmed`). Update path adds scanned qty to existing stock: `stock_quantity: existing.stock_quantity + parseInt(stock_quantity)`. `batch_number` and `expiry_date` are collected but never saved. Activity descriptions: "OCR updated: <name>" / "OCR added new product: <name>".
- **QuickUpdateStockDialog**: `operation: "add"|"set"`; `newStock = add ? current+amount : amount`; live preview `current + parseInt(updateAmount||"0")`; toast "Stock updated to N units".

#### `src/components/pharmacies/*`
- **AddPharmacyDialog**: required fields = pharmacy_name, gst_number, license_number. The placeholder order insert `INIT-{Date.now()}` carries `notes: "Initial registration order..."`; its error is logged but NOT thrown (pharmacy creation still succeeds). Error string when stockist lookup fails: "Stockist details not found".
- **EditPharmacyDialog**: extra fields (license_number, pin_code, google_maps_name, location_coordinates, whatsapp_number, email) are read off the pharmacy prop via `(pharmacy as any)` casts — the prop interface only declares 8 fields.
- **PharmacySelectDialog**: fetches **all** active pharmacies (`.eq("is_active", true)`, no stockist scope in the query — scoping comes from RLS), client search across name/owner/area; `onSelect(pharmacyId, pharmacyName)` then closes.

#### `src/components/orders/*`
- **PaymentLinkDialog**: exact props `{open, onOpenChange, orderNumber, totalAmount, pharmacyName, pharmacyPhone?}`. `paymentAmount = totalAmount * paymentPercentage / 100`; slider min 1 max 100 step 1 + 100/50/25% quick buttons. Also builds a **web link** `` `${origin}/pay/${orderNumber}?amount=${paymentAmount}` `` for the copy action — note `/pay/*` is NOT a route in `src/App.tsx`, so the copied web link 404s (the UPI deep link and WhatsApp path work). Inline UPI editing: `update stockist_details {upi_id} .eq("profile_id", user.id)`.
- **OrderItemsDialog** — full recalculation contract: on any item change, `recalculateOrderTotal()` sums `order_items.total_price`, re-derives `payment_status` (`paid` if `paid_amount>=newTotal`; `partial` if `0<paid<newTotal`; else `unpaid`), updates `orders {total_amount, net_amount: newTotal−paid, payment_status}`, then re-runs the client `recalculatePharmacyBalance`. Delete uses native `confirm("Delete this item?")`. Minus button disabled at `quantity<=1`.
- **OrderCard.tsx**: previews first **3** items (`limit(3)`); whole card `onClick → window.location.href='/stockist/orders/<id>'` (hard navigation, not router). Inner buttons don't stopPropagation, so opening the items dialog can also trigger card navigation. Renders `OrderActionsDropdown` WITHOUT `pharmacyId/paidAmount/orderNumber` props — so from OrderCard, Mark-as-Paid skips the payment_confirmations insert (needs pharmacyId) and partial-payment math treats prior paid as 0.
- **OrderActionsDropdown** — exact confirmation insert on Mark Paid: `{payment_method:'manual_mark_paid', payment_type:'cash', status:'approved', processed_at, processed_by, stockist_notes:"Order <n> marked as paid via orders UI"}`. ⚠️ `payment_type:'cash'` violates the DB CHECK on `payment_confirmations.payment_type` (`IN ('full_outstanding','custom_amount','specific_order')`, migration `20251109131754`) — see E2.8. "Cancel Order" only sets `status='cancelled'`; the credit the toast promises is applied by the DB trigger `handle_order_cancellation`, not by this component. Menu items are conditional: Mark Paid/Partial hidden when paid, Mark Delivered hidden when delivered, Cancel hidden when cancelled.
- **UpiQrCode** (`src/components/orders/UpiQrCode.tsx`, lives in `orders/` not `catalogue/`): props `{upiId, amount, orderNumber, stockistName}`; `QRCodeSVG` id `upi-qr-code`; `downloadQR` serializes the SVG → canvas → PNG named `UPI-QR-<orderNumber>.png`.

#### `src/components/catalogue/*`
- **MarkPaymentDialog**: `unpaidOrders = orders.filter(o => o.paid_amount < o.total_amount)`; amount resolution — full_outstanding→`pharmacy.outstanding_balance`, specific_order→that order's **`total_amount`** (not its remaining due), custom→`parseFloat(amount)`. Submit disabled when `loading || (specific_order && !selectedOrderId)`. UI copy claims rounding to nearest rupee but the raw amount is sent.
- **OrderConfirmationDialog**: pure AlertDialog; props `{onConfirm, items, subtotal, totalTax, grandTotal, notes, loading}`; action label toggles "Placing Order..."/"Confirm & Place Order"; both buttons disabled while loading.
- **OnboardingCarousel** (`src/components/onboarding/OnboardingCarousel.tsx`): props `{slides: {title,description,illustration}[], onComplete, storageKey}`; embla carousel; `handleComplete` = `localStorage.setItem(storageKey, "true")` then `onComplete()`; fired by X, "Get Started" (last slide) and "Skip introduction".

#### `src/components/route/SortablePharmacyCard.tsx` (exact FIFO loop)
- `handleRecordPayment` loop per order: skip when `amountDue<=0.01`; if `remaining>=amountDue` → `{paid_amount: total_amount, payment_status:"paid"}` and `remaining -= amountDue`; else `{paid_amount: paid+remaining, payment_status: |total−newPaid|<0.01 ? "paid":"partial"}`, `remaining=0`. Then one approved `payment_confirmations {order_id: null, payment_method: <cash|online|cheque|other>, payment_type:'route_collection', stockist_notes:"Route collection: ₹X via <mode>. <notes>"}` and an explicit **500 ms `setTimeout` wait "for DB trigger"** before refresh. `payment_type:'route_collection'` also violates the DB CHECK (E2.8). PaymentLinkDialog is fed `totalAmount = order.total_amount − (paid_amount||0)` (remaining due, not full total). Mark Delivered button `disabled={allOrdersDelivered}`; Record button `disabled={!collectionAmount || updating}`. `customPaymentAmount` state exists but is unused.

#### `src/components/auth/SessionTimeoutWarning.tsx` (exact constants)
- Interval 1 s while a session exists; `SESSION_TIMEOUT = 30*60*1000`, `WARNING_BEFORE_TIMEOUT = 5*60*1000`; warning shows when `0 < SESSION_TIMEOUT − (now − lastActivity) <= 5min`; countdown formatted mm:ss; "Stay Logged In" → `refreshSession()`.

#### Chat assistants (`src/components/Layout/*ChatAssistant.tsx`)
- Four near-identical Sheet chats. Message history persisted per role in **sessionStorage**: `stockist-chat-messages`, `pharmacy-chat-messages`, `admin-chat-messages`, and legacy `chat-messages` (ChatAssistant.tsx). Context window = last 10 messages mapped `{role, content}`. Bodies: stockist `{messages, stockist_id, role:'stockist'}`; pharmacy `{messages, pharmacy_id, role:'pharmacy'}`; admin `{messages, role:'admin'}`; legacy ChatAssistant sends `{messages, stockist_id}` with **no role key** (server infers stockist). `formatMessage` renders `**bold**`→`<strong>`, `- `/`• `→`<li>` via `dangerouslySetInnerHTML`. Send disabled while loading or when the role id hasn't resolved. Clear chat removes the sessionStorage key.

#### Misc shell components
- **AdminTopNav** (`src/components/Layout/AdminTopNav.tsx`): title "Digi Swasthya Admin"; bell icon is static (no handler); profile dropdown shows `user?.email || "Admin"`.
- **AdminSidebar**: `collapsed` toggles width `w-56`/`w-16`; 14 items ending with `/settings` (confirms Enhanced Analytics absent).
- **PWAInstallPrompt**: suppressed permanently once dismissed via `localStorage['pwa-install-dismissed']='true'`.
- **NetworkStatus**: offline toast uses `duration: Infinity`; a success toast fires on reconnect only if previously offline. Renders null (toast-only component).
- **RouteErrorBoundary**: shows the error message only when `process.env.NODE_ENV==='development'`; Retry = state reset + `window.location.reload()`; Go Home = `window.location.href="/"`.
- **NavLink.tsx**: forwardRef adapter adding `activeClassName`/`pendingClassName` over react-router's NavLink.

### E2.3 Entity & schema deep detail

Additions to §13/§14/§E.2 from the migration SQL itself (`supabase/migrations/*.sql`, 52 files):

#### Enum evolution
- `public.user_role = ('stockist','pharmacy')` created `20251108161608` — **legacy**; the `profiles.role` column that used it was dropped in `20251108163342`, but the enum type remains.
- `public.app_role` created `20251108163342` as `('stockist','pharmacy')`; `'admin'` added `20251118101737`; `'mr'` added `20251124105100`; `'patient'`,`'brand'` added `20251210035414`.

#### Column-level facts not previously recorded
- `orders`: `status` DEFAULT `'draft'`; `order_source` DEFAULT `'manual'`; `payment_status` DEFAULT `'unpaid'`; `delivery_status` DEFAULT `'pending'`; amounts `DECIMAL(10,2)`; `order_number TEXT UNIQUE NOT NULL`; `paid_amount`/`bill_image_url` added `20251109053255`; `batch_cycle_id` added `20251124105748`.
- `orders` CHECK constraints: `orders_delivery_status_check` (`20251109070411`) allows `('pending','confirmed','packed','out_for_delivery','delivered','cancelled')` — note `'dispatched'` used by parts of the UI is NOT in this list, while `'packed'` is never used by the UI. `orders_payment_status_check` (`20251110125029`) enforces `(paid ∧ paid_amount>=total) ∨ (partial ∧ 0<paid<total) ∨ (unpaid ∧ paid IS NULL OR 0)`; a second, redundant identical constraint `orders_payment_validation` was added `20251110130655`.
- `orders` indexes: `idx_orders_pharmacy_payment (pharmacy_id, payment_status) WHERE payment_status IN ('unpaid','partial')`, `idx_orders_pharmacy_delivery (…) WHERE delivery_status != 'delivered'`, `idx_orders_pharmacy_status (…) WHERE status != 'cancelled'` (all `20251111210644`), plus `idx_orders_stockist_status (stockist_id, status, created_at)` (`20251208162808`).
- `pharmacy_details` FK history: original `profile_id → profiles.id` was **re-pointed** in `20251110075744` to `stockist_details(id) ON DELETE CASCADE` and made NOT NULL, then made **nullable again** in `20251209024207` for self-registered pharmacies. `auth_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL` added `20251124105132` with index `idx_pharmacy_details_auth_profile`. Money columns are `DECIMAL(10,2)` (`credit_limit`, `outstanding_balance` default 0); `credit_balance NUMERIC DEFAULT 0` added `20251111210644`; `latitude/longitude` added `20251208162808`.
- `products`: `gst_percentage DECIMAL(5,2) DEFAULT 18` (DB default is 18 even though every client insert path defaults to 5); `min_stock_threshold DEFAULT 10`; `moq DEFAULT 1` (`20251108174345`); partial index `idx_products_batch_code … WHERE batch_code IS NOT NULL` (`20251120135426`). Data-cleanup migration `20251209022707` DELETEs garbage products (numeric-only names, address/phone/GST-like names, ≤2-char names) where all three prices are 0, and empty-name rows.
- `order_items`: `gst_percentage numeric(5,2)` + `tax_amount numeric(10,2)` added `20251110092918`; `batch_code` added `20251120135426` with partial index.
- `payment_confirmations` CHECKs: `amount > 0`; `payment_type IN ('full_outstanding','custom_amount','specific_order')`; `status IN ('pending','approved','rejected')`. Four+ overlapping indexes on (pharmacy_id, status, …) accumulated across `20251109131754`/`20251110112044`/`20251110120736`/`20251111210644`. `payment_method TEXT` added `20251110120736`.
- `payment_reminders`: `auto_reminder_enabled BOOLEAN DEFAULT false` + `scheduled_date` (`20251109070411`) with partial index `idx_payment_reminders_scheduled (scheduled_date, status) WHERE auto_reminder_enabled = true` — an auto-reminder scheduling substrate with **no scheduler** anywhere in the codebase. `stockist_id` added + backfilled from orders in `20251109113512`.
- `stockist_details`: bank/UPI/business columns added `20251109053255` (incl `business_hours JSONB`, `delivery_radius NUMERIC`, `default_credit_days INTEGER DEFAULT 30`); dispatch coords + `default_margin_percent NUMERIC DEFAULT 20` added `20251208162808`; **`catalogue_slug`/`catalogue_enabled` have no ADD COLUMN in this migrations folder** (added out-of-band; backfilled `20251109131754`, `20251209022707`); `unique_stockist_profile_id UNIQUE(profile_id)` re-added `20251220115850`.
- `stockist_delivery_rules` CHECK: `rule_type IN ('profit_amount','order_amount','delivery_date','distance','flat_fee')` — five types, of which the DeliverySettings UI (§2.14) only creates three and the fee engine only honors three (see E2.5). Columns: `min_profit_amount`, `min_order_amount`, `free_on_delivery_date BOOLEAN DEFAULT false`, `per_km_charge`, `base_distance_km DEFAULT 0`, `flat_fee`, `priority DEFAULT 1`. Partial index `idx_delivery_rules_stockist (stockist_id, priority) WHERE is_active = true`.
- `stockist_delivery_dates`: `UNIQUE(stockist_id, delivery_date)`; partial index `WHERE is_active = true`.
- `stockist_service_areas`: `UNIQUE(stockist_id, pin_code)` (source of the 23505 dup-PIN error in §2.14); also has `district`/`state` columns the UI never populates (used by `distribute_notice_to_users` geo targeting).
- `catalogue_rate_limits`: `attempt_count INTEGER NOT NULL DEFAULT 1`; documented `action_type` values `'license_verify','order_create','payment_submit'` — only `license_verify` is ever used.
- `batch_delivery_rules`: `min_order_value DEFAULT 0`, `require_payment_clearance BOOLEAN DEFAULT true`, `max_payment_overdue_days DEFAULT 0`, `delivery_day TEXT DEFAULT 'Sunday'` — no UI reads or writes this table (dormant batch-eligibility rules).
- `pharmacy_stockist_connections`: `UNIQUE(pharmacy_id, stockist_id)`; carries its own `credit_limit`/`outstanding_balance` (both DEFAULT 0) — parallel to `pharmacy_details` balances, never reconciled.
- `route_executions.status` DEFAULT `'in_progress'`; `pharmacy_ids UUID[]` + `optimized_order UUID[]` array columns.
- `user_notice_recipients`: `UNIQUE(notice_id, user_id)` — the ON CONFLICT target of the fan-out function.
- `platform_settings`: `setting_value JSONB NOT NULL DEFAULT '{}'`; `setting_key UNIQUE` (constraint duplicated again as `unique_platform_settings_key` in `20251220115850`).

#### RLS policy names & exact predicates (core additions to §15.1)
- `orders`: the anon policy "Public can view orders via license verification" (`USING true`, created `20251109131754`) was **DROPPED** in `20251110130655` as a security fix — public order reads now go only through the service-role edge functions.
- `pharmacy_details` final policy set (post-churn): "Public can verify pharmacy by license" SELECT (anon+authenticated) `USING true`; "Pharmacies can manage their own details authenticated" ALL `USING auth_profile_id = auth.uid() AND has_role(auth.uid(),'pharmacy')`; "Pharmacies can view their own profile" SELECT `USING auth_profile_id = auth.uid() OR profile_id IN (SELECT id FROM stockist_details WHERE profile_id = auth.uid()) OR is_admin()`; "Stockists can insert/view/update their pharmacies" via `profile_id IN (SELECT id FROM stockist_details WHERE profile_id=auth.uid())` (`20251210023517` replaced the earlier `has_role`-based versions).
- `payment_confirmations`: TWO permissive insert policies — "Anonymous can create payment confirmations" (anon, `WITH CHECK true`) and "Authenticated users can create payment confirmations" (`20251110102904`, `WITH CHECK true`) — any client can insert a confirmation for any pharmacy/stockist pair; the trust boundary is the stockist approval step.
- `pharmacy_registration_requests`: stockist SELECT/UPDATE policies join `stockist_service_areas` on `pin_code` with `is_active=true` — the PIN-scoping seen in §2.12 is enforced at the DB, not just the UI.
- `communication_log` stockist policies check only `EXISTS(pharmacy_details WHERE id = communication_log.pharmacy_id)` — i.e. any authenticated user can read/insert logs for any existing pharmacy (no ownership predicate).
- `catalogue_rate_limits`: single policy "Service role can manage rate limits" ALL `USING true WITH CHECK true`.
- `pharmacy_inventory`: "Pharmacies manage own inventory" ALL via `pharmacy_id IN (SELECT id FROM pharmacy_details WHERE auth_profile_id=auth.uid() AND has_role(auth.uid(),'pharmacy'))`; "Admins view all inventory".
- Storage `bills` policy churn: `20251109053255` keyed folders by `auth.uid()`; `20251208143113` and `20251209140707` re-keyed to `stockist_details.id` folders; `20251220115850` added back `auth.uid()`-folder INSERT/SELECT for all authenticated users — both folder conventions are now valid.

#### Trigger bodies (exact, augmenting §14)
- `recalculate_pharmacy_balance()` final (`20251112112641`): `SET outstanding_balance = COALESCE(SUM(total_amount − COALESCE(paid_amount,0)),0) … WHERE pharmacy_id = COALESCE(NEW.pharmacy_id, OLD.pharmacy_id) AND payment_status IN ('unpaid','partial') AND status != 'cancelled'`. Evolution: `20251109080804` original → `20251111025306` added ROUND() → `20251111210644` added cancelled filter → `20251112053344` removed ROUND → final.
- `handle_order_cancellation()`: guard `NEW.status='cancelled' AND OLD.status!='cancelled'`; credits `NEW.paid_amount` (un-rounded in final version; the `20251111210644` version used `ROUND`). The trigger was re-attached in `20251208162808` **without** its original `WHEN (NEW.status='cancelled' AND OLD.status IS DISTINCT FROM 'cancelled')` clause (the in-function guard still protects it).
- `prevent_overpayment()`: **lacks `SECURITY DEFINER` and `SET search_path`** (unlike every other function) — it runs with caller privileges; its embedded `UPDATE pharmacy_details SET credit_balance = credit_balance + excess` is therefore subject to the caller's RLS.
- `create_expiry_alerts()`: `IF NEW.expiry_date > CURRENT_DATE + INTERVAL '30 days' THEN INSERT INTO pharmacy_expiry_alerts (…, alert_days_before=30) ON CONFLICT DO NOTHING` — confirms §14's note: rows already inside the 30-day window never get alerts.
- `check_rate_limit(...)`: row-lock `SELECT … FOR UPDATE` within `now() − p_time_window_minutes`; returns `{allowed:true, attempts_remaining: max−1}` on first attempt; denial payload includes `retry_after_minutes = EXTRACT(EPOCH FROM (last_attempt_at + window − now()))/60`.
- `distribute_notice_to_users(...)`: counts every matching loop iteration **regardless of ON CONFLICT skip**, so the returned recipient count can overstate actual new recipients.
- `search_users_by_batch_code(...)`: pharmacy leg counts `COUNT(DISTINCT oi.id)` (order-item rows, not products) and excludes cancelled orders; `GRANT EXECUTE TO authenticated`.
- `deduct_stock(...)` (`20251208162808`): `UPDATE products SET stock_quantity = stock_quantity − p_quantity WHERE id=… AND stock_quantity >= p_quantity; IF NOT FOUND THEN RETURN false`. Called ONLY by the pharmacy portal checkout; all edge functions do inline JS clamping instead.
- There is **no `handle_new_user` trigger** on `auth.users` and no DB-side order-number generator — profiles/roles are inserted by the client (§19.1) and order numbers are minted in app/edge code.

### E2.4 Workflow traces

New traces (beyond §19):

#### Delivery-fee resolution (pharmacy portal checkout → `calculate-delivery-fee`)
1. `src/pages/pharmacy/PharmacyPortalCheckout.tsx` invokes `calculate-delivery-fee {stockist_id, pharmacy_id, order_total}` per stockist group.
2. Function loads stockist dispatch coords + pharmacy coords; computes Haversine distance only if all four coordinates exist, else `distanceKm=0`.
3. Loads `stockist_delivery_rules` active, **ordered by priority ASC**; first matching rule wins:
   - `order_amount`: `order_total >= min_order_amount` → `{fee:0, is_free:true, reason:"Free delivery for orders above ₹<min>"}`.
   - `flat_fee`: `flat_fee !== null` → `{fee: flat_fee, is_free: flat_fee===0, reason: rule_name || "Flat delivery fee: ₹<fee>"}`.
   - `distance`: `per_km_charge !== null && distanceKm>0` → `fee = round(max(0, distanceKm − base_distance_km) * per_km_charge)`, response includes `distance_km`.
   - `profit_amount` and `delivery_date` rule types are **explicit no-ops** (skipped in the switch) — creatable in the schema but never applied.
4. No rule matched → fallback `order_total >= 5000 ? fee 0 ("Free delivery for orders above ₹5,000") : fee 50 ("Standard delivery fee")`.
5. Every failure path (stockist/pharmacy not found, exception) still returns HTTP **200** with `fee:50` and reasons "Default delivery fee (stockist not found)" / "(pharmacy not found)" / "Default fee due to error" — checkout can never hard-fail on fees.

#### Payment claim with CHECK-constraint failure branch (public catalogue)
1. Pharmacy submits MarkPaymentDialog → `mark-payment-paid` with `payment_type ∈ {full_outstanding, custom_amount, specific_order}` → INSERT succeeds (values allowed by the DB CHECK) with `status:'pending'`.
2. BUT the same edge function's Zod also accepts `cash|cheque|online|custom` (7-value enum); any caller sending those hits the DB CHECK `payment_type IN ('full_outstanding','custom_amount','specific_order')` and the insert fails → generic 400 "Failed to submit payment. Please try again.". Similarly, the stockist-side inserts with `payment_type 'cash'` (OrderActionsDropdown) and `'route_collection'` (SortablePharmacyCard) and the `on_hold` status written by `approve-reject-payment` all conflict with the DB CHECKs (`status IN pending/approved/rejected`) — these paths only work if the deployed DB has looser constraints than the migrations record (see E2.8).
3. Approval trace precision (`approve-reject-payment`): guard "Payment already processed" unless current status ∈ (pending, on_hold); `on_hold` action sets `processed_at=null, processed_by=null` (reversible); on approve with credit: `creditUsed = min(amount, credit_balance)` and **`totalFundsToDistribute = creditUsed + amount`**; after distribution, when credit was used the confirmation's `stockist_notes` is overwritten with `"Applied ₹<credit> from credit + ₹<amount> payment"`.

#### OCR inventory replenishment (stockist, previously undocumented)
Dashboard → OCRScanDialog → base64 image → `parse-order-message` (prompt overridden to extract name/quantity/price) → review table → "Save to Inventory" → per-item exact-name upsert into `products` (add stock + overwrite sale_price) → single `activity_log inventory_updated` row. Failure branches: no file ("select a file" error toast), non-array AI result (error toast), per-item insert/update errors abort with error toast.

#### Order re-totaling (stockist edits)
Two distinct editors with different persistence semantics:
- OrderItemsDialog (per-item CRUD): every mutation immediately persists that item, then re-derives order totals AND payment_status AND pharmacy balance (full cascade).
- EditOrderDialog (bulk replace): totals are computed client-side including phantom fee fields, saved once via delete-all + re-insert of items; payment_status is NOT re-derived here (an order edited below its paid_amount will trip the DB `prevent_overpayment`/payment CHECK instead).

### E2.5 Business rules & calculations

New exact formulas (beyond §10):

- **Haversine distance** (`supabase/functions/calculate-delivery-fee/index.ts`): `R = 6371 km`, standard `a = sin²(Δφ/2) + cosφ₁·cosφ₂·sin²(Δλ/2)`; distance used raw (km, float), displayed at 1 dp in the reason string; per-km fee is `Math.round()`ed to whole rupees.
- **Distance-rule fee**: `fee = max(0, distance_km − base_distance_km) × per_km_charge`, rounded with `Math.round`.
- **Fallback fee rule**: `order_total >= 5000 → 0`, else `50` (mirrored client-side in PharmacyPortalCheckout as `subtotal≥5000?0:50`).
- **EditOrderDialog total**: `subtotal − discountAmount + deliveryFee + instantDeliveryFee`; both fee inputs default 0 and are non-persistent.
- **PaymentLinkDialog partial link amount**: `totalAmount × percentage / 100`, percentage ∈ [1,100] via slider.
- **OrderItemsDialog status derivation**: `paid` iff `paid_amount >= newTotal` (no 0.01 tolerance here, unlike the five FIFO sites); `net_amount = newTotal − paid_amount`.
- **create-platform-order rounding**: order-level `Math.round(total_amount)` and `Math.round(tax_amount||0)`; per-item `Math.round(unit_price)`, `Math.round(total_price)`, `Math.round(tax_amount||0)` — platform orders are stored in whole rupees; item `gst_percentage` defaults to **12** when absent.
- **Balance recompute in create-platform-order**: `newBalance = Σ (round(total) − round(paid))` over unpaid/partial (rounds each side, unlike the DB trigger which doesn't round).
- **get-pharmacy-outstanding-orders filter**: keeps orders where `round(total_amount) > round(paid_amount)` — sub-rupee residues are treated as settled for display.
- **Batch-cycle economics** (`create-batch-cycle`): `total_pharmacies = new Set(orders.map(pharmacy_id)).size`; `delivery_cost = orders.length × 12`; `cost_savings = orders.length × 60 − orders.length × 12` (= `orders × 48`).
- **reduce-stock-for-order**: `reduceAmount = min(quantity, currentStock)`; `newStock = max(0, currentStock − quantity)`; low-stock warning when `newStock <= (min_stock_threshold || 10)`; auto-created products are inserted with `stock_quantity = quantity` then immediately updated to 0 (two writes so the activity log can record "initial stock").
- **process-bill-image auto-product pricing**: `purchase_price = item.price||0`, `sale_price = price × 1.2`, `mrp = price × 1.3`, `gst 5` — a hardcoded 20%/30% markup model.
- **DB payment-status invariant** (CHECK, `20251110125029`): `paid ⇒ paid_amount≥total`; `partial ⇒ 0<paid<total`; `unpaid ⇒ paid∈{NULL,0}` — enforced on every orders write, beneath all client logic.
- **GST DB default vs client default**: `products.gst_percentage` DB default **18**, client insert paths default **5**, platform order items default **12** — three different defaults by surface.

### E2.6 API/edge-function reference deep detail

Request/response/error precision beyond §9 (all files `supabase/functions/<name>/index.ts`):

- **calculate-delivery-fee** — req `{stockist_id, pharmacy_id, order_total}`; res `{fee, is_free, reason, distance_km?}`; ALL paths HTTP 200 (even catch-all: `{error, fee:50, is_free:false, reason:"Default fee due to error"}`); no writes; SERVICE_ROLE.
- **mark-payment-paid** — Zod `{pharmacy_id: uuid, stockist_id: uuid, order_id?: uuid|null, amount: coerced number 1..10,000,000, payment_type: 7-value enum, pharmacy_notes?: ≤500|null}`; res `{success:true, amount, payment_type, message:"Payment marked for approval. The stockist will verify and confirm."}`; errors: Zod→400 "Invalid payment data provided", other→400 "Failed to submit payment. Please try again."; single INSERT `payment_confirmations {…, status:'pending'}`; ANON key.
- **approve-reject-payment** — Zod `{confirmation_id: uuid, action: 'approve'|'reject'|'on_hold', stockist_notes?: ≤500|null}`; res `{success:true, message:"Payment <action>d successfully"}`; errors: missing/invalid auth→**401** `{error:"Unauthorized"}`, Zod→400 "Invalid payment approval data provided", not-found / already-processed / other→400 "Failed to process payment. Please try again."; ordered side effects: read confirmation (`pharmacy_details!inner` join) → status guard → update confirmation → (approve) credit read → credit deduction → single-order or FIFO application → excess/leftover to credit → cleanup pass → conditional stockist_notes rewrite.
- **create-platform-order** — full Zod: items 1..100 of `{product_name 1..200, product_description? ≤500, quantity int 1..10000, unit_price 0..1e6, total_price 0..1e7, gst_percentage? 0..100, tax_amount? ≥0}`; optional `subtotal`, `tax_amount ≤1e7`, `delivery_address ≤500`, `notes ≤1000`; res `{success:true, order:{id, order_number, total_amount}}`; errors: Zod→400 "Invalid order data provided", other→400 "Failed to create order. Please try again."
- **verify-pharmacy-license** — Zod `{stockist_slug 1..100, license_number 1..100, pharmacy_pin_code?}`; rate limit key = `license_number.toLowerCase()`, action `'license_verify'`, 5/15 min → **429** `{verified:false, rate_limited:true, message:"Too many verification attempts. Please try again in <ceil(retry_after_minutes)> minutes."}`. Negative responses (all HTTP 200) verbatim: "Invalid catalogue link. Stockist not found." / "Catalogue is currently unavailable." (+suggestion "Please contact the stockist for the correct catalogue link."); "Error verifying license. Please try again."; PIN miss → `{message:"This stockist does not deliver to PIN code <pin>.", suggestion:"Please contact <stockist_name> to check their delivery coverage area.", stockist:{name, phone, company}}`; license miss → `{message:"License number \"<x>\" is not registered or inactive.", …, attempts_remaining}`. Positive res `{verified:true, pharmacy:{id,name,license_number,outstanding_balance,credit_balance}, stockist:{id,name,company_name,upi_id}, orders: last 10}`.
- **get-pharmacy-outstanding-orders** — Zod `{pharmacy_id: uuid, stockist_id: uuid}`; res `{success:true, orders:[{id, order_number, created_at, total_amount, paid_amount, payment_status, order_items:[{product_name, product_description, quantity, unit_price, total_price}]}]}` ordered created_at ASC; errors: Zod→400 "Invalid request data", other→400 "Failed to fetch outstanding orders".
- **create-batch-cycle** — req `{stockistId, startDate, endDate, deliveryDate}` (NO Zod, NO auth check beyond platform JWT); res = the raw inserted `order_batch_cycles` row; error→**500** `{error: message||'Unknown error'}`; side effects: read orders in range (status pending|confirmed) → insert cycle → stamp `batch_cycle_id` on those orders.
- **reduce-stock-for-order** — Zod `{order_id: uuid, stockist_id: uuid, items: 1..100 of {product_name 1..200, quantity int 1..10000}}`; res `{success:true, order_id, results:{reduced:[{product_id, product_name, quantity_reduced, previous_stock, new_stock, auto_created?}], failed:[{product_name, reason, error}], warnings: string[]}}`; per-item errors are collected, not fatal; top-level Zod→**500** "Invalid stock reduction data provided".
- **parse-order-message** — status ladder: no Authorization→401 `{error:'Unauthorized'}`; body>100000 bytes→**413** `{error:'Request too large'}`; bad orderText→400 `{error:'Invalid orderText'}`; stockistId fails `/^[0-9a-f-]{36}$/i`→400 `{error:'Invalid stockistId'}`; no user→401; stockist not owned→**403** `{error:'Access denied'}`; catch-all→500 via `sanitizeError` (maps permission/policy→'Access denied', not found→'Resource not found', invalid→'Invalid request data', else 'An error occurred processing your request'). AI JSON extracted via `content.match(/\{[\s\S]*\}/)`.
- **process-bill-image** — req `{image, stockist_id, pharmacy_id?, pharmacy_name?, license_number?, address?, items?, create_new_pharmacy?}`; `useProvidedData = pharmacy_name && items.length>0`; image URL must be https with host containing 'supabase' or 'lovable' (unless preview data provided); errors 401/400 'Invalid or missing image URL'/'Invalid image URL format'/'Invalid stockist_id'/403 'Access denied'/500 sanitized; res `{success:true, order_number, order_id, stock_update:{reduced, created, failed}}`; extracted pharmacy_name truncated to 200 chars; auto-created pharmacy rows get `gst_number:'PENDING'`.
- **extract-bill-items** — every outcome HTTP 200; error strings verbatim: "Invalid or missing image URL", "Invalid image URL format", "Rate limit exceeded. Please try again in a few moments." (AI 429), "AI credits exhausted. Please add credits to your workspace." (AI 402), "AI service temporarily unavailable", "No data extracted from image", "Could not parse response from AI", "No items found in the image", "No valid items could be extracted", fallback "Failed to process image"; success `{ok:true, pharmacy_name?≤200, items:[{name≤200, quantity int≥1, price≥0}]}`.
- **optimize-route** — req `{startingPoint, pharmacies:[{id,name,address,coordinates?,google_maps_name?}]}`; location string priority per pharmacy: `coordinates` (if contains ',') → `google_maps_name` → `"<name>, <address>"`; Google element failure → distance 999 km; AI JSON parse failure → sequential route with `totalDistance = count×8` and explanation "Using default sequential route due to parsing error"; res `{optimizedOrder: uuid[], distances: number[], totalDistance, explanation}`; error→500 `{error, details:"Failed to optimize route. Using default order."}`.
- **chat-assistant** — validation errors (400): "Role or user ID is required", "stockist_id is required for stockist role", "pharmacy_id is required for pharmacy role", "messages array is required"; role inference `role || (stockist_id?'stockist' : pharmacy_id?'pharmacy' : null)`; AI 429→**429** "Rate limit exceeded. Please try again in a moment."; AI 402→**402** "AI credits exhausted. Please add credits to continue."; res `{response: string, usage}`. Admin tool set (previously unlisted): `get_platform_stats` (orders count+sum, profiles count), `get_all_users_count` (user_roles grouped by role), `get_pending_approvals` (registration requests where admin_approved null/false), `get_active_recalls`, `get_recent_activity` (latest 10 audit_logs). Pharmacy tool `get_pharmacy_inventory` selects `min_quantity` — a column that does not exist on `pharmacy_inventory` (actual: `low_stock_threshold`) so that tool call errors at runtime.

### E2.7 Role journeys step-by-step

§19–§20 already trace the primary journeys click-by-click. Genuinely new journey fragments only:

- **Stockist — OCR inventory top-up**: `/stockist/home` → Quick Actions → OCR Scan → choose photo/PDF of a supplier bill → "Scan & Extract Items" → review name/qty/price rows → "Save to Inventory" → stock added to exact-name-matched products, unknown lines become new products priced at the scanned price (mrp=sale=price) → activity feed shows "OCR scan added N products" (`src/components/dashboard/OCRScanDialog.tsx`).
- **Stockist — data export**: `/stockist/home` → Quick Actions → Export Data → pick Orders/Payments/Activity → "Export to CSV" → browser downloads `orders_<date>.csv` etc. with raw column dumps (`src/components/dashboard/ExportDataDialog.tsx`).
- **Stockist — putting a payment on hold and resuming**: `/stockist/payment-approvals` → Review → "Put on Hold" → confirmation shows ⏸ on_hold on both stockist list and pharmacy catalogue dashboard; later Review again (button reappears because status is on_hold) → Approve/Reject; on_hold left `processed_at/processed_by` null so the audit trail starts at final decision (`src/pages/PaymentApprovals.tsx`, `supabase/functions/approve-reject-payment/index.ts`).
- **Admin — configuring announcements**: `/settings` → Manage tab → edit title/message/show_banner per role → save → toast "<Role> announcement updated!" → stockist/pharmacy dashboards render the banner from `platform_settings` on next load (`src/pages/Settings.tsx`).
- **Pharmacy (public catalogue) — rate-limit lockout path**: 5 failed license attempts within 15 min → HTTP 429 → LicenseVerification shows the retry-minutes message; the counter is keyed by the license string (lowercased), not IP, so trying a different license resets attempts (`supabase/functions/verify-pharmacy-license/index.ts`).

Otherwise: **No new findings beyond existing review** (§19.1–19.7, §20 remain the authoritative journeys).

### E2.8 Hidden/internal functionality

- **Seeded admin account**: migration `20251209090314` grants `admin` role to the profile with email **`jitesh.cse.apm@gmail.com`**; it also mass-deletes duplicate roles (drops pharmacy role when stockist/admin exists, stockist when admin exists) and executes `DELETE FROM user_roles WHERE role='mr'` (wiping all MR roles at that point). `20251209090338` strips the stockist role from hardcoded user `80b4cd8c-9323-4d79-a8b6-48499d78e699`.
- **Seeded `platform_settings`** (`20251209102746`, `ON CONFLICT DO NOTHING`): `app_info = {"name":"Digi Swasthya Store","version":"1.0.0","tagline":"Connecting Pharmacies with Stockists","developer":"Digi Swasthya Technologies","developer_email":"support@digiswasthya.com","copyright":"© 2024 Digi Swasthya Store. All rights reserved."}`; stockist/pharmacy announcements default `show_banner: true` with "Welcome to Digi Swasthya Store!" titles; admin announcement `show_banner: false`. Later migrations (`20251219124937`, `20251220115850`) attempt re-seeds with different taglines but are no-ops due to DO NOTHING (first write wins).
- **Complete browser-storage key inventory** (consolidating; new keys in bold):
  - localStorage: `pharmacy_session`, `pharmacy_cart` (`src/contexts/PharmacyContext.tsx`), per-user portal cart `${role}_cart_${userId}` (`src/contexts/CartContext.tsx`), **`pwa-install-dismissed`** (`src/components/PWAInstallPrompt.tsx`), onboarding flags via `STORAGE_KEYS` incl `onboarding_completed_catalogue` (`src/components/onboarding/OnboardingCarousel.tsx` writes; `LicenseVerification.tsx`, `StockistOnboarding.tsx`, `PharmacyOnboarding.tsx` read), `offline_sync_queue` (`src/lib/offlineSync.ts`), Supabase auth token (`src/integrations/supabase/client.ts` `storage: localStorage`). AuthContext sign-out executes `localStorage.clear()` + `sessionStorage.clear()` wholesale.
  - sessionStorage: **`stockist-chat-messages`**, **`pharmacy-chat-messages`**, **`admin-chat-messages`**, **`chat-messages`** (chat assistants), **`catalogue_pharmacy`**, **`catalogue_stockist`** (`src/pages/catalogue/PharmacyCatalogue.tsx` reads these as a secondary session mirror).
- **Migrations-vs-runtime constraint conflicts** (dead-but-wired paths that depend on the deployed DB being looser than the migrations): `payment_confirmations.payment_type` CHECK (3 values) vs runtime writers using `cash` (OrderActionsDropdown, `manual_partial`), `route_collection` (SortablePharmacyCard), and `mark-payment-paid`'s 7-value Zod enum; `payment_confirmations.status` CHECK lacks `'on_hold'` which `approve-reject-payment` writes; `orders.delivery_status` CHECK lacks `'dispatched'` (used in UI vocab §10) while allowing `'packed'` which nothing writes.
- **Dormant DB surface**: `batch_delivery_rules` (payment-clearance/delivery-day gating for batch cycles — no reader/writer); `payment_reminders.auto_reminder_enabled` + `scheduled_date` + partial index (no scheduler); `pharmacy_stockist_connections` per-connection credit fields (never reconciled with `pharmacy_details`); `catalogue_rate_limits.action_type` values `'order_create'`/`'payment_submit'` (defined, never rate-limited); `stockist_service_areas.district/state` (only used by notice fan-out, never populated by UI); `stockist_details.business_hours/delivery_radius/default_margin_percent` (written nowhere); legacy enum `public.user_role` orphaned since `20251108163342`.
- **`deduct_stock` RPC asymmetry**: the only atomic, non-negative-safe stock decrement exists in the DB but is called solely by the pharmacy portal checkout; all edge functions re-implement clamped JS decrements (`max(0, …)`), which are not atomic.
- **`/pay/:orderNumber` ghost URL**: PaymentLinkDialog's copyable web link targets a route that does not exist in `src/App.tsx` (falls through to NotFound).
- **Trigger re-attachment drift** (`20251208162808`): `trg_orders_handle_cancel` and the overpayment trigger were re-created without their original `WHEN` clauses, and the overpayment trigger renamed `trg_orders_prevent_overpayment` — behavior preserved by in-function guards, but every orders UPDATE now invokes all three trigger functions unconditionally.
- **Data-hygiene migrations as hidden behavior**: `20251209022707` silently deletes "garbage" products (regex-classified junk names with zero prices) — an OCR-artifact cleanup encoded in schema history; the same migration backfills `catalogue_slug`.
- **`OrderCard` prop under-passing**: because `OrderCard.tsx` omits `pharmacyId/paidAmount/orderNumber` when rendering `OrderActionsDropdown`, mobile Mark-as-Paid actions skip the confirmation-record insert and partial payments miscompute against `paidAmount=0` — a hidden divergence between desktop table and mobile card behavior on `/stockist/orders`.

### E2.9 Validation & error-handling catalog

Client-side Zod schemas (only two exist in `src/`; the rest of the client validates manually):
- `src/components/dashboard/QuickOrderDialog.tsx`: `quickOrderSchema = z.object({ pharmacyId: z.string().min(1, "Please select a pharmacy"), orderText: z.string().min(10, "Order text must be at least 10 characters") })`.
- `src/components/dashboard/QuickBillDialog.tsx`: `quickBillSchema = z.object({ pharmacyId: z.string().min(1, "Please select a pharmacy"), items: z.array(z.any()).min(1, "Please add at least one item") })`.

Auth pages, verbatim (`src/pages/Login.tsx`, `ResetPassword.tsx`, `ForgotPassword.tsx`):
- Login: "Please select your role" (signup w/o role card), "Passwords do not match", "Password must be at least 6 characters", "Login successful!", "Failed to login", "Account created successfully!", "An account with this email already exists. Please login instead." (matched on error text), "Failed to create account".
- ResetPassword: "Invalid or expired reset link" (no recovery session), "Passwords do not match", "Password must be at least 6 characters", "Password updated successfully", "Failed to update password".
- ForgotPassword: "Password reset link sent to your email", "Failed to send reset email".

Stockist configuration (`src/pages/stockist/DeliverySettings.tsx`), verbatim: "Please enter a valid 6-digit PIN code" (regex/length gate before insert), "This PIN code already exists" (Postgres 23505 on `UNIQUE(stockist_id,pin_code)`), "Failed to add service area", "Service area added", "Date enabled"/"Date disabled", "Delivery date added", "Area enabled"/"Area disabled", "Service area removed", "Please enter a value" (fee rule without value), "Delivery rule added", "Rule removed".

Pharmacy flows, verbatim: PharmacyRegistration — "Registration submitted successfully! You will be notified once approved.", "Failed to submit registration: <message>". PharmacyPortalCheckout — "Failed to load checkout data", "Pharmacy details not found", `` `Order ${orderNumber} placed successfully!` ``, "Failed to place order: <message>". Public catalogue — LicenseVerification "License verified successfully"; PharmacyCheckout "Order placed successfully!", "Failed to place order. Please try again.", "UPI link copied!".

Support & Settings, verbatim: listed under E2.1.

Edge-function error strings (canonical list; all generic-by-design via `sanitizeError` to avoid leaking internals): "Invalid payment data provided", "Failed to submit payment. Please try again.", "Invalid payment approval data provided", "Failed to process payment. Please try again.", "Unauthorized", "Invalid order data provided", "Failed to create order. Please try again.", "Invalid request data", "Failed to fetch outstanding orders", "Invalid stock reduction data provided", "Failed to reduce stock. Please try again.", "Request too large", "Invalid orderText", "Invalid stockistId", "Access denied", "Resource not found", "An error occurred processing your request", "Invalid or missing image URL", "Invalid image URL format", "Invalid stockist_id", plus the extract-bill-items and verify-pharmacy-license message sets quoted verbatim in E2.6.

Server-side (DB) validation layer, consolidated: `payment_confirmations` `amount > 0` CHECK; `orders` dual payment-status CHECKs; `orders_delivery_status_check` 6-value list; `campaigns.discount_percentage` 0..100 CHECK; `platform_fees.fee_value >= 0` CHECK; unique constraints surfacing as 23505 (`orders.order_number`, `stockist_service_areas(stockist_id,pin_code)`, `stockist_delivery_dates(stockist_id,delivery_date)`, `user_roles(user_id,role)`, `user_notice_recipients(notice_id,user_id)`, `pharmacy_stockist_connections(pharmacy_id,stockist_id)`, `message_templates.template_name`, `territories.territory_name`, `platform_settings.setting_key`, `invoices.invoice_number`, `disputes.dispute_number`, `batch_recalls.recall_number`).

---

*End of Expansion Pass 2 (2026-07-08). All statements above derived directly from source at the cited paths; no evaluation or recommendations included.*