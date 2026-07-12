> **Extracted from** [`UNIFIED_FEATURES.md`](../UNIFIED_FEATURES.md) Appendix B (HUB).
> **Source repo:** `digi-swasthya-hub (HUB)`
> Use [`EXHAUSTIVE_REVIEW_PROMPT.md`](../EXHAUSTIVE_REVIEW_PROMPT.md) to re-run or extend this review.

# Digi Swasthya Hub — EXHAUSTIVE Functional Review (code-derived)

> Deep, source-verified functional review going beyond `FEATURES.md`. Captures every role, page, section, form field (name/type/validation/default), flow step, calculation, state transition, edge case, edge-function contract, and known stub — with exact identifiers from the code.
>
> Stack: Vite 5 + React 18 + TS · shadcn/Tailwind · React Router v6 · TanStack Query v5 (global `staleTime 60s`, `gcTime 300s`, `refetchOnWindowFocus false`) · Supabase (Auth/Postgres/Storage/Realtime/Deno edge fns) · Lovable AI Gateway · recharts · jsPDF + html2canvas + qrcode.react + xlsx.

---

## 0. GLOBAL ARCHITECTURE & CROSS-CUTTING

### 0.1 Routing & guards (`src/App.tsx`)
- `queryClient` default options: `staleTime 60000`, `gcTime 300000`, `refetchOnWindowFocus:false`.
- `initTheme()` runs at module load: reads `localStorage["theme"]` — `"dark"` adds `.dark`; `"system"` uses `matchMedia("(prefers-color-scheme: dark)")`; else removes `.dark`.
- **`UpdateBanner`** (mounted OUTSIDE router): registers `/sw.js`, listens `updatefound`/`statechange`, shows fixed top banner "A new version is available!" with "Update Now" → `postMessage({type:'SKIP_WAITING'})`; `controllerchange` → `window.location.reload()`. This is a SECOND update mechanism alongside `useVersionCheck` in `AppLayout` (duplicated logic).
- **`ProtectedRoute`**: `if loading → Spinner`; `if !user → /login`; `if role && !roles.includes(role) → /login`. No approval/onboarding redirect here (approval gating happens only in `Login`).
- **`RootRedirect`** priority: admin → stockist → pharmacy → customer → doctor → `/login`.
- **`SuspenseWrap`** = `ErrorBoundary` + `Suspense` (Spinner fallback). All non-auth pages are `lazy()`.
- Public routes: `/login`, `/register`, `/forgot-password`, `/reset-password`, `/pending-approval`, `/onboarding/stockist`, `/onboarding/pharmacy`, `/staff/login`, `/staff`, `/verify-bill/:billId`, `*` (NotFound).
- Five role layouts each render `<AppLayout>` with a per-role `navItems` + `basePath`. Only `PharmacyLayout` passes `showModeToggle purchaseNav saleNav`.

### 0.2 `AppLayout` (`components/layout/AppLayout.tsx`)
Mounts `useRealtimeNotifications()`, `useSessionTimeout()`, `useVersionCheck()`, `usePharmacyMode()`. Renders `OfflineBanner`, `ToSDialog`, update banner (from `useVersionCheck.updateAvailable` → `applyUpdate`), `TopNav`, `<Outlet context={{ pharmacyMode: mode }}>`, `BottomNav`. `activeNav` swaps purchase/sale nav for pharmacy by `mode`.

### 0.3 `TopNav` (`components/layout/TopNav.tsx`)
- Left: platform logo from `platform_settings.key='logo_url'` (`staleTime 600000`), else Pill icon; business name + user name.
- Right icons: **Chat** (`MessageSquareText`) → admin `/admin/messages`, others `${base}/chats`; unread badge = `messages(receiver_id, read=false)` + `peer_messages(receiver_id, read=false)` counts (`refetchInterval 30000`). **Bell** → `notifications` (relative "notifications") with unread count (`notifications.user_id, read=false`, `refetchInterval 30000`). **Avatar**: for pharmacy (showModeToggle) → Popover with user info + "Purchase View"/"Sale View" toggle + "View Profile"; others → click navigates to `profile`.
- `avatarUrl` from `profiles.avatar_url` by `user.id`.

### 0.4 `BottomNav`
5 fixed items per role; active match = exact path or `startsWith(fullPath + "/")`; index path matches exact base.

### 0.5 Hooks
- **`useAuth`**: `getSession()` then `onAuthStateChange`; `fetchUserData` deduped by `fetchedForUser` ref; `Promise.all([user_roles, profiles(full_name,avatar_url)])`. `SIGNED_OUT` clears state. Exposes `{user, roles, loading, profile, signOut}`.
- **`useStockistProfile/usePharmacyProfile/useCustomerProfile/useDoctorProfile`**: `select("*")` from `*_profiles` by `user_id`, `.single()`, `staleTime 300000`, `enabled:!!user`. The **profile.id** keys nearly all child queries (NOT `user.id`).
- **`useCart`** (`localStorage["digi_swasthya_cart"]` `{items, pharmacyId}`): single-pharmacy enforced — adding from a different pharmacy fires `toast.error` with "Clear Cart" action (clears + adds). `addItem` merges quantity for same `product_id`. `removeItem` clears `pharmacyId` when empty. `updateQuantity ≤0` removes. Derived: `total = Σ price×qty`, `itemCount = Σ qty`, `hasPrescriptionItems = some(requires_prescription)`. CartItem fields: `product_id, product_name, quantity, price, pharmacy_id, requires_prescription`.
- **`usePharmacyMode`** (`localStorage["pharmacy_mode"]`, default `"purchase"`): `{mode, setMode, toggleMode}`.
- **`useSessionTimeout(30min)`**: resets on `mousedown/keydown/touchstart/scroll`; on timeout `toast.warning("Session expired due to inactivity")` + `signOut()`. 5-min heartbeat updates `profiles.updated_at`.
- **`useAutoFillProduct`**: validates ≥3 chars, invokes `autofill-product-details`; toasts `"${fields_filled} fields suggested"` / "No details found".
- **`usePaginatedQuery`**: page size default 20, `range(from,to)`, `count:"exact"`, `staleTime 15000`. Exposes page/totalPages/hasMore/next/prev/goToPage. (Note: filter application — many callers pass filters but tab counts computed client-side per page.)
- **`useRealtimeNotifications`**: channel `notifications-${user.id}`, INSERT filter `user_id=eq`, invalidates `["notifications", user.id]` + toast.
- **`useVersionCheck`**: `APP_VERSION="1.0.0"` (⚠ diverges from `constants.APP_VERSION="2.0.0"`); polls `reg.update()` every 5 min; `applyUpdate` posts SKIP_WAITING + reload.
- **`useToSAcceptance`**: `localStorage["tos_accepted"]`, sets `tos_accepted_at` on accept.
- **`useOfflineDetector`**: `navigator.onLine` + online/offline events.

### 0.6 Shared components
- **`SharedProductCard`**: computes `stockQty = stock_quantity ?? quantity ?? 0`, `salePrice = sale_price ?? price ?? 0`, `isExpiringSoon = expiry < now+90d`, `isExpired = expiry < now`, `margin = round((salePrice-purchase_rate)/salePrice*100)`. Badges: Out of Stock (`stockQty≤0`), Rx (`requires_prescription`), Hidden (pharmacy + `is_visible_to_customers===false`), Narcotic (`is_narcotic`). Shows up to 3 active batches (`stock_quantity>0`) + "+N more". Customer role shows Add-to-Cart / qty steppers. Purchase rate + margin only for stockist/pharmacy/admin.
- **`SharedProductDetail`** (used by stockist & pharmacy detail; pharmacy=`pharmacy_inventory`, stockist=`products`): gallery (`product_media`/`pharmacy_inventory_media`), batches (stockist only, `product_batches` asc), **6-month sales chart** built from `order_items⋈orders` (stockist) or `customer_order_items⋈customer_orders` matched by `product_name` (pharmacy), excluding cancelled. Stock value = `Σ activeBatch.stock_quantity × purchase_rate`. Actions: Clone (stockist, name+" (Copy)"), Edit, Delete (`confirm`), Add-to-Cart (customer), visibility toggle (pharmacy → `is_visible_to_customers`). Expiry display logic: 0 batches→product.expiry; 1 batch→that batch; >1→"N/A (see Batch History)". Embeds `BatchManager` (stockist).
- **`BatchManager`**: inserts `product_batches` (batch_number/mrp/sale_price/purchase_rate/stock_quantity/expiry_date), then re-aggregates product `stock_quantity=Σ batch stocks`, `in_stock=total>0`, but sets headline `sale_price/price/mrp/batch_number/expiry_date` from the **latest** batch (`created_at desc`) → LIFO headline price, not FIFO. "Quick Add" prefills from most-recent batch (qty blank). Validation: needs batch_number OR stock_quantity.
- **`StockAlerts`** (stockist/pharmacy): lists items with `min_stock_level>0 && qty≤min`. "Send Alert Notification" inserts a `notifications` row to the CURRENT user (self-notify).
- **`ReorderSuggestions`** (pharmacy): low-stock list; "Quick Reorder" → `/pharmacy/orders/quick`; "Auto-Reorder" copies `${name} x ${deficit}` (deficit = `max(1, min−qty)`, min defaults 10) to clipboard then navigates.
- **`QuickActions`/`KpiCard`/`MenuPage`/`EmptyState`/`PaginationControls`/`BackButton`/`OfflineBanner`/`ToSDialog`/`ProductGalleryUploader`/`ProductImageGallery`/`DoctorReviews`** — presentational; `MenuPage` footer hardcodes "Digi Swasthya v1.0.0".

### 0.7 Constants (`lib/constants.ts`, `lib/pharma-brands.ts`)
- `ORDER_STATUS_COLORS`, `PAYMENT_STATUS_COLORS`, `ORDER_STATUS_LABELS` maps.
- `getGreeting()`: <12 morning / <17 afternoon / else evening.
- `APP_VERSION="2.0.0"`.
- `PHARMA_BRANDS` (~100 Indian brands). `PRODUCT_CATEGORIES` (16). `GST_RATES` `["0%","5%","12%","18%","28%"]`. `DRUG_SCHEDULES` `["None","H","H1","X","G","J"]`. `DRUG_TYPES` `["Allopathy","Ayurvedic","Homeopathy","Unani"]`. `PACK_TYPES` (13). `INDIAN_STATES_CITIES` full map + `getCitiesForState`.
- `format-date.ts`: `formatDate` "dd MMM yyyy", `formatDateTime` "dd MMM yyyy, hh:mm a", `formatRelative`.
- `generate-receipt-pdf.ts`: A5 jsPDF "PAYMENT RECEIPT" (stockist→pharmacy, amount, method, ref, notes) → `receipt-<8>.pdf`.

---

## 1. AUTHENTICATION, ONBOARDING & SESSIONS

### 1.1 Login (`pages/Login.tsx`)
- **Role picker** cards: Customer(label "Patient"), Pharmacy, Stockist, Doctor. Admin hidden.
- **`roleConfig`** labels/subtitles per role. **Dev-only** `devCredentials` prefill on role select when `import.meta.env.DEV` (patient1/pharmacy1/stockist1/doctor1@gmail.com pw `12345678`; admin `jitesh.cse.apm@gmail.com`/`Jitesh@123`).
- **5-tap admin reveal**: `handleLogoTap` — 5 taps within 1500ms sets `adminMode`, selects admin, toast "Admin login enabled". Also a dev-only "Admin Login (Dev)" button.
- **PWA install banner**: `beforeinstallprompt` captured; `handleInstall` prompts; hidden if standalone.
- **Login flow (`handleLogin`)**: (1) `rpc("check_login_rate_limit",{p_email})` — `false` → "Too many failed attempts... 15 minutes". (2) `signInWithPassword`. (3) on error `record_login_attempt({p_success:false})` + tailored messages ("Invalid login"→..., "Email not confirmed"→...). (4) on success `record_login_attempt(true)`. (5) fetch `user_roles`; if selected role not held → `signOut()` + role-mismatch error. (6) approval gate for stockist/pharmacy/doctor: read `approval_status` — `pending`→`/pending-approval`; `rejected`→`signOut()`+error. Customers never gated. (7) `navigate("/"+role)`.
- Fields: email (type=email, required), password (type=password, required, show/hide toggle). **"Remember me" checkbox exists but is NOT wired.** "Delivery Staff Login →" link to `/staff/login`. Footer: "A brand of Chameleon - The Agency (OPC) Pvt Ltd."

### 1.2 Registration (`pages/Register.tsx` → 4 components)
Type picker (Customer/Pharmacy/Stockist/Doctor). Each form: `auth.signUp({email,password,options:{emailRedirectTo:origin, data:{full_name}}})` → insert `user_roles` → insert profile. Password min 6 (Supabase default). All docs upload to the single **`documents`** bucket.

**CustomerRegistration** (3 steps: Personal/Address/Complete): fields fullName*, phone*, email*, password*, gender(male/female/other), dateOfBirth, address*, state*(→resets city), city*(disabled until state), pinCode*(digits, 6 max). Step gates: step0 needs name+phone+email+password; step1 needs address+city+state+pin. **Auto-active** (no docs, no admin notify). Inserts `customer_profiles`.

**PharmacyRegistration** (5 steps: Pharmacy/Documents/Contact/Bank/Complete). Fields: pharmacyName*, pharmacyType*(Retail/Hospital/Chain/Clinic/Online), licenseNumber; docs drugLicense/gstCertificate/pharmacyCertificate (+ drugLicenseNumber, gstNumber text); ownerName*, ownerDesignation, ownerContact, phone*, whatsappNumber, email*, password*, address*, state*, city*, pinCode*; bank optional (bankName, accountNumber, ifscCode(uppercase), upiId, accountHolderName). Docs → `documents` bucket **public URL**; columns `drug_license_url`/`gst_certificate_url`/`pharmacy_certificate_url`. Notifies all admins (`type:"registration"`). Approval **pending**. Has "Skip" → login. Doc field shows "⏳ Pending" badge; Eye/RefreshCw/Trash buttons (Eye is decorative).

**StockistRegistration** (5 steps). Business types: "Pharmaceutical Stockist", "Pharmaceutical Wholesale Distributor", "Medical Representative" (reveals brand picker from `PHARMA_BRANDS` + "+ Add New" custom + MR agreement doc). Fields: businessName*, businessType*, panNumber*(uppercase, 10), mrBrand/mrBrandCustom; docs drugLicense(Form 20B/21B)/gstCertificate/wholesaleLicense/fssaiLicense (+ numbers) + mrAgreement (MR only); phone*, whatsappNumber, email*, password*, address*, state*, city*, pinCode*; **serviceable-area PIN chips** (6-digit validated, dedup); bank **required** (bankName*, accountNumber*, ifscCode*, upiId, accountHolderName*). **PIN gate**: on submit checks `admin_serviceable_areas` where `pin_code=form.pinCode AND is_active=true` — if none → error "not in serviceable area". Inserts `stockist_profiles` (+ `serviceable_areas` rows per PIN chip). Notifies admins. Approval **pending**.

**DoctorRegistration** (5 steps: Professional/Documents/Contact/Rates/Complete). 20 hardcoded SPECIALIZATIONS. Fields: fullName*, specialization*, qualification, registrationNumber, experienceYears(number), bio; docs medicalCertificate, idProof; phone*, email*, password*, address*, state*, city*, pinCode*; **default fees audio=300, video=500, clinic=200** (`consultation_fee_audio/video/clinic`). Docs → public URL (`medical_certificate_url`, `id_proof_url`). Notifies admins. Approval **pending**.

### 1.3 PendingApproval (`pages/PendingApproval.tsx`)
Reads `approval_status`+`rejection_reason` from role table (stockist/pharmacy/doctor). If `rejected`: shows reason + **resubmission**: upload corrected doc → `documents` at `resubmissions/{userId}/…` → `createSignedUrl(365d)` → update profile `[docField]=signedUrl`, `approval_status="pending"`, `rejection_reason=null`. `docField` = `medical_certificate_url` for doctor else **`license_url`** (⚠ differs from registration columns `drug_license_url` etc.). Logout → `/login`.

### 1.4 Forgot/Reset password
`ForgotPassword`: `resetPasswordForEmail(email,{redirectTo:origin+/reset-password})`; success screen. `ResetPassword`: listens `PASSWORD_RECOVERY` event or `#type=recovery` in hash; requires match + min 6; `updateUser({password})`. Invalid link → "Request New Link".

### 1.5 Onboarding
`StockistOnboarding`/`PharmacyOnboarding`: **static 3-slide carousels** (hardcoded copy), Skip/Next/Get Started → role dashboard. No data written, no "seen" flag. Routes exist but nothing auto-navigates to them.

---

## 2. STAFF (DELIVERY) MODULE — separate credential system

### 2.1 StaffLogin (`pages/staff/StaffLogin.tsx`)
Fields username, password. Calls `rpc("verify_staff_credentials",{p_username,p_password,p_staff_type})` **twice** — first `"stockist"`, then `"pharmacy"`. On `valid` → `localStorage["staff_session"]` `{id,name,phone,stockist_id|pharmacy_id,store_name,staff_type,_verified:true,loginAt:Date.now()}`. Else "Invalid credentials or account inactive".

### 2.2 StaffDashboard (`pages/staff/StaffDashboard.tsx`)
- `SESSION_TTL_MS = 24h`. `validateSession`: missing → `/staff/login`; expired (loginAt+24h) → clear+redirect; else re-validate server-side against `delivery_staff`/`pharmacy_delivery_staff` by id (`is_active`) — inactive → logout.
- Orders: stockist staff → `orders` where `assigned_staff_id=id AND status∈{packed,dispatched,out_for_delivery}`; pharmacy staff → `customer_orders` where `status∈{preparing,out_for_delivery}`. Delivered list limit 10.
- **KPI row**: Pending (`orders.length`), Today (delivered created today), Total (delivered).
- **Plan Route**: multi-select order cards → Google Maps `dir/?api=1&destination=<last>&waypoints=<...>` (addresses from customer/pharmacy profiles).
- **Mark Delivered dialog**: optional **delivery-proof photo** (stockist staff only, `capture="environment"`) → `documents` at `delivery-proofs/{orderId}-<ts>.<ext>` → `createSignedUrl(1yr)` → `delivery_proof_url`. Stockist staff: "Collect Payment" checkbox → amount + method (cash/online) → sets `delivery_collected_amount`, `delivery_payment_status="pending_approval"`, `delivery_payment_method`; sets `status="delivered"`, `delivered_at`; inserts `notifications` to stockist (`type:"delivery"`). Pharmacy staff: only sets `customer_orders.status="delivered"` (no payment capture, no inventory effects here).

---

## 3. STOCKIST MODULE

Nav: Home / Products / Pharmacies / Orders / More. All keyed on `useStockistProfile().id`. No realtime; polling only. Full route list (from App.tsx): `""`, `products`(+`/add`,`/:id`,`/:id/edit`,`/:id/price-history`), `orders`(+`/create`,`/:id`), `pharmacies`(+`/find`,`/:id`,`/:id/ledger`), `more`, `payments`, `analytics`, `profile`, `business`, `export`, `reports`, `settings`, `help`, `notifications`, `privacy-security`, `returns`, `expiry-management`, `serviceable-areas`, `staff`(+`/add`,`/:id/edit`), `delivery-routes`, `holidays`, `chats`, `chat/:peerId`, `messages`, `credit-notes`, `export-catalogue`, `bill-history`, `batch-management`, `record-payment`, `manufacturer-returns`, `bulk-bill`, `expiry-calendar`, `stock-transfer`.

### 3.1 Home (`StockistHome.tsx`)
- Prefetches products/orders/circle on mount.
- **8 clickable KPI cards** from `["stockistKPI"]` (`staleTime 10000`, `refetchInterval 30000`):
  - Pending Orders = `count(status="pending")` → /orders
  - Total Products = `count(products)` → /products
  - **Pharmacies = unique `pharmacy_id` over ALL orders** (Set) → /pharmacies
  - **Revenue = Σ total_amount where status∈{completed,delivered}** → /analytics
  - **Outstanding = Σ stockist_pharmacy_circle.outstanding** → /payments
  - Today's Orders = `count(created_at ≥ today)` → /orders
  - **Stock Value = Σ stock_quantity × price** → /products
  - **Pending Bills = count(bills.status="draft")** → /bill-history ⚠ nothing writes `status="draft"` so always 0
- "New Pharmacies This Month" banner (circle rows `created_at ≥ subMonths(1)`).
- Alert cards: Expiring Soon (`expiry_date ≤ today+30d & stock>0`, limit5), Low Stock (`min_stock_level>0 & qty≤min`, limit5), Safety Alerts (counterfeit_alerts active fuzzy-matched to products by name OR exact batch).
- Charts (recharts BarChart): Monthly Order Trend (6mo, `orders` count), Revenue vs Outstanding, Top Pharmacies by Revenue (delivered/completed, top5), Top Products by Sales (nested `order_items` for delivered/completed order ids, top5 by qty).
- Widgets (sub-components): **DeliveryPerformance** avg hours = `Σ(delivered_at−created_at)/3600000 / n` over delivered w/ delivered_at. **ReturnRate** = `returns/orders×100` (red if >5%). **PaymentCollection** = `Σ confirmed payments / Σ (delivered+completed) revenue ×100` (accent if ≥80%).
- 4 Quick Actions: Create Order (/orders/create), **Collect Payment (navigates to /pharmacies only)**, Bulk Upload (opens `BulkUploadCatalogue`), Upload Bill (opens `BulkUploadPurchaseBill`).
- Recent Orders (limit5).

### 3.2 Products
**StockistProducts** (`products`): grid of `SharedProductCard` (role stockist); batch-loads `product_batches` for all product ids → `batchesByProduct`. Filters (client): search(name/brand/composition), brand(`PHARMA_BRANDS`), category(`PRODUCT_CATEGORIES`), expiryFrom/To (string compare), sort(newest/name/price/expiry), grid cols 2/3 toggle (via `ProductFilters`). Buttons: Add, Bulk Catalogue, Purchase Bill, **Bulk Price**. Bulk Price dialog: field(sale_price|mrp), direction(increase|decrease), type(percentage|flat), value; `window.confirm`; processes in batches of 10; `newPrice=max(0, round(...*100)/100)`; when field=sale_price also sets `price`.

**StockistAddProduct/EditProduct** render `ProductForm`. **ProductForm** fields (dialog): image (→`product-images` bucket public URL), name*, brand*(searchable `PHARMA_BRANDS` + custom), manufacturer, category*(select), mrp*, sale_price*, purchase_rate, stock_quantity, min_stock_level, min_order_quantity(default 1), batch_number, expiry_date*, hsn_code, gst_rate*(select), drug_schedule*(select), drug_type(select), composition*, pack_type(select), pack_size, fssai_license, requires_prescription(checkbox), is_narcotic(checkbox). On save: `price = sale_price ?? price`; `in_stock = stock_quantity>0`. (Only `name` truly enforced in code; other `*` are visual.) **AI Autofill** via `useAutoFillProduct` fills only empty fields. Edit-with-price-change → inserts `notifications type:"price_change"` to circle pharmacies but does NOT write `price_history`.

**StockistProductDetail** wraps `SharedProductDetail role="stockist"` (embeds BatchManager, sales chart, batch pricing table).

**StockistPriceHistory** (`products/:id/price-history`): reads `price_history` (via `as any`) — **DEAD surface, no writer**, always "No price changes recorded". Shows Sale/MRP old→new with trend icon when rows exist.

### 3.3 Batches / Expiry / Transfer
- **StockistBatchManagement** / **StockistBatchExpiryCalendar** (month calendar dot per expiry).
- **StockistExpiryManagement**: pulls ALL `product_batches⋈products`, filters to this stockist. Buckets via date-fns: Expired (`isPast`), 30 days (`≤30 & !past`), 90 days (`31–90`), Safe (`>90 & stock>0`). **Dispose** (`confirm`) → sets `product_batches.stock_quantity=0` only (does NOT re-aggregate parent product stock).
- **StockistStockTransfer**: pick product (stock>0), from-batch, to-batch (must differ), qty (≤ source stock). Updates source `stock_quantity−qty`, dest `+qty`. **No product re-aggregate, no log.** Needs ≥2 batches.

### 3.4 Orders
**StockistCreateOrder** (`orders/create`, optional `?pharmacy=`): select circle pharmacy; paste order text → `parse-order-text` (passes `{id,name}` catalog) → items matched to products; manual add/qty steppers; product match select. `totalAmount = Σ price×qty`. **Credit-note** select (active notes for pharmacy) → `creditDiscount`, `finalAmount = max(0, total−creditDiscount)`. **Credit limit check**: if `credit_limit>0 && outstanding+total>credit_limit` → warning dialog showing excess = `max(0,(outstanding+total)−limit)`, "Proceed Anyway". On create: insert `orders` (`order_number="ORD-"+base36`, status `"pending"`, `order_source = orderText? "whatsapp":"manual"`, `items_count`, `applied_credit_note_id`, `credit_discount`), insert `order_items`, **`rpc("decrement_stock",{p_product_id,p_quantity})` per item at creation**, mark credit note `used`, `rpc("update_circle_outstanding",{p_circle_id,p_delta:finalAmount})`, notify pharmacy (`type:"order"`).

**StockistOrders** (`orders`): `usePaginatedQuery` (20) all orders. Tabs All/Pending/Active/Done via `getStatusGroup` (pending; active=packed/dispatched/out_for_delivery/processing; done=delivered/completed). Search name/order#. **Tab counts are per-page** (computed over fetched page only). Create button.

**StockistOrderDetail** (`orders/:id`) — the richest screen:
- Status flow `pending→packed→dispatched→out_for_delivery→delivered`. `canModify` = pending|packed. `canReturn`=delivered. `canAssignStaff`=packed/dispatched/out_for_delivery. `canPartialDeliver`=dispatched/out_for_delivery. `canSplit`=pending.
- **updateStatus**: on **packed** → `rpc("deduct_product_stock")` per item (⚠ SECOND deduction after create-time `decrement_stock` → double-deduct risk). On **delivered** → `autoPopulateInventory(pharmacy_id)` (upsert each ordered product into `pharmacy_inventory` by name, add qty if exists else full insert with `is_visible_to_customers:true`) + set `delivered_at`. Every transition notifies pharmacy.
- **Cancel** (`confirm`): sets cancelled, `update_circle_outstanding(−total)`; if was packed/dispatched → `restore_product_stock` per item.
- **Edit items** (pending/packed): inline qty; save deletes zero-qty rows, recomputes `total_amount`+`items_count`, `update_circle_outstanding(diff)`. Blocks all-zero ("Cancel instead").
- **Assign delivery staff**: active staff sorted least-loaded-first (counts open assignments); "Suggested" badge when top has 0.
- **Partial Delivery** (`#30`): qty per item → appended to `partial_delivery_items` JSON + `autoPopulateSingleItem` (adds to existing pharmacy inventory only). Notifies via card.
- **Split Order** (`#31`, pending, >1 item): move qty (max item.qty−1) to a new child order (`order_number = <orig>-S<base36>`, `order_source="split"`, `parent_order_id`, status pending); reduces/deletes original items; recomputes totals.
- **Return** (delivered): per-item qty + reason → insert `order_returns` (`status:"completed"`, refund_amount) + if paid `credit_balance +=` else `update_circle_outstanding(−refund)`; creates `credit_notes` (`CN-`+base36, active).
- **Duplicate**: clones into new order (`SO`+last8 ts, `order_source:"platform"`, pending).
- **Bill**: existing bill → View (BillPreviewDialog readOnly); else Create Bill (BillPreviewDialog).
- **Print Packing Slip**: `window.open` HTML table + print (packed/dispatched/out_for_delivery).
- **Record Payment** (payment_status≠paid): `CollectPaymentDialog`.
- Shows delivery_proof_url image, credit-note applied card, partial delivery history, requested_batch per item.

### 3.5 Pharmacies (circle)
**StockistPharmacies**: `stockist_pharmacy_circle ⋈ pharmacy_profiles`. Filter chips All/Outstanding(>0)/Credit(credit_balance>0 & outstanding=0)/No Dues(outstanding=0). Per card: Outstanding, **Credit(shows credit_limit)**, **Net Due = outstanding − credit_balance** (shows "₹X CR" when negative). Pending-order summary. "Collect Payment" inline when outstanding>0. Dropdown: View/Edit(`EditPharmacyDialog`)/Record Order(→create?pharmacy=)/Generate Bill(`QuickBillDialog`)/Remove from Circle (`confirm`, delete row).

**StockistPharmacyDetail** (`pharmacies/:id`): header with call/copy/WhatsApp/chat; **credit usage Progress** = `outstanding/credit_limit×100`; Outstanding/Credit Limit/Available(=limit−outstanding) grid. Collect Payment button (disabled when outstanding≤0). Tabs: Orders (expandable to items), Payments, Bills (view via BillPreviewDialog readOnly), **Ledger** (merges orders debit + payments credit + `order_returns` refund credit, sorted asc, running balance; footer Final Balance). Details dialog shows business info, contact, address, 3 documents with status badges + View, and Danger Zone remove-from-circle. `EditPharmacyDialog`/`QuickBillDialog`/`CollectPaymentDialog` wired.

**StockistPharmacyLedger** (`pharmacies/:id/ledger`) — separate route; per FEATURES omits returns from running balance.

**EditPharmacyDialog**: edits `credit_limit`, `notes`, `is_blocked` (toggle). On block change + pharmacy.user_id → notifies pharmacy (`type:"circle_status"`, "Account Blocked/Unblocked"). Non-atomic `.update()`.

### 3.6 Payments / Credit Notes / Returns
**CollectPaymentDialog**: methods cash/upi/bank_transfer/cheque. Loads unpaid/partial orders oldest-first. **FIFO auto-allocation** by entered amount OR **manual selection** (click orders → sets amount to selected sum, marks selected full). "Full (₹total)" button. On record: insert `payments` (`status:"confirmed"`, method, reference_id), mark allocated orders paid/partial, `outstanding = max(0, outstanding−amt)` via **non-atomic `.update()`**.

**StockistRecordPayment** (`record-payment`): manual payment; fields pharmacy(select w/ outstanding), amount*, method(cash/upi/bank_transfer/cheque), reference_id, notes. Inserts `payments` (`collected_by:"manual"`, confirmed); `update_circle_outstanding(−amt)` (atomic); **#51** if resulting outstanding ≤0 → marks all this pharmacy's `unpaid` orders `paid`; notifies pharmacy.

**StockistPayments** (`payments`): summary Collected(month)/Outstanding/Approvals. Bank details card (edit→/business). Tabs: Payments (list + Receipt PDF via `generateReceiptPdf` for confirmed), Bills, **Approvals** (delivery-staff collections `delivery_payment_status="pending_approval"`). **Approve**: insert `payments` (`collected_by:"delivery_staff"`, staff_id, confirmed), set order `delivery_payment_status="approved"`+`payment_status="paid"`, `update_circle_outstanding(−amount)`. **Reject**: sets `delivery_payment_status="rejected"`, `delivery_collected_amount=0`. **WhatsApp Reminder** dialog: pick pharmacy w/ outstanding → inserts `payment_reminders` (`sent_via:"whatsapp"`) + notification (`type:"payment_reminder"`) + opens `wa.me/91<phone>?text=` with UPI/bank details.

**StockistReturns** (`returns`): tabs **Requests** (pending `order_returns` from pharmacies), **Process** (delivered orders → return dialog), **History**, **Credits** (`credit_notes`).
- **Approve request**: set completed; restore product `stock_quantity += qty` (`in_stock:true`); if order paid → `credit_balance +=` else `outstanding −= refund` (both non-atomic); create `credit_notes` active; notify pharmacy.
- **Reject**: set rejected + notify.
- **Process return** (from delivered order): per-item qty + reason → insert `order_returns` completed; restore product stock **and add returned qty to earliest-expiry batch (FIFO restock)**; if paid credit_balance+= else outstanding−=; create credit note per return; notify.

**StockistCreditNotes** (`credit-notes`): list/filter credit notes.

### 3.7 Bulk / Bill / Reports / Delivery / Staff
- **BulkUploadCatalogue**: client XLSX/CSV parse (no AI); flexible header mapping; flexible expiry parse (MM/YY, MM/YYYY, DD/MM/YYYY, YYYY-MM-DD → default day 28); preview + inline edit; validation (name required, numeric mrp/sale/stock); bulk `insert` into `products` (`price=sale_price`, `in_stock=stock>0`). Template download. **No batches created.**
- **BulkUploadPurchaseBill**: file → `documents` at `bills/{stockistId}/…` → base64 → `parse-purchase-bill` (vision) → preview/edit → **upsert by exact name** (update if exists else insert). Sets sale_price+price. **Does NOT set purchase_rate or create batches.**
- **StockistBulkBill** (`bulk-bill`): unbilled delivered orders (excludes those in `bill_orders`), select → group by pharmacy → one `bills` per pharmacy (`BILL-<ts>-<n>`, `status:"final"`, subtotal=total_amount, no GST) + `bill_orders` links + notify pharmacy (`type:"bill"`).
- **BillPreviewDialog**: renders "TAX INVOICE" (stockist header, Bill To, orders table, Subtotal/Discount(%/flat)/Grand Total — **no CGST/SGST**), payment/bank block, **QR to hardcoded `https://digi-swasthya-hub.lovable.app/verify-bill/{savedBillId|preview}`**. Confirm → insert `bills` (`status:"confirmed"`) + `bill_orders` + `outstanding += total` (non-atomic). Print/PDF(html2canvas→jsPDF `<BILL>.pdf`)/WhatsApp(share file or `wa.me` text). Payment status badge derived from linked orders (all paid→Paid, else On Credit).
- **StockistManufacturerReturns** (`manufacturer-returns`): `manufacturer_returns` (via `as any`). Add: product/qty/reason. Status flow pending→shipped→credited (Mark Credited uses `window.prompt("Credit amount")`). Statuses pending/shipped/received/credited/rejected.
- **StockistReports** (`reports`): 13 report defs (H1 monthly/annual, Schedule H, Schedule H1, HNX drugs/annual, NDPS, Narcotic, Tramadol, GST Sales, My Item, Restricted Items, TB). Month/Year/Type filters. Client-side XLSX. Filters: H*→drug_schedule startsWith "H"; is_narcotic for HNX/NDPS/narcotic; tramadol name/composition; TB keyword list (isoniazid/rifampicin/pyrazinamide/ethambutol/streptomycin). **GST report reads `bills.gst_amount`** — nothing populates it, so GST column is 0.
- **StockistExportData** (`export`): format CSV/Excel/**PDF (stub — PDF still emits `.xlsx`)**; range today/week/month/all; data types orders/payments/products/pharmacies → multi-sheet XLSX.
- **StockistExportCatalogue** (`export-catalogue`): products → XLSX.
- **StockistPurchaseBillHistory** (`bill-history`): view `bills`.
- **StockistStaffManagement/StockistStaffForm**: `delivery_staff`. Form fields name*, phone*, aadhar_number, age, police_verification_id, username*, password* (new only). **Password via `rpc("hash_password",{p_password})` with plaintext fallback** (`hashData || form.password`) → `password_hash`.
- **StockistServiceableAreas** (`serviceable-areas`): `serviceable_areas` PINs + per-PIN `delivery_settings`.
- **StockistDeliveryRoutes** (`delivery-routes`): multi-select → Google Maps directions URL (no optimization); templates in `delivery_route_templates`.
- **StockistHolidays** (`holidays`): `stockist_holidays` (start/end date, reason, `allow_preorder`); notifies circle.
- **StockistAnalytics** (`analytics`): real recharts; Stock Value by category = `Σ stock_quantity × purchase_rate`; collection rate.
- **StockistProfileSettings/StockistBusinessDetails**: bank/UPI/PAN (used by bills & reminders); business save triggers re-verification.
- Boilerplate: StockistMore(MenuPage), StockistNotifications, StockistSettings, StockistHelpCenter(chat-bot), StockistPrivacySecurity, StockistFindPharmacy(addToCircle seeds circle 0/0/0).

---

## 4. PHARMACY MODULE (dual purchase/sale mode)

Mode via `usePharmacyMode` (localStorage). Purchase nav: Dashboard/Orders/Stockists/Inventory/More. Sale nav: Dashboard/customer-orders(Orders)/customer-list(Customers)/Inventory/More. Toggle in TopNav avatar popover. All keyed on `usePharmacyProfile().id`. No realtime.

### 4.1 Dashboard (`PharmacyDashboard.tsx`)
One `["pharmacyDashStats"]` query (8 parallel; `staleTime 15000`). Metrics: activeB2BOrders(`status∉{delivered,cancelled}`), **totalPurchase=Σ orders.total_amount**, pendingPayments(`payment_status≠paid`), connectedStockists(circle count), inventoryItems(count), activeCustOrders, todayCustOrders(`isToday`), **custRevenue=Σ delivered customer_orders**, lowStockCount(`min_stock_level && qty≤min`), expiringCount(`expiry≤today+30d & qty>0`), **avgOrderValue=round(custRevenue/deliveredCount)**, pendingCustPayments(`payment_status≠paid & status≠cancelled`), totalCustomers(unique customer_id). Renders **PurchaseDashboard** (alert cards linking to `?filter=low_stock`/expiry; 5 KPIs; 8 quick actions; `<ReorderSuggestions>`; recent B2B orders) vs **SaleDashboard** (7 KPIs; 8 quick actions; recent customer orders).

### 4.2 Inventory (purchase side)
- **PharmacyInventory** (`inventory`): `SharedProductCard` role pharmacy; inventory value = `Σ quantity × (purchase_rate||price)`; `?filter=low_stock|expiring` (30-day window); **Bulk Price Update** (batched 10, `window.confirm`).
- **PharmacyInventoryForm** (`inventory/add`, `inventory/:id/edit`): full schema fields product_name*, brand(searchable), manufacturer, category(select), description, mrp, sale_price, price(forced=sale_price), quantity, min_stock_level, batch_number, expiry_date, hsn_code, gst_rate(select), drug_schedule(select), drug_type(select), composition, pack_type(select), pack_size, fssai_license, requires_prescription(switch), is_narcotic(checkbox), is_visible_to_customers(switch, default true). **AI Auto-Fill** (`autofill-product-details`, fills empty only). **Counterfeit warning** banner if name matches active alert. Gallery → `pharmacy_inventory_media` (delete-all-then-insert). `price = sale_price ?? price`.
- **PharmacyInventoryDetail** wraps `SharedProductDetail role="pharmacy"`.
- **PharmacyBulkImport** (`bulk-import`): select circle stockist (status active) → load their in-stock `products` → checkbox select → insert into `pharmacy_inventory` (`quantity:0`, `is_visible_to_customers:false`, chunks of 50). **This is the primary manual inventory-population path** (delivery auto-populate is stockist-side).
- **PharmacyStockAudit** (`stock-audit`): `pharmacy_stock_audits` + direct qty updates.
- **PharmacyExpiryManagement** (`expiry-management`): Expired/≤30/31–90/Safe buckets; Dispose (qty 0 + hide); Send Expiry Report → notifies circle stockists.
- **PharmacyInventoryAuditLog** (`inventory-audit`): snapshot only; reads a nonexistent `selling_price`.

### 4.3 B2B purchasing
- Order status flow `pending→packed→dispatched→out_for_delivery→delivered` (+cancelled). Order number `PH<last8 ts>`.
- **PharmacyBrowse**/**PharmacyStockists**/**PharmacyFindStockist**: approved stockists; `addToCircle` seeds `stockist_pharmacy_circle`.
- **PharmacyStockistDetail** (`stockists/:id`): cart-based ordering. Reads circle (outstanding/credit_limit/is_blocked) + active `stockist_holidays`. `orderingBlocked = is_blocked || (activeHoliday && !allow_preorder)`. **Credit-limit enforcement**: blocks if `credit_limit>0 && outstanding+cartTotal>credit_limit`; warns >80%. Place → insert `orders` (`order_source:"platform"`, pending) + items → `update_circle_outstanding(+cartTotal)` → notify stockist. **No stock deduction on B2B purchase.** Blocked/Holiday banners; pre-order label when holiday+allow_preorder.
- **PharmacyQuickOrder** (`orders/quick`): `parse-order-text` → **findBestStockists**: serviceable_areas by pharmacy pin → approved stockists → substring-match products, sum matched, sort cheapest → "Best Price" badge on #0; shows next delivery day from `delivery_settings.delivery_days`. Place → `order_source:"quick_order"` + `update_circle_outstanding(+total)` + notify. **No credit check here.**
- **PharmacyOrders** (`orders`): mode-gated (purchase→`orders`, sale→`customer_orders`).
- **PharmacyOrderDetail** (`orders/:id`): Duplicate, **Verify Received Quantities** (notifies discrepancies, no stock adjust), **Request Return** → `order_returns`, invoice PDF.
- **PharmacyLedger** (`ledger/:stockistId`): orders − / payments + / credit_notes +.
- **PharmacyRecurringOrders** (`recurring-orders`): `recurring_orders` (via `as any`) CRUD — stockist/frequency(weekly/biweekly/monthly)/next_order_date/items(text→JSON `{name,qty}`), toggle active, delete. **No scheduler/execution engine — rows are inert.**
- **PharmacyReorderHistory**, **PharmacyQuickOrderHistory**.

### 4.4 B2C fulfillment (sale side)
Customer order flow `pending→confirmed→preparing→ready_for_pickup→out_for_delivery→delivered` (+cancelled).

**PharmacyCustomerOrderDetail** (`customer-orders/:id`) — core B2C screen:
- **updateStatus**: on **confirmed** → `rpc("deduct_pharmacy_inventory",{p_inventory_id:item.product_id, p_quantity})` per item. On **cancelled** (if was confirmed/preparing/ready_for_pickup) → restock by direct `pharmacy_inventory` update matched by `product_name`. On **delivered** → `calculateCommissions(orderId, pharmacyId)` + set `delivered_at`. Every transition notifies customer.
- **Prescription gate**: "Mark as confirmed" disabled while `prescription_url` exists and `prescription_verified` false. Verify/Reject buttons set `prescription_verified` + notify.
- **UPI verification**: when `payment_status="claimed"` or method upi (and ≠paid) → shows proof link + Verify(→paid, notify) / Reject(→rejected, notify).
- **Item pricing** (editable when pending/confirmed): Add item (name/qty/price, recompute total), Remove (recompute), **Set Total** (manual override), **Auto-Price** (match unpriced items to `pharmacy_inventory` by name, set price+product_id, recompute), **Substitute** (`is_substitute`, `original_product_name`, recompute, notify), **Check Stock / Partial fulfillment** (`partial_items` JSON of requested vs available, notify — does not split).
- **Assign delivery staff** (delivery orders, `pharmacy_delivery_staff` active).
- **Mark Paid** (delivered & unpaid).
- On delivered + items → renders **B2CBillGenerator**.

**B2CBillGenerator**: "TAX INVOICE" dialog; line items + total (no tax breakdown); PDF via dynamic html2canvas+jsPDF (`Invoice-<order_number>.pdf`); **QR = `${origin}/verify-bill/customer-${order.id}`**; Share via `navigator.share`.

- **PharmacyB2CBillHistory**, **PharmacyCustomerList/CustomerDetail**.
- **PharmacyCustomerReturns** (`customer-returns`): tabs Pending/Processed on `customer_returns`. Approve & Refund: sets status approved + `refund_amount = Σ items price×qty` + notify. Reject + notify. **No inventory restock.**
- **PharmacyCustomerOrders** (`customer-orders`).

### 4.5 Doctor partnerships / commissions
- **PharmacyDoctors** (`doctors`): `pharmacy_consultation_settings`.
- **PharmacyDoctorPartnershipDetail** (`doctors/:id`): `doctor_pharmacy_partnerships` Accept/Reject/Deactivate; per-earning Mark Paid.
- **PharmacyCommissions** (`commissions`, read-only), **PharmacyConsultations** (read-only).
- Commission math in **`calculateCommissions`** (see §9).

### 4.6 Ops & settings
- **PharmacyPayments** (`payments`): tabs Payments/Credit Notes. Outstanding summary. **Record Payment to stockist** dialog: stockist(select w/ outstanding + bank/UPI preview), amount*, method(upi/bank_transfer/cash/cheque), reference_id, notes, **UPI proof upload** (method=upi) → `documents` at `upi-proofs/{pharmacyId}/…` → `createSignedUrl(30d)` → URL appended into `notes`. Inserts `payments` (`status:"pending"`, `collected_by:"pharmacy"`); `update_circle_outstanding(−amount)` (atomic); notify stockist.
- **PharmacyReports** (`reports`): Purchase + Inventory query real data; **Schedule H/H1/NDPS produce a single placeholder row** "No matching items found in inventory".
- **PharmacyAnalytics** (real BarChart, B2B only), **PharmacyExportData**, **PharmacyServiceableAreas**, **PharmacyDeliveryRoutes** (Google Maps URL), **PharmacyStaffManagement/StaffForm** (`pharmacy_delivery_staff`, `hash_password`), **PharmacyProfileSettings/PharmacyBusinessDetails** (3 regulatory docs → `documents` signed 1 day; saving forces `approval_status:"pending"` + notifies admins), Notifications/Settings/HelpCenter/PrivacySecurity.

---

## 5. CUSTOMER MODULE

Identity `customer_profiles.id`. Nav: Home/Orders/Pharmacies/Rx/More. Cart via `useCart` (single-pharmacy).

### 5.1 Dashboard (`CustomerDashboard.tsx`)
Greeting + **profile-completion** prompt (`filledFields` of phone/address/city/pin_code/dob/gender; complete if ≥5, shows X/6). Widgets: Active Orders (`∉{delivered,cancelled}`), Health summary (blood_group/allergies), Reminder alert (`localStorage["medicine_reminders"]` enabled, slice3), Upcoming Consultations (`scheduled_at≥now`, limit3), Recent Orders (limit5), Recent Prescriptions (limit3). nearbyCount = `pharmacy_serviceable_areas` where `pin_code=profile.pin`. **8 QuickActions**: Search, Quick Order, Pharmacies(desc "N nearby"), Consult, Upload Rx, Wishlist, Addresses, Prescriptions.

### 5.2 Browse & order
- **CustomerPharmacies**: from `pharmacy_serviceable_areas` (same PIN first, then `estimated_hours`) ⋈ approved pharmacies + `customer_reviews` avg; shows delivery charge / free-above.
- **CustomerPharmacyDetail** (`pharmacies/:id`): products `is_visible_to_customers && quantity>0`; search; review avg (`customer_reviews`); "Consult" if pharmacy has active `pharmacy_consultation_settings`. **Inline order placement** (divergent from Checkout): order_number `CO-<base36>-<rand>`, `payment_method` = pickup?`pay_at_store`:`cash`, **`total_amount = cart.total` raw (NO GST/fee)**; blocks if Rx items present (must use Checkout/upload) and if delivery w/o saved address. Cart footer with delivery/pickup toggle.
- **CustomerMedicineSearch** (`search`): `pharmacy_inventory` `ilike`, `sale_price` asc, limit 30, grouped by pharmacy.
- **CustomerCart** (`cart`): shows hardcoded "Delivery: Free" (display only).
- **CustomerCheckout** (`checkout`) — **the real order path**: order type delivery/pickup; delivery fee from `pharmacy_profiles.delivery_fee` (0 if `total≥free_delivery_above`); **GST hardcoded 5%** `gstAmount=round(total*0.05*100)/100`; `grandTotal = total+fee+gst`. Payment cash/pay_at_store/upi. **UPI**: requires proof upload; static banner "Complete payment within 15 minutes... retry or switch to COD" (**no timer**); "Switch to Cash on Delivery" button. Prescription upload required if `hasPrescriptionItems`. Files → `documents` at `prescriptions/{customerId}/…` and `upi-proofs/{customerId}/…` (**both `createSignedUrl(86400)` = 24h**). Inserts `customer_orders` (`payment_status = upi?"claimed":"unpaid"`, plus `delivery_fee`, `gst_amount`, `delivery_address/pin`, `prescription_url`, `upi_proof_url`, notes), items, pharmacy notification. Saved-address select prefills.

### 5.3 Orders
- **CustomerOrders** (`orders`): `usePaginatedQuery(20)`.
- **CustomerOrderDetail** (`orders/:id`): stepper `pending→confirmed→preparing→(ready_for_pickup|out_for_delivery based on order_type)→delivered`. "I've Paid" (unpaid, total>0) → `payment_status="claimed"`. Payment status card (paid/claimed/verified/rejected messages, UPI proof link). Track button + Copy Tracking Link. **Cancel** (pending/confirmed) via `CancelOrderCard`: reason select (`CANCEL_REASONS` 6 options) → set cancelled + notes; if confirmed+ → `rpc("restore_pharmacy_inventory",{p_inventory_id:product_id})` per item; notify pharmacy. **Reorder** (delivered/cancelled): clears cart, re-adds items, → /cart. **Request Return** (delivered) → `/orders/:id/return`. **Rate & Review** (delivered) → `/orders/:id/review`. **Download Invoice** (delivered) jsPDF.
- **CustomerOrderTracking** (`orders/:id/track`): polls 15s (no realtime).
- **CustomerReturnRequest** (`orders/:orderId/return`): only if delivered & no existing `customer_returns`. Select items (checkbox) + reason* → insert `customer_returns` (`status:"pending"`, `refund_amount=Σ price×qty`) + `customer_return_items` + notify pharmacy.
- **CustomerReviewOrder** (`orders/:id/review`): star rating* + comment → **inserts into `reviews`** (target_type "pharmacy", target_id pharmacy_id) — but ratings elsewhere read from `customer_reviews`, so these **never surface**. Shows existing review if present.

### 5.4 Prescriptions & consultations
- **CustomerPrescriptions/CustomerPrescriptionDetail**: detail shows items (dosage/duration/qty/notes); **"Order All Items"** adds items with `price:0`, `requires_prescription:true` (pharmacy prices later) → /cart; **#136 auto-find** matching pharmacies by `pharmacy_inventory` product_name (grouped, top5) with per-pharmacy Order; Share (navigator.share/clipboard); Download PDF.
- **CustomerPrescriptionUpload** (`upload-prescription`): select pharmacy (from `pharmacy_serviceable_areas` by pin) + file (or camera capture) → `documents` at `prescriptions/{user_id}/<ts>-<name>` (**raw path, no signed URL, NO OCR**) + insert `customer_orders` (`order_type:"prescription"`, `prescription_url=path`, notes "please review and add items").
- **CustomerBookConsultation** (`consultations/book`): approved+`is_available` doctors; consultation type audio/video/clinic_visit; **free date/time inputs (ignores `doctor_availability`, no slot/double-book check)**; fee by type; insert `consultations` (`payment_status:"unpaid"`) + notify doctor. **Payment demo**: "I've Paid (UPI)" flips `payment_status="paid"` unverified, or "Pay Later".
- **CustomerConsultationDetail** (`consultations/:id`): client-side **duration timer** for in_progress (`elapsed = now − scheduled_at`); Join (meeting_link), Reschedule (datetime), Cancel (reason) — both notify doctor; download summary PDF (completed); prescription card + "Order Prescription Items" (adds price:0 Rx items to cart); "Chat with Dr." → peer chat; WhatsApp.

### 5.5 Other
- **CustomerMedicineReminders** (`reminders`): **localStorage-only** (`medicine_reminders`). Add/edit/delete/toggle; frequency daily/alternate/weekly; browser Notification permission; quick-add from active prescriptions (splits times by dosage digit); **`scheduleNotification` uses `setTimeout` — only fires if delay <24h and tab stays open**.
- **CustomerHealthProfile**, **CustomerWishlist** (`customer_wishlist` read/remove), **CustomerAddresses** (`customer_addresses`, `INDIAN_STATES`/`getCitiesForState`), **CustomerQuickOrder** (voice via `webkitSpeechRecognition` en-IN), **CustomerPastDoctors**, Notifications/Settings/Profile/Help/Privacy.

---

## 6. DOCTOR MODULE

Nav: Dashboard/Sessions/Patients/Rx/More. Identity `doctor_profiles.id`.

### 6.1 Dashboard (`DoctorDashboard.tsx`)
`["doctorStats"]`: Today's Sessions (`isToday`), Total Patients (unique patient_id), **Total Earnings = paid consultation fees + Σ commission earnings**, Pending Sessions (`status="booked"`). Earnings breakdown card (consultation vs referral commissions + pending). Review summary (`customer_reviews` avg) + pharmacy partners count. 8 QuickActions. Today's Schedule (patient names). Upcoming Follow-ups (`follow_up_date` future).

### 6.2 Consultations
- **DoctorConsultations** (`consultations`): tabs upcoming/completed/cancelled.
- **DoctorConsultationDetail** (`consultations/:id`): status `booked→in_progress→completed` (each notifies patient). **Meeting link manually pasted** (Meet/Zoom) + Save Notes & Link. Mark Payment Paid (#12) + notify. Reschedule(datetime)/Cancel(reason) dialogs. Write Prescription link (passes consultationId/patientId/pharmacyId). Follow-up scheduling (date+notes) when completed. Patient info card → patient detail.

### 6.3 Prescriptions
- **DoctorPrescriptionWriter** (`prescriptions/write`): loads template (if `?templateId`); **walk-in patient search** (`customer_profiles` by name/phone) when no `patientId`; per-item medicine search against target pharmacy `pharmacy_inventory` (only if pharmacyId, visible & qty>0) else free text; item fields product_name/product_id/dosage/duration/quantity/notes; general notes. Insert `prescriptions` (+ consultation_id, pharmacy_id) + `prescription_items` + notify patient.
- **DoctorPrescriptionTemplates** (`prescription-templates`): CRUD.
- **DoctorPrescriptions/Detail**: inline edit = destructive delete+reinsert of items.

### 6.4 Availability / Earnings / Partnerships
- **DoctorAvailability** (`availability`): 7 days × multiple slots; per-day active switch + start/end times + add/remove slots; **save = delete-all then re-insert** all active slots. **Never read by the booking flow.**
- **DoctorEarnings** (`earnings`): **paid consultation fees only** (excludes commissions — diverges from dashboard total). Real recharts: 6-mo BarChart + type PieChart with per-type breakdown.
- **DoctorPharmacies** (`pharmacies`): `sendRequest` inserts `doctor_pharmacy_partnerships` (`status:"pending"`, `default_commission_pct:5`).
- **DoctorPharmacyPartnershipDetail** (`pharmacies/:id`): edit default % (onBlur → update), add/delete `doctor_commission_rules` (type product/brand/category; commission_pct + flat_amount; category from hardcoded list). Earnings summary (total + pending) from `doctor_commission_earnings`; recent earnings list.
- **DoctorPatients/Detail**, **DoctorAnalytics** (real charts; completion rate = completed/total), Profile(avatar→**`public-assets`** bucket public URL; fees), Settings/Notifications/Help/Privacy.

---

## 7. ADMIN MODULE (~57 pages, `ProtectedRoute role="admin"`)

Nav: Dashboard/Pharmacies/Stockists/Orders/More.

### 7.1 Dashboard (`AdminDashboard.tsx`)
One `["adminStats"]` (~16 parallel; only last 6mo for revenue/growth). **13 clickable KPIs** (Pharmacies, Stockists, B2B Orders, B2C Orders, Pending Approvals, Total/B2B/B2C Revenue, Customers, Doctors, Active Consults, Active Alerts, Active Today[DAU]). New Registrations Today + Revenue Today vs Yesterday. Pending breakdown (stockists/pharmacies/doctors). Real recharts: 6-mo revenue BarChart, B2C order-status PieChart, Top Revenue Pharmacies, Platform Growth. **System Health card hardcoded "Operational"** (pulsing dot). Recent Admin Actions from `admin_audit_log` (limit5). Note: `totalRevenue = b2bRevenue + b2cRevenue` where b2bRevenue is just last-6mo orders sum (labeled "B2B Revenue" though it's all orders).

### 7.2 Approvals & users
- **AdminStockists/AdminPharmacies/AdminDoctors**: set `approval_status` **directly** (approved/rejected). **Bulk approve/reject** = client-side loop over selected ids (no batch RPC). Select-all-pending. Pending badge.
- **AdminUsers** (`users`): aggregates 4 profile tables into rows; tabs all/stockist/pharmacy/doctor/customer. **Suspend/Restore** toggles `approval_status` between suspended/approved (customers exempt — "Customers cannot be suspended") + notification. No true ban/delete.
- **AdminImpersonate** (`impersonate`): **view-only** ("View as User"). Search `profiles`; fetch roles + all role profiles; display read-only card; logs `admin_audit_log` action `impersonate_view`.
- **AdminForceReset** (`force-reset`): just `resetPasswordForEmail` (by typed email or searched user) + logs `force_password_reset`.
- **AdminMergeAccounts** (`merge-accounts`): looks up 2 users by email; merge **re-points only `notifications` + `login_activity`** from secondary→primary; logs `merge_accounts`. Does NOT migrate orders; secondary not deleted.

### 7.3 Communications, safety, oversight
- **AdminNotifications** (`notifications`): **Broadcast** (target all/stockist/pharmacy/customer/doctor → collect user_ids from role tables, dedupe, insert `notifications type:"broadcast"` in batches of 100); **Targeted** — look up `profiles` by email → `rpc("admin_send_targeted_notification",{p_user_id,p_title,p_message})`. Mark-all-read.
- **AdminCounterfeit** (`counterfeit`): CRUD `counterfeit_alerts` (types counterfeit/banned/spurious/nsq/recalled); add → fuzzy `ilike` match products (by name) + pharmacy_inventory → notify affected stockists/pharmacies (`type:"alert"`, dedup by user); toggle active.
- **AdminOrderDetail** (`orders/:id`): admin status override via `rpc("admin_override_order_status",{p_order_id,p_new_status})` (only when not delivered/cancelled).
- **AdminCustomerOrderDetail** (`customer-orders/:id`): override via `rpc("admin_override_customer_order_status")` + logs `admin_audit_log` (from→to).
- **AdminRefunds** (`refunds`): lists cancelled `customer_orders`; state machine on `refund_status` pending→approved→processed / rejected (approve only when payment_status="paid"). Summary Pending/Approved/Total Refundable(=Σ paid cancelled totals).
- **AdminReturns**/**AdminCommissions**: read-only.
- **AdminMaintenanceMode** (`maintenance`): writes `platform_settings` keys `maintenance_mode`/`maintenance_message` (upsert). **Flag stored but not observed to gate the app.**
- **AdminToSManagement** (`tos-management`): `platform_settings` ToS content.

### 7.4 Config CRUD & analytics
- `AdminDrugSchedules`, `AdminProductCategories`, `AdminSpecializations`, `AdminPharmacyCategories`, `AdminServiceableAreas` (+ `is_active`), `AdminSubscriptions` (`subscription_plans`), `AdminBanners` (`platform_banners` — **image is a URL field, no upload**).
- `AdminAnalytics`, `AdminGeoDistribution`, `AdminApiMonitoring` (health string hardcoded), `AdminRevenueDetail`, `AdminPlatformInvoice`, `AdminSystemReport`, `AdminActiveUsers`, `AdminLoginHistory`, `AdminActivityLog`, `AdminAuditTrail`, `AdminLicenseExpiry`, `AdminReviewsManagement`, `AdminPayments`, `AdminBills`, `AdminConsultations`/Detail, `AdminDeliveryStaff`, `AdminMessages`(+`/:userId`→ChatPage), `AdminProfileSettings`, `AdminSettings`, `AdminHelpCenter`, `AdminExportData`, `AdminCustomers`/Detail, `AdminStockistDetail`/`AdminPharmacyDetail`/`AdminDoctorDetail`.

### 7.5 Flowboard — AdminSystemArchitecture (`system-architecture`)
16 tabs: overview, roles, modules, journeys, content, flow, screens, database, routes, logic, infra, dependencies, graph, validator, **ai**, export. Data from **`flowboard-data`** edge fn via 7 typed queries (sections/nodes/screens/database/routes/business-logic/infrastructure). Header: search (`/` focus), bookmarks (`localStorage["flowboard-bookmarks"]`, `b` toggle). Stats bar counts. Cross-navigation between content↔flow↔screens with temporary highlight. **ArchitectureAIView**: `buildFullArchitectureContext` serializes EVERYTHING (modules+nodes+tables+columns+FKs+RLS, RPCs, state machines, workflows, edge fns, storage, routes, screens, triggers, realtime) into markdown, then `architecture-ai` fn; renders replies via `react-markdown`; 12 suggested questions. **ExportView** exports the model.

---

## 8. SHARED / MESSAGING / PWA

- **ChatPage** (`messages`, admin `messages/:userId`): support chat. `conversations`(by user_id) + `chat_messages`. Realtime channel `chat-${conversationId}` INSERT. User message → quick-question match (prefix/slice20) → canned `bot` reply, else `chat-bot` fn (fallback message on error). Sender types user/admin/bot. Quick-question chips.
- **ChatListPage** (`chats`): support entry + peer chats derived from `peer_messages` (unread counts), enriched with business/pharmacy/profile names + role badge.
- **PeerChatPage** (`chat/:peerId`): `peer_messages` (`or(and(sender,receiver)...)`), realtime channel `peer-${sortedIds}`, marks incoming read.
- **VerifyBill** (`/verify-bill/:billId`): public; `billId="preview"` → placeholder; fetches `bills`+stockist+pharmacy; shows Bill No/Date/Status/Total + From/To. Branded "Digital Swasthya" (branding drift).
- **PWA**: `public/manifest.json` (name "Digi Swasthya", theme #16a34a, standalone/portrait), hand-written `public/sw.js` (`digi-swasthya-v3`, network-first for `/rest//auth//functions/` + nav, waits for user, SKIP_WAITING support). Two overlapping update mechanisms.
- **Realtime channels total = 3**: `notifications-{user.id}`, `chat-{conversationId}`, `peer-{sortedIds}`. **No realtime on orders/inventory/payments.**

---

## 9. MONEY / STOCK / STATE LOGIC (exact rules)

### 9.1 Status vocabularies
- **B2B `orders.status`**: pending→packed→dispatched→out_for_delivery→delivered (+cancelled, +split children `parent_order_id`). `order_source`: manual/whatsapp/platform/quick_order/split.
- **B2C `customer_orders.status`**: pending→confirmed→preparing→ready_for_pickup→out_for_delivery→delivered (+cancelled). `order_type`: delivery/pickup/prescription/pay_at_store.
- **payment_status**: paid/unpaid/partial/claimed/verified/rejected/failed. **refund_status**: pending/approved/rejected/processed.
- **approval_status**: pending/approved/rejected/suspended (enum defines pending/approved/rejected only).
- **consultations.status**: booked→in_progress→completed / cancelled.
- **manufacturer_returns.status**: pending/shipped/received/credited/rejected.

### 9.2 Stock RPCs
`decrement_stock` (B2B create), `deduct_product_stock` (B2B packed — **double deduction** with create), `restore_product_stock` (B2B cancel if packed+), `deduct_pharmacy_inventory` (B2C confirm), `restore_pharmacy_inventory` (customer cancel confirmed+). B2B purchasing by pharmacy = **no deduction**. B2B delivery → stockist-side `autoPopulateInventory` adds to pharmacy inventory.

### 9.3 Credit circle (`stockist_pharmacy_circle`)
Fields credit_limit/outstanding/credit_balance/payment_terms_days/is_blocked/last_payment_date/notes. **Net Due = outstanding − credit_balance**. Outstanding adjusted by `rpc("update_circle_outstanding",{p_circle_id,p_delta})` (atomic) in most flows, but **non-atomic `.update()`** in `CollectPaymentDialog`, `BillPreviewDialog`, `StockistReturns` approve/process, `StockistOrderDetail` return (credit_balance branch). Credit enforcement: pharmacy-side (`PharmacyStockistDetail`, `PharmacyQuickOrder` does NOT enforce) + stockist create-order (warning-with-override).

### 9.4 GST / tax
- **Stockist bills/orders**: NO GST computed ("TAX INVOICE" cosmetic; `gst_rate`/`hsn_code` unused; GST report reads unpopulated `bills.gst_amount`).
- **Customer Checkout**: flat **5% GST** + delivery fee → grandTotal.
- **Customer inline order (PharmacyDetail)**: raw cart total, no GST/fee.
- **B2C bill**: line items + sum only.

### 9.5 Doctor commissions (`lib/commission-calculator.ts`)
On B2C **delivered**: order must have `prescription_id` → prescription `doctor_id` → **active** `doctor_pharmacy_partnerships(doctor,pharmacy)`. Per item: `base = price×qty × default_commission_pct/100`. Rule precedence **product (rule_value===product_id) > brand (product_name includes rule_value, case-insensitive) > category (any category rule)**. If matched rule has `flat_amount>0` → `flat_amount×qty`; else if `commission_pct>0` → `itemAmount×pct/100`. Insert `doctor_commission_earnings` (`status:"pending"`, rounded 2dp) + notify doctor total.

### 9.6 Delivery-staff collection approval chain
Staff collects → order `delivery_payment_status="pending_approval"` + `delivery_collected_amount` → surfaces in StockistPayments Approvals → approve creates confirmed payment + marks order paid + reduces outstanding.

---

## 10. AI & EDGE FUNCTIONS (`supabase/functions/*`, all `verify_jwt=false` in config.toml)

| Function | Model | Auth check in code | Contract |
|---|---|---|---|
| **parse-order-text** | `google/gemini-3-flash-preview` | Requires `Bearer` (401 else) | Body `{text, products:[{id,name}]}`. Tool `extract_order_items` → `{items:[{name,quantity,productId}]}`. 429/402 handled. |
| **parse-purchase-bill** | `google/gemini-3-flash-preview` (vision) | **No header check** | Body `{file_base64,file_type,file_name}`. Image → image_url; else base64 substring(0,50000) into prompt. Returns `{products:[…]}` (name/brand/category(enum)/mrp/sale_price/quantity/batch_number/expiry_date/composition/pack_size). Parse error → HTTP 200 `{error, raw}`. |
| **autofill-product-details** | `google/gemini-3-flash-preview` | Requires `Bearer` | Body `{product_name}` (min 3, 400 else). Tool `return_product_details` → brand/manufacturer/composition/drug_type(enum)/pack_type(enum)/category(enum)/drug_schedule(enum)/requires_prescription/pack_size/hsn_code/confidence/fields_filled. |
| **chat-bot** | `google/gemini-3-flash-preview` | Requires `Bearer`; **service-role** client | Body `{message, conversation_id}`. Fuzzy-match `quick_questions` (≥2 word overlap >3 chars OR prefix slice25) → canned answer; else general prompt (<100 words). Flags `is_forwarded` if reply mentions "forward"/"admin team". 429 → busy message. |
| **architecture-ai** | `google/gemini-2.5-flash` | None | Body `{messages, architectureContext}`. System prompt embeds context; `max_tokens 4096`. 429 → busy. |
| **flowboard-data** | — (static) | None | `?type=` returns sections/nodes/screens/database/routes/business-logic/infrastructure (v5.0.0 static dataset: 8 sections, per-node inputs/outputs/preconditions/postconditions/internalLogic/validations/failureCases/dev-designer-qa notes/tables/edgeFunctions/priority/complexity/status/children). |
| **seed-admin** | — | Service role | Idempotently creates admin auth user + `user_roles` admin. |
| **seed-production-data** | — | Service role | 17-phase Jaipur/Rajasthan demo seeder (pw `12345678`). |

All AI via `https://ai.gateway.lovable.dev/v1/chat/completions` with `LOVABLE_API_KEY`.

---

## 11. STORAGE BUCKETS & TTLs (inconsistent by design)
- **`documents`** (mixed): registration docs = **public URL**; resubmissions & delivery proofs = **signed 365d/1yr**; checkout prescriptions/UPI proofs = **signed 24h**; Rx upload = **raw path (no signed URL)**; pharmacy payment proof = **signed 30d**; pharmacy business docs = **signed 1d**; purchase bills (`bills/…`) = raw upload.
- **`product-images`** — stockist ProductForm single image (public URL).
- **`product_media`/`pharmacy_inventory_media`** — gallery uploads.
- **`public-assets`** — doctor avatar (public URL).
- **`platform`** — platform logo (`platform_settings.logo_url`).

---

## 12. DATA MODEL (from `integrations/supabase/types.ts`, project `ggliujfrabwtodwtjnul`)
~70 tables + 15 RPCs. Groups: identity/roles (profiles, user_roles, *_profiles, login_activity, login_attempts); catalog/inventory (products, product_batches, product_media, product_categories, pharmacy_inventory, pharmacy_inventory_media, pharmacy_categories, drug_schedules); B2B (orders, order_items, order_returns, order_status_history, delivery_staff, delivery_settings, delivery_route_templates, stockist_holidays, serviceable_areas, admin_serviceable_areas); B2C (customer_orders, customer_order_items, customer_returns, customer_return_items, customer_reviews, customer_wishlist, customer_addresses); finance (payments, payment_reminders, bills, bill_orders, credit_notes, subscription_plans); connections (stockist_pharmacy_circle, pharmacy_serviceable_areas, pharmacy_delivery_staff, pharmacy_consultation_settings); healthcare (consultations, prescriptions, prescription_items, prescription_templates, doctor_availability, doctor_specializations, doctor_pharmacy_partnerships, doctor_commission_rules, doctor_commission_earnings); compliance (counterfeit_alerts, reviews); governance/comms (admin_audit_log, notifications, messages, peer_messages, conversations, chat_messages, quick_questions, platform_settings, platform_banners).
- **RPCs**: has_role, check_login_rate_limit, record_login_attempt, verify_staff_credentials, hash_password, decrement_stock, deduct_product_stock, restore_product_stock, deduct_pharmacy_inventory, restore_pharmacy_inventory, update_circle_outstanding, admin_override_order_status, admin_override_customer_order_status, admin_send_targeted_notification, get_flowboard_schema.
- **Enums**: `app_role` admin/stockist/pharmacy/customer/doctor; `approval_status` pending/approved/rejected.
- Tables referenced via `as any` NOT in generated types: `pharmacy_stock_audits`, `recurring_orders`, `manufacturer_returns`, `price_history` (dead — no writer).

---

## 13. KNOWN STUBS / PLACEHOLDERS / BUGS (confirmed in code)
**Stockist**: GST entirely absent (cosmetic TAX INVOICE; GST report empty); Home "Pending Bills" keys on `status="draft"` (never written → always 0); **double stock deduction** (decrement_stock at create + deduct_product_stock at packed); `price_history` page dead; Export "PDF" emits `.xlsx`; StockTransfer & Dispose don't re-aggregate product stock; BatchManager uses **latest** batch (LIFO) for headline price; Home "Collect Payment" quick action only navigates; outstanding non-atomic in several flows; bill/order number schemes inconsistent (ORD-/SO/PH/BILL-/CN-); bill QR hardcoded `lovable.app` domain; manufacturer-return credit via `window.prompt`.
**Pharmacy**: no realtime; B2B purchase no deduction; RecurringOrders has no scheduler; Reports Schedule H/H1/NDPS placeholder rows; InventoryAuditLog reads nonexistent `selling_price`; B2C bill no tax; **customer-return approval does NOT restock**; staff password plaintext fallback if hash_password returns null.
**Customer**: **no OCR** on Rx upload (raw path); two divergent order paths (PharmacyDetail raw vs Checkout 5% GST+fee); GST fixed 5%; UPI "15-minute" banner static (no timer); consultation payment self-attested; booking **ignores doctor_availability** (no double-book check); reminders localStorage-only with <24h setTimeout; ReviewOrder writes `reviews` but reads from `customer_reviews` (**never surface**).
**Doctor**: meeting links manually pasted; Earnings excludes commissions while dashboard includes them; availability save destructive & never read; default commission 5% hardcoded.
**Admin**: Dashboard "System Health" & API-monitoring health hardcoded; Impersonate view-only; ForceReset only emails link; MergeAccounts migrates only notifications+login_activity (not orders; secondary not deleted); Returns/Commissions read-only; bulk approval client-side loop; maintenance flag stored but not enforced; banners URL-only.
**AI/infra**: `parse-purchase-bill` skips Authorization check (all fns `verify_jwt=false`); model ids pinned (`gemini-3-flash-preview`, `gemini-2.5-flash`); two overlapping SW update mechanisms; `useVersionCheck` reports `"1.0.0"` while `constants.APP_VERSION="2.0.0"` and MenuPage footer "v1.0.0"; branding drift "Digi Swasthya" / "Digi Swasthya Hub" / "Digital Swasthya"; WhatsApp country code `91` hardcoded; delivery routing is Google Maps URL (no optimization).

---

*Sources read directly: `App.tsx`; all layout/hook/lib files; every registration + auth + onboarding + staff + shared page; stockist Home/Products/ProductForm/BatchManager/CreateOrder/OrderDetail/Orders/Pharmacies/PharmacyDetail/Payments/RecordPayment/Returns/ExpiryManagement/StockTransfer/BulkBill/ManufacturerReturns/Reports/ExportData/PriceHistory/StaffForm + CollectPayment/QuickBill/BillPreview/EditPharmacy/BulkUpload* dialogs; pharmacy Dashboard/CustomerOrderDetail/B2CBillGenerator/StockistDetail/QuickOrder/InventoryForm/BulkImport/Payments/Reports/CustomerReturns/RecurringOrders/ReorderSuggestions; customer Dashboard/Checkout/PharmacyDetail/OrderDetail/BookConsultation/ConsultationDetail/PrescriptionDetail/PrescriptionUpload/MedicineReminders/ReviewOrder/ReturnRequest; doctor Dashboard/ConsultationDetail/PrescriptionWriter/Availability/PharmacyPartnershipDetail/Earnings; admin Dashboard/Stockists/Notifications/Impersonate/MergeAccounts/Counterfeit/OrderDetail/CustomerOrderDetail/Refunds/ForceReset/Users/MaintenanceMode/SystemArchitecture + ArchitectureAIView; all 8 edge functions (flowboard-data structure); types.ts summary.*

---
