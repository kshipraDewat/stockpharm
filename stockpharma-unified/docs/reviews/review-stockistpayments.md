> **Extracted from** [`UNIFIED_FEATURES.md`](../UNIFIED_FEATURES.md) Appendix D (MR).
> **Source repo:** `stockistpayments / PharmaMR (MR)`
> Use [`EXHAUSTIVE_REVIEW_PROMPT.md`](../EXHAUSTIVE_REVIEW_PROMPT.md) to re-run or extend this review.

# PharmaMR / "Chameleon" — EXHAUSTIVE Functional Review

> App path: `/Users/kshipradewat/Desktop/stockpharma/stockistpayments`
> In-product name is inconsistent: PWA manifest = **PharmaMR**; the Layout header renders **"Chameleon MR / Chameleon Stockist / Chameleon Distributor / Chameleon Pharmacy / Chameleon Admin"**; the onboarding screen says **"Welcome to Chameleon"**; the pharmacy dashboard hero still says **"Welcome to PharmaMR Marketplace"**; the auth card shows only a **"P"** glyph. Branding is not unified.
> Stack: Vite 5 + React 18 + TS · shadcn/ui + Tailwind · React Router v6 · TanStack Query · Supabase (Auth/Postgres/Storage/Edge Functions) · Lovable AI Gateway (`google/gemini-2.5-flash`) · PapaParse + SheetJS · Recharts · Zod · Sonner · date-fns.

This review is derived directly from source. It goes deeper than the repo `FEATURES.md`, and **corrects several claims in it** (noted inline as ⚠️ CORRECTION). It is organised: Global architecture → each module → each page (Content / Flows / Forms & fields / Logic / Edge cases) → modals/components → edge functions → data model / RPCs / RLS → complete stub & bug inventory.

---

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

## 1. AUTHENTICATION, SIGNUP & ONBOARDING

### 1.1 `/auth` — `Auth.tsx`
Single card with four modes toggled by local state: **Login / Forgot Password / OTP Login / Signup**. Auth logo = "P". If a `user` already exists, `useEffect` redirects to `/dashboard`.

**Login form** (default): fields Email (type email, required), Password (type password, required). Submit → `supabase.auth.signInWithPassword({email.trim(), password})`; success toast + navigate `/dashboard`; error toast (message or "Invalid email or password"). Footer links: "Forgot Password?", "Login with OTP", "Sign up" (sets signup mode + default role `mr`).

**Forgot Password form**: Email (required). Submit → `resetPasswordForEmail(email, {redirectTo: origin + "/"})`; toast; returns to login.

**OTP Login form**: Email (required). Submit → `signInWithOtp({email, options.emailRedirectTo: origin+"/"})`; toast "OTP sent…".

**Signup form** — fields & validation (client-side, all via Sonner toasts):
- **User Type** radio (`grid-cols-2`): MR / Stockist / Distributor / Pharmacy / Admin. Default `mr`.
- **Username** (text, minLength 6, maxLength 16, required). Live availability check: `checkUsernameAvailability` queries `profiles.username` with `ilike` (case-insensitive) via `maybeSingle`; shows spinner "Checking…", green "Available", or red "Taken". Submit blocked if taken. Helper text advertises "6-16 characters, all symbols allowed". Placeholder `e.g., JITESSH3710`.
- **Full Name** (text, required).
- **Email** (email, required) — validated with Zod `z.string().trim().email()`.
- **Password** (password, required, minLength 6).
- **Phone** (tel, required) — Zod `min(10).max(15)`.
- **Role-specific** (non-pharmacy branch renders):
  - Business/Company Name (required; label "Company Name" for MR else "Business Name").
  - businessType (required; label "Brand Name" for MR else "License Type"; MR placeholder "e.g., Crocin…").
  - UPI ID (optional).
  - Distributor also: Service Areas (optional, comma-separated cities, helper text).
- **Pharmacy branch**: Pharmacy Name (required), Owner Name (required), Address (required). No UPI field. (`upi_id` sent as `""` for pharmacy.)
- **Admin branch**: Admin Registration Password (required) — must literally equal **`jit@ADMIN1`** (validated client-side here AND server-side in `assign-role` AND in DB trigger `handle_new_user`).
- **Document upload** (mandatory for **every** role incl. pharmacy): accept `.pdf,.jpg,.jpeg,.png`, max **5 MB** (checked in `handleFileChange`). Label varies: MR="Company Agreement", stockist="Stockist License", distributor="Distributor License", pharmacy="Pharmacy License (Required)".

**Signup submit flow** (`handleSignup`):
1. Client validations (username length/availability, password≥6, name+phone present, document present, MR brand present, pharmacy owner+address present, admin password==`jit@ADMIN1`, email/phone Zod).
2. `supabase.auth.signUp({email, password, options.data: {username, name, phone, business_name, business_type, upi_id (empty for pharmacy), role, admin_password (only if admin)}})`. → DB trigger `handle_new_user` fires (inserts profile + user_roles; **default role = `pharmacy`** if metadata role missing — ⚠️ CORRECTION: `FEATURES.md` says default `stockist`; the current trigger defaults `pharmacy`).
3. Upload document to **private `licenses`** bucket at `${authUserId}/${Date.now()}_${role}_document.ext`.
4. `profiles.update({verification_document_url: filePath, email})` on the new user id.
5. Call **`assign-role`** edge function (Bearer token) with role + metadata (name/phone/business_name/business_type).
6. Toast success + navigate `/dashboard`.

Edge cases: if email confirmation is required, `getSession()` may lack a token → assign-role silently skipped (caught, logged) → user lands with role from trigger or is sent to `/onboarding`. Signup button disabled when username≥6 and unavailable.

### 1.2 `/onboarding` — `OnboardingSelectRole.tsx`
Reached only when a logged-in user has no role row. Card "Welcome to Chameleon". Radio of **4 roles only** (Pharmacy [default], MR, Stockist, Distributor) — **no Admin option here**. Submit → `assign-role` edge fn with `{role, metadata:{username:`user_${id8}`, name: email-prefix}}`; success → navigate `/` (replace). No document upload in this path.

### 1.3 `DashboardRouter.tsx` (`/`, `/dashboard`)
Reads `["userRole", user.id]` via `maybeSingle`. Spinner while loading. No role → `/onboarding`. Then switch: mr/stockist/distributor → `SellerDashboard`; pharmacy → `PharmacyDashboard`; admin → `AdminDashboard`; default → `/onboarding`.

---

## 2. SELLER MODULE (MR / STOCKIST / DISTRIBUTOR)

### 2.1 Seller Dashboard — `dashboards/SellerDashboard.tsx`
**Content.** Header title by role ("MR Dashboard"/"Stockist Dashboard"/"Distributor Dashboard"); subtitle: MR = `Brand: {business_type} • {business_name}`, stockist = "Multi-brand inventory management", distributor = "Manage inventory & customers". Header action buttons: MR shows **Quick Bill** + **Quick Order** + **OCR Scan**; stockist/distributor show **OCR Scan** + **Bulk Upload**.

**KPI cards (4):**
1. **Total Revenue** — MR: `Σ bills.received_amount` over bills whose pharmacy.mr_id = user (inner join `pharmacies!inner(mr_id)`); stockist/distributor: `Σ orders.total_amount` where `seller_id=user AND status='delivered'`.
2. MR = **Pending Payments** `Σ(due_amount − received_amount)` over bills with `status != 'paid'`; else = **Pending Orders** count `orders.status='pending' AND seller_id=user`.
3. MR = **Active Pharmacies** count `pharmacies where mr_id=user`; else = **Customers** = stockistCount + buyerPharmacyCount from `seller_buyer_relationships` split by `buyer_type` ('stockist'/'pharmacy'), with subtext "X stockists, Y pharmacies".
4. **Products Listed** = product count where `stockist_id=user AND is_active=true` (**MR additionally filters `brand_name = profile.business_type`**). Subtext: MR "{brand} only", else "{distinctBrandCount} brands".

Stock metrics computed but only brandsCount surfaced: `totalStock=Σ stock_quantity`, `stockValue=Σ stock_quantity×price`, `brandsCount=distinct brand_name`.

**Quick Actions card** (`h-20` buttons): MR → My Pharmacies (`/pharmacies` ✓), My Catalogue (`/products` ✗ dead), Orders (`/orders` ✓), Reminders (`/payments` ✓). Stockist/Distributor → My Customers (`/customers` ✗ dead), My Catalogue (`/products` ✗), Orders (✓), Analytics (`/analytics` ✓).

**Recent Orders card**: last 5 orders `seller_id=user` joined to `pharmacies:pharmacy_id(name)` and `buyer:profiles(name,business_name)`; each row shows resolved name, date, `₹total_amount`, `StatusBadge` on `delivery_status`; click → `/orders`. Empty: "No orders yet".

**ActivityFeed** component (see §8.5).

Modals mounted: QuickBill+QuickOrder (MR), OCRUpload (all), BulkUpload (non-MR; `onSuccess` = `window.location.reload()`).

**Logic/edge:** loading spinner while `isLoading || !userRole`. `userRole` via `.single()`.

### 2.2 My Products / Catalogue — `MyProducts.tsx` (`/my-products`)
**Role-guarded** to mr/stockist/distributor. Title "My Catalogue".

**Content.** `LocationSelector` at top — **fully mock**: hardcoded locations `main` ("Main Branch, 123 Main St") and `branch2`; add/remove just toast, no persistence. **Catalogue Status card** with pulse dot + `Switch` bound to `profiles.is_catalogue_live` (default shown as `?? true`); toggling mutates `profiles.is_catalogue_live` and invalidates `["profile"]`+`["marketplace-sellers"]`; toast on/off. If MR + business_type present, a "Brand Restriction" banner: "You can only add products from {business_type}".

Search input (name/brand/salt). Two Select filters:
- **Expiry**: all / OK (>30d) / Expiring Soon (≤30d) / Expired — computed from `expiry_date` vs today (daysUntilExpiry).
- **Stock**: all / In Stock (>10) / Low Stock (1–10) / Out of Stock (0).

**Product grid cards** (hover Tooltip with purchase/sale/MRP/stock/description): title + `Info` icon, brand Badge, stock badge (`getStockBadge`: 0→"Out of Stock" destructive; ≤10→"Low Stock"; else "In Stock"), optional image, salt line, price rows (MRP, Purchase Rate, Sale Rate bold), stock+unit, batch, expiry date. Actions per card: **availability toggle** (mutates `products.is_available`, button reads "Available"/"Hidden" with Eye/EyeOff), **Edit** (→ `/marketplace/product/edit/:id` — **404 bug**), **Delete** (opens AlertDialog "Delete Product?" → `products.delete`).

`canGoLive` computed (`bank_account_number && bank_ifsc_code && is_verified && products.length>0`) but **never used** in UI (dead variable — the go-live switch is not gated by it).

Empty state: package icon, "No Products Yet", Add Product button.

**Forms/fields:** none inline besides filters; delete confirmation AlertDialog.
**Edge:** products query has no is_active filter here (shows all own products incl. inactive).

### 2.3 Catalogue (browse-all) — `Catalogue.tsx` (`/catalogue`)
A **separate** "Product Catalogue" page (not role-guarded) that lists **all products from all sellers** (`products where is_active=true`, joined `profiles:stockist_id(name,business_name)`). Header buttons Add Product / Scan(OCR) / Bulk. Filters panel (toggle): Category Select (10 `product_category` labels; note label "Diabetes Management" here vs "Diabetes" in ProductForm), Brand multi-checkbox (derived from data, ScrollArea), Product Form multi-checkbox (tablet/capsule/syrup/injection/drops/ointment/powder/other), **Sort By** (8 options: name asc/desc, stock high/low, price high/low, newest, oldest). Active filter count badge; Clear All. Product cards (image, name, "by {business_name}", salt, category badge, `₹sale_rate per unit`, stock/OOS, "View Details" → `ProductDetailModal`; cart icon also opens the detail modal). Reachable only by typing the URL or via OCR/Bulk modal `onSuccess` invalidations. Buyers can't delete (comment notes deletion removed).

### 2.4 Product Form — `ProductForm.tsx` (`/marketplace/product/new`, `/marketplace/product/:id`)
Edit mode when `:id` present (loads product, maps fields; `price` = `sale_rate ?? price ?? 0`).

**Fields (actual):**
- **Product Name*** (text, required) with **AI Auto-fill** button (disabled <2 chars). Calls `autocomplete-product`; on success merges brand_name, salt_name, type, uses, category, image_url, and concatenates description + storage/handling/consumption lines.
- **Product Image** (file, image/*) — reads as DataURL preview; uploaded on submit to public **`product-images`** bucket at `${user.id}/${Date.now()}.ext`, `getPublicUrl` stored.
- **Brand Name** — a **Select from a hardcoded list of ~50 pharma companies** (Sun Pharma, Cipla, …, "Others"). For **MR the Select is disabled/locked** and auto-set to `business_type` via effect; shows 🔒 "Brand locked to: {business_type}".
- **Category*** — Select of 10 enum values (labels here: "Diabetes" not "Diabetes Management").
- **Salt Name** (text), **Type** (free text, e.g. Tablet), **Uses** (textarea), **Description** (textarea).
- **MRP** (number), **Purchase Rate** (number).
- **Sale Price Calculator** box: margin type Select (`percent`/`amount`) + margin value. `calculateSaleRate()`: requires MRP; percent → `MRP − MRP×margin/100`; amount → `MRP − margin`; if purchase>0 and sale<purchase → clamps to purchase (toast "Adjusted"); negative → toast "Invalid Margin". Writes `sale_rate`+`price`. A separate `sale_rate` number input under it.
- **Batch Number** (text), **Expiry Date** (date).
- **Sale Price (Displayed)*** = `price` (number, required, "the price customers see"), **Unit** Select (strip/box/vial/bottle/tube/pack/capsule/tablet/injection/sachet), **Stock** (number).

**Submit** (`handleSubmit`): requires name + price>0. Recomputes sale = `sale_rate||price`; if purchase>0 and sale<purchase → sale=purchase. Insert/Update `products` with `stockist_id=user.id`, `seller_type = distributor ? "distributor" : "stockist"` (⚠️ **MR products get `seller_type="stockist"`** — the MmarketplaceProducts "MR Only" seller-type filter will therefore never match MR products). Numeric coercions; `expiry_date || null`. Navigate `/marketplace` on success (⚠️ a seller navigating to `/marketplace` hits the pharmacy-only role guard → redirected to `/` with an access toast).

**Dead data:** arrays `productForms`, `prescriptionTypes`, `storageConditions`, `therapeuticCategories`, `units`(partly) declared; several unused. `discount_percentage`, `min_order_quantity`, `max_order_quantity` columns exist but are **not** in this form (⚠️ CORRECTION to FEATURES.md which listed them as form fields).

### 2.5 Orders — `Orders.tsx` (`/orders`)
Fetches orders where `seller_id=user OR stockist_id=user` (`.or(...)`) — i.e. the **seller view only**. ⚠️ **A pharmacy (buyer) visiting `/orders` sees nothing** here because their orders carry `buyer_id`, not seller/stockist = user. (Checkout does set `seller_id=stockist_id=sellerId`, so buyer orders never surface to the buyer on this page.)

**Content.** Title "Orders Management". Tabs differ by role:
- **MR**: "Platform Orders (n)" and "Self-Added Pharmacies (m)".
- **stockist/distributor** (& others): All / Pending / Confirmed / Packed / Shipped / Delivered (filters `delivery_status`).

Order cards: order_number, buyer name (business_name/name from profiles map, falls back "Unknown"), phone, up to 3 item badges (`name × qty`) + "+n more", delivery address, total, ordered date. Click opens **Order Detail dialog**.

**Self-Added Pharmacies tab (MR):** grid of `pharmacies where mr_id=user`; card shows name/owner/address, "View Details" (→ `/pharmacies/:id` **404 bug**) + inert "Send Reminder" button. Empty → Add Pharmacy (`/pharmacies/new`).

**Order Detail dialog:** buyer header + status badge (`getStatusBadge`: pending/confirmed/packed/shipped/delivered/cancelled with icons), item list (image, name, qty, `₹price×qty`), delivery address, notes, tracking id, total. **Status machine buttons** (`updateDeliveryStatusMutation`):
- pending → **Confirm Order** (→ confirmed)
- confirmed → **Mark as Packed** (→ packed) — **decrements stock**: for each `order_items` line, `stock = max(0, stock − qty)`.
- packed → **Generate Payment Link** (also shown for shipped/delivered) + a **Ship** sub-form (Tracking ID input, sets delivery_tracking_id, → shipped).
- shipped → **Mark as Delivered** (→ delivered, sets `delivered_at`).
- any non-delivered/non-cancelled → **Cancel Order** (→ cancelled).
- delivered + MR → **Create Bill for This Order** → `/bills/new?orderId=&pharmacyId=&amount=`.

**Payment Link dialog:** `handleGeneratePaymentLink` requires `sellerProfile.upi_id` (else toast). Builds `generateUPILink(upi, business_name||name, total, order_number)`. Copy link, or **Send via WhatsApp** (`wa.me/{buyer_phone digits}?text=…`, opens new tab).

**Logic/edge:** `filteredOrders` logic is loose — "platform"/"all" both return all; status tabs filter by `delivery_status`. Stock decrement loops sequentially with individual selects/updates (no transaction; partial failures possible). Status update mutation invalidates seller-orders + my-products.

### 2.6 Order Form — `OrderForm.tsx` (`/marketplace/order/new`)
MR-oriented manual order creation. Fields: **Select Pharmacy*** (from `pharmacies where mr_id=user`), **Order Number** (optional; placeholder suggests `{initials}{YYYYMMDD}-001`), **Order Items** (repeatable: Product Select from all `products where is_active` showing `name - ₹price/unit`; Qty number min 1; Subtotal readout; remove). Total = `Σ qty×price` (no tax). Supports `?product=` preselect.

**Submit** (`createOrderMutation`): requires pharmacy + ≥1 valid item. Order number: uses typed or RPC **`get_next_order_number(stockist_user_id=user)`** → `ORD/0001`. Inserts `orders {pharmacy_id, stockist_id=user, order_number, total_amount, status:'pending'}` (no buyer_id, no delivery_status). Handles unique-violation `23505` with friendly message. Inserts `order_items {order_id, product_id, quantity, price, subtotal}`. Does **not** decrement stock. Navigates to `/bills/new?order=&pharmacy=` on success.

### 2.7 Pharmacies (MR) — `Pharmacies.tsx` (`/pharmacies`)
Lists `pharmacies where mr_id=user`, searchable (name/owner_name/phone `ilike`). For each pharmacy computes: `totalDue = Σ(due_amount − received_amount)` over its non-paid bills; `pendingPayments` count; last order date; and a rolled-up `status` from its bills (critical > overdue > due_soon > pending > up-to-date). Sorted by status severity. Renders `PharmacyCard` (see §8.1). Empty state with "Add Your First Pharmacy". Header "Add Pharmacy" → `/pharmacies/new`.

### 2.8 Pharmacy Form — `PharmacyForm.tsx` (`/pharmacies/new`)
Fields: **Pharmacy Name*** (required), **Phone*** (tel, required), License Number, Owner Name, Email, Address (textarea). Submit → insert `pharmacies {mr_id:user, name, license_number|null, address|null, phone, email|null, owner_name|null}`; toast; navigate `/pharmacies`. No `max_credit_limit` field (defaults null → PharmacyDetail falls back to ₹100,000).

### 2.9 Pharmacy Detail — `PharmacyDetail.tsx` (`/pharmacy/:id`) — richest seller screen
**Content.** Back button. **Pharmacy Info card**: name, license, contact (phone/email/address/owner), **Credit Limit** = `pharmacy.max_credit_limit || 100000`; **utilizationPercent** = round(creditUtilization/creditLimit×100) where `creditUtilization = Σ(due_amount−received_amount)` over non-paid bills; colour ≥90 red / 80–89 yellow / <80 green. Shows **Total Outstanding** block when `totalPending>0`.

**Create Bill & Send Payment Request card** (collapsible; auto-open if `?action=new-bill`):
- Fields: **Bill Number*** (auto-filled from RPC `get_next_bill_number(mr_user_id=user)` → `MR/001`), **Bill Date*** (date, default today), **Total Amount*** (number), **Upfront Payment (%)** (0–100; live "Upfront: ₹X"), **Payment Terms (Days)** (default 7; due date auto).
- **Live credit check**: debounced 500 ms `check_credit_limit(pharmacy_uuid, new_bill_amount)` RPC → renders warning card: ≥100 "Credit Limit Exceeded!" (🚫, red), ≥90 "High Credit Utilization" (⚠️, yellow), with utilization_percent and `₹util / ₹limit`. **Note:** this is display-only — submit is NOT blocked by the credit result (unlike `BillForm`).
- Summary card: Total, Upfront, Payment Request Amount = total − upfront, Due Date (`calculateDueDate(billDate, terms)` formatted PPP), plus 3 promises (UPI link, WhatsApp reminder, tracked).

**Submit** (`createBillWithPaymentMutation`, shows processing spinner state): computes `upfrontAmount = round(total×upfront%/100)`, `remainingAmount = total − upfront`, dueDate. Builds UPI link (for remainingAmount). Inserts `bills {pharmacy_id, bill_number, bill_date, total_amount, due_amount=remainingAmount, upfront_amount, upfront_percentage, received_amount=upfrontAmount, remaining_due_date, status:'pending', upi_payment_link, payment_terms_days}`. Then inserts `payment_requests {bill_id, requested_amount=remaining, payment_link, status:'pending'}`. Then inserts `payment_reminders {bill_id, reminder_type:'initial', sent_via:'whatsapp', message_content, status:'sent'}`. Then updates bill `reminder_count=1, last_reminder_sent=now`. ⚠️ Note: `due_amount` is stored as the *post-upfront remaining*, and `received_amount` seeded with the upfront — so "remaining" downstream = due_amount − received_amount can *understate* by the upfront (upfront already removed from due_amount but also added to received). Effectively remaining = total − 2×upfront in the bill list math. **Money bug.**

**Active Bills list**: refreshed after `await update_bill_statuses()` RPC. Each bill card: `Bill #number`, `StatusBadge(status, remaining_due_date)`, bill date, **Remaining** = due_amount − received_amount, Bill Amount, Received (green), Due Date, Reminders sent. For `status pending|overdue`: **Update Payment** (opens `UpdateBillModal`) + **Send Reminder** (`sendReminderMutation`: inserts followup `payment_reminders`, increments `reminder_count`, sets `last_reminder_sent`; toast). Empty: "No bills yet…".

**Realtime**: the app's **only** realtime channel — `supabase.channel("pharmacy-bills-changes")` on `postgres_changes` table `bills` filtered `pharmacy_id=eq.:id`, invalidates `["pharmacy-bills", id]`.

`UpdateBillModal` (see §8.3): updates `received_amount` and optionally `status='paid'`.

### 2.10 Bill Form — `BillForm.tsx` (`/bills/new`)
Standalone bill creator (linked from Orders "Create Bill", MyCustomers "Create Bill", OrderForm redirect). Reads URL params `amount`, `pharmacyId`.
Fields: **Select Pharmacy*** (`pharmacies where mr_id=user`, with max_credit_limit), **Bill Number*** (auto from `get_next_bill_number`), **Bill Date*** (today), **Total Amount*** (prefilled from `?amount`). "Cash Discount (CD) & Payment Terms" box: **Upfront Payment (%)** (0–100), **Remaining Payment In** Select (7/10/15/30/custom); custom → Days input + Date input.
On pharmacy select (`handlePharmacyChange`): fetches that pharmacy's `bills where status='pending'` and computes `previous_due = Σ(due−received)`; sets `max_credit_limit`.
Live summary card: Credit Limit, Previous Due, Current Bill, Upfront(−), **Total Due** = `previous_due + total − upfront`; if `> max_credit_limit` shows destructive styling + "exceeds credit limit by ₹X".
**Submit**: **hard-blocks** if `dueAmount > max_credit_limit` (toast, no insert). Computes `remainingDueDate` from terms/custom. Inserts `bills {pharmacy_id, bill_number, bill_date, total_amount, due_amount = previous_due+total−upfront, status:'pending', upfront_amount, upfront_percentage, remaining_due_date, payment_terms_days}`. ⚠️ `due_amount` here **includes carried-forward previous due** (rolls prior dues into the new bill — double-counts across bills). Navigate `/bills` (**404**). Default terms here = 30 (vs 7 in PharmacyDetail/QuickBill). Note: with `max_credit_limit` defaulting to 0 for pharmacies created without a limit, any positive due exceeds the limit → bill creation blocked.

### 2.11 Payments — `Payments.tsx` (`/payments`)
Title "Payment Reminders". Header button "Create Order for Reminder" → opens `QuickOrderModal`.
**Send Payment Reminder card**: Select Bill (from `bills where status='pending'` — **no user scoping in the query**, relies on RLS; joined `pharmacies(name,phone)`), then Amount Type toggle (Full Due / This Bill Only / Custom [amount input]). Request Amount preview. **Send WhatsApp Reminder** button → `sendReminderMutation`: builds `upi://pay?pa={upi_id}&am={amount}` (bare link, no name/note), inserts `payment_requests {bill_id, requested_amount, payment_link, status:'sent', reminder_sent_at:now}`; on `onMutate` opens `PaymentProcessModal` (simulated 2 s processing then complete). Full=due−received; "last"=total_amount; custom=input.
**Recent Payment Requests card**: lists `payment_requests` (joined bills+pharmacies), status badge, bill#, dates, `₹requested_amount`, and **Mark Paid** button (when bill status pending) → `bills.update{status:'paid'}`.
Modals: `PaymentProcessModal`, `QuickOrderModal`.
⚠️ There is no server-side WhatsApp send — reminders only log rows + simulate a modal; the deep link isn't actually opened here (unlike PharmacyDetail/Orders which open `wa.me`).

### 2.12 My Customers — `MyCustomers.tsx` (`/my-customers`)
Stockist/Distributor customer book. Reads `seller_buyer_relationships where seller_id=user` joined `buyer:profiles`. For each buyer: outstanding = `Σ(due−received)` from `bills where pharmacy_id IN buyerIds` (⚠️ joins bills by `pharmacy_id` to *profile* ids — bills are keyed to `pharmacies.id`, a different table, so outstanding will typically be 0/wrong for these relationships), and last order date from `orders where seller_id=user`. Tabs: All / Pharmacies / (Stockists — distributor only). CustomerCard: name, favorite star, buyer_type badge, `WhatsAppButton`, email, Outstanding, Credit Limit + usage bar (outstanding/credit_limit), last order, **Favorite** toggle (mutates `is_favorite`), **Create Bill** → `/bills/new?pharmacy=buyer_id`. "Add Customer" → `/pharmacies/new` (MR-form). 

### 2.13 My Suppliers — `MySuppliers.tsx` (`/my-suppliers`)
**Role-guarded pharmacy**. Unique sellers from `orders where buyer_id=user` joined `seller:profiles`. Per-seller stats from `orders`: totalOrders, totalSpent, pendingPayment (`status='pending'`). Card shows `business_name || full_name` (⚠️ `full_name` doesn't exist on profiles → shows business_name or undefined), hardcoded **"4.5" rating**, inert Heart button, stats, pending badge, phone, **Browse** (`/seller/:id`) + **View Orders** (`/orders?seller=:id` — param ignored). Empty state → Browse Marketplace.

### 2.14 Delivery Planner — `DeliveryPlanner.tsx` (`/delivery-planner`)
MR route planner. Lists `pharmacies where mr_id=user` with checkboxes. **Optimize Route** requires ≥2 selected; **simulated**: `setTimeout 1500ms`, `totalDistance = random(10–59) km`, `estimatedTime = distance×2.5 min`. Renders stops in selection order (no real optimization), plus **Open in Google Maps** (`google.com/maps/dir/{addresses joined by "/"}`). Entirely demo/simulated — no maps API, no persistence.

---

## 3. PHARMACY (BUYER) MODULE

### 3.1 Pharmacy Dashboard — `dashboards/PharmacyDashboard.tsx`
**Content.** Hero card "Welcome to PharmaMR Marketplace" + search input (non-wired, decorative) + "Browse Marketplace" → `/marketplace`.
**KPI cards (4):** Pending Orders (`orders where buyer_id=user AND delivery_status IN pending/confirmed/packed/shipped`), Total Spent (`Σ orders.total_amount` for buyer), Favorite Suppliers (`seller_buyer_relationships where buyer_id=user AND is_favorite`), Total Orders (count).
**OTC Partnership Overview card** (only if `otc_inventory` rows exist for the pharmacy): Total Inventory Value = `Σ mrp×quantity_in_stock`; Items in Stock = `Σ quantity_in_stock`; **Potential Earnings (5%)** = `Σ mrp×qty×0.05` (rounded). Button → `/otc`.
**Featured Sellers card**: `profiles where is_catalogue_live=true AND is_verified=true AND user_roles.role IN (mr,stockist,distributor)` limit 6. Card → `/seller/:id`. Empty "No sellers available".
**Quick Actions**: Browse Marketplace, My Orders(`/orders`), My Suppliers(`/suppliers` — **dead link**).
**ActivityFeed**.

### 3.2 Marketplace (browse by seller) — `Marketplace.tsx` (`/marketplace`)
**Role-guarded pharmacy.** Fetches `profiles` joined `user_roles!inner(role)` where role IN (mr,stockist,distributor) — ⚠️ **no is_catalogue_live/is_verified filter** (all sellers shown by default; those are opt-in filter pills). Product counts per seller from a full `products` scan (client-side tally). Header (primary banner) + search (business_name/name). View toggle: "Browse by Seller" / "Browse All Products" (`/marketplace/products`). Filter pills: All / MR / Stockist / Distributor / **Verified Only** (is_verified) / **Live Catalogue** (is_catalogue_live). Seller cards: business_name, role badge, hardcoded **4.5** rating, product count, address, Heart (favorite → upsert `seller_buyer_relationships {seller_id, buyer_id, buyer_type:'pharmacy', is_favorite:true}`), **Browse Catalogue** → `/seller/:id`. Empty state.
⚠️ Reads `seller.user_roles?.[0]?.role` (array) whereas the join is 1-1 — role may read undefined; role pills may misbehave.

### 3.3 Marketplace Products — `MarketplaceProducts.tsx` (`/marketplace/products`)
**Role-guarded pharmacy.** Two-step fetch: `products where is_available=true` then merge `profiles(id,business_name,name)` by `stockist_id`. Filters (collapsible): search (name/brand/salt), Brand Select (derived), **Seller Type** Select (all/mr/stockist/distributor — matches `product.seller_type`; ⚠️ MR products have seller_type 'stockist', see §2.4), Seller Select (derived names), Min/Max Price (`product.price`). 
**Seller-locked cart:** cart lines from `cart_items where buyer_id=user`; `lockedSellerId = cartItems[0]?.seller_id`. Adding a product from a different `stockist_id` → toast "Cart is locked to another seller…". Cards from the locked seller show quantity steppers (`cartMutation` upserts/deletes `cart_items {buyer_id, seller_id=stockist_id, product_id, quantity}`; qty 0 deletes). Others are `opacity-50` and Add disabled. Warning banner "Cart locked to {name}" with **Clear Cart** (`clearCartMutation` deletes all buyer cart rows). Product card: discount badge (`discount_percentage% OFF`), placeholder icon (no image shown even if present), name/brand/seller + seller_type badge, MOQ badge (if `min_order_quantity>1`), `₹price` + struck MRP, stock badge (>10 "In Stock" / "Only n left" / OOS). Floating "View Cart (n items)" → `/cart`.

### 3.4 Seller Detail — `SellerDetail.tsx` (`/seller/:sellerId`)
**Role-guarded pharmacy.** Header: seller business_name, **4.5** rating, product count, inert Heart. Search. Products = `products where stockist_id=:sellerId AND is_available=true`. Product card: discount badge, **discountedPrice = price×(1−discount/100)** shown, struck price, stock badge, add/stepper.
⚠️ **Cart-lock NOT enforced here** — `addToCart` upserts `cart_items` with `seller_id=sellerId` regardless of what's already in the cart; and it tracks quantity in **local `cart` state** (not synced from `cart_items`), so counts don't reflect persisted cart and a pharmacy can mix sellers via this page, breaking Checkout's single-seller assumption. Floating View Cart uses local state count.

### 3.5 Cart — `Cart.tsx` (`/cart`)
⚠️ Rendered **without `<Layout>`** (no header/nav). Reads `cart_items` (joined `product:products(*)`, `seller:profiles!cart_items_seller_id_fkey(*)`). Groups by seller. Line price = `product.price×(1−discount/100)`. Per-line: image placeholder, name/brand, price+struck, Trash (qty→0 delete), qty stepper (update `cart_items.quantity`; 0 deletes). Per-seller Subtotal. Grand Total = `Σ discountedPrice×qty`. **Proceed to Checkout** → `/checkout`. Empty state → Browse Marketplace. No GST.

### 3.6 Checkout — `Checkout.tsx` (`/checkout`)
Reads cart (same join) + user profile. Fields: **Delivery Address*** (textarea, required to enable Place Order), Contact Number (disabled, from profile.phone), Order Notes (optional). Order Summary grouped by seller with subtotals; Grand Total.
**Place Order** (`placeOrderMutation`): assumes single seller (`sellerId = cartItems[0].seller_id`). **Order number generated client-side**: `ORD/${(count of buyer's orders)+1 padded 4}` — ⚠️ not via RPC; race/duplicate-prone; also collides with seller ORD sequence namespace. Inserts `orders {order_number, buyer_id=user, seller_id=sellerId, stockist_id=sellerId, pharmacy_id=user.id, total_amount, delivery_address, notes, status:'pending', delivery_status:'pending'}`. ⚠️ `pharmacy_id` is set to the **buyer profile id**, not a `pharmacies` row — so seller-side joins to `pharmacies:pharmacy_id(name)` won't resolve. Inserts `order_items` (price = discounted, subtotal). Clears cart. Navigate `/orders`. Does **not** decrement stock (that happens at seller "packed").

### 3.7 OTC Partnership — `OTCPartnership.tsx` (`/otc-partnership`)
Uses tables accessed with `as any` (**not in generated types**): `pharmacy_otc_subscriptions`, `otc_subscription_plans`. Reads active subscription (`status='active'`, joined plan), plans (`is_active`, ordered by price), and `otc_brands` (`is_active`).
If active subscription exists → summary view: plan name badge, Stock Value (`plan.stock_value/1000 + "k"`), Brands (`selected_brands.length`), Status Active.
Else **3-step wizard**: 
1. **select-plan**: grid of `OTCPlanCard` (2nd card flagged "Most Popular"). Choosing a plan → step 2.
2. **select-brands**: checkboxes of `otc_brands` capped at `plan.max_brands`; Back / Continue (≥1).
3. **review**: shows `₹plan.price` with "(Dummy Payment)"; **Complete Payment** → `createSubMutation` inserts `pharmacy_otc_subscriptions {pharmacy_id, plan_id, payment_amount, payment_status:'paid', selected_brands, status:'active'}`. No real payment.
⚠️ The **`initialize-otc-inventory` edge function is never invoked** from the UI, so `otc_inventory` is never actually seeded → the Dashboard OTC card and Profile OTC card will typically show nothing even after "subscribing".

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

## 5. SHARED PAGES

### 5.1 Profile — `Profile.tsx` (`/profile`)
Header: avatar, name, email, verified badge. **View mode**: Name/Phone/Email/UPI, **Bank Details** (holder/masked account [all but last 4 masked]/IFSC; "Verified" badge if `payment_enabled`), stockist license link (if `stockist_license_url`). Buttons: Edit Profile, **Update Password** (dialog: current/new/confirm; verifies current via `signInWithPassword`, then `auth.updateUser({password})`; new≥6, match), **Logout** (`signOut` → `/auth`), **Delete Account** (dialog: type **`DELETE`** → `delete-my-account` edge fn → signOut → `/auth`).
**Edit mode form**: Name*, Phone*, Email (disabled), UPI ID*, Bank holder/account/IFSC. On save (`updateProfileMutation`): validates **IFSC regex `^[A-Z]{4}0[A-Z0-9]{6}$`**; sets `payment_enabled = !!(account && ifsc && holder)`.
**OTC Partnership card** — ⚠️ **rendered twice (duplicated block)**; shows active plan (name, stock value, brands x/max, Upgrade) or "No active OTC subscription" → Subscribe. Uses `as any` OTC tables.

### 5.2 Settings — `Settings.tsx` (`/settings`)
Tabs: General / Notifications / Payment / Security.
- **General**: Business Name + UPI inputs (uncontrolled `defaultValue`), Language Select (English/Hindi — local state only, no persistence). Save reads inputs via `document.getElementById` and mutates `profiles {business_name, upi_id}` (the **only** working save here).
- **Notifications**: 4 Switches (email/sms/whatsapp/push, local state) + "Save Preferences" → toast only (**no persistence**).
- **Payment**: Default Upfront %, Default Payment Terms, Enable Cashback switch, Save button — **all inert/no handlers**.
- **Security**: current/new/confirm password inputs + 2FA switch + "Update Password" — **inert** (the real password change lives in Profile).

### 5.3 Support — `Support.tsx` (`/support`)
Lists user's own `support_tickets`. **New Ticket** dialog: Subject*, Category Select (general/technical/billing/feature_request/bug), Priority Select (low/medium/high/urgent), Description* → inserts `support_tickets {user_id, subject, description, category, priority}` (status defaults 'open'). Ticket cards: subject, date, status/priority/category badges, resolved date. Colour helpers for status/priority. Empty state.

### 5.4 Notifications — `Notifications.tsx` (`/notifications`)
⚠️ **Hardcoded empty** — `notifications = []` (comment: "No fake notifications; integrate real data later"). Tabs All(0)/Unread(0), "You're all caught up!". No backend. `NotificationCard` and icon/time helpers exist but never render data.

### 5.5 Analytics — `Analytics.tsx` (`/analytics`)
Seller analytics from `orders where seller_id OR stockist_id = user`. KPIs: Total Revenue (`Σ total_amount` — all statuses), Total Orders, Customers (`seller_buyer_relationships` count), Top Products (count of top-5). Charts (Recharts): Revenue Trend line (last 7 days from order created_at), Orders by Status pie, Top 5 Products by Revenue bar (from `order_items` joined products, **limited to 100 items, not scoped to the user** — global sample). Bottom: `AdvancedReports` (mock) + `InventoryAlerts` fed a **hardcoded 2-item array** ("Paracetamol 500mg" low stock, "Amoxicillin 250mg" expiring).

### 5.6 Reports — `Reports.tsx` (`/reports`)
Report Type Select: **Sales / Payments / Inventory** (functional) + **Customer Performance / Route Analysis** (⚠️ selectable but render nothing — stubs). Date range via two single-date Popover calendars (default last 30 days).
- Sales: `orders where seller_id=user` in range → Total Sales, Total Orders, Avg Order Value.
- Payments: `bills` in range (no user scope) → Total Received, Total Pending, Collection Rate = received/(received+pending)×100.
- Inventory: `products where stockist_id=user` → Total Products, Total Stock, Stock Value.
**Export CSV** (real; builds CSV per type via data URI). **Export PDF** → toast "PDF export coming soon" (**stub**).

### 5.7 Upgrade — `Upgrade.tsx` (**NOT routed / unreachable**)
Premium ₹999/month pitch (features: Unlimited Customers, Catalogue Live, Advanced Analytics, Priority Support). Payment instructions: pay ₹999 to hardcoded number **9672123710** (PhonePe/GPay/UPI). Upload payment screenshot (max 5 MB → **private `licenses`** bucket at `payment-proofs/…`, then `getPublicUrl` — ⚠️ private bucket URL won't resolve) + UTR/Reference (required). Submit → `subscription_requests {user_id, amount:999, payment_proof_url, payment_utr, status:'pending'}` → `/dashboard`.

---

## 6. MODALS & COMPONENTS

### 6.1 `PharmacyCard.tsx`
Left border colour by credit utilization (`pending/max_credit_limit`): >80 destructive, >50 warning, else success. Shows name, owner, credit % badge, phone/email, last order (Today/Yesterday/N days ago/No orders), Pending amount, Payment Score (`payment_behavior_score`/10 — default 5.0), credit limit bar. Click → `/pharmacy/:id`.

### 6.2 `QuickBillModal.tsx` (MR)
Fields: Pharmacy Select, Order Number (optional, **unused** in insert), product **search** (`products where stockist_id=user AND is_active`, name/salt ilike, limit 10) → add items (product_id/name/qty/price=sale_rate), qty steppers, per-item remove, Total. **Submit**: `get_next_bill_number` → insert `bills {pharmacy_id, bill_number, bill_date=today, total_amount, due_amount=total, received_amount:0, status:'pending', payment_terms_days:7, remaining_due_date=today+7d}`; then **decrement stock** per item (`max(0, stock−qty)`). ⚠️ **Bill line items are NOT persisted** (no order_items/bill_items) — only the aggregate total is stored; itemisation is lost. Navigate `/pharmacy/:id`.

### 6.3 `QuickOrderModal.tsx` (MR) — "Quick Order to Bill"
Free-text order parser. Fields: Pharmacy Select, Order Number (optional, unused), **Paste Order Details** textarea. `parseOrderText`: splits on `.`/newline/comma, extracts qty from `\d+\s*N` or `qty \d+` (default 1), remainder = product name, last word guessed as brand. `handleGenerate`: for each parsed item, `products where stockist_id=user AND name ilike %name%` (limit 1); if matched adds line (price=sale_rate), **decrements stock**, accumulates total. Then `get_next_bill_number` → insert `bills {…total, due_amount=total, received_amount:0, terms 7, due today+7d}`. Shows success panel with Download (.txt bill), **WhatsApp** (`wa.me/{phone}` w/ UPI message via `generateUPILink`+`generateWhatsAppMessage`), **Copy Link** (UPI). ⚠️ Named "Order" but creates a **bill**; line items not persisted; unmatched items silently dropped.

### 6.4 `UpdateBillModal.tsx`
Shows Total Due, Already Received, Remaining. Field: Received Amount. **Update** (partial): `onUpdate(billId, currentReceived + amount, false)`. **Mark as Paid Full**: `onUpdate(billId, currentDue, true)`. In `PharmacyDetail`, `updateBillMutation` sets `received_amount` and `status='paid'` if markAsPaid. (No re-run of `update_bill_statuses`, so partial payments don't auto-recompute status until next page load.)

### 6.5 `PaymentProcessModal.tsx`
Processing/complete UI for payment reminders. ⚠️ **Hardcoded bank default**: `{name:"Kotak Mahindra Bank", accountNumber:"xxxx5414"}`. Shows single or multi-payment breakup (collapsible). Processing = 2 s simulated (driven by `Payments.tsx`). No real gateway.

### 6.6 `OCRUploadModal.tsx`
Fields: Product Image* (image/*), MRP*, Stock*, Purchase Rate*, Sale Rate*. Reads image → base64 → POSTs to `${VITE_SUPABASE_URL}/functions/v1/ocr-product-label` with Bearer session token + the 4 numbers. Displays result panel (action message, product name/brand/salt/stock/MRP). See §7.1.

### 6.7 `BulkUploadModal.tsx`
CSV (PapaParse, header row) or Excel (SheetJS first sheet). `ProductRow` cols: name, category, brand_name, salt_name, type, mrp, purchase_rate, sale_rate, stock_quantity, unit, batch_number, expiry_date, uses, description. `validateRow`: name required, sale_rate>0, stock≥0. Row-by-row insert into `products {stockist_id:user, …, category = lowercased+underscored (cast any), price=sale_rate, unit default "strip", is_active:true}`. Progress bar; summary (success/failed + up to 10 errors). **Download Template** (.xlsx with 2 sample rows). No dedupe, no brand restriction for MR.

### 6.8 `ProductDetailModal.tsx`
Read-only product view (image, name/brand, category badge, salt, type, MRP/Sale/Purchase/Stock, batch/expiry, uses, description). **Edit Product** → `/marketplace/product/:id` (works). Close.

### 6.9 `StatusBadge.tsx`
Renders bill/order status with icon+label+colour, computing days from `dueDate`:
- paid ✓ green; due_soon ⏰ blue ("Due Today"/"Due in Nd"); critical 🚨 red pulse ("Critical (Nd overdue)"); overdue ⚠️ orange ("Overdue (Nd)"); pending ○ yellow; default ? grey ("Unknown"). Used for both bills (with dueDate) and order delivery_status (without) — order statuses like confirmed/packed/shipped/delivered fall to "Unknown".

### 6.10 `ActivityFeed.tsx`
Aggregates up to 15 recent items: orders (`seller_id OR buyer_id = user`, w/ buyer name), bills (`pharmacies.mr_id=user`, w/ pharmacy name), product updates (`stockist_id=user`, by updated_at). Sorted desc. Icon + type badge + relative time + amount/party details. Empty state.

### 6.11 `OTCPlanCard.tsx`
Plan card: name, `₹price/year`, `stock_value/1000 k`, features list, "up to N brands", "₹min–₹max margin per item", "Flat 5% commission on all sales", Choose button. "Most Popular" ribbon when `isPopular`.

### 6.12 `InventoryAlerts.tsx`
Presentational; renders passed alerts (critical/warning, low_stock/expiring_soon/slow_moving icons). In Analytics it's fed hardcoded data → not real inventory.

### 6.13 `WhatsAppButton.tsx`
Opens `wa.me/{cleanedPhone}?text={encoded message}` in new tab. Used in MyCustomers.

### 6.14 `LocationSelector.tsx`
Multi-location UI with Add dialog (name/address). In MyProducts it's fed 2 hardcoded locations and add/remove only toast → **mock/no persistence**.

### 6.15 `MobileNav.tsx` — dead code
A separate bottom-nav + "More" sheet (pharmacy: Dashboard/Browse/OTC/Orders; seller: Dashboard/Products/Orders/Customers). **Not mounted** anywhere (Layout supplies the real bottom nav). Uses query key `['user-role', id]` (different key from the rest).

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

## 9. REALTIME, STORAGE, RLS, PWA

### 9.1 Realtime
Only **one** channel: `pharmacy-bills-changes` (`postgres_changes` on `bills`, filtered by pharmacy_id) in PharmacyDetail. Everything else is TanStack-Query pull.

### 9.2 Storage buckets
- **`product-images`** (public): product photos, path `auth.uid()/…`, `getPublicUrl`. RLS: anyone can view; authenticated can upload; users update/delete own.
- **`licenses`** (private): signup verification docs at `{uid}/…`; also (mis)used by `Upgrade` for `payment-proofs/…` then read via `getPublicUrl` → ⚠️ won't resolve (private bucket) — the admin Subscriptions image preview would be broken (and that page is unrouted anyway).

### 9.3 RLS (key policies from migrations)
⚠️ **CORRECTION to FEATURES.md:** the marketplace RLS policies were changed (migration `20251017184343…`, comment "Remove the is_catalogue_live requirement temporarily to see all sellers"):
- `profiles` "Pharmacy users can view seller profiles": pharmacy can view any profile whose user_roles.role ∈ (mr,stockist,distributor) — **no is_catalogue_live check**.
- `products` "Pharmacy users can view marketplace products": pharmacy can view any product whose seller role ∈ (mr,stockist,distributor) — **no is_catalogue_live check and no is_available check** at RLS level.
So `is_catalogue_live` is **not** enforced by RLS; it only affects the Dashboard "Featured Sellers" query and the client-side "Live Catalogue" filter pill. Product write policies (latest, `20251108…`) require `auth.uid()=stockist_id` AND role ∈ (mr,stockist,distributor).
`profiles.is_catalogue_live` default flipped FALSE→**TRUE** in later migrations; existing rows backfilled to true.

### 9.4 PWA / client
VitePWA autoUpdate, Workbox glob (js/css/html/ico/png/svg/woff2), 5 MB max. Manifest name/short_name = PharmaMR, theme `#ffffff`. Supabase client: localStorage persistence, autoRefreshToken; project id `uuwwnggimhvtvnislptd`.

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

## 11. HARDCODED VALUES / SECRETS / MAGIC STRINGS
- Admin registration password: **`jit@ADMIN1`** (client `Auth.tsx`, `assign-role`, `handle_new_user`).
- Admin wipe confirmation phrase: **`DELETE ALL USERS AND DATA`**; account-delete phrase: **`DELETE`**.
- Subscription price: **₹999** flat (Upgrade, Subscriptions, AdminDashboard revenue est.); subscription grants +30 days premium.
- OTC potential earnings / commission: flat **5%** (dashboard + plan cards); OTC seed qty **40**/item; OTC catalog brands hardcoded (Derma Co / MamaEarth / Himalaya).
- Default credit limit fallback **₹100,000** (PharmacyDetail only; BillForm uses raw `max_credit_limit` which may be 0).
- Payment terms defaults: 7 (PharmacyDetail/QuickBill/QuickOrder) vs 30 (BillForm).
- Upgrade payee phone **9672123710**; PaymentProcessModal bank **"Kotak Mahindra Bank, xxxx5414"**.
- Star ratings **4.5** hardcoded (Marketplace/SellerDetail/MySuppliers).
- Payment score default **5.0**, avg_payment_days **0**.
- Supabase project id `uuwwnggimhvtvnislptd`.
- Simulated timings: DeliveryPlanner 1.5 s + random distance; Payments 2 s "processing".
- Test credentials documented in a migration comment (jitesh_mr/stockist/distributor/pharmacy/admin, pwd `12346`).

---

## 12. KNOWN STUBS, PLACEHOLDERS & BUGS (consolidated)

**Access control**
- `/admin/*` guarded only by login (`ProtectedRoute`), no client role gate; real protection is RLS + edge-fn role checks. No session-timeout.
- Several seller-facing pages (Pharmacies, PharmacyDetail, BillForm, Payments, Orders, MyCustomers, DeliveryPlanner, Catalogue, ProductForm) have **no `useRoleGuard`** — rely on data-layer RLS only.

**Dead links / unreachable pages** (see §0.1): Upgrade page (no route), admin Subscriptions (no route, linked from dashboard), SellerDashboard `/customers` `/products` `/suppliers`, PharmacyDashboard `/suppliers`, MyProducts edit `/marketplace/product/edit/:id`, Orders self-added `/pharmacies/:id`, BillForm `/bills`, MobileNav component unmounted.

**Money / correctness bugs**
- PharmacyDetail bill insert stores `due_amount = total − upfront` **and** `received_amount = upfront` → downstream "remaining" = total − 2×upfront (undercount).
- BillForm rolls `previous_due` into each new bill's `due_amount` → cross-bill double counting of prior dues.
- Checkout order number generated client-side (`ORD/count+1`) — race/duplicate risk, separate namespace from RPC.
- Checkout sets `pharmacy_id = buyer profile id` (not a pharmacies row) → seller-side `pharmacies:pharmacy_id(name)` join fails.
- Pharmacy buyers see no orders on `/orders` (query only matches seller_id/stockist_id).
- MyCustomers outstanding joins bills by profile id vs pharmacies id → typically wrong/0.
- MR products saved with `seller_type='stockist'` → MarketplaceProducts "MR Only" filter never matches; MR marketplace products classified as stockist.
- SellerDetail cart bypasses seller-lock and uses local (unsynced) quantity state.
- QuickBillModal / QuickOrderModal decrement stock and create bills but **don't persist line items**.
- `update_overdue_bills` RPC references non-existent `due_date` column (broken/unused).
- `MySuppliers` reads `seller.full_name` (nonexistent column).

**Feature stubs / mock**
- Notifications: always empty, no backend.
- Settings: only General save works; Notifications/Payment/Security tabs inert.
- Reports: Customer & Route report types render nothing; PDF export = toast only (CSV works).
- Analytics: InventoryAlerts hardcoded; top-products query global (100-item sample), revenue KPI counts all statuses.
- AdvancedReports component: toasts only, no data.
- DeliveryPlanner: fully simulated distances/time, no optimizer/maps API.
- LocationSelector in MyProducts: hardcoded locations, no persistence.
- OTC: subscription payment is a dummy insert; `pharmacy_otc_subscriptions`/`otc_subscription_plans` accessed via `as any` (absent from types); **`initialize-otc-inventory` never invoked** so inventory/earnings cards stay empty; earnings a flat 5% model.
- PaymentProcessModal: hardcoded Kotak bank + 2 s simulated processing; reminders only log/deep-link (no messaging backend).
- Upgrade: uploads proof to **private** `licenses` bucket then reads via `getPublicUrl` (won't resolve).
- Profile: OTC card duplicated (rendered twice).
- AI: single model, no fallback; `autocomplete-product` unauthenticated; may return hallucinated `image_url`.
- Branding inconsistent (PharmaMR vs Chameleon vs "P").
- No tax/GST anywhere despite `tax_amount`/`discount_amount` columns.

---
