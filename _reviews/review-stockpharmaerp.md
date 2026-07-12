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

---

## 13. COMPLETE DATA DICTIONARY (every table, every field — from `src/integrations/supabase/types.ts`, 51 tables + 6 RPCs)

Conventions: all PKs are `id uuid` (gen_random_uuid). "→" = FK. Enums: `app_role` = stockist|pharmacy|admin|mr|patient|brand; legacy `user_role` = stockist|pharmacy (unused in app code).

### 13.1 Identity & roles
- **profiles** — mirror of auth users. Fields: `id` (= auth.uid), `email`, `created_at`, `updated_at`. Created by Login signup upsert and orphaned signup pages. Every other "user_id" FK points here.
- **user_roles** — `user_id`, `role app_role`, `created_at`. One row per role; unique (user_id, role) used as upsert conflict key. Read by `has_role()`/`is_admin()` SQL, AuthContext (maybeSingle → effectively assumes ONE role/user), useUserRole (all roles → priority pick), AdminRoute.
- **stockist_details** — the stockist business record. `profile_id` →profiles (1:1), `stockist_name`, `company_name`, `license_number`, `phone`, `address`, `gstin`; bank: `upi_id`, `bank_name`, `account_number`, `ifsc_code`, `account_holder_name`; commerce config: `catalogue_slug`, `catalogue_enabled`, `catalogue_created_at`, `default_credit_days`, `default_margin_percent`, `delivery_radius`, `business_hours Json`; dispatch geo: `dispatch_latitude/longitude/place_name` (used by calculate-delivery-fee Haversine). Created at onboarding; updated at StockistProfile & PaymentLinkDialog (inline UPI save).
- **pharmacy_details** — dual-ownership design: `profile_id` →**stockist_details.id** (the stockist who "owns"/manages the pharmacy record — used by ALL stockist RLS) and `auth_profile_id` →profiles.id (set only when the pharmacy itself has a login; the authenticated pharmacy portal keys on this). Fields: `pharmacy_name`, `owner_name`, `license_number` (public-catalogue password), `gst_number` (NOT NULL; process-bill-image inserts 'PENDING'), `phone`, `whatsapp_number`, `email`, `address`, `area`, `pin_code`, `google_maps_name`, `location_coordinates` (text "lat,lng") plus separate `latitude`/`longitude` numerics; money: `credit_limit`, `credit_balance`, `outstanding_balance` (maintained by trigger + client recalcs); denorm stats: `total_orders`, `total_revenue`, `last_order_date` (written by nothing in current UI — stale denorms); `is_active`.
- **patient_details** — `profile_id` (1:1), `patient_name`, `phone` (NOT NULL), `date_of_birth`, `gender`, `blood_group`, `allergies text[]`, `medical_conditions text[]`, `emergency_contact_name/phone`, `is_active`.
- **brand_details** — `profile_id` (1:1), `brand_name`, `company_name`, `contact_person`, `phone`, `email`, `gstin`, `manufacturing_license`, `address`, `is_verified` (gates the whole brand module; nothing in the UI sets it true — admin would have to flip it in DB), `is_active`.
- **mr_details** — structurally a clone of stockist_details (same bank/catalogue/credit columns incl. `upi_id`, `catalogue_slug`, `catalogue_enabled`, `default_credit_days`, `delivery_radius`, `business_hours`): `profile_id` (1:1), `mr_name`, `company_name`, `license_number`, `phone`, `address`, `gstin`. Only name/company/license/phone/address are used by the MR UI; the catalogue/bank columns are dormant.

### 13.2 Catalog & inventory
- **products** (stockist catalogue) — `stockist_id` →stockist_details, `name`, `generic_name`, `brand`, `manufacturer`, `category`, `type` (form), `strength`, `pack_size`, `description`, `image_url`, `hsn_code`, `batch_code`; pricing: `mrp`, `purchase_price` (PTR), `sale_price` (PTS), `gst_percentage` (default 5); stock: `stock_quantity`, `min_stock_threshold` (default 10), `moq` (default 1); `is_active`. Written by AddProduct/EditProduct/QuickUpdateStock/OCR scan/BulkUpload/AI enhance/edge auto-creation; decremented by order flows and `deduct_stock` RPC.
- **product_batches** — `product_id` →products, `batch_number`, `expiry_date` (NOT NULL), `manufacturing_date`, `quantity`. Read by the Products page expiry filter/badges; no UI writes batches (data would arrive via SQL/imports) — expiry badges only appear for products that have batch rows.
- **pharmacy_inventory** (authenticated pharmacy's own stock) — `pharmacy_id` →pharmacy_details, optional `stockist_id` provenance, `product_name`, `generic_name`, `manufacturer`, `category`, `pack_size`, `batch_number`, `hsn_code`, `gst_percentage`, `expiry_date`, `purchase_date`, `quantity`, `unit_price`, `sale_price`, `mrp`, `low_stock_threshold`. Read-only in the UI today (Inventory page lists it; Add/Edit unwired) — rows must originate outside the UI.
- **pharmacy_expiry_alerts** — auto-populated by DB trigger `trigger_create_expiry_alerts` on pharmacy_inventory insert/update (expiry >30d out): `pharmacy_id`, `inventory_id` →pharmacy_inventory, `product_name`, `batch_number`, `expiry_date`, `quantity`, `alert_days_before` (30), `status`, `acknowledged_at`. **No UI reads this table** — pure background data.
- **brand_products** — `brand_id` →brand_details, `product_name`, `generic_name`, `sku`, `batch_number` (all NOT NULL except generic), `category`, `manufacturer`, `description`, `image_url`, `mrp`, `selling_price`, `stock_quantity`, `prescription_required`, `is_active`. (PriceComparison's patient page queries `products` with these column names — schema mismatch documented in §11.)

### 13.3 Orders & delivery
- **orders** (the central B2B document) — `order_number` (unique human ref, see §10 numbering), `stockist_id` →stockist_details, `pharmacy_id` →pharmacy_details, `batch_cycle_id` →order_batch_cycles; money: `total_amount`, `net_amount`, `tax_amount`, `discount_amount`, `paid_amount`; status trio: `status` (draft/confirmed/cancelled), `payment_status` (paid/unpaid/partial), `delivery_status` (pending/dispatched/out_for_delivery/delivered); `order_source` (manual/platform/pharmacy_portal/whatsapp); `payment_due_date`, `payment_mode`, `delivery_date`, `delivery_address`, `notes`; bill capture: `bill_number`, `bill_image_url`. Three DB triggers fire on it (§14).
- **order_items** — `order_id` →orders, `product_name` (denormalized string — **no product_id FK**; items survive product deletion but stock updates must name-match), `product_description`, `quantity`, `unit_price`, `total_price`, `gst_percentage`, `tax_amount`, `batch_code`.
- **order_batch_cycles** — `stockist_id`, `cycle_start_date`, `cycle_end_date`, `delivery_date`, `status` (collecting/…), `total_orders`, `total_pharmacies`, `total_value`, `delivery_cost` (=orders×₹12), `cost_savings` (=orders×₹48). Written only by `create-batch-cycle` edge fn; read by BatchOrdering page.
- **patient_orders** (B2C) — `patient_id` →patient_details, `pharmacy_id` →pharmacy_details, `prescription_id` →patient_prescriptions, `delivery_address_id` →patient_addresses, `order_number`, `items Json` (embedded array, not a child table), `subtotal`, `delivery_fee`, `platform_fee`, `discount_amount`, `total_amount`, `order_status` (placed/confirmed/packed/dispatched/delivered/cancelled per dashboard color map), `payment_status`, `payment_method`, `delivery_slot`, `delivered_at`, `notes`. Read by patient dashboard/orders; **never inserted by the UI** (patient checkout is a demo stub).
- **patient_order_tracking** — `patient_order_id` →patient_orders, `status`, `message`, `latitude`, `longitude`. Data-model only; no UI.
- **brand_orders** — `brand_id`, `patient_id`, `pharmacy_id`, `delivery_address_id`, `order_number`, `items Json`, `subtotal`, `delivery_fee`, `platform_fee` (NOT NULL), `pharmacy_commission` (NOT NULL — models the pharmacy's cut for fulfilling a brand D2C order), `total_amount`, `order_status`, `payment_status`, `payment_method`, `delivered_at`. Read by Brand dashboard/analytics/fulfilment KPIs; no insert path in UI.
- **delivery_tracking** — `route_execution_id` →route_executions, `pharmacy_id`, `order_id`, `collection_amount`, `payment_mode`, `delivered_at`, `notes`. Table + RLS exist; **RouteExecution page does not write it** (collections go straight to payment_confirmations) — dormant.
- **route_executions** — `stockist_id`, `starting_address`, `pharmacy_ids uuid[]`, `optimized_order uuid[]`, `total_distance`, `status` (default 'in_progress'), `started_at`, `completed_at`. Same: modeled but the RouteExecution page keeps route state in React only and never persists a row — dormant.

### 13.4 Payments & finance
- **payment_confirmations** — the payment-approval object: `stockist_id`, `pharmacy_id`, `order_id` (nullable: null = "apply FIFO across orders"), `amount`, `payment_type` (custom/route_collection/manual_mark_paid/manual_partial/manual_payments_page/full_outstanding/custom_amount/specific_order per creating surface), `payment_method`, `payment_proof_url` (schema-only; no upload UI), `status` (pending/approved/rejected/on_hold), `pharmacy_notes`, `stockist_notes` (approve fn writes an itemized credit/FIFO breakdown here), `processed_by`, `processed_at`.
- **payment_reminders** — `pharmacy_id`, `stockist_id`, `order_id`, `amount`, `message`, `reminder_date`, `scheduled_date`, `sent_at`, `status` (default/sent), `auto_reminder_enabled` (schema-only — no scheduler exists). Written by Payments page Send Reminder and PharmacyRemindersList Nudge.
- **invoices** — `user_id` →profiles, `invoice_number`, `invoice_type`, `amount`, `tax_amount`, `total_amount`, `due_date`, `status`, `paid_at`, `invoice_url`. Dormant (no UI).
- **platform_fees** — `fee_name`, `fee_type` (percentage/fixed), `fee_value`, `calculation_method`, `applies_to` (stockist/pharmacy/both), `min_amount`, `max_amount`, `effective_from/to`, `is_active`. Admin CRUD only; **no fee is ever applied to an order anywhere in code**.
- **commission_ledger** — `user_id`, `order_id`, `commission_type`, `commission_rate`, `commission_amount`, `status`, `paid_at`, `payment_reference`. Dormant.
- **mr_order_commissions** — `mr_id` →mr_details, `order_id` →orders, `pharmacy_id`, `commission_amount` (default 0), `commission_rate`, `status`, `paid_at`. Read by MR Collections/Analytics; nothing in the UI creates rows.
- **subscription_plans** / **user_subscriptions** — SaaS billing scaffold (`plan_name`, `price`, `billing_cycle`, `features Json`, `max_products/pharmacies/orders_per_month`, `user_type`; subscriptions with `start/end_date`, `status`, `auto_renew`, payment dates). Entirely dormant.

### 13.5 Network, registration & territory
- **pharmacy_registration_requests** — full application snapshot (all pharmacy fields + `whatsapp_number`, `google_maps_name`, `location_coordinates`) + document URLs (`drug_license_url`, `gst_certificate_url`, `other_documents_url`) + dual-approval state machine: `status` (pending→approved/rejected), `admin_approved(+_at,_by)`, `stockist_approved(+_at,_by)`, `stockist_id` (set by the approving stockist), `rejection_reason`. Public INSERT policy allows unauthenticated submission.
- **pharmacy_stockist_connections** — `pharmacy_id`+`stockist_id` with per-relationship `credit_limit`, `outstanding_balance`, `last_order_date`, `is_active`. Modeled many-to-many trade relationship; **current code derives relationships from orders instead** — dormant.
- **pharmacy_documents** — `pharmacy_id`, `document_type`, `document_url`, `document_number`, `issue_date`, `expiry_date`, `status` (pending/verified/rejected via admin DocumentVerification page; code also writes `verification_status` naming per page — page sets status fields + `verified_at/by`, `rejection_reason`, `notes`).
- **territories** — admin-defined: `territory_name`, `state`, `district s[]`... actually `districts text[]`, `pin_codes text[]`, `territory_manager`, `is_active`. Reference data only (nothing enforces territories at order time).
- **stockist_service_areas** — `stockist_id`, `pin_code`, `area_name`, `district`, `state`, `is_active`. Enforced in: verify-pharmacy-license PIN check, StockistApprovals request filtering, BrowseStockists sorting.
- **stockist_delivery_dates** — `stockist_id`, `delivery_date`, `is_active`, `notes`. Set in DeliverySettings; surfaced as "next delivery" in BrowseStockists.
- **stockist_delivery_rules** — `stockist_id`, `rule_type` (order_amount/flat_fee/distance), `rule_name`, `flat_fee`, `min_order_amount`, `per_km_charge`, `base_distance_km`, `min_profit_amount` (unused), `free_on_delivery_date` (unused), `priority`, `is_active`. Consumed by calculate-delivery-fee.
- **batch_delivery_rules** — `stockist_id`, `delivery_day`, `min_order_value`, `require_payment_clearance`, `max_payment_overdue_days`, `is_active`. Dormant (no UI, not read by create-batch-cycle).

### 13.6 Patient engagement (mostly dormant beyond reads)
- **patient_addresses** — `patient_id`, `address_type`, `address_line`, `landmark`, `city`, `state`, `pin_code`, `latitude/longitude`, `is_default` (profile page enforces single default by unsetting others).
- **patient_prescriptions** — `patient_id`, `prescription_image_url` (NOT NULL), `prescription_date`, `medicines Json`, `doctor_name`, `clinic_name`, `diagnosis`, `notes`, `validity_days`, `is_active`. UI writes only image+date.
- **patient_refill_reminders** — `patient_id`, `medicine_name`, `frequency_days`, `last_refill_date`, `next_refill_date`, `is_active`. Read by dashboard "Pending Refills" KPI; no create UI.
- **patient_wishlist** — `patient_id`, `product_id`, `product_name`, `product_price`, `stockist_id`. Read+delete in UI; no add path wired.
- **wishlist** — generic (`user_id`, `product_id`, `product_type`) — dormant duplicate.
- **loyalty_points** (`points_balance/earned/redeemed`, `tier`) & **loyalty_transactions** (`points`, `transaction_type`, `order_id`, `description`) — dormant.
- **referrals** — `referrer_id`, `referee_id`, `referral_code`, `reward_amount`, `status`, `completed_at` — dormant.
- **ratings_reviews** — polymorphic `entity_type`+`entity_id`, `rating`, `review_text`, `is_verified_purchase`, `is_active` — dormant.
- **search_history** — `user_id` (nullable; anonymous insert policy exists), `search_query`, `search_type`, `results_count` — dormant.

### 13.7 Brand compliance
- **brand_campaigns** — `brand_id`, `campaign_name`, `campaign_type` (UI hardcodes "discount"), `description`, `discount_percentage`, `budget`, `actual_spend`, `start_date`, `end_date` (NOT NULL), `status` (UI inserts "draft"), `target_region text[]`.
- **brand_batch_verification** — anti-counterfeit: `brand_id`, `product_id` →brand_products, `batch_number`, `manufacturing_date`, `expiry_date`, `quantity`, `verification_code`, `qr_code_url`, `is_verified`. Public SELECT policy ("Public verify batches") exists but no verification UI.
- **batch_recalls** — `recall_number` (RCL-{ts}), `batch_number`, `product_name`, `manufacturer`, `severity` (critical/high/medium/low), `recall_reason`, `instructions`, `recall_date`, `status` (active/resolved), `initiated_by`, `affected_users_count`, `cdsco_reference` (Indian regulator ref — schema-only).
- **disputes** — `dispute_number`, `dispute_type`, `filed_by` →profiles, `pharmacy_id`, `stockist_id` (both NOT NULL), `order_id`, `subject`, `description`, `priority`, `status` (open/in_progress/resolved/closed/escalated), `assigned_to`, `resolution`, `resolved_at`. Admin resolves; **no user-facing "raise dispute" UI exists** — rows must be created externally.

### 13.8 Governance & communications
- **admin_notices** — `title`, `content`, `notice_type` (announcement/alert/update/warning/recall), `priority` (low/medium/high/urgent), targeting arrays `target_role/pin_codes/batch_codes/states/districts`, `expires_at`, `is_active`, `created_by`.
- **user_notice_recipients** — fan-out rows (`notice_id`, `user_id`, `read_at`, `dismissed_at`; unique notice+user). Created by `distribute_notice_to_users` RPC; consumed by stockist NoticesPanel.
- **message_templates** — `template_name`, `template_type` (email/sms/whatsapp), `category`, `subject`, `content` with `{variable}` placeholders, `variables Json`, `is_active`. Referenced by notification_queue.template_id but no send pipeline uses them.
- **notification_queue** — `user_id`, `notification_type`, `channel`, `template_id` →message_templates, `variables Json`, `recipient_email/phone`, `scheduled_at`, `sent_at`, `delivered_at`, `status` (pending=unread in the bell), `error_message`. Read by NotificationBell (patient/brand navs); **nothing enqueues or sends** — a queue with no producer or worker.
- **notification_preferences** — per-user switches `push/email/sms/whatsapp/marketing_enabled` (1:1 user). Exists in DB; the Settings page switches do NOT read/write it.
- **communication_log** — `pharmacy_id`, `type` (whatsapp), `message`, `status`, `sent_at`. Written by Payments page reminder flow only.
- **support_tickets** — `user_id`, `subject`, `category`, `priority`, `status`, `description`. Full lifecycle on the Support page (create + self-mark-resolved). No admin ticket console.
- **audit_logs** — `user_id`, `action`, `entity_type`, `entity_id`, `details Json`, `ip_address` (always null — client sends null), `user_agent`. Written via `useAuditLog` (admin user actions) — viewed at /admin/audit-logs.
- **activity_log** — stockist-scoped feed: `stockist_id`, `activity_type` (catalogue_update/price_change/order_modified/payment_reminder/payment_received/order_created/stock_reduced/product_created), `description`, `metadata Json`.
- **analytics_events** — `user_id`, `event_type`, `event_data Json`, `page_url`. Insert policy open to all; no code writes events — dormant.
- **platform_settings** — key/value store: `setting_key` (`app_info`, `{role}_announcement`), `setting_value Json`, `target_role`, `is_active`. Read/written by Settings page.
- **catalogue_rate_limits** — `identifier` (license/IP), `action_type` (license_verify/order_create/payment_submit envisioned; only license_verify used), `attempt_count`, `last_attempt_at`. Managed exclusively by `check_rate_limit` RPC under service role.

### 13.9 RPC signatures (types.ts Functions)
- `check_rate_limit(p_identifier, p_action_type, p_max_attempts, p_time_window_minutes) → jsonb {allowed, attempts_remaining | retry_after…}`
- `deduct_stock(p_product_id uuid, p_quantity int) → boolean` (false when insufficient)
- `distribute_notice_to_users(p_notice_id, p_target_role?, p_target_pin_codes?, p_target_batch_codes?, p_target_states?, p_target_districts?) → integer` (recipient count)
- `has_role(_user_id, _role app_role) → boolean` · `is_admin() → boolean` (both SECURITY DEFINER, used inside RLS)
- `search_users_by_batch_code(p_batch_code) → rows {user_type, user_id, user_name, contact_phone, product_count}`

---

## 14. DATABASE-SIDE BUSINESS LOGIC (triggers & SQL functions — server automations that run regardless of which client writes)

From `supabase/migrations/*.sql` (~80 migration files, Nov 8 – Dec 20, 2025; 297 CREATE TABLE/FUNCTION/POLICY/TRIGGER statements):

- **`recalculate_pharmacy_balance()`** — trigger `trg_orders_recalc_balance` AFTER INSERT/UPDATE/DELETE on `orders` (also legacy `update_pharmacy_balance`). Final version: `pharmacy_details.outstanding_balance = Σ (total_amount − COALESCE(paid_amount,0))` over that pharmacy's orders with `payment_status IN (unpaid, partial) AND status != 'cancelled'`. The function evolved across migrations (an intermediate version ROUND()ed both amounts; the final one does not, cancelled-order exclusion was added later). This means the many client-side `recalculatePharmacyBalance()` duplications (§10) are redundant-but-consistent: the DB recomputes the same number on every order write anyway.
- **`handle_order_cancellation()`** — trigger `trg_orders_handle_cancel` AFTER UPDATE on `orders` WHEN status transitions to 'cancelled': if `paid_amount > 0`, adds the paid amount to `pharmacy_details.credit_balance` (auto credit-note). A backfill migration granted credit for historical cancelled paid orders. This is why the UI cancel-confirm dialog says "₹X will be added as credit" — the DB does it.
- **`prevent_overpayment()`** — trigger `trg_prevent_overpayment` BEFORE UPDATE on `orders` WHEN `paid_amount IS NOT NULL`: if `paid_amount > total_amount`, clamps `paid_amount = total_amount`, forces `payment_status='paid'`, and pushes the excess into `pharmacy_details.credit_balance`. A DB-level safety net beneath all five client FIFO implementations.
- **`create_expiry_alerts()`** — trigger on `pharmacy_inventory` AFTER INSERT OR UPDATE OF expiry_date, quantity: inserts a `pharmacy_expiry_alerts` row (alert_days_before=30) when expiry_date > today+30d. (Note the condition is `>` 30 days out, so items already inside the 30-day window never get an alert row — and no UI reads the table anyway.)
- **`deduct_stock(product_id, qty)`** — atomic conditional decrement (`WHERE stock_quantity >= qty`), returns false instead of going negative. Used only by the pharmacy portal checkout; other order paths decrement client-side or in edge functions with `max(0, …)` clamping.
- **`check_rate_limit(...)`** — SECURITY DEFINER, `SELECT … FOR UPDATE` row-lock on `catalogue_rate_limits` per (identifier, action_type) within the time window; creates/increments the attempt row and returns `{allowed, attempts_remaining}` or a denial with retry info. Only caller: verify-pharmacy-license (5 attempts / 15 min keyed by normalized license).
- **`distribute_notice_to_users(...)`** — SECURITY DEFINER fan-out: joins profiles ⋈ user_roles ⋈ stockist_details ⋈ pharmacy_details (via the stockist's pharmacies) ⋈ stockist_service_areas ⋈ products, filters by role / PIN (pharmacy pin OR service-area pin) / product batch_code / service-area state / district, then inserts `user_notice_recipients` rows (ON CONFLICT DO NOTHING) and returns the count. Because pharmacy/geo/batch joins run through stockist_details, geo/batch-targeted notices effectively reach **stockist accounts** whose network matches — pharmacies without logins can't receive them.
- **`search_users_by_batch_code(code)`** — SECURITY DEFINER two-part UNION: stockists having active products with that `batch_code`, plus pharmacies that ordered items with that batch code (via order_items.batch_code). Powers admin recall impact search.
- **`has_role` / `is_admin`** — STABLE SECURITY DEFINER lookups on user_roles; embedded in dozens of RLS policies (avoids RLS recursion on user_roles itself).
- **`update_updated_at_column()` / `update_patient_details_updated_at`** — generic BEFORE UPDATE `updated_at = now()` triggers attached to ~20 tables (orders, products, product_batches, profiles, stockist/pharmacy/mr/brand/patient details, registration requests, connections, inventory, documents, platform_settings, service areas, recalls, campaigns, disputes, templates, fees, territories).

## 15. SECURITY MODEL — RLS POLICIES, STORAGE, EDGE-FUNCTION AUTH

### 15.1 Row-Level Security (all app tables have RLS enabled; policy summary by principal)
- **Admin** (`is_admin()`): full manage on batch_recalls, campaigns, disputes, pharmacy_documents, platform_fees, message_templates, territories, notices + recipients, platform_settings, delivery dates/rules, commission_ledger, subscriptions, brand_details, mr_details, connections; view-all on audit_logs, registration requests, service areas, analytics_events, pharmacy_inventory, expiry alerts, patient_orders.
- **Stockist** (owns via `stockist_details.profile_id = auth.uid()`, most policies also require `has_role('stockist')`): manage own stockist_details, own products & product_batches, own orders & order_items, own pharmacies (`pharmacy_details.profile_id = stockist_details.id` — the ownership chain), payment reminders (stockist_id column added specifically to harden this policy), delivery dates/rules/service areas, activity_log inserts, communication_log inserts, route_executions ("Stockists manage own routes"), delivery_tracking (via route join), disputes view (own stockist_id).
- **Pharmacy (authenticated)**: view/insert/update own profile (`auth_profile_id = auth.uid()`), manage own pharmacy_inventory, view/update own expiry alerts, view own connections, view/update patient orders addressed to them, view brand fulfilment orders.
- **Patient**: manage own details/addresses/prescriptions (incl. storage policies for the prescriptions bucket)/refill reminders/wishlist; view own orders & tracking.
- **Brand**: manage own details/products/campaigns/batch verification; view own orders.
- **MR**: manage own details & visits ("MRs manage their visits"); view own commissions.
- **Any authenticated**: view own profile/roles/notice recipients/notifications/invoices/loyalty/referrals/search history/subscriptions/analytics; insert own roles during signup; manage own notification_preferences, reviews, generic wishlist; view active fees/plans/recalls/territories/campaigns/settings/notices.
- **Public/anonymous** (what makes the no-login catalogue possible): view catalogue-enabled stockists (and MRs), view catalogue products, view active delivery dates/rules/service areas, "Public can verify pharmacy by license", "Public can view orders via license verification", create registration requests, create payment confirmations ("Anonymous can create payment confirmations"), insert search history, verify brand batches.
- **Service role only**: catalogue_rate_limits; system insert/update policies on patient_order_tracking and loyalty_transactions.

### 15.2 Storage buckets
- `product-images` — **public**; anyone can read; authenticated users upload/update/delete (paths namespaced `{uid}/{timestamp}_{name}` by storage.ts).
- `bills` — **private**; authenticated upload, owners read own, stockists delete from their folder; accessed via 1-hour signed URLs (except PharmacyRegistration, which stores getPublicUrl links into a private bucket — those links won't render for reviewers without signing, a real quirk).
- `prescriptions` — **private**; patient upload/read/delete-own policies; PrescriptionVault likewise stores a getPublicUrl for a private bucket.

### 15.3 Edge function JWT matrix (`supabase/config.toml`)
`verify_jwt=false` (public): verify-pharmacy-license, create-platform-order, mark-payment-paid, calculate-delivery-fee, get-pharmacy-outstanding-orders, ai-symptom-checker. `verify_jwt=true`: approve-reject-payment, reduce-stock-for-order, process-bill-image, extract-bill-items, optimize-route, parse-order-message, extract-product-label, fetch-product-info, extract-prescription, create-batch-cycle, chat-assistant. (So extract-bill-items/optimize-route/chat-assistant, which lack in-code auth checks, are still gated by platform JWT verification.) Supabase project id `cdkrutfrvlezywnffztb`; client env in `.env`: VITE_SUPABASE_URL/PROJECT_ID/PUBLISHABLE_KEY (anon key committed — standard for Lovable projects).

## 16. FRONTEND DATA-ACCESS LAYER (hooks, store, client plumbing — exact behavior)

- **Zustand `usePharmacyStore`** (src/stores/pharmacyStore.ts): the only Zustand store. `Map<id, Pharmacy>` cache with `lastFetch` timestamp, `cacheTTL=30s`, `currentStockistId`; API `isFresh(stockistId)` (must match stockist AND be <30s old), `setPharmacies`, `getPharmacy`, `updatePharmacy` (shallow merge), `invalidateCache`, `clearAll` (called by AuthContext.signOut). Backs `useCachedPharmacies`.
- **useStockistId / usePharmacyId** — React Query keyed `['stockist-id'|'pharmacy-id', user.id]`, maybeSingle id lookup, staleTime 60s / gcTime 10 min. usePharmacyId keys pharmacy_details by auth_profile_id.
- **useStockistDetails** — full stockist row, key `['stockist-details', user.id]`, staleTime 60s.
- **useCachedPharmacies(stockistId)** — derives pharmacy set from that stockist's orders (distinct pharmacy_ids) then fetches those pharmacy_details; staleTime 30s; writes results into the Zustand store; subscribes realtime channel `pharmacy-cache-{stockistId}` to invalidate the query key.
- **usePharmaciesQuery** — same orders→pharmacy_details derivation with optional search/is_active filters (staleTime 30s); companion `usePharmacyOrders(pharmacyId, stockistId)` and an update-pharmacy mutation invalidating `['pharmacies']`.
- **useOrdersQuery(stockistId, {status, paymentStatus, deliveryStatus, source, pharmacyId, limit})** — composable filtered orders list, staleTime 30s; `useUpdateOrder` mutation invalidates `['orders']`; `usePlatformOrders(stockistId, limit)` fetches `order_source='platform'` (staleTime 30s).
- **useProductsQuery(stockistId, {search, category, brand, isActive})** — staleTime 30s, plus create/update mutations invalidating `['products']`, and `useLowStockProducts` (stock ≤ threshold, staleTime 60s).
- **usePendingOrders** — `['pending-orders', stockistId(, pharmacyId)]`, unpaid/partial or undelivered orders, staleTime 30s.
- **usePaymentConfirmations(stockistId, status?, limit?)** — staleTime **15s** (fastest-moving data); `useProcessPayment` mutation calls `approve-reject-payment` then invalidates payment-confirmations + pharmacies + orders keys; `usePendingPayments(stockistId, n)` = the dashboard's 3-item pending list.
- **useAdminNotifications** — three realtime INSERT subscriptions (disputes, pharmacy_documents, batch_recalls) that raise toasts ("New Dispute Created", "New Document Submitted", destructive "Batch Recall Initiated") and accumulate an in-memory notification array (badge count on AdminDashboard). Not persisted; resets on reload.
- **NotificationBell** (patient & brand top navs): dropdown of latest 10 `notification_queue` rows for the user; unread badge = rows with `status='pending'`; realtime on the user's queue rows. Displays only `notification_type` + timestamp (no title/body, no mark-as-read action). Since nothing enqueues notifications, it is empty in practice.
- **useAuditLog** — fire-and-forget insert into audit_logs (`ip_address` explicitly null); swallows errors.
- **useDynamicCatalogueUrl(slug)** / `getCatalogueUrl(slug)` — builds `${window.location.origin}/catalogue/{slug}` so shared links track the deployed domain.
- **useUserRole** — documented §0.2; `use-mobile` — 768px matchMedia breakpoint hook; `use-toast` — shadcn toast store.

## 17. PWA / OFFLINE INTERNALS (beyond §0.5)

- **public/sw-custom.js** (custom SW additions layered onto Workbox): listens for `SKIP_WAITING` message (sent by PWAUpdateNotification's "Update" button since `skipWaiting:false`); navigation-request fetch handler falls back to the cached `/offline` page; on `activate`, claims clients and postMessages `SW_UPDATED` to all windows.
- **public/manifest.json** + icon-192/512 for installability; **PWAInstallPrompt** captures `beforeinstallprompt` and shows a custom install card; **PWAUpdateNotification** surfaces the 60s-polled update as a toast/prompt; **NetworkStatus** renders an offline banner from `navigator.onLine` + online/offline events; **Offline** page (`/offline`) is the SW navigate fallback.
- Key dependencies (package.json): react 18.3, react-router-dom 6.30, @tanstack/react-query 5.83, zustand 5, @supabase/supabase-js 2.45, zod 3.25, react-hook-form 7.61, recharts 2.15, qrcode.react 4.2, @dnd-kit core/sortable, xlsx 0.18 (spreadsheet parsing in BulkUpload), date-fns 3.6, vite-plugin-pwa 1.1, shadcn/Radix UI suite, tailwindcss + tailwindcss-animate.

## 18. PAGES PREVIOUSLY SUMMARIZED — NOW READ IN FULL

- **BrandProfile** (`/brand/profile`): Edit toggle; verification badge; three tabs — **Company** (Brand Name, Company Name, Contact Person, Phone, Email, Address), **License & Tax** (GSTIN, Manufacturing License), **Stats** (product count, campaign count from head-count queries). Save updates the listed brand_details fields. Account email fetched from profiles (read-only).
- **MRProfile** (`/mr/profile`): same pattern — **Personal** (Full Name, Phone, Email readonly, Address), **Company** (Company Name, License Number, GSTIN), **Stats** (Performance Statistics card). Save updates mr_details.
- **Index.tsx** (orphaned, no route): waits for auth+role load, then replaces location with the role dashboard map (stockist→/stockist/home … admin→/admin) or /login; renders a spinner. Dead because `/` maps to Login, but Login performs the equivalent redirect.

---

## 19. END-TO-END WORKFLOW NARRATIVES (step-by-step, exactly as the code executes)

### 19.1 Account creation → first dashboard (any role)
1. `/login` Sign Up tab: pick 1 of 5 role cards (admin excluded), email+password (≥6, confirmed). 2. `supabase.auth.signUp` (email redirect back to /login). 3. Client upserts `user_roles{user_id, role}` then `profiles{id, email}`. 4. Navigate straight to `roleConfig[role].onboarding`. 5. AuthContext sign-in effect fetches the role + the role's detail row; `onboardingComplete[role]=false` only when the detail query succeeds AND returns nothing. 6. Onboarding page inserts `{role}_details` → role dashboard. 7. Any later login: ProtectedRoute redirects to onboarding only if the detail row is still missing; errors fail open to the dashboard (anti-redirect-loop choice).

### 19.2 Pharmacy network formation (three distinct paths)
- **Path A — stockist manual add**: Pharmacies → AddPharmacyDialog. Insert `pharmacy_details` with `profile_id = stockist_details.id` (stockist ownership for RLS) + placeholder order `INIT-{ts}` (₹0/paid/delivered) so the orders-derived pharmacy list includes it instantly. No login is created; the pharmacy participates via the public catalogue using its drug license as the credential.
- **Path B — public self-registration + dual approval**: anonymous form at `/pharmacy-registration` (docs uploaded to the bills bucket) → `pharmacy_registration_requests{status:pending}`. Admin (all requests) and stockists (only requests whose PIN ∈ their active service areas) each approve independently: each approval sets its own flag; whichever approval lands **second** flips `status='approved'` and inserts `pharmacy_details` (stockist path sets profile_id = own stockist id; admin path uses the admin's own stockist_details lookup — see §11). Admin rejection requires a written reason. Realtime keeps both approval screens live.
- **Path C — pharmacy self-signup with login**: Login signup role=pharmacy → PharmacyOnboarding inserts `pharmacy_details` keyed by `auth_profile_id` (no owning stockist). Such a pharmacy uses the authenticated portal; a stockist-owned record for the same real-world pharmacy would be a separate row.

### 19.3 Order lifecycle (B2B, all sources converge on `orders`)
Creation (any of): stockist OrderCreation / QuickOrder (AI-parsed WhatsApp text) / QuickBill / BillUpload OCR (`process-bill-image`) / pharmacy portal checkout (per-stockist split + `deduct_stock` RPC + delivery fee) / public catalogue checkout (`create-platform-order`, PLT- number, per-item GST). All insert order (confirmed/unpaid/pending) + order_items, then reduce stock (client decrement, RPC, or edge ilike-match). DB trigger recalculates the pharmacy's outstanding_balance on every insert/update. Fulfilment: delivery_status pending → dispatched/out_for_delivery → delivered via the Pharmacies-page inline select, OrderActionsDropdown, or RouteExecution "Mark Delivered". Cancellation: status='cancelled' → trigger credits any paid_amount to credit_balance and the balance trigger drops it from outstanding. Editing: OrderItemsDialog (from order detail / pharmacy rows) mutates items.

### 19.4 Payment settlement (the money loop)
1. **Initiation** — pharmacy side: catalogue MarkPaymentDialog or post-checkout UPI screen → `mark-payment-paid` → **pending** payment_confirmation; stockist side: custom-amount input, Mark Paid buttons, partial-payment dialog, route collections → **approved** confirmations created directly (self-approved). 2. **Approval** — dashboard card or /stockist/payment-approvals → `approve-reject-payment` (approve/reject/on_hold; on_hold reversible). 3. **Application on approve** — credit-first (`creditUsed=min(amount, credit_balance)`), then FIFO oldest-first over unpaid/partial non-cancelled orders (or the single order when order_id set), 0.01 tolerance for 'paid', leftover → credit_balance, itemized note into stockist_notes, plus a self-healing pass marking any order with |total−paid|<0.01 as paid. 4. **Safety nets** — DB triggers clamp overpayment into credit and keep outstanding_balance canonical. 5. **Visibility** — pharmacy catalogue dashboard shows request statuses (⏳/✓/✗/⏸) and live balances via realtime; stockist Payments page tallies pending vs received-this-month.

### 19.5 Delivery-route day (stockist field workflow)
Quick Actions → Map Route: choose start address + pharmacies with undelivered orders → either "Open in Google Maps" (waypoint URL) or "Start Route with AI" → RouteExecution: `optimize-route` (Google Distance Matrix if key set, else random 5–20 km estimates) orders the stops; drag-drop reorder is cosmetic. Per stop: WhatsApp dispatch notification, per-order UPI payment links, cash/online/cheque collection recorded as approved route_collection confirmations with FIFO application, bulk mark-delivered. Nothing persists to route_executions/delivery_tracking.

### 19.6 Notices & recalls (admin → users)
Notice: admin composes with role/PIN/state/district/batch targeting → insert admin_notices → `distribute_notice_to_users` fan-out → stockist dashboards' NoticesPanel (realtime, read/dismiss per user). Recall: admin creates RCL record; `search_users_by_batch_code` identifies exposed stockists (products) and pharmacies (order history); notices with target_batch_codes can then reach affected stockists; Mark Resolved closes it. useAdminNotifications toasts other admins in-session.

### 19.7 Batch ordering cycle
BatchOrdering page → if no `status='collecting'` cycle, "Start New Cycle" → `create-batch-cycle` edge fn aggregates the stockist's pending+confirmed orders in the date range, stamps them with batch_cycle_id, and stores totals plus the modeled economics (delivery_cost = orders×₹12 vs individual ₹60 → cost_savings). No UI advances a cycle past 'collecting'.

## 20. USER JOURNEYS — WHAT EACH ROLE CAN SEE AND DO (consolidated)

- **Stockist** (richest role, 15 routes): daily loop = Dashboard KPIs/approvals/notices → create orders 6 ways (manual, quick-paste AI, quick bill, bill OCR, platform inbound, catalogue inbound) → manage catalogue (CRUD, OCR label scan, bulk CSV/XLSX/image import, AI enrichment) → collect money (approvals, custom payments, reminders via WhatsApp+UPI QR/links, route collections) → configure network (pharmacies CRUD, registration approvals, service-area PINs, delivery dates & fee rules, catalogue link sharing) → monitor (analytics charts, activity feed, exports, low-stock, top products, AI chat assistant with 6 live data tools). Can hard/soft-delete pharmacies, cancel orders (auto credit), toggle catalogue.
- **Pharmacy with login** (11 routes): dashboard inventory KPIs → browse catalogue-enabled stockists (PIN-served first) → per-stockist catalogue with MOQ-clamped carts → multi-stockist checkout (5% GST + computed delivery fee, COD/credit) → order history w/ dues → financials/analytics tiles → profile. Read-only inventory module. Payments happen out-of-band (or via the public catalogue if they know the flow).
- **Pharmacy without login (public catalogue)**: license+PIN verification (rate-limited) → balance dashboard (outstanding/credit/net, request history) → shop → per-item-GST checkout requiring stockist approval → UPI pay (this order / total outstanding / custom) → submit payment claims → 20-min inactivity logout.
- **Patient** (9 routes): dashboard KPIs (orders/prescriptions/wishlist/refills) → medicine search & price comparison (compare page broken by column mismatch) → prescription vault (image-only upload) → AI symptom checker (field-name mismatch limits rendering) → wishlist (view/remove) → orders (read-only history) → profile w/ addresses. **Cannot actually purchase** — checkout is a demo stub.
- **Brand** (6 routes, gated on is_verified which no UI sets): KPIs, product catalog (add-only), discount campaigns (create/draft only), analytics/fulfilment stat tiles with several hardcoded numbers, profile.
- **MR** (5 routes): visited-pharmacy list + record visit, commissions read-out vs hardcoded ₹50k target, conversion analytics, profile. Collection recording is demo-only.
- **Admin** (14 routes): platform user directory (status toggle audit-logged but not persisted), dual-approval registrations, document verification, recalls + batch impact search, dispute resolution, targeted notices, message-template CRUD (unused by any sender), territory reference data + service-area viewer, platform campaigns (Send Now just stamps status), fee definitions (never applied), stat-tile analytics (charts placeholder), audit log viewer, Settings "Manage" tab (app info + per-role announcement banners).
- **Anonymous**: login/signup, forgot/reset password, public pharmacy registration, per-stockist catalogue (post license check), 404/offline/not-authorized.

---

*Generated by reading src/App.tsx, all src/pages/**, src/components/** (dialogs/layouts/dashboards), contexts, hooks, stores, lib, public/ (PWA assets), supabase/functions/* (all 17), supabase/config.toml, .env, package.json, the full src/integrations/supabase/types.ts (51 tables + RPCs), and all ~80 supabase/migrations/*.sql (tables, triggers, functions, RLS policies, storage buckets).*

---

*Documentation audit pass appended below — code-derived additions only; prior content preserved.*

## EXPANSION — Code-Derived Additions (Audit Pass)

*Audit date: 2026-07-04. Content derived exclusively from source under `stockpharmaerp/`. Documents implemented behavior only.*

### E.1 Complete Route Table

**Frontend routes extracted:** 81 | **Server API routes:** 0

| # | Path | Component | Role/Gate | Source |
|---|------|-----------|-----------|--------|
| 1 | `/` | Login | — | `src/App.tsx` |
| 2 | `/login` | Login | — | `src/App.tsx` |
| 3 | `/forgot-password` | ForgotPassword | — | `src/App.tsx` |
| 4 | `/reset-password` | ResetPassword | — | `src/App.tsx` |
| 5 | `/role-selection` | ProtectedRoute | — | `src/App.tsx` |
| 6 | `/onboarding/stockist` | ProtectedRoute | — | `src/App.tsx` |
| 7 | `/onboarding/pharmacy` | ProtectedRoute | — | `src/App.tsx` |
| 8 | `/onboarding/patient` | ProtectedRoute | — | `src/App.tsx` |
| 9 | `/onboarding/brand` | ProtectedRoute | — | `src/App.tsx` |
| 10 | `/onboarding/mr` | ProtectedRoute | — | `src/App.tsx` |
| 11 | `/stockist/home` | ProtectedRoute | — | `src/App.tsx` |
| 12 | `/stockist/pharmacies` | ProtectedRoute | — | `src/App.tsx` |
| 13 | `/stockist/pharmacies/:pharmacyId` | ProtectedRoute | — | `src/App.tsx` |
| 14 | `/stockist/products` | ProtectedRoute | — | `src/App.tsx` |
| 15 | `/stockist/orders` | ProtectedRoute | — | `src/App.tsx` |
| 16 | `/stockist/orders/:orderId` | ProtectedRoute | — | `src/App.tsx` |
| 17 | `/stockist/order-creation` | ProtectedRoute | — | `src/App.tsx` |
| 18 | `/stockist/payments` | ProtectedRoute | — | `src/App.tsx` |
| 19 | `/stockist/payment-approvals` | ProtectedRoute | — | `src/App.tsx` |
| 20 | `/stockist/analytics` | ProtectedRoute | — | `src/App.tsx` |
| 21 | `/stockist/route-execution` | ProtectedRoute | — | `src/App.tsx` |
| 22 | `/stockist/pharmacy-approvals` | ProtectedRoute | — | `src/App.tsx` |
| 23 | `/stockist/batch-ordering` | ProtectedRoute | — | `src/App.tsx` |
| 24 | `/stockist/delivery-settings` | ProtectedRoute | — | `src/App.tsx` |
| 25 | `/pharmacy/portal` | ProtectedRoute | — | `src/App.tsx` |
| 26 | `/pharmacy/inventory` | ProtectedRoute | — | `src/App.tsx` |
| 27 | `/pharmacy/ordering` | ProtectedRoute | — | `src/App.tsx` |
| 28 | `/pharmacy/financials` | ProtectedRoute | — | `src/App.tsx` |
| 29 | `/pharmacy/analytics` | ProtectedRoute | — | `src/App.tsx` |
| 30 | `/pharmacy/stockists` | ProtectedRoute | — | `src/App.tsx` |
| 31 | `/pharmacy/stockists/:stockistId` | ProtectedRoute | — | `src/App.tsx` |
| 32 | `/pharmacy/cart` | ProtectedRoute | — | `src/App.tsx` |
| 33 | `/pharmacy/checkout` | ProtectedRoute | — | `src/App.tsx` |
| 34 | `/pharmacy/orders` | ProtectedRoute | — | `src/App.tsx` |
| 35 | `/patient/dashboard` | ProtectedRoute | — | `src/App.tsx` |
| 36 | `/patient/search` | ProtectedRoute | — | `src/App.tsx` |
| 37 | `/patient/checkout` | ProtectedRoute | — | `src/App.tsx` |
| 38 | `/patient/prescriptions` | ProtectedRoute | — | `src/App.tsx` |
| 39 | `/patient/compare` | ProtectedRoute | — | `src/App.tsx` |
| 40 | `/patient/ai-assistant` | ProtectedRoute | — | `src/App.tsx` |
| 41 | `/patient/wishlist` | ProtectedRoute | — | `src/App.tsx` |
| 42 | `/patient/orders` | ProtectedRoute | — | `src/App.tsx` |
| 43 | `/brand/dashboard` | ProtectedRoute | — | `src/App.tsx` |
| 44 | `/brand/products` | ProtectedRoute | — | `src/App.tsx` |
| 45 | `/brand/campaigns` | ProtectedRoute | — | `src/App.tsx` |
| 46 | `/brand/analytics` | ProtectedRoute | — | `src/App.tsx` |
| 47 | `/brand/fulfilment` | ProtectedRoute | — | `src/App.tsx` |
| 48 | `/mr/dashboard` | ProtectedRoute | — | `src/App.tsx` |
| 49 | `/mr/pharmacies` | ProtectedRoute | — | `src/App.tsx` |
| 50 | `/mr/collections` | ProtectedRoute | — | `src/App.tsx` |
| 51 | `/mr/analytics` | ProtectedRoute | — | `src/App.tsx` |
| 52 | `/stockist/profile` | ProtectedRoute | — | `src/App.tsx` |
| 53 | `/pharmacy/profile` | ProtectedRoute | — | `src/App.tsx` |
| 54 | `/patient/profile` | ProtectedRoute | — | `src/App.tsx` |
| 55 | `/brand/profile` | ProtectedRoute | — | `src/App.tsx` |
| 56 | `/mr/profile` | ProtectedRoute | — | `src/App.tsx` |
| 57 | `/support` | ProtectedRoute | — | `src/App.tsx` |
| 58 | `/settings` | ProtectedRoute | — | `src/App.tsx` |
| 59 | `/admin` | AdminRoute | — | `src/App.tsx` |
| 60 | `/admin/users` | AdminRoute | — | `src/App.tsx` |
| 61 | `/admin/recalls` | AdminRoute | — | `src/App.tsx` |
| 62 | `/admin/notices` | AdminRoute | — | `src/App.tsx` |
| 63 | `/admin/disputes` | AdminRoute | — | `src/App.tsx` |
| 64 | `/admin/analytics` | AdminRoute | — | `src/App.tsx` |
| 65 | `/admin/enhanced-analytics` | AdminRoute | — | `src/App.tsx` |
| 66 | `/admin/audit-logs` | AdminRoute | — | `src/App.tsx` |
| 67 | `/admin/fees` | AdminRoute | — | `src/App.tsx` |
| 68 | `/admin/documents` | AdminRoute | — | `src/App.tsx` |
| 69 | `/admin/templates` | AdminRoute | — | `src/App.tsx` |
| 70 | `/admin/territories` | AdminRoute | — | `src/App.tsx` |
| 71 | `/admin/campaigns` | AdminRoute | — | `src/App.tsx` |
| 72 | `/admin/pharmacy-approvals` | AdminRoute | — | `src/App.tsx` |
| 73 | `/catalogue/:stockist_slug` | LicenseVerification | — | `src/App.tsx` |
| 74 | `/catalogue/:stockist_slug/dashboard` | PharmacySessionProvider | — | `src/App.tsx` |
| 75 | `/catalogue/:stockist_slug/products` | PharmacySessionProvider | — | `src/App.tsx` |
| 76 | `/catalogue/:stockist_slug/orders` | PharmacySessionProvider | — | `src/App.tsx` |
| 77 | `/catalogue/:stockist_slug/checkout` | PharmacySessionProvider | — | `src/App.tsx` |
| 78 | `/pharmacy-registration` | PharmacyRegistration | — | `src/App.tsx` |
| 79 | `/not-authorized` | NotAuthorized | — | `src/App.tsx` |
| 80 | `/offline` | Offline | — | `src/App.tsx` |
| 81 | `/*` | NotFound | — | `src/App.tsx` |

### E.2 Entity / Table Catalog

**Tables/schemas found:** 64

#### `activity_log`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `activity_type` | `string` |
| `created_at` | `string | null` |
| `description` | `string` |
| `id` | `string` |
| `metadata` | `Json | null` |
| `stockist_id` | `string` |

#### `admin_notices`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `content` | `string` |
| `created_at` | `string | null` |
| `created_by` | `string` |
| `expires_at` | `string | null` |
| `id` | `string` |
| `is_active` | `boolean | null` |
| `notice_type` | `string` |
| `priority` | `string` |
| `target_batch_codes` | `string[] | null` |
| `target_districts` | `string[] | null` |
| `target_pin_codes` | `string[] | null` |
| `target_role` | `string | null` |
| `target_states` | `string[] | null` |
| `title` | `string` |

#### `analytics_events`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string | null` |
| `event_data` | `Json | null` |
| `event_type` | `string` |
| `id` | `string` |
| `page_url` | `string | null` |
| `user_id` | `string | null` |

#### `audit_logs`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `action` | `string` |
| `created_at` | `string` |
| `details` | `Json | null` |
| `entity_id` | `string` |
| `entity_type` | `string` |
| `id` | `string` |
| `ip_address` | `string | null` |
| `user_agent` | `string | null` |
| `user_id` | `string` |

#### `batch_delivery_rules`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string | null` |
| `delivery_day` | `string | null` |
| `id` | `string` |
| `is_active` | `boolean | null` |
| `max_payment_overdue_days` | `number | null` |
| `min_order_value` | `number | null` |
| `require_payment_clearance` | `boolean | null` |
| `stockist_id` | `string` |

#### `batch_recalls`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `affected_users_count` | `number | null` |
| `batch_number` | `string` |
| `cdsco_reference` | `string | null` |
| `created_at` | `string` |
| `id` | `string` |
| `initiated_by` | `string` |
| `instructions` | `string | null` |
| `manufacturer` | `string | null` |
| `product_name` | `string` |
| `recall_date` | `string` |
| `recall_number` | `string` |
| `recall_reason` | `string` |
| `severity` | `string` |
| `status` | `string` |
| `updated_at` | `string` |

#### `brand_batch_verification`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `batch_number` | `string` |
| `brand_id` | `string` |
| `created_at` | `string | null` |
| `expiry_date` | `string` |
| `id` | `string` |
| `is_verified` | `boolean | null` |
| `manufacturing_date` | `string` |
| `product_id` | `string` |
| `qr_code_url` | `string | null` |
| `quantity` | `number` |
| `verification_code` | `string` |

#### `brand_campaigns`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `actual_spend` | `number | null` |
| `brand_id` | `string` |
| `budget` | `number | null` |
| `campaign_name` | `string` |
| `campaign_type` | `string` |
| `created_at` | `string | null` |
| `description` | `string | null` |
| `discount_percentage` | `number | null` |
| `end_date` | `string` |
| `id` | `string` |
| `start_date` | `string` |
| `status` | `string | null` |
| `target_region` | `string[] | null` |

#### `brand_details`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `address` | `string | null` |
| `brand_name` | `string` |
| `company_name` | `string` |
| `contact_person` | `string | null` |
| `created_at` | `string | null` |
| `email` | `string | null` |
| `gstin` | `string | null` |
| `id` | `string` |
| `is_active` | `boolean | null` |
| `is_verified` | `boolean | null` |
| `manufacturing_license` | `string | null` |
| `phone` | `string | null` |
| `profile_id` | `string` |
| `updated_at` | `string | null` |

#### `brand_orders`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `brand_id` | `string` |
| `created_at` | `string | null` |
| `delivered_at` | `string | null` |
| `delivery_address_id` | `string | null` |
| `delivery_fee` | `number | null` |
| `id` | `string` |
| `items` | `Json` |
| `order_number` | `string` |
| `order_status` | `string | null` |
| `patient_id` | `string` |
| `payment_method` | `string | null` |
| `payment_status` | `string | null` |
| `pharmacy_commission` | `number` |
| `pharmacy_id` | `string` |
| `platform_fee` | `number` |
| `subtotal` | `number` |
| `total_amount` | `number` |

#### `brand_products`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `batch_number` | `string` |
| `brand_id` | `string` |
| `category` | `string | null` |
| `created_at` | `string | null` |
| `description` | `string | null` |
| `generic_name` | `string | null` |
| `id` | `string` |
| `image_url` | `string | null` |
| `is_active` | `boolean | null` |
| `manufacturer` | `string | null` |
| `mrp` | `number` |
| `prescription_required` | `boolean | null` |
| `product_name` | `string` |
| `selling_price` | `number` |
| `sku` | `string` |
| `stock_quantity` | `number | null` |
| `updated_at` | `string | null` |

#### `campaigns`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `actual_spend` | `number | null` |
| `budget` | `number | null` |
| `campaign_name` | `string` |
| `campaign_type` | `string` |
| `conversion_count` | `number | null` |
| `created_at` | `string` |
| `created_by` | `string` |
| `description` | `string | null` |
| `discount_percentage` | `number | null` |
| `end_date` | `string | null` |
| `id` | `string` |
| `reach_count` | `number | null` |
| `start_date` | `string` |
| `status` | `string` |
| `target_audience` | `string` |
| `terms_conditions` | `string | null` |
| `updated_at` | `string` |

#### `catalogue_rate_limits`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `action_type` | `string` |
| `attempt_count` | `number` |
| `created_at` | `string` |
| `id` | `string` |
| `identifier` | `string` |
| `last_attempt_at` | `string` |

#### `commission_ledger`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `commission_amount` | `number` |
| `commission_rate` | `number` |
| `commission_type` | `string` |
| `created_at` | `string | null` |
| `id` | `string` |
| `order_id` | `string | null` |
| `paid_at` | `string | null` |
| `payment_reference` | `string | null` |
| `status` | `string | null` |
| `user_id` | `string` |

#### `communication_log`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `id` | `string` |
| `message` | `string` |
| `pharmacy_id` | `string` |
| `sent_at` | `string | null` |
| `status` | `string` |
| `type` | `string` |

#### `delivery_tracking`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `collection_amount` | `number | null` |
| `created_at` | `string | null` |
| `delivered_at` | `string | null` |
| `id` | `string` |
| `notes` | `string | null` |
| `order_id` | `string` |
| `payment_mode` | `string | null` |
| `pharmacy_id` | `string` |
| `route_execution_id` | `string | null` |

#### `disputes`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `assigned_to` | `string | null` |
| `created_at` | `string` |
| `description` | `string` |
| `dispute_number` | `string` |
| `dispute_type` | `string` |
| `filed_by` | `string` |
| `id` | `string` |
| `order_id` | `string | null` |
| `pharmacy_id` | `string` |
| `priority` | `string` |
| `resolution` | `string | null` |
| `resolved_at` | `string | null` |
| `status` | `string` |
| `stockist_id` | `string` |
| `subject` | `string` |
| `updated_at` | `string` |

#### `invoices`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `amount` | `number` |
| `created_at` | `string | null` |
| `due_date` | `string` |
| `id` | `string` |
| `invoice_number` | `string` |
| `invoice_type` | `string` |
| `invoice_url` | `string | null` |
| `paid_at` | `string | null` |
| `status` | `string | null` |
| `tax_amount` | `number | null` |
| `total_amount` | `number` |
| `user_id` | `string` |

#### `loyalty_points`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string | null` |
| `id` | `string` |
| `points_balance` | `number | null` |
| `points_earned` | `number | null` |
| `points_redeemed` | `number | null` |
| `tier` | `string | null` |
| `updated_at` | `string | null` |
| `user_id` | `string` |

#### `loyalty_transactions`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string | null` |
| `description` | `string | null` |
| `id` | `string` |
| `order_id` | `string | null` |
| `points` | `number` |
| `transaction_type` | `string` |
| `user_id` | `string` |

#### `message_templates`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `category` | `string` |
| `content` | `string` |
| `created_at` | `string` |
| `id` | `string` |
| `is_active` | `boolean` |
| `subject` | `string | null` |
| `template_name` | `string` |
| `template_type` | `string` |
| `updated_at` | `string` |
| `variables` | `Json | null` |

#### `mr_details`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `account_holder_name` | `string | null` |
| `account_number` | `string | null` |
| `address` | `string | null` |
| `bank_name` | `string | null` |
| `business_hours` | `Json | null` |
| `catalogue_created_at` | `string | null` |
| `catalogue_enabled` | `boolean | null` |
| `catalogue_slug` | `string | null` |
| `company_name` | `string` |
| `created_at` | `string | null` |
| `default_credit_days` | `number | null` |
| `delivery_radius` | `number | null` |
| `gstin` | `string | null` |
| `id` | `string` |
| `ifsc_code` | `string | null` |
| `license_number` | `string` |
| `mr_name` | `string` |
| `phone` | `string | null` |
| `profile_id` | `string` |
| `updated_at` | `string | null` |
| `upi_id` | `string | null` |

#### `mr_order_commissions`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `commission_amount` | `number` |
| `commission_rate` | `number | null` |
| `created_at` | `string | null` |
| `id` | `string` |
| `mr_id` | `string` |
| `order_id` | `string | null` |
| `paid_at` | `string | null` |
| `pharmacy_id` | `string | null` |
| `status` | `string | null` |

#### `mr_pharmacy_visits`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string | null` |
| `id` | `string` |
| `mr_id` | `string` |
| `notes` | `string | null` |
| `order_placed` | `boolean | null` |
| `pharmacy_id` | `string` |
| `visit_date` | `string` |

#### `notification_preferences`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string | null` |
| `email_enabled` | `boolean | null` |
| `id` | `string` |
| `marketing_enabled` | `boolean | null` |
| `push_enabled` | `boolean | null` |
| `sms_enabled` | `boolean | null` |
| `updated_at` | `string | null` |
| `user_id` | `string` |
| `whatsapp_enabled` | `boolean | null` |

#### `notification_queue`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `channel` | `string` |
| `created_at` | `string | null` |
| `delivered_at` | `string | null` |
| `error_message` | `string | null` |
| `id` | `string` |
| `notification_type` | `string` |
| `recipient_email` | `string | null` |
| `recipient_phone` | `string | null` |
| `scheduled_at` | `string | null` |
| `sent_at` | `string | null` |
| `status` | `string | null` |
| `template_id` | `string | null` |
| `user_id` | `string` |
| `variables` | `Json | null` |

#### `order_batch_cycles`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `cost_savings` | `number | null` |
| `created_at` | `string | null` |
| `cycle_end_date` | `string` |
| `cycle_start_date` | `string` |
| `delivery_cost` | `number | null` |
| `delivery_date` | `string` |
| `id` | `string` |
| `status` | `string | null` |
| `stockist_id` | `string` |
| `total_orders` | `number | null` |
| `total_pharmacies` | `number | null` |
| `total_value` | `number | null` |

#### `order_items`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `batch_code` | `string | null` |
| `created_at` | `string | null` |
| `gst_percentage` | `number | null` |
| `id` | `string` |
| `order_id` | `string` |
| `product_description` | `string | null` |
| `product_name` | `string` |
| `quantity` | `number` |
| `tax_amount` | `number | null` |
| `total_price` | `number` |
| `unit_price` | `number` |

#### `orders`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `batch_cycle_id` | `string | null` |
| `bill_image_url` | `string | null` |
| `bill_number` | `string | null` |
| `created_at` | `string | null` |
| `delivery_address` | `string | null` |
| `delivery_date` | `string | null` |
| `delivery_status` | `string` |
| `discount_amount` | `number | null` |
| `id` | `string` |
| `net_amount` | `number` |
| `notes` | `string | null` |
| `order_number` | `string` |
| `order_source` | `string` |
| `paid_amount` | `number | null` |
| `payment_due_date` | `string | null` |
| `payment_mode` | `string | null` |
| `payment_status` | `string` |
| `pharmacy_id` | `string` |
| `status` | `string` |
| `stockist_id` | `string` |
| `tax_amount` | `number | null` |
| `total_amount` | `number` |
| `updated_at` | `string | null` |

#### `patient_addresses`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `address_line` | `string` |
| `address_type` | `string | null` |
| `city` | `string` |
| `created_at` | `string | null` |
| `id` | `string` |
| `is_default` | `boolean | null` |
| `landmark` | `string | null` |
| `latitude` | `number | null` |
| `longitude` | `number | null` |
| `patient_id` | `string` |
| `pin_code` | `string` |
| `state` | `string` |

#### `patient_details`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `allergies` | `string[] | null` |
| `blood_group` | `string | null` |
| `created_at` | `string | null` |
| `date_of_birth` | `string | null` |
| `emergency_contact_name` | `string | null` |
| `emergency_contact_phone` | `string | null` |
| `gender` | `string | null` |
| `id` | `string` |
| `is_active` | `boolean | null` |
| `medical_conditions` | `string[] | null` |
| `patient_name` | `string` |
| `phone` | `string` |
| `profile_id` | `string` |
| `updated_at` | `string | null` |

#### `patient_order_tracking`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string | null` |
| `id` | `string` |
| `latitude` | `number | null` |
| `longitude` | `number | null` |
| `message` | `string | null` |
| `patient_order_id` | `string` |
| `status` | `string` |

#### `patient_orders`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string | null` |
| `delivered_at` | `string | null` |
| `delivery_address_id` | `string | null` |
| `delivery_fee` | `number | null` |
| `delivery_slot` | `string | null` |
| `discount_amount` | `number | null` |
| `id` | `string` |
| `items` | `Json` |
| `notes` | `string | null` |
| `order_number` | `string` |
| `order_status` | `string | null` |
| `patient_id` | `string` |
| `payment_method` | `string | null` |
| `payment_status` | `string | null` |
| `pharmacy_id` | `string` |
| `platform_fee` | `number | null` |
| `prescription_id` | `string | null` |
| `subtotal` | `number` |
| `total_amount` | `number` |
| `updated_at` | `string | null` |

#### `patient_prescriptions`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `clinic_name` | `string | null` |
| `created_at` | `string | null` |
| `diagnosis` | `string | null` |
| `doctor_name` | `string | null` |
| `id` | `string` |
| `is_active` | `boolean | null` |
| `medicines` | `Json | null` |
| `notes` | `string | null` |
| `patient_id` | `string` |
| `prescription_date` | `string | null` |
| `prescription_image_url` | `string` |
| `validity_days` | `number | null` |

#### `patient_refill_reminders`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string | null` |
| `frequency_days` | `number` |
| `id` | `string` |
| `is_active` | `boolean | null` |
| `last_refill_date` | `string` |
| `medicine_name` | `string` |
| `next_refill_date` | `string` |
| `patient_id` | `string` |

#### `patient_wishlist`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string | null` |
| `id` | `string` |
| `patient_id` | `string` |
| `product_id` | `string` |
| `product_name` | `string` |
| `product_price` | `number | null` |
| `stockist_id` | `string | null` |

#### `payment_confirmations`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `amount` | `number` |
| `created_at` | `string` |
| `id` | `string` |
| `order_id` | `string | null` |
| `payment_method` | `string | null` |
| `payment_proof_url` | `string | null` |
| `payment_type` | `string` |
| `pharmacy_id` | `string` |
| `pharmacy_notes` | `string | null` |
| `processed_at` | `string | null` |
| `processed_by` | `string | null` |
| `status` | `string` |
| `stockist_id` | `string` |
| `stockist_notes` | `string | null` |

#### `payment_reminders`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `amount` | `number` |
| `auto_reminder_enabled` | `boolean | null` |
| `created_at` | `string | null` |
| `id` | `string` |
| `message` | `string | null` |
| `order_id` | `string | null` |
| `pharmacy_id` | `string` |
| `reminder_date` | `string` |
| `scheduled_date` | `string | null` |
| `sent_at` | `string | null` |
| `status` | `string` |
| `stockist_id` | `string | null` |

#### `pharmacy_details`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `address` | `string | null` |
| `area` | `string | null` |
| `auth_profile_id` | `string | null` |
| `created_at` | `string` |
| `credit_balance` | `number | null` |
| `credit_limit` | `number | null` |
| `email` | `string | null` |
| `google_maps_name` | `string | null` |
| `gst_number` | `string` |
| `id` | `string` |
| `is_active` | `boolean | null` |
| `last_order_date` | `string | null` |
| `latitude` | `number | null` |
| `license_number` | `string | null` |
| `location_coordinates` | `string | null` |
| `longitude` | `number | null` |
| `outstanding_balance` | `number | null` |
| `owner_name` | `string | null` |
| `pharmacy_name` | `string` |
| `phone` | `string | null` |
| `pin_code` | `string | null` |
| `profile_id` | `string | null` |
| `total_orders` | `number | null` |
| `total_revenue` | `number | null` |
| `updated_at` | `string` |
| `whatsapp_number` | `string | null` |

#### `pharmacy_documents`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `document_number` | `string | null` |
| `document_type` | `string` |
| `document_url` | `string` |
| `expiry_date` | `string | null` |
| `id` | `string` |
| `issue_date` | `string | null` |
| `notes` | `string | null` |
| `pharmacy_id` | `string` |
| `rejection_reason` | `string | null` |
| `status` | `string` |
| `updated_at` | `string` |
| `verified_at` | `string | null` |
| `verified_by` | `string | null` |

#### `pharmacy_expiry_alerts`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `acknowledged_at` | `string | null` |
| `alert_days_before` | `number` |
| `batch_number` | `string | null` |
| `created_at` | `string | null` |
| `expiry_date` | `string` |
| `id` | `string` |
| `inventory_id` | `string` |
| `pharmacy_id` | `string` |
| `product_name` | `string` |
| `quantity` | `number` |
| `status` | `string | null` |

#### `pharmacy_inventory`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `batch_number` | `string | null` |
| `category` | `string | null` |
| `created_at` | `string | null` |
| `expiry_date` | `string | null` |
| `generic_name` | `string | null` |
| `gst_percentage` | `number | null` |
| `hsn_code` | `string | null` |
| `id` | `string` |
| `low_stock_threshold` | `number | null` |
| `manufacturer` | `string | null` |
| `mrp` | `number | null` |
| `pack_size` | `string | null` |
| `pharmacy_id` | `string` |
| `product_name` | `string` |
| `purchase_date` | `string | null` |
| `quantity` | `number` |
| `sale_price` | `number | null` |
| `stockist_id` | `string | null` |
| `unit_price` | `number | null` |
| `updated_at` | `string | null` |

#### `pharmacy_registration_requests`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `address` | `string` |
| `admin_approved` | `boolean | null` |
| `admin_approved_at` | `string | null` |
| `admin_approved_by` | `string | null` |
| `area` | `string | null` |
| `created_at` | `string | null` |
| `drug_license_url` | `string | null` |
| `email` | `string | null` |
| `google_maps_name` | `string | null` |
| `gst_certificate_url` | `string | null` |
| `gst_number` | `string` |
| `id` | `string` |
| `license_number` | `string` |
| `location_coordinates` | `string | null` |
| `other_documents_url` | `string | null` |
| `owner_name` | `string` |
| `pharmacy_name` | `string` |
| `phone` | `string` |
| `pin_code` | `string` |
| `rejection_reason` | `string | null` |
| `status` | `string` |
| `stockist_approved` | `boolean | null` |
| `stockist_approved_at` | `string | null` |
| `stockist_approved_by` | `string | null` |
| `stockist_id` | `string | null` |
| `updated_at` | `string | null` |
| `whatsapp_number` | `string | null` |

#### `pharmacy_stockist_connections`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string | null` |
| `credit_limit` | `number | null` |
| `id` | `string` |
| `is_active` | `boolean | null` |
| `last_order_date` | `string | null` |
| `outstanding_balance` | `number | null` |
| `pharmacy_id` | `string` |
| `stockist_id` | `string` |
| `updated_at` | `string | null` |

#### `platform_fees`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `applies_to` | `string` |
| `calculation_method` | `string` |
| `created_at` | `string` |
| `effective_from` | `string` |
| `effective_to` | `string | null` |
| `fee_name` | `string` |
| `fee_type` | `string` |
| `fee_value` | `number` |
| `id` | `string` |
| `is_active` | `boolean` |
| `max_amount` | `number | null` |
| `min_amount` | `number | null` |
| `updated_at` | `string` |

#### `platform_settings`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string | null` |
| `id` | `string` |
| `is_active` | `boolean | null` |
| `setting_key` | `string` |
| `setting_value` | `Json` |
| `target_role` | `string | null` |
| `updated_at` | `string | null` |

#### `product_batches`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `batch_number` | `string` |
| `created_at` | `string | null` |
| `expiry_date` | `string` |
| `id` | `string` |
| `manufacturing_date` | `string | null` |
| `product_id` | `string` |
| `quantity` | `number` |
| `updated_at` | `string | null` |

#### `products`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `batch_code` | `string | null` |
| `brand` | `string | null` |
| `category` | `string | null` |
| `created_at` | `string | null` |
| `description` | `string | null` |
| `generic_name` | `string | null` |
| `gst_percentage` | `number | null` |
| `hsn_code` | `string | null` |
| `id` | `string` |
| `image_url` | `string | null` |
| `is_active` | `boolean | null` |
| `manufacturer` | `string | null` |
| `min_stock_threshold` | `number | null` |
| `moq` | `number | null` |
| `mrp` | `number | null` |
| `name` | `string` |
| `pack_size` | `string | null` |
| `purchase_price` | `number | null` |
| `sale_price` | `number | null` |
| `stock_quantity` | `number | null` |
| `stockist_id` | `string` |
| `strength` | `string | null` |
| `type` | `string | null` |
| `updated_at` | `string | null` |

#### `profiles`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `email` | `string` |
| `id` | `string` |
| `updated_at` | `string` |

#### `ratings_reviews`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string | null` |
| `entity_id` | `string` |
| `entity_type` | `string` |
| `id` | `string` |
| `is_active` | `boolean | null` |
| `is_verified_purchase` | `boolean | null` |
| `rating` | `number` |
| `review_text` | `string | null` |
| `user_id` | `string` |

#### `referrals`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `completed_at` | `string | null` |
| `created_at` | `string | null` |
| `id` | `string` |
| `referee_id` | `string | null` |
| `referral_code` | `string` |
| `referrer_id` | `string` |
| `reward_amount` | `number | null` |
| `status` | `string | null` |

#### `route_executions`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `completed_at` | `string | null` |
| `created_at` | `string | null` |
| `id` | `string` |
| `optimized_order` | `string[]` |
| `pharmacy_ids` | `string[]` |
| `started_at` | `string | null` |
| `starting_address` | `string` |
| `status` | `string | null` |
| `stockist_id` | `string` |
| `total_distance` | `number | null` |

#### `search_history`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string | null` |
| `id` | `string` |
| `results_count` | `number | null` |
| `search_query` | `string` |
| `search_type` | `string | null` |
| `user_id` | `string | null` |

#### `stockist_delivery_dates`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string | null` |
| `delivery_date` | `string` |
| `id` | `string` |
| `is_active` | `boolean | null` |
| `notes` | `string | null` |
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
| `rule_name` | `string | null` |
| `rule_type` | `string` |
| `stockist_id` | `string` |

#### `stockist_details`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `account_holder_name` | `string | null` |
| `account_number` | `string | null` |
| `address` | `string | null` |
| `bank_name` | `string | null` |
| `business_hours` | `Json | null` |
| `catalogue_created_at` | `string | null` |
| `catalogue_enabled` | `boolean | null` |
| `catalogue_slug` | `string | null` |
| `company_name` | `string` |
| `created_at` | `string` |
| `default_credit_days` | `number | null` |
| `default_margin_percent` | `number | null` |
| `delivery_radius` | `number | null` |
| `dispatch_latitude` | `number | null` |
| `dispatch_longitude` | `number | null` |
| `dispatch_place_name` | `string | null` |
| `gstin` | `string | null` |
| `id` | `string` |
| `ifsc_code` | `string | null` |
| `license_number` | `string` |
| `phone` | `string | null` |
| `profile_id` | `string` |
| `stockist_name` | `string` |
| `updated_at` | `string` |
| `upi_id` | `string | null` |

#### `stockist_service_areas`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `area_name` | `string | null` |
| `created_at` | `string` |
| `district` | `string | null` |
| `id` | `string` |
| `is_active` | `boolean` |
| `pin_code` | `string` |
| `state` | `string | null` |
| `stockist_id` | `string` |
| `updated_at` | `string` |

#### `subscription_plans`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `billing_cycle` | `string | null` |
| `created_at` | `string | null` |
| `features` | `Json` |
| `id` | `string` |
| `is_active` | `boolean | null` |
| `max_orders_per_month` | `number | null` |
| `max_pharmacies` | `number | null` |
| `max_products` | `number | null` |
| `plan_name` | `string` |
| `price` | `number` |
| `user_type` | `string` |

#### `support_tickets`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `category` | `string` |
| `created_at` | `string` |
| `description` | `string` |
| `id` | `string` |
| `priority` | `string` |
| `status` | `string` |
| `subject` | `string` |
| `updated_at` | `string` |
| `user_id` | `string` |

#### `territories`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `districts` | `string[] | null` |
| `id` | `string` |
| `is_active` | `boolean` |
| `pin_codes` | `string[] | null` |
| `state` | `string` |
| `territory_manager` | `string | null` |
| `territory_name` | `string` |
| `updated_at` | `string` |

#### `user_notice_recipients`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string | null` |
| `dismissed_at` | `string | null` |
| `id` | `string` |
| `notice_id` | `string` |
| `read_at` | `string | null` |
| `user_id` | `string` |

#### `user_roles`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string | null` |
| `id` | `string` |
| `role` | `Database["public"]["Enums"]["app_role"]` |
| `user_id` | `string` |

#### `user_subscriptions`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `auto_renew` | `boolean | null` |
| `created_at` | `string | null` |
| `end_date` | `string` |
| `id` | `string` |
| `last_payment_date` | `string | null` |
| `next_payment_date` | `string | null` |
| `payment_method` | `string | null` |
| `plan_id` | `string` |
| `start_date` | `string` |
| `status` | `string | null` |
| `user_id` | `string` |

#### `wishlist`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string | null` |
| `id` | `string` |
| `product_id` | `string` |
| `product_type` | `string` |
| `user_id` | `string` |

### E.3 API / Backend Surface

#### Supabase Edge Functions

| Function | Lines | CORS | Auth Pattern | Notes |
|----------|-------|------|--------------|-------|
| `ai-symptom-checker` | 44 | yes | service-role/user | — |
| `approve-reject-payment` | 289 | yes | service-role/user | — |
| `calculate-delivery-fee` | 227 | yes | public | — |
| `chat-assistant` | 891 | yes | service-role/user | — |
| `create-batch-cycle` | 64 | yes | public | — |
| `create-platform-order` | 183 | yes | public | — |
| `extract-bill-items` | 197 | yes | service-role/user | — |
| `extract-prescription` | 45 | yes | service-role/user | — |
| `extract-product-label` | 168 | yes | service-role/user | — |
| `fetch-product-info` | 115 | yes | service-role/user | — |
| `get-pharmacy-outstanding-orders` | 91 | yes | public | — |
| `mark-payment-paid` | 87 | yes | public | — |
| `optimize-route` | 232 | yes | service-role/user | — |
| `parse-order-message` | 211 | yes | service-role/user | — |
| `process-bill-image` | 365 | yes | service-role/user | — |
| `reduce-stock-for-order` | 220 | yes | public | — |
| `verify-pharmacy-license` | 240 | yes | public | — |

### E.4 Auth, Roles, and Permissions

#### Roles referenced in code

- `admin`
- `alert`
- `assistant`
- `brand`
- `group`
- `link`
- `mr`
- `navigation`
- `patient`
- `pharmacy`
- `presentation`
- `region`
- `separator`
- `stockist`
- `system`
- `tool`
- `user`

#### RLS / Policy snippets (from migrations)

- Policy `Users can view their own profile` on `public` *(migration `20251108161608_c95bba3c-61d3-47e1-ba92-099499bfab90.sql`)*
- Policy `Users can update their own profile` on `public` *(migration `20251108161608_c95bba3c-61d3-47e1-ba92-099499bfab90.sql`)*
- Policy `Users can insert their own profile` on `public` *(migration `20251108161608_c95bba3c-61d3-47e1-ba92-099499bfab90.sql`)*
- Policy `Users can view their own stockist details` on `public` *(migration `20251108161608_c95bba3c-61d3-47e1-ba92-099499bfab90.sql`)*
- Policy `Users can insert their own stockist details` on `public` *(migration `20251108161608_c95bba3c-61d3-47e1-ba92-099499bfab90.sql`)*
- Policy `Users can update their own stockist details` on `public` *(migration `20251108161608_c95bba3c-61d3-47e1-ba92-099499bfab90.sql`)*
- Policy `Users can view their own pharmacy details` on `public` *(migration `20251108161608_c95bba3c-61d3-47e1-ba92-099499bfab90.sql`)*
- Policy `Users can insert their own pharmacy details` on `public` *(migration `20251108161608_c95bba3c-61d3-47e1-ba92-099499bfab90.sql`)*
- Policy `Users can update their own pharmacy details` on `public` *(migration `20251108161608_c95bba3c-61d3-47e1-ba92-099499bfab90.sql`)*
- Policy `Users can view their own roles` on `public` *(migration `20251108163342_b4f8d61e-fa1a-487c-ad3f-8a70ec7b90d3.sql`)*
- Policy `Users can insert their own roles during signup` on `public` *(migration `20251108163342_b4f8d61e-fa1a-487c-ad3f-8a70ec7b90d3.sql`)*
- Policy `Stockists can view their own orders` on `public` *(migration `20251108163342_b4f8d61e-fa1a-487c-ad3f-8a70ec7b90d3.sql`)*
- Policy `Stockists can insert their own orders` on `public` *(migration `20251108163342_b4f8d61e-fa1a-487c-ad3f-8a70ec7b90d3.sql`)*
- Policy `Stockists can update their own orders` on `public` *(migration `20251108163342_b4f8d61e-fa1a-487c-ad3f-8a70ec7b90d3.sql`)*
- Policy `Stockists can view their order items` on `public` *(migration `20251108163342_b4f8d61e-fa1a-487c-ad3f-8a70ec7b90d3.sql`)*
- Policy `Stockists can manage their order items` on `public` *(migration `20251108163342_b4f8d61e-fa1a-487c-ad3f-8a70ec7b90d3.sql`)*
- Policy `Stockists can view their own activity` on `public` *(migration `20251108163342_b4f8d61e-fa1a-487c-ad3f-8a70ec7b90d3.sql`)*
- Policy `Stockists can insert their own activity` on `public` *(migration `20251108163342_b4f8d61e-fa1a-487c-ad3f-8a70ec7b90d3.sql`)*
- Policy `Stockists can view their products` on `public` *(migration `20251108164548_5571c10a-e83d-4591-a8de-0c619e3054b5.sql`)*
- Policy `Stockists can manage their products` on `public` *(migration `20251108164548_5571c10a-e83d-4591-a8de-0c619e3054b5.sql`)*
- Policy `Stockists can manage their product batches` on `public` *(migration `20251108164548_5571c10a-e83d-4591-a8de-0c619e3054b5.sql`)*
- Policy `Stockists can manage payment reminders` on `public` *(migration `20251108164548_5571c10a-e83d-4591-a8de-0c619e3054b5.sql`)*
- Policy `Stockists can view communication logs` on `public` *(migration `20251108164548_5571c10a-e83d-4591-a8de-0c619e3054b5.sql`)*
- Policy `Stockists can create communication logs` on `public` *(migration `20251108164548_5571c10a-e83d-4591-a8de-0c619e3054b5.sql`)*
- Policy `Product images are publicly accessible` on `storage` *(migration `20251108171821_2b8e8640-7229-4494-8181-f38ae32d9678.sql`)*
- Policy `Stockists can upload product images` on `storage` *(migration `20251108171821_2b8e8640-7229-4494-8181-f38ae32d9678.sql`)*
- Policy `Stockists can update product images` on `storage` *(migration `20251108171821_2b8e8640-7229-4494-8181-f38ae32d9678.sql`)*
- Policy `Stockists can delete product images` on `storage` *(migration `20251108171821_2b8e8640-7229-4494-8181-f38ae32d9678.sql`)*
- Policy `Stockists can upload their own bills` on `storage` *(migration `20251109053255_75c3578e-696d-4156-ba63-083453f28993.sql`)*
- Policy `Stockists can view their own bills` on `storage` *(migration `20251109053255_75c3578e-696d-4156-ba63-083453f28993.sql`)*
- Policy `Stockists can delete their own bills` on `storage` *(migration `20251109053255_75c3578e-696d-4156-ba63-083453f28993.sql`)*
- Policy `Stockists manage own routes` on `route_executions` *(migration `20251109092307_e02709e3-5a86-4ab7-af41-b6fc14789210.sql`)*
- Policy `Stockists manage own tracking` on `delivery_tracking` *(migration `20251109092307_e02709e3-5a86-4ab7-af41-b6fc14789210.sql`)*
- Policy `Stockists can insert their details` on `stockist_details` *(migration `20251109113512_a2bbf8cc-e1a1-4127-ae43-987df11ebc4c.sql`)*
- Policy `Stockists can view their details` on `stockist_details` *(migration `20251109113512_a2bbf8cc-e1a1-4127-ae43-987df11ebc4c.sql`)*
- Policy `Stockists can update their details` on `stockist_details` *(migration `20251109113512_a2bbf8cc-e1a1-4127-ae43-987df11ebc4c.sql`)*
- Policy `Stockists can view their pharmacies` on `pharmacy_details` *(migration `20251109113512_a2bbf8cc-e1a1-4127-ae43-987df11ebc4c.sql`)*
- Policy `Stockists can manage their pharmacies` on `pharmacy_details` *(migration `20251109113512_a2bbf8cc-e1a1-4127-ae43-987df11ebc4c.sql`)*
- Policy `Stockists manage their pharmacy reminders` on `payment_reminders` *(migration `20251109113512_a2bbf8cc-e1a1-4127-ae43-987df11ebc4c.sql`)*
- Policy `Stockists can view their pharmacy payment confirmations` on `public` *(migration `20251109131754_fa091de6-b5fd-4a1a-b0cf-8c79e5d01eeb.sql`)*
- Policy `Stockists can update their pharmacy payment confirmations` on `public` *(migration `20251109131754_fa091de6-b5fd-4a1a-b0cf-8c79e5d01eeb.sql`)*
- Policy `Anonymous can create payment confirmations` on `public` *(migration `20251109131754_fa091de6-b5fd-4a1a-b0cf-8c79e5d01eeb.sql`)*
- Policy `Public can view catalogue products` on `public` *(migration `20251109131754_fa091de6-b5fd-4a1a-b0cf-8c79e5d01eeb.sql`)*
- Policy `Public can verify pharmacy by license` on `public` *(migration `20251109131754_fa091de6-b5fd-4a1a-b0cf-8c79e5d01eeb.sql`)*
- Policy `Public can view catalogue-enabled stockists` on `public` *(migration `20251109131754_fa091de6-b5fd-4a1a-b0cf-8c79e5d01eeb.sql`)*
- Policy `Public can view orders via license verification` on `public` *(migration `20251109131754_fa091de6-b5fd-4a1a-b0cf-8c79e5d01eeb.sql`)*
- Policy `Stockists can view their pharmacies` on `pharmacy_details` *(migration `20251110075744_e7c2c0c0-c040-4937-8d4f-911ab5c9f669.sql`)*
- Policy `Stockists can manage their pharmacies` on `pharmacy_details` *(migration `20251110075744_e7c2c0c0-c040-4937-8d4f-911ab5c9f669.sql`)*
- Policy `Public can verify pharmacy by license` on `pharmacy_details` *(migration `20251110075744_e7c2c0c0-c040-4937-8d4f-911ab5c9f669.sql`)*
- Policy `Authenticated users can create payment confirmations` on `public` *(migration `20251110102904_fe197fb2-2ed3-401d-8860-dfaf1bf4473b.sql`)*
- Policy `Service role can manage rate limits` on `public` *(migration `20251112123800_0415c841-5191-4731-a7d9-21717595cd84.sql`)*
- Policy `Admins manage disputes` on `public` *(migration `20251118101841_c8465b28-9a35-443a-98f6-8509541a5ef4.sql`)*
- Policy `Stockists view disputes` on `public` *(migration `20251118101841_c8465b28-9a35-443a-98f6-8509541a5ef4.sql`)*
- Policy `Admins manage documents` on `public` *(migration `20251118101841_c8465b28-9a35-443a-98f6-8509541a5ef4.sql`)*
- Policy `Admins manage recalls` on `public` *(migration `20251118101841_c8465b28-9a35-443a-98f6-8509541a5ef4.sql`)*
- Policy `All view active recalls` on `public` *(migration `20251118101841_c8465b28-9a35-443a-98f6-8509541a5ef4.sql`)*
- Policy `Admins view audit logs` on `public` *(migration `20251118101841_c8465b28-9a35-443a-98f6-8509541a5ef4.sql`)*
- Policy `Admins manage fees` on `public` *(migration `20251118101841_c8465b28-9a35-443a-98f6-8509541a5ef4.sql`)*
- Policy `All view active fees` on `public` *(migration `20251118101841_c8465b28-9a35-443a-98f6-8509541a5ef4.sql`)*
- Policy `Admins manage templates` on `public` *(migration `20251118101841_c8465b28-9a35-443a-98f6-8509541a5ef4.sql`)*
- *… plus 123 additional policies*

### E.5 Workflows and State Machines

#### `applies_to` values observed in code

`both` → `pharmacy` → `stockist`

#### `calculation_method` values observed in code

`fixed` → `percentage` → `tiered`

#### `campaign_type` values observed in code

`announcement` → `discount` → `promotion` → `referral`

#### `category` values observed in code

`general` → `marketing` → `order` → `payment` → `recall`

#### `delivery_status` values observed in code

`cancelled` → `confirmed` → `delivered` → `out_for_delivery` → `packed` → `pending`

#### `dispute_type` values observed in code

`delivery` → `order` → `other` → `payment` → `quality`

#### `document_type` values observed in code

`drug_license` → `fssai` → `gst` → `incorporation` → `license` → `other`

#### `fee_type` values observed in code

`commission` → `listing` → `subscription` → `transaction`

#### `payment_status` values observed in code

`paid` → `partial` → `unpaid`

#### `payment_type` values observed in code

`custom_amount` → `full_outstanding` → `specific_order`

#### `priority` values observed in code

`high` → `low` → `medium` → `urgent`

#### `rule_type` values observed in code

`delivery_date` → `distance` → `flat_fee` → `order_amount` → `profit_amount`

#### `severity` values observed in code

`critical` → `high` → `low` → `medium`

#### `status` values observed in code

`active` → `approved` → `cancelled` → `closed` → `completed` → `confirmed` → `draft` → `error` → `exact` → `expired` → `found` → `in_progress` → `new` → `not_found` → `open` → `paid` → `partial` → `paused` → `pending` → `rejected` → `resolved` → `scheduled` → `searching` → `sent` → `unpaid` → `verified`

#### `target_audience` values observed in code

`all` → `pharmacy` → `stockist`

#### `template_type` values observed in code

`email` → `notification` → `sms` → `whatsapp`

#### Documented transition handlers (edge functions / server)

- **`approve-reject-payment`**: touches statuses `paid`
- **`create-platform-order`**: touches statuses `confirmed`, `pending`, `unpaid`
- **`mark-payment-paid`**: touches statuses `pending`
- **`process-bill-image`**: touches statuses `confirmed`, `pending`, `unpaid`

### E.6 Dashboards, Reports, and Formulas

**Formula/calculation lines extracted:** 175

#### `src/components/dashboard/BillUploadDialog.tsx`

- L53: `const [processingStage, setProcessingStage] = useState("");`
- L179: `const total = data.items.reduce((sum: number, item: ScannedItem) =>`
- L349: `<span className="text-muted-foreground">{processingStage}</span>`
- L468: `<TableHead className="text-right">Total</TableHead>`
- L486: `<span className="text-sm font-medium">Total Amount:</span>`

#### `src/components/dashboard/BulkUploadDialog.tsx`

- L42: `const [processingStage, setProcessingStage] = useState("");`
- L621: `const csvContent = `product_name,brand,manufacturer,category,type,mrp,purchase_price,stock_quantity,pack_size,strength,gst_percentage,hsn_code,moq,gen`
- L744: `<span className="text-sm">{processingStage}</span>`

#### `src/components/dashboard/EditOrderDialog.tsx`

- L59: `const [deliveryFee, setDeliveryFee] = useState<number>(0);`
- L60: `const [instantDeliveryFee, setInstantDeliveryFee] = useState<number>(0);`
- L184: `const calculateSubtotal = () => {`
- L185: `return orderItems.reduce((sum, item) => sum + item.total_price, 0);`
- L188: `const calculateTotal = () => {`
- L189: `return calculateSubtotal() - discountAmount + deliveryFee + instantDeliveryFee;`
- L205: `const totalAmount = calculateTotal();`
- L349: `<TableCell colSpan={3} className="text-right font-medium">Subtotal:</TableCell>`
- L350: `<TableCell className="font-medium">₹{calculateSubtotal().toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>`
- L375: `onChange={(e) => setDeliveryFee(parseFloat(e.target.value) || 0)}`
- L384: `value={instantDeliveryFee}`
- L385: `onChange={(e) => setInstantDeliveryFee(parseFloat(e.target.value) || 0)}`
- L403: `<span className="text-lg font-bold">Total Amount:</span>`

#### `src/components/dashboard/KPICards.tsx`

- L15: `onKPIClick?: (type: "revenue" | "pending" | "credits" | "pharmacies" | "orders") => void;`
- L18: `const KPICards = ({ stats, loading = false, onKPIClick }: KPICardsProps) => {`
- L73: `onClick={() => onKPIClick?.(kpi.type)}`
- L76: `<CardTitle className="text-sm md:text-base font-medium">{kpi.title}</CardTitle>`
- L77: `<kpi.icon className={`h-5 w-5 md:h-6 md:w-6 ${kpi.color}`} />`
- L80: `<div className="text-2xl md:text-3xl font-bold">{kpi.value}</div>`
- L82: `<p className="text-xs md:text-sm text-muted-foreground">{kpi.description}</p>`

#### `src/components/dashboard/KPIDetailDialog.tsx`

- L14: `const KPIDetailDialog = ({ open, onOpenChange, title, data, type }: KPIDetailDialogProps) => {`
- L31: `<p className="text-lg font-bold">₹{Number(order.total_amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>`

#### `src/components/dashboard/MapRouteDialog.tsx`

- L253: `<DialogTitle className="text-lg md:text-xl">Plan Delivery Route</DialogTitle>`
- L356: `const totalRounded = Math.round(order.total_amount);`
- L372: `<span className="font-semibold text-sm md:text-xs">₹{totalRounded.toLocaleString()}</span>`

#### `src/components/dashboard/QuickActions.tsx`

- L83: `onClick: () => navigate("/stockist/delivery-settings"),`

#### `src/components/dashboard/QuickBillDialog.tsx`

- L54: `const [taxRate, setTaxRate] = useState<5 | 12>(12);`
- L65: `const balance = orders?.reduce((sum, o) =>`
- L140: `const calculateTotal = () => {`
- L141: `return billItems.reduce((sum, item) => sum + item.total_price, 0);`
- L161: `const totalAmount = calculateTotal();`
- L318: `<TableCell colSpan={3} className="font-bold text-right">Total:</TableCell>`
- L319: `<TableCell className="font-bold">₹{calculateTotal().toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>`

#### `src/components/dashboard/QuickOrderDialog.tsx`

- L59: `const [taxRate, setTaxRate] = useState<5 | 12>(12);`
- L72: `const balance = orders?.reduce((sum, o) =>`
- L186: `const itemTotal = unitPrice * item.quantity;`
- L187: `const itemTax = itemTotal * (taxRate / 100);`
- L188: `totalAmount += itemTotal;`
- L189: `taxAmount += itemTax;`
- L202: `const netAmount = totalAmount + taxAmount;`
- L322: `const calculateTotals = () => {`
- L327: `subtotal += product.sale_price * item.quantity;`
- L330: `const tax = subtotal * (taxRate / 100);`
- L331: `return { subtotal, tax, total: subtotal + tax };`
- L334: `const totals = calculateTotals();`
- L430: `const lineTotal = unitPrice * item.quantity;`
- L539: `<span className="text-primary">₹{totals.total.toLocaleString('en-IN')}</span>`

#### `src/components/dashboard/RecentOrders.tsx`

- L93: `<p className="font-bold">₹{Number(order.total_amount).toLocaleString()}</p>`

#### `src/components/dashboard/TopProducts.tsx`

- L38: `const aggregated: Record<string, { total_quantity: number; total_revenue: number }> = {};`
- L42: `aggregated[item.product_name] = { total_quantity: 0, total_revenue: 0 };`
- L44: `aggregated[item.product_name].total_quantity += item.quantity;`
- L45: `aggregated[item.product_name].total_revenue += parseFloat(item.total_price);`
- L49: `.map(([product_name, stats]) => ({`
- L53: `.sort((a, b) => b.total_quantity - a.total_quantity)`

#### `src/hooks/useDashboardStats.tsx`

- L4: `export const useDashboardStats = (stockistId: string | undefined) => {`
- L5: `const [stats, setStats] = useState({`
- L17: `const fetchStats = useCallback(async () => {`
- L41: `const totalRevenue = orders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);`
- L50: `const pendingPayments = pharmacies.reduce((sum, pharmacy) =>`
- L54: `const totalCredits = pharmacies.reduce((sum, pharmacy) =>`
- L59: `const todayRevenue = todayOrders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);`
- L142: `return { stats, loading, refetch: fetchStats };`

#### `src/pages/Analytics.tsx`

- L75: `const totalRevenue = orders?.reduce((sum, order) => sum + Number(order.total_amount), 0) || 0;`
- L76: `const totalOrders = orders?.length || 0;`
- L148: `<CardTitle className="text-sm font-medium">Total Revenue</CardTitle>`
- L152: `<div className="text-2xl font-bold">₹{analytics.totalRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>`
- L159: `<CardTitle className="text-sm font-medium">Total Orders</CardTitle>`
- L163: `<div className="text-2xl font-bold">{analytics.totalOrders}</div>`
- L174: `<div className="text-2xl font-bold">{analytics.totalPharmacies}</div>`
- L185: `<div className="text-2xl font-bold">{analytics.totalProducts}</div>`

#### `src/pages/Dashboard.tsx`

- L36: `const { stats, loading: statsLoading } = useDashboardStats(stockistId ?? undefined);`
- L40: `const [kpiDialogOpen, setKpiDialogOpen] = useState(false);`
- L41: `const [kpiDialogData, setKpiDialogData] = useState<any>({ title: "", data: [], type: "revenue" });`
- L98: `const handleKPIClick = async (type: "revenue" | "pending" | "credits" | "pharmacies" | "orders") => {`
- L135: `title = "Pharmacies with Outstanding Balance";`
- L140: `const { data: creditPharmacyIds } = await supabase`
- L146: `const uniqueCreditIds = [...new Set(creditPharmacyIds.map(p => p.pharmacy_id))];`
- L147: `const { data: creditsData } = await supabase`
- L153: `data = creditsData || [];`
- L155: `title = "Pharmacies with Credits";`
- L199: `{[...Array(5)].map((_, i) => <SkeletonKPI key={i} />)}`
- L249: `<KPICards stats={stats} onKPIClick={handleKPIClick} />`
- L257: `<CreditCard className="w-5 h-5" />`
- L370: `<p className="text-xl md:text-2xl font-bold">₹{Number(order.total_amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2`
- L406: `onOpenChange={setKpiDialogOpen}`
- L407: `title={kpiDialogData.title}`
- L408: `data={kpiDialogData.data}`
- L409: `type={kpiDialogData.type}`

#### `src/pages/admin/AdminDashboard.tsx`

- L14: `const [stats, setStats] = useState({`
- L22: `const fetchStats = async () => {`
- L99: `<p className="text-2xl font-bold">{stats.totalUsers}</p>`
- L100: `<p className="text-sm text-muted-foreground">Total Users</p>`
- L104: `<p className="text-2xl font-bold">{stats.activeStockists}</p>`
- L109: `<p className="text-2xl font-bold">{stats.pharmacies}</p>`
- L114: `<p className="text-2xl font-bold">{stats.pendingTasks}</p>`

#### `src/pages/admin/Analytics.tsx`

- L8: `const [stats, setStats] = useState({`
- L46: `const revenue = revenueResult.data?.reduce((sum, order) => sum + (order.total_amount || 0), 0) || 0;`
- L101: `value={stats.totalUsers}`
- L106: `title="Total Stockists"`
- L107: `value={stats.totalStockists}`
- L112: `title="Total Pharmacies"`
- L113: `value={stats.totalPharmacies}`
- L119: `value={stats.totalOrders}`
- L127: `title="Total Revenue"`
- L128: `value={`₹${stats.totalRevenue.toLocaleString()}`}`
- L134: `value={stats.pendingOrders}`
- L139: `value={stats.activeDisputes}`
- L144: `value={stats.activeRecalls}`

#### `src/pages/admin/EnhancedAnalytics.tsx`

- L29: `const totalRevenue = orders?.reduce((sum, o) => sum + Number(o.total_amount), 0) || 0;`
- L50: `<CardTitle className="text-sm font-medium">Total Users</CardTitle>`
- L54: `<div className="text-2xl font-bold">{analytics.totalUsers}</div>`
- L60: `<CardTitle className="text-sm font-medium">Total Orders</CardTitle>`
- L64: `<div className="text-2xl font-bold">{analytics.totalOrders}</div>`
- L70: `<CardTitle className="text-sm font-medium">Total Revenue</CardTitle>`
- L74: `<div className="text-2xl font-bold">₹{analytics.totalRevenue.toLocaleString()}</div>`

#### `src/pages/brand/BrandAnalytics.tsx`

- L44: `const totalRevenue = orders?.reduce((sum, o) => sum + Number(o.total_amount), 0) || 0;`
- L71: `<CardTitle className="text-sm font-medium">Total Revenue</CardTitle>`
- L75: `<div className="text-2xl font-bold">₹{analytics.totalRevenue.toLocaleString()}</div>`
- L81: `<CardTitle className="text-sm font-medium">Total Orders</CardTitle>`
- L85: `<div className="text-2xl font-bold">{analytics.totalOrders}</div>`

#### `src/pages/brand/BrandDashboard.tsx`

- L17: `const [stats, setStats] = useState({ totalOrders: 0, totalRevenue: 0, activeProducts: 0, activeCampaigns: 0 });`
- L28: `const { data: orders } = await supabase.from("brand_orders").select("total_amount").eq("brand_id", brand.id);`
- L34: `totalRevenue: orders?.reduce((sum, o) => sum + Number(o.total_amount || 0), 0) || 0,`
- L58: `<Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Total Orders</CardTitle><Shop`
- L59: `<Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Revenue</CardTitle><TrendingU`
- L60: `<Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Products</CardTitle><Package `
- L61: `<Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Campaigns</CardTitle><MapPin `

#### `src/pages/catalogue/PharmacyDashboard.tsx`

- L42: `const fetchOutstandingOrders = async () => {`
- L44: `const { data, error } = await supabase.functions.invoke('get-pharmacy-outstanding-orders', {`
- L192: `<p className="text-xs md:text-sm text-green-700 font-medium">Credit Balance</p>`
- L204: `<p className="text-xs md:text-sm text-muted-foreground">Outstanding Balance</p>`
- L222: `<CreditCard className="w-4 h-4 mr-2" />`
- L240: `amount={pharmacy.outstanding_balance}`
- L308: `<CardTitle className="text-base md:text-lg">Outstanding Orders</CardTitle>`
- L321: `const totalAmount = Number(order.total_amount);`
- L323: `const outstanding = totalAmount - paidAmount;`
- L326: `if (outstanding < 0.01) return null;`
- L360: `<p className="text-xs text-muted-foreground">Outstanding</p>`
- L384: `const totalAmount = Number(order.total_amount);`
- L386: `const outstanding = totalAmount - paidAmount;`
- L387: `const actualStatus = Math.abs(outstanding) < 0.01 ? 'paid' : order.payment_status;`
- L398: `<p className="font-bold text-sm md:text-base">₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>`
- L403: `<Badge variant="outline" className="text-[10px] md:text-xs">{order.delivery_status}</Badge>`

#### `src/pages/mr/MRAnalytics.tsx`

- L10: `const [analytics, setAnalytics] = useState({ totalVisits: 0, totalOrders: 0, totalCommission: 0, conversionRate: 0 });`
- L21: `const { data: commissions } = await supabase.from("mr_order_commissions").select("commission_amount").eq("mr_id", mrDetails.id);`
- L23: `const totalCommission = commissions?.reduce((sum, c) => sum + Number(c.commission_amount), 0) || 0;`
- L38: `<Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Total Visits</CardTitle><User`
- L39: `<Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Orders Placed</CardTitle><Bar`
- L40: `<Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Total Commission</CardTitle><`

#### `src/pages/patient/PatientDashboard.tsx`

- L15: `const [stats, setStats] = useState({`
- L140: `<div className="text-2xl font-bold">{stats.activeOrders}</div>`
- L151: `<div className="text-2xl font-bold">{stats.totalPrescriptions}</div>`
- L162: `<div className="text-2xl font-bold">{stats.wishlistItems}</div>`
- L173: `<div className="text-2xl font-bold">{stats.pendingRefills}</div>`
- L222: `<p className="font-bold">₹{order.total_amount?.toFixed(2) || "0.00"}</p>`

#### `src/pages/pharmacy/PharmacyAnalytics.tsx`

- L45: `const inventoryValue = inventory?.reduce((sum, i) => sum + (i.quantity * Number(i.unit_price || 0)), 0) || 0;`
- L66: `<CardTitle className="text-sm font-medium">Total Products</CardTitle>`
- L70: `<div className="text-2xl font-bold">{analytics.totalProducts}</div>`

#### `src/pages/pharmacy/PharmacyPortalDashboard.tsx`

- L12: `const [stats, setStats] = useState({`
- L61: `const fetchDashboardStats = async () => {`
- L87: `const inventoryValue = inventory?.reduce((sum, item) =>`
- L168: `[...Array(4)].map((_, i) => <SkeletonKPI key={i} />)`
- L171: `<Card key={kpi.title}>`
- L173: `<CardTitle className="text-sm font-medium">{kpi.title}</CardTitle>`
- L174: `<div className={`${kpi.bgColor} p-2 rounded-lg`}>`
- L175: `<kpi.icon className={`w-4 h-4 ${kpi.color}`} />`
- L179: `<div className="text-2xl font-bold">{kpi.value}</div>`

### E.7 Modals / Dialogs / Sheets Inventory

**Files with dialog-like UI:** 55

| File | Dialog Count | Named Components |
|------|--------------|------------------|
| `src/components/catalogue/OrderConfirmationDialog.tsx` | 8 | OrderConfirmationDialog |
| `src/components/auth/SessionTimeoutWarning.tsx` | 7 | (inline) |
| `src/pages/admin/FeeManagement.tsx` | 7 | openEditDialog |
| `src/pages/admin/MessageTemplates.tsx` | 7 | openEditDialog |
| `src/pages/admin/TerritoryManagement.tsx` | 7 | openEditDialog |
| `src/pages/admin/CampaignManagement.tsx` | 7 | openEditDialog |
| `src/pages/brand/BrandCampaigns.tsx` | 6 | (inline) |
| `src/pages/brand/BrandProducts.tsx` | 6 | (inline) |
| `src/pages/admin/DocumentVerification.tsx` | 6 | openViewDialog |
| `src/components/Layout/ChatAssistant.tsx` | 5 | (inline) |
| `src/components/Layout/StockistChatAssistant.tsx` | 5 | (inline) |
| `src/components/Layout/PharmacyChatAssistant.tsx` | 5 | (inline) |
| `src/components/Layout/AdminChatAssistant.tsx` | 5 | (inline) |
| `src/components/dashboard/QuickOrderDialog.tsx` | 5 | QuickOrderDialog |
| `src/components/dashboard/EditOrderDialog.tsx` | 5 | EditOrderDialog |
| `src/components/orders/OrderActionsDropdown.tsx` | 5 | (inline) |
| `src/pages/admin/Notices.tsx` | 5 | (inline) |
| `src/pages/admin/BatchRecalls.tsx` | 5 | (inline) |
| `src/components/products/ProductScanDialog.tsx` | 4 | ProductScanDialog |
| `src/components/products/AddProductDialog.tsx` | 4 | AddProductDialog |
| `src/components/products/EditProductDialog.tsx` | 4 | EditProductDialog |
| `src/components/products/QuickUpdateStockDialog.tsx` | 4 | QuickUpdateStockDialog |
| `src/components/dashboard/KPIDetailDialog.tsx` | 4 | KPIDetailDialog |
| `src/components/dashboard/QuickBillDialog.tsx` | 4 | QuickBillDialog |
| `src/components/dashboard/OCRScanDialog.tsx` | 4 | OCRScanDialog |
| `src/components/dashboard/ExportDataDialog.tsx` | 4 | ExportDataDialog |
| `src/components/dashboard/MapRouteDialog.tsx` | 4 | MapRouteDialog |
| `src/components/dashboard/BillUploadDialog.tsx` | 4 | BillUploadDialog |
| `src/components/dashboard/BulkUploadDialog.tsx` | 4 | BulkUploadDialog, firstSheet |
| `src/components/orders/PaymentLinkDialog.tsx` | 4 | PaymentLinkDialog |
| `src/components/orders/OrderItemsDialog.tsx` | 4 | OrderItemsDialog |
| `src/components/pharmacies/EditPharmacyDialog.tsx` | 4 | EditPharmacyDialog |
| `src/components/pharmacies/AddPharmacyDialog.tsx` | 4 | AddPharmacyDialog |
| `src/components/pharmacies/PharmacySelectDialog.tsx` | 4 | PharmacySelectDialog |
| `src/components/catalogue/MarkPaymentDialog.tsx` | 4 | MarkPaymentDialog |
| `src/pages/PaymentApprovals.tsx` | 4 | (inline) |
| `src/pages/StockistApprovals.tsx` | 4 | (inline) |
| `src/pages/Support.tsx` | 4 | (inline) |
| `src/pages/Payments.tsx` | 4 | openReminderDialog |
| `src/pages/admin/PharmacyApprovals.tsx` | 4 | (inline) |
| `src/pages/admin/Disputes.tsx` | 4 | (inline) |
| `src/components/Layout/PatientTopNav.tsx` | 3 | (inline) |
| `src/components/Layout/BrandTopNav.tsx` | 3 | (inline) |
| `src/components/Layout/MRTopNav.tsx` | 3 | (inline) |
| `src/components/route/SortablePharmacyCard.tsx` | 0 | (inline) |
| `src/components/dashboard/QuickActions.tsx` | 0 | (inline) |
| `src/components/orders/OrderCard.tsx` | 0 | (inline) |
| `src/pages/OrderDetail.tsx` | 0 | (inline) |
| `src/pages/Dashboard.tsx` | 0 | (inline) |
| `src/pages/OrderCreation.tsx` | 0 | (inline) |
| `src/pages/Pharmacies.tsx` | 0 | (inline) |
| `src/pages/Orders.tsx` | 0 | (inline) |
| `src/pages/Products.tsx` | 0 | (inline) |
| `src/pages/catalogue/PharmacyDashboard.tsx` | 0 | (inline) |
| `src/pages/catalogue/PharmacyCheckout.tsx` | 0 | (inline) |

### E.8 Mock, Stub, and Incomplete Behavior

**Files flagged:** 107

| File | Tags | Sample |
|------|------|--------|
| `supabase/functions/create-platform-order/index.ts` | random, debug-log | L59: const orderNumber = `PLT-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUp |
| `supabase/functions/chat-assistant/index.ts` | debug-log | L343: console.log(`Executing stockist tool: ${toolName} for stockist: ${stockistId}`); |
| `supabase/functions/get-pharmacy-outstanding-orders/index.ts` | debug-log | L32: console.log(`Fetching outstanding orders for pharmacy: ${pharmacy_id}, stockist: ${st |
| `supabase/functions/mark-payment-paid/index.ts` | debug-log | L39: console.log(`Marking payment for pharmacy: ${pharmacy_id}, amount: ₹${amount} (rounde |
| `supabase/functions/parse-order-message/index.ts` | debug-log | L167: console.log("Primary model failed, trying fallback..."); |
| `supabase/functions/extract-product-label/index.ts` | debug-log | L54: console.log('Extracting product label from image'); |
| `supabase/functions/reduce-stock-for-order/index.ts` | debug-log | L35: console.log(`Reducing stock for order ${order_id} with ${items.length} items`); |
| `supabase/functions/optimize-route/index.ts` | demo, random, debug-log | L221: // Random distance between 5-20 km for demo |
| `supabase/functions/calculate-delivery-fee/index.ts` | debug-log | L59: console.log(`Calculating delivery fee for stockist: ${stockist_id}, pharmacy: ${pharm |
| `supabase/functions/process-bill-image/index.ts` | debug-log | L79: console.log('Using provided data from preview'); |
| `supabase/functions/verify-pharmacy-license/index.ts` | debug-log | L46: console.log(`Rate limit exceeded for license: ${license_number}`); |
| `supabase/functions/extract-bill-items/index.ts` | debug-log | L75: console.log('Primary model (gemini-2.5-pro) failed, trying fallback (gpt-5)...'); |
| `supabase/functions/fetch-product-info/index.ts` | debug-log | L44: console.log('Fetching product info for:', productName); |
| `supabase/functions/approve-reject-payment/index.ts` | debug-log | L48: console.log(`Processing payment confirmation: ${confirmation_id}, action: ${action}`) |
| `src/contexts/AuthContext.tsx` | debug-log | L137: console.log("AuthContext: Role fetched:", role, "Onboarding status:", { |
| `src/components/ui/command.tsx` | placeholder | L47: "flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:tex |
| `src/components/ui/sidebar.tsx` | random | L536: return `${Math.floor(Math.random() * 40) + 50}%`; |
| `src/components/ui/select.tsx` | placeholder | L20: "flex h-10 w-full items-center justify-between rounded-md border border-input bg-back |
| `src/components/ui/textarea.tsx` | placeholder | L11: "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text |
| `src/components/ui/input.tsx` | placeholder | L11: "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ri |
| `src/components/pharmacy/PharmacyBillsList.tsx` | debug-log | L39: console.log("Bills fetched:", data); |
| `src/components/products/ProductScanDialog.tsx` | placeholder | L327: placeholder="Units" |
| `src/components/products/AddProductDialog.tsx` | placeholder, random | L220: placeholder="e.g., Paracetamol or Paracetamol + Ibuprofen" |
| `src/components/products/EditProductDialog.tsx` | placeholder | L204: <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger> |
| `src/components/products/QuickUpdateStockDialog.tsx` | placeholder | L104: placeholder={operation === "add" ? "Enter quantity to add" : "Enter new stock quanti |
| `src/components/route/SortablePharmacyCard.tsx` | placeholder, debug-log | L333: placeholder="Amount collected" |
| `src/components/auth/ProtectedRoute.tsx` | debug-log | L106: console.log("ProtectedRoute: Redirecting to onboarding for", requiredRole); |
| `src/components/Layout/ChatAssistant.tsx` | placeholder | L335: placeholder={stockistId ? "Ask about your business..." : "Loading..."} |
| `src/components/Layout/StockistTopNav.tsx` | placeholder | L104: placeholder="Search pharmacies, products, orders..." |
| `src/components/Layout/StockistChatAssistant.tsx` | placeholder | L248: placeholder={stockistId ? "Ask about your business..." : "Loading..."} |
| `src/components/Layout/PharmacyTopNav.tsx` | placeholder | L89: placeholder="Search stockists, products..." |
| `src/components/Layout/Notifications.tsx` | debug-log | L57: console.log('Payment confirmation updated'); |
| `src/components/Layout/PharmacyChatAssistant.tsx` | placeholder | L248: placeholder={pharmacyId ? "Ask about products, orders..." : "Loading..."} |
| `src/components/Layout/TopNav.tsx` | placeholder | L113: placeholder="Search pharmacies, products, orders..." |
| `src/components/Layout/AdminChatAssistant.tsx` | placeholder | L234: placeholder="Ask about platform stats, users..." |
| `src/components/dashboard/QuickBillDialog.tsx` | placeholder | L254: <SelectValue placeholder="Choose pharmacy" /> |
| `src/components/dashboard/QuickOrderDialog.tsx` | placeholder | L375: <SelectValue placeholder="Choose pharmacy" /> |
| `src/components/dashboard/MapRouteDialog.tsx` | placeholder, debug-log | L265: placeholder="Enter your starting address or location" |
| `src/components/dashboard/BillUploadDialog.tsx` | placeholder, debug-log | L430: <SelectValue placeholder="Search and select pharmacy" /> |
| `src/components/dashboard/EditOrderDialog.tsx` | placeholder | L290: <SelectValue placeholder="Select product..." /> |
| `src/components/dashboard/BulkUploadDialog.tsx` | debug-log | L132: console.log('CSV Headers detected:', headers); |
| `src/components/dashboard/ActivityFeed.tsx` | debug-log | L49: console.log('New activity:', payload); |
| `src/components/orders/OrderActionsDropdown.tsx` | placeholder | L265: placeholder="Enter amount" |
| `src/components/orders/PaymentLinkDialog.tsx` | placeholder | L164: placeholder="Enter UPI ID" |
| `src/components/orders/OrderItemsDialog.tsx` | placeholder | L305: <CommandInput placeholder="Search products..." /> |
| `src/components/pharmacies/EditPharmacyDialog.tsx` | placeholder | L125: placeholder="Enter exact name from Google Maps" |
| `src/components/pharmacies/AddPharmacyDialog.tsx` | placeholder | L70: // Create an initial placeholder order to establish stockist-pharmacy relationship |
| `src/components/pharmacies/PharmacySelectDialog.tsx` | placeholder | L82: placeholder="Search pharmacies..." |
| `src/components/catalogue/MarkPaymentDialog.tsx` | placeholder | L132: <SelectValue placeholder="Choose an order" /> |
| `src/components/onboarding/OnboardingIllustrations.tsx` | placeholder | L97: {/* Chart placeholder */} |
| `src/hooks/useCachedPharmacies.tsx` | debug-log | L77: console.log('Pharmacy data changed, invalidating cache'); |
| `src/hooks/useDashboardStats.tsx` | debug-log | L112: console.log('Orders updated, refetching stats'); |
| `src/lib/offlineSync.ts` | random, debug-log | L48: id: `${Date.now()}_${Math.random()}`, |
| `src/lib/storage.ts` | debug-log | L31: console.log(`Uploading to ${bucket}/${filePath}...`); |
| `src/pages/Index.tsx` | debug-log | L29: console.log("Index: Navigating to", destination, "role:", userRole); |
| `src/pages/PaymentApprovals.tsx` | placeholder, debug-log | L230: placeholder="Add verification notes..." |
| `src/pages/Login.tsx` | placeholder, debug-log | L252: placeholder="Enter your email" |
| `src/pages/Dashboard.tsx` | debug-log | L63: console.log('Orders updated'); |
| `src/pages/Support.tsx` | placeholder | L236: placeholder="Brief description of your issue" |
| `src/pages/OrderCreation.tsx` | placeholder | L360: placeholder="Paste order message here... e.g., Dolo 50N, Paracetamol 100 boxes" |
| `src/pages/ResetPassword.tsx` | placeholder | L91: placeholder="Enter new password (min 6 characters)" |
| `src/pages/Payments.tsx` | placeholder | L508: placeholder="Enter reminder message..." |
| `src/pages/Pharmacies.tsx` | placeholder, debug-log | L620: placeholder="Search pharmacies..." |
| `src/pages/RouteExecution.tsx` | debug-log | L58: console.log("Fetching updated pharmacy data..."); |
| `src/pages/Profile.tsx` | placeholder | L365: placeholder="e.g., HDFC Bank" |
| `src/pages/PharmacyRegistration.tsx` | placeholder, random | L241: placeholder="e.g., 28.6139,77.2090" |
| `src/pages/Orders.tsx` | placeholder, debug-log | L309: <SelectValue placeholder="All Pharmacies" /> |
| `src/pages/ForgotPassword.tsx` | placeholder | L77: placeholder="Enter your email" |
| `src/pages/Products.tsx` | placeholder, debug-log | L384: placeholder="Search products..." |
| `src/pages/pharmacy/PharmacyInventory.tsx` | placeholder | L119: placeholder="Search by product name or batch number..." |
| `src/pages/pharmacy/PharmacyPortalOrders.tsx` | placeholder | L172: placeholder="Search by order number or stockist..." |
| `src/pages/pharmacy/BrowseStockists.tsx` | placeholder | L174: placeholder="Search by name, company, or location..." |
| `src/pages/pharmacy/PharmacyPortalCheckout.tsx` | placeholder, debug-log | L351: placeholder="Add notes for this order (optional)" |
| `src/pages/pharmacy/PharmacyOrdering.tsx` | placeholder, random | L82: // For now, just showing placeholder |
| `src/pages/pharmacy/StockistCatalogue.tsx` | placeholder | L207: placeholder="Search products..." |
| `src/pages/pharmacy/PharmacyPortalDashboard.tsx` | debug-log | L37: console.log('Inventory updated, refreshing stats'); |
| `src/pages/stockist/StockistProfile.tsx` | placeholder | L321: placeholder="yourname@upi" |
| `src/pages/stockist/DeliverySettings.tsx` | placeholder | L371: placeholder="PIN Code (6 digits)" |
| `src/pages/mr/MRPharmacies.tsx` | placeholder | L66: <Input placeholder="Search pharmacies..." value={searchQuery} onChange={(e) => setSea |
| `src/pages/mr/MRCollections.tsx` | demo, placeholder | L34: toast.success("Collection recorded! (Demo)"); |
| `src/pages/brand/BrandSignup.tsx` | placeholder | L106: placeholder="Brand name" |
| `src/pages/brand/BrandCampaigns.tsx` | placeholder | L175: placeholder="e.g., Summer Sale" |
| `src/pages/brand/BrandProducts.tsx` | placeholder | L176: placeholder="e.g., Paracetamol 500mg" |
| `src/pages/admin/UserManagement.tsx` | placeholder | L105: placeholder="Search by email, name, or company..." |
| `src/pages/admin/PharmacyApprovals.tsx` | placeholder | L358: placeholder="Enter reason for rejection..." |
| `src/pages/admin/Notices.tsx` | placeholder | L231: <SelectValue placeholder="All Roles" /> |
| `src/pages/admin/BatchRecalls.tsx` | placeholder | L247: placeholder="Enter batch code (e.g., BATCH-2024-001)" |
| `src/pages/admin/Disputes.tsx` | placeholder | L183: placeholder="Enter resolution details..." |
| `src/pages/admin/MessageTemplates.tsx` | placeholder | L205: placeholder="e.g., pharmacy_name, amount, date" |
| `src/pages/admin/TerritoryManagement.tsx` | placeholder | L212: placeholder="e.g., 110001, 110002, 110003" |
| `src/pages/admin/DocumentVerification.tsx` | placeholder | L202: placeholder="Provide a reason for rejection..." |
| `src/pages/admin/AuditLogs.tsx` | placeholder | L63: placeholder="Search logs by action, entity, or user..." |
| `src/pages/patient/PriceComparison.tsx` | placeholder | L66: placeholder="Search for medicine..." |
| `src/pages/patient/AIAssistant.tsx` | placeholder | L62: placeholder="Describe your symptoms in detail (e.g., fever for 2 days, headache, body |
| `src/pages/patient/PatientSignup.tsx` | placeholder | L100: placeholder="Enter your full name" |
| `src/pages/patient/PatientProfile.tsx` | placeholder | L242: <SelectValue placeholder="Select gender" /> |
| `src/pages/patient/MedicineSearch.tsx` | placeholder | L86: placeholder="Search by medicine name, brand, or salt..." |
| `src/pages/patient/PatientCheckout.tsx` | demo, placeholder, todo | L75: toast.info("Cart integration required. This is a demo checkout flow."); |
| `src/pages/catalogue/PharmacyDashboard.tsx` | debug-log | L91: console.log('Order update:', payload); |
| `src/pages/catalogue/PharmacyCheckout.tsx` | placeholder | L280: placeholder="Enter amount" |
| *…* | | *7 more* |

### E.9 Dead Code, Orphan Routes, and Broken Links

#### Likely unreferenced page components

- `BrandSignup`
- `PatientSignup`

#### Duplicate / parallel component files

- `Analytics.tsx`: `src/pages/Analytics.tsx`, `src/pages/admin/Analytics.tsx`


---

## EXPANSION PASS 2 — Deep Trace Additions (2026-07-08)

Append-only deep-trace pass. Only material NOT already present above. Domain restricted to Admin / Stockist / Pharmacy. All paths relative to the repo root `stockpharmaerp/`.

### E2.1 Newly documented routes/pages/screens

No new routes exist beyond the complete route table in §E.1 — every `<Route>` in `src/App.tsx` is already enumerated. New page-level detail discovered on already-listed routes:

- **`/support` (`src/pages/Support.tsx`)** — ticket creation dialog inserts `support_tickets` with `category` default `'general'`, `priority` default `'medium'`, `status` default `'open'` (DB defaults, migration `20251108190232`). Verbatim toasts: "Please log in to create a ticket", "Ticket created successfully", "Failed to create ticket", "Ticket marked as resolved", "Failed to update ticket", "Failed to load support tickets". Resolve action is a status update on the user's own ticket (RLS: `auth.uid()=user_id` for SELECT/INSERT/UPDATE).
- **`/settings` Manage tab (`src/pages/Settings.tsx`)** — per-role announcement save toast is dynamically built: `` `${role.charAt(0).toUpperCase() + role.slice(1)} announcement updated!` ``; app-info save → "App info updated!" / "Failed to save app info". Announcements and app info persist to `platform_settings` rows keyed `app_info`, `stockist_announcement`, `pharmacy_announcement`, `admin_announcement` (seeded — see E2.8).
- **`/stockist/home` sub-components not previously itemized** — `src/components/dashboard/ActivityFeed.tsx`, `LowStockAlert.tsx`, `DateRangeFilter.tsx`, `NoticesPanel.tsx` (full behavior in E2.2).
- **Global search destinations (`src/components/Layout/StockistTopNav.tsx`)** — search fires only when `searchQuery.length > 1`; three parallel scoped queries (pharmacies by `pharmacy_name/owner_name/phone/area ilike %q%` limit 5, products by `name/brand/generic_name/category`, orders by `order_number`), and selecting ANY result navigates only to the list page (`/stockist/pharmacies`, `/stockist/products`, `/stockist/orders`) — never to the specific record.
- **`/pharmacy/*` top-nav search (`src/components/Layout/PharmacyTopNav.tsx`)** — searches only `stockist_details` where `catalogue_enabled=true` by `stockist_name/company_name ilike`, limit 5; selection navigates to `/pharmacy/stockists/{id}` (this one DOES deep-link).

### E2.2 Component behavior catalog

Fine-grained props/state/behavior beyond §2.16, §16 and the E.7 inventory table:

#### `src/components/dashboard/OCRScanDialog.tsx` (not previously documented at all)
- Props: `open`, `onOpenChange`, `stockistId: string`. State: `file`, `processing`, `scannedItems: {name, quantity, price}[]`.
- "Scan & Extract Items" reads the file as base64 and invokes edge fn **`parse-order-message`** with `{message: "Extract product information...JSON array...name, quantity, price", image: base64}` — i.e. it repurposes the order-parsing function for inventory OCR.
- "Save to Inventory": per item — `products` lookup `.eq("name", item.name).eq("stockist_id", stockistId).maybeSingle()`; if found `update {stock_quantity: existing+qty, sale_price: item.price}`; else `insert {name, stockist_id, stock_quantity: qty, sale_price: price, mrp: price, is_active: true}`. Then one `activity_log` insert `{activity_type:"inventory_updated", description:"OCR scan added N products"}`.
- Timing bug: `setProcessing(false)` runs in `finally` synchronously before the async `FileReader.onload` completes, so the spinner state is unreliable.

#### `src/components/dashboard/ExportDataDialog.tsx`
- Props: `open`, `onOpenChange`, `stockistId`. `exportType: "orders"|"payments"|"activity"` (default orders). Queries: orders `select("*, pharmacy_details(pharmacy_name)")`, payment_confirmations same join, activity_log `select("*")` — all `.eq(stockist scope).order("created_at", desc)`. CSV headers = `Object.keys(data[0])`; object values are `JSON.stringify`ed. Filenames `orders_<yyyy-MM-dd>.csv` / `payments_…` / `activity_…`. Empty result → error toast; success toast "Exported N records".

#### `src/components/dashboard/KPIDetailDialog.tsx`
- Pure presentational; props `title`, `data: any[]`, `type: "revenue"|"pending"|"credits"|"pharmacies"|"orders"`. revenue/orders render order rows (pharmacy name, order_number, `formatDistanceToNow`, ₹total en-IN 2dp, payment badge); pending renders pharmacy outstanding in destructive color; credits renders `+₹credit_balance` green; pharmacies renders name/active badge/owner/area/total_orders. Empty state text: "No data available".

#### `src/components/dashboard/EditOrderDialog.tsx` (fee-field detail new)
- State includes `discountAmount`, `deliveryFee`, `instantDeliveryFee` — the two fee fields factor into `calculateTotal = subtotal − discountAmount + deliveryFee + instantDeliveryFee` and are saved into `orders.total_amount`/`net_amount`, but are **not persisted as separate columns and always reset to 0 on open** (phantom inputs). Save flow: update orders `{total_amount, net_amount: total, discount_amount, notes}` → delete ALL `order_items` for the order → re-insert current items `{order_id, product_name, quantity, unit_price, total_price}` → `activity_log {activity_type:"order_modified", description:"Edited order <order_number>"}`. Item load maps `product_id` to `item.product_name` as a fallback. Warning alert rendered when `payment_status==='paid'`.

#### `src/components/dashboard/NoticesPanel.tsx`
- No props. On mount + realtime channel `user-notices` (INSERT on `user_notice_recipients`) → refetch. Fetch: own `user_notice_recipients`, keep those without `dismissed_at`, then `admin_notices .in("id", noticeIds).eq("is_active", true)` ordered desc, client-filtered to non-expired (`expires_at > now`). Click notice → `markAsRead` (`update {read_at: now}`); X button → `dismissNotice` (`update {dismissed_at: now}`, stopPropagation). Icons: alert→AlertCircle, warning→AlertTriangle, else Info. Priority badge variants: urgent→destructive, high→default, medium→secondary, else outline. Component returns `null` when there are no notices; header badge = unread count.

#### `src/components/dashboard/ActivityFeed.tsx`
- Props `{stockistId}`. Fetch `activity_log` scoped, desc, `limit(50)`; realtime channel `activity-feed-updates` INSERT filter `stockist_id=eq.<id>` prepends live rows. Filter select values: all, catalogue_update, price_change, order_modified, payment_reminder. Icon map: catalogue_update→Package, price_change→DollarSign, order_modified→FileText, payment_reminder→Bell. Renders first 10 filtered with `formatDistanceToNow`. Collapsible, default open.

#### `src/components/dashboard/LowStockAlert.tsx`
- Props `{stockistId}`. Query `products .select("id,name,stock_quantity,min_stock_threshold,brand").order("stock_quantity", asc)`, client-filter `stock_quantity <= min_stock_threshold`, `.slice(0,5)`. Returns null when none. "View All Products" → `/stockist/products`.

#### `src/components/dashboard/DateRangeFilter.tsx`
- Props `dateRange`, `onDateRangeChange`. Popover range Calendar `numberOfMonths={2}` + X clear → `onDateRangeChange(undefined)`. No queries (confirms §11: display-only on Dashboard).

#### `src/components/products/*` (persistence gaps + exact parsing)
- **AddProductDialog** (`AddProductDialog.tsx`): props include `initialData?: {name?, brand?, category?}`; prefill implemented via `useState(() => {...})` lazy initializer with side effects (not a `useEffect` — runs once, a code smell). Numeric parsing on insert: `parseFloat(mrp)||null`, `parseInt(stock_quantity)||0`, `min_stock_threshold||10`, `moq||1`, `gst_percentage||5`. Image upload path `${stockistId}/${Math.random()}.${ext}` in `product-images`. Type select = 14 options (tablet…solution); category select ≈24 options. Logs `activity_log {catalogue_update, "Added new product: <name>"}`.
- **EditProductDialog**: type select only 6 options (tablet, capsule, syrup, injection, drops, cream) vs Add's 14; category is a free-text Input here (select in Add). No activity_log on save (Add logs one).
- **ProductScanDialog**: progress staged 10→30→70→85→100; upload via `uploadToStorage(file,"product-images")` then edge fn `extract-product-label {image: url}`. Existing-product match: exact `.eq("name", data.name.trim())` then fallback `.ilike`. Form inputs disabled until "Correct - Enable Editing" (`isConfirmed`). Update path adds scanned qty to existing stock: `stock_quantity: existing.stock_quantity + parseInt(stock_quantity)`. `batch_number` and `expiry_date` are collected but never saved. Activity descriptions: "OCR updated: <name>" / "OCR added new product: <name>".
- **QuickUpdateStockDialog**: `operation: "add"|"set"`; `newStock = add ? current+amount : amount`; live preview `current + parseInt(updateAmount||"0")`; toast "Stock updated to N units".

#### `src/components/pharmacies/*`
- **AddPharmacyDialog**: required fields = pharmacy_name, gst_number, license_number. The placeholder order insert `INIT-{Date.now()}` carries `notes: "Initial registration order..."`; its error is logged but NOT thrown (pharmacy creation still succeeds). Error string when stockist lookup fails: "Stockist details not found".
- **EditPharmacyDialog**: extra fields (license_number, pin_code, google_maps_name, location_coordinates, whatsapp_number, email) are read off the pharmacy prop via `(pharmacy as any)` casts — the prop interface only declares 8 fields.
- **PharmacySelectDialog**: fetches **all** active pharmacies (`.eq("is_active", true)`, no stockist scope in the query — scoping comes from RLS), client search across name/owner/area; `onSelect(pharmacyId, pharmacyName)` then closes.

#### `src/components/orders/*`
- **PaymentLinkDialog**: exact props `{open, onOpenChange, orderNumber, totalAmount, pharmacyName, pharmacyPhone?}`. `paymentAmount = totalAmount * paymentPercentage / 100`; slider min 1 max 100 step 1 + 100/50/25% quick buttons. Also builds a **web link** `` `${origin}/pay/${orderNumber}?amount=${paymentAmount}` `` for the copy action — note `/pay/*` is NOT a route in `src/App.tsx`, so the copied web link 404s (the UPI deep link and WhatsApp path work). Inline UPI editing: `update stockist_details {upi_id} .eq("profile_id", user.id)`.
- **OrderItemsDialog** — full recalculation contract: on any item change, `recalculateOrderTotal()` sums `order_items.total_price`, re-derives `payment_status` (`paid` if `paid_amount>=newTotal`; `partial` if `0<paid<newTotal`; else `unpaid`), updates `orders {total_amount, net_amount: newTotal−paid, payment_status}`, then re-runs the client `recalculatePharmacyBalance`. Delete uses native `confirm("Delete this item?")`. Minus button disabled at `quantity<=1`.
- **OrderCard.tsx**: previews first **3** items (`limit(3)`); whole card `onClick → window.location.href='/stockist/orders/<id>'` (hard navigation, not router). Inner buttons don't stopPropagation, so opening the items dialog can also trigger card navigation. Renders `OrderActionsDropdown` WITHOUT `pharmacyId/paidAmount/orderNumber` props — so from OrderCard, Mark-as-Paid skips the payment_confirmations insert (needs pharmacyId) and partial-payment math treats prior paid as 0.
- **OrderActionsDropdown** — exact confirmation insert on Mark Paid: `{payment_method:'manual_mark_paid', payment_type:'cash', status:'approved', processed_at, processed_by, stockist_notes:"Order <n> marked as paid via orders UI"}`. ⚠️ `payment_type:'cash'` violates the DB CHECK on `payment_confirmations.payment_type` (`IN ('full_outstanding','custom_amount','specific_order')`, migration `20251109131754`) — see E2.8. "Cancel Order" only sets `status='cancelled'`; the credit the toast promises is applied by the DB trigger `handle_order_cancellation`, not by this component. Menu items are conditional: Mark Paid/Partial hidden when paid, Mark Delivered hidden when delivered, Cancel hidden when cancelled.
- **UpiQrCode** (`src/components/orders/UpiQrCode.tsx`, lives in `orders/` not `catalogue/`): props `{upiId, amount, orderNumber, stockistName}`; `QRCodeSVG` id `upi-qr-code`; `downloadQR` serializes the SVG → canvas → PNG named `UPI-QR-<orderNumber>.png`.

#### `src/components/catalogue/*`
- **MarkPaymentDialog**: `unpaidOrders = orders.filter(o => o.paid_amount < o.total_amount)`; amount resolution — full_outstanding→`pharmacy.outstanding_balance`, specific_order→that order's **`total_amount`** (not its remaining due), custom→`parseFloat(amount)`. Submit disabled when `loading || (specific_order && !selectedOrderId)`. UI copy claims rounding to nearest rupee but the raw amount is sent.
- **OrderConfirmationDialog**: pure AlertDialog; props `{onConfirm, items, subtotal, totalTax, grandTotal, notes, loading}`; action label toggles "Placing Order..."/"Confirm & Place Order"; both buttons disabled while loading.
- **OnboardingCarousel** (`src/components/onboarding/OnboardingCarousel.tsx`): props `{slides: {title,description,illustration}[], onComplete, storageKey}`; embla carousel; `handleComplete` = `localStorage.setItem(storageKey, "true")` then `onComplete()`; fired by X, "Get Started" (last slide) and "Skip introduction".

#### `src/components/route/SortablePharmacyCard.tsx` (exact FIFO loop)
- `handleRecordPayment` loop per order: skip when `amountDue<=0.01`; if `remaining>=amountDue` → `{paid_amount: total_amount, payment_status:"paid"}` and `remaining -= amountDue`; else `{paid_amount: paid+remaining, payment_status: |total−newPaid|<0.01 ? "paid":"partial"}`, `remaining=0`. Then one approved `payment_confirmations {order_id: null, payment_method: <cash|online|cheque|other>, payment_type:'route_collection', stockist_notes:"Route collection: ₹X via <mode>. <notes>"}` and an explicit **500 ms `setTimeout` wait "for DB trigger"** before refresh. `payment_type:'route_collection'` also violates the DB CHECK (E2.8). PaymentLinkDialog is fed `totalAmount = order.total_amount − (paid_amount||0)` (remaining due, not full total). Mark Delivered button `disabled={allOrdersDelivered}`; Record button `disabled={!collectionAmount || updating}`. `customPaymentAmount` state exists but is unused.

#### `src/components/auth/SessionTimeoutWarning.tsx` (exact constants)
- Interval 1 s while a session exists; `SESSION_TIMEOUT = 30*60*1000`, `WARNING_BEFORE_TIMEOUT = 5*60*1000`; warning shows when `0 < SESSION_TIMEOUT − (now − lastActivity) <= 5min`; countdown formatted mm:ss; "Stay Logged In" → `refreshSession()`.

#### Chat assistants (`src/components/Layout/*ChatAssistant.tsx`)
- Four near-identical Sheet chats. Message history persisted per role in **sessionStorage**: `stockist-chat-messages`, `pharmacy-chat-messages`, `admin-chat-messages`, and legacy `chat-messages` (ChatAssistant.tsx). Context window = last 10 messages mapped `{role, content}`. Bodies: stockist `{messages, stockist_id, role:'stockist'}`; pharmacy `{messages, pharmacy_id, role:'pharmacy'}`; admin `{messages, role:'admin'}`; legacy ChatAssistant sends `{messages, stockist_id}` with **no role key** (server infers stockist). `formatMessage` renders `**bold**`→`<strong>`, `- `/`• `→`<li>` via `dangerouslySetInnerHTML`. Send disabled while loading or when the role id hasn't resolved. Clear chat removes the sessionStorage key.

#### Misc shell components
- **AdminTopNav** (`src/components/Layout/AdminTopNav.tsx`): title "Digi Swasthya Admin"; bell icon is static (no handler); profile dropdown shows `user?.email || "Admin"`.
- **AdminSidebar**: `collapsed` toggles width `w-56`/`w-16`; 14 items ending with `/settings` (confirms Enhanced Analytics absent).
- **PWAInstallPrompt**: suppressed permanently once dismissed via `localStorage['pwa-install-dismissed']='true'`.
- **NetworkStatus**: offline toast uses `duration: Infinity`; a success toast fires on reconnect only if previously offline. Renders null (toast-only component).
- **RouteErrorBoundary**: shows the error message only when `process.env.NODE_ENV==='development'`; Retry = state reset + `window.location.reload()`; Go Home = `window.location.href="/"`.
- **NavLink.tsx**: forwardRef adapter adding `activeClassName`/`pendingClassName` over react-router's NavLink.

### E2.3 Entity & schema deep detail

Additions to §13/§14/§E.2 from the migration SQL itself (`supabase/migrations/*.sql`, 52 files):

#### Enum evolution
- `public.user_role = ('stockist','pharmacy')` created `20251108161608` — **legacy**; the `profiles.role` column that used it was dropped in `20251108163342`, but the enum type remains.
- `public.app_role` created `20251108163342` as `('stockist','pharmacy')`; `'admin'` added `20251118101737`; `'mr'` added `20251124105100`; `'patient'`,`'brand'` added `20251210035414`.

#### Column-level facts not previously recorded
- `orders`: `status` DEFAULT `'draft'`; `order_source` DEFAULT `'manual'`; `payment_status` DEFAULT `'unpaid'`; `delivery_status` DEFAULT `'pending'`; amounts `DECIMAL(10,2)`; `order_number TEXT UNIQUE NOT NULL`; `paid_amount`/`bill_image_url` added `20251109053255`; `batch_cycle_id` added `20251124105748`.
- `orders` CHECK constraints: `orders_delivery_status_check` (`20251109070411`) allows `('pending','confirmed','packed','out_for_delivery','delivered','cancelled')` — note `'dispatched'` used by parts of the UI is NOT in this list, while `'packed'` is never used by the UI. `orders_payment_status_check` (`20251110125029`) enforces `(paid ∧ paid_amount>=total) ∨ (partial ∧ 0<paid<total) ∨ (unpaid ∧ paid IS NULL OR 0)`; a second, redundant identical constraint `orders_payment_validation` was added `20251110130655`.
- `orders` indexes: `idx_orders_pharmacy_payment (pharmacy_id, payment_status) WHERE payment_status IN ('unpaid','partial')`, `idx_orders_pharmacy_delivery (…) WHERE delivery_status != 'delivered'`, `idx_orders_pharmacy_status (…) WHERE status != 'cancelled'` (all `20251111210644`), plus `idx_orders_stockist_status (stockist_id, status, created_at)` (`20251208162808`).
- `pharmacy_details` FK history: original `profile_id → profiles.id` was **re-pointed** in `20251110075744` to `stockist_details(id) ON DELETE CASCADE` and made NOT NULL, then made **nullable again** in `20251209024207` for self-registered pharmacies. `auth_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL` added `20251124105132` with index `idx_pharmacy_details_auth_profile`. Money columns are `DECIMAL(10,2)` (`credit_limit`, `outstanding_balance` default 0); `credit_balance NUMERIC DEFAULT 0` added `20251111210644`; `latitude/longitude` added `20251208162808`.
- `products`: `gst_percentage DECIMAL(5,2) DEFAULT 18` (DB default is 18 even though every client insert path defaults to 5); `min_stock_threshold DEFAULT 10`; `moq DEFAULT 1` (`20251108174345`); partial index `idx_products_batch_code … WHERE batch_code IS NOT NULL` (`20251120135426`). Data-cleanup migration `20251209022707` DELETEs garbage products (numeric-only names, address/phone/GST-like names, ≤2-char names) where all three prices are 0, and empty-name rows.
- `order_items`: `gst_percentage numeric(5,2)` + `tax_amount numeric(10,2)` added `20251110092918`; `batch_code` added `20251120135426` with partial index.
- `payment_confirmations` CHECKs: `amount > 0`; `payment_type IN ('full_outstanding','custom_amount','specific_order')`; `status IN ('pending','approved','rejected')`. Four+ overlapping indexes on (pharmacy_id, status, …) accumulated across `20251109131754`/`20251110112044`/`20251110120736`/`20251111210644`. `payment_method TEXT` added `20251110120736`.
- `payment_reminders`: `auto_reminder_enabled BOOLEAN DEFAULT false` + `scheduled_date` (`20251109070411`) with partial index `idx_payment_reminders_scheduled (scheduled_date, status) WHERE auto_reminder_enabled = true` — an auto-reminder scheduling substrate with **no scheduler** anywhere in the codebase. `stockist_id` added + backfilled from orders in `20251109113512`.
- `stockist_details`: bank/UPI/business columns added `20251109053255` (incl `business_hours JSONB`, `delivery_radius NUMERIC`, `default_credit_days INTEGER DEFAULT 30`); dispatch coords + `default_margin_percent NUMERIC DEFAULT 20` added `20251208162808`; **`catalogue_slug`/`catalogue_enabled` have no ADD COLUMN in this migrations folder** (added out-of-band; backfilled `20251109131754`, `20251209022707`); `unique_stockist_profile_id UNIQUE(profile_id)` re-added `20251220115850`.
- `stockist_delivery_rules` CHECK: `rule_type IN ('profit_amount','order_amount','delivery_date','distance','flat_fee')` — five types, of which the DeliverySettings UI (§2.14) only creates three and the fee engine only honors three (see E2.5). Columns: `min_profit_amount`, `min_order_amount`, `free_on_delivery_date BOOLEAN DEFAULT false`, `per_km_charge`, `base_distance_km DEFAULT 0`, `flat_fee`, `priority DEFAULT 1`. Partial index `idx_delivery_rules_stockist (stockist_id, priority) WHERE is_active = true`.
- `stockist_delivery_dates`: `UNIQUE(stockist_id, delivery_date)`; partial index `WHERE is_active = true`.
- `stockist_service_areas`: `UNIQUE(stockist_id, pin_code)` (source of the 23505 dup-PIN error in §2.14); also has `district`/`state` columns the UI never populates (used by `distribute_notice_to_users` geo targeting).
- `catalogue_rate_limits`: `attempt_count INTEGER NOT NULL DEFAULT 1`; documented `action_type` values `'license_verify','order_create','payment_submit'` — only `license_verify` is ever used.
- `batch_delivery_rules`: `min_order_value DEFAULT 0`, `require_payment_clearance BOOLEAN DEFAULT true`, `max_payment_overdue_days DEFAULT 0`, `delivery_day TEXT DEFAULT 'Sunday'` — no UI reads or writes this table (dormant batch-eligibility rules).
- `pharmacy_stockist_connections`: `UNIQUE(pharmacy_id, stockist_id)`; carries its own `credit_limit`/`outstanding_balance` (both DEFAULT 0) — parallel to `pharmacy_details` balances, never reconciled.
- `route_executions.status` DEFAULT `'in_progress'`; `pharmacy_ids UUID[]` + `optimized_order UUID[]` array columns.
- `user_notice_recipients`: `UNIQUE(notice_id, user_id)` — the ON CONFLICT target of the fan-out function.
- `platform_settings`: `setting_value JSONB NOT NULL DEFAULT '{}'`; `setting_key UNIQUE` (constraint duplicated again as `unique_platform_settings_key` in `20251220115850`).

#### RLS policy names & exact predicates (core additions to §15.1)
- `orders`: the anon policy "Public can view orders via license verification" (`USING true`, created `20251109131754`) was **DROPPED** in `20251110130655` as a security fix — public order reads now go only through the service-role edge functions.
- `pharmacy_details` final policy set (post-churn): "Public can verify pharmacy by license" SELECT (anon+authenticated) `USING true`; "Pharmacies can manage their own details authenticated" ALL `USING auth_profile_id = auth.uid() AND has_role(auth.uid(),'pharmacy')`; "Pharmacies can view their own profile" SELECT `USING auth_profile_id = auth.uid() OR profile_id IN (SELECT id FROM stockist_details WHERE profile_id = auth.uid()) OR is_admin()`; "Stockists can insert/view/update their pharmacies" via `profile_id IN (SELECT id FROM stockist_details WHERE profile_id=auth.uid())` (`20251210023517` replaced the earlier `has_role`-based versions).
- `payment_confirmations`: TWO permissive insert policies — "Anonymous can create payment confirmations" (anon, `WITH CHECK true`) and "Authenticated users can create payment confirmations" (`20251110102904`, `WITH CHECK true`) — any client can insert a confirmation for any pharmacy/stockist pair; the trust boundary is the stockist approval step.
- `pharmacy_registration_requests`: stockist SELECT/UPDATE policies join `stockist_service_areas` on `pin_code` with `is_active=true` — the PIN-scoping seen in §2.12 is enforced at the DB, not just the UI.
- `communication_log` stockist policies check only `EXISTS(pharmacy_details WHERE id = communication_log.pharmacy_id)` — i.e. any authenticated user can read/insert logs for any existing pharmacy (no ownership predicate).
- `catalogue_rate_limits`: single policy "Service role can manage rate limits" ALL `USING true WITH CHECK true`.
- `pharmacy_inventory`: "Pharmacies manage own inventory" ALL via `pharmacy_id IN (SELECT id FROM pharmacy_details WHERE auth_profile_id=auth.uid() AND has_role(auth.uid(),'pharmacy'))`; "Admins view all inventory".
- Storage `bills` policy churn: `20251109053255` keyed folders by `auth.uid()`; `20251208143113` and `20251209140707` re-keyed to `stockist_details.id` folders; `20251220115850` added back `auth.uid()`-folder INSERT/SELECT for all authenticated users — both folder conventions are now valid.

#### Trigger bodies (exact, augmenting §14)
- `recalculate_pharmacy_balance()` final (`20251112112641`): `SET outstanding_balance = COALESCE(SUM(total_amount − COALESCE(paid_amount,0)),0) … WHERE pharmacy_id = COALESCE(NEW.pharmacy_id, OLD.pharmacy_id) AND payment_status IN ('unpaid','partial') AND status != 'cancelled'`. Evolution: `20251109080804` original → `20251111025306` added ROUND() → `20251111210644` added cancelled filter → `20251112053344` removed ROUND → final.
- `handle_order_cancellation()`: guard `NEW.status='cancelled' AND OLD.status!='cancelled'`; credits `NEW.paid_amount` (un-rounded in final version; the `20251111210644` version used `ROUND`). The trigger was re-attached in `20251208162808` **without** its original `WHEN (NEW.status='cancelled' AND OLD.status IS DISTINCT FROM 'cancelled')` clause (the in-function guard still protects it).
- `prevent_overpayment()`: **lacks `SECURITY DEFINER` and `SET search_path`** (unlike every other function) — it runs with caller privileges; its embedded `UPDATE pharmacy_details SET credit_balance = credit_balance + excess` is therefore subject to the caller's RLS.
- `create_expiry_alerts()`: `IF NEW.expiry_date > CURRENT_DATE + INTERVAL '30 days' THEN INSERT INTO pharmacy_expiry_alerts (…, alert_days_before=30) ON CONFLICT DO NOTHING` — confirms §14's note: rows already inside the 30-day window never get alerts.
- `check_rate_limit(...)`: row-lock `SELECT … FOR UPDATE` within `now() − p_time_window_minutes`; returns `{allowed:true, attempts_remaining: max−1}` on first attempt; denial payload includes `retry_after_minutes = EXTRACT(EPOCH FROM (last_attempt_at + window − now()))/60`.
- `distribute_notice_to_users(...)`: counts every matching loop iteration **regardless of ON CONFLICT skip**, so the returned recipient count can overstate actual new recipients.
- `search_users_by_batch_code(...)`: pharmacy leg counts `COUNT(DISTINCT oi.id)` (order-item rows, not products) and excludes cancelled orders; `GRANT EXECUTE TO authenticated`.
- `deduct_stock(...)` (`20251208162808`): `UPDATE products SET stock_quantity = stock_quantity − p_quantity WHERE id=… AND stock_quantity >= p_quantity; IF NOT FOUND THEN RETURN false`. Called ONLY by the pharmacy portal checkout; all edge functions do inline JS clamping instead.
- There is **no `handle_new_user` trigger** on `auth.users` and no DB-side order-number generator — profiles/roles are inserted by the client (§19.1) and order numbers are minted in app/edge code.

### E2.4 Workflow traces

New traces (beyond §19):

#### Delivery-fee resolution (pharmacy portal checkout → `calculate-delivery-fee`)
1. `src/pages/pharmacy/PharmacyPortalCheckout.tsx` invokes `calculate-delivery-fee {stockist_id, pharmacy_id, order_total}` per stockist group.
2. Function loads stockist dispatch coords + pharmacy coords; computes Haversine distance only if all four coordinates exist, else `distanceKm=0`.
3. Loads `stockist_delivery_rules` active, **ordered by priority ASC**; first matching rule wins:
   - `order_amount`: `order_total >= min_order_amount` → `{fee:0, is_free:true, reason:"Free delivery for orders above ₹<min>"}`.
   - `flat_fee`: `flat_fee !== null` → `{fee: flat_fee, is_free: flat_fee===0, reason: rule_name || "Flat delivery fee: ₹<fee>"}`.
   - `distance`: `per_km_charge !== null && distanceKm>0` → `fee = round(max(0, distanceKm − base_distance_km) * per_km_charge)`, response includes `distance_km`.
   - `profit_amount` and `delivery_date` rule types are **explicit no-ops** (skipped in the switch) — creatable in the schema but never applied.
4. No rule matched → fallback `order_total >= 5000 ? fee 0 ("Free delivery for orders above ₹5,000") : fee 50 ("Standard delivery fee")`.
5. Every failure path (stockist/pharmacy not found, exception) still returns HTTP **200** with `fee:50` and reasons "Default delivery fee (stockist not found)" / "(pharmacy not found)" / "Default fee due to error" — checkout can never hard-fail on fees.

#### Payment claim with CHECK-constraint failure branch (public catalogue)
1. Pharmacy submits MarkPaymentDialog → `mark-payment-paid` with `payment_type ∈ {full_outstanding, custom_amount, specific_order}` → INSERT succeeds (values allowed by the DB CHECK) with `status:'pending'`.
2. BUT the same edge function's Zod also accepts `cash|cheque|online|custom` (7-value enum); any caller sending those hits the DB CHECK `payment_type IN ('full_outstanding','custom_amount','specific_order')` and the insert fails → generic 400 "Failed to submit payment. Please try again.". Similarly, the stockist-side inserts with `payment_type 'cash'` (OrderActionsDropdown) and `'route_collection'` (SortablePharmacyCard) and the `on_hold` status written by `approve-reject-payment` all conflict with the DB CHECKs (`status IN pending/approved/rejected`) — these paths only work if the deployed DB has looser constraints than the migrations record (see E2.8).
3. Approval trace precision (`approve-reject-payment`): guard "Payment already processed" unless current status ∈ (pending, on_hold); `on_hold` action sets `processed_at=null, processed_by=null` (reversible); on approve with credit: `creditUsed = min(amount, credit_balance)` and **`totalFundsToDistribute = creditUsed + amount`**; after distribution, when credit was used the confirmation's `stockist_notes` is overwritten with `"Applied ₹<credit> from credit + ₹<amount> payment"`.

#### OCR inventory replenishment (stockist, previously undocumented)
Dashboard → OCRScanDialog → base64 image → `parse-order-message` (prompt overridden to extract name/quantity/price) → review table → "Save to Inventory" → per-item exact-name upsert into `products` (add stock + overwrite sale_price) → single `activity_log inventory_updated` row. Failure branches: no file ("select a file" error toast), non-array AI result (error toast), per-item insert/update errors abort with error toast.

#### Order re-totaling (stockist edits)
Two distinct editors with different persistence semantics:
- OrderItemsDialog (per-item CRUD): every mutation immediately persists that item, then re-derives order totals AND payment_status AND pharmacy balance (full cascade).
- EditOrderDialog (bulk replace): totals are computed client-side including phantom fee fields, saved once via delete-all + re-insert of items; payment_status is NOT re-derived here (an order edited below its paid_amount will trip the DB `prevent_overpayment`/payment CHECK instead).

### E2.5 Business rules & calculations

New exact formulas (beyond §10):

- **Haversine distance** (`supabase/functions/calculate-delivery-fee/index.ts`): `R = 6371 km`, standard `a = sin²(Δφ/2) + cosφ₁·cosφ₂·sin²(Δλ/2)`; distance used raw (km, float), displayed at 1 dp in the reason string; per-km fee is `Math.round()`ed to whole rupees.
- **Distance-rule fee**: `fee = max(0, distance_km − base_distance_km) × per_km_charge`, rounded with `Math.round`.
- **Fallback fee rule**: `order_total >= 5000 → 0`, else `50` (mirrored client-side in PharmacyPortalCheckout as `subtotal≥5000?0:50`).
- **EditOrderDialog total**: `subtotal − discountAmount + deliveryFee + instantDeliveryFee`; both fee inputs default 0 and are non-persistent.
- **PaymentLinkDialog partial link amount**: `totalAmount × percentage / 100`, percentage ∈ [1,100] via slider.
- **OrderItemsDialog status derivation**: `paid` iff `paid_amount >= newTotal` (no 0.01 tolerance here, unlike the five FIFO sites); `net_amount = newTotal − paid_amount`.
- **create-platform-order rounding**: order-level `Math.round(total_amount)` and `Math.round(tax_amount||0)`; per-item `Math.round(unit_price)`, `Math.round(total_price)`, `Math.round(tax_amount||0)` — platform orders are stored in whole rupees; item `gst_percentage` defaults to **12** when absent.
- **Balance recompute in create-platform-order**: `newBalance = Σ (round(total) − round(paid))` over unpaid/partial (rounds each side, unlike the DB trigger which doesn't round).
- **get-pharmacy-outstanding-orders filter**: keeps orders where `round(total_amount) > round(paid_amount)` — sub-rupee residues are treated as settled for display.
- **Batch-cycle economics** (`create-batch-cycle`): `total_pharmacies = new Set(orders.map(pharmacy_id)).size`; `delivery_cost = orders.length × 12`; `cost_savings = orders.length × 60 − orders.length × 12` (= `orders × 48`).
- **reduce-stock-for-order**: `reduceAmount = min(quantity, currentStock)`; `newStock = max(0, currentStock − quantity)`; low-stock warning when `newStock <= (min_stock_threshold || 10)`; auto-created products are inserted with `stock_quantity = quantity` then immediately updated to 0 (two writes so the activity log can record "initial stock").
- **process-bill-image auto-product pricing**: `purchase_price = item.price||0`, `sale_price = price × 1.2`, `mrp = price × 1.3`, `gst 5` — a hardcoded 20%/30% markup model.
- **DB payment-status invariant** (CHECK, `20251110125029`): `paid ⇒ paid_amount≥total`; `partial ⇒ 0<paid<total`; `unpaid ⇒ paid∈{NULL,0}` — enforced on every orders write, beneath all client logic.
- **GST DB default vs client default**: `products.gst_percentage` DB default **18**, client insert paths default **5**, platform order items default **12** — three different defaults by surface.

### E2.6 API/edge-function reference deep detail

Request/response/error precision beyond §9 (all files `supabase/functions/<name>/index.ts`):

- **calculate-delivery-fee** — req `{stockist_id, pharmacy_id, order_total}`; res `{fee, is_free, reason, distance_km?}`; ALL paths HTTP 200 (even catch-all: `{error, fee:50, is_free:false, reason:"Default fee due to error"}`); no writes; SERVICE_ROLE.
- **mark-payment-paid** — Zod `{pharmacy_id: uuid, stockist_id: uuid, order_id?: uuid|null, amount: coerced number 1..10,000,000, payment_type: 7-value enum, pharmacy_notes?: ≤500|null}`; res `{success:true, amount, payment_type, message:"Payment marked for approval. The stockist will verify and confirm."}`; errors: Zod→400 "Invalid payment data provided", other→400 "Failed to submit payment. Please try again."; single INSERT `payment_confirmations {…, status:'pending'}`; ANON key.
- **approve-reject-payment** — Zod `{confirmation_id: uuid, action: 'approve'|'reject'|'on_hold', stockist_notes?: ≤500|null}`; res `{success:true, message:"Payment <action>d successfully"}`; errors: missing/invalid auth→**401** `{error:"Unauthorized"}`, Zod→400 "Invalid payment approval data provided", not-found / already-processed / other→400 "Failed to process payment. Please try again."; ordered side effects: read confirmation (`pharmacy_details!inner` join) → status guard → update confirmation → (approve) credit read → credit deduction → single-order or FIFO application → excess/leftover to credit → cleanup pass → conditional stockist_notes rewrite.
- **create-platform-order** — full Zod: items 1..100 of `{product_name 1..200, product_description? ≤500, quantity int 1..10000, unit_price 0..1e6, total_price 0..1e7, gst_percentage? 0..100, tax_amount? ≥0}`; optional `subtotal`, `tax_amount ≤1e7`, `delivery_address ≤500`, `notes ≤1000`; res `{success:true, order:{id, order_number, total_amount}}`; errors: Zod→400 "Invalid order data provided", other→400 "Failed to create order. Please try again."
- **verify-pharmacy-license** — Zod `{stockist_slug 1..100, license_number 1..100, pharmacy_pin_code?}`; rate limit key = `license_number.toLowerCase()`, action `'license_verify'`, 5/15 min → **429** `{verified:false, rate_limited:true, message:"Too many verification attempts. Please try again in <ceil(retry_after_minutes)> minutes."}`. Negative responses (all HTTP 200) verbatim: "Invalid catalogue link. Stockist not found." / "Catalogue is currently unavailable." (+suggestion "Please contact the stockist for the correct catalogue link."); "Error verifying license. Please try again."; PIN miss → `{message:"This stockist does not deliver to PIN code <pin>.", suggestion:"Please contact <stockist_name> to check their delivery coverage area.", stockist:{name, phone, company}}`; license miss → `{message:"License number \"<x>\" is not registered or inactive.", …, attempts_remaining}`. Positive res `{verified:true, pharmacy:{id,name,license_number,outstanding_balance,credit_balance}, stockist:{id,name,company_name,upi_id}, orders: last 10}`.
- **get-pharmacy-outstanding-orders** — Zod `{pharmacy_id: uuid, stockist_id: uuid}`; res `{success:true, orders:[{id, order_number, created_at, total_amount, paid_amount, payment_status, order_items:[{product_name, product_description, quantity, unit_price, total_price}]}]}` ordered created_at ASC; errors: Zod→400 "Invalid request data", other→400 "Failed to fetch outstanding orders".
- **create-batch-cycle** — req `{stockistId, startDate, endDate, deliveryDate}` (NO Zod, NO auth check beyond platform JWT); res = the raw inserted `order_batch_cycles` row; error→**500** `{error: message||'Unknown error'}`; side effects: read orders in range (status pending|confirmed) → insert cycle → stamp `batch_cycle_id` on those orders.
- **reduce-stock-for-order** — Zod `{order_id: uuid, stockist_id: uuid, items: 1..100 of {product_name 1..200, quantity int 1..10000}}`; res `{success:true, order_id, results:{reduced:[{product_id, product_name, quantity_reduced, previous_stock, new_stock, auto_created?}], failed:[{product_name, reason, error}], warnings: string[]}}`; per-item errors are collected, not fatal; top-level Zod→**500** "Invalid stock reduction data provided".
- **parse-order-message** — status ladder: no Authorization→401 `{error:'Unauthorized'}`; body>100000 bytes→**413** `{error:'Request too large'}`; bad orderText→400 `{error:'Invalid orderText'}`; stockistId fails `/^[0-9a-f-]{36}$/i`→400 `{error:'Invalid stockistId'}`; no user→401; stockist not owned→**403** `{error:'Access denied'}`; catch-all→500 via `sanitizeError` (maps permission/policy→'Access denied', not found→'Resource not found', invalid→'Invalid request data', else 'An error occurred processing your request'). AI JSON extracted via `content.match(/\{[\s\S]*\}/)`.
- **process-bill-image** — req `{image, stockist_id, pharmacy_id?, pharmacy_name?, license_number?, address?, items?, create_new_pharmacy?}`; `useProvidedData = pharmacy_name && items.length>0`; image URL must be https with host containing 'supabase' or 'lovable' (unless preview data provided); errors 401/400 'Invalid or missing image URL'/'Invalid image URL format'/'Invalid stockist_id'/403 'Access denied'/500 sanitized; res `{success:true, order_number, order_id, stock_update:{reduced, created, failed}}`; extracted pharmacy_name truncated to 200 chars; auto-created pharmacy rows get `gst_number:'PENDING'`.
- **extract-bill-items** — every outcome HTTP 200; error strings verbatim: "Invalid or missing image URL", "Invalid image URL format", "Rate limit exceeded. Please try again in a few moments." (AI 429), "AI credits exhausted. Please add credits to your workspace." (AI 402), "AI service temporarily unavailable", "No data extracted from image", "Could not parse response from AI", "No items found in the image", "No valid items could be extracted", fallback "Failed to process image"; success `{ok:true, pharmacy_name?≤200, items:[{name≤200, quantity int≥1, price≥0}]}`.
- **optimize-route** — req `{startingPoint, pharmacies:[{id,name,address,coordinates?,google_maps_name?}]}`; location string priority per pharmacy: `coordinates` (if contains ',') → `google_maps_name` → `"<name>, <address>"`; Google element failure → distance 999 km; AI JSON parse failure → sequential route with `totalDistance = count×8` and explanation "Using default sequential route due to parsing error"; res `{optimizedOrder: uuid[], distances: number[], totalDistance, explanation}`; error→500 `{error, details:"Failed to optimize route. Using default order."}`.
- **chat-assistant** — validation errors (400): "Role or user ID is required", "stockist_id is required for stockist role", "pharmacy_id is required for pharmacy role", "messages array is required"; role inference `role || (stockist_id?'stockist' : pharmacy_id?'pharmacy' : null)`; AI 429→**429** "Rate limit exceeded. Please try again in a moment."; AI 402→**402** "AI credits exhausted. Please add credits to continue."; res `{response: string, usage}`. Admin tool set (previously unlisted): `get_platform_stats` (orders count+sum, profiles count), `get_all_users_count` (user_roles grouped by role), `get_pending_approvals` (registration requests where admin_approved null/false), `get_active_recalls`, `get_recent_activity` (latest 10 audit_logs). Pharmacy tool `get_pharmacy_inventory` selects `min_quantity` — a column that does not exist on `pharmacy_inventory` (actual: `low_stock_threshold`) so that tool call errors at runtime.

### E2.7 Role journeys step-by-step

§19–§20 already trace the primary journeys click-by-click. Genuinely new journey fragments only:

- **Stockist — OCR inventory top-up**: `/stockist/home` → Quick Actions → OCR Scan → choose photo/PDF of a supplier bill → "Scan & Extract Items" → review name/qty/price rows → "Save to Inventory" → stock added to exact-name-matched products, unknown lines become new products priced at the scanned price (mrp=sale=price) → activity feed shows "OCR scan added N products" (`src/components/dashboard/OCRScanDialog.tsx`).
- **Stockist — data export**: `/stockist/home` → Quick Actions → Export Data → pick Orders/Payments/Activity → "Export to CSV" → browser downloads `orders_<date>.csv` etc. with raw column dumps (`src/components/dashboard/ExportDataDialog.tsx`).
- **Stockist — putting a payment on hold and resuming**: `/stockist/payment-approvals` → Review → "Put on Hold" → confirmation shows ⏸ on_hold on both stockist list and pharmacy catalogue dashboard; later Review again (button reappears because status is on_hold) → Approve/Reject; on_hold left `processed_at/processed_by` null so the audit trail starts at final decision (`src/pages/PaymentApprovals.tsx`, `supabase/functions/approve-reject-payment/index.ts`).
- **Admin — configuring announcements**: `/settings` → Manage tab → edit title/message/show_banner per role → save → toast "<Role> announcement updated!" → stockist/pharmacy dashboards render the banner from `platform_settings` on next load (`src/pages/Settings.tsx`).
- **Pharmacy (public catalogue) — rate-limit lockout path**: 5 failed license attempts within 15 min → HTTP 429 → LicenseVerification shows the retry-minutes message; the counter is keyed by the license string (lowercased), not IP, so trying a different license resets attempts (`supabase/functions/verify-pharmacy-license/index.ts`).

Otherwise: **No new findings beyond existing review** (§19.1–19.7, §20 remain the authoritative journeys).

### E2.8 Hidden/internal functionality

- **Seeded admin account**: migration `20251209090314` grants `admin` role to the profile with email **`jitesh.cse.apm@gmail.com`**; it also mass-deletes duplicate roles (drops pharmacy role when stockist/admin exists, stockist when admin exists) and executes `DELETE FROM user_roles WHERE role='mr'` (wiping all MR roles at that point). `20251209090338` strips the stockist role from hardcoded user `80b4cd8c-9323-4d79-a8b6-48499d78e699`.
- **Seeded `platform_settings`** (`20251209102746`, `ON CONFLICT DO NOTHING`): `app_info = {"name":"Digi Swasthya Store","version":"1.0.0","tagline":"Connecting Pharmacies with Stockists","developer":"Digi Swasthya Technologies","developer_email":"support@digiswasthya.com","copyright":"© 2024 Digi Swasthya Store. All rights reserved."}`; stockist/pharmacy announcements default `show_banner: true` with "Welcome to Digi Swasthya Store!" titles; admin announcement `show_banner: false`. Later migrations (`20251219124937`, `20251220115850`) attempt re-seeds with different taglines but are no-ops due to DO NOTHING (first write wins).
- **Complete browser-storage key inventory** (consolidating; new keys in bold):
  - localStorage: `pharmacy_session`, `pharmacy_cart` (`src/contexts/PharmacyContext.tsx`), per-user portal cart `${role}_cart_${userId}` (`src/contexts/CartContext.tsx`), **`pwa-install-dismissed`** (`src/components/PWAInstallPrompt.tsx`), onboarding flags via `STORAGE_KEYS` incl `onboarding_completed_catalogue` (`src/components/onboarding/OnboardingCarousel.tsx` writes; `LicenseVerification.tsx`, `StockistOnboarding.tsx`, `PharmacyOnboarding.tsx` read), `offline_sync_queue` (`src/lib/offlineSync.ts`), Supabase auth token (`src/integrations/supabase/client.ts` `storage: localStorage`). AuthContext sign-out executes `localStorage.clear()` + `sessionStorage.clear()` wholesale.
  - sessionStorage: **`stockist-chat-messages`**, **`pharmacy-chat-messages`**, **`admin-chat-messages`**, **`chat-messages`** (chat assistants), **`catalogue_pharmacy`**, **`catalogue_stockist`** (`src/pages/catalogue/PharmacyCatalogue.tsx` reads these as a secondary session mirror).
- **Migrations-vs-runtime constraint conflicts** (dead-but-wired paths that depend on the deployed DB being looser than the migrations): `payment_confirmations.payment_type` CHECK (3 values) vs runtime writers using `cash` (OrderActionsDropdown, `manual_partial`), `route_collection` (SortablePharmacyCard), and `mark-payment-paid`'s 7-value Zod enum; `payment_confirmations.status` CHECK lacks `'on_hold'` which `approve-reject-payment` writes; `orders.delivery_status` CHECK lacks `'dispatched'` (used in UI vocab §10) while allowing `'packed'` which nothing writes.
- **Dormant DB surface**: `batch_delivery_rules` (payment-clearance/delivery-day gating for batch cycles — no reader/writer); `payment_reminders.auto_reminder_enabled` + `scheduled_date` + partial index (no scheduler); `pharmacy_stockist_connections` per-connection credit fields (never reconciled with `pharmacy_details`); `catalogue_rate_limits.action_type` values `'order_create'`/`'payment_submit'` (defined, never rate-limited); `stockist_service_areas.district/state` (only used by notice fan-out, never populated by UI); `stockist_details.business_hours/delivery_radius/default_margin_percent` (written nowhere); legacy enum `public.user_role` orphaned since `20251108163342`.
- **`deduct_stock` RPC asymmetry**: the only atomic, non-negative-safe stock decrement exists in the DB but is called solely by the pharmacy portal checkout; all edge functions re-implement clamped JS decrements (`max(0, …)`), which are not atomic.
- **`/pay/:orderNumber` ghost URL**: PaymentLinkDialog's copyable web link targets a route that does not exist in `src/App.tsx` (falls through to NotFound).
- **Trigger re-attachment drift** (`20251208162808`): `trg_orders_handle_cancel` and the overpayment trigger were re-created without their original `WHEN` clauses, and the overpayment trigger renamed `trg_orders_prevent_overpayment` — behavior preserved by in-function guards, but every orders UPDATE now invokes all three trigger functions unconditionally.
- **Data-hygiene migrations as hidden behavior**: `20251209022707` silently deletes "garbage" products (regex-classified junk names with zero prices) — an OCR-artifact cleanup encoded in schema history; the same migration backfills `catalogue_slug`.
- **`OrderCard` prop under-passing**: because `OrderCard.tsx` omits `pharmacyId/paidAmount/orderNumber` when rendering `OrderActionsDropdown`, mobile Mark-as-Paid actions skip the confirmation-record insert and partial payments miscompute against `paidAmount=0` — a hidden divergence between desktop table and mobile card behavior on `/stockist/orders`.

### E2.9 Validation & error-handling catalog

Client-side Zod schemas (only two exist in `src/`; the rest of the client validates manually):
- `src/components/dashboard/QuickOrderDialog.tsx`: `quickOrderSchema = z.object({ pharmacyId: z.string().min(1, "Please select a pharmacy"), orderText: z.string().min(10, "Order text must be at least 10 characters") })`.
- `src/components/dashboard/QuickBillDialog.tsx`: `quickBillSchema = z.object({ pharmacyId: z.string().min(1, "Please select a pharmacy"), items: z.array(z.any()).min(1, "Please add at least one item") })`.

Auth pages, verbatim (`src/pages/Login.tsx`, `ResetPassword.tsx`, `ForgotPassword.tsx`):
- Login: "Please select your role" (signup w/o role card), "Passwords do not match", "Password must be at least 6 characters", "Login successful!", "Failed to login", "Account created successfully!", "An account with this email already exists. Please login instead." (matched on error text), "Failed to create account".
- ResetPassword: "Invalid or expired reset link" (no recovery session), "Passwords do not match", "Password must be at least 6 characters", "Password updated successfully", "Failed to update password".
- ForgotPassword: "Password reset link sent to your email", "Failed to send reset email".

Stockist configuration (`src/pages/stockist/DeliverySettings.tsx`), verbatim: "Please enter a valid 6-digit PIN code" (regex/length gate before insert), "This PIN code already exists" (Postgres 23505 on `UNIQUE(stockist_id,pin_code)`), "Failed to add service area", "Service area added", "Date enabled"/"Date disabled", "Delivery date added", "Area enabled"/"Area disabled", "Service area removed", "Please enter a value" (fee rule without value), "Delivery rule added", "Rule removed".

Pharmacy flows, verbatim: PharmacyRegistration — "Registration submitted successfully! You will be notified once approved.", "Failed to submit registration: <message>". PharmacyPortalCheckout — "Failed to load checkout data", "Pharmacy details not found", `` `Order ${orderNumber} placed successfully!` ``, "Failed to place order: <message>". Public catalogue — LicenseVerification "License verified successfully"; PharmacyCheckout "Order placed successfully!", "Failed to place order. Please try again.", "UPI link copied!".

Support & Settings, verbatim: listed under E2.1.

Edge-function error strings (canonical list; all generic-by-design via `sanitizeError` to avoid leaking internals): "Invalid payment data provided", "Failed to submit payment. Please try again.", "Invalid payment approval data provided", "Failed to process payment. Please try again.", "Unauthorized", "Invalid order data provided", "Failed to create order. Please try again.", "Invalid request data", "Failed to fetch outstanding orders", "Invalid stock reduction data provided", "Failed to reduce stock. Please try again.", "Request too large", "Invalid orderText", "Invalid stockistId", "Access denied", "Resource not found", "An error occurred processing your request", "Invalid or missing image URL", "Invalid image URL format", "Invalid stockist_id", plus the extract-bill-items and verify-pharmacy-license message sets quoted verbatim in E2.6.

Server-side (DB) validation layer, consolidated: `payment_confirmations` `amount > 0` CHECK; `orders` dual payment-status CHECKs; `orders_delivery_status_check` 6-value list; `campaigns.discount_percentage` 0..100 CHECK; `platform_fees.fee_value >= 0` CHECK; unique constraints surfacing as 23505 (`orders.order_number`, `stockist_service_areas(stockist_id,pin_code)`, `stockist_delivery_dates(stockist_id,delivery_date)`, `user_roles(user_id,role)`, `user_notice_recipients(notice_id,user_id)`, `pharmacy_stockist_connections(pharmacy_id,stockist_id)`, `message_templates.template_name`, `territories.territory_name`, `platform_settings.setting_key`, `invoices.invoice_number`, `disputes.dispute_number`, `batch_recalls.recall_number`).

---

*End of Expansion Pass 2 (2026-07-08). All statements above derived directly from source at the cited paths; no evaluation or recommendations included.*
