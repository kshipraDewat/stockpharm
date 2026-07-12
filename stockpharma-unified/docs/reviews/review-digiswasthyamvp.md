> **Extracted from** [`UNIFIED_FEATURES.md`](../UNIFIED_FEATURES.md) Appendix G (DMVP).
> **Source repo:** `digiswasthyamvp (DMVP)`
> Use [`EXHAUSTIVE_REVIEW_PROMPT.md`](../EXHAUSTIVE_REVIEW_PROMPT.md) to re-run or extend this review.

# Digi Swasthya (B2B MVP) — EXHAUSTIVE Functional Review

> App path: `/Users/kshipradewat/Desktop/stockpharma/digiswasthyamvp`
> In-product name: **Digi Swasthya** ("B2B Pharma Supply Chain Platform"; "A brand of Chameleon - The Agency (OPC) Pvt Ltd."). Interactive demo.
> Stack: Vite + React 18 + TS, shadcn/Radix/Tailwind, React Router v6, TanStack Query v5, a **hand-rolled mock `supabase` client** over static seed data, Recharts, jsPDF + html2canvas, xlsx, qrcode.react, date-fns, sonner. Deno edge functions exist but are unreachable at runtime.

This review is derived by reading every source file. It supersedes `FEATURES.md` in depth and corrects several of its claims against the actual seed data and code. Where a behaviour is a **no-op / stub / dead / bug**, it is flagged inline.

---

## PART A — GLOBAL ARCHITECTURE

### A1. The mock Supabase client (`src/integrations/supabase/client.ts`) — governs everything
The exported `supabase` is NOT `createClient`; it is a hand-written object. Behaviour, verified line by line:

- **`from(table)` → `MockQueryBuilder`.** Backed by `TABLE_DATA` (a `Record<string, any[]>`) mapping 21 table names to in-memory arrays.
- **Reads** apply chained filters via `applyFilters`: supports `eq, neq, in, gte, gt, lte, lt, like, ilike, is(null), not("col","is",null), order, limit, range`.
  - `like/ilike` strips `%` and does case-insensitive `includes`.
  - `order` sorts with `<`/`>` comparison (works for ISO date strings & numbers).
  - `range(from,to)` = `slice(from, to+1)`.
- **No-op / partial query methods (CRITICAL):** `or()`, `contains()`, `containedBy()`, `textSearch()`, **`filter()`** all `return this` and apply **nothing**. `match(obj)` is the only one that works (maps to `eq`).
  - Consequence 1 — **`.or(...)` returns the entire table unfiltered.** Visible in `PeerChatPage.loadMessages` → shows all 3 peer messages regardless of the two participants.
  - Consequence 2 — **`.filter(col,op,val)` is ignored.** `usePaginatedQuery` builds its query with `.filter(...)`, so **`StockistOrders` never actually filters by `stockist_id`** — its paginated list returns ALL orders across every stockist (then client-side search/tab narrow only the current page).
- **Joins:** `resolveJoins` handles nested `select("*, table(cols)")` via a small `JOIN_MAP` covering only: `orders → pharmacy_profiles/stockist_profiles`, `order_items → products`, `bills → pharmacy_profiles/stockist_profiles`, `stockist_pharmacy_circle → pharmacy_profiles/stockist_profiles`, `product_batches → products`. Any other join (e.g. `orders → delivery_staff(name)` in `StockistPayments`, `order_items → orders(...)` in `SharedProductDetail` sales chart, `order_returns → products/orders`, `conversations → chat_messages`) resolves to `undefined`/absent → those features render empty.
- **Mutations DO NOT PERSIST.**
  - `insert`/`upsert` → echo payload back with generated `id = demo-{Date.now()}-{rand}` and `created_at`. Returns single object if input was single, array otherwise.
  - `update` → returns `{...row, ...updateData}` for filtered rows but never writes to the backing array.
  - `delete` → returns `{data:null, count:0}`, deletes nothing.
  - Net effect: actions "succeed" and toast, but state persists only where the component also mutates local React state / React-Query cache.
- **RPC (`MockRpcBuilder`):** hardcodes `check_login_rate_limit → true`, `record_login_attempt → null`, `has_role → true`; **everything else → `{data:null}`** (i.e. `decrement_stock`, `deduct_product_stock`, `restore_product_stock`, `update_circle_outstanding`, `admin_override_order_status`, etc. are all no-ops).
- **Edge functions:** `functions.invoke(...) → {data:null, error:null}` ALWAYS. So every AI feature returns null.
- **Storage (`MockStorage`):** `upload → {path:"demo/{ts}"}`; `createSignedUrl → "https://placeholder.com/demo-file.pdf"`; `getPublicUrl → "https://placeholder.com/{path}"`; `remove → null`.
- **Auth (`MockAuth`):** `getSession → {session:null}`; `getUser` reads `localStorage["demo_role"]` → `DEMO_USERS[role]`; `signInWithPassword/signUp/signOut/resetPasswordForEmail/updateUser` all resolve success with canned data (so "wrong current password" can NEVER fail); `onAuthStateChange` returns a dummy unsubscribe.
- **Realtime (`MockChannel`):** `channel().on().subscribe().unsubscribe()` all no-ops. `removeChannel` no-op.

### A2. Seed data (`src/lib/dummy-data.ts`) + synthesized tables (`client.ts`)
- `DEMO_USERS`: 3 (stockist `s-user-001`/Rajesh Kumar, pharmacy `p-user-001`/Anita Sharma, admin `a-user-001`/Platform Admin).
- `DEMO_STOCKIST_PROFILE` = `sp-001` (MedSupply India Pvt Ltd, Jaipur, PAN ABCDE1234F, HDFC bank, upi rajesh@upi, approved). Plus `sp-002` PharmaCorp (approved), `sp-003` LifeCare (approved), `sp-004` MedWholesale (**pending**). Total 4 stockists.
- `DEMO_PHARMACY_PROFILE` = `pp-001` (HealthPlus Pharmacy, Jaipur 302001, ICICI, approved; carries `min_order_amount:500`, `minimum_order_amount:500`, `delivery_fee:50`, `free_delivery_above:2000`, `operating_hours:{}`). Plus `pp-002` City Care (approved), `pp-003` MedLife (approved), `pp-004` Apollo Medical (approved), `pp-005` Wellness (**pending**). Total 5 pharmacies.
- `DEMO_PRODUCTS`: 12 products. `prod-001..008` belong to `sp-001`; `prod-009,010` to `sp-002`; `prod-011,012` to `sp-003`. Each has mrp/sale_price/price/purchase_rate, stock_quantity, min_stock_level, gst_rate ("5%"/"12%"), hsn_code, drug_type "Allopathy", drug_schedule ("OTC"/"H"), batch_number, expiry_date, `moq`, `min_order_quantity`, `reserved_quantity:0`, `requires_prescription`, `is_narcotic:false`, `image_url:null`. Notable: `prod-004` Metformin stock 15 (< min 50 → low), `prod-007` Azithromycin stock 8, expiry **2025-04-30** (already past "today" 2026-07 → expired), `prod-012` Montelukast expiry 2026-04-10.
- `DEMO_ORDERS`: 8 orders. **Statuses actually present: `delivered`(ord-001,005), `processing`(ord-002), `pending`(ord-003,008), `confirmed`(ord-004), `cancelled`(ord-006), `dispatched`(ord-007).** `order_source` values present: `platform`, `whatsapp_parse`. `payment_status`: paid/unpaid. Some carry `delivery_payment_status:"collected"`, `delivery_payment_method:"upi"/"cash"`.
  - ⚠️ `"confirmed"` and `"processing"` and `"whatsapp_parse"` are NOT in the app's canonical vocab (`statusFlow`, ORDER_STATUS_LABELS, or the `order_source` enum), producing edge-case rendering (see §3.5, §3.4).
- `DEMO_ORDER_ITEMS`: 8 items, only for ord-001, ord-002, ord-003. Other orders have no items → detail pages show "No items."
- `DEMO_BILLS`: 5 bills. **Statuses present: `paid`(bill-001,002), `draft`(bill-003,005), `sent`(bill-004).** Carry `subtotal`, `gst_amount`, `discount_type`/`discount_value`, `total_amount`, `due_date`.
  - ⚠️ No bill has status `confirmed`/`final`/`finalized`, so the badge highlight logic across the app never matches seed bills (see §Bill vocabulary).
- `DEMO_PAYMENTS`: 4 payments. Methods present: `upi`, `cash`, **`neft`**, `cheque`. Statuses confirmed/pending. (`neft` is not in any payment-method picker.)
- `DEMO_CIRCLE`: 4 rows, ALL for `sp-001` (cir-001 pp-001 limit 50000/out 4839/credit_balance 45161; cir-002 pp-002 30000/9990; cir-003 pp-003 25000/3250; cir-004 pp-004 40000/0). `payment_terms_days`, `is_blocked:false`, `notes`, `last_payment_date`.
- `DEMO_NOTIFICATIONS`: 8 (types order/payment/**stock**/bill/approval — note `stock` type has no icon mapping in StockistNotifications so falls back to Bell). `DEMO_MESSAGES`: 3. `DEMO_SERVICEABLE_AREAS`: 5 PINs, all `sp-001` (302001,302005,302017,342001,313001).
- Synthesized in client.ts: `DEMO_PROFILES` (6), `DEMO_USER_ROLES` (7), `DEMO_LOGIN_ACTIVITY` (3, all success), `DEMO_PEER_MESSAGES` (3), `DEMO_PRODUCT_BATCHES` (3 — pb for prod-001×2, prod-002×1), `DEMO_PRODUCT_MEDIA` (empty), `DEMO_CONVERSATIONS` (1, for s-user-001), `DEMO_CHAT_MESSAGES` (2), `DEMO_BILL_ORDERS` (2: bill-001↔ord-001, bill-002↔ord-005), `DEMO_ORDER_STATUS_HISTORY` (3), `DEMO_LOGIN_ATTEMPTS` (**empty**).
- Charts: `DEMO_MONTHLY_TREND` (6 months orders/revenue), `DEMO_ADMIN_GROWTH` (6 months users).

### A3. Auth / identity (all fake)
- `useDemoAuth` (`DemoAuthProvider`): stores `role` in `localStorage["demo_role"]` (default `"pharmacy"`), exposes `{role, user (=DEMO_USERS[role]), setRole, signOut}`. `signOut` clears the key and hard-navigates to `/`.
- `useAuth`: parallel hook returning `{user, roles:[role], loading:false, profile, signOut}` from the same key. `AppRole = admin|stockist|pharmacy`. Demo users/profiles hardcoded inline.
- `useStockistProfile` → always `DEMO_STOCKIST_PROFILE` (`sp-001`), `isLoading:false`. `usePharmacyProfile` → always `DEMO_PHARMACY_PROFILE` (`pp-001`). So the "current" stockist is permanently sp-001 and pharmacy permanently pp-001, regardless of which demo user "logged in."
- **No route guards.** Any panel/URL is reachable directly. No session timeout.

### A4. Routing (`src/App.tsx`)
- `BrowserRouter`; lazy pages wrapped in `SuspenseWrap` (ErrorBoundary + Suspense spinner). Global QueryClient: `staleTime 60000`, `gcTime 300000`, `refetchOnWindowFocus:false`.
- Theme init on module load from `localStorage["theme"]` (dark / system→matchMedia / else light).
- Three layout wrappers inject nav + hardcoded names into `AppLayout`:
  - `StockistLayout` — businessName = `DEMO_STOCKIST_PROFILE.business_name`, userName **"Rajesh Kumar"**.
  - `PharmacyLayout` — pharmacy_name, userName **"Anita Sharma"**.
  - `AdminLayout` — businessName **"Digi Swasthya"**, userName **"Platform Admin"**.
- **Route table (exhaustive):**
  - Public: `/` (DemoHome), `/verify-bill/:billId` (VerifyBill), `/login`→Navigate `/`, `/register`→Navigate `/`, `*`→NotFound.
  - `/stockist` (index=Home) + `products`, `products/add`, `products/:id`, `products/:id/edit`, `orders`, `orders/create`, `orders/:id`, `pharmacies`, `pharmacies/find`, `pharmacies/:id`, `pharmacies/:id/ledger`, `more`, `payments`, `profile`, `business`, `settings`, `help`, `notifications`, `privacy-security`, `serviceable-areas`, `export-catalogue`, `bill-history`, `bulk-bill`, `chats`, `chat/:peerId`, `messages`. (27 routes)
  - `/pharmacy` (index=Dashboard) + `orders`, `orders/quick`, `orders/:id`, `stockists`, `stockists/find`, `stockists/:id`, `browse`, `more`, `profile`, `business`, `notifications`, `payments`, `help`, `privacy-security`, `settings`, `quick-order-history`, `ledger/:stockistId`, `chats`, `chat/:peerId`, `messages`. (21 routes)
  - `/admin` (index=Dashboard) + `pharmacies`, `pharmacies/:id`, `stockists`, `stockists/:id`, `orders`, `orders/:id`, `more`, `bills`, `payments`, `users`, `notifications`, `settings`, `messages`, `messages/:userId` (=ChatPage), `profile`, `help`, `login-history`. (18 routes)
- **DEAD / unreachable pages** (exist but no route, since `/login`&`/register` redirect to `/`): `Login.tsx`, `Register.tsx` + `StockistRegistration`/`PharmacyRegistration`, `ForgotPassword.tsx`, `ResetPassword.tsx`, `PendingApproval.tsx`, `Index.tsx` (a leftover "Welcome to Your Blank App" placeholder). Also many `More`-menu targets are unrouted (see §3.15).

### A5. Shared chrome
- **`AppLayout`**: OfflineBanner + TopNav + `<Outlet>` (main, `pb-20`) + BottomNav. Calls `useRealtimeNotifications()` (a literal no-op `() => {}`). Unused `Button`/`RefreshCw` imports (dead).
- **`TopNav`**: logo (Pill) → navigates `/`; business/owner name; chat button (bell → `notifications`), chat icon → `/admin/messages` for admin else `{base}/chats`. **Hardcoded badges: chat "1", bell "2"** (always). Avatar → `profile`.
- **`BottomNav`**: role tabs. Stockist: Home/Products/Pharmacies/Orders/More. Pharmacy: Dashboard/Orders/Stockists/More. Admin: Dashboard/Pharmacies/Stockists/Orders/More. Active state by path prefix.
- **`OfflineBanner`** + `useOfflineDetector` (navigator.onLine + online/offline events): fixed destructive banner when offline. No offline mutation queue.
- **`MenuPage`** (More hub): avatar header, optional search filter over item title/description, sections of items, red Logout button (`signOut()` then `navigate("/login")` — which redirects to `/`), footer **"Digi Swasthya v1.0.0"** (note constants say `APP_VERSION="2.0.0"` — mismatch).
- **`KpiCard`**, **`QuickActions`**, **`EmptyState`**, **`PaginationControls`** (hidden when totalPages≤1), **`BackButton`**, **`Spinner`** — presentational helpers.
- **`SharedProductCard`**: computes `stockQty = stock_quantity ?? quantity ?? 0`, `salePrice = sale_price ?? price ?? 0`, `isExpiringSoon = expiry < now+90d`, `isExpired = expiry < now`, `margin = round((sale−purchase)/sale×100)`. Badges: Out of Stock, Rx (requires_prescription), Hidden (pharmacy + `is_visible_to_customers===false`), Narcotic. Shows purchase rate+margin (stockist/pharmacy/admin), stock qty, up to 3 active batches +"+N more", admin sourceLabel, customer add-to-cart controls (role "customer" only — never used).
- **`SharedProductDetail`** (used by StockistProductDetail via 7-line wrapper `role="stockist"`, and AdminStockistDetail cards use `SharedProductCard role="admin"`): loads product, `product_media` gallery, batches (stockist only), and a **6-month sales chart** from `order_items` join `orders` (the join resolves via JOIN_MAP for order_items→products but NOT order_items→orders, so `item.orders` is undefined → chart always "No sales data yet"). Clone → inserts `{...product} name+" (Copy)"`; Delete → `confirm()` + delete (no-op) + navigate. Batch pricing table, InfoRows, total stock value = Σ activeBatch.stock×purchase_rate.

### A6. Money / status vocabulary (constants.ts + code)
- `ORDER_STATUS_COLORS`, `PAYMENT_STATUS_COLORS`, `ORDER_STATUS_LABELS` maps (Tailwind semantic tokens bg-primary/accent/warning/destructive). `getGreeting()` by local hour. `PRICE_FIELD_GUIDE`. `APP_VERSION="2.0.0"`.
- Price fallback convention: display = `sale_price || price || mrp`; on write `price` mirrors `sale_price`; `in_stock = stock_quantity > 0`.
- **No GST/SGST/CGST math anywhere** despite "TAX INVOICE" headers, product `gst_rate`, bill `gst_amount`. **No delivery-fee math anywhere** despite pharmacy delivery-config.
- Expiry windows are inconsistent: cards/detail use **90d**, StockistHome dashboard uses **60d**.

---

## PART B — ROLES & NAVIGATION SUMMARY

| Role | Base | Bottom nav | Identity (hardcoded) |
|---|---|---|---|
| Pharmacy | `/pharmacy` | Dashboard · Orders · Stockists · More | pp-001 / Anita Sharma / p-user-001 |
| Stockist | `/stockist` | Home · Products · Pharmacies · Orders · More | sp-001 / Rajesh Kumar / s-user-001 |
| Admin | `/admin` | Dashboard · Pharmacies · Stockists · Orders · More | Platform Admin / a-user-001 |

**DemoHome (`/`)**: title "Digi Swasthya", "Interactive Demo" pill, three role cards (Pharmacy→HealthPlus, Stockist→MedSupply India, Admin→Platform Operations) each with gradient icon + description. Tap writes `demo_role` and navigates `/${role}`. Footer © + Chameleon.

---

## PART C — STOCKIST MODULE

### 3.1 Home (`/stockist`, `StockistHome`) — 100% dummy, filtered to literal `sp-001`
- **KPI grid (8 cards):**
  1. Pending Orders = count `status==="pending"` among sp-001 orders (ord-003? no—ord-003 is sp-001 pending; ord-008 is sp-003). Among sp-001 orders {001 delivered,002 processing,003 pending,005 delivered,006 cancelled} → **1**.
  2. Total Products = sp-001 products count = **8**.
  3. Pharmacies = `DEMO_CIRCLE.length` = **4**.
  4. Revenue = Σ total_amount where status∈{delivered,completed} = 4560+12450 = **₹17,010**. → not clickable.
  5. Outstanding = Σ `DEMO_CIRCLE.outstanding` = 4839+9990+3250+0 = **₹18,079** → /payments.
  6. Today's Orders = count where created_at startsWith `2025-03-22` OR `2025-03-20` (hardcoded) among sp-001 = ord-003 (03-20) = **1**.
  7. Stock Value = Σ stock_quantity×price over sp-001 products.
  8. Pending Bills = literal **"1"** → /bill-history.
- **Expiring Soon card** (window 60d from real now 2026-07): among sp-001, only products with expiry < now+60d. Given all remaining sp-001 expiries are 2026-08+ except prod-007 (2025-04, already past). prod-007 IS < now+60d (it's in the past) so it lists as "expiring soon". Clickable → product detail.
- **Low Stock card**: sp-001 products where stock ≤ min → prod-004 (15/50), prod-007 (8/20).
- **Charts:** Monthly Order Trend (DEMO_MONTHLY_TREND bars).
- **Hardcoded lists:** Top Pharmacies by Revenue (Apollo 12450, City Care 8920, HealthPlus 4560, MedLife 3250 — sorted), Top Products by Sales (Paracetamol 250…Amoxicillin 95). Both static, not computed.
- Quick Actions (Create Order, Collect Payment→/pharmacies, Add Product, View Bills). Recent Orders = first 5 sp-001 orders with status badge (uses `ORDER_STATUS_COLORS`; `processing`/`confirmed` map to primary; ✓ covered).
- Note: `bg-${color}/10` dynamic Tailwind classes in Quick Actions won't be generated by JIT (styling bug — icons render without tint).

### 3.2 Products (`/stockist/products`, `StockistProducts`)
- Grid of `SharedProductCard` from `products` (eq stockist_id sp-001) + grouped `product_batches` (`batchesByProduct`). Loading spinner.
- Search box (name/brand/composition, client-side). `ProductFilters`: Brand select (first 30 PHARMA_BRANDS), Category select (16 categories), merged **Expiry** popover (mode "Expiring Before" = sets expiryTo only / "Date Range" = from+to, date inputs; chip label + clear), Sort select (Name/Price/Expiry/Newest), grid toggle 2/3 cols.
- Client filter+sort logic in `filtered` memo: name/brand/composition search, brand/category eq, expiry `>=from`/`<=to` string compare, sort by name.localeCompare / (sale_price||price) / expiry.
- Three top buttons: **Bulk Catalogue** (opens `BulkUploadCatalogue`), **Purchase Bill** (opens `BulkUploadPurchaseBill`), **Bulk Price** (opens Bulk Price dialog).
- **Bulk Price Update dialog fields:** Price Field (sale_price/mrp), Direction (increase/decrease), Type (percentage/flat), Value (number). Submit: `confirm()`, iterate all `filtered` in batches of 10, per product `current = product[field]||price||0`; percentage `delta=current×(val/100)`, new = current±delta; flat = current±val; `newPrice = max(0, round(×100)/100)`; if field=sale_price also mirror to `price`; `update` (no-op) then invalidate + toast `Updated N products`. Button label shows count.
- EmptyState with "Add Product" action when 0 filtered.

### 3.3 Add Product (`/stockist/products/add`, `StockistAddProduct`)
- Full page form. Sections: Product Images (`ProductGalleryUploader`, multi-upload to `product-images` bucket → placeholder public URLs, primary/reorder/remove), Basic Info (Name* + **Auto Fetch** button, Brand w/ searchable PHARMA_BRANDS dropdown + "add custom", Manufacturer, Category select), Pricing & Inventory (MRP, Sale Price, Purchase Rate, Stock Qty, Min Stock Level — all number), Batch & Compliance (Batch Number, Expiry Date [date], HSN Code, GST Rate select GST_RATES), Regulatory (Drug Schedule select, Drug Type select, Composition, Pack Type select, Pack Size, FSSAI License), Additional (Requires Prescription checkbox, Narcotic checkbox).
- **Auto Fetch** (`useAutoFillProduct` → `autofill-product-details`): enabled when name.trim().length≥3; fills ONLY empty fields (brand, manufacturer, composition, drug_type, pack_type, category, drug_schedule, pack_size, hsn_code, requires_prescription). Mock returns null → hook toasts "No details found for this product".
- Save: builds payload (`price = sale_price || price`, `in_stock = stock>0`), `insert products` (no-op), then insert `product_media` rows from gallery, toast, navigate to /products. Only validation: name required.
- **Dead code:** `counterfeitWarning` state declared, warning UI rendered conditionally, but never set → never shown.

### 3.4 Edit Product (`/stockist/products/:id/edit`, `StockistEditProduct`)
- Loads product + `product_media` (fallback to legacy `image_url`) into gallery. Same fields as Add (no min_order_quantity field here). Captures `originalPrice` for change detection.
- Auto Fetch identical.
- Save: update products (no-op) → delete+reinsert product_media → **price-change notification**: if `originalPrice !== newPrice`, query circle pharmacies `eq("status","active")` (NB: circle rows have no `status` column → filter compares undefined; with mock eq it filters to none, so 0 notifications) and insert `price_change` notifications per pharmacy user. Toast + navigate to detail.

### 3.5 Order Detail (`/stockist/orders/:id`, `StockistOrderDetail`) — LIFECYCLE ENGINE (~659 lines)
Queries: order (+pharmacy join), items (+products join), circle (sp-001 × order.pharmacy_id), existingBill (via bill_orders→bills).
- **`statusFlow = [pending, packed, dispatched, out_for_delivery, delivered]`.** `currentIdx = indexOf(status)`; `nextStatus` = next in flow or null. ⚠️ For seed orders with status `processing`/`confirmed`, `indexOf = -1` → **no "Mark as next" button** and no timeline progress.
- **Gating flags:** `canModify = pending|packed`; `canCancel = canModify`; `canReturn = delivered`; `canAssignStaff = packed|dispatched|out_for_delivery` (**computed but NO UI uses it — dead**); `canPartialDeliver = dispatched|out_for_delivery`; `canSplit = pending`.
- **Header:** back, #order_number + datetime, **Duplicate** button (clones order `SO{last8 of Date.now()}`, source platform, pending, + items; navigates to new). Status/payment/source/"Split Order" badges.
- **Cards:** Pharmacy info (name/owner/phone/email/address), Partial-delivery history (from `partial_delivery_items` JSON, hidden in seed), Items list (editable), Total Amount, Notes, Credit Note Applied (hidden), Delivery Proof img (hidden).
- **Actions & their coded effects (all writes no-op):**
  - `updateStatus(next)`: update status; on `packed` → RPC `deduct_product_stock` per item; on `delivered` → set `delivered_at`; always insert order notification to pharmacy user. Toast "marked as {label}". Invalidate.
  - Item editing: `startEditing` seeds qtys; `saveEdits` validates non-negative integers & not-all-zero, deletes zero-qty items, updates changed qtys, recomputes `total_amount`/`items_count`, adjusts circle via RPC by `newTotal−oldTotal`.
  - `cancelOrder`: `confirm()`; set cancelled; RPC circle `−total`; if was packed/dispatched → RPC `restore_product_stock` per item. Toast.
  - Record Partial Delivery (dialog: per-item qty input, max = item.qty): appends `{date, items[]}` to `partial_delivery_items` array via update.
  - Split Order (dialog, only if pending & >1 item; per-item qty max = qty−1): creates child order `{num}-S{base36(-3)}`, `order_source:"split"`, `parent_order_id`, moves qty (reduces/deletes originals), recomputes both totals.
  - Return Items (dialog, delivered only; per-item qty max=qty + reason): `refund = Σ (price||products.sale_price)×qty`; if order paid → circle `credit_balance += refund` (direct update), else RPC circle `−refund`. **Does NOT insert an `order_returns` row** (yet `order_returns` is read by the pharmacy-detail ledger).
  - View Bill (if existingBill) recomputes discount (percentage `subtotal×value/100` else flat) and opens BillPreviewDialog readOnly; else **Create Bill** → BillPreviewDialog.
  - **Print Packing Slip** (packed/dispatched/out_for_delivery): `window.open` + writes inline HTML table + `.print()`. Not saved.
  - Record Payment (if not paid & not cancelled) → `CollectPaymentDialog` (outstanding = circle.outstanding || order.total).

### 3.6 Create Order (`/stockist/orders/create`, `StockistCreateOrder`)
- Query params: `?pharmacy=` preselects. Fetches circle pharmacies (dropdown) + products (for matching).
- **Paste-order parsing:** Textarea + "Parse Order" → `parse-order-text` `{text, products:[{id,name}]}`. Maps `data.items` matching by `productId` or lowercase name equality; sets price = `sale_price||price||0`. Mock null → `items:[]` → toast "No items could be parsed."
- Manual add item (name blank, qty 1). Per item: parsed label, product match `Select`, qty stepper (min 1) + line total.
- `totalAmount = Σ price×qty`.
- **Credit check (warn, allow):** on submit, if selected circle `creditLimit>0 && outstanding+total>creditLimit` → open "Credit Limit Exceeded" dialog showing excess = `max(0, out+total−limit)`; "Proceed Anyway" continues.
- Create: needs pharmacy + ≥1 matched item. Insert `orders` (`ORD-{base36(Date.now())}`, status pending, `order_source = whatsapp` if text else `manual`, items_count = matched count) + order_items; RPC `decrement_stock` per item; RPC circle `+total`; notify pharmacy user. Navigate /orders.

### 3.7 Orders list (`/stockist/orders`, `StockistOrders`)
- `usePaginatedQuery` (pageSize 20, table orders, select `*, pharmacy_profiles(pharmacy_name)`). ⚠️ Filters passed via `.filter()` are ignored by the mock → **returns ALL orders across every stockist**, not just sp-001. On-page `filters` array (lines 30-33) is **dead/unused** (the query call passes its own filters).
- Client: search (order#/pharmacy name), tab groups via `getStatusGroup`: pending→{pending}; active→{packed,dispatched,out_for_delivery,processing}; done→{delivered,completed}; default→pending. ⚠️ `confirmed` & `cancelled` fall to default "pending" bucket → ord-004 (confirmed) & ord-006 (cancelled) appear under **Pending** tab; cancelled has no dedicated tab.
- Tab counts, per-card: #, pharmacy, date, status label+color, source pill (if ≠platform), payment pill (Pending/Partial/Paid) if ≠paid, total, items_count. PaginationControls.

### 3.8 Payments (`/stockist/payments`, `StockistPayments`)
- Header: Remind + **Record** button → `navigate("/stockist/record-payment")` — ⚠️ **unrouted → 404 (dead link)**.
- Summary tiles: Collected (Month) = Σ this-month payments (`created_at ≥ monthStart` of real now → seed payments are 2025 → **₹0**), Outstanding = Σ circle.outstanding (₹18,079), Approvals = approvals.length.
- Bank Details card (from stockist profile) + pencil → /business.
- Tabs: **Payments** (all sp-001 payments limit 50, +receipt Download for confirmed via `generateReceiptPdf`), **Bills** (all sp-001 bills; badge highlights only `status==="confirmed"` → none of seed's paid/draft/sent highlight), **Approvals** (orders where `delivery_payment_status==="pending_approval"` + join `delivery_staff(name)` — no such seed rows & no such table join → **always empty**). Approve → insert payment (collected_by delivery_staff) + set order approved/paid + RPC circle −amt. Reject → set rejected + zero collected.
- **Send Reminder dialog:** pharmacies with outstanding>0 in a Select; on send inserts `payment_reminder` notification + opens `wa.me/{91phone}?text=...` prefilled UPI/bank message. Toast.

### 3.9 Pharmacies / Circle (`/stockist/pharmacies`, `StockistPharmacies`)
- Circle list (sp-001, join pharmacy_profiles*) + orders summary for pending counts. Search (name/owner/pin). Filter chips: all / outstanding (out>0) / credit (credit_balance>0 & out=0) / nodues (out=0), each with live count.
- Per card: avatar, name/owner (→ detail), 3-stat row **Outstanding / Credit(=credit_limit, mislabeled) / Net Due** where `netDue = outstanding − credit_balance` shown "₹X CR" if negative. Pending-order line. "Collect Payment" bar if outstanding>0.
- Kebab menu: View Details, Edit (`EditPharmacyDialog`), Record Order (→create?pharmacy=), Generate Bill (`QuickBillDialog`), Remove from Circle (`confirm()` + delete row).

### 3.10 Pharmacy Detail (`/stockist/pharmacies/:id`, `StockistPharmacyDetail`, ~528 lines)
- Header actions: Order (→create?pharmacy=), Bill (QuickBillDialog). Unified card: name/owner, phone (tel/copy/wa.me), address, and **credit block**: `creditUsage = out/limit×100` (Progress capped 100), 3 stats Outstanding/Credit Limit/Available (= limit−out, red if negative).
- **Collect Payment** button (disabled when outstanding≤0) → CollectPaymentDialog.
- Tabs: Orders (expandable → loads items on expand, "View Full Details"), Payments, Bills (click → BillPreviewDialog readOnly), **Ledger**.
- **Ledger** = the only place with a real running balance: merges orders (debit=total_amount), payments (credit=amount), and `order_returns` (credit=refund_amount) ascending; `runningBalance += debit − credit`; table Date/Description/Debit/Credit/Balance; footer "Final Balance (Outstanding)". (`order_returns` query returns nothing → returns never appear.)
- Details dialog: business info, contact, address, Documents (Drug License / GST / Pharmacy Certificate — status derived purely from URL presence: uploaded/pending), Danger Zone → Remove from Circle.

### 3.11 Simpler ledger (`/stockist/pharmacies/:id/ledger`, `StockistPharmacyLedger`)
- Descending list of orders (−amount) + payments (+amount), no running balance, no returns. Summary tiles: Orders total, Paid total, Outstanding (from circle). Empty state.

### 3.12 Find Pharmacy (`/stockist/pharmacies/find`, `StockistFindPharmacy`)
- Approved `pharmacy_profiles` minus existing circle ids. When no search → default-filtered to stockist serviceable-area PINs; search matches name/owner/pin/city. `addToCircle` inserts circle row; duplicate error `23505` → toast "Already in your circle".

### 3.13 Bills
- **Bulk Bill (`/stockist/bulk-bill`)**: lists **delivered** sp-001 orders not in `bill_orders`; checkbox select / select-all. Generate: group by pharmacy → per pharmacy `subtotal=Σ total`, insert bill (`BILL-{ts}-{idx}`, **status `"final"`**, no discount/gst), link bill_orders, notify pharmacy. Toast "N bills for M orders."
- **Purchase Bill History (`/stockist/bill-history`)**: lists all sp-001 bills (join pharmacy). Badge highlights **`status==="finalized"`** (never matches seed). Header oddly titled "Purchase Bill History" though these are sales invoices.
- **`BillPreviewDialog`** (shared): fetches stockist+pharmacy; if orders present, derives paymentStatus (all paid / any paid / else). `billNumber = BILL-{base36(Date.now())}`. Renders "TAX INVOICE" (stockist header/PAN labelled "GSTIN/PAN"/bank block, Bill To, orders table S.No/Order#/Amount, Subtotal/Discount/Grand Total, Payment Details, **QR** to hardcoded `https://digi-swasthya-hub.lovable.app/verify-bill/{savedBillId|preview}`). Actions: Print (`window.print`), PDF (html2canvas→jsPDF download), WhatsApp (Web Share API w/ `wa.me` text fallback). Confirm & Generate → insert bill **status `"confirmed"`** (stores discount_type/value/subtotal/total, **no gst_amount**), link bill_orders, and **direct** circle `outstanding += total` (non-atomic; no RPC).
- **`QuickBillDialog`**: lists a pharmacy's orders (all, not just unpaid, despite subtitle), checkbox multi-select + select-all, discount (percentage/flat) → `subtotal=Σ selected total`, discount = pct `total×value/100` else flat, `total = max(0, subtotal−discount)`, hands to BillPreviewDialog.
- **Bill status vocabulary is inconsistent across 4 creators/readers:** BillPreviewDialog writes `"confirmed"`; BulkBill writes `"final"`; PurchaseBillHistory badge checks `"finalized"`; StockistPayments/PharmacyDetail badges check `"confirmed"`; AdminBills filter offers `draft`/`finalized`. Seed bills are `paid`/`draft`/`sent`. Practically nothing lines up.

### 3.14 Other stockist pages
- **Serviceable Areas (`/stockist/serviceable-areas`)**: list PINs; add (6-digit validation + dedupe) inserts; remove (`confirm()`) deletes.
- **Export Catalogue (`/stockist/export-catalogue`)**: CSV or XLSX export of sp-001 products via `xlsx` (real client-side).
- **Notifications (`/stockist/notifications`)**: notifications for s-user-001 (limit 50), tabs all/order/payment/system (note seed has a `stock`-type notif not covered by a tab → only in "all"), unread count, mark-read on click, mark-all-read. `typeIcons` map (offer/feedback icons exist).
- **More (`/stockist/more`)** MenuPage. Fetches business info. Sections ACCOUNT / FINANCE / OPERATIONS / REPORTS / PREFERENCES / COMMUNICATION. ⚠️ Many links point to **unrouted paths** → NotFound: `/stockist/record-payment`, `/stockist/analytics`, `/stockist/credit-notes`, `/stockist/returns`, `/stockist/manufacturer-returns`, `/stockist/expiry-management`, `/stockist/expiry-calendar`, `/stockist/stock-transfer`, `/stockist/batch-management`, `/stockist/staff`, `/stockist/delivery-routes`, `/stockist/holidays`, `/stockist/export`, `/stockist/reports`, `/onboarding/stockist`. "Price History" cynically points to `/stockist/products`.
- **Profile Settings (`/stockist/profile`)**: business/owner name, contact (email read-only w/ Verified/Unverified from `email_confirmed_at` — undefined in demo → **Unverified** + "Verify Now" via `auth.resend({type:"signup"})`; phone labelled "Coming Soon" but editable), address; save updates stockist_profiles + profiles.full_name. Change Password: re-auth via signInWithPassword then updateUser (min 8) — always succeeds in demo. Show/hide password toggles.
- **Business Details (`/stockist/business`)**: business name, business type select (3 options), PAN (uppercased); Regulatory Documents (Drug License/GST/Wholesale/FSSAI — upload→documents bucket→1yr signed URL→placeholder; status hardcoded "pending"); Address (state/city dependent selects from `indian-states-cities`, PIN); Bank (name/IFSC/account/holder/UPI). Save forces `approval_status:"pending"` + notifies all admins (type `profile_update`).
- **Settings (`/stockist/settings`)**: theme (light/dark/system → localStorage + class), Language list (only English enabled; Hindi "Coming Soon — April 1", others "Coming Soon"), Currency hardcoded "₹ INR (Indian Rupee)" disabled. Notifications: push/email/sms toggles with per-category checkboxes (Orders/Payments/Offers/Compliance), Sound, Vibration — all persist ONLY to `localStorage["app_preferences"]`.
- **Privacy & Security (`/stockist/privacy-security`)**: Change Password (min 6, updateUser mock-succeeds); Phone card **"Verified"** hardcoded; Active Sessions "**1 device**" hardcoded + live device parse from `navigator.userAgent` (Current/Now); Logout All (`signOut({scope:"global"})` → navigate /login → redirect /); Recent Login Activity (login_activity limit 10; seed has 3 for s-user-001... actually 2); **Delete Account is toast-only** (dialog → toast + signOut).
- **Help Center (`/stockist/help`)**: Custom `VideoPlayer` (full controls: play/seek/volume/mute/speed 0.5–2x/fullscreen) with **w3schools sample MP4s** as 4 "tutorials"; 6 hardcoded FAQs (Accordion); Feedback form (name/email/phone read-only, Feedback*, Category* select, Team select) → inserts `feedback` notifications to all admins; Contact tiles email `help@digiswasthya.in` / call `9672123711` / chat → /messages.
- **Product Detail (`/stockist/products/:id`)**: 7-line wrapper around `SharedProductDetail role="stockist" backTo="/stockist/products"`.

### 3.15 Stockist components
- **`ProductForm`** (dialog-based add/edit with single image_url upload + `min_order_quantity`): a complete parallel implementation but **not imported by any shipped page** (products page uses the full-page Add/Edit). Effectively dead.
- **`ProductCard`** (stockist-specific card w/ mousedown prefetch, 90d expiry flags): **also not used** — products grid uses `SharedProductCard`. Dead/parallel.
- **`CollectPaymentDialog`** — FIFO/manual allocation engine (see §8).
- **`BulkUploadCatalogue`** — client-side XLSX (no AI). Steps upload→processing (artificial setTimeouts)→preview (editable table)→uploading→done. Flexible header aliasing (sale_price accepts PTR/Rate/Selling Price/etc; stock accepts qty/Opening Stock/etc). Validation (name required, numeric mrp/sale/stock). Flexible expiry parsing: `YYYY-MM-DD` passthrough; `MM/YY→20YY-MM-28`; `MM/YYYY→YYYY-MM-28`; `DD/MM/YYYY→YYYY-MM-DD`; else raw. Bulk `insert` (no-op). Downloadable template.
- **`BulkUploadPurchaseBill`** — uploads to `documents` bucket, base64 → **`parse-purchase-bill`** (AI, returns null in demo → toast "Failed to extract"). Preview editable; confirm upserts by name (existing eq name → update, else insert), reports "N created, M updated".
- **`EditPharmacyDialog`** — circle credit_limit (number), notes, is_blocked toggle. Save updates circle; on block-state change inserts `circle_status` notification to pharmacy user (Account Blocked/Unblocked).
- **`QuickBillDialog`**, **`BillPreviewDialog`** — see §3.13.

---

## PART D — PHARMACY MODULE

Carts are ephemeral React state (no localStorage cart). No GST/delivery-fee applied anywhere.

### 4.1 Dashboard (`/pharmacy`, `PharmacyDashboard`) — reads DEMO_ORDERS directly, literal `pp-001`
- Greeting card. KPIs: Active Orders = count status∉{delivered,cancelled} among pp-001 (ord-001 delivered, ord-004 confirmed→active, ord-006 cancelled, ord-008 pending → 2); Total Purchase = Σ total; Pending Payments = count payment_status≠paid; **Connected Stockists = hardcoded `3`** (KpiCard).
- Quick Actions (Quick Order, Browse, Find Stockist, Payments). Recent Orders slice(0,5) w/ status color.

### 4.2 Quick Order (`/pharmacy/orders/quick`, `PharmacyQuickOrder`) — broken past step 1 in demo
- Textarea + "Find Best Stockists" → `parse-order-text` (`{text}` only, no products list). Mock null → `items:[]` → toast **"Could not parse items"**, stops.
- If items parsed (won't in demo): `findBestStockists` requires `profile.pin_code` (302001); serviceable_areas eq pin → stockist ids → approved stockists + their in-stock products; per stockist match each item via `product.name.includes(item.name)`; skip if 0 matches; `total = Σ (sale_price||price)×qty`; sort cheapest first; index 0 tagged "Best Price".
- **`getNextDeliveryDay` defined but never called; `nextDelivery` hardcoded "Available".** `WEEKDAYS` array unused otherwise.
- `placeOrder(stockist)`: re-match, insert order (`PH{last8}`, source `quick_order`, pending) + items, RPC circle +total, notify stockist, navigate to order.

### 4.3 Stockist storefront + cart (`/pharmacy/stockists/:id`, `PharmacyStockistDetail`)
- Header: name, ledger button (if circle) → /ledger/:id, chat. Blocked banner if `circle.is_blocked`.
- Info card: type, phone (tel/copy/wa.me), address; if circle: Outstanding + Credit Limit + usage% (destructive text when out/limit>0.8).
- Tabs Products / Orders. Products (in_stock only): add-to-cart (dedupe, ±1, drop 0), "Unavailable" when blocked. Orders history → detail.
- Cart = `useState`; `cartTotal = Σ price×qty` (price = sale_price||price||0); floating bottom bar (hidden when blocked): count/total, "⚠️ Nearing credit limit" when `out+cartTotal > creditLimit×0.8`.
- **`placeOrder` (A12 hard enforcement):** if `creditLimit>0 && out+cartTotal>creditLimit` → **abort with error toast** (blocks, unlike stockist side which warns). Else insert order (`PH{last8}`, source platform, pending, total=cartTotal) + items, RPC circle +cartTotal, notify stockist, clear cart, navigate.

### 4.4 Circle / discovery / ledger
- **Stockists (`/pharmacy/stockists`)**: pp-001 circle (join stockist). Cards show `Due: ₹{outstanding}` / `Limit: ₹{credit_limit}` (raw unformatted), chat button, → storefront. Empty state → Find.
- **Find Stockist (`/pharmacy/stockists/find`)**: approved stockists serving pp-001 PIN (via serviceable_areas). "In Circle" tag or Add. Insert zeroed circle row.
- **Browse (`/pharmacy/browse`)**: approved stockists (limit 50) + product search (`ilike name`, limit 20, only when search non-empty). Add stockist to circle. Product card → its stockist storefront.
- **Ledger (`/pharmacy/ledger/:stockistId`)**: orders (−amount) + payments (+amount) desc, no running balance; tiles Orders/Paid/Outstanding (outstanding read from circle, not computed). Empty state.

### 4.5 Orders / detail
- **Orders (`/pharmacy/orders`)**: pp-001 orders (join stockist) desc, staleTime 15s. Search (order#/stockist). Status tabs all/pending/packed/dispatched/delivered/cancelled with live counts (exact `status===tab`). Sort button cycles date→amount→status. Cards: status color, payment Badge, total.
- **Order Detail (`/pharmacy/orders/:id`)**: order (+stockist join), items (+products). Header Duplicate (clone `PH{last8}` + items). Status badge + **timeline** over statusFlow (hidden if cancelled). ⚠️ For `confirmed`/`processing` orders currentIdx=−1 so no steps lit. Stockist card. Delivery Proof img (hidden). Partial deliveries (hidden). Items + Total. **Download Invoice** (delivered only) → dynamic import `generate-receipt-pdf` (real client-side A5 PDF; passes payment_status as "paymentMethod"). **Verify Received Quantities** (delivered|out_for_delivery): dialog per-item qty; on mismatch inserts discrepancy notification to stockist (type order), else toast "no discrepancies".

### 4.6 Payments / settings
- **Payments (`/pharmacy/payments`)**: payments (join stockist), circle stockists. Outstanding summary (Σ circle.outstanding) + Pay Now. Tab Payments only. **Record Payment dialog:** Stockist select (shows outstanding), auto payment-details card (UPI/bank from stockist), Amount (>0), Method (upi/bank_transfer/cash/cheque), Reference ID, **UPI Proof upload** (method=upi only → documents bucket → 30-day signed URL → placeholder, appended to notes), Notes. Insert payment (**status `pending`**, collected_by `pharmacy`), RPC circle −amount, notify stockist. Toast.
- **Business Details (`/pharmacy/business`)**: pharmacy name/type/license; Documents (Drug License/GST/Pharmacy Certificate — upload → 1-day signed URL, status hardcoded pending); Address (state/city selects, PIN); **Operating Hours** (per-day open/close time inputs, defaults 09:00/21:00); **Delivery Configuration** (min_order_amount, delivery_fee, free_delivery_above — number inputs). Save updates profile (incl. operating_hours/delivery fields) + forces `approval_status:"pending"` + notifies admins. ⚠️ Operating hours & delivery config are **stored but never applied** to any cart/total.
- **Profile Settings (`/pharmacy/profile`)**: pharmacy name/type select (5)/license, owner name/designation, email read-only "**Verified**" hardcoded, phone/whatsapp, address (state/city/PIN). Save profile + profiles.full_name. Change Password (re-auth + updateUser, min 8, mock-succeeds).
- **Settings (`/pharmacy/settings`)**: identical structure to stockist settings (theme, languages, currency, notification prefs to localStorage).
- **More (`/pharmacy/more`)** MenuPage: ACCOUNT / OPERATIONS (Quick Order, Browse, Quick Order History) / FINANCE (Payments) / PREFERENCES / COMMUNICATION. All targets routed (subtitle fallback "Retail Pharmacy").
- **Notifications (`/pharmacy/notifications`)**: p-user-001 notifications desc (no limit), mark-read on click / mark-all. `typeIcons` order/payment/alert/feedback.
- **Help Center (`/pharmacy/help`)**: 5 hardcoded FAQs + contact tiles (same email/phone/chat). No videos, no feedback form (simpler than stockist).
- **Privacy & Security (`/pharmacy/privacy-security`)**: Change Password (min 6), Active Sessions (current device from userAgent slice), Logout All, Recent Login Activity (limit 5), **Delete Account toast-only** (uses `confirm()`).
- **Quick Order History (`/pharmacy/quick-order-history`)**: orders where `order_source==="quick_order"` (none in seed → empty). Inline status color (delivered→accent else warning).

---

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

## PART F — SHARED: CHAT & BILL VERIFICATION

- **ChatPage (`{role}/messages`, admin `/admin/messages/:userId`)**: support chat. Loads/creates `conversations` row for the current/target user, loads chat_messages, subscribes to no-op realtime. `loadQuickQuestions` = **3 hardcoded** ("Quick questions table removed in MVP"). Non-admin send: matches quick-question (prefix/inclusion) → insert canned bot answer; else `chat-bot` invoke (null) → catch → insert canned "forwarded to support" message. Bubble alignment by sender_type/sender_id/isAdmin. In demo, `getUser` returns the demo user, `user_roles` join returns rows (has_role via table not RPC) → admin detection works for a-user-001.
- **ChatListPage (`{role}/chats`)**: pinned **"Digi Swasthya Support"** conversation (from conversations+chat_messages) + **peer** chats built from `peer_messages` (sent eq sender, received eq receiver) with unread counts; names enriched from stockist/pharmacy/profiles + role from user_roles. `basePath` from URL. Support pinned first.
- **PeerChatPage (`{role}/chat/:peerId`)**: 1:1. peerInfo name lookup. `loadMessages` uses `.or(and(...),and(...))` which the mock **ignores** → returns the **whole `peer_messages` table** (visible quirk). Realtime subscribe no-op. Send inserts peer_messages (no-op → message won't appear). Bubble side by `sender_id === user.id`.
- **VerifyBill (`/verify-bill/:billId`, public, no layout)**: if `billId==="preview"` → "Bill Preview / QR active once generated." Else query bills by id → then stockist/pharmacy profiles → "Bill Verified" card (bill no, date, status, total, From/To city/state) or "Bill Not Found". Read-only. (Reachable at current origin, but the QR that BillPreviewDialog embeds points at the *lineage* domain `digi-swasthya-hub.lovable.app`, not the current origin — so scanning the QR won't hit this page.)

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

## PART H — PAYMENT, CREDIT & FIFO LOGIC (exact)

### `CollectPaymentDialog` — FIFO / manual allocation
- Fetches unpaid/partial orders (eq stockist+pharmacy, `in payment_status [unpaid,partial]`) ascending by created_at.
- **FIFO (auto):** `remaining = amount`; walk orders oldest-first: if `remaining ≥ orderAmt` → status `full`, remaining−=amt; else one `partial` (allocated=remaining, remaining=0); rest `none`.
- **Manual:** click orders to select → amount auto = Σ selected; each selected treated as `full`.
- "Full (₹{totalPending})" quick button. Payment method buttons cash/upi/bank_transfer/cheque + optional Reference.
- Record: insert `payments` (status `confirmed`, no method note for delivery), set each order payment_status (full→paid, partial→partial), and circle `outstanding = max(0, outstanding − amt)` **directly (non-atomic; no RPC; never touches credit_balance)**. Toast, close, onDone.

### Credit-limit enforcement (asymmetric)
- Pharmacy `placeOrder` (storefront) & quick-order: **hard block** when `out + cart > limit`.
- Stockist `StockistCreateOrder`: **warn but allow** (dialog "Proceed Anyway"). Storefront warning threshold `limit × 0.8`.

### Outstanding balance handling — inconsistent
- Generally read from `stockist_pharmacy_circle.outstanding`, adjusted by deltas via RPC `update_circle_outstanding` in "atomic" paths (create order, cancel, edits, returns-unpaid, pharmacy payment, quick order).
- **Direct writes** (non-atomic) in `CollectPaymentDialog` (outstanding only) and `BillPreviewDialog` (outstanding += total) and returns-paid (credit_balance +=).
- Ledgers: only `StockistPharmacyDetail` computes a running balance (with order_returns); all others just list signed rows or read circle.outstanding.

### Returns
- `handleReturnItems`: refund = Σ (price||sale_price)×qty; paid → credit_balance +=; unpaid → RPC outstanding −=. **Never inserts an `order_returns` row** (though that table is read by the pharmacy-detail ledger — so returns never surface there).

### PDFs / QR / WhatsApp
- Bills: html2canvas→jsPDF (A4); receipts: `generateReceiptPdf` (jsPDF A5, header/rows/total/"computer-generated"). QR via qrcode.react → hardcoded lineage domain. `wa.me` deep links for reminders, dispatch text, bill share.

---

## PART I — REALTIME / OFFLINE / PWA / STORAGE

- Realtime: none. `useRealtimeNotifications` = `() => {}`. Mock channel no-ops. TopNav badges hardcoded (chat 1, bell 2).
- Offline: `useOfflineDetector` (navigator.onLine + events) → `OfflineBanner` (#214). No mutation queue.
- PWA: `public/manifest.json` (per README/lineage) + hand-written `public/sw.js`. `vite.config.ts` uses react-swc + lovable-tagger only (no VitePWA), host `::`, port 8080, HMR overlay off.
- Storage buckets referenced: `product-images` (public URL), `documents` (signed URL), `platform` (logo) — all → `https://placeholder.com/...`.

---

## PART J — DATA MODEL (`types.ts`, PostgrestVersion 14.4)

- **22 tables:** bill_orders, bills, chat_messages, conversations, login_activity, login_attempts, messages, notifications, order_items, order_status_history, orders, payments, peer_messages, pharmacy_profiles, product_batches, product_media, products, profiles, serviceable_areas, stockist_pharmacy_circle, stockist_profiles, user_roles. (`order_returns` and `quick_questions` are **referenced in code but absent** from the types & mock.)
- **15 RPCs:** admin_override_customer_order_status, admin_override_order_status, admin_send_targeted_notification, check_login_rate_limit, decrement_stock, deduct_pharmacy_inventory, deduct_product_stock, get_flowboard_schema, has_role, hash_password, record_login_attempt, restore_pharmacy_inventory, restore_product_stock, update_circle_outstanding, verify_staff_credentials. (Mock stubs 3 → truthy; rest → null.)
- **Enums:** `app_role = admin|stockist|pharmacy|customer|doctor` (customer/doctor unused in this frontend); `approval_status = pending|approved|rejected` (`suspended` used as a string by AdminUsers though not in the enum).
- Constants: `PHARMA_BRANDS` (~100), `PRODUCT_CATEGORIES` (16), `GST_RATES` (0/5/12/18/28%), `DRUG_SCHEDULES` (None/H/H1/X/G/J), `DRUG_TYPES` (Allopathy/Ayurvedic/Homeopathy/Unani), `PACK_TYPES` (13). `INDIAN_STATES` (36) + `getCitiesForState`.
- Notification `type` values used across app: order, payment, stock, bill, approval, system, broadcast, targeted, payment_reminder, price_change, feedback, registration, circle_status, profile_update.
- 55 SQL migration files under `supabase/migrations/` (not applied by the mock; historical schema).

---

## PART K — EDGE CASES, BUGS & STUBS (consolidated)

**Data-layer no-ops:** every insert/update/delete/upsert, every `functions.invoke`, all non-trivial RPCs, realtime, and storage are no-ops returning success; writes "stick" only where a component also mutates React state / query cache.

**Mock-filter quirks:**
- `.filter()` ignored → `StockistOrders` (via usePaginatedQuery) shows orders from ALL stockists, unpaginated by stockist.
- `.or()` ignored → `PeerChatPage` shows the entire peer_messages table for any peer.
- Non-mapped joins resolve empty → StockistPayments approvals (delivery_staff join), SharedProductDetail sales chart (order_items→orders), all `order_returns` reads.

**Status/vocabulary mismatches:**
- Seed order statuses `confirmed`/`processing` aren't in `statusFlow` → no "Mark as next"/timeline for those; `confirmed`&`cancelled` land in the "pending" tab bucket on StockistOrders.
- Seed `order_source:"whatsapp_parse"` shown raw as a pill.
- Bill status chaos: writers use `confirmed`/`final`; readers check `confirmed`/`finalized`; seed uses `paid`/`draft`/`sent` → highlights rarely match.
- Seed payment method `neft` not in any picker.

**Dead / unreachable:**
- Pages with no route: Login, Register (+StockistRegistration/PharmacyRegistration 5-step wizards), ForgotPassword, ResetPassword, PendingApproval, Index. `/login`&`/register` redirect to `/`.
- Components not wired into shipped pages: `ProductForm`, `ProductCard` (parallel implementations; products page uses SharedProductCard + full-page Add/Edit).
- Dead links from menus/buttons: StockistPayments "Record" → `/stockist/record-payment`; StockistMore → ~15 unrouted routes; AdminProfileSettings "Change Password" → `/forgot-password`; AdminUsers "View" for doctor/customer.
- Dead variables/imports: `StockistOrderDetail.canAssignStaff` (no UI); `StockistOrders` on-page `filters` array; `StockistAddProduct.counterfeitWarning`; `AppLayout` Button/RefreshCw imports; `PharmacyQuickOrder.getNextDeliveryDay`/WEEKDAYS.
- Styling bug: StockistHome quick-action uses dynamic `bg-${color}/10` classes (not JIT-generated).

**Hardcoded figures:** TopNav badges 1/2; StockistHome "Pending Bills":1; PharmacyDashboard "Connected Stockists":3; AdminDashboard Active Today 12 / New Registrations 3 / Today ₹5,590 / Yesterday ₹4,200 / System Health Operational; StockistHome top-pharmacy & top-product lists; "Verified" phone & "1 device" in Privacy.

**Account/settings stubs:** delete-account (both roles) toast-only; password/email always mock-succeed; AdminSettings commission/GST/payment saves make no backend call; settings/theme persist only to localStorage; only English enabled (Hindi "Coming Soon — April 1"); currency read-only ₹ INR.

**Financial gaps:** no GST math despite gst_rate/gst_amount and "TAX INVOICE"; no delivery-fee math despite pharmacy delivery-config; returns never write order_returns; outstanding writes non-atomic in 2 paths.

**AI dead in demo:** parse-order-text (create-order, quick-order), autofill-product-details (Auto Fetch), parse-purchase-bill (bulk bill), chat-bot — all receive null → visible failures ("No items could be parsed", "No details found", canned support reply).

**Misc:** AdminLoginHistory reads the empty `login_attempts` (data is in `login_activity`) → always empty; MenuPage footer "v1.0.0" vs APP_VERSION "2.0.0"; BillPreviewDialog QR points at lineage domain (won't reach local VerifyBill); StockistBusinessDetails price-change notification filters circle by non-existent `status="active"` → 0 recipients; SharedProductDetail sales chart always empty (join unsupported).

---

*Read directly from source: App.tsx, integrations/supabase/{client,types}.ts, lib/{dummy-data,constants,pharma-brands,indian-states-cities,format-date,generate-receipt-pdf}.ts, all hooks, every page under src/pages/**, every component under src/components/{layout,shared,stockist,registration}, and all 8 supabase/functions/*.*

---
