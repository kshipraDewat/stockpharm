> **Extracted from** [`UNIFIED_FEATURES.md`](../UNIFIED_FEATURES.md) Appendix E (MVP).
> **Source repo:** `digimvplaunch (MVP)`
> Use [`EXHAUSTIVE_REVIEW_PROMPT.md`](../EXHAUSTIVE_REVIEW_PROMPT.md) to re-run or extend this review.

# Digi Swasthya (`digimvplaunch`) — EXHAUSTIVE Functional Review

> **In-product name:** Digi Swasthya ("Your Complete Healthcare Platform")
> **Type:** Multi-role B2B pharma distribution MVP / clickable prototype — **entirely client-side, no backend, no network calls.**
> **Stack:** Vite + React 18 + TS · shadcn/ui (Radix) + Tailwind · React Router v6 · TanStack Query (instantiated, unused) · React Hook Form + Zod (present, wizards use manual state) · Recharts · lucide-react · sonner + shadcn toaster · `lovable-tagger`.
> **Persistence:** two `localStorage` keys — `digi-swasthya-auth` (AuthContext) and `digi-swasthya-state` (AppStateContext). No Supabase, no fetch/axios/API layer, no service worker.

This document is code-derived and goes far deeper than `FEATURES.md`. It captures every role, route, page, section, table/column, KPI formula, tab, filter, flow, form field (type/validation/default/required), modal, calculation, status transition, edge case, and — critically — every stub / hardcoded value. Organized **module → page → (content / flows / forms & fields / logic / edge cases)**.

---

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

## 1. SEED DATA (`src/core/data/*`)

### 1.1 `users.ts`
- **1 admin:** `admin-001` Rajesh Kumar.
- **5 stockists** `stockist-001..005`: MedCorp (approved, standard_200, 147/200 bills, full profile incl. bank+UPI, 5 docs), PharmaTrade (approved, basic_100 89/100), LifeLine (**pending**, basic_100, no docs), VitalMeds (approved, premium_500 312/500), PharmaLink (approved, standard_200 78/200). All `businessType: sub_stockist`.
- **6 pharmacists** `pharma-001..006`: City Care (approved, retail), HealthPlus (approved, chain, 5 branches), Wellness (**pending**, clinic, no docs), MedMax (approved, retail), Apollo (approved, chain, 12 branches), Shree Medical (approved, retail). Each has documents, address, credit prefs.
- `pendingApprovals = [stockistUsers[2], pharmacistUsers[2]]` (exported, unused by screens).

### 1.2 `inventory.ts`
- **18 medicines** `med-001..018` across ~8 categories (Analgesic, Antibiotic, Antacid, Antidiabetic, Antihistamine, Cardiovascular, Respiratory, Thyroid) and ~10 manufacturers. Owners: med-001..008 → stockist-001, 009..012 → stockist-002, 013..014 → stockist-004, 015..018 → stockist-005.
- **med-006 Azithromycin 500mg = counterfeit (`isCounterfeit: true`)** — the one seed flagged product; its batch `batch-007` is also `isCounterfeit: true`.
- **19 batches** `batch-001..019`; MRP ~₹35–180, qty 80–500; batch-002 and batch-006 expire 2025-03/2025-04 (near past given "today" 2026-07 — thus **expired** and excluded from `totalStock`).
- `inventoryItems` derived with `lowStockThreshold: 100`.

### 1.3 `orders.ts` — **9 seed orders** `order-001..009`
Mixed statuses/types; `orderType` derived from a hardcoded `circleMap` (stockist-001 ↔ pharma-001/002/004/005/006; stockist-002 ↔ pharma-001/002). Payment fields derived from seed payments. Examples: order-001 delivered ₹3384 (fully paid), order-002 confirmed ₹3852 (₹2000 partial), order-003 placed ₹9363 PLATFORM (unpaid), order-004 dispatched ₹1109 (stockist→pharmacy), order-006 confirmed ₹10117 (₹5000 partial), order-008 placed ₹1747 (unpaid). Grand totals ~₹1,109–10,117.

### 1.4 `payments.ts`
- **6 payments** `pay-001..008` (gap in numbering); methods bank_transfer/upi/cash; statuses paid/partial.
- **15 ledger entries** `led-001..015` with running balances (DEBIT on order, CREDIT on payment).
- `creditSummary` (outstanding ₹15,355 / overdue ₹1,109 / limit ₹50,000 / used ₹15,355 + 5 credit entries) — exported, **not consumed by any screen**.

### 1.5 `banners.ts`
- **3 banners** `ban-001` (Year-End Sale, pharmacists), `ban-002` (New Subscription Plans, stockists), `ban-003` (Platform Maintenance, all). All active.
- **5 notifications** `notif-001..005`.
- **5 commissionRules** `comm-001..005` (rates 4–8%).
- **11 `circlePharmacies`** (`CirclePharmacy[]` with `customPricing`/`priceModifier`) — exported, **not used** (the app uses `CircleEntry[]` in the context instead). `priceModifier`/`customPricing` are never applied anywhere.

---

## 2. AUTHENTICATION, REGISTRATION & ONBOARDING

### 2.1 AuthPage (`/auth`) — default entry
- **Content:** card with animated inline SVG `MedicineIllustration`, title "Digi Swasthya" / "Your Complete Healthcare Platform", Login/Sign-Up tab toggle, role selector (**Stockist / Pharmacy only** — admin excluded), form, demo hint, "Admin Login" footer link, copyright.
- **Role selector:** two big buttons (Stockist "Distribute to pharmacies", Pharmacy "Buy & sell medicines"). In Login mode a "Click to prefill demo" (Sparkles) link fills `dummyCredentials` for the selected role and toasts.
- **Login form fields:** Email (type email), Password (with eye toggle), "Remember me" checkbox (**unwired**), "Forgot Password?" → `/forgot-password`. Submit: requires non-empty email+password (else inline "Please enter email and password"), calls `login(email,password,role)` → toast "Welcome back!" → `/dashboard`. (Always succeeds.)
- **Sign-Up form fields:** Email, Password (eye), Confirm (eye). Submit validates: both filled ("Please fill in all fields"), match ("Passwords do not match"), min length 6 ("Password must be at least 6 characters"), then `navigate('/register/{role}')`. Button text "Continue to Onboarding" (misleading — goes to registration wizard, not Onboarding).

### 2.2 Login.tsx (`/login` is redirected away; reachable only if routed directly)
- Animated `DeliveryIllustration` (van driving to a pharmacy). Email + Password (eye) + Remember me (unwired) + Forgot password.
- **Role auto-detection from email:** contains `medcorp`/`pharmatrade`/`lifeline` → stockist, else pharmacist. Then `login()`.
- **Hidden admin gate:** tapping the logo **5×** → `/admin-login` (`handleLogoTap`).
- "Sign Up" link → `/signup` (redirected to `/auth`).

### 2.3 Signup.tsx (`/signup` is redirected away; component still exists)
- Role picker cards (Pharmacy / Stockist) with feature bullet lists; "Continue as {role}" → `/register/{role}`; "Sign In" → `/login`.

### 2.4 AdminLogin (`/admin-login`)
- Header "Admin Access / Platform management console", Email (placeholder `admin@digiswasthya.com` — note `.com`, but real dummy is `.in`), Password (eye). Submit → `login(email,password,'admin')` → toast "Welcome back, Admin!" → `/dashboard`. "← Back to Sign In" → `/login`.

### 2.5 StockistRegistration (`/register/stockist`) — **7-step wizard**
Steps: **Business · Documents · Contact · Delivery · Rules · Financial · Review**. Header shows "Stockist" badge + "{step+1}/7"; `RegistrationProgress` bar; sticky Previous/Next/Submit footer.

Validation via `REGEX` (pan `^[A-Z]{5}[0-9]{4}[A-Z]$`, phone `^\d{10}$`, email, pincode `^\d{6}$`) and `getFieldError` (also gst=15 chars, ifsc=11 chars, password ≥6). `requiredFields` per step; `validateStep` blocks Next and toasts "Please fix errors".

- **Step 0 Business:** Business Name*, Business Type* (select: Sub-Stockist enabled; **Super Stockist / Distributor disabled "Coming soon"**), Years in Business* (0_1…10_plus), GST Number* (15-char), PAN Number* (regex), Drug License Number*.
- **Step 1 Documents:** four cards. (1) Wholesale Drug License — Form 20B: License Number* + FileUpload. (2) GST Certificate: GST Number* + FileUpload. (3) Form 21B Restricted (Optional): number + FileUpload. (4) FSSAI (Optional): number + FileUpload. Required: `wholesale_drug_license`, `gst_cert_number`.
- **Step 2 Contact:** Contact Person Name*, Phone* (tel), WhatsApp (tel), Email*, Password* (min 6). Office Address*, Google Maps Location (Office) with MapPin, "Same as office" **Switch** (copies office → warehouse address+maps), Warehouse Address (disabled when switch on), Warehouse Maps (hidden when switch on), State* (select), City*, Pincode*.
- **Step 3 Delivery:** Delivery Days* (7 toggle chips Mon–Sun), Delivery Time Slots* (morning/afternoon/evening/full_day toggle chips), Serviceable Pincodes* (6-digit input + Add button/Enter, chips with remove X; only valid 6-digit + non-duplicate accepted), Service Radius (km, optional). NOTE: day/slot/pincode requiredness is visual only — `requiredFields[3]` is undefined, so Next does not actually validate them.
- **Step 4 Rules:** Default Credit Limit (₹)* , Default Credit Days*, Minimum Order Quantity (₹)*, Delivery Charges card: Charge Type* (free/flat/free_above/distance) → conditional sub-fields (flat: Flat Rate; free_above: Free Above Amount + Charge Below Amount; distance: Rate per KM + Base Charge). NOTE: `requiredFields[4]` undefined → Next doesn't hard-validate these either.
- **Step 5 Financial:** Account Holder Name*, Bank Name*, Account Number*, IFSC Code* (11-char), UPI ID (optional).
- **Step 6 Review:** 5 `ReviewCard`s (Business, Documents+uploaded-doc thumbnails, Contact & Address, Delivery, Business Rules, Financial) each with Edit jump-links. Delivery-charge label composed via `getDeliveryChargeLabel()`. **Required T&C + Privacy checkboxes** (Submit disabled until both checked). Submit → if both accepted, opens success modal (else toast).
- **Success modal:** "Registration Submitted!" + "verification 24–48 hours". "Start exploring now" → `handleEnterApp` = `login(formData.email || 'stockist@demo.com', 'password', 'stockist')` → `/dashboard`. "Go to Sign In instead" → `/login`.
- **CRITICAL STUB:** the wizard **never calls `registerStockist`.** No pending account is created; the collected data is discarded; the user just enters a demo stockist session. Admin approval queues are fed only by seed data + stockist-created circle pharmacies.

### 2.6 PharmacyRegistration (`/register/pharmacist`) — **5-step wizard**
Steps: **Business · Documents · Contact · Config · Review**. "Pharmacy" badge; same progress/footer pattern. `requiredFields` are **dynamic** by pharmacy type via `getRequiredFields(pharmacyType)`.

- **Step 0 Business:** dynamic hint (chain: "add locations after approval"; clinic: "simplified GST"). Pharmacy Name*, Pharmacy Type* (Retail/Chain/Clinic enabled; **Hospital disabled "Coming soon"**), Legal Entity* (proprietorship/partnership/private_limited/llp), PAN*, GST Number (optional; clinic shows "Optional for clinics" helper), **Number of Branches*** (only if type=chain), Pharmacist Name*, Registration Number*.
- **Step 1 Documents:** Drug License card (License Number* + Expiry Date* [type=date] + FileUpload), Form 20 card (Form 20 License Number* + FileUpload), Form 21 Schedule C/C1 (Optional: number + FileUpload), **GST Certificate card (hidden entirely for clinic)** — GST Number* + GST Type* (regular/composition) + FileUpload, Pharmacist Registration Certificate (Registration Number* + FileUpload). For clinic, gst_cert_number/gst_type are not required.
- **Step 2 Contact:** Owner/Contact Name* with "Same as pharmacist" Switch (copies pharmacist_name), Designation (optional), Phone* (tel), WhatsApp (tel), Email*, Password* (min 6), Full Address*, Landmark (optional), State*, City*, Pincode*, Google Maps Location (optional). Chain type shows an info banner.
- **Step 3 Config:** Monthly Purchase Range* (lt_50k / 50k_2l / 2l_5l / 5l_plus), Preferred Categories* (11 chips: Antibiotics, Analgesics, Cardiovascular, Diabetes, Dermatology, Gastro, Neurology, Respiratory, Vitamins, Ayurvedic, OTC) + Select All/Deselect All toggle, Credit Required* Switch → when on: Credit Amount Needed (₹)* + Expected Credit Days* + **live credit-risk evaluation** card.
  - **`getCreditEvaluation` logic:** maps purchase range → number (lt_50k=30000, 50k_2l=125000, 2l_5l=350000, 5l_plus=700000). `ratio = credit/purchase`, `days = parseInt(creditDays)||30`. Buckets: ratio≤0.25 & days≤15 → 2 months / **low**; ratio≤0.5 & days≤30 → 3 / **standard**; ratio≤0.75 → 4 / **moderate**; else → 5 / **high**. Card color + message vary by risk; shows "{ratio}% credit-to-purchase ratio" and "{months} months" observation. If purchase or credit missing → info prompt.
- **Step 4 Review:** 3 ReviewCards (Business, Documents+thumbnails, Contact & Address, Business Configuration incl. computed Eval Period), T&C + Privacy checkboxes, Submit → success modal → `handleEnterApp` = `login(email || 'pharmacy@demo.com', 'password', 'pharmacist')`.
- **CRITICAL STUB:** never calls `registerPharmacist`. Same demo-session behavior as stockist.

### 2.7 Registration form components
- **FormField:** label(+required *), Input (type text/tel/email/number/date/password), onChange(name,value), optional onBlur, helper, error. Error styling on the input.
- **SelectField:** Radix Select; options may be `disabled` with a "disabledLabel" pill ("Coming soon").
- **FileUploadField:** click or drag-drop; accepts `.pdf,.jpg,.jpeg,.png`; **5 MB cap — oversized files silently dropped** (early `return`, no error shown). Preview via `URL.createObjectURL`. Nothing uploaded anywhere.
- **RegistrationProgress:** step dots + progress line; checks completed steps.

### 2.8 Onboarding (`/onboarding`)
- 3-slide animated carousel; slide set chosen by `localStorage 'onboarding_role'` (default stockist). Slides: stockist(Distribution/WhatsApp bills/Payments) or pharmacist(Order/Track/Bills). Dots, Next/Get Started, Skip. Sets `localStorage 'onboarding_seen'='true'` → `/login`. Collects nothing. **Not linked from any main flow** (registration goes straight to dashboard).

### 2.9 Password recovery — **STUBS**
- **ForgotPassword:** Email field → Submit awaits **1200ms** → `sent=true`, toast "Email Sent". Shows "reset link sent to {email}" + Back to Login. No email, no persistence.
- **ResetPassword:** New Password + Confirm; validates min-6 + match; awaits 1200ms → done screen + toast. No persistence. (Route exists but nothing links to it.)

---

## 3. STOCKIST MODULE

Every stockist screen scopes to `user?.id`, with `'stockist-001'` fallback in several (CreateOrder, QuickBill, CirclePharmacies, FindPharmacy, HolidayManagement).

### 3.1 StockistDashboard (`/dashboard` when role=stockist)
- **Sections:** active stockist/all Banner (CTA navigates to `ctaUrl`), Quick Actions (3×2 grid), circle-count banner (→ `/stockist/circle`), 6 KPI cards, Monthly Order Trend BarChart, Top Pharmacies by Revenue, Top Products by Sales, Recent Orders (first 5).
- **Quick Actions (navigate-only):** Create Order `/stockist/orders/create`, Quick Bill `/stockist/quick-bill`, Collect Payment `/stockist/payments`, Add Pharmacy `/stockist/circle/find`, Bulk Upload `/stockist/inventory/upload`, Upload Bill `/stockist/inventory/bills`.
- **KPI formulas (all real, read-only):** `stockistOrders` = orders where placedTo/placedBy = me. Pending Orders = count of status placed+confirmed. Total Products = my inventory count. Pharmacies = my circleEntries count (also the banner count). Revenue = `Σ grandTotal of delivered` shown `₹{(x/1000).toFixed(0)}K`. Outstanding = `max(0, Σ grandTotal of ALL my orders − Σ paid payments with status 'paid')` (note: sums *all* order value, not just unpaid — differs from the FIFO/outstanding math elsewhere). Stock Value = `Σ sellingPrice × quantity` over batches (includes expired).
- **Monthly chart:** last 6 months, order **count** per month by createdAt.
- **Top Pharmacies:** by `Σ grandTotal` of delivered orders, top 3. **Top Products:** by `Σ quantity` across all order items, top 5.
- **Recent Orders:** first 5 `stockistOrders`, each → `/orders/{id}`; StatusChip success/destructive/primary.

### 3.2 Inventory (`/stockist/inventory`)
- Scoped to `medicine.stockistId === user.id`. 600ms skeleton.
- **Content:** search box, Add button (→ add), Filters button (badge = active filter count), grid/list toggle, active-filter chip row, action buttons (Bulk Catalogue/Purchase Bill/Bulk Price), product grid or list.
- **Filters dialog fields:** Categories (multi-select chips from own inventory), Brand/Manufacturer (search box + checkbox list), Expiry (all / soon <30d / 1-3 months = 30–90d / 3-6 months = 90–180d — matches if ANY batch qualifies), Stock Availability (all/in_stock/low/out; low = `totalStock <= 100 && >0`), Price Range Min/Max (against `batches[0].sellingPrice`). Apply/Reset.
- **Card content:** image placeholder (Package icon), badges — Out of Stock (if totalStock 0), Rx (if category Antibiotic & not OOS), Flagged (Shield, if counterfeit), edit pencil (→ edit). Name, manufacturer, category pill, sellingPrice + struck MRP, "Buy: ₹{purchase} · Margin {X}%" where `margin = round(((sell−purchase)/purchase)×100)`, Stock count, earliest expiry (month/year).
- **List row:** icon, name, manufacturer·category, price+MRP+margin, right: totalStock (orange if ≤ threshold) + batch count.
- **Empty state** adapts (filters/search present → "Clear Filters"; else "Add Product").
- **Stubs:** no delete. `batches[0]` used for price/margin display (multi-batch shows only first).

### 3.3 AddItem (`/stockist/inventory/add`)
- **Sections/fields:** Product Images (dead placeholder — "Image upload will be available with backend integration"). Basic: Product Name*, Brand, Manufacturer*, Category. Pricing & Inventory: MRP*, Sale Price, Purchase Rate, Stock Qty*, Min Stock Level (**default '100'**). Batch & Compliance: Batch Number*, Expiry Date* (date), Mfg Date, HSN Code, GST Rate (plain text). Regulatory: Drug Schedule, Drug Type, Composition/Salt, Pack Type, Pack Size, FSSAI License. Additional: Requires Rx checkbox, Narcotic checkbox.
- **Validation (`validate`):** name, manufacturer, batchNumber, expiryDate required; expiry must be future; MRP numeric; salePrice ≤ MRP; stockQty numeric.
- **Submit:** 500ms delay → `addProduct(medicine, batch)` (**real, persisted**). genericName defaults to composition||name; category defaults 'General'; sellingPrice defaults salePrice||MRP.
- **Stubs:** `gstRate`, `fssaiLicense`, `brand`, `minStock` are **NOT passed** to addProduct (brand/gstRate/fssai/minStock discarded). `requiresRx`/`isNarcotic`/`drugSchedule`/`drugType`/`packType`/`packSize`/`composition` ARE passed to the medicine object.

### 3.4 EditProduct (`/stockist/inventory/:id/edit`)
- Same layout as AddItem, prefilled from `item` + `batches[0]`. Image placeholder present.
- **Validation:** name/manufacturer required; if expiry set must be future; salePrice ≤ MRP; MRP numeric.
- **Submit:** 500ms → `updateMedicine({name, manufacturer, category, genericName, hsn})` + `updateBatch(batches[0] fields: mrp, sellingPrice, purchasePrice, quantity, batchNumber, expiryDate)`.
- **Stubs:** only edits `batches[0]` — **multi-batch products lose edits to other batches** (updateBatch updates one). Fields gstRate, packSize (default '10 Tablets'), requiresRx, isNarcotic, drugSchedule, drugType, packType, fssaiLicense, brand are shown/prefilled but **never persisted**.

### 3.5 ProductDetail (`/stockist/inventory/:id`)
- **Content:** back + Edit button (Copy/Trash icons imported but **not rendered/unwired**). Title/manufacturer/category. Total Stock card (nos, min, active-batch count). Sales History (6-month) **real** BarChart from non-cancelled orders' items for this med (units). Product Details table. Pricing table (per-batch MRP/Sale/Purchase + HSN + total stock value). Batch History list (expired rows highlighted). Counterfeit warning banner if flagged.
- **Add Batch flow:** "Quick Add" (prefills batchNumber `BATCH-{ts36}`, qty 100, prices from batches[0]) or "Add Batch". Dialog fields: Batch Number*, Quantity*, MRP, Purchase Price, Selling Price, Mfg Date, Expiry Date*. Validation: batchNumber+quantity+expiry required, expiry future, sellingPrice ≤ MRP. Calls `addBatch` (**real**).

### 3.6 BatchManagement (`/stockist/batches`)
- Read-only, scoped to `batch.stockistId === user.id`. 600ms skeleton. Search (batch# or med name). Tabs: All / Expiring Soon (≤ **90 days**) / Counterfeit.
- Row: icon (Shield if counterfeit), batch#, med name, qty, expiry StatusChip (Expired <0 / Expiring Soon ≤90d / Valid), MRP/Purchase/Expiry grid, counterfeit banner "Flagged by Admin" (display-only).

### 3.7 CirclePharmacies (`/stockist/circle`)
- **Content:** "My Pharmacies" + Add button (→ find). Filter tabs: **All / Outstanding / Credit / No Dues** — **Credit tab count is hardcoded 0** and its filter returns all (no distinct filter). Per-pharmacy card.
- **Card:** Store icon, pharmacyName/name, dropdown menu (New Order → create, Create Bill → quick-bill, Send Reminder [disabled if no outstanding]), chevron → detail. 3 KPIs: Outstanding (orange), Credit (primary), Net Due (`credit − outstanding`, shown "… CR"). Bottom "Collect Payment" bar.
- **`getCreditData`:** `outstanding = max(0, Σ grandTotal of non-cancelled pharma orders − Σ all payments for those orders)`; `credit = circle.creditLimit || 175000` (**hardcoded fallback 175000**).
- **Collect Payment flow (FIFO):** modal fields — Amount (₹, prefilled to outstanding), Payment Mode (Cash/UPI/Bank Transfer/**Cheque**), Date (date), Notes. On confirm: builds order-dues list (remaining = grandTotal − paid, >0), loops in order applying `min(remaining, due)` via `addPayment({method, paidAt, reference: {MODE}-{ts}})`. Toast. `cheque` is cast onto the method union (persists as 'cheque' string, off-type).
- **Send Reminder flow:** modal — Message Type toggle (Common for All / Individual — **purely visual, unused**), Message textarea (default text), Reminder Priority select (low/medium/high — **collected but not passed** to sendReminder). Confirm → `sendReminder({channel:'whatsapp'})` + toast. No real message; reminderType/priority discarded.

### 3.8 CirclePharmacyDetail (`/stockist/circle/:id`)
- **Header card:** pharmacyName/name, edit-credit pencil + credit-card icon. Phone with `tel:` link + clipboard copy (real). Address line. **Credit Usage** progress bar `usagePercent = min(100, outstanding/creditLimit×100)`; 3 stats Outstanding/Credit Limit/Available (`credit − outstanding`). "Collect Payment — ₹{outstanding}" button (if outstanding>0).
- **Tabs:** Orders (count) / Payments (count) / Bills / Ledger.
  - Orders: list of pharma↔stockist orders → `/orders/{id}`.
  - Payments: payment rows (method, paidAt, reference, amount).
  - Ledger: table Date/Description/Debit/Credit/Balance filtered to this pharmacy↔stockist pair.
  - **Bills: static message** "Bills are generated when orders are confirmed".
- **Outstanding orders / due dates:** `dueDate = createdAt + creditDays × 86400000`.
- **Collect Payment modal:** Credit Limit + Outstanding stat tiles; Amount (₹) + "Full" prefill; **FIFO allocation preview** (oldest-first; each row marked "Fully covered"/"Partial" with due date); Payment Method grid (Cash 💵 / UPI 📱 / Bank Transfer 🏦 / Cheque 📝); Reference/Transaction ID. Confirm → `addPayment` per allocation. **Fidelity loss:** method mapping `bank→bank_transfer`, **`cheque→cash`** (cheque recorded as cash here, unlike CirclePharmacies which keeps 'cheque').
- **Edit Credit modal:** Credit Limit (₹) + Credit Days → `updateCircleEntry` (real, validated >0). **Remove from Circle** → `removeCircleEntry` + toast + back (real).

### 3.9 FindPharmacy (`/stockist/circle/find`)
- **Content:** search (name/owner/pincode) + "New" button. List of approved (or `circle_only` cast) pharmacies with "In Circle" tag or "Add" button.
- **Add-to-Circle modal:** shows pharmacy; Credit Limit (₹, default 25000), Credit Days (default 30), Notes → `addCircleEntry` (real; auto-connects stockist for that pharmacy).
- **Create New Pharmacy modal:** "personal circle pharmacy not on platform". Fields: Pharmacy Name*, Owner Name, Phone*, City, PIN Code, GST (optional) + Credit Settings (Limit/Days). On create: builds a `PharmacistProfile` id `pharma-circle-{ts}`, **`status:'approved'`, hardcoded `state:'Maharashtra'`, `pharmacyType:'retail'`**, calls `registerPharmacist` (which forces `status:'pending'`!) then `addCircleEntry` (auto-joins circle). **Note:** because registerPharmacist overrides status to 'pending', the new circle pharmacy is stored pending, but it still appears in the circle via the circle entry. Validation: name+phone required.

### 3.10 CreateOrder (`/stockist/orders/create`)
- Single-page order for a circle pharmacy. Inventory scoped to my stockist, in-stock, non-counterfeit.
- **Content:** "Record Offline Transaction" toggle, Select Pharmacy (search over circle), Add Items (search, max 8 shown, add/qty steppers), Selected Items list (qty steppers + **editable unit price** input), Summary (Subtotal / Tax 12% / Grand Total).
- **Logic:** offline toggle → status `confirmed` (deducts stock immediately) else `placed`. `orderType:'CIRCLE'`, `type:'stockist'`, `paymentStatus:'pending'`, discount 0. Batch pick = **FEFO** (future expiry, qty>0, non-counterfeit, earliest expiry first). tax `round(subtotal×0.12)`, per-item tax `round(itemTotal×0.12)`. Calls `validateStock` (blocks on error toast) then `createOrder` after 1500ms. **No credit-limit check.** Toast + → `/stockist/orders`.

### 3.11 QuickBill (`/stockist/quick-bill`) — WhatsApp→bill, 5-step
Steps: Paste Message · Review Items · Select Pharmacy · Edit & Add · Confirm Bill. Progress bars.
- **Step 0:** Textarea for WhatsApp text (placeholder sample). Parse button.
- **Parsing (`parseWhatsAppMessage`):** split by newline; quantity via regex `/(\d+)\s*(pcs?|tabs?|strips?|boxes?|nos?|qty|x|\*)?\s*$/i` (trailing) or leading variant; default qty 1; product name = line minus qty tokens and hyphens. `fuzzyMatch` = substring on name/genericName/first-word against **my** inventory. Filters items with rawText length >1.
- **Step 1 Review:** matched (green check) vs unmatched (amber) rows; unmatched get a `<select>` to manually map to a product; qty/price shown; remove.
- **Step 2 Select Pharmacy:** search over circle; select → step 3.
- **Step 3 Edit & Add:** edit qty/price per item; add more products (search my inventory). 
- **Step 4 Confirm:** bill-for card, items table, "Grand Total" **= subtotal WITHOUT tax** (display quirk). Create → 1500ms → build order (FEFO batch, per-item tax 12%, order tax 12%), status **`confirmed`** CIRCLE, `type:'stockist'`, then `generateInvoice(order.id)`. Toast → `/stockist/orders`.

### 3.12 DeliverySetup (`/stockist/delivery`) — fully wired
- **Service Areas:** list (name, pincode, active) with Enable/Disable (`updateDeliveryArea`) + Delete (`removeDeliveryArea`). Add form: Area name + Pincode → `addDeliveryArea` (real).
- **Delivery Slots:** list (label + start–end) + Delete. Add form: Label + Start time + End time → `addDeliverySlot` (real). Requires all fields non-empty.

### 3.13 HolidayManagement (`/stockist/holidays`) — fully wired
- Add Holiday: Date* (date), Reason (default 'Holiday'), "Accept Pre-orders" Switch → `addHoliday`. Validation: date required, must be today-or-future. Upcoming (sorted asc) + Past (last 5) sections; delete via `removeHoliday`. `preOrderEnabled` drives pharmacist-side badges only. `isStockistOnHoliday` matches **exact date === today**.

### 3.14 SubscriptionPage (`/stockist/subscription`)
- Reads current sub from `allStockists` (fallback default basic_100). 2 StatCards (Bills Used `{used}/{limit}`, Valid Until). Usage bar `usagePercent = round(billsUsed/billLimit×100)` (color ≥90 destructive / ≥70 warning / else primary), "{remaining} bills remaining".
- 3 hardcoded plans: Basic 100 ₹999, Standard 200 ₹1999, Premium 500 ₹4999 (feature lists). Current plan shows "Current Plan" disabled; others "Upgrade".
- **STUB:** Upgrade sets local `currentPlan` + toast only — **not persisted**.

### 3.15 Reports (`/stockist/reports`)
- Month (Jan–Dec, default March) + Year (2026/2025/2024, default 2026) selects; type chips (All/H1/HNX/GST/Sales).
- **7 hardcoded reports** (`r1..r7`): H1 Monthly, H1 Annual, HNX Drugs, HNX Annual, GST Sales, Monthly Sales, Stock Summary — each with badge, description, lastGenerated date.
- **STUB:** Download → toast only, no file generated.

### 3.16 Analytics (`/stockist/analytics`) — **ENTIRELY MOCK**
- Period select (This Week/Month/Quarter/Year — **inert**).
- 4 hardcoded KPIs: Total Revenue ₹1,78,000 (+14.8% up), Total Orders 68 (+8.2% up), Active Pharmacies 24 (+4.2% up), Collection Rate 87% (−2.1% down).
- Revenue Trend LineChart (hardcoded Oct–Mar). Order Status Distribution pie (hardcoded Delivered 45/Pending 12/Processing 8/Cancelled 3). Nothing driven by real data (contrast with StockistDashboard which is real).

### 3.17 StockistProfile (`/stockist/profile`)
- Status banner (approved/pending/other), avatar header (businessName, type badge, email, member-since).
- Section cards (all with Edit → `EditProfileModal`): Contact (contactPerson/phone/whatsapp/email), Business (name/type/years/drugLicense/gst/pan), Regulatory Documents (doc tiles → preview dialog with fileUrl image or FileText fallback), Office & Warehouse, Delivery Setup (days/slots/pincodes/radius), Business Rules (credit limit/days/min order/delivery charge label composed), Financial (account holder/bank/account/ifsc/upi).
- **STUB:** every section's `handleSave` = toast only — **edits discarded**. EditProfileModal fields per section are defined but not persisted.

### 3.18 BulkUpload (`/stockist/inventory/upload`) — **STUB (ignores file)**
- States: upload → validating (1500ms) → preview → confirming (2000ms) → done.
- File input accepts .csv/.xlsx/.xls but **file is never parsed**; injects hardcoded `mockParsedData` (6 rows, 2 with errors: missing name, missing batch). Preview table (Name/Generic/Manufacturer/Batch/Qty/MRP/Status). Confirm → done screen with Added/Failed/Skipped(0) counts + error list. **Writes NOTHING to AppState.**

### 3.19 PurchaseBills (`/stockist/inventory/bills`) — **STUB (ignores file)**
- Seeded with 2 mock bills (local state). Upload → Supplier Name field + file input (**file ignored**) → Process (2000ms) injects 3 hardcoded extracted items → Review (edit qty/price per item, total recalcs) → Confirm (1500ms) → prepends a mock Bill to local list + toast "inventory updated" (**no AppState write**). List rows: view (dialog with items) + delete (local). Bill statuses processed/processing/error.

### 3.20 BulkPriceUpdate (`/stockist/inventory/bulk-price`) — inline REAL, upload FAKE
- Modes: choose → inline / upload → compare → done. Seeds `changes` from `allInventory.slice(0,6)` (batches[0] prices).
- **Inline (REAL):** editable New MRP / New Sale per product; "Review Changes" → compare → Confirm applies `updateBatch({mrp,sellingPrice})` to **ALL batches of each changed medicine** (persisted).
- **Upload (FAKE):** file input ignored; `handleFileUpload` fabricates new prices via `Math.random()` (MRP ×(1+rand×0.1), Sale ×(1+rand×0.08)) → compare → confirm still persists via updateBatch. So upload "works" but with random prices.
- Done screen → View Inventory.

---

## 4. PHARMACIST MODULE

### 4.1 PharmacistDashboard (`/dashboard` role=pharmacist)
- Banner (first active pharmacist/all). 4 StatCards, Quick Actions (6), Active Orders (first 5, not delivered/cancelled).
- **KPIs:** `myOrders = placedBy.id === user.id`. Pending Orders = count placed+confirmed+dispatched. Due Payments = `₹{(outstanding/1000).toFixed(1)}K` where `outstanding = max(0, Σ myOrders grandTotal − Σ payments for those orders)`. Connected Stockists = `getConnectedStockists(me).length`. Recent Purchases = delivered count. **StatCard trends hardcoded** (down/neutral/up).
- Quick Actions: Browse, Cart (with live count badge), Quick Order, Stockists, Pay Dues (→ payments), Orders.

### 4.2 FindStockist (`/pharmacist/stockists/find`)
- Lists **approved** stockists (businessName, city, serviceAreas, product count = inventory where stockistId matches). Search by name/city. "Connect" → `connectStockist(me, id)` (real, persisted); connected ones show disabled "Connected".

### 4.3 PharmacistStockists (`/pharmacist/stockists`)
- "My Stockists" (approved + in `getConnectedStockists(me)`). Search. Card → `/pharmacist/stockists/{id}`. Per card: products count, **Outstanding = `max(0, Σ ordered − Σ paid)`** for orders between me and that stockist, holiday chip ("On Holiday (Pre-orders open)" if preOrderEnabled). Empty → Find Stockists.

### 4.4 BrowseMedicines (`/pharmacist/browse`)
- 700ms skeleton. View toggle Medicines / Stockists. Cart button with count badge.
- **Only shows inventory of connected stockists**, filtering out counterfeit. Search by name/generic/category.
- **Medicines cards:** Rx badge (Antibiotic), Out of Stock badge (no valid batch), **Low Stock badge (batch qty `< 10`)**, price + struck MRP, stock count, stockist name, **"Delivery by {now+2 days}" (hardcoded stub)**, Add to Cart / In Cart(qty) / Unavailable.
- **`getBestBatch` = FIFO** (future expiry, qty>0, non-counterfeit, earliest expiry). `addToCart` sets quantity 1, uses best batch. Add validation: no valid batch → "Not Available" toast.
- **Stockists view:** connected stockists with holiday chips.

### 4.5 PharmacistStockistDetail (`/pharmacist/stockists/:id`)
- Header (businessName, city, phone), 2 stat tiles: Outstanding = `max(0, Σ ordered − Σ paid)` over orders involving this id; Total Paid. Buttons: Order Now (→ browse), Pay Dues (→ payments).
- Tabs: **catalog / orders / ledger**.
  - catalog: `allInventory` (non-counterfeit, in-stock) — **NOT filtered to this stockist** (shows global catalog). Low Stock label uses **`totalStock < 100`** (inconsistent with Browse's 10). Add uses **`batches[0]`** (not FIFO).
  - orders: orders where placedTo/placedBy = this id → `/orders/{id}`.
  - ledger: entries whose relatedOrderId is in related orders; +green/−red.

### 4.6 Cart (`/pharmacist/cart`)
- Line list (name, batch, stockist, qty steppers, line total, remove). Summary: Subtotal / Tax 12% / Total. "Proceed to Checkout". Empty state → Browse. **Not grouped by stockist** (grouping happens at checkout).

### 4.7 Checkout (`/pharmacist/checkout`)
- Groups cart by `stockistId`; classifies each group PLATFORM vs CIRCLE via `getOrderType(me, stockistId)`.
- **Content:** Delivery Address (select saved addresses filtered by `!organizationId || organizationId===me`; "+ Add New" dialog), **Delivery Slot** (4 hardcoded slots Morning/Afternoon/Evening/Night — **UI only, not persisted**), Items grouped by stockist with PLATFORM/CIRCLE badge, Order Notes textarea (**captured, not persisted**), Payment (Pay Now UPI / Pay Later Credit — Pay Later only if any CIRCLE group), Summary (Subtotal/Tax12%/Total).
- **Credit check:** per CIRCLE group, `orderTotal = subtotal+12%`; `creditWarnings` = groups where `!canUseCredit` and choice is pay_later. Warning banner "Used ₹X / Limit ₹Y". Place button disabled if warnings exist or no address.
- **Place flow (`handlePlace`):** validateStock (blocks on error). If pay_later + warnings → block. If platform orders OR pay_now → **simulated payment**: `paymentStep='paying'` (2000ms spinner "Simulating UPI payment") → `'success'` (800ms) → create (500ms). Then **one order per stockist**: `type:'pharmacy'`, orderType per group, status `confirmed` if prepaid else `placed`, paymentStatus paid/pending, discount 0. Prepaid orders also call `addPayment({method:'upi', reference:PAY-{ts}})`. `clearCart`, success screen listing order numbers.
- **Add-address dialog fields:** Label*, Address Line*, City*, Pincode, State → `addAddress` (first one auto-default). Requires label+line1+city.
- **Stubs:** delivery slot + order notes not passed to createOrder.

### 4.8 QuickOrder (`/pharmacist/orders/quick`) — WhatsApp→order
- "Order From" select (connected stockists — **largely ignored once items match**). Textarea (sample text provided) + "Use Sample" + "Parse Items".
- **Parsing:** split newline; split each by hyphen/en-dash/em-dash → name + qty (`\d+` in second part, default 1); `fuzzyMatch` = substring `.find()` first match against **connected-stockist** inventory. `getBestBatch` = FIFO for the estimate/price.
- Shows Parsed Items (matched/unmatched, stockist name), "Matched X / Y", Estimated Total (matched only), "Create Order".
- **Create:** groups matched items by **real `medicine.stockistId`**, one **PLATFORM** order per stockist, status `placed`, unpaid, discount 0. **BUG:** order line uses `inv.batches[0]` (NOT the FIFO batch used for the estimate). Toast → `/pharmacist/orders`.

### 4.9 PharmacistInventory (`/pharmacist/inventory`)
- Read-only, from `getPharmacyInventory(me)` (auto-populated on delivery). Search + All/Expiring tabs (≤ **90 days**). Row: name, batch, qty, expiry label (Expired/Expiring Soon/Valid), MRP/Expiry/Received. Empty: "auto-populated when orders are delivered".

### 4.10 Addresses (`/pharmacist/addresses`) — real CRUD
- Add form: Label*, Address Line*, City*, Pincode → `addAddress` (first auto-default; requires label+line1+city). List (scoped `!organizationId || ===me`) with Set-Default (check icon) and Delete. Uses `setDefaultAddress` (default is per-organizationId group).

### 4.11 DeliveryPreferences (`/pharmacist/delivery-preferences`) — **FULLY STUBBED**
- Time-slot multi-select (morning/afternoon/evening; default morning+afternoon) + Delivery Instructions textarea (default text). Save → toast only. Pure local state, no AppState.

### 4.12 PharmacistProfile (`/pharmacist/profile`)
- Status banner, avatar header. Section cards: Contact (Edit), Business (Edit), Documents (no edit; preview dialog — FileText only, no image), Address (Edit), Configuration (monthly purchase/categories/credit — no edit).
- **STUB:** edit `handleSave` = toast only, not persisted.

---

## 5. ORDERS, RETURNS & LIFECYCLE

### 5.1 OrderList (`OrderList` with `roleFilter`)
- 600ms skeleton. Role filter: admin=all; stockist=placedTo OR placedBy===me; pharmacist=placedBy===me. Sorted newest-first.
- Status tabs: All (count) / placed / confirmed / dispatched / delivered / cancelled.
- Create buttons: stockist → Quick Bill + Create Order; pharmacist → New Order (→ browse); admin → none.
- Row: orderNumber, StatusChip, "placedBy → placedTo", grandTotal, date → `/orders/{id}`.

### 5.2 OrderDetail (`/orders/:id`) — role-aware
- **Header:** orderNumber, date, StatusChip. Parties card (From/To — flips display by order.type).
- **Role actions (`getActions`):** admin → "Force Cancel" (if not delivered/cancelled). pharmacist → "Cancel Order" (if placed/confirmed). stockist → placed: Confirm + Cancel; confirmed: Mark as Dispatched; dispatched: Mark as Delivered. `handleAction` = 1000ms delay → `updateOrderStatus` → **auto `generateInvoice` on confirmed** → toast.
- **Returns:** pharmacist "Request Return" button when delivered & no existing request → `/orders/:id/return`. Return Requests card lists requests; stockist sees Approve (→ `approveReturn`, mints credit note, shows "Credit Note: {id}") / Reject (→ `rejectReturn`) for pending.
- **Invoice:** "View Invoice" (shown if invoice exists or status confirmed/dispatched/delivered) → generates if missing → dialog with from/to/order/date, items table, subtotal/discount/tax/total.
- **Delivery Status grid:** 5 states (Pending/Confirmed/Out for Delivery/Delivered/Cancelled) with active/past/future styling.
- **Payment section (non-admin):** Paid/Pending tiles (`pendingAmount = grandTotal − paid`); Paid/Unpaid chip; "Add Payment" dialog (Amount + "Full" prefill, Method cash/upi/bank_transfer/credit, reference `TXN-{ts}`) → `addPayment`. Admin sees read-only "View Only".
- **Timeline:** event list from `order.timeline`.
- **Edit Items (placed only, non-admin):** stepper qty per item; on Save recomputes per-item `tax = round(qty×unitPrice×0.12)`, subtotal, totalTax, totalDiscount(=Σ item.discount), `grandTotal = subtotal − totalDiscount + totalTax` → `updateOrderItems` (only affects **dynamic** orders in `placed`; seed orders skip — see §11). Items with qty 0 dropped.
- **Notes:** local-only list (`orderNotes` state) — **never persisted**.

### 5.3 ReturnRequest (`/orders/:id/return`)
- Guarded to `delivered` orders (else "not eligible"). Per-item checkbox → sets return qty (default full) + reason textarea. `updateItemQty` clamps 1..ordered. Submit builds `ReturnItem[]` (reason default "No reason specified") → `createReturnRequest` (status pending). pharmacyId/stockistId derived from order.type. Toast → back to order. **No coded path applies a credit note to a later order** (only `getAvailableCreditNotes` exists; Checkout never consumes it).

---

## 6. PAYMENTS MODULE

### 6.1 PaymentsPage.tsx — **DEAD (unrouted)**
- Built generic payments page (tabs payments/ledger/credit); hardcodes `creditLimit = 500000`, 30-day due dates; imports `addLedgerEntry`/`roleView` unused. Not reachable via any route.

### 6.2 StockistPayments (`/stockist/payments` and `/stockist/credit`)
- Scoped to my orders. 3 StatCards: Collected (`Σ paid payments`), Outstanding (`max(0, Σ order grandTotal − collected)`), Bills (invoice count).
- **Bank Details card:** from `user as StockistProfile` (account/bank/acct#/ifsc/upi) — **Edit button is unwired** (no handler).
- Tabs: **payments / bills / approvals**.
  - payments: rows (pharmacy, method, date, amount, status verified/pending).
  - bills: from invoices matching my orders (billNo, pharmacy, amount, status paid/unpaid/draft).
  - approvals: pending payments — **"Approve" is toast-only** (doesn't change payment status).
- **Send Reminder:** dialog Send To (All / specific pharmacy) + Message → `sendReminder({channel:'whatsapp'})` + toast. Reminder History (last 3) shown if any.

### 6.3 PharmacistPayments (`/pharmacist/payments`)
- Groups my orders by stockist. 3 StatCards: Total Due, Paid, Stockists count.
- Tabs: **dues / history**.
  - dues: per-stockist Outstanding + Paid tiles; "Pay Now — ₹{outstanding}" opens modal.
  - history: payment rows (stockist, amount, method, order, date).
- **Pay modal:** Amount (prefilled to outstanding) + Method (UPI/Bank Transfer/Cash). `handlePay` = **FIFO** over that stockist's unpaid non-cancelled orders oldest-first, `min(remaining, due)` via `addPayment` (real). Toast.

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

## 8. APPSTATECONTEXT ENGINES — EXACT LOGIC (`AppStateContext.tsx`)

### 8.1 Merged/derived data
- `allOrders` = seedOrders (with `orderStatusOverrides` applied) + `dynamicOrders`.
- `allPayments` = seedPayments + dynamicPayments. `allLedger` = seedLedger + dynamicLedger.
- `allStockists`/`allPharmacists` = seed + dynamic, each with `userStatusOverrides` applied.
- `allMedicines` = seed + dynamic, `isCounterfeit = counterfeitOverrides[id] ?? seed value`.
- `allBatches` = seed + dynamic, `quantity = batchQtyOverrides[id] ?? seed`, `isCounterfeit = counterfeitOverrides[medicineId] ?? seed` (so flagging a med flags all its batches).
- `allInventory` per medicine: `batches` = all its batches; `totalStock = Σ quantity of NON-EXPIRED batches` (expiry > now); `lowStockThreshold = 100`.
- `allBanners` = seed (minus deletedBannerIds, with overrides) + dynamic (minus deleted).

### 8.2 Cart
- `addToCart` rejects if `existingInCart + qty > available` (batchQtyOverride-aware), if batch expired (`expiryDate <= now`), or if medicine counterfeit. Merges by `batchId + stockistId`.
- `removeFromCart(medicineId, stockistId)`; `updateCartQty` (≤0 removes); `clearCart`.

### 8.3 Stock validation & deduct/restore
- `getAvailableStock(batchId)` = override ?? seed qty.
- `validateStock(items)` → errors for: batch not found, insufficient stock, expired batch, counterfeit medicine. Returns `{valid, errors}`.
- `deductStock(items)` / `restoreStock(items)` mutate `batchQtyOverrides` (clamped ≥0 on deduct).

### 8.4 Orders
- `createOrder`: id `order-dyn-{orderCounter}`, orderNumber `ORD-YYYYMMDD-{####}` (counter, padded), timeline seeded with initial status "Order placed", createdAt/updatedAt now. Prepends to dynamicOrders. **Writes a DEBIT ledger entry** for the pharmacy (`amount = grandTotal`, runningBalance = grandTotal). **If status starts `confirmed` → `deductStock`.**
- `updateOrderStatus`: blocks if current status is delivered/cancelled (early return). Deducts stock on `placed/draft → confirmed`; restores on `confirmed/dispatched → cancelled`. For seed orders → writes to `orderStatusOverrides` (appends timeline); for dynamic → mutates the order.
- `updateOrderItems`: **only affects dynamic orders in `placed` status**; seed orders skipped entirely (returns early). Sets items + totals + totalDue.

### 8.5 Payments
- `addPayment`: blocks on cancelled order. **Clamps amount to remaining due** (`min(amount, max(0, grandTotal − existingPaid))`; ≤0 → no-op). Computes status paid/partial. Writes payment (`pay-dyn-{ts}`) + a CREDIT ledger entry (`led-pay-{ts}`, runningBalance 0). payer/payee derived from order.type.

### 8.6 Invoices & reminders
- `generateInvoice`: one per order (`inv-{n}`, `INV-2024-{###}`, status `issued`); returns existing if present.
- `sendReminder`: appends `PaymentReminder` (`rem-{ts}`, channel whatsapp/sms). **No real message.**

### 8.7 Connections & users
- `connectStockist`/`disconnectStockist`/`getConnectedStockists` on per-pharmacy `Record<string,string[]>` (default built from `defaultCircleEntries`).
- `registerStockist`/`registerPharmacist` force `status:'pending'`. `updateUserStatus` writes `userStatusOverrides`.

### 8.8 Inventory mutations
- `addMedicine`, `updateMedicine` (dynamic only — **cannot edit seed medicines**), `addBatch`, `updateBatch` (dynamic only + syncs `batchQtyOverrides`), `addProduct` (med + batch), `toggleCounterfeit` (flips override, seeds from current value).

### 8.9 Circle
- `addCircleEntry` (`circle-{ts}`) + **auto-connect** stockist for the pharmacy. `removeCircleEntry`, `updateCircleEntry`.

### 8.10 Addresses
- `addAddress` (`addr-{ts}`), `updateAddress`, `deleteAddress`, `setDefaultAddress` (default is scoped per `organizationId` group).

### 8.11 Order-type & credit
- `getOrderType(pharmacyId, stockistId)` = CIRCLE iff a circleEntry links them, else PLATFORM.
- `getCreditUsed` = `Σ max(0, grandTotal − paid)` over non-cancelled orders for that pharmacy↔stockist pair.
- `getCreditLimit` = circle entry's creditLimit (or 0). `canUseCredit(p,s,amt)` = limit>0 && used+amt ≤ limit.

### 8.12 Derived money selectors
- `getOrderPayments/PaidAmount/RemainingAmount/PaymentStatus`. `getOutstandingForParty` and `getOutstandingBetween` = `Σ max(0, grandTotal − paid)` over non-cancelled orders. `getLedgerBalance` = `Σ (debit − credit)` (note: PlatformLedger does NOT use this).

### 8.13 Delivery, holidays, returns, credit notes
- Delivery areas/slots CRUD (persisted). Holidays add/remove; `isStockistOnHoliday`/`getStockistHolidayInfo` = exact `date === today`.
- `createReturnRequest` (`ret-{ts}`, pending). `approveReturn`: computes `Σ unitPrice × returnQty` from order lines → mints `CreditNote` (`cn-{ts}`, applied:false) + marks request approved + `creditNoteId`. `rejectReturn`. `getAvailableCreditNotes` filters unapplied by pharmacy↔stockist — **never consumed anywhere**.

### 8.14 Pharmacy inventory auto-populate
- `useEffect` on `allOrders`: for each `delivered` order not already added, copies items into `pharmacyInventory` (`pi-{orderId}-{idx}`; medicine, batchNumber, qty, mrp, expiry, receivedAt now). One-time per order. `getPharmacyInventory(id)`.

### 8.15 Support
- `addSupportMessage` (`msg-{ts}`).

---

## 9. STATUS VOCABULARIES & FLOWS (`flows.ts`)
- **OrderStatus:** draft → placed → confirmed → dispatched → delivered (+ cancelled). `orderFlow` transitions: draft→[placed,cancelled], placed→[confirmed,cancelled], confirmed→[dispatched,cancelled], dispatched→[delivered], delivered/cancelled→[] (terminal). Colors muted/primary/accent/warning/success/destructive.
- **ApprovalStatus:** pending/approved/rejected/update_required/suspended. `approvalFlow` allows approved→[rejected,suspended], suspended→[approved], etc. `getStatusDisplayLabel`: approved→"Verified", pending→"Pending Verification", rejected→"Rejected", update_required→"Update Required", suspended→"Suspended".
- **PaymentStatus:** pending/partial/paid/overdue (`overdue` derived only in dead PaymentsPage; never persisted per order).
- **OrderType:** PLATFORM / CIRCLE. **Order.type:** 'pharmacy' | 'stockist' (who placed it).

---

## 10. WHATSAPP PARSING — SIDE-BY-SIDE
- **QuickBill (stockist):** regex qty extraction (trailing/leading units), substring fuzzy match on own inventory, manual `<select>` remap for unmatched, FEFO batch, per-item + order tax 12%, creates **confirmed CIRCLE** order + invoice. Step-4 "Grand Total" displays subtotal without tax (created order adds 12%).
- **QuickOrder (pharmacist):** hyphen/dash split into name+qty, substring `.find()` first-match on connected inventory, FIFO for estimate but **`batches[0]` in the actual order lines** (bug), groups by real stockist, creates **PLATFORM placed unpaid** orders.
- Both are genuine parsers over mock inventory; neither touches any messaging API.

---

## 11. COMPLETE STUBS / PLACEHOLDERS / HARDCODED VALUES (checklist)

**Auth/registration**
- `login()` always succeeds (fallback seed user); "Invalid credentials" dead. 1200ms fake latency. Remember-me checkbox unwired (AuthPage + Login).
- Both registration wizards never call `registerStockist`/`registerPharmacist` — no pending accounts created; success modal just logs into a demo session. Delivery/Rules steps (stockist) not hard-validated (requiredFields undefined for steps 3–4).
- File uploads: client-only object URLs, 5 MB cap, oversized silently dropped, nothing uploaded.
- ForgotPassword/ResetPassword: timer + toast only. Onboarding not linked into main flow.

**Stockist**
- Analytics: 100% hardcoded; period inert. Reports: 7 hardcoded; Download = toast. SubscriptionPage upgrade = toast (not persisted). StockistProfile save = toast (all sections discarded).
- AddItem: image placeholder dead; brand/gstRate/fssai/minStock not persisted. EditProduct: only batches[0]; gstRate/packSize/requiresRx/isNarcotic/etc. not persisted.
- ProductDetail: Copy/Trash icons imported but unwired.
- BulkUpload: file ignored, mock rows, **writes nothing to AppState**. PurchaseBills: file ignored, mock extracted items, writes only to local list (no AppState). BulkPriceUpdate: **inline mode real**; upload mode fabricates prices via `Math.random()`.
- CirclePharmacies: Credit tab count hardcoded 0; credit fallback ₹175000; Send Reminder message-type + priority collected but unused, no real message; `cheque` cast onto method union.
- CirclePharmacyDetail: Bills tab static; `cheque→cash` mapping (fidelity loss).
- CreateOrder: no credit-limit check.

**Pharmacist**
- DeliveryPreferences: fully stubbed (toast-only, no AppState). PharmacistProfile edit: toast-only.
- Checkout: UPI is a simulated timer; delivery slot (4 hardcoded) + order notes not persisted; discount 0; "Delivery by +2 days" hardcoded (Browse).
- QuickOrder: order lines use batches[0] not the FIFO batch it estimated with; "Order From" dropdown largely ignored.
- Low-stock threshold inconsistent (Browse <10 vs StockistDetail <100 vs Inventory ≤100).
- PharmacistStockistDetail catalog shows global inventory (not the stockist's) and uses batches[0].

**Admin**
- CommissionSetup: not persisted; rates never applied. AdminPayments commission = hardcoded 5%. AdminAnalytics: revenue/user-growth/Users/Growth hardcoded; period inert. PharmacyDetail Inventory tab shows global inventory. "Suspend" everywhere writes `rejected` (true `suspended` enum never written). AdminProfile fabricated + edit toast-only. AdminDashboard banner CTA no-op; StatCard change% hardcoded (+12/+8). UserFlowPage documents a backend that doesn't exist. PlatformLedger balance = last entry's stored balance (not recomputed).

**Payments/orders**
- StockistPayments "Approve" toast-only; bank "Edit" unwired. OrderDetail notes local-only. `PaymentsPage` unrouted, hardcodes ₹500,000 limit, unused imports. Credit notes minted on return approval but never applied to a later order.

**Global**
- No `wa.me` / `upi://pay`; only `tel:` + clipboard real. No theme/notification settings. GlobalSearch navigates to `/stockist/...` regardless of role. GST flat 12% (no SGST/CGST, no delivery fee). Discounts always 0. SupportChat bot = random canned reply after 1500ms, agent messages visible to all users. Static notification red dot always on. Duplicate `/stockist/settings` route. Seed `circlePharmacies` array, `creditSummary`, `pendingApprovals`, `ErrorState`, `getLedgerBalance`, `disconnectStockist` all exist but are unused by any live screen.

---

## 12. EDGE CASES & VALIDATION PATHS (summary)
- **Stock:** add-to-cart & order creation blocked on over-stock/expired/counterfeit via `validateStock`/`addToCart` guards. Deduction on confirm, restore on cancel; delivered/cancelled orders immutable (updateOrderStatus early-returns).
- **Payments:** clamped to remaining due (overpay impossible); cancelled orders reject payments; FIFO allocation in 3 places (CirclePharmacies, CirclePharmacyDetail, PharmacistPayments) — all skip cancelled/fully-paid orders.
- **Credit:** Checkout blocks pay-later CIRCLE orders exceeding limit; platform groups always require prepay. `canUseCredit` false when limit 0.
- **Registration:** per-step required-field validation + regex; oversized files silently dropped; T&C+Privacy gate submit.
- **Expiry:** expired batches excluded from `totalStock` and FIFO/FEFO selection; flagged as Expired in batch/inventory views.
- **Counterfeit:** flagging propagates to batches; enforced in cart/order validation ("… is flagged as counterfeit").
- **Empty/`not found`:** OrderDetail/ProductDetail/CirclePharmacyDetail/PharmacistStockistDetail/Stockist-&Pharmacy-Detail all render "not found" fallbacks; ReturnRequest guards non-delivered orders; list screens use `EmptyState`.

---
