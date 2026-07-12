> **Extracted from** [`UNIFIED_FEATURES.md`](../UNIFIED_FEATURES.md) Appendix A (ERP).
> **Source repo:** `stockpharmaerp (ERP)`
> Use [`EXHAUSTIVE_REVIEW_PROMPT.md`](../EXHAUSTIVE_REVIEW_PROMPT.md) to re-run or extend this review.

# StockPharma ERP — Exhaustive Functional Review

> In-product name: **Digi Swasthya Store** (AI assistant branded **Digi Swasthya AI**)
> Multi-role B2B/B2C pharmaceutical distribution & commerce PWA.
> Stack: Vite + React 18 + TS · shadcn/ui + Tailwind · React Router v6 · TanStack Query · Zustand · Supabase (Auth/Postgres/Storage/Realtime/Edge Functions) · Lovable AI Gateway (`ai.gateway.lovable.dev`, Gemini-primary + GPT fallback; two functions use `api.lovable.app/v1/ai/chat`).

This document goes far deeper than `FEATURES.md`: it captures exact routes, fields, validations, columns, KPI formulas, status flows, and code-level logic per screen. Currency everywhere is `₹` via `toLocaleString('en-IN', {minimumFractionDigits:2, maximumFractionDigits:2})` unless a page uses `Math.round`/`toFixed`.

---

## 0. GLOBAL ARCHITECTURE

### 0.1 Router (`src/App.tsx`)
- **QueryClient**: `staleTime 60s`, `gcTime 600s`, `retry 2` with exp backoff (`min(500*2^n, 5000)`), `refetchOnWindowFocus false`, `refetchOnReconnect true`, `refetchOnMount false`. Mutations: `retry 1`; global `onError` auto-calls `supabase.auth.refreshSession()` on 401.
- Providers nested: `QueryClientProvider > TooltipProvider > BrowserRouter > AuthProvider > PharmacyProvider > CartProvider`. Global widgets: `Toaster` (shadcn), `Sonner`, `PWAInstallPrompt`, `PWAUpdateNotification`, `NetworkStatus`, `SessionTimeoutWarning`, all wrapped in `RouteErrorBoundary` + `Suspense` (fallback `PageLoadingSpinner`). All page components are `React.lazy`.
- **Route table** (path → guard → component):
  - Public: `/` & `/login` → Login; `/forgot-password`; `/reset-password`; `/role-selection` (ProtectedRoute, no role — deprecated, just redirects to /login).
  - Onboarding (ProtectedRoute `requiredRole=X requiresOnboarding=false`): `/onboarding/{stockist|pharmacy|patient|brand|mr}`.
  - Stockist (ProtectedRoute `requiredRole=stockist`): `/stockist/home`, `/stockist/pharmacies`, `/stockist/pharmacies/:pharmacyId`, `/stockist/products`, `/stockist/orders`, `/stockist/orders/:orderId`, `/stockist/order-creation`, `/stockist/payments`, `/stockist/payment-approvals`, `/stockist/analytics`, `/stockist/route-execution`, `/stockist/pharmacy-approvals`, `/stockist/batch-ordering`, `/stockist/delivery-settings`, `/stockist/profile`.
  - Pharmacy portal (requiredRole=pharmacy): `/pharmacy/portal`, `/pharmacy/inventory`, `/pharmacy/ordering`, `/pharmacy/financials`, `/pharmacy/analytics`, `/pharmacy/stockists`, `/pharmacy/stockists/:stockistId`, `/pharmacy/cart`, `/pharmacy/checkout`, `/pharmacy/orders`, `/pharmacy/profile`.
  - Patient (requiredRole=patient): `/patient/dashboard`, `/patient/search`, `/patient/checkout`, `/patient/prescriptions`, `/patient/compare`, `/patient/ai-assistant`, `/patient/wishlist`, `/patient/orders`, `/patient/profile`.
  - Brand (requiredRole=brand): `/brand/dashboard`, `/brand/products`, `/brand/campaigns`, `/brand/analytics`, `/brand/fulfilment`, `/brand/profile`.
  - MR (requiredRole=mr): `/mr/dashboard` (=MRPharmacies), `/mr/pharmacies`, `/mr/collections`, `/mr/analytics`, `/mr/profile`.
  - Shared (ProtectedRoute, any role): `/support`, `/settings`.
  - Admin (AdminRoute): `/admin`, `/admin/users`, `/admin/recalls`, `/admin/notices`, `/admin/disputes`, `/admin/analytics`, `/admin/enhanced-analytics` (NOT linked from dashboard grid), `/admin/audit-logs`, `/admin/fees`, `/admin/documents`, `/admin/templates`, `/admin/territories`, `/admin/campaigns`, `/admin/pharmacy-approvals`.
  - Public catalogue (no auth; `PharmacySessionProvider` on all except license page): `/catalogue/:stockist_slug` (LicenseVerification), `/catalogue/:stockist_slug/dashboard`, `/catalogue/:stockist_slug/products`, `/catalogue/:stockist_slug/orders`, `/catalogue/:stockist_slug/checkout`.
  - Public: `/pharmacy-registration`. Errors: `/not-authorized`, `/offline`, `*` → NotFound.
- **Orphaned components** (built but NOT wired into router): `PatientSignup.tsx`, `BrandSignup.tsx` (self-serve signup pages exist but no route; only the Login page signup tab is used). `Index.tsx` exists (role→dashboard redirect) but `/` is mapped to Login, so Index is effectively dead too.

### 0.2 Contexts
- **AuthContext**: state `user, session, isLoading, userRole, isRoleLoading, onboardingComplete{stockist,pharmacy,patient,brand,mr}` (all default **true**), `signOut, refreshSession, lastActivity, updateLastActivity`. On sign-in, one `Promise.all` (8s `ROLE_FETCH_TIMEOUT`) queries: `user_roles` (single role via maybeSingle), `stockist_details` by profile_id, `pharmacy_details` by BOTH `auth_profile_id` and `profile_id`, `patient_details`, `brand_details`, `mr_details`. `onboardingComplete[role]` = `queryError ? true : !!data` (error → assume complete to avoid redirect loops). Session timeout `SESSION_TIMEOUT=30min`, activity events `mousedown/keydown/scroll/touchstart` (1s debounce), checked every 60s → toast + signOut. `signOut` clears Zustand store (`usePharmacyStore.clearAll()`), calls `supabase.auth.signOut()`, `localStorage.clear()`, `sessionStorage.clear()`, navigates `/login`. Handles `SIGNED_IN/SIGNED_OUT/TOKEN_REFRESHED`.
- **useUserRole(userId)** hook: fetches ALL roles, picks most-privileged: **admin > stockist > pharmacy > mr > brand > patient**.
- **CartContext** (pharmacy portal): items `{productId, productName, stockistId, stockistName, quantity, unitPrice, mrp, maxStock}`. Persist key `${role}_cart_${userId}` (guest_cart fallback). `addItem` merges by productId (qty clamped to maxStock), `updateQuantity` clamps 1..maxStock. Helpers: getStockistItems/Subtotal, getTotalItems, getTotalAmount (`Σ unitPrice*qty`), getUniqueStockists, clearStockistItems, clearCart.
- **PharmacyContext** (public catalogue): `pharmacy{id,name,license_number,outstanding_balance,credit_balance}`, `stockist{id,name,company_name,upi_id,slug}`, `orders[]`, `cart[]`. Session persisted to `localStorage.pharmacy_session`; cart to `localStorage.pharmacy_cart`. Cart item carries `gst_percentage`. `clearSession` wipes both keys.
- **PharmacySessionContext**: 20-min inactivity timeout (`PHARMACY_SESSION_TIMEOUT`), checked every 60s → toast + `clearSession()` + navigate to `/catalogue/{slug}` (re-verify license).

### 0.3 Route guards
- **ProtectedRoute**: uses cached auth (no queries). Skeleton loader; `MAX_LOADING_TIME=10s` fallback forces render. Redirect logic: no user → `/login` (saves `from`); no role → `/login`; role mismatch → own dashboard (`roleDashboardPaths`); onboarding redirect ONLY when `onboardingComplete[role]===false` (explicit).
- **AdminRoute**: security-hardened — ignores cache, re-queries `user_roles` server-side every mount; non-admin → `/not-authorized`; unauth → `/login`.
- **DashboardLayout** (stockist wrapper) also independently checks: no user→/login, no role→/role-selection, stockist w/o `stockist_details`→/onboarding/stockist.

### 0.4 Layouts & Navigation (exact items)
- **Stockist** (`DashboardLayout`/`StockistLayout` = StockistTopNav + StockistBottomNav): TopNav has global search Popover (searches pharmacies by name/owner/phone/area limit5, products by name/brand/generic/category limit5, orders by order_number limit5 — all selecting a result just navigates to the list page), StockistChatAssistant, Support (headphones), Notifications bell, User dropdown (Profile / Logout). **BottomNav** (StockistBottomNav): Home, Pharmacies, Products, Orders, Payments, **Profile**. (Note a second `BottomNav.tsx` exists with Home/Pharmacies/Products/Orders/Payments/**Analytics** — unused variant.)
- **Pharmacy** (`PharmacyLayout` = PharmacyTopNav + PharmacyBottomNav): TopNav search (catalogue-enabled stockists by name/company limit5 → `/pharmacy/stockists/:id`), PharmacyChatAssistant, cart button with item-count badge, Support, User dropdown. BottomNav: Home, Stockists, Cart, Orders, Profile.
- **Patient** (`PatientLayout` = PatientTopNav + PatientBottomNav): TopNav = hamburger Sheet (Profile/Settings/Support/Logout) + "Digi Swasthya" title + NotificationBell + user icon. BottomNav: Home, Search, Prescriptions, Wishlist, Profile.
- **Brand** (`BrandLayout` = BrandTopNav + BrandBottomNav): TopNav = hamburger Sheet (Profile/Settings/Support/Logout) + "Brand Portal" + NotificationBell.
- **MR** (`MRLayout` = MRBottomNav): BottomNav Dashboard, Pharmacies, Collections, Analytics, Profile.
- **Admin** (`AdminLayout` = AdminSidebar collapsible + AdminTopNav): Sidebar items → Dashboard, Users, **Approvals** (`/admin/pharmacy-approvals`), Batch Recalls, Notices, Disputes, Analytics, Audit Logs, Fee Management, Documents, Templates, Territories, Campaigns, Settings. (Sidebar does NOT list Enhanced Analytics.)

### 0.5 Infra
- **storage.ts** `uploadToStorage(file, bucket)`: folder = `session.user.id`; path `${uid}/${timestamp}_${cleanName}`; `product-images`→public URL; `bills`/`prescriptions`→signed URL (1h). CSV: `parseCSVContent` (delimiter auto-detect `,`/`;`/tab, header normalize), `mapCSVToProduct` (alias map for product_name/brand/category/type/mrp/purchase_price(ptr)/sale_price(pts)/stock_quantity/gst/manufacturer/generic_name/batch_number).
- **offlineSync.ts**: singleton queue in `localStorage.offline_sync_queue`; replays on `window online`; `offlineAwareFetch` queues POST/PUT/DELETE/PATCH when offline and returns synthetic **HTTP 202** `{queued:true}`.
- **supabaseHelpers.ts**: `withTimeout`, `invokeWithTimeout(fn, body, 30000)` — default 30s edge invoke timeout.
- **PWA** (vite.config): dev port 8080, SWC, gzip+brotli, manual vendor chunks; `registerType:'prompt'`, `skipWaiting:false`, `navigateFallback:'/offline'`. Workbox: Supabase→NetworkFirst(10s,1d,100), images→CacheFirst(30d), fonts→CacheFirst(365d). Update poll 60s.
- **SessionTimeoutWarning**: AlertDialog appears in final 5 min with live `mm:ss` countdown; "Stay Logged In"→refreshSession, "Logout Now"→signOut.

---

## 1. AUTH & ONBOARDING

### 1.1 Login (`/login`, `/`) — `Login.tsx`
- Card titled **Digi Swasthya Store** / "Your Complete Healthcare Platform". Tabs: **Login** / **Sign Up**.
- **Login form**: Email (email, required), Password (password, required), "Remember me" checkbox (state only, not used), "Forgot password?" link. Submit → `supabase.auth.signInWithPassword`. On success toast; `useEffect` redirects by role via `redirectBasedOnRole`: admin→/admin; else `roleConfig[role].dashboard` unless `onboardingComplete[role]===false` → onboarding.
- **Sign Up form**: role grid (6 cards: **stockist/pharmacy/patient/brand/mr** — note admin NOT self-signup; the grid is `Object.keys(roleConfig)` = 5 roles) with icons (Building2/Store/User/Briefcase/Users); Email (required), Password (required, min 6), Confirm Password (required). Validations: role selected, passwords match, length≥6. Submit → `auth.signUp` (emailRedirectTo `${origin}/login`) → upsert `user_roles{user_id,role}` (onConflict user_id,role) → upsert `profiles{id,email}` → navigate to `roleConfig[role].onboarding`. Duplicate email → friendly error.
- Loading: skeleton card while `authLoading`.

### 1.2 ForgotPassword (`/forgot-password`)
- Email input → `auth.resetPasswordForEmail(email, {redirectTo:${origin}/reset-password})`; success state shows confirmation + Back to Login.

### 1.3 ResetPassword (`/reset-password`)
- Verifies session from reset link (else redirects to /forgot-password). New Password + Confirm (min 6, must match) → `auth.updateUser({password})` → /login.

### 1.4 RoleSelection (`/role-selection`) — deprecated
- Immediately toasts "Please use the signup form to select your role" and redirects to /login.

### 1.5 Onboarding flows
- **StockistOnboarding** (`/onboarding/stockist`): auth+role check; if `stockist_details` exists → /stockist/home. First run shows **OnboardingCarousel** (3 slides: Add Your Products / Share Your Catalogue / Track Everything) gated by `localStorage.onboarding_completed_stockist`. Form fields: Drug License Number*, Your Name* (stockist_name), Company Name*, Phone (tel), Business Address (textarea). Submit → slug `slugify(companyName)+'-'+Date.now()` → insert `stockist_details{profile_id, license_number, stockist_name, company_name, phone, address, catalogue_slug}` → /stockist/home.
- **PharmacyOnboarding** (`/onboarding/pharmacy`): keys on `auth_profile_id`; carousel (Browse Stockists / Compare & Order / Track Your Orders) gated by `onboarding_completed_pharmacy`. Fields: Pharmacy Name*, Owner Name*, Drug License Number*, GST Number*, Phone* (tel), Email, Address* (textarea), PIN Code*, Area. Insert `pharmacy_details{auth_profile_id, pharmacy_name, owner_name, license_number, gst_number, phone, email, address, pin_code, area}` → /pharmacy/portal.
- **PatientOnboarding** (`/onboarding/patient`): no carousel. Fields: Full Name* (patient_name), Phone* (tel), Date of Birth (date), Gender (Select male/female/other), Blood Group (Select A+…O-). Client validation requires name+phone. Insert `patient_details` → /patient/dashboard.
- **BrandOnboarding** (`/onboarding/brand`): waits for auth/role, redirects if role≠brand; if `brand_details` exists → /brand/dashboard. Fields: Brand Name*, Company Name*, Contact Person, Phone, Email, GSTIN, Manufacturing License, Address (textarea). Insert with `is_verified:false, is_active:true` → /brand/dashboard.
- **MROnboarding** (`/onboarding/mr`): if `mr_details` exists → /mr/dashboard. Fields: License Number*, Your Name* (mr_name), Company Name*, Phone, Address. Insert with slug `slugify(companyName)+'-'+Date.now()` (catalogue_slug) → /mr/dashboard.
- **OnboardingContent**: STORAGE_KEYS = `onboarding_completed_{stockist|pharmacy|catalogue}`. Illustrations in OnboardingIllustrations.tsx.

---

## 2. STOCKIST MODULE

### 2.1 Dashboard (`/stockist/home`) — `Dashboard.tsx`
- Uses `useStockistId` (React Query), `usePendingPayments(stockistId, 3)`, `useProcessPayment`, `useDashboardStats(stockistId)`. Realtime channel `dashboard-orders-updates` on `orders` filter stockist_id → refetch platform orders.
- **Header**: title "Dashboard" / "Welcome to your stockist control panel"; `DateRangeFilter` (calendar range popover, 2 months, Clear button — **display only, not applied to any query**); **Export** button → `ExportDataDialog`.
- **Quick Actions** card → `QuickActions` component: 8 tiles — **Quick Order** (paste→parse), **Quick Bill**, **Edit Order**, **OCR Scan** (ProductScanDialog), **Bulk Upload**, **Map Route**, **Upload Bill Photo** (BillUploadDialog), **Delivery Settings** (navigates). (Edit Order tile opens EditOrderDialog with `selectedOrderId=null` — effectively needs an order id, so it renders null until one is chosen — a soft stub.)
- **KPI Cards** (`KPICards`, clickable → `handleKPIClick` opens `KPIDetailDialog`): 5 cards, each shows hardcoded fake trend badges:
  - **Total Revenue** = `Σ orders.total_amount` (all orders for stockist). Sub "Today: ₹{todayRevenue}". trend "+12.5%".
  - **Pending Payments** = `Σ pharmacy.outstanding_balance` over pharmacies that have orders w/ this stockist. trend "-5.2%".
  - **Total Credits** = `Σ pharmacy.credit_balance` (same pharmacy set). trend "+3.1%".
  - **Active Pharmacies** = count of `is_active` pharmacies that have orders w/ stockist. trend "+2".
  - **Total Orders** = orders.length. Sub "Today: {todayOrders}". trend "+8.7%".
  - `useDashboardStats` formulas: parallel fetch orders (`total_amount,payment_status,created_at,pharmacy_id`) + active pharmacies (`outstanding_balance,credit_balance`). `todayOrders`=orders where `new Date(created_at).toDateString()===today`. Realtime channels `dashboard-stats-orders-{id}` (orders), `dashboard-stats-pharmacy-{id}` (pharmacy UPDATE).
  - **KPIDetailDialog** content by type: revenue/orders → order list (pharmacy name, order_number, relative time, ₹total, payment badge); pending → pharmacies with outstanding (name/area/₹outstanding); credits → pharmacies (+₹credit); pharmacies → cards (owner/area/total_orders). `handleKPIClick` queries: pending = unique pharmacy_ids from orders w/ payment_status in (unpaid,partial), then pharmacy_details `gt outstanding_balance 0`; credits = `gt credit_balance 0`; pharmacies = `is_active true`.
- **Payment Approvals card**: border turns `destructive/50` when pending>0; destructive Badge "{n} Pending". Shows up to 3 pending confirmations, each: pharmacy_name, ₹amount, payment_type badge, optional pharmacy_notes; inline buttons **Reject / Hold / Approve** (via `useProcessPayment.mutateAsync({confirmationId, action})`). "View All Payment Approvals" link. Empty state → "No payment approval requests yet" + View Payment History link.
- **Recent Platform Orders** card (only if platformOrders>0): fetches orders `order_source='platform'` limit5; each row (pharmacy name, order_number, "Platform Order" badge, ₹total, left-border primary) → `/stockist/orders/:id?source=platform`. "View All Platform Orders".
- **LowStockAlert** (orange card, only renders if any): products where `stock_quantity <= min_stock_threshold`, sorted asc, top 5 (name, brand, "{n} left" badge). "View All Products".
- **TopProducts** ("Top Selling Products"): aggregates `order_items` joined to confirmed orders of stockist; ranks by total_quantity desc top 5 (rank badge, name, units sold, ₹revenue).
- **NoticesPanel**: fetches `user_notice_recipients` for user (not dismissed) → `admin_notices` active & not expired. Each notice: icon by type (alert/warning/info), title, priority badge, content, created date, dismiss X (sets `dismissed_at`), click marks `read_at`. "N New" badge = unread count. Realtime on `user_notice_recipients` INSERT.
- **RecentOrders** (collapsible): last 5 orders (order_number, pharmacy_name, relative time, ₹total, status badge). Status colors map draft/confirmed/processing/delivered/cancelled.
- **ActivityFeed** (collapsible): `activity_log` last 50, filter Select (all / catalogue_update / price_change / order_modified / payment_reminder); shows 10 with icon+description+relative time; realtime INSERT.
- **ExportDataDialog**: RadioGroup Orders/Payment Confirmations/Activity Log → fetches all rows for stockist → naive CSV (headers = Object.keys(row[0]), values JSON.stringify for objects) → downloads `{type}_{yyyy-MM-dd}.csv`.

### 2.2 Pharmacies (`/stockist/pharmacies`) — `Pharmacies.tsx`
- Uses `useStockistId` + `useCachedPharmacies(stockistId)` (cache w/ invalidate). Realtime: `pharmacies-payments-updates` (payment_confirmations UPDATE→approved), `pharmacies-orders-updates` (orders *), `pharmacies-details-updates` (pharmacy_details UPDATE). Search filter over name/owner/phone/area.
- **fetchPendingOrders**: orders for stockist where `payment_status in (unpaid,partial) OR delivery_status≠delivered OR status=cancelled`, ordered created_at ASC (FIFO), grouped by pharmacy_id.
- **Per-pharmacy financials** (`calculateFinancials`, computed for ALL pharmacies):
  - `totalOutstanding = Σ max(0, total_amount - paid_amount)` over unpaid/partial orders.
  - `latestBillDue` = first (newest listed) unpaid order's due + its `payment_due_date||created_at`.
  - `pastDues = Σ max(0, due)` over unpaid orders whose `payment_due_date < now`.
  - `ordersPending` = count of all grouped orders.
- **Pharmacy card**: name (click→detail), owner, Active/Inactive badge + Lock icon when inactive (opacity-60). Contact: phone (tel link + copy-to-clipboard), address. Financial block: Credit Balance (green, if>0), Total Outstanding (destructive), **Net Due** = `max(0, outstanding_balance - credit_balance)` (only if credit>0), Latest Bill Due (amber), Past Dues (red, if>0), Orders Pending count.
- **Row menu** (MoreVertical): View Details, Edit (EditPharmacyDialog), Mark Active/Inactive (toggle is_active), Delete Permanently (`handleDelete`: hard delete, on FK failure falls back to soft delete `is_active=false`).
- **Payment actions per card**:
  - **Custom amount input + Submit** (`handleCustomPayment`): credit-first FIFO. Fetches pharmacy.credit_balance; if credit>0 uses `creditUsed=min(payment,credit)`, `totalFundsToDistribute=creditUsed+payment`, deducts creditUsed. Then FIFO over unpaid orders sorted oldest-first (excludes cancelled): applies `min(remaining, orderDue)`, marks 'paid' when `|total-newPaid|<0.01` (rounding tolerance) else 'partial'; leftover >0.01 → back to credit_balance. Inserts an **approved** `payment_confirmations{payment_type:'custom', payment_method:'custom_amount', processed_by}`. Recalculates `outstanding_balance`. Disabled if inactive/empty/≤0.
  - **Create Order** → navigates `/stockist/order-creation` with `state.preSelectedPharmacyId`.
  - **Quick Bill** → QuickBillDialog (preselected).
  - **WhatsApp Reminder** → `wa.me/{phone}?text=` "Payment reminder for outstanding amount: ₹{totalDue}…".
  - **Mark Fully Paid** (`handleMarkFullyPaid`): sets `paid_amount=total_amount, payment_status=paid` for all unpaid orders; recalcs balance; logs `activity_log{activity_type:'payment_received'}`. Disabled if outstanding≤0.
- **Expandable orders** ("View All Orders (N)"): each order shows order_number (link→OrderItemsDialog), amount, computed due `max(0,total-paid)`, status badge with 0.01 tolerance (paid/partial/CANCELLED), inline **delivery_status Select** (Pending/Dispatched/Delivered — optimistic update, revert on error).
- **Dialogs**: AddPharmacyDialog, EditPharmacyDialog, QuickBillDialog, OrderItemsDialog.
- **AddPharmacyDialog fields**: Pharmacy Name*, Full Name (Google Maps), Owner Name, Phone(tel), Pin Code (6), GST Number*, License Number* ("used as password for catalogue access"), Credit Limit (₹, default 0), Area, Full Address (textarea), Location Coordinates (lat,lng). On submit: inserts `pharmacy_details{profile_id: stockist.id, ...}` (profile_id set to stockist's id for RLS) + **creates placeholder order** `INIT-{ts}` (total 0, delivered, paid) to establish relationship so pharmacy appears immediately.

### 2.3 Pharmacy Detail (`/stockist/pharmacies/:pharmacyId`) — `PharmacyDetail.tsx`
- Recomputes on load from orders: total_orders count, total_revenue `Σ total_amount`, outstanding `Σ (total-paid)` over unpaid/partial.
- Header: Create Order, Send Reminder (WhatsApp w/ a hardcoded placeholder `upi://pay?pa=yourUPI@bank...` link — bug/stub).
- **Quick stats** (4 cards): Total Outstanding (red), Total Revenue, Total Orders, Credit Limit.
- **Tabs**: Orders (`PharmacyOrdersList`), Bills (`PharmacyBillsList` — only orders with bill_number+bill_image_url, View Bill), Reminders (`PharmacyRemindersList` — `payment_reminders`, Nudge re-sends WhatsApp + logs a new reminder), Details (`PharmacyDetailsTab` — basic/contact/financial incl. Available Credit = credit_limit − outstanding).

### 2.4 Products (`/stockist/products`) — `Products.tsx`
- 20 hardcoded `MEDICAL_CATEGORIES` (Analgesics… Others). Realtime `products-realtime` on products.
- Header: Add Product; quick actions **Scan** (ProductScanDialog), **Bulk** (BulkUploadDialog), **Enhance All** (`handleEnhanceAllProducts`: finds products missing generic/brand/manufacturer/category/type; confirm; loops `fetch-product-info` per product, updates fields; toast "Enhanced N products").
- Search (name/brand/category). Filters (4 Selects): Brand (distinct), Category (MEDICAL_CATEGORIES), **Expiry** (30/60/90/120 days — filters where earliest `product_batches.expiry_date` diff in [0,days]), **Sort** (default/name/price-low/price-high/stock-low).
- `fetchTopProducts`: 30-day order_items aggregation by product_name (top 5 names matched to product objects). `fetchExpiryMap`: earliest batch expiry per product.
- **Sections**: Top Products This Month (horizontal cards); Items to Watch Out For (products where `stock ≤ threshold && stock>0`, top 4).
- **Product card** (grid): image (fallback placeholder.svg), name, brand, sale_price bold + MRP strikethrough (if mrp>sale), "Stock: N | Sale: ₹", expiry badge (`getExpiryBadge`: Expired if diff<0, {diff}d destructive if≤30, {diff}d secondary if≤90, {months}mo outline), row menu (Edit/Delete w/ confirm), **Add Stock** (QuickUpdateStockDialog).
- **AddProductDialog fields**: Product Name* + **Auto Fetch** button (`fetch-product-info` fills generic/brand/manufacturer/type/category/pack_size/strength); Generic Name/Salt (hint "+ for multiple salts"); Brand; Manufacturer; Form/Type (Select: tablet/capsule/syrup/injection/drops/cream/powder/suspension/inhaler/lotion/gel/patch/spray/solution); Category (Select ~24 values); Pack Size; Strength (hint "+" for combos); MRP; Purchase Price; Sale Price; Stock Quantity (default 0); Min Stock Alert (default 10); MOQ (default 1); GST % (default 5); Product Image (upload to `product-images`); Description; batch_code (in state but not in insert). Insert to `products`; logs `activity_log{activity_type:'catalogue_update'}`.
- **EditProductDialog**: same fields pre-filled + **HSN Code** and **Batch Code** inputs + **Fetch with AI**. NOTE: update payload does **NOT persist `hsn_code` or `batch_code`** (they're in the form but omitted from the `.update(...)` object) — known gap. Type dropdown only has 6 options (fewer than Add).
- **QuickUpdateStockDialog**: mode toggle **Add Stock** vs **Set Stock**; quantity input; live "New stock will be: N" preview (add mode); updates `stock_quantity`.
- **ProductScanDialog (OCR)**: upload image→`uploadToStorage(product-images)`→`extract-product-label`; staged progress (10/30/70/85/100%). Prefills mrp/batch_number/expiry_date. Matches existing product (exact `.eq(name)` then `.ilike`). Shows "Product exists" (blue, current stock/MRP) or "New" (green). **"Correct — Enable Editing"** unlocks MRP*/Stock*/Purchase*/Sale*/Batch/Expiry (all disabled until confirmed). Existing → `stock += entered`, updates prices/brand/manufacturer/strength; new → insert. Logs activity.
- **BulkUploadDialog** (3 tabs): **Purchase Bill / Sale Bill / Full Catalogue**. Accepts images/PDF/CSV/XLSX (catalogue = CSV/XLSX only), 10MB max. Spreadsheets parsed locally (`parseSpreadsheet` w/ header alias map + `isValidProductName` filter that rejects phone/email/gstin/total/page/etc); images→`extract-bill-items` (AI). **Preview** table: matches against existing products (normalized name) → status found/new/error; margin input (default 20%). Purchase: existing → `stock += qty`, set purchase_price + `sale_price=price*(1+margin/100)`; new → insert w/ `mrp=price*1.3`. Sale: existing → `stock -= qty`; new → error "not found". Catalogue tab: upsert on conflict `stockist_id,name` (dupes counted skipped). Templates downloadable. AbortController cancel. Logs activity per operation.

### 2.5 Orders (`/stockist/orders`) — `Orders.tsx`
- Realtime `orders-realtime-updates` (UPDATE). Filters: Pharmacy (Select of active pharmacies), Payment Status (paid/unpaid/partial), Order Source (manual/platform/whatsapp), Clear button. **Status tabs** (buttons with counts): All / Pending (`status=confirmed && delivery_status=pending`) / Out for Delivery (`delivery_status=out_for_delivery`) / Delivered / Cancelled.
- Desktop **table** columns: Order # | Pharmacy | Status | Payment | Delivery | Amount (right) | Date (MMM dd, yyyy) | Actions (OrderActionsDropdown). Mobile: OrderCard grid. New Order → PharmacySelectDialog → `/stockist/order-creation?pharmacy=:id`.
- Badges: status(draft=secondary/confirmed=default/cancelled=destructive), payment(paid=default/unpaid=destructive/partial=secondary), delivery=outline.
- **OrderActionsDropdown** actions: **Mark as Paid** (paid_amount=total, status=paid; inserts approved payment_confirmation `manual_mark_paid`), **Partial Payment** (dialog; validates `amount ≤ due`; new status paid if `|total-newPaid|<0.01` else partial; inserts confirmation `manual_partial`), **Mark as Delivered** (delivery_status=delivered, status=confirmed), **Cancel Order** (confirm; if paid>0 message says "₹X added as credit"; sets status=cancelled).

### 2.6 Order Detail (`/stockist/orders/:orderId`) — `OrderDetail.tsx`
- Three status cards (Order/Payment/Delivery). **Order Information**: order_number, order date (PPp), delivery_date (if set), **Order Source** badge ("Platform Order" if platform else "Manual Order"), notes. **Payment Information**: Subtotal = `total_amount - tax_amount`, Tax, Total (bold), Net Amount, **Send Reminder** button → PaymentLinkDialog (requires phone). **Pharmacy Details** (name/owner/phone/address). **Order Items (N)** with **Edit Items** → OrderItemsDialog; each item: name, description, "Qty × ₹unit (GST %)", tax line, ₹total (uses Math.round).

### 2.7 Order Creation (`/stockist/order-creation`) — `OrderCreation.tsx`
- pharmacyId from `?pharmacy=` or `location.state.preSelectedPharmacyId`. Loads stockist + pharmacy + active products (`gst_percentage, batch_code`).
- **Quick Add — Paste Order**: textarea → **Parse & Add Items** (`parse-order-message`); adds matched items where `productId && matchConfidence≠'none'`, warns unmatched count.
- **Manual add**: product Select + quantity; allows over-stock (toast warning "Only N in stock. Item added but marked as insufficient."). Per-item GST = `product.gst_percentage||5`; `tax=subtotal*rate/100`.
- **Order Summary**: Subtotal `Σ qty*unit`, **SGST = tax/2**, **CGST = tax/2**, Total `subtotal+tax`.
- **Order Items table**: Product (insufficient→destructive bg + "Only N left" badge + inline **Update Stock** button→QuickUpdateStockDialog), Quantity, Unit Price, Tax (%+₹), Total, remove. Clear All.
- **Create Order** (`handleCreateOrder`): order `ORD-{Date.now()}`, `status=confirmed, payment_status=unpaid, delivery_status=pending, order_source=manual`, total/net=totalAmount, tax_amount; inserts items (incl gst_percentage, tax_amount, batch_code); decrements product stock per item; opens PaymentLinkDialog (on close → /stockist/orders); recalculates pharmacy `outstanding_balance`.

### 2.8 Payments (`/stockist/payments`) — `Payments.tsx`
- Realtime `orders-payments-updates`. Summary cards: **Total Outstanding** = Σ over dedup-by-pharmacy of `pharmacy.outstanding_balance` (uses `findIndex` dedup); **Pending Invoices** = `Σ total_amount` of unpaid/partial + count; **Received This Month** = `Σ total_amount` of paid orders whose `updated_at` month/year = now + count.
- Tabs: **Pending Invoices** (table: Pharmacy | Order # | Status | Invoice Amount | Outstanding | Order Date | Actions), each row **Send Reminder** (dialog: amount prefilled=outstanding||total, "Use Full Outstanding" button, message textarea; inserts `payment_reminders{status:sent}` + `communication_log{type:whatsapp}`, opens WhatsApp) and **Mark Paid** (`handleMarkPaid`: paid_amount=total, status=paid; inserts approved confirmation `manual_payments_page`; recalcs balance). **Received** tab (last 50 paid: Pharmacy|Order#|Amount|Payment Date).

### 2.9 Payment Approvals (`/stockist/payment-approvals`) — `PaymentApprovals.tsx`
- Realtime `payment-approvals-realtime`. Header: animated destructive "{n} Pending" badge (pending count) + Refresh. Lists all confirmations (pharmacy, ₹amount, payment_type + created datetime, pharmacy_notes, status badge approved/rejected/on_hold/pending). Review button for pending/on_hold → dialog with optional **Your Notes** textarea and **Reject / Put on Hold / Approve** → `approve-reject-payment` edge fn.

### 2.10 Analytics (`/stockist/analytics`) — `Analytics.tsx`
- KPI cards: Total Revenue (`Σ total_amount`), Total Orders, Active Pharmacies (**count of ALL pharmacy_details** via head count — not scoped to stockist, likely a bug), Products (stockist's count). Tabs (Recharts): **Revenue Trends** (LineChart revenueByMonth, last 6 months by `MMM yy`), **Order Analysis** (PieChart ordersByStatus), **Top Pharmacies** (BarChart top 5 by revenue). topProducts collected as `[]` (unused).

### 2.11 Route Execution (`/stockist/route-execution`) — `RouteExecution.tsx`
- Requires `location.state {selectedPharmacyIds, startingAddress, stockistId}` (from MapRouteDialog). Fetches pharmacies + their non-delivered orders. **Auto-optimizes on load** via `optimize-route`. Route Summary: total distance + per-leg "d1 + d2 + return" + **Re-optimize with AI**. **Drag-and-drop reorder** (@dnd-kit) — reorders list, toasts "Re-optimizing…" (does not actually recompute distances). Per-stop **SortablePharmacyCard**.
- **SortablePharmacyCard**: drag handle, stop number, name/address, badges Due/Credit/Net/Fully Paid, distance. Expanded: Orders to Deliver list; **Notify Dispatch via WhatsApp** (whatsapp_number||phone; message with all order numbers); **Send Payment Link** per unpaid order (requires stockist UPI configured → PaymentLinkDialog); **Enter Collection Amount** + payment mode Select (cash/online/cheque/other) → **Record Payment** (FIFO over orders, inserts approved `payment_confirmations{payment_type:'route_collection'}`); **Mark Delivered** (sets all pharmacy orders delivery_status=delivered). `totalDue=Σ(total-paid)`, `netDue=max(0,totalDue-credit)`, `isFullyPaid=|totalDue|<0.01`.
- MapRouteDialog (from Quick Actions): starting address input; lists pharmacies with non-delivered orders (grouped, expandable per-order w/ payment+delivery badges, click order# → OrderItemsDialog); Select All / checkbox select; **Open in Google Maps** (builds `maps/dir` URL origin+destination+waypoints from coords/google_maps_name/address); **Start Route with AI** → navigates to RouteExecution.

### 2.12 Pharmacy Approvals (`/stockist/pharmacy-approvals`) — `StockistApprovals.tsx`
- Realtime on `pharmacy_registration_requests`. Shows only requests whose `pin_code ∈ stockist_service_areas` (active). If no service areas → empty. Table: Pharmacy | Owner | License # | PIN | Status | Submitted | Review.
- Status badge logic: approved→"Approved & Added"; rejected; both approved→"Both Approved"; admin_approved→"Admin Approved"; stockist_approved→"You Approved"; else "Pending Review".
- Review dialog: all fields + document buttons (drug_license/gst_certificate/other) + approval indicators (Admin Approved / Your Approval). **Approve** (`handleApprove`): sets stockist_approved+by+at+stockist_id; if `admin_approved` already true → status='approved' + **inserts `pharmacy_details`** (profile_id=stockist.id, is_active). Dual-approval model.

### 2.13 Batch Ordering (`/stockist/batch-ordering`) — `BatchOrdering.tsx`
- Fetches current `order_batch_cycles` where status='collecting'. If none → **Start New Cycle** → `create-batch-cycle`. Summary cards: Cycle Period, Total Orders, Total Value, Delivery Date. List of batched orders (pharmacy, order_number, ₹total, status).

### 2.14 Delivery Settings (`/stockist/delivery-settings`) — `DeliverySettings.tsx`
- Tabs: **Delivery Dates** (multi-select Calendar → toggles/inserts `stockist_delivery_dates{is_active}`; upcoming list w/ Active/Disabled badges), **Service Areas** (add 6-digit PIN + optional area name → `stockist_service_areas`; dup PIN error 23505; Switch toggle active; delete; "only pharmacies in these areas can order"), **Delivery Fees** (rule type Select: **Flat Fee / Free Above Order Amount / Per KM Charge**; value; inserts `stockist_delivery_rules` w/ priority=count+1; table priority/type/description/status/delete).

### 2.15 Stockist Profile (`/stockist/profile`) — `StockistProfile.tsx`
- Edit toggle. Tabs: **Personal** (Stockist Name/Company/License/Phone/Email(readonly)/Address), **Bank** (UPI ID, Bank Name, Account Number, IFSC, Account Holder Name), **Business** (GSTIN, Default Credit Days default 30), **Catalogue** (status badge active/inactive; shareable `${origin}/catalogue/{catalogue_slug}` w/ copy), **Areas** (add PIN, toggle active, delete `stockist_service_areas`).

### 2.16 Stockist Quick dialogs (details)
- **QuickOrderDialog**: pharmacy Select (fetched by `profile_id=stockistId`), order textarea (Zod: pharmacy required, text≥10). **Analyze Order with AI** → `parse-order-message`; results table with matchConfidence badges (Exact/High/Medium/Select), inline product Select for low/none, editable qty, remove, add manual item, order summary (taxRate toggle 5/12, default 12). **Create Order**: blocks if any unmatched or none/low; order `ORD-{ts}`, `order_source='whatsapp'`, status=confirmed; net=total+tax; inserts items+tax; decrements stock; logs activity; recalcs balance.
- **QuickBillDialog**: pharmacy Select (all active), product Select+qty (validates stock), items table, total. **Create Bill**: `ORD-{ts}`, confirmed/unpaid/pending, `order_source='manual'`; inserts items; decrements stock; logs `order_created`; recalcs balance. (taxRate state exists but total is untaxed.)
- **BillUploadDialog**: upload image/PDF→`uploadToStorage(bills)`→`extract-bill-items` (preview). Pharmacy matching: exact/partial/not_found (create-new checkbox or select existing). **Confirm & Create Order** → `process-bill-image` (passes preview items to skip re-AI); shows created count / auto-created products / failed.

---

## 3. PHARMACY MODULE

### 3.1 Authenticated Portal (`/pharmacy/*`, CartContext)
- **Dashboard** (`/pharmacy/portal`): resolves pharmacy by `auth_profile_id`. Realtime on `pharmacy_inventory` + `orders`. KPIs: **Inventory Value** = `Σ quantity*(unit_price||0)`; **Low Stock Items** = count where `quantity ≤ low_stock_threshold`; **Expiring Soon** = count where `expiry_date ≤ now+30d`; **Orders This Month** = count since 1st of month. Quick Actions grid: Manage Inventory, Browse Stockists, My Orders, View Analytics.
- **Inventory** (`/pharmacy/inventory`): `pharmacy_inventory` table (Product | Batch | Quantity | MRP | Expiry Date | Status | Actions). Stock badge Out/Low/In (`getStockStatus`), expiry badge Expired/"Expires in Nd" (≤30). **Add Product** + **Edit** buttons are present but **unwired** (no handlers).
- **Ordering** (`/pharmacy/ordering`): per-stockist tabs (catalogue_enabled stockists) listing products (MRP, Your Price=sale_price, Stock). `comparePrice()` is a **`Math.random()` placeholder** ("Lowest price! Save ₹X"); **Add to Cart** button is unwired.
- **Browse Stockists** (`/pharmacy/stockists`): search name/company/address. Cards: product count (head count), next delivery date (earliest active future `stockist_delivery_dates`), phone, address. **Stockists serving the pharmacy's PIN sorted first** (via `stockist_service_areas`). View Catalogue → StockistCatalogue.
- **Stockist Catalogue** (`/pharmacy/stockists/:stockistId`): CATEGORIES = All/Tablets/Capsules/Syrups/Injections/Ointments/Drops/Other. Products where `is_active && stock_quantity>0`. Search (name/brand/category) + category filter. Card: name, brand, sale_price + MRP strikethrough, **discount% = round((mrp-sale)/mrp*100)**, stock, pack size, quantity stepper clamped **MOQ..stock**, Add/Update Cart (ring-2 highlight when in cart). Quantities initialized from cart + MOQ. Cart badge count in header.
- **Cart** (`/pharmacy/cart`): empty state (Browse Stockists). Items **grouped by stockist**, per-stockist subtotal + "Remove All", per-item qty stepper (1..maxStock) + remove, Clear Cart. Order Summary: per-stockist subtotals, Subtotal, "Delivery Fees: Calculated at checkout", **Total shown as `₹X+`** (fees pending). Proceed to Checkout / Continue Shopping.
- **Checkout** (`/pharmacy/checkout`): **separate order per stockist group**. Per group: Subtotal, **GST 5%** (`subtotal*0.05`), **Delivery Fee** via `calculate-delivery-fee` (fallback `subtotal≥5000?0:50`), Total = subtotal+gst+fee; free-delivery green alert if fee=0; per-order notes textarea. **Place Order** per group: order `ORD-{ts}`, `order_source='pharmacy_portal'`, confirmed/unpaid/pending, delivery_address=pharmacy.address; inserts items; RPC **`deduct_stock`** per item (warns on insufficient); clears that stockist's cart. **Place All N Orders** loops groups. Grand Total = Σ group totals. Success screen when all completed. Payment is COD/credit terms (alert). Delivery address card = pharmacy name/address/phone.
- **Orders** (`/pharmacy/orders`): search (order#/stockist) + status filter (all/confirmed/processing/shipped/delivered/cancelled). Collapsible cards: order_number + status badge + payment badge; stockist, date; ₹net_amount + "Due: ₹{net-paid}" (if>0). Expanded: items list, summary (Subtotal, GST, Total, Paid if>0). STATUS_COLORS/PAYMENT_COLORS maps.
- **Financials** (`/pharmacy/financials`): Outstanding (from pharmacy_details), Credit Balance (+₹), Total Purchases (`Σ total_amount`), Avg Order Value (`total/count`).
- **Analytics** (`/pharmacy/analytics`): inventory stat tiles only (no charts) — Total Products, Low Stock Items, Expiring Soon (≤30d), Inventory Value (`Σ qty*unit_price`).
- **Profile** (`/pharmacy/profile`): tabs Store Info (name/owner/phone/email readonly), License (drug license, GST), Location (address/PIN(6)/area). Keys by `auth_profile_id`.

### 3.2 Public Catalogue (`/catalogue/:stockist_slug/*`, PharmacyContext, no login)
- **License Verification** (`/catalogue/:slug`): first-visit OnboardingCarousel (Quick Verification / Browse Products / Easy Ordering) gated by `onboarding_completed_catalogue`. Form: Pharmacy Drug License Number* (mono, case/symbol-insensitive), Pharmacy PIN Code (optional, 6). Submit → `verify-pharmacy-license`. On `verified` → sets PharmacyContext pharmacy+stockist(+upi_id)+orders → `/catalogue/{slug}/dashboard`. Shows rate-limit message + "Attempts remaining: N" on failure. "First time user? Contact stockist" alert.
- **Catalogue Dashboard** (`/dashboard`): fetches latest balance, outstanding orders via `get-pharmacy-outstanding-orders`, last 5 `payment_confirmations`. Realtime on orders / pharmacy_details / payment_confirmations. Welcome card (name, license). Credit Balance panel (if>0), Outstanding Balance (destructive), Net Amount Due = `max(0, outstanding-credit)`. **Mark Payment** button (if outstanding>0) → MarkPaymentDialog. **UPI QR** (UpiQrCode for full outstanding) if stockist.upi_id. Quick actions Browse Products / My Orders. **Payment Requests** history (₹amount, datetime, status badge ✓Approved/✗Rejected/⏸On Hold/⏳Pending). **Outstanding Orders** breakdown (per order: number, date, Paid badge if partial, item lines, ₹outstanding). Recent Orders (last 5). Logout → clearSession.
- **Catalogue** (`/products`): products `is_active`. Search (name/brand/generic) + category + sort (name/price_asc/price_desc). Product card: image, name, brand, "Salts: {generic}", MRP strikethrough + sale_price, strength/pack badges, quantity stepper (min 1), Add to Cart. Cart carries `gst_percentage||5`. Cart button count in header.
- **Orders** (`/orders`): platform orders list (order_number, datetime, payment/delivery/status badges, Total/Paid/Pending, notes). Realtime.
- **Checkout** (`/checkout`): **per-item GST** — `calculateTotals`: per item `subtotal=qty*unit`, `tax=subtotal*gst%/100`, total; grandTotal=subtotal+Σtax; **no delivery fee**. Cart item rows w/ qty steppers/remove. **Place Order** → OrderConfirmationDialog (review + "requires stockist approval" warning) → `create-platform-order`. Success screen: bill summary (Subtotal, Total Tax, This Order Total, Outstanding Balance) + **integrated UPI payment**: RadioGroup (Pay This Order / Pay Total Outstanding / Custom Amount) → dynamic UpiQrCode + copyable `upi://pay?pa=...&am=...&tn=Order-...` deep link + "Payment requires stockist confirmation before updating your balance." Back to Dashboard / Continue Shopping.
- **MarkPaymentDialog**: RadioGroup Full Outstanding / Custom Amount / Specific Order (Select of unpaid orders). Notes. → `mark-payment-paid` (creates **pending** confirmation). "Pending Approval" notice.

### 3.3 Public Pharmacy Registration (`/pharmacy-registration`)
- Public form (no auth). Sections: **Basic** (Pharmacy Name*, Owner Name*, Drug License Number*, GST Number*), **Contact** (Phone*, WhatsApp Number, Email), **Location** (Address* textarea, PIN Code*, Area, Google Maps Name, Coordinates lat,lng), **Document Uploads** (Drug License required-labeled, GST Certificate, Other; image/PDF → uploaded to `bills` bucket via getPublicUrl). Insert `pharmacy_registration_requests{...urls, status:'pending'}`. Resets form on success.

---

## 4. PATIENT MODULE (resolves `patient_details` by profile_id)

- **Dashboard** (`/patient/dashboard`): KPIs — Active Orders (`patient_orders` where status∉{delivered,cancelled}), Prescriptions (active count), Wishlist count, Pending Refills (`patient_refill_reminders` active & `next_refill_date ≤ today`). Recent orders (5) w/ status color map (placed/confirmed/packed/dispatched/delivered/cancelled). Quick actions: Search Medicines, Compare Prices; cards Prescription Vault / AI Assistant / Wishlist.
- **Medicine Search** (`/patient/search`): OR filter `products` on name/brand/**generic** (limit 20); card shows price (`ptr||mrp`), MRP strikethrough, In/Out of Stock badge, stockist name, heart icon (unwired).
- **Price Comparison** (`/patient/compare`): searches `products.product_name` ilike, `is_active && stock>0`, sorted by `selling_price` asc limit 20. First card = green **BEST PRICE** banner. Shows selling_price, MRP strikethrough, **% off = round((mrp-selling)/mrp*100)**, stockist name, **Star 4.5 hardcoded**, **~45 min ETA hardcoded**, Add to Cart = `toast.success("Added to cart!")` **stub**. (Queries columns `product_name`/`selling_price`/`manufacturer` which differ from the `products` schema used elsewhere — likely returns nothing.)
- **Checkout** (`/patient/checkout`): address RadioGroup (auto-selects default), Delivery Slot RadioGroup (Today within 2h / Tomorrow Morning), Payment Method (COD/UPI/Card), notes. **Place Order** = `toast.info("Cart integration required. This is a demo…")` then navigates to /patient/orders — **no order written (explicit demo stub)**.
- **Prescription Vault** (`/patient/prescriptions`): upload image → `prescriptions` bucket (getPublicUrl) → insert `patient_prescriptions{prescription_image_url, prescription_date:today}`. **No OCR on upload** (comment "without AI extraction for now"). Cards show image, date, medicines[] (if present), **"Order from Prescription" button unwired**.
- **Wishlist** (`/patient/wishlist`): `patient_wishlist` list; remove (optimistic delete); **Add to Cart unwired**.
- **Orders** (`/patient/orders`): `patient_orders` history; status badge color map; items (first 3 + "+N more").
- **AI Assistant** (`/patient/ai-assistant`): persistent medical disclaimer Alert. Symptoms textarea → `ai-symptom-checker` (body `{symptoms}` only — age/history not sent). Renders Possible Conditions, Recommendations, OTC Medicines (arrays), disclaimer; "Search for Medicines" button. (NOTE: renders `analysis.possibleConditions/recommendations/otcMedicines/disclaimer`, but the edge fn returns `possible_conditions/suggested_otc_medicines/when_to_see_doctor` — **field name mismatch** so most sections may be empty.)
- **Profile** (`/patient/profile`): tabs Personal (name/phone/email readonly/DOB/gender Select), Health (Blood Group Select, Allergies readonly join, Emergency Contact name+phone), Addresses (`patient_addresses`; set default (unsets others), delete). Save updates `patient_details`.
- **PatientSignup.tsx** (orphaned, no route): self-serve — creates auth user + profiles + user_roles(patient) + patient_details; blood group is **free-text input** here vs Select elsewhere.

---

## 5. BRAND MODULE (dashboard gated on `is_verified`)

- **Dashboard** (`/brand/dashboard`): if `brand_details && !is_verified` → pending-verification Alert (blocks rest). Verified → green "Verified" badge. KPIs: Total Orders (`brand_orders` count), Revenue (`Σ total_amount`), active Products (`brand_products` count), active/scheduled Campaigns count. Quick actions Manage Products / Campaigns / Fulfilment.
- **Products** (`/brand/products`): `brand_products` cards (name, generic, selling_price, MRP, stock, batch, SKU, active badge). **Add Product** dialog fields: Product Name*, Generic Name, SKU*, Batch Number*, MRP*, Selling Price*, Stock Qty → insert `brand_products`. **Edit / Delete buttons present but unwired**.
- **Campaigns** (`/brand/campaigns`): `brand_campaigns` cards (name, status badge, description, start date, ₹budget, discount%). **Create Campaign** fields: Campaign Name*, Description, Discount %, Budget, Start Date*, End Date*; `campaign_type` hardcoded "discount"; inserted status="draft". **View Analytics button unwired**.
- **Analytics** (`/brand/analytics`): Total Revenue, Total Orders, Active Products, **Growth Rate hardcoded 24.5%**.
- **Fulfilment** (`/brand/fulfilment`): Active Orders (brand_orders not delivered), Pharmacy Partners (unique pharmacy_id), **Avg Delivery Time hardcoded 45 min**, **Success Rate hardcoded 98.5%**.
- **Profile** (`/brand/profile`) — not read in full but per pattern: Company / License (GSTIN, mfg license) / Stats + verification badge.
- **BrandSignup.tsx** orphaned (no route).
- Batch verification (`brand_batch_verification` table) supports anti-counterfeit/recall workflows (data model only).

---

## 6. MEDICAL REPRESENTATIVE (MR) MODULE

- **Pharmacies** (`/mr/pharmacies` = `/mr/dashboard` default): lists only **visited** pharmacies (derived from `mr_pharmacy_visits`); search name/phone. **Record Visit** inserts `mr_pharmacy_visits{visit_date:today}`. **Add Pharmacy button unwired**.
- **Collections** (`/mr/collections`): Total Collected = `Σ mr_order_commissions.commission_amount`, **Target hardcoded ₹50,000**, collection count. Record Collection form (pharmacy name, amount, date) → `toast.success("Collection recorded! (Demo)")` **not persisted**.
- **Analytics** (`/mr/analytics`): Total Visits, Orders Placed (=commissions count), Total Commission, **Conversion Rate = commissions/visits*100**.
- **Profile** (`/mr/profile`): Personal / Company / Stats (per pattern).

---

## 7. ADMIN MODULE (all behind AdminRoute)

- **Dashboard** (`/admin`): 11-module navigation grid (Users, Batch Recalls, Notices, Disputes, Analytics, Audit Logs, Fee Management, Document Verification, Message Templates, Territories, Campaigns). `useAdminNotifications` → destructive "{n} new alerts" badge. Quick Stats: Total Users (`profiles` count), Active Stockists, Pharmacies, **Pending Tasks = open disputes count**.
- **User Management** (`/admin/users`): enriches `profiles` with role (maybeSingle) + stockist name/company. Search email/name/company + role filter (all/admin/stockist/pharmacy/patient/brand/mr). Table: Email|Name|Company|Role|Status|Joined|Actions. **`is_active` always hardcoded true**; Activate/Deactivate button only logs to `audit_logs` via `useAuditLog` — **status not persisted**.
- **Pharmacy Approvals** (`/admin/pharmacy-approvals`): realtime; table all requests. **Dual approval**: "Approve as Admin" sets admin_approved; if `stockist_approved` already true → status='approved' + inserts `pharmacy_details` (profile_id = current admin's stockist_details id — note: uses admin's own stockist record). **Reject requires reason** (rejection_reason). Status badge logic identical to stockist side.
- **Document Verification** (`/admin/documents`): `pharmacy_documents` joined to pharmacy name/gst. Queue table (Pharmacy|Document Type|Uploaded|Status|Review). Review dialog: single-step **Verify** / **Reject** (reason required on reject) sets verification_status+verified_at+verified_by; "View Document" link.
- **Batch Recalls** (`/admin/recalls`): Create Recall dialog (Batch Number*, Product Name*, Manufacturer, Severity Select critical/high/medium/low, Recall Reason*, Instructions) → `RCL-{ts}`, status='active', recall_date=today. **Search Users by Batch Code** → RPC `search_users_by_batch_code` → results (Type badge, Name, Contact, Product Count). Recalls table + **Mark Resolved** (active only).
- **Disputes** (`/admin/disputes`): `disputes` joined to reporter `profiles.email`. Table: Dispute #|Raised By|Type|Subject|Priority|Status|Date|View. Status colors open/in_progress/resolved/closed/escalated. View dialog: subject/description; status Select (in_progress/resolved/escalated/closed); Resolution textarea + **Mark as Resolved** (sets resolution + resolved_at).
- **Notices** (`/admin/notices`): Create dialog: Title*, Content*, Type (announcement/alert/update/warning/recall), Priority (low/medium/high/urgent), **granular targeting** — Role (All/Stockists/Pharmacies), Batch Codes / PIN Codes / States / Districts (comma-separated → arrays), Expiration (datetime-local). Insert `admin_notices` → RPC `distribute_notice_to_users` (reports "sent to N users"). Table w/ target badges + **Switch toggle active**. (View button stub.)
- **Message Templates** (`/admin/templates`): CRUD `message_templates`. Fields: Template Name*, Type (email/sms/whatsapp), Subject (email only), Message Body* (with `{variable}` placeholders), Variables (comma-separated → array). Table (name/type/variable badges/status/edit+delete).
- **Territory Management** (`/admin/territories`): CRUD `territories` (Territory Name*, State*, District, PIN Codes comma→array). Table w/ first-3 PIN badges + "+N". Second card: **read-only Stockist Service Areas** view (toggle show; joins `stockist_service_areas` + stockist name/company/phone; columns Stockist/Company/PIN/Area/District/State/Phone).
- **Campaign Management** (`/admin/campaigns`): CRUD `campaigns`. Fields: Campaign Name*, Type (promotional/informational/reminder), Target Audience (all/stockists/pharmacies/active), Message Content*, Schedule (datetime-local). status = scheduled if scheduled_at else draft. **Send Now** (drafts) sets status=sent+sent_at. Status badges draft/scheduled/sent/failed.
- **Fee Management** (`/admin/fees`): CRUD `platform_fees`. Fields: Fee Name*, Type (percentage/fixed), Value, Applies To (stockist/pharmacy/both), is_active. Table shows value as `{v}%` or `₹{v}`.
- **Analytics** (`/admin/analytics`): 8 StatCards (Total Users, Stockists, Pharmacies, Orders, Revenue, Pending Orders, Active Disputes, Active Recalls) — **trend %s hardcoded** ("+12% from last month" etc). Revenue/Order/User charts are **placeholder divs** ("chart would go here").
- **Enhanced Analytics** (`/admin/enhanced-analytics`, NOT linked): 4 KPIs (Users, Orders, Revenue, **Growth Rate hardcoded 32.5%**).
- **Audit Logs** (`/admin/audit-logs`): last 100 `audit_logs` joined to email; client-side search (action/entity/email); columns Timestamp|User|Action|Entity Type|Entity ID (first 8 chars)|IP Address.

---

## 8. SHARED PAGES

- **Settings** (`/settings`): role-aware layout wrapper. Tabs: **About** (app_info from `platform_settings` — name/version/tagline/developer/email/copyright; role-specific announcement banner if show_banner), **Notifications** (Push/Email/WhatsApp switches — **display only, defaults, not persisted**), **Manage** (admin only) — edit app_info + separate announcement editors for stockist/pharmacy/patient/brand/mr (Title/Message/show_banner Switch → updates `platform_settings.{role}_announcement`).
- **Support** (`/support`): role-aware layout. Lists user's `support_tickets` split Open/Resolved. **New Ticket** dialog: Subject*, Category (general/billing/bug/feature), Priority (low/medium/high), Description* → insert. **Mark Resolved** per open ticket. Badges for status/priority.
- **NotFound** (`*`), **NotAuthorized** (`/not-authorized`), **Offline** (`/offline`).
- **NotificationBell** (patient/brand top nav): shows latest 10 unread from `notification_queue` (per FEATURES; not re-read here).

---

## 9. AI & EDGE FUNCTIONS (`supabase/functions/*`)

All AI via Lovable Gateway `ai.gateway.lovable.dev/v1/chat/completions` (except symptom-checker & extract-prescription use `api.lovable.app/v1/ai/chat`). Gemini-primary + GPT fallback. CORS `*`.

### AI-powered
- **parse-order-message** — auth required; **ownership-verified** (stockist.id must match profile_id). Body length ≤100000, orderText ≤5000, stockistId UUID regex. Fetches active products; prompt matches order text to catalogue; models `google/gemini-2.5-flash` → `openai/gpt-5-mini`, temp 0.2. Returns `{items:[{originalText, productId|null, productName, quantity, matchConfidence: exact|high|medium|low|none, suggestions[]}]}`. Confidence guide exact=100%…none<40%; parses "50N"/"x100"/"100 boxes"; top-3 suggestions for low/none.
- **extract-bill-items** — public (no auth); **soft-fails HTTP 200** with `{ok:false, error, items:[]}`. Validates image URL host (supabase/lovable). `gemini-2.5-pro` → `gpt-5` vision. Cleans items (name≤200, qty≥1, price≥0). Handles 429/402.
- **process-bill-image** — auth required + ownership-verified. Skips AI if `previewItems` supplied (`useProvidedData`). Else `gemini-2.5-pro`→`gpt-5` vision. Resolves pharmacy (pre-selected / create_new / exact-name / license-normalized match / else create w/ gst_number:'PENDING'). Creates order `ORD-{ts}` (confirmed/unpaid/pending, bill_image_url). Inserts items. **Stock: exact-name match** → reduce (`max(0, stock-qty)`); else **auto-create product** w/ stock 0, `sale_price=price*1.2, mrp=price*1.3, gst 5`. Returns `{order_number, order_id, stock_update:{reduced,created,failed}}`.
- **extract-product-label** — auth. `gemini-2.5-pro`→`gpt-5` vision. Separates medicine name vs brand, **infers popular Indian brand** for generics (e.g. Paracetamol→Dolo), extracts strength/mrp/batch_number/expiry_date (YYYY-MM-DD).
- **fetch-product-info** — auth. `gemini-2.5-pro` temp 0.7. Enriches product name → name/generic_name/brand (forces popular Indian brand)/manufacturer/strength/pack_size/category/type; joins multiple salts with " + ".
- **ai-symptom-checker** — public (no auth). `api.lovable.app` + `gemini-2.5-pro`. Body `{symptoms, age, medicalHistory}`. Returns `possible_conditions, suggested_otc_medicines[{name,purpose}], when_to_see_doctor, disclaimer`. (Client sends only `symptoms` and reads different field names — mismatch noted.)
- **extract-prescription** — public. `api.lovable.app` + `gemini-2.5-flash`. Returns medicines[{name,dosage,frequency,duration}], doctor_name, clinic_name, prescription_date, diagnosis. **Not invoked anywhere in current UI** (prescription upload skips OCR).
- **chat-assistant** — no explicit auth check (uses service role). Body `{messages, stockist_id, pharmacy_id, role}`. `gemini-2.5-flash` with **function-calling tools**, `tool_choice:auto`, tool-loop. Six role system prompts (all "Digi Swasthya AI", enforce data isolation + ₹ formatting). Tool sets declared for stockist(6)/pharmacy(4)/admin(5)/patient(4)/brand(4)/mr(4), BUT executor selection is only `admin | pharmacy | else→stockist` — **patient/brand/mr tools declared but never executed** (fall through to stockist executor with wrong id). Stockist tools: get_pending_orders, get_todays_orders, get_outstanding_pharmacies, get_low_stock_products, get_payment_summary, get_dashboard_stats (real scoped Supabase queries). 429→credits/rate-limit messages. Only StockistChatAssistant + PharmacyChatAssistant are mounted in UI.
- **optimize-route** — no auth. Body `{startingPoint, pharmacies[]}`. Builds distance matrix via Google Distance Matrix API if `GOOGLE_MAPS_API_KEY` set, **else `estimateDistanceMatrix` = random 5-20 km** (demo). `gemini-2.5-flash` temp 0.3 solves TSP → `{optimizedOrder(ids), distances[], totalDistance, explanation}`. Fallback to sequential order on parse error.

### Transactional / business logic
- **create-platform-order** — **public** (intentionally; guarded by license verification + Zod). Zod: pharmacy_id/stockist_id UUID, items[1..100]{product_name≤200, qty int 1..10000, unit_price 0..1e6, total_price, gst_percentage?, tax_amount?}, total_amount 0..1e7. Rounds all to integers. Order `PLT-{ts}-{rand6}`, confirmed/unpaid/pending, order_source='platform'. Inserts items (gst default 12). **Stock reduction by `ilike '%name%'` first match** (`max(0, stock-qty)`). Recomputes pharmacy `outstanding_balance = Σ round(total-paid)` over unpaid/partial.
- **create-batch-cycle** — service role. Aggregates pending+confirmed orders in date range into `order_batch_cycles`; **`delivery_cost = orders*12`, `cost_savings = orders*(60-12)`** (modeled ₹60 vs ₹12/order). Links orders via `batch_cycle_id`.
- **reduce-stock-for-order** — service role, Zod-validated. Per item: `ilike` match → reduce; if not found → **auto-create** (stock=qty, then set to 0, min_stock 10, gst 5, category 'Unclassified'); logs `activity_log` (product_created/stock_reduced); low-stock warnings when `newStock ≤ threshold`.
- **calculate-delivery-fee** — service role. Haversine distance (stockist dispatch lat/lng ↔ pharmacy lat/lng). Applies active `stockist_delivery_rules` by priority: order_amount (free if `order_total ≥ min_order_amount`), flat_fee, distance (`per_km_charge * max(0, dist-base_distance_km)`). Default: **free if ≥₹5000 else ₹50**. Always returns 200 even on error (default ₹50).
- **mark-payment-paid** — **public** (pharmacy link). Zod: amount 1..1e7, payment_type enum. Inserts **pending** `payment_confirmations` (requires stockist approval).
- **approve-reject-payment** — auth required (user-verified) + **service-role writes**. Zod: confirmation_id UUID, action approve/reject/on_hold, notes≤500. Updates confirmation status (on_hold clears processed_at/by). **On approve** = credit-first + FIFO settlement: `creditUsed=min(amount, credit)`, `totalFundsToDistribute=creditUsed+amount`. If `order_id` set → apply to that order (excess → credit). Else FIFO over oldest unpaid/partial (excl cancelled). Leftover → credit_balance. **Self-healing cleanup pass**: any unpaid/partial order where `|total-paid|<0.01` → marked paid. Itemized credit note in stockist_notes. 0.01 tolerance throughout.
- **get-pharmacy-outstanding-orders** — **public** (service role). Zod pharmacy_id+stockist_id. Returns unpaid/partial orders w/ order_items, filtered to `round(paid) < round(total)`.
- **verify-pharmacy-license** — **public**, **rate-limited** via RPC `check_rate_limit` (5 attempts / 15 min per license, returns 429 + retry minutes). Normalizes license (lowercase, strip non-alphanumeric). Looks up stockist by `catalogue_slug` + `catalogue_enabled`. If `pharmacy_pin_code` provided, validates against active `stockist_service_areas` (else "does not deliver to PIN"). Matches active pharmacy by normalized license. Returns `{verified, pharmacy{id,name,license,outstanding,credit}, stockist{id,name,company_name,upi_id}, orders(last 10)}` or verified:false with attempts_remaining.

---

## 10. PAYMENTS, CREDIT & MONEY LOGIC (consolidated)

- **Status vocab**: order `status` draft/confirmed/cancelled; `payment_status` paid/unpaid/partial; `delivery_status` pending/dispatched/out_for_delivery/delivered. Confirmation `status` pending/approved/rejected/on_hold. Order sources: manual, platform, pharmacy_portal, whatsapp.
- **Order numbering**: manual/quick-bill/OCR = `ORD-{Date.now()}`; quick-order (WhatsApp parse) = `ORD-{ts}` w/ `order_source=whatsapp`; platform (public catalogue) = `PLT-{ts}-{rand6}`; process-bill-image = `ORD-{ts}`; AddPharmacy placeholder = `INIT-{ts}`; recall = `RCL-{ts}`.
- **Credit-first + FIFO settlement** appears in FIVE places with the same algorithm & 0.01 tolerance: (1) Pharmacies page custom payment, (2) approve-reject-payment edge fn, (3) SortablePharmacyCard route collection, (4) OrderActionsDropdown partial payment (single-order), (5) mark-fully-paid (bulk). Leftover funds → `credit_balance`.
- **Outstanding balance** always recomputed as `Σ max(0, total_amount - paid_amount)` over unpaid/partial orders (`recalculatePharmacyBalance` duplicated across many files).
- **GST differs by surface**: portal checkout = flat **5% + delivery fee**; public catalogue checkout = **per-item `gst_percentage`, no delivery fee**; stockist OrderCreation = **SGST/CGST split (tax/2 each)**, per-item gst default 5; QuickOrder/QuickBill dialogs use a 5/12 tax toggle (default 12); create-platform-order defaults item gst to 12 if absent.
- **UPI**: QR via `qrcode.react` (level H, size 200, downloadable PNG) + `upi://pay?pa={upi}&pn={name}&am={amount}&tn=Order-{num}&cu=INR` deep links. Payments always require stockist confirmation before balances update. PaymentLinkDialog also lets stockist edit their UPI ID inline (saved to stockist_details) and pick 100/50/25% or slider payment amount, then Send via WhatsApp.

---

## 11. KNOWN STUBS / PLACEHOLDERS / BUGS (code-verified)

- **Patient**: Checkout placement is explicit demo (no write); Add-to-Cart on Search/Compare/Wishlist and "Order from Prescription" unwired; no OCR on prescription upload; PriceComparison Star 4.5 & ~45min hardcoded, Add-to-Cart toast stub; PriceComparison queries columns (`product_name`, `selling_price`) that don't match the products schema; AIAssistant reads response field names that don't match the edge fn output.
- **Pharmacy portal**: PharmacyOrdering price comparison uses `Math.random()` + Add-to-Cart unwired; Inventory Add/Edit buttons unwired.
- **Brand**: Analytics growth 24.5%, Fulfilment 45min & 98.5% hardcoded; Product Edit/Delete + Campaign "View Analytics" unwired; campaign_type hardcoded "discount".
- **MR**: Collections target ₹50,000 hardcoded; Record Collection demo-only (not persisted); Add Pharmacy unwired.
- **Admin**: User active-status hardcoded true + not persisted (only audit-logged); Analytics charts are placeholder divs + trend %s hardcoded; Enhanced Analytics growth 32.5% hardcoded + not linked from dashboard; Notices/Users "View" buttons stubs.
- **Stockist**: EditProductDialog collects HSN Code & Batch Code but the update omits them (not persisted); AddProduct collects batch_code but insert omits it; Analytics "Active Pharmacies" counts ALL pharmacies (not scoped); PharmacyDetail Send Reminder uses hardcoded `pa=yourUPI@bank` placeholder; DateRangeFilter on dashboard is display-only.
- **AI**: chat-assistant declares patient/brand/mr tools but only stockist/pharmacy/admin executors exist; optimize-route uses random distance matrix without Google Maps key; extract-prescription edge fn unused by UI.
- **Settings**: Notification preference switches are cosmetic (not persisted). **Remember me** on Login unused.
- **Orphaned routes/components**: PatientSignup, BrandSignup, Index (no `/` mapping), RoleSelection (deprecated redirect). A duplicate `BottomNav.tsx` (Analytics variant) is unused.

---

## 12. DATA MODEL (from types.ts groupings; ~70 tables/RPCs)

- Identity: profiles, user_roles, stockist_details, pharmacy_details, patient_details, brand_details, mr_details.
- Catalog/inventory: products, product_batches, pharmacy_inventory, pharmacy_expiry_alerts, brand_products.
- Orders/delivery: orders, order_items, order_batch_cycles, patient_orders, patient_order_tracking, brand_orders, delivery_tracking, route_executions.
- Payments/finance: invoices, payment_confirmations, payment_reminders, platform_fees, commission_ledger, mr_order_commissions, subscription_plans, user_subscriptions.
- Connections/territory: pharmacy_stockist_connections, pharmacy_registration_requests, pharmacy_documents, territories, stockist_service_areas, stockist_delivery_dates, stockist_delivery_rules, batch_delivery_rules.
- Patient engagement: patient_prescriptions, patient_addresses, patient_refill_reminders, patient_wishlist, wishlist, loyalty_points, loyalty_transactions, ratings_reviews, referrals, search_history.
- Brand/compliance: brand_campaigns, campaigns, brand_batch_verification, batch_recalls, disputes.
- MR: mr_pharmacy_visits.
- Governance/comms: admin_notices, user_notice_recipients, message_templates, notification_queue, notification_preferences, communication_log, support_tickets, audit_logs, activity_log, analytics_events, platform_settings, catalogue_rate_limits.
- RPCs used in code: `has_role`, `is_admin`, `check_rate_limit`, `deduct_stock`, `distribute_notice_to_users`, `search_users_by_batch_code`.

*Generated by reading src/App.tsx, all src/pages/**, src/components/** (dialogs/layouts/dashboards), contexts, hooks, lib, and supabase/functions/*.*

---
