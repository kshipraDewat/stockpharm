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

# PART II — COMPLETE APPLICATION REFERENCE (deep expansion)

Everything below is additional code-derived reference detail that expands Part I. Nothing in Part I is superseded unless explicitly noted with **CORRECTION**.

## 13. ENTITY REFERENCE — every TypeScript type, field by field

All domain types live in `src/core/types.ts` (428 lines) except four context-local entities defined inside `src/contexts/AppStateContext.tsx` (`CartItem`, `Invoice`, `PaymentReminder`, `CircleEntry`). Fields marked `?` are optional in the interface.

### 13.1 Enum/union types (`types.ts` lines 1–15)
| Type | Values | Notes |
|---|---|---|
| `UserRole` | `admin \| stockist \| pharmacist` | drives Dashboard switch + nav menus |
| `ApprovalStatus` | `pending \| approved \| rejected \| update_required \| suspended` | `suspended` never written by any screen (§7) |
| `OrderStatus` | `draft \| placed \| confirmed \| dispatched \| delivered \| cancelled` | `draft` never created by any screen; exists only in `orderFlow`/colors |
| `PaymentStatus` | `paid \| partial \| overdue \| pending` | `overdue` only in seed-free dead code (PaymentsPage derivation) |
| `OrderType` | `PLATFORM \| CIRCLE` | derived from circle membership at creation time |
| `SubscriptionPlan` | `basic_100 \| standard_200 \| premium_500` | maps to bill limits 100/200/500 |
| `PharmacyType` | `retail \| chain \| clinic \| hospital` | `hospital` disabled ("Coming soon") in registration |
| `StockistType` | `sub_stockist \| super_stockist \| distributor` | only `sub_stockist` selectable; all seed stockists are sub_stockist |
| `ReturnStatus` | `pending \| approved \| rejected` | |

### 13.2 `User` (base) — `id, name, email, role, phone, avatar?, status: ApprovalStatus, createdAt`. No screen ever sets `avatar`; avatars everywhere are initial-letter circles.

### 13.3 `StockistProfile extends User` (role `'stockist'`)
Groups exactly as the 7-step registration wizard:
- **Business:** `businessName`, `businessType: StockistType`, `yearsInBusiness` (string bucket e.g. `'5_10'`), `gstNumber`, `panNumber`, `drugLicense`, `serviceAreas: string[]` (city names, shown in FindStockist/admin lists).
- **Documents:** `documents: RegistrationDocument[]`.
- **Subscription:** `subscription: Subscription` (required — every stockist has one).
- **Contact:** `contactPerson`, `whatsapp?`, `password?` (a plain-text optional field; never actually stored by any flow).
- **Addresses:** `officeAddress`, `officeMapsLink?`, `warehouseAddress?`, `warehouseMapsLink?`, `city`, `state` (lowercase slugs in seed, e.g. `'maharashtra'`), `pincode`.
- **Delivery:** `deliveryDays: string[]` (`'Mon'`…), `deliverySlots: string[]` (`'morning' \| 'afternoon' \| 'evening' \| 'full_day'`), `serviceablePincodes: string[]`, `serviceRadius?`.
- **Business rules (all string):** `defaultCreditLimit?`, `defaultCreditDays?`, `minimumOrderValue?`, `deliveryChargeType?` (`free/flat/free_above/distance`), `deliveryFlatRate?`, `deliveryFreeAbove?`, `deliveryBelowAmountCharge?`, `deliveryPerKm?`, `deliveryBaseCharge?`. **None of these rules is enforced anywhere** — no minimum-order check, no delivery charge is ever added to an order; they are display-only (StockistProfile page, admin StockistDetail).
- **Financial:** `accountHolderName?`, `bankName?`, `accountNumber?`, `ifscCode?`, `upiId?` — display-only (StockistPayments bank card, profiles).

Lifecycle: created only by seed or `registerStockist` (which forces `status:'pending'` — but no live screen calls it; see §2.5). Status mutated only via `updateUserStatus` overrides (admin actions). Never deleted.

### 13.4 `PharmacistProfile extends User` (role `'pharmacist'`)
- **Business:** `pharmacyName`, `pharmacyType: PharmacyType`, `legalEntityType` (string: proprietorship/partnership/private_limited/llp), `panNumber`, `gstNumber?` (optional — clinics), `pharmacistName`, `pharmacistRegNumber`, `numberOfBranches?` (chains), `pharmacyLicense`.
- **Docs/address:** `documents: RegistrationDocument[]`, `address: Address` (single embedded address; the *separate* `addresses` slice in AppState is what Checkout/Addresses actually use).
- **Contact:** `ownerName`, `designation?`, `whatsapp?`, `googleMapsLink?`, `landmark?`.
- **Config:** `monthlyPurchaseRange?` (`lt_50k/50k_2l/2l_5l/5l_plus`), `preferredCategories?: string[]`, `creditRequired?: boolean`, `creditAmountNeeded?`, `expectedCreditDays?`. Display-only (profile + admin detail); the *real* credit engine uses `CircleEntry.creditLimit`, not these.

Lifecycle: seed, or created by a **stockist** via FindPharmacy "Create New Pharmacy" (`registerPharmacist`, forced pending). Status via `updateUserStatus`. Never deleted.

### 13.5 `AdminProfile extends User` — no extra fields. Only instance: seed `admin-001`.

### 13.6 `RegistrationDocument` — `id, label, number?, expiryDate?, fileUrl?, fileName?, status?: 'uploaded'|'verified'|'rejected'`. Seed fileUrls are `/placeholder.svg` or `'#'`; document "preview" dialogs render the image if fileUrl looks like an image else a FileText icon; the ProfileSection preview explicitly says "Document preview not available in prototype". No screen ever changes a document's `status`.

### 13.7 `Document` (`id, name, type, url, uploadedAt`) — **declared but never used anywhere** (dead type).

### 13.8 `Address` — `id, label, line1, line2?, city, state, pincode, isDefault, contactName?, phone?, organizationId?`. `organizationId` scopes an address to a pharmacy; addresses with **no** organizationId are visible to every pharmacist (Checkout/Addresses filter `!organizationId || organizationId === me`). `setDefaultAddress` re-flags only within the same organizationId group. Order stores only `addressId?` (never displayed back on OrderDetail).

### 13.9 `Medicine` — `id, name, genericName, manufacturer, category, hsn, isCounterfeit, stockistId` (owner), plus optional regulatory extras `drugSchedule?, drugType?, packType?, packSize?, imageUrl?, composition?, requiresRx?, isNarcotic?`. Seed medicines set none of the optionals; AddItem sets them on dynamic medicines but **no screen reads them back** except EditProduct prefill (`requiresRx` is never used for the Rx badge — that badge is the `category === 'Antibiotic'` heuristic). `imageUrl` never set (all product images are Package-icon placeholders).

### 13.10 `Batch` — `id, medicineId, stockistId, batchNumber, expiryDate, manufacturingDate, mrp, purchasePrice, sellingPrice, quantity, isCounterfeit`. Quantity is the only field with an override channel (`batchQtyOverrides`); price/expiry edits persist only for dynamic batches (see §15.8 correction). Batches are never deleted.

### 13.11 `InventoryItem` — computed wrapper `{ medicine, batches: Batch[], totalStock, lowStockThreshold: 100 }`. Two variants exist: the **live** `allInventory` (context; `totalStock` counts only non-expired batches) and the **seed export** `inventoryItems` in `inventory.ts` whose `totalStock` sums ALL batches including expired — the seed export is effectively unused by screens (everything reads `allInventory`).

### 13.12 `OrderItem` — `id, medicine: Medicine, batch: Batch, quantity, unitPrice, discount, tax, total`. Note: full Medicine and Batch objects are **embedded by value** into the order (and then into localStorage), so later medicine/batch edits do NOT retroactively change historical order lines. `discount` is a percent in seed data (e.g. 5) but always `0` in dynamic orders; `tax` is `12` (a rate) in seed items but a **rupee amount** (`round(itemTotal×0.12)`) in dynamic items — inconsistent semantics that no screen reconciles (item tax is never displayed per-line).

### 13.13 `Order` — `id, orderNumber, type: 'pharmacy'|'stockist'` (who placed it), `orderType: PLATFORM|CIRCLE`, `status`, `placedBy/placedTo: {id,name,role}`, `addressId?`, `items[]`, `subtotal, totalDiscount, totalTax, grandTotal, totalPaid, totalDue, paymentStatus: pending|partial|paid, createdAt, updatedAt, timeline: OrderTimelineEvent[], invoiceUrl?`. **`totalPaid`/`totalDue`/`paymentStatus` are snapshot fields set at creation and never updated by `addPayment`** — every screen that shows real payment state recomputes from `allPayments` (via `getOrderPaidAmount` etc.); the stored fields go stale after any payment. `invoiceUrl` never set (invoices live in the separate `invoices` slice).

### 13.14 `OrderTimelineEvent` — `status, timestamp, note?`. Appended by createOrder (initial) and every updateOrderStatus.

### 13.15 `Payment` — `id, orderId, payerId, payeeId, amount, method: bank_transfer|upi|cash|credit, status: PaymentStatus, paidAt?, dueDate, reference?`. Dynamic payments get `dueDate: ''` unless supplied (never supplied by any screen). The `'cheque'` string leaks into `method` via CirclePharmacies' cast (§3.7).

### 13.16 `LedgerEntry` — canonical fields `id, date, organizationId` (the pharmacy), `counterpartyId` (the stockist), `entryType: DEBIT|CREDIT, amount, referenceType: ORDER|PAYMENT, referenceId, description, runningBalance` + **legacy compat fields** `debit, credit, balance, relatedOrderId?, partyName, partyRole` that `makeLedgerEntry` fills from the canonical ones. Dynamic entries do NOT maintain a true running balance: order DEBITs store `runningBalance = grandTotal` and payment CREDITs store `runningBalance = 0`, regardless of history — which is why PlatformLedger's "Balance" stat (last entry's `.balance`) is effectively meaningless once dynamic entries exist. `relatedOrderId` is only set for ORDER entries, so PharmacistStockistDetail's ledger tab (filters by relatedOrderId) silently omits dynamic payment CREDITs.

### 13.17 `CreditSummary` / `CreditEntry` — seed-only export (`payments.ts`), never rendered.

### 13.18 `CirclePharmacy` — the rich seed circle type (`pharmacist` object, `customPricing`, `priceModifier`, `addedAt`); 11 seed rows in `banners.ts`; **entirely unused** — the live circle model is the context's `CircleEntry`.

### 13.19 `CircleEntry` (context-local) — `id, stockistId, pharmacyId, creditLimit: number, creditDays: number, notes, addedAt`. THE join entity of the app: drives `getOrderType` (CIRCLE vs PLATFORM), the credit engine (`getCreditLimit/canUseCredit`), the stockist's "My Pharmacies" list, and pharmacist auto-connection. No custom pricing exists in the live model.

### 13.20 `CartItem` (context-local) — `medicineId, name, batch` (batchNumber string), `batchId, price, mrp, quantity, stockistId, stockistName`. Cart identity key = `batchId + stockistId` for merge, `medicineId + stockistId` for remove/update (slight asymmetry; harmless because each medicine contributes one best batch).

### 13.21 `Invoice` (context-local) — `id, invoiceNumber ('INV-2024-###'), orderId, orderNumber, pharmacy, stockist, items[{name,qty,price,total}], subtotal, discount, tax, total, createdAt, status: draft|issued|paid`. Always created as `issued`; nothing ever moves one to `paid` (StockistPayments' bills tab derives paid/unpaid from live payment math instead of this field).

### 13.22 `PaymentReminder` (context-local) — `id, pharmacyName, pharmacyId, amount, message, sentAt, channel: whatsapp|sms`. Only `whatsapp` is ever written. Read back only in StockistPayments' "Reminder History" (last 3).

### 13.23 `Subscription` — `plan, billLimit, billsUsed, validUntil, status: active|expired|grace`. `billsUsed` is never incremented by QuickBill or anything else (static seed numbers); `expired`/`grace` never occur.

### 13.24 `Notification` — `id, title, message, type: push|in_app, target: 'all'|'stockists'|'pharmacists'|userId, read, createdAt, actionUrl?`. Seed-only entity; the Notifications page also fabricates pseudo-notifications from orders at render time (§0.7). `actionUrl` exists on 3 seed rows but the page never navigates on click (click only marks read).

### 13.25 `Banner` — `id, title, message, ctaText?, ctaUrl?, target, active, createdAt`. Rendered by the 3 dashboards through the `Banner` ui-pattern (dismiss = local state only, reappears on reload). Admin-created banners get `ctaUrl` only if ctaText given? — BannerManagement collects Title/CTA Text/Message/Target; it sets no ctaUrl, so admin banner CTAs render but navigate nowhere meaningful (`ctaUrl` undefined → CTA hidden on stockist/pharmacist dashboards which require `banner.ctaUrl`; AdminDashboard's CTA is a no-op regardless).

### 13.26 `CommissionRule` — `id, category, rate, appliedTo`. Seed 5 rules; admin page edits a local copy only; **no calculation anywhere consumes commission rules** (AdminPayments' "Commission" stat is an unrelated flat 5% of volume).

### 13.27 `DeliverySlot` / `ServiceArea` / `Holiday` — as documented in §3.12/§3.13. Note: `deliveryAreas`/`deliverySlots` are a **single global list**, not per-stockist — every stockist who logs in sees and edits the same three seeded areas/slots (no `stockistId` on ServiceArea/DeliverySlot). `Holiday` DOES have `stockistId`.

### 13.28 `ReturnRequest` / `ReturnItem` / `CreditNote` — as §5.3/§8.13. CreditNote fields `applied`/`appliedToOrderId` are write-never: no consumer flips `applied`, so every minted credit note stays "available" forever and is displayed only as an ID string on OrderDetail.

### 13.29 `PharmacyInventoryItem` — `id ('pi-{orderId}-{idx}'), pharmacyId, medicineId, medicineName, batchNumber, quantity, mrp, expiryDate, receivedAt, orderId`. Append-only (no decrement when the pharmacy "sells"); duplicated medicine across orders creates separate rows.

### 13.30 `SupportMessage` — `id, userId, userName, userRole, message, isAgent, createdAt`. Bot replies: `userId:'agent'`-like? — actual code posts bot with `isAgent:true`, `userRole:'admin'`, `userName:'Support Bot'`.

### 13.31 `DashboardStat` — display-shape helper `{label, value, change?, icon, trend?}` used by StatCard consumers.

### 13.32 Entity relationship map (as actually wired)
```
StockistProfile 1—N Medicine (stockistId) 1—N Batch (medicineId, stockistId)
StockistProfile N—N PharmacistProfile via CircleEntry (creditLimit/creditDays)  ← CIRCLE detection + credit engine
PharmacistProfile —N connectedStockists[pharmacyId] (string[] of stockistIds)   ← browse visibility
Order N—1 placedBy / N—1 placedTo (embedded {id,name,role}); items embed Medicine+Batch BY VALUE
Payment N—1 Order (orderId); LedgerEntry N—1 Order|Payment (referenceId)
Invoice 1—1 Order; ReturnRequest N—1 Order; CreditNote 1—1 ReturnRequest
PharmacyInventoryItem N—1 Order (auto-created on delivered)
Holiday N—1 Stockist; Address N—1 Pharmacy (organizationId); Banner/Notification target roles or user ids
```

---

## 14. COMPLETE SEED DATA CATALOG (exact values)

### 14.1 Dummy credentials (`users.ts`)
| Role | Email | Password | Logs in as |
|---|---|---|---|
| admin | admin@digiswasthya.in | Admin@123 | admin-001 Rajesh Kumar |
| stockist | suresh@medcorp.in | Stock@123 | stockist-001 MedCorp |
| pharmacist | ramesh@citycare.in | Pharma@123 | pharma-001 City Care |

(Any other input for a role also logs in as that same first seed user — fallback in `getUserByCredentials`.)

### 14.2 Stockists (5)
| id | Business | Status | City/State | Plan (used/limit) | Credit rule | Delivery charge | Docs | Bank/UPI |
|---|---|---|---|---|---|---|---|---|
| stockist-001 | MedCorp Distributors Pvt. Ltd. (Suresh Mehta) | approved | Mumbai/maharashtra | standard_200 (147/200, until 2025-02-15) | ₹50,000 / 30d, min order ₹500 | free_above ₹2000 else ₹50 | 5 (20B, GST, 21B, FSSAI, PAN) | HDFC …6789 / medcorp@hdfcbank |
| stockist-002 | PharmaTrade India LLP (Priya Sharma) | approved | Pune | basic_100 (89/100) | ₹30,000 / 15d, min ₹1000 | flat ₹50 | 2 | ICICI, no UPI |
| stockist-003 | LifeLine Pharma Solutions (Amit Patel) | **pending** | Ahmedabad/gujarat | basic_100 (0/100) | none set | none | **0 docs** | none |
| stockist-004 | VitalMeds Distribution (Vikram Singh) | approved | Delhi | premium_500 (312/500) | ₹75,000 / 45d, min ₹750 | free_above ₹3000 else ₹75 | 2 | Axis / vitalmeds@axisbank |
| stockist-005 | PharmaLink India Enterprises (Arun Kumar) | approved | Bangalore/karnataka | standard_200 (78/200) | ₹40,000 / 21d, min ₹600 | flat ₹40 | 1 | SBI, no UPI |

Delivery days/slots: 001 Mon–Sat morning+afternoon (radius 25km, 7 pincodes); 002 Mon/Wed/Fri morning; 003 Mon–Fri full_day; 004 Mon–Sat morning/afternoon/evening; 005 Mon/Wed/Fri morning+afternoon.

### 14.3 Pharmacists (6)
| id | Pharmacy | Status | Type/Entity | City | Purchase range | Credit ask | Docs |
|---|---|---|---|---|---|---|---|
| pharma-001 | City Care Pharmacy (Dr. Ramesh Gupta) | approved | retail/proprietorship | Mumbai 400001 | 50k_2l | ₹25,000 / 30d | 5 |
| pharma-002 | HealthPlus Chemist & Druggist (Dr. Neha Desai) | approved | chain(5)/private_limited | Thane | 2l_5l | ₹1,00,000 / 45d | 3 |
| pharma-003 | Wellness Pharmacy (Dr. Sanjay Patil) | **pending** | clinic/proprietorship, **no GST** | Pune | lt_50k | none | **0 docs** |
| pharma-004 | MedMax Store (Dr. Pooja Verma) | approved | retail | Mumbai 400050 | 50k_2l | ₹30,000 / 30d | 1 |
| pharma-005 | Apollo Pharmacy — Dadar (Dr. Manish Joshi) | approved | chain(12) | Mumbai 400028 | 2l_5l | ₹2,00,000 / 60d | 2 |
| pharma-006 | Shree Medical & General Stores (Dr. Rahul Sharma) | approved | retail | Thane (Kalyan) | lt_50k | creditRequired:false | 1 |

### 14.4 Medicines (18) & batches (19) — full table
| Med | Name | Category | Mfr | Owner | Batch(es) | Expiry | MRP/Sell/Buy | Qty |
|---|---|---|---|---|---|---|---|---|
| med-001 | Paracetamol 500mg | Analgesic | Cipla | s-001 | batch-001 CIP-P500-2024A | 2026-06-15 | 35/28/22 | 500 |
| | | | | | batch-002 CIP-P500-2024B | **2025-03-01 (expired)** | 35/28/22 | 120 |
| med-002 | Amoxicillin 250mg | Antibiotic | Sun | s-001 | batch-003 SUN-AMX-2024A | 2026-09-20 | 85/68/55 | 300 |
| med-003 | Omeprazole 20mg | Antacid | Dr. Reddy's | s-001 | batch-004 DRR-OMP-2024A | 2026-12-10 | 120/95/78 | 200 |
| med-004 | Metformin 500mg | Antidiabetic | USV | s-001 | batch-005 USV-MET-2024A | 2026-08-25 | 65/52/42 | 450 |
| med-005 | Cetirizine 10mg | Antihistamine | Cipla | s-001 | batch-006 CIP-CET-2024A | **2025-04-15 (expired)** | 45/36/28 | 80 |
| med-006 | Azithromycin 500mg | Antibiotic | Zydus | s-001 | batch-007 ZYD-AZI-2024A | 2026-07-01 | 180/145/120 | 150 — **isCounterfeit (med + batch)** |
| med-007 | Ibuprofen 400mg | Analgesic | Abbott | s-001 | batch-008 ABB-IBU-2024A | 2026-11-30 | 55/44/35 | 350 |
| med-008 | Atorvastatin 10mg | Cardiovascular | Ranbaxy | s-001 | batch-009 RAN-ATV-2024A | 2026-10-15 | 95/78/62 | 250 |
| med-009 | Ciprofloxacin 500mg | Antibiotic | Cipla | s-002 | batch-010 CIP-CFX-2024A | 2026-05-20 | 110/88/72 | 200 |
| med-010 | Pantoprazole 40mg | Antacid | Sun | s-002 | batch-011 SUN-PNT-2024A | 2026-08-15 | 90/72/58 | 300 |
| med-011 | Losartan 50mg | Cardiovascular | USV | s-002 | batch-012 USV-LOS-2024A | 2026-11-10 | 75/60/48 | 400 |
| med-012 | Amlodipine 5mg | Cardiovascular | Dr. Reddy's | s-002 | batch-013 DRR-AML-2024A | 2026-09-01 | 55/44/35 | 350 |
| med-013 | Doxycycline 100mg | Antibiotic | Sun | s-004 | batch-014 SUN-DOX-2024A | 2026-07-20 | 95/75/60 | 250 |
| med-014 | Ranitidine 150mg | Antacid | GSK | s-004 | batch-015 GSK-RAN-2024A | 2026-10-05 | 50/40/32 | 500 |
| med-015 | Montelukast 10mg | Respiratory | Sun | s-005 | batch-016 SUN-MON-2024A | 2026-12-01 | 140/112/90 | 200 |
| med-016 | Telmisartan 40mg | Cardiovascular | Glenmark | s-005 | batch-017 GLN-TEL-2024A | 2026-09-15 | 85/68/55 | 350 |
| med-017 | Clopidogrel 75mg | Cardiovascular | Torrent | s-005 | batch-018 TOR-CLO-2024A | 2026-10-20 | 120/96/78 | 300 |
| med-018 | Levothyroxine 50mcg | Thyroid | Abbott | s-005 | batch-019 ABB-LEV-2024A | 2026-11-10 | 65/52/42 | 400 |

HSN codes: antibiotics `30041000`, Metformin `30049039`, everything else `30049099`. With "today" ≈ mid-2026, several 2026 expiries (batch-001 Jun-15, batch-007 Jul-01, batch-010 May-20, batch-014 Jul-20) are at/near expiry — the live `allInventory.totalStock` excludes any batch whose expiryDate ≤ now, so effective stock depends on the real clock at runtime.

### 14.5 Seed orders (9) — full table
| id | # | Placed by → to | type/orderType | Status | Items (qty × unit) | Subtotal/Disc/Tax/Grand | Paid (payment) |
|---|---|---|---|---|---|---|---|
| order-001 | ORD-2024-001 | pharma-001 → stockist-001 | pharmacy/CIRCLE | delivered | Paracetamol 50×28, Omeprazole 20×95 | 3290/268/362/**3384** | 3384 pay-001 bank (paid) |
| order-002 | ORD-2024-002 | pharma-002 → stockist-001 | pharmacy/CIRCLE | confirmed | Amoxicillin 30×68, Cetirizine 40×36 | 3480/41/413/**3852** | 2000 pay-002 upi (partial) |
| order-003 | ORD-2024-003 | pharma-001 → stockist-002 | pharmacy/**PLATFORM** (hardcoded literal) | placed | Ciprofloxacin 100×88 | 8800/440/1003/**9363** | — (pending) |
| order-004 | ORD-2024-004 | stockist-001 → pharma-001 | stockist/CIRCLE | dispatched | Ibuprofen 25×44 | 1100/110/119/**1109** | — (pending) |
| order-005 | ORD-2024-005 | pharma-004 → stockist-001 | pharmacy/CIRCLE | delivered | Paracetamol 100×28, Atorvastatin 30×78 | 5140/271/584/**5453** | 5453 pay-005 bank (paid) |
| order-006 | ORD-2024-006 | pharma-005 → stockist-001 | pharmacy/CIRCLE | confirmed | Amoxicillin 50×68, Metformin 80×52, Cetirizine 60×36 | 9560/528/1085/**10117** | 5000 pay-006 upi (partial) |
| order-007 | ORD-2024-007 | stockist-001 → pharma-005 | stockist/CIRCLE | delivered | Paracetamol 200×26 | 5200/416/574/**5358** | 5358 pay-007 bank (paid) |
| order-008 | ORD-2024-008 | pharma-006 → stockist-001 | pharmacy/CIRCLE | placed | Paracetamol 30×28, Cetirizine 20×36 | 1560/0/187/**1747** | — (pending) |
| order-009 | ORD-2024-009 | pharma-002 → stockist-002 | pharmacy/CIRCLE | delivered | Losartan 50×60 | 3000/90/349/**3259** | 3259 pay-008 cash (paid) |

`orderType` for seeds comes from a local `circleMap` in orders.ts (stockist-001↔pharma-001/002/004/005/006, stockist-002↔pharma-001/002), NOT from the live circleEntries — they happen to agree. Seed order taxes are ~11–11.4% effective (hand-authored), unlike dynamic orders' exact 12%. Payment fields `totalPaid/totalDue/paymentStatus` are computed at module load from seed payments via `getPaymentFields`. The three delivered seeds (001, 005, 007) plus 009 auto-populate pharmacy inventories on first app load via the delivery-sync effect (§8.14) — so pharma-001/004/005 and pharma-002 start with non-empty "My Inventory".

### 14.6 Seed payments (6) — pay-001 3384 bank / pay-002 2000 upi / pay-005 5453 bank / pay-006 5000 upi / pay-007 5358 bank / pay-008 3259 cash. IDs pay-003/pay-004 do not exist. All have real dueDate + `TXN-2024-###` references.

### 14.7 Seed ledger (15 rows, `led-001..015`) — one DEBIT per seed order + one CREDIT per seed payment, chronological 2024-10-15 → 2024-11-25, each with hand-maintained per-pharmacy runningBalance (e.g. led-010 partial payment leaves balance 1852; led-014 leaves 5117). Last row led-015 balance 1747 → this is the number PlatformLedger shows as "Balance" until a dynamic entry is appended.

### 14.8 Default circle entries (in AppStateContext, THE live circle data)
| id | Stockist ↔ Pharmacy | Credit limit | Days |
|---|---|---|---|
| circle-001 | s-001 ↔ pharma-001 | 25,000 | 30 |
| circle-002 | s-001 ↔ pharma-002 | 50,000 | 30 |
| circle-003 | s-001 ↔ pharma-004 | 30,000 | 30 |
| circle-004 | s-001 ↔ pharma-005 | 100,000 | 45 |
| circle-005 | s-001 ↔ pharma-006 | 15,000 | 15 |
| circle-006 | s-002 ↔ pharma-001 | 20,000 | 15 |
| circle-007 | s-002 ↔ pharma-002 | 40,000 | 30 |
| circle-008 | s-004 ↔ pharma-001 | 15,000 | 30 |
| circle-009 | s-005 ↔ pharma-002 | 20,000 | 30 |

Default `connectedStockists` is built from this table: pharma-001 → [s-001, s-002, s-004]; pharma-002 → [s-001, s-002, s-005]; pharma-004/005/006 → [s-001]. pharma-003 (pending) has no connections.

### 14.9 Default addresses (7, in AppStateContext) — addr-001..006 are each pharmacy's default store address (with contactName/phone for most); addr-007 is a second non-default "Warehouse, Goregaon" address for pharma-001. These are distinct objects from the `address` embedded in each PharmacistProfile (same content for the defaults).

### 14.10 Default service areas & slots (global, §13.27) — sa-001 Mumbai Central 400001 active, sa-002 Thane West 400601 active, sa-003 Navi Mumbai 400705 **inactive**; slots Morning 09–12, Afternoon 12–16, Evening 16–20.

### 14.11 Seed banners/notifications/commission (banners.ts) — as §1.5; banner ctaUrls are `/orders` and `/subscription` (role-relative paths that resolve because dashboards navigate() with them — actually they navigate to literal `/orders` (a 404→NotFound, since only `/orders/:id` exists) and `/subscription` (also unrouted; real route is `/stockist/subscription`). **Both seed banner CTAs therefore navigate to the 404 page.**

---

## 15. APPSTATECONTEXT — FULL API SURFACE (all ~75 exposed members)

Supplementing §8 with the exact contract of every member on the context value (signature → behavior). State slices persist to `digi-swasthya-state` on **every** change via one `useEffect` serializing all 29 slices (full-state JSON rewrite per mutation). `loadState()` is try/catch-guarded; corrupt JSON → fresh defaults. `connectedStockists` is shape-validated (must be a non-array object) before being accepted from storage.

**Merged read models (memoized):** `allOrders`, `allPayments`, `allLedger`, `allStockists`, `allPharmacists`, `allMedicines`, `allBatches`, `allInventory`, `allBanners` — merge rules in §8.1.

**Cart:** `addToCart(item)` (guards: qty vs available incl. overrides — note the "existing in cart" lookup matches by batchId only; expired batch; counterfeit; silent `return` on failure — callers show their own toasts *before* calling, so a silently-rejected add can still toast "Added to cart" in BrowseMedicines), `removeFromCart(medicineId, stockistId)`, `updateCartQty(medicineId, stockistId, qty)` (≤0 removes; **no stock re-validation on increment** — checkout's validateStock is the backstop), `clearCart()`.

**Orders:** `createOrder(orderData)` returns the created Order (id `order-dyn-{counter}`; number `ORD-YYYYMMDD-{counter padded 4}`; timeline `[{status, now, 'Order placed'}]`; prepends; DEBIT ledger entry with `partyRole` hardcoded `'pharmacist'`; auto-`deductStock` iff created status === 'confirmed'). `updateOrderStatus(orderId, newStatus, note?)` — no-op on delivered/cancelled; deduct on placed/draft→confirmed; restore on confirmed/dispatched→cancelled; seed orders get status+timeline via `orderStatusOverrides`, dynamic mutate in place; **does not validate the transition against `orderFlow`** (any caller could jump statuses; UI buttons happen to follow the flow). `updateOrderItems(orderId, items, totals)` — dynamic + placed only.

**Payments:** `addPayment({orderId, amount, method, reference?, paidAt?, dueDate?})` — rejects cancelled orders; clamps to remaining; computes paid/partial; payer/payee derived from order.type; appends CREDIT ledger entry (`runningBalance: 0`, description `Payment received — pay-dyn-{ts}`). `addLedgerEntry(entry)` — generic ledger appender, **exposed but never called by any live screen** (only imported-unused in dead PaymentsPage).

**Invoices/reminders:** `generateInvoice(orderId)` (idempotent per order; null if order missing), `sendReminder(reminder)`.

**Connections:** `connectStockist`, `disconnectStockist` (exposed, **no UI calls it** — there is no "disconnect stockist" button anywhere), `getConnectedStockists(pharmacyId)`.

**Users:** `registerStockist`/`registerPharmacist` (append with forced `pending`), `updateUserStatus(userId, status)` (override map — works on seed and dynamic users alike).

**Inventory:** `addMedicine`, `updateMedicine` (matches by id in dynamicMedicines only → **silently no-ops for the 18 seed medicines**), `addBatch`, `updateBatch` (maps dynamicBatches by id → **price/expiry/batchNumber edits silently no-op for the 19 seed batches; only the `batchQtyOverrides[batch.id] = batch.quantity` side-effect lands**), `addProduct(med, batch)` (dedupe med by id), `getAvailableStock(batchId)`, `validateStock(items)`, `toggleCounterfeit(medicineId)`.
> **CORRECTION/nuance to §3.4, §3.20, §11:** because `updateMedicine`/`updateBatch` only touch *dynamic* arrays, EditProduct and BulkPriceUpdate are fully effective **only for stockist-added products**. Editing a **seed** product persists nothing except the quantity override (EditProduct) — name/price/MRP changes toast "success" but revert on reload; BulkPriceUpdate's confirmed price changes on seed batches likewise do not persist (each seed batch only gets a redundant qty override).

**Banners:** `addBanner`, `updateBanner` (seed → override map; dynamic → in-place), `deleteBanner(id)` (tombstone list, applies to both seed and dynamic).

**Circle:** `addCircleEntry` (id `circle-{ts}`, auto-connect), `removeCircleEntry(id)` (does NOT auto-disconnect the stockist connection, so the pharmacy still sees the stockist's catalog after removal — orders just become PLATFORM), `updateCircleEntry(id, partial)`.

**Addresses:** `addAddress` (id `addr-{ts}`), `updateAddress` (exposed; no live screen edits addresses — Addresses page only adds/deletes/sets-default), `deleteAddress`, `setDefaultAddress` (per-organizationId exclusivity).

**Order-type & credit:** `getOrderType(pharmacyId, stockistId)`, `getCreditUsed` (Σ unpaid across ALL non-cancelled orders of the pair — both CIRCLE and PLATFORM orders count against the circle credit limit), `getCreditLimit`, `canUseCredit(p, s, amount)`.

**Selectors:** `getUserById(id)` (searches stockists+pharmacists; NOT admin), `getOrdersByUser(userId)`, `getInventoryByStockist(stockistId)`, `getBatchesByProduct(productId)`.

**Money selectors:** `getOrderPayments/getOrderPaidAmount/getOrderRemainingAmount/getOrderPaymentStatus(orderId)`, `getOutstandingForParty(partyId)`, `getOutstandingBetween(a, b)` (direction-agnostic), `getLedgerBalance()` = Σ(debit−credit) over all ledger (unused by screens).

**Delivery/holidays:** `addDeliveryArea/updateDeliveryArea/removeDeliveryArea/addDeliverySlot/removeDeliverySlot` (no updateDeliverySlot exists), `addHoliday/removeHoliday/isStockistOnHoliday/getStockistHolidayInfo` (today-exact match only — future holidays never flag anything until their exact date).

**Returns/credit notes:** `createReturnRequest`, `approveReturn(returnId)` (mints CreditNote inside a `setReturnRequests` mapper — a setState side-effect inside another setState updater; works in practice), `rejectReturn`, `getAvailableCreditNotes(p, s)` (never consumed).

**Pharmacy inventory / support:** `getPharmacyInventory(pharmacyId)`, `addSupportMessage(msg)`; delivery-sync `useEffect` (§8.14) — its dependency array is `[allOrders]` only; it reads `pharmacyInventory` from the closure for the already-added check (stale-read risk is mitigated because each delivered order triggers a state append which re-renders).

**Misc engine quirks:** `orderCounter`/`invoiceCounter` restore as `saved?.orderCounter || 10` — a falsy stored `0` would reset (can't occur since counters start ≥10/≥5). `createOrder`'s ledger `partyRole` is always `'pharmacist'` even for stockist-placed orders. Dynamic payment ledger CREDITs always store `balance: 0`. A dead local `const originalUpdateOrderStatus = updateOrderStatus;` remains in the provider (leftover comment block about "enhancing" the function).

---

## 16. PERMISSION MATRIX & STATE MACHINES (verbatim from `roles.ts` / `flows.ts`)

### 16.1 `rolePermissions` — full matrix (display/menu use only; ZERO route or action enforcement)
| Capability | admin | stockist | pharmacist |
|---|---|---|---|
| canManageUsers | ✅ | ❌ | ❌ |
| canManageInventory | ❌ | ✅ | ❌ |
| canPlaceOrders | ❌ | ✅ | ✅ |
| canManageOrders | ✅ | ✅ | ❌ |
| canViewLedger | ✅ | ✅ | ✅ |
| canManageCommissions | ✅ | ❌ | ❌ |
| canFlagCounterfeit | ✅ | ❌ | ❌ |
| canSendNotifications | ✅ | ❌ | ❌ |
| canManageBanners | ✅ | ❌ | ❌ |
| canBrowseMedicines | ❌ | ❌ | ✅ |
| canManageCircle | ❌ | ✅ | ❌ |
| canManageSubscription | ❌ | ✅ | ❌ |

`roleLabels`: Admin/Stockist/Pharmacist. `roleDescriptions`: "Platform administrator with full management capabilities" / "Medicine supplier managing inventory and orders" / "Pharmacy owner browsing and ordering medicines".

### 16.2 `orderFlow` transitions
draft→[placed,cancelled]; placed→[confirmed,cancelled]; confirmed→[dispatched,cancelled]; dispatched→[delivered]; delivered→[]; cancelled→[]. **The engine does not consult this table** — only OrderDetail's role-based buttons follow it. Note dispatched→cancelled is NOT in the table, yet admin "Force Cancel" is offered on dispatched orders and `updateOrderStatus` will happily perform it (and restoreStock handles it).

### 16.3 `approvalFlow`
pending→[approved,rejected,update_required]; approved→[rejected,suspended]; rejected→[pending]; update_required→[pending]; suspended→[approved]. Also unenforced; admin buttons write any status regardless (e.g. Verify is offered on already-rejected users in lists).

### 16.4 `paymentFlow` — pending→[paid,partial,overdue]; partial→[paid,overdue]; overdue→[paid,partial]; paid→[]. Entirely decorative: payment status is recomputed, never transitioned.

### 16.5 Status color maps — orderStatusColors: draft muted, placed primary, confirmed accent, dispatched warning, delivered success, cancelled destructive. approvalStatusColors: pending warning, approved success, rejected destructive, update_required accent, suspended destructive. paymentStatusColors: paid success, partial warning, overdue destructive, pending muted.

### 16.6 De-facto permission model (what actually gates anything)
1. `AppLayout`: `isAuthenticated` or `<Navigate to="/login">`. 2. `Dashboard.tsx`: role switch (default `null` — a user with a corrupted role renders a blank dashboard). 3. Navigation menus per role. 4. OrderDetail `getActions(role, status)` — the only per-action role logic in the app. 5. Everything else is open: a pharmacist can manually browse to `/admin/banners` and delete banners; a stockist can open `/admin/approvals` and approve users. Data-scoping (filtering by `user.id`) is the only isolation, and several stockist pages fall back to `'stockist-001'` when `user?.id` is missing.

---

## 17. END-TO-END USER JOURNEYS (as the app actually behaves)

### 17.1 Pharmacist: connect → browse → cart → checkout → delivery → return → credit note
1. Login at `/auth` (role Pharmacy, prefill demo) → lands `/dashboard` as pharma-001 with 3 stockists pre-connected.
2. `/pharmacist/stockists/find` → "Connect" any approved stockist (e.g. PharmaLink) → its catalog appears in Browse.
3. `/pharmacist/browse` → Add to Cart (FIFO earliest-expiry valid batch, qty 1, guards stock/expiry/counterfeit) → adjust qty in `/pharmacist/cart`.
4. `/pharmacist/checkout`: pick saved address (or add one), pick a cosmetic delivery slot, per-CIRCLE-group choose Pay Now (UPI) or Pay Later (credit-checked vs `CircleEntry.creditLimit` minus `getCreditUsed`); PLATFORM groups force Pay Now. Place → 2s fake UPI spinner → one order per stockist (`confirmed`+paid+stock deducted if prepaid; `placed`+pending if credit) → success screen with order numbers → cart cleared.
5. Stockist side advances the order placed→confirmed (stock deducts, invoice auto-generates)→dispatched→delivered.
6. On delivered: items auto-append to the pharmacy's read-only `/pharmacist/inventory`; pharmacist gains "Request Return" on the order.
7. `/orders/:id/return`: tick items, set qty/reason → pending request. Stockist approves on OrderDetail → CreditNote minted (Σ unitPrice×returnQty) → displayed as an ID chip. **Journey ends here: no stock is restored on return, no refund/ledger entry occurs, and the credit note can never be spent.**
8. Dues: `/pharmacist/payments` → per-stockist "Pay Now" → FIFO allocation across that stockist's unpaid orders → payments + CREDIT ledger rows.

### 17.2 Stockist: catalog → circle → bill → collect
1. Login as stockist (MedCorp) → dashboard shows real KPIs from seed+dynamic data.
2. Add product (`/stockist/inventory/add`) → real Medicine+Batch persisted; add further batches from ProductDetail.
3. Grow circle: `/stockist/circle/find` → Add platform pharmacy with credit limit/days (auto-connects them), or "Create New" off-platform pharmacy (stored pending but circled).
4. Bill a pharmacy: **Quick Bill** (paste WhatsApp text → parse → map unmatched → pick pharmacy → edit → confirmed CIRCLE order + invoice, stock deducted) or **Create Order** (search-and-add UI; offline toggle → confirmed; else placed).
5. Manage lifecycle from `/stockist/orders` → OrderDetail (Confirm/Dispatch/Deliver, approve/reject returns, add payments).
6. Collect: `/stockist/circle` "Collect Payment" (FIFO across dues) or per-order Add Payment; send WhatsApp "reminders" (records only).
7. Housekeeping: DeliverySetup + Holidays (real, but delivery areas/slots are global, and holidays only surface as badges on pharmacist screens on the exact day); Reports/Analytics/Subscription/Profile-edit are display-or-toast stubs.

### 17.3 Admin: verify → police → observe
1. `/admin-login` (or 5 taps on Login logo) → dashboard KPIs.
2. `/admin/approvals`: verify/reject/request-update pending users (seed pending: LifeLine, Wellness; plus any stockist-created circle pharmacies).
3. Police: `/admin/counterfeit` flag/unflag (immediately blocks cart/order for that med), `/admin/suspensions` reinstate `rejected` users, force-cancel orders from OrderDetail.
4. Content: `/admin/banners` CRUD (targets role dashboards), Notifications page (read-only merge).
5. Observe: orders/transactions/ledger/payments/analytics — all read-only; commission setup is a local-state sandbox.

### 17.4 Registration journeys (both end in a demo session)
Sign-Up tab → role → `/register/{role}` wizard (7 or 5 steps, full validation per §2.5/§2.6) → T&C gate → success modal → "Start exploring now" logs into the role's **seed** account (`stockist-001`/`pharma-001`); every entered field is discarded. No admin-approval journey ever starts from self-registration.

---

## 18. APPLICATION SHELL, DEAD FILES & TOOLING

### 18.1 Shell files
- **`main.tsx`:** `createRoot(#root).render(<App />)` + `index.css`. No StrictMode.
- **`App.tsx` (176 lines):** all ~70 route declarations (§0.1) + `queryClient = new QueryClient()` — TanStack Query is provided but **no `useQuery`/`useMutation` exists anywhere** (pure ceremony). Both toast systems mounted (shadcn `Toaster` + `Sonner`); screens use the shadcn `use-toast` variant.
- **`Dashboard.tsx`:** 16-line role switch → Admin/Stockist/Pharmacist dashboard; unknown role → `null`.
- **`Index.tsx`:** `<Navigate to="/login" replace>` — **dead file**, not referenced by App.tsx (the `/` route uses an inline Navigate to `/auth`).
- **`NotFound.tsx`:** logs `console.error("404 Error: User attempted to access non-existent route:", pathname)`; "Return to Home" is a raw `<a href="/">` (full page reload → `/auth`).
- **`AuthContext` extras beyond §0.3:** `login` returns `Promise<boolean>` (always true in practice); storage read/write/clear all try/catch-swallowed; `loadAuthState` requires both `user` and `role` keys; `getUserByCredentials` matches exact creds *per role* first (so the right email/password under the wrong role selector still fallback-logs-in as the selected role's seed user).

### 18.2 Hooks & utils
- `use-mobile.tsx`: `useIsMobile()` — matchMedia breakpoint **768px**, drives shadcn sidebar (the sidebar component itself is unused by AppLayout).
- `use-toast.ts`: reducer-based store, `TOAST_LIMIT=1` (new toast replaces previous), `TOAST_REMOVE_DELAY=1_000_000`ms.
- `lib/utils.ts`: `cn()` = clsx+tailwind-merge.

### 18.3 UI kit
48 shadcn/ui components under `components/ui/` (accordion → tooltip incl. sidebar, chart, carousel, input-otp, resizable, etc.) — standard generated wrappers; many (menubar, context-menu, breadcrumb, pagination, input-otp, resizable, carousel, hover-card, navigation-menu, aspect-ratio) are never imported by app code. `components/registration/*` and `core/ui-patterns/*` are covered in §2.7/§0.10. `NavLink.tsx` = unused RouterNavLink wrapper. Assets: `pharmacy-card.jpg` / `stockist-card.jpg` used by the dead Signup.tsx role cards.

### 18.4 Tests & config
- `src/test/example.test.ts` is the **only** test: `expect(true).toBe(true)`. `src/test/setup.ts` for vitest.
- Scripts: `dev`, `build`, `build:dev`, `lint`, `preview`, `test`, `test:watch`. Dependencies of note: react-hook-form + zod (installed; wizards use manual state — zod appears only via shadcn `form.tsx`), recharts (used by dashboards/analytics), date-fns, embla, vaul, `lovable-tagger` (Lovable-platform origin marker).

### 18.5 Consolidated dead-code inventory (files/exports with zero live consumers)
`PaymentsPage.tsx` (unrouted), `Index.tsx` (unrouted), `Login.tsx`/`Signup.tsx` (routes redirect away; reachable only by internal links from each other/AdminLogin), `NavLink.tsx`, `ErrorState` pattern, `Document` type, seed exports `circlePharmacies`/`creditSummary`/`pendingApprovals`/`inventoryItems`, context members `addLedgerEntry`/`disconnectStockist`/`updateAddress`/`getLedgerBalance`/`getAvailableCreditNotes`/`getBatchesByProduct` (exposed, uncalled or near-uncalled by live screens), `paymentFlow`/`approvalFlow`/`orderFlow` tables (decorative), `rolePermissions` (labels only), ~10 unused shadcn components, `originalUpdateOrderStatus` leftover, ResetPassword route (nothing links to it), Onboarding route (nothing links to it).

---

## 19. CALCULATION REFERENCE (every formula in one place)

| Calculation | Formula | Where |
|---|---|---|
| Order tax | `Math.round(subtotal × 0.12)` | Cart, Checkout, CreateOrder, QuickBill, QuickOrder, OrderDetail edit |
| Per-item tax (dynamic) | `Math.round(qty × unitPrice × 0.12)` | CreateOrder, QuickBill, Checkout, OrderDetail edit |
| Grand total (dynamic) | `subtotal − 0 + tax` (discount always 0) | all creation flows |
| Grand total (edit) | `subtotal − Σitem.discount + Σitem.tax` | OrderDetail Edit Items |
| Margin % | `round((selling − purchase) / purchase × 100)` | Inventory card/list |
| Paid amount | `Σ payments.amount for orderId` (seed+dynamic) | getOrderPaidAmount |
| Remaining / pending | `max(0, grandTotal − paid)` | getOrderRemainingAmount, OrderDetail |
| Outstanding (party/pair) | `Σ max(0, grandTotal − paid)` over non-cancelled orders | getOutstandingForParty/Between, dashboards, payments pages |
| Stockist dashboard Outstanding | `max(0, Σ grandTotal ALL my orders − Σ 'paid'-status payment amounts)` (coarser than the pair math; partial-status payment rows are excluded from the subtraction) | StockistDashboard |
| Credit used | `Σ max(0, grandTotal − paid)` non-cancelled orders of pharmacy↔stockist pair | getCreditUsed |
| Credit check | `limit > 0 && used + orderTotal ≤ limit` | canUseCredit → Checkout pay-later |
| Credit usage bar | `min(100, outstanding / creditLimit × 100)` | CirclePharmacyDetail |
| Net due (circle card) | `creditLimit − outstanding` (labelled "CR") | CirclePharmacies |
| FIFO collection allocation | oldest order first, `pay = min(remainingOnOrder, amountLeft)` | CirclePharmacies, CirclePharmacyDetail, PharmacistPayments |
| FIFO/FEFO batch pick | valid batches (expiry > now, qty > 0, !counterfeit) sorted by earliest expiry; `[0]` | BrowseMedicines/QuickOrder (estimate), CreateOrder/QuickBill |
| Return credit note | `Σ orderItem.unitPrice × returnQty` | approveReturn |
| Stock value | `Σ sellingPrice × quantity` over my batches (expired included) | StockistDashboard |
| Total stock (live) | `Σ quantity of batches with expiryDate > now` | allInventory |
| Subscription usage | `round(billsUsed / billLimit × 100)`; color ≥90 red, ≥70 amber | SubscriptionPage |
| Admin commission stat | `round(totalPaymentVolume × 0.05)` | AdminPayments (unrelated to CommissionSetup) |
| Credit-risk eval (registration) | purchase-range→₹ map; `ratio = credit/purchase`; buckets (≤0.25 & ≤15d → low/2mo; ≤0.5 & ≤30d → standard/3mo; ≤0.75 → moderate/4mo; else high/5mo) | PharmacyRegistration step 3 |
| Due date (display) | `createdAt + creditDays × 86,400,000 ms` | CirclePharmacyDetail |
| Monthly order trend | count of orders per calendar month, last 6 months | StockistDashboard |
| GMV | `Σ grandTotal of all orders` | AdminDashboard/AdminAnalytics |
| Ledger balance (unused) | `Σ (debit − credit)` | getLedgerBalance |

**No calculation anywhere involves:** delivery charges, minimum order values, commission rules, price modifiers, SGST/CGST split, per-category GST rates, credit-note redemption, overdue interest, or subscription billing. Those concepts exist only as stored fields, admin sandboxes, or UserFlowPage documentation.

---

*Documentation audit pass appended below — code-derived additions only; prior content preserved.*

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
