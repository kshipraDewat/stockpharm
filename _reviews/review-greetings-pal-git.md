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

## 11. Build, Tooling & Runtime Architecture (deep dive)

### 11.1 Repository layout
```
greetings-pal-git/
├── index.html                     # SPA shell; PWA/OG/Twitter meta; title "MedOrder - Medicine Marketplace"
├── vite.config.ts                 # Vite + SWC React + lovable-tagger (dev only) + VitePWA
├── package.json                   # name "vite_react_shadcn_ts", version 0.0.0, type module
├── tailwind.config.ts / components.json / tsconfig*.json
├── src/
│   ├── main.tsx                   # createRoot(#root).render(<App/>); imports index.css
│   ├── App.tsx                    # provider tree + full route table
│   ├── pages/                     # Index, Install, NotFound, auth/{Login,Register},
│   │                              # stockist/ (11 pages), pharmacy/ (10 pages)
│   ├── components/                # ProtectedRoute, LocationInput (unused), NavLink (unused),
│   │   ├── layout/                # AppLayout, Header, BottomNav
│   │   ├── stockist/              # BulkUploadPreview, DeliveryRulesConfig, DraftCard,
│   │   │                          # MarginSettingsModal, ProductCard, ProductTable (unused),
│   │   │                          # ServiceableAreasManager
│   │   ├── pharmacy/              # ProductCard, QuantitySelector, StockistCard
│   │   └── ui/                    # ~48 shadcn/Radix primitives
│   ├── hooks/                     # useAuth, useCart, useDeliveryFee (unused), usePharmacyId,
│   │                              # useStockistId, use-mobile, use-toast
│   ├── lib/                       # utils.ts (cn), distanceCalculator.ts (Haversine)
│   └── integrations/supabase/     # client.ts, types.ts (generated)
└── supabase/
    ├── config.toml                # project_id kefbopoxcturwiqkfgdf; 6 functions all verify_jwt=true
    ├── functions/                 # 6 Deno edge functions
    └── migrations/                # 15 SQL migrations (2025-11-26 → 2025-11-27)
```

### 11.2 Provider tree (`App.tsx`, outermost → innermost)
`QueryClientProvider (new QueryClient(), default options)` → `TooltipProvider` → `Toaster` (shadcn toast) **and** `Sonner` (sonner toast — both toasters mounted; the app's pages exclusively use `sonner`'s `toast`) → `BrowserRouter` → `AuthProvider` → `CartProvider` → `AppLayout` → `<Routes>`. TanStack Query is instantiated but **no page uses `useQuery`/`useMutation`** — all data access is imperative `useState`+`useEffect` Supabase calls.

### 11.3 Dependencies actually exercised at runtime
- **Used:** react/react-dom 18.3, react-router-dom 6.30, @supabase/supabase-js 2.84, zod 3.25 (Register + edge-fn ad hoc validation), sonner, date-fns 4, lucide-react, all the Radix packages behind the shadcn components actually rendered (tabs, select, dialog, alert-dialog, dropdown-menu, switch, checkbox, progress, toast, tooltip, label, separator), react-day-picker 8 (Calendar), xlsx 0.18 (dynamic `import('xlsx')` in BulkUpload only), tailwind-merge/clsx/cva, vite-plugin-pwa 1.1, next-themes (sonner theme wrapper).
- **Installed but unused by app code:** `papaparse` + `@types/papaparse` (CSV is parsed with naive `split(',')` instead), `recharts` (chart.tsx primitive exists; no page renders a chart), `react-dropzone` (file intake is a plain `<input type=file>`), `react-hook-form` + `@hookform/resolvers` (all forms are controlled `useState`), `embla-carousel-react`, `cmdk`, `input-otp`, `vaul`, `react-resizable-panels`, and most of the unrendered ui/ primitives.
- **Dev:** SWC React plugin, eslint 9 flat config, typescript 5.8, lovable-tagger (Lovable editor component tagging, dev-mode only).

### 11.4 Vite / PWA specifics (`vite.config.ts`)
- Dev server `host: "::"` (all interfaces, IPv6), port **8080**. Alias `@ → ./src`.
- `VitePWA`: `registerType: 'autoUpdate'`; `includeAssets: ['favicon.ico','apple-touch-icon.png']`; manifest `{name: 'MedOrder - Medicine Marketplace', short_name: 'MedOrder', description: 'B2B Medicine Ordering Platform connecting Stockists and Pharmacies', theme_color/background_color '#ffffff', display 'standalone', start_url '/'}`; icons pwa-192x192 (any) + pwa-512x512 (any + maskable).
- Workbox: precache glob `**/*.{js,css,html,ico,png,svg,woff,woff2}`; one runtime rule — `https://*.supabase.co/*` → **NetworkFirst**, cache `supabase-cache`, `maxEntries: 50`, `maxAgeSeconds: 86400`. Consequence: API GETs may serve 24h-stale data offline; there is no background sync or offline mutation queue — writes simply fail offline.

### 11.5 `index.html` head
PWA `<link rel=manifest>`, apple-touch-icon, `apple-mobile-web-app-capable`, `apple-mobile-web-app-title "MedOrder"`, theme-color #ffffff, full Open Graph + Twitter `summary_large_image` cards pointing at `/pwa-512x512.png`, meta description "B2B Medicine Ordering Platform… AI-powered smart ordering", viewport `maximum-scale=5.0`.

### 11.6 Supabase client (`integrations/supabase/client.ts`)
Generated file. `createClient<Database>(VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { storage: localStorage, persistSession: true, autoRefreshToken: true } })`. Credentials come from Vite env vars (no `.env` committed). Single shared client; edge functions invoked via `supabase.functions.invoke(name, {body})` which automatically attaches the user's JWT (satisfying `verify_jwt = true`).

---

## 12. Auth State Machine (deep dive — `useAuth.tsx`, `ProtectedRoute.tsx`, `Login.tsx`)

### 12.1 `AuthProvider` internals
State: `user`, `session`, `userRole ('admin'|'stockist'|'pharmacy'|null)`, `loading (init true)`.
Startup sequence (deliberately ordered to avoid a Supabase deadlock, per in-code comments):
1. Register `supabase.auth.onAuthStateChange` **first** with a synchronous callback: sets `session`/`user`; if a user exists, defers `fetchUserRole(user.id)` behind `setTimeout(…, 0)`; if not, `userRole=null, loading=false`.
2. Then `supabase.auth.getSession()` resolves the persisted session and performs the same logic.
3. A `mounted` flag guards all setState after unmount; the subscription is unsubscribed on cleanup.

`fetchUserRole`: starts a **5s `setTimeout`** that on expiry logs "Role fetch timeout" and forces `userRole=null, loading=false`; then queries `user_roles.role` with `.single()`; success clears the timer and sets the role; any error (incl. 0 rows) → `userRole=null`. `finally` always sets `loading=false`. Note the timeout does not abort the in-flight query — a late success can still overwrite `userRole`.

`signOut()`: `supabase.auth.signOut()`; on error → sonner "Error signing out"; on success clears all three state slots and `navigate('/auth/login')`. Cart contents are **not** cleared on sign-out (localStorage `cart` persists across users on the same browser).

### 12.2 `ProtectedRoute` decision table
| Condition | Render |
|---|---|
| `loading && !timeoutError` | centered spinner + "Loading..." |
| 15s elapsed while still loading (`timeoutError`) | "Authentication is taking too long" + **Retry Login** button → `window.location.reload()` |
| `!user` | `<Navigate to="/auth/login" replace/>` |
| `user && !userRole` | "Your account setup is incomplete…" + button → hard `window.location.href='/auth/register'` |
| role not in `allowedRoles` | `<Navigate to="/" replace/>` (lands on Register) |
| else | children |

### 12.3 Login flow specifics
- Submit → `signInWithPassword`; on success does its **own second** `user_roles` fetch (independent of AuthProvider's). No role → toast "Account setup incomplete. Please register again.", `signOut()`, navigate `/auth/register`.
- Navigation is performed by a `useEffect([userRole, loading])`: stockist→`/stockist` replace, pharmacy→`/pharmacy` replace, **any other role (i.e. `admin`) → `/` replace**, which renders Register. So even a hand-provisioned admin row lands on the registration screen — the concrete admin "experience".
- The effect's `loading` dependency is the **component-local** submit flag, not `authLoading` (the destructured `authLoading` is never used).
- Password reset dialog: `resetPasswordForEmail(email, {redirectTo: origin + '/auth/login'})`. There is **no in-app "set new password" screen** — the Supabase recovery link redirects back to `/auth/login`, where no `PASSWORD_RECOVERY` event handling exists; the recovery session is simply treated as a login.

### 12.4 What a logged-in `admin` actually sees (dormant-role reality)
- `ProtectedRoute` blocks every `/stockist/*` and `/pharmacy/*` route (redirect → `/` = Register form rendered *inside* the logged-in AppLayout chrome).
- `Header` renders (user exists): brand link targets `/pharmacy` (ternary `userRole==='stockist' ? '/stockist' : '/pharmacy'`), profile item targets `/pharmacy/profile` — both redirect back to `/`.
- `BottomNav` shows the **pharmacy** tab set (same non-stockist ternary); every tab bounces to `/`.
- No admin dashboard, no admin queries, no admin UI of any kind exists in `src/`. Admin exists only as: the `app_role` enum member, `has_role(uid,'admin')` RLS escape hatches on every table, and the TS union type in `useAuth`/`ProtectedRoute`.

---

## 13. Cart State Machine (deep dive — `useCart.tsx`)

**CartItem:** `{productId, stockistId, productName, stockistName, price, quantity, deliveryDate?}` — note **no** gst/moq/stock is persisted in the cart line; GST is re-fetched at checkout, MOQ/stock only validated at add/update time.

- **Initialization:** lazy `useState(() => JSON.parse(localStorage.cart || '[]'))`; every change is mirrored to `localStorage['cart']` via `useEffect`. Cart survives reload/re-login and is **not namespaced per user**.
- **`addToCart(item & {stockQuantity?, moq?}) → boolean`:** ordered gates — (1) `stockQuantity !== undefined && stockQuantity <= 0` → toast "Product is out of stock", false; (2) compute `newQuantity` = existing line (matched on productId+stockistId) + incoming qty, or incoming qty; (3) `moq && newQuantity < moq` → toast "Minimum order quantity is N", false; (4) `stockQuantity !== undefined && newQuantity > stockQuantity` → toast "Only N units available in stock", false; (5) merge/append, toast "Added to cart", true. **When `stockQuantity`/`moq` are omitted (Smart Order path) all gates are skipped.**
- **`removeFromCart(productId, stockistId)`:** filter + toast "Removed from cart".
- **`updateQuantity(productId, stockistId, qty)`:** `qty <= 0` → remove; otherwise **awaits** a live re-fetch of `stock_quantity, moq` for that product and rejects (toast, no state change) if `qty < moq` or `qty > stock_quantity`; else maps the new qty in. Declared `void` in the context type though implemented async — Cart page calls it un-awaited from the number input's onChange.
- **Selectors:** `getTotalAmount()` = Σ price×qty (pre-GST); `getItemCount()` = Σ qty (used by Dashboard card + Catalogue header badge); `getItemsByStockist()` = `Map<stockistId, CartItem[]>` preserving insertion order (drives Cart grouping, Checkout order-splitting).
- **`clearCart()`:** empties state **and** removes the localStorage key (invoked by Cart's confirm dialog and by successful checkout).

---

## 14. Entity Dictionary — every table, column-by-column (from migrations + `types.ts`)

All PKs are `UUID DEFAULT gen_random_uuid()`; all tables have RLS ENABLED; `created_at TIMESTAMPTZ DEFAULT now()`; tables listed with `updated_at` also have the `update_updated_at_column()` BEFORE-UPDATE trigger.

### 14.1 `user_roles`
| Column | Type | Notes |
|---|---|---|
| user_id | UUID NOT NULL → auth.users ON DELETE CASCADE | |
| role | `app_role` NOT NULL | enum admin/stockist/pharmacy |
| — | | `UNIQUE(user_id, role)` — schema permits multiple roles/user, but the app reads with `.single()`, so >1 row breaks role resolution (PGRST116) → user treated as role-less. |
**Writers:** Register (insert), Register compensating delete. **Readers:** useAuth, Login. Lifecycle: created at registration, never updated.

### 14.2 `stockists` (updated_at trigger)
`user_id` (UNIQUE, →auth.users CASCADE), `name` NOT NULL, `address_line1/2`, `city`, `state`, `pincode`, `gst`, `drug_license` NOT NULL, `kyc_status` TEXT DEFAULT `'pending'` (never read or written anywhere in app code — permanent 'pending'), `default_margin_percent` NUMERIC DEFAULT 20, `dispatch_place_name`, `dispatch_latitude` NUMERIC(10,8), `dispatch_longitude` NUMERIC(11,8) (all three dispatch fields have **no UI writer** — only read by the dormant `useDeliveryFee`).
**Writers:** Register (insert name/drug_license/city/state), Stockist Profile (update 8 fields), MarginSettingsModal (default_margin_percent). **Readers:** every stockist page (id lookup), pharmacy Stockists/Catalogue/StockistCatalogue (full rows — pharmacies can see all columns incl. drug_license/gst via "Pharmacies can view all stockists"), smart-order-recommend (id/name/city via join).

### 14.3 `pharmacies` (updated_at trigger)
Same address/gst/drug_license block as stockists (no kyc_status), plus `google_place_name`, `latitude` NUMERIC(10,8), `longitude` NUMERIC(11,8) (no UI writer; read only by dormant `useDeliveryFee`).
**Writers:** Register, Pharmacy Profile. **Readers:** pharmacy pages (id lookup), stockist Order/Payment detail (name/address via join), smart-order-parse (FK for session).

### 14.4 `stockist_products` (updated_at trigger)
| Column | Type/Default | Origin migration |
|---|---|---|
| stockist_id | UUID NOT NULL → stockists CASCADE | initial |
| product_name | TEXT NOT NULL | initial; `UNIQUE(stockist_id, product_name)` added later (`unique_stockist_product`, backs the catalogue upsert) |
| brand, category, pack_size, strength | TEXT | initial |
| mrp | DECIMAL(10,2) | initial |
| sale_price | DECIMAL(10,2) **NOT NULL** | initial |
| stock_quantity | INTEGER DEFAULT 0 | initial |
| gst_percent | DECIMAL(5,2) **DEFAULT 0** at DB level (app-level default 18 in forms/parsers) | initial |
| is_active | BOOLEAN DEFAULT true | initial |
| generic_name, manufacturer, product_type, description | TEXT | 20251126044809 |
| purchase_price | NUMERIC(10,2) | 20251126044809 |
| min_stock_alert | INTEGER DEFAULT 0 | 20251126044809 |
| moq | INTEGER DEFAULT 1 | 20251126044809 |
| batch_number TEXT, expiry_date DATE | | 20251127044204 — **no UI form field writes these**; only pre-existing/manually-seeded values display (badges in pharmacy views, Expiring Soon panel, smart-order match payloads) |
**Writers:** AddProduct, EditProduct, ProductCard inline stock, Products toggle/delete, bulk-upload-commit (insert/update/upsert), checkout via `deduct_stock` RPC. **Readers:** every catalogue surface, dashboards, smart-order-recommend, checkout re-check, useCart.updateQuantity.

### 14.5 `stockist_delivery_dates`
`stockist_id` NOT NULL CASCADE, `delivery_date` DATE NOT NULL, `is_active` BOOLEAN DEFAULT true, `UNIQUE(stockist_id, delivery_date)`.
Lifecycle quirk: DeliveryAndDates "save" soft-deactivates **all** rows then inserts the selection — re-selecting a previously saved date **violates the unique constraint** (old inactive row still holds `(stockist_id, date)`), making the insert fail with a "Failed to save delivery dates" toast. Combined with the never-on-mount fetch (§3.11), the dates tab is doubly fragile. A dedicated DELETE RLS policy exists (20251126052623) but the code never deletes rows.
**Readers:** Stockists/Catalogue/StockistCatalogue earliest-future-date lookups, smart-order-recommend deliveryMap.

### 14.6 `orders` (updated_at trigger)
`pharmacy_id`/`stockist_id` NOT NULL CASCADE FKs; `status` TEXT DEFAULT 'paid' CHECK (paid/accepted/packed/out_for_delivery/delivered); `delivery_date` DATE nullable; `total_amount` DECIMAL(12,2) NOT NULL (GST-inclusive); `payment_status` TEXT DEFAULT 'paid' CHECK (paid/failed); `payment_reference` TEXT (`MOCK-<ts>-<rand>`); `delivery_fee` NUMERIC(10,2) DEFAULT 0 (added 20251127121003; **always 0** — checkout never writes it, no UI shows it).
**Writers:** Checkout (insert + rollback delete attempts), stockist OrderDetail (status), pharmacy OrderDetail (status→delivered). **Readers:** both Orders lists, both dashboards (counts/sums), Payments join.

### 14.7 `order_items`
`order_id` NOT NULL → orders CASCADE; `stockist_product_id` → stockist_products **ON DELETE SET NULL** (order history survives product deletion, name/price preserved via snapshots); `product_name_snapshot` TEXT NOT NULL; `price_snapshot` DECIMAL(10,2) NOT NULL; `quantity` INTEGER NOT NULL; `line_total` DECIMAL(12,2) NOT NULL; `gst_percent` NUMERIC DEFAULT 18 + `gst_amount` NUMERIC DEFAULT 0 (added 20251126063046).
**Writers:** Checkout only. **Readers:** both OrderDetail pages.

### 14.8 `payments`
`order_id` NOT NULL CASCADE; `amount` DECIMAL(12,2) NOT NULL; `status` DEFAULT 'paid' CHECK (paid/failed); `mode` DEFAULT 'mock'; `gateway_order_id` TEXT (never written); `gateway_payment_id` TEXT (`MOCK-PAY-<ts>`). No updated_at.
**Writers:** Checkout. **Readers:** stockist Payments/PaymentDetail. Pharmacies have **no payments UI** at all — they can only infer payment via the order's `payment_status` badge.

### 14.9 `smart_order_sessions` / `smart_order_items` / `smart_order_recommendations`
- `smart_order_sessions`: `pharmacy_id` NOT NULL CASCADE, `raw_text` TEXT NOT NULL, `status` DEFAULT 'processing' **CHECK (status IN ('processing','ready'))**. `smart-order-recommend` finishes with `UPDATE … SET status='completed'` — a value **outside the CHECK constraint**; the update fails at the DB and its error is not checked, so **every session remains 'processing' forever**. *(Previously undocumented.)*
- `smart_order_items`: `session_id` NOT NULL CASCADE, `parsed_name` TEXT NOT NULL, `quantity` INTEGER NOT NULL.
- `smart_order_recommendations`: `session_id` NOT NULL CASCADE, `mode` TEXT CHECK (mode IN ('single_stockist','cheapest')) — the insert **omits `mode`** (null passes the CHECK), so the column is always null; `result_json` JSONB NOT NULL holding the entire `{bestSingle, cheapestSplit, fastestDelivery, notFoundItems, totalItemsRequested, itemsFound}` blob.
All three tables are written exclusively by edge functions with the **service-role** key (bypassing RLS); no UI ever reads them back — there is no smart-order history screen.

### 14.10 `bulk_upload_drafts` (v2 — current shape; updated_at trigger)
`stockist_id` NOT NULL CASCADE; `mode` TEXT NOT NULL CHECK (purchase/sale/catalogue); `items` JSONB NOT NULL (the full PreviewItem[] incl. statuses/AI flags/pricing); `margin_percent` NUMERIC; `file_name` TEXT.
History: a v1 table (`draft_name, products, total_items, total_profit`) was created 20251127080902, **dropped** 20251127132348, and recreated with this shape 20251127145203. **Writers:** BulkUpload Save-as-Draft (insert only — resuming and re-saving creates a *new* draft; drafts are never updated), Products page delete. **Readers:** Products page list, BulkUpload `?draft=` loader.

### 14.11 `stockist_serviceable_areas`
`stockist_id` NOT NULL CASCADE, `pincode` TEXT NOT NULL, `area_name` TEXT, `is_active` DEFAULT true, `UNIQUE(stockist_id, pincode)`. Soft-delete via `is_active=false`; re-adding a removed pincode therefore hits the unique constraint → "This pincode is already added" even though the badge list no longer shows it. **No consumer:** nothing filters stockists/catalogues/checkout by serviceable area — the data is captured and displayed to the owning stockist only (pharmacies have a SELECT policy but no pharmacy code queries the table).

### 14.12 `stockist_delivery_rules` (updated_at trigger)
`rule_type` TEXT NOT NULL CHECK (distance/order_amount/delivery_date/profit_amount/flat_fee); numeric params `per_km_charge`, `base_distance_km`, `min_order_amount`, `min_profit_amount`, `flat_fee` (all NUMERIC(10,2) nullable); `free_on_delivery_date` BOOLEAN DEFAULT false; `priority` INTEGER DEFAULT 1; `is_active` DEFAULT true. Save is non-atomic delete-then-insert. Consumed only by the never-mounted `useDeliveryFee` (§7.5) — fully dormant downstream.

### 14.13 Database functions / RPCs
| Function | Definition | Used by |
|---|---|---|
| `has_role(_user_id uuid, _role app_role) → boolean` | SQL, STABLE, SECURITY DEFINER, `search_path=public`; EXISTS on user_roles | ~30 RLS policies |
| `user_owns_stockist(_stockist_id text) → boolean` | SQL, STABLE, SECURITY DEFINER; EXISTS stockists WHERE id::text=_stockist_id AND user_id=auth.uid() | 3 storage policies on `bills` |
| `update_updated_at_column() → trigger` | plpgsql; re-created with SECURITY DEFINER + search_path in migration 2 | 6 BEFORE UPDATE triggers |
| `deduct_stock(product_id uuid, quantity_to_deduct int) → void` | **not present in any migration** — exists only in the live DB + `types.ts` declaration | Checkout, one call per order line |

---

## 15. Complete RLS Policy Catalog (as written in migrations)

### 15.1 Public schema
| Table | Policy | Cmd | Rule |
|---|---|---|---|
| user_roles | Users can view their own roles | SELECT | `auth.uid() = user_id` |
| user_roles | Users can insert their own role | INSERT | WITH CHECK `auth.uid() = user_id` (added 20251126043440 to unblock registration) |
| stockists | Stockists can view own data | SELECT | has_role stockist AND uid=user_id |
| stockists | Stockists can update own data | UPDATE | same |
| stockists | Pharmacies can view all stockists | SELECT | has_role pharmacy (unrestricted row set — all columns visible) |
| stockists | Users can create stockist profile | INSERT | WITH CHECK uid=user_id |
| stockists | Admins can manage stockists | ALL | has_role admin |
| pharmacies | view own / update own / create profile / Admins manage | SELECT/UPDATE/INSERT/ALL | pharmacy-mirrored versions of the above. **No policy lets stockists read pharmacies** directly, but the stockist Order/Payment pages *can* read the joined pharmacy name — via PostgREST embedded resource? No: embedding still applies RLS, so `pharmacies:pharmacy_id(name)` returns **null for stockists**; the UI's `order.pharmacies?.name || "—"` quietly renders "—". *(Behavioral reality: stockist order/payment tables may show no pharmacy names unless an additional policy exists in the live DB beyond these migrations.)* |
| stockist_products | Stockists can manage own products | ALL | has_role stockist AND stockist_id ∈ own stockists |
| stockist_products | Pharmacies can view active products | SELECT | has_role pharmacy AND is_active=true |
| stockist_products | Admins can manage products | ALL | admin |
| stockist_delivery_dates | Stockists manage own / Pharmacies view active / Admins manage / Stockists delete own | ALL / SELECT / ALL / DELETE | as named |
| orders | Pharmacies view own / create / **update own** (20251126043440, backs Mark-as-Received) | SELECT/INSERT/UPDATE | pharmacy_id ∈ own pharmacies |
| orders | Stockists view own / update own | SELECT/UPDATE | stockist_id ∈ own stockists |
| orders | Admins can manage orders | ALL | admin |
| order_items | Users can view order_items of their orders | SELECT | order ∈ (own pharmacy ∪ own stockist ∪ admin) |
| order_items | Pharmacies can create order_items | INSERT | order ∈ own pharmacy orders |
| order_items | Admins can manage order_items | ALL | admin |
| payments | Users can view payments for their orders | SELECT | same tri-branch as order_items |
| payments | Pharmacies can create payments | INSERT | own orders |
| payments | Admins can manage payments | ALL | admin |
| smart_order_sessions | Pharmacies can manage own sessions / Admins manage | ALL | own pharmacy / admin |
| smart_order_items & smart_order_recommendations | "Users can view items/recommendations for their sessions" (SELECT) + "System can manage …" (ALL) | | both keyed to session's pharmacy ownership or admin — the "System" policies are misnomers; actual system writes use service-role and bypass RLS entirely |
| bulk_upload_drafts | Stockists can manage own drafts | ALL | stockist_id ∈ own stockists (v2 policy has **no** has_role() check, ownership only) |
| stockist_serviceable_areas | Stockists manage own (ALL, ownership only) / Pharmacies view (SELECT, has_role pharmacy AND is_active) | | |
| stockist_delivery_rules | Stockists manage own (ALL) / Pharmacies view (SELECT, active only) | | |

**Consequence for the checkout rollback ladder (previously undocumented):** pharmacies have **no DELETE policy** on `orders`, `order_items`, or `payments`. The compensating `delete()` calls in Checkout's error paths therefore match 0 rows under RLS (PostgREST returns success with no error). If order-items/payment/stock steps fail, the "rollback" leaves the already-inserted rows in place — orphaned paid orders are the actual failure behavior, not cleanup.

### 15.2 Storage (`storage.objects`)
- **`ocr-bills` bucket (legacy, deleted):** created public (20251126042146) with uid-folder INSERT + public SELECT; flipped private with uid-folder policies (20251126063046); re-scoped to stockist-id folders (20251126075848); finally all objects **deleted and the bucket dropped** (20251127132348). Net: does not exist.
- **`bills` bucket (current, private):** created in 20251127145203 with stockist-id-folder policies via subselect; 20251127141023 (note: timestamps interleave) had uid-folder policies; the final state after 20251127145259 is INSERT/SELECT/DELETE gated by `user_owns_stockist((storage.foldername(name))[1])` — matching the code's `${stockistId}/…` upload paths. Files are never deleted by app code; every bill upload accumulates.
- Buckets `product-images`/`prescriptions` referenced in FEATURES.md do **not** appear in migrations or code.

### 15.3 Migration timeline (15 files, all within 2025-11-26 → 2025-11-27)
1. `20251126042135` — the big bang: app_role enum, has_role(), user_roles, stockists, pharmacies, stockist_products, stockist_delivery_dates, orders, order_items, payments, smart_order_* (3 tables), all base RLS, updated_at triggers.
2. `20251126042146` — update_updated_at_column hardened (SECURITY DEFINER, search_path).
3. `20251126043440` — missing INSERT policies (user_roles/stockists/pharmacies) + "Pharmacies can update own orders".
4. `20251126044809` — product enrichment columns (generic_name, manufacturer, product_type, purchase_price, min_stock_alert, moq, description) + column comments.
5. `20251126052623` — delivery-dates DELETE policy.
6. `20251126063046` — order_items gst_percent/gst_amount; ocr-bills made private (uid folders).
7. `20251126075848` — ocr-bills policies re-scoped to stockist-id folders.
8. `20251127044204` — batch_number + expiry_date.
9. `20251127080902` — default_margin_percent; bulk_upload_drafts **v1**; `unique_stockist_product` constraint; drafts trigger.
10. `20251127121003` — serviceable areas + delivery rules tables + policies; `orders.delivery_fee`.
11. `20251127130524` — ocr-bills storage bucket creation (public) *(file ordering vs. content: this and #7 relate to the legacy bucket lifecycle)*.
12. `20251127132348` — DROP bulk_upload_drafts v1; purge + delete ocr-bills bucket.
13. `20251127141023` — bills-bucket policies keyed to `auth.uid()` folders (would reject the app's stockist-id paths).
14. `20251127145203` — bulk_upload_drafts **v2** (current) + `bills` bucket creation + stockist-id-subselect policies.
15. `20251127145259` — `user_owns_stockist()` helper; final corrected bills policies.

---

## 16. Edge Function Contracts (full I/O per function)

Shared traits: Deno `serve` handlers; CORS `*` with `authorization, x-client-info, apikey, content-type` allowed headers; OPTIONS → 200 empty; platform-level `verify_jwt = true` for all six (an unauthenticated call is rejected by the gateway before handler code runs); AI calls target `https://ai.gateway.lovable.dev/v1/chat/completions` with `model: google/gemini-2.5-flash` and `LOVABLE_API_KEY` bearer.

### 16.1 `smart-order-parse`
- **In:** `{rawText: string(non-empty), pharmacyId: string}` — validation throws → 500 `{error}` (not 400).
- **AI call:** system prompt "You are a medicine list parser…" with in-prompt example (`"paracetamol 500mg x10, brufen 20 tabs, crocin - 5"` → structured array); a `tools` array defining `parse_medicine_list({items: [{parsed_name: string, quantity: integer}]})` and `tool_choice` **forcing** that function. Missing tool_call → throw.
- **Writes (service-role):** insert `smart_order_sessions{pharmacy_id, raw_text, status:'processing'}` (`.select().single()` to get id); bulk-insert `smart_order_items`. Either failure → 500. `pharmacyId` is **not verified against the caller's JWT** — any authenticated user could create sessions for any pharmacy id.
- **Out:** 200 `{success: true, sessionId, items: [{parsed_name, quantity}]}`.

### 16.2 `smart-order-recommend` (no AI)
- **In:** `{sessionId}`; missing → 500 "Missing sessionId". No caller-ownership check (service-role reads).
- **Reads:** session's `smart_order_items` (empty → 500 "No items found for session"); ALL active `stockist_products` joined `stockists!inner(id,name,city)` (no pagination — full marketplace scan per request); active `stockist_delivery_dates >= today` asc → `deliveryMap` (first = earliest per stockist).
- **Matching:** `fuzzyMatch` = exact → bidirectional substring → any-word bidirectional substring overlap (very loose: "500mg" in the query matches any product containing "500mg"). Matches then filtered to `stock_quantity >= quantity` (`available` flag). Each retained match carries productId/Name, stockistId/Name/City, price, stock, moq, batchNumber, expiryDate, deliveryDate|null, `totalPrice = sale_price × requested qty`.
- **Aggregation:** `stockistAvailability` accumulates per-stockist items/totalCost/itemsAvailable; missing-item pass appends parsed_name to `itemsMissing` of every stockist lacking it (including globally-not-found items appended to all).
- **Strategies:** (1) bestSingle = max itemsAvailable, tie lowest totalCost, else null; (2) cheapestSplit = per-item min totalPrice, grouped by stockist with subtotals; `savings = bestSingle.totalCost − splitTotal` (can be negative when bestSingle covers fewer items — UI then shows the "Best Price" badge because `savings > 0` fails); (3) fastestDelivery = per-item min `getDaysUntilDelivery` (null→999 sentinel, so date-less stockists always lose to any dated one but still win when nobody has dates), grouped with per-stockist deliveryDate/daysUntilDelivery; `earliestDelivery = Math.min(...)` (Infinity if empty; badge can literally read "999 days" when only undated stockists match).
- **Writes:** best-effort insert to `smart_order_recommendations` (error only logged); session status update to `'completed'` (fails CHECK — see §14.9). **Out:** `{success: true, recommendations}`.

### 16.3 `extract-bill-items` (AI vision)
- **In:** `{imageUrl, mode}`; missing imageUrl → 400. Fetches nothing itself — sends the (signed) URL to Gemini as `image_url` content alongside a text instruction. System prompt demands strict JSON `{pharmacy_name, items:[{name, quantity, price}]}` where price semantics switch on mode ("purchase price per unit" vs "sale price per unit"); rules: extract ALL products, preserve exact names, numeric qty/price, null pharmacy name if absent.
- **Error mapping:** 429 → 429 "Rate limit exceeded…", 402 → 402 "AI credits exhausted…", other !ok → 500 "AI extraction failed", no content → 500, JSON-parse failure (after `{[\s\S]*}` regex extraction) → 500.
- **Sanitization:** items filtered to truthy name+quantity+price (⚠️ a legitimate 0-price line is dropped by the truthiness filter), then `name` trimmed to ≤200 chars, `quantity = max(1, parseInt||1)`, `price = max(0, parseFloat||0)`.
- **Out:** `{pharmacy_name: string|null, items}`. Note: despite the field name, in stockist purchase-bill context the "pharmacy_name" is really the supplier header; the client ignores it entirely.

### 16.4 `fetch-product-info` (AI enrichment; used by bulk-upload purchase path)
- **In:** `{product_name}`; missing → 400. Uses `deno.land/x/xhr` polyfill + `Deno.serve`.
- **Prompt:** "pharmaceutical product database assistant" → JSON `{generic_name, brand, manufacturer, category, product_type, pack_size, strength}` with nulls for unknowns.
- **Errors:** 429/402 pass-through with friendly messages; !ok → 500; no JSON match in content → 500 "Could not parse AI response".
- **Out:** the **flat** parsed object (no wrapper). Client maps 6 of 7 keys correctly; `product_type` is read as `aiData?.type` → dropped (§6.2).

### 16.5 `product-ai-fetch` (AI; wired to both product forms, both broken)
- **In:** `{product_name}` (validated non-empty, ≤200 → thrown errors return **500** with message). AddProduct sends `{productName}` → validation throws "Invalid product_name…" → client lands in catch → toast "Failed to fetch product details".
- **Prompt:** asks for `{generic_name, manufacturer, product_type, category}` (empty strings for unknowns — note: 4 fields only; no brand/pack_size/strength despite EditProduct reading them).
- **Out:** `{ product_info: {...} }` wrapper — which neither caller unwraps. No 429/402 special-casing.

### 16.6 `bulk-upload-commit` (no AI; the only function with in-code auth)
- Auth: requires `Authorization` header (401), service-role `auth.getUser(token)` (401). **No check that `stockistId` belongs to that user** — cross-tenant catalog writes are possible for any logged-in account.
- **In:** `{stockistId, mode, items[]}` (400 if malformed). Sequential per-item loop, error-per-item accumulation:
  - `purchase` + `isNew`: INSERT full product (mrp fallback sale×1.1, gst 18, moq 1, active).
  - `purchase` + existing: read current stock, UPDATE `stock_quantity = current + quantity` (read-then-write, not atomic), plus purchase_price/sale_price overwrite.
  - `sale`: requires `existingProductId` else per-item error; UPDATE `stock = max(0, current − quantity)`.
  - `catalogue`: UPSERT (onConflict `stockist_id,product_name`), passing `id: item.existingProductId` (undefined for new rows).
- **Out:** always 200 `{success: true, successCount, errorCount, errors: first 10}` unless the whole request throws (500). The client only surfaces `successCount`; per-item errors are silently discarded by the UI.

---

*End of review. Source of truth: `src/App.tsx`; all `src/pages/**`, `src/components/**`, `src/hooks/**`, `src/lib/**`; `src/integrations/supabase/{client,types}.ts`; `supabase/functions/{smart-order-parse,smart-order-recommend,extract-bill-items,fetch-product-info,product-ai-fetch,bulk-upload-commit}/index.ts`; `supabase/config.toml`; and all 15 `supabase/migrations/*.sql`.*

---

*Documentation audit pass appended below — code-derived additions only; prior content preserved.*

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
