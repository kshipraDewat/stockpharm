# Master Flow Index — All 8 Repositories

> **Navigable index** of every flow, page, screen, modal, and pipeline across the 8 pharma platform variants.  
> Full definitions live in [`UNIFIED_FEATURES.md`](./UNIFIED_FEATURES.md) (Part I + Appendices A–H per repo).

---

## Document Map

| File | Purpose |
|------|---------|
| [`EXHAUSTIVE_REVIEW_PROMPT.md`](./EXHAUSTIVE_REVIEW_PROMPT.md) | Copy-paste prompt to re-run full 8-repo review |
| [`UNIFIED_FEATURES.md`](./UNIFIED_FEATURES.md) | **Merged spec** — Part I (19 modules) + Part II (Appendices A–H, one per repo) |
| This file | Master index — every flow, page, screen at a glance |

---

## App Roster

| Code | Repo | Routes (approx) | Roles |
|------|------|-----------------|-------|
| **ERP** | stockpharmaerp | ~70 | stockist, pharmacy, patient, brand, mr, admin |
| **HUB** | digi-swasthya-hub | 120+ | stockist, pharmacy, customer, doctor, admin + delivery staff |
| **MED** | greetings-pal-git | ~25 | stockist, pharmacy (admin dormant) |
| **MR** | stockistpayments | ~30 | mr, stockist, distributor, pharmacy, admin |
| **MVP** | digimvplaunch | ~35 | admin, stockist, pharmacist |
| **DSW** | digiswasthya | ~75 | stockist, pharmacy, patient, doctor, admin |
| **DMVP** | digiswasthyamvp | ~50 | admin, stockist, pharmacy |
| **SP** | STOCKIST-PHARMACY | ~45 | stockist tenant, pharmacy tenant (staff: admin/biller/pharmacist/cashier) |

---

# PART A — CROSS-APP FLOWS & PIPELINES

## A.1 Authentication & Onboarding Flows

| Flow ID | Flow Name | Steps | Apps |
|---------|-----------|-------|------|
| AUTH-01 | Email/password login + role select | Select role → enter credentials → verify role → approval gate (if applicable) → redirect to dashboard | ERP, HUB, MED, MR, MVP, DSW, DMVP, SP |
| AUTH-02 | Self-registration (multi-step) | Role picker → multi-step form → document upload → signUp → profile insert → pending approval or auto-active | HUB (4 roles), MR, MVP (stub), DSW, SP (single form) |
| AUTH-03 | Self-registration (tab on login) | Login page Sign-Up tab → role grid → credentials → onboarding | ERP |
| AUTH-04 | Forgot password | Enter email → reset email → click link → set new password | ERP, HUB, MED, MR, SP |
| AUTH-05 | OTP login | Phone/email OTP via `signInWithOtp` | MR |
| AUTH-06 | Admin hidden reveal | 5-tap logo → admin role option | HUB, MVP |
| AUTH-07 | Demo/prototype login | Role selector → ignore inputs → navigate to dashboard | MVP, DSW, DMVP |
| AUTH-08 | Staff login (delivery) | Username + password → RPC verify (stockist then pharmacy) → staff session | HUB |
| AUTH-09 | Onboarding wizard (post-signup) | Carousel or SlideOver steps → min-setup gates → mark complete | ERP, HUB, MR, SP, MVP, DSW |
| AUTH-10 | Pending approval wait | Poll/check approval_status → redirect when approved | HUB |
| AUTH-11 | Session timeout | Inactivity timer → warning dialog → refresh or signOut | ERP (30m), HUB (30m), SP (JWT iat check), ERP catalogue (20m) |
| AUTH-12 | Public catalogue license verify | Enter drug license + PIN → verify RPC → session → catalogue | ERP, SP (partial) |

## A.2 B2B Order Pipeline (Stockist ↔ Pharmacy)

| Flow ID | Stage | Actions | Status vocabulary (varies) |
|---------|-------|---------|---------------------------|
| B2B-01 | Create order (stockist-side) | Select pharmacy → add items (manual/paste/AI) → credit check → submit | pending/confirmed/draft |
| B2B-02 | Create order (pharmacy-side) | Browse catalogue → cart → checkout → credit check → submit | pending/placed |
| B2B-03 | Approve / Confirm | Stockist confirms or pharmacy order accepted | confirmed/accepted |
| B2B-04 | Pack | Deduct stock (FEFO/FIFO) → mark packed | packed |
| B2B-05 | Dispatch / Ship | Assign delivery staff → carrier/AWB → mark shipped/dispatched | dispatched/shipped/out_for_delivery |
| B2B-06 | Deliver | Mark delivered → auto-populate pharmacy inventory (HUB) | delivered |
| B2B-07 | Bill generation | Generate GST bill → QR (where implemented) → PDF | draft/final |
| B2B-08 | Payment collection | Record payment → credit-first FIFO → update outstanding | paid/partial/unpaid |
| B2B-09 | Returns | Initiate return → approve/reject → credit note → restore stock | pending/approved/rejected |
| B2B-10 | Split order | Split into child order `-S` suffix | HUB, DMVP |
| B2B-11 | Partial delivery | Record partial quantities delivered | HUB, DMVP |
| B2B-12 | Quick order (WhatsApp paste) | Paste text → AI/regex parse → match products → review → confirm | All apps (variant) |
| B2B-13 | Smart order (multi-stockist) | Parse → recommend Best Single / Cheapest Split / Fastest Delivery → add to cart | MED (deepest), others partial |

## A.3 B2C Order Pipeline (Pharmacy ↔ Customer)

| Flow ID | Stage | Actions | Apps |
|---------|-------|---------|------|
| B2C-01 | Browse & search | Search pharmacies/products → view catalogue | HUB, DSW |
| B2C-02 | Add to cart | Select qty → prescription flag if Rx → cart persist | HUB, DSW |
| B2C-03 | Checkout | Address → payment mode (UPI/COD) → place order | HUB, DSW |
| B2C-04 | Prescription upload | Upload Rx image → attach to order | HUB, DSW |
| B2C-05 | Rx verification (pharmacy) | Pharmacy reviews Rx → approve/reject | HUB |
| B2C-06 | Prepare & price | Add pricing → prepare order | HUB |
| B2C-07 | Deliver | Assign staff → mark delivered → deduct inventory | HUB |
| B2C-08 | B2C bill | Generate customer bill | HUB |
| B2C-09 | Doctor commission | Calculate & record commission on B2C sale | HUB |
| B2C-10 | Customer return | Customer initiates → pharmacy processes | HUB |
| B2C-11 | POS retail sale | Scan/search → add items → payment → receipt | SP |

## A.4 Payment & Credit Flows

| Flow ID | Flow Name | Logic | Apps |
|---------|-----------|-------|------|
| PAY-01 | Credit limit check | `exposure + orderTotal ≤ creditLimit` | HUB, SP, ERP, MR |
| PAY-02 | Credit-first FIFO settlement | Apply payment to oldest bills first; credit balance before outstanding | ERP, HUB, MVP, SP |
| PAY-03 | Payment approval chain | Pharmacy submits proof → stockist approve/reject/hold | ERP, HUB |
| PAY-04 | UPI link generation | Generate UPI deep link + QR → WhatsApp share | ERP, HUB, MR |
| PAY-05 | Delivery staff collection | Staff collects → pending approval → stockist approves | HUB |
| PAY-06 | Double-entry ledger posting | Sales Dr / GST Dr / Sundry Debtors Cr | SP |
| PAY-07 | Supplier payment | Record payment against purchase bills | SP, MR |
| PAY-08 | Payable bills (pharmacy) | View stockist bills → record payment | SP |

## A.5 Inventory & Product Flows

| Flow ID | Flow Name | Apps |
|---------|-----------|------|
| INV-01 | Add product (manual form) | All |
| INV-02 | Edit product + price change notification | HUB, ERP, SP, MR |
| INV-03 | Bulk upload (catalogue CSV/XLSX) | All |
| INV-04 | Purchase bill OCR upload | ERP, HUB, MED, MR, SP |
| INV-05 | Batch management (FIFO/FEFO) | HUB, ERP, SP, MVP |
| INV-06 | Stock adjustment | SP, ERP |
| INV-07 | Expiry management / dispose | HUB, ERP, SP |
| INV-08 | Stock transfer between batches | HUB, ERP |
| INV-09 | Bulk price update (% or flat) | HUB, ERP, SP, MED |
| INV-10 | AI product autofill | ERP, HUB, MED, MR, SP |
| INV-11 | OCR product label scan | ERP, MR, DSW (stub) |
| INV-12 | GRN receive (pharmacy) | SP |
| INV-13 | Auto-populate pharmacy inventory on delivery | HUB |
| INV-14 | Required stock / reorder alerts | SP, MED, HUB |

## A.6 Consultation & Prescription Flows

| Flow ID | Flow Name | Apps |
|---------|-----------|------|
| RX-01 | Book consultation (customer) | HUB, DSW |
| RX-02 | Doctor availability scheduling | HUB, DSW |
| RX-03 | Conduct consultation (audio/video/clinic) | HUB, DSW |
| RX-04 | Write prescription | HUB, DSW |
| RX-05 | Prescription templates | HUB |
| RX-06 | Upload prescription → order medicines | HUB, DSW |
| RX-07 | Doctor-pharmacy partnership + commission rules | HUB |

---

# PART B — SCREENS BY MODULE (All Apps)

## Module 2 — Auth Screens

| Screen | Route(s) | ERP | HUB | MED | MR | MVP | DSW | DMVP | SP |
|--------|----------|-----|-----|-----|-----|-----|-----|------|-----|
| Login | `/`, `/login`, `/auth` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | demo | ✓ |
| Register | `/register`, `/auth/register` | tab | ✓ | ✓ | ✓ | wizard | ✓ | unrouted | ✓ |
| Forgot Password | `/forgot-password` | ✓ | ✓ | dialog | ✓ | stub | — | unrouted | ✓ |
| Reset Password | `/reset-password` | ✓ | ✓ | — | ✓ | stub | — | unrouted | ✓ |
| Pending Approval | `/pending-approval` | — | ✓ | — | — | — | — | unrouted | — |
| Staff Login | `/staff/login` | — | ✓ | — | — | — | — | — | — |
| Onboarding (per role) | `/onboarding/*` | ✓ | ✓ | — | ✓ | ✓ | ✓ | — | SlideOver |
| Demo Home | `/` | — | — | — | — | — | — | ✓ | — |
| Admin Login | `/admin-login` | — | — | — | — | ✓ | ghost | — | — |

## Module 3 — Stockist Screens

| Screen | Route pattern | ERP | HUB | MED | MR | MVP | DSW | DMVP | SP |
|--------|---------------|-----|-----|-----|-----|-----|-----|------|-----|
| Dashboard / Home | `/stockist/home`, `/stockist`, `/dashboard` | ✓ | ✓ | ✓ | seller | ✓ | ✓ | ✓ | ✓ |
| Products / Inventory | `/stockist/products`, `/products` | ✓ | ✓ | ✓ | my-products | ✓ | ✓ | ✓ | ✓ |
| Product Add | `/products/add` | dialog | page | page | form | page | dialog | page | modal |
| Product Edit | `/products/edit/:id` | dialog | page | page | form | page | dialog | page | modal |
| Product Detail | `/products/:id` | inline | page | — | — | page | page | wrapper | page |
| Orders List | `/stockist/orders`, `/orders` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Order Detail | `/orders/:id` | ✓ | ✓ | ✓ | dialog | ✓ | ✓ | ✓ | ✓ |
| Create Order | `/order-creation`, `/orders/create` | ✓ | ✓ | — | form | ✓ | ✓ | ✓ | ✓ |
| Pharmacies / Circle | `/pharmacies` | ✓ | ✓ | ✓(MR) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Pharmacy Detail | `/pharmacies/:id` | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ | ✓ |
| Find Pharmacy | `/pharmacies/find` | — | ✓ | — | — | ✓ | dialog | ✓ | — |
| Payments | `/payments` | ✓ | ✓ | ✓ | ✓ | stub | toast | ✓ | ✓ |
| Payment Approvals | `/payment-approvals` | ✓ | — | — | — | — | toast | — | — |
| Bills / Bill History | `/bills`, `/bill-history` | dialog | ✓ | — | form | — | dialog | ✓ | ✓ |
| Returns | `/returns` | — | ✓ | — | — | — | dialog | ✓ | ✓ |
| Credit Notes | `/credit-notes` | — | ✓ | — | — | — | — | — | — |
| Analytics | `/analytics` | ✓ | ✓ | — | ✓ | ✓ | — | — | reports |
| Reports | `/reports/*` | — | ✓ | — | ✓ | — | — | — | ✓ |
| Delivery Settings | `/delivery-settings`, `/delivery-dates` | ✓ | ✓ | ✓ | planner | ✓ | — | ✓ | — |
| Delivery Routes | `/delivery-routes` | route-exec | ✓ | — | — | — | — | ✓ | — |
| Serviceable Areas | `/serviceable-areas` | in settings | ✓ | — | — | — | — | ✓ | — |
| Staff Management | `/staff` | — | ✓ | — | — | — | — | — | settings |
| Batch Management | `/batch-management` | — | ✓ | — | — | page | — | ✓ | in product |
| Expiry Management | `/expiry-management` | — | ✓ | — | — | page | — | ✓ | alerts |
| Stock Transfer | `/stock-transfer` | — | ✓ | — | — | — | — | ✓ | — |
| Bulk Bill | `/bulk-bill` | — | ✓ | — | — | — | — | — | — |
| Manufacturer Returns | `/manufacturer-returns` | — | ✓ | — | — | — | — | — | — |
| Suppliers | `/suppliers` | — | — | — | my-suppliers | — | — | — | ✓ |
| Purchase Bills | `/purchase-bills` | — | bill-hist | — | — | page | — | — | ✓ |
| Required Stock | `/required-stock` | — | — | — | — | — | — | — | ✓ |
| Route Execution | `/route-execution` | ✓ | — | — | — | — | — | — | — |
| Pharmacy Approvals | `/pharmacy-approvals` | ✓ | — | — | — | — | — | — | — |
| Batch Ordering | `/batch-ordering` | ✓ | — | — | — | — | — | — | — |
| Profile / Settings | `/profile`, `/settings` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Export / Export Catalogue | `/export`, `/export-catalogue` | dialog | ✓ | — | — | — | — | — | CSV |

## Module 4 — Pharmacy B2B Screens

| Screen | Route pattern | ERP | HUB | MED | MR | MVP | DSW | DMVP | SP |
|--------|---------------|-----|-----|-----|-----|-----|-----|------|-----|
| Dashboard | `/pharmacy`, `/pharmacy/portal` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Browse Stockists | `/stockists`, `/browse` | ✓ | ✓ | ✓ | marketplace | ✓ | ✓ | ✓ | discover |
| Stockist Catalogue | `/stockists/:id` | ✓ | ✓ | ✓ | seller/:id | ✓ | ✓ | ✓ | — |
| Cart | `/cart` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Checkout | `/checkout` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Orders (B2B) | `/orders` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | purchase-orders |
| Order Detail | `/orders/:id` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Smart Order | `/smart-order` | — | partial | ✓ | — | — | dialog | — | — |
| Inventory | `/inventory`, `/products` | ✓ | ✓ | — | — | ✓ | ✓ | ✓ | ✓ |
| GRN | `/grn` | — | — | — | — | — | — | — | ✓ |
| Ledger (per stockist) | `/ledger/:id` | — | ✓ | — | — | — | — | ✓ | payable-bills |
| Quick Order | `/orders/quick` | — | ✓ | — | — | — | — | ✓ | — |
| Recurring Orders | `/recurring-orders` | — | ✓ | — | — | — | — | — | — |
| Bulk Import | `/bulk-import` | — | ✓ | bulk-upload | — | bulk | — | — | — |

## Module 5 — Pharmacy B2C / Sale Screens

| Screen | Route pattern | HUB | DSW | SP |
|--------|----------|-----|-----|-----|
| Sale Dashboard | `/pharmacy` (sale mode) | ✓ | ✓ | — |
| POS | `/pos` | — | — | ✓ |
| Customer Orders | `/customer-orders` | ✓ | sale/orders | — |
| Customer List | `/customer-list` | ✓ | — | customers |
| Customer Returns | `/customer-returns` | ✓ | — | — |
| B2C Bills | `/b2c-bills` | ✓ | — | sales |
| Commissions | `/commissions` | ✓ | — | — |
| Consultations (settings) | `/consultations` | ✓ | sale/consult | — |
| Doctors (partnerships) | `/doctors` | ✓ | — | — |

## Module 6 — Public Catalogue Screens

| Screen | Route | ERP | SP |
|--------|-------|-----|-----|
| License Verification | `/catalogue/:slug` | ✓ | partial |
| Catalogue Dashboard | `/catalogue/:slug/dashboard` | ✓ | — |
| Products | `/catalogue/:slug/products` | ✓ | API |
| Orders | `/catalogue/:slug/orders` | ✓ | — |
| Checkout | `/catalogue/:slug/checkout` | ✓ | — |
| Bill Verification | `/verify-bill/:billId` | — | ✓ |
| Pharmacy Registration (public) | `/pharmacy-registration` | ✓ | — |

## Module 7 — MR / Seller Variant Screens

| Screen | Route | ERP | MR |
|--------|-------|-----|-----|
| MR Dashboard | `/mr/dashboard` | ✓ | ✓ |
| MR Pharmacies (visits) | `/mr/pharmacies` | ✓ | ✓ |
| Collections | `/mr/collections` | ✓ | — |
| My Products (seller catalogue) | `/my-products` | — | ✓ |
| Marketplace Browse | `/marketplace` | — | ✓ |
| OTC Partnership | `/otc-partnership` | — | ✓ |
| Bill Form | `/bills/new` | — | ✓ |
| Delivery Planner | `/delivery-planner` | — | ✓ |

## Module 8 — Patient / Customer Screens

| Screen | Route | ERP | HUB | DSW |
|--------|-------|-----|-----|-----|
| Dashboard | `/customer/dashboard`, `/patient/dashboard` | ✓ | ✓ | ✓ |
| Search | `/search` | ✓ | ✓ | ✓ |
| Pharmacies | `/pharmacies` | — | ✓ | ✓ |
| Cart | `/cart` | — | ✓ | ✓ |
| Checkout | `/checkout` | ✓ | ✓ | ✓ |
| Orders | `/orders` | ✓ | ✓ | ✓ |
| Order Track | `/orders/:id/track` | — | ✓ | — |
| Order Review | `/orders/:id/review` | — | ✓ | — |
| Order Return | `/orders/:id/return` | — | ✓ | — |
| Prescriptions | `/prescriptions` | ✓ | ✓ | ✓ |
| Upload Prescription | `/upload-prescription` | — | ✓ | — |
| Consultations | `/consultations` | — | ✓ | ✓ |
| Book Consultation | `/consultations/book` | — | ✓ | dialog |
| Addresses | `/addresses` | — | ✓ | ✓ |
| Reminders | `/reminders` | — | ✓ | ✓ |
| Wishlist | `/wishlist` | ✓ | ✓ | ✓ |
| Health Profile | `/health-profile` | — | ✓ | — |
| Past Doctors | `/past-doctors` | — | ✓ | — |
| Compare Prices | `/compare` | ✓ | — | dialog |
| AI Assistant | `/ai-assistant` | ✓ | — | — |

## Module 9 — Doctor Screens

| Screen | Route | ERP | HUB | DSW |
|--------|-------|-----|-----|-----|
| Dashboard | `/doctor` | partial | ✓ | ✓ |
| Consultations | `/consultations` | — | ✓ | ✓ |
| Consultation Detail | `/consultations/:id` | — | ✓ | ✓ |
| Patients | `/patients` | — | ✓ | ✓ |
| Write Prescription | `/prescriptions/write` | — | ✓ | dialog |
| Prescription Templates | `/prescription-templates` | — | ✓ | — |
| Availability | `/availability` | — | ✓ | ✓ |
| Earnings | `/earnings` | — | ✓ | ✓ |
| Pharmacies (partnerships) | `/pharmacies` | — | ✓ | — |
| Analytics | `/analytics` | — | ✓ | — |

## Module 10 — Brand Screens

| Screen | Route | ERP |
|--------|-------|-----|
| Dashboard | `/brand/dashboard` | ✓ |
| Products | `/brand/products` | ✓ |
| Campaigns | `/brand/campaigns` | ✓ |
| Analytics | `/brand/analytics` | ✓ |
| Fulfilment | `/brand/fulfilment` | ✓ |
| Profile | `/brand/profile` | ✓ |

## Module 11 — Delivery Staff Screens

| Screen | Route | ERP | HUB |
|--------|-------|-----|-----|
| Staff Login | `/staff/login` | — | ✓ |
| Staff Dashboard | `/staff` | — | ✓ |
| Route Execution | `/stockist/route-execution` | ✓ | — |

## Module 12 — Admin Screens

| Screen | Route | ERP | HUB | MR | MVP | DSW | DMVP | SP |
|--------|-------|-----|-----|-----|-----|-----|------|-----|
| Dashboard | `/admin` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | tenant |
| Users | `/admin/users` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Approvals | `/admin/pharmacy-approvals`, entity lists | ✓ | ✓ | — | ✓ | ✓ | ✓ | — |
| Orders (B2B+B2C) | `/admin/orders`, `/admin/customer-orders` | — | ✓ | — | — | — | — | — |
| Consultations | `/admin/consultations` | — | ✓ | — | — | — | — | — |
| Returns / Refunds | `/admin/returns`, `/admin/refunds` | — | ✓ | — | — | — | — | — |
| Analytics | `/admin/analytics` | ✓ | ✓ | — | ✓ | ✓ | ✓ | reports |
| Counterfeit | `/admin/counterfeit` | — | ✓ | — | — | — | — | — |
| Audit Trail / Logs | `/admin/audit-logs`, `/admin/audit-trail` | ✓ | ✓ | role-audit | ✓ | ✓ | ✓ | ✓ |
| Recalls | `/admin/recalls` | ✓ | — | — | — | — | — | — |
| Notices | `/admin/notices` | ✓ | — | — | — | — | — | — |
| Disputes | `/admin/disputes` | ✓ | — | — | — | — | — | — |
| Drug Schedules | `/admin/drug-schedules` | — | ✓ | — | — | — | — | — |
| Serviceable Areas | `/admin/serviceable-areas` | territories | ✓ | — | — | — | — | — |
| System Architecture (Flowboard) | `/admin/system-architecture` | — | ✓ | — | user-flow | — | — | — |
| Maintenance / ToS | `/admin/maintenance`, `/admin/tos-management` | — | ✓ | — | — | — | — | — |
| Impersonate / Force Reset | `/admin/impersonate`, `/admin/force-reset` | — | ✓ | — | — | — | — | — |
| Geo Distribution | `/admin/geo-distribution` | — | ✓ | — | — | — | — | — |
| API Monitoring | `/admin/api-monitoring` | — | ✓ | — | — | — | — | — |

---

# PART C — MODALS, DIALOGS, SHEETS (By App)

## ERP — 20 Dialogs
QuickOrderDialog, QuickBillDialog, OCRScanDialog, BulkUploadDialog, BillUploadDialog, MapRouteDialog, KPIDetailDialog, ExportDataDialog, EditOrderDialog, AddProductDialog, EditProductDialog, ProductScanDialog, QuickUpdateStockDialog, AddPharmacyDialog, EditPharmacyDialog, PharmacySelectDialog, OrderItemsDialog, PaymentLinkDialog, OrderConfirmationDialog, MarkPaymentDialog

## HUB — Key Overlays
QuickBillDialog, EditPharmacyDialog, CollectPaymentDialog, BillPreviewDialog, BulkUploadCatalogue, BulkUploadPurchaseBill, BatchManager, ProductForm, ToSDialog + ~30 inline dialogs in StockistOrderDetail

## MED — Key Overlays
MarginSettingsModal, inline Forgot Password AlertDialog

## MR — 8 Modals
QuickOrderModal, QuickBillModal, OCRUploadModal, BulkUploadModal, PaymentProcessModal, ProductDetailModal, UpdateBillModal, MarginSettingsModal

## MVP — Key Overlays
EditProfileModal + registration wizard steps

## DSW — 40+ Dialogs
Stockist: QuickOrder, QuickBill, OCRScan, MapRoute, AddProduct, EditProduct, CollectPayment, CreateReturn, etc.  
Pharmacy: SmartOrder, Checkout, ApplyCoupon, ComparePrices, SaleOrder, StartConsultation, RecordPatient, GoLive  
Patient: UploadPrescription, BookConsultation  
Doctor: WritePrescription

## SP — 27 Modals + SlideOver
AddProductModal, EditProductModal, AdjustStockModal, BulkPriceEditModal, AddPharmacyModal, EditPharmacyModal, ApprovePharmacyOrderModal, RejectPharmacyOrderModal, ShipOrderModal, RecordDeliveryModal, GenerateBillModal, InitiateReturnModal, RecordPaymentModal, UploadBillModal, EditPurchaseModal, SetSaleRatesModal, AddSupplierModal, EditSupplierModal, RecordSupplierPaymentModal, AddUserModal, ApproveConnectionModal, RejectConnectionModal, ConnectStockistModal, ReceiveGrnModal, InitiateStockistReturnModal, PharmacyAddUserModal, AuditDetailModal, ConfirmDialog, OnboardingFlow (SlideOver), PharmacyOnboardingFlow (SlideOver)

---

# PART D — USER JOURNEY MAPS

## Journey 1: New Stockist Onboarding → First Sale
```
Register (HUB 5-step / SP single form / ERP signup tab)
  → Pending approval (HUB) or immediate access
  → Onboarding wizard (add pharmacy, import products, add staff)
  → Dashboard
  → Add products (manual / bulk / OCR)
  → Add pharmacy to circle (manual / find / portal connection)
  → Create order (manual / quick order / WhatsApp paste)
  → Pack → Dispatch → Deliver
  → Generate bill → Record payment
```

## Journey 2: Pharmacy Restocks from Stockist
```
Login → Dashboard
  → Browse stockists / view connected stockist catalogue
  → Add to cart (or Smart Order paste → 3 recommendations)
  → Checkout (credit check)
  → Order placed (pending)
  → Track order status
  → Receive delivery → GRN (SP) or auto-inventory (HUB)
  → View ledger / pay bill
```

## Journey 3: Customer Orders Medicines (B2C)
```
Register as customer (HUB 3-step, auto-approved)
  → Search/browse pharmacy
  → Add to cart (Rx items flagged)
  → Upload prescription if needed
  → Checkout (address, UPI/COD)
  → Pharmacy receives order
  → Pharmacy verifies Rx → prices → prepares
  → Delivery → customer tracks
  → Review / return if needed
```

## Journey 4: Doctor Consultation → Prescription → Order
```
Doctor registers (5-step) → pending approval
  → Set availability & fees
  → Customer books consultation
  → Doctor conducts (audio/video/clinic)
  → Write prescription
  → Customer orders medicines from partnered pharmacy
  → Pharmacy fulfills → doctor earns commission
```

## Journey 5: MR Field Sales
```
MR registers with brand + documents
  → Visit pharmacy (record visit)
  → Create bill with credit terms
  → Send payment link (UPI)
  → Track collections
  → Manage own product catalogue (brand-locked)
```

## Journey 6: Admin Governance
```
Admin login (hidden reveal or dedicated page)
  → Review pending registrations (bulk approve/reject)
  → Monitor orders (B2B + B2C)
  → Handle returns/refunds
  → Counterfeit alerts
  → Configure drug schedules, categories, serviceable areas
  → View analytics, audit trail, system architecture
```

## Journey 7: SP Full-Stack B2B (Stockist + Pharmacy tenants)
```
Stockist registers → onboarding (pharmacy, products, staff)
  → Pharmacy registers separately → connects via invite code
  → Pharmacy browses stockist catalog → submits PO
  → Stockist approves → packs (FEFO) → ships → delivers
  → Bill generated (GST, ledger posted)
  → Pharmacy records payable payment
  → Optional: pharmacy POS retail sale to walk-in customer
```

---

# PART E — WHERE TO FIND FULL DEFINITIONS

| Need | Go to |
|------|-------|
| Merged superset by module | `UNIFIED_FEATURES.md` → Part I, Modules 1–19 |
| Every field in a specific app's login form | `UNIFIED_FEATURES.md` → Appendix A–H, §1 Auth |
| Per-repo complete review | `UNIFIED_FEATURES.md` Appendices A–H |
| HUB user flow narratives | `digi-swasthya-hub/docs/user-flows-*.md` |
| ERP single-app deep doc | `stockpharmaerp/APPLICATION_OVERVIEW.md` |
| HUB architecture nodes | `digi-swasthya-hub/supabase/functions/flowboard-data/index.ts` |
| SP server business rules | `STOCKIST-PHARMACY/server/src/services/*.ts` |
| Re-run full review | `EXHAUSTIVE_REVIEW_PROMPT.md` |

---

*Index generated from code-derived reviews in UNIFIED_FEATURES.md. For field-level definitions, validation rules, formulas, and edge cases, always consult the full module sections and per-repo appendices.*
