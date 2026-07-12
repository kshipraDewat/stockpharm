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
- 46 SQL migration files under `supabase/migrations/` (not applied by the mock; historical schema).

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

# EXPANSION — COMPLETE APPLICATION DOCUMENTATION (Parts L–R)

The parts below deepen Parts A–K with exact internals, full seed-record dumps, dead-page documentation, PWA/build detail, a library/hook/component reference, and end-to-end user journeys. Everything below is read verbatim from source; nothing is inferred.

## PART L — MOCK CLIENT INTERNALS (`client.ts`, 433 lines — precise reference)

### L1. Thenable execution model
`MockQueryBuilder` is not a Promise; it implements `then(resolve, reject)` which synchronously calls a private `execute()` and resolves with its return value. Consequence: `await supabase.from(...)...` works, and every query resolves in the same microtask — there is no network latency anywhere in the app (spinners flash at most one frame). `MockRpcBuilder` likewise implements only `then(resolve)` (no reject parameter at all — an RPC can never reject).

### L2. `execute()` decision order
1. If `isInsert` (set by `insert()` OR `upsert()` — upsert is literally aliased to insert): normalize to array, map each item to `{...item, id: item.id || \`demo-${Date.now()}-${Math.random().toString(36).slice(2)}\`, created_at: item.created_at || new Date().toISOString()}`, return `{data: single|array, error:null, count}`. **The backing array is never touched.** Caller-supplied `id`/`created_at` are honored.
2. If `isUpdate`: run `applyFilters` over the real table data, return `{data: filtered.map(row => ({...row, ...updateData})), error:null, count}` — a projection of what the update *would* produce. Backing array untouched.
3. If `isDelete`: return `{data:null, error:null, count:0}` without even applying filters.
4. Read path: `applyFilters` → `resolveJoins` per row → then, in order: `head+count` → `{data:null, count}`; `count` → `{data, count}`; `single()`/`maybeSingle()` → `{data: filtered[0] || null, error:null}` — note `.single()` on an empty result returns `data:null` with **no error**, unlike real PostgREST which errors; code that relies on the PGRST116 error path can never hit it.

### L3. `applyFilters` semantics & ordering quirks
Filters are stored as a flat `{method, args}` list and applied **in call order**, including `order`, `limit`, `range` which are just more "filters." So `.limit(5).order(...)` would slice before sorting (in practice all app code orders before limiting). `order` uses plain `<`/`>` (lexicographic for strings — correct for ISO timestamps, wrong for mixed-case names, tolerable). `like`/`ilike` are identical (both case-insensitive substring after stripping `%`). `is` only implements the `null` case (treats `undefined` as null too). `not` only implements the `("col","is",null)` triple. There is a `case "or"` in the switch, but nothing ever pushes an `or` filter because the builder's `or()` returns `this` without pushing — the case is dead code with the comment "Simple OR support - just return all for now."

### L4. `resolveJoins` mechanics
Parses the select string with regex `/(\w+)\(([^)]*)\)/g` — every `name(fields)` token is treated as a potential join. Only tokens whose name appears in `JOIN_MAP[table]` are resolved (many-to-one lookups via `find`); all others are silently skipped, so the embedded key is simply **absent** (not null) on the returned row. Nested embeds like `bills(*, pharmacy_profiles(...))` cannot work (regex is non-recursive). `count` aggregates inside selects are not parsed. When a mapped join finds no matching parent row it sets the key to `null` explicitly.

### L5. Synthesized-table record dump (defined inside client.ts)
- `DEMO_PROFILES` (6): prof-001 Rajesh Kumar/s-user-001/9876543210; prof-002 Anita Sharma/p-user-001/9988776655; prof-003 Platform Admin/a-user-001/9000000001; prof-004 Vikram Singh/p-user-002 (citycare@mail.com); prof-005 Priya Mehta/p-user-003 (medlife@mail.com); prof-006 "PharmaCorp Manager"/s-user-002 (pharmacorp@mail.com). All have `avatar_url:null`, `tos_accepted_at:null`, `data_download_requested_at:null`, `last_active_at` in Mar 2025. Users p-user-004/005 and s-user-003/004 have **no profile row** (name enrichment for them falls back elsewhere).
- `DEMO_USER_ROLES` (7): stockist×3 (s-user-001/002/003), pharmacy×3 (p-user-001/002/003), admin×1 (a-user-001). p-user-004/005 and s-user-004 have **no role row**.
- `DEMO_LOGIN_ACTIVITY` (3, all `status:"success"`): la-001 s-user-001 Chrome/Windows 192.168.1.10 Jaipur 2025-03-23; la-002 s-user-001 Mobile Safari/iOS same IP 2025-03-22; la-003 p-user-001 Chrome/Android 10.0.0.5 2025-03-23. (So the stockist Privacy page shows 2 rows, pharmacy shows 1, admin 0.)
- `DEMO_PEER_MESSAGES` (3): a p-user-001 ↔ s-user-001 thread about Amoxicillin 500mg availability (pm-001 read, pm-002 read, pm-003 unread) — textually identical to `DEMO_MESSAGES` in dummy-data.ts (msg-001..003), a duplicated conversation living in two tables (`peer_messages` powers chat pages; `messages` is mapped in TABLE_DATA but **no page ever queries the `messages` table**).
- `DEMO_PRODUCT_BATCHES` (3): pb-001 prod-001 CR2024-001 exp 2026-08-15 stock 200 (22/28/35); pb-002 prod-001 CR2024-002 exp 2026-10-20 stock 250; pb-003 prod-002 NV2024-045 exp 2026-05-20 stock 280.
- `DEMO_CONVERSATIONS` (1): conv-001, user s-user-001, role stockist. `DEMO_CHAT_MESSAGES` (2): cm-001 user "How do I bulk upload products?" / cm-002 bot "You can go to the Products page and click the 'Bulk Upload' button."
- `DEMO_BILL_ORDERS` (2): bill-001↔ord-001, bill-002↔ord-005 (only the two *paid* bills are linked to orders; bills 003–005 have no order linkage, and orders other than 001/005 are unbilled — which is why StockistBulkBill's "delivered & unbilled" list is empty for sp-001: its only delivered orders, 001 and 005, are both already in bill_orders).
- `DEMO_ORDER_STATUS_HISTORY` (3, all ord-001): null→pending (by p-user-001), pending→confirmed, confirmed→delivered (by s-user-001), `order_type:"b2b"`.
- `DEMO_LOGIN_ATTEMPTS`: `[]` (empty; the AdminLoginHistory data source).
- `TABLE_DATA` maps exactly 22 table names (products, orders, order_items, bills, bill_orders, payments, stockist_pharmacy_circle, notifications, messages, peer_messages, serviceable_areas, pharmacy_profiles, stockist_profiles, profiles, user_roles, login_activity, login_attempts, product_batches, product_media, conversations, chat_messages, order_status_history). Querying any unmapped table (e.g. `order_returns`, `quick_questions`, `delivery_staff`, `customer_profiles`) returns `[]` without error.

### L6. Auth/storage/realtime stub exact returns
- `auth.getUser()` → `DEMO_USERS[localStorage.demo_role || "pharmacy"]` — the only stateful stub. `signInWithPassword` **always** returns `{user: DEMO_USERS.pharmacy, session:{}}` regardless of credentials (even "stockist logins" get the pharmacy user object back — irrelevant because Login.tsx is unrouted, and re-auth flows only check `error`). `updateUser` returns the pharmacy user too. `signUp` returns `{user:{id:\`new-${Date.now()}\`}, session:null}`.
- `MockAuth` has **no** `resend()` method — StockistProfileSettings' "Verify Now" (`auth.resend({type:"signup"})`) would throw `TypeError: supabase.auth.resend is not a function` at runtime (caught or surfaced depending on call site).
- `storage.from(anyBucket)` returns a fresh `MockStorageBucket` — bucket name is ignored entirely.
- `channel(name)` ignores the name; `.on()` accepts and discards any callback; `removeChannel` is `() => {}`.

## PART M — COMPLETE SEED DATA REFERENCE (`dummy-data.ts`, 211 lines — record-by-record)

### M1. Stockist profiles (4)
| id | name | user | city/PIN | status | extras |
|---|---|---|---|---|---|
| sp-001 | MedSupply India Pvt Ltd | s-user-001 | Jaipur 302017 | approved | Full profile: type `wholesale_distributor`, phone/WA 9876543210, email rajesh@medsupply.in, addr "42, Industrial Area, Phase-2", PAN ABCDE1234F, HDFC Bank a/c 50100123456789 IFSC HDFC0001234 holder Rajesh Kumar, UPI rajesh@upi, all 4 doc URLs null, drug_license_expiry 2027-12-31 |
| sp-002 | PharmaCorp Distributors | s-user-002 | Jaipur 302020 | approved | thin row (no bank/PAN/docs fields) |
| sp-003 | LifeCare Wholesale | s-user-003 | Jodhpur 342003 | approved | thin row |
| sp-004 | MedWholesale India | s-user-004 | Udaipur 313004 | **pending** | thin row (the admin approval-queue item) |

### M2. Pharmacy profiles (5)
| id | name | owner | city/PIN | status | extras |
|---|---|---|---|---|---|
| pp-001 | HealthPlus Pharmacy | Anita Sharma (Proprietor) | Jaipur 302001 | approved | Full: type retail, license DL-RAJ-2024-00456, phone/WA 9988776655, email anita@healthplus.in, addr "12, MG Road, C-Scheme", ICICI a/c 12340056789 IFSC ICIC0001234, UPI anita@upi, docs null, license expiry 2027-06-30, min_order_amount 500 (+ duplicate field `minimum_order_amount:500`), delivery_fee 50, free_delivery_above 2000, operating_hours `{}` |
| pp-002 | City Care Pharmacy | Vikram Singh | Jaipur 302005 | approved | thin |
| pp-003 | MedLife Stores | Priya Mehta | Jodhpur 342001 | approved | thin |
| pp-004 | Apollo Medical | Suresh Patel | Udaipur 313001 | approved | thin |
| pp-005 | Wellness Pharmacy | Neha Gupta | Kota 324001 | **pending** | thin |

### M3. Products (12) — full pricing/stock matrix
| id | name (brand, mfr) | cat | MRP/Sale/Purchase | stock/min | GST | sched | Rx | batch, expiry | MOQ |
|---|---|---|---|---|---|---|---|---|---|
| prod-001 (sp-001) | Paracetamol 500mg (Crocin, GSK) | Analgesic | 35/28/22 | 450/50 | 12% | OTC | no | CR2024-001, 2026-08-15 | 10 |
| prod-002 (sp-001) | Amoxicillin 250mg (Novamox, Cipla) | Antibiotic | 120/96/78 | 280/30 | 12% | H | yes | NV2024-045, 2026-05-20 | 5 |
| prod-003 (sp-001) | Omeprazole 20mg (Omez, Dr. Reddy's) | Gastro | 85/68/55 | 320/40 | 12% | H | no | OM2024-112, 2026-11-10 | 10 |
| prod-004 (sp-001) | Metformin 500mg (Glycomet, USV) | Anti-diabetic | 45/36/28 | **15/50 low** | **5%** | H | yes | GL2024-089, 2026-03-25 (past) | 10 |
| prod-005 (sp-001) | Atorvastatin 10mg (Atorva, Zydus) | Cardiovascular | 150/120/95 | 200/25 | 12% | H | yes | ATV2024-067, 2026-07-30 | 5 |
| prod-006 (sp-001) | Cetirizine 10mg (Cetzine, Alkem) | Antihistamine | 30/24/18 | 500/60 | 12% | OTC | no | CTZ2024-230, 2026-12-15 | 20 |
| prod-007 (sp-001) | Azithromycin 500mg (Azithral, Alembic) | Antibiotic | 180/144/115 | **8/20 low** | 12% | H | yes | AZ2024-178, **2025-04-30 expired** | 5 |
| prod-008 (sp-001) | Pantoprazole 40mg (Pan-D, Sun Pharma) | Gastro | 210/168/135 | 175/30 | 12% | H | no | PD2024-445, 2026-09-20 | 5 |
| prod-009 (sp-002) | Ibuprofen 400mg (Brufen, Abbott) | Analgesic | 40/32/25 | 600/80 | 12% | OTC | no | BR2024-310, 2026-10-10 | 10 |
| prod-010 (sp-002) | Amlodipine 5mg (Amlong, Micro Labs) | Cardiovascular | 55/44/35 | 350/40 | 12% | H | yes | AM2024-189, 2026-06-15 | 10 |
| prod-011 (sp-003) | Dolo 650mg (Dolo, Micro Labs) | Analgesic | 32/26/20 | 800/100 | 12% | OTC | no | DL2024-550, 2027-01-20 | 20 |
| prod-012 (sp-003) | Montelukast 10mg (Montair, Cipla) | Respiratory | 195/156/125 | 140/20 | 12% | H | yes | MT2024-290, 2026-04-10 (past) | 5 |

All: `price` mirrors `sale_price`, `in_stock:true` (even prod-007's 8 units), `unit:"Strip"`, `pack_type:"Strip"` (note: **"Strip" is not one of the 13 PACK_TYPES options**, so the Edit form's pack-type Select won't show it selected), drug_type Allopathy, `is_narcotic:false`, `image_url:null`, `reserved_quantity:0`, `fssai_license:null`, one-line `description`. Relative to real "today" (mid-2026), expiries for prod-004 (2026-03-25), prod-007 (2025-04-30) and prod-012 (2026-04-10) are already in the past; the "90-day expiring soon" window at review time also captures prod-005 (2026-07-30) and prod-001 (2026-08-15) depending on the current date. Seed product categories ("Analgesic", "Gastro", "Anti-diabetic", "Antihistamine") do **not** match the `PRODUCT_CATEGORIES` constant options ("Analgesics", "Gastrointestinal", "Antidiabetic", "Antihistamines") — so the Products-page Category filter never matches any seed product, and edit forms show an unselected category.

### M4. Orders (8) — full matrix
| id | number | stockist→pharmacy | status | pay | total | items_count | source | notes / extras |
|---|---|---|---|---|---|---|---|---|
| ord-001 | ORD-2025-0001 | sp-001→pp-001 | delivered | paid | 4,560 | 5 | platform | delivered_at 2025-03-02, delivery collected 4,560 via upi |
| ord-002 | ORD-2025-0002 | sp-001→pp-002 | processing | unpaid | 8,920 | 8 | whatsapp_parse | "Urgent delivery needed" |
| ord-003 | ORD-2025-0003 | sp-001→pp-003 | pending | unpaid | 3,250 | 3 | platform | |
| ord-004 | ORD-2025-0004 | sp-002→pp-001 | confirmed | unpaid | 6,780 | 6 | platform | |
| ord-005 | ORD-2025-0005 | sp-001→pp-004 | delivered | paid | 12,450 | 12 | whatsapp_parse | collected 12,450 cash |
| ord-006 | ORD-2025-0006 | sp-001→pp-001 | cancelled | unpaid | 1,890 | 2 | platform | "Pharmacy cancelled - found alternative" |
| ord-007 | ORD-2025-0007 | sp-002→pp-003 | dispatched | unpaid | 5,600 | 4 | platform | |
| ord-008 | ORD-2025-0008 | sp-003→pp-001 | pending | unpaid | 2,340 | 3 | platform | |

All carry `assigned_staff_id:null`, `applied_credit_note_id:null`, `credit_discount:0`, `partial_delivery_items:null`, `parent_order_id:null`, `delivery_proof_url:null`. `items_count` values (5,8,3,6,12,2,4,3) do **not** match actual seed item rows (3,3,2,0,0,0,0,0) — decorative counts.

### M5. Order items (8 rows, 3 orders only)
ord-001: 50×prod-001@28 + 30×prod-003@68 + 40×prod-006@24 = 1400+2040+960 = ₹4,400 (order says ₹4,560 — a ₹160 discrepancy; header totals are not derived from items anywhere).
ord-002: 25×prod-002@96 + 20×prod-005@120 + 15×prod-008@168 = 2400+2400+2520 = ₹7,320 (order says 8,920).
ord-003: 30×prod-004@36 + 10×prod-007@144 = 1080+1440 = ₹2,520 (order says 3,250). All `requested_batch:null`. Orders 004–008 render "No items" on every detail page.

### M6. Bills (5), Payments (4), Circle (4), Notifications (8), Serviceable areas (5)
- Bills: bill-001 sp-001→pp-001 **paid** sub 4560 gst 547 disc 5% total 4,839 due 2025-04-01; bill-002 sp-001→pp-004 **paid** sub 12450 gst 1494 disc 3% total 13,524; bill-003 sp-001→pp-002 **draft** sub 8920 gst 1070 no disc total 9,990; bill-004 sp-002→pp-001 **sent** sub 6780 gst 814 flat-200 total 7,394 due 2025-04-19; bill-005 sp-002→pp-003 **draft** sub 5600 gst 672 total 6,272. (Seed gst_amount is exactly 12% of subtotal for all five; totals = subtotal+gst−discount — arithmetic the app itself never performs.)
- Payments: pay-001 4,839 upi confirmed ref UPI-REF-001 (pp-001); pay-002 13,524 cash confirmed "Collected on delivery", collected_by "Delivery boy" (pp-004); pay-003 5,000 **neft pending** ref NEFT-20250315-001 "Partial payment" (pp-002); pay-004 7,394 cheque pending ref CHQ-456789 (sp-002→pp-001).
- Circle (all sp-001): cir-001 pp-001 limit 50,000 out 4,839 bal 45,161 terms 30d "Good payment history" last-pay 2025-03-02; cir-002 pp-002 30,000/9,990/20,010 terms 15d; cir-003 pp-003 25,000/3,250/21,750 terms 30d last-pay null; cir-004 pp-004 40,000/0/40,000 "Premium customer". All `is_blocked:false`. Note cir-001's outstanding (4,839) equals paid bill-001's total — internally inconsistent (it was paid by pay-001) but presented as the live figure everywhere.
- Notifications: s-user-001 ×3 (order #0003, payment ₹4,839, low-stock Azithromycin), p-user-001 ×3 (order confirmed #0004, delivered #0001, bill #0004), a-user-001 ×2 (Wellness Pharmacy + MedWholesale India registration approvals). Unread: notif-001,003,004,006,007,008.
- Serviceable areas: sp-001 → 302001, 302005, 302017, 342001, 313001 (covers pp-001/002/003/004 PINs; other stockists serve no PINs, so pharmacy Find Stockist at PIN 302001 finds only MedSupply).
- Helpers `getPharmacyName(id)`/`getStockistName(id)` fall back to "Unknown Pharmacy"/"Unknown Stockist".
- Chart constants: `DEMO_MONTHLY_TREND` Oct-24→Mar-25 orders 12/18/15/22/28/34, revenue 45k/67k/52k/84k/105k/128k; `DEMO_ADMIN_GROWTH` users 8/12/6/15/10/18.

## PART N — DEAD AUTH & REGISTRATION PAGES (exist on disk, unreachable via routes)

These six pages plus two wizard components compile and lazy-load fine but have no live route (`/login` and `/register` are `<Navigate to="/">`; `/forgot-password`, `/reset-password`, `/pending-approval` have no Route at all — hitting them shows NotFound). Documented as written:

### N1. `Login.tsx` (233 lines)
- Role picker "Login as" with 2 visible cards (Pharmacy "Manage store", Stockist "Distribute"); a **hidden admin unlock**: tapping the Pill logo **5× within 1.5s** sets adminMode + toasts "Admin login enabled" and adds a 3rd Admin card ("Platform ops"); additionally in `import.meta.env.DEV` a visible "Admin Login (Dev)" button does the same.
- **PWA install banner**: listens for `beforeinstallprompt`, shows an "Install Digi Swasthya" bar with Install button (calls `prompt()`); hidden when already `display-mode: standalone`.
- Login flow: rate-limit RPC `check_login_rate_limit` (block with "Too many failed attempts… 15 minutes" if false) → `signInWithPassword` (on error: `record_login_attempt(false)` + specific toasts for "Invalid login"/"Email not confirmed") → `record_login_attempt(true)` → fetch `user_roles` and verify the selected role is held (else signOut + "does not have X access") → for stockist/pharmacy fetch profile `approval_status`: pending → `/pending-approval`; rejected → signOut + error → else toast "Login successful!" + navigate `/{role}`. Remember-me checkbox is UI-only (state never read). Show/hide password toggle. Footer "Digi Swasthya — made with ❤️" + Chameleon copyright.
- Under the mock, every branch "succeeds" (rate limit true, sign-in success, has_role via table rows) — but the page is unreachable anyway.

### N2. `Register.tsx` (57 lines) + wizards
Account-type chooser (Pharmacy / Stockist cards; note dynamic `border-${color}/50` / `bg-${color}/10` classes — same Tailwind-JIT issue as StockistHome). Renders one of two 5-step wizards:
- **`StockistRegistration.tsx`** (456 lines). Steps: Business → Documents → Contact → Bank → Complete, with icon step-indicator and progress bars. Fields — Step 0: Business Name*, Business Type* (Select: "Pharmaceutical Stockist" / "Pharmaceutical Wholesale Distributor" / "Medical Representative"; choosing Medical Representative reveals a Company/Brand* select over PHARMA_BRANDS + custom), PAN* (uppercased, maxLength 10). Step 1 (all optional to proceed): 4 `DocField`s (Drug License, GST Certificate, Wholesale License, FSSAI License) each = license-number input + file upload (pdf/jpg/png "up to 5MB" — not enforced) with uploaded-state row (Eye preview button is decorative, RefreshCw replaces, Trash removes) and a hardcoded "⏳ Pending" chip; MR flow also has an mrAgreement file slot. Step 2: Phone*, WhatsApp, Email*, Password* ("min 6 chars" placeholder only — no length validation), Address*, State*/City* (dependent selects), PIN* (digits-only, 6 max), plus a repeatable **Serviceable Area PIN Codes** list (6-digit validated, dedup). Step 3: Bank Name*, Account Number*, IFSC* (uppercased), UPI ID, Account Holder Name*. Submit (`Review & Complete` on step 3): `auth.signUp` (emailRedirectTo origin, full_name = business name) → insert `user_roles` (stockist) → upload each file to `documents` bucket at `{userId}/{key}-{ts}.{ext}` + `getPublicUrl` → insert `stockist_profiles` (all fields incl. 4 doc URLs; comment notes "PIN code restriction removed for MVP") → insert `serviceable_areas` rows → look up all admin `user_roles` and insert `registration` notifications ("X has registered as a stockist and awaits approval") → toast + jump to step 4 (Complete screen). Header has Login and **Skip** buttons (both → `/login`).
- **`PharmacyRegistration.tsx`** (336 lines). Same skeleton; steps Pharmacy → Documents → Contact → Bank → Complete. Step 0: Pharmacy Name*, Pharmacy Type*, License Number. Step 1: 2 DocFields (Drug License, GST). Step 2 adds Owner Name*, Owner Designation, Owner Contact alongside phone/email/password/address. Step 3 bank block is **entirely optional** (`canProceed` returns true). Submit mirrors the stockist flow (role `pharmacy`, `pharmacy_profiles` insert, admin `registration` notifications).

### N3. Other dead pages
- **`ForgotPassword.tsx`** (89): email form → `auth.resetPasswordForEmail(email, {redirectTo: origin + "/reset-password"})`; success flips to a "check your inbox and spam folder" state with Back to Login. (Mock always succeeds.)
- **`ResetPassword.tsx`** (96): detects recovery via `onAuthStateChange("PASSWORD_RECOVERY")` OR `location.hash` containing `type=recovery`; otherwise shows "Invalid or expired reset link" + Request New Link. Form: new+confirm password (match check, min 6) → `auth.updateUser({password})` → navigate `/login`. Under the mock `onAuthStateChange` never fires an event, so only the hash path could ever unlock it.
- **`PendingApproval.tsx`** (26): static "Verification Pending" card with warning clock icon, "(This is a demo screen)" caption, Back to Home button.
- **`Index.tsx`** (14): Lovable scaffold leftover — "Welcome to Your Blank App / Start building your amazing project here!".
- **`NotFound.tsx`** (routed at `*`): logs `console.error("404 Error: …", pathname)`, shows 404 + the attempted path in a `<code>` chip + Go Back / Home buttons. This is the landing page for every dead More-menu link listed in §3.15.

## PART O — PWA, SERVICE WORKER, HTML SHELL & BUILD TOOLING

### O1. `index.html`
Lovable-generated shell: title "Digi Swasthya", meta description "…manage their inventory and orders seamlessly on the go..", author "Lovable", OG/Twitter cards pointing at a Lovable R2 preview screenshot (`…lovable.app-1771853612079.png`), two leftover `<!-- TODO -->` comments. PWA head tags: manifest link, `theme-color #16a34a` (green), apple-mobile-web-app tags, apple-touch-icon + favicon = `/pwa-icon-192.svg`. Inline script registers `/sw.js` on `load` with `.catch(() => {})`.

### O2. `public/sw.js` (68 lines) — a real, functioning service worker
- `CACHE_NAME = "digi-swasthya-v3"`; precaches `['/', '/index.html']` on install. Deliberately does **not** `skipWaiting()` on install ("wait for user to accept update") — instead listens for a `{type:"SKIP_WAITING"}` postMessage… **which no app code ever sends** (grep: nothing posts it), so a waiting SW stays waiting until all tabs close. `activate` deletes old caches + `clients.claim()`.
- Fetch strategy (GET only): network-first for `/rest/`, `/auth/`, `/functions/` paths and navigations (navigations are cached on success; fallback = cache match, then cached `/`); cache-first with populate for static extensions (js/css/images/fonts); default network-with-cache-fallback. The API paths are vestigial (the mock client makes no network calls), but navigation caching gives genuine offline reload capability.

### O3. `public/manifest.json`
name "Digi Swasthya", short_name "DigiSwasthya", description "Manage pharmacy and stockist operations seamlessly", start_url/id/scope "/", display standalone, background #ffffff, theme #16a34a, orientation portrait, categories ["business","medical"], icons: favicon.ico 64, pwa-icon-192.svg, pwa-icon-512.svg, pwa-icon-maskable.svg.

### O4. Build & tooling
- `package.json` (name `vite_react_shadcn_ts` v0.0.0): scripts dev/build/build:dev/lint/preview/test (`vitest run`)/test:watch. Deps of note: `@supabase/supabase-js ^2.97.0` **installed but never imported** (the mock replaces it), full Radix suite, jspdf ^4.2.0, html2canvas, xlsx ^0.18.5, qrcode.react ^4.2.0, recharts ^2.15.4, react-markdown (unused by pages reviewed), zod + react-hook-form (used only by the shadcn `form.tsx` primitive), next-themes (unused — theming is hand-rolled), vaul, embla, input-otp, cmdk. Dev: vitest ^3.2.4 + Testing Library + jsdom, lovable-tagger, tailwindcss 3.4, TS 5.8.
- `vite.config.ts`: react-swc, host `::` port 8080, HMR overlay off, `@` alias, `lovable-tagger` componentTagger in dev only. **No PWA plugin** — sw.js/manifest are static files.
- `vitest.config.ts`: jsdom, globals, setup `src/test/setup.ts` (imports jest-dom + stubs `window.matchMedia`). The entire test suite is **one placeholder test**: `src/test/example.test.ts` — `expect(true).toBe(true)`.
- `tailwind.config.ts`: darkMode `["class"]`, font `Lexend`, HSL CSS-variable palette incl. custom `success`/`warning` tokens (semantic tokens the status maps rely on), container 2xl 1400px, tailwindcss-animate.

## PART P — LIBRARY & HOOK REFERENCE (every file in `src/lib` and `src/hooks`)

- **`lib/utils.ts`**: just `cn()` = twMerge(clsx(...)).
- **`lib/format-date.ts`**: `formatDate` "dd MMM yyyy", `formatDateTime` "dd MMM yyyy, hh:mm a", `formatRelative` (date-fns `formatDistanceToNow` + suffix); all wrap in try/catch returning `String(date)` on parse failure.
- **`lib/generate-receipt-pdf.ts`**: jsPDF A5 portrait; centered "PAYMENT RECEIPT", receipt # = first 8 chars of paymentId uppercased, date line, ruled separators, label/value rows (From Stockist, To Pharmacy, Amount ₹toLocaleString, Payment Method underscores→spaces uppercased, optional Reference/Notes), bold "TOTAL: ₹…", italic "This is a computer-generated receipt." footer; saves `receipt-{id8}.pdf`. Used by StockistPayments (confirmed payments) and PharmacyOrderDetail's Download Invoice (which passes `payment_status` as the `paymentMethod` arg — so the "Payment Method" row prints "PAID"/"UNPAID").
- **`lib/pharma-brands.ts`**: `PHARMA_BRANDS` — exactly 101 brand strings (Sun, Cipla, … "Universal Medicare"); `PRODUCT_CATEGORIES` 16; `GST_RATES` 5; `DRUG_SCHEDULES` 6; `DRUG_TYPES` 4; `PACK_TYPES` 13.
- **`lib/indian-states-cities.ts`**: `INDIAN_STATES_CITIES` — 38 states/UTs → city arrays (e.g. Rajasthan 18 cities); `INDIAN_STATES` sorted keys; `getCitiesForState` with `[]` fallback.
- **`hooks/useDemoAuth.tsx`**: React context provider (mounted in App). State seeded from `localStorage.demo_role` (default pharmacy); `setRole` writes localStorage + state; `signOut` removes key + `window.location.href = "/"` (hard reload). Throws if used outside provider.
- **`hooks/useAuth.tsx`**: NOT a context — recomputes from localStorage on every call; inline duplicate of the demo user/profile maps; `loading:false` constant. Both auth hooks coexist and are used interchangeably across pages.
- **`hooks/useStockistProfile.ts` / `usePharmacyProfile.ts`**: return `{profile: DEMO_*_PROFILE, isLoading:false}` — literally constants, no query.
- **`hooks/usePaginatedQuery.ts`**: internal `page` state; query key `[...queryKey, page, pageSize]`; builds `select(select, {count:"exact"})`, applies caller `filters` via `.filter()` (no-op in mock — the root cause of §3.7's unfiltered list), `.order`, `.range(from,to)`; staleTime 15s; returns items/totalCount/page/totalPages/hasMore/isLoading/isFetching/nextPage/prevPage/goToPage/setPage. `goToPage` clamps to [0, totalPages-1].
- **`hooks/useAutoFillProduct.ts`**: guards <3 chars ("Enter at least 3 characters…"); invoke `autofill-product-details`; toast matrix — invoke error → "Auto-fetch failed. Try again."; `data.error` → that message; `fields_filled>0` → "N fields suggested — review before saving"; else → "No details found for this product" (the always-hit branch in demo since data is null → `filledCount=0`).
- **`hooks/useRealtimeNotifications.ts`**: the entire file is `export const useRealtimeNotifications = () => {};` (2 lines).
- **`hooks/useOfflineDetector.ts`** (tagged `#214 Offline Support`): `navigator.onLine` + online/offline listeners.
- **`hooks/use-mobile.tsx`**: `useIsMobile()` matchMedia < 768px (only consumed by the shadcn `sidebar.tsx` primitive).
- **`hooks/use-toast.ts`**: the stock shadcn reducer-based toast store — `TOAST_LIMIT = 1` (only one Radix toast visible at a time) and `TOAST_REMOVE_DELAY = 1000000` ms (~16.7 min before removal from state). Most pages actually use **sonner**'s `toast` instead; both systems are mounted (`<Toaster/>` and `<Sonner/>` in App).

## PART Q — SHARED/PRESENTATIONAL COMPONENT REFERENCE (exact behavior)

- **`DemoHome`** (`/`): role cards defined with gradient classes emerald/teal (pharmacy), blue/indigo (stockist), amber/orange (admin); each card lists subtitle (HealthPlus Pharmacy / MedSupply India Pvt Ltd / Platform Operations) + a capability description. `handleSelect` = `setRole(role)` then `navigate(/{role})`.
- **`KpiCard`**: Card with icon (color prop, default text-primary), 2xl bold value, xs label; whole card navigates when `navigateTo` given (adds hover shadow + cursor).
- **`QuickActions`**: grid (2/3/4 cols) of tappable Cards; each action has icon, label, optional desc/color/onClick/path; icon tile uses `a.color || "bg-primary/10"` — callers passing dynamic `bg-${x}/10` strings hit the JIT issue noted in §3.1.
- **`PaginationControls`**: returns null when totalPages ≤ 1; "Page X of Y • N total" + chevron prev/next buttons disabled at bounds or while fetching.
- **`EmptyState`**: icon-in-circle, title, description, optional action button. **`BackButton`**: ghost ChevronLeft, `navigate(-1)` or explicit `to`.
- **`ProductGalleryUploader`**: multi-file input → per file upload to `product-images` bucket at `{storagePath}/{ts}_{i}.{ext}` → getPublicUrl (placeholder.com in demo, so thumbnails render as broken images); first image of an empty gallery auto-primary; hover overlay Star=set primary / X=remove (re-primaries first + reindexes sort_order); ←/→ reorder buttons (only when >1); footer "N photos • First/primary image used as thumbnail". Note: the reorder/action overlay uses `group`-hover classes but the `group` class is on the inner overlay div, not the tile — the reorder row references `group-hover` from a different element, so reorder buttons effectively show only when hovering the overlay itself.
- **`ProductImageGallery`** (used in SharedProductDetail): main square image + prev/next chevrons + "i / n" pill + thumbnail strip; falls back to legacy `image_url`, else a Package-icon placeholder tile.
- **`StockAlerts`**: a complete low-stock alert Card (queries products with `min_stock_level > 0`, client-filters stock ≤ min, lists top 5 + "+N more", "Send Alert Notification" button inserting a `system` notification) — **imported by no page; dead component** (grep confirms only its own file references it).
- **`NavLink`** (components/NavLink.tsx): a forwardRef compat wrapper adding `activeClassName`/`pendingClassName` props over react-router's NavLink. **`ErrorBoundary`**: class component; catch → centered "Something went wrong" + error.message + Reload Page button (resets state + `window.location.reload()`); logs to console.
- **`src/components/ui/*`**: 48 stock shadcn primitives (accordion → tooltip), unmodified apart from theme tokens; `chart.tsx` (Recharts wrapper), `sidebar.tsx`, `carousel.tsx`, `command.tsx`, `input-otp.tsx`, `menubar.tsx`, `navigation-menu.tsx`, `resizable.tsx` etc. are present but several are unused by any page.

## PART R — END-TO-END USER JOURNEYS (as they actually play out in the demo)

**R1. Demo entry.** `/` → pick a role card → `demo_role` written → land on that panel's dashboard. Switching roles = TopNav logo (back to `/`) or More → Logout (clears key, hard-navigates `/`). All three panels remain directly URL-accessible regardless of chosen role.

**R2. Stockist fulfils an order (the lifecycle engine).** Home → Orders (⚠ list shows all 8 seed orders, not just sp-001) → open ord-003 (pending). Available: edit item qtys (recomputes total via RPC delta), Split (multi-item pending only — ord-003 qualifies with 2 items), Cancel, Duplicate, Mark as Packed (fires `deduct_product_stock` per item + pharmacy notification) → Dispatched → Out for Delivery (Print Packing Slip window available across these) → Delivered (sets delivered_at; unlocks Return Items). Record Payment at any non-cancelled unpaid point → CollectPaymentDialog FIFO (§H). Create Bill → BillPreviewDialog TAX INVOICE → Confirm & Generate (status "confirmed", circle outstanding += total) → Print/PDF/WhatsApp share; the embedded QR targets the lineage domain's `/verify-bill/{id}`. Every mutation toasts success; refreshing the page restores seed state.

**R3. Stockist onboards a pharmacy.** Pharmacies → Find Pharmacy (defaults to serviceable-PIN matches) → Add to circle (zeroed credit) → kebab Edit to set credit_limit/notes/is_blocked → Record Order (`/orders/create?pharmacy=`) — paste WhatsApp text → Parse (always "No items could be parsed" in demo) → add rows manually, match products, credit-limit warn dialog if exceeded → create (ORD-{base36}) → circle outstanding bumped → pharmacy notified.

**R4. Pharmacy orders stock.** Dashboard → Stockists → MedSupply storefront → add in-stock products to ephemeral cart → floating bar (credit warning at 80% usage) → Place Order — hard-blocked if `outstanding + cart > credit_limit` — else `PH{ts8}` pending order + items + circle bump + stockist notification → Order detail with status timeline. On delivery: Download Invoice (A5 PDF) and Verify Received Quantities (mismatch → discrepancy notification to stockist). Alternative: Quick Order (paste text → dead-ends at parse in demo; coded continuation ranks serviceable stockists by cheapest matched total, tags "Best Price", places `quick_order`-source order).

**R5. Pharmacy pays.** Payments → Record Payment → pick stockist (shows outstanding + auto-rendered UPI/bank details card) → amount/method/reference (+ UPI proof upload for upi) → inserts a **pending** payment, decrements circle outstanding via RPC, notifies stockist. The stockist-side mirror is CollectPaymentDialog, which writes **confirmed** payments and marks orders paid FIFO.

**R6. Admin approves and oversees.** Dashboard (mostly hardcoded KPIs) → Stockists/Pharmacies queues → bulk or per-card Approve/Reject (detail page requires a rejection reason and notifies the user; queue-page buttons don't) → per-document approve/reject with inline preview. Orders → detail → Status Override select (no-op RPC). Bills/Payments read-only rollups. Notifications → Broadcast (all/stockist/pharmacy, chunked inserts of 100) or Targeted-by-email. Messages → the single seeded support conversation → reply as admin. Login History permanently empty (§5.9).

**R7. Support & peer chat.** Any role → chats → pinned "Digi Swasthya Support" + peer threads (unread badges). Support chat: 3 hardcoded quick questions answer canned; anything else attempts `chat-bot` → null → canned "forwarded to support" bubble. Peer chat: opening any peer shows the entire 3-message seed thread (`.or()` no-op); sends don't render (insert no-op, no realtime).

**R8. Public verification.** Anyone (no auth, no layout) can hit `/verify-bill/bill-001` → "Bill Verified" card with bill number/date/status/total and From/To city-state; unknown id → "Bill Not Found"; `preview` → placeholder explanation. Only reachable by typing the URL at the current origin — the generated QR points elsewhere (§3.13).

---

### Coverage note
This document now describes: the full mock data layer (client internals §A1/L, 22 tables and every seed row §A2/M), identity & routing (§A3–A5, 66 routed pages + 6 dead pages §N), every stockist/pharmacy/admin page (Parts C–E), shared chat & verify (Part F), all 8 edge functions as written (Part G), money/credit/FIFO logic (Part H), realtime/offline/PWA (Parts I/O), the schema/types (Part J), the consolidated bug/stub ledger (Part K), library/hook/component internals (Parts P–Q), and end-to-end journeys (Part R). A reader should be able to reconstruct the application's observable behavior entirely from this file.

---

*Documentation audit pass appended below — code-derived additions only; prior content preserved.*

## EXPANSION — Code-Derived Additions (Audit Pass)

*Audit date: 2026-07-04. Content derived exclusively from source under `digiswasthyamvp/`. Documents implemented behavior only.*

### E.1 Complete Route Table

**Frontend routes extracted:** 68 | **Server API routes:** 0

| # | Path | Component | Role/Gate | Source |
|---|------|-----------|-----------|--------|
| 1 | `/` | DemoHome | — | `src/App.tsx` |
| 2 | `/stockist/products` | StockistProducts | — | `src/App.tsx` |
| 3 | `/stockist/products/add` | StockistAddProduct | — | `src/App.tsx` |
| 4 | `/stockist/products/:id` | StockistProductDetail | — | `src/App.tsx` |
| 5 | `/stockist/products/:id/edit` | StockistEditProduct | — | `src/App.tsx` |
| 6 | `/stockist/orders` | StockistOrders | — | `src/App.tsx` |
| 7 | `/stockist/orders/create` | StockistCreateOrder | — | `src/App.tsx` |
| 8 | `/stockist/orders/:id` | StockistOrderDetail | — | `src/App.tsx` |
| 9 | `/stockist/pharmacies` | StockistPharmacies | — | `src/App.tsx` |
| 10 | `/stockist/pharmacies/find` | StockistFindPharmacy | — | `src/App.tsx` |
| 11 | `/stockist/pharmacies/:id` | StockistPharmacyDetail | — | `src/App.tsx` |
| 12 | `/stockist/pharmacies/:id/ledger` | StockistPharmacyLedger | — | `src/App.tsx` |
| 13 | `/stockist/more` | StockistMore | — | `src/App.tsx` |
| 14 | `/stockist/payments` | StockistPayments | — | `src/App.tsx` |
| 15 | `/stockist/profile` | StockistProfileSettings | — | `src/App.tsx` |
| 16 | `/stockist/business` | StockistBusinessDetails | — | `src/App.tsx` |
| 17 | `/stockist/settings` | StockistSettings | — | `src/App.tsx` |
| 18 | `/stockist/help` | StockistHelpCenter | — | `src/App.tsx` |
| 19 | `/stockist/notifications` | StockistNotifications | — | `src/App.tsx` |
| 20 | `/stockist/privacy-security` | StockistPrivacySecurity | — | `src/App.tsx` |
| 21 | `/stockist/serviceable-areas` | StockistServiceableAreas | — | `src/App.tsx` |
| 22 | `/stockist/export-catalogue` | StockistExportCatalogue | — | `src/App.tsx` |
| 23 | `/stockist/bill-history` | StockistPurchaseBillHistory | — | `src/App.tsx` |
| 24 | `/stockist/bulk-bill` | StockistBulkBill | — | `src/App.tsx` |
| 25 | `/stockist/chats` | ChatListPage | — | `src/App.tsx` |
| 26 | `/stockist/chat/:peerId` | PeerChatPage | — | `src/App.tsx` |
| 27 | `/stockist/messages` | ChatPage | — | `src/App.tsx` |
| 28 | `/pharmacy/orders` | PharmacyOrders | — | `src/App.tsx` |
| 29 | `/pharmacy/orders/quick` | PharmacyQuickOrder | — | `src/App.tsx` |
| 30 | `/pharmacy/orders/:id` | PharmacyOrderDetail | — | `src/App.tsx` |
| 31 | `/pharmacy/stockists` | PharmacyStockists | — | `src/App.tsx` |
| 32 | `/pharmacy/stockists/find` | PharmacyFindStockist | — | `src/App.tsx` |
| 33 | `/pharmacy/stockists/:id` | PharmacyStockistDetail | — | `src/App.tsx` |
| 34 | `/pharmacy/browse` | PharmacyBrowse | — | `src/App.tsx` |
| 35 | `/pharmacy/more` | PharmacyMore | — | `src/App.tsx` |
| 36 | `/pharmacy/profile` | PharmacyProfileSettings | — | `src/App.tsx` |
| 37 | `/pharmacy/business` | PharmacyBusinessDetails | — | `src/App.tsx` |
| 38 | `/pharmacy/notifications` | PharmacyNotifications | — | `src/App.tsx` |
| 39 | `/pharmacy/payments` | PharmacyPayments | — | `src/App.tsx` |
| 40 | `/pharmacy/help` | PharmacyHelpCenter | — | `src/App.tsx` |
| 41 | `/pharmacy/privacy-security` | PharmacyPrivacySecurity | — | `src/App.tsx` |
| 42 | `/pharmacy/settings` | PharmacySettings | — | `src/App.tsx` |
| 43 | `/pharmacy/quick-order-history` | PharmacyQuickOrderHistory | — | `src/App.tsx` |
| 44 | `/pharmacy/ledger/:stockistId` | PharmacyLedger | — | `src/App.tsx` |
| 45 | `/pharmacy/chats` | ChatListPage | — | `src/App.tsx` |
| 46 | `/pharmacy/chat/:peerId` | PeerChatPage | — | `src/App.tsx` |
| 47 | `/pharmacy/messages` | ChatPage | — | `src/App.tsx` |
| 48 | `/admin/pharmacies` | AdminPharmacies | — | `src/App.tsx` |
| 49 | `/admin/pharmacies/:id` | AdminPharmacyDetail | — | `src/App.tsx` |
| 50 | `/admin/stockists` | AdminStockists | — | `src/App.tsx` |
| 51 | `/admin/stockists/:id` | AdminStockistDetail | — | `src/App.tsx` |
| 52 | `/admin/orders` | AdminOrders | — | `src/App.tsx` |
| 53 | `/admin/orders/:id` | AdminOrderDetail | — | `src/App.tsx` |
| 54 | `/admin/more` | AdminMore | — | `src/App.tsx` |
| 55 | `/admin/bills` | AdminBills | — | `src/App.tsx` |
| 56 | `/admin/payments` | AdminPayments | — | `src/App.tsx` |
| 57 | `/admin/users` | AdminUsers | — | `src/App.tsx` |
| 58 | `/admin/notifications` | AdminNotifications | — | `src/App.tsx` |
| 59 | `/admin/settings` | AdminSettings | — | `src/App.tsx` |
| 60 | `/admin/messages` | AdminMessages | — | `src/App.tsx` |
| 61 | `/admin/messages/:userId` | ChatPage | — | `src/App.tsx` |
| 62 | `/admin/profile` | AdminProfileSettings | — | `src/App.tsx` |
| 63 | `/admin/help` | AdminHelpCenter | — | `src/App.tsx` |
| 64 | `/admin/login-history` | AdminLoginHistory | — | `src/App.tsx` |
| 65 | `/verify-bill/:billId` | VerifyBill | — | `src/App.tsx` |
| 66 | `/login` | Navigate | — | `src/App.tsx` |
| 67 | `/register` | Navigate | — | `src/App.tsx` |
| 68 | `/admin/*` | NotFound | — | `src/App.tsx` |

### E.2 Entity / Table Catalog

**Tables/schemas found:** 22

#### `bill_orders`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `bill_id` | `string` |
| `id` | `string` |
| `order_id` | `string` |

#### `bills`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `bill_number` | `string` |
| `created_at` | `string` |
| `discount_type` | `string | null` |
| `discount_value` | `number | null` |
| `due_date` | `string | null` |
| `gst_amount` | `number | null` |
| `id` | `string` |
| `pharmacy_id` | `string` |
| `status` | `string` |
| `stockist_id` | `string` |
| `subtotal` | `number` |
| `total_amount` | `number` |

#### `chat_messages`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `content` | `string` |
| `conversation_id` | `string` |
| `created_at` | `string` |
| `id` | `string` |
| `read` | `boolean | null` |
| `sender_id` | `string | null` |
| `sender_type` | `string` |

#### `conversations`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `id` | `string` |
| `updated_at` | `string` |
| `user_id` | `string` |
| `user_role` | `string` |

#### `login_activity`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `device_info` | `string | null` |
| `id` | `string` |
| `ip_address` | `string | null` |
| `location` | `string | null` |
| `status` | `string` |
| `user_id` | `string` |

#### `login_attempts`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `attempted_at` | `string` |
| `email` | `string` |
| `id` | `string` |
| `success` | `boolean` |

#### `messages`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `content` | `string` |
| `created_at` | `string` |
| `id` | `string` |
| `read` | `boolean | null` |
| `receiver_id` | `string` |
| `sender_id` | `string` |

#### `notifications`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `id` | `string` |
| `message` | `string | null` |
| `read` | `boolean | null` |
| `title` | `string` |
| `type` | `string | null` |
| `user_id` | `string` |

#### `order_items`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `id` | `string` |
| `order_id` | `string` |
| `price` | `number | null` |
| `product_id` | `string` |
| `quantity` | `number` |
| `requested_batch` | `string | null` |

#### `order_status_history`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `changed_by` | `string | null` |
| `created_at` | `string` |
| `id` | `string` |
| `new_status` | `string` |
| `notes` | `string | null` |
| `old_status` | `string | null` |
| `order_id` | `string` |
| `order_type` | `string` |

#### `orders`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `applied_credit_note_id` | `string | null` |
| `assigned_staff_id` | `string | null` |
| `created_at` | `string` |
| `credit_discount` | `number | null` |
| `delivered_at` | `string | null` |
| `delivery_collected_amount` | `number | null` |
| `delivery_payment_method` | `string | null` |
| `delivery_payment_status` | `string | null` |
| `delivery_proof_url` | `string | null` |
| `id` | `string` |
| `items_count` | `number` |
| `notes` | `string | null` |
| `order_number` | `string` |
| `order_source` | `string` |
| `parent_order_id` | `string | null` |
| `partial_delivery_items` | `Json | null` |
| `payment_status` | `string` |
| `pharmacy_id` | `string` |
| `status` | `string | null` |
| `stockist_id` | `string` |
| `total_amount` | `number | null` |
| `updated_at` | `string` |

#### `payments`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `amount` | `number` |
| `collected_by` | `string | null` |
| `created_at` | `string` |
| `id` | `string` |
| `notes` | `string | null` |
| `payment_method` | `string` |
| `payment_proof_url` | `string | null` |
| `pharmacy_id` | `string` |
| `reference_id` | `string | null` |
| `staff_id` | `string | null` |
| `status` | `string` |
| `stockist_id` | `string` |

#### `peer_messages`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `content` | `string` |
| `created_at` | `string` |
| `id` | `string` |
| `read` | `boolean` |
| `receiver_id` | `string` |
| `sender_id` | `string` |

#### `pharmacy_profiles`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `account_holder_name` | `string | null` |
| `account_number` | `string | null` |
| `address` | `string | null` |
| `approval_status` | `Database["public"]["Enums"]["approval_status"] | null` |
| `bank_name` | `string | null` |
| `city` | `string | null` |
| `created_at` | `string` |
| `delivery_fee` | `number | null` |
| `drug_license_expiry` | `string | null` |
| `drug_license_url` | `string | null` |
| `email` | `string | null` |
| `free_delivery_above` | `number | null` |
| `gst_certificate_url` | `string | null` |
| `id` | `string` |
| `ifsc_code` | `string | null` |
| `license_number` | `string | null` |
| `min_order_amount` | `number | null` |
| `minimum_order_amount` | `number | null` |
| `operating_hours` | `Json | null` |
| `owner_contact` | `string | null` |
| `owner_designation` | `string | null` |
| `owner_name` | `string | null` |
| `pharmacy_certificate_url` | `string | null` |
| `pharmacy_name` | `string` |
| `pharmacy_type` | `string | null` |
| `phone` | `string | null` |
| `pin_code` | `string | null` |
| `rejection_reason` | `string | null` |
| `state` | `string | null` |
| `updated_at` | `string` |
| `upi_id` | `string | null` |
| `user_id` | `string` |
| `whatsapp_number` | `string | null` |

#### `product_batches`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `batch_number` | `string | null` |
| `created_at` | `string` |
| `expiry_date` | `string | null` |
| `id` | `string` |
| `mrp` | `number | null` |
| `product_id` | `string` |
| `purchase_rate` | `number | null` |
| `sale_price` | `number | null` |
| `stock_quantity` | `number | null` |

#### `product_media`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `id` | `string` |
| `image_url` | `string` |
| `is_primary` | `boolean` |
| `product_id` | `string` |
| `sort_order` | `number` |

#### `products`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `batch_number` | `string | null` |
| `brand` | `string | null` |
| `category` | `string | null` |
| `composition` | `string | null` |
| `created_at` | `string` |
| `description` | `string | null` |
| `drug_schedule` | `string | null` |
| `drug_type` | `string | null` |
| `expiry_date` | `string | null` |
| `fssai_license` | `string | null` |
| `gst_rate` | `string | null` |
| `hsn_code` | `string | null` |
| `id` | `string` |
| `image_url` | `string | null` |
| `in_stock` | `boolean | null` |
| `is_narcotic` | `boolean | null` |
| `manufacturer` | `string | null` |
| `min_order_quantity` | `number | null` |
| `min_stock_level` | `number | null` |
| `moq` | `number | null` |
| `mrp` | `number | null` |
| `name` | `string` |
| `pack_size` | `string | null` |
| `pack_type` | `string | null` |
| `price` | `number | null` |
| `purchase_rate` | `number | null` |
| `requires_prescription` | `boolean | null` |
| `reserved_quantity` | `number | null` |
| `sale_price` | `number | null` |
| `stock_quantity` | `number | null` |
| `stockist_id` | `string` |
| `unit` | `string | null` |
| `updated_at` | `string` |

#### `profiles`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `avatar_url` | `string | null` |
| `created_at` | `string` |
| `data_download_requested_at` | `string | null` |
| `email` | `string | null` |
| `full_name` | `string | null` |
| `id` | `string` |
| `last_active_at` | `string | null` |
| `phone` | `string | null` |
| `tos_accepted_at` | `string | null` |
| `updated_at` | `string` |
| `user_id` | `string` |

#### `serviceable_areas`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `id` | `string` |
| `pin_code` | `string` |
| `stockist_id` | `string` |

#### `stockist_pharmacy_circle`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `credit_balance` | `number` |
| `credit_limit` | `number` |
| `id` | `string` |
| `is_blocked` | `boolean | null` |
| `last_payment_date` | `string | null` |
| `notes` | `string | null` |
| `outstanding` | `number` |
| `payment_terms_days` | `number | null` |
| `pharmacy_id` | `string` |
| `stockist_id` | `string` |

#### `stockist_profiles`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `account_holder_name` | `string | null` |
| `account_number` | `string | null` |
| `address` | `string | null` |
| `approval_status` | `Database["public"]["Enums"]["approval_status"] | null` |
| `bank_name` | `string | null` |
| `business_name` | `string` |
| `business_type` | `string | null` |
| `city` | `string | null` |
| `created_at` | `string` |
| `drug_license_expiry` | `string | null` |
| `drug_license_url` | `string | null` |
| `email` | `string | null` |
| `fssai_license_url` | `string | null` |
| `gst_certificate_url` | `string | null` |
| `id` | `string` |
| `ifsc_code` | `string | null` |
| `pan_number` | `string | null` |
| `phone` | `string | null` |
| `pin_code` | `string | null` |
| `rejection_reason` | `string | null` |
| `state` | `string | null` |
| `updated_at` | `string` |
| `upi_id` | `string | null` |
| `user_id` | `string` |
| `whatsapp_number` | `string | null` |
| `wholesale_license_url` | `string | null` |

#### `user_roles`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `id` | `string` |
| `role` | `Database["public"]["Enums"]["app_role"]` |
| `user_id` | `string` |

### E.3 API / Backend Surface

#### Supabase Edge Functions

| Function | Lines | CORS | Auth | Notes |
|----------|-------|------|------|-------|
| `architecture-ai` | 82 | yes | public | — |
| `autofill-product-details` | 112 | yes | public | — |
| `chat-bot` | 114 | yes | public | — |
| `flowboard-data` | 875 | yes | public | — |
| `parse-order-text` | 118 | yes | public | — |
| `parse-purchase-bill` | 95 | yes | public | — |
| `seed-admin` | 73 | yes | public | — |
| `seed-production-data` | 690 | yes | public | — |

### E.4 Auth, Roles, and Permissions

#### Roles referenced in code

- `admin`
- `alert`
- `approved`
- `auth`
- `customer`
- `doctor`
- `group`
- `link`
- `navigation`
- `pending`
- `pharmacy`
- `presentation`
- `region`
- `rejected`
- `separator`
- `shared`
- `staff`
- `stockist`
- `system`
- `user`

#### RLS policies (migrations)

- `Users can view own profile` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Users can update own profile` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Admins can view all profiles` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `System can insert profiles` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Users can view own roles` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Admins can view all roles` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Admins can manage roles` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `System can insert roles` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Stockists can view own profile` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Stockists can update own profile` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Stockists can insert own profile` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Admins can manage stockist profiles` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Approved stockists visible to pharmacies` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Stockists can manage own areas` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Admins can view areas` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Anyone authenticated can view areas` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Pharmacies can view own profile` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Pharmacies can update own profile` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Pharmacies can insert own profile` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Admins can manage pharmacy profiles` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Approved pharmacies visible to stockists` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Stockists can manage own products` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Authenticated users can view products` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Pharmacies can view own orders` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Stockists can view own orders` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Pharmacies can create orders` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Stockists can update order status` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Admins can view all orders` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Users can view own order items` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Pharmacies can insert order items` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Admins can view all order items` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Pharmacies can manage own inventory` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Admins can view inventory` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Users can view own notifications` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Users can update own notifications` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `System can insert notifications` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Users can view own messages` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Users can send messages` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Admins can view all messages` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Anyone can read platform settings` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Admins can manage platform settings` → table `public` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Users can upload own documents` → table `storage` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Users can view own documents` → table `storage` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Admins can view all documents` → table `storage` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Users can upload own avatar` → table `storage` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Users can update own avatar` → table `storage` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Avatars publicly accessible` → table `storage` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Admins can manage platform assets` → table `storage` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Platform assets publicly accessible` → table `storage` (`20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)
- `Users can insert own profile` → table `public` (`20260223132642_a17c8b1a-f24a-40e3-92f2-068b6d4e2fe9.sql`)
- `Admins can insert notifications` → table `public` (`20260223132642_a17c8b1a-f24a-40e3-92f2-068b6d4e2fe9.sql`)
- `Stockists can manage own product batches` → table `public` (`20260223164931_9c7eaf13-0ac7-43ca-b771-0893f39b3b41.sql`)
- `Authenticated users can view product batches` → table `public` (`20260223164931_9c7eaf13-0ac7-43ca-b771-0893f39b3b41.sql`)
- `Authenticated users can upload product images` → table `storage` (`20260223164931_9c7eaf13-0ac7-43ca-b771-0893f39b3b41.sql`)
- `Authenticated users can update product images` → table `storage` (`20260223164931_9c7eaf13-0ac7-43ca-b771-0893f39b3b41.sql`)
- `Product images publicly accessible` → table `storage` (`20260223164931_9c7eaf13-0ac7-43ca-b771-0893f39b3b41.sql`)
- `Authenticated users can delete product images` → table `storage` (`20260223164931_9c7eaf13-0ac7-43ca-b771-0893f39b3b41.sql`)
- `Users can view own conversations` → table `public` (`20260224034455_c2918a9e-332a-49fe-a510-f537bbb0503c.sql`)
- `Users can create own conversations` → table `public` (`20260224034455_c2918a9e-332a-49fe-a510-f537bbb0503c.sql`)
- `Users can update own conversations` → table `public` (`20260224034455_c2918a9e-332a-49fe-a510-f537bbb0503c.sql`)
- `Admins can view all conversations` → table `public` (`20260224034455_c2918a9e-332a-49fe-a510-f537bbb0503c.sql`)
- `Users can view own chat messages` → table `public` (`20260224034455_c2918a9e-332a-49fe-a510-f537bbb0503c.sql`)
- `Users can insert own chat messages` → table `public` (`20260224034455_c2918a9e-332a-49fe-a510-f537bbb0503c.sql`)
- `Admins can manage all chat messages` → table `public` (`20260224034455_c2918a9e-332a-49fe-a510-f537bbb0503c.sql`)
- `Anyone authenticated can read quick questions` → table `public` (`20260224034455_c2918a9e-332a-49fe-a510-f537bbb0503c.sql`)
- `Admins can manage quick questions` → table `public` (`20260224034455_c2918a9e-332a-49fe-a510-f537bbb0503c.sql`)
- `Admins can manage all chat messages` → table `public` (`20260224050039_9420613a-95bd-4ea5-9cf3-45375e12eba4.sql`)
- `Users can view own chat messages` → table `public` (`20260224050039_9420613a-95bd-4ea5-9cf3-45375e12eba4.sql`)
- `Users can insert own chat messages` → table `public` (`20260224050039_9420613a-95bd-4ea5-9cf3-45375e12eba4.sql`)
- `Admins can manage all conversations` → table `public` (`20260224050039_9420613a-95bd-4ea5-9cf3-45375e12eba4.sql`)
- `Users can view own conversations` → table `public` (`20260224050039_9420613a-95bd-4ea5-9cf3-45375e12eba4.sql`)
- `Users can create own conversations` → table `public` (`20260224050039_9420613a-95bd-4ea5-9cf3-45375e12eba4.sql`)
- `Users can update own conversations` → table `public` (`20260224050039_9420613a-95bd-4ea5-9cf3-45375e12eba4.sql`)
- `Authenticated users can insert notifications` → table `public` (`20260224050039_9420613a-95bd-4ea5-9cf3-45375e12eba4.sql`)
- `Stockists can manage own circle` → table `public` (`20260224065131_56062398-81a9-4071-8236-6decbd0e648c.sql`)
- `Admins can manage all circles` → table `public` (`20260224065131_56062398-81a9-4071-8236-6decbd0e648c.sql`)
- `Pharmacies can view own circle entries` → table `public` (`20260224065131_56062398-81a9-4071-8236-6decbd0e648c.sql`)
- `Stockists can manage own payments` → table `public` (`20260224065131_56062398-81a9-4071-8236-6decbd0e648c.sql`)
- `Admins can manage all payments` → table `public` (`20260224065131_56062398-81a9-4071-8236-6decbd0e648c.sql`)
- `Pharmacies can view own payments` → table `public` (`20260224065131_56062398-81a9-4071-8236-6decbd0e648c.sql`)
- *+132 additional policies*

### E.5 Workflows and State Machines

#### `sender_type`

`admin` → `bot` → `user`

#### `status`

`approved` → `completed` → `pending` → `rejected`

#### `status_values`

`active` → `approved` → `cancelled` → `confirmed` → `delivered` → `dispatched` → `draft` → `inactive` → `paid` → `partial` → `pending` → `rejected` → `unpaid`

#### `target_type`

`doctor` → `pharmacy` → `product`

#### Edge-function status mutations

- `flowboard-data`: `approved`, `cancelled`, `confirmed`, `delivered`, `paid`, `partial`, `pending`, `rejected`, `unpaid`
- `seed-production-data`: `approved`, `cancelled`, `confirmed`, `delivered`, `paid`, `pending`, `unpaid`

### E.6 Dashboards, Reports, and Formulas

**Extracted calculation lines:** 50

#### `src/components/stockist/CollectPaymentDialog.tsx`

- L54: `const totalPendingAmount = useMemo(() =>`
- L55: `pendingOrders.reduce((s, o) => s + (o.total_amount || 0), 0),`
- L67: `const total = pendingOrders`
- L69: `.reduce((s, o) => s + (o.total_amount || 0), 0);`
- L82: `const orderAmt = order.total_amount || 0;`
- L84: `if (amt >= pendingOrders.filter(o => selectedOrders.has(o.id)).reduce((s, o) => s + (o.total_amount || 0), 0)) {`
- L93: `const orderAmt = order.total_amount || 0;`
- L137: `const newOutstanding = Math.max(0, outstanding - amt);`
- L166: `<p className="text-xs text-muted-foreground">Outstanding</p>`
- L167: `<p className="text-lg font-bold text-destructive">₹{outstanding}</p>`
- L206: `<span className="font-medium">₹{alloc.total_amount}</span>`

#### `src/pages/admin/AdminDashboard.tsx`

- L10: `const pendingStockists = DEMO_STOCKISTS.filter(s => s.approval_status === "pending").length;`
- L12: `const totalRevenue = DEMO_ORDERS.reduce((s, o) => s + (o.total_amount || 0), 0);`
- L48: `<p className="text-lg font-bold text-warning">{pendingStockists}</p>`

#### `src/pages/admin/AdminPayments.tsx`

- L42: `const totalB2B = payments.reduce((s: number, p: any) => s + (p.amount || 0), 0);`
- L54: `<p className="text-[10px] text-muted-foreground uppercase">Total Collected</p>`
- L55: `<p className="text-lg font-bold text-accent">₹{totalB2B.toLocaleString()}</p>`

#### `src/pages/pharmacy/PharmacyDashboard.tsx`

- L15: `const totalPurchase = pharmacyOrders.reduce((s, o) => s + (o.total_amount || 0), 0);`
- L27: `<KpiCard label="Total Purchase" value={`₹${totalPurchase.toLocaleString()}`} icon={TrendingUp} color="text-accent" navigateTo="/pharmacy/payments" />`
- L55: `<p className="text-xs text-muted-foreground">{getStockistName(o.stockist_id)} • {o.items_count} items</p>`
- L59: `<p className="text-xs text-muted-foreground mt-0.5">₹{o.total_amount}</p>`

#### `src/pages/pharmacy/PharmacyPayments.tsx`

- L60: `const totalOutstanding = circleStockists.reduce((s: number, c: any) => s + (c.outstanding || 0), 0);`
- L149: `<p className="text-[10px] text-muted-foreground uppercase">Total Outstanding</p>`
- L150: `<p className="text-lg font-bold text-destructive">₹{totalOutstanding.toLocaleString()}</p>`
- L173: `{p.collected_by === "delivery_staff" && <p className="text-[10px] text-primary">Via delivery staff</p>}`
- L203: `<p className="font-semibold">Outstanding: <span className="text-destructive">₹{(selectedCircle as any)?.outstanding || 0}</span></p>`

#### `src/pages/stockist/StockistHome.tsx`

- L16: `const revenue = stockistOrders.filter(o => ["delivered", "completed"].includes(o.status)).reduce((s, o) => s + (o.total_amount || 0), 0);`
- L17: `const outstanding = DEMO_CIRCLE.reduce((s, c) => s + c.outstanding, 0);`
- L19: `const stockValue = stockistProducts.reduce((s, p) => s + (p.stock_quantity * p.price), 0);`
- L154: `<p className="text-xs text-muted-foreground">{getPharmacyName(o.pharmacy_id)} • {o.items_count} items</p>`
- L158: `<p className="text-xs font-medium mt-0.5">₹{o.total_amount}</p>`

#### `src/pages/stockist/StockistPayments.tsx`

- L92: `const totalCollected = thisMonthPayments.reduce((s, p) => s + ((p as any).amount || 0), 0);`
- L93: `const totalOutstanding = circleData.reduce((s, c) => s + (c.outstanding || 0), 0);`
- L96: `const amount = order.delivery_collected_amount || 0;`
- L135: `const pharmaciesWithOutstanding = circleData.filter(c => c.outstanding > 0);`
- L146: `const msg = `Hello ${pharmName},\n\nThis is a payment reminder from ${stockistInfo?.business_name || "your stockist"}.\n\n💰 Outstanding: ₹${circle.outstanding}\`
- L191: `<p className="text-lg font-bold text-accent">₹{totalCollected}</p>`
- L194: `<p className="text-[10px] text-muted-foreground uppercase">Outstanding</p>`
- L195: `<p className="text-lg font-bold text-destructive">₹{totalOutstanding}</p>`
- L218: `<p><span className="text-muted-foreground">A/C:</span> {stockistInfo.account_number}</p>`
- L220: `{stockistInfo.account_holder_name && <p><span className="text-muted-foreground">Holder:</span> {stockistInfo.account_holder_name}</p>}`
- L247: `{p.collected_by === "delivery_staff" && <p className="text-[10px] text-primary">Collected by delivery staff</p>}`
- L281: `<p className="text-sm font-semibold">₹{b.total_amount}</p>`
- L299: `<p className="text-xs text-primary">Collected by: {(o as any).delivery_staff?.name || "Staff"}</p>`
- L302: `<p className="text-sm font-bold">₹{o.delivery_collected_amount}</p>`
- L303: `<p className="text-xs text-muted-foreground capitalize">{o.delivery_payment_method}</p>`
- L325: `{pharmaciesWithOutstanding.length === 0 ? (`
- L326: `<p className="text-sm text-muted-foreground text-center py-4">No pharmacies with outstanding balance</p>`
- L334: `{pharmaciesWithOutstanding.map((c: any) => (`
- L345: `<p>Outstanding: ₹{circleData.find(c => c.pharmacy_id === selectedPharmacy)?.outstanding}</p>`

### E.7 Modals / Dialogs / Sheets Inventory

**Files:** 17

| File | Count | Components |
|------|-------|------------|
| `src/pages/stockist/StockistOrderDetail.tsx` | 14 | (inline) |
| `src/pages/admin/AdminNotifications.tsx` | 8 | (inline) |
| `src/components/stockist/ProductForm.tsx` | 6 | (inline) |
| `src/pages/stockist/StockistCreateOrder.tsx` | 5 | (inline) |
| `src/components/stockist/EditPharmacyDialog.tsx` | 4 | EditPharmacyDialog |
| `src/components/stockist/BulkUploadPurchaseBill.tsx` | 4 | (inline) |
| `src/components/stockist/QuickBillDialog.tsx` | 4 | QuickBillDialog |
| `src/components/stockist/CollectPaymentDialog.tsx` | 4 | CollectPaymentDialog |
| `src/components/stockist/BillPreviewDialog.tsx` | 4 | BillPreviewDialog |
| `src/components/stockist/BulkUploadCatalogue.tsx` | 4 | (inline) |
| `src/pages/pharmacy/PharmacyPayments.tsx` | 4 | (inline) |
| `src/pages/stockist/StockistPharmacyDetail.tsx` | 4 | (inline) |
| `src/pages/stockist/StockistPayments.tsx` | 4 | (inline) |
| `src/pages/stockist/StockistPrivacySecurity.tsx` | 4 | (inline) |
| `src/pages/stockist/StockistProducts.tsx` | 4 | (inline) |
| `src/pages/pharmacy/PharmacyOrderDetail.tsx` | 0 | (inline) |
| `src/pages/stockist/StockistPharmacies.tsx` | 0 | (inline) |

### E.8 Mock, Stub, and Incomplete Behavior

**Files flagged:** 71

| File | Tags | Sample |
|------|------|--------|
| `supabase/functions/flowboard-data/index.ts` | demo | L174: { id: "doc-analytics", title: "Analytics", type: "ui", description: "Consultation trends, |
| `src/App.tsx` | demo | L6: import { DemoAuthProvider } from "@/hooks/useDemoAuth"; |
| `src/integrations/supabase/client.ts` | mock, demo, placeholder, random | L1: // Mock Supabase client that returns dummy data for demo mode |
| `src/components/ui/command.tsx` | placeholder | L47: "flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-mut |
| `src/components/ui/sidebar.tsx` | random | L536: return `${Math.floor(Math.random() * 40) + 50}%`; |
| `src/components/ui/select.tsx` | placeholder | L20: "flex h-10 w-full items-center justify-between rounded-md border border-input bg-backgroun |
| `src/components/ui/textarea.tsx` | placeholder | L11: "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm r |
| `src/components/ui/input.tsx` | placeholder | L11: "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-of |
| `src/components/registration/StockistRegistration.tsx` | placeholder | L175: placeholder={`Enter ${label.toLowerCase()} number`} |
| `src/components/registration/PharmacyRegistration.tsx` | placeholder | L144: <Input placeholder={`Enter ${label.toLowerCase()} number`} value={numberValue} onChange={ |
| `src/components/stockist/EditPharmacyDialog.tsx` | placeholder | L80: <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Internal notes. |
| `src/components/stockist/QuickBillDialog.tsx` | placeholder | L125: <Input type="number" className="h-8 text-xs" value={discountValue} onChange={e => setDisc |
| `src/components/stockist/CollectPaymentDialog.tsx` | placeholder | L175: <Input type="number" value={amount} onChange={e => { setAmount(e.target.value); setManual |
| `src/components/stockist/ProductForm.tsx` | placeholder | L165: placeholder="Search or add brand..." |
| `src/components/stockist/ProductFilters.tsx` | placeholder | L47: <SelectTrigger className="w-[130px] h-8 text-xs text-left justify-start"><SelectValue plac |
| `src/components/shared/MenuPage.tsx` | placeholder | L63: placeholder="Search menu..." |
| `src/hooks/useStockistProfile.ts` | demo | L1: import { DEMO_STOCKIST_PROFILE } from "@/lib/dummy-data"; |
| `src/hooks/useDemoAuth.tsx` | demo | L2: import { DEMO_USERS } from "@/lib/dummy-data"; |
| `src/hooks/useAuth.tsx` | demo | L6: const role = (localStorage.getItem("demo_role") || "pharmacy") as AppRole; |
| `src/hooks/useRealtimeNotifications.ts` | demo | L1: // No-op in demo mode — realtime not needed with static data |
| `src/hooks/usePharmacyProfile.ts` | demo | L1: import { DEMO_PHARMACY_PROFILE } from "@/lib/dummy-data"; |
| `src/lib/dummy-data.ts` | demo | L1: // ======================== DUMMY DATA FOR DEMO MODE ======================== |
| `src/pages/PendingApproval.tsx` | demo | L18: <p className="text-xs text-muted-foreground">(This is a demo screen)</p> |
| `src/pages/Login.tsx` | placeholder | L177: <Input id="email" type="email" placeholder="Enter your email" value={email} onChange={(e) |
| `src/pages/ResetPassword.tsx` | placeholder | L71: <Input id="password" type={showPassword ? "text" : "password"} placeholder="Enter new pass |
| `src/pages/ForgotPassword.tsx` | placeholder | L67: placeholder="Enter your email" |
| `src/pages/DemoHome.tsx` | demo | L3: import { useDemoAuth, DemoRole } from "@/hooks/useDemoAuth"; |
| `src/pages/pharmacy/PharmacySettings.tsx` | incomplete | L12: { code: "hi", label: "Hindi", available: false, comingSoon: "Coming Soon — April 1" }, |
| `src/pages/pharmacy/PharmacyDashboard.tsx` | demo | L8: import { DEMO_ORDERS, DEMO_STOCKISTS, getStockistName } from "@/lib/dummy-data"; |
| `src/pages/pharmacy/PharmacyPayments.tsx` | placeholder | L190: <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select stockist" /></Sele |
| `src/pages/pharmacy/PharmacyPrivacySecurity.tsx` | placeholder | L62: <Input type="password" placeholder="New password (min 6 characters)" value={newPassword} o |
| `src/pages/pharmacy/PharmacyOrders.tsx` | placeholder | L71: <Input placeholder="Search orders..." value={searchQuery} onChange={e => setSearchQuery(e. |
| `src/pages/pharmacy/PharmacyBrowse.tsx` | placeholder | L69: <Input placeholder="Search products or stockists..." value={search} onChange={(e) => setSe |
| `src/pages/pharmacy/PharmacyQuickOrder.tsx` | placeholder | L140: <Textarea value={text} onChange={e => setText(e.target.value)} placeholder="e.g. Dolo 650 |
| `src/pages/pharmacy/PharmacyProfileSettings.tsx` | placeholder | L92: <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger> |
| `src/pages/pharmacy/PharmacyBusinessDetails.tsx` | placeholder | L138: <SelectTrigger className="text-left justify-start"><SelectValue placeholder="State" /></S |
| `src/pages/stockist/StockistAddProduct.tsx` | placeholder | L155: <Input value={form.brand || brandSearch} onChange={e => { setBrandSearch(e.target.value); |
| `src/pages/stockist/StockistSettings.tsx` | incomplete | L12: { code: "hi", label: "Hindi", available: false, comingSoon: "Coming Soon — April 1" }, |
| `src/pages/stockist/StockistPharmacies.tsx` | placeholder | L94: <Input placeholder="Search circle..." value={search} onChange={e => setSearch(e.target.val |
| `src/pages/stockist/StockistHome.tsx` | demo | L8: import { DEMO_PRODUCTS, DEMO_ORDERS, DEMO_CIRCLE, DEMO_MONTHLY_TREND, getPharmacyName } fro |
| `src/pages/stockist/StockistOrders.tsx` | placeholder | L84: <Input placeholder="Search orders..." value={search} onChange={e => setSearch(e.target.val |
| `src/pages/stockist/StockistOrderDetail.tsx` | placeholder | L567: <Input type="number" min={0} max={item.quantity} placeholder="0" className="w-16 h-8 text |
| `src/pages/stockist/StockistCreateOrder.tsx` | placeholder | L207: <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select pharmacy..." /></S |
| `src/pages/stockist/StockistPayments.tsx` | placeholder | L332: <SelectTrigger className="rounded-xl"><SelectValue placeholder="Choose pharmacy" /></Sele |
| `src/pages/stockist/StockistFindPharmacy.tsx` | placeholder | L101: <Input placeholder="Search by name, owner, PIN code..." value={search} onChange={e => set |
| `src/pages/stockist/StockistEditProduct.tsx` | placeholder | L214: <Input value={form.brand || brandSearch} onChange={e => { setBrandSearch(e.target.value); |
| `src/pages/stockist/StockistPrivacySecurity.tsx` | placeholder | L95: <Input type="password" placeholder="New password (min 6 characters)" value={newPassword} o |
| `src/pages/stockist/StockistServiceableAreas.tsx` | placeholder | L56: <Input placeholder="Enter 6-digit PIN code" value={newPin} onChange={e => setNewPin(e.targ |
| `src/pages/stockist/StockistBusinessDetails.tsx` | placeholder | L127: <SelectTrigger><SelectValue placeholder="Select business type" /></SelectTrigger> |
| `src/pages/stockist/StockistHelpCenter.tsx` | placeholder | L250: <Textarea value={feedbackForm.feedback} onChange={e => setFeedbackForm(f => ({ ...f, feed |
| `src/pages/stockist/StockistProducts.tsx` | placeholder | L121: <Input placeholder="Search products..." className="pl-9 h-9 rounded-xl" value={searchQuer |
| `src/pages/stockist/StockistProfileSettings.tsx` | placeholder, incomplete | L92: <Input type={showPw[showKey] ? "text" : "password"} value={value} onChange={e => onChange( |
| `src/pages/admin/AdminBills.tsx` | placeholder | L67: <Input placeholder="Search bills..." className="pl-9 h-9 text-sm rounded-xl" value={search |
| `src/pages/admin/AdminLoginHistory.tsx` | placeholder | L60: <Input className="pl-9 rounded-xl" placeholder="Filter by email..." value={search} onChang |
| `src/pages/admin/AdminHelpCenter.tsx` | demo | L11: { q: "How do I view platform analytics?", a: "Go to More > Platform Analytics for revenue, |
| `src/pages/admin/AdminPayments.tsx` | placeholder | L60: <Input placeholder="Search payments..." className="pl-9 h-9 text-sm rounded-xl" value={sea |
| `src/pages/admin/AdminNotifications.tsx` | placeholder | L142: <Input value={broadcastTitle} onChange={e => setBroadcastTitle(e.target.value)} placehold |
| `src/pages/admin/AdminStockistDetail.tsx` | placeholder | L139: <Input placeholder="Rejection reason (required for rejection)" value={rejectionReason} on |
| `src/pages/admin/AdminMessages.tsx` | placeholder | L80: <Input placeholder="Search users..." value={search} onChange={(e) => setSearch(e.target.va |
| `src/pages/admin/AdminProfileSettings.tsx` | placeholder | L45: <Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Admin nam |
| `src/pages/admin/AdminOrderDetail.tsx` | placeholder | L85: <SelectTrigger className="flex-1 rounded-xl text-xs"><SelectValue placeholder="Change stat |
| `src/pages/admin/AdminPharmacies.tsx` | placeholder | L79: <Input placeholder="Search pharmacies..." value={search} onChange={(e) => setSearch(e.targ |
| `src/pages/admin/AdminPharmacyDetail.tsx` | placeholder | L128: <Input placeholder="Rejection reason (required for rejection)" value={rejectionReason} on |
| `src/pages/admin/AdminUsers.tsx` | placeholder | L103: <Input className="pl-9 rounded-xl" placeholder="Search by name or email..." value={search |
| `src/pages/admin/AdminStockists.tsx` | placeholder | L80: <Input placeholder="Search stockists..." value={search} onChange={(e) => setSearch(e.targe |
| `src/pages/admin/AdminSettings.tsx` | placeholder | L77: <Input type="number" value={platformCommission} onChange={e => setPlatformCommission(e.tar |
| `src/pages/admin/AdminOrders.tsx` | placeholder | L53: <Input placeholder="Search by order #, pharmacy, stockist..." value={search} onChange={(e) |
| `src/pages/admin/AdminDashboard.tsx` | demo | L5: import { DEMO_PHARMACIES, DEMO_STOCKISTS, DEMO_ORDERS, DEMO_MONTHLY_TREND, DEMO_ADMIN_GROWT |
| `src/pages/shared/PeerChatPage.tsx` | placeholder | L115: <Input value={input} onChange={e => setInput(e.target.value)} placeholder="Type a message |
| `src/pages/shared/ChatListPage.tsx` | placeholder | L138: <Input placeholder="Search chats..." value={search} onChange={e => setSearch(e.target.val |
| `src/pages/shared/ChatPage.tsx` | hardcoded, placeholder | L54: // Quick questions table removed in MVP - use hardcoded questions |

### E.9 Dead Code, Orphan Routes, and Broken Links

#### Page files with weak import references

- `ForgotPassword`
- `Index`
- `Login`
- `PendingApproval`
- `Register`
- `ResetPassword`

#### Duplicate filenames




---

## EXPANSION PASS 2 — Deep Trace Additions (2026-07-08)

*Second deep-trace pass over `digiswasthyamvp/` source. Everything below is additive material verified against the code on 2026-07-08; nothing above is modified. Domain scope: Admin / Stockist / Pharmacy only.*

### E2.1 Newly documented routes/pages/screens

Most routes are already documented in Parts C–F and E.1. New page-level UI-structure detail not previously captured:

**`/stockist/export-catalogue` — StockistExportCatalogue (`src/pages/stockist/StockistExportCatalogue.tsx`, 72 lines)**
- Nav source: StockistMore → REPORTS → "Export Catalogue". Back button = `navigate(-1)`.
- UI: header row (ArrowLeft button + "Export Product Catalogue"), single Card with centered FileText icon, caption *"Export your entire product catalogue for backup or sharing."*, a 2-col button grid: outline "CSV" and primary "Excel" (both with Download icon, disabled while `exporting`), and a `Spinner message="Exporting..."` shown during export.
- Exact exported column set (the `select(...)` string, L20): `name, brand, manufacturer, category, composition, price, mrp, sale_price, stock_quantity, batch_number, expiry_date, drug_schedule, drug_type, pack_type, pack_size, hsn_code, gst_rate, in_stock, requires_prescription, min_stock_level` — 20 columns, filtered `eq("stockist_id", profile.id)`. Note `id`, `moq`, `min_order_quantity`, `purchase_rate`, `is_narcotic`, `fssai_license` are deliberately excluded from the export.
- File naming: `catalogue_{YYYY-MM-DD}.csv` (Blob + object-URL anchor click, then `URL.revokeObjectURL`) or `catalogue_{YYYY-MM-DD}.xlsx` (`XLSX.writeFile`); sheet name `"Products"`. CSV is produced via `XLSX.utils.sheet_to_csv` from the same worksheet.
- States: guard `if (!profile?.id) return` (no-op click); error → `toast.error(error.message)`; empty → `toast.error("No products to export")`; success → `toast.success("Exported N products")`.

**`/stockist/bulk-bill` — StockistBulkBill (`src/pages/stockist/StockistBulkBill.tsx`, 138 lines; file comment `// #43: Bulk Bill Generation`)**
- Query key `["unbilledOrders", stockistId]`, `enabled: !!stockistId`. Two-step data fetch: (1) orders `eq status "delivered"` for the stockist (select includes `pharmacy_profiles(pharmacy_name)` join), desc by created_at; (2) **all** `bill_orders.order_id` rows (no stockist filter) → `Set` → client-side exclusion of already-billed orders.
- Empty state card: FileText icon + *"All delivered orders have been billed"* (this is what the demo shows for sp-001, since ord-001 and ord-005 are both linked in `DEMO_BILL_ORDERS`).
- Populated state: counter line "N unbilled delivered orders", ghost toggle button whose label flips between "Select All" and "Deselect All" (exact equality on selected count), order Cards (Checkbox, `#order_number`, "pharmacy • ₹total") with `border-primary/50 bg-primary/5` highlight when selected. Whole card is the click target (`onClick={() => toggle(o.id)}`).
- Generate button appears only when `selected.length > 0`; label `Generate Bills (N orders)`, Zap icon, "Generating..." while busy.
- Bill numbering here is `BILL-{Date.now()}-{billCount}` where `billCount` is the per-pharmacy group index (0,1,2,…), so two bills generated in the same click share the timestamp and differ only in suffix.
- Per bill: `subtotal = Σ order.total_amount`, `total_amount = subtotal` (no discount, no GST), `status:"final"`; then `bill_orders` link rows; then pharmacy `user_id` lookup → notification (see E2.9 catalog). Success path clears selection and invalidates `["unbilledOrders"]`.

**`/stockist/notifications` — StockistNotifications (`src/pages/stockist/StockistNotifications.tsx`, 118 lines) — full structure**
- Header: back button; "Notifications" + "{N} unread" subline (only when unreadCount>0); right-aligned ghost "Mark All Read" button with CheckCheck icon (only when unread exist).
- `typeIcons` map (L14–20): `order→ShoppingCart, payment→IndianRupee, offer→Megaphone, system→Settings, feedback→Bell`; anything else (including the seed `stock`, plus `bill`, `approval`, `price_change`, `broadcast`, `targeted`, `payment_reminder`, `circle_status`, `profile_update` types) falls back to Bell.
- Tabs (full-width TabsList): All / Orders (`type==="order"`) / Payments / System — exact-match filtering, so `stock`/`bill` notifications appear only under "All".
- Unread card styling: `border-primary/30 bg-primary/5`, bold title, primary-tinted icon tile, and a 2×2px primary dot on the right. Read cards: muted icon tile, medium-weight title.
- Row content: title, optional message (`line-clamp-2`), relative timestamp via `formatDistanceToNow(..., { addSuffix: true })`. Click anywhere on the card → `markAsRead(id)` (update `read:true` + invalidate `["notifications"]`).
- Empty state: Card with Bell icon + *"No notifications yet"*. Loading: `Spinner message="Loading notifications..."`.
- (PharmacyNotifications, `src/pages/pharmacy/PharmacyNotifications.tsx`, mirrors this structure; its `typeIcons` uses `order/payment/alert/feedback` as noted in §4.6.)

**`/admin/settings` — AdminSettings (`src/pages/admin/AdminSettings.tsx`, 118 lines) — exact card inventory**
1. **Platform Logo** card: 12×12 preview (uploaded image or muted Image-icon tile) + "Upload" button (label flips to "Uploading..."); accepts `image/*`; uploads to `platform` bucket at `logo-{Date.now()}.{ext}` with `{ upsert:true }`; sets local `logoUrl` from `getPublicUrl` (placeholder.com in demo → broken image); toast "Logo updated". State is component-local only — navigating away loses the logo.
2. **Platform Commission Rate** card (Percent icon): caption *"Commission percentage on transactions"*; number Input placeholder `"e.g. 5"` + Save button. Validation: `!platformCommission || isNaN(Number(...))` → `toast.error("Enter valid %")`; otherwise only `toast.success("Commission rate saved")` — no persistence call of any kind.
3. **GST Rates** card (IndianRupee icon): native `<select>` with exactly 4 options — `medicines` (default) / `equipment` / `consumables` / `otc` — plus a 20-wide number Input placeholder `"%"` and Save. Validation `toast.error("Enter valid rate")`; success `toast.success("GST rate for {category} saved")`.
4. **Payment Methods** card (CreditCard icon): 2-col grid of native checkboxes over local state `{cash:true, upi:true, bank_transfer:true, cheque:true}`, labels via `capitalize` + underscore→space; Save → `toast.success("Payment methods saved")`. No read or write anywhere else in the app consults these flags.

**Help Centers — full FAQ text catalog (new)**
- Stockist (`src/pages/stockist/StockistHelpCenter.tsx` L23–30), 6 FAQ questions verbatim: "How do I add products to my catalogue?", "How do I create an order for a pharmacy?", "How do I collect payments from pharmacies?", "How do I generate bills?", "What are H1 and HNX reports?", "How do I update my business documents?". The H1/HNX answer describes a "Reports section" that is an unrouted More link; the documents answer correctly describes the pending-reset behavior coded in StockistBusinessDetails.
- Stockist video tutorials (L16–21): 4 entries, all `duration:"0:10"`, alternating between `https://www.w3schools.com/html/mov_bbb.mp4` and `.../movie.mp4`; titles "Getting Started with Digi Swasthya", "Managing Your Product Catalogue", "Creating Orders & Bills", "Managing Pharmacy Circle". Tapping a row toggles inline `VideoPlayer` (row icon flips Play→X, tile tint primary→destructive).
- Stockist feedback form Category options (L257–261): Application / Issues / Bugs / Feature Requests / Other. Team options (L270–273): Marketing / Admin / Backend / All Teams. Name/Email/Phone inputs are `readOnly bg-muted/50` prefilled from `authProfile.full_name || sp.business_name`, `user.email`, `sp.phone`. Submit button label "Sending..." while submitting. The whole feedback card expands by clicking anywhere on it (`onClick={() => !showFeedback && setShowFeedback(true)}`), with `stopPropagation` inside the form.
- Pharmacy (`src/pages/pharmacy/PharmacyHelpCenter.tsx` L5–11), 5 FAQs: "How do I place an order?", "How do I find stockists?", "How do I track my order?", "How do I manage inventory?" (answer references an "Inventory tab" that does not exist in this app), "How do returns work?" (answer: "…the stockist can process returns which credit your account" — consistent with §H Returns).
- Admin (`src/pages/admin/AdminHelpCenter.tsx` L6–15), 8 FAQs; four reference features absent from this repo: "Platform Analytics", "Counterfeit Management", "Export Data" (More > Export Data), "System Architecture" (Content/Flow/Screens views — matching the `flowboard-data` edge function's lineage app, not this frontend).

**More menus — complete item inventories (new; §3.15 named the dead routes but not the full menu structure)**
- `StockistMore` (`src/pages/stockist/StockistMore.tsx`): header identity fetched live — `stockist_profiles.select("business_name, business_type, phone").eq("user_id", user.id).single()`; MenuPage subtitle falls back to "Pharmaceutical Stockist" and displayName to "Stockist". 6 sections / 25 items:
  - ACCOUNT (3): Profile Settings ("Personal & contact info") → `/stockist/profile`; Business Details ("Documents, address & bank") → `/stockist/business`; Privacy & Security ("2FA, sessions & account") → `/stockist/privacy-security`.
  - FINANCE (4): Payments & Billing ("View payments and invoices") → `/stockist/payments`; Record Payment ("Manually record a payment") → `/stockist/record-payment` (dead); Analytics ("Business insights & trends") → `/stockist/analytics` (dead); Credit Notes ("View credit notes") → `/stockist/credit-notes` (dead).
  - OPERATIONS (10): Returns & Credit ("Manage item returns") → `/stockist/returns` (dead); Manufacturer Returns → `/stockist/manufacturer-returns` (dead); Expiry Management ("Track expiring stock") → `/stockist/expiry-management` (dead); Expiry Calendar ("Visual batch expiry calendar") → `/stockist/expiry-calendar` (dead); Stock Transfer ("Transfer stock between batches") → `/stockist/stock-transfer` (dead); Batch Management ("View all product batches") → `/stockist/batch-management` (dead); Serviceable Areas ("Manage delivery zones & settings") → live; Staff Management ("Manage delivery persons") → `/stockist/staff` (dead); Delivery Routes ("Plan optimized delivery routes") → `/stockist/delivery-routes` (dead); Holidays ("Set holiday periods") → `/stockist/holidays` (dead).
  - REPORTS (6): Export Data ("Download your data") → `/stockist/export` (dead); Regulatory Reports ("H1, HNX, GST reports") → `/stockist/reports` (dead); Export Catalogue (live); Purchase Bill History ("View all generated bills") → live; Bulk Bill ("Generate bills in bulk") → live; Price History ("Track product price changes") → `/stockist/products` (redirects to the products list; no price history exists).
  - PREFERENCES (3): App Settings ("Theme, language & notifications"); Help Center ("FAQs & tutorials"); Replay Welcome Tour ("View the onboarding guide again") → `/onboarding/stockist` (dead — no onboarding exists in this repo).
  - COMMUNICATION (3): Notifications ("View your alerts & updates"); Peer Chat ("Chat with pharmacies & peers") → `/stockist/chats`; Support Chat ("Chat with our support team") → `/stockist/messages`.
- `PharmacyMore` (`src/pages/pharmacy/PharmacyMore.tsx`): 5 sections / 12 items — ACCOUNT (Profile Settings, Business Details, Privacy & Security), OPERATIONS (Quick Order "WhatsApp text-based ordering" → `/pharmacy/orders/quick`; Browse Catalogue "Browse & order from stockists" → `/pharmacy/browse`; Quick Order History "View past quick orders"), FINANCE (Payments "View payment history"), PREFERENCES (App Settings, Help Center), COMMUNICATION (Notifications, Peer Chat "Chat with stockists & peers", Support Chat). **All 12 pharmacy links are routed** — the pharmacy More menu is the only one with zero dead links. Identity header fetched from `pharmacy_profiles` (name/type/phone), fallbacks "Pharmacy"/"Retail Pharmacy".
- `AdminMore` (`src/pages/admin/AdminMore.tsx`): 6 sections / 11 items — ACCOUNT (Profile "Admin profile & contact info"), USERS (User Management "All users — ban, suspend, restore"), ORDERS & FINANCE (Orders "All B2B orders", Payments "B2B payments", Bills & Invoices "All generated bills"), PLATFORM (Pharmacies "Manage pharmacies", Stockists "Manage stockists", Settings "Platform settings", Login History "View login attempts"), COMMUNICATION (Notifications "System alerts & broadcasts", Messages "View all user conversations"), PREFERENCES (Help Center "FAQs & support"). No live profile fetch — displayName from `profile.full_name || "Admin"`, subtitle hardcoded "Admin Panel", avatarUrl always undefined. All admin links routed.

### E2.2 Component behavior catalog

**`MenuPage` (`src/components/shared/MenuPage.tsx`, 107 lines) — full spec (deeper than §A5)**
- Props: `avatarUrl?, displayName, subtitle?, subline?, sections, searchable = true` (all three More pages leave `searchable` at default true). `MenuItem` supports `customContent?: React.ReactNode` (rendered in place of the ChevronRight) and `logo?: string` (image replaces the icon in the 10×10 tile) — **neither is used by any caller** in this repo.
- Avatar fallback = first character of displayName uppercased on `bg-primary/10 text-primary`.
- Search filters case-insensitively over `item.title` and `item.description`; sections with zero surviving items are removed entirely (so section headings never render empty).
- Logout button: `await signOut()` then `navigate("/login")`; since `useAuth().signOut` performs the demo sign-out (localStorage clear + hard redirect to `/`), the `navigate("/login")` call is effectively racing a full page reload.
- Footer literal: `Digi Swasthya v1.0.0`.

**`ProductFilters` (`src/components/stockist/ProductFilters.tsx`, 144 lines) — exact control spec**
- Fully controlled props (11 value/setter pairs); the component holds only `expiryMode` locally, defaulting `"before"`.
- Brand Select: `"all"` → "All Brands" plus **only the first 30** of the 101 `PHARMA_BRANDS` (`PHARMA_BRANDS.slice(0, 30)`, L29) — 71 brands can never be filtered by.
- Category Select: `"all"` + all 16 `PRODUCT_CATEGORIES`.
- Expiry Popover: two mode buttons "Expiring Before" (clicking it clears `expiryFrom`) and "Date Range"; before-mode shows one date input (writes `expiryTo`, clears `expiryFrom` on change); range-mode shows From/To date inputs. Trigger button variant flips outline→default when a filter is active; label = `Before {to}` or `{from} — {to}`, truncated at 100px; inline X clears both (with `stopPropagation`), and a "Clear Filter" ghost button appears inside the popover when active.
- Sort Select options: `name` / `price` / `expiry` / `newest` (note: the consuming `filtered` memo in `StockistProducts.tsx` sorts only name/price/expiry — selecting "Newest" is a no-op that keeps query order).
- Grid toggle: two icon buttons (Grid2X2 / Grid3X3) setting `gridCols` 2 or 3; the active one uses the `default` variant.

**`ChatPage` (`src/pages/shared/ChatPage.tsx`, 197 lines) — precise mechanics (extends §F)**
- The 3 hardcoded quick questions (L55–59), verbatim: (1) Q "How do I place an order?" → A "Go to Browse, find a stockist, add products to cart, and checkout." (2) Q "How do I track my order?" → A "Go to Orders tab to see all your orders and their current status." (3) Q "How do I make a payment?" → A "Go to Payments tab to view outstanding amounts and record payments."
- Quick-question matching algorithm (L105): lowercase both sides; match if `userText.includes(question.slice(0,20))` OR `question.includes(userText.slice(0,20))` OR exact equality. So typing any 20-char prefix of a quick question (e.g. "how do i place an or") triggers the canned bot answer.
- Bot fallback message verbatim (L114): *"Your question has been forwarded to our support team. They'll respond shortly."*
- Empty-conversation greeting (non-admin only): "👋 Hi! How can we help you?" + "Choose a question or type your own" + up to 6 quick-question chips (`bg-primary/10 text-primary`). Once messages exist, a horizontal scroll strip of up to 4 quick-question pills sits above the input.
- Header text: admin viewing a user → title "Chat with User" / subtitle "Admin view"; otherwise "Support Chat" / "Ask questions or get help".
- Bubble labeling: bot bubbles get a tiny "Bot" caption; admin messages seen by a user get "Admin"; user messages seen by an admin get "User". Alignment: right for the sender's own messages (user-own, or admin-own when isAdmin); left otherwise. Colors: own = `bg-primary`, bot = `bg-secondary`, admin-as-seen-by-user = `bg-accent/10`. Timestamps `toLocaleTimeString` hh:mm.
- Conversation bootstrap: admin view (`adminViewUserId` param) never creates a conversation — if the target user has none, the admin sees an empty thread and `sendMessage` silently returns (`if (!convId) return`). A non-admin with no conversation gets one created on init AND lazily again in `sendMessage` if still missing. Role recorded on the conversation = first non-admin role from `user_roles`, defaulting `"stockist"`.
- Realtime effect (L40–51) subscribes to `postgres_changes INSERT on chat_messages filter conversation_id=eq.{id}` with an id-dedupe append — fully wired but inert under `MockChannel`.
- Layout: page height `h-[calc(100vh-3.5rem-4rem)]` (viewport minus TopNav minus BottomNav); header h-12 sticky; send button disabled when `!input.trim() || sending`; auto-scroll to bottom on every messages change via `bottomRef.scrollIntoView({behavior:"smooth"})`.

**`VideoPlayer` (inline in `StockistHelpCenter.tsx` L39–146) — control inventory**
- Custom overlay on `<video playsInline>`: gradient bottom bar with a 0.1-step progress Slider (seek), play/pause toggle (also fires on video click), mute toggle + 0–1 volume Slider (step 0.05; setting volume 0 flags muted), `m:ss / m:ss` tabular time readout via `formatTime` (guards `!isFinite` → "0:00"), a native `<select>` speed picker 0.5x/1x/1.5x/2x (`playbackRate`), fullscreen toggle (`requestFullscreen`/`exitFullscreen` on the container), and an X close button that collapses the player. Event listeners: `timeupdate`, `loadedmetadata`, `ended` (resets playing state).

**`EditPharmacyDialog` block/unblock notification (`src/components/stockist/EditPharmacyDialog.tsx` L38–47)** — sent only when the blocked flag actually changed (`isBlocked !== (circle?.is_blocked || false)`) and the pharmacy has a `user_id`. Verbatim messages: blocked → *"Your ordering privileges have been temporarily suspended by the stockist."*; unblocked → *"Your ordering privileges have been restored by the stockist."* Type `circle_status`; titles "Account Blocked" / "Account Unblocked". Save success toast is just "Updated".

**Print Packing Slip HTML (`src/pages/stockist/StockistOrderDetail.tsx` L530–541)** — `window.open` then `document.write` of a full standalone HTML doc: `<title>Packing Slip - {order_number}</title>`, inline CSS (sans-serif, 13px body, bordered table, `#f5f5f5` header row), `<h2>Packing Slip</h2>`, meta lines `Order #{n} • {dd MMM yyyy}` and `Pharmacy: {name} • {address}, {city}`, a 3-column table (#, Product, Qty — **no prices on the packing slip**), and footer `Generated {toLocaleString()}` in 11px `#999`. Then `document.close(); print()`. Product name falls back to "—".

### E2.3 Entity & data-model deep detail

- **`app_preferences` shape (localStorage, written by `StockistSettings`/`PharmacySettings`)** — exact default object (`src/pages/stockist/StockistSettings.tsx` L53–58): `{ pushNotifications:true, emailNotifications:false, smsNotifications:false, sound:true, vibration:true, language:"en", emailOrders:true, emailPayments:true, emailOffers:false, emailCompliance:true, smsOrders:true, smsPayments:true, smsOffers:false, smsCompliance:true }`. Per-category checkboxes are keyed `email{Category}`/`sms{Category}` over the 4 `notifCategories` (orders/payments/offers/compliance, L19–24). Same shape in PharmacySettings. No code path ever reads these prefs to gate an actual notification.
- **Language list (both Settings pages, L10–17)**: `en` English (available:true) plus 5 unavailable rows — `hi` Hindi ("Coming Soon — April 1"), `pa` Punjabi, `mr` Marathi, `ta` Tamil, `te` Telugu (all "Coming Soon").
- **Notification `type` → consumer matrix** (complements §J): only `order`, `payment`, `system`, and (pharmacy page) `alert`/`feedback` have icons/tabs anywhere; `bill`, `stock`, `approval`, `broadcast`, `targeted`, `payment_reminder`, `price_change`, `registration`, `circle_status`, `profile_update`, `offer` render with the Bell fallback and are reachable only via the "All" tab. `offer` has an icon in the stockist map but no seed row or writer ever produces it.
- **Bill status full write/read matrix** (consolidates §3.13 with the count made explicit): writers — `BillPreviewDialog` → `"confirmed"`; `StockistBulkBill` → `"final"`. Readers — `StockistPurchaseBillHistory` highlights `"finalized"`; `StockistPayments` Bills tab & `StockistPharmacyDetail` highlight `"confirmed"`; `AdminBills` filter enumerates `draft|finalized`; `VerifyBill` displays whatever string is stored. Seed values: `paid|draft|sent`. Eight distinct status literals exist for one column across the codebase.
- **Conversation lifecycle**: `conversations` rows are created (a) on `ChatPage` init for a non-admin user without one, (b) lazily in `sendMessage`. They are never updated (`updated_at` untouched by app code) and never deleted. Admin can only view/reply to conversations that already exist (`AdminMessages` lists them; ChatPage admin view reads by `user_id` with `maybeSingle`).
- **`chat_messages.sender_type` domain as actually written**: `"user"` (non-admin sender), `"admin"` (admin sender), `"bot"` (canned/AI replies, always `sender_id:null`).
- **Bills field-shape divergence by writer**: BillPreviewDialog persists `discount_type, discount_value, subtotal, total_amount` (no `gst_amount`, no `due_date`); StockistBulkBill persists only `bill_number/stockist_id/pharmacy_id/subtotal/total_amount/status` — bulk bills therefore have `discount_*` and `gst_amount` entirely absent (undefined), not 0.

### E2.4 Workflow traces

**W1. Stockist "Send Reminder" (`src/pages/stockist/StockistPayments.tsx`, `sendReminder` L137–168) — full branch trace**
1. Trigger: header "Remind" button → dialog with a Select over `pharmaciesWithOutstanding = circleData.filter(c => c.outstanding > 0)` (with seed data: HealthPlus ₹4,839, City Care ₹9,990, MedLife ₹3,250 — Apollo excluded at ₹0). Empty branch renders *"No pharmacies with outstanding balance"*.
2. Guard: no selection → `toast.error("Select a pharmacy")`. Missing circle row → silent return.
3. Resolve pharmacy name (fallback "Pharmacy"), phone = `whatsapp_number || phone`, and `user_id` from the joined profile.
4. Notification insert only if `user_id` resolved (see E2.9 table). Code comment: "Log reminder via notification only" — no reminder record table.
5. WhatsApp deep link only if a phone resolved: strip non-digits, prefix `91` unless the number already `startsWith("91")`, open `https://wa.me/{phone}?text={encodeURIComponent(msg)}` in a new tab. Message template verbatim (L146): `Hello {pharmName},\n\nThis is a payment reminder from {business_name || "your stockist"}.\n\n💰 Outstanding: ₹{outstanding}\n\nPayment Details:\n` + (`UPI: {upi_id}\n` if set) + (`Bank: {bank_name}\nA/C: {account_number}\nIFSC: {ifsc_code}\n` if bank set) + `\nPlease clear the dues at the earliest.\n\nThank you!\n— {business_name}`.
6. Completion: `toast.success("Reminder sent")`, dialog closes, selection reset — the toast fires even if neither a notification nor a WhatsApp link was possible.

**W2. Support-chat message lifecycle (non-admin), per `ChatPage.sendMessage` (L86–119)**
Trigger: submit form or tap a quick-question chip → ensure conversation (create if absent; failure → toast "Failed to start chat", abort) → insert user `chat_messages` row (failure → toast "Failed to send message", abort) → clear input → branch:
- quick-question match (20-char prefix rule) → insert bot row with the canned answer → done;
- else invoke `chat-bot`; if `botData.reply` → insert bot row with it → done;
- invoke error / throw → insert bot row with the forwarded-to-support fallback → done.
Under the mock: inserts are echo-only and there is no realtime, so **none of these rows ever appear in the UI** — the thread visually stays at its seed content (2 messages for s-user-001; empty for pharmacy/admin users). Admin branch (`isAdmin`) skips all bot logic — an admin reply is a single insert.

**W3. Admin platform-settings "save" flows (AdminSettings)** — trigger any Save → validation branch (E2.9) → `setSaving(true)` → success toast → `setSaving(false)`. No query, no mutation, no localStorage — the workflow is entirely client-side theater. Logo upload is the sole flow touching the (mock) backend (`storage.from("platform").upload`).

**W4. Bulk bill generation exception paths (`StockistBulkBill.handleBulkGenerate` L40–90)** — guard `!stockistId || selected.length===0` silently returns (button is hidden at 0 anyway). Any bill-insert error `throw`s out of the per-pharmacy loop → `toast.error(err.message)`; bills already created for earlier pharmacies in the same batch are NOT rolled back (no transaction). Selected ids not found in the current list are skipped silently (`if (!order) continue`). Notification insert is fire-and-forget per pharmacy.

**W5. Stockist feedback submission (`StockistHelpCenter.handleSubmitFeedback` L157–177)** — guard: missing feedback or category → `toast.error("Please fill required fields")` (Team optional, recorded as "All"). Fetch all admin `user_roles`; sequential per-admin notification inserts (no 100-chunking, unlike AdminNotifications broadcast); success clears form + collapses card; catch → `toast.error(err.message)`.

### E2.5 Business rules & calculations

- **Bulk-bill subtotal**: `subtotal = Σ (order.total_amount || 0)` per pharmacy group; `total_amount = subtotal` exactly — no rounding call, no discount, no GST (`StockistBulkBill.tsx` L55, L61–62). Displayed with `toLocaleString()` in the pharmacy notification.
- **WhatsApp phone normalization — two inconsistent regimes**: `StockistPayments` (L160–161) uses `replace(/[^0-9]/g,"")` + conditional `91` prefix via `startsWith("91")` (a 10-digit local number that happens to begin "91…" would be wrongly left unprefixed); `PharmacyStockistDetail` L172 (`replace(/\D/g,"")`) and `StockistPharmacyDetail` L198 (`replace(/[^0-9]/g,"")`) do **no** country-code prefixing at all — profile-card WhatsApp buttons open `wa.me/9876543210` while payment reminders open `wa.me/919876543210`.
- **BillPreviewDialog WhatsApp share text** (L171): `TAX INVOICE {billNumber}\nFrom: {business_name}\nTo: {pharmacy_name}\nTotal: ₹{total.toFixed(2)}\nDate: {dd/MM/yyyy}` via `wa.me/?text=` (no recipient number — user picks in WhatsApp).
- **Menu search rule** (MenuPage L35–39): case-insensitive substring over title OR description; empty search returns sections untouched; matching is per-item with empty sections pruned.
- **ChatPage 20-char prefix rule** (E2.2) is the only fuzzy-matching logic in the shipped frontend (the richer ≥2-keyword-overlap matcher lives only in the unreachable `chat-bot` edge function).
- **Video time formatting**: `formatTime = floor(s/60) + ":" + floor(s%60).padStart(2,"0")`, `"0:00"` for non-finite (pre-metadata duration).
- **Export filename date**: `new Date().toISOString().split("T")[0]` — UTC date, so an export at 03:00 IST is stamped with the previous calendar day.
- **StockistProducts sort gap**: ProductFilters offers `newest`, but the sort switch in `StockistProducts.tsx` handles only `name`/`price`/`expiry` — selecting "Newest" leaves the array in query order.

### E2.6 Mock-backend reference

Parts A1/L already cover the mock client exhaustively. Genuinely new operational notes from this pass:

- **`StockistBulkBill`'s two-step read works correctly under the mock** because both queries use only supported operators (`eq`, `order`, plain select + the mapped `orders → pharmacy_profiles` join) — one of the few multi-table client-side "joins" in the app that behaves identically to a real backend (modulo the un-scoped `bill_orders` read, which under real RLS would be row-restricted).
- **`StockistMore`/`PharmacyMore` header fetches** (`.eq("user_id", user.id).single()`) resolve for s-user-001/p-user-001 against seed profiles; given the mock's `.single()`-on-empty behavior (returns `data:null`, no error — §L2), the display-name fallbacks kick in silently for any other user.
- **`ChatPage` role detection** relies on the `user_roles` table read (not the `has_role` RPC); `DEMO_USER_ROLES` covers all three demo users, so `isAdmin` is true only for a-user-001 and non-admin role resolution returns `stockist`/`pharmacy` correctly.
- **AdminSettings logo upload** exercises `MockStorage.upload` with an options object `{ upsert:true }` — accepted and ignored; the mock returns path `demo/{ts}` regardless of the requested `logo-{ts}.{ext}`, but `getPublicUrl` is then called with the *requested* path, yielding `https://placeholder.com/logo-{ts}.{ext}`.

Otherwise: no new findings beyond existing review (§A1, Part L).

### E2.7 Role journeys step-by-step

Parts R1–R8 narrate the principal journeys. New code-verified micro-journeys:

**Stockist — month-end billing sweep (More → REPORTS path)**
1. More → type "bill" in the menu search — matches "Payments & Billing", "Purchase Bill History", "Bulk Bill" (title/description substring, E2.5).
2. Bulk Bill → in the demo, lands on *"All delivered orders have been billed"* (seed linkage §L5). With unbilled delivered orders present: tap cards or "Select All" → `Generate Bills (N orders)` → one bill per pharmacy at status `final`, each pharmacy notified ("New Bill Generated") → success toast → list refetches (and, since inserts don't persist, repopulates identically).
3. Purchase Bill History to review; Export Catalogue → Excel for an offline price list. All back navigation is header-arrow `navigate(-1)`.

**Stockist — chase outstanding dues**
1. Payments → Outstanding tile ₹18,079 → "Remind" → pick one of the 3 pharmacies with dues → Send: pharmacy receives an in-app `payment_reminder` notification AND a WhatsApp tab opens pre-filled with the UPI/bank template (W1).
2. Alternative: Pharmacies → chip "outstanding" → card "Collect Payment" → CollectPaymentDialog FIFO (§H). The two paths differ in artifact: reminder writes only a notification; collection writes a confirmed payment + order payment statuses + circle decrement.

**Pharmacy — get help**
1. More → Help Center → 5-FAQ accordion (single-open) → contact tiles: mailto `help@digiswasthya.in`, tel `9672123711`, Chat → `/pharmacy/messages`.
2. Support Chat: 👋 empty-state greeting + 3 quick-question chips; tapping "How do I place an order?" sends it — under the mock nothing renders back (W2), so the demo journey visibly stalls; the pinned support thread in `/pharmacy/chats` also shows no history (the single seed conversation belongs to the stockist user).

**Admin — platform configuration**
More → Settings → upload logo (broken placeholder preview) → commission 5 → Save ("Commission rate saved") → GST medicines 12 → Save → uncheck cheque → Save. Refresh: every value resets to defaults (W3) — the journey demonstrates UI affordances only.

**Admin — answer a support ticket**
More → Messages → list shows the one seeded conversation (Rajesh Kumar / stockist; last message "You can go to the Products page and click the 'Bulk Upload' button.") → tap → `/admin/messages/s-user-001` → ChatPage admin view (header "Chat with User" / "Admin view") → type reply → send (insert no-op; bubble never appears). No conversation exists for the pharmacy/admin users, so there is nothing else to open.

### E2.8 Hidden/internal functionality

- **Complete localStorage key census** (grep-verified outside `components/ui`): `demo_role` (read ×2 in the two auth hooks, set ×1 via `useDemoAuth.setRole`, removed ×2 on sign-out), `theme` (read ×3 — App bootstrap + both Settings pages; set ×2), `app_preferences` (read ×2 / set ×2 — the two Settings pages). No other app-level keys exist; there is no cart, draft, or session persistence of any kind.
- **Dormant MenuPage extension points**: `MenuItem.customContent` and `MenuItem.logo` have implemented render paths (`src/components/shared/MenuPage.tsx` L80, L86) with zero callers.
- **`ChatPage` admin dead-end**: `sendMessage` early-returns for an admin viewing a user who has no conversation — a silent, toast-less no-op path (L97).
- **Numbered feature-tag comments** (lineage tracker remnants): `// #43: Bulk Bill Generation` (StockistBulkBill L13), `// #42: Notify pharmacy about bill` (L69), `// #39 Notify pharmacy if blocked/unblocked` (EditPharmacyDialog), `// #30 Partial Delivery Dialog` (StockistOrderDetail L553), `#214 Offline Support` (useOfflineDetector).
- **AdminSettings defaults**: all four payment methods hardcoded `true` on mount; combined with the no-op save, the card always renders fully checked after any reload.
- **StockistSettings self-documenting comment** (L31): "Theme state managed manually since next-themes ThemeProvider isn't wrapped" — explicit acknowledgment that the installed `next-themes` dependency is bypassed.
- **Help-copy drift baked into UI strings**: PharmacyHelpCenter references an "Inventory tab"; AdminHelpCenter references Platform Analytics / Counterfeit Management / Export Data / System Architecture — all lineage-app features absent from this repo.

### E2.9 Validation & error-handling catalog

**Complete sonner toast catalog** (grep over `src/pages`, non-ui `src/components`, `src/hooks`; verbatim strings, dynamic parts in `{}`):

*Auth & account (mostly on dead pages — Login/Register/Forgot/Reset):* "Please enter email and password" · "Too many failed attempts. Please try again in 15 minutes." · "Invalid email or password. Please try again." · "Please verify your email before logging in. Check your inbox." · "Your account does not have {role} access. Please select the correct role." · "Your account is pending admin approval." · "Your registration was rejected by admin." · "Login successful!" · "Login failed. Please try again." · "Admin login enabled" (info) · "App installed!" · "Password reset email sent!" · "Failed to send reset email" · "Passwords do not match" · "Password must be at least 6 characters" · "Password updated successfully!" / "Password updated successfully" · "Failed to update password" · "Registration successful! Awaiting approval." (both wizards) · "Registration failed" · "Enter a valid 6-digit PIN code" (StockistRegistration serviceable-PIN list) · "Verification email sent! Check your inbox." (stockist profile "Verify Now" — would actually throw, §L6).

*Profile / password / privacy (live pages):* "Profile updated" · "Passwords don't match" · "Min 8 characters" · "Password changed" · "All sessions logged out" · "Failed to logout all sessions" · "Account deletion requested. Contact support." (PharmacyPrivacySecurity) · "Account deletion request submitted. An admin will process it shortly." (StockistPrivacySecurity, info) · "Business details updated. Pending re-verification." (both roles) · "Document uploaded" · "Failed to upload {file.name}" / "Upload failed".

*Products:* "Product name is required" (Add / Edit / dead ProductForm) · "Product added" · "Product updated" · "Product duplicated" · "Deleted" · "Enter at least 3 characters for product name" · "Auto-fetch failed. Try again." · "Auto-fetch failed" · "{N} fields suggested — review before saving" · "No details found for this product" (info) · "Updated {N} products" (bulk price) · Bulk catalogue: "No valid products found in file" · "Found {N} products" · "Failed to parse file" · "{N} validation error(s)" (with description = first 3 errors joined) · "{N} products uploaded" · Purchase bill: "Failed to upload file" · "Failed to extract products from bill" · "No products could be extracted" · "Extracted {N} products" · "Failed to process bill" · "{created} created, {updated} updated".

*Orders:* "Order placed!" (storefront & quick order) · "Order exceeds credit limit. Outstanding: ₹{out}, Cart: ₹{cart}, Limit: ₹{limit}" · "Paste order text first" · "No items could be parsed" (info, StockistCreateOrder) / "Could not parse items" (PharmacyQuickOrder) · "{N} items parsed" · "Failed to parse" / "Parse failed" · "Select a pharmacy" · "Add items" · "Match at least one product" · "Order {orderNumber} created" · "Order marked as {label}" · "Order cancelled" / "Order cancelled — stock restored" · "Invalid quantities" · "Cannot remove all items. Cancel instead." · "Order updated" · "Select items to return" · "Return processed. ₹{refund} added to credit balance." / "…reduced from outstanding." · "Select items to deliver" · "Partial delivery recorded: {N} items" · "Select items for split order" · "Split order {number} created" · "Order duplicated" · "Enter order items" · "{N} discrepancies reported to stockist" (warning) / "All quantities verified — no discrepancies" · "PDF generation failed".

*Circle & payments:* "Added to your circle" / "Stockist added to your circle" / "Added to circle" · "Already in your circle" (on error code 23505) · "Removed from circle" · "Phone copied" / "Copied" · "Enter a valid amount" (CollectPaymentDialog) · "Payment recorded" · "Select stockist and enter amount" (PharmacyPayments) · "Payment recorded & stockist notified" · "Payment approved" / "Payment rejected" · "Select a pharmacy" / "Reminder sent" · "Updated" (EditPharmacyDialog).

*Bills:* "Select at least one order" (QuickBillDialog) · "Bill generated" · "PDF downloaded" · "Failed to generate PDF" · "{N} bills generated for {M} orders".

*Serviceable areas:* "Enter valid 6-digit PIN" · "PIN already added" · "PIN added" · "Removed".

*Notifications & chat:* "All marked as read" · "Title is required" · "No users found" · "Broadcast sent to {N} users" · "Email and title required" · "User not found with this email" · "Notification sent" · "Failed" · "Failed to initialize chat" · "Failed to start chat" · "Failed to send message" · "Failed to send" (PeerChatPage).

*Admin:* "Please enter a rejection reason" (both detail pages) · "Pharmacy {approved|rejected}" · "Stockist {approved|rejected}" · "{N} stockist(s) {status}" / "{N} pharmacy(ies) {status}" (bulk queue actions) · "Document status updated" · "Status updated to {label}" (order override) · "Customers cannot be suspended via approval status" · "User {suspended|approved}" · "Logo updated" · "Enter valid %" · "Commission rate saved" · "Enter valid rate" · "GST rate for {category} saved" · "Payment methods saved".

*Misc:* "Feedback submitted! Thank you." · "Please fill required fields" · "Exported {N} products" · "No products to export" · "Stock alert notification created" (dead StockAlerts component).

**Native `confirm()` prompt catalog** (verbatim): "Logout from all devices?" and "This action is irreversible. Delete your account?" (`PharmacyPrivacySecurity` L40/L46) · "Remove this pharmacy from your circle?" (`StockistPharmacies` L72, `StockistPharmacyDetail` L107) · "Cancel this order? This cannot be undone." (`StockistOrderDetail` L131) · "Remove {pinCode}?" (`StockistServiceableAreas` L40) · "Update {bulkPriceField} for {N} products?" (`StockistProducts` L214) · "Delete this item?" (`SharedProductDetail` L93).

**Notification-insert catalog** (every app-written `notifications` row; title / message template / type / recipient):

| Writer (file:line) | Title | Message template | Type | Recipient |
|---|---|---|---|---|
| `PharmacyStockistDetail.tsx:118` | New Order from Pharmacy | `{pharmacy_name} placed order #{n} for ₹{total}` | order | stockist user |
| `PharmacyQuickOrder.tsx:121` | New Order from Pharmacy | same template | order | stockist user |
| `StockistCreateOrder.tsx:169` | New Order from Stockist | `Order #{n} with {N} item(s) for ₹{total}` | order | pharmacy user |
| `StockistOrderDetail.tsx:118` | `Order #{n} {StatusLabel}` | `Your order has been updated to: {StatusLabel}` | order | pharmacy user |
| `PharmacyOrderDetail.tsx:71` | `Quantity Discrepancy - #{n}` | `Pharmacy reported: {mismatch list joined "; "}` | order | stockist user |
| `PharmacyPayments.tsx:113` | Payment Received from Pharmacy | `₹{amt} payment recorded by {name} via {method}( (Ref: {id}))` | payment | stockist user |
| `StockistPayments.tsx:152` | Payment Reminder | `₹{out} outstanding from {business_name}` | payment_reminder | pharmacy user |
| `StockistBulkBill.tsx:74` | New Bill Generated | `Bill {n} for ₹{subtotal} has been generated for {N} orders` | bill | pharmacy user |
| `StockistEditProduct.tsx:157` | Product Price Updated | `"{name}" price changed from ₹{old} to ₹{new}` | price_change | circle pharmacy users (0 in practice, §3.4) |
| `StockistBusinessDetails.tsx:53` / `PharmacyBusinessDetails.tsx:59` | Profile Updated | `{name} has updated their {business|pharmacy} profile and needs re-verification.` | profile_update | all admins |
| `AdminPharmacyDetail.tsx:61` / `AdminStockistDetail.tsx:72` | Account Approved / Account Rejected | `Your {pharmacy|stockist} account has been approved.` / `…rejected. Reason: {reason}` | approval | that user |
| `AdminUsers.tsx:66` | Account Suspended / Account Restored | `Your account has been {suspended|restored} by admin.` | system | that user |
| `AdminNotifications.tsx` (broadcast) | user-entered | user-entered | broadcast | all users of target role(s), chunks of 100 |
| `AdminNotifications.tsx:83` (targeted) | user-entered | user-entered or null | targeted | profile matched by email |
| `StockistHelpCenter.tsx:166` | `Feedback: {category}` | `From {name} ({email})\nTeam: {team|All}\n\n{feedback}` | feedback | all admins |
| `EditPharmacyDialog.tsx:42` | Account Blocked / Account Unblocked | verbatim in E2.2 | circle_status | pharmacy user |
| Registration wizards (dead pages) | — | `{name} has registered as a {stockist|pharmacy} and awaits approval` | registration | all admins |
| `StockAlerts.tsx:36` (dead component) | Low Stock Alert | `{N} item(s) are below minimum stock level and need reordering.` | system | self |

**Field-level validation census (live pages)** — no form library is used on shipped pages (zod/react-hook-form exist only in the shadcn `form.tsx` primitive); every check is imperative: product name required (Add/Edit); PIN codes `/^\d{6}$/` + dedupe (ServiceableAreas; registration wizard serviceable list); password ≥8 on profile pages vs ≥6 on privacy pages and ResetPassword — two different minimums coexist; payment amount must be > 0; order-edit quantities: non-negative integers, not all zero; partial-delivery qty clamped `min=0 max=item.quantity` at the input level (`StockistOrderDetail.tsx:567`); split qty `max = quantity − 1`; bulk-price value numeric with `Math.max(0, round(×100)/100)` floor; admin rejection reason required only on the detail pages (queue-page bulk buttons skip it); broadcast title required; targeted email + title required; AdminSettings numeric guards (`isNaN(Number(...))`). Everything else — emails, phones, PAN format, IFSC format, account numbers, GST numbers, expiry dates — is accepted unvalidated on live pages.

---

*End of EXPANSION PASS 2 (2026-07-08). Files read for this pass: `src/pages/stockist/{StockistMore,StockistExportCatalogue,StockistBulkBill,StockistNotifications,StockistHelpCenter,StockistSettings,StockistPayments,StockistOrderDetail}.tsx`, `src/pages/pharmacy/{PharmacyMore,PharmacyHelpCenter}.tsx`, `src/pages/admin/{AdminMore,AdminSettings,AdminHelpCenter}.tsx`, `src/pages/shared/ChatPage.tsx`, `src/components/shared/MenuPage.tsx`, `src/components/stockist/{ProductFilters,EditPharmacyDialog,BillPreviewDialog}.tsx`, plus full-tree greps for toast / confirm / localStorage / notification-insert / wa.me strings.*
