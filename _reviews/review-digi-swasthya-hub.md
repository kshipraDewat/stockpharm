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

## 14. COMPLETE ROUTE INVENTORY (every route in `src/App.tsx`, verified)

### 14.1 Public / auth / staff (no `ProtectedRoute`)
| Route | Page | Notes |
|---|---|---|
| `/` | `RootRedirect` | role-priority redirect admin→stockist→pharmacy→customer→doctor→/login |
| `/login` | Login | role picker, admin 5-tap reveal, PWA install banner |
| `/register` | Register | 4 registration flows |
| `/forgot-password` | ForgotPassword | email reset link |
| `/reset-password` | ResetPassword | PASSWORD_RECOVERY handler |
| `/pending-approval` | PendingApproval | approval status + doc resubmission |
| `/onboarding/stockist`, `/onboarding/pharmacy` | static 3-slide carousels (never auto-navigated to) |
| `/staff/login`, `/staff` | StaffLogin / StaffDashboard | localStorage session, NOT Supabase auth |
| `/verify-bill/:billId` | VerifyBill | public bill verification (QR target) |
| `*` | NotFound | logs `console.error` with attempted path; "Return to Home" link |

`Index.tsx` (14 lines) is an unused placeholder ("Start building your amazing project here!") — not routed.

### 14.2 Role route trees (exact)
- **/stockist** (39 child routes): index Home; `products`, `products/add`, `products/:id`, `products/:id/edit`, `products/:id/price-history`; `orders`, `orders/create`, `orders/:id`; `pharmacies`, `pharmacies/find`, `pharmacies/:id`, `pharmacies/:id/ledger`; `more`, `payments`, `analytics`, `profile`, `business`, `export`, `reports`, `settings`, `help`, `notifications`, `privacy-security`, `returns`, `expiry-management`, `serviceable-areas`, `staff`, `staff/add`, `staff/:id/edit`, `delivery-routes`, `holidays`, `chats`, `chat/:peerId`, `messages`, `credit-notes`, `export-catalogue`, `bill-history`, `batch-management`, `record-payment`, `manufacturer-returns`, `bulk-bill`, `expiry-calendar`, `stock-transfer`.
- **/pharmacy** (44 child routes): index Dashboard; `orders`, `orders/quick`, `orders/:id`; `stockists`, `stockists/find`, `stockists/:id`; `browse`; `inventory`, `inventory/add`, `inventory/:id`, `inventory/:id/edit`; `more`, `profile`, `business`, `notifications`, `payments`, `analytics`, `export`, `reports`, `returns`, `help`, `privacy-security`, `settings`; `customer-orders`, `customer-orders/:id`; `staff-management`(+`/add`,`/:id/edit`); `delivery-routes`, `serviceable-areas`, `consultations`, `doctors`, `doctors/:id`, `expiry-management`, `chats`, `chat/:peerId`, `messages`, `commissions`, `customer-list`, `customer-list/:id`, `b2c-bills`, `quick-order-history`, `reorder-history`, `inventory-audit`, `stock-audit`, `bulk-import`, `recurring-orders`, `ledger/:stockistId`, `customer-returns`.
- **/customer** (31 child routes): index Dashboard; `orders`, `orders/quick`, `orders/:id`, `orders/:orderId/return`, `orders/:id/track`, `orders/:id/review`; `cart`, `checkout`; `pharmacies`, `pharmacies/:id`; `prescriptions`, `prescriptions/:id`; `consultations`, `consultations/book`, `consultations/:id`; `more`, `profile`, `settings`, `notifications`, `help`, `privacy-security`, `addresses`, `reminders`, `search`, `messages`, `chats`, `chat/:peerId`, `upload-prescription`, `health-profile`, `past-doctors`, `wishlist`.
- **/doctor** (23 child routes): index Dashboard; `consultations`(+`/:id`), `patients`(+`/:id`), `analytics`, `prescriptions`(+`/:id`, `/write`), `availability`, `earnings`, `more`, `profile`, `settings`, `notifications`, `help`, `privacy-security`, `pharmacies`(+`/:id`), `prescription-templates`, `messages`, `chats`, `chat/:peerId`.
- **/admin** (56 child routes): index Dashboard; `pharmacies`(+`/:id`), `stockists`(+`/:id`), `orders`(+`/:id`), `more`, `counterfeit`, `analytics`, `settings`, `notifications`, `messages`(+`/:userId`), `doctors`(+`/:id`), `customers`(+`/:id`), `customer-orders`(+`/:id`), `consultations`(+`/:id`), `returns`, `login-history`, `activity-log`, `commissions`, `delivery-staff`, `export`, `payments`, `bills`, `users`, `system-architecture`, `help`, `audit-trail`, `reviews`, `profile`, `refunds`, `revenue-detail`, `platform-invoice`, `banners`, `drug-schedules`, `product-categories`, `specializations`, `pharmacy-categories`, `serviceable-areas`, `subscriptions`, `impersonate`, `force-reset`, `system-report`, `active-users`, `maintenance`, `tos-management`, `license-expiry`, `merge-accounts`, `api-monitoring`, `geo-distribution`.

---

## 15. FULL DATA DICTIONARY (every table in `types.ts`, field-by-field)

Legend: `s`=string, `n`=number, `b`=boolean, `?`=nullable. Writers/readers from actual UI code.

### 15.1 Identity & access
- **profiles** (11): `id, user_id, full_name?, email?, phone?, avatar_url?, tos_accepted_at?, data_download_requested_at?, last_active_at?, created_at, updated_at`. One per auth user (all roles). Written at signup, ToS acceptance (`useToSAcceptance`), 5-min session heartbeat (`updated_at`). Read by TopNav avatar, admin user search/impersonate/targeted notifications.
- **user_roles** (3): `id, user_id, role(app_role enum: admin/stockist/pharmacy/customer/doctor)`. Inserted at registration; read at every login (role-match gate) and by `useAuth`. One user CAN hold multiple roles (RootRedirect picks by priority).
- **login_attempts** (4): `id, email, success:b, attempted_at`. Written by `record_login_attempt` RPC on every login try; read by `check_login_rate_limit` (15-min lockout) and AdminLoginHistory.
- **login_activity** (7): `id, user_id, status, device_info?, ip_address?, location?, created_at`. Read by AdminActivityLog, AdminActiveUsers, and per-role PrivacySecurity pages (last 10 logins). Re-pointed by MergeAccounts.
- **stockist_profiles** (26): business_name, business_type?, pan_number?, phone/whatsapp_number/email?, address/city/state/pin_code?, approval_status?, rejection_reason?, drug_license_url?, gst_certificate_url?, wholesale_license_url?, fssai_license_url?, drug_license_expiry?, bank fields (bank_name, account_number, ifsc_code, upi_id, account_holder_name), user_id, timestamps. `id` is the key used by ALL stockist child data.
- **pharmacy_profiles** (33): pharmacy_name, pharmacy_type?, license_number?, owner_name/owner_designation/owner_contact?, phone/whatsapp_number/email?, address/city/state/pin_code?, approval_status?/rejection_reason?, drug_license_url?/gst_certificate_url?/pharmacy_certificate_url?/drug_license_expiry?, bank fields + upi_id?, B2C commerce config: `delivery_fee?`, `free_delivery_above?`, `min_order_amount?` AND duplicate `minimum_order_amount?` (both exist), `operating_hours:Json?`, user_id, timestamps.
- **customer_profiles** (18): full_name, phone/email?, gender?, date_of_birth?, address/city/state/pin_code?, health fields `blood_group?, allergies?, chronic_conditions?, emergency_contact?`, avatar_url?, user_id, timestamps. No approval gating.
- **doctor_profiles** (26): full_name, specialization, qualification?, registration_number?, experience_years?, bio?, consultation_fee_audio/video/clinic?, `is_available?` (booking-list filter), approval_status?/rejection_reason?, medical_certificate_url?, id_proof_url?, `id_proof_status?` (approval_status enum — per-document status used by AdminDoctorDetail), avatar_url?, contact/address fields, user_id, timestamps.

### 15.2 Catalog & inventory
- **products** (33, stockist catalog): name, brand?, manufacturer?, category?, composition?, description?, pricing `mrp?, sale_price?, price?` (price kept = sale_price), `purchase_rate?`, stock `stock_quantity?, reserved_quantity?` (reserved never written by UI), `in_stock?`, `min_stock_level?, min_order_quantity?, moq?` (moq unused duplicate), `batch_number?, expiry_date?` (headline, mirrors latest batch), regulatory `hsn_code?, gst_rate?, drug_schedule?, drug_type?, fssai_license?, requires_prescription?, is_narcotic?`, `pack_type?, pack_size?, unit?`, image_url?, stockist_id. Created via ProductForm / BulkUploadCatalogue / BulkUploadPurchaseBill (upsert-by-name) / SharedProductDetail Clone. Deleted via detail-page confirm. Stock mutated by decrement_stock/deduct_product_stock/restore_product_stock RPCs, BatchManager re-aggregation, returns restock.
- **product_batches** (9): product_id, batch_number?, mrp?, sale_price?, purchase_rate?, stock_quantity?, expiry_date?, created_at. Written only by BatchManager and return-FIFO-restock; zeroed by ExpiryManagement Dispose and moved by StockTransfer.
- **product_media / pharmacy_inventory_media** (6 each): `image_url, is_primary, sort_order` + parent id. Delete-all-then-reinsert on gallery save.
- **product_categories** (4) / **pharmacy_categories** (3) / **drug_schedules** (5: schedule_name, description?, restrictions?) / **doctor_specializations** (3): admin CRUD config lists. NOTE: product forms actually use the hardcoded `PRODUCT_CATEGORIES`/`DRUG_SCHEDULES` constants, not these tables — the admin CRUD tables are not consumed by the forms.
- **pharmacy_inventory** (32): mirrors products schema (product_name instead of name, quantity instead of stock_quantity) + `is_visible_to_customers?`, `source_product_id?`, `source_stockist_id?` (set by bulk-import/auto-populate lineage), unit?. Rows created by: PharmacyInventoryForm, PharmacyBulkImport (qty 0, hidden), stockist-side `autoPopulateInventory` on B2B delivery (visible, qty added). Deducted by `deduct_pharmacy_inventory` on B2C confirm; restored by `restore_pharmacy_inventory` / cancel-restock.

### 15.3 B2B commerce
- **orders** (22): order_number, stockist_id, pharmacy_id, status?, payment_status, total_amount?, items_count, order_source (manual/whatsapp/platform/quick_order/split), notes?, `parent_order_id?` (split lineage), `partial_delivery_items:Json?`, `applied_credit_note_id?`, `credit_discount?`, delivery: `assigned_staff_id?`, `delivered_at?`, `delivery_proof_url?`, collection: `delivery_collected_amount?`, `delivery_payment_method?`, `delivery_payment_status?` (pending_approval/approved/rejected), timestamps.
- **order_items** (7): order_id, product_id, quantity, price?, `requested_batch?` (pharmacy can request a batch), created_at.
- **order_returns** (10): order_id, stockist_id, pharmacy_id, product_id, quantity, reason?, refund_amount?, status (pending/completed/rejected), created_at. Pharmacy requests → stockist approves/rejects; stockist can also create directly as completed.
- **order_status_history** (8): order_id, order_type, old_status?, new_status, changed_by?, notes?. Exists in schema; UI reads/writes it only sporadically (status transitions largely don't append here).
- **delivery_staff / pharmacy_delivery_staff** (12 each): name, phone, username, password_hash, is_active, aadhar_number?, age?, police_verification_id?, photo_url?, owner id. Auth via `verify_staff_credentials` RPC only.
- **delivery_settings** (8): stockist_id, pin_code, delivery_charge, delivery_days:s[], estimated_hours, free_delivery_above. Per-PIN config surfaced in QuickOrder "next delivery day".
- **delivery_route_templates** (6): stockist_id, name, pharmacy_ids:s[], notes?. Saved multi-stop selections.
- **stockist_holidays** (7): start_date, end_date, reason?, allow_preorder:b. Blocks/labels pharmacy ordering.
- **serviceable_areas** (4): stockist_id + pin_code (stockist coverage). **admin_serviceable_areas** (6): platform-level PIN whitelist (`is_active`) gating stockist registration. **pharmacy_serviceable_areas** (7): pharmacy_id, pin_code, delivery_charge?, estimated_hours?, free_delivery_above? — drives customer pharmacy discovery.

### 15.4 B2C commerce
- **customer_orders** (25): order_number, customer_id, pharmacy_id, status?, order_type? (delivery/pickup/prescription), payment_method?, payment_status?, total_amount?, delivery_fee?, gst_amount?, discount_amount? (schema-only, no UI writer), delivery_address?, delivery_pin_code?, prescription_id?, prescription_url?, prescription_verified?, upi_proof_url?, refund_status?, partial_items:Json?, assigned_staff_id?, delivered_at?, notes?, timestamps.
- **customer_order_items** (10): order_id, product_name, product_id?, quantity?, price?, requires_prescription?, `is_substitute?` + `original_product_name?` (substitution audit).
- **customer_returns** (8) + **customer_return_items** (5): pending→approved/rejected; refund_amount computed at approval; **no restock ever**.
- **customer_reviews** (10): customer_id, rating, comment?, pharmacy_id?/doctor_id?/order_id?, `reply?`+`reply_at?` (schema supports pharmacy replies; no UI writes replies). This is THE table read for all rating averages.
- **reviews** (7): customer_id, rating, comment?, target_type, target_id — written by CustomerReviewOrder, read nowhere (orphan write path).
- **customer_wishlist** (9): denormalized snapshot (product_name, price?, image_url?, pharmacy_name?, inventory_id?, pharmacy_id?).
- **customer_addresses** (9): label, address, city?/state?/pin_code?, is_default.

### 15.5 Finance
- **payments** (12): stockist_id, pharmacy_id, amount, payment_method, status (confirmed/pending), `collected_by?` (manual/delivery_staff/pharmacy), staff_id?, reference_id?, payment_proof_url?, notes?. Created by CollectPaymentDialog (confirmed), StockistRecordPayment (confirmed), staff-collection approval (confirmed), PharmacyPayments record-to-stockist (pending).
- **payment_reminders** (7): stockist_id, pharmacy_id, total_amount, sent_via ("whatsapp"), order_ids:s[]?.
- **bills** (12): bill_number, stockist_id, pharmacy_id, subtotal, total_amount, discount_type?/discount_value?, gst_amount? (never populated), due_date?, status ("confirmed" from BillPreviewDialog, "final" from BulkBill; "draft" never written). **bill_orders** (3): bill_id↔order_id join.
- **credit_notes** (9): credit_note_number ("CN-"+base36), stockist_id, pharmacy_id, order_id, return_id, amount, status (active/used). Created on returns; consumed in StockistCreateOrder.
- **subscription_plans** (9): name, price_monthly, price_yearly, target_role, features:Json?, is_active. Admin CRUD only — **no purchase/enforcement anywhere**.

### 15.6 Healthcare
- **consultations** (16): doctor_id, patient_id, pharmacy_id?, consultation_type (audio/video/clinic_visit), scheduled_at, fee, status? (booked/in_progress/completed/cancelled), payment_status?, meeting_link?, notes?, duration_minutes?, follow_up_date?/follow_up_notes?.
- **prescriptions** (8): doctor_id, patient_id, consultation_id?, pharmacy_id?, notes?, status?. **prescription_items** (9): product_name, product_id?, dosage?, duration?, quantity?, notes?.
- **prescription_templates** (5): doctor_id, template_name, items:Json.
- **doctor_availability** (7): day_of_week, start_time, end_time, is_active? — written by DoctorAvailability, read by nothing.
- **doctor_pharmacy_partnerships** (6): doctor_id, pharmacy_id, default_commission_pct (5 default), status (pending/active/rejected/inactive).
- **doctor_commission_rules** (7): partnership_id, rule_type (product/brand/category), rule_value, commission_pct?, flat_amount?.
- **doctor_commission_earnings** (10): doctor_id, pharmacy_id, partnership_id, customer_order_id, item_name, item_amount, commission_amount, status (pending→paid via pharmacy "Mark Paid").
- **pharmacy_consultation_settings** (5): pharmacy_id, doctor_id, is_active? — makes "Consult" appear on customer pharmacy pages.

### 15.7 Governance & comms
- **notifications** (7): user_id, title, message?, type?, read?. The universal event bus (~20 type values, see §18.3). Realtime INSERT subscription per user.
- **messages** (6): support-chat unread counter source (sender/receiver/content/read). **peer_messages** (6): same shape, B2B/peer chat. **conversations** (5): user_id, user_role — one support thread per user. **chat_messages** (7): conversation_id, sender_type (user/admin/bot), content, read?.
- **quick_questions** (5): question, answer, category? — canned bot answers (admin CRUD in AdminSettings).
- **admin_audit_log** (7): admin_user_id, action, target_type?, target_id?, details:Json?. Written by impersonate_view, force_password_reset, merge_accounts, customer-order overrides.
- **counterfeit_alerts** (9): product_name, alert_type (counterfeit/banned/spurious/nsq/recalled), batch_number?, manufacturer?, description?, is_active, created_by.
- **platform_settings** (4): key/value store. Keys observed in code: `logo_url`, `maintenance_mode`, `maintenance_message`, `platform_commission_pct`, `gst_rate_medicines` (+ per-category gst keys), ToS content, payment-method flags.
- **platform_banners** (8): title, message?, banner_type, target_roles:s[], is_active, created_by. Admin CRUD; **no client surface renders banners to end users**.

### 15.8 RPC signatures (exact, from types.ts)
`admin_override_customer_order_status(p_new_status, p_order_id)`, `admin_override_order_status(p_new_status, p_order_id)`, `admin_send_targeted_notification(p_message, p_title, p_user_id)`, `check_login_rate_limit(p_email)→boolean`, `decrement_stock(p_product_id, p_quantity)`, `deduct_pharmacy_inventory(p_inventory_id, p_quantity)`, `deduct_product_stock(p_product_id, p_quantity)`, `get_flowboard_schema()→Json`, `has_role(_role, _user_id)→boolean`, `hash_password(p_password)→string`, `record_login_attempt(p_email, p_success)`, `restore_pharmacy_inventory(p_inventory_id, p_quantity)`, `restore_product_stock(p_product_id, p_quantity)`, `update_circle_outstanding(p_circle_id, p_delta)`, `verify_staff_credentials(p_password, p_staff_type, p_username)→Json`.

---

## 16. ADMIN MODULE — PER-PAGE DETAIL (previously only name-listed; now source-verified)

### 16.1 Entity detail pages (approval workbenches)
- **AdminStockistDetail** (`stockists/:id`, 245 lines): loads profile + last orders (`orders ⋈ pharmacy_profiles`) + circle rows (`stockist_pharmacy_circle ⋈ pharmacy_profiles`) + last 100 products. **Approve/Reject buttons** update `stockist_profiles.approval_status` directly; reject requires a typed `rejection_reason`; either action notifies the stockist. **Per-document status setter**: updates arbitrary `[field]: status` on the profile (doc-level approve/reject). Documents render in an **inline `<iframe>` viewer** (h-80). Tabs/sections: profile info, documents, connected pharmacies (circle with outstanding), products list, orders (click → `/admin/orders/:id`). Footer "Message" button → `/admin/messages/{user_id}`.
- **AdminPharmacyDetail** (`pharmacies/:id`, 265 lines): identical pattern — profile, iframe documents with per-doc status, circle (stockists side), last-100 `pharmacy_inventory`, orders, approve/reject + reason + notify, message button.
- **AdminDoctorDetail** (`doctors/:id`, 175 lines): doctor profile + consultation fees card + Account Status card (approve/reject w/ reason + notify) + Documents (medical certificate, ID proof; iframe) + consultations list.
- **AdminCustomerDetail** (`customers/:id`, 172 lines): customer profile + Orders (click→customer-order detail) + Consultations + Prescriptions lists + Message button. **AdminCustomers**: card list of all `customer_profiles`, newest first.
- **AdminConsultationDetail** (`consultations/:id`, 142 lines): patient + doctor cards, prescription list, and an **"Admin Override Status"** card that updates `consultations.status` directly (plain `.update()`, not an RPC).

### 16.2 Oversight & finance pages
- **AdminOrders** (`orders`): two tabs — B2B (`orders` all) and B2C (`customer_orders` all), cards navigate to respective detail pages.
- **AdminCustomerOrders**: flat list of all `customer_orders` → detail.
- **AdminPayments** (167 lines): B2B `payments` list + a second query of `customer_orders` treated as B2C payment records (click → customer-order detail).
- **AdminBills**: all `bills` read-only list.
- **AdminDeliveryStaff**: merges `delivery_staff` (⋈ stockist business name) + `pharmacy_delivery_staff` (⋈ pharmacy name) into one read-only roster with active badges.
- **AdminReviewsManagement**: reads `customer_reviews` with 5-star renderer; **read-only** (no delete/moderation action).
- **AdminLicenseExpiry**: stockist + pharmacy profiles with non-null `drug_license_expiry`; per-row "Send Notification" inserts a `notifications` row to the licensee (toast "Notification sent to {name}"). NOTE: selects `drug_license_number` which is not in generated types.
- **AdminConsultations**: flat list. **AdminReturns/AdminCommissions**: read-only (as previously noted).

### 16.3 Analytics & reporting pages
- **AdminAnalytics** (216 lines): one `["adminAnalytics"]` query across 7 tables (orders, payments, all 4 profile tables, customer_orders); KPI grid with a **drill-down panel** (clicking a stat opens a card listing the underlying rows for that `drilldown.type`).
- **AdminRevenueDetail**: period selector; delivered B2B revenue (⋈ pharmacy+stockist names), delivered B2C revenue (⋈ pharmacy+customer names), commission totals; "Revenue Trend (B2B + B2C)" chart + "Top Pharmacies by B2C Revenue".
- **AdminPlatformInvoice**: month picker (12 back); pulls delivered B2B + B2C totals, confirmed payments, and `platform_settings.platform_commission_pct` + `gst_rate_medicines` → computes a hypothetical platform commission invoice for that month. **Display-only; nothing is billed or persisted.**
- **AdminSystemReport**: whole-platform counts (4 profile tables head-counts, orders/customer_orders/payments/bills/consultations sums, product count, return count) + "Download" (client file, toast "Report downloaded").
- **AdminActiveUsers**: recent `login_activity` → dedup user_ids → join `profiles` + `user_roles` → active-user list (uses zero-UUID sentinel to avoid empty `.in()`).
- **AdminLoginHistory**: raw `login_attempts` (email/success/time). **AdminActivityLog**: raw `login_activity`. **AdminAuditTrail**: raw `admin_audit_log` list.
- **AdminApiMonitoring**: 7-day counts of orders/customer_orders/notifications/login_activity + total profiles/consultations shown as "Operations (Last 7 Days)"; health indicator hardcoded (no real probes).
- **AdminGeoDistribution**: state/city tallies across the 4 profile tables → "Top Cities" + "Users by State" lists.
- **AdminExportData**: per-table export buttons; `select("*").limit(5000)` → XLSX; toasts success/`No data to export`.

### 16.4 Configuration CRUD (exact behavior)
All follow the same pattern: list query, inline create form, toggle `is_active` where applicable, hard delete, `qc.invalidateQueries`.
- **AdminSubscriptions**: create needs name + monthly price (yearly optional, features text); toggle/delete. No consumer.
- **AdminBanners**: title required; message, banner_type, `target_roles[]`; toggle/delete. No renderer in any layout. (Earlier note about an image URL field applies to the prior iteration; the current table has no image column.)
- **AdminServiceableAreas**: `admin_serviceable_areas` pin/city/state; unique-PIN violation surfaces as toast error; toggling `is_active` immediately affects stockist-registration PIN gate.
- **AdminSpecializations / AdminDrugSchedules / AdminProductCategories / AdminPharmacyCategories**: name(+description/restrictions) create + delete; **not consumed by product/registration forms** (those use hardcoded constants), so these are admin-side reference data only.
- **AdminSettings** (192 lines) — the platform config hub: platform **logo upload** to `platform` bucket (upsert, public URL, key `logo_url` → consumed by TopNav); generic `saveSetting(key,value)` upsert into `platform_settings`; **platform commission %** (`platform_commission_pct`, numeric-validated); **GST rate per category** (`gst_rate_{category}`; note Checkout still hardcodes 5% — these settings are only read by AdminPlatformInvoice); **payment-method toggles** ("Payment methods saved"); **quick_questions CRUD** (question+answer+category; feeds chat-bot and ChatPage chips).

### 16.5 Admin misc
- **AdminMessages**: conversation list from `conversations` ⋈ `profiles` + last `chat_messages`; click → `/admin/messages/:userId` (ChatPage in admin mode — admin replies write `sender_type:"admin"`).
- **AdminProfileSettings / AdminMore / AdminHelpCenter**: standard profile form, MenuPage grid of all admin routes, static help.

---

## 17. SETTINGS / BOILERPLATE PAGES PER ROLE (actual contents)

- **Settings pages** (Stockist 220 / Pharmacy 187 lines; Customer 61): theme selector Light/Dark/System persisted to `localStorage["theme"]` and applied immediately. Stockist/Pharmacy additionally have: **language list** — English available; Hindi ("Coming Soon — April 1"), Punjabi, Marathi, Tamil, Telugu all flagged Coming Soon (non-functional); **notification preference switches** (orders/payments/offers/compliance) persisted to `localStorage["app_preferences"]` — **purely client-side, nothing reads them when creating notifications**.
- **PrivacySecurity pages** (each role): change password (`auth.updateUser({password})`, current-password field collected but NOT verified); last-10 `login_activity` list; stockist adds **"Logout all sessions"** = `auth.signOut({scope:"global"})`. Customer version adds two **fake request buttons**: "Data export request submitted. You'll receive it via email within 48 hours." and "Account deletion request submitted... within 7 days." — both only toast (customer data-download flow can set `profiles.data_download_requested_at`; no backend job exists).
- **Notifications pages** (each role): last 50 `notifications` for user, mark-one/mark-all read, type-based icons.
- **Help Centers**: Customer = static FAQ (42 lines). Stockist (324 lines) = **4 tutorial "videos" pointing at w3schools sample MP4s** (mov_bbb.mp4/movie.mp4, "0:10") with an in-page player, FAQ accordion, and a **Feedback form** that inserts a `notifications` row (`title: "Feedback: {category}"`) to every admin. Pharmacy/Doctor variants similar.
- **ProfileSettings pages**: role-profile field editors; PharmacyProfileSettings also syncs `profiles.full_name = owner_name` and embeds a change-password block; DoctorProfileSettings uploads avatar to `public-assets`.
- **NotFound**: logs `console.error("404 Error: ... non-existent route: " + pathname)`; link home.

---

## 18. PLATFORM PLUMBING — PWA, STACK, NOTIFICATION TYPES

### 18.1 Service worker (`public/sw.js`, 68 lines — exact behavior)
- `CACHE_NAME="digi-swasthya-v3"`; install pre-caches only `/` and `/index.html`; **no `skipWaiting()` at install** (comment: wait for user to accept update); activate deletes non-current caches + `clients.claim()`.
- `message` listener: `{type:'SKIP_WAITING'}` → `self.skipWaiting()` (triggered by either UpdateBanner or useVersionCheck).
- Fetch strategy (GET only): **network-first** for `/rest/`, `/auth/`, `/functions/` and all navigations (navigations are cached on success; on failure serve cached request or cached `/`); **cache-first** for static extensions (js/css/images/fonts, cached on first fetch); **network-with-cache-fallback** for everything else. Consequence: Supabase data is never served stale from cache, but the app shell works offline.
- `manifest.json`: name "Digi Swasthya" / short_name "DigiSwasthya", description "Manage pharmacy and stockist operations seamlessly", start_url/scope/id `/`, standalone, portrait, theme `#16a34a` (green), background `#ffffff`, categories business+medical, icons favicon.ico 64 + SVG 192/512 + maskable 512.

### 18.2 Build & dependency stack (package.json)
Vite 5 + `@vitejs/plugin-react-swc`, TypeScript 5.8, Tailwind 3.4 (+typography plugin), ESLint 9. Runtime deps: `@supabase/supabase-js ^2.97`, `@tanstack/react-query ^5.83`, full Radix UI suite (shadcn), `react-router-dom` v6, `date-fns ^3.6`, `recharts`, `jspdf ^4.2` + `html2canvas ^1.4`, `qrcode.react`, `xlsx`, `lucide-react`, `sonner` (toasts), `cmdk`, `embla-carousel`, `next-themes`, `react-markdown`, `input-otp`, `zod`/`react-hook-form` (available; most forms are hand-rolled useState). Dev: Vitest (`vitest.config.ts`, jsdom, Testing Library) with a **single placeholder test** (`src/test/example.test.ts`); `lovable-tagger` (Lovable platform artifact).
- State management summary: **no Redux/Zustand/Context stores beyond `useAuth`**. Server state = TanStack Query; client state = component `useState` + 7 localStorage keys (`theme`, `digi_swasthya_cart`, `pharmacy_mode`, `tos_accepted`, `medicine_reminders`, `app_preferences`, `staff_session`, `flowboard-bookmarks`).

### 18.3 Notification `type` registry (values actually inserted)
`registration` (new signups → admins), `approval` (admin decision → applicant), `order` (B2B/B2C order events), `delivery` (staff delivered → stockist), `payment` / `payment_reminder`, `bill`, `price_change` (product edit → circle), `circle_status` (block/unblock), `return` (return decisions), `alert` (counterfeit fan-out), `broadcast` (admin), `commission` (earnings → doctor), `consultation` (booking/reschedule/cancel/status), `prescription` (new Rx → patient), `expiry` (pharmacy expiry report → stockists), `holiday` (stockist holiday → circle), `feedback` (help-center form → admins), `license` (admin license-expiry nudge), plus untyped defaults. Delivery = DB insert + realtime toast + bell list; **no email/SMS/push channel exists anywhere** (WhatsApp is manual `wa.me` deep links).

### 18.4 Flowboard view components (`src/components/admin/flowboard/`, 16 files)
`OverviewView` (stats + section cards), `RolesPermissionsView`, `ModulesView`, `JourneysView`, `ContentView` (node explorer with inputs/outputs/preconditions/postconditions/internalLogic/validations/failureCases/dev-designer-qa notes), `FlowView` (flow diagram), `ScreensView`, `DatabaseView` (tables/columns/FKs/RLS), `RoutesView`, `BusinessLogicView` (state machines/workflows/calculations), `InfraView` (edge fns/storage/realtime/triggers), `DependencyGraphView`, `SystemGraphView`, `ValidatorView` (model consistency checks), `ArchitectureAIView` (chat over serialized model), `ExportView`. All render the static v5.0.0 dataset from the `flowboard-data` edge function (875 lines) — this is **documentation-of-the-app data, not live schema introspection** (though `get_flowboard_schema` RPC exists). Types in `src/types/flowboard.ts`.

---

## 19. COMPLETE USER JOURNEYS (end-to-end, per role)

### 19.1 Customer (patient)
1. **Register** (3 steps, auto-active, no approval) → login (role "Patient") → `/customer`.
2. **Find medicine**: Dashboard → Search (cheapest-first across visible pharmacy inventories) or Pharmacies (PIN-matched via `pharmacy_serviceable_areas`) → pharmacy page → add to cart (single-pharmacy cart; switching pharmacy prompts clear).
3. **Order**: Cart → Checkout → delivery/pickup → fee + flat 5% GST → payment cash / pay_at_store / UPI(+proof upload, status "claimed") → Rx upload if cart has Rx items → order `pending`, pharmacy notified. (Alternate: inline order on pharmacy page — no GST/fee; or `upload-prescription` which creates an item-less `order_type:"prescription"` order for the pharmacy to price.)
4. **Track**: order detail stepper; pharmacy confirms (stock deducted) → prepares → out_for_delivery/ready_for_pickup → delivered. Customer may Cancel (pending/confirmed; restocks if confirmed+), "I've Paid", Reorder, Return (→ `customer_returns` pending), Review (writes orphan `reviews`), download invoice.
5. **Consult**: Book (choose doctor/type/free datetime, fee shown, pay-later or self-attested UPI) → doctor runs booked→in_progress→completed → prescription written → "Order Prescription Items" seeds cart at price 0 → pharmacy auto-prices. Reminders (localStorage), Wishlist, Addresses, Health profile support the loop.

### 19.2 Pharmacy (dual-mode)
1. **Register** (5 steps, docs) → pending → admin approves → login. **Purchase mode**: Find stockists → add to circle → order via stockist page cart (credit-limit enforced) or Quick Order (AI text parse → best-stockist ranking; no credit check) → stockist fulfils → on delivery stockist auto-populates `pharmacy_inventory` → pharmacy pays (Record Payment w/ UPI proof, status pending) or is collected from; ledger/credit notes track balance; returns requested via order detail.
2. **Inventory**: add manually (AI autofill), bulk-import from stockist catalog (qty 0, hidden), audit/expiry manage, visibility toggle for the B2C shopfront.
3. **Sale mode**: customer order arrives (notification) → verify Rx (gate) → confirm (stock deducts) → price/substitute/partial as needed → assign own delivery staff or ready_for_pickup → delivered (commissions fire if prescription-linked) → B2C bill, UPI verification, Mark Paid, customer-return approvals (refund only, no restock).
4. **Doctor partnerships**: accept doctor requests, per-rule commissions accrue on delivered Rx orders, Mark Paid per earning.

### 19.3 Stockist
1. **Register** (PIN-gated by `admin_serviceable_areas`, bank required) → approval → build catalog (form + AI, bulk XLSX, AI bill scan, batches via BatchManager).
2. **Circle**: find/accept pharmacies, set credit_limit/terms/blocked, monitor Net Due.
3. **Order lifecycle**: create manually/WhatsApp-parse (stock decrements at create) or receive platform/quick orders → packed (second deduction — known defect) → dispatched → assign staff (least-loaded suggestion) → out_for_delivery → delivered (+auto-populate pharmacy inventory). Edit/split/partial/duplicate/cancel/return along the way; bill per order or bulk; packing slip print.
4. **Money**: FIFO collect dialog, manual record, staff-collection approvals, WhatsApp reminders, receipts, ledgers, credit notes; analytics/reports/exports; ops via staff, routes, holidays, serviceable PINs, expiry buckets, stock transfer, manufacturer returns.

### 19.4 Doctor
Register (fees defaulted 300/500/200) → approval → set availability (unused by booking) → receive bookings → run consult (paste meeting link, notes, status transitions, mark paid) → write prescription (templates, pharmacy-inventory-aware item search, walk-in patient lookup) → partner with pharmacies (request → pharmacy accepts) → commission earnings accrue on delivered Rx orders → track earnings/analytics/patients/follow-ups.

### 19.5 Delivery staff (both kinds)
Owner creates credentials (hash_password RPC) → `/staff/login` (dual-type verify) → 24h localStorage session → see assigned open orders → Plan Route (Google Maps waypoints) → Mark Delivered (stockist staff: photo proof + optional cash/online collection → owner approval queue; pharmacy staff: status flip only) → KPIs (pending/today/total).

### 19.6 Admin
Hidden login (5-tap) → dashboard KPIs → approval queues (stockist/pharmacy/doctor, doc iframes, per-doc status, reject reasons, bulk loops) → oversight (orders w/ status override RPCs, payments, bills, returns, commissions, consultations override, refund state machine on cancelled paid B2C orders) → user ops (suspend/restore, view-as, force reset email, partial merge) → comms (broadcast/targeted, support chat as `admin` sender, quick-question CRUD) → safety (counterfeit alerts fan-out, license-expiry nudges, reviews view) → config (settings hub, banners, plans, areas, reference lists, maintenance flag, ToS) → intelligence (analytics drill-down, revenue, platform invoice, geo, system report, active users, login/audit trails, api monitoring) → Flowboard encyclopedia + architecture AI chat.

---

## 20. FLOWBOARD DATASET & DATABASE-SIDE LOGIC (`supabase/functions/flowboard-data/index.ts`, 875 lines)

### 20.1 Function mechanics
- `META = { version: "5.0.0", lastUpdated: new Date() }` wrapped around every response; endpoint `?type=` ∈ sections | nodes | screens | routes | business-logic | infrastructure | database; anything else → 400 with the valid list. CORS `*`, no auth.
- **Auto-discovery**: `buildCompleteNodesBySection()` walks a hardcoded `routeGroups` model and synthesizes an `auto-{role}-{slug}` UI node for every routed component not already hand-documented (default priority medium/complexity simple/status implemented). `buildCompleteScreens()` similarly synthesizes a `scr-{role}-{component}` screen entry per route with placeholder annotations ("Standard loading state" etc.). So Flowboard always shows 100% route coverage, with hand-curated depth (~251 `id:` entries) for the important nodes.
- **`?type=database`**: calls `rpc("get_flowboard_schema")` with the **service-role key** (live Postgres introspection: columns/FKs/RLS policies); on failure falls back to `KNOWN_TABLES` — a static list of 59 names returned with empty columns/FKs/policies. The static list includes `pharmacy_b2c_bills`, `tos_acceptances`, `tos_versions` which do NOT exist in the generated client types (historical/planned tables).

### 20.2 Database triggers documented in the model (server-side, not visible in client code)
`validate_order_status_transition` (BEFORE UPDATE on `orders`) and `validate_customer_order_status_transition` (BEFORE UPDATE on `customer_orders`) — DB-level status-transition guards (this is why admin overrides need SECURITY DEFINER RPCs "bypassing DB trigger validation"); `auto_hide_oos_products` (products BEFORE UPDATE), `auto_hide_expired_pharmacy_inventory` (pharmacy_inventory BEFORE UPDATE), `update_updated_at_column` (multiple tables), `handle_new_user` (auth.users AFTER INSERT — bootstraps `profiles`).

### 20.3 State machines as modeled (11) — with divergences from actual UI code
The model defines machines for B2B order (includes a `processing` state the UI never sets except in the "active" tab grouping), B2C order (**model says stock deducts at `preparing`; actual code deducts at `confirmed`**), B2B payment (unpaid→partial→paid), returns (model says `approved`; **code writes `completed`**), consultation (model includes a `confirmed` state; **code goes booked→in_progress→completed**), B2C payment (unpaid→paid→verified; code also uses `claimed`/`rejected`), approval (adds suspended↔approved and rejected→pending resubmission), customer return (model has `refunded`; code stops at approved/rejected), bill (draft→finalized→paid; **code writes `confirmed`/`final`, never draft**), credit note (active→used/expired; code never writes expired), partnership (pending→active⇄inactive / rejected). Treat the model as design intent; §9 of this document is the code truth.
- Model's RPC notes add server-side detail: `deduct_product_stock` is documented as **FIFO batch deduction looping batches by `expiry_date` ASC** (not a flat decrement), all stock/finance RPCs are SECURITY DEFINER, `verify_staff_credentials` uses **bcrypt**, `check_login_rate_limit` = 5 attempts / 15 min with cleanup in `record_login_attempt`.
- Infrastructure block lists buckets as `documents` (private, signed-URL), `avatars` (public — not referenced by current client code, which uses `public-assets`), `product-images` (public), `platform` (public); realtime tables notifications/messages/chat_messages; auth email-confirm on, email provider only.

### 20.4 Supabase client & build config (verified)
- `src/integrations/supabase/client.ts` (generated): `createClient<Database>(VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { storage: localStorage, persistSession: true, autoRefreshToken: true } })` — single shared client; anon key from env; session in localStorage.
- `vite.config.ts`: dev server host `::` port 8080, HMR overlay off, `@` → `./src` alias, `lovable-tagger` componentTagger in dev mode only.

---

*Sources read directly: `App.tsx`; all layout/hook/lib files; every registration + auth + onboarding + staff + shared page; stockist Home/Products/ProductForm/BatchManager/CreateOrder/OrderDetail/Orders/Pharmacies/PharmacyDetail/Payments/RecordPayment/Returns/ExpiryManagement/StockTransfer/BulkBill/ManufacturerReturns/Reports/ExportData/PriceHistory/StaffForm + CollectPayment/QuickBill/BillPreview/EditPharmacy/BulkUpload* dialogs; pharmacy Dashboard/CustomerOrderDetail/B2CBillGenerator/StockistDetail/QuickOrder/InventoryForm/BulkImport/Payments/Reports/CustomerReturns/RecurringOrders/ReorderSuggestions; customer Dashboard/Checkout/PharmacyDetail/OrderDetail/BookConsultation/ConsultationDetail/PrescriptionDetail/PrescriptionUpload/MedicineReminders/ReviewOrder/ReturnRequest; doctor Dashboard/ConsultationDetail/PrescriptionWriter/Availability/PharmacyPartnershipDetail/Earnings; admin Dashboard/Stockists/Notifications/Impersonate/MergeAccounts/Counterfeit/OrderDetail/CustomerOrderDetail/Refunds/ForceReset/Users/MaintenanceMode/SystemArchitecture + ArchitectureAIView; all 8 edge functions (flowboard-data structure); types.ts summary.*

*Expansion pass additionally verified against: full `types.ts` (3,293 lines — every table Row schema + Functions block extracted verbatim), `public/sw.js` + `public/manifest.json` line-by-line, `package.json`/`vitest.config.ts`, complete `<Route>` inventory in `App.tsx` (lines 424–663), and all 37 previously-unlisted admin pages (AdminAnalytics, AdminGeoDistribution, AdminApiMonitoring, AdminRevenueDetail, AdminPlatformInvoice, AdminSystemReport, AdminActiveUsers, AdminLoginHistory, AdminActivityLog, AdminAuditTrail, AdminLicenseExpiry, AdminReviewsManagement, AdminPayments, AdminBills, AdminConsultations/Detail, AdminDeliveryStaff, AdminMessages, AdminSettings, AdminExportData, AdminCustomers/Detail, AdminStockistDetail, AdminPharmacyDetail, AdminDoctorDetail, AdminOrders, AdminCustomerOrders, AdminSubscriptions, AdminBanners, AdminServiceableAreas, AdminSpecializations, AdminDrugSchedules, AdminProductCategories, AdminPharmacyCategories, AdminProfileSettings, AdminHelpCenter, AdminMore), plus per-role Settings/PrivacySecurity/Notifications/HelpCenter/ProfileSettings pages, `Index.tsx`, `NotFound.tsx`, and the 16 flowboard view components.*

---

*Documentation audit pass appended below — code-derived additions only; prior content preserved.*

## EXPANSION — Code-Derived Additions (Audit Pass)

*Audit date: 2026-07-04. Content derived exclusively from source under `digi-swasthya-hub/`. Documents implemented behavior only.*

### E.1 Complete Route Table

**Frontend routes extracted:** 217 | **Server API routes:** 0

| # | Path | Component | Role/Gate | Source |
|---|------|-----------|-----------|--------|
| 1 | `/` | RootRedirect | — | `src/App.tsx` |
| 2 | `/login` | Login | — | `src/App.tsx` |
| 3 | `/register` | Register | — | `src/App.tsx` |
| 4 | `/forgot-password` | ForgotPassword | — | `src/App.tsx` |
| 5 | `/reset-password` | ResetPassword | — | `src/App.tsx` |
| 6 | `/pending-approval` | PendingApproval | — | `src/App.tsx` |
| 7 | `/onboarding/stockist` | StockistOnboarding | — | `src/App.tsx` |
| 8 | `/onboarding/pharmacy` | PharmacyOnboarding | — | `src/App.tsx` |
| 9 | `/staff/login` | StaffLogin | — | `src/App.tsx` |
| 10 | `/staff` | StaffDashboard | — | `src/App.tsx` |
| 11 | `/stockist` | ProtectedRoute | stockist | `src/App.tsx` |
| 12 | `/products` | StockistProducts | — | `src/App.tsx` |
| 13 | `/products/add` | StockistAddProduct | — | `src/App.tsx` |
| 14 | `/products/:id` | StockistProductDetail | — | `src/App.tsx` |
| 15 | `/products/:id/edit` | StockistEditProduct | — | `src/App.tsx` |
| 16 | `/orders` | StockistOrders | — | `src/App.tsx` |
| 17 | `/orders/create` | StockistCreateOrder | — | `src/App.tsx` |
| 18 | `/orders/:id` | StockistOrderDetail | — | `src/App.tsx` |
| 19 | `/pharmacies` | StockistPharmacies | — | `src/App.tsx` |
| 20 | `/pharmacies/find` | StockistFindPharmacy | — | `src/App.tsx` |
| 21 | `/pharmacies/:id` | StockistPharmacyDetail | — | `src/App.tsx` |
| 22 | `/more` | StockistMore | — | `src/App.tsx` |
| 23 | `/payments` | StockistPayments | — | `src/App.tsx` |
| 24 | `/analytics` | StockistAnalytics | — | `src/App.tsx` |
| 25 | `/profile` | StockistProfileSettings | — | `src/App.tsx` |
| 26 | `/business` | StockistBusinessDetails | — | `src/App.tsx` |
| 27 | `/export` | StockistExportData | — | `src/App.tsx` |
| 28 | `/reports` | StockistReports | — | `src/App.tsx` |
| 29 | `/settings` | StockistSettings | — | `src/App.tsx` |
| 30 | `/help` | StockistHelpCenter | — | `src/App.tsx` |
| 31 | `/notifications` | StockistNotifications | — | `src/App.tsx` |
| 32 | `/privacy-security` | StockistPrivacySecurity | — | `src/App.tsx` |
| 33 | `/returns` | StockistReturns | — | `src/App.tsx` |
| 34 | `/expiry-management` | StockistExpiryManagement | — | `src/App.tsx` |
| 35 | `/serviceable-areas` | StockistServiceableAreas | — | `src/App.tsx` |
| 36 | `/staff/add` | StockistStaffForm | — | `src/App.tsx` |
| 37 | `/staff/:id/edit` | StockistStaffForm | — | `src/App.tsx` |
| 38 | `/delivery-routes` | StockistDeliveryRoutes | — | `src/App.tsx` |
| 39 | `/holidays` | StockistHolidays | — | `src/App.tsx` |
| 40 | `/chats` | ChatListPage | — | `src/App.tsx` |
| 41 | `/chat/:peerId` | PeerChatPage | — | `src/App.tsx` |
| 42 | `/messages` | ChatPage | — | `src/App.tsx` |
| 43 | `/credit-notes` | StockistCreditNotes | — | `src/App.tsx` |
| 44 | `/export-catalogue` | StockistExportCatalogue | — | `src/App.tsx` |
| 45 | `/pharmacies/:id/ledger` | StockistPharmacyLedger | — | `src/App.tsx` |
| 46 | `/bill-history` | StockistPurchaseBillHistory | — | `src/App.tsx` |
| 47 | `/batch-management` | StockistBatchManagement | — | `src/App.tsx` |
| 48 | `/record-payment` | StockistRecordPayment | — | `src/App.tsx` |
| 49 | `/products/:id/price-history` | StockistPriceHistory | — | `src/App.tsx` |
| 50 | `/manufacturer-returns` | StockistManufacturerReturns | — | `src/App.tsx` |
| 51 | `/bulk-bill` | StockistBulkBill | — | `src/App.tsx` |
| 52 | `/expiry-calendar` | StockistBatchExpiryCalendar | — | `src/App.tsx` |
| 53 | `/stock-transfer` | StockistStockTransfer | — | `src/App.tsx` |
| 54 | `/pharmacy` | ProtectedRoute | pharmacy | `src/App.tsx` |
| 55 | `/orders/quick` | PharmacyQuickOrder | — | `src/App.tsx` |
| 56 | `/stockists` | PharmacyStockists | — | `src/App.tsx` |
| 57 | `/stockists/find` | PharmacyFindStockist | — | `src/App.tsx` |
| 58 | `/stockists/:id` | PharmacyStockistDetail | — | `src/App.tsx` |
| 59 | `/browse` | PharmacyBrowse | — | `src/App.tsx` |
| 60 | `/inventory` | PharmacyInventory | — | `src/App.tsx` |
| 61 | `/inventory/add` | PharmacyInventoryForm | — | `src/App.tsx` |
| 62 | `/inventory/:id` | PharmacyInventoryDetail | — | `src/App.tsx` |
| 63 | `/inventory/:id/edit` | PharmacyInventoryForm | — | `src/App.tsx` |
| 64 | `/customer-orders` | PharmacyCustomerOrders | — | `src/App.tsx` |
| 65 | `/customer-orders/:id` | PharmacyCustomerOrderDetail | — | `src/App.tsx` |
| 66 | `/staff-management` | PharmacyStaffManagement | — | `src/App.tsx` |
| 67 | `/staff-management/add` | PharmacyStaffForm | — | `src/App.tsx` |
| 68 | `/staff-management/:id/edit` | PharmacyStaffForm | — | `src/App.tsx` |
| 69 | `/consultations` | PharmacyConsultations | — | `src/App.tsx` |
| 70 | `/doctors` | PharmacyDoctors | — | `src/App.tsx` |
| 71 | `/doctors/:id` | PharmacyDoctorPartnershipDetail | — | `src/App.tsx` |
| 72 | `/commissions` | PharmacyCommissions | — | `src/App.tsx` |
| 73 | `/customer-list` | PharmacyCustomerList | — | `src/App.tsx` |
| 74 | `/customer-list/:id` | PharmacyCustomerDetail | — | `src/App.tsx` |
| 75 | `/b2c-bills` | PharmacyB2CBillHistory | — | `src/App.tsx` |
| 76 | `/quick-order-history` | PharmacyQuickOrderHistory | — | `src/App.tsx` |
| 77 | `/reorder-history` | PharmacyReorderHistory | — | `src/App.tsx` |
| 78 | `/inventory-audit` | PharmacyInventoryAuditLog | — | `src/App.tsx` |
| 79 | `/stock-audit` | PharmacyStockAudit | — | `src/App.tsx` |
| 80 | `/bulk-import` | PharmacyBulkImport | — | `src/App.tsx` |
| 81 | `/recurring-orders` | PharmacyRecurringOrders | — | `src/App.tsx` |
| 82 | `/ledger/:stockistId` | PharmacyLedger | — | `src/App.tsx` |
| 83 | `/customer-returns` | PharmacyCustomerReturns | — | `src/App.tsx` |
| 84 | `/customer` | ProtectedRoute | customer | `src/App.tsx` |
| 85 | `/orders/:orderId/return` | CustomerReturnRequest | — | `src/App.tsx` |
| 86 | `/orders/:id/track` | CustomerOrderTracking | — | `src/App.tsx` |
| 87 | `/orders/:id/review` | CustomerReviewOrder | — | `src/App.tsx` |
| 88 | `/cart` | CustomerCart | — | `src/App.tsx` |
| 89 | `/checkout` | CustomerCheckout | — | `src/App.tsx` |
| 90 | `/prescriptions` | CustomerPrescriptions | — | `src/App.tsx` |
| 91 | `/prescriptions/:id` | CustomerPrescriptionDetail | — | `src/App.tsx` |
| 92 | `/consultations/book` | CustomerBookConsultation | — | `src/App.tsx` |
| 93 | `/consultations/:id` | CustomerConsultationDetail | — | `src/App.tsx` |
| 94 | `/addresses` | CustomerAddresses | — | `src/App.tsx` |
| 95 | `/reminders` | CustomerMedicineReminders | — | `src/App.tsx` |
| 96 | `/search` | CustomerMedicineSearch | — | `src/App.tsx` |
| 97 | `/upload-prescription` | CustomerPrescriptionUpload | — | `src/App.tsx` |
| 98 | `/health-profile` | CustomerHealthProfile | — | `src/App.tsx` |
| 99 | `/past-doctors` | CustomerPastDoctors | — | `src/App.tsx` |
| 100 | `/wishlist` | CustomerWishlist | — | `src/App.tsx` |
| 101 | `/doctor` | ProtectedRoute | doctor | `src/App.tsx` |
| 102 | `/patients` | DoctorPatients | — | `src/App.tsx` |
| 103 | `/patients/:id` | DoctorPatientDetail | — | `src/App.tsx` |
| 104 | `/prescriptions/write` | DoctorPrescriptionWriter | — | `src/App.tsx` |
| 105 | `/availability` | DoctorAvailability | — | `src/App.tsx` |
| 106 | `/earnings` | DoctorEarnings | — | `src/App.tsx` |
| 107 | `/prescription-templates` | DoctorPrescriptionTemplates | — | `src/App.tsx` |
| 108 | `/admin` | ProtectedRoute | admin | `src/App.tsx` |
| 109 | `/counterfeit` | AdminCounterfeit | — | `src/App.tsx` |
| 110 | `/messages/:userId` | ChatPage | — | `src/App.tsx` |
| 111 | `/customers` | AdminCustomers | — | `src/App.tsx` |
| 112 | `/customers/:id` | AdminCustomerDetail | — | `src/App.tsx` |
| 113 | `/login-history` | AdminLoginHistory | — | `src/App.tsx` |
| 114 | `/activity-log` | AdminActivityLog | — | `src/App.tsx` |
| 115 | `/delivery-staff` | AdminDeliveryStaff | — | `src/App.tsx` |
| 116 | `/bills` | AdminBills | — | `src/App.tsx` |
| 117 | `/users` | AdminUsers | — | `src/App.tsx` |
| 118 | `/system-architecture` | AdminSystemArchitecture | — | `src/App.tsx` |
| 119 | `/audit-trail` | AdminAuditTrail | — | `src/App.tsx` |
| 120 | `/reviews` | AdminReviewsManagement | — | `src/App.tsx` |
| 121 | `/refunds` | AdminRefunds | — | `src/App.tsx` |
| 122 | `/revenue-detail` | AdminRevenueDetail | — | `src/App.tsx` |
| 123 | `/platform-invoice` | AdminPlatformInvoice | — | `src/App.tsx` |
| 124 | `/banners` | AdminBanners | — | `src/App.tsx` |
| 125 | `/drug-schedules` | AdminDrugSchedules | — | `src/App.tsx` |
| 126 | `/product-categories` | AdminProductCategories | — | `src/App.tsx` |
| 127 | `/specializations` | AdminSpecializations | — | `src/App.tsx` |
| 128 | `/pharmacy-categories` | AdminPharmacyCategories | — | `src/App.tsx` |
| 129 | `/subscriptions` | AdminSubscriptions | — | `src/App.tsx` |
| 130 | `/impersonate` | AdminImpersonate | — | `src/App.tsx` |
| 131 | `/force-reset` | AdminForceReset | — | `src/App.tsx` |
| 132 | `/system-report` | AdminSystemReport | — | `src/App.tsx` |
| 133 | `/active-users` | AdminActiveUsers | — | `src/App.tsx` |
| 134 | `/maintenance` | AdminMaintenanceMode | — | `src/App.tsx` |
| 135 | `/tos-management` | AdminToSManagement | — | `src/App.tsx` |
| 136 | `/license-expiry` | AdminLicenseExpiry | — | `src/App.tsx` |
| 137 | `/merge-accounts` | AdminMergeAccounts | — | `src/App.tsx` |
| 138 | `/api-monitoring` | AdminApiMonitoring | — | `src/App.tsx` |
| 139 | `/geo-distribution` | AdminGeoDistribution | — | `src/App.tsx` |
| 140 | `/verify-bill/:billId` | VerifyBill | — | `src/App.tsx` |
| 141 | `/*` | NotFound | — | `src/App.tsx` |

### E.2 Entity / Table Catalog

**Tables/schemas found:** 63

#### `admin_audit_log`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `action` | `string` |
| `admin_user_id` | `string` |
| `created_at` | `string` |
| `details` | `Json | null` |
| `id` | `string` |
| `target_id` | `string | null` |
| `target_type` | `string | null` |

#### `admin_serviceable_areas`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `city` | `string | null` |
| `created_at` | `string` |
| `id` | `string` |
| `is_active` | `boolean` |
| `pin_code` | `string` |
| `state` | `string | null` |

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

#### `consultations`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `consultation_type` | `string` |
| `created_at` | `string` |
| `doctor_id` | `string` |
| `duration_minutes` | `number | null` |
| `fee` | `number` |
| `follow_up_date` | `string | null` |
| `follow_up_notes` | `string | null` |
| `id` | `string` |
| `meeting_link` | `string | null` |
| `notes` | `string | null` |
| `patient_id` | `string` |
| `payment_status` | `string | null` |
| `pharmacy_id` | `string | null` |
| `scheduled_at` | `string` |
| `status` | `string | null` |
| `updated_at` | `string` |

#### `conversations`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `id` | `string` |
| `updated_at` | `string` |
| `user_id` | `string` |
| `user_role` | `string` |

#### `counterfeit_alerts`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `alert_type` | `string` |
| `batch_number` | `string | null` |
| `created_at` | `string` |
| `created_by` | `string` |
| `description` | `string | null` |
| `id` | `string` |
| `is_active` | `boolean` |
| `manufacturer` | `string | null` |
| `product_name` | `string` |

#### `credit_notes`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `amount` | `number` |
| `created_at` | `string` |
| `credit_note_number` | `string` |
| `id` | `string` |
| `order_id` | `string` |
| `pharmacy_id` | `string` |
| `return_id` | `string` |
| `status` | `string` |
| `stockist_id` | `string` |

#### `customer_addresses`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `address` | `string` |
| `city` | `string | null` |
| `created_at` | `string` |
| `customer_id` | `string` |
| `id` | `string` |
| `is_default` | `boolean` |
| `label` | `string` |
| `pin_code` | `string | null` |
| `state` | `string | null` |

#### `customer_order_items`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `id` | `string` |
| `is_substitute` | `boolean | null` |
| `order_id` | `string` |
| `original_product_name` | `string | null` |
| `price` | `number | null` |
| `product_id` | `string | null` |
| `product_name` | `string` |
| `quantity` | `number | null` |
| `requires_prescription` | `boolean | null` |

#### `customer_orders`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `assigned_staff_id` | `string | null` |
| `created_at` | `string` |
| `customer_id` | `string` |
| `delivered_at` | `string | null` |
| `delivery_address` | `string | null` |
| `delivery_fee` | `number | null` |
| `delivery_pin_code` | `string | null` |
| `discount_amount` | `number | null` |
| `gst_amount` | `number | null` |
| `id` | `string` |
| `notes` | `string | null` |
| `order_number` | `string` |
| `order_type` | `string | null` |
| `partial_items` | `Json | null` |
| `payment_method` | `string | null` |
| `payment_status` | `string | null` |
| `pharmacy_id` | `string` |
| `prescription_id` | `string | null` |
| `prescription_url` | `string | null` |
| `prescription_verified` | `boolean | null` |
| `refund_status` | `string | null` |
| `status` | `string | null` |
| `total_amount` | `number | null` |
| `updated_at` | `string` |
| `upi_proof_url` | `string | null` |

#### `customer_profiles`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `address` | `string | null` |
| `allergies` | `string | null` |
| `avatar_url` | `string | null` |
| `blood_group` | `string | null` |
| `chronic_conditions` | `string | null` |
| `city` | `string | null` |
| `created_at` | `string` |
| `date_of_birth` | `string | null` |
| `email` | `string | null` |
| `emergency_contact` | `string | null` |
| `full_name` | `string` |
| `gender` | `string | null` |
| `id` | `string` |
| `phone` | `string | null` |
| `pin_code` | `string | null` |
| `state` | `string | null` |
| `updated_at` | `string` |
| `user_id` | `string` |

#### `customer_return_items`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `id` | `string` |
| `price` | `number | null` |
| `product_name` | `string` |
| `quantity` | `number` |
| `return_id` | `string` |

#### `customer_returns`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `customer_id` | `string` |
| `customer_order_id` | `string` |
| `id` | `string` |
| `pharmacy_id` | `string` |
| `reason` | `string | null` |
| `refund_amount` | `number | null` |
| `status` | `string` |

#### `customer_reviews`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `comment` | `string | null` |
| `created_at` | `string` |
| `customer_id` | `string` |
| `doctor_id` | `string | null` |
| `id` | `string` |
| `order_id` | `string | null` |
| `pharmacy_id` | `string | null` |
| `rating` | `number` |
| `reply` | `string | null` |
| `reply_at` | `string | null` |

#### `customer_wishlist`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `customer_id` | `string` |
| `id` | `string` |
| `image_url` | `string | null` |
| `inventory_id` | `string | null` |
| `pharmacy_id` | `string | null` |
| `pharmacy_name` | `string | null` |
| `price` | `number | null` |
| `product_name` | `string` |

#### `delivery_route_templates`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `id` | `string` |
| `name` | `string` |
| `notes` | `string | null` |
| `pharmacy_ids` | `string[]` |
| `stockist_id` | `string` |

#### `delivery_settings`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `delivery_charge` | `number` |
| `delivery_days` | `string[]` |
| `estimated_hours` | `number` |
| `free_delivery_above` | `number` |
| `id` | `string` |
| `pin_code` | `string` |
| `stockist_id` | `string` |

#### `delivery_staff`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `aadhar_number` | `string | null` |
| `age` | `number | null` |
| `created_at` | `string` |
| `id` | `string` |
| `is_active` | `boolean` |
| `name` | `string` |
| `password_hash` | `string` |
| `phone` | `string` |
| `photo_url` | `string | null` |
| `police_verification_id` | `string | null` |
| `stockist_id` | `string` |
| `username` | `string` |

#### `doctor_availability`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `day_of_week` | `string` |
| `doctor_id` | `string` |
| `end_time` | `string` |
| `id` | `string` |
| `is_active` | `boolean | null` |
| `start_time` | `string` |

#### `doctor_commission_earnings`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `commission_amount` | `number` |
| `created_at` | `string` |
| `customer_order_id` | `string` |
| `doctor_id` | `string` |
| `id` | `string` |
| `item_amount` | `number` |
| `item_name` | `string` |
| `partnership_id` | `string` |
| `pharmacy_id` | `string` |
| `status` | `string` |

#### `doctor_commission_rules`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `commission_pct` | `number | null` |
| `created_at` | `string` |
| `flat_amount` | `number | null` |
| `id` | `string` |
| `partnership_id` | `string` |
| `rule_type` | `string` |
| `rule_value` | `string` |

#### `doctor_pharmacy_partnerships`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `default_commission_pct` | `number` |
| `doctor_id` | `string` |
| `id` | `string` |
| `pharmacy_id` | `string` |
| `status` | `string` |

#### `doctor_profiles`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `address` | `string | null` |
| `approval_status` | `Database["public"]["Enums"]["approval_status"] | null` |
| `avatar_url` | `string | null` |
| `bio` | `string | null` |
| `city` | `string | null` |
| `consultation_fee_audio` | `number | null` |
| `consultation_fee_clinic` | `number | null` |
| `consultation_fee_video` | `number | null` |
| `created_at` | `string` |
| `email` | `string | null` |
| `experience_years` | `number | null` |
| `full_name` | `string` |
| `id` | `string` |
| `id_proof_status` | `Database["public"]["Enums"]["approval_status"] | null` |
| `id_proof_url` | `string | null` |
| `is_available` | `boolean | null` |
| `medical_certificate_status` | `| Database["public"]["Enums"]["approval_status"]` |
| `medical_certificate_url` | `string | null` |
| `phone` | `string | null` |
| `pin_code` | `string | null` |
| `qualification` | `string | null` |
| `registration_number` | `string | null` |
| `rejection_reason` | `string | null` |
| `specialization` | `string` |
| `state` | `string | null` |
| `updated_at` | `string` |
| `user_id` | `string` |

#### `doctor_specializations`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `id` | `string` |
| `name` | `string` |

#### `drug_schedules`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `description` | `string | null` |
| `id` | `string` |
| `restrictions` | `string | null` |
| `schedule_name` | `string` |

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

#### `order_returns`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `id` | `string` |
| `order_id` | `string` |
| `pharmacy_id` | `string` |
| `product_id` | `string` |
| `quantity` | `number` |
| `reason` | `string | null` |
| `refund_amount` | `number | null` |
| `status` | `string` |
| `stockist_id` | `string` |

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

#### `payment_reminders`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `id` | `string` |
| `order_ids` | `string[] | null` |
| `pharmacy_id` | `string` |
| `sent_via` | `string` |
| `stockist_id` | `string` |
| `total_amount` | `number` |

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

#### `pharmacy_categories`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `id` | `string` |
| `name` | `string` |

#### `pharmacy_consultation_settings`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `doctor_id` | `string` |
| `id` | `string` |
| `is_active` | `boolean | null` |
| `pharmacy_id` | `string` |

#### `pharmacy_delivery_staff`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `aadhar_number` | `string | null` |
| `age` | `number | null` |
| `created_at` | `string` |
| `id` | `string` |
| `is_active` | `boolean | null` |
| `name` | `string` |
| `password_hash` | `string` |
| `pharmacy_id` | `string` |
| `phone` | `string` |
| `photo_url` | `string | null` |
| `police_verification_id` | `string | null` |
| `username` | `string` |

#### `pharmacy_inventory`
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
| `is_narcotic` | `boolean | null` |
| `is_visible_to_customers` | `boolean | null` |
| `manufacturer` | `string | null` |
| `min_stock_level` | `number | null` |
| `mrp` | `number | null` |
| `pack_size` | `string | null` |
| `pack_type` | `string | null` |
| `pharmacy_id` | `string` |
| `price` | `number | null` |
| `product_name` | `string` |
| `purchase_rate` | `number | null` |
| `quantity` | `number | null` |
| `requires_prescription` | `boolean | null` |
| `sale_price` | `number | null` |
| `source_product_id` | `string | null` |
| `source_stockist_id` | `string | null` |
| `unit` | `string | null` |
| `updated_at` | `string` |

#### `pharmacy_inventory_media`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `id` | `string` |
| `image_url` | `string` |
| `inventory_id` | `string` |
| `is_primary` | `boolean` |
| `sort_order` | `number` |

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
| `drug_license_status` | `| Database["public"]["Enums"]["approval_status"]` |
| `drug_license_url` | `string | null` |
| `email` | `string | null` |
| `free_delivery_above` | `number | null` |
| `gst_certificate_status` | `| Database["public"]["Enums"]["approval_status"]` |
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
| `pharmacy_certificate_status` | `| Database["public"]["Enums"]["approval_status"]` |
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

#### `pharmacy_serviceable_areas`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `delivery_charge` | `number | null` |
| `estimated_hours` | `number | null` |
| `free_delivery_above` | `number | null` |
| `id` | `string` |
| `pharmacy_id` | `string` |
| `pin_code` | `string` |

#### `platform_banners`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `banner_type` | `string` |
| `created_at` | `string` |
| `created_by` | `string` |
| `id` | `string` |
| `is_active` | `boolean` |
| `message` | `string | null` |
| `target_roles` | `string[]` |
| `title` | `string` |

#### `platform_settings`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `id` | `string` |
| `key` | `string` |
| `updated_at` | `string` |
| `value` | `string | null` |

#### `prescription_items`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `dosage` | `string | null` |
| `duration` | `string | null` |
| `id` | `string` |
| `notes` | `string | null` |
| `prescription_id` | `string` |
| `product_id` | `string | null` |
| `product_name` | `string` |
| `quantity` | `number | null` |

#### `prescription_templates`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `doctor_id` | `string` |
| `id` | `string` |
| `items` | `Json` |
| `template_name` | `string` |

#### `prescriptions`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `consultation_id` | `string | null` |
| `created_at` | `string` |
| `doctor_id` | `string` |
| `id` | `string` |
| `notes` | `string | null` |
| `patient_id` | `string` |
| `pharmacy_id` | `string | null` |
| `status` | `string | null` |

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

#### `product_categories`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `description` | `string | null` |
| `id` | `string` |
| `name` | `string` |

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

#### `quick_questions`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `answer` | `string` |
| `category` | `string | null` |
| `created_at` | `string` |
| `id` | `string` |
| `question` | `string` |

#### `reviews`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `comment` | `string | null` |
| `created_at` | `string` |
| `customer_id` | `string` |
| `id` | `string` |
| `rating` | `number` |
| `target_id` | `string` |
| `target_type` | `string` |

#### `serviceable_areas`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `id` | `string` |
| `pin_code` | `string` |
| `stockist_id` | `string` |

#### `stockist_holidays`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `allow_preorder` | `boolean` |
| `created_at` | `string` |
| `end_date` | `string` |
| `id` | `string` |
| `reason` | `string | null` |
| `start_date` | `string` |
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
| `drug_license_status` | `| Database["public"]["Enums"]["approval_status"]` |
| `drug_license_url` | `string | null` |
| `email` | `string | null` |
| `fssai_license_status` | `| Database["public"]["Enums"]["approval_status"]` |
| `fssai_license_url` | `string | null` |
| `gst_certificate_status` | `| Database["public"]["Enums"]["approval_status"]` |
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
| `wholesale_license_status` | `| Database["public"]["Enums"]["approval_status"]` |
| `wholesale_license_url` | `string | null` |

#### `subscription_plans`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `created_at` | `string` |
| `description` | `string | null` |
| `features` | `Json | null` |
| `id` | `string` |
| `is_active` | `boolean` |
| `name` | `string` |
| `price_monthly` | `number` |
| `price_yearly` | `number` |
| `target_role` | `string` |

#### `user_roles`
*Source: `src/integrations/supabase/types.ts`*

| Field | Type |
|-------|------|
| `id` | `string` |
| `role` | `Database["public"]["Enums"]["app_role"]` |
| `user_id` | `string` |

### E.3 API / Backend Surface

#### Supabase Edge Functions

| Function | Lines | CORS | Auth Pattern | Notes |
|----------|-------|------|--------------|-------|
| `architecture-ai` | 82 | yes | service-role/user | — |
| `autofill-product-details` | 112 | yes | service-role/user | — |
| `chat-bot` | 114 | yes | service-role/user | — |
| `flowboard-data` | 875 | yes | public | — |
| `parse-order-text` | 118 | yes | service-role/user | — |
| `parse-purchase-bill` | 95 | yes | service-role/user | — |
| `seed-admin` | 73 | yes | public | — |
| `seed-production-data` | 690 | yes | public | — |

### E.4 Auth, Roles, and Permissions

#### Roles referenced in code

- `Admin`
- `Customer`
- `Doctor`
- `Pharmacy`
- `Stockist`
- `admin`
- `alert`
- `assistant`
- `auth`
- `customer`
- `doctor`
- `group`
- `link`
- `navigation`
- `pharmacy`
- `presentation`
- `region`
- `separator`
- `shared`
- `staff`
- `stockist`
- `system`
- `user`

#### RLS / Policy snippets (from migrations)

- Policy `Users can view own profile` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Users can update own profile` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Admins can view all profiles` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `System can insert profiles` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Users can view own roles` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Admins can view all roles` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Admins can manage roles` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `System can insert roles` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Stockists can view own profile` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Stockists can update own profile` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Stockists can insert own profile` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Admins can manage stockist profiles` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Approved stockists visible to pharmacies` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Stockists can manage own areas` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Admins can view areas` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Anyone authenticated can view areas` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Pharmacies can view own profile` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Pharmacies can update own profile` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Pharmacies can insert own profile` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Admins can manage pharmacy profiles` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Approved pharmacies visible to stockists` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Stockists can manage own products` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Authenticated users can view products` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Pharmacies can view own orders` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Stockists can view own orders` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Pharmacies can create orders` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Stockists can update order status` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Admins can view all orders` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Users can view own order items` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Pharmacies can insert order items` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Admins can view all order items` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Pharmacies can manage own inventory` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Admins can view inventory` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Users can view own notifications` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Users can update own notifications` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `System can insert notifications` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Users can view own messages` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Users can send messages` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Admins can view all messages` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Anyone can read platform settings` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Admins can manage platform settings` on `public` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Users can upload own documents` on `storage` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Users can view own documents` on `storage` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Admins can view all documents` on `storage` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Users can upload own avatar` on `storage` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Users can update own avatar` on `storage` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Avatars publicly accessible` on `storage` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Admins can manage platform assets` on `storage` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Platform assets publicly accessible` on `storage` *(migration `20260223132615_850b6add-2133-4b37-b222-d9761642c769.sql`)*
- Policy `Users can insert own profile` on `public` *(migration `20260223132642_a17c8b1a-f24a-40e3-92f2-068b6d4e2fe9.sql`)*
- Policy `Admins can insert notifications` on `public` *(migration `20260223132642_a17c8b1a-f24a-40e3-92f2-068b6d4e2fe9.sql`)*
- Policy `Stockists can manage own product batches` on `public` *(migration `20260223164931_9c7eaf13-0ac7-43ca-b771-0893f39b3b41.sql`)*
- Policy `Authenticated users can view product batches` on `public` *(migration `20260223164931_9c7eaf13-0ac7-43ca-b771-0893f39b3b41.sql`)*
- Policy `Authenticated users can upload product images` on `storage` *(migration `20260223164931_9c7eaf13-0ac7-43ca-b771-0893f39b3b41.sql`)*
- Policy `Authenticated users can update product images` on `storage` *(migration `20260223164931_9c7eaf13-0ac7-43ca-b771-0893f39b3b41.sql`)*
- Policy `Product images publicly accessible` on `storage` *(migration `20260223164931_9c7eaf13-0ac7-43ca-b771-0893f39b3b41.sql`)*
- Policy `Authenticated users can delete product images` on `storage` *(migration `20260223164931_9c7eaf13-0ac7-43ca-b771-0893f39b3b41.sql`)*
- Policy `Users can view own conversations` on `public` *(migration `20260224034455_c2918a9e-332a-49fe-a510-f537bbb0503c.sql`)*
- Policy `Users can create own conversations` on `public` *(migration `20260224034455_c2918a9e-332a-49fe-a510-f537bbb0503c.sql`)*
- Policy `Users can update own conversations` on `public` *(migration `20260224034455_c2918a9e-332a-49fe-a510-f537bbb0503c.sql`)*
- *… plus 152 additional policies*

### E.5 Workflows and State Machines

#### `payment_status` values observed in code

`approved` → `claimed` → `paid` → `partial` → `pending_approval` → `rejected` → `unpaid`

#### `sender_type` values observed in code

`admin` → `bot` → `user`

#### `status` values observed in code

`active` → `approved` → `cancelled` → `completed` → `confirmed` → `delivered` → `final` → `full` → `implemented` → `none` → `paid` → `partial` → `pending` → `rejected` → `success` → `used`

#### `target_type` values observed in code

`doctor` → `pharmacy` → `product`

#### Documented transition handlers (edge functions / server)

- **`flowboard-data`**: touches statuses `implemented`, `pending`
- **`seed-production-data`**: touches statuses `active`, `approved`, `confirmed`, `final`, `success`

### E.6 Dashboards, Reports, and Formulas

**Formula/calculation lines extracted:** 114

#### `src/pages/admin/AdminAnalytics.tsx`

- L17: `const { data: stats, isLoading } = useQuery({`
- L31: `const revenue = orders.filter(o => o.status === "delivered" || o.status === "completed").reduce((s, o) => s + (o.total_amount || 0), 0);`
- L32: `const b2cRevenue = custOrders.filter((o: any) => o.status === "delivered").reduce((s: number, o: any) => s + (o.total_amount || 0), 0);`
- L33: `const totalPaid = (paymentsRes.data || []).reduce((s, p) => s + (p.amount || 0), 0);`
- L41: `monthly[m].revenue += o.total_amount || 0;`
- L46: `monthly[m].b2c += o.total_amount || 0;`
- L109: `if ((s as any).drill === "pharmacies") setDrilldown({ type: "Pharmacies", data: stats?.pharmacyList || [] });`
- L110: `else if ((s as any).drill === "stockists") setDrilldown({ type: "Stockists", data: stats?.stockistList || [] });`
- L111: `else if ((s as any).drill === "customers") setDrilldown({ type: "Customers", data: stats?.customerList || [] });`
- L112: `else if ((s as any).drill === "doctors") setDrilldown({ type: "Doctors", data: stats?.doctorList || [] });`
- L149: `<BarChart data={stats.chartData}>`
- L162: `<LineChart data={stats.chartData}><XAxis dataKey="month" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} /><Tooltip /><Line type="monotone" d`
- L174: `<Pie data={stats?.orderStatusPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label onClick={(data: any) => handlePieClick("orde`
- L175: `{(stats?.orderStatusPie || []).map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} className="cursor-pointer" />)}`
- L189: `<Pie data={stats?.paymentMethodPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label onClick={(data: any) => handlePieClick("pa`
- L190: `{(stats?.paymentMethodPie || []).map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} className="cursor-pointer" />)}`
- L203: `<BarChart data={stats?.stateData} layout="vertical">`

#### `src/pages/admin/AdminDashboard.tsx`

- L14: `const { data: stats, isLoading } = useQuery({`
- L47: `if (months[m] !== undefined) months[m] += o.total_amount || 0;`
- L54: `const revenueToday = orderData.filter((o: any) => o.created_at.startsWith(today)).reduce((s: number, o: any) => s + (o.total_amount || 0), 0);`
- L55: `const revenueYesterday = orderData.filter((o: any) => o.created_at.startsWith(yesterday)).reduce((s: number, o: any) => s + (o.total_amount || 0), 0);`
- L71: `phMap[pid].revenue += o.total_amount || 0;`
- L91: `const b2cRevenue = (topPhRes.data || []).reduce((s: number, o: any) => s + (o.total_amount || 0), 0);`
- L102: `b2bRevenue: orderData.reduce((s: number, o: any) => s + (o.total_amount || 0), 0),`
- L104: `totalRevenue: orderData.reduce((s: number, o: any) => s + (o.total_amount || 0), 0) + b2cRevenue,`
- L152: `<p className="text-2xl font-bold">{stats?.newToday ?? 0}</p>`
- L157: `<p className="text-lg font-bold">₹{(stats?.revenueToday ?? 0).toLocaleString()}</p>`
- L167: `<p className="text-lg font-bold text-warning">{stats?.pendingStockists ?? 0}</p>`
- L171: `<p className="text-lg font-bold text-warning">{stats?.pendingPharmacies ?? 0}</p>`
- L175: `<p className="text-lg font-bold text-warning">{stats?.pendingDoctors ?? 0}</p>`
- L185: `<BarChart data={stats?.chartData || []}>`
- L202: `<Pie data={stats?.orderStatusPie || []} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, value }: any) => `${name}: $`
- L203: `{(stats?.orderStatusPie || []).map((_: any, i: number) => (`
- L220: `{stats!.topRevenuePharmacies.map((ph: any, i: number) => (`
- L239: `<BarChart data={stats?.growthData || []}>`

#### `src/pages/customer/CustomerDashboard.tsx`

- L222: `<p className="text-xs font-medium mt-1">₹{o.total_amount}</p>`

#### `src/pages/doctor/DoctorAnalytics.tsx`

- L26: `const totalEarnings = paid.reduce((s, c) => s + (c.fee || 0), 0);`
- L49: `return { totalEarnings, totalConsultations: all.length, uniquePatients, completionRate: all.length ? Math.round((all.filter(c => c.status === "complet`

#### `src/pages/doctor/DoctorDashboard.tsx`

- L19: `const { data: stats, isLoading } = useQuery({`
- L31: `const consultationEarnings = consultations.filter(c => c.payment_status === "paid").reduce((s, c) => s + (c.fee || 0), 0);`
- L33: `const commissionEarnings = (commRes.data || []).reduce((s, e: any) => s + (e.commission_amount || 0), 0);`
- L34: `const pendingCommissions = (commRes.data || []).filter((e: any) => e.status === "pending").reduce((s, e: any) => s + (e.commission_amount || 0), 0);`
- L35: `const totalEarnings = consultationEarnings + commissionEarnings;`
- L40: `const avgRating = reviews.length ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : null;`
- L64: `<KpiCard label="Today's Sessions" value={stats?.todayCount ?? 0} icon={Calendar} color="text-primary" navigateTo="/doctor/consultations" />`
- L65: `<KpiCard label="Total Patients" value={stats?.totalPatients ?? 0} icon={Users} color="text-accent" navigateTo="/doctor/patients" />`
- L66: `<KpiCard label="Total Earnings" value={`₹${(stats?.totalEarnings ?? 0).toLocaleString()}`} icon={IndianRupee} color="text-accent" navigateTo="/doctor/`
- L67: `<KpiCard label="Pending Sessions" value={stats?.pending ?? 0} icon={Clock} color="text-warning" navigateTo="/doctor/consultations" />`
- L77: `<span className="font-semibold">₹{(stats?.consultationEarnings ?? 0).toLocaleString()}</span>`
- L81: `<span className="font-semibold">₹{(stats?.commissionEarnings ?? 0).toLocaleString()}</span>`
- L84: `<p className="text-xs text-warning mt-1">₹{stats?.pendingCommissions?.toLocaleString()} pending</p>`
- L97: `<p className="text-sm font-bold">{stats.avgRating}★</p>`
- L98: `<p className="text-xs text-muted-foreground">{stats.reviewCount} patient reviews</p>`
- L103: `<p className="text-sm font-bold text-accent">{stats.partnerships}</p>`
- L129: `{(stats?.todayConsults || []).length === 0 ? (`
- L136: `(stats?.todayConsults || []).map((c: any) => (`
- L159: `{stats!.upcomingFollowups.map((c: any) => (`

#### `src/pages/pharmacy/PharmacyAnalytics.tsx`

- L15: `const { data: stats, isLoading } = useQuery({`
- L25: `const totalSpent = orders.reduce((s, o) => s + (o.total_amount || 0), 0);`
- L26: `const totalPaid = (paymentsRes.data || []).reduce((s, p) => s + (p.amount || 0), 0);`
- L31: `monthly[m] = (monthly[m] || 0) + (o.total_amount || 0);`
- L34: `return { totalSpent, totalPaid, stockists: circleRes.data?.length || 0, orders: orders.length, inventory: inventoryRes.count || 0, chartData };`
- L63: `<BarChart data={stats.chartData}><XAxis dataKey="month" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} /><Tooltip /><Bar dataKey="amount" fi`

#### `src/pages/pharmacy/PharmacyDashboard.tsx`

- L26: `const { data: stats, isLoading } = useQuery({`
- L30: `const [ordersRes, circleRes, inventoryRes, alertsRes, custOrdersRes, lowStockRes, expiryRes, totalCustRes] = await Promise.all([`
- L43: `const totalPurchase = orders.reduce((s, o) => s + (o.total_amount || 0), 0);`
- L47: `const custRevenue = custOrders.filter(o => o.status === "delivered").reduce((s, o) => s + (o.total_amount || 0), 0);`
- L52: `const uniqueCustomers = new Set((totalCustRes.data || []).map((o: any) => o.customer_id));`
- L102: `if (mode === "purchase") return <PurchaseDashboard stats={stats} recentOrders={recentOrders} pp={pp} navigate={navigate} />;`
- L103: `return <SaleDashboard stats={stats} recentCustOrders={recentCustOrders} pp={pp} navigate={navigate} />;`
- L107: `const PurchaseDashboard = ({ stats, recentOrders, pp, navigate }: any) => (`
- L121: `<p className="text-xs"><span className="font-semibold text-destructive">{stats?.lowStockCount}</span> low stock</p>`
- L129: `<p className="text-xs"><span className="font-semibold text-warning">{stats?.expiringCount}</span> expiring soon</p>`
- L138: `<KpiCard label="Active B2B Orders" value={stats?.activeB2BOrders ?? 0} icon={ShoppingCart} color="text-primary" navigateTo="/pharmacy/orders" />`
- L139: `<KpiCard label="Total Purchase" value={`₹${(stats?.totalPurchase ?? 0).toLocaleString()}`} icon={TrendingUp} color="text-accent" navigateTo="/pharmacy`
- L140: `<KpiCard label="Pending Payments" value={stats?.pendingPayments ?? 0} icon={Clock} color="text-warning" navigateTo="/pharmacy/payments" />`
- L141: `<KpiCard label="Connected Stockists" value={stats?.connectedStockists ?? 0} icon={Store} color="text-accent" navigateTo="/pharmacy/stockists" />`
- L142: `<KpiCard label="Inventory Items" value={stats?.inventoryItems ?? 0} icon={Package} color="text-primary" navigateTo="/pharmacy/inventory" />`
- L183: `<p className="text-xs text-muted-foreground mt-0.5">₹{o.total_amount}</p>`
- L195: `const SaleDashboard = ({ stats, recentCustOrders, pp, navigate }: any) => (`
- L199: `<p className="text-sm text-muted-foreground">Customer Sales & Delivery</p>`
- L204: `<KpiCard label="Active Orders" value={stats?.activeCustOrders ?? 0} icon={ShoppingCart} color="text-primary" navigateTo="/pharmacy/customer-orders" />`
- L205: `<KpiCard label="Today's Orders" value={stats?.todayCustOrders ?? 0} icon={ShoppingCart} color="text-accent" navigateTo="/pharmacy/customer-orders" />`
- L206: `<KpiCard label="Customer Revenue" value={`₹${(stats?.custRevenue ?? 0).toLocaleString()}`} icon={IndianRupee} color="text-accent" navigateTo="/pharmac`
- L207: `<KpiCard label="Avg Order Value" value={`₹${stats?.avgOrderValue ?? 0}`} icon={TrendingUp} color="text-primary" />`
- L208: `<KpiCard label="Pending Payments" value={stats?.pendingCustPayments ?? 0} icon={Clock} color="text-warning" navigateTo="/pharmacy/customer-orders" />`
- L209: `<KpiCard label="Customers" value={stats?.totalCustomers ?? 0} icon={Users} color="text-accent" navigateTo="/pharmacy/customer-list" />`
- L210: `<KpiCard label="Inventory Items" value={stats?.inventoryItems ?? 0} icon={Package} color="text-primary" navigateTo="/pharmacy/inventory" />`
- *… 1 more lines*

#### `src/pages/staff/StaffDashboard.tsx`

- L53: `const table = staffType === "stockist" ? "delivery_staff" : "pharmacy_delivery_staff";`
- L74: `const { data: stockistOrders = [], isLoading: loadingStockist } = useQuery({`
- L120: `const isLoading = isPharmacyStaff ? loadingPharmacy : loadingStockist;`
- L137: `const confirmDelivery = async () => {`
- L145: `const path = `delivery-proofs/${selectedOrder.id}-${Date.now()}.${ext}`;`
- L158: `updateData.delivery_collected_amount = parseFloat(payAmount);`
- L159: `updateData.delivery_payment_status = "pending_approval";`
- L160: `updateData.delivery_payment_method = payMethod;`
- L162: `if (proofUrl) updateData.delivery_proof_url = proofUrl;`
- L225: `<Card><CardContent className="p-3 text-center"><p className="text-lg font-bold">{deliveredOrders.length}</p><p className="text-[10px] text-muted-foreg`
- L251: `<p className="text-xs text-muted-foreground">₹{o.total_amount} {!isPharmacyStaff && `• ${o.items_count} items`}</p>`
- L280: `<Label className="text-sm flex items-center gap-1"><Camera className="h-3.5 w-3.5" /> Delivery Proof Photo (optional)</Label>`
- L297: `<div className="space-y-1"><Label className="text-xs">Amount (₹)</Label><Input type="number" value={payAmount} onChange={e => setPayAmount(e.target.va`
- L306: `<Button className="w-full rounded-xl" onClick={confirmDelivery} disabled={processing}>`

#### `src/pages/stockist/StockistAnalytics.tsx`

- L46: `const { data } = await supabase.from("stockist_pharmacy_circle").select("outstanding").eq("stockist_id", stockistId!);`
- L103: `if (months[key]) { months[key].revenue += o.total_amount || 0; months[key].orders += 1; }`
- L109: `const map: Record<string, { name: string; total: number; count: number }> = {};`
- L112: `if (!map[o.pharmacy_id]) map[o.pharmacy_id] = { name, total: 0, count: 0 };`
- L113: `map[o.pharmacy_id].total += o.total_amount || 0;`
- L116: `return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 5);`
- L152: `const totalOutstanding = circleData.reduce((s, c) => s + (c.outstanding || 0), 0);`
- L156: `const collected = thisMonthPayments.reduce((s, p) => s + ((p as any).amount || 0), 0);`
- L157: `const collectionRate = totalOutstanding + collected > 0 ? Math.round((collected / (totalOutstanding + collected)) * 100) : 0;`
- L180: `<Card><CardContent className="p-3 text-center"><p className="text-[10px] text-muted-foreground uppercase">Revenue</p><p className="text-lg font-bold t`
- L194: `<div key={i} className="flex justify-between items-center text-sm"><div><p className="font-medium">{p.name}</p><p className="text-xs text-muted-foregr`

### E.7 Modals / Dialogs / Sheets Inventory

**Files with dialog-like UI:** 45

| File | Dialog Count | Named Components |
|------|--------------|------------------|
| `src/pages/stockist/StockistOrderDetail.tsx` | 14 | (inline) |
| `src/pages/doctor/DoctorConsultationDetail.tsx` | 10 | (inline) |
| `src/pages/customer/CustomerConsultationDetail.tsx` | 10 | (inline) |
| `src/pages/pharmacy/PharmacyOrderDetail.tsx` | 8 | (inline) |
| `src/pages/stockist/StockistDeliveryRoutes.tsx` | 8 | (inline) |
| `src/pages/admin/AdminNotifications.tsx` | 8 | (inline) |
| `src/pages/customer/CustomerMedicineReminders.tsx` | 8 | (inline) |
| `src/components/stockist/ProductForm.tsx` | 6 | (inline) |
| `src/components/shared/ToSDialog.tsx` | 5 | ToSDialog |
| `src/pages/pharmacy/PharmacyCustomerOrderDetail.tsx` | 5 | (inline) |
| `src/pages/stockist/StockistHolidays.tsx` | 5 | (inline) |
| `src/pages/stockist/StockistCreateOrder.tsx` | 5 | (inline) |
| `src/pages/doctor/DoctorPharmacyPartnershipDetail.tsx` | 5 | (inline) |
| `src/pages/doctor/DoctorPrescriptionTemplates.tsx` | 5 | (inline) |
| `src/pages/customer/CustomerAddresses.tsx` | 5 | (inline) |
| `src/components/pharmacy/B2CBillGenerator.tsx` | 4 | (inline) |
| `src/components/stockist/EditPharmacyDialog.tsx` | 4 | EditPharmacyDialog |
| `src/components/stockist/BulkUploadPurchaseBill.tsx` | 4 | (inline) |
| `src/components/stockist/BatchManager.tsx` | 4 | (inline) |
| `src/components/stockist/QuickBillDialog.tsx` | 4 | QuickBillDialog |
| `src/components/stockist/CollectPaymentDialog.tsx` | 4 | CollectPaymentDialog |
| `src/components/stockist/BillPreviewDialog.tsx` | 4 | BillPreviewDialog |
| `src/components/stockist/BulkUploadCatalogue.tsx` | 4 | (inline) |
| `src/pages/pharmacy/PharmacyInventory.tsx` | 4 | (inline) |
| `src/pages/pharmacy/PharmacyRecurringOrders.tsx` | 4 | (inline) |
| `src/pages/pharmacy/PharmacyDoctors.tsx` | 4 | (inline) |
| `src/pages/pharmacy/PharmacyPayments.tsx` | 4 | (inline) |
| `src/pages/pharmacy/PharmacyServiceableAreas.tsx` | 4 | (inline) |
| `src/pages/stockist/StockistManufacturerReturns.tsx` | 4 | (inline) |
| `src/pages/stockist/StockistPharmacyDetail.tsx` | 4 | (inline) |
| `src/pages/stockist/StockistReturns.tsx` | 4 | openReturnDialog |
| `src/pages/stockist/StockistPayments.tsx` | 4 | (inline) |
| `src/pages/stockist/StockistPrivacySecurity.tsx` | 4 | (inline) |
| `src/pages/stockist/StockistStaffManagement.tsx` | 4 | (inline) |
| `src/pages/stockist/StockistServiceableAreas.tsx` | 4 | (inline) |
| `src/pages/stockist/StockistProducts.tsx` | 4 | (inline) |
| `src/pages/doctor/DoctorPrivacySecurity.tsx` | 4 | (inline) |
| `src/pages/doctor/DoctorPharmacies.tsx` | 4 | (inline) |
| `src/pages/admin/AdminCounterfeit.tsx` | 4 | (inline) |
| `src/pages/staff/StaffDashboard.tsx` | 4 | (inline) |
| `src/components/layout/AppLayout.tsx` | 0 | (inline) |
| `src/components/admin/flowboard/ScreensView.tsx` | 0 | (inline) |
| `src/pages/stockist/StockistPharmacies.tsx` | 0 | (inline) |
| `src/pages/stockist/StockistExportData.tsx` | 0 | (inline) |
| `src/pages/doctor/DoctorPrescriptionDetail.tsx` | 0 | (inline) |

### E.8 Mock, Stub, and Incomplete Behavior

**Files flagged:** 125

| File | Tags | Sample |
|------|------|--------|
| `supabase/functions/flowboard-data/index.ts` | demo | L174: { id: "doc-analytics", title: "Analytics", type: "ui", description: "Consultation tr |
| `src/components/ui/command.tsx` | placeholder | L47: "flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:tex |
| `src/components/ui/sidebar.tsx` | random | L536: return `${Math.floor(Math.random() * 40) + 50}%`; |
| `src/components/ui/select.tsx` | placeholder | L20: "flex h-10 w-full items-center justify-between rounded-md border border-input bg-back |
| `src/components/ui/textarea.tsx` | placeholder | L11: "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text |
| `src/components/ui/input.tsx` | placeholder | L11: "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ri |
| `src/components/registration/DoctorRegistration.tsx` | placeholder | L188: <div className="space-y-2"><Label>Full Name *</Label><Input value={form.fullName} on |
| `src/components/registration/StockistRegistration.tsx` | placeholder | L184: placeholder={`Enter ${label.toLowerCase()} number`} |
| `src/components/registration/CustomerRegistration.tsx` | placeholder | L129: <div className="space-y-2"><Label>Full Name *</Label><Input value={form.fullName} on |
| `src/components/registration/PharmacyRegistration.tsx` | placeholder | L144: <Input placeholder={`Enter ${label.toLowerCase()} number`} value={numberValue} onCha |
| `src/components/stockist/EditPharmacyDialog.tsx` | placeholder | L80: <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Internal n |
| `src/components/stockist/QuickBillDialog.tsx` | placeholder | L125: <Input type="number" className="h-8 text-xs" value={discountValue} onChange={e => se |
| `src/components/stockist/CollectPaymentDialog.tsx` | placeholder | L175: <Input type="number" value={amount} onChange={e => { setAmount(e.target.value); setM |
| `src/components/stockist/ProductForm.tsx` | placeholder | L165: placeholder="Search or add brand..." |
| `src/components/stockist/ProductFilters.tsx` | placeholder | L47: <SelectTrigger className="w-[130px] h-8 text-xs text-left justify-start"><SelectValue |
| `src/components/admin/flowboard/ArchitectureAIView.tsx` | placeholder | L281: placeholder="Ask about the architecture..." |
| `src/components/admin/flowboard/SystemGraphView.tsx` | placeholder | L385: placeholder="Search nodes..." className="h-7 pl-7 w-36 text-[10px]" /> |
| `src/components/admin/flowboard/DependencyGraphView.tsx` | placeholder | L182: placeholder="Search entities..." className="h-8 pl-8 text-xs" /> |
| `src/components/shared/MenuPage.tsx` | placeholder | L63: placeholder="Search menu..." |
| `src/pages/Login.tsx` | demo, placeholder | L20: // Dev-only seeded demo credentials (from seed-production-data) |
| `src/pages/ResetPassword.tsx` | placeholder | L71: <Input id="password" type={showPassword ? "text" : "password"} placeholder="Enter new |
| `src/pages/ForgotPassword.tsx` | placeholder | L67: placeholder="Enter your email" |
| `src/pages/pharmacy/PharmacySettings.tsx` | incomplete | L12: { code: "hi", label: "Hindi", available: false, comingSoon: "Coming Soon — April 1" } |
| `src/pages/pharmacy/PharmacyInventory.tsx` | placeholder | L118: <Input placeholder="Search inventory..." className="pl-9 h-9 rounded-xl" value={sear |
| `src/pages/pharmacy/PharmacyCustomerOrders.tsx` | placeholder | L57: <Input placeholder="Search orders..." value={searchQuery} onChange={e => setSearchQue |
| `src/pages/pharmacy/PharmacyStockAudit.tsx` | placeholder | L119: placeholder={String(item.quantity || 0)} |
| `src/pages/pharmacy/PharmacyRecurringOrders.tsx` | placeholder | L143: <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select Stockist" />< |
| `src/pages/pharmacy/PharmacyDoctors.tsx` | placeholder | L91: <Input className="pl-9" placeholder="Search by name or specialization" value={search} |
| `src/pages/pharmacy/PharmacyPayments.tsx` | placeholder | L222: <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select stockist" />< |
| `src/pages/pharmacy/PharmacyOrderDetail.tsx` | placeholder | L315: <Input type="number" min={0} max={item.quantity} placeholder="0" className="w-16 h-8 |
| `src/pages/pharmacy/PharmacyInventoryForm.tsx` | placeholder | L209: <Input value={form.brand || brandSearch} onChange={e => { setBrandSearch(e.target.va |
| `src/pages/pharmacy/PharmacyPrivacySecurity.tsx` | placeholder | L62: <Input type="password" placeholder="New password (min 6 characters)" value={newPasswo |
| `src/pages/pharmacy/PharmacyOrders.tsx` | placeholder | L95: <Input placeholder="Search orders..." value={searchQuery} onChange={e => setSearchQue |
| `src/pages/pharmacy/PharmacyBrowse.tsx` | placeholder | L93: <Input placeholder="Search products or stockists..." value={search} onChange={(e) =>  |
| `src/pages/pharmacy/PharmacyCustomerOrderDetail.tsx` | placeholder | L356: <Input type="number" value={manualTotal} onChange={e => setManualTotal(e.target.valu |
| `src/pages/pharmacy/PharmacyBulkImport.tsx` | placeholder | L100: <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select Stockist" />< |
| `src/pages/pharmacy/PharmacyQuickOrder.tsx` | placeholder | L142: <Textarea value={text} onChange={e => setText(e.target.value)} placeholder="e.g. Dol |
| `src/pages/pharmacy/PharmacyProfileSettings.tsx` | placeholder | L92: <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger> |
| `src/pages/pharmacy/PharmacyBusinessDetails.tsx` | placeholder | L138: <SelectTrigger className="text-left justify-start"><SelectValue placeholder="State"  |
| `src/pages/pharmacy/PharmacyServiceableAreas.tsx` | placeholder | L74: <Input placeholder="Enter 6-digit PIN" value={newPin} onChange={e => setNewPin(e.targ |
| `src/pages/stockist/StockistAddProduct.tsx` | placeholder | L171: <Input value={form.brand || brandSearch} onChange={e => { setBrandSearch(e.target.va |
| `src/pages/stockist/StockistSettings.tsx` | incomplete | L12: { code: "hi", label: "Hindi", available: false, comingSoon: "Coming Soon — April 1" } |
| `src/pages/stockist/StockistManufacturerReturns.tsx` | placeholder | L140: <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select product" /></ |
| `src/pages/stockist/StockistPharmacies.tsx` | placeholder | L94: <Input placeholder="Search circle..." value={search} onChange={e => setSearch(e.targe |
| `src/pages/stockist/StockistOrders.tsx` | placeholder | L84: <Input placeholder="Search orders..." value={search} onChange={e => setSearch(e.targe |
| `src/pages/stockist/StockistHolidays.tsx` | placeholder | L153: <Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. |
| `src/pages/stockist/StockistOrderDetail.tsx` | placeholder | L495: <SelectTrigger className="h-9 text-xs rounded-xl"><SelectValue placeholder="Select d |
| `src/pages/stockist/StockistStockTransfer.tsx` | placeholder | L100: <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select product" /></ |
| `src/pages/stockist/StockistCreateOrder.tsx` | placeholder | L229: <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select pharmacy..."  |
| `src/pages/stockist/StockistReturns.tsx` | placeholder | L413: placeholder="0" |
| `src/pages/stockist/StockistPayments.tsx` | placeholder | L340: <SelectTrigger className="rounded-xl"><SelectValue placeholder="Choose pharmacy" />< |
| `src/pages/stockist/StockistRecordPayment.tsx` | placeholder | L111: <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select pharmacy" />< |
| `src/pages/stockist/StockistFindPharmacy.tsx` | placeholder | L101: <Input placeholder="Search by name, owner, PIN code..." value={search} onChange={e = |
| `src/pages/stockist/StockistEditProduct.tsx` | placeholder | L214: <Input value={form.brand || brandSearch} onChange={e => { setBrandSearch(e.target.va |
| `src/pages/stockist/StockistPrivacySecurity.tsx` | placeholder | L95: <Input type="password" placeholder="New password (min 6 characters)" value={newPasswo |
| `src/pages/stockist/StockistServiceableAreas.tsx` | placeholder | L118: <Input placeholder="Enter 6-digit PIN code" value={newPin} onChange={e => setNewPin( |
| `src/pages/stockist/StockistDeliveryRoutes.tsx` | placeholder | L215: <Input value={templateName} onChange={e => setTemplateName(e.target.value)} placehol |
| `src/pages/stockist/StockistBusinessDetails.tsx` | placeholder | L127: <SelectTrigger><SelectValue placeholder="Select business type" /></SelectTrigger> |
| `src/pages/stockist/StockistAnalytics.tsx` | placeholder | L203: <SelectTrigger className="w-28 h-8 text-xs"><SelectValue placeholder="Category" /></ |
| `src/pages/stockist/StockistHelpCenter.tsx` | placeholder | L250: <Textarea value={feedbackForm.feedback} onChange={e => setFeedbackForm(f => ({ ...f, |
| `src/pages/stockist/StockistProducts.tsx` | placeholder | L121: <Input placeholder="Search products..." className="pl-9 h-9 rounded-xl" value={searc |
| `src/pages/stockist/StockistProfileSettings.tsx` | placeholder, incomplete | L92: <Input type={showPw[showKey] ? "text" : "password"} value={value} onChange={e => onCh |
| `src/pages/doctor/DoctorPharmacyPartnershipDetail.tsx` | placeholder | L275: <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger> |
| `src/pages/doctor/DoctorPrivacySecurity.tsx` | placeholder | L85: <Input type="password" placeholder="New password (min 6 characters)" value={newPasswo |
| `src/pages/doctor/DoctorPharmacies.tsx` | placeholder | L165: <Input className="pl-9" placeholder="Search pharmacy..." value={search} onChange={(e |
| `src/pages/doctor/DoctorProfileSettings.tsx` | placeholder | L126: <div className="space-y-1"><Label>Address</Label><Input value={form.address || ""} o |
| `src/pages/doctor/DoctorPrescriptionWriter.tsx` | placeholder | L179: placeholder="Search by name or phone..." |
| `src/pages/doctor/DoctorPrescriptionDetail.tsx` | placeholder | L156: <Input value={editedNotes} onChange={e => setEditedNotes(e.target.value)} placeholde |
| `src/pages/doctor/DoctorPrescriptionTemplates.tsx` | placeholder | L89: <div className="space-y-2"><Label>Template Name *</Label><Input value={templateName}  |
| `src/pages/doctor/DoctorConsultationDetail.tsx` | placeholder | L163: <Input value={meetingLink} onChange={e => setMeetingLink(e.target.value)} placeholde |
| `src/pages/admin/AdminBills.tsx` | placeholder | L67: <Input placeholder="Search bills..." className="pl-9 h-9 text-sm rounded-xl" value={s |
| `src/pages/admin/AdminLoginHistory.tsx` | placeholder | L60: <Input className="pl-9 rounded-xl" placeholder="Filter by email..." value={search} on |
| `src/pages/admin/AdminDoctorDetail.tsx` | placeholder | L115: <Input placeholder="Rejection reason (required for rejection)" value={rejectionReaso |
| `src/pages/admin/AdminConsultationDetail.tsx` | placeholder | L114: <SelectTrigger className="rounded-xl"><SelectValue placeholder="Change status..." /> |
| `src/pages/admin/AdminDoctors.tsx` | placeholder | L76: <Input className="pl-9 rounded-xl" placeholder="Search doctors..." value={search} onC |
| `src/pages/admin/AdminRefunds.tsx` | placeholder | L81: <Input placeholder="Search..." className="pl-9 h-9 text-sm rounded-xl" value={search} |
| `src/pages/admin/AdminCounterfeit.tsx` | placeholder | L113: <Input placeholder="Product Name *" value={form.product_name} onChange={e => setForm |
| `src/pages/admin/AdminImpersonate.tsx` | placeholder | L66: <Input placeholder="Name or email" value={search} onChange={e => setSearch(e.target.v |
| `src/pages/admin/AdminCustomers.tsx` | placeholder | L36: <Input className="pl-9 rounded-xl" placeholder="Search by name or phone..." value={se |
| `src/pages/admin/AdminHelpCenter.tsx` | demo | L11: { q: "How do I view platform analytics?", a: "Go to More > Platform Analytics for rev |
| `src/pages/admin/AdminPayments.tsx` | placeholder | L95: <Input placeholder="Search payments..." className="pl-9 h-9 text-sm rounded-xl" value |
| `src/pages/admin/AdminPharmacyCategories.tsx` | placeholder | L50: <Input placeholder="e.g. Retail, Hospital, Clinic" value={name} onChange={e => setNam |
| `src/pages/admin/AdminProductCategories.tsx` | placeholder | L50: <Input placeholder="Category name" value={name} onChange={e => setName(e.target.value |
| `src/pages/admin/AdminMergeAccounts.tsx` | placeholder | L70: <Input value={email1} onChange={e => setEmail1(e.target.value)} placeholder="primary@ |
| `src/pages/admin/AdminForceReset.tsx` | placeholder | L59: <Input type="email" placeholder="user@example.com" value={email} onChange={e => setEm |
| `src/pages/admin/AdminNotifications.tsx` | placeholder | L154: <Input value={broadcastTitle} onChange={e => setBroadcastTitle(e.target.value)} plac |
| `src/pages/admin/AdminDrugSchedules.tsx` | placeholder | L52: <Input placeholder="e.g. Schedule H" value={name} onChange={e => setName(e.target.val |
| `src/pages/admin/AdminStockistDetail.tsx` | placeholder | L139: <Input placeholder="Rejection reason (required for rejection)" value={rejectionReaso |
| `src/pages/admin/AdminCustomerOrderDetail.tsx` | placeholder | L108: <SelectTrigger className="flex-1"><SelectValue placeholder="Override status..." /></ |
| `src/pages/admin/AdminMessages.tsx` | placeholder | L80: <Input placeholder="Search users..." value={search} onChange={(e) => setSearch(e.targ |
| `src/pages/admin/AdminSystemArchitecture.tsx` | placeholder | L171: placeholder="Search... ( / )" className="h-8 pl-8 w-48 text-xs" /> |
| `src/pages/admin/AdminProfileSettings.tsx` | placeholder | L45: <Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Admi |
| `src/pages/admin/AdminOrderDetail.tsx` | placeholder | L85: <SelectTrigger className="flex-1 rounded-xl text-xs"><SelectValue placeholder="Change |
| `src/pages/admin/AdminToSManagement.tsx` | placeholder | L51: <Input value={tosUrl} onChange={e => setTosUrl(e.target.value)} placeholder="https:// |
| `src/pages/admin/AdminPharmacies.tsx` | placeholder | L79: <Input placeholder="Search pharmacies..." value={search} onChange={(e) => setSearch(e |
| `src/pages/admin/AdminMaintenanceMode.tsx` | placeholder | L51: <Textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Mai |
| `src/pages/admin/AdminAuditTrail.tsx` | placeholder | L36: <Input placeholder="Search actions..." value={search} onChange={e => setSearch(e.targ |
| `src/pages/admin/AdminPharmacyDetail.tsx` | placeholder | L139: <Input placeholder="Rejection reason (required for rejection)" value={rejectionReaso |
| `src/pages/admin/AdminUsers.tsx` | placeholder | L113: <Input className="pl-9 rounded-xl" placeholder="Search by name or email..." value={s |
| `src/pages/admin/AdminStockists.tsx` | placeholder | L80: <Input placeholder="Search stockists..." value={search} onChange={(e) => setSearch(e. |
| *…* | | *25 more* |

### E.9 Dead Code, Orphan Routes, and Broken Links

#### Duplicate / parallel component files



---

## EXPANSION PASS 2 — Deep Trace Additions (2026-07-08)

*Second reverse-engineering pass. Content below is strictly additive and covers material not present in the original review or the first Expansion pass — chiefly: exact SQL bodies of every database function/trigger (previously only known via the Flowboard model), exact RLS policy expressions (previously only policy names), verbatim AI prompts and edge-function contracts, the complete seeded-data specification, and a verbatim validation/error-message catalog. Domain scope: Admin / Stockist / Pharmacy only. All paths relative to `digi-swasthya-hub/`.*

### E2.1 Newly documented routes/pages/screens

No new routes exist beyond the 217 already tabulated in §14 and E.1 (verified against `src/App.tsx`). Additions below are route-level details not previously captured:

- **`/staff/login` header allowlist** — the staff RPC path requires no special headers, but all edge-function CORS allowlists (`supabase/functions/parse-order-text/index.ts` line 5) explicitly include `x-supabase-client-platform`, `x-supabase-client-platform-version`, `x-supabase-client-runtime`, `x-supabase-client-runtime-version` in `Access-Control-Allow-Headers` — a wider allowlist than the other functions, which only allow `authorization, x-client-info, apikey, content-type`.
- **DB-enforced route behavior**: any screen that updates `orders.status` or `customer_orders.status` (StockistOrderDetail, PharmacyCustomerOrderDetail, StaffDashboard, admin detail pages) is subject to the BEFORE UPDATE transition triggers documented in E2.3/E2.4 below. A UI action that attempts an illegal jump receives a Postgres exception surfaced through the Supabase client error object; the pages show the generic failure toast (e.g. `toast.error("Failed")`), not the SQL message. This means the effective screen-level state machine is the *intersection* of the buttons rendered and the SQL `valid_next` arrays.
- **`ready_for_pickup` / `out_for_delivery` cannot be cancelled at DB level for B2C** — `validate_customer_order_status_transition` allows `cancelled` only from `pending`, `confirmed`, `preparing` (`supabase/migrations/20260302091945_09b0963b-2afd-4d57-b216-1b549341615b.sql` lines 32–56). The pharmacy customer-order screen's cancel affordances are therefore hard-gated server-side even if the UI ever offered them later.
- Otherwise: **No new findings beyond existing review.**

### E2.2 Component behavior catalog

**`QuickBillDialog`** (`src/components/stockist/QuickBillDialog.tsx`, 153 lines) — previously only name-listed; full behavior:
- Props: `{ open, onOpenChange, stockistId, pharmacyId?, onDone }`. Triggered from StockistPharmacies dropdown "Generate Bill" and StockistPharmacyDetail.
- On open (and only when `pharmacyId` set): fetches **all** `orders` for that stockist+pharmacy pair, newest first (line 36–40) — despite the subtitle "Generate a bill for unpaid orders", there is **no payment/billed filter**; already-billed and paid orders are listed too.
- UI: header icon `FileText`, title "Quick Bill", subtitle "Generate a bill for unpaid orders"; "Select All"/"Deselect All" toggle text-button; scrollable checkbox list (`max-h-48`) with `#order_number`, `dd MMM yyyy` date, `₹total_amount`; discount block; Subtotal/Discount/Total summary; "Preview Bill" button; plain-text "Cancel" button.
- Discount math (lines 60–63): `discount = discountType==="percentage" ? selectedTotal * (parseFloat(discountValue)||0)/100 : parseFloat(discountValue)||0`; `total = Math.max(0, selectedTotal − discount)`. Discount type select offers `%` and `₹ Flat`; value input is a bare number field with placeholder "0" (no max validation — a flat discount larger than subtotal simply clamps total to 0).
- Validation: only `toast.error("Select at least one order")` (line 66). Preview passes `{orders, subtotal, discountType, discountValue, discount, total, stockistId, pharmacyId}` into `BillPreviewDialog`; on bill confirm the parent's `onDone` runs and this dialog closes.
- States: `loading` → "Loading orders..."; empty → "No orders found"; no error state (fetch error silently yields empty list).

**`ToSDialog`** (`src/components/shared/ToSDialog.tsx`) — exact behavior: renders only when `useToSAcceptance().accepted` is false; the Radix `Dialog` is forced open with a no-op `onOpenChange` and `onPointerDownOutside={e => e.preventDefault()}` — the dialog is **undismissable** except via the single full-width button "I Accept the Terms of Service". Content is 6 hardcoded numbered clauses (Account Usage, Data Privacy, Medical Disclaimer, Order & Payment, Returns & Refunds, Termination) inside a `max-h-60` ScrollArea. Acceptance (`src/hooks/useToSAcceptance.ts`) writes two localStorage keys: `tos_accepted="true"` and `tos_accepted_at=<ISO timestamp>` — note the hook is **purely client-side**; nothing writes `profiles.tos_accepted_at` from this path (the column exists per `supabase/migrations/20260309195019_881e1259-47f2-4ae2-9a2a-290025d4bc3c.sql` but this hook never touches Supabase). Clearing localStorage re-triggers ToS on next app load. Mounted once in `AppLayout`, so it applies to every authenticated role including Admin.

**`ProductGalleryUploader`** (`src/components/shared/ProductGalleryUploader.tsx`) — shared by stockist ProductForm and PharmacyInventoryForm:
- Props: `{ images: GalleryImage[], onChange, storagePath }` where `GalleryImage = {id?, image_url, sort_order, is_primary}`.
- Multi-file `<input type="file" accept="image/*" multiple>`; each file uploads to bucket **`product-images`** at `${storagePath}/${Date.now()}_${i}.${ext}` and stores the **public URL**. Per-file failure → `toast.error(\`Failed to upload ${file.name}\`)` and continues with remaining files (partial success possible). Input value reset after batch.
- First image ever added is auto-`is_primary`. Remove: filters, re-promotes `updated[0].is_primary=true` if primary was removed, re-indexes `sort_order` 0..n. Set-primary: exclusive flag mapping. Reorder: `←`/`→` swap buttons re-index `sort_order`. 80×80 thumbnails with "MAIN" corner badge on the primary and hover overlays (star = set primary, X = remove). All changes are in-memory via `onChange`; persistence (delete-all-then-insert into `product_media`/`pharmacy_inventory_media`) happens in the parent forms.

**Toast system duality** — the codebase carries two toast stacks: `sonner` (`toast.error/success/warning` used by virtually all pages; mounted via `src/components/ui/sonner.tsx`) and the shadcn `useToast`/`Toaster` pair (`src/components/ui/use-toast.ts`, `src/hooks/use-toast.ts`, `toast.tsx`, `toaster.tsx`) which has `TOAST_LIMIT = 1` and `TOAST_REMOVE_DELAY = 1000000` (~16.7 min) — effectively unused legacy plumbing alongside sonner.

### E2.3 Entity & schema deep detail (migration-derived)

**Storage buckets as created in SQL** (`supabase/migrations/20260223132615_…` lines 321–323 and `20260223164931_…` line 49):
- `documents` — **private** (`public=false`); `avatars` — public; `platform` — public; `product-images` — public. NOTE: the `avatars` bucket exists in SQL with full folder-scoped policies but **no client code uploads to it** (doctor avatar uses `public-assets`, which has **no bucket-creation migration at all** — it exists only project-side).
- Exact storage policies (same file, lines 326–333): `documents` INSERT/SELECT require `auth.uid()::text = (storage.foldername(name))[1]` — i.e. the **first folder segment must be the uploader's user id**; admins get SELECT on all documents via `has_role(auth.uid(),'admin')`. `product-images`: any authenticated user may INSERT/UPDATE/DELETE **any** object in the bucket (`bucket_id='product-images'` only — no ownership check; `20260223164931_…` lines 52–55). `platform`: admin-managed, publicly readable.
- Consequence traced against client code: uploads that do **not** start with the user id (`bills/{stockistId}/…` in BulkUploadPurchaseBill, `delivery-proofs/…` from the unauthenticated staff dashboard, `prescriptions/{customerId}/…` where customerId is the profile id not user id) depend on later, more permissive policies or fail—this is the schema-level reason several flows use signed URLs/raw paths inconsistently (§11).

**Exact RLS expressions** (previously names only; representative verbatim policies):
- `customer_profiles`: `"Authenticated can view customer profiles" FOR SELECT TO authenticated USING (true)` — **every authenticated user can read every customer profile** (`20260225122300_…`). Self-management via `auth.uid() = user_id`; admin via `has_role(auth.uid(),'admin'::app_role)`.
- `doctor_profiles`: visible when `approval_status = 'approved' OR auth.uid() = user_id`.
- `notifications`: `"Authenticated users can insert notifications" … WITH CHECK (true)` (`20260302091945_…` line ~68, re-affirmed in `20260302092602_…`) — **any authenticated user may insert a notification for any other user**; this is what allows all client-side cross-role notification fan-outs (order events, price change, feedback) without RPCs. The migration comment in `20260302092602` says "restrict to self-insert only" but the actual policy body is `WITH CHECK (true)`.
- `login_attempts`: INSERT allowed `TO anon, authenticated WITH CHECK (true)`; SELECT policy is `USING (false)` for authenticated (`20260302092602_…`) — reads happen only via SECURITY DEFINER RPCs; a later policy adds admin SELECT (`20260302114852_…`: `"Admins can view login attempts" USING (has_role(auth.uid(),'admin'))`) which is what AdminLoginHistory relies on.
- `delivery_staff`: `"Anyone can select staff for login"` (`20260225062823_…`) — a permissive SELECT that predates the RPC-based login; combined with `verify_staff_credentials` this means staff rows (including `password_hash`) are readable.
- `order_status_history`: both SELECT and INSERT are `TO authenticated USING/WITH CHECK (true)` (`20260315102854_…`) — fully open to any logged-in user.
- `doctor_commission_rules`: managed by either side of the partnership via nested `partnership_id IN (SELECT … WHERE doctor_id IN (…) OR pharmacy_id IN (…))` (`20260301080531_…`).
- `stockist_pharmacy_circle` / `payments` / `bills` / `credit_notes` / `payment_reminders`: pattern "Stockists can manage own X" (stockist_id resolved through `stockist_profiles.user_id = auth.uid()`), "Pharmacies can view own X", "Admins can manage all X" (`20260224065131_…`, `20260225062823_…`).
- `orders` both-sided: `"Pharmacies can create orders"` (original migration) **plus** `"Stockists can create orders"` and `"Stockists can insert order items"` added later (`20260224072821_…`) — this second pair is what makes stockist-initiated `StockistCreateOrder` possible at all.
- `platform_banners`: `"Authenticated can view active banners" USING (is_active = true)` — the read path exists even though no client renders banners (confirms E.9 orphan).

**Schema-only / seed-only columns not in generated `types.ts`** (hence invisible to the client): `pharmacy_profiles.drug_license_status`, `gst_certificate_status`, `pharmacy_certificate_status`; `stockist_profiles.drug_license_status`, `gst_certificate_status`, `fssai_license_status`, `wholesale_license_status` — all set to `'approved'` by both the demo migration `20260224185923_…` and `seed-production-data`. These are the per-document status fields the Admin detail pages write via their generic `[field]: status` setter (§16.1), reconciling how per-doc approve/reject persists despite the fields being absent from `types.ts`.

**Uniqueness & indexes** (performance contract, `20260226084125_…` and `20260302111856_…`): unique constraints on `orders.order_number` and `customer_orders.order_number` (added twice under different names — `*_unique` and `*_key` — both guarded by `IF NOT EXISTS`); 16 named b-tree indexes: `idx_orders_pharmacy_status(pharmacy_id,status)`, `idx_orders_stockist_status`, `idx_customer_orders_pharmacy_status`, `idx_customer_orders_customer`, `idx_notifications_user_read(user_id,read)`, `idx_consultations_doctor_status`, `idx_consultations_patient`, `idx_products_stockist_instock`, `idx_order_items_order`, `idx_customer_order_items_order`, `idx_prescriptions_doctor/patient`, `idx_prescription_items_prescription`, `idx_peer_messages_participants(sender_id,receiver_id)`, `idx_payments_pharmacy/stockist`; plus `idx_login_attempts_email(email,attempted_at)`, `idx_reviews_target(target_type,target_id)`, `idx_customer_returns_customer/pharmacy`, `idx_admin_audit_log_admin`, `idx_product_media_product_id(product_id,sort_order)`, `idx_pharmacy_inventory_media_inv_id`.

**Feature-number ↔ column archaeology** — the migrations carry the product backlog numbering inline, mapping features to columns: `#30 partial_delivery_items jsonb`, `#31 parent_order_id` (self-FK on orders), `#37 min_order_quantity default 1`, `#39 stockist_pharmacy_circle.is_blocked default false`, `#48 products.reserved_quantity default 0` (never used by UI), `#49 restore_product_stock`, `#57 auto_hide_oos_products` trigger, `#67 orders.delivered_at`, `#85 customer_orders.partial_items`, `#86 customer_order_items.is_substitute/original_product_name`, `#89 order_items.requested_batch`, `#94/#99 auto_hide_expired_pharmacy_inventory` trigger, `#103–105 pharmacy_profiles.operating_hours jsonb default '{}' / min_order_amount 0 / delivery_fee 0 / free_delivery_above 0`, `#167 admin login_attempts read`, `#169/#188 admin_override_customer_order_status`, `#175 admin_send_targeted_notification`, `#216 ToS` (`profiles.tos_accepted_at`) — sources: `20260302114852_…`, `20260311120502_…`, `20260302120218_…`, `20260309174247_…`, `20260309195019_…`.

**Trigger inventory as actually created** (deduplicated across the many re-creations): `on_auth_user_created` AFTER INSERT ON `auth.users` → `handle_new_user()` (inserts `profiles(user_id,email,full_name)` with `full_name = COALESCE(raw_user_meta_data->>'full_name','')`; SECURITY DEFINER); `update_updated_at_column()` BEFORE UPDATE on profiles/stockist_profiles/pharmacy_profiles/products/orders/pharmacy_inventory/customer_orders/customer_profiles/doctor_profiles/consultations/conversations (re-created under names `update_*_updated_at`, `set_updated_at`, `set_updated_at_*`, `trg_updated_at_*` in at least 6 migrations); `validate_order_status` BEFORE UPDATE [OF status] ON orders; `validate_customer_order_status` BEFORE UPDATE ON customer_orders; `trg_auto_hide_expired_inventory` BEFORE UPDATE ON pharmacy_inventory; `trg_auto_hide_oos_products` BEFORE UPDATE ON products.

### E2.4 Workflow traces (DB-enforced state machines, verbatim)

**B2B order transition guard** — `validate_order_status_transition()` final version (`supabase/migrations/20260301035303_…` lines 23–56):
- Short-circuits when `OLD.status = NEW.status`.
- **Admin bypass**: reads transaction-local GUC `current_setting('app.admin_override', true) = 'true'` (wrapped in an EXCEPTION handler defaulting to false); if true, any transition passes.
- Allowed map: `pending → {packed, processing, cancelled}`; `processing → {packed, cancelled}`; `packed → {dispatched, cancelled}`; `dispatched → {out_for_delivery, cancelled}`; `out_for_delivery → {delivered, cancelled}`; `delivered / cancelled / completed → {}` (terminal). Unknown old statuses pass through (`ELSE RETURN NEW`).
- Violation raises `'Invalid order status transition: % to %'`.
- So at the database level: **`processing` is a legal state** (UI never sets it but the seeded/legacy rows can move through it), skipping `packed` is impossible, and `delivered` orders cannot become `completed` — meaning the `completed` status counted in stockist revenue KPIs can only originate from seeds/legacy data, never from the current UI.

**Admin B2B override RPC** — `admin_override_order_status(p_order_id, p_new_status)` (`20260301035303_…` lines 60–75): SECURITY DEFINER; raises `'Only admins can override order status'` unless `has_role(auth.uid(),'admin')`; then `set_config('app.admin_override','true',true)` (transaction-local) → UPDATE → resets to `'false'`. This GUC handshake is the only sanctioned bypass of the B2B trigger.

**B2C order transition guard** — `validate_customer_order_status_transition()` (`20260302091945_…`): `pending → {confirmed, cancelled}`; `confirmed → {preparing, cancelled}`; `preparing → {ready_for_pickup, out_for_delivery, cancelled}`; `ready_for_pickup → {delivered}`; `out_for_delivery → {delivered}`; `delivered/cancelled` terminal. Violation raises `'Invalid customer order status transition: % to %'`. **Divergence from UI**: PharmacyCustomerOrderDetail renders a linear stepper implying confirmed→preparing→…, and its status buttons match this map; but the customer cancel flow (pending/confirmed only) is *stricter* than the DB (which also allows cancelling `preparing`).
- **Admin B2C override** — `admin_override_customer_order_status` (`20260302111856_…` lines 96–110) has **no GUC bypass**: it just UPDATEs after the admin check, so admin B2C overrides are still constrained by `validate_customer_order_status_transition` (an admin cannot force `delivered → confirmed`), unlike B2B where the GUC makes overrides unconstrained.

**Login rate-limit workflow** (`20260302092602_…` lines 86–110): `check_login_rate_limit(p_email)` returns `count(failures in last 15 min) < 5`; `record_login_attempt(p_email, p_success)` inserts the attempt **and deletes all rows older than 1 hour** (self-cleaning table). Combined with `Login.tsx` this yields: 5th consecutive failure within 15 minutes blocks further attempts until entries age out; successful logins do not reset the failure count (only time does).

**Staff credential verification** — `verify_staff_credentials` final version (`20260227043402_…` lines 98–145): branches on `p_staff_type` (`'stockist'` → `delivery_staff ⋈ stockist_profiles`, else `pharmacy_delivery_staff ⋈ pharmacy_profiles`); match condition is `username = p_username AND is_active = true AND ((password_hash LIKE '$2%' AND extensions.crypt(p_password, password_hash) = password_hash) OR (password_hash NOT LIKE '$2%' AND password_hash = p_password))` — i.e. **bcrypt when the stored hash looks like bcrypt, verbatim plaintext comparison otherwise** (server-side counterpart of the client's plaintext fallback in StaffForm). Returns `jsonb {id,name,phone,stockist_id|pharmacy_id,store_name,staff_type:'stockist_staff'|'pharmacy_staff',valid:true}` or `{valid:false}`. `store_name` falls back to `'Store'`/`'Pharmacy'`. `hash_password(p_password)` = `extensions.crypt(p_password, extensions.gen_salt('bf'))` (bcrypt, SQL-language, SECURITY DEFINER).

**Inventory auto-hide workflows** (server-side, invisible to UI code):
- `auto_hide_expired_pharmacy_inventory` (`20260302120218_…`): on ANY pharmacy_inventory UPDATE — if `quantity` transitions to 0 (from >0 or NULL) set `is_visible_to_customers := false`; independently, if `expiry_date < CURRENT_DATE` force `is_visible_to_customers := false`. Consequence: a pharmacy toggling visibility ON for an expired item is silently reverted by the trigger on the same write; B2C stock deductions that reach 0 auto-delist the item.
- `auto_hide_oos_products` (`20260309174247_…`): on products UPDATE — `stock_quantity` reaching 0 sets `in_stock := false`; leaving 0 sets `in_stock := true`. This runs in addition to the explicit `in_stock` writes inside `deduct_product_stock`/`restore_product_stock`, making the flag self-healing for direct quantity edits.

**Per-role trace deltas** (vs §19): Stockist "Mark Packed" → UI `deduct_product_stock` RPC → SQL FIFO loop (E2.5) → `validate_order_status` allows pending→packed → notification insert allowed by the permissive notifications policy. Pharmacy B2C "Confirm" → trigger allows pending→confirmed → `deduct_pharmacy_inventory` clamps at 0 → if an item hits 0 the auto-hide trigger delists it from the customer shopfront in the same transaction. Admin override B2B is total; admin override B2C is transition-constrained.

### E2.5 Business rules & calculations (SQL-exact)

- **`deduct_product_stock` FIFO algorithm** (`20260226084125_…` lines 45–73), now code-confirmed (previously only Flowboard-modeled): iterate `product_batches WHERE product_id=? AND stock_quantity>0 ORDER BY expiry_date ASC NULLS LAST, created_at ASC`; consume each batch fully or partially until `remaining=0`; then `products.stock_quantity = GREATEST(0, stock_quantity − p_quantity)` and `in_stock = (stock_quantity > 0)` as a second UPDATE. Notes: batches with NULL expiry are consumed **last**; if total batch stock < requested quantity the loop exhausts batches silently and the product headline still decrements by the full amount (floored at 0) — no error is raised for overselling.
- **`decrement_stock`** (`20260311120502_…`): single-statement `stock_quantity = GREATEST(0, stock_quantity − p_quantity)`; does **not** touch batches or `in_stock` (batch-blind — which is why create-time decrement + packed-time FIFO produce the double-deduction noted in §13, but only the packed step consumes batches).
- **`restore_product_stock`**: `stock_quantity += p_quantity` then `in_stock = (stock_quantity > 0)`; batch-blind (returns restore headline stock; the FIFO-batch restock is done separately in `StockistReturns` client code).
- **`deduct_pharmacy_inventory` / `restore_pharmacy_inventory`**: single UPDATEs, `GREATEST(0, quantity − p)` / `quantity + p`; visibility side-effects come from the auto-hide trigger, not the RPC.
- **`update_circle_outstanding`**: `outstanding = GREATEST(0, outstanding + p_delta)` — the floor-at-zero means over-payments are silently truncated at the circle level (excess is expected to be tracked via `credit_balance`, which this RPC never touches).
- **QuickBill discount** (E2.2): percentage on selected-orders subtotal or flat; `Math.max(0, subtotal − discount)`; discount displayed to 2dp via `toFixed(2)` but stored on the bill through `BillPreviewDialog`'s insert.
- **Seed-data financial identities** (`supabase/functions/seed-production-data/index.ts`): circle rows satisfy `credit_balance = credit_limit − outstanding` exactly (`credit_limit = 50000 + s*25000`, `outstanding = s*1000 + p*500`); seeded bills use `subtotal = round(total × 0.85)` and `gst_amount = round(total × 0.15)` — the **only** rows in the system where `bills.gst_amount` is non-zero (making the stockist GST report show values only on seeded data); B2B order totals `2000 + i*150`; commission earnings `round(total × default_pct / 100)` with the first 5 marked `paid`.
- **Stockist product price variance in seed**: per-stockist multiplier `v = 1 + (s % 3) × 0.05` (0%, 5% or 10% uplift on the 50-product master list), `stock_quantity = 100 + s*20 + p*10`, `min_stock_level = 20`, `gst_rate = '12'`, `hsn_code = '30049099'`, `is_narcotic = (schedule === 'X')` — exactly one Schedule X product (Alprazolam 0.25mg) and one H1 (Tramadol 50mg) exist in the master list, which is what the stockist regulatory reports (§3.7) key on.

### E2.6 API/edge-function reference deep detail

`supabase/config.toml`: project `ggliujfrabwtodwtjnul`; `verify_jwt = false` for all 7 deployed functions (parse-purchase-bill, chat-bot, parse-order-text, autofill-product-details, seed-admin, seed-production-data, architecture-ai). `flowboard-data` is notably **absent from config.toml** despite existing in the repo.

**`parse-order-text`** (118 lines) — verbatim contract:
- Rejects without `Authorization: Bearer …` → 401 `{error:"Unauthorized"}` (header presence check only; token is never verified).
- System prompt (verbatim): *"You are a pharmaceutical order parser. Given free-text order messages (like WhatsApp messages), extract product names and quantities. Match them against the product catalog if possible."* followed by the catalog as `id: name` lines and *"Return results using the extract_order_items tool."*
- Forced tool call `extract_order_items` with schema `{items:[{name:string(required), quantity:number(required), productId:string("Matched product ID from catalog, or empty if no match")}]}`, `additionalProperties:false`.
- Errors: 429 → `{error:"Rate limit exceeded, please try again later."}`; 402 → `{error:"Credits exhausted. Please add credits."}`; other gateway errors → throw → 500 `{error:...}`. Unparseable tool arguments → returns `{items: []}` with 200 (silent degradation).

**`parse-purchase-bill`** (95 lines): no auth check at all. User prompt (verbatim category enum): *"…return: name, brand, category (one of: Analgesics, Antibiotics, Gastrointestinal, Antihistamines, Antidiabetic, Cardiovascular, Vitamins, Dermatological, Respiratory, Antipyretics, Others), mrp, sale_price (or purchase rate), quantity, batch_number, expiry_date (YYYY-MM-DD format), composition (salt/ingredients), pack_size. Return ONLY valid JSON array. If a field is not found, use empty string."* — NOTE this category enum **does not match** the client's `PRODUCT_CATEGORIES` constant (16 values), so AI-extracted categories can be values the product form select can't display. Images go as `data:` URL; non-images embed `file_base64.substring(0, 50000)` in the text prompt (i.e., PDFs are parsed from raw base64 text — effectively lossy). Response parsing: regex `/\[[\s\S]*\]/` over the completion; JSON parse failure returns **HTTP 200** `{error:"Could not parse bill data", raw:<completion>}`. 402 message here differs: `"AI credits exhausted. Please add funds."`.

**`chat-bot`** (114 lines): requires Bearer header; builds a **service-role** client. Step 1 fuzzy quick-question match: words >3 chars from both question and message; overlap counts when either word contains the other; matched if `overlap ≥ 2 OR message.includes(question.slice(0,25))` → returns the canned `answer` with `is_forwarded:false` without calling AI. Step 2 AI: system prompt describes "Digi Swasthya, a B2B pharmaceutical distribution platform" with 5 feature bullets and 5 rules including *"Keep answers under 100 words"* and forwarding language for account-specific issues. `is_forwarded = reply contains "forward" or "admin team"` (lowercased). Every failure path (429, missing reply, thrown error) returns 200 with `{reply:"Your question has been forwarded to our support team. They'll respond shortly.", is_forwarded:true}` except 429 which returns the "busy" reply with `is_forwarded:false`.

**`seed-admin`** (73 lines): POST body **must** supply `{email, password}` (400 `{error:"email and password are required in request body"}` otherwise — credentials are not hardcoded). Idempotent: `listUsers()` scan by email; creates confirmed user (`email_confirm:true`, `full_name:"Admin"`) if absent; ensures a `user_roles` admin row. Returns `{success:true, userId}`. Publicly invocable (`verify_jwt=false`, no other guard) — anyone who knows the URL can mint an admin account.

**`seed-production-data`** (690 lines) — actually **25 phases**, not 17 as summarized earlier: (1) cleanup — deletes 36 data tables row-wise, deletes all non-admin profiles/roles/auth users while preserving the first admin; (2) creates 90 auth users in batches of 10 — 20 stockists, 50 pharmacies, 10 doctors, 10 patients, all `@gmail.com` with password `12345678`, `email_confirm:true`; (3) roles + profiles with deterministic phone scheme `9829{0|1|2|3}{10000+idx}` (digit encodes role); (4) role profiles — all `approval_status:'approved'` plus the per-document `*_status:'approved'` columns; Jaipur/Rajasthan addresses over 25 named areas and 5 PINs `['303328','302021','302012','302025','302044']`; PAN `ABCDE{1000+i}F`, licenses `RJ-PH-2024-{1000+i}`, UPI `stockist{n}@upi`/`pharmacy{n}@upi`, 10 banks/IFSC rotated; (5) 10–15 products per stockist from a 50-product master list + one `product_batches` row each (`BN2025SSPPP` numbering, expiries spread over 2027); (6) 200 pharmacy_inventory rows (first 20 pharmacies × 10 items, all visible); (7) circle (8–15 pharmacies per stockist), serviceable_areas, pharmacy_serviceable_areas (delivery_charge 30–50, free above 500, 24–48h), delivery_settings (charge 50+s*5, free above 5000, Mon–Sat); (8) 20 customer addresses; (9) 3–5 partnerships per doctor (`default_commission_pct = 5+(d%6)`) + 2 rules each (category 'Antibiotic' at pct+2; brand 'Cipla Ltd' at pct+3 **with flat_amount 5** — exercising the flat-beats-pct precedence); (10) 120 B2B orders `ORD-2026-0001…` cycling `['pending','packed','dispatched','delivered','delivered','delivered','cancelled']`, delivered⇒paid, source manual every 5th else platform, ~3 items each; (11) 40 B2C orders `CORD-2026-0001…` cycling 6 statuses, pending orders have `total_amount:0`, `prescription_verified` true for delivered/confirmed; (12) commission earnings for delivered B2C orders via first matching partnership; (13) 60 confirmed payments cycling 4 methods; (14) 25 bills `BILL-2026-####` status `final` + bill_orders; (15) 15 returns (5 rotating reasons, 8 approved / 7 pending) + 8 active credit notes `CN-2026-####`; (16) 25 consultations cycling `['booked','accepted','in_progress','completed','completed','cancelled']` — **`accepted` is seeded but is not a UI-reachable status** — plus prescriptions (3 items each, dosages 1-0-1/0-0-1/1-1-1); (17) delivery staff: 2–3 per stockist (`staff_s{n}_{j}`) + 25 pharmacy staff (`staff_p{n}`), password `12345678` hashed via `hash_password` RPC **with plaintext fallback** `const hash = staffHash || '12345678'`; (18) doctor availability Mon–Sat 09:00–12:00 & 16:00–19:00; (19) consultation settings 5 pharmacies per doctor; (20) notifications — includes types **`system`** and **`stock`** which no client flow ever inserts; (21) 50 peer messages from 5 canned strings; (22) 15 conversations + user/bot chat pairs; (23) 5 counterfeit alerts including alert_type **`substandard`** (not one of the admin UI's 5 types counterfeit/banned/spurious/nsq/recalled); (24) 15 payment reminders alternating `sent_via: 'whatsapp' | 'sms'` (**`sms` is seed-only**; the UI only writes whatsapp); (25) login_activity rows `Chrome on Android`, IPs `103.25.231.100+idx`, `Jaipur, Rajasthan`. Returns `{success, log[], totalUsers}`; errors → 500 with `stack`.

**`get_flowboard_schema()`** (`20260317035555_…`, full SQL now on record): SECURITY DEFINER plpgsql over `information_schema.tables/columns`, FK triple-join through `table_constraints/key_column_usage/constraint_column_usage`, and `pg_policies` (name/cmd/roles/using/withCheck) — returns `jsonb_agg` of `{name, columns[{name,type,nullable,defaultValue}], foreignKeys[{column,foreignTable,foreignColumn}], policies[...]}` for every base table in `public`, `'[]'` fallback. This is live introspection; the client never calls it directly (only `flowboard-data ?type=database` does, service-role).

**Hardcoded demo migration** `20260224185923_…`: pins fixed UUIDs (`stockist 5ff57da6-…`, `pharmacy d4cad4b8-…`, user `030d0e8a-…`), rebrands pharmacy1 as "Shree Ganesh Medical Store", Jitesh Sharma, **Indore, Madhya Pradesh 452001** (contradicting the Jaipur seeder), seeds circle 50000/12500/37500 "Regular customer", orders ORD-001/002/003 (5200 delivered-paid / 7300 dispatched / 5200 pending) and one confirmed UPI payment `UPI-REF-98765`.

**Seeded reference content** (migrations, not the edge fn): `20260224034455_…` seeds 8 stockist-oriented `quick_questions` (products/orders/general/support/registration categories — answers reference exact UI copy like "Bulk Upload Catalogue"/"Bulk Upload Purchase Bill"); `20260225054614_…` seeds 8 pharmacy-oriented quick questions plus 3 counterfeit alerts (Paracetamol 500mg `BN-2025-FAKE1` counterfeit; "Cough Syrup XYZ" banned "Banned by CDSCO due to substandard quality."; Amoxicillin 250mg `AMX-RECALL-01` recalled), attributed to the first admin user.

### E2.7 Role journeys step-by-step (deltas over §19, DB-guard-aware)

**Admin**: (1) Account exists only via `seed-admin` POST (any caller supplying email+password) or manual role insert — there is no admin registration UI. (2) 5-tap login reveal → dashboard. (3) B2B order intervention: pick order → "Change status..." select → `admin_override_order_status` sets the GUC and can force **any** transition, including reviving cancelled/delivered orders. (4) B2C intervention: `admin_override_customer_order_status` performs the update **without** the GUC, so the B2C trigger still rejects illegal jumps — the admin sees a failed mutation for e.g. delivered→pending. (5) Targeted notification path is the only admin action inserting `type:'admin'` notifications (via the RPC that re-checks `has_role`).

**Stockist**: (1) Registration hard-gated by `admin_serviceable_areas` PIN whitelist (admin must seed the PIN first — chicken-and-egg on fresh installs solved only by the seeder). (2) After approval, every status advance walks the SQL map: pending→packed (FIFO batch burn), packed→dispatched, dispatched→out_for_delivery, out_for_delivery→delivered (auto-populate pharmacy inventory) — attempting to skip (e.g. pending→delivered via any future UI) raises `Invalid order status transition`. (3) Cancel is legal from every non-terminal state at DB level. (4) Staff onboarding: create staff (bcrypt via `hash_password`), staff logs in at `/staff/login` through the dual-branch `verify_staff_credentials` (bcrypt or plaintext legacy). (5) Collections: staff-collected cash enters `pending_approval` and only the stockist's Approvals tab can convert it into a confirmed `payments` row + outstanding reduction.

**Pharmacy**: (1) Registration → pending → approval; editing business details later flips `approval_status` back to `pending` (re-verification loop, §4.6) which — because `Login.tsx` gates stockist/pharmacy/doctor on `approval_status` — will **lock the pharmacy out at next login** until re-approved. (2) Purchase side: circle join → order (credit gate) → the pharmacy never deducts stockist stock; goods "arrive" as `pharmacy_inventory` upserts done by the stockist's delivered transition. (3) Sale side: confirm order (DB allows pending→confirmed only) → stock deducts and zero-quantity items are auto-hidden by trigger → preparing → ready_for_pickup/out_for_delivery → delivered (commission calc). (4) Returns from customers end at approve/reject with refund_amount set; stock never returns to inventory (client omission; no trigger compensates).

### E2.8 Hidden/internal functionality

- **`avatars` bucket** — created public with per-user folder policies (`20260223132615_…`), never referenced by any client upload path; dormant infrastructure.
- **`processing` order status** — legal in the DB transition map and in the "Active" tab grouping, but no UI button sets it; reachable only via seeds or direct SQL.
- **`accepted` consultation status, `substandard` alert type, `sms` reminder channel, `system`/`stock`/`admin` notification types** — all writable only by the seeder or RPCs, invisible to the UI's own enumerations (see E2.6 seed phases 16, 23, 24, 20 and `admin_send_targeted_notification`).
- **`products.reserved_quantity`** — column added for feature #48 with default 0; no code path reads or writes it (the actual #48 implementation became `decrement_stock` at order creation).
- **localStorage key `tos_accepted_at`** — written alongside `tos_accepted` (`src/hooks/useToSAcceptance.ts`) but never read anywhere; the matching DB column `profiles.tos_accepted_at` is likewise never written by this hook.
- **Duplicate unique constraints** on order numbers (`orders_order_number_unique` and `orders_order_number_key`) — both live, created by different hardening migrations.
- **Trigger churn** — the same `updated_at` triggers were re-created under 4 different naming schemes across ≥6 migrations (`update_*`, `set_updated_at`, `set_updated_at_*`, `trg_updated_at_*`), evidence of repeated idempotency fixes; final state has overlapping-but-harmless duplicates guarded by `DROP TRIGGER IF EXISTS`.
- **Backlog numbering in SQL comments** (`#30…#216`) forms a hidden feature registry recoverable from migrations alone (catalogued in E2.3).
- **Deterministic demo phone numbers** — `9829{role-digit}{10000+idx}` lets any tester derive a user's phone from their email; staff phones use `70140`/`70141` prefixes.
- **`flowboard-data` missing from config.toml** — deployed function without a `verify_jwt` declaration (platform default applies), unlike its 7 siblings.
- **Seeder is destructive and unauthenticated** — `seed-production-data` deletes *all* non-admin auth users and data with no confirmation token; combined with `verify_jwt=false` this is a live reset endpoint.

### E2.9 Validation & error-handling catalog (verbatim)

**Database-raised exceptions** (surface as Supabase error objects): `Invalid order status transition: % to %`; `Invalid customer order status transition: % to %`; `Only admins can override order status`; `Only admins can override customer order status`; `Only admins can send targeted notifications`.

**Edge-function error strings**: `Unauthorized` (parse-order-text/autofill/chat-bot 401); `Rate limit exceeded, please try again later.` (429); `Credits exhausted. Please add credits.` (parse-order-text 402) vs `AI credits exhausted. Please add funds.` (parse-purchase-bill 402); `AI processing failed` (parse-purchase-bill gateway 500); `Could not parse bill data` (200-with-error); `email and password are required in request body` (seed-admin 400); chat-bot fallbacks `Our support system is busy right now. Please try again in a moment.` / `Your question has been forwarded to our support team. They'll respond shortly.`; `LOVABLE_API_KEY is not configured` / `LOVABLE_API_KEY not configured` (inconsistent phrasing between functions).

**Client toast validation messages** (Admin/Stockist/Pharmacy surfaces, grep-verified across `src/pages/{admin,stockist,pharmacy}` and `src/components/{stockist,pharmacy,shared}`): "Add items" · "Already in your circle" · "Cannot remove all items. Cancel instead." · "Could not parse items" · "Customers cannot be suspended via approval status" · "Email and title required" · "Email required" · "End date must be after start date" · "Enter a valid amount" · "Enter a valid quantity" · "Enter order items" · "Enter substitute name" · "Enter valid %" · "Enter valid 6-digit PIN" · "Enter valid rate" · "Export failed" · "Failed to generate PDF" · "Failed to logout all sessions" · "Failed to parse file" · "Failed to process bill" · "Failed to upload file" · "Failed" · "Fill all fields" · "Fill question & answer" · "Fill required fields" · "Invalid amount" · "Invalid quantities" · "Item name required" · "Match at least one product" · "Min 8 characters" · "Name and monthly price required" · "Name required" · "Name, phone, username and password are required" · "No bill data for selected period" · "No data to export" · "No items available in stock" · "No matching data for this report" · "No pharmacies selected" · "No product data available" · "No products could be extracted" · "No products to export" · "No users found" · "No valid products found in file" · "PDF generation failed" · "PIN already added" · "PIN already exists" · "PIN code required" · "Password must be at least 6 characters" · "Passwords don't match" · "Paste order text first" · "Please enter a rejection reason" · "Please fill batch number or stock quantity" · "Please fill required fields" · "Please fill start and end dates" · "Product name is required" · "Product name required" · "Required fields missing" · "Same user" · "Select a pharmacy" · "Select a product" · "Select at least one order" · "Select items for split order" · "Select items to deliver" · "Select items to return" · "Select stockist and enter amount" · "Source and destination batch must differ" · "Title is required" · "Title required" · "Upload failed" · "User not found with this email" · "User not found".

**Template-literal toasts**: `` `${errors.length} validation error(s)` `` (BulkUploadCatalogue) · `` `Failed to upload ${file.name}` `` (ProductGalleryUploader) · `` `Only ${maxQty} units available in source batch` `` (StockistStockTransfer) · `` `Order exceeds credit limit. Outstanding: ₹${outstanding}, Cart: ₹${cartTotal.toFixed(2)}, Limit: ₹${creditLimit}` `` (PharmacyStockistDetail) · `` `${mismatches.length} discrepancies reported to stockist` `` (PharmacyOrderDetail verify-received flow).

**Notable phrasing inconsistencies** (potential UX/consistency findings recorded as fact): password minimum appears as both "Min 8 characters" and "Password must be at least 6 characters" in different screens; "Product name is required" vs "Product name required"; "Title required" vs "Title is required"; "Fill required fields" vs "Please fill required fields" vs "Required fields missing" — all distinct strings in code.

*End of Expansion Pass 2. Sources for this pass: all 44 files under `supabase/migrations/`, `supabase/config.toml`, all 7 edge functions read line-by-line (`parse-order-text`, `parse-purchase-bill`, `chat-bot`, `seed-admin`, `seed-production-data` in full; `autofill-product-details`, `architecture-ai` prompt sections), `src/components/stockist/QuickBillDialog.tsx`, `src/components/shared/ToSDialog.tsx`, `src/components/shared/ProductGalleryUploader.tsx`, `src/hooks/useToSAcceptance.ts`, plus exhaustive greps for toast messages, SQL exceptions, and policy expressions.*
