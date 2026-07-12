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
---

# EXPANDED APPLICATION DOCUMENTATION (Parts 1–8)

> The sections below EXPAND the review above into complete application documentation. Everything is documented from the actual code as it exists today. Nothing here describes intended or future behavior.

## PART 1 — ARCHITECTURE

### 1A. Bootstrap & provider stack
- `index.html` → `src/main.tsx`: `createRoot(document.getElementById("root")!).render(<App />)` — no `<React.StrictMode>`, no service-worker registration code of its own (vite-plugin-pwa injects it at build).
- `App.tsx` provider nesting (exact order): `QueryClientProvider` (a `new QueryClient()` is created at module scope; **no component in the app ever calls `useQuery`/`useMutation`** — TanStack Query is mounted dead weight) → `TooltipProvider` → `<Toaster/>` (shadcn toast portal, the one actually used via `use-toast`) and `<Sonner/>` (sonner portal, mounted but no page imports `toast` from sonner) → `BrowserRouter` → `<Routes>`.
- There is **no auth provider, no user context, no global store** (no Redux/Zustand/Jotai). The only React context in the app is `PharmacyViewContext`. All page state is component-local `useState`.
- Package identity: `package.json` name `vite_react_shadcn_ts`, version `0.0.0`. Scripts: `dev`, `build`, `build:dev` (`vite build --mode development`), `lint` (eslint), `preview`, `test`/`test:watch` (vitest). Font shipped via `@fontsource/lexend`.

### 1B. Layout shells (one per role)
All five role layouts share the identical skeleton: `<div min-h-screen bg-background>` → a TopNav component → `<main className="pb-16 md:pb-20"><div className="container mx-auto p-3 md:p-4 lg:p-6 max-w-7xl"><Outlet/></div></main>` → `<BottomNav items={...}/>`.
| Layout | TopNav used | BottomNav items (path → label) |
|---|---|---|
| `StockistLayout` | shared `TopNav` | /stockist/{home,pharmacies,products,orders,more} → Home·Pharmacies·Products·Orders·More |
| `PharmacyLayout` | `PharmacyTopNav` | /pharmacy/{home,browse,cart,orders,more} → Home·Browse·Cart·Orders·More |
| `PharmacySaleLayout` | `PharmacyTopNav` | /pharmacy/sale/{dashboard,inventory,customers,consults,more} |
| `PatientLayout` | `PatientTopNav` | /patient/{dashboard,search,prescriptions,orders,more} → Home·Search·Rx·Orders·More |
| `DoctorLayout` | `DoctorTopNav` | /doctor/{dashboard,appointments,patients,prescriptions,more} |
| `AdminLayout` | own header + sidebar (no BottomNav) | 11-item sidebar (desktop w-64 fixed; mobile Sheet drawer) |
Onboarding pages and `/auth`, `/install`, `NotFound` render with **no layout** (full-screen standalone).

### 1C. PharmacyViewContext — dual-view mechanics (and the double-provider quirk)
- File: `src/contexts/PharmacyViewContext.tsx` (55 lines). `type ViewMode = 'purchase' | 'sale'`; state defaults to `'purchase'`. Exposes `viewMode`, `setViewMode` (delegates to the switch fns), `switchToPurchase()` (`setViewMode('purchase'); navigate('/pharmacy/home')`), `switchToSale()` (`setViewMode('sale'); navigate('/pharmacy/sale/dashboard')`). `usePharmacyView()` throws if used outside a provider.
- **Two independent provider instances exist**: (1) `PharmacyLayout` wraps its own subtree in `<PharmacyViewProvider>`; (2) `App.tsx` wraps `PharmacySaleLayout` in another `<PharmacyViewProvider>` directly in the route element. Because `/pharmacy/sale` is a sibling route (not nested under `/pharmacy`'s layout), navigating between views unmounts one provider and mounts the other. Consequence: `viewMode` state is always freshly initialized to `'purchase'` on mount — even inside the Sale layout — so **the `viewMode` value itself is never a reliable signal**; components that need to know the view (e.g. `PharmacyTopNav`) instead check `location.pathname.startsWith('/pharmacy/sale')`. The context's only real job is providing the two navigate-wrapping switch functions used by `PharmacyTopNav`'s avatar dropdown, `PharmacyMore` ("Switch to Sale View") and `SaleMore` ("Switch to Purchase View").

### 1D. Mock-data module structure (`src/data/`)
Nine plain TypeScript modules; no fetching, no randomness at request time (some randomness at module-eval time), no persistence. Pattern per module: exported interfaces → exported `const` arrays (hand-written seeds and/or `Array.from` generators) → exported pure helper functions (filters/sums/formatters).
- `stockist-mock-data.ts` (1256 ln) — stockist panel. `demo-credentials.ts` (164 ln) — login/onboarding prefills + `indianStates`, `bloodGroups`, `medicalSpecializations`, `commonLanguages` lists. `pharmacy-mock-data.ts` (1053 ln) — purchase view. `pharmacy-sale-mock-data.ts` (420 ln) — sale view. `patient-mock-data.ts` (357 ln) — mostly generator-based (100/200/150/100/50 rows). `doctor-mock-data.ts` (489 ln). `admin-mock-data.ts` (295 ln). `regulatory-documents.ts` (223 ln) — document-type catalog + never-called validators. `unified-data-helpers.ts` (419 ln) — cross-panel joins; only `getLiveInventoryForPatients` and `getNearbyPharmaciesForPatient` are actually imported (by PatientSearch/PatientDashboard); it applies a **random price jitter at call time**, so patient-facing prices change on every render/reload.
- Cross-module consistency is **not** enforced: each panel has its own entity shapes and IDs (stockist `ph-001` vs pharmacy `STK001` vs admin `stk-001`), and many pages additionally define page-local arrays (see §10 above and Part 8 below).

### 1E. PWA & install surface
- `vite.config.ts`: dev server `host "::"`, port **8080**, HMR overlay disabled; plugins `@vitejs/plugin-react-swc`, `lovable-tagger` `componentTagger()` (development mode only — this is a Lovable-generated project), `VitePWA` (`registerType 'autoUpdate'`, `includeAssets ['favicon.ico','robots.txt']`, manifest as documented in §0.5, Workbox precache glob `**/*.{js,css,html,ico,png,svg,woff2}` + single runtime CacheFirst rule for `fonts.googleapis.com`, 365-day/10-entry cache). Alias `@` → `./src`.
- `/install` (`src/pages/Install.tsx`) is genuinely functional PWA logic: detects standalone mode via `matchMedia("(display-mode: standalone)")` → "Already Installed!" card; detects iOS via UA regex `/iPad|iPhone|iPod/` → 3-step Share→Add-to-Home-Screen instructions; otherwise captures the `beforeinstallprompt` event into state and "Install App" calls `deferredPrompt.prompt()` and awaits `userChoice` (outcome `accepted` flips to installed state); if no prompt fired, shows manual Android menu instructions. "Maybe Later"/"Back to App" → `/` (→ `/auth`). Benefits list: works offline, faster loading, home-screen access, no app store. **Nothing in the app links to `/install`** — it is reachable only by typing the URL.

### 1F. Shared building blocks
- `src/components/NavLink.tsx`: thin wrapper over react-router `Link` adding `activeClassName` matching by exact path or prefix; used by `BottomNav`.
- `src/hooks/use-toast.ts`: shadcn reducer-based toast store (limit 1, huge dismiss delay); `src/components/ui/*` = ~50 stock shadcn components plus two custom ones: `verification-input.tsx` (email/phone field + Verified badge + OTP dialog that accepts any 6-digit code) and `document-upload.tsx` (drag/drop-styled file input; keeps only a local `URL.createObjectURL` preview + status badge pending/uploaded/verified/rejected; nothing uploads).
- `src/lib/utils.ts`: only `cn()` (clsx+tailwind-merge). `src/hooks/use-mobile.tsx`: 768px matchMedia hook (used by sidebar/admin drawer).
- Tests: `vitest` configured via package scripts; `src/test/example.test.ts` is a placeholder assertion; `src/test/setup.ts` standard jsdom setup. No component/page has tests.

## PART 2 — COMPLETE ROUTE INVENTORY (every `<Route>` in App.tsx)

Top-level, no layout: `/` → `Navigate → /auth` · `/auth` → `AuthPage` · `/install` → `Install` · `/stockist/onboarding` → `StockistOnboarding` · `/pharmacy/onboarding` → `PharmacyOnboarding` · `/patient/onboarding` → `PatientOnboarding` · `/doctor/onboarding` → `DoctorOnboarding` · `*` → `NotFound`.

**`/stockist` → `StockistLayout`** (27 children): index→`Navigate /stockist/home`; `home`→StockistHome; `pharmacies`→StockistPharmacies; `pharmacies/:id`→PharmacyDetail; `products`→StockistProducts; `products/:id`→ProductDetail; `orders`→StockistOrders; `orders/:id`→OrderDetail; `orders/create`→CreateOrder; `bills/create`→CreateBill; `payments`→StockistPayments; `analytics`→StockistAnalytics; `notifications`→StockistNotifications; `documents`→StockistDocuments; `help`→StockistHelp; `messages`→StockistMessages; `reports`→StockistReports; `routes`→DeliveryRoutes; `staff`→StaffManagement; `expiry`→ExpiryManagement; `credit-notes`→CreditNotes; `purchases`→PurchaseOrders; `settings/profile|business|security|app`→ProfileSettings/BusinessSettings/SecuritySettings/AppSettings; `more`→StockistMore.

**`/pharmacy` → `PharmacyLayout`** (22 children): index→home; `home`→PharmacyHome; `browse`→PharmacyBrowse; `browse/stockists`→PharmacyStockists; `browse/stockists/:id`→PharmacyStockistDetail; `browse/products`→PharmacyProducts; `browse/products/:id`→PharmacyProductDetail; `cart`→PharmacyCart; `orders`→PharmacyOrders; `orders/:id`→PharmacyOrderDetail; `orders/smart-create`→SmartOrder; `checkout`→Checkout; `payments`→PharmacyPayments; `wishlist`→PharmacyWishlist; `notifications`→PharmacyNotifications; `messages`→PharmacyMessages; `help`→PharmacyHelp; `more`→PharmacyMore; `settings/profile|business|security|app`→Pharmacy{Profile,Business,Security,App}Settings.

**`/pharmacy/sale` → `<PharmacyViewProvider><PharmacySaleLayout/></PharmacyViewProvider>`** (12 children): index→dashboard; `dashboard`→SaleDashboard; `inventory`→SaleInventory; `customers`→SaleCustomers; `customers/:id`→CustomerDetail; `consults`→SaleConsultations; `consults/:id`→ConsultationDetail; `consults/start`→StartConsultation; `reports`→SaleReports; `more`→SaleMore; `settings/live`→LiveSettings; `doctors`→DoctorConnect.

**`/patient` → `PatientLayout`** (15 children): index→dashboard; `dashboard`→PatientDashboard; `search`→PatientSearch; `prescriptions`→PatientPrescriptions; `orders`→PatientOrders; `orders/:id`→PatientOrderDetail; `wishlist`→PatientWishlist; `profile`→PatientProfile; `more`→PatientMore; `consultations`→PatientConsultations; `consultations/:id`→PatientConsultationDetail; `help`→PatientHelp; `settings/profile|medical|security`→Patient{Profile,Medical,Security}Settings.

**`/doctor` → `DoctorLayout`** (12 children): index→dashboard; `dashboard`→DoctorDashboard; `appointments`→DoctorAppointments; `appointments/:id`→DoctorAppointmentDetail; `patients`→DoctorPatients; `patients/:id`→DoctorPatientDetail; `prescriptions`→DoctorPrescriptions; `earnings`→DoctorEarnings; `more`→DoctorMore; `settings/profile|availability|bank`→Doctor{Profile,Availability,Bank}Settings.

**`/admin` → `AdminLayout`** (13 children): index→dashboard; `dashboard`→AdminDashboard; `users`→AdminUsers; `users/:id`→AdminUserDetail; `stockists`→AdminStockists; `pharmacies`→AdminPharmacies; `doctors`→AdminDoctors; `patients`→AdminPatients; `orders`→AdminOrders; `payments`→AdminPayments; `consultations`→AdminConsultations; `reports`→AdminReports; `settings`→AdminSettings.

Total routed pages: 101 route entries (incl. 7 index redirects + 8 top-level). No route guards, loaders, or lazy imports — all 100+ page components are statically imported into one bundle.

## PART 3 — COMPLETE ENTITY REFERENCE (per data module)

### 3A. `stockist-mock-data.ts` (stockist panel)
Interfaces & arrays:
- **`Pharmacy`** — `id, name, owner, ownerName` (duplicated field pair), `phone, email?, address, area, gstNumber?, dlNumber?, outstanding, outstandingBalance` (another duplicated pair, same value), `creditBalance, creditLimit, pendingOrders, lastPaymentDate?/Amount?, lastOrderDate?, createdAt`. Array `mockAllPharmacies` = **20** rows `ph-001…ph-020` (seed #1: Shree Medical Store / Ramesh Kumar / outstanding ₹45,000 / creditLimit ₹100,000 / GST `27AABCU9603R1ZM` — the same GSTIN hardcoded in CreateBill's header).
- **`PharmacyCircle`** — `pharmacyId, addedAt, creditLimit, paymentTerms('cod'|'7days'|'15days'|'30days'), preferredDeliveryDay, notes?, status('active'|'inactive'|'blocked')`. `mockPharmacyCircle` = **8** rows (all active). `mockPharmacies = getCirclePharmacies()` joins circle→pharmacy = the 8 "My Circle" pharmacies used across the stockist panel.
- **`Product`** — `id, name, brand, manufacturer, category, mrp, salePrice, stockQuantity, minStock, batchNumber, expiryDate, hsnCode, gstRate, isTopSelling?, salesCount?, imageUrl?, drugSchedule?('H'|'H1'|'X'|'OTC'), rxRequired?, composition?`. `mockProducts` = **10** rows `prod-001…010` (e.g. prod-001 Paracetamol 500mg/Crocin/GSK, MRP 35 sale 28, stock 500 min 100, HSN 30049099, GST 12%, OTC; prod-002 Amoxicillin 250mg/Mox stock 45 < min 50 → low stock). GST rates in data are only 5 or 12 — never 18, which is what several UIs recompute with.
- **`Order`** — `orderNumber, pharmacyId/Name, items: OrderItem[] (productId, productName, quantity, rate, amount, gstAmount per line), subtotal, gstAmount, totalAmount, status(pending|confirmed|processing|out-for-delivery|delivered|cancelled), paymentStatus(unpaid|partial|paid), paidAmount, source(platform|direct|whatsapp|phone|walk-in), createdAt, deliveryDate?, deliveredAt?, notes?, billGenerated?, billNumber?`. `mockOrders` = **6** (`ord-001` ORD-2026-001, Shree Medical, ₹3,852.80, processing/unpaid, "Urgent delivery required").
- **`IncomingOrder`** — order-request shape + `pharmacyPhone, receivedAt, status(new|accepted|declined|modified), declineReason?, orderId?`. `mockIncomingOrders` = **5**, all `new`.
- **`Payment`** — `orderId/orderNumber/pharmacyId/Name, amount, method, screenshotUrl?, transactionId?, status(pending|approved|rejected|on-hold), notes?, createdAt, approvedAt?`. `mockPayments` = **5** (2 pending → the "Payment Approvals" queue).
- **`Notice`**(3) and **`Notification`**(5, types order|payment|alert|system) + `VerificationState` (used by the settings VerificationInput).
- Helpers (all pure): lookups by id; `getLowStockProducts` (4 hits), `getTopSellingProducts` (isTopSelling sorted by salesCount), `getRecentOrders(limit=5)`, `getNewIncomingOrders`, `getActiveOrders/getDeliveredOrders`, `getPendingPayments`, `getTotalOutstanding` (Σ over ALL 20 pharmacies, not just circle), `getTotalCredits`, `getTodaysRevenue` (compares `createdAt` date-string to today → **₹0 whenever real date ≠ seed dates of 2026-01-26/27**), `getPendingOrdersCount`, `formatCurrency` (Intl INR), `formatDate/formatDateTime/getTimeAgo`.

### 3B. `pharmacy-mock-data.ts` (purchase view)
- **`Stockist`** — `id, name, location, address, phone, email?, rating, reviewCount, deliveryTime, deliveryFee, minOrder, maxDiscount(string like "18%"), categories[], isVerified, isFavorite, activeOffers, createdAt`. `stockists` = **8** `STK001…008` (STK001 ABC Distributors, 4.8★/245 reviews, Same Day, fee ₹50, minOrder ₹5,000).
- **`PharmacyProduct`** — `id, name, brand, manufacturer, category, mrp, stockistPrices: StockistPrice[] (stockistId/Name, price, discount string, inStock, deliveryTime), imageUrl?, description, composition, packSize, requiresPrescription, isWishlisted`. `products` = **15** `PROD001…015`; each carries 2–4 stockist prices (PROD001 Paracetamol: STK001 ₹28/20%, STK002 ₹30/14%, STK005 ₹29/17%). "Best price" is always derived at render time by reducing `stockistPrices`.
- **`CartItem`** (id, productId/Name, brand, stockistId/Name, quantity, price, mrp) — `cartItems` = **5** (used by Checkout only; the Cart page ignores it).
- **`PharmacyOrder`** — `orderNumber, stockistId/Name, items: CartItem[], subtotal, deliveryFee, discount, total, status(placed|confirmed|processing|shipped|out_for_delivery|delivered|cancelled|returned), paymentMethod, paymentStatus(pending|paid|failed), deliveryAddress, estimatedDelivery, actualDelivery?, createdAt, rating?, review?`. `pharmacyOrders` = **6** `PO001…006` (used only by PharmacyOrderDetail + notifications actionUrls; the Orders LIST page uses its own local array).
- **`Offer`**(7: percentage|flat|bogo, some with `code`), **`PaymentHistory`**(4), **`Message`**(3, Σ unreadCount = 2), **`Notification`**(4, 2 unread), **`SavedAddress`**(2), `categories` = 14 strings (Antibiotics…Homeopathy).
- Helpers: `getBestPriceForProduct`, `getActiveOrders` (not delivered/cancelled/returned), `getFavoriteStockists`, `getUnreadNotificationCount/getUnreadMessageCount` (=2/2, feed PharmacyTopNav badges), plus 6 exported-but-unused helpers (`getStockistProducts, getOrdersByStatus, getActiveOffers, getWishlistedProducts, getCartTotal, getCartByStockist`).

### 3C. `pharmacy-sale-mock-data.ts` (sale view)
- **`Patient`**(5, PAT001–005: name/phone/address/age?/consultations/totalPurchases/lastVisit/createdAt), **`Doctor`**(4, DOC001–004: specialization/qualification/experience/rating/reviewCount/available (DOC003 false)/consultationFee/languages), **`Consultation`**(4, CON001–004: patient+doctor denorm, symptoms[], prescribedMedicines[] (productId/Name, dosage, duration, quantity), notes, status pending|in_progress|completed|cancelled, type voice|video, date, duration?, fee, recordingUrl?; CON004 pending), **`SaleOrder`**(3: items (productId/Name, quantity, price, mrp), subtotal/deliveryFee/discount/total, status pending|confirmed|preparing|out_for_delivery|delivered|cancelled, paymentMethod/Status, deliveryAddress, isDelivery, consultationId?, createdAt), **`InventoryItem`**(7: productId/Name, brand, category, mrp, sellingPrice, stock, isLive — PROD010 isLive:false → 6 live).
- **`liveSettings`** singleton: `{ isLive:true, deliveryEnabled:true, radiusKm:5, minimumOrder:100, deliveryFee:30, operatingHours:{start,end} }` — read as initial state by SaleDashboard/LiveSettings/GoLiveDialog; edits never write back.
- Helpers: `getActiveSaleOrders` (not delivered/cancelled), `getPendingConsultations` (pending|in_progress =1), `getCompletedConsultations`, `getAvailableDoctors` (3), `getLiveInventoryCount` (6), `getTodaySalesTotal`/`getTodayOrdersCount` (date-string compare → 0 at runtime since seeds are 2025-01-xx).

### 3D. `patient-mock-data.ts` (all generator-based)
Name/city pools: 20 first names × 20 last names, 10 cities each with 5–10 areas, 8 blood groups, 10 allergies, 10 chronic conditions.
- **`mockPatients`**(100, `PAT-001…100`): age from DOB math, gender by index, allergies for `i%5===0`, conditions cycling, emergencyContact object, status active except `i%10===9` inactive.
- **`mockPatientOrders`**(200, `pord-001…200` / `PAT-2026-1000…`): status cycles the 6 values; paymentStatus failed-if-cancelled else pending every 4th; 1–4 items drawn from an 8-medicine price table; `deliveryFee = subtotal>=500?0:40`; `discount = i%3===0 ? floor(subtotal*0.1) : 0`; `total = subtotal+deliveryFee-discount`; delivered orders every 3rd get rating 4–5.
- **`mockPatientPrescriptions`**(150): doctor denorm, diagnosis, medicines[], `isUploaded` flag, status cycling active|partially_ordered|ordered|expired.
- **`mockPatientConsultations`**(100): status cycling, `fee = 300 + (i%5)*100`.
- **`mockNearbyPharmacies`**(50, `pharm-001…050`): name from pools, `distance = 0.5+(i%20)*0.5` km, **`rating = 4.0+Math.random()*0.9` (randomized at module load — differs every reload)**, `isOpen = i%8!==0`, `deliveryAvailable = i%3!==0`, `deliveryFee 0|30–50`, `minimumOrder 100–300`, `liveProductCount 50–149`.
- Helpers: `getPatientById/getPatientOrders/getActiveOrders/getPatientPrescriptions/getActivePrescriptions/getUpcomingConsultations/getNearbyPharmaciesForPatient(maxDistance=10)`, `formatCurrency` (template string), `getTimeAgo`.

### 3E. `doctor-mock-data.ts`
- **`DoctorProfile`** (registrationNumber, consultationFee, rating, totalConsultations, status active|pending|suspended, bio). `mockDoctors` = **60** (first 10 hand-written incl. doc-001 Dr. Arun Sharma; +50 generated, every 20th `pending`).
- **`WeeklySchedule`/`TimeSlot`** — interfaces only; consumed by AvailabilitySettings' local state, no mock instance exported.
- **`Appointment`**(23: apt-001 scheduled, apt-002 completed, apt-003 in_progress + 20 generated cycling scheduled/completed/cancelled; fields incl. patient denorm, pharmacyId/Name? (consult "via pharmacy"), symptoms[], type video|voice|in_person (in_person never seeded), fee, paymentStatus).
- **`Prescription`**(16: appointmentId, patient/doctor denorm, diagnosis, medicines: PrescribedMedicine[] (name/dosage/frequency/duration/instructions?), instructions, followUpDate?).
- **`DoctorEarning`**(31: earn-001 ₹500 −₹50 fee = ₹450 paid; +30 generated `amount 300–700, platformFee 10%, netAmount 270–630`, every 4th `pending`; `withdrawn` status defined but never seeded).
- **`DoctorPatient`**(50 generated `pat-001…050`: age 20–69, every 5th Penicillin allergy, every 4th Diabetes / every 6th Hypertension, lastVisit 2026-01-10…26, totalVisits 1–10).
- Helpers: `getTodaysAppointments` (real-date compare → usually 0), `getPendingAppointments` (scheduled), `getCompletedAppointments`, `getTotalEarnings` (Σ netAmount ≈ ₹13,950+450), `getPendingEarnings`, `formatCurrency`.

### 3F. `admin-mock-data.ts`
- **`platformStats`** — entirely hardcoded: totalUsers 235, stockists 20, pharmacies 55, doctors 60, patients 100, activeUsers 180, totalOrders 2,450, totalRevenue ₹48,50,000, todayOrders 45, todayRevenue ₹1,25,000, pendingVerifications 12, activeConsultations 8.
- **`AdminUser`** (role, status active|pending|suspended|rejected, verificationStatus verified|pending|rejected, businessName?, city?). `mockAdminUsers` = **235** generated (20 stk + 55 pharm + 60 doc + 100 pat; ids like `stk-001`, `pharm-001`, `doc-001`, `pat-001`).
- **`VerificationRequest`**(15: 3 explicit + 12 generated, ALL pending; documentType gst|drug_license|medical_registration|identity), **`PlatformOrder`**(100 generated, type b2b|b2c with buyer/seller denorm), **`PlatformTransaction`**(150: order_payment|consultation_fee|refund|withdrawal|commission, amount + platformFee, status), **`ConsultationLog`**(50: type/duration/fee/platformFee/status completed|cancelled|no_show).
- Helpers: `getUsersByRole`, `getPendingVerifications`, `getRecentOrders/getRecentTransactions`, `formatCurrency`.

### 3G. `demo-credentials.ts`
`demoCredentials` per role (email/password/description): stockist `demo.stockist@digiswasthya.com`/`Demo@123`; pharmacy `demo.pharmacy@…`; patient `demo.patient@…`; doctor `demo.doctor@…`; admin `admin@digiswasthya.com`/`Admin@123`. Four onboarding prefill objects: `defaultStockistData` (Rajesh Distributors Pvt. Ltd., PAN AABCR1234K, DL-MH-2024-123456, GST 27AABCR1234K1ZM, WL-MH-2024-7890, FSSAI 10024023000456, HDFC bank + UPI `rajeshdist@hdfcbank`, all doc URLs `/placeholder.svg`), `defaultPharmacyData`, `defaultDoctorData`, `defaultPatientData` (same pattern). Also exports `indianStates`, `bloodGroups`, `medicalSpecializations`, `commonLanguages` (re-exported/duplicated in regulatory-documents.ts).

### 3H. `regulatory-documents.ts` (catalog + dead validators)
- **`DocumentType`**: `id, label, description, required, format, validationPattern (RegExp), placeholder`. Four catalogs: `stockistDocuments`(5: Drug License Form 20B/21B `DL-XX-XXXX-XXXXXX`, GST cert 15-char, Wholesale License `WL-XX-XXXX-XXXX`, PAN, optional FSSAI 14-digit), `pharmacyDocuments`(retail Form 20/21 variants), `doctorDocuments`, `patientDocuments`.
- Standalone validators (regexes): `validateGST` (`^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$`), `validatePAN` (`^[A-Z]{5}\d{4}[A-Z]$`), `validatePhone` (`^[6-9]\d{9}$`), `validatePincode` (`^\d{6}$`), `validateAadhaar` (12 digits after stripping spaces). **Zero call sites anywhere in `src/` — neither the catalogs' `validationPattern`s nor these functions are ever invoked.** Onboarding wizards import only the list constants (states/bloodGroups/etc.).

### 3I. `unified-data-helpers.ts` (cross-panel joins — mostly orphaned)
- `getUnifiedProductCatalog()` — merges stockist `mockProducts` with pharmacy `products` — **unused**.
- `getLiveInventoryForPatients(maxDistance=10)` — **used by PatientSearch**: takes sale-view `inventoryItems` (live & in stock, =6 products), pairs each with up to 5 open nearby pharmacies within range, price = `sellingPrice + idx * Math.floor(Math.random()*5)` → **prices randomize on every call**.
- `getPatientConsultationHistory(patientId)`, `getDoctorPatients(doctorId)`, `getPatientPrescriptionVault(patientId)`, `getPlatformMetrics()` (real computed platform totals incl. `todayCount: 45 // Mock`) — all **unused**; the admin dashboard uses hardcoded `platformStats` instead.
- Used-ish utilities: `formatCurrency`, `getTimeAgo`, `getOrderStatusColor/getPaymentStatusColor` (string→tailwind class maps).

## PART 4 — PER-PAGE DETAIL: AREAS COVERED THINLY ABOVE

(Sections 1–8 of the base review already document each module page-by-page; this part fills the remaining thin spots verbatim from code.)

### 4A. NotFound (`*` catch-all, `src/pages/NotFound.tsx`)
Minimal centered page: `useEffect` logs `console.error("404 Error: User attempted to access non-existent route:", location.pathname)`; renders "404 / Oops! Page not found" and a plain `<a href="/">Return to Home</a>` (full page reload → `/auth`). This is the landing surface for all ~20 dead links in §0.3.

### 4B. GuidedTour (`src/components/stockist/GuidedTour.tsx`) — exact step copy
5 steps, each `{icon, title, description}` with a positioned highlight card: 1. **Quick Actions** — "Create orders and bills quickly with one tap. Use OCR scanning to extract items from photos or paste WhatsApp messages directly." (the OCR claim refers to the orphaned OCRScanDialog); 2. **Financial Summary** — outstanding/credits/today's collections; 3. **Payment Approvals** — approve payment screenshots; 4. **Bottom Navigation**; 5. **Profile & Settings**. Controls: progress dots, Skip (any step), Back/Next, "Get Started" on step 5. Both skip and finish call the same completion path → `localStorage.setItem('stockist_tour_completed', 'true')`. StockistHome shows it via a 500 ms `setTimeout` when the flag is absent; StockistMore's "Replay Welcome Tour" removes the flag.

### 4C. Pharmacy settings pages (full field lists)
- **ProfileSettings** (`/pharmacy/settings/profile`): local `formData` = pharmacyName "HealthPlus Pharmacy", ownerName "Dr. Rajesh Kumar", email "healthplus@pharmacy.com", phone "+91 98765 43210", alternatePhone "+91 98765 43211" (all plain Inputs, no validation). Photo-change button + Save → `toast("Profile updated successfully")` only.
- **BusinessSettings** (`/pharmacy/settings/business`): prefilled from `defaultPharmacyData` — storeName, ownerName, panNumber; licenses drugLicense/gstNumber/retailLicense/shopLicense; three `DocumentUpload`s (drugLicenseDoc/gstCertDoc/retailLicenseDoc, all `/placeholder.svg`); address/city/state/pincode; openTime/closeTime; yearEstablished "2018". Save → toast only.
- **SecuritySettings** (`/pharmacy/settings/security`): Change Password (current/new/confirm; only check = new===confirm else destructive toast); 2FA Switch → toast "2FA Enabled/Disabled". No sessions list (unlike the stockist version).
- **AppSettings** (`/pharmacy/settings/app`): Switches — Push Notifications, Email Notifications, Order Updates, Offer Alerts, Price Drop Alerts, **Dark Mode (state+toast only, never applies a class — inert)**, Vibration; Language Select (English/हिंदी/मराठी/ગુજરાતી…) → toast "Language updated" (no i18n exists); every toggle toasts "Settings updated". All state component-local.

### 4D. AuthPage mechanics recap + additions
Role state lives in two separate `useState`s (`selectedLoginRole`, `selectedRole` for signup) so the tabs don't share a selection. Two `useEffect`s re-prefill credentials whenever either role changes, overwriting anything the user typed. Nothing is ever checked: any credentials (or none) log in, because `handleLogin`/`handleSignup` only `navigate()`. `homeRoutes` map: stockist→`/stockist/home`, pharmacy→`/pharmacy/home`, patient→`/patient/dashboard`, doctor→`/doctor/dashboard`.

### 4E. Unrouted-but-complete pages (dead code, documented for completeness)
- `src/pages/Index.tsx`: gradient hero "Welcome to Your Blank App" — Lovable scaffold leftover.
- `src/pages/pharmacy/PharmacyPortal.tsx`: an alternative pharmacy landing combining purchase/sale entry points; never imported by App.tsx.
- `src/pages/pharmacy/PharmacyProfile.tsx`: profile page superseded by `/pharmacy/more` + settings; never routed.

## PART 5 — FORMS & DIALOGS: CONSOLIDATED INDEX
Every form/dialog in the app is enumerated with fields, defaults and submit behavior in the base review — §1.2 (4 onboarding wizards), §3.14–3.15 (stockist settings + 24 stockist dialogs), §4.12–4.13 (pharmacy settings + 11 purchase dialogs), §5.9–5.10 (LiveSettings + 4 sale dialogs), §6.10–6.11 (patient settings + 2 patient dialogs), §7.8 (doctor settings + WritePrescriptionDialog), §8.6 (AdminSettings), and Part 4C above (pharmacy settings field lists). Universal invariants, true of **every** form in the app:
1. **No schema validation** — react-hook-form + zod are installed but no form uses them; the only checks are ad-hoc "required present", "passwords match", "≥ 6 digits OTP", "quantity > 0".
2. **No submission target** — every submit handler ends in `toast()` and/or `navigate()`; no fetch, no mutation, no localStorage (except the tour flag).
3. **Prefilled demo data** — onboarding and settings forms initialize from `demo-credentials.ts` defaults or inline hardcoded strings.
4. **File inputs never upload** — `DocumentUpload` keeps an object-URL preview; UploadDocumentDialog fakes a filename; UploadPrescriptionDialog awaits a 1.5 s timeout.
5. **The regulatory validators and per-document `validationPattern` regexes (Part 3H) are the designed-but-unwired validation layer.**

## PART 6 — WORKFLOWS END-TO-END (as they actually execute)

### 6A. Sign-up → Onboarding → Home (any role)
`/auth` Sign Up tab → pick role → prefilled email + `Demo@123`×2 → "Continue to Onboarding" → `/{role}/onboarding` (standalone, scroll-locked). Wizard steps advance freely: **no field is validated, no upload is stored, the never-called validators in `regulatory-documents.ts` sit alongside the fields they were written for.** Skip (header) and Complete (last step) are equivalent: success toast → navigate to role home. Nothing about the entered profile appears anywhere afterward — every page keeps showing its own hardcoded identity (e.g. "HealthPlus Pharmacy", "Rahul Sharma", "Dr. Arun Sharma").

### 6B. Stockist "AI" order recording (CreateOrder / QuickOrderDialog)
1. Choose pharmacy from the 8-circle Select. 2. Paste free text ("AI Parsing" Sparkles badge is decoration). 3. `handleParseOrder`: split on newlines → regex `/^(.+?)\s+(\d+)\s*$/` per line → case-insensitive substring match against the 10 `mockProducts`; hit ⇒ ParsedItem(rate = salePrice), miss ⇒ unmatched row with a manual "Match product…" Select. 4. Edit quantities (amount recomputes), remove rows. 5. Summary: `subtotal = Σ matched`, `gst = subtotal*0.18`, `total`. 6. "Create Order" (requires pharmacy + ≥1 matched) → toast "Order created" → back to `/stockist/orders`, where the order does **not** appear.

### 6C. Bill create + WhatsApp share (CreateBill page ≅ QuickBillDialog)
Stage 1 *select*: pharmacy → its unpaid orders (`paymentStatus !== 'paid'`) w/ checkboxes; discount type percent|fixed + value. Totals from real order fields (Σ totalAmount / Σ gstAmount / Σ subtotal); `finalAmount = total − discount`; `billNumber = 'BILL-' + String(Date.now()).slice(-8)`. Stage 2 *preview*: printable GST bill — seller block hardcoded ("MedKart Distribution", GSTIN `27AABCU9603R1ZM`). Stage 3 *success*: share row. **The only real side effect in the whole flow: "Share on WhatsApp" opens `https://wa.me/91{pharmacy.phone}?text={encoded bill summary}` in a new tab.** Print = `window.print()`; Download/Copy Link = toast/clipboard. The bill is never stored; revisiting shows nothing.

### 6D. Incoming order accept/decline (stockist)
Home banner or Orders "New" tab (5 seeded, all `new`) → `IncomingOrderCard` → **AcceptOrderDialog** (edit per-item qty, GST recomputed at 12% here, delivery date default tomorrow) or **DeclineOrderDialog** (reason radio + message). Both resolve to a toast; the order stays `new` forever (arrays are const).

### 6E. Payment collection & approval (stockist)
Pharmacy detail "Collect Payment" → CollectPaymentDialog (amount, 25/50/100% quick buttons, method, reference) → toast. Payment approvals: Home/Payments tab → PaymentApprovalDialog → approve (editable amount + notes) / hold / reject (reason required) → toast; the two pending payments remain pending. SendReminderDialog runs a 5-step simulated WhatsApp bulk-send with `setInterval` progress theatre.

### 6F. Pharmacy purchase flow (browse → cart → checkout)
Browse/product pages use the real shared catalog and AddToCartDialog — but **AddToCartDialog only toasts; nothing joins the cart**. `/pharmacy/cart` renders its own fixed 3-item local array with non-functional +/−/clear/Place-Order. `/pharmacy/checkout` (reached only via direct URL or SmartOrder's dead end — the Cart's Place Order button has no handler) uses the *shared* 5-item `cartItems`, computes subtotal + 18% GST + free delivery, lets you pick a payment radio, then "Place Order" → toast → hardcoded success `#ORD-2025-0042`. The three surfaces (catalog, cart page, checkout) never exchange state.

### 6G. Smart Order "AI" (pharmacy)
Step 1: type/paste list → "Process with AI" → 1.5 s spinner → regex `/(\d+)\s*(strips?|tablets?|bottles?|boxes?)?/i` + first-word/brand substring match against the 15 shared products. Step 2: review matched (with live best price) / unmatched. Step 3: three "recommendations" — Cheapest = Σ(bestPrice×qty); Quickest = base×1.1 rounded, "1 stockist"; Best Value = base×1.05, "2 stockists" (pure placeholder arithmetic). "Add to Cart & Review" → toast → `/pharmacy/cart` (the hardcoded cart — chosen items vanish).

### 6H. Go-live & storefront settings (pharmacy sale)
SaleDashboard live Switch, GoLiveDialog and `/pharmacy/sale/settings/live` all copy `liveSettings` into local state (isLive, deliveryEnabled, radius 1–15 km slider, minimumOrder, deliveryFee, hours) — Save toasts; since the module constant is never written, each surface re-opens with the seed values, and patient search (`getLiveInventoryForPatients`) always sees the 6 seeded live products regardless of any toggling.

### 6I. Simulated voice consultation (pharmacy sale ↔ doctor)
StartConsultation page (and StartConsultationDialog / RecordPatientDialog): mic button → 3 s `setTimeout` → fields fill with the fixed transcript (`patientName "Recorded Patient"`, `symptoms "Fever, headache, body pain"`). Pick one of 3 available doctors → summary + voice/video choice → "Connect" toast → step 4 "In Progress" screen with fake timer → "End Call" toast → back to consult list (no consultation record created). On the doctor side, "Start Call" anywhere is a toast; writing a prescription is unreachable (navigates to unrouted `/doctor/prescriptions/new`, the built WritePrescriptionDialog being orphaned).

### 6J. Patient prescription upload & consultation booking
UploadPrescriptionDialog: choose file (Browse works; Camera decorative) + notes → "Upload" → 1.5 s await → success toast (copy promises AI extraction; none exists). BookConsultationDialog: 3 steps — pick from `mockDoctors.filter(status==='active').slice(0,10)`, enter symptoms* + type + preferred-time Select, confirm → toast; no appointment materializes anywhere.

## PART 7 — COMPLETE USER JOURNEYS PER ROLE (what a demo user actually experiences)

- **Stockist:** login → GuidedTour (once) → Home KPIs (mix of computed and the hardcoded ₹45,000 collection) → triage 5 incoming orders (toasts) → browse 8-pharmacy circle w/ credit math → products w/ real low-stock/sort/filter → record order via paste-parse (§6B) → bill + real WhatsApp share (§6C) → payments (all approvals toast) → analytics (hardcoded charts, real top-5 lists) → ~10 operational pages with page-local data → settings (any-OTP verification, inert theme). Persistent effect after a full session: **one localStorage flag.**
- **Pharmacy (purchase):** login → hardcoded KPI home → browse real catalog + price comparison across 8 stockists → cart/checkout disconnect (§6F) → SmartOrder demo (§6G) → orders list (local, tabs mostly placeholder) vs order detail (real shared data, rating/issue dialogs toast) → payments/wishlist/notifications/messages (send button dead) → More → "Switch to Sale View".
- **Pharmacy (sale):** dashboard (today stats = 0 due to 2025 seeds; 1 pending consult) → inventory live toggles (local) → SaleOrderDialog walk-in sale (real local cart, toast on complete) → customers (5) → consultation flow (§6I) → reports (period selector cosmetic) → live settings (§6H) → switch back to purchase.
- **Patient:** login → dashboard (hardcoded KPIs, refill reminders; nearby-pharmacy links 404) → search (randomized prices from sale inventory; medicine detail 404; add-to-cart toast — **patients have no cart route at all**) → prescription vault (150 generated; detail 404) → orders (200 generated; detail page always shows ORD-P-001) → consultations (list local; detail always CONS-001; booking toast) → wishlist (2 fixed items, dead buttons) → profile/settings (medical chips genuinely editable locally).
- **Doctor:** login → dashboard (earnings computed, patients hardcoded 50) → appointments (23; Start Call toast; Prescribe → 404) → patients (50 generated) → prescriptions (16, read-only) → earnings (withdraw toast) → availability editor (real local slot editing) → bank settings reachable only by URL.
- **Admin:** Admin Login button → dashboard (hardcoded `platformStats` + hardcoded charts; Review buttons dead) → Users (235, paginated to 20, actions toast) → per-role pages (independent 5-row arrays whose View links land on "User Not Found" because AdminUserDetail only knows `stockist-1|pharmacy-1|doctor-1`) → orders/payments/consultations read-only feeds → reports (export toasts) → settings (uncontrolled inputs; Save doesn't read them).

## PART 8 — CONSOLIDATED REFERENCE: CALCULATIONS, VOCABULARIES, DEAD CODE

### 8A. Calculation reference (formula → where)
| Formula | Surfaces |
|---|---|
| `gst = subtotal × 0.18` | stockist OrderDetail, CreateOrder, QuickOrderDialog; pharmacy Checkout |
| `gstAmount = item × 0.12` | stockist AcceptOrderDialog (per edited line) |
| per-product `gstRate` (5/12) | mock seed data only (Order.gstAmount, ProductDetail batch card) |
| `netDue = outstandingBalance − creditBalance` | stockist pharmacies filter chips + PharmacyDetail (negative → "CR") |
| `creditUsage% = outstanding / creditLimit × 100` (clamped 100; >80 red, >60 amber) | PharmacyDetail |
| `margin% = (mrp − salePrice)/mrp × 100` | stockist ProductDetail |
| `pendingAmount = totalAmount − Σ approved payments` | stockist OrderDetail, Payments outstanding tab |
| `finalAmount = Σ totals − discount(%/fixed)` | CreateBill / QuickBillDialog |
| best price = `min(stockistPrices.price)`; `savings = mrp − best` | all pharmacy browse surfaces |
| patient order: `deliveryFee = subtotal≥500?0:40; discount = 10% every 3rd; total = sub+fee−disc` | patient-mock-data generator |
| smart-order recs: `cheapest = Σ best×qty; quickest = ×1.1; best_value = ×1.05` | SmartOrder + orphaned SmartOrderDialog |
| doctor earning: `netAmount = amount − platformFee(10%)`; totals = Σ netAmount / Σ pending | doctor earnings/dashboard |
| collection rate `= rev/(rev×1.2) = 83.3%` (constant by construction) | StockistAnalytics |
| admin consult revenue `= Σ platformFee` | AdminConsultations |
| "today" metrics = date-string equality vs seed dates | stockist getTodaysRevenue, sale getTodaySales*/Visited-Today, doctor getTodaysAppointments → all 0 at runtime |

### 8B. Status-vocabulary matrix
| Domain | Values |
|---|---|
| Stockist Order | pending·confirmed·processing·out-for-delivery·delivered·cancelled (hyphenated) |
| Pharmacy purchase Order | placed·confirmed·processing·shipped·out_for_delivery·delivered·cancelled·returned (underscored) |
| Sale Order | pending·confirmed·preparing·out_for_delivery·delivered·cancelled |
| Patient Order | placed·confirmed·processing·out_for_delivery·delivered·cancelled |
| Incoming order | new·accepted·declined·modified |
| Payment (stockist approval) | pending·approved·rejected·on-hold |
| Payment status (order) | unpaid·partial·paid (stockist) vs pending·paid·failed (pharmacy/patient/sale) |
| Consultation | pending·in_progress·completed·cancelled (sale) / scheduled·in_progress·completed·cancelled (patient) / + no_show (doctor & admin logs) |
| Prescription (patient) | active·partially_ordered·ordered·expired |
| Earnings | pending·paid·withdrawn (withdrawn never seeded) |
| Admin user | active·pending·suspended·rejected; verification verified·pending·rejected; admin Patients page alone uses active·inactive |
| Purchase order (stockist purchases page) | draft·ordered·partial·received·cancelled |
| Credit note | pending·approved·processed·rejected; Staff active·on-leave·inactive; Route planned·in-progress·completed |
No adapter/mapper exists between these vocabularies; each module renders its own badges.

### 8C. Dead-code & orphan inventory (complete)
- **Unrouted pages:** `Index.tsx`, `pharmacy/PharmacyPortal.tsx`, `pharmacy/PharmacyProfile.tsx`.
- **Orphaned dialogs:** pharmacy `CheckoutDialog`, `SmartOrderDialog`, `ApplyCouponDialog`; doctor `WritePrescriptionDialog`; stockist `OCRScanDialog`, `MapRouteDialog`, `BillPreviewDialog`, `CreateReturnDialog`.
- **Orphaned route:** `/doctor/settings/bank` (routed, zero inbound links).
- **Dead helpers:** unified `getUnifiedProductCatalog`, `getPatientConsultationHistory`, `getDoctorPatients`, `getPatientPrescriptionVault`, `getPlatformMetrics`; pharmacy `getStockistProducts`, `getOrdersByStatus`, `getActiveOffers`, `getWishlistedProducts`, `getCartTotal`, `getCartByStockist`; all 5 regulatory validators + every `DocumentType.validationPattern`.
- **Mounted-unused libs:** TanStack Query (client + provider, zero queries), Sonner toaster (zero call sites), react-hook-form/zod (installed only).
- **Interfaces never instantiated:** `WeeklySchedule`/`TimeSlot` mocks, `VerificationState` seeds, appointment type `in_person`, earning status `withdrawn`.
- **Dead nav links (≈20, all → NotFound):** listed exhaustively in §0.3 — patient `/patient/{notifications,messages,pharmacies,pharmacies/:id,medicines/:id,prescriptions/:id,settings/{emergency,notifications,app}}`; doctor `/doctor/{messages,notifications,reports,help,settings/{security,app},prescriptions/new,prescriptions/:id}`.
- **Detail pages ignoring `:id`:** PatientOrderDetail, PatientConsultationDetail; AdminUserDetail resolves only 3 synthetic keys.
- **Only persistence:** `localStorage['stockist_tour_completed']`. Everything else resets on reload.

*End of expanded documentation (Parts 1–8).*

---

*Documentation audit pass appended below — code-derived additions only; prior content preserved.*

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
