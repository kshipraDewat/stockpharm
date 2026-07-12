> **Extracted from** [`UNIFIED_FEATURES.md`](../UNIFIED_FEATURES.md) Appendix C (MED).
> **Source repo:** `greetings-pal-git / MedOrder (MED)`
> Use [`EXHAUSTIVE_REVIEW_PROMPT.md`](../EXHAUSTIVE_REVIEW_PROMPT.md) to re-run or extend this review.

# MedOrder (`greetings-pal-git`) — Exhaustive Functional Review

> **App folder:** `/Users/kshipradewat/Desktop/stockpharma/greetings-pal-git`
> **In-product names (INCONSISTENT — see §0.3):** PWA manifest = "MedOrder - Medicine Marketplace"; landing hero = "Medicine Ordering Marketplace"; top header (`Header.tsx`) = **"MediConnect"**.
> **Type:** Two-sided B2B pharma ordering marketplace (Stockist ↔ Pharmacy), installable PWA.
> **Stack:** Vite + React 18 + TS · shadcn/ui (Radix) + Tailwind · React Router v6 · TanStack Query (present but barely used) · Zod (auth + edge validation) · Supabase (Auth, Postgres, Storage, Edge Functions) · Lovable AI Gateway (Gemini 2.5 Flash) · papaparse/xlsx · Recharts · vite-plugin-pwa.

This document is derived by reading every file under `src/pages/**`, `src/components/**`, `src/hooks/**`, `src/lib/**`, `src/integrations/**`, all six `supabase/functions/*`, `supabase/config.toml`, and all 15 `supabase/migrations/*`. It goes materially deeper than the repo's `FEATURES.md`, and corrects/extends several of its claims (flagged inline as **[Δ vs FEATURES.md]**).

---

## Table of Contents
0. Platform Overview, Roles, Global Conventions
1. Authentication & Registration Module
2. Layout / Navigation Shell
3. Stockist Module (dashboard, products, add/edit, bulk-upload, custom-pricing, orders, order-detail, payments, payment-detail, delivery/dates/areas/fees, profile)
4. Pharmacy Module (dashboard, stockists, catalogue, stockist-catalogue, smart-order, cart, checkout, orders, order-detail, profile)
5. Smart Order engine (deep dive: parse + recommend, all 3 strategies)
6. Bulk-Upload / OCR engine (deep dive)
7. Money, GST, Payment, Stock, Delivery-Fee logic
8. AI & Edge Functions (endpoints, I/O, auth)
9. Data Model, RPCs, RLS, Storage
10. Edge Cases, Bugs, Stubs & Hardcoded Values (consolidated)

---

## 0. Platform Overview, Roles, Global Conventions

### 0.1 Roles (`app_role` enum = `admin | stockist | pharmacy`)
| Role | Enum | Landing | Reachable routes | Notes |
|---|---|---|---|---|
| Stockist | `stockist` | `/stockist` | all `/stockist/*` | Full seller surface. |
| Pharmacy | `pharmacy` | `/pharmacy` | all `/pharmacy/*` | Full buyer surface + Smart Order. |
| Admin | `admin` | — | **none** | Exists in enum + RLS policies (`Admins can manage …`) but **zero routes/screens/guards**. Fully dormant. |

- `useAuth.fetchUserRole` fetches the single `user_roles.role` with `.single()` → a user effectively has exactly one role.
- Role resolution has a **5-second timeout** guard that forces `userRole=null, loading=false` if the query hangs.
- Every page independently re-resolves its `stockists.id` / `pharmacies.id` from `user.id` (via `useStockistId`/`usePharmacyId` hooks, or inline `.select('id').eq('user_id', user.id).single()`).

### 0.2 Complete route map (`src/App.tsx`)
Public / unguarded:
- `/` → **Register** (NOT the marketing `Index.tsx` — Index is imported but **never routed**; it is dead code). **[Δ vs FEATURES.md, which implies `/` is Register — correct — but note Index.tsx is orphaned.]**
- `/auth/register` → Register
- `/auth/login` → Login
- `/install` → Install (PWA helper)
- `*` → NotFound (logs `console.error` with attempted path)

Stockist (guarded `allowedRoles={['stockist']}`):
`/stockist`, `/stockist/products`, `/stockist/products/add`, `/stockist/products/edit/:id`, `/stockist/products/bulk-upload`, `/stockist/products/bulk-upload/custom-pricing`, `/stockist/delivery-dates`, `/stockist/orders`, `/stockist/orders/:id`, `/stockist/payments`, `/stockist/payments/:id`, `/stockist/profile`.

Pharmacy (guarded `allowedRoles={['pharmacy']}`):
`/pharmacy`, `/pharmacy/profile`, `/pharmacy/catalogue`, `/pharmacy/cart`, `/pharmacy/checkout`, `/pharmacy/orders`, `/pharmacy/orders/:id`, `/pharmacy/smart-order`, `/pharmacy/stockists`, `/pharmacy/stockists/:id`.

`ProtectedRoute` behavior: spinner while `loading`; a **15s** timeout renders "Authentication is taking too long" + Retry (`window.location.reload()`); no `user` → `/auth/login`; `user` but no role → "account setup is incomplete" screen linking to `/auth/register`; wrong role → redirect to `/`.

### 0.3 Branding inconsistency (three names)
- Header link text: **"MediConnect"** (`Header.tsx` line 24).
- `index.html`/PWA manifest: **"MedOrder"**.
- Register/Index hero: **"Medicine Ordering Marketplace"** / "Create Account".
These are not reconciled anywhere.

### 0.4 Cross-cutting conventions
- **Currency:** `₹` + `.toFixed(2)` everywhere; no thousands grouping.
- **Pagination:** manual, **20/page**, `count:'exact'`, `.range(from,to)`, `created_at` desc. Products/Orders/Payments paginate; Stockists/Catalogue/StockistCatalogue load **all** rows (no pagination).
- **Search/filter:** client-side on the currently loaded page only (so search misses rows on other pages).
- **IDs:** UUID; tables truncate to `id.slice(0,8)+"..."`.
- **No realtime** channels anywhere; data refetched on mount/after mutation.
- **State:** Cart in React Context + `localStorage['cart']`; auth session in `localStorage`. TanStack Query wraps the app but pages fetch directly with `useState/useEffect`.
- **Dates:** `date-fns` `format`.

---

## 1. Authentication & Registration Module

### 1.1 Register (`/`, `/auth/register` — `pages/auth/Register.tsx`)
**Content:** Card titled "Create Account" / "Register as a Stockist or Pharmacy", Pill icon. Two tabs: **Pharmacy** (default) and **Stockist**. Footer link "Already have an account? Sign in" → `/auth/login`.

**Forms — both tabs identical fields**, two Zod schemas (`pharmacySchema`, `stockistSchema`, byte-for-byte identical):
| Field | Type | Required | Validation | Default |
|---|---|---|---|---|
| Name (Pharmacy/Stockist Name) | text | yes (`required` + Zod) | 2–100 chars | "" |
| Drug License | text | yes | min 1 char | "" |
| City | text | no | optional | "" |
| State | text | no | optional | "" |
| Email | email | yes | valid email, ≤255 | "" |
| Password | password | yes | **Zod min 8**, but input `minLength={6}` (looser HTML hint) | "" |

**Submit flow (`handleSubmit`):**
1. `schema.parse(formData)` (ZodError → toast first message).
2. `supabase.auth.signUp({ email, password, options.emailRedirectTo = origin + "/" })`.
3. If no `authData.user` → throw "User creation failed".
4. Insert `user_roles {user_id, role}` (`pharmacy`/`stockist`). On error → `signOut()` + throw.
5. Insert profile row into `pharmacies`/`stockists` `{user_id, name, drug_license, city, state}`. On error → **delete the `user_roles` row** + `signOut()` + throw (compensating cleanup).
6. Success toast, `setTimeout(navigate('/pharmacy'|'/stockist'), 1000)`.

**Edge case:** if Supabase email confirmation is enabled, `signUp` returns no active session → the RLS-guarded inserts in steps 4/5 (`WITH CHECK auth.uid() = user_id`) will **fail** (unauthenticated). Registration therefore silently depends on auto-confirm being on. GST/address_line/pincode are NOT collected at registration (only editable later in Profile).

### 1.2 Login (`/auth/login` — `pages/auth/Login.tsx`)
**Content:** "Welcome Back" card, Email + Password inputs (both `required`), "Sign In" button, "Forgot password?" button, "Register here" link.
**Flow:** `signInWithPassword` → on success re-fetch `user_roles` (`.single()`); if no role → toast "Account setup incomplete", `signOut`, navigate `/auth/register`. Otherwise toast success; a `useEffect` on `userRole` routes to `/stockist` or `/pharmacy` (else `/`).
**Forgot-password DIALOG (`AlertDialog`):** single "Email" input; `resetPasswordForEmail(resetEmail, { redirectTo: origin + '/auth/login' })`; empty email → toast error; success toast + close.
**Note:** the routing `useEffect` depends on component-local `loading` (always false here) rather than `authLoading` — works but slightly off.

### 1.3 Install (`/install` — `pages/Install.tsx`)
Detects iOS (UA regex), standalone display-mode (already installed), and `beforeinstallprompt`. States: **already installed** (green panel), **installable + non-iOS** (native Install button → `deferredPrompt.prompt()`), **iOS** (3-step Share→Add-to-Home instructions), **fallback Android** (3-step menu instructions). Static "Benefits of Installing" list. Not linked from any nav — reachable only by URL.

### 1.4 Index (`pages/Index.tsx`) — ORPHANED
Marketing hero + two role cards (both buttons → `/auth/register`) + "Sign in here". **Not wired into the router** (`/` renders Register). Dead code.

### 1.5 NotFound
"404 / Oops! Page not found" + "Return to Home" (`<a href="/">`). Logs the bad path.

---

## 2. Layout / Navigation Shell

- **`AppLayout`:** if logged-out → renders children bare (no chrome). If logged-in → `Header` + `<main class="pb-20 md:pb-0">` + `BottomNav`.
- **`Header`:** sticky top bar. Left = "MediConnect" link → role home. Right = user dropdown (`User` icon) → "My Profile" (role-based path) + "Logout" (`signOut`). Returns `null` if no user.
- **`BottomNav`:** mobile-only (`md:hidden`), fixed bottom. Hidden if no user.
  - Stockist tabs: Home `/stockist`, Products `/stockist/products`, Orders `/stockist/orders`, Payments `/stockist/payments`, Profile `/stockist/profile`.
  - Pharmacy tabs: Home `/pharmacy`, Stockists `/pharmacy/stockists`, Products `/pharmacy/catalogue`, Orders `/pharmacy/orders`, Cart `/pharmacy/cart`, Profile `/pharmacy/profile`.
  - Active tab highlighted by exact `location.pathname` equality.
- **`NavLink`:** thin compat wrapper around RouterNavLink (activeClassName/pendingClassName). Not actually used by BottomNav.
- **`LocationInput`:** a reusable "type a city → mock lat/lon" field with a **hardcoded 10-city map** (Mumbai…Lucknow) and **Delhi as default fallback**. **It is imported by no page** — dead/stub component; the real profiles never capture lat/lon through it. Distance-based delivery fees therefore have no UI to populate coordinates.

---

## 3. Stockist Module

### 3.1 Dashboard (`/stockist` — `StockistDashboard.tsx`)
**KPI cards (all live):**
- **Total Products** = `count(stockist_products where stockist_id)`; sub-line "N active" = `count(... is_active=true)`.
- **Total Orders** = `count(orders where stockist_id)` (all-time).
- **Revenue (This Month)** = `Σ orders.total_amount where created_at >= startOfMonth` (1st of month, 00:00 local, `.toISOString()`).
- **Delivery Dates** — navigation card → `/stockist/delivery-dates` (static "Schedule" text).
**Sections (conditional, only render if non-empty):**
- **⚠️ Low Stock Alert** (amber): products with `min_stock_alert > 0` AND `stock_quantity <= min_stock_alert`, filtered client-side, top 5. Row = name + "N left (min: M)".
- **🗓️ Expiring Soon** (red): `expiry_date` between now and +30 days, asc, limit 5. Row = name + "Expires: <localeDate>".
**Quick Actions:** Manage Products, Set Delivery Dates. Header has a **Sign Out** button (duplicated with header dropdown logout).

### 3.2 Products (`/stockist/products` — `Products.tsx`)
**Content:** header with **Bulk Upload** + **Add Product** buttons (Add disabled until `stockistId` resolves). Filter bar: search (matches `product_name` OR `brand`), **Brand** select, **Category** select (both populated from distinct values on the *current page only*). **Saved Drafts** section (from `bulk_upload_drafts`, all rows, newest first) rendered as `DraftCard`s (only shown if any). Product grid (3-col) of `ProductCard`s. Empty state: "No products found. Add your first product to get started." Pagination controls (Prev/Next, "Page X of Y") when >1 page.
**Actions:**
- Edit → `/stockist/products/edit/:id`.
- Delete → opens `AlertDialog` ("cannot be undone") → hard `DELETE` from `stockist_products`, toast, refetch.
- Toggle Active → `Switch` flips `is_active`, toast "activated/deactivated", refetch.
- Inline stock edit (in `ProductCard`) → refetch on save.
- Draft Resume → `/stockist/products/bulk-upload?draft=<id>`. Draft Delete → `DELETE bulk_upload_drafts`, toast, refetch.

**`ProductCard` (stockist) content:** name, brand, category badge; Switch (active); grid of MRP / Sale Price / **inline-editable Stock** (click value → number input + Save/Cancel; Save updates `stock_quantity`, toast, `onStockUpdate()`); MOQ; optional Pack/Strength/Batch/Expiry; Edit + Delete buttons.
**`ProductTable`** exists (full columns: Name, Brand, Category, Pack Size, MRP, Sale Price, Stock, Active switch, Edit/Delete w/ AlertDialog) but **is not used by any page** (Products uses the card grid). Dead component.

### 3.3 Add Product (`/stockist/products/add` — `AddProduct.tsx`)
7 sectioned cards. Fields + defaults:
| # | Field | Type | Default | Required |
|---|---|---|---|---|
| 1 | Product Name | text + **"Fetch with AI"** (Sparkles) | "" | yes (save-guard) |
| 2 | Generic Name / Salt | text | "" | no |
| 2 | Brand | text | "" | no |
| 3 | Manufacturer | text | "" | no |
| 3 | Product Type | **Select**: Tablet, Capsule, Syrup, Injection, Cream, Drops (Capitalized values) | "" | no |
| 4 | Category | text | "" | no |
| 4 | Pack Size | text (ph "10 tablets") | "" | no |
| 4 | Strength | text (ph "500mg") | "" | no |
| 5 | MRP | number step .01 | "" | no |
| 5 | Purchase Price | number | "" | no |
| 5 | Sale Price | number | "" | **yes** |
| 6 | Stock Quantity | number | "" → 0 | no |
| 6 | Min Stock Alert | number | "" → 0 | no |
| 6 | MOQ | number | "" → **1** | no |
| 6 | GST % | number | **"18"** | no → 18 |
| 7 | Description | textarea (4 rows) | "" | no |

**Save-guard:** name + sale_price required, `stockistId` required. Insert into `stockist_products` (numeric coercions: mrp/purchase → `parseFloat` or null; sale → `parseFloat`; stock/min → `parseInt` or 0; moq → `parseInt` or 1; gst → `parseFloat` or 18). Then toast + navigate to products list. Cancel button too.
**"Fetch with AI":** requires non-empty name; calls `product-ai-fetch` with body `{ productName }` and reads `data.success && data.product`. **BUG:** the function returns `{ product_info: {...} }` (no `success`/`product` keys) **and** the client sends `productName` while the function validates `product_name`. So this autofill **never populates and effectively no-ops** (silently). **[Δ vs FEATURES.md which flags shape mismatch — additionally the request key is wrong here.]**

### 3.4 Edit Product (`/stockist/products/edit/:id` — `EditProduct.tsx`)
Same 7 sections, pre-filled via `select * where id=:id AND stockist_id`. Product Type Select here uses **lowercase** values (`tablet, capsule, syrup, injection, cream, drops, other`) — **inconsistent with AddProduct's Capitalized values** (so a product saved as "Tablet" won't match this Select's option, showing blank). Update writes all fields (`|| null` for optional; sale `parseFloat`; stock/min parseInt-or-0; moq parseInt-or-1; **gst parseFloat-or-0** — note default differs from Add's 18).
**"Fetch with AI":** here sends body `{ product_name }` (correct key) and reads flat `data.generic_name/manufacturer/brand/category/pack_size/strength`. **BUG:** function returns `{ product_info: {...} }`, so all reads are `undefined` → falls back to previous values → still a no-op autofill. (Also reads `data.brand`/`pack_size`/`strength` which `product-ai-fetch` doesn't even return.)

### 3.5 Bulk Upload (`/stockist/products/bulk-upload` — `BulkUpload.tsx`)
See §6 for the full engine. Header (back), 3 tabs (**Purchase Bill / Sale Bill / Full Catalogue**), dashed drop-zone + "Select File" + (catalogue only) **Download Template**, selected-file panel + "Parse & Preview", staged Progress bar, preview (Apply Global Margin, Custom Pricing, `BulkUploadPreview` table, Save as Draft, Confirm Upload N Products). Loads a `?draft=<id>` on mount; loads `stockists.default_margin_percent` (fallback 20).

### 3.6 Custom Pricing (`/stockist/products/bulk-upload/custom-pricing` — `CustomPricing.tsx`)
Receives `items`+`mode` via **router `location.state`**. Editable table columns: **Product Name, Purchase Rate, Quantity, Sale Rate (input), Margin % (input), Profit, GST, Net Profit**, with a totals footer (Profit/GST/Net) and a 3-tile Profit Summary (Gross / GST / Net). Two-way binding:
- Editing **Sale Rate** → `margin% = (sale-purchase)/purchase*100`; `profit=(sale-purchase)*qty`; `gst=profit*gst%/100`; `net=profit-gst`.
- Editing **Margin %** → `sale=purchase*(1+margin/100)`; same profit/gst/net.
Rows with no `purchase_price` are skipped (edits ignored).
"Save & Continue" navigates back to `/stockist/products/bulk-upload` with `state:{items,mode}` + toast.
**BUG:** `BulkUpload` only reads `?draft=` search param and never reads `location.state`, so **custom-pricing edits are lost** on return (the preview is not repopulated). **[Not in FEATURES.md]**

### 3.7 Orders (`/stockist/orders` — `Orders.tsx`)
Paginated (20) `orders` + `pharmacies:pharmacy_id(name)`, desc. Search across order id / pharmacy name / status / amount (client-side, current page). **Empty state:** "No orders yet". Table columns: **Order ID (8-char), Pharmacy, Amount ₹, Delivery Date, Status (badge), Created, Actions (View Details)** → `/stockist/orders/:id`.
Status badge map: `paid`→secondary; `accepted/packed/out_for_delivery/delivered`→default; underscores→spaces.

### 3.8 Order Detail (`/stockist/orders/:id` — `OrderDetail.tsx`) — **stockist can advance status**
**[Δ vs FEATURES.md, which did not mention the stockist status-update control.]**
- Loads order (+ pharmacy name/address) and `order_items`.
- **Order Information** card: ID (full), Pharmacy, Total Amount, Delivery Date, Created.
- **Order Status** card: a 5-node **stepper** (`paid → accepted → packed → out_for_delivery → delivered`), completed nodes filled + check icons. A **Select** to change status, whose options are `statusFlow.slice(currentIndex)` (can only move forward / stay). `disabled` when `updating` or already `delivered`. On change → `UPDATE orders.status`, toast, refetch. When delivered, shows "Order Complete" badge.
- **Order Items** card: per-item name, "Qty × ₹price", optional "GST X%: ₹amount", line_total. Footer: **Subtotal = Σ line_total**, **Total GST = Σ gst_amount**, **Grand Total = order.total_amount**.

### 3.9 Payments (`/stockist/payments` — `Payments.tsx`)
Paginated (20) `payments` joined `orders!inner(id, stockist_id, pharmacies:pharmacy_id(name))`, filtered `orders.stockist_id = me`, desc. Loading skeletons. **Empty state:** "No payments yet". Table: **Payment ID (8), Order ID (8), Pharmacy, Amount, Status (badge: paid→default else secondary), Mode (e.g. mock), Date**. Whole row clickable → `/stockist/payments/:id`.

### 3.10 Payment Detail (`/stockist/payments/:id` — `PaymentDetail.tsx`)
Two cards: **Payment Information** (ID 8-char, Amount, Status badge, Mode `capitalize`, Payment Date, and conditionally Gateway Payment ID / Gateway Order ID) and **Associated Order** (Order ID 8, Pharmacy, Order Amount, Order Status badge, Order Date, "View Order Details" → `/stockist/orders/:id`).

### 3.11 Delivery & Dates (`/stockist/delivery-dates` — `DeliveryAndDates.tsx`)
Three tabs (default "dates"):
- **Delivery Dates:** multi-select `Calendar` (`mode="multiple"`, `disabled = date < new Date()` — note this compares to *now* incl. time, so today is effectively disabled). Selected-dates chip list with count. **Save** = set **all** existing rows `is_active=false`, then insert selected dates as `{delivery_date: yyyy-MM-dd, is_active:true}`; toast; then `fetchDeliveryDates()`.
  - **BUG:** `fetchDeliveryDates()` is **never called on mount** (no `useEffect`), so opening the page shows an **empty calendar even if dates exist**; existing dates only load *after* a save. Also, deactivating (not deleting) rows means dead `is_active=false` rows accumulate. **[Not in FEATURES.md]**
- **Serviceable Areas** → `ServiceableAreasManager`.
- **Delivery Fees** → `DeliveryRulesConfig`.

**`ServiceableAreasManager`:** Add form — Pincode (text, `maxLength=6`, required) + Area Name (text, optional). Insert `stockist_serviceable_areas {pincode, area_name|null, is_active:true}`; duplicate (Postgres `23505`) → "This pincode is already added". List = active areas as removable `Badge`s (X → soft-delete `is_active=false`). Count shown. Empty state text.

**`DeliveryRulesConfig`:** 5 checkbox-gated rule cards, each revealing inputs when checked:
| Rule | Inputs | Persisted `rule_type` |
|---|---|---|
| Free Delivery on Profit | Min Profit Amount (₹) | `profit_amount` (`min_profit_amount`) |
| Free Delivery on Order Amount | Min Order Amount (₹) | `order_amount` (`min_order_amount`) |
| Free Delivery on Scheduled Dates | (toggle only) | `delivery_date` (`free_on_delivery_date=true`) |
| Distance-Based Charges | Base Distance (km) + Charge per KM (₹) | `distance` (`base_distance_km`,`per_km_charge`) |
| Flat Delivery Fee | Flat Fee (₹) | `flat_fee` (`flat_fee`) |
Loads existing active rules into toggles/inputs. **Save** = `DELETE all rules for stockist` then insert enabled rules with **priority in fixed order 1..5** (Profit→Order→Date→Distance→Flat). Footer explains "First matching rule wins." Empty save = toast "All delivery rules cleared". **These rules currently affect nothing** — see §7.5.

### 3.12 Stockist Profile (`/stockist/profile` — `Profile.tsx`)
Edits `stockists` row. Fields: Business Name*, Drug License*, GST Number, Address Line 1, Address Line 2, City, State, Pincode (all plain text; `*` are visual only — **no validation enforced**, empty saves allowed). Save = `UPDATE stockists` by id, toast. `default_margin_percent`, `dispatch_latitude/longitude`, `dispatch_place_name`, `kyc_status` exist in schema but are **not editable here**.

---

## 4. Pharmacy Module

Global cart via `useCart`/`CartProvider` (localStorage `cart`). CartItem = `{productId, stockistId, productName, stockistName, price, quantity, deliveryDate?}`.

### 4.1 Dashboard (`/pharmacy` — `PharmacyDashboard.tsx`)
**KPIs:** Total Orders (`count`), Pending Deliveries (`count orders where status != 'delivered'`), Spent (This Month) (`Σ total_amount, created_at>=startOfMonth`), **Cart** card (live `getItemCount()`, badge if >0) → `/pharmacy/cart`. **Smart Order** promo card → `/pharmacy/smart-order`. Quick Actions: Browse Products (`/pharmacy/catalogue`), Smart Order. Sign Out button.

### 4.2 Browse Stockists (`/pharmacy/stockists` — `Stockists.tsx`)
Loads all `stockists` ordered by name; for **each** stockist runs 2 extra queries (active product count + earliest active future delivery date) → N+1 query pattern. Search by name or city (client-side). `StockistCard` grid. Empty state. **`StockistCard`:** Building icon, name, city (MapPin), Products count badge, Next Delivery date (if any), "View Catalogue" button; whole card → `/pharmacy/stockists/:id`.

### 4.3 Stockist Catalogue (`/pharmacy/stockists/:id` — `StockistCatalogue.tsx`)
- Loads the stockist, its **active** products (asc by name), and earliest active future delivery date (applied to every product as `nextDeliveryDate`).
- **Embedded "Smart Order — Paste your list" card:** textarea + "Analyze Order". `handleSmartOrder` resolves pharmacy id, calls `smart-order-parse {rawText, pharmacyId}`, then locally matches parsed names against *this stockist's* loaded products (substring both directions). Shows found count toast; lists **not-found** items in a destructive panel. **Dead code:** it also queries `alternatives` (other stockists' products) but never uses the result. This path **does not add anything to cart** and **does not call `smart-order-recommend`** (unlike the dedicated Smart Order page).
- **Product list:** per product — name, brand, badges (Pack/Batch/Exp/Delivery), price, "Stock: N", a `QuantitySelector`, "Add to Cart".
- **`handleAddToCart`:** qty defaults to `quantities[id] || moq || 1`; passes `stockQuantity`+`moq`+`deliveryDate` → full `useCart` validation applies here.

### 4.4 Catalogue (`/pharmacy/catalogue` — `Catalogue.tsx`)
Own sticky sub-header ("Catalogue" + Cart button w/ count badge). Tabs **Products / Stockists**.
- **Products tab:** loads all active products + `stockists:stockist_id(id,name)`, then per-product earliest delivery date (N+1). Search matches name/brand/generic/stockist name; Category select filter. Products **grouped by lowercased product_name** into a `ProductCard` (pharmacy variant) that shows one row per stockist "variant" (stockist name, batch/exp/delivery/stock badges, price, strikethrough MRP, QuantitySelector, Add to Cart / "Out of Stock" when stock 0). Empty state per tab.
- **Stockists tab:** same `StockistCard` grid as §4.2 (its own N+1 fetch).
- **`handleAddToCart(variant, qty)`** passes stockQuantity(=variant.stock)+moq → validated.

**`QuantitySelector`:** local qty state init `moq||1`; +/- buttons clamped to `[moq, maxStock]`; number input clamps on change; MOQ badge shown when moq>1. `onChange` reports clamped qty upward.

### 4.5 Cart (`/pharmacy/cart` — `Cart.tsx`)
- Empty state → "Your cart is empty" + Browse Products.
- Groups items by stockist (`getItemsByStockist`). Each group card: stockist name + delivery date (from first item); each line = name, "₹price each", **qty number input (min 1)**, remove (trash) button, line subtotal.
- Qty input `onChange` → `updateQuantity(productId, stockistId, parseInt||1)`. `updateQuantity` is **async and re-fetches** `stock_quantity, moq` to validate (moq/stock toasts); callers **don't await** it (fire-and-forget → toast may lag). `quantity<=0` removes the line.
- **Order Summary (sticky):** Items (count = number of distinct lines, not units) with total; "Orders will be created" = number of stockist groups; **Total = Σ price*qty (PRE-GST)**; note "…split into N separate orders" if >1 group. "Proceed to Checkout" → `/pharmacy/checkout`. "Clear Cart" (AlertDialog confirm) → `clearCart()`.

**`useCart.addToCart` validation (return boolean):** reject if `stockQuantity<=0` ("out of stock"); reject if merged `newQuantity < moq`; reject if `newQuantity > stockQuantity`; merges qty for existing product+stockist pair; toasts success/failure. **`getTotalAmount` = Σ price*qty (pre-GST).** `getItemCount` = Σ qty.

### 4.6 Checkout (`/pharmacy/checkout` — `Checkout.tsx`)
- On mount fetches `stockist_products(id, gst_percent)` for cart items → `productGstMap` (used for display).
- **Order Summary card:** per stockist group — line items, **Subtotal = Σ price*qty**, **GST = Σ price*qty*gst%/100**, **Total = subtotal+gst**. **No delivery fee line.**
- **Payment card:** grand Total Amount (recomputed = Σ (subtotal+gst) across groups). "Mock Payment Mode — no real transaction" notice. Success/Failure panels. "Pay Now" (disabled while processing or after a result). If >1 group: "N separate orders will be created".
- **`handlePayment` flow:**
  1. Resolve pharmacy id (missing → toast, abort).
  2. **Pre-payment stock re-check:** fetch current `stock_quantity`; if any line `available < quantity` → toast "Insufficient stock for: <name>", abort.
  3. `await sleep(2000)`; `success = Math.random() > 0.05` (~**95%**). Fail → red panel, toast, abort.
  4. Build a fresh `productGstMap` from re-fetched products.
  5. **`Promise.all` over stockist groups** — per group: insert `orders` (`status:'paid'`, `payment_status:'paid'`, `total_amount = subtotal+gst`, `delivery_date = firstItem.deliveryDate`, `payment_reference: 'MOCK-<ts>-<rand9>'`); insert `order_items[]` (snapshots `product_name_snapshot`, `price_snapshot`, `quantity`, `line_total = price*qty`, `gst_percent`, `gst_amount = line_total*gst%/100`); insert `payments` (`amount=orderTotal`, `status:'paid'`, `mode:'mock'`, `gateway_payment_id:'MOCK-PAY-<ts>'`); then per item `rpc deduct_stock(product_id, quantity_to_deduct)`.
  6. **Manual rollback ladder** (no real DB transaction): items-fail → delete order; payment-fail → delete items+order; stock-fail → delete payments+items+order, throw.
  7. Success → toast "created N order(s)", `clearCart()`, `setTimeout(navigate('/pharmacy/orders'), 2000)`.

### 4.7 Orders (`/pharmacy/orders` — `Orders.tsx`)
Paginated (20) `orders` + `stockists:stockist_id(name)`, desc. Search across id/stockist/status/amount. Loading skeletons; empty state ("No orders yet" + Start Shopping). Table: Order ID (8), Stockist, Amount, Delivery Date, Status badge, Created, View Details → `/pharmacy/orders/:id`. Same status-badge map as stockist.

### 4.8 Order Detail (`/pharmacy/orders/:id` — `OrderDetail.tsx`)
- Loads order (+ stockist name/address) and `order_items`.
- **"Mark as Received" button** shown only when `status === 'out_for_delivery'` → `UPDATE orders.status='delivered'`, toast, refetch. (Allowed by RLS "Pharmacies can update own orders".)
- **Order Information:** ID, Stockist, Total, Delivery Date, Created, **Payment Status badge**.
- **Order Status:** read-only 5-node stepper + current-status badge (pharmacy cannot pick arbitrary status; only the "Mark as Received" shortcut).
- **Order Items:** same layout + Subtotal/Total GST/Grand Total footer as stockist detail.

### 4.9 Pharmacy Profile (`/pharmacy/profile` — `Profile.tsx`)
Identical structure/fields to stockist profile but writes `pharmacies` (Name*, Drug License*, GST, Address 1/2, City, State, Pincode). `latitude/longitude/google_place_name` exist in schema but are **not editable here** (so pharmacy geolocation for distance fees can never be set via UI).

---

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

## 6. Bulk-Upload / OCR Engine (deep dive)

**Modes (tabs):** `purchase | sale | catalogue`. File intake: catalogue accepts `.xlsx/.xls/.csv`; purchase/sale accept those **plus** `.jpg/.jpeg/.png/.pdf`. **Max 10 MB** (else toast). Invalid ext → toast.

### 6.1 Spreadsheet path (`processExcelFile`)
- CSV: `file.text()`, split lines, `split(',')` (naive — breaks on quoted commas), first line lowercased headers.
- Excel: dynamic `import('xlsx')`, first sheet, `sheet_to_json({header:1})`, lowercased headers.
- Column aliases: `stock quantity`/`quantity`; `purchase price`; `sale price`; `mrp` (default `salePrice*1.1`); `gst %`/`gst` (default 18); `brand`; `category`; `type`→product_type; `manufacturer`; `generic name`/`salt`; `pack size`; `strength`; `moq` (default 1). Row kept only if `product name` present AND `quantity>0`.
- Matches each item against existing products by **case-insensitive exact name** → status `found` (+ `existingProductId`, `isNew:false`) else `new`.
- Progress: 20 → 50 (parsing) → 80 (validating) → 100. Empty file / no valid rows → thrown errors surfaced as toast.

### 6.2 Image/PDF path (`processImageOrPdfFile`)
- Uploads to Storage bucket **`bills`** at `${stockistId}/${Date.now()}_${file.name}` (progress 15). Creates **signed URL (900s)** (progress 40). Calls **`extract-bill-items {imageUrl, mode}`** (progress 70).
- Matches extracted item names to existing products by **substring (either direction)** (progress 100):
  - **found:** use existing product's name/sale_price/gst; qty & purchase price from bill.
  - **purchase + not found:** call **`fetch-product-info {product_name}`**; new item with `sale_price = price*(1+defaultMargin/100)`, gst 18, moq 1, `aiEnhanced=!!aiData`, status `new`. **BUG:** reads `aiData?.type` but the function returns `product_type` → product type never fills from AI; the rest (`brand`, `manufacturer`, `category`, `generic_name`, `pack_size`, `strength`) do map since the function returns those keys.
  - **sale + not found:** status `error`, `errorMessage:'Product not found in catalogue'`.

### 6.3 Margin / preview / commit
- **`MarginSettingsModal`:** Margin % input (default = stockist default), live preview (₹100 example → sale price), "Save as my default margin" checkbox (updates `stockists.default_margin_percent`). Apply → `applyGlobalMargin(m)`.
- **`applyGlobalMargin(m)`:** for items with purchase_price: `sale = purchase*(1+m/100)`; `profit=(sale-purchase)*qty`; `gstAmount = profit*gst%/100` (**GST modeled on profit here**); `netProfit = profit-gstAmount`; sets `margin_percent`.
- **`BulkUploadPreview`:** summary tiles — **Ready to Upload** (`status!='error'` count), **Errors**, **AI Enhanced**, and (purchase mode) **Total Net Profit** (`Σ net_profit`). Table cols: Product Name (+ "AI" badge, + error text), Qty, and (non-sale) Purchase/Sale/**Profit(=net_profit)**, Status badge (✓ Found / + New / ✗ Error). Scrollable, sticky header.
- **Save as Draft:** insert `bulk_upload_drafts {stockist_id, mode, items(JSON), margin_percent:defaultMargin, file_name}`; navigate to products.
- **Confirm Upload:** filter out `status==='error'`, call **`bulk-upload-commit {stockistId, mode, items}`**; toast `Uploaded {successCount} products`; navigate.
- **Download Template (catalogue):** CSV with headers `Product Name,Brand,Category,Type,MRP,Purchase Price,Sale Price,Stock Quantity,HSN Code,GST %,Pack Size,Strength,MOQ` + one sample row. **`HSN Code` has no matching DB column** (never persisted).
- **`DraftCard`:** file name, mode badge (Purchase/Sale/Full Catalogue), item-count badge, saved timestamp, Resume + Delete (trash).

### 6.4 `bulk-upload-commit` (edge fn — no AI, **explicit in-code JWT check**)
- Requires `Authorization` header; verifies via service-role `auth.getUser(token)` (401 otherwise). Validates `{stockistId, mode, items[]}` (400 otherwise). **Does NOT verify the caller actually owns `stockistId`** — any authenticated user could commit to an arbitrary stockist id (service-role bypasses RLS). Security gap.
- Per item by mode:
  - **purchase:** `isNew` → insert new product (`mrp=mrp||sale*1.1`, `gst=gst||18`, `moq=moq||1`, `is_active:true`); else fetch current stock and **ADD** `stock_quantity += quantity`, update purchase/sale price.
  - **sale:** requires `existingProductId` (else error "Product not found in catalogue"); **REDUCE** `stock = max(0, current − quantity)`.
  - **catalogue:** `upsert` on conflict `(stockist_id, product_name)` with full field set (uses `item.existingProductId` as `id` when present).
- Returns `{success:true, successCount, errorCount, errors:errors.slice(0,10)}`.

---

## 7. Money, GST, Payment, Stock, Delivery-Fee Logic

### 7.1 Order status vocabulary
`orders.status` CHECK = `paid | accepted | packed | out_for_delivery | delivered` (default `paid`). `payment_status` CHECK = `paid | failed` (default `paid`). `payments.status` CHECK = `paid | failed` (default `paid`); `payments.mode` default `mock`. **Stockist advances** status forward-only; **pharmacy** can only jump to `delivered` via "Mark as Received" when status is `out_for_delivery`.

### 7.2 GST
- **Checkout / order storage:** per-line `gst_amount = price*qty*gst_percent/100`; per-stockist total = subtotal + Σ gst; stored on each `order_items` row (`gst_percent`, `gst_amount`). **No CGST/SGST split.** Missing gst_percent treated as 0 at checkout.
- **Bulk-upload margin & Custom Pricing:** GST modeled **on profit** (`profit*gst%/100`) for net-profit preview only — a different (and non-standard) GST semantics from checkout.

### 7.3 Payment (mock)
Simulated: 2s delay + `Math.random() > 0.05`. Writes real `orders`/`order_items`/`payments` rows with `MOCK-…` references. No gateway, UPI, or QR. `gateway_order_id`/`gateway_payment_id` schema columns exist; only `gateway_payment_id` gets a mock value.

### 7.4 Stock
- Checkout: `deduct_stock(product_id, quantity_to_deduct)` RPC per item (atomic per call). **NOTE:** `deduct_stock` is declared in `types.ts` (`Args {product_id, quantity_to_deduct}` → void) and called at runtime, but **no migration in the repo creates it** — it exists only in the live DB (created out-of-band). Untracked DB object.
- Bulk-upload: direct add/reduce/upsert (see §6.4). Inline stock editor and Edit Product also write `stock_quantity` directly.

### 7.5 Delivery-Fee engine (`useDeliveryFee` + `lib/distanceCalculator`) — DORMANT
- Priority evaluation over active `stockist_delivery_rules`: (1) `profit_amount` free if `orderProfit>=min`; (2) `order_amount` free if `orderTotal>=min`; (3) `delivery_date` free if scheduled; (4) `distance` fee `= round(max(0, dist−base)*perKm, 2)`; (5) `flat_fee`. No rules → free ("No delivery charges"). Missing pharmacy/stockist coords → "Location not available" and fee 0.
- Distance via **Haversine** (`R=6371km`, rounded 2dp) between `pharmacies.lat/lon` and `stockists.dispatch_lat/lon`.
- **`useDeliveryFee` is imported by nobody; checkout never applies a fee and never sets `orders.delivery_fee`.** The whole fee engine + `DeliveryRulesConfig` config screen currently affect **nothing**. Coordinates also have no UI to be captured (LocationInput unused; profiles don't collect lat/lon). Effectively fully dormant.

### 7.6 Revenue / spend
Stockist Revenue and Pharmacy Spent = Σ `orders.total_amount` for current calendar month (from 1st @ 00:00 local).

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

## 10. Consolidated Edge Cases, Bugs, Stubs & Hardcoded Values

**AI-autofill broken (both product forms):**
- `AddProduct` sends `{ productName }` and reads `data.success && data.product` — `product-ai-fetch` neither validates `productName` nor returns those keys → **silent no-op**.
- `EditProduct` sends `{ product_name }` (correct) but reads flat `data.generic_name/...` while the fn returns `{ product_info:{...} }` → **silent no-op** (and reads fields the fn doesn't return).
- Bulk-upload purchase enrichment reads `aiData?.type` but `fetch-product-info` returns `product_type` → product type never enriched.

**Data / flow bugs:**
- **Custom Pricing edits are lost** — `BulkUpload` never reads `location.state` on return (only `?draft=`).
- **Delivery Dates page never loads existing dates on mount** (no `useEffect` for `fetchDeliveryDates`) → empty calendar until a save happens; also soft-deactivates rows, accumulating dead `is_active=false` rows.
- **Product Type option-value mismatch** between Add (Capitalized, no "other") and Edit (lowercase + "other") → previously saved values may not display in Edit.
- **Smart Order → cart** omits `moq`/`stockQuantity`/`deliveryDate` → validation bypassed, orders created with `delivery_date=null`.
- **`useCart.updateQuantity` is async but fire-and-forget** — validation toasts can lag; Cart's number input can transiently show invalid qty.
- Client-side search/filter only sees the current 20-row page (Products/Orders/Payments); Brand/Category selects only list values from the loaded page.
- N+1 query patterns in Stockists/Catalogue (per-stockist count + delivery-date lookups).
- `StockistCatalogue.handleSmartOrder` has dead `alternatives` query; doesn't recommend or add to cart.

**Dormant / dead / unused:**
- **Delivery-fee engine entirely dormant** (`useDeliveryFee` never imported; checkout applies no fee; `orders.delivery_fee` never set). Config UI (`DeliveryRulesConfig`) has no runtime effect. No UI to capture lat/lon (LocationInput unused).
- **Admin role** — enum + RLS only; no routes/screens/guards.
- **`Index.tsx`** orphaned (not routed). **`ProductTable.tsx`** unused. **`LocationInput.tsx`** unused.
- Legacy **`ocr-bills`** storage bucket unused; `product-images`/`prescriptions` unused.

**Security / integrity:**
- Payments are **mock** (`Math.random()>0.05`); no real gateway; **no true DB transaction** — cross-row consistency relies on best-effort client-side rollback deletes.
- `bulk-upload-commit` verifies the JWT but **not stockist ownership** of `stockistId` (service-role bypasses RLS) → potential cross-tenant write.
- `smart-order-parse` has no 429/402 handling (generic failure only).
- Registration inserts assume an active session post-signUp (breaks if email confirmation is required).

**Hardcoded / default values:**
- GST default **18** (Add form, spreadsheet parse, commit inserts, order_items column default). Edit form defaults GST to **0** on save if blank (inconsistent with 18).
- MOQ default **1**; MRP fallback **sale×1.1**; default margin **20%** (`stockists.default_margin_percent` fallback and modal seed).
- Payment success rate **95%** (`> 0.05`); payment delay **2000ms**; post-success redirect **2000ms**; register redirect **1000ms**.
- Signed URL TTL **900s**; file size cap **10MB**; pagination **20**; role-fetch timeout **5s**; auth-guard timeout **15s**; expiring-soon window **30 days**; low-stock/expiring lists **top 5**.
- `getDaysUntilDelivery` null-date sentinel **999**.
- Mock references: `MOCK-<ts>-<rand9>`, `MOCK-PAY-<ts>`.
- `LocationInput` hardcodes 10 city coordinates + Delhi fallback.
- Product Type list fixed to Tablet/Capsule/Syrup/Injection/Cream/Drops (+ "other" in Edit only).

---

*End of review. Source of truth: `src/App.tsx`; all `src/pages/**`, `src/components/**`, `src/hooks/**`, `src/lib/**`; `src/integrations/supabase/{client,types}.ts`; `supabase/functions/{smart-order-parse,smart-order-recommend,extract-bill-items,fetch-product-info,product-ai-fetch,bulk-upload-commit}/index.ts`; `supabase/config.toml`; and all 15 `supabase/migrations/*.sql`.*

---
