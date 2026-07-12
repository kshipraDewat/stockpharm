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

# PART II — COMPLETE APPLICATION DOCUMENTATION (expanded)

Everything below expands the review above into full application documentation: build/config layer, design system, the complete migration-by-migration schema history, an exhaustive table/RLS/trigger reference, an edge-function API reference, end-to-end workflow walkthroughs with exact data mutations, complete per-role user journeys, the client state-management/data-flow inventory, and a consolidated business-rules/calculation index. All of it documents behaviour as it exists in the code today.

---

## 13. BUILD, TOOLING & PROJECT CONFIGURATION

### 13.1 Package & scripts (`package.json`)
- Project name `vite_react_shadcn_ts`, version `0.0.0`, `"type": "module"` (ESM). A Lovable-generated project (`lovable-tagger` devDependency; `componentTagger()` runs only in dev mode in `vite.config.ts`; OG/Twitter meta in `index.html` point at `lovable.dev` images and `@lovable_dev`).
- Scripts: `dev` (vite dev server), `build` (production), `build:dev` (`vite build --mode development`), `lint` (eslint), `preview`.
- Runtime dependencies (complete): full Radix UI primitive set (accordion, alert-dialog, aspect-ratio, avatar, checkbox, collapsible, context-menu, dialog, dropdown-menu, hover-card, label, menubar, navigation-menu, popover, progress, radio-group, scroll-area, select, separator, slider, slot, switch, tabs, toast, toggle, toggle-group, tooltip), `@supabase/supabase-js ^2.75.0`, `@tanstack/react-query ^5.83.0`, `@hookform/resolvers` + `react-hook-form ^7.61.1` (installed; the app's forms are mostly hand-rolled controlled inputs — react-hook-form is only used by the shadcn `ui/form.tsx` wrapper, which no page imports), `class-variance-authority`, `clsx`, `cmdk`, `date-fns ^3`, `embla-carousel-react`, `input-otp`, `lucide-react ^0.462`, `next-themes` (installed; used only by `ui/sonner.tsx` for toast theming — there is **no dark-mode toggle anywhere in the app** even though `index.css` defines a full `.dark` palette), `papaparse` (+types), `react-day-picker ^8`, `react-resizable-panels`, `react-router-dom ^6.30`, `recharts ^2.15`, `sonner ^1.7`, `tailwind-merge`, `tailwindcss-animate`, `vaul` (drawer), `vite-plugin-pwa ^1.1` + `workbox-window`, `xlsx ^0.18.5` (SheetJS), `zod ^3.25`, and **`zustand ^5.0.8` — installed but never imported anywhere in `src/` (dead dependency; all state is TanStack Query + local `useState`)**.
- Dev dependencies: TypeScript 5.8, ESLint 9 flat config (+react-hooks, react-refresh plugins), `@vitejs/plugin-react-swc`, Tailwind 3.4 + autoprefixer + postcss + `@tailwindcss/typography` (typography plugin installed but not registered in `tailwind.config.ts` plugins — only `tailwindcss-animate` is), `lovable-tagger`.

### 13.2 Vite config (`vite.config.ts`)
- Dev server: host `::` (all interfaces, IPv6), port **8080**.
- Plugins: `react()` (SWC), `componentTagger()` in development only, `VitePWA` with `registerType: 'autoUpdate'`, workbox `maximumFileSizeToCacheInBytes: 5 MB`, `globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}']`, and an inline manifest: name/short_name **PharmaMR**, `theme_color: '#ffffff'`, icons `/icon-192x192.png` and `/icon-512x512.png`.
- Alias `@` → `./src`.

### 13.3 The two competing manifests
`index.html` links `public/manifest.json`, which is a **different, older manifest**: name/short_name **"Stockists"**, description "Modern pharmacy stockist management system", `theme_color: '#2563EB'` (blue), portrait orientation, icons pointing at `/placeholder.svg` (192/512, "any maskable"). Meanwhile VitePWA injects its own generated manifest (PharmaMR, white theme). So the deployed app ships both the static "Stockists" manifest referenced by `index.html` *and* the PWA-plugin manifest; `index.html` also carries `<meta name="theme-color" content="#2563EB">` and `<title>Stockists - Modern Pharmacy Stockist Management</title>` — a third branding surface ("Stockists") on top of PharmaMR and Chameleon.

### 13.4 Entry & provider tree
`src/main.tsx` → `createRoot(#root).render(<App />)`, imports `index.css`. `App.tsx` composes, outermost-in: `QueryClientProvider` (a single default `new QueryClient()` — **no global staleTime/retry overrides**; each query configures itself) → `AuthProvider` → `TooltipProvider` → both toasters (`<Toaster/>` shadcn/Radix toast *and* `<Sonner/>`; in practice all app code calls the Sonner `toast` from `sonner`, the Radix toaster is mounted but effectively unused except by `use-toast` consumers in ui components) → `BrowserRouter` → `<Routes>`. `ProtectedRoute` (defined inline in App.tsx) renders a centered spinner while `loading`, `<Navigate to="/auth" replace/>` when no user, else children.

### 13.5 Supabase client (`src/integrations/supabase/client.ts`)
Auto-generated. Reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from env. `createClient<Database>` with `auth: { storage: localStorage, persistSession: true, autoRefreshToken: true }`. `supabase/config.toml` contains exactly one line: `project_id = "uuwwnggimhvtvnislptd"` — no per-function `verify_jwt` overrides, no local dev config.

### 13.6 Design system (`index.css` + `tailwind.config.ts`)
- Design tokens as HSL CSS custom properties on `:root` (light) and `.dark` (defined but unreachable — nothing ever adds the `dark` class; `darkMode: ["class"]`).
- Light palette: `--primary: 142 76% 36%` (**green** — this is the app's brand colour, used for the logo square, buttons, ring), `--secondary: 250 70% 60%` (violet), `--accent`/`--warning: 38 92% 50%` (amber), `--destructive: 0 72% 51%`, `--success: 142 76% 36%` (same green), `--info: 217 91% 60%` (blue), `--radius: 0.75rem`, plus a 5-step shadow scale and full sidebar token set (the shadcn `ui/sidebar.tsx` component exists but no page uses a sidebar layout).
- `tailwind.config.ts` maps all tokens into Tailwind colors, container centered at 2xl 1400px, accordion keyframes/animations, plugin `tailwindcss-animate`. Note: `--success/--warning/--info` variables are defined in CSS but **not** mapped to Tailwind color names in the config — components that want them use arbitrary values or the standard palette.
- Body: antialiased, liga/kern font features. No custom font is loaded — system font stack.

### 13.7 UI component kit
`src/components/ui/` is a complete stock shadcn/ui install (49 files): accordion, alert, alert-dialog, aspect-ratio, avatar, badge, breadcrumb, button, calendar, card, carousel, chart (Recharts wrapper), checkbox, collapsible, command, context-menu, dialog, drawer, dropdown-menu, form, hover-card, input, input-otp, label, menubar, navigation-menu, pagination, popover, progress, radio-group, resizable, scroll-area, select, separator, sheet, sidebar, skeleton, slider, sonner, switch, table, tabs, textarea, toast, toaster, toggle, toggle-group, tooltip, use-toast. Many are installed-but-unused by feature code (breadcrumb, carousel, command, context-menu, drawer, hover-card, input-otp, menubar, navigation-menu, pagination, resizable, sidebar, slider, aspect-ratio, toggle-group). `components.json` is the standard shadcn config (default style, `@` aliases).
Hooks: `use-mobile.tsx` (`useIsMobile()`, 768px matchMedia breakpoint — used by `ui/sidebar`), `use-toast.ts` (Radix toast reducer store), `useRoleGuard.tsx` (§0.3).

### 13.8 TypeScript & lint
Three tsconfigs (`tsconfig.json` references `tsconfig.app.json`/`tsconfig.node.json`); Lovable defaults with relaxed strictness (`noImplicitAny` off etc. per generated config), `@/*` path alias. ESLint 9 flat config with react-hooks + react-refresh. There are **no tests, no test framework, and no CI config** anywhere in the repo.

---

## 14. DATABASE MIGRATION HISTORY (all 22 migrations, chronological)

The schema was built in five phases: (1) MR↔pharmacy billing core, (2) products/orders, (3) B2B marketplace multi-role rework, (4) hardening + data purges, (5) OTC partnership. Every migration in `supabase/migrations/`:

| # | Migration (date prefix) | What it did |
|---|---|---|
| 1 | `20251010110040` | Created **profiles** (id→auth.users, name/phone/email/upi_id NOT NULL, stockist_license_url, is_verified default false), **pharmacies** (mr_id→profiles, name/phone NOT NULL, license_number/address/email/owner_name), **bills** (pharmacy_id, bill_number, bill_date, total_amount/due_amount DECIMAL(10,2), status default 'pending'), **payment_requests** (bill_id, requested_amount, payment_link NOT NULL, status 'pending', reminder_sent_at). RLS: owner-only on profiles; `mr_id = auth.uid()` full CRUD on pharmacies; bills/payment_requests scoped via EXISTS-join to the owning MR. First `handle_new_user()` trigger (profile only, no roles). Created **private `licenses` bucket** with per-user-folder storage policies. |
| 2 | `20251010120002` | `pharmacies.max_credit_limit numeric DEFAULT 100000`; bills gain `upfront_amount` (default 0), `upfront_percentage` (0), `remaining_due_date date`, `payment_terms_days int`, `received_amount` (0). Column comments describe CD (cash-discount) semantics. |
| 3 | `20251010123844` | `bills.next_payment_date date` (column exists; **no code ever writes or reads it**). |
| 4 | `20251010133451` | Bills gain `upi_payment_link`, `reminder_count` (0), `last_reminder_sent`. Added CHECK `status IN ('draft','pending','paid','overdue')` — ⚠️ note this CHECK does **not** include `due_soon`/`critical`, yet `update_bill_statuses()` (added later) sets those values; whether it works depends on this constraint having been superseded in the live DB — as written in migrations, the constraint was never dropped, so statuses `due_soon`/`critical` would violate it. payment_requests gain `paid_at`, `reminder_history jsonb default []`. Created **payment_reminders** (bill_id, reminder_type CHECK initial/followup/overdue, sent_via CHECK whatsapp/sms, message_content, status CHECK sent/delivered/failed) with MR-scoped SELECT/INSERT RLS. Created `update_overdue_bills()` (references `due_date` — broken, §8.2) and first `get_next_bill_number()`. |
| 5 | `20251010150839` | `pharmacies.payment_behavior_score numeric DEFAULT 5.0`, `avg_payment_days int DEFAULT 0`. Indexes `idx_bills_status`, `idx_bills_remaining_due_date`. Created `get_pharmacy_credit_utilization()`, `update_bill_statuses()`, `check_credit_limit()` (full bodies in §8). |
| 6 | `20251013140236` | Created `product_category` enum (10 values), **products** (stockist_id→profiles, name, category NOT NULL, salt_name, type, uses, description, price NUMERIC CHECK ≥0, unit default 'strip', stock_quantity default 0, is_active default true, timestamps), **orders** (pharmacy_id→pharmacies NOT NULL, stockist_id→profiles NOT NULL, order_number UNIQUE, total_amount CHECK ≥0, status default 'pending', delivered_at), **order_items** (order_id CASCADE, product_id **ON DELETE RESTRICT**, quantity CHECK >0, price/subtotal CHECK ≥0). Original RLS: products world-readable (`USING (true)`), stockist-owned writes; orders/order_items stockist-scoped. `get_next_order_number()`, `update_product_updated_at()` trigger fn + `products_updated_at` trigger. 7 indexes. |
| 7 | `20251013162718` | products + `brand_name`, `mrp`, `purchase_rate`, `sale_rate`. |
| 8 | `20251014014211` | products + `image_url`, `batch_number`, `expiry_date`. |
| 9 | `20251014014443` | Created **public `product-images` bucket**; storage policies: anyone SELECT, any authenticated INSERT, owner-folder UPDATE/DELETE. |
| 10 | `20251017133411` | Created view **`product_sales_summary`** (per product: total_sold, order_count, last_sold_date, days_in_inventory = days since created_at) via LEFT JOIN order_items/orders; `GRANT SELECT TO authenticated`. Comment: "Aggregates product sales data for analytics and filtering". No frontend query uses it. |
| 11 | `20251017140818` | Rewrote `get_next_bill_number` to qualify `bills.bill_number` (fixed ambiguous column reference). |
| 12 | `20251017155144` | **The big marketplace migration ("PHASE 1")**: `app_role` enum; **user_roles** table (UNIQUE(user_id, role)) with self-SELECT and self-INSERT policies; `has_role()` SECURITY DEFINER fn; profiles gain 15 columns (business_name, business_type, verification_document_url, is_catalogue_live default FALSE, is_verified, bank_account_number/ifsc/holder, payment_enabled, subscription_tier default 'free', subscription_expires_at, subscription_payment_proof_url, subscription_payment_status default 'pending', customer_count default 0, max_customers_free_tier default 3); **subscription_requests** table (amount default 999, status default 'pending', approved_by, rejection_reason) with user-own SELECT/INSERT + admin SELECT/UPDATE policies; products gain seller_type, min_order_quantity default 1, max_order_quantity default 1000, is_available default TRUE, discount_percentage default 0; **`check_mr_brand_restriction()` trigger** (see §15.4 — DB-level enforcement of the MR brand lock); orders gain buyer_id, seller_id, seller_type, delivery_address, delivery_status default 'pending', delivery_tracking_id, notes, discount_amount default 0, tax_amount default 0, and RLS replaced with buyer/seller policies; **seller_buyer_relationships** (UNIQUE(seller_id,buyer_id), buyer_type NOT NULL, is_favorite default false, credit_limit default 0) with seller-view/seller-ALL policies; **store_settings** (seller_id UNIQUE, store_name NOT NULL, minimum_order_value default 0, delivery_areas TEXT[], is_accepting_orders default TRUE) with seller-own + "Everyone can view live stores" policies; **cart_items** (UNIQUE(buyer_id, product_id), quantity CHECK >0, updated_at + `update_cart_updated_at()` trigger) with buyer-ALL policy; 9 performance indexes. |
| 13 | `20251017155323` | `handle_new_user` v2: also writes business_name/business_type/verification_document_url from metadata + inserts user_roles row, **default role 'stockist'**. |
| 14 | `20251017161317` | **Data purge #1** (DELETE from all 13 tables). Added `profiles.username TEXT UNIQUE NOT NULL` + case-insensitive unique index `idx_profiles_username_lower ON profiles(LOWER(username))`. Replaced licenses-bucket storage policies: INSERT now allows **any authenticated user to upload anywhere in the bucket** (`WITH CHECK (bucket_id='licenses')` only), while SELECT/UPDATE/DELETE remain restricted to the user's own `{uid}/…` folder — this is why `Upgrade.tsx`'s `payment-proofs/…` uploads succeed but can never be read back by anyone (no SELECT policy matches that folder, and the bucket is private). |
| 15 | `20251017161548` | `handle_new_user` v3: username from metadata (fallback `user_{full-uuid}`), still default role 'stockist'. |
| 16 | `20251017174150` | **support_tickets** table (priority CHECK low/medium/high/urgent default 'medium', status CHECK open/in_progress/resolved/closed default 'open', category CHECK general/technical/billing/feature_request/bug default 'general', assigned_to→auth.users SET NULL, resolved_at). RLS: users view/create own; users can update own tickets **only while status='open'**; admins view/update all. `updated_at` trigger (reuses `update_product_updated_at`). 4 indexes. |
| 17 | `20251017181035` | **RLS tightening**: dropped world-readable products policies → seller-own CRUD + "Pharmacy users can view marketplace products" requiring `is_catalogue_live=true`; profiles gain "Pharmacy users can view seller profiles" (pharmacy → seller-role profiles); seller_buyer_relationships: buyers get FOR ALL manage-own + combined buyer-or-seller SELECT. |
| 18 | `20251017184343` | **RLS loosening** ("Remove the is_catalogue_live requirement temporarily to see all sellers"): both pharmacy-facing policies recreated **without** the is_catalogue_live condition. Migration comment documents the 5 test users (jitesh_mr/stockist/distributor/pharmacy/admin @test.com, password `12346`). |
| 19 | `20251017190354` | `is_catalogue_live` default → TRUE; backfilled existing sellers to true. |
| 20 | `20251018111619` | "PHASE 7: CRITICAL CATALOGUE VISIBILITY FIX": re-backfilled is_catalogue_live=true, re-set default, dropped the pharmacy products policy and created "Pharmacy users can view all seller products" — which **re-adds** the `is_catalogue_live = true` EXISTS check. ⚠️ So the *final* products policy DOES require the seller's catalogue to be live (this supersedes §9.3's statement for **products**; for **profiles** the §9.3 no-is_catalogue_live statement stands). Practically invisible because the default is true and everything was backfilled, but a seller flipping the MyProducts "Catalogue Status" switch OFF does hide their products from pharmacy queries at the RLS level while their profile card remains visible in `/marketplace`. |
| 21 | `20251019105629` | `handle_new_user` v4: admin password gate (`jit@ADMIN1`), still default 'stockist'. user_roles INSERT policy hardened: `role != 'admin' OR has_role(auth.uid(),'admin')` (prevents self-service admin escalation via direct insert). Added **12 admin SELECT policies** (products, profiles, pharmacies, orders, order_items, bills, payment_requests, payment_reminders, seller_buyer_relationships, store_settings, cart_items, user_roles). Ends with **data purge #2** (TRUNCATE … RESTART IDENTITY CASCADE on all 14 tables). |
| 22 | `20251019112103` | Another is_catalogue_live backfill + default TRUE (third time). |
| 23 | `20251025043258` | **OTC schema**: otc_brands (commission_rate default 5.0, is_active), otc_inventory (pharmacy_id→auth.users, brand_id, product_name, category, mrp, quantity_in_stock/quantity_sold defaults 0, updated_at + `update_otc_inventory_timestamp()` trigger), otc_shipments (shipment_number, status CHECK pending/in_transit/delivered/cancelled default 'pending', total_items/total_value defaults 0, expected_delivery_date, delivered_at), otc_shipment_items (shipment_id, inventory_id, quantity, unit_price). RLS: brands public-read (is_active) + admin ALL; inventory pharmacy-own SELECT/ALL + admin SELECT; shipments pharmacy SELECT/UPDATE + admin ALL; shipment items via owning shipment + admin ALL. **Seeds 3 brands: Derma Co, MamaEarth, Himalaya (5.0% commission each).** |
| 24 | `20251028040437` | Security hardening: re-created get_next_order_number / get_next_bill_number / check_mr_brand_restriction with `SET search_path TO 'public'`. |
| 25 | `20251028040958` | `handle_new_user` v5 (current): **default role 'pharmacy'**, username fallback `user_{first-8-of-uuid}`, name fallback = email local-part, profile upsert `ON CONFLICT (id) DO UPDATE` (username/name/phone/email coalesced), role insert `ON CONFLICT DO NOTHING`, whole body wrapped in `EXCEPTION WHEN OTHERS → RAISE WARNING, RETURN NEW` so signup never fails on profile errors. |
| 26 | `20251108053100` | Final products INSERT/UPDATE policies: `auth.uid() = stockist_id` AND role ∈ (mr, stockist, distributor) on both USING and WITH CHECK. |

**Notably absent from migrations:** `pharmacy_otc_subscriptions` and `otc_subscription_plans` have **no CREATE TABLE anywhere in the repo** — they exist only in the hosted project (created outside migration control), which is exactly why the frontend must cast `supabase.from('…' as any)` and why they're missing from `types.ts`. Their shape can be inferred from usage: `otc_subscription_plans {id, name, price, stock_value, max_brands, min_margin, max_margin, features: string[], is_active}` (ordered by `price asc` in OTCPartnership) and `pharmacy_otc_subscriptions {id, pharmacy_id, plan_id, payment_amount, payment_status, selected_brands: uuid[], status, created_at}`.

---

## 15. EXHAUSTIVE DATA-MODEL REFERENCE (field-by-field, lifecycle, usage)

### 15.1 Entity relationship map (as actually wired)
```
auth.users 1—1 profiles (id)            profiles 1—N user_roles (user_id; UNIQUE(user_id,role), app reads first row)
profiles(mr) 1—N pharmacies (mr_id)     pharmacies 1—N bills (pharmacy_id)
bills 1—N payment_requests / payment_reminders (bill_id)
profiles(seller) 1—N products (stockist_id)
orders: buyer_id→auth.users, seller_id→auth.users, stockist_id→profiles, pharmacy_id→pharmacies
orders 1—N order_items (order_id; product_id RESTRICT)
cart_items: buyer_id/seller_id→auth.users, product_id→products; UNIQUE(buyer_id,product_id)
seller_buyer_relationships: seller_id/buyer_id→auth.users; UNIQUE pair
otc_brands 1—N otc_inventory / otc_shipments (brand_id); otc_shipments 1—N otc_shipment_items (→otc_inventory)
```
The dual identity of "pharmacy" is central: a *pharmacies* row is an MR-owned **contact record** (no login), while a pharmacy **user** is a profiles row with role `pharmacy`. Marketplace orders bridge the two incorrectly (Checkout writes buyer profile id into `orders.pharmacy_id`, §3.6), and MyCustomers mixes them (§2.12).

### 15.2 Tables in full

**`profiles`** — one row per auth user; created by `handle_new_user` trigger and/or `assign-role` upsert.
| Column | Type/Default | Written by | Read by |
|---|---|---|---|
| id | uuid PK = auth.users.id | trigger | everywhere |
| username | text UNIQUE NOT NULL (case-insens. index) | signup metadata / fallbacks | RoleAudit table, signup availability check (`ilike`) |
| name, phone, email | text NOT NULL | trigger, Profile edit, Auth signup step 4 (email) | headers, order cards, exports |
| upi_id | text NOT NULL (may be '') | signup (non-pharmacy), Profile edit, Settings General | UPI link generation (Orders payment link, Payments reminders, QuickOrder) — empty upi_id blocks Orders' payment-link with a toast, but Payments builds `upi://pay?pa=undefined…` style links without guarding |
| stockist_license_url | text | never written by current code | Profile view-mode link |
| business_name / business_type | text | signup, Settings, Profile is not editing these (only Settings General edits business_name) | branding, MR brand lock (business_type = MR's brand), dashboards |
| verification_document_url | text | Auth signup step 4 (file path in licenses bucket) | AdminDashboard pending-verification KPI |
| is_verified | bool default false | Admin UserManagement Verify/Unverify | Marketplace "Verified Only" pill, Featured Sellers, MyProducts dead `canGoLive` |
| is_catalogue_live | bool default true | MyProducts switch, assign-role (true) | RLS products policy (§14 #20), Featured Sellers, Live Catalogue pill |
| bank_account_number / bank_ifsc_code / bank_account_holder_name | text | Profile edit | Profile masked display |
| payment_enabled | bool default false | Profile edit (derived: all 3 bank fields present) | Profile "Verified" badge on bank card |
| subscription_tier ('free') / subscription_expires_at / subscription_payment_proof_url / subscription_payment_status ('pending') | | admin Subscriptions approve (tier→'premium', +30d, status→'verified'); proof_url never written | UserManagement + RoleAudit "Premium/Free" badge |
| customer_count (0) / max_customers_free_tier (3) | int | never written | never read — the free-tier customer cap advertised by Upgrade.tsx is **not enforced anywhere** |
| created_at | timestamptz now() | — | RoleAudit "Joined" |

**`user_roles`** — {id, user_id, role app_role, created_at}; UNIQUE(user_id, role). One row per user in practice (assign-role skips insert if any role exists; trigger ON CONFLICT DO NOTHING). All role reads select the single row (`.single()`/`.maybeSingle()`); there is no role-switching UI and no multi-role support in the frontend.

**`pharmacies`** — MR's customer book. Lifecycle: created via PharmacyForm (or never); read by Pharmacies/PharmacyDetail/DeliveryPlanner/Orders(MR tab)/BillForm/QuickBill/QuickOrder/OrderForm; deleted only via cascade (delete-my-account/admin-wipe) — **no UI to edit or delete a pharmacy exists**. `max_credit_limit` default 100000 (DB) — PharmacyForm doesn't set it so DB default applies; PharmacyDetail additionally falls back `|| 100000` in JS; `payment_behavior_score` (5.0) and `avg_payment_days` (0) are displayed (PharmacyCard) but no code ever recomputes them.

**`bills`** — the receivables ledger. Full column set in §10. Status values written by code/RPC: `pending`, `paid`, `due_soon`, `overdue`, `critical` (plus CHECK-constraint legacy `draft`, never written). Creation paths (4): PharmacyDetail card (§2.9, with payment_request + reminder), BillForm (§2.10, rolls previous due), QuickBillModal (§8.2/6.2, decrements stock), QuickOrderModal (§6.3, parses text + decrements stock). Update paths: UpdateBillModal (received_amount/status), Payments "Mark Paid" (status only — leaves received_amount stale), sendReminder (reminder_count/last_reminder_sent), `update_bill_statuses()` RPC. There is **no bill line-item table at all** — bills are aggregate-only records; order_items belong to orders, not bills.

**`payment_requests`** — log of UPI collection asks. Written by PharmacyDetail bill creation (`status:'pending'`) and Payments reminder send (`status:'sent'`, `reminder_sent_at`). `paid_at` and `reminder_history` (jsonb) columns exist but are never written. Read only by Payments "Recent Payment Requests" list. No UPDATE ever happens from the app despite the RLS UPDATE policy.

**`payment_reminders`** — audit trail of reminder messages. Written by PharmacyDetail (initial on bill creation, followup on Send Reminder), each with full `message_content` (the WhatsApp text) and `sent_via:'whatsapp'`, `status:'sent'`. Read by nothing except PharmacyDetail's "Reminders sent: N" count (which actually reads `bills.reminder_count`, not this table) — i.e. the table is effectively write-only.

**`products`** — full catalogue entity (25 columns, §10). Creation paths (4): ProductForm, OCRUploadModal→edge fn, BulkUploadModal (CSV/XLSX), OCR edge fn direct insert. Update paths: ProductForm edit, MyProducts availability toggle (is_available), OCR stock merge, Orders "Mark as Packed" stock decrement, QuickBill/QuickOrder stock decrement. Delete: MyProducts AlertDialog only. Two independent visibility flags: `is_active` (write default true; filtered by Catalogue and OrderForm; MyProducts shows all) and `is_available` (seller toggle; filtered by MarketplaceProducts and SellerDetail). `price` is the marketplace display/sale price; `sale_rate` mirrors it from ProductForm but bulk/OCR set both differently (bulk: price=sale_rate; OCR: sets sale_rate/mrp/purchase_rate but **not** `price` on update path — an OCR-updated product keeps its old `price` while sale_rate changes; the OCR *create* path never sets `price` at all, and since `price` is NOT NULL with no default, **the OCR create insert would actually fail** unless the DB gained a default outside migrations — as coded, `action:"created"` inserts omit the required `price` column).
`min_order_quantity`/`max_order_quantity`/`discount_percentage` are set only by DB defaults (1/1000/0) — no form writes them; discount badges/price math in MarketplaceProducts/SellerDetail/Cart/Checkout therefore normally compute with discount 0 unless data was edited directly.

**`orders` + `order_items`** — two disjoint creation flows share the tables: (a) **marketplace flow** (Checkout): buyer_id+seller_id+stockist_id+pharmacy_id(=buyer profile id!)+delivery fields+delivery_status lifecycle; (b) **MR manual flow** (OrderForm): only pharmacy_id (a real pharmacies row) + stockist_id + order_number/total/status — no buyer_id, no delivery_status (DB default 'pending' applies), never advanced through the delivery state machine unless the MR uses the Orders detail dialog. `status` and `delivery_status` are parallel columns: Checkout sets both to 'pending'; the Orders page state machine mutates **delivery_status** only (status stays 'pending' forever except SellerDashboard's revenue KPI reads `status='delivered'` — ⚠️ meaning stockist/distributor "Total Revenue" stays ₹0 even after orders are delivered, because delivery flow sets delivery_status='delivered' but not status). MySuppliers' pendingPayment also reads `status`. `delivered_at` set on Mark-as-Delivered. `tax_amount`/`discount_amount`/`seller_type` never written by any flow (seller_type column on orders — distinct from products.seller_type — always null).

**`cart_items`** — persistent server-side cart; UNIQUE(buyer_id, product_id) is what makes MarketplaceProducts' `upsert` with `onConflict: "buyer_id,product_id"` idempotent. RLS buyer-ALL. Deleted by: qty→0, Clear Cart, successful Checkout, admin-wipe, delete-my-account.

**`seller_buyer_relationships`** — created only from the pharmacy side (Marketplace heart → upsert `{seller_id, buyer_id, buyer_type:'pharmacy', is_favorite:true}`). **No code path ever creates a `buyer_type:'stockist'` row**, so SellerDashboard's "X stockists" split and MyCustomers' distributor-only "Stockists" tab always show 0/empty. `credit_limit` (default 0) is displayed in MyCustomers usage bars but there is no UI to set it. `is_favorite` toggled by MyCustomers star and Marketplace heart.

**`store_settings`** — complete table + RLS but **zero frontend reads or writes**; only admin-wipe/delete-my-account delete from it. Dead schema.

**`subscription_requests`** — written by unrouted Upgrade.tsx; read/updated by unrouted admin/Subscriptions.tsx and AdminDashboard KPI/recent list. With both pages unreachable through navigation, the whole subscription pipeline is dormant but fully coded.

**`support_tickets`** — the one fully working cross-role workflow: Support.tsx creates; SupportManagement reads all + inline status changes (resolved/closed stamp `resolved_at`). `assigned_to` column never written.

**OTC tables** — otc_brands (seeded ×3), otc_inventory/otc_shipments/otc_shipment_items only ever populated by the never-invoked `initialize-otc-inventory` fn (§7.6). Read by PharmacyDashboard OTC card (`otc_inventory`) and OTCPartnership/Profile (via the untyped subscription/plan tables). `otc_shipment_items` has no reader or writer at all beyond RLS definitions.

### 15.3 Complete RLS policy inventory (final effective state after all migrations)
- **profiles**: SELECT own; SELECT sellers-by-pharmacy (role-based, no live check); SELECT all by admin; UPDATE own; INSERT own.
- **user_roles**: SELECT own; SELECT all by admin; INSERT own **with anti-escalation check** (non-admin role, or already admin).
- **pharmacies**: full CRUD for `mr_id = auth.uid()`; admin SELECT.
- **bills / payment_requests / payment_reminders**: SELECT/INSERT/UPDATE (bills also DELETE) via EXISTS join to owning MR; admin SELECT. Note: pharmacy *users* have no policy on bills — a pharmacy user cannot see bills raised against them (bills are attached to the MR's contact record, not the user).
- **products**: SELECT own (stockist_id); SELECT by pharmacy users when seller has seller role **AND is_catalogue_live=true**; admin SELECT; INSERT/UPDATE own + seller-role check; DELETE own.
- **orders**: SELECT seller (seller_id or stockist_id); SELECT buyer; INSERT `buyer_id = auth.uid()` — ⚠️ this is the **only** INSERT policy, so OrderForm's MR-manual insert (which sets no buyer_id) passes only because… it doesn't: with `WITH CHECK (auth.uid() = buyer_id)` and buyer_id NULL, the check fails → **as migrated, OrderForm/QuickOrder-style order inserts would be rejected by RLS** unless the hosted DB has an additional policy not in the repo. (QuickBill/QuickOrder actually insert *bills*, not orders, so only OrderForm is affected.) UPDATE seller; admin SELECT.
- **order_items**: SELECT/INSERT via owning order where `orders.stockist_id = auth.uid()`; admin SELECT — ⚠️ **no buyer INSERT policy**: Checkout inserts order_items for an order whose stockist_id = the *seller*, not the buyer → per migrated policies this insert fails too; Checkout works only if the hosted project carries extra policies. Buyers also can't SELECT their own order items per these policies (Orders page hides buyer orders anyway).
- **seller_buyer_relationships**: seller SELECT/ALL; buyer ALL; buyer-or-seller SELECT; admin SELECT.
- **cart_items**: buyer ALL; admin SELECT.
- **store_settings**: seller own SELECT/ALL; public SELECT where accepting orders; admin SELECT.
- **subscription_requests**: own SELECT/INSERT; admin SELECT/UPDATE.
- **support_tickets**: own SELECT/INSERT; own UPDATE while open; admin SELECT/UPDATE.
- **OTC**: brands public-read(is_active)/admin ALL; inventory pharmacy own SELECT+ALL/admin SELECT; shipments pharmacy SELECT+UPDATE/admin ALL; shipment_items via shipment/admin ALL.
- **storage.objects**: product-images (public SELECT anyone / INSERT any authed / UPDATE+DELETE own folder); licenses (INSERT any authed anywhere in bucket / SELECT+UPDATE+DELETE own `{uid}/` folder only).

### 15.4 Database triggers (complete)
1. **`on_auth_user_created`** → `handle_new_user()` (current v5 behaviour in §8.5/§14 #25).
2. **`enforce_mr_brand_restriction`** BEFORE INSERT/UPDATE on products → `check_mr_brand_restriction()`: looks up the writer's role; if `mr` and profile.business_type is non-null and NEW.brand_name differs → `RAISE EXCEPTION 'MRs can only add products from their registered brand: %'`. **This is a hard DB-level enforcement of the MR brand lock** — it backstops the client-side locked Select in ProductForm and (unlike the client) also constrains BulkUploadModal and OCR inserts for MR users (bulk rows / OCR-extracted brands that don't match the MR's business_type will fail at insert with this exception). *(Addition to §2.4/§6.7, which described the lock as client-side only.)*
3. **`products_updated_at`** → `update_product_updated_at()` (also reused by support_tickets' updated_at trigger).
4. **`update_cart_items_updated_at`** → `update_cart_updated_at()` (no `SET search_path`; plain plpgsql).
5. **`update_otc_inventory_updated_at`** → `update_otc_inventory_timestamp()`.

---

## 16. EDGE FUNCTION API REFERENCE (request/response contracts)

All six functions: Deno `serve` handlers, CORS `Access-Control-Allow-Origin: *` with `authorization, x-client-info, apikey, content-type` allowed headers, OPTIONS preflight short-circuit, and errors returned as `{error}` JSON. All construct a **service-role** Supabase client from `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` env (so their DB writes bypass RLS). Five verify the caller's JWT via `supabase.auth.getUser(token)`; `autocomplete-product` performs **no auth at all**.

| Function | Method/Auth | Request body | Success response | Errors |
|---|---|---|---|---|
| `assign-role` | POST, user JWT | `{role, metadata?: {username, name, phone, upi_id, business_name, business_type, verification_document_url, admin_password}}` | `{success: true, role}` | 403 `{error:'Invalid admin registration password'}` if role=admin without `jit@ADMIN1`; 500 otherwise |
| `delete-my-account` | POST, user JWT | none used | `{success: true, message:'Account deleted successfully'}` | 500. 14-step cascade (§7.5) then `auth.admin.deleteUser(userId)`; each intermediate delete is `await`ed but **individual errors are not checked** — a failed child delete silently proceeds |
| `admin-wipe` | POST, user JWT + DB role must be 'admin' | `{confirm: 'DELETE ALL USERS AND DATA', include_admins?: bool}` | `{success, message:'Deleted N users and all application data', warning}` | 403 non-admin; 400 wrong confirm phrase; 500 |
| `initialize-otc-inventory` | POST, user JWT (any role — no pharmacy check) | none | `{success, message, stats:{total_products, total_items, total_value, brands}}` or `{message:'Inventory already initialized'}` | 400 `{error}` (uses 400, not 500, for all failures) |
| `ocr-product-label` | POST, user JWT | `{imageBase64 (data URL), mrp, stock, purchaseRate, saleRate}` | `{action:'updated'|'created', product, message}` | 500 `{error}` incl. "Failed to parse product details from image" on JSON-parse failure |
| `autocomplete-product` | POST, **no auth** | `{productName}` (≥2 chars) | `{success: true, data:{brand_name, salt_name, type, uses, description, storage, handling, consumption, image_url, category}}` | 400 short name; 429 rate-limit passthrough; 402 "Service temporarily unavailable"; 500 |

AI details: gateway `https://ai.gateway.lovable.dev/v1/chat/completions`, model `google/gemini-2.5-flash`, `LOVABLE_API_KEY` env secret. OCR prompt demands strict JSON with 6 fields ("Be precise and extract only visible text"); the enrichment prompt asks for uses (50–100 words)/description (30–50 words)/typical_unit/category with a hardcoded fallback object (`uses: "Consult physician for usage"` etc.) if parsing fails. Autocomplete's system prompt explicitly asks the model to invent "a representative public image URL from Google Images" — the source of hallucinated image_urls. OCR's product-match `.or(\`name.ilike.%${product_name}%,salt_name.ilike.%${salt_name}%\`)` interpolates model output directly into the PostgREST filter string (commas/parens in an extracted name would corrupt the filter expression). `initialize-otc-inventory`'s shipment seeding computes `delivered_at` = now − random(0–10d) and `expected_delivery_date` = now − random(0–15d) independently, so a shipment can be "delivered" before it was expected or vice versa — cosmetic demo data.

---

## 17. END-TO-END WORKFLOWS (exact data mutations, step by step)

### 17.1 Signup → role assignment (three cooperating mechanisms)
1. User submits `Auth.tsx` signup → `auth.signUp` with metadata `{username, name, phone, business_name, business_type, upi_id, role, admin_password?}`.
2. **DB trigger** `handle_new_user` fires synchronously inside the auth insert: validates admin password (raises → whole signup fails for bad admin attempts), inserts profiles (upsert) + user_roles (default 'pharmacy' when metadata missing), swallows any other error.
3. **Client** then uploads the license file to `licenses/{uid}/{ts}_{role}_document.{ext}` and patches `profiles {verification_document_url: path, email}`.
4. **Client** calls `assign-role` with the session token — normally a no-op for the role (trigger already inserted one; the function's `.single()` existing-role check finds it) but its profile **upsert overwrites** profile fields with metadata again and force-sets `is_catalogue_live: true, is_verified: false`.
5. If email confirmation is enabled, step 3–4 silently skip (no session token); the trigger's inserts stand. A user who somehow has no role row gets routed by DashboardRouter/useRoleGuard to `/onboarding`, where `OnboardingSelectRole` calls `assign-role` with a generated username — the second path into the same function.
6. Toast → `/dashboard` → DashboardRouter dispatches on the role.
Verification afterwards: user appears in AdminDashboard's "Pending Verifications" KPI (is_verified=false + document present); admin flips is_verified in UserManagement. Verification has minimal downstream effect: only the Featured Sellers query, the "Verified Only" marketplace pill, Profile's badge and the dead canGoLive flag consume it — an unverified seller can sell normally.

### 17.2 Seller catalogue build-up (4 entry paths converging on `products`)
- **Manual** (ProductForm): AI Auto-fill (public autocomplete fn) pre-populates; MRP→margin calculator derives sale_rate; image → public bucket; insert with seller_type stockist/distributor (MR→'stockist', §2.4). DB trigger #2 enforces MR brand.
- **OCR** (OCRUploadModal → ocr-product-label): photo + 4 manual numbers → Gemini extracts → fuzzy match own catalogue → stock-merge update (stock += input, rates overwritten) or AI-enriched create. Modal `onSuccess` invalidates `products`/`my-products`/`all-products`.
- **Bulk** (BulkUploadModal): CSV via PapaParse (`header: true, skipEmptyLines`) or XLSX via SheetJS `sheet_to_json`; per-row validation (name present, sale_rate>0, stock_quantity≥0); sequential single-row inserts with progress bar `(i+1)/total`; category normalised `toLowerCase().replace(/\s+/g,'_')` cast `as any` (an unknown label produces an invalid enum → row error collected, up to 10 shown); template download generates a 2-row sample workbook.
- **Visibility controls**: per-product `is_available` toggle (MyProducts) hides from pharmacy browse pages; profile-level `is_catalogue_live` switch hides *all* products at RLS level (§14 #20) while keeping the seller card visible in `/marketplace`.

### 17.3 Marketplace purchase: cart → checkout → fulfilment → stock
1. Pharmacy browses `/marketplace` (sellers) or `/marketplace/products` (all products) or `/seller/:id`.
2. **Add to cart** (MarketplaceProducts): upsert `cart_items {buyer_id, seller_id: product.stockist_id, product_id, quantity}` on conflict (buyer_id,product_id); seller-lock enforced client-side against `cartItems[0].seller_id`. (SellerDetail path skips the lock, §3.4.)
3. **Cart** `/cart`: server-backed lines, qty stepper mutates quantity (0 ⇒ delete), totals = Σ price×(1−discount%)×qty.
4. **Checkout** `/checkout`: requires delivery address; client-side order number `ORD/{buyerOrderCount+1, pad 4}`; inserts `orders` (buyer_id, seller_id=stockist_id=cart's seller, pharmacy_id=**buyer profile id**, status+delivery_status 'pending', address/notes) then `order_items` (discounted unit price, subtotal), then deletes the cart rows; navigates `/orders` (where the buyer sees nothing, §2.5).
5. **Seller fulfilment** (Orders detail dialog, delivery_status machine): pending →(Confirm)→ confirmed →(Mark as Packed, **stock decremented** per line `max(0, stock−qty)`)→ packed →(Ship + tracking id)→ shipped →(Mark as Delivered, delivered_at=now)→ delivered; Cancel from any non-terminal state (**cancelling after packing does not restore stock**). Payment Link generation available packed-onward: UPI deep link from seller's upi_id + wa.me share to buyer's phone.
6. **MR post-delivery**: "Create Bill for This Order" → BillForm prefilled `?orderId&pharmacyId&amount` (works only if the order's pharmacy_id matches an MR-owned pharmacies row — true for OrderForm-created orders, not for marketplace ones).

### 17.4 Receivables: bill → credit → reminders → settlement
1. **Creation** (4 paths, §15.2 bills). PharmacyDetail's path additionally seeds payment_requests + payment_reminders and sets reminder_count=1; QuickBill/QuickOrder decrement stock at bill time (they treat a bill as an implicit fulfilled order).
2. **Credit control**: PharmacyDetail live-checks `check_credit_limit` (display-only warning tiers 90/100%); BillForm computes `previous_due + total − upfront` client-side and hard-blocks above `max_credit_limit`. Utilization everywhere = Σ(due−received) over non-paid bills.
3. **Status machine**: `update_bill_statuses()` run on PharmacyDetail load re-buckets by remaining_due_date (paid / pending / due_soon ≤2d / overdue <7d late / critical >7d late) — §8.2 table. StatusBadge renders the buckets with day counts.
4. **Reminders**: PharmacyDetail "Send Reminder" inserts a followup payment_reminders row + bumps bills.reminder_count/last_reminder_sent; Orders' payment-link dialog and QuickOrder open `wa.me/{phone}` with `generateWhatsAppMessage` text; Payments page inserts payment_requests and plays the 2-second PaymentProcessModal simulation. Nothing sends anything server-side.
5. **Settlement**: UpdateBillModal partial/full (received_amount, optional status='paid'); Payments' Mark Paid (status only). No receipt records, no payment gateway, no reconciliation — settlement is manual bookkeeping.

### 17.5 OTC partnership (as it behaves today)
Pharmacy → `/otc-partnership`: wizard select plan → select ≤max_brands brands → review → "Complete Payment (Dummy Payment)" inserts `pharmacy_otc_subscriptions {payment_status:'paid', status:'active', selected_brands:[ids]}`. Because nothing calls `initialize-otc-inventory`, no otc_inventory/otc_shipments rows appear; the pharmacy sees the "active subscription" summary card (plan name, ₹{stock_value/1000}k, brand count) on OTCPartnership and the (duplicated) Profile OTC card, but the Dashboard OTC Overview card (conditioned on inventory rows) never renders. If the function were called (e.g. manually), it would seed 24 products ×40 units across the 3 brands + 3 delivered shipments, lighting up the dashboard card with Σmrp×qty value and the flat-5% earnings estimate. `quantity_sold` has no writer — there is no OTC sales-recording flow.

### 17.6 Premium subscription (fully coded, unreachable)
Upgrade.tsx (unrouted): pay ₹999 to 9672123710 → upload screenshot (private-bucket getPublicUrl bug §5.7/§9.2) + UTR → subscription_requests pending → admin/Subscriptions.tsx (unrouted) Approve → profile becomes premium for 30 days / Reject with reason. `subscription_tier` feeds only the Premium/Free badges; **no feature in the app actually checks the tier** (the "3 free customers" limit exists as columns only).

### 17.7 Destructive admin operations
- **Wipe**: AdminDashboard Danger Zone (typed phrase, includeAdmins checkbox) → admin-wipe fn: row-deletes 14 tables (leaves all 4+2 OTC tables and both storage buckets untouched), then deletes auth users one-by-one via admin API, skipping admins unless included. Client signs out (if admins included) or reloads.
- **Self-delete**: Profile → type DELETE → delete-my-account fn (14-entity cascade, §7.5; leaves OTC data and storage files orphaned) → signOut → /auth.

---

## 18. COMPLETE USER JOURNEYS BY ROLE

### 18.1 MR (Medical Representative) — brand-locked field seller
Signs up with Company Name + **Brand Name (business_type)** + UPI + agreement doc. Lands on SellerDashboard ("MR Dashboard", subtitle `Brand: {brand} • {company}`) with Quick Bill / Quick Order / OCR Scan header actions. Day-to-day loop:
1. **Build territory**: `/pharmacies/new` for each chemist; `/pharmacies` shows the book sorted by payment-risk severity with credit-utilization coloured cards.
2. **Catalogue**: `/my-products` (brand-restriction banner); products addable only under their registered brand (client lock + DB trigger). OCR scan from dashboard for fast stock entry.
3. **Order intake**: `/marketplace/order/new` (pick pharmacy + products, RPC order number) → redirected into `/bills/new` to bill it; or Quick Order (paste WhatsApp-style free text, auto-matched to catalogue, bill created + stock decremented + WhatsApp/UPI share panel); or Quick Bill (search products, itemised total → aggregate bill + stock decrement).
4. **Receivables**: `/pharmacy/:id` per-customer cockpit — credit gauge, bill list with live statuses, create-bill-with-payment-request card (UPI link + WhatsApp reminder + reminder log), Update Payment / Send Reminder per bill; `/payments` for cross-customer reminder blasts; `/bills/new` for standalone bills with previous-due roll-up and hard credit block.
5. **Field work**: `/delivery-planner` — tick pharmacies, "optimize" (simulated), open the multi-stop Google Maps direction URL.
6. **Review**: `/analytics` (order KPIs/charts), `/reports` (Sales/Payments/Inventory CSV), ActivityFeed on dashboard.
Platform-marketplace side: MR products are visible to pharmacies (as seller_type 'stockist'); incoming marketplace orders appear under Orders "Platform Orders" and use the same fulfilment machine; MR-only extra = "Create Bill for This Order" after delivery. Known journey potholes: dashboard Quick-Action `/products` 404s; Edit-product from MyProducts 404s; revenue KPI = Σ received across bills (not orders).

### 18.2 Stockist — multi-brand wholesaler
Signup with Business Name + License Type + UPI + stockist license. SellerDashboard shows OCR Scan + Bulk Upload. Journey: bulk-load full catalogue (CSV/XLSX), maintain via MyProducts (expiry/stock filters, availability toggles, catalogue-live switch); fulfil marketplace orders through the delivery_status machine incl. packed-time stock decrement and UPI payment-link sharing; track buyers in `/my-customers` (favourites, WhatsApp, create-bill shortcut — outstanding figures unreliable per §2.12); monitor `/analytics` + `/reports`. No pharmacies-book or delivery planner in their nav (those are MR-flavoured, though the pages are not role-guarded). Revenue KPI = delivered `status` orders → effectively ₹0 (§15.2 orders note); Pending Orders KPI similarly reads `status='pending'` which *does* match (status never leaves pending).

### 18.3 Distributor
Identical surface to stockist plus: signup captures Service Areas (comma-separated; stored in metadata → business_type? no — it's sent as part of metadata but only business_name/business_type persist; service areas are **collected and discarded**), MyCustomers gains the "Stockists" tab (always empty, §15.2 relationships), and ProductForm stamps their products `seller_type='distributor'` (the only seller_type that's ever accurate for the marketplace filter).

### 18.4 Pharmacy — the marketplace buyer
Signup with Pharmacy Name/Owner/Address + license (no UPI). Dashboard: hero → `/marketplace`; KPIs (pending orders, total spent, favourite suppliers, total orders); Featured (verified+live) sellers; OTC card once inventory exists. Journey: browse sellers → favourite (heart) → seller catalogue or all-products grid → seller-locked cart → checkout with address/notes → order placed. Post-purchase visibility is the journey's weak spot: `/orders` shows them nothing (§2.5); tracking numbers and delivered states are only ever seen by the seller; the pharmacy's only order telemetry is dashboard KPI counts, MySuppliers per-seller aggregates (orders/spend/pending) and ActivityFeed lines. `/my-suppliers` lists every seller they've ever ordered from with Browse shortcut. OTC: subscribe via the 3-step dummy-payment wizard (§17.5). Support tickets, Profile (bank/UPI editing — collected though pharmacies never receive payments in-app), Settings, account deletion as any role. The layout search bar (pharmacy-only) focuses → `/marketplace`.

### 18.5 Admin
Created via signup with the `jit@ADMIN1` gate (client + edge fn + DB trigger all check it) — note `/onboarding` deliberately omits admin. Landing `/` → AdminDashboard: platform KPIs, users-by-role, subscription queue preview (Review buttons 404), Danger-Zone wipe. Working tools: `/admin/users` (search/filter, verify/unverify), `/admin/support` (global ticket triage with inline status select), `/admin/role-audit` (role distribution + full user table + two real XLSX exports). Layout gives admins an extra Shield header button and a Role Audit menu entry; admin bottom nav = Home/Users/Support/Audit/Analytics (Analytics shows *their own* — empty — seller analytics, as it queries orders by their user id). The subscription approval screen exists but must be reached by editing the URL… which still 404s (no route), so approvals are only possible by adding the route or driving the DB directly.

---

## 19. STATE MANAGEMENT & CLIENT DATA FLOW

### 19.1 Architecture
No global app state beyond `AuthContext {user, session, loading}`. Everything else is **TanStack Query v5 server-cache** + per-component `useState`. Zustand installed, never used. No optimistic updates except Payments' `onMutate` (opens the processing modal). No query persistence; default QueryClient (staleTime 0 except where set). Realtime: single `pharmacy-bills-changes` channel (§9.1). Derived/computed state is recomputed inline in components (`useMemo` in filter-heavy pages like Catalogue/MarketplaceProducts).

### 19.2 Query-key inventory (every key in the codebase)
Role/profile: `["userRole", uid]` (useRoleGuard, Layout `.single()`, DashboardRouter, several pages — 7 sites), `['user-role', uid]` (MobileNav only — divergent key), `["profile", uid]` (6 sites), `["user-profile", uid]`, `["seller-profile", uid]`.
Seller data: `["my-products", uid]`, `["products"]` (Catalogue all-products), `["all-products"]`, `["products-search", q]` (QuickBill), `["products-for-order"]` (OrderForm), `["seller-products", sellerId]`, `["seller-products-count"]`, `["seller-dashboard-stats", uid, role]`, `["seller-orders", uid]`, `["self-added-pharmacies", uid]`, `["seller-relationships", uid]`, `["next-bill-number", uid]` (BillForm + PharmacyDetail), `["pending-bills", uid]` (Payments), `["payment-requests", uid]`.
Pharmacy book: `["pharmacies", uid(,search)]`, `["pharmacies-list", uid]`, `["pharmacies-quick", uid]` (QuickBill), `["pharmacies-quick-order", uid]`, `["pharmacies-delivery", uid]`, `["pharmacies-dashboard", uid, search]`, `["pharmacy", id]`, `["pharmacy-bills", id]`.
Buyer: `["marketplace-sellers"]`, `["marketplace-products"]`, `["seller", sellerId]`, `["cart"]`, `["cart-items"]`, `["my-suppliers"]`, `["supplier-order-stats", uid]`, `["pharmacy-dashboard-stats", uid]`, `["featured-sellers"]`, `["dashboard-stats", uid]`.
OTC: `['otc-subscription', uid]`, `['otc-plans']`, `['otc-brands']`, `['otc-stats', uid]`.
Shared/admin: `["analytics", uid]`, `["reports", type, range, uid]`, `["activity-feed", uid]`, `["support-tickets", uid]`, `["admin-users", search, roleFilter]`, `["admin-support-tickets", search, statusFilter]`, `["admin-dashboard-stats", uid]`, `["role-audit"]`, `["subscription-requests-pending"]`, `["subscription-requests-approved"]`.
Invalidation edges (mutation → keys): product CRUD → `my-products`/`products`/`all-products`; cart mutations → `cart`/`cart-items`; bill/payment mutations → `pharmacy-bills`/`pending-bills`/`payment-requests`; catalogue-live toggle → `profile`+`marketplace-sellers`; delivery-status updates → `seller-orders`+`my-products`; admin verify → `admin-users`; subscription approve/reject → both subscription keys. The fragmented near-duplicate keys (e.g. 5 different pharmacy-list keys, `cart` vs `cart-items`, `userRole` vs `user-role`) mean sibling pages often don't benefit from each other's cache or invalidations — BulkUploadModal sidesteps this with `window.location.reload()`.

### 19.3 Local-state hotspots
Auth.tsx (~20 useState fields for 4 modes), ProductForm (form object + calculator + preview), Checkout (address/notes), OTCPartnership wizard (`step`, `selectedPlan`, `selectedBrands`), Orders (selected order, tracking input, payment-link dialog), SellerDetail's local (unsynced) `cart` map, Settings' uncontrolled inputs read via `document.getElementById` on save, DeliveryPlanner's selection/optimizing/result trio.

---

## 20. CONSOLIDATED BUSINESS-RULE & CALCULATION INDEX

| Rule / formula | Value / expression | Where |
|---|---|---|
| Line price (marketplace) | `price × (1 − discount_percentage/100)` | MarketplaceProducts, SellerDetail, Cart, Checkout |
| Order total | Σ line price × qty (no tax, no shipping) | Cart/Checkout/OrderForm |
| Sale-rate calculator | percent: `MRP−MRP·m/100`; amount: `MRP−m`; clamp ≥ purchase_rate | ProductForm |
| Bill upfront | `round(total × upfront% / 100)`; remaining = total − upfront | PharmacyDetail, BillForm |
| Due date | bill_date + payment_terms_days (defaults 7 or 30, §11) | `calculateDueDate` |
| Credit utilization | Σ(due−received) over non-paid bills; % vs max_credit_limit; thresholds 80/90/100 | PharmacyDetail, PharmacyCard, check_credit_limit RPC |
| Bill status buckets | paid ≤0 remaining; due_soon ≤2d before due; overdue <7d late; critical >7d | update_bill_statuses RPC |
| Pharmacy roll-up status severity | critical > overdue > due_soon > pending > up-to-date | Pharmacies list sort |
| Stock badges | 0 out / ≤10 low / >10 in stock; marketplace: >10 "In Stock", 1–10 "Only n left" | MyProducts, MarketplaceProducts |
| Expiry buckets | expired <0d / expiring ≤30d / ok >30d | MyProducts filter |
| Numbering | bills `MR/NNN` per MR (RPC); orders `ORD/NNNN` per stockist (RPC) vs Checkout's buyer-count client scheme | §8.1 |
| Revenue (MR) | Σ bills.received_amount | SellerDashboard |
| Revenue (stockist/distributor) | Σ orders.total where status='delivered' (never satisfied, §15.2) | SellerDashboard |
| Collection rate | received/(received+pending)×100 | Reports Payments |
| OTC earnings estimate | Σ mrp×qty×5% | PharmacyDashboard |
| Premium | ₹999 → +30 days, tier 'premium' (no feature gating) | Subscriptions |
| Free-tier customer cap | columns customer_count/max_customers_free_tier(3) — **not enforced** | profiles |
| MR brand lock | client Select lock + `enforce_mr_brand_restriction` DB trigger | ProductForm / DB |
| Admin gate | `jit@ADMIN1` ×3 layers; wipe phrase; DELETE phrase; IFSC regex `^[A-Z]{4}0[A-Z0-9]{6}$`; username 6–16; file ≤5MB; password ≥6; phone 10–15 | various |

## 21. TEST DATA & ENVIRONMENT
- `scripts/create-test-users.sql` is documentation-only (all statements are comments): 5 personas jitesh_{mr,stockist,distributor,pharmacy,admin}@test.com / password `12346`, with sample business names (PharmaCorp MR / MediStock Solutions / PharmaDistribute Inc / HealthCare Pharmacy) and phones +91 98765432{10–14}; instructs creating them through the real signup flow with any document.
- Required env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (client); `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `LOVABLE_API_KEY` (edge functions).
- Hosted project `uuwwnggimhvtvnislptd` (supabase.co). Two data purges are baked into the migration history itself (§14 #14, #21), so replaying migrations on a fresh DB yields an empty dataset with 3 seeded OTC brands as the only rows.

---

## 22. UNROUTED / DEAD CODE — FULL PAGE DOCUMENTATION

### 22.1 `src/pages/Dashboard.tsx` (447 lines) — the **legacy MR dashboard, fully built and completely unrouted**
Not previously covered above. This is a third dashboard implementation that no route or import references (App.tsx imports only `dashboards/DashboardRouter` and the three role dashboards; `pages/dashboards/index.ts` barrel re-exports those four and also never touches this file). It is the original single-role MR home screen, and it documents an entire alternate UX that still compiles:
- **Data**: query `["dashboard-stats", uid]` — first `await supabase.rpc("update_bill_statuses")` (this dead page is one of only two callers of that RPC besides PharmacyDetail), then fetches **all bills visible to the user** (no explicit scoping — RLS-scoped to the MR's pharmacies) and computes: `totalPending` = Σ(due−received) over non-paid; `totalReceived` = Σ received over all bills; pharmacy count; **Payments Due Today** (bills whose `remaining_due_date` equals today, count + amount); **Overdue** count (status overdue|critical); **Collection Rate** = round(received/(pending+received)×100); plus product stats (active products count, total stock, stock value = Σ qty×price).
- Second query `["pharmacies-dashboard", uid, searchQuery]`: pharmacies newest-first, joined to their bills client-side, roll-up worst-status per pharmacy (critical > overdue > due_soon > pending), **filtered to only pharmacies with outstanding > 0**, sorted by severity.
- **UI**: header with a `catalogueLive` Switch (pure local `useState(true)` — unlike MyProducts, this one persists nothing), **Quick Bill** button (mounts the real `QuickBillModal`) and **Add Pharmacy** button; 4 KPI cards (Total Pending, Due Today with amount, Overdue count, Collection Rate) + a "Reminders for Today" strip; pharmacy search box; outstanding-pharmacy cards each with status badge (note: `getPharmacyStatusBadge` fabricates synthetic due dates — now−8d for critical, now−3d for overdue, now+1d for due_soon — purely so StatusBadge renders plausible day counts), owner•phone line, ₹outstanding, and two per-card actions: "New Bill" → `/pharmacy/:id?action=new-bill` and "View" → `/pharmacy/:id`. Empty states: "No pharmacies found matching your search" / "You're managing N pharmacies with no outstanding payments." / first-run "Add your first pharmacy to start tracking payments".
- Every link on it targets routes that still exist, so if it were ever re-routed it would work — it's dead only because nothing renders it.

### 22.2 `AdvancedReports.tsx` (mounted in Analytics) — precise behaviour
Four selectable report-type tiles (Sales/Inventory/Customer/Financial with descriptions "Revenue and sales performance", "Stock levels and movements", "Customer insights and behavior", "P&L and cash flow"), a Time Period Select (today/week/month/quarter/year), and three buttons: **Generate Report** → calls the `onGenerateReport(type, period)` prop + toast "Generating report..." (Analytics passes a no-op-ish handler; nothing is generated), **PDF** / **Excel** → toast `Exporting as PDF/EXCEL...` only. 100% presentational; no data access at all.

### 22.3 `NotFound.tsx`
Renders on `*`: logs `console.error("404 Error: User attempted to access non-existent route:", pathname)` in an effect, centred "404 / Oops! Page not found" with an `<a href="/">Return to Home</a>` (full page reload, not SPA navigation). Uses raw Tailwind grays (bg-gray-100, text-blue-500) — the only page that ignores the design tokens. This is the page users actually land on for every dead link catalogued in §0.1.

### 22.4 `pages/dashboards/index.ts`
4-line barrel exporting DashboardRouter/SellerDashboard/PharmacyDashboard/AdminDashboard. App.tsx imports the files directly, not through the barrel — the barrel itself is unused.

### 22.5 Complete dead-code inventory (files that ship but never render)
`pages/Dashboard.tsx` (§22.1), `pages/Upgrade.tsx` (§5.7), `pages/admin/Subscriptions.tsx` (§4.3), `components/MobileNav.tsx` (§6.15), `pages/dashboards/index.ts`, `supabase/functions/initialize-otc-inventory` (deployed but never invoked), DB artifacts `product_sales_summary` view + `update_overdue_bills()` RPC + `store_settings` table + `bills.next_payment_date`/`payment_requests.paid_at`/`payment_requests.reminder_history`/`orders.tax_amount`/`orders.discount_amount`/`orders.seller_type`/`profiles.customer_count`/`profiles.max_customers_free_tier`/`profiles.stockist_license_url`(write side)/`support_tickets.assigned_to` columns, `zustand` and `@tailwindcss/typography` packages, ~15 unused shadcn ui components (§13.7), MyProducts' `canGoLive`, ProductForm's unused constant arrays, and the two Radix-toast pathways superseded by Sonner.

---

## 23. STATUS VOCABULARIES & DOMAIN GLOSSARY

### 23.1 Every status string in the system
| Domain | Values | Written by | Notes |
|---|---|---|---|
| bills.status | pending, due_soon, overdue, critical, paid (+ legacy CHECK also allows draft) | creation flows ('pending'), update_bill_statuses RPC, UpdateBillModal/Payments ('paid') | date-driven machine, §8.2; CHECK-constraint tension noted in §14 #4 |
| orders.status | pending (all creators), delivered? — never set by any code path | Checkout/OrderForm ('pending') | effectively frozen at 'pending'; read by SellerDashboard revenue + MySuppliers pendingPayment |
| orders.delivery_status | pending → confirmed → packed → shipped → delivered; cancelled | Orders detail dialog | the real fulfilment machine; StatusBadge renders confirmed/packed/shipped/delivered as "Unknown" (grey ?) since it only knows bill statuses |
| payment_requests.status | pending (PharmacyDetail), sent (Payments) | — | never transitions to paid; `paid_at` never written |
| payment_reminders.status | sent (only) | PharmacyDetail | delivered/failed values allowed by CHECK, never used |
| payment_reminders.reminder_type | initial, followup | PharmacyDetail | 'overdue' allowed by CHECK, never used |
| subscription_requests.status | pending, approved, rejected | Upgrade / admin Subscriptions | both pages unrouted |
| support_tickets.status | open, in_progress, resolved, closed | Support (open), SupportManagement select | resolved/closed stamp resolved_at |
| support_tickets.priority | low, medium, high, urgent | Support dialog | colour-coded badges |
| otc_shipments.status | pending, in_transit, delivered, cancelled (CHECK) | initialize-otc-inventory ('delivered' only) | |
| pharmacy_otc_subscriptions.status / payment_status | active / paid | OTCPartnership wizard | dummy payment |
| profiles.subscription_tier | free, premium | admin approve | badges only |
| Pharmacy roll-up (client-only) | up-to-date, pending, due_soon, overdue, critical | Pharmacies/Dashboard(dead) computed | not persisted |

### 23.2 Glossary of app-specific terms
- **CD (Cash Discount)** — the upfront-payment percentage on a bill; the BillForm section is literally titled "Cash Discount (CD) & Payment Terms".
- **Catalogue Live** — profile-level flag exposing a seller's products to pharmacy RLS reads; toggled in MyProducts.
- **Self-Added Pharmacies** — MR's manually created `pharmacies` contact records, vs **Platform Orders** from registered pharmacy users.
- **Seller-locked cart** — one seller per cart, enforced (only) in MarketplaceProducts.
- **Payment Request vs Reminder** — request = a row with a UPI link asking for money; reminder = the (logged) WhatsApp nudge about it.
- **Upfront/Remaining** — bill split at creation: received_amount seeded with upfront, due_amount stores the remainder (with the §2.9 double-count quirk).
- **Brand lock** — MR may only catalogue products whose brand_name equals their profile.business_type (client lock + DB trigger).
- **stockist_id** — historical column name meaning "the seller who owns this product/order" regardless of actual role (MRs and distributors are also `stockist_id`).

---

## 24. SECURITY MODEL — CONSOLIDATED VIEW (as implemented)

Layered as: (1) `ProtectedRoute` login wall for every non-`/auth` route; (2) `useRoleGuard` on 5 routes only (marketplace trio + my-products + my-suppliers); (3) RLS as the real data barrier (§15.3); (4) edge-function checks (JWT on 5/6; admin role on admin-wipe; admin password on assign-role); (5) DB trigger validations (admin password, MR brand). Consequences a reader should know:
- Any logged-in user can *render* `/admin/*` pages; they see empty tables/zero KPIs because admin SELECT policies fail for them, and mutations fail on RLS — UI-level exposure, data-level containment.
- Cross-role page access likewise renders empty shells (e.g. a pharmacy opening `/pharmacies` sees no rows).
- The pharmacy-visible seller-profile policy exposes **entire seller profile rows** to any pharmacy user — including `bank_account_number`, `bank_ifsc_code`, `upi_id`, phone and email (no column-level restriction).
- `autocomplete-product` is an unauthenticated, CORS-open LLM proxy (cost/abuse surface).
- Admin password `jit@ADMIN1` is shipped in client-side JS (Auth.tsx) — anyone reading the bundle can self-register as admin.
- Session security: localStorage tokens, autoRefresh, no inactivity timeout, no MFA (the Settings 2FA switch is inert).
- Storage: license INSERT policy allows any authenticated user to write anywhere in the `licenses` bucket (folder spoofing possible); reads stay folder-scoped.

---

## 25. DEVELOPER ORIENTATION — HOW THE PIECES FIT (reading map)

- **Start**: `src/App.tsx` (all routing + ProtectedRoute) → `contexts/AuthContext.tsx` → `pages/dashboards/DashboardRouter.tsx` (role dispatch) → `components/Layout.tsx` (chrome + role nav).
- **Seller money path**: `pages/PharmacyDetail.tsx` is the richest file (bill creation w/ payment request, credit check, realtime, reminders) → `lib/upi.ts` → `components/UpdateBillModal.tsx` → RPCs in migration `20251010150839`.
- **Marketplace path**: `MarketplaceProducts.tsx` (cart lock) → `Cart.tsx` → `Checkout.tsx` → `Orders.tsx` (fulfilment machine + stock decrement).
- **Catalogue path**: `ProductForm.tsx` (+`autocomplete-product` fn) / `OCRUploadModal.tsx` (+`ocr-product-label` fn) / `BulkUploadModal.tsx`; visibility via `MyProducts.tsx` toggles + products RLS.
- **Schema truth**: `src/integrations/supabase/types.ts` for current shapes; `supabase/migrations/` (§14) for constraints/RLS/triggers that types.ts can't show; remember two tables exist only server-side (OTC subscriptions/plans).
- **Things that look wired but aren't**: §12 + §22.5 lists; check there before assuming a button does something.
- Money is handled as JS floats end-to-end (`Number(...)` on NUMERIC columns, `Math.round` only on upfront); display via `toLocaleString("en-IN")`; no currency library, no server-side total validation (Checkout's total_amount is client-computed and trusted).
- The app is mobile-first: Layout's bottom nav is `md:hidden`-style mobile chrome, cards are single-column-friendly, and the PWA config targets installed-app usage; there is no desktop-specific navigation besides the header.

---

## 26. APPENDIX A — PAGE MATRIX (every page: access, wrapper, data in, writes out, navigation out)

Legend: Guard = client role guard; RLS is always additionally in force. Layout = wrapped in `<Layout>` chrome.

| Page (file) | Route | Guard | Layout | Reads (tables/RPC/fn) | Writes | Navigates to |
|---|---|---|---|---|---|---|
| Auth | /auth | public | no | profiles (username check) | auth.signUp/signIn/reset/OTP; storage licenses; profiles.update; fn assign-role | /dashboard |
| OnboardingSelectRole | /onboarding | login | no | — | fn assign-role | / |
| DashboardRouter | /, /dashboard | login | (delegates) | user_roles | — | /onboarding or role dashboard |
| SellerDashboard | via router | role via router | yes | bills+pharmacies, orders, pharmacies, products, seller_buyer_relationships, profiles | — (modals write) | /pharmacies, /products✗, /orders, /payments, /customers✗, /suppliers✗, /analytics |
| PharmacyDashboard | via router | — | yes | orders, seller_buyer_relationships, otc_inventory, profiles+user_roles (featured) | — | /marketplace, /orders, /suppliers✗, /seller/:id, /otc |
| AdminDashboard | /admin/dashboard, / | **none** | yes | user_roles, profiles, subscription_requests | fn admin-wipe | /admin/users, /admin/subscriptions✗, /admin/subscriptions/:id✗ |
| Pharmacies | /pharmacies | none | yes | pharmacies, bills, orders | — | /pharmacies/new, /pharmacy/:id |
| PharmacyForm | /pharmacies/new | none | yes | — | pharmacies.insert | /pharmacies |
| PharmacyDetail | /pharmacy/:id | none | yes | pharmacies, bills (+realtime), RPC get_next_bill_number / check_credit_limit / update_bill_statuses | bills.insert/update, payment_requests.insert, payment_reminders.insert | back, wa.me |
| BillForm | /bills/new | none | yes | pharmacies, bills (previous due), RPC get_next_bill_number | bills.insert | /bills✗ |
| Payments | /payments | none | yes | bills+pharmacies, payment_requests | payment_requests.insert, bills.update(paid) | — (modals) |
| Profile | /profile | none | yes | profiles, OTC subs/plans (as any) | profiles.update, auth.updateUser, fn delete-my-account, auth.signOut | /auth, /otc-partnership |
| Catalogue | /catalogue | none | yes | products+profiles | — (modals write products) | /marketplace/product/new |
| ProductForm | /marketplace/product/new, /:id | none | yes | products (edit), profiles (MR brand), fn autocomplete-product | products.insert/update, storage product-images | /marketplace ⚠️ (seller → guard bounce) |
| OrderForm | /marketplace/order/new | none | yes | pharmacies, products, RPC get_next_order_number | orders.insert, order_items.insert | /bills/new?order&pharmacy |
| Orders | /orders | none | yes | orders (seller-side), profiles, pharmacies, order_items+products | orders.update (delivery machine), products.update (stock@packed) | /pharmacies/:id✗, /bills/new, wa.me |
| MyProducts | /my-products | mr/stockist/distributor | yes | products, profiles | profiles.update(is_catalogue_live), products.update(is_available)/delete | /marketplace/product/new, /marketplace/product/edit/:id✗ |
| Marketplace | /marketplace | pharmacy | yes | profiles+user_roles, products (counts) | seller_buyer_relationships.upsert | /seller/:id, /marketplace/products |
| MarketplaceProducts | /marketplace/products | pharmacy | yes | products, profiles, cart_items | cart_items.upsert/update/delete | /cart |
| SellerDetail | /seller/:sellerId | pharmacy | yes | profiles, products | cart_items.upsert (no lock) | /cart |
| Cart | /cart | none | **no** | cart_items+products+profiles | cart_items.update/delete | /checkout, /marketplace |
| Checkout | /checkout | none | yes | cart_items, profiles, orders(count) | orders.insert, order_items.insert, cart_items.delete | /orders |
| MyCustomers | /my-customers | none | yes | seller_buyer_relationships+profiles, bills, orders | relationships.update(is_favorite) | /bills/new?pharmacy, /pharmacies/new, wa.me |
| MySuppliers | /my-suppliers | pharmacy | yes | orders+profiles | — | /seller/:id, /orders?seller (param ignored) |
| Analytics | /analytics | none | yes | orders, seller_buyer_relationships, order_items+products (global 100) | — | — |
| Reports | /reports | none | yes | orders / bills / products by type | — (CSV data-URI download) | — |
| Notifications | /notifications | none | yes | — (hardcoded []) | — | — |
| Support | /support | none | yes | support_tickets | support_tickets.insert | — |
| Settings | /settings | none | yes | profiles | profiles.update (General tab only) | — |
| OTCPartnership | /otc-partnership (+/otc redirect) | none | yes | pharmacy_otc_subscriptions, otc_subscription_plans, otc_brands (as any) | pharmacy_otc_subscriptions.insert | — |
| DeliveryPlanner | /delivery-planner | none | yes | pharmacies | — | google.com/maps/dir |
| UserManagement | /admin/users | none | yes | profiles+user_roles | profiles.update(is_verified); (unwired client-side admin.deleteUser) | — |
| SupportManagement | /admin/support | none | yes | support_tickets+profiles | support_tickets.update(status, resolved_at) | — |
| RoleAudit | /admin/role-audit | none | yes | profiles+user_roles | — (XLSX exports) | — |
| Subscriptions | **unrouted** | — | yes | subscription_requests+profiles | subscription_requests.update, profiles.update(premium) | — |
| Upgrade | **unrouted** | — | yes | — | storage licenses (payment-proofs), subscription_requests.insert | /dashboard |
| Dashboard (legacy) | **unrouted** | — | yes | RPC update_bill_statuses, bills, pharmacies, products | — (QuickBill modal writes) | /pharmacy/:id(?action=new-bill), /pharmacies/new |
| NotFound | * | — | no | — | — | href "/" |

✗ = dead link (§0.1).

## 27. APPENDIX B — MODAL/COMPONENT PROP CONTRACTS
- `QuickBillModal {open, onClose}` — self-contained (queries + writes internally); navigates `/pharmacy/:id` on success.
- `QuickOrderModal {open, onClose}` — self-contained; success panel offers Download .txt / WhatsApp / Copy UPI link.
- `OCRUploadModal {open, onClose, onSuccess?}` — posts to edge fn; parent invalidates product queries via onSuccess.
- `BulkUploadModal {open, onClose, onSuccess?}` — SellerDashboard passes `window.location.reload`.
- `UpdateBillModal {open, onClose, bill{id,total,received}, onUpdate(billId, newReceived, markAsPaid)}` — pure UI; mutation lives in PharmacyDetail.
- `PaymentProcessModal {open, onClose, isProcessing, paymentDetails{amount, pharmacyName, bankDetails?=Kotak default, payments?[]}}` — display only.
- `ProductDetailModal {product, open, onClose}` — read-only + Edit navigation.
- `PharmacyCard {pharmacy: {…, totalDue, pendingPayments, lastOrderDate, status}}` — click → `/pharmacy/:id`.
- `StatusBadge {status, dueDate?}` — day-count aware for bill statuses (§6.9).
- `ActivityFeed {}` — reads own data by `useAuth()` user.
- `InventoryAlerts {alerts[]}` / `LocationSelector {locations, onAdd, onRemove}` / `WhatsAppButton {phone, message}` / `OTCPlanCard {plan, isPopular?, onChoose}` — presentational.
- `Layout {children}` / `MobileNav` (unmounted) — chrome.

*End of documentation. Sections 0–12 = original review (preserved verbatim, with corrections noted in place); 13–27 = expansion derived from full-source read on 2026-07: all 26 migrations, all 6 edge functions, all 35 pages/19 feature components, types.ts, and build config.*

---

*Documentation audit pass appended below — code-derived additions only; prior content preserved.*

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
