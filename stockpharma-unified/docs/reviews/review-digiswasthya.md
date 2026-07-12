> **Extracted from** [`UNIFIED_FEATURES.md`](../UNIFIED_FEATURES.md) Appendix F (DSW).
> **Source repo:** `digiswasthya (DSW)`
> Use [`EXHAUSTIVE_REVIEW_PROMPT.md`](../EXHAUSTIVE_REVIEW_PROMPT.md) to re-run or extend this review.

# Digi Swasthya — Exhaustive Functional Review

> **App:** `/Users/kshipradewat/Desktop/stockpharma/digiswasthya`
> **Type:** Front-end-only PWA prototype. Vite 5 + React 18 + TS, shadcn/ui (Radix) + Tailwind (**Lexend** font), React Router v6, TanStack Query (mounted, unused), Recharts, react-hook-form + Zod (installed, effectively unused for validation), lucide-react, vite-plugin-pwa. **No backend, no auth, no persistence** except one `localStorage` flag.
> This review is derived by reading `src/App.tsx`, all layouts/contexts, every `src/data/**` module, and every page + dialog under `src/pages/**` and `src/components/**`. It goes beyond the repo's `FEATURES.md`: exact fields, KPI formulas, table columns, tab labels, stub behaviors, and — importantly — a large set of **broken/dead navigation links** not documented before.

---

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

## 2. NAVIGATION & LAYOUT SHELLS

- **`BottomNav`** — fixed 5-tab bar; active class `text-primary` (via `NavLink activeClassName`).
- **`TopNav`** (shared; only used by StockistLayout) — brand "DS" + name/subtitle derived from route prefix via `getPortalInfo`. **Hardcoded** message badge `2`, notification badge `3`; avatar = fixed Unsplash URL. Buttons → `{base}/messages`, `{base}/notifications`, `{base}/settings/profile`.
- **`PharmacyTopNav`** — view-aware: green (success) in Sale, purple (primary) in Purchase; label "Sale View"/"Purchase View". Badges from `getUnreadMessageCount()` (=2, sum of `messages.unreadCount`) and `getUnreadNotificationCount()` (=2). Avatar dropdown: "HealthPlus Pharmacy" + "Switch to Sale/Purchase View" (calls `switchToSale`/`switchToPurchase`), Profile Settings, Business Details.
- **`PatientTopNav`** — brand "Patient Portal"; message→`/patient/messages` (404), bell (hardcoded `3`)→`/patient/notifications` (404); dropdown "Rahul Sharma / +91 98765 43210" → profile, orders, consultations, Logout→/auth.
- **`DoctorTopNav`** — brand "Doctor Portal"; message (hardcoded `2`)→`/doctor/messages` (404), bell (hardcoded `5`)→`/doctor/notifications` (404); dropdown "Dr. Arun Sharma / General Physician" → profile, availability, earnings, Logout→/auth.
- **`AdminLayout`** — desktop fixed sidebar (w-64) + mobile drawer; 11 items. **Hardcoded badges**: Stockists `3`, Pharmacies `5`, Doctors `4`. Header bell badge **hardcoded `12`**. Sidebar footer "Admin User / admin@digiswasthya.com" + Logout→/auth.
- **Bottom-nav item sets:** Stockist `Home·Pharmacies·Products·Orders·More`; Pharmacy-Purchase `Home·Browse·Cart·Orders·More`; Pharmacy-Sale `Dashboard·Inventory·Customers·Consults·More`; Patient `Home·Search·Rx·Orders·More`; Doctor `Dashboard·Appointments·Patients·Rx·More`.
- **PharmacyViewContext:** `ViewMode='purchase'|'sale'` default `'purchase'`; `switchToPurchase()`→`/pharmacy/home`, `switchToSale()`→`/pharmacy/sale/dashboard`. **Mounted twice** (once inside `PharmacyLayout`, once wrapping `PharmacySaleLayout` in the router) — two independent provider instances; state never carries across; switching is purely navigation.

---

## 3. STOCKIST MODULE

Data: `src/data/stockist-mock-data.ts` — `mockAllPharmacies`(20, ph-001…020), `mockPharmacyCircle`(8 active), `mockProducts`(10), `mockIncomingOrders`(5, all status 'new'), `mockOrders`(6), `mockPayments`(5), `mockNotices`(3), `mockNotifications`(5). `mockPharmacies = getCirclePharmacies()` (8). Key helpers: `getLowStockProducts` (`stockQuantity <= minStock` → returns prod-002,004,007,009 = 4 items), `getActiveOrders` (status not delivered/cancelled), `getDeliveredOrders`, `getNewIncomingOrders`, `getPendingPayments` (status 'pending' → pay-001,003 = 2), `getTotalOutstanding` (Σ `p.outstanding` across all 20 = large), `getTotalCredits` (Σ creditBalance), `getTodaysRevenue` (today-filtered → 0 at runtime).

### 3.1 Home (`/stockist/home` — `StockistHome`)
- **GuidedTour** auto-shows after 500ms unless `localStorage['stockist_tour_completed']` set (the app's only real persistence). Tour = 5 steps (Quick Actions, Financial Summary, Payment Approvals, Bottom Navigation, Profile & Settings), progress dots, Skip/Back/Next, "Get Started" on last; completing/skipping sets the localStorage flag.
- **New Orders banner** (if `newIncomingOrders.length>0`): pulsing bell, "{n} New Order(s) Waiting", whole card → `/stockist/orders`.
- **Incoming Orders section**: first 2 `IncomingOrderCard` with onAccept/onDecline/onView → open AcceptOrderDialog/DeclineOrderDialog.
- **KPI cards (2):** Financial (Outstanding=`getTotalOutstanding()` red, Credits=`getTotalCredits()` green, **Today's Collection = `45000` hardcoded** bold); Operations (Active Orders=`activeOrders.length`, Out for Delivery=`activeOrders.filter(status==='out-for-delivery').length`, Pending Approvals badge=`pendingPayments.length`).
- **Quick Actions (4):** Record Order→`/stockist/orders/create`; Generate Bill→`QuickBillDialog`; Collect→`/stockist/payments`; Routes→`/stockist/routes`.
- **Payment Approvals** (if pending): first 2 `PaymentApprovalCard`; all callbacks open `PaymentApprovalDialog` (approve/reject/hold all **toast-only**).
- **Today's Deliveries** (if any out-for-delivery): up to 3 order rows → `/stockist/orders/:id`.
- **Low Stock Alert** (if any): first 3 → `/stockist/products/:id`.

### 3.2 Pharmacies (`/stockist/pharmacies` — `StockistPharmacies`)
- Sticky search (name/ownerName/phone) + "Find" button (→`SearchPharmacyDialog`).
- Tabs: **Circle** (`My Circle (8)`) / **All** (`All (20)`). All-tab shows only helper text + "Search All Pharmacies" button + two count cards (In Circle 8 / Total 20) — **no list**.
- Circle filter chips w/ live counts: all / outstanding (`outstandingBalance>0`) / credit (`creditBalance>0`) / no-dues (`netDue = outstandingBalance - creditBalance <= 0`).
- `PharmacyCard` per pharmacy with onView→detail, onEdit→EditPharmacyDialog, onQuickOrder→QuickOrderDialog, onQuickBill→QuickBillDialog, onDelete→ConfirmDeleteDialog. Empty state via `EmptyState`.
- ConfirmDelete `onConfirm` = toast only (array unchanged).

### 3.3 Pharmacy Detail (`/stockist/pharmacies/:id` — `PharmacyDetail`)
- `getPharmacyById`; if none → EmptyState "Pharmacy not found".
- Contact card: phone + Copy (clipboard, wired), Call (`tel:` wired); address + Open Map (`maps.google.com`, wired).
- Credit Usage: `creditUsage = outstandingBalance/creditLimit*100`, Progress bar (`>80` destructive, `>60` warning, else success), clamped `Math.min(...,100)`. Grid: Outstanding / Credit / Net Due (`netDue=outstandingBalance-creditBalance`, shows abs + " CR" if negative).
- "Collect Payment" button (if outstanding>0) → CollectPaymentDialog. Quick Actions: Record Order→create, Generate Bill→QuickBillDialog.
- Tabs: **Orders** (filtered `mockOrders` by pharmacyId, `OrderCard`s), **Payments** (filtered `mockPayments`, method badge + StatusBadge), **Ledger** (**page-local hardcoded `mockLedgerEntries` (5 rows)**, columns Date/Description/Debit/Credit/Balance — unrelated to the pharmacy).
- Danger zone "Remove from Circle" → ConfirmDelete → `handleRemoveFromCircle` = toast + navigate (stub).

### 3.4 Products (`/stockist/products` — `StockistProducts`)
- 2×2 Quick Actions cards: Scan Product (ScanProductDialog), Bulk Upload (BulkUploadDialog), **AI Enhance** (`handleAIEnhance` = two staggered `setTimeout` toasts — stub), Add Items Quick (AddProductDialog).
- Collapsible **Low Stock Alert** (default collapsed; count badge; horizontal chips → detail). Collapsible **Top Selling** (`topSellingProducts = mockProducts.slice(0,4)` — first four, NOT the `isTopSelling` helper; images from 4 hardcoded Unsplash `medImages` cycled by index).
- Sticky search (name/brand/manufacturer) + two Selects: **Stock filter** (all/in-stock/low-stock/out-of-stock) and **Sort** (name→localeCompare, price→salePrice desc, stock→qty asc, expiry→date asc — all real).
- `getStockStatus`: 0→out-of-stock; `<=minStock`→low-stock; else in-stock. `isExpiringSoon = expiryDate <= now+90d`.
- Product grid cards: image (cycled), StatusBadge, edit dropdown (View/Edit/Add Stock), MRP strike + salePrice, stock, expiry Badge (warning if soon else success), Edit/+Stock buttons.

### 3.5 Product Detail (`/stockist/products/:id` — `ProductDetail`)
- `getProductById`; else EmptyState. `margin = ((mrp-salePrice)/mrp*100).toFixed(1)`.
- **`regulatoryInfo` derived from category** (Antibiotics→schedule "H", Vitamins→"OTC", else "H1"; drugType "Allopathic"; composition = first two words of name; **packSize hardcoded "10 tablets"**; fssaiLicense only for Vitamins = "10720066000123"; requiresPrescription = category not Vitamins/OTC). This ignores the product's own `drugSchedule/composition/rxRequired` fields in the data.
- Cards: Pricing (MRP/Sale/Margin), Stock Info (Current/Min + "Add Stock Now" if not in-stock), Regulatory Info, Batch Details (batchNumber, expiry Badge, HSN, GST rate = real `product.gstRate`), Manufacturer, **Sales History LineChart = 6 hardcoded weekly points** (`salesHistoryData` W1–W6). Images = 2 hardcoded URLs. Dialogs: AddStock, EditProduct.

### 3.6 Orders (`/stockist/orders` — `StockistOrders`)
- Sticky search (orderNumber/pharmacyName) + "Record" dropdown → only "Record Order (Phone/Walk-in)" → `/stockist/orders/create`.
- Tabs w/ live counts + icons: **new** (`getNewIncomingOrders` = 5; badge pulses), **active** (`getActiveOrders`), **delivered**, **all** (`mockOrders.length`=6). New tab renders `IncomingOrderCard`s (Accept/Decline dialogs → toast-only). Others render `OrderCard`s → detail / UpdateStatus / SharePaymentLink. Each tab has its own EmptyState.

### 3.7 Order Detail (`/stockist/orders/:id` — `OrderDetail`)
- `getOrderById` + `getPharmacyById`; else EmptyState. Header shows orderNumber + StatusBadge (from local `currentStatus`) + created datetime; Print (`window.print()` + toast), Share (→SharePaymentLinkDialog), Edit (→EditOrderItemsDialog).
- Pharmacy card (name/owner/phone/address, View→detail).
- **Order Items + totals:** `subtotal = Σ(rate*quantity)`; **`gstAmount = subtotal*0.18` (hardcoded 18%, ignores per-product gstRate of 5/12)**; Total shows `order.totalAmount` (the mock's pre-computed value, which used per-product GST — so displayed subtotal+GST(18%) will NOT equal displayed Total).
- Payment card: `paidAmount = Σ approved payments`, `pendingAmount = totalAmount - paidAmount`, paid/pending tiles, payment history rows, "Add Payment" (if pending) → AddPaymentDialog.
- **Delivery Status:** 6-option RadioGroup (pending/confirmed/processing/out-for-delivery/delivered/cancelled) with icons/colors. `isTerminalStatus` (delivered/cancelled) disables the other options. `handleStatusChange` = local state + toast (no persistence). "cancelled" shows a note.

### 3.8 Create Order (`/stockist/orders/create` — `CreateOrder`) — "AI Parsing"
- Select pharmacy (`mockPharmacies` = circle 8). Paste textarea (badge "AI Parsing" w/ Sparkles — cosmetic). `handleParseOrder`: split lines, regex `/^(.+?)\s+(\d+)\s*$/`, fuzzy substring match against `mockProducts`. Each ParsedItem: matched product (rate=salePrice) or unmatched (rate 0, with a "Match product…" Select). Editable qty (recomputes amount), remove.
- Status badges: {matched} Matched / {unmatched} Unmatched. Fixed bottom summary (shown when matched>0): `subtotal = Σ matched amount`; **`gst = subtotal*0.18`**; `total = subtotal+gst`. `handleCreateOrder` (needs pharmacy + ≥1 matched) = toast + `navigate('/stockist/orders')` (no persistence).

### 3.9 Create Bill (`/stockist/bills/create` — `CreateBill`)
- 3 stages: select → preview → success. Select pharmacy (mockPharmacies) → unpaid orders (`paymentStatus !== 'paid'`) with checkboxes + Select/Deselect All; discount (percent|fixed). Totals use **real per-order fields**: `selectedOrdersTotal = Σ totalAmount`, `selectedOrdersGst = Σ gstAmount`, `selectedOrdersSubtotal = Σ subtotal`; `discountAmount` = %·total or fixed; `finalAmount = total - discount`. `billNumber = BILL-${Date.now().slice(-8)}`.
- Preview: printable bill (header GSTIN **hardcoded `27AABCU9603R1ZM`**, "MedKart Distribution"). Success: share options.
- Actions: **`handleShareWhatsApp` opens a real `wa.me` URL (wired)**. Print/Download/CopyLink = toast/clipboard stubs.

### 3.10 Payments (`/stockist/payments` — `StockistPayments`)
- KPI card (3): Outstanding=`getTotalOutstanding()`, Pending=`getPendingPayments().length`, **Received = Σ approved payment amounts** (labeled "Received", uses ` approvedThisMonth`).
- Sticky search (pharmacyName/orderNumber) + "Send Reminder" (→SendReminderDialog) + pharmacy filter Select.
- Tabs: **Outstanding** (`mockOrders` where `paymentStatus !== 'paid'`; per-row `pendingAmount = totalAmount - paidAmount`; "Remind" toast-only), **Pending Approvals** (`mockPayments` status 'pending'; View Screenshot; **Approve/Hold/Reject all toast-only**, incl. quick-approve), **All Payments** (all filtered payments read-only).

### 3.11 Analytics (`/stockist/analytics` — `StockistAnalytics`)
- Date-range Select (today/week/month/quarter/year) — **does nothing**.
- KPIs: Total Revenue = `Σ delivered totalAmount` (real); Total Orders = `mockOrders.length` (real); Active Pharmacies = `mockPharmacies.length` (real); **Collection Rate = `(totalRevenue/(totalRevenue*1.2))*100 = 83.3%` (meaningless)**. Growth deltas **hardcoded** (+12.5% / +8.3% / +2 / −2.1%).
- Charts: `revenueData` (6-mo hardcoded LineChart), `orderStatusData` (hardcoded pie 45/12/8/3), `categoryData` (hardcoded bar). Top Pharmacies (real: top 5 by Σ order value), Top Products (real: `isTopSelling` sorted by salesCount, top 5).

### 3.12 Operational pages (page-local mock arrays; writes are stubs unless noted)
| Page | Route | Data | Status vocab | Key logic / notes |
|---|---|---|---|---|
| **Credit Notes** | `/stockist/credit-notes` | local `mockCreditNotes`(3) | pending/approved/processed/rejected | Summary: total, pending count, processed count, `totalPending=Σ pending totalAmount`. New/Approve/Reject toast-only. |
| **Delivery Routes** | `/stockist/routes` | local `mockRoutes`(3) + `mockPharmacies` stops | planned/in-progress/completed | "Today's Routes" = date `=== '2026-01-27'` (hardcoded); past routes else. Call staff (`tel:`) wired; Create Route toast. Per-stop completed via `index < completedCount`. |
| **Expiry Mgmt** | `/stockist/expiry` | `mockProducts` computed | expired/≤30/≤60/≤90 buckets | `getDaysToExpiry`; filter pills 30/60/90/180d; `totalValue = Σ(salePrice*stockQuantity)` for filtered; Return toast; Write-off (only if daysToExpiry≤0) toast. |
| **Purchase Orders** | `/stockist/purchases` | local `mockPurchaseOrders`(4) | draft/ordered/partial/received/cancelled | `pendingValue = Σ (ordered+partial) totalAmount`; Receive Stock / Send to Supplier / Create toast. |
| **Staff Mgmt** | `/stockist/staff` | local `mockStaff`(4) | active/on-leave/inactive | 3 stat cards; Call (`tel:`) wired; Add/Edit toast. |
| **Reports** | `/stockist/reports` | local `reportTypes`(6) | h1/hnx/gst/sales | Month/Year/Type Selects; Download = `setTimeout(2000)` toast (simulated); per-report type Badge. |
| **Documents** | `/stockist/documents` | local `useState(mockDocuments)`(4) | license/gst/invoice/other | Category chips; **Upload (via UploadDocumentDialog) & Delete mutate local state (real)**; Download/View stubs (DocumentPreviewDialog is a placeholder viewer). |
| **Notifications** | `/stockist/notifications` | local `useState`(5) | order/payment/alert/system | Filter chips; **mark-read / mark-all / delete real (local)**; Settings panel (4 Switches, local); ₹ amounts hardcoded in messages. |
| **Messages** | `/stockist/messages` | local `mockTickets`(3) + chat | open/pending/resolved | Ticket list + chat view; **send message real (local)**; bot auto-reply after 1.5s from random `adminResponses`(7); typing indicator. |
| **Help** | `/stockist/help` | local `faqs`(8) + `tutorials`(4) | — | Search filters FAQs (question+answer); Accordion; Chat/Call/Email/Tutorial/FeatureRequest all toast. |

### 3.13 More (`/stockist/more` — `StockistMore`)
- Profile card (`defaultStockistData` businessName/type/phone). Menu sections: Account (Profile, Business Details), Operations (Delivery Routes, Staff, Returns & Credits, Expiry, Purchase Orders), Finance (Payments **badge "3" hardcoded**, Analytics), Communication (Notifications **badge "5" hardcoded**, Support Chat toast), Documents & Security (Documents, Privacy & Security), Reports (Export Data→ExportDialog, Regulatory Reports), Preferences (App Settings, Help Center, **"Replay Welcome Tour"** = `localStorage.removeItem('stockist_tour_completed')` + toast — real). Logout→toast+/auth. Version "Digi Swasthya v1.0.0".

### 3.14 Settings
- **ProfileSettings:** photo (upload = "coming soon" toast). `ownerName` computed oddly as `accountHolderName.split(" ")[0] + " Kumar"` (→ "Rajesh Kumar"). Business info (name, ownerName). Contact info via `VerificationInput` for email & phone (both start "verified"; changing value resets to "unverified"; **OTP verify accepts ANY 6-digit code**). Alternate phone, WhatsApp Business number. Save = toast (validates required present). Change Password (current/new/confirm, show/hide, requires match + ≥8 chars) = toast.
- **BusinessSettings:** Business info + `DocumentUpload`×4 (all `verificationStatus="verified"`, compact) + address + bank details. Save = toast.
- **SecuritySettings:** 2FA Switch (toast), Phone card (**hardcoded `+91 98765 43210` Verified**) + Change Phone dialog (10-digit check → send OTP → verify requires 6 digits → toast). Login Notifications switch. Active Sessions from local `mockSessions`(4) — logout-session/logout-all mutate local array (real). Login History local `loginHistory`(5) (success/blocked). Delete Account dialog → toast.
- **AppSettings:** Theme (light/dark/system buttons; `handleThemeChange` = toast with comment "In a real app, you'd apply the theme here" — **inert**). Language (7 options) & Currency (INR/USD) Selects (local). Notifications (push/email/sms/sound/vibration Switches). Data & Sync (autoSync/wifi-only/offline Switches + "Sync Now" `setTimeout` toast). Default Views (dashboard/order-sort/items-per-page Selects). **Storage: `cacheSize=12.5`, `totalStorage=50` hardcoded**; Clear Cache sets cache to 0.2 + toast. Reset All Settings (local). Version "v1.0.0 (Build 2026.01.27)".

### 3.15 Stockist dialogs (all in `src/components/stockist/dialogs/`) — fields & submit
- **AddProductDialog:** imageUrl, name*, brand*, manufacturer, category*(Select: Analgesics/Antibiotics/Gastrointestinal/Antihistamines/Antidiabetic/Cardiovascular/Vitamins/Other), mrp*, salePrice*, stockQuantity, minStock, batchNumber, expiryDate(date), hsnCode, gstRate(Select 0/5/12/18/28, default 12), drugSchedule(None/H/H1/X/G/J), drugType(Allopathy/Ayurvedic/Homeopathy/Unani), composition, packSize, fssaiLicense, requiresPrescription/isNarcotic checkboxes. Submit requires name/brand/category/mrp/salePrice → toast + reset.
- **EditProductDialog:** prefilled from product; categories list here differs (Tablets/Capsules/Syrups/Injections/Topical/Drops/Other); regulatory fields default blank (not read from product). Submit requires name/mrp/salePrice → toast.
- **AddStockDialog:** quantity* (>0), batchNumber, expiryDate, purchasePrice; shows current stock + computed new level. Toast.
- **QuickBillDialog:** same 3-stage bill flow as CreateBill page (select/preview/success), optional `pharmacyId` prefill. WhatsApp share wired; others stub.
- **QuickOrderDialog:** same regex paste-parse flow as CreateOrder page (GST 18%). Create = toast + reset.
- **CollectPaymentDialog:** amount* (>0), quick-amount buttons (25%/50%/Full of outstanding), method (cash/upi/bank/cheque), reference. "Record Payment" = toast.
- **PaymentApprovalDialog:** review mode (approvalAmount editable, notes) vs reject mode (reason* required). Calls `onApprove/onReject/onHold` (parent toasts).
- **SearchPharmacyDialog:** live search across `mockAllPharmacies` (name/owner/phone, slice 10); "In Circle" badge via `isInCircle`; Add (if not in circle) → onAddToCircle.
- **AddToCircleDialog:** creditLimit (default 50000), paymentTerms (cod/7/15/30days), preferredDay (Mon–Sat/Any), notes. Toast.
- **EditPharmacyDialog:** name*, ownerName*, phone*, email, address, gstNumber(upper), drugLicense(upper), creditLimit. Toast.
- **AcceptOrderDialog:** editable per-item quantities (recomputes amount + `gstAmount*0.12`), delivery date (default tomorrow, min today). Accept → onAccept + toast.
- **DeclineOrderDialog:** reason RadioGroup (out_of_stock/credit_limit/delivery_area/minimum_order/other) + custom message. Decline → onDecline + toast.
- **UpdateStatusDialog:** current-status display + new-status RadioGroup (earlier statuses disabled unless 'cancelled') + note. Update disabled if unchanged → toast.
- **SharePaymentLinkDialog:** shows `paymentLink = pay.digiswasthya.com/{id}` (readonly) + Copy (clipboard) + QR placeholder + WhatsApp (`wa.me` real) + Email (`mailto:` real).
- **EditOrderItemsDialog:** editable qty/rate per item, remove, add product Select; `New Total = Σ qty*rate` with delta vs original. Save (≥1 item) → toast.
- **ExportDialog:** format radios (csv/excel/pdf, default excel), date range (today/week/month/all), data-type checkboxes (Orders✓, Payments✓, Products, Pharmacies). Export = `setTimeout(1500)` toast (simulated).
- **SendReminderDialog:** 5-step (select→customize→message→sending→complete). Select pharmacies with `outstandingBalance>0`; per-pharmacy amount option (25/50/100/custom%) + early-payment-discount toggle+%; message mode common vs individual; priority (high/medium/low); `simulateSending` progress via setInterval; final "WhatsApp messages sent" (simulated). `calculateTotalRequested` sums per-pharmacy %.
- **ScanProductDialog:** camera placeholder; Scan (`setTimeout(1500)` returns a random product) or manual barcode/HSN search; stock adjust +/−; Update Stock = toast. (Simulated OCR/scan.)
- **BulkUploadDialog:** 5-stage (upload→extracting→preview→importing→complete) w/ drag-drop; `mockParsedData`(5 rows, one invalid) shown in editable table (Name/Brand/Price/Stock); inline edit re-validates; Import = simulated progress; Done = toast.
- **UploadDocumentDialog:** file drop (sets `"document.pdf"` on click — fake), documentName* required, documentType (license/gst/invoice/other). `onUpload(name,type)` → parent adds to local docs.
- **DocumentPreviewDialog:** type-specific placeholder preview (image/pdf/excel); Open/Print/Share/Download all toast.
- **ViewScreenshotDialog:** placeholder image + zoom controls (0.5–2×); Download = `console.log`.
- **ConfirmDeleteDialog:** generic AlertDialog; supports custom title/description/confirmLabel or itemType presets (pharmacy/product/order); `onConfirm` or fallback toast.
- **CreateReturnDialog** (orphaned): 3-step (select delivered order → select items+qty+reason → review+notes) → "Submit Credit Note" toast. Reasons: damaged/expired/wrong_product/quality_issue/excess_quantity/customer_return/other.
- **MapRouteDialog** (orphaned): aggregates out-for-delivery/processing orders into stops; map placeholder; Optimize (toast), Copy Route (clipboard), Open Maps (`maps.google.com` real), Start Navigation (toast). `estimatedTime = stops*15min`.
- **BillPreviewDialog** (orphaned): printable bill from passed orders; `window.print()` wired; Share/Download toast. GSTIN hardcoded.

---

## 4. PHARMACY — PURCHASE VIEW

Data: `src/data/pharmacy-mock-data.ts` — `stockists`(8, STK001–008), `products`(15, PROD001–015 each with `stockistPrices[]`), `cartItems`(5), `pharmacyOrders`(6, PO001–006), `offers`(7), `paymentHistory`(4), `messages`(3), `notifications`(4), `savedAddresses`(2), `categories`(14). "Best price" computed inline everywhere via `stockistPrices.reduce(min)`.

### 4.1 Home (`/pharmacy/home` — `PharmacyHome`)
- Read-only search bar → `/pharmacy/browse`.
- Quick Actions: Smart Order→`/pharmacy/orders/smart-create`; Compare→ComparePricesDialog; Reorder→ReorderDialog; Offers→ViewOffersDialog.
- **KPI row all hardcoded** (`kpiData`): Total Spent ₹2,45,000, Savings ₹18,500, Active Orders 3, Delivered 24.
- Active Orders: `getActiveOrders().slice(0,3)` → detail. Your Stockists: `getFavoriteStockists().slice(0,3)` → detail. Active Offers: `offers.slice(0,3)`.

### 4.2 Browse (`/pharmacy/browse` — `PharmacyBrowse`)
- Search Enter → `/pharmacy/browse/products?q=`. Two cards (Browse Stockists `{stockists.length}` / Browse Products `{products.length}+`). Categories grid (`categories.slice(0,8)` → `?category=`). Top Rated Stockists (`rating>=4.5`, slice 3). Popular Products (`products.slice(0,4)`, best price inline).

### 4.3 Stockists list (`/pharmacy/browse/stockists` — `PharmacyStockists`)
- **Not integrated:** page-local hardcoded 4-item `stockists` array (id 1–4, NOT the shared `stockists`). Search Input decorative; cards not clickable. Columns: name, location, rating, deliveryTime, discount, minOrder.

### 4.4 Stockist Detail (`/pharmacy/browse/stockists/:id` — `PharmacyStockistDetail`)
- Real `stockists.find`. Header (rating/reviews, favorite toggle toast-only), quick info grid, stats (maxDiscount, minOrder, free/paid delivery). Actions Contact (ContactStockistDialog) / Start Order (→cart). Active Offers list. Tabs: Products (`products.filter(stockistPrices.some(sp.stockistId===id))`; per-product price = that stockist's price; Add → AddToCartDialog) / **Reviews ("Reviews coming soon")**.

### 4.5 Products (`/pharmacy/browse/products` — `PharmacyProducts`)
- Reads `?category`/`?q`. Sticky search + category chips (`categories.slice(0,6)` + All). `localProducts` state; wishlist toggle local + toast. `getBestPrice` inline; `savings = mrp - bestPrice.price` (computed, not rendered). Cards: 💊 placeholder, Rx badge, category, best price + discount badge, Add→AddToCartDialog, "{n} stockists".

### 4.6 Product Detail (`/pharmacy/browse/products/:id` — `PharmacyProductDetail`)
- Real `products.find`; else "Product not found". Best-price block ("You save ₹{savings}") + Add→AddToCartDialog. Price comparison list per stockist (`isBest = price===bestPrice.price`; In/Out of stock; Add disabled if !inStock). Product Details (composition, description).

### 4.7 Cart (`/pharmacy/cart` — `PharmacyCart`)
- **Not integrated:** page-local hardcoded 3-item array. `total = Σ price*qty`. Clear All, qty +/−, Place Order — **all no-ops** (no handlers). Fixed bottom Total + "Place Order".

### 4.8 Checkout (`/pharmacy/checkout` — `Checkout`)
- Reads shared `cartItems`(5). **`subtotal = Σ price*qty`; `gst = subtotal*0.18`; `deliveryFee = 0` (shown "FREE"); `total = subtotal+gst+deliveryFee`.** 3 steps (Review→Payment→Success). Step1: delivery address (hardcoded "City Pharmacy…"), order items, expected delivery (hardcoded). Step2: payment RadioGroup (upi/credit/cod/card) + coupon input (decorative "Apply"). Place Order = toast + step 3. Success shows **hardcoded `#ORD-2025-0042`**, "2 stockists", total. Track Order→orders; Continue Shopping→home.

### 4.9 Smart Order (`/pharmacy/orders/smart-create` — `SmartOrder`) — simulated AI
- 3 steps. Step1: textarea → "Process with AI" = `setTimeout(1500)` then regex parse (qty regex `/(\d+)\s*(strips?|tablets?|bottles?|boxes?)?/i`, match product by first-word or brand substring). Step2: matched/unmatched list with per-item best price. Step3: 3 recommendations — `cheapest.total = Σ bestPrice*qty`, stockistCount = unique matched stockists; **`quickest.total = round(base*1.1)`, stockistCount `1`; `best_value.total = round(base*1.05)`, stockistCount `2`** (placeholder multipliers). Add to Cart = toast + `/pharmacy/cart`.

### 4.10 Orders (`/pharmacy/orders` — `PharmacyOrders`)
- **Not integrated:** page-local hardcoded 3 orders. Tabs all/active/delivered/cancelled — **only "All" renders**; others show placeholder text ("Filter shows … orders"). Cards not clickable. Search decorative.

### 4.11 Order Detail (`/pharmacy/orders/:id` — `PharmacyOrderDetail`)
- Real `pharmacyOrders.find`; else "Order not found". `statusSteps`(6: placed/confirmed/processing/shipped/out_for_delivery/delivered). Timeline shows first 4 steps; progress bar `width = Math.min(currentStep/3*100,100)%`. Order items + price breakdown from real order fields (subtotal, deliveryFee "Free" if 0, discount, total). Payment (method + status badge), delivery address. Actions gated: Rate (delivered & !rating)→RateStockistDialog; Report Issue (delivered)→ReportIssueDialog; Contact (non-terminal)→ContactStockistDialog. TrackOrderDialog available.

### 4.12 Payments / Wishlist / Notifications / Messages / Help / More
- **Payments** (`/pharmacy/payments`): `paymentHistory`(4); search + tabs all/success/pending/failed; read-only; status icon+color map.
- **Wishlist** (`/pharmacy/wishlist`): `products.filter(isWishlisted)` into local state (5 wishlisted in data); remove local+toast; Add to Cart→AddToCartDialog; empty state.
- **Notifications** (`/pharmacy/notifications`): `notifications`(4) local state; mark-read/mark-all/delete real; type→icon (order/offer/price_drop/delivery); clicking navigates to `actionUrl` (some point to `/pharmacy/orders/PO…`, `/pharmacy/browse/...`).
- **Messages** (`/pharmacy/messages`): `messages`(3) list → chat view showing single `lastMessage`; **send button has no handler** (disabled unless text; does nothing on click).
- **Help** (`/pharmacy/help`): 4 FAQ categories (Orders/Payments/Returns/Account) with Accordion; search filters q+a (real); Call/Email/Chat cards decorative.
- **More** (`/pharmacy/more`): profile "HealthPlus Pharmacy"; sections Account, Shopping (Wishlist **badge "4"**), Communication (Notifications **"2"**, Messages **"3"**), Support, Preferences (App Settings, **"Switch to Sale View"** = `switchToSale` wired). Logout→toast+/auth. Version "DigiSwasthya v1.0.0".
- **Settings (profile/business/security/app):** mirror stockist settings pattern (form local state, saves toast-only). (Routed; per FEATURES the dark-mode toggle is inert — consistent with stockist AppSettings.)

### 4.13 Purchase dialogs (`src/components/pharmacy/dialogs/`)
- **AddToCartDialog:** qty +/−, `total = bestPrice.price*qty`; Add = toast + reset.
- **ComparePricesDialog:** **placeholder** — search input + "Search for a product to compare prices" text; no results ever.
- **ReorderDialog:** delivered orders (slice 5); Reorder = toast.
- **ViewOffersDialog:** read-only list of all `offers`(7) with code badges.
- **ContactStockistDialog:** message textarea; Send = toast.
- **RateStockistDialog:** 1–5 star selector + review textarea; Submit (rating>0) = toast.
- **ReportIssueDialog:** issue type Select (wrong/damaged/missing/late/other) + description; Submit = toast.
- **TrackOrderDialog:** 5-step tracker (placed→delivered) highlighting current; shows ETA.
- **Orphaned:** CheckoutDialog (place order toast→/pharmacy/orders), SmartOrderDialog (full duplicate of SmartOrder page), ApplyCouponDialog (code input → onApply).

---

## 5. PHARMACY — SALE VIEW

Data: `src/data/pharmacy-sale-mock-data.ts` — `patients`(5, PAT001–005), `doctors`(4, DOC001–004; DOC003 unavailable), `consultations`(4, CON001–004; CON004 pending), `saleOrders`(3), `inventoryItems`(7; PROD010 offline), `liveSettings`. **Date caveat:** all `createdAt`/`lastVisit` are dated 2025-01-xx, so "today" helpers (`getTodaySalesTotal`, `getTodayOrdersCount`) resolve to **0 / ₹0** at runtime; `getPendingConsultations` (status pending|in_progress) = 1 (CON004).

### 5.1 Dashboard (`/pharmacy/sale/dashboard` — `SaleDashboard`)
- Greeting by hour. Quick Actions: Go Live→GoLiveDialog; New Sale→SaleOrderDialog; Consult→`/pharmacy/sale/consults/start`; Reports→`/pharmacy/sale/reports`.
- Live status card: local `isLive` (init from `liveSettings.isLive`=true); Switch toggles state + toast; shows `getLiveInventoryCount()` (=6 live), radius, delivery, hours.
- Today's Stats (3): Sales=`getTodaySalesTotal()` (₹0 runtime), Orders=`getTodayOrdersCount()` (0), Consults=`getPendingConsultations().length` (1).
- Pending Consultations list → detail. Active Deliveries = `getActiveSaleOrders().slice(0,3)` → customer detail.

### 5.2 Inventory (`/pharmacy/sale/inventory` — `SaleInventory`)
- `inventoryItems` local state. Stats: Products Live (`filter isLive`) / Offline. Search + filter chips (all/live/offline) + decorative Filter button. Per-item live Switch = state + toast. **Add Product FAB = "coming soon" toast (stub).**

### 5.3 Customers (`/pharmacy/sale/customers` — `SaleCustomers`)
- Stats: Total = `patients.length` (5); **Visited Today** = `patients.filter(lastVisit === today ISO)` → 0 at runtime. Search (name/phone). Cards show order count (`saleOrders` filter), consults, totalPurchases → customer detail. FAB → RecordPatientDialog.

### 5.4 Customer Detail (`/pharmacy/sale/customers/:id` — `CustomerDetail`)
- `patients.find`; else "Customer not found". Profile, 3 stats (orders/consults/total), Order History (`saleOrders` filter), Consultation History (`consultations` filter → consult detail). **Call / New Order buttons = no-op (no handlers).**

### 5.5 Consultations (`/pharmacy/sale/consults` — `SaleConsultations`)
- Stats: Pending (`getPendingConsultations`) / Completed (`getCompletedConsultations`). Tabs Pending/Completed. Card: patient, status badge, doctor, video/voice badge, duration, fee, symptom chips → detail. FAB → StartConsultationDialog.

### 5.6 Consultation Detail (`/pharmacy/sale/consults/:id` — `ConsultationDetail`)
- `consultations.find`; else not-found. Status card (type video/voice), Patient/Doctor cards, Symptoms chips, Prescribed Medicines (name/dosage/duration/qty), Doctor's Notes. **Download Prescription (completed only) = toast (stub).**

### 5.7 Start Consultation (`/pharmacy/sale/consults/start` — `StartConsultation`)
- 4 steps (patient details / select doctor / connect / in-progress). Step1: **voice-record button** = `setTimeout(3000)` → sets `patientName="Recorded Patient"`, `symptoms="Fever, headache, body pain"` (simulated); manual name/phone/symptoms. Step2: `getAvailableDoctors()` cards. Step3: summary + call type (voice/video). Connect → toast + step 4 (In Progress). End Call → toast + `/pharmacy/sale/consults`.

### 5.8 Reports (`/pharmacy/sale/reports` — `SaleReports`)
- **Period selector (today/week/month) is cosmetic (does not filter).** `totalSales = Σ saleOrders.total` (not period-filtered); `totalConsultFees = Σ completed consult fees`; totalOrders = `saleOrders.length`; uniqueCustomers = `patients.length`. 4 download cards (Sales/Consultation/Customer/Inventory) all toast. Recent Prescriptions (completed consults slice 3) w/ per-item Download toast.

### 5.9 More / Live Settings / Doctor Connect
- **More** (`/pharmacy/sale/more`): profile "Sale View Active"; sections Sale Settings (Live Settings; Delivery Settings → also `/settings/live`), Doctors (Find Doctors), Reports, Account, Support (**"Switch to Purchase View"** = `switchToPurchase` wired). Logout→toast+/auth.
- **Live Settings** (`/pharmacy/sale/settings/live`): `liveSettings` local state — isLive Switch, deliveryEnabled Switch, radius Slider (1–15km), minimumOrder (number), deliveryFee (number, "Set to 0 for free"), operating hours start/end (time). Save = toast (not persisted).
- **Doctor Connect** (`/pharmacy/sale/doctors`): filter available/all + search; Voice/Video Connect buttons (disabled if !available) → toast only (no real call).

### 5.10 Sale dialogs (`dialogs/sale/`)
- **SaleOrderDialog** (most functional): customer name/phone; product search over `inventoryItems.filter(isLive && stock>0 && match)`; real local cart (add/±/remove), `total = Σ price*qty`; Complete Sale (cart>0) = toast + reset (no persist).
- **GoLiveDialog:** isLive/deliveryEnabled Switches + radius Slider (1–15); Save = toast.
- **RecordPatientDialog:** voice sim (`setTimeout(3000)` → name/phone), manual name*/phone*/age/address; Save (name+phone required) = toast.
- **StartConsultationDialog:** 3-step (details w/ voice sim / select doctor / call type); Connect = toast + reset.

---

## 6. PATIENT MODULE

Data: `src/data/patient-mock-data.ts` — generated `mockPatients`(100), `mockPatientOrders`(200), `mockPatientPrescriptions`(150), `mockPatientConsultations`(100), `mockNearbyPharmacies`(50). Generated order math: `deliveryFee = subtotal>=500 ? 0 : 40`; `discount = i%3===0 ? floor(subtotal*0.1) : 0`; `total = subtotal + deliveryFee - discount`. Consult `fee = 300 + (i%5)*100`. `getActiveOrders` (placed/confirmed/processing/out_for_delivery). Patient uses `getLiveInventoryForPatients` from `unified-data-helpers` (random price jitter → non-deterministic prices).

### 6.1 Dashboard (`/patient/dashboard` — `PatientDashboard`)
- Greeting "Hello, Rahul! 👋". Read-only search → `/patient/search`.
- **KPI row all hardcoded** (`kpiData`): Active Orders 3, Prescriptions 5, Wishlist 12, Refill Due 2. Quick Actions: Upload Prescription→UploadPrescriptionDialog, Book Consultation→BookConsultationDialog, Wishlist→`/patient/wishlist`.
- Recent Orders = `getActiveOrders().slice(0,3)` → `/patient/orders/:id`. Nearby Pharmacies = `getNearbyPharmaciesForPatient(5).slice(0,3)` → **`/patient/pharmacies/:id` (404)**; View All → **`/patient/pharmacies` (404)**. **Refill Reminders fully hardcoded** (Metformin 3d/City Pharmacy, Amlodipine 5d/Health Plus). Book Consultation CTA.

### 6.2 Search (`/patient/search` — `PatientSearch`)
- `getLiveInventoryForPatients(10)`. Category chips from live products. `getLowestPrice = Math.min(...pharmacyPrices.map(price))` (fallback MRP); `discount = round(((mrp-lowest)/mrp)*100)`; nearest = sort by distance. Cards → **`/patient/medicines/:id` (404)**. **Add to Cart = toast; Filter button no-op.** Clear filters wired.

### 6.3 Prescriptions (`/patient/prescriptions` — `PatientPrescriptions`)
- "Prescription Vault"; `mockPatientPrescriptions.slice(0,20)`. Search (doctorName/diagnosis) + status pills (all/active/partially_ordered/ordered/expired). Quick stats (active/pending/expired counts). Cards (doctor, status badge, Uploaded badge, diagnosis, medicines preview, dates) → **`/patient/prescriptions/:id` (404)**. "Order" (active only) → `/patient/search` (no real ordering). Upload→UploadPrescriptionDialog.

### 6.4 Orders (`/patient/orders` — `PatientOrders`)
- `mockPatientOrders.slice(0,30)`. Search + tabs all/processing/out_for_delivery/delivered. Cards → `/patient/orders/:id`.

### 6.5 Order Detail (`/patient/orders/:id` — `PatientOrderDetail`)
- **Fully hardcoded local `mockOrder` (ORD-P-001); ignores `useParams().id`.** Timeline (5 steps, 4 completed), pharmacy card (Call toast), items, payment summary (subtotal 205 / delivery 30 / discount −20 / total 215), Contact/Rate = toast stubs.

### 6.6 Consultations (`/patient/consultations` — `PatientConsultations`)
- **Local hardcoded 4-item `mockConsultations` (CONS-001…004), NOT `mockPatientConsultations`(100).** Search + tabs all/scheduled(Upcoming)/completed. Status badges completed/scheduled/cancelled. Cards → `/patient/consultations/:id`. **"Book New" (header) and empty-state "Book Consultation" have no handlers.**

### 6.7 Consultation Detail (`/patient/consultations/:id` — `PatientConsultationDetail`)
- **Fully hardcoded local `mockConsultation` (CONS-001); ignores id.** Doctor card, schedule, symptoms/diagnosis/notes, Prescription (3 medicines + advice list + follow-up), payment. Download/Rate = toast; Order Medicines → `/patient/search`.

### 6.8 Wishlist (`/patient/wishlist` — `PatientWishlist`)
- **Fully hardcoded 2 items (Vitamin D3, Omega-3).** "Add to Cart" and delete buttons have **no handlers**.

### 6.9 Profile / More / Help
- **Profile** (`/patient/profile`): hardcoded patient (Rahul Sharma, O+, allergies Penicillin/Dust, Hypertension). Health summary counts. Menu links to settings (several 404 — see §0.3). Logout→toast+/auth.
- **More** (`/patient/more`): profile "Rahul Sharma, B+". Health Alerts card → prescriptions. Menu w/ badges (Orders "2", Notifications "3"); several 404 links. Logout→/auth.
- **Help** (`/patient/help`): 6 collapsible FAQ categories; **search input is NOT wired to filter** (state set but unused); Chat/Call/Email = toast.

### 6.10 Settings
- **ProfileSettings** (`/patient/settings/profile`): hardcoded form (name/email/phone/DOB/gender Select/address/city/state/pincode); photo toast; Save = toast + back.
- **MedicalSettings** (`/patient/settings/medical`): bloodGroup Select; allergies/conditions/currentMedications chip lists with **real local add/remove**; Save = toast + back.
- **SecuritySettings** (`/patient/settings/security`): change password (match check only) = toast; 2FA & Biometric Switches (toast/local); Active Sessions (1 hardcoded "Current Device"); Log Out All (no handler); Delete Account = toast. (Note: file appends a stray `import { Badge }` at the bottom.)

### 6.11 Patient dialogs
- **BookConsultationDialog:** 3-step (select doctor = `mockDoctors.filter(active).slice(0,10)` → details → confirm). Type video/voice; symptoms* required; preferred time Select (now/morning/afternoon/evening). `handleConfirmBooking` = toast only (no scheduling).
- **UploadPrescriptionDialog:** file input (Browse real; Camera decorative) + notes; Upload requires file → `await setTimeout(1500)` → success toast. **No OCR / no real upload.** "How it works" claims AI extraction (not implemented).

---

## 7. DOCTOR MODULE

Data: `src/data/doctor-mock-data.ts` — `mockDoctors`(60, first 10 explicit + 50 generated; every 20th 'pending'), `mockAppointments`(23; apt-001 scheduled/apt-002 completed/apt-003 in_progress + 20 generated cycling scheduled/completed/cancelled), `mockPrescriptions`(16), `mockDoctorEarnings`(31; earn-001 + 30 generated), `mockDoctorPatients`(50). `getTotalEarnings = Σ netAmount`; `getPendingEarnings = Σ netAmount where status==='pending'`; `getTodaysAppointments` (real date → empty at runtime); `getPendingAppointments` (status scheduled).

### 7.1 Dashboard (`/doctor/dashboard` — `DoctorDashboard`)
- Greeting "…, Dr. Sharma!" + "You have {pending} appointments today". "Start Consult"→appointments.
- KPIs: Today=`getTodaysAppointments().length` (0 runtime), Pending=`getPendingAppointments().length`, Earnings=`getTotalEarnings()`, **Patients = hardcoded "50"**.
- Quick Actions (Start Consult/Patients/Prescriptions/Earnings). Earnings summary (total + pending withdraw; **"+12% this week" hardcoded**). Upcoming Appointments (`mockAppointments.slice(0,4)`) → detail. Recent Earnings (slice 3).

### 7.2 Appointments (`/doctor/appointments` — `DoctorAppointments`)
- Search (patientName) + tabs w/ counts: all/scheduled(Upcoming)/in_progress(Active)/completed(Done). Cards (patient, age/gender, via pharmacy, status badge, symptom chips, datetime, type). **Start (scheduled) = `handleStartCall` toast only**; View → detail.

### 7.3 Appointment Detail (`/doctor/appointments/:id` — `DoctorAppointmentDetail`)
- Real `mockAppointments.find`; else not-found. Patient info, schedule, symptoms/notes. If scheduled: **Start Call (toast) + Prescribe → `/doctor/prescriptions/new?patient=:id` (404)**. If completed + prescriptionId: View Prescription → `/doctor/prescriptions/:id` (404).

### 7.4 Patients (`/doctor/patients` — `DoctorPatients`)
- `mockDoctorPatients`(50). Search (name/phone). Stats: Total=50, This Week=`lastVisit > now-7d`, Total Visits=`Σ totalVisits`. Cards (age/gender/bloodGroup, phone, last visit, visits, allergy/condition badges) → detail.

### 7.5 Patient Detail (`/doctor/patients/:id` — `DoctorPatientDetail`)
- Real lookups (patient + `mockAppointments.filter(patientId)` + `mockPrescriptions.filter(patientId)`). Start Consult = toast; **Call = no-op**. Medical info, recent appointments (slice 3), prescriptions (slice 3).

### 7.6 Prescriptions (`/doctor/prescriptions` — `DoctorPrescriptions`)
- `mockPrescriptions`(16). Search (patientName/diagnosis). Stats: Total, With Follow-ups (`followUpDate` truthy). Cards (patient, diagnosis, medicine preview, created date, follow-up badge). Download = toast. (No status field on doctor Prescription interface.)

### 7.7 Earnings (`/doctor/earnings` — `DoctorEarnings`)
- Summary: Total=`getTotalEarnings()` (+12% hardcoded), Pending=`getPendingEarnings()` + Withdraw (disabled if 0) = toast. **"This Month" block hardcoded** (23 consults / ₹8,500 earned / ₹850 fee). Tabs all/paid/pending. Earning rows (net, fee, platformFee, status).

### 7.8 More / Settings / Dialog
- **More** (`/doctor/more`): profile "Dr. Arun Sharma". Sections Account (Profile, Availability), Finance (Earnings, **Tax Reports→`/doctor/reports` 404**), Communication (Notifications **"5"**→404, Consultation History→appointments), Settings (**Security→404, App→404, Help→404**). Logout→/auth.
- **ProfileSettings** (`/doctor/settings/profile`): hardcoded form — name/email/phone, specialization Select(8), qualification, regNumber, experience, languages, bio, consultationFee, clinic address. Save = toast + back.
- **AvailabilitySettings** (`/doctor/settings/availability`): consultationDuration Select (10/15/20/30, default 15), bufferTime Select (0/5/10/15, default 5); weekly schedule (Mon–Sun) with per-day enable Switch + add/remove/edit time slots — **real local mutation**. Save = toast + back.
- **BankSettings** (`/doctor/settings/bank`): **routed but not linked from anywhere**. "Available ₹12,500 / Pending ₹3,200" hardcoded; Withdraw no-op. Bank fields (holder/account/confirm/IFSC/type Select/bankName/branch) + UPI; Save (match check) = toast. Weekly Payouts info.
- **WritePrescriptionDialog** (orphaned; not imported by any page): diagnosis* + dynamic medicine cards (name Select from `commonMedicines`(8), dosage/frequency/duration/instructions Selects), add/remove (min 1), general instructions, follow-up Select. Submit (diagnosis + medicine[0].name) = toast only. Because the "Prescribe" button navigates to a non-existent route instead of opening this dialog, **the doctor→patient prescription creation flow is effectively unimplemented**.

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

## 9. MONEY, GST & STATUS VOCABULARIES (as coded)

- **GST inconsistency:** Stockist `OrderDetail` & `CreateOrder` & `QuickOrderDialog` hardcode **18%** (`subtotal*0.18`) ignoring per-product `gstRate` (5/12 in data). Stockist `CreateBill`/`QuickBillDialog`/`BillPreviewDialog` use the pre-computed per-order `gstAmount` (which itself was per-product in the mock data). Pharmacy `Checkout` applies **18%** + ₹0 delivery. `AcceptOrderDialog` recomputes item GST at **12%**. Patient/sale order objects carry `subtotal/deliveryFee/discount/total` with **no GST line**. Net effect: on stockist OrderDetail the shown Subtotal + GST(18%) generally does NOT equal the shown Total.
- **Delivery fee:** stockist Stockist.deliveryFee (0 → "Free Delivery" badge); pharmacy order `deliveryFee` field ("Free" when 0); pharmacy Checkout hardcodes 0; patient generator `subtotal>=500?0:40`; sale `liveSettings.deliveryFee` editable.
- **Order status vocabularies differ by module:**
  - Stockist `Order`: `pending|confirmed|processing|out-for-delivery|delivered|cancelled`; payment `unpaid|partial|paid`; source `platform|direct|whatsapp|phone|walk-in`; payment-approval `pending|approved|rejected|on-hold`; incoming `new|accepted|declined|modified`.
  - Pharmacy purchase `PharmacyOrder`: `placed|confirmed|processing|shipped|out_for_delivery|delivered|cancelled|returned`.
  - Sale `SaleOrder`: `pending|confirmed|preparing|out_for_delivery|delivered|cancelled`.
  - Patient `PatientOrder`: `placed|confirmed|processing|out_for_delivery|delivered|cancelled`.
  - Consultations: `scheduled|in_progress|completed|cancelled` (doctor adds `no_show`; type `video|voice`, doctor interface also declares `in_person` never produced).
- **No money ever moves, no order/record is ever written.** Every settle/approve/collect/checkout/book/withdraw/upload/download is a toast and/or local component state (reset on reload).

---

## 10. CONSOLIDATED STUB / HARDCODE INVENTORY

- **Simulated AI:** stockist CreateOrder & QuickOrderDialog (regex + "AI Parsing" badge), pharmacy SmartOrder & SmartOrderDialog (`setTimeout` + regex + ×1.05/×1.1 multipliers), Products "AI Enhance" (double toast), OCRScanDialog/ScanProductDialog/BulkUploadDialog (setTimeout mock extraction), UploadPrescriptionDialog ("AI will extract" — not implemented).
- **Simulated voice:** StartConsultation page, StartConsultationDialog, RecordPatientDialog — all `setTimeout(3000)` → hardcoded transcript.
- **Hardcoded KPIs/deltas:** stockist Home todaysCollection 45000; pharmacy Home all 4 KPIs; patient Dashboard 4 KPIs + refill reminders; doctor Patients "50" + "+12%"; doctor Earnings This-Month block; doctor Bank balances (12,500/3,200); admin all KPIs (platformStats) + growth "+15%"; admin sidebar badges 3/5/4 + bell 12; various More badges (stockist 3/5, pharmacy 4/2/3, patient 2/3, doctor 5); TopNav 2/3, PatientTopNav 3, DoctorTopNav 2/5; analytics chart series; AppSettings storage 12.5/50.
- **Page-local arrays bypassing shared mock modules:** pharmacy Stockists/Cart/Orders; patient OrderDetail/ConsultationDetail/Consultations/Wishlist; all four admin per-role pages; admin UserDetail (3 synthetic keys); stockist PharmacyDetail ledger; stockist operational pages (Credit Notes/Routes/Purchase Orders/Staff/Reports/Documents/Messages/Notifications).
- **Detail pages ignoring `useParams().id`:** patient OrderDetail (ORD-P-001), patient ConsultationDetail (CONS-001).
- **Genuinely functional bits:** Install page (`beforeinstallprompt`, iOS/standalone detection); `wa.me` shares (CreateBill, QuickBillDialog, SharePaymentLinkDialog); `tel:`/`maps.google.com`/clipboard actions; GuidedTour + `localStorage` tour flag (only persistence); several list pages' local mark-read/delete/add-remove operations (reset on reload); real filter/sort/search on many lists.

*End of review. Sources read in full: `src/App.tsx`, `src/main.tsx`-level providers, `src/contexts/PharmacyViewContext.tsx`, all `src/components/layout/*`, all `src/data/*`, every page under `src/pages/**`, and every dialog/component under `src/components/{stockist,pharmacy,patient,doctor}/**`, plus `vite.config.ts`, `tailwind.config.ts`, `GuidedTour.tsx`.*

---
